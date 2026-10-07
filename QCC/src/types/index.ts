export type UserRole = 'admin' | 'leader' | 'facilitator' | 'coordinator' | 'dept_head' | 'member';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  avatar?: string;
  isActive: boolean;
  joinedAt: string;
}

export interface TeamMember {
  memberId: string;
  teamId: string;
  memberName: string;
  employeeId: string;
  department: string;
  isActive: boolean;
  deactivationReason?: string;
  deactivatedAt?: string;
}

export interface SubDepartment {
  id: string;
  name: string;
  parentId: string;
  level: 'department' | 'sub_department' | 'line';
  isActive: boolean;
}

export interface TeamChangeRequest {
  id: string;
  teamId: string;
  teamName: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: string;
  reviewComments?: string;
  changeReason: string;
  changes: {
    field: string;
    oldValue: string;
    newValue: string;
  }[];
  snapshot: Partial<Team>;
}

export interface Team {
  id: string;
  name: string;
  department: string;
  subDepartment?: string;
  leaderName: string;
  facilitatorName: string;
  coordinatorName: string;
  members: TeamMember[];
  projectTheme: string;
  createdAt: string;
  status: 'active' | 'inactive' | 'archived';
  currentStage: number;
  projectTitle: string;
  draftSavedAt?: string;
}

export type WorkflowStatus = 'draft' | 'saved' | 'submitted' | 'under_review' | 'approved' | 'rework';

export interface QCCStep {
  stepNumber: number;
  title: string;
  description: string;
  status: WorkflowStatus;
  completedAt?: string;
  updatedAt: string;
  notes: string;
  attachments: string[];
}

export interface QCCProject {
  id: string;
  teamId: string;
  title: string;
  problemStatement: string;
  department: string;
  steps: QCCStep[];
  startedAt: string;
  targetCompletion: string;
  status: 'in_progress' | 'completed' | 'on_hold' | 'cancelled';
  beforeImages: string[];
  afterImages: string[];
  savings: number;
  impactScore: number;
}

export interface ActionItem {
  id: string;
  projectId: string;
  title: string;
  assigneeId: string;
  dueDate: string;
  status: 'open' | 'in_progress' | 'completed' | 'overdue';
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
}

export interface MeetingMinute {
  id: string;
  projectId: string;
  date: string;
  attendees: string[];
  agenda: string;
  discussion: string;
  actionItems: string[];
  nextMeeting: string;
  createdBy: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  read: boolean;
  createdAt: string;
}

export interface ApprovalRequest {
  id: string;
  projectId: string;
  stepNumber: number;
  requestedBy: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected' | 'rework';
  reviewedBy?: string;
  reviewedAt?: string;
  comments?: string;
}

export interface Department {
  id: string;
  name: string;
  headId: string;
  teamCount: number;
  activeProjects: number;
  subDepartments: SubDepartment[];
}

export interface QCCCycleConfig {
  id: string;
  name: string;
  year: number;
  startDate: string;
  endDate: string;
  maxTeams: number;
  isActive: boolean;
}

export interface EditHistoryEntry {
  id: string;
  projectId: string;
  stepNumber: number;
  editedBy: string;
  editedByName: string;
  editedByRole: string;
  editedAt: string;
  action: 'created' | 'saved' | 'submitted' | 'approved' | 'rejected' | 'rework' | 'field_updated' | 'attachment_added' | 'note_added' | 'status_changed';
  fieldChanged?: string;
  oldValue?: string;
  newValue?: string;
  notes?: string;
}

export type GanttStatus = 'Not Started' | 'Planning' | 'In Progress' | 'Hold' | 'Delayed' | 'Completed';

export interface GanttActivity {
  id: string;
  projectId: string;
  srNo: number;
  activityName: string;
  pic: string;
  plannedStartDate: string;
  plannedEndDate: string;
  actualStartDate: string;
  actualEndDate: string;
  status: GanttStatus;
  progress: number;
  delayDays?: number;
}

