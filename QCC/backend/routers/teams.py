"""Teams: list/detail/create/update plus the change-request approval workflow.

Business rule (mirrors TeamRegistration.tsx):
  - admins edit teams directly;
  - non-admins' edits to an existing team become a pending TeamChangeRequest that an
    admin must approve (Admin Panel → Change Requests) before the changes are applied.
"""
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user, require_roles, accessible_team_ids, can_access_team, can_edit_team_data
from models import Team, TeamMember, User, TeamChangeRequest
from routers.projects import create_project_for_team
from schemas import (
    TeamOut, TeamCreate, TeamUpdate, TeamMemberBase, TeamChangeRequestOut, ChangeRequestDecision,
)

router = APIRouter(prefix="/api/teams", tags=["teams"])

_DEPT_PREFIX = {
    "Manufacturing": "MFG", "Quality Assurance": "QA", "Engineering": "ENG",
    "Logistics": "LOG", "R&D": "RND", "Finance": "FIN", "HR": "HR", "IT": "IT",
    "Sales": "SAL", "Maintenance": "MNT",
}


def _replace_members(db: Session, team: Team, members: list[TeamMemberBase]) -> None:
    """Swap a team's member list for the given one (delete-orphan removes the old rows)."""
    team.members.clear()
    db.flush()
    for i, m in enumerate(members, start=1):
        team.members.append(TeamMember(
            member_id=m.member_id or f"{team.id}-TM-{i:03d}",
            team_id=team.id,
            member_name=m.member_name,
            employee_id=m.employee_id,
            department=m.department or team.department,
            is_active=m.is_active,
            deactivation_reason=m.deactivation_reason,
            deactivated_at=m.deactivated_at,
        ))


def _gen_team_id(db: Session, department: str) -> str:
    prefix = _DEPT_PREFIX.get(department, (department[:3] or "GEN").upper())
    n = db.query(Team).filter(Team.department == department).count() + 1
    new_id = f"QCC-{prefix}-{n:03d}"
    while db.get(Team, new_id):
        n += 1
        new_id = f"QCC-{prefix}-{n:03d}"
    return new_id


@router.get("", response_model=list[TeamOut])
def list_teams(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Admin sees all teams; everyone else sees only the team(s) they belong to."""
    q = db.query(Team).order_by(Team.id)
    tids = accessible_team_ids(db, user)
    if tids is not None:
        q = q.filter(Team.id.in_(tids))
    return [TeamOut.model_validate(t) for t in q.all()]


# Declared before "/{team_id}" so the path is not read as a team id.
@router.get("/change-requests", response_model=list[TeamChangeRequestOut])
def list_change_requests(
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Admin sees every team change request; anyone else sees the ones they raised."""
    q = db.query(TeamChangeRequest)
    if user.role != "admin":
        q = q.filter(TeamChangeRequest.requested_by == user.id)
    if status_filter:
        q = q.filter(TeamChangeRequest.status == status_filter)
    rows = q.order_by(TeamChangeRequest.requested_at.desc(), TeamChangeRequest.id.desc()).all()
    return [TeamChangeRequestOut.model_validate(cr) for cr in rows]


@router.get("/{team_id}", response_model=TeamOut)
def get_team(team_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    if not can_access_team(db, user, team_id):
        raise HTTPException(status_code=403, detail="You do not have access to this team")
    return TeamOut.model_validate(team)


@router.post("", response_model=TeamOut)
def create_team(
    body: TeamCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "leader", "facilitator")),
):
    team_id = _gen_team_id(db, body.department)
    team = Team(
        id=team_id,
        name=body.name,
        department=body.department,
        sub_department=body.sub_department,
        leader_name=body.leader_name,
        facilitator_name=body.facilitator_name,
        coordinator_name=body.coordinator_name,
        project_theme=body.project_theme or "",
        project_title=body.project_title or "",
        status="active",
        current_stage=0,
        # The registration date is what places a team in a QCC period. Without it the
        # team has no period and shows up under every one of them.
        created_at=body.created_at or date.today().isoformat(),
    )
    for i, m in enumerate(body.members, start=1):
        team.members.append(TeamMember(
            member_id=m.member_id or f"{team_id}-TM-{i:03d}",
            team_id=team_id,
            member_name=m.member_name,
            employee_id=m.employee_id,
            department=m.department or body.department,
            is_active=m.is_active,
            deactivation_reason=m.deactivation_reason,
            deactivated_at=m.deactivated_at,
        ))
    db.add(team)
    db.flush()
    create_project_for_team(db, team)
    db.commit()
    db.refresh(team)
    return TeamOut.model_validate(team)


