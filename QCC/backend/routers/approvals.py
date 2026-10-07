"""Approval pipeline: list requests and make approve/reject/rework decisions.

Wires up the previously-inert Approve/Rework/Reject buttons. Only admins, dept_heads
and facilitators may decide. A decision also syncs the matching workflow step's status.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user, require_roles, accessible_project_ids
from models import Approval, WorkflowStep, User, AuditLog
from schemas import ApprovalOut, ApprovalDecision

router = APIRouter(prefix="/api/approvals", tags=["approvals"])


@router.get("", response_model=list[ApprovalOut])
def list_approvals(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(Approval).order_by(Approval.id)
    pids = accessible_project_ids(db, user)
    if pids is not None:
        q = q.filter(Approval.project_id.in_(pids))
    return [ApprovalOut.model_validate(a) for a in q.all()]


@router.post("/{approval_id}/decision", response_model=ApprovalOut,
             dependencies=[Depends(require_roles("admin", "dept_head", "facilitator"))])
def decide(approval_id: str, body: ApprovalDecision, db: Session = Depends(get_db),
           reviewer: User = Depends(get_current_user)):
    if body.status not in ("approved", "rejected", "rework"):
        raise HTTPException(status_code=422, detail="status must be approved|rejected|rework")
    approval = db.get(Approval, approval_id)
    if not approval:
        raise HTTPException(status_code=404, detail="Approval request not found")

    now = datetime.now(timezone.utc).isoformat()
    approval.status = body.status
    approval.reviewed_by = reviewer.id
    approval.reviewed_at = now
    approval.comments = body.comments

    # Keep the underlying workflow step in sync with the decision.
    step = (
        db.query(WorkflowStep)
        .filter(WorkflowStep.project_id == approval.project_id,
                WorkflowStep.step_number == approval.step_number)
        .first()
    )
    if step:
        step.status = "approved" if body.status == "approved" else (
            "rework" if body.status == "rework" else "submitted"
        )
        step.updated_at = now
        if body.status == "approved":
            step.completed_at = now

    db.add(AuditLog(
        entity_type="approval", entity_id=approval_id, project_id=approval.project_id,
        step_number=approval.step_number, action=body.status,
        notes=body.comments, performed_by=reviewer.id,
        performed_by_name=reviewer.name, performed_by_role=reviewer.role,
    ))
    db.commit()
    db.refresh(approval)
    return ApprovalOut.model_validate(approval)
