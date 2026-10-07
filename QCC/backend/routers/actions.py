"""Action-item tracker: full CRUD (wires up the previously-inert 'New Action' button)."""
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user, accessible_project_ids, can_access_project, can_edit_project
from models import ActionItem, Project, User
from schemas import ActionOut, ActionCreate, ActionUpdate

router = APIRouter(prefix="/api/actions", tags=["actions"])


def _auto_overdue(a: ActionItem) -> ActionItem:
    """Flag past-due, still-open items as overdue on the way out."""
    if a.status in ("open", "in_progress") and a.due_date:
        try:
            if date.fromisoformat(a.due_date[:10]) < date.today():
                a.status = "overdue"
        except ValueError:
            pass
    return a


@router.get("", response_model=list[ActionOut])
def list_actions(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(ActionItem).order_by(ActionItem.id)
    pids = accessible_project_ids(db, user)
    if pids is not None:
        q = q.filter(ActionItem.project_id.in_(pids))
    return [ActionOut.model_validate(_auto_overdue(a)) for a in q.all()]


@router.post("", response_model=ActionOut)
def create_action(body: ActionCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not db.get(Project, body.project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    if not can_edit_project(db, user, body.project_id):
        raise HTTPException(status_code=403, detail="You can only add actions to your own team's projects")
    new_id = f"ACT-{db.query(ActionItem).count() + 1:03d}"
    while db.get(ActionItem, new_id):
        new_id = f"ACT-{int(new_id.split('-')[1]) + 1:03d}"
    action = ActionItem(
        id=new_id, project_id=body.project_id, title=body.title,
        assignee_id=body.assignee_id, due_date=body.due_date,
        status=body.status, priority=body.priority,
        created_at=datetime.now(timezone.utc).date().isoformat(),
    )
    db.add(action)
    db.commit()
    db.refresh(action)
    return ActionOut.model_validate(action)


@router.patch("/{action_id}", response_model=ActionOut)
def update_action(action_id: str, body: ActionUpdate, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    action = db.get(ActionItem, action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    if not can_edit_project(db, user, action.project_id):
        raise HTTPException(status_code=403, detail="You can only edit your own team's actions")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(action, field, value)
    db.commit()
    db.refresh(action)
    return ActionOut.model_validate(action)


@router.delete("/{action_id}")
def delete_action(action_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    action = db.get(ActionItem, action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    if not can_edit_project(db, user, action.project_id):
        raise HTTPException(status_code=403, detail="You can only delete your own team's actions")
    db.delete(action)
    db.commit()
    return {"ok": True}
