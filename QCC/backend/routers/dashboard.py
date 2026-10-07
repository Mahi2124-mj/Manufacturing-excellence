"""Dashboard aggregates and meeting minutes (read)."""
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user, accessible_team_ids, accessible_project_ids
from models import Team, Project, ActionItem, Approval, User, Meeting
from schemas import DashboardStats, MeetingOut

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/dashboard/stats", response_model=DashboardStats)
def dashboard_stats(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Real aggregates — scoped to the user's team(s); admin sees the whole org."""
    tids = accessible_team_ids(db, user)
    pids = accessible_project_ids(db, user)

    team_q = db.query(Team)
    proj_q = db.query(Project)
    action_q = db.query(ActionItem)
    appr_q = db.query(Approval)
    if tids is not None:
        team_q = team_q.filter(Team.id.in_(tids))
    if pids is not None:
        proj_q = proj_q.filter(Project.id.in_(pids))
        action_q = action_q.filter(ActionItem.project_id.in_(pids))
        appr_q = appr_q.filter(Approval.project_id.in_(pids))

    total_savings = float(sum((s[0] or 0) for s in proj_q.with_entities(Project.savings).all()))

    overdue = 0
    for a in action_q.all():
        if a.status == "overdue":
            overdue += 1
        elif a.status in ("open", "in_progress") and a.due_date:
            try:
                if date.fromisoformat(a.due_date[:10]) < date.today():
                    overdue += 1
            except ValueError:
                pass

    return DashboardStats(
        total_teams=team_q.count(),
        active_projects=proj_q.filter(Project.status == "in_progress").count(),
        overdue_actions=overdue,
        pending_approvals=appr_q.filter(Approval.status == "pending").count(),
        completed_projects=proj_q.filter(Project.status == "completed").count(),
        total_savings=total_savings,
    )


@router.get("/meetings", response_model=list[MeetingOut])
def list_meetings(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    pids = accessible_project_ids(db, user)
    q = db.query(Meeting)
    if pids is not None:
        q = q.filter(Meeting.project_id.in_(pids))
    return [MeetingOut.model_validate(m) for m in q.order_by(Meeting.date.desc()).all()]
