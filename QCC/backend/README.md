# QCC Monitor — Backend API

FastAPI + SQLAlchemy + **PostgreSQL** backend for the QCC Monitor portal. Replaces the
frontend's mock data and fake login with a real database, hashed passwords and JWT auth.

## Stack
- **FastAPI** (REST API, auto docs at `/docs`)
- **SQLAlchemy 2.0** ORM
- **PostgreSQL** (database `qcc` on `localhost:5432`)
- **PyJWT** access tokens; passwords hashed with stdlib `hashlib.pbkdf2_hmac` (no bcrypt needed)

## Setup

```bash
cd backend
python -m pip install -r requirements.txt        # first time only
cp .env.example .env                              # then edit DATABASE_URL / JWT_SECRET
python seed.py --reset                            # create tables + load seed data
python -m uvicorn main:app --reload --port 8000   # run the API
```

- API base URL: `http://localhost:8000`
- Interactive docs: `http://localhost:8000/docs`
- The database `qcc` must exist. Create it once with:
  `CREATE DATABASE qcc;` (as the `postgres` user).

## Auth
- `POST /api/auth/login` — body `{ "email", "password" }` → `{ accessToken, tokenType, user }`.
- Send the token on every other request: `Authorization: Bearer <accessToken>`.
- All seeded users share the password **`demo123`** (e.g. `admin@qcc.com`, `priya@qcc.com`).

## Endpoints (Phase 1)

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/login` | Real login (verifies pbkdf2 hash) |
| GET  | `/api/auth/me` | Current user from token |
| POST | `/api/auth/change-password` | Own password; revokes other sessions, returns a fresh token |
| POST | `/api/auth/forgot-password` | Emails a 6-digit code (same reply whether or not the address exists) |
| POST | `/api/auth/verify-reset-code` | Code → short-lived reset token |
| POST | `/api/auth/reset-password` | Reset token + new password → signed in |
| GET  | `/api/users` | List users |
| POST | `/api/users` | **admin only** — create user |
| GET  | `/api/teams` | Leaders see only their own teams |
| GET  | `/api/teams/{id}` | Team detail (with members) |
| POST | `/api/teams` | admin/leader/facilitator |
| PATCH | `/api/teams/{id}` | admin applies directly; others create a change request |
| POST | `/api/teams/change-requests/{id}/decision` | **admin/dept_head** approve/reject |
| GET  | `/api/projects` | List projects (with 7 workflow steps) |
| GET  | `/api/projects/{id}` | Project detail |
| GET  | `/api/projects/{id}/steps` | Workflow steps |
| PATCH | `/api/projects/{id}/steps/{n}` | Save/submit a step (audit-logged) |
| GET  | `/api/actions` | Action tracker (auto-flags overdue) |
| POST | `/api/actions` | Create action |
| PATCH/DELETE | `/api/actions/{id}` | Update / delete action |
| GET  | `/api/approvals` | Approval requests |
| POST | `/api/approvals/{id}/decision` | **admin/dept_head/facilitator** approve/reject/rework (syncs the step) |
| GET  | `/api/departments` | Departments + sub-departments (+ live counts) |
| GET  | `/api/sub-departments` | Flat sub-department list |
| GET  | `/api/cycles` | QCC cycles |
| GET  | `/api/dashboard/stats` | Real aggregates (teams/projects/savings/overdue/pending) |
| GET  | `/api/meetings` | Meeting minutes |

## Security notes
- Passwords are salted pbkdf2-sha256 (240k iterations). Never stored in plaintext.
- Tokens carry a `pv` stamp derived from the password hash. Changing or resetting a
  password re-salts that hash, so every token issued earlier is rejected on its next
  request — the account is signed out everywhere at once instead of after 24 hours.
- Reset codes are stored hashed, expire after `RESET_CODE_TTL_MINUTES` (default 10),
  are single-use, and are burnt after 5 wrong attempts. Resends are throttled to once
  per minute, and `forgot-password` never reveals whether an address is registered.
- JWTs are signed with `JWT_SECRET` from `.env` — set a long random value in production.
- Role guards are enforced server-side (`deps.require_roles`), not just in the UI.
- `backend/.env` is git-ignored and must never be committed.

## Data model
SQLAlchemy models in `models.py` mirror `src/types/index.ts`. Primary keys reuse the
frontend's ids (`u1`, `QCC-MFG-001`, `PRJ-001`) so the seeded DB is drop-in compatible
with the existing React app once the frontend is pointed at this API.

## Project layout
```
backend/
  main.py          FastAPI app, CORS, router registration, create_all
  database.py      engine / SessionLocal / Base / get_db
  security.py      pbkdf2 password hashing + JWT helpers
  deps.py          get_current_user + require_roles guard
  models.py        SQLAlchemy ORM models
  schemas.py       Pydantic (camelCase) request/response models
  seed.py          load mock data into PostgreSQL (python seed.py --reset)
  routers/         auth, users, teams, projects, actions, approvals, meta, dashboard
  mailer.py        SMTP sender for reset codes (console mode when SMTP is unset)
  .env(.example)   DATABASE_URL / JWT_SECRET / CORS_ORIGINS / SMTP_*
  requirements.txt
```
