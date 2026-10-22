"""Copy QCC data from one server's database to another's.

The app's data lives in each server's own database, and pushing code to GitHub never
copies it. This script moves it instead:

  On the PC that has the data (reads backend/.env):
      python data_sync.py export
        -> writes db_backups/qcc_data_<date>/ (data.json + uploaded step documents)

  Copy that folder to the other server PRIVATELY (USB, shared drive). It holds users'
  emails and password hashes, so never commit it — the GitHub repo is public.

  On the other server, in its backend folder:
      python data_sync.py import <folder>            # dry run: only shows what would change
      python data_sync.py import <folder> --apply    # writes it

Import only ADDS what the target is missing; rows it already has are left alone, so
its own data is never deleted or overwritten. Options:
  --update          also overwrite rows that exist on both sides with the exported copy
  --with-passwords  with --update, also copy password hashes of existing users
                    (new users always get their exported password, so they can log in)
Run it again any time: rows already copied are skipped.
"""
import argparse
import json
import os
import shutil
import socket
import sys
from datetime import datetime, timezone

from sqlalchemy import and_, select
from sqlalchemy.exc import IntegrityError

from database import UPLOAD_DIR, engine
from models import Base

FORMAT = 1
SKIP_TABLES = {"audit_log", "password_reset_codes"}           # history / one-time codes
NATURAL_KEYS = {"workflow_steps": ("project_id", "step_number")}  # its numeric id differs per server
PASSWORD_COLUMNS = {"password_hash"}
BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def _tables():
    return [t for t in Base.metadata.sorted_tables if t.name not in SKIP_TABLES]


