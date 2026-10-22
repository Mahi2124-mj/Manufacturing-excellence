"""User directory: list for any signed-in user; create / role / activation / password
reset for admins only."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user, require_roles
from models import User
from schemas import UserOut, UserCreate, UserUpdate, AdminPasswordReset
from security import hash_password

router = APIRouter(prefix="/api/users", tags=["users"])

VALID_ROLES = {"admin", "leader", "facilitator", "coordinator", "dept_head", "member"}
MIN_PASSWORD_LENGTH = 6


def _check_password(password: str) -> None:
    if len(password or "") < MIN_PASSWORD_LENGTH:
        raise HTTPException(status_code=422, detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters")


def _check_role(role: str) -> None:
    if role not in VALID_ROLES:
        raise HTTPException(status_code=422, detail=f"Unknown role '{role}'")


@router.get("", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return [UserOut.model_validate(u) for u in db.query(User).order_by(User.id).all()]


@router.post("", response_model=UserOut, dependencies=[Depends(require_roles("admin"))])
def create_user(body: UserCreate, db: Session = Depends(get_db)):
    """Admin-only: create a login. The admin sets the first password (no shared default)."""
    name, email, department = body.name.strip(), body.email.strip(), body.department.strip()
    if not name or not email or not department:
        raise HTTPException(status_code=422, detail="Name, email and department are required")
    if "@" not in email:
        raise HTTPException(status_code=422, detail="Enter a valid email address")
    _check_role(body.role)
    _check_password(body.password)
    if db.query(User).filter(func.lower(User.email) == email.lower()).first():
        raise HTTPException(status_code=409, detail="A user with this email already exists")
    # The login username is the part of the email before "@", so it must stay unique.
    username = email.lower().split("@")[0]
    clash = next((u for u in db.query(User).all() if u.email.lower().split("@")[0] == username), None)
    if clash:
        raise HTTPException(status_code=409, detail=f"Username '{username}' is already used by {clash.email} — use a different email")

    # Generate the next sequential u-id.
    count = db.query(User).count()
    new_id = f"u{count + 1}"
    while db.get(User, new_id):
        count += 1
        new_id = f"u{count + 1}"

    user = User(
        id=new_id,
        name=name,
        email=email,
        role=body.role,
        department=department,
        is_active=True,
        joined_at=body.joined_at or date.today().isoformat(),
        password_hash=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: str, body: UserUpdate, db: Session = Depends(get_db),
                admin: User = Depends(require_roles("admin"))):
    """Admin-only: change a user's role or activate / deactivate them. A deactivated
    user cannot sign in and their open sessions stop working (deps.get_current_user)."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if body.role is not None:
        _check_role(body.role)
    # Never let an admin lock themselves out (this also keeps at least one admin).
    if user.id == admin.id and ((body.role is not None and body.role != "admin") or body.is_active is False):
        raise HTTPException(status_code=400, detail="You cannot remove your own admin access")

    if body.role is not None:
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.post("/{user_id}/password")
def reset_user_password(user_id: str, body: AdminPasswordReset, db: Session = Depends(get_db),
                        admin: User = Depends(require_roles("admin"))):
    """Admin-only: set a new password for another user. Re-hashing changes the password
    stamp, so every session that user had open is signed out."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Change your own password from Settings → Security")
    _check_password(body.new_password)
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"ok": True}
