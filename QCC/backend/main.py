"""QCC Monitor backend — FastAPI application entrypoint.

Run from the backend/ directory:
    python -m uvicorn main:app --reload --port 8000

Interactive docs: http://localhost:8000/docs
"""
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import Base, SessionLocal, engine
import models  # noqa: F401  (import registers all ORM models on Base.metadata)
from routers import auth, users, teams, projects, actions, approvals, meta, dashboard, docs

# Create any missing tables on startup (idempotent). For schema *changes* use a real
# migration tool; for this project create_all is sufficient.
Base.metadata.create_all(bind=engine)

# Teams registered before projects were auto-created have none, so they could never
# start the QCC workflow. Backfill them once at startup (idempotent).
with SessionLocal() as _db:
    _created = projects.ensure_team_projects(_db)
    if _created:
        print(f"[startup] created QCC projects for {_created} team(s) that had none", flush=True)

app = FastAPI(title="QCC Monitor API", version="1.0.0")

_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
# Other PCs open the app at this machine's network address (http://192.168.x.x:6001 or
# http://PC-NAME:6001), and that address depends on the network. So besides the fixed
# list, any private-network or machine-name origin on the frontend port is allowed.
# Set CORS_ORIGIN_REGEX in .env to narrow it, or to an empty value to turn it off.
_origin_regex = os.environ.get(
    "CORS_ORIGIN_REGEX",
    r"^http://(localhost|127\.0\.0\.1|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}"
    r"|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2}|100(\.\d{1,3}){3}|[A-Za-z0-9-]+):6001$",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_origin_regex=_origin_regex or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth, users, teams, projects, actions, approvals, meta, dashboard, docs):
    app.include_router(r.router)


@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok", "service": "qcc-backend"}
