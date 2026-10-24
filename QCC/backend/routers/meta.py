"""Reference data: departments (+sub-departments) and QCC cycles."""
import time

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user, require_roles
from models import Department, SubDepartment, Team, Project, Cycle, User, AuditLog
from routers.teams import remove_team, remove_stored_files
from schemas import DepartmentOut, SubDepartmentOut, CycleOut, CycleCreate, CycleUpdate, CycleDelete

router = APIRouter(prefix="/api", tags=["meta"])

MAX_CYCLES_PER_YEAR = 2   # a QCC year runs two cycles, one after the other


@router.get("/departments", response_model=list[DepartmentOut])
def list_departments(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    out = []
    for d in db.query(Department).order_by(Department.id).all():
        subs = db.query(SubDepartment).filter(SubDepartment.parent_id == d.name).all()
        team_count = db.query(Team).filter(Team.department == d.name).count()
        active_projects = (
            db.query(Project).filter(Project.department == d.name,
                                     Project.status == "in_progress").count()
        )
        out.append(DepartmentOut(
            id=d.id, name=d.name, head_id=d.head_id,
            team_count=team_count, active_projects=active_projects,
            sub_departments=[SubDepartmentOut.model_validate(s) for s in subs],
        ))
    return out


@router.get("/sub-departments", response_model=list[SubDepartmentOut])
def list_sub_departments(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    rows = db.query(SubDepartment).order_by(SubDepartment.id).all()
    return [SubDepartmentOut.model_validate(s) for s in rows]


@router.get("/cycles", response_model=list[CycleOut])
def list_cycles(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return [CycleOut.model_validate(c) for c in db.query(Cycle).order_by(Cycle.year.desc()).all()]


@router.post("/cycles", response_model=CycleOut, status_code=status.HTTP_201_CREATED)
def create_cycle(body: CycleCreate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Create a QCC cycle → saved permanently in the DB so it survives reloads/devices."""
    year = body.year
    if year is None and body.start_date and body.start_date[:4].isdigit():
        year = int(body.start_date[:4])
    if not body.name.strip() or year is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="Cycle name and a valid start date are required")
    # A QCC year runs two cycles (one per half), so at most two cycles per year.
    if db.query(Cycle).filter(Cycle.year == year).count() >= MAX_CYCLES_PER_YEAR:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"{year} already has {MAX_CYCLES_PER_YEAR} QCC cycles")
    cid = body.id or f"cyc-{int(time.time() * 1000)}"
    cycle = Cycle(
        id=cid, name=body.name.strip(), year=year,
        start_date=body.start_date, end_date=body.end_date or "",
        max_teams=body.max_teams or 20, is_active=True,
    )
    db.add(cycle)
    db.commit()
    db.refresh(cycle)
    return CycleOut.model_validate(cycle)


@router.patch("/cycles/{cycle_id}", response_model=CycleOut)
def update_cycle(cycle_id: str, body: CycleUpdate, db: Session = Depends(get_db),
                 _: User = Depends(get_current_user)):
    cycle = db.query(Cycle).filter(Cycle.id == cycle_id).first()
    if not cycle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cycle not found")
    if body.is_active is not None:
        cycle.is_active = body.is_active
    if body.name is not None:
        cycle.name = body.name.strip()
    db.commit()
    db.refresh(cycle)
    return CycleOut.model_validate(cycle)


@router.delete("/cycles/{cycle_id}")
def delete_cycle(cycle_id: str, db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    """Admin only: remove just the cycle (its teams stay, outside every cycle)."""
    cycle = db.query(Cycle).filter(Cycle.id == cycle_id).first()
    if cycle:
        db.delete(cycle)
        db.commit()
    return {"ok": True}


@router.post("/cycles/{cycle_id}/delete")
def delete_cycle_with_data(cycle_id: str, body: CycleDelete, db: Session = Depends(get_db),
                           user: User = Depends(require_roles("admin"))):
    """Admin only: delete a cycle together with its data — each of its teams (the ones the
    app shows under this cycle, sent as teamIds) with their projects, workflow steps,
    actions, approvals, meetings, saved step sheets and uploaded files. All or nothing."""
    cycle = db.get(Cycle, cycle_id)
    if not cycle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cycle not found")
    deleted, stored = [], []
    for team_id in dict.fromkeys(body.team_ids):
        team = db.get(Team, team_id)
        if team:
            stored += remove_team(db, team, user)
            deleted.append(team_id)
    db.add(AuditLog(
        entity_type="cycle", entity_id=cycle_id, action="deleted",
        notes=f"Cycle '{cycle.name}' ({cycle.start_date} – {cycle.end_date}) deleted with "
              f"{len(deleted)} team(s): {', '.join(deleted) or 'none'}",
        performed_by=user.id, performed_by_name=user.name, performed_by_role=user.role,
    ))
    db.delete(cycle)
    db.commit()
    remove_stored_files(stored)
    return {"ok": True, "deletedTeams": deleted}
