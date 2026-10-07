"""Projects and their 7-step QCC workflow."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user, accessible_team_ids, can_access_project, can_edit_project
from models import Project, WorkflowStep, User, AuditLog, Approval
from schemas import ProjectOut, WorkflowStepOut, WorkflowStepUpdate

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=list[ProjectOut])
def list_projects(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Admin sees all projects; everyone else sees only their team(s)' projects."""
    q = db.query(Project).order_by(Project.id)
    tids = accessible_team_ids(db, user)
    if tids is not None:
        q = q.filter(Project.team_id.in_(tids))
    return [ProjectOut.model_validate(p) for p in q.all()]


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not can_access_project(db, user, project_id):
        raise HTTPException(status_code=403, detail="You do not have access to this project")
    return ProjectOut.model_validate(project)


@router.get("/{project_id}/steps", response_model=list[WorkflowStepOut])
def list_steps(project_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not can_access_project(db, user, project_id):
        raise HTTPException(status_code=403, detail="You do not have access to this project")
    return [WorkflowStepOut.model_validate(s) for s in project.steps]


@router.patch("/{project_id}/steps/{step_number}", response_model=WorkflowStepOut)
def update_step(
    project_id: str,
    step_number: int,
    body: WorkflowStepUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Save/submit a workflow step. Records an audit-log entry for the change.

    Steps added later from Admin → Activity Steps have no seeded backend row, so if the
    step doesn't exist yet we CREATE it on first save/submit — that makes every step
    (including admin-added ones) a real, submittable + approvable workflow step.
    """
    if not db.get(Project, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    if not can_edit_project(db, user, project_id):
        raise HTTPException(status_code=403, detail="You can only edit your own team's workflow")

    step = (
        db.query(WorkflowStep)
        .filter(WorkflowStep.project_id == project_id, WorkflowStep.step_number == step_number)
        .first()
    )
    if not step:
        step = WorkflowStep(
            project_id=project_id, step_number=step_number,
            title=(body.title or f"Step {step_number}"), description="",
            status="draft", notes="", attachments=[],
        )
        db.add(step)
        db.flush()   # assign its id for the audit log

    changes = body.model_dump(exclude_unset=True)
    changes.pop("title", None)   # title is only for creation — never overwrite an existing step's title
    now = datetime.now(timezone.utc).isoformat()
    prev_status = step.status
    for field, value in changes.items():
        setattr(step, field, value)
    step.updated_at = now
    if changes.get("status") == "approved":
        step.completed_at = now

    # Submitting a step raises a pending approval so it shows up on the Approvals
    # page for a reviewer (reuse an existing pending one instead of duplicating).
    if changes.get("status") == "submitted":
        existing = (
            db.query(Approval)
            .filter(Approval.project_id == project_id,
                    Approval.step_number == step_number,
                    Approval.status == "pending")
            .first()
        )
        if not existing:
            count = db.query(Approval).count() + 1
            appr_id = f"APR-{count:03d}"
            while db.get(Approval, appr_id):
                count += 1
                appr_id = f"APR-{count:03d}"
            db.add(Approval(
                id=appr_id, project_id=project_id, step_number=step_number,
                requested_by=user.id, requested_at=now, status="pending",
            ))

    db.add(AuditLog(
        entity_type="step", entity_id=str(step.id), project_id=project_id, step_number=step_number,
        action="status_changed" if "status" in changes else "field_updated",
        field_changed="status" if "status" in changes else "notes",
        old_value=prev_status, new_value=changes.get("status", ""),
        performed_by=user.id, performed_by_name=user.name, performed_by_role=user.role,
    ))
    db.commit()
    db.refresh(step)
    return WorkflowStepOut.model_validate(step)
