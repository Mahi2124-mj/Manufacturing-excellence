"""Outgoing email for the QCC Monitor (password-reset codes).

Configured entirely from backend/.env:

    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=587
    SMTP_USER=you@example.com
    SMTP_PASSWORD=<app password>
    SMTP_FROM=QCC Monitor <you@example.com>     # optional, defaults to SMTP_USER
    SMTP_TLS=true                                # STARTTLS (587). Use false + port 465 for SSL.

If SMTP_HOST/SMTP_USER are missing the mailer runs in **console mode**: nothing is
sent, the message is printed to the backend window instead. That keeps the reset flow
testable before real mail credentials exist — it is not meant for production use.
"""
import os
import smtplib
import ssl
from email.message import EmailMessage

SMTP_HOST = os.environ.get("SMTP_HOST", "").strip()
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "").strip()
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_FROM = os.environ.get("SMTP_FROM", "").strip() or SMTP_USER
SMTP_TLS = os.environ.get("SMTP_TLS", "true").strip().lower() not in ("false", "0", "no")


def is_configured() -> bool:
    """True when real SMTP credentials are present, i.e. mail actually goes out."""
    return bool(SMTP_HOST and SMTP_USER)


def send_email(to: str, subject: str, body: str) -> bool:
    """Send a plain-text email. Returns True if it was handed to the SMTP server.

    Never raises: a mail failure must not turn into a 500 on the reset endpoint (and
    must not tell the caller whether the address exists). Problems are logged instead.
    """
    if not is_configured():
        print("\n" + "=" * 66)
        print("  [mailer] SMTP not configured — email NOT sent. Contents below.")
        print(f"  To      : {to}")
        print(f"  Subject : {subject}")
        print("  " + "-" * 62)
        for line in body.splitlines():
            print(f"  {line}")
        print("=" * 66 + "\n", flush=True)
        return False

    msg = EmailMessage()
    msg["From"] = SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)

    try:
        if SMTP_TLS:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as s:
                s.starttls(context=ssl.create_default_context())
                s.login(SMTP_USER, SMTP_PASSWORD)
                s.send_message(msg)
        else:
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=ssl.create_default_context(), timeout=20) as s:
                s.login(SMTP_USER, SMTP_PASSWORD)
                s.send_message(msg)
        print(f"[mailer] Reset email sent to {to}", flush=True)
        return True
    except Exception as exc:  # noqa: BLE001 - log and carry on, never leak to the client
        print(f"[mailer] FAILED to send to {to}: {type(exc).__name__}: {exc}", flush=True)
        return False
