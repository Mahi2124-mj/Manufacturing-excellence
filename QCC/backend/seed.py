"""Seed the PostgreSQL `qcc` database from the frontend's mock data.

Run from the backend/ directory:
    python seed.py            # create tables + insert seed data (skips if already seeded)
    python seed.py --reset    # DROP ALL tables, recreate, then insert

Every seeded user gets the password  demo123  (pbkdf2-hashed). Ids match the React
app's mock ids so the seeded DB is drop-in compatible with the existing frontend.
"""
import sys

from database import Base, SessionLocal, engine
from models import (
    User, Department, SubDepartment, Team, TeamMember, Project, WorkflowStep,
    ActionItem, Approval, Meeting, Cycle,
)
from security import hash_password

DEFAULT_PASSWORD = "demo123"

STEP_TITLES = [
    "Theme Selection",
    "Grasp the Current Situation and Set a Target",
    "Create an Activity Plan",
    "Root Cause Analysis",
    "Countermeasure Study and Implementation",
    "Check the Results",
    "Standardization & Establish Control",
]

USERS = [
    ("u1", "Rajesh Kumar", "admin@qcc.com", "admin", "IT", "2024-01-15"),
    ("u2", "Priya Sharma", "priya@qcc.com", "leader", "Manufacturing", "2024-02-01"),
    ("u3", "Amit Patel", "amit@qcc.com", "facilitator", "Quality Assurance", "2024-02-10"),
    ("u4", "Sneha Reddy", "sneha@qcc.com", "coordinator", "Engineering", "2024-03-01"),
    ("u5", "Vikram Singh", "vikram@qcc.com", "dept_head", "Manufacturing", "2024-01-20"),
    ("u6", "Anita Desai", "anita@qcc.com", "member", "Manufacturing", "2024-03-15"),
    ("u7", "Karthik Nair", "karthik@qcc.com", "member", "Manufacturing", "2024-03-15"),
    ("u8", "Meera Joshi", "meera@qcc.com", "leader", "Quality Assurance", "2024-02-05"),
    ("u9", "Suresh Gupta", "suresh@qcc.com", "member", "Engineering", "2024-04-01"),
    ("u10", "Deepa Menon", "deepa@qcc.com", "dept_head", "Quality Assurance", "2024-01-25"),
    ("u11", "Rahul Verma", "rahul@qcc.com", "member", "Logistics", "2024-04-10"),
    ("u12", "Neha Kapoor", "neha@qcc.com", "facilitator", "R&D", "2024-03-20"),
]

DEPARTMENTS = [
    ("d1", "Manufacturing", "u5"), ("d2", "Quality Assurance", "u10"),
    ("d3", "Engineering", "u5"), ("d4", "Logistics", "u5"), ("d5", "R&D", "u10"),
]

# (id, name, parent_id, level)
SUB_DEPARTMENTS = [
    ("sd-1", "CNC Shop", "Manufacturing", "sub_department"),
    ("sd-2", "Assembly Shop", "Manufacturing", "sub_department"),
    ("sd-3", "Welding Shop", "Manufacturing", "sub_department"),
    ("sd-4", "Paint Shop", "Manufacturing", "sub_department"),
    ("ln-1", "Line A - Turning", "sd-1", "line"),
    ("ln-2", "Line B - Milling", "sd-1", "line"),
    ("ln-3", "Line C - Drilling", "sd-1", "line"),
    ("ln-4", "Line 1 - Engine Assembly", "sd-2", "line"),
    ("ln-5", "Line 2 - Chassis Assembly", "sd-2", "line"),
    ("ln-6", "MIG Welding", "sd-3", "line"),
    ("ln-7", "TIG Welding", "sd-3", "line"),
    ("sd-5", "Incoming QC", "Quality Assurance", "sub_department"),
    ("sd-6", "In-Process QC", "Quality Assurance", "sub_department"),
    ("sd-7", "Final QC", "Quality Assurance", "sub_department"),
    ("sd-8", "Calibration Lab", "Quality Assurance", "sub_department"),
    ("ln-8", "Raw Material Inspection", "sd-5", "line"),
    ("ln-9", "Component Testing", "sd-5", "line"),
    ("ln-10", "Stage Inspection", "sd-6", "line"),
    ("sd-9", "Design", "Engineering", "sub_department"),
    ("sd-10", "Process Engineering", "Engineering", "sub_department"),
    ("sd-11", "Maintenance", "Engineering", "sub_department"),
    ("ln-11", "CAD/CAM", "sd-9", "line"),
    ("ln-12", "Prototyping", "sd-9", "line"),
    ("sd-12", "Warehouse", "Logistics", "sub_department"),
    ("sd-13", "Dispatch", "Logistics", "sub_department"),
    ("sd-14", "Transport", "Logistics", "sub_department"),
    ("ln-13", "Inbound", "sd-12", "line"),
    ("ln-14", "Outbound", "sd-12", "line"),
    ("sd-15", "Product Development", "R&D", "sub_department"),
    ("sd-16", "Testing Lab", "R&D", "sub_department"),
]

