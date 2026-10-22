# QCC Monitor — local data snapshot (DX-PC, 22 Oct 2026)

What the QCC database on DX-PC holds today, so the same data can be entered on another
server (e.g. the hosted site). The database itself is **not** in this repo — the repo is
public, and pushing code never copies database rows to a server.

**Not written here on purpose:** passwords and personal email addresses. Ask the QCC
admin for logins.

## 1. Data added or changed after the demo seed

Everything else on DX-PC is the demo data from `backend/seed.py`. Only these differ:

| # | What | Details | How to add it on another server |
|---|---|---|---|
| 1 | New user | **Simran Kaur** · role `facilitator` · department Maintenance · joined 2026-10-21 · active | Admin Panel → Users → Add User |
| 2 | QCC cycle changed | Seed cycle *QCC 2026 (2026-04-01 → 2026-11-02, max 40 teams)* replaced by **QCC 2026 · 2026-07-01 → 2026-11-30 · max 50 teams · active** | Admin Panel → Cycles |
| 3 | Passwords changed | `admin` (Rajesh Kumar) and `amit` (Amit Patel) no longer use the seed password | Admin Panel → Users → Reset password |
| 4 | Saved step sheet | PRJ-001 Step 1 (Theme Selection): opened and saved empty — no theme points yet | Nothing to copy |
| 5 | Team Evaluation | Team levels saved empty | Nothing to copy |

No step documents (files) have been uploaded, and no team change requests exist.

## 2. Totals on DX-PC

| Table | Rows | | Table | Rows |
|---|---|---|---|---|
| Users | 13 | | Actions | 8 |
| Teams | 5 | | Approval requests | 5 |
| Team members | 12 | | Meeting minutes | 3 |
| Projects | 4 | | Cycles | 1 |
| Workflow steps | 28 (7 per project) | | Departments / sub-depts & lines | 5 / 30 |
| Shared documents | 2 | | Uploaded files | 0 |

## 3. Users

| ID | Name | Username | Role | Department | Joined |
|---|---|---|---|---|---|
| u1 | Rajesh Kumar | admin | admin | IT | 2024-01-15 |
| u2 | Priya Sharma | priya | leader | Manufacturing | 2024-02-01 |
| u3 | Amit Patel | amit | facilitator | Quality Assurance | 2024-02-10 |
| u4 | Sneha Reddy | sneha | coordinator | Engineering | 2024-03-01 |
| u5 | Vikram Singh | vikram | dept_head | Manufacturing | 2024-01-20 |
| u6 | Anita Desai | anita | member | Manufacturing | 2024-03-15 |
| u7 | Karthik Nair | karthik | member | Manufacturing | 2024-03-15 |
| u8 | Meera Joshi | meera | leader | Quality Assurance | 2024-02-05 |
| u9 | Suresh Gupta | suresh | member | Engineering | 2024-04-01 |
| u10 | Deepa Menon | deepa | dept_head | Quality Assurance | 2024-01-25 |
| u11 | Rahul Verma | rahul | member | Logistics | 2024-04-10 |
| u12 | Neha Kapoor | neha | facilitator | R&D | 2024-03-20 |
| u13 | Simran Kaur | *(ask admin)* | facilitator | Maintenance | 2026-10-21 |

Usernames u1–u12 are the part of their `@qcc.com` email before the `@`.

## 4. Teams