export interface ActivityPlanEntry {
  id: string;
  projectId: string;
  activityStepId: string;
  activityName: string;
  pic: string;
  plannedStart: string;
  plannedEnd: string;
  actualStart: string;
  actualEnd: string;
  status: 'not_started' | 'planning' | 'in_progress' | 'hold' | 'delayed' | 'completed';
  delayDays?: number;
  remarks: string;
  isApproved: boolean;
  approvedBy?: string;
  approvedAt?: string;
  // Field-level approval/lock: each date approved (locked, read-only) independently by Admin.
  dateLocks?: { plannedStart?: boolean; plannedEnd?: boolean; actualStart?: boolean; actualEnd?: boolean };
  createdBy: string;
  createdAt: string;
  updatedBy?: string;
  updatedAt?: string;
}

export interface ActivityPlanConfig {
  id: string;
  projectId: string;
  isSubmitted: boolean;
  isApproved: boolean;
  submittedBy?: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  lastUpdatedBy?: string;
  lastUpdatedAt?: string;
}

export type ActivityStatus = 'not_started' | 'planned' | 'in_progress' | 'on_hold' | 'completed';
export type ActivityPriority = 'high' | 'medium' | 'low';

export interface QCCActivity {
  id: string;
  projectId: string;
  serialNumber: number;
  activityName: string;
  activityDescription: string;
  personInCharge: string;
  personInChargeName: string;
  priority: ActivityPriority;
  plannedStartDate: string;
  plannedEndDate: string;
  actualStartDate?: string;
  actualEndDate?: string;
  status: ActivityStatus;
  progressPercentage: number;
  delayDays: number;
  remarks: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedBy?: string;
  updatedByName?: string;
  updatedAt?: string;
  isDefaultActivity?: boolean;
}

export interface RecurringMeeting {
  id: string;
  projectId: string;
  title: string;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  dayOfWeek?: number;
  dayOfMonth?: number;
  time: string;
  duration: number;
  startDate: string;
  endDate?: string;
  isActive: boolean;
  attendees: string[];
}

export interface ActivityAuditEntry {
  id: string;
  activityId: string;
  action: 'created' | 'updated' | 'deleted' | 'status_changed' | 'reordered';
  performedBy: string;
  performedByName: string;
  performedAt: string;
  changes?: {
    field: string;
    oldValue: string;
    newValue: string;
  }[];
}

export type EvaluationSymbol = '◎' | '○' | '△' | '×';
export type RatingScale = 1 | 3 | 9;

export interface MemberScoring {
  memberId: string;
  memberName: string;
  problemId: string;
  problemName: string;
  rating: RatingScale;
  improvementPoints: string;
}

export interface EvaluationMatrixRow {
  problemId: string;
  problemName: string;
  // Necessity / Impact
  effects: EvaluationSymbol;
  urgency: EvaluationSymbol;
  extentOfProblems: EvaluationSymbol;
  futureOutlook: EvaluationSymbol;
  hoshinAlignment: EvaluationSymbol;
  // Circle Capability
  participationByAll: EvaluationSymbol;
  activityPeriod: EvaluationSymbol;
  actualCapability: EvaluationSymbol;
  // Calculated
  totalScore: number;
  overallEvaluation: string;
  recommendation?: 'recommended' | 'alternate' | 'under_review';
}

export interface ProblemEvaluation {
  projectId: string;
  evaluatedBy: string;
  evaluatedByName: string;
  evaluatedAt: string;
  memberScorings: MemberScoring[];
  evaluationMatrix: EvaluationMatrixRow[];
  topProblems: string[]; // Top 5 problem IDs by score
  finalRecommendation?: {
    selectedProblemId: string;
    totalScore: number;
    priorityRanking: number;
    status: 'recommended' | 'alternate' | 'under_review';
  };
}

export type AttendanceStatus = 'present' | 'absent' | 'leave';
export type DiscussionPointStatus = 'open' | 'in_progress' | 'completed' | 'hold';
export type MeetingStatus = 'planned' | 'completed' | 'delayed' | 'missed';
export type MeetingFrequency = 'weekly' | 'bi_monthly';
export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

export interface MemberAttendance {
  empId: string;
  memberName: string;
  attendanceStatus: AttendanceStatus;
}

export interface DiscussionPoint {
  id: string;
  point: string;
  responsiblePerson: string;
  targetDate: string;
  status: DiscussionPointStatus;
  remarks: string;
}

