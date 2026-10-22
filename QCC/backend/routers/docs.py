"""Shared documents and step files.

The web app used to keep a lot of its content only in each browser's localStorage, so
two PCs never saw the same QCC step sheets, meeting minutes, evaluation or admin
config. Those JSON documents now live here.

A key is "<kind>/<ref>". The kind decides who may read and write it:
  project kinds  "step-theme/PRJ-001"          read: project access  write: project editors
  team kinds     "team-assessment/QCC-QA-002"  read: team access     write: team editors
  global kinds   "config-hierarchy"            read: anyone signed in  write: listed roles
A few step sheets also carry an approval that only an advisor may give, and meeting
minutes may only be written for teams the user runs; those are checked field by field.

Every save names the version it was based on. A stale save gets 409, so one person's
work is never silently overwritten by another's.
"""
import json
import os
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from database import UPLOAD_DIR, get_db
from deps import (
    get_current_user, accessible_team_ids, accessible_project_ids,
    can_access_project, can_access_team, can_edit_project, can_edit_team_data,
)
from models import SharedDoc, StoredFile, User
from schemas import SharedDocOut, SharedDocSave, StoredFileOut

router = APIRouter(prefix="/api", tags=["shared-docs"])

# ── Kinds ────────────────────────────────────────────────────────────────────
PROJECT_KINDS = {
    "step-theme", "step-current-target", "step-activity-plan", "step-fishbone", "step-whywhy",
    "step-rootcauses", "step-countermeasure", "step-results", "step-standardization",
    "step-benefits", "step-closure", "step-docs",
}
TEAM_KINDS = {"team-assessment"}
EVAL_ROLES = ("admin", "dept_head", "facilitator")
TEAM_RUNNER_ROLES = ("admin", "leader", "facilitator", "coordinator", "dept_head")
GLOBAL_KINDS = {  # kind -> roles allowed to write
    "config-activity-steps": ("admin",),
    "config-hierarchy": ("admin",),
    "config-meeting-schedules": ("admin",),
    "config-halfyear-ranges": ("admin",),
    "config-team-periods": ("admin", "leader", "facilitator"),
    "eval-setup": EVAL_ROLES,
    "eval-scores": EVAL_ROLES,
    "eval-remarks": EVAL_ROLES,
    "eval-submitted": EVAL_ROLES,
    "eval-team-levels": EVAL_ROLES,
    "meetings-exec": TEAM_RUNNER_ROLES,   # further limited per team, see _check_fields
}
MAX_DOC_BYTES = 8 * 1024 * 1024
MAX_FILE_BYTES = 25 * 1024 * 1024


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse(key: str):
    """Split a key into (kind, project_id, team_id); 400 on anything unknown."""
    kind, _, ref = (key or "").partition("/")
    if kind in PROJECT_KINDS:
        pid = ref.split("/")[0]
        if pid:
            return kind, pid, None
    elif kind in TEAM_KINDS:
        if ref and "/" not in ref:
            return kind, None, ref
    elif kind in GLOBAL_KINDS:
        if not ref:
            return kind, None, None
    raise HTTPException(status_code=400, detail=f"Unknown document key '{key}'")


def _can_read(db: Session, user: User, kind: str, pid, tid) -> bool:
    if kind in PROJECT_KINDS:
        return can_access_project(db, user, pid)
    if kind in TEAM_KINDS:
        return can_access_team(db, user, tid)
    return True


def _can_write(db: Session, user: User, kind: str, pid, tid) -> bool:
    if kind in PROJECT_KINDS:
        return can_edit_project(db, user, pid)
    if kind in TEAM_KINDS:
        return can_edit_team_data(db, user, tid)
    return user.role in GLOBAL_KINDS[kind]


# ── Field-level guards ───────────────────────────────────────────────────────
def _cm_approvals(data):
    """Per root cause: the advisor's decision on its countermeasures. A root cause still
    pending (e.g. one the team just added) carries no decision, so it is left out."""
    rows = data if isinstance(data, list) else []
    return {r.get("id"): (r.get("approvalStatus"), r.get("approvedCountermeasureId"), r.get("approvedBy"), r.get("approvedAt"))
            for r in rows
            if isinstance(r, dict) and (r.get("approvalStatus") not in (None, "pending") or r.get("approvedCountermeasureId"))}


APPROVAL_GUARDS = {  # kind -> (extract the approval part, roles that may change it, message)
    "step-countermeasure": (_cm_approvals, ("admin", "dept_head"),
                            "Only an Advisor (Admin / Dept Head) can approve or reject countermeasures"),
    "step-standardization": (lambda d: (d or {}).get("approval") if isinstance(d, dict) else None, ("admin",),
                             "Only the Admin can approve or unlock Standardization"),
    "step-closure": (lambda d: (d or {}).get("approval") if isinstance(d, dict) else None, ("admin", "facilitator"),
                     "Only the Advisor (Admin / Facilitator) can close the project or send it back"),
}


def _check_fields(db: Session, user: User, kind: str, old, new) -> None:
    guard = APPROVAL_GUARDS.get(kind)
    if guard:
        extract, roles, message = guard
        if extract(old) != extract(new) and user.role not in roles:
            raise HTTPException(status_code=403, detail=message)
    if kind == "meetings-exec" and user.role != "admin":
        # Minutes / attendance may only be written for meetings of a team you run.
        old_map = old if isinstance(old, dict) else {}
        new_map = new if isinstance(new, dict) else {}
        for row_id in set(old_map) | set(new_map):
            if old_map.get(row_id) == new_map.get(row_id):
                continue
            team_id = (new_map.get(row_id) or old_map.get(row_id) or {}).get("teamId")
            if not team_id or not can_edit_team_data(db, user, team_id):
                raise HTTPException(status_code=403, detail="You can only record meetings of your own team")