| ID | Team | Department · Sub-dept | Leader | Advisor (facilitator) | Coordinator | Status | Members |
|---|---|---|---|---|---|---|---|
| QCC-MFG-001 | Precision Pioneers | Manufacturing · CNC Shop | Priya Sharma | Amit Patel | Sneha Reddy | active | Anita Desai, Karthik Nair, Rajan Iyer |
| QCC-QA-002 | Quality Champions | Quality Assurance · In-Process QC | Meera Joshi | Amit Patel | Sneha Reddy | active | Suresh Gupta, Pooja Saxena, Harish Rao *(inactive — transferred)* |
| QCC-ENG-003 | Innovation Squad | Engineering · Process Engineering | Sneha Reddy | Neha Kapoor | Sneha Reddy | active | Suresh Gupta, Rahul Verma |
| QCC-LOG-004 | Lean Logistics | Logistics · Warehouse | Priya Sharma | Neha Kapoor | Sneha Reddy | active | Rahul Verma, Kavita Nair |
| QCC-MFG-005 | Zero Defect Team | Manufacturing · Welding Shop | Priya Sharma | Amit Patel | Sneha Reddy | inactive | Anita Desai, Deepak Joshi |

## 5. Projects

| ID | Team | Title | Status | Steps approved | Savings (₹) | Impact |
|---|---|---|---|---|---|---|
| PRJ-001 | QCC-MFG-001 | Reducing CNC Machine Setup Time by 40% | in progress | 3 / 7 (Step 4 submitted) | 2,50,000 | 85 |
| PRJ-002 | QCC-QA-002 | Eliminating Assembly Line Defects | in progress | 1 / 7 (Step 2 submitted) | 1,80,000 | 72 |
| PRJ-003 | QCC-ENG-003 | Optimizing Energy Consumption in HVAC | completed | 5 / 7 (Step 6 submitted) | 4,20,000 | 94 |
| PRJ-004 | QCC-LOG-004 | Warehouse Picking Efficiency Improvement | in progress | 0 / 7 | 95,000 | 60 |

## 6. Other demo data (unchanged from `backend/seed.py`)

- **Actions:** ACT-001 … ACT-008 (2 completed, 2 in progress, 2 open, 2 overdue).
- **Approval requests:** APR-001 … APR-005 (2 pending, 2 approved, 1 rework).
- **Meeting minutes:** MTG-001 (PRJ-001), MTG-002 (PRJ-002), MTG-003 (PRJ-003).
- **Departments:** Manufacturing, Quality Assurance, Engineering, Logistics, R&D, with
  16 sub-departments and 14 lines.

## 7. Bringing this data to another server — `backend/data_sync.py`

The script copies the data between databases. It **adds** what the other server is
missing and never deletes anything there.

**1. On DX-PC** (in `QCC/backend`) — export:

```bash
.venv/Scripts/python.exe data_sync.py export
```

This writes `QCC/db_backups/qcc_data_<date>/` (`data.json` + uploaded step documents).
`db_backups/` is git-ignored. The folder holds emails and password hashes, so copy it to
the other server **privately** (USB / shared drive) — never commit it or attach it publicly.

**2. On the other server** (in its `QCC/backend`, after `git pull`) — check first, then import:

```bash
python data_sync.py import ../db_backups/qcc_data_<date>
python data_sync.py import ../db_backups/qcc_data_<date> --apply
```

The first command is a dry run: it prints, table by table, how many rows would be
**added**, are already the **same**, **differ** (left as they are) or **conflict**
(e.g. the same email already used by another user). Nothing is written until `--apply`.

| Option | Effect |
|---|---|
| *(none)* | Dry run — shows the changes, writes nothing |
| `--apply` | Adds the missing rows and uploaded files |
| `--update` | Also overwrites rows that exist on both servers with DX-PC's copy |
| `--with-passwords` | With `--update`: also copies passwords of users that already exist |

New users always come with their DX-PC password, so they can log in straight away.
Running the import again is safe — rows already copied are skipped.

Tested on 22 Oct 2026 against a scratch SQLite and a scratch PostgreSQL database:
the dry run wrote nothing; `--apply` added only the missing rows and kept the target's
own teams and users; a second run changed nothing; an email already used by another
user was reported as a conflict and skipped.

To replace a whole database instead (all of the other server's data is lost), use a
`pg_dump` from DX-PC with `pg_restore` there — only on a server whose data may be overwritten.