export interface GeneratedMeeting {
  id: string;
  plannedDate: string;
  plannedDay: DayOfWeek;
  actualDate: string;
  actualDay: string;
  status: MeetingStatus;
  attendance: MemberAttendance[];
  discussionPoints: DiscussionPoint[];
  minutesSummary: string;
}

export interface MeetingPlan {
  id: string;
  teamId: string;
  teamName: string;
  startDate: string;
  endDate: string;
  frequency: MeetingFrequency;
  fixedMeetingDay: DayOfWeek;
  biMonthlyWeek1Day?: DayOfWeek;
  biMonthlyWeek2Day?: DayOfWeek;
  generatedMeetings: GeneratedMeeting[];
  createdAt: string;
}

export interface DashboardStats {
  totalTeams: number;
  activeProjects: number;
  overdueActions: number;
  pendingApprovals: number;
  completedProjects: number;
  totalSavings: number;
}

export interface MeetingSchedule {
  id: string;
  title: string;
  description?: string;
  dayOfWeek: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';
  startTime: string;
  endTime: string;
  teamIds: string[];
  createdBy: string;
  createdByName: string;
  createdAt: string;
  isRecurring: boolean;
  recurrencePattern?: 'weekly' | 'biweekly' | 'monthly';
  recurrenceStartDate?: string;
  recurrenceEndDate?: string;
  status: 'active' | 'paused' | 'completed';
  location?: string;
  meetingType: 'standup' | 'review' | 'planning' | 'retrospective' | 'general';
}

export interface MeetingAssignment {
  id: string;
  scheduleId: string;
  teamId: string;
  teamName: string;
  assignedAt: string;
  assignedBy: string;
  notes?: string;
}

export interface ThemeEvaluationCriteria {
  id: string;
  category: 'necessity_impact' | 'circle_capability';
  name: string;
  description: string;
}

export interface ThemeEvaluationRow {
  id: string;
  srNo: number;
  themeName: string;
  effects: string;
  urgency: string;
  extentOfProblems: string;
  futureOutlook: string;
  hoshinAlignment: string;
  participationByAll: string;
  activityPeriod: string;
  actualCapability: string;
  overallEvaluation: string;
  totalScore: number;
  status: 'recommended' | 'alternate' | 'under_review';
}

export type RecurrencePattern = 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type MeetingTimeSlot = 'morning' | 'afternoon' | 'evening';

export interface TimeSlot {
  id: string;
  startTime: string; // HH:mm format
  endTime: string;   // HH:mm format
  label: string;
}

export interface TeamMeetingAssignment {
  teamId: string;
  teamName: string;
  department: string;
  timeSlotId: string;
  color: string;
}

export interface RecurringMeetingPlan {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  recurrencePattern: RecurrencePattern;
  selectedDays: DayOfWeek[]; // For weekly/biweekly patterns
  dayOfMonth?: number; // For monthly patterns
  timeSlots: TimeSlot[];
  teamAssignments: TeamMeetingAssignment[];
  createdBy: string;
  createdAt: string;
  isActive: boolean;
}

export interface MeetingConflict {
  teamId: string;
  teamName: string;
  date: string;
  timeSlotId: string;
  conflictingPlanIds: string[];
  conflictingPlanNames: string[];
}

export interface CalendarDay {
  date: string;
  dayOfWeek: DayOfWeek;
  isWeekend: boolean;
  meetings: {
    planId: string;
    planName: string;
    teams: TeamMeetingAssignment[];
    timeSlots: TimeSlot[];
  }[];
  hasConflicts: boolean;
}

export interface MeetingScheduleView {
  viewType: 'calendar' | 'timeline' | 'list';
  startDate: string;
  endDate: string;
  selectedTeams: string[];
  selectedPlans: string[];
}

export interface ActivityStep {
  id: string;
  order: number;
  name: string;
  description: string;
  isDefault: boolean;
  isActive: boolean;
  linkedToWorkflow?: boolean;
  workflowKey?: string;   // stable slug that maps this step to its QCC Workflow component
  icon?: string;          // lucide icon name shown in the workflow step nav
  createdAt: string;
  updatedAt: string;
}
