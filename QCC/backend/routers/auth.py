"""Authentication: real login against the database with hashed passwords + JWT,
plus the "forgot password" flow (emailed one-time code -> reset token -> new password).
"""
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

import mailer
from database import get_db
from deps import get_current_user
from models import User, PasswordResetCode
from schemas import (
    LoginRequest, TokenResponse, UserOut, ChangePasswordRequest,
    ForgotPasswordRequest, VerifyResetCodeRequest, ResetPasswordRequest,
)
from security import (
    create_access_token, verify_password, hash_password, password_stamp,
    generate_reset_code, create_reset_token, decode_access_token,
    RESET_CODE_TTL_MINUTES, RESET_CODE_MAX_ATTEMPTS,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """Verify email + password and return a signed access token with the user profile."""
    user = db.query(User).filter(func.lower(User.email) == body.email.lower()).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is inactive")

    token = create_access_token(subject=user.id, role=user.role, name=user.name,
                                password_hash=user.password_hash)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(current: User = Depends(get_current_user)):
    """Return the profile of the currently authenticated user."""
    return UserOut.model_validate(current)


@router.post("/change-password")
def change_password(
    body: ChangePasswordRequest,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update the signed-in user's password so the next login uses the new one."""
    if not verify_password(body.current_password, current.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="New password must be at least 6 characters")
    current.password_hash = hash_password(body.new_password)
    db.commit()
    db.refresh(current)

    # Every token issued under the old password is now invalid (deps.get_current_user
    # checks the password stamp), which signs the account out on every other device on
    # its next request. Hand this device a fresh token so the person who just changed
    # their own password is not thrown back to the login screen.
    token = create_access_token(subject=current.id, role=current.role, name=current.name,
                                password_hash=current.password_hash)
    return {"ok": True, "accessToken": token}


# ─── Forgot password ─────────────────────────────────────────────────────────
# Three unauthenticated steps: request a code by email, verify the code, set the new
# password. Steps 1 and 2 deliberately reveal nothing about which addresses exist.

RESEND_COOLDOWN_SECONDS = 60

_EMAIL_SUBJECT = "QCC Monitor — your password reset code"
_EMAIL_BODY = """Hello {name},

Someone asked to reset the password for your QCC Monitor account.

    Your reset code is:  {code}

Enter it on the "Forgot password" screen within {minutes} minutes. The code can be
used once. If you did not ask for this, ignore this email — your password has not
changed and your account is safe.

— QCC Monitor
"""


def _now():
    return datetime.now(timezone.utc)


def _as_aware(dt):
    """Postgres may hand back a naive datetime; compare everything in UTC."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Email a one-time reset code to the address, if an active account uses it.

    Always answers the same way. Telling an anonymous caller whether an address is
    registered would leak the company's user list, so "unknown address" and "code
    sent" are indistinguishable from outside.
    """
    generic = {
        "ok": True,
        "message": "If that email is registered, a reset code is on its way.",
        "emailConfigured": mailer.is_configured(),
    }

    email = (body.email or "").strip().lower()
    if not email:
        return generic

    user = db.query(User).filter(func.lower(User.email) == email).first()
    if not user or not user.is_active:
        return generic

    # Throttle resends so the mailbox cannot be flooded from the login page.
    latest = (
        db.query(PasswordResetCode)
        .filter(PasswordResetCode.user_id == user.id)
        .order_by(PasswordResetCode.created_at.desc())
        .first()
    )
    if latest and latest.created_at:
        age = (_now() - _as_aware(latest.created_at)).total_seconds()
        if age < RESEND_COOLDOWN_SECONDS and not latest.used:
            return generic

    # Any earlier code for this user stops working the moment a new one is issued.
    db.query(PasswordResetCode).filter(
        PasswordResetCode.user_id == user.id, PasswordResetCode.used.is_(False)
    ).update({"used": True})

    code = generate_reset_code()
    db.add(PasswordResetCode(
        id=f"prc-{uuid.uuid4().hex[:12]}",
        user_id=user.id,
        email=user.email,
        code_hash=hash_password(code),
        expires_at=_now() + timedelta(minutes=RESET_CODE_TTL_MINUTES),
    ))
    db.commit()

    mailer.send_email(
        to=user.email,
        subject=_EMAIL_SUBJECT,
        body=_EMAIL_BODY.format(name=user.name, code=code, minutes=RESET_CODE_TTL_MINUTES),
    )
    return generic


@router.post("/verify-reset-code")
def verify_reset_code(body: VerifyResetCodeRequest, db: Session = Depends(get_db)):
    """Check the emailed code and hand back a short-lived token for the final step."""
    email = (body.email or "").strip().lower()
    code = (body.code or "").strip()
    invalid = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="That code is not valid or has expired. Request a new one.",
    )

    user = db.query(User).filter(func.lower(User.email) == email).first()
    if not user or not user.is_active:
        raise invalid

    entry = (
        db.query(PasswordResetCode)
        .filter(PasswordResetCode.user_id == user.id, PasswordResetCode.used.is_(False))
        .order_by(PasswordResetCode.created_at.desc())
        .first()
    )
    if not entry or _as_aware(entry.expires_at) < _now():
        raise invalid

    if entry.attempts >= RESET_CODE_MAX_ATTEMPTS:
        entry.used = True   # burn a code that is being guessed at
        db.commit()
        raise invalid

    if not verify_password(code, entry.code_hash):
        entry.attempts += 1
        db.commit()
        remaining = max(0, RESET_CODE_MAX_ATTEMPTS - entry.attempts)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Incorrect code. {remaining} attempt(s) left before it expires."
            if remaining else "Too many incorrect attempts. Request a new code.",
        )

    entry.used = True
    db.commit()
    return {"ok": True, "resetToken": create_reset_token(user.id, user.password_hash)}


@router.post("/reset-password", response_model=TokenResponse)
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Set a new password using the token from verify-reset-code, then sign the user in."""
    if len(body.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="New password must be at least 6 characters",
        )

    expired = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="This reset session has expired. Start again from 'Forgot password'.",
    )
    try:
        payload = decode_access_token(body.reset_token)
    except jwt.PyJWTError:
        raise expired
    if payload.get("purpose") != "pwreset":
        raise expired

    user = db.get(User, payload.get("sub"))
    if not user or not user.is_active:
        raise expired
    # Bound to the password in force when the token was minted: a reset token cannot be
    # replayed after the password has already changed.
    if payload.get("pv") != password_stamp(user.password_hash):
        raise expired

    user.password_hash = hash_password(body.new_password)
    db.commit()
    db.refresh(user)

    # Resetting revokes every existing session for this account, then signs in the
    # browser that completed the reset.
    token = create_access_token(subject=user.id, role=user.role, name=user.name,
                                password_hash=user.password_hash)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))
