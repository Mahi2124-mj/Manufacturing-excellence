"""SQLAlchemy ORM models for the QCC Monitor.

The schema mirrors the TypeScript interfaces in src/types/index.ts. String primary
keys deliberately reuse the frontend's existing ids (u1, QCC-MFG-001, PRJ-001, ...)
so the seeded database is drop-in compatible with the current React app.

Date-like fields are stored as ISO strings (the frontend already treats them as
strings and does `new Date(str)`), keeping a faithful 1:1 mapping with the mock data.
"""
from sqlalchemy import (
    Boolean, Column, Float, ForeignKey, Integer, String, Text, JSON, DateTime, func
)
from sqlalchemy.orm import relationship

from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    role = Column(String, nullable=False)  # admin|leader|facilitator|coordinator|dept_head|member
    department = Column(String, nullable=False)
    avatar = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    joined_at = Column(String, nullable=True)
    password_hash = Column(String, nullable=False)


class Department(Base):
    __tablename__ = "departments"

    id = Column(String, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    head_id = Column(String, ForeignKey("users.id"), nullable=True)


class SubDepartment(Base):
    __tablename__ = "sub_departments"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    parent_id = Column(String, nullable=False)  # department name OR a sub_department id
    level = Column(String, nullable=False)       # department|sub_department|line
    is_active = Column(Boolean, default=True, nullable=False)


class Team(Base):
    __tablename__ = "teams"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    department = Column(String, nullable=False)
    sub_department = Column(String, nullable=True)
    leader_name = Column(String, nullable=True)
    facilitator_name = Column(String, nullable=True)
    coordinator_name = Column(String, nullable=True)
    project_theme = Column(String, nullable=True, default="")
    project_title = Column(String, nullable=True, default="")
    status = Column(String, default="active", nullable=False)  # active|inactive|archived
    current_stage = Column(Integer, default=0, nullable=False)
    created_at = Column(String, nullable=True)
    draft_saved_at = Column(String, nullable=True)

    members = relationship(
        "TeamMember", back_populates="team", cascade="all, delete-orphan"
    )


class TeamMember(Base):
    __tablename__ = "team_members"

    member_id = Column(String, primary_key=True)
    team_id = Column(String, ForeignKey("teams.id"), nullable=False, index=True)
    member_name = Column(String, nullable=False)
    employee_id = Column(String, nullable=True)
    department = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    deactivation_reason = Column(String, nullable=True)
    deactivated_at = Column(String, nullable=True)

    team = relationship("Team", back_populates="members")


class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True)
    team_id = Column(String, ForeignKey("teams.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    problem_statement = Column(Text, nullable=True, default="")
    department = Column(String, nullable=True)
    started_at = Column(String, nullable=True)
    target_completion = Column(String, nullable=True)
    status = Column(String, default="in_progress", nullable=False)  # in_progress|completed|on_hold|cancelled
    savings = Column(Float, default=0, nullable=False)
    impact_score = Column(Integer, default=0, nullable=False)

    steps = relationship(
        "WorkflowStep", back_populates="project", cascade="all, delete-orphan",
        order_by="WorkflowStep.step_number",
    )


class WorkflowStep(Base):
    __tablename__ = "workflow_steps"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    step_number = Column(Integer, nullable=False)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    status = Column(String, default="draft", nullable=False)  # draft|saved|submitted|under_review|approved|rework
    notes = Column(Text, default="", nullable=True)
    attachments = Column(JSON, default=list)
    completed_at = Column(String, nullable=True)
    updated_at = Column(String, nullable=True)

    project = relationship("Project", back_populates="steps")


class ActionItem(Base):
    __tablename__ = "actions"

    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    assignee_id = Column(String, ForeignKey("users.id"), nullable=True)
    due_date = Column(String, nullable=True)
    status = Column(String, default="open", nullable=False)     # open|in_progress|completed|overdue
    priority = Column(String, default="medium", nullable=False)  # low|medium|high|critical
    created_at = Column(String, nullable=True)


class Approval(Base):
    __tablename__ = "approvals"

    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    step_number = Column(Integer, nullable=False)
    requested_by = Column(String, ForeignKey("users.id"), nullable=True)
    requested_at = Column(String, nullable=True)
    status = Column(String, default="pending", nullable=False)  # pending|approved|rejected|rework
    reviewed_by = Column(String, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(String, nullable=True)
    comments = Column(Text, nullable=True)


class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    date = Column(String, nullable=True)
    attendees = Column(JSON, default=list)      # list of user ids
    agenda = Column(Text, nullable=True)
    discussion = Column(Text, nullable=True)
    action_items = Column(JSON, default=list)   # list of strings
    next_meeting = Column(String, nullable=True)
    created_by = Column(String, ForeignKey("users.id"), nullable=True)


class Cycle(Base):
    __tablename__ = "cycles"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    year = Column(Integer, nullable=True)
    start_date = Column(String, nullable=True)
    end_date = Column(String, nullable=True)
    max_teams = Column(Integer, default=20, nullable=False)
    is_active = Column(Boolean, default=False, nullable=False)


class TeamChangeRequest(Base):
    __tablename__ = "team_change_requests"

    id = Column(String, primary_key=True)
    team_id = Column(String, ForeignKey("teams.id"), nullable=False, index=True)
    team_name = Column(String, nullable=True)
    requested_by = Column(String, nullable=True)
    requested_by_name = Column(String, nullable=True)
    requested_at = Column(String, nullable=True)
    status = Column(String, default="pending", nullable=False)  # pending|approved|rejected
    reviewed_by = Column(String, nullable=True)
    reviewed_at = Column(String, nullable=True)
    review_comments = Column(Text, nullable=True)
    change_reason = Column(Text, nullable=True)
    changes = Column(JSON, default=list)     # [{field, oldValue, newValue}]
    snapshot = Column(JSON, default=dict)    # Partial<Team>


class AuditLog(Base):
    """Generic edit-history / audit trail for workflow steps and other mutations."""
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    entity_type = Column(String, nullable=False)   # project|team|approval|action|step
    entity_id = Column(String, nullable=True)
    project_id = Column(String, nullable=True, index=True)
    step_number = Column(Integer, nullable=True)
    action = Column(String, nullable=False)
    field_changed = Column(String, nullable=True)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    performed_by = Column(String, nullable=True)
    performed_by_name = Column(String, nullable=True)
    performed_by_role = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PasswordResetCode(Base):
    """A one-time code emailed to a user who forgot their password.

    Only the *hash* of the code is stored, so a database reader cannot use it. A code
    is single-use, expires after a few minutes, and is burnt after a handful of wrong
    attempts so it cannot be guessed.
    """
    __tablename__ = "password_reset_codes"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    email = Column(String, nullable=False, index=True)
    code_hash = Column(String, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    attempts = Column(Integer, default=0, nullable=False)
    used = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
