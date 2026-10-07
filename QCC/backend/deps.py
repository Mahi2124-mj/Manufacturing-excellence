"""FastAPI dependencies: extract the current user from the Bearer token and
provide role-based access guards.

Usage:
    @router.get("/", dependencies=[Depends(require_roles("admin", "dept_head"))])
    def handler(user: User = Depends(get_current_user)): ...
"""
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from database import get_db
from models import User, Team, TeamMember, Project
from security import decode_access_token, password_stamp

_bearer = HTTPBearer(auto_error=True)


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    """Decode the JWT, load the user, and reject expired/invalid/unknown tokens."""
    try:
        payload = decode_access_token(creds.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user_id = payload.get("sub")
    user = db.get(User, user_id) if user_id else None
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    # Bind the token to the password it was issued under. A password change (or reset)
    # re-salts the hash, so every token minted earlier fails here on its very next
    # request — the account is signed out everywhere at once, without waiting for the
    # 24h expiry. Tokens issued before this check existed carry no "pv" and are rejected.
    if payload.get("pv") != password_stamp(user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session ended because the password was changed. Please sign in again.",
        )
    return user


def require_roles(*allowed_roles: str):
    """Return a dependency that allows only the given roles (403 otherwise)."""
    def _guard(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of roles: {', '.join(allowed_roles)}",
            )
        return user
    return _guard


# ─── Team-scoped access control ──────────────────────────────────────────────
# The user↔team link is by NAME (a team's leader/facilitator/coordinator names and
# its members' names). These helpers derive what a user may see/edit so every
# endpoint can enforce "you can only touch your own team's data".

def accessible_team_ids(db: Session, user: User):
    """Set of team ids the user may access. `None` means unrestricted (admin → all teams)."""
    if user.role == "admin":
        return None
    ids: set[str] = set()
    name = user.name
    for (tid,) in db.query(Team.id).filter(
        (Team.leader_name == name)
        | (Team.facilitator_name == name)
        | (Team.coordinator_name == name)
    ).all():
        ids.add(tid)
    for (tid,) in db.query(TeamMember.team_id).filter(TeamMember.member_name == name).all():
        ids.add(tid)
    if user.role == "dept_head":
        for (tid,) in db.query(Team.id).filter(Team.department == user.department).all():
            ids.add(tid)
    return ids


def accessible_project_ids(db: Session, user: User):
    """Project ids whose team the user may access. `None` means unrestricted."""
    tids = accessible_team_ids(db, user)
    if tids is None:
        return None
    if not tids:
        return set()
    return {pid for (pid,) in db.query(Project.id).filter(Project.team_id.in_(tids)).all()}


def can_access_team(db: Session, user: User, team_id: str) -> bool:
    tids = accessible_team_ids(db, user)
    return tids is None or team_id in tids


def can_access_project(db: Session, user: User, project_id: str) -> bool:
    project = db.get(Project, project_id)
    return bool(project) and can_access_team(db, user, project.team_id)


def can_edit_team_data(db: Session, user: User, team_id: str) -> bool:
    """Who may record MOM / attendance / actions / progress for a team:
    the admin, or that team's leader/facilitator/coordinator (dept_head for their
    department). Plain members are read-only."""
    if user.role == "admin":
        return True
    if user.role == "member":
        return False
    team = db.get(Team, team_id)
    if not team:
        return False
    if user.role in ("leader", "facilitator", "coordinator"):
        return user.name in (team.leader_name, team.facilitator_name, team.coordinator_name)
    if user.role == "dept_head":
        return team.department == user.department
    return False


def can_edit_project(db: Session, user: User, project_id: str) -> bool:
    project = db.get(Project, project_id)
    return bool(project) and can_edit_team_data(db, user, project.team_id)
