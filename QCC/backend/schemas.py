"""Pydantic v2 schemas for request/response bodies.

Every model serialises to **camelCase** JSON (via an alias generator) so the payloads
match the TypeScript interfaces the React app already expects (leaderName, projectTheme,
currentStage, ...), while the Python side keeps snake_case attribute names.
"""
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        alias_generator=to_camel,
    )


# ---------- Auth ----------
class LoginRequest(BaseModel):
    email: str
    password: str


class ChangePasswordRequest(CamelModel):
    current_password: str
    new_password: str


# ---------- Forgot password (email code) ----------
class ForgotPasswordRequest(CamelModel):
    email: str


class VerifyResetCodeRequest(CamelModel):
    email: str
    code: str


class ResetPasswordRequest(CamelModel):
    reset_token: str
    new_password: str


class UserOut(CamelModel):
    id: str
    name: str
    email: str
    role: str
    department: str
    avatar: Optional[str] = None
    is_active: bool = True
    joined_at: Optional[str] = None


class TokenResponse(CamelModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- Teams ----------
class TeamMemberBase(CamelModel):
    member_id: str
    team_id: str
    member_name: str
    employee_id: Optional[str] = None
    department: Optional[str] = None
    is_active: bool = True
    deactivation_reason: Optional[str] = None
    deactivated_at: Optional[str] = None


class TeamOut(CamelModel):
    id: str
    name: str
    department: str
    sub_department: Optional[str] = None
    leader_name: Optional[str] = None
    facilitator_name: Optional[str] = None
    coordinator_name: Optional[str] = None
    project_theme: Optional[str] = ""
    project_title: Optional[str] = ""
    status: str = "active"
    current_stage: int = 0
    created_at: Optional[str] = None
    draft_saved_at: Optional[str] = None
    members: list[TeamMemberBase] = []


class TeamCreate(CamelModel):
    name: str
    department: str
    sub_department: Optional[str] = None
    leader_name: Optional[str] = None
    facilitator_name: Optional[str] = None
    coordinator_name: Optional[str] = None
    project_theme: Optional[str] = ""
    project_title: Optional[str] = ""
    members: list[TeamMemberBase] = []
    # Registration date; decides which QCC period the team belongs to.
    # Defaults to today on the server when the client does not send one.
    created_at: Optional[str] = None


class TeamUpdate(CamelModel):
    name: Optional[str] = None
    department: Optional[str] = None
    sub_department: Optional[str] = None
    leader_name: Optional[str] = None
    facilitator_name: Optional[str] = None
    coordinator_name: Optional[str] = None
    project_theme: Optional[str] = None
    project_title: Optional[str] = None
    status: Optional[str] = None
    current_stage: Optional[int] = None


# ---------- Projects / Workflow ----------
class WorkflowStepOut(CamelModel):
    step_number: int
    title: str
    description: Optional[str] = None
    status: str = "draft"
    notes: Optional[str] = ""
    attachments: list[str] = []
    completed_at: Optional[str] = None
    updated_at: Optional[str] = None


class WorkflowStepUpdate(CamelModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    attachments: Optional[list[str]] = None
    title: Optional[str] = None   # used only when auto-creating a new (admin-added) step


class ProjectOut(CamelModel):
    id: str
    team_id: str
    title: str
    problem_statement: Optional[str] = ""
    department: Optional[str] = None
    started_at: Optional[str] = None
    target_completion: Optional[str] = None
    status: str = "in_progress"
    savings: float = 0
    impact_score: int = 0
    steps: list[WorkflowStepOut] = []


# ---------- Actions ----------
class ActionOut(CamelModel):
    id: str
    project_id: str
    title: str
    assignee_id: Optional[str] = None
    due_date: Optional[str] = None
    status: str = "open"
    priority: str = "medium"
    created_at: Optional[str] = None


class ActionCreate(CamelModel):
    project_id: str
    title: str
    assignee_id: Optional[str] = None
    due_date: Optional[str] = None
    status: str = "open"
    priority: str = "medium"


class ActionUpdate(CamelModel):
    title: Optional[str] = None
    assignee_id: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None


# ---------- Approvals ----------
class ApprovalOut(CamelModel):
    id: str
    project_id: str
    step_number: int
    requested_by: Optional[str] = None
    requested_at: Optional[str] = None
    status: str = "pending"
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    comments: Optional[str] = None


class ApprovalDecision(CamelModel):
    status: str  # approved | rejected | rework
    comments: Optional[str] = None


# ---------- Meta (departments, sub-departments, cycles) ----------
class SubDepartmentOut(CamelModel):
    id: str
    name: str
    parent_id: str
    level: str
    is_active: bool = True


class DepartmentOut(CamelModel):
    id: str
    name: str
    head_id: Optional[str] = None
    team_count: int = 0
    active_projects: int = 0
    sub_departments: list[SubDepartmentOut] = []


class CycleOut(CamelModel):
    id: str
    name: str
    year: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    max_teams: int = 20
    is_active: bool = False


class CycleCreate(CamelModel):
    id: Optional[str] = None
    name: str
    year: Optional[int] = None
    start_date: str
    end_date: Optional[str] = None
    max_teams: int = 20


class CycleUpdate(CamelModel):
    is_active: Optional[bool] = None
    name: Optional[str] = None


# ---------- Dashboard ----------
class DashboardStats(CamelModel):
    total_teams: int
    active_projects: int
    overdue_actions: int
    pending_approvals: int
    completed_projects: int
    total_savings: float


class MeetingOut(CamelModel):
    id: str
    project_id: str
    date: Optional[str] = None
    attendees: list[str] = []
    agenda: Optional[str] = None
    discussion: Optional[str] = None
    action_items: list[str] = []
    next_meeting: Optional[str] = None
    created_by: Optional[str] = None
