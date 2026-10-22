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
  The `email` field also accepts a username = the part of the email before `@`
  (`amit@qcc.com` → `amit`, `admin@qcc.com` → `admin`), or the user's full name when no
  other user has the same name. Usernames are kept unique on user creation.
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
| POST | `/api/users` | **admin only** — create user (admin sets the first password) |
| PATCH | `/api/users/{id}` | **admin only** — change role / activate / deactivate |
| POST | `/api/users/{id}/password` | **admin only** — reset another user's password (signs them out) |
| GET  | `/api/teams` | Leaders see only their own teams |
| GET  | `/api/teams/{id}` | Team detail (with members) |
| POST | `/api/teams` | admin/leader/facilitator |
| PATCH | `/api/teams/{id}` | admin applies directly; others create a change request |
| GET  | `/api/teams/change-requests` | Admin: all requests; others: their own (`?status=pending` to filter) |
| POST | `/api/teams/change-requests/{id}/decision` | **admin only** — approve (applies the edit) / reject (reason required) |
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
| GET  | `/api/docs?keys=a,b` | Shared documents (step sheets, meeting records, evaluation, assessment, admin config) the caller may read |
| GET  | `/api/docs/kind/{kind}` | Every readable document of one kind (e.g. all `step-benefits` for the Dashboard) |
| PUT  | `/api/docs` | Save one document; `base_version` must match or the answer is 409 (changed on another PC) |
| POST | `/api/files` | Upload a step document (multipart `scope` = `step-docs/<project>/<step>`, `file`; max 25 MB) |
| GET/DELETE | `/api/files/{id}` | Download / remove a step document (project access / project editors) |

## Shared documents
Content that used to live in each browser's localStorage is stored in `shared_docs`, so
every PC sees the same data. A key is `<kind>/<ref>`:
- project kinds (`step-theme/PRJ-001`, … `step-closure/PRJ-001`, `step-docs/PRJ-001/root-cause`):
  read with project access, written by that team's editors;
- team kinds (`team-assessment/QCC-MFG-001`): read with team access, written by team editors;
- global kinds (`config-hierarchy`, `eval-scores`, `meetings-exec`, …): read by anyone signed
  in, written by the roles listed in `routers/docs.py` (`GLOBAL_KINDS`).
Advisor approvals inside countermeasure / standardization / closure sheets, and meeting
records of other teams, are checked field by field. Uploaded files live in `UPLOAD_DIR`
(default `backend/uploads`) — back that folder up together with the database.

## Copying data to another server
`python data_sync.py export` writes this database to `../db_backups/qcc_data_<date>/`;
`python data_sync.py import <folder> [--apply] [--update]` adds it to another server's
database without deleting anything there (dry run unless `--apply`). The export holds
password hashes — move it privately, never commit it. See `../LOCAL_DATA_SNAPSHOT.md`.

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