# (member_id, team_id, name, employee_id, department, is_active, deactivation_reason, deactivated_at)
TEAM_MEMBERS = [
    ("TM-001", "QCC-MFG-001", "Anita Desai", "EMP-106", "Manufacturing", True, None, None),
    ("TM-002", "QCC-MFG-001", "Karthik Nair", "EMP-107", "Manufacturing", True, None, None),
    ("TM-003", "QCC-MFG-001", "Rajan Iyer", "EMP-113", "Manufacturing", True, None, None),
    ("TM-004", "QCC-QA-002", "Suresh Gupta", "EMP-109", "Quality Assurance", True, None, None),
    ("TM-005", "QCC-QA-002", "Pooja Saxena", "EMP-114", "Quality Assurance", True, None, None),
    ("TM-006", "QCC-QA-002", "Harish Rao", "EMP-115", "Quality Assurance", False,
     "Transferred to another department", "2024-06-15"),
    ("TM-007", "QCC-ENG-003", "Suresh Gupta", "EMP-109", "Engineering", True, None, None),
    ("TM-008", "QCC-ENG-003", "Rahul Verma", "EMP-111", "Logistics", True, None, None),
    ("TM-009", "QCC-LOG-004", "Rahul Verma", "EMP-111", "Logistics", True, None, None),
    ("TM-010", "QCC-LOG-004", "Kavita Nair", "EMP-116", "Logistics", True, None, None),
    ("TM-011", "QCC-MFG-005", "Anita Desai", "EMP-106", "Manufacturing", True, None, None),
    ("TM-012", "QCC-MFG-005", "Deepak Joshi", "EMP-117", "Manufacturing", True, None, None),
]

# (id, name, dept, sub_dept, leader, facilitator, coordinator, theme, created_at, status, stage, title)
TEAMS = [
    ("QCC-MFG-001", "Precision Pioneers", "Manufacturing", "CNC Shop", "Priya Sharma",
     "Amit Patel", "Sneha Reddy", "Reducing CNC Machine Setup Time by 40%", "2024-03-01",
     "active", 4, "Reducing CNC Machine Setup Time by 40%"),
    ("QCC-QA-002", "Quality Champions", "Quality Assurance", "In-Process QC", "Meera Joshi",
     "Amit Patel", "Sneha Reddy", "Eliminating Assembly Line Defects using Six Sigma", "2024-03-15",
     "active", 2, "Eliminating Assembly Line Defects"),
    ("QCC-ENG-003", "Innovation Squad", "Engineering", "Process Engineering", "Sneha Reddy",
     "Neha Kapoor", "Sneha Reddy", "Green Energy Optimization", "2024-04-01",
     "active", 6, "Optimizing Energy Consumption in HVAC"),
    ("QCC-LOG-004", "Lean Logistics", "Logistics", "Warehouse", "Priya Sharma",
     "Neha Kapoor", "Sneha Reddy", "", "2024-04-10",
     "active", 1, "Warehouse Picking Efficiency Improvement"),
    ("QCC-MFG-005", "Zero Defect Team", "Manufacturing", "Welding Shop", "Priya Sharma",
     "Amit Patel", "Sneha Reddy", "Welding Porosity Reduction", "2024-05-01",
     "inactive", 0, "Welding Porosity Reduction"),
]

