"""Password hashing (stdlib pbkdf2) and JWT access-token helpers.

No third-party crypto dependency: passwords use hashlib.pbkdf2_hmac and tokens
use PyJWT (already installed). Hash format stored in the DB:

    pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>
"""
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

import jwt  # PyJWT

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.environ.get("JWT_EXPIRE_MINUTES", "1440"))

_PBKDF2_ITERATIONS = 240_000


def hash_password(password: str) -> str:
    """Return a salted pbkdf2-sha256 hash string safe to store in the database."""
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${_PBKDF2_ITERATIONS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Constant-time verify a plaintext password against a stored pbkdf2 hash."""
    try:
        algorithm, iterations, salt_hex, hash_hex = stored.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations)
        )
        return hmac.compare_digest(dk.hex(), hash_hex)
    except (ValueError, AttributeError):
        return False


def password_stamp(password_hash: str) -> str:
    """Short fingerprint of a stored password hash, embedded in tokens as "pv".

    Changing a password re-salts the hash, so the stamp changes too and every token
    minted before the change stops validating (see deps.get_current_user). That is
    what makes a password change sign the account out everywhere, immediately.
    The stamp is a one-way digest: it never exposes the hash itself.
    """
    return hashlib.sha256((password_hash or "").encode("utf-8")).hexdigest()[:16]


def create_access_token(subject: str, role: str, name: str, password_hash: str) -> str:
    """Mint a signed JWT carrying the user id (sub), role, display name and the
    password stamp that binds the token to the password it was issued under."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "role": role,
        "name": name,
        "pv": password_stamp(password_hash),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=JWT_EXPIRE_MINUTES)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Decode/verify a JWT. Raises jwt.PyJWTError (incl. expiry) on any problem."""
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])


# ─── Password-reset codes ────────────────────────────────────────────────────
RESET_CODE_LENGTH = 6
RESET_CODE_TTL_MINUTES = int(os.environ.get("RESET_CODE_TTL_MINUTES", "10"))
RESET_CODE_MAX_ATTEMPTS = 5
RESET_TOKEN_TTL_MINUTES = 15


def generate_reset_code() -> str:
    """A cryptographically random numeric code, e.g. "048213"."""
    return "".join(secrets.choice("0123456789") for _ in range(RESET_CODE_LENGTH))


def create_reset_token(user_id: str, password_hash: str) -> str:
    """Short-lived token proving the emailed code was entered correctly.

    It is scoped with purpose="pwreset" so it can never be used as a normal access
    token, and it is bound to the current password hash so it dies the moment the
    password changes (including on the reset it was issued for — single use).
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "purpose": "pwreset",
        "pv": password_stamp(password_hash),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=RESET_TOKEN_TTL_MINUTES)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
