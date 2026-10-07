"""User directory (read + admin-managed create)."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user, require_roles
from models import User
from schemas import UserOut
from security import hash_password

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return [UserOut.model_validate(u) for u in db.query(User).order_by(User.id).all()]


@router.post("", response_model=UserOut, dependencies=[Depends(require_roles("admin"))])
def create_user(body: dict, db: Session = Depends(get_db)):
    """Admin-only: create a user. Body: {name, email, role, department, password?}."""
    email = (body.get("email") or "").strip()
    if not email:
        raise HTTPException(status_code=422, detail="email is required")
    if db.query(User).filter(func.lower(User.email) == email.lower()).first():
        raise HTTPException(status_code=409, detail="A user with this email already exists")

    # Generate the next sequential u-id.
    count = db.query(User).count()
    new_id = f"u{count + 1}"
    while db.get(User, new_id):
        count += 1
        new_id = f"u{count + 1}"

    user = User(
        id=new_id,
        name=body.get("name", "New User"),
        email=email,
        role=body.get("role", "member"),
        department=body.get("department", "IT"),
        is_active=True,
        joined_at=body.get("joinedAt"),
        password_hash=hash_password(body.get("password") or "demo123"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)