# (id, team_id, title, problem, dept, current_stage, started, target, status, savings, impact)
PROJECTS = [
    ("PRJ-001", "QCC-MFG-001", "Reducing CNC Machine Setup Time by 40%",
     "Current CNC machine setup takes 45 minutes on average, causing production delays and increased downtime.",
     "Manufacturing", 4, "2024-03-15", "2024-12-31", "in_progress", 250000, 85),
    ("PRJ-002", "QCC-QA-002", "Eliminating Assembly Line Defects",
     "Assembly line defect rate is at 3.2%, exceeding the target of 1.5%.",
     "Quality Assurance", 2, "2024-04-01", "2024-11-30", "in_progress", 180000, 72),
    ("PRJ-003", "QCC-ENG-003", "Optimizing Energy Consumption in HVAC",
     "HVAC system accounts for 40% of facility energy costs with significant waste during non-peak hours.",
     "Engineering", 6, "2024-04-15", "2024-10-31", "completed", 420000, 94),
    ("PRJ-004", "QCC-LOG-004", "Warehouse Picking Efficiency Improvement",
     "Average picking time per order is 18 minutes, target is under 12 minutes.",
     "Logistics", 0, "2024-05-01", "2025-01-31", "in_progress", 95000, 60),
]

# (id, project_id, title, assignee, due, status, priority, created)
ACTIONS = [
    ("ACT-001", "PRJ-001", "Conduct time study on CNC setup process", "u6", "2024-08-15", "completed", "high", "2024-07-01"),
    ("ACT-002", "PRJ-001", "Implement SMED methodology trial", "u7", "2024-09-01", "in_progress", "critical", "2024-07-15"),
    ("ACT-003", "PRJ-001", "Train operators on new setup procedure", "u2", "2024-09-20", "open", "medium", "2024-08-01"),
    ("ACT-004", "PRJ-002", "Map defect types using Pareto analysis", "u9", "2024-07-30", "overdue", "high", "2024-07-01"),
    ("ACT-005", "PRJ-002", "Review supplier quality documentation", "u8", "2024-08-10", "in_progress", "medium", "2024-07-20"),
    ("ACT-006", "PRJ-003", "Install energy monitoring sensors", "u9", "2024-08-25", "completed", "high", "2024-06-01"),
    ("ACT-007", "PRJ-004", "Audit current warehouse layout", "u11", "2024-09-15", "open", "medium", "2024-08-05"),
    ("ACT-008", "PRJ-001", "Document standardized setup checklist", "u6", "2024-08-20", "overdue", "high", "2024-07-10"),
]

# (id, project_id, step, requested_by, requested_at, status, reviewed_by, reviewed_at, comments)
APPROVALS = [
    ("APR-001", "PRJ-001", 4, "u2", "2024-07-30", "pending", None, None, None),
    ("APR-002", "PRJ-002", 2, "u8", "2024-08-01", "pending", None, None, None),
    ("APR-003", "PRJ-001", 3, "u2", "2024-07-15", "approved", "u5", "2024-07-18", "Excellent work on solution development."),
    ("APR-004", "PRJ-003", 6, "u4", "2024-07-25", "approved", "u10", "2024-07-28", "Outstanding results. Approved for standardization."),
    ("APR-005", "PRJ-002", 1, "u8", "2024-06-20", "rework", "u10", "2024-06-23", "Need more detail on root cause analysis methodology."),
]

# (id, project_id, date, attendees, agenda, discussion, action_items, next_meeting, created_by)
MEETINGS = [
    ("MTG-001", "PRJ-001", "2024-07-28", ["u2", "u6", "u7", "u3"],
     "Review SMED trial results and plan next steps",
     "SMED trial showed 30% reduction in setup time. Team discussed further improvements for tool pre-staging.",
     ["Implement tool pre-staging area", "Record next 5 setup cycles"], "2024-08-11", "u2"),
    ("MTG-002", "PRJ-002", "2024-07-25", ["u8", "u9", "u3"],
     "Pareto analysis review and root cause discussion",
     "Top 3 defect types account for 78% of all defects. Fishbone diagram completed for solder joint defects.",
     ["Contact top 3 suppliers for quality audit", "Complete Ishikawa diagram for defect type #2"], "2024-08-08", "u8"),
    ("MTG-003", "PRJ-003", "2024-08-01", ["u4", "u9", "u11", "u12"],
     "Final review and standardization documentation",
     "Energy savings confirmed at 35% reduction. All documentation complete.",
     ["Submit final report to dept head", "Schedule knowledge sharing session"], "", "u4"),
]