def export(out_dir: str) -> None:
    os.makedirs(out_dir, exist_ok=True)
    data = {"format": FORMAT, "exported_at": datetime.now(timezone.utc).isoformat(),
            "source": socket.gethostname(), "tables": {}}
    with engine.connect() as conn:
        for table in _tables():
            rows = [dict(r) for r in conn.execute(select(table)).mappings()]
            data["tables"][table.name] = rows
            print(f"  {table.name:22s} {len(rows):5d} rows")
    with open(os.path.join(out_dir, "data.json"), "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1, default=str)

    copied = 0
    files_dir = os.path.join(out_dir, "uploads")
    for row in data["tables"].get("stored_files", []):
        src = os.path.join(UPLOAD_DIR, row["stored_name"])
        if os.path.exists(src):
            os.makedirs(files_dir, exist_ok=True)
            shutil.copy2(src, os.path.join(files_dir, row["stored_name"]))
            copied += 1
    print(f"  uploaded files copied: {copied}")
    print(f"\nExported to {os.path.abspath(out_dir)}")
    print("Keep this folder private: it contains emails and password hashes.")


def _clash(conn, table, values: dict, columns, exclude=None):
    """The first unique column whose value another row already uses (e.g. an email)."""
    for col in columns:
        if values.get(col) is None:
            continue
        q = select(table.c[col]).where(table.c[col] == values[col])
        if exclude is not None:
            q = q.where(~exclude)
        if conn.execute(q).first():
            return f"{col} '{values[col]}' is already used by another row"
    return None


def _import_table(conn, table, rows, update: bool, with_passwords: bool, totals: dict) -> None:
    keys = NATURAL_KEYS.get(table.name) or tuple(c.name for c in table.primary_key)
    uniques = [c.name for c in table.columns if c.unique and c.name not in keys]
    count = dict.fromkeys(totals, 0)
    conflicts = []
    for raw in rows:
        row = {k: v for k, v in raw.items() if k in table.c}    # ignore unknown columns
        if table.name in NATURAL_KEYS:
            row.pop("id", None)
        label = "/".join(str(row.get(k)) for k in keys)
        where = and_(*[table.c[k] == row.get(k) for k in keys])
        existing = conn.execute(select(table).where(where)).mappings().first()
        if existing is None:
            clash = _clash(conn, table, row, uniques)
            if clash:
                count["conflict"] += 1
                conflicts.append(f"{label}: {clash}")
            else:
                conn.execute(table.insert().values(**row))
                count["added"] += 1
            continue
        skip = set(keys) | ({"id"} if table.name in NATURAL_KEYS else set())
        if not with_passwords:
            skip |= PASSWORD_COLUMNS
        if table.name == "shared_docs":
            skip |= {"version"}
        changes = {k: v for k, v in row.items() if k not in skip and existing.get(k) != v}
        if not changes:
            count["same"] += 1
        elif not update:
            count["kept"] += 1
        else:
            clash = _clash(conn, table, changes, [c for c in uniques if c in changes], exclude=where)
            if clash:
                count["conflict"] += 1
                conflicts.append(f"{label}: {clash}")
                continue
            if table.name == "shared_docs":       # a newer version, so open pages reload it
                changes["version"] = (existing.get("version") or 0) + 1
            conn.execute(table.update().where(where).values(**changes))
            count["updated"] += 1
    for k in totals:
        totals[k] += count[k]
    print(f"  {table.name:22s} added {count['added']:4d}  updated {count['updated']:4d}  "
          f"same {count['same']:4d}  kept (differs) {count['kept']:4d}  conflict {count['conflict']:3d}")
    for c in conflicts[:5]:
        print(f"      conflict {c}")


def _import(folder: str, apply: bool, update: bool, with_passwords: bool) -> None:
    with open(os.path.join(folder, "data.json"), encoding="utf-8") as fh:
        data = json.load(fh)
    if data.get("format") != FORMAT:
        sys.exit(f"Unsupported export format {data.get('format')!r}")
    print(f"Export from {data.get('source')} at {data.get('exported_at')}")
    print("DRY RUN - nothing is written (add --apply to write)\n" if not apply else "")

    totals = {"added": 0, "updated": 0, "same": 0, "kept": 0, "conflict": 0}
    with engine.connect() as conn:
        # One transaction for everything, rolled back on a dry run or any error. (No
        # per-row savepoints: SQLite's driver would commit those even on a dry run.)
        trans = conn.begin()
        try:
            for table in _tables():
                rows = data["tables"].get(table.name, [])
                if rows:
                    _import_table(conn, table, rows, update, with_passwords, totals)
        except IntegrityError as e:
            trans.rollback()
            sys.exit(f"\nStopped, nothing was written: {str(e.orig).splitlines()[0]}\n"
                     "(usually a row that refers to a user or team the target could not take; see the conflicts above)")
        if apply:
            trans.commit()
        else:
            trans.rollback()

    copied = 0
    files_dir = os.path.join(folder, "uploads")
    if apply and os.path.isdir(files_dir):
        for name in os.listdir(files_dir):
            dst = os.path.join(UPLOAD_DIR, name)
            if not os.path.exists(dst):
                shutil.copy2(os.path.join(files_dir, name), dst)
                copied += 1
    print(f"\nTotal: added {totals['added']}, updated {totals['updated']}, unchanged {totals['same']}, "
          f"left as is {totals['kept']}, conflicts {totals['conflict']}" + (f", files copied {copied}" if apply else ""))
    if totals["kept"] and not update:
        print("'left as is' rows differ from the export; add --update to overwrite them.")
    if not apply:
        print("Dry run only. Run again with --apply to write these changes.")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("export", help="write this database to a folder")
    e.add_argument("--out", default=os.path.join(BASE_DIR, "..", "db_backups",
                                                 datetime.now().strftime("qcc_data_%Y%m%d_%H%M")))
    i = sub.add_parser("import", help="add a folder's data to this database")
    i.add_argument("folder")
    i.add_argument("--apply", action="store_true", help="write the changes (default: dry run)")
    i.add_argument("--update", action="store_true", help="overwrite rows that exist on both sides")
    i.add_argument("--with-passwords", action="store_true", help="with --update, also copy password hashes")
    a = p.parse_args()
    if a.cmd == "export":
        export(a.out)
    else:
        _import(a.folder, a.apply, a.update, a.with_passwords)


if __name__ == "__main__":
    main()