def _out(db: Session, user: User, key: str, doc) -> SharedDocOut:
    kind, pid, tid = _parse(key)
    return SharedDocOut(
        key=key, data=doc.data if doc else None, version=doc.version if doc else 0,
        updated_at=doc.updated_at if doc else None, updated_by_name=doc.updated_by_name if doc else None,
        can_edit=_can_write(db, user, kind, pid, tid),
    )


# ── Documents ────────────────────────────────────────────────────────────────
@router.get("/docs", response_model=list[SharedDocOut])
def get_docs(keys: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """The requested keys (comma separated) the caller may read; a key with nothing saved
    yet comes back with version 0 and data null."""
    out = []
    for key in [k.strip() for k in keys.split(",") if k.strip()]:
        kind, pid, tid = _parse(key)
        if _can_read(db, user, kind, pid, tid):
            out.append(_out(db, user, key, db.get(SharedDoc, key)))
    return out


@router.get("/docs/kind/{kind}", response_model=list[SharedDocOut])
def get_docs_by_kind(kind: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Every saved document of one kind that the caller may read (e.g. all projects'
    benefit sheets for the Dashboard)."""
    if kind not in PROJECT_KINDS | TEAM_KINDS | set(GLOBAL_KINDS):
        raise HTTPException(status_code=400, detail=f"Unknown document kind '{kind}'")
    q = db.query(SharedDoc).filter(SharedDoc.kind == kind)
    if kind in PROJECT_KINDS:
        pids = accessible_project_ids(db, user)
        if pids is not None:
            q = q.filter(SharedDoc.project_id.in_(pids or {""}))
    elif kind in TEAM_KINDS:
        tids = accessible_team_ids(db, user)
        if tids is not None:
            q = q.filter(SharedDoc.team_id.in_(tids or {""}))
    return [_out(db, user, d.key, d) for d in q.order_by(SharedDoc.key).all()]


@router.put("/docs", response_model=SharedDocOut)
def save_doc(body: SharedDocSave, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    kind, pid, tid = _parse(body.key)
    if not _can_read(db, user, kind, pid, tid) or not _can_write(db, user, kind, pid, tid):
        raise HTTPException(status_code=403, detail="You can view this but not change it")
    if len(json.dumps(body.data)) > MAX_DOC_BYTES:
        raise HTTPException(status_code=413, detail="This document is too large to save")

    doc = db.get(SharedDoc, body.key)
    current_version = doc.version if doc else 0
    if body.base_version != current_version:
        who = f" by {doc.updated_by_name}" if doc and doc.updated_by_name else ""
        raise HTTPException(status_code=409, detail=f"This was changed on another PC{who}. Reload to see the latest version.")
    _check_fields(db, user, kind, doc.data if doc else None, body.data)

    if not doc:
        doc = SharedDoc(key=body.key, kind=kind, project_id=pid, team_id=tid, version=0)
        db.add(doc)
    doc.data = body.data
    doc.version = current_version + 1
    doc.updated_at = _now()
    doc.updated_by = user.id
    doc.updated_by_name = user.name
    db.commit()
    db.refresh(doc)
    return _out(db, user, body.key, doc)


# ── Step documents (files) ───────────────────────────────────────────────────
def _file_project(scope: str) -> str:
    kind, pid, _ = _parse(scope)
    if kind != "step-docs":
        raise HTTPException(status_code=400, detail="Files can only be attached to a step's document register")
    return pid


@router.post("/files", response_model=StoredFileOut)
async def upload_file(scope: str = Form(...), file: UploadFile = File(...),
                      db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    pid = _file_project(scope)
    if not can_edit_project(db, user, pid):
        raise HTTPException(status_code=403, detail="You can only add documents to your own team's project")
    content = await file.read()
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail=f"Files up to {MAX_FILE_BYTES // (1024 * 1024)} MB can be uploaded")
    file_id = f"F-{uuid.uuid4().hex[:16]}"
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", file.filename or "file")[-120:]
    stored_name = f"{file_id}_{safe_name}"
    with open(os.path.join(UPLOAD_DIR, stored_name), "wb") as fh:
        fh.write(content)
    row = StoredFile(
        id=file_id, project_id=pid, scope=scope, file_name=file.filename or safe_name,
        content_type=file.content_type, size=len(content), stored_name=stored_name,
        uploaded_by=user.id, uploaded_by_name=user.name, uploaded_at=_now(),
    )
    db.add(row)
    db.commit()
    return StoredFileOut.model_validate(row)


@router.get("/files/{file_id}")
def download_file(file_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    row = db.get(StoredFile, file_id)
    if not row:
        raise HTTPException(status_code=404, detail="File not found")
    if not can_access_project(db, user, row.project_id):
        raise HTTPException(status_code=403, detail="You do not have access to this file")
    path = os.path.join(UPLOAD_DIR, row.stored_name)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="The file is missing on the server")
    return FileResponse(path, media_type=row.content_type or "application/octet-stream", filename=row.file_name)


@router.delete("/files/{file_id}")
def delete_file(file_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    row = db.get(StoredFile, file_id)
    if not row:
        return {"ok": True}
    if not can_edit_project(db, user, row.project_id):
        raise HTTPException(status_code=403, detail="You can only remove documents of your own team's project")
    try:
        os.remove(os.path.join(UPLOAD_DIR, row.stored_name))
    except OSError:
        pass
    db.delete(row)
    db.commit()
    return {"ok": True}