CYCLES = [
    ("cyc-2026", "QCC 2026", 2026, "2026-04-01", "2026-11-02", 40, True),
]


def _make_steps(project_id: str, current_stage: int) -> list[WorkflowStep]:
    steps = []
    for i, title in enumerate(STEP_TITLES):
        step_num = i + 1
        status = "draft"
        if step_num < current_stage:
            status = "approved"
        elif step_num == current_stage:
            status = "submitted"
        steps.append(WorkflowStep(
            project_id=project_id, step_number=step_num, title=title,
            description=f"Complete all requirements for {title.lower()}",
            status=status, notes="Step completed successfully." if step_num < current_stage else "",
            attachments=[], completed_at="2024-06-15" if step_num < current_stage else None,
            updated_at="2024-07-01",
        ))
    return steps


def seed(reset: bool = False):
    if reset:
        print("[seed] Dropping all tables ...")
        Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        if db.query(User).count() > 0 and not reset:
            print("[seed] Database already has data — nothing to do. Use --reset to rebuild.")
            return

        # Insert in FK-dependency order. actions/approvals/meetings have no ORM
        # relationship to projects, so flush parents first to satisfy the FKs.
        pw = hash_password(DEFAULT_PASSWORD)
        for uid, name, email, role, dept, joined in USERS:
            db.add(User(id=uid, name=name, email=email, role=role, department=dept,
                        is_active=True, joined_at=joined, password_hash=pw))
        db.flush()  # users exist before dept.head_id / assignee FKs reference them

        for did, name, head in DEPARTMENTS:
            db.add(Department(id=did, name=name, head_id=head))
        for sid, name, parent, level in SUB_DEPARTMENTS:
            db.add(SubDepartment(id=sid, name=name, parent_id=parent, level=level, is_active=True))

        for (tid, name, dept, sub, leader, fac, coord, theme, created, status, stage, title) in TEAMS:
            db.add(Team(id=tid, name=name, department=dept, sub_department=sub,
                        leader_name=leader, facilitator_name=fac, coordinator_name=coord,
                        project_theme=theme, project_title=title, status=status,
                        current_stage=stage, created_at=created))
        for (mid, tid, name, emp, dept, active, reason, deact) in TEAM_MEMBERS:
            db.add(TeamMember(member_id=mid, team_id=tid, member_name=name, employee_id=emp,
                              department=dept, is_active=active, deactivation_reason=reason,
                              deactivated_at=deact))
        db.flush()  # teams exist before projects reference them

        for (pid, tid, title, problem, dept, stage, started, target, status, savings, impact) in PROJECTS:
            db.add(Project(id=pid, team_id=tid, title=title, problem_statement=problem,
                           department=dept, started_at=started, target_completion=target,
                           status=status, savings=savings, impact_score=impact))
            for step in _make_steps(pid, stage):
                db.add(step)
        db.flush()  # projects exist before actions/approvals/meetings reference them

        for (aid, pid, title, assignee, due, status, priority, created) in ACTIONS:
            db.add(ActionItem(id=aid, project_id=pid, title=title, assignee_id=assignee,
                              due_date=due, status=status, priority=priority, created_at=created))

        for (apid, pid, step, rby, rat, status, revby, revat, comments) in APPROVALS:
            db.add(Approval(id=apid, project_id=pid, step_number=step, requested_by=rby,
                            requested_at=rat, status=status, reviewed_by=revby,
                            reviewed_at=revat, comments=comments))

        for (mid, pid, dt, att, agenda, disc, items, nxt, cby) in MEETINGS:
            db.add(Meeting(id=mid, project_id=pid, date=dt, attendees=att, agenda=agenda,
                           discussion=disc, action_items=items, next_meeting=nxt, created_by=cby))

        for (cid, name, year, start, end, maxt, active) in CYCLES:
            db.add(Cycle(id=cid, name=name, year=year, start_date=start, end_date=end,
                         max_teams=maxt, is_active=active))

        db.commit()
        print(f"[seed] DONE — seeded {len(USERS)} users, {len(TEAMS)} teams, "
              f"{len(PROJECTS)} projects, {len(ACTIONS)} actions, {len(APPROVALS)} approvals.")
        print(f"[seed] All users can log in with password: {DEFAULT_PASSWORD}")
    finally:
        db.close()


if __name__ == "__main__":
    seed(reset="--reset" in sys.argv)
