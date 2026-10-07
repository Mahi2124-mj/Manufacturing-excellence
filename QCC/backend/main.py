"""QCC Monitor backend — FastAPI application entrypoint.

Run from the backend/ directory:
    python -m uvicorn main:app --reload --port 8000

Interactive docs: http://localhost:8000/docs
"""
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import Base, engine
import models  # noqa: F401  (import registers all ORM models on Base.metadata)
from routers import auth, users, teams, projects, actions, approvals, meta, dashboard

# Create any missing tables on startup (idempotent). For schema *changes* use a real
# migration tool; for this project create_all is sufficient.
Base.metadata.create_all(bind=engine)

app = FastAPI(title="QCC Monitor API", version="1.0.0")

_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth, users, teams, projects, actions, approvals, meta, dashboard):
    app.include_router(r.router)


@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok", "service": "qcc-backend"}