@router.patch("/{team_id}")
def update_team(
    team_id: str,
    body: TeamUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Admins apply changes directly; others create a pending change request."""
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    if not can_edit_team_data(db, user, team_id):
        raise HTTPException(status_code=403, detail="You can only modify your own team")

    changes = body.model_dump(exclude_unset=True)
    members = changes.pop("members", None)
    change_reason = (changes.pop("change_reason", None) or "").strip() or None
    if not changes and members is None:
        return {"applied": True, "team": TeamOut.model_validate(team)}

    if user.role == "admin":
        for field, value in changes.items():
            setattr(team, field, value)
        if members is not None:
            _replace_members(db, team, body.members)
        db.commit()
        db.refresh(team)
        return {"applied": True, "team": TeamOut.model_validate(team)}

    # Non-admin -> route through an approval request; nothing changes until an admin approves.
    diff = []
    snapshot = {}
    for field, value in changes.items():
        old = getattr(team, field)
        if (old or "") != (value or ""):
            diff.append({"field": field, "oldValue": str(old or ""), "newValue": str(value or "")})
            snapshot[field] = value
    if members is not None:
        def fmt(rows):
            return ", ".join(f"{n} ({e or 'no code'})" + ("" if a else " [inactive]") for n, e, a in rows) or "—"
        old_rows = [(m.member_name, m.employee_id, m.is_active) for m in team.members]
        new_rows = [(m["member_name"], m.get("employee_id"), m.get("is_active", True)) for m in members]
        if old_rows != new_rows:
            diff.append({"field": "members", "oldValue": fmt(old_rows), "newValue": fmt(new_rows)})
            snapshot["members"] = members
    if not diff:
        return {"applied": True, "team": TeamOut.model_validate(team), "message": "No changes to submit"}

    n = db.query(TeamChangeRequest).count() + 1
    cr_id = f"CR-{n:03d}"
    while db.get(TeamChangeRequest, cr_id):
        n += 1
        cr_id = f"CR-{n:03d}"
    cr = TeamChangeRequest(
        id=cr_id, team_id=team_id, team_name=team.name,
        requested_by=user.id, requested_by_name=user.name,
        requested_at=datetime.now(timezone.utc).isoformat(),
        status="pending", change_reason=change_reason, changes=diff, snapshot=snapshot,
    )
    db.add(cr)
    db.commit()
    return {"applied": False, "changeRequestId": cr_id, "message": "Change sent to Admin for approval"}


@router.post("/change-requests/{cr_id}/decision", response_model=TeamChangeRequestOut)
def decide_change_request(cr_id: str, body: ChangeRequestDecision, db: Session = Depends(get_db),
                          reviewer: User = Depends(require_roles("admin"))):
    """Admin approves (applies the proposed changes) or rejects a pending team change request."""
    cr = db.get(TeamChangeRequest, cr_id)
    if not cr:
        raise HTTPException(status_code=404, detail="Change request not found")
    decision = body.status
    if decision not in ("approved", "rejected"):
        raise HTTPException(status_code=422, detail="status must be 'approved' or 'rejected'")
    if cr.status != "pending":
        raise HTTPException(status_code=409, detail=f"This request was already {cr.status}")
    comments = (body.comments or "").strip() or None
    if decision == "rejected" and not comments:
        raise HTTPException(status_code=422, detail="Give a reason when rejecting a change")

    cr.status = decision
    cr.reviewed_by = reviewer.id
    cr.reviewed_at = datetime.now(timezone.utc).isoformat()
    cr.review_comments = comments
    if decision == "approved":
        team = db.get(Team, cr.team_id)
        if team and cr.snapshot:
            for field, value in cr.snapshot.items():
                if field == "members":
                    _replace_members(db, team, [TeamMemberBase.model_validate(m) for m in value])
                elif hasattr(team, field):
                    setattr(team, field, value)
    db.commit()
    db.refresh(cr)
    return TeamChangeRequestOut.model_validate(cr)
