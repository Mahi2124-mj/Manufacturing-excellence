import type { User, Team, TeamMember, QCCProject, ActionItem, MeetingMinute, Notification, ApprovalRequest, Department, QCCCycleConfig, SubDepartment, TeamChangeRequest, EditHistoryEntry, ProblemEvaluation, EvaluationSymbol, MeetingPlan, GeneratedMeeting, MemberAttendance, DiscussionPoint, TimeSlot, RecurringMeetingPlan, MeetingSchedule, MeetingAssignment, QCCActivity, ActivityAuditEntry, ActivityStep, ActivityPlanEntry, ActivityPlanConfig } from '../types';

export const DEPARTMENTS = [
  'Manufacturing', 'Quality Assurance', 'Engineering', 'Logistics',
  'R&D', 'Finance', 'HR', 'IT', 'Sales', 'Maintenance',
  // Newly added departments (no duplicates)
  'E&D', 'Store', 'Dojo & Fabrication', 'Dispatch', 'PQA', 'SQA',
];

// Sub-departments shown in the Team Registration dropdown, dependent on the
// selected department. A department not listed here has no sub-departments.
export const SUB_DEPARTMENTS: Record<string, string[]> = {
  'Maintenance': ['Tool Room', 'DX'],
  'Manufacturing': ['Press Shop', 'Seat Slider', 'Loop Handle', 'Sub Assy', 'Recliner', 'Thin Recliner'],
  'Quality Assurance': ['RQC', 'CQA'],
};

export const mockSubDepartments: SubDepartment[] = [
  // Manufacturing sub-departments
  { id: 'sd-1', name: 'CNC Shop', parentId: 'Manufacturing', level: 'sub_department', isActive: true },
  { id: 'sd-2', name: 'Assembly Shop', parentId: 'Manufacturing', level: 'sub_department', isActive: true },
  { id: 'sd-3', name: 'Welding Shop', parentId: 'Manufacturing', level: 'sub_department', isActive: true },
  { id: 'sd-4', name: 'Paint Shop', parentId: 'Manufacturing', level: 'sub_department', isActive: true },
  // Manufacturing > CNC Shop lines
  { id: 'ln-1', name: 'Line A - Turning', parentId: 'sd-1', level: 'line', isActive: true },
  { id: 'ln-2', name: 'Line B - Milling', parentId: 'sd-1', level: 'line', isActive: true },
  { id: 'ln-3', name: 'Line C - Drilling', parentId: 'sd-1', level: 'line', isActive: true },
  // Manufacturing > Assembly Shop lines
  { id: 'ln-4', name: 'Line 1 - Engine Assembly', parentId: 'sd-2', level: 'line', isActive: true },
  { id: 'ln-5', name: 'Line 2 - Chassis Assembly', parentId: 'sd-2', level: 'line', isActive: true },
  // Manufacturing > Welding Shop lines
  { id: 'ln-6', name: 'MIG Welding', parentId: 'sd-3', level: 'line', isActive: true },
  { id: 'ln-7', name: 'TIG Welding', parentId: 'sd-3', level: 'line', isActive: true },
  // QA sub-departments
  { id: 'sd-5', name: 'Incoming QC', parentId: 'Quality Assurance', level: 'sub_department', isActive: true },
  { id: 'sd-6', name: 'In-Process QC', parentId: 'Quality Assurance', level: 'sub_department', isActive: true },
  { id: 'sd-7', name: 'Final QC', parentId: 'Quality Assurance', level: 'sub_department', isActive: true },
  { id: 'sd-8', name: 'Calibration Lab', parentId: 'Quality Assurance', level: 'sub_department', isActive: true },
  // QA > Incoming QC lines
  { id: 'ln-8', name: 'Raw Material Inspection', parentId: 'sd-5', level: 'line', isActive: true },
  { id: 'ln-9', name: 'Component Testing', parentId: 'sd-5', level: 'line', isActive: true },
  // QA > In-Process QC lines
  { id: 'ln-10', name: 'Stage Inspection', parentId: 'sd-6', level: 'line', isActive: true },
  // Engineering sub-departments
  { id: 'sd-9', name: 'Design', parentId: 'Engineering', level: 'sub_department', isActive: true },
  { id: 'sd-10', name: 'Process Engineering', parentId: 'Engineering', level: 'sub_department', isActive: true },
  { id: 'sd-11', name: 'Maintenance', parentId: 'Engineering', level: 'sub_department', isActive: true },
  { id: 'ln-11', name: 'CAD/CAM', parentId: 'sd-9', level: 'line', isActive: true },
  { id: 'ln-12', name: 'Prototyping', parentId: 'sd-9', level: 'line', isActive: true },
  // Logistics sub-departments
  { id: 'sd-12', name: 'Warehouse', parentId: 'Logistics', level: 'sub_department', isActive: true },
  { id: 'sd-13', name: 'Dispatch', parentId: 'Logistics', level: 'sub_department', isActive: true },
  { id: 'sd-14', name: 'Transport', parentId: 'Logistics', level: 'sub_department', isActive: true },
  { id: 'ln-13', name: 'Inbound', parentId: 'sd-12', level: 'line', isActive: true },
  { id: 'ln-14', name: 'Outbound', parentId: 'sd-12', level: 'line', isActive: true },
  // R&D sub-departments
  { id: 'sd-15', name: 'Product Development', parentId: 'R&D', level: 'sub_department', isActive: true },
  { id: 'sd-16', name: 'Testing Lab', parentId: 'R&D', level: 'sub_department', isActive: true },
];

export const mockUsers: User[] = [
  { id: 'u1', name: 'Rajesh Kumar', email: 'admin@qcc.com', role: 'admin', department: 'IT', isActive: true, joinedAt: '2024-01-15' },
  { id: 'u2', name: 'Priya Sharma', email: 'priya@qcc.com', role: 'leader', department: 'Manufacturing', isActive: true, joinedAt: '2024-02-01' },
  { id: 'u3', name: 'Amit Patel', email: 'amit@qcc.com', role: 'facilitator', department: 'Quality Assurance', isActive: true, joinedAt: '2024-02-10' },
  { id: 'u4', name: 'Sneha Reddy', email: 'sneha@qcc.com', role: 'coordinator', department: 'Engineering', isActive: true, joinedAt: '2024-03-01' },
  { id: 'u5', name: 'Vikram Singh', email: 'vikram@qcc.com', role: 'dept_head', department: 'Manufacturing', isActive: true, joinedAt: '2024-01-20' },
  { id: 'u6', name: 'Anita Desai', email: 'anita@qcc.com', role: 'member', department: 'Manufacturing', isActive: true, joinedAt: '2024-03-15' },
  { id: 'u7', name: 'Karthik Nair', email: 'karthik@qcc.com', role: 'member', department: 'Manufacturing', isActive: true, joinedAt: '2024-03-15' },
  { id: 'u8', name: 'Meera Joshi', email: 'meera@qcc.com', role: 'leader', department: 'Quality Assurance', isActive: true, joinedAt: '2024-02-05' },
  { id: 'u9', name: 'Suresh Gupta', email: 'suresh@qcc.com', role: 'member', department: 'Engineering', isActive: true, joinedAt: '2024-04-01' },
  { id: 'u10', name: 'Deepa Menon', email: 'deepa@qcc.com', role: 'dept_head', department: 'Quality Assurance', isActive: true, joinedAt: '2024-01-25' },
  { id: 'u11', name: 'Rahul Verma', email: 'rahul@qcc.com', role: 'member', department: 'Logistics', isActive: true, joinedAt: '2024-04-10' },
  { id: 'u12', name: 'Neha Kapoor', email: 'neha@qcc.com', role: 'facilitator', department: 'R&D', isActive: true, joinedAt: '2024-03-20' },
];

export const mockTeamMembers: TeamMember[] = [
  { memberId: 'TM-001', teamId: 'QCC-MFG-001', memberName: 'Anita Desai', employeeId: 'EMP-106', department: 'Manufacturing', isActive: true },
  { memberId: 'TM-002', teamId: 'QCC-MFG-001', memberName: 'Karthik Nair', employeeId: 'EMP-107', department: 'Manufacturing', isActive: true },
  { memberId: 'TM-003', teamId: 'QCC-MFG-001', memberName: 'Rajan Iyer', employeeId: 'EMP-113', department: 'Manufacturing', isActive: true },
  { memberId: 'TM-004', teamId: 'QCC-QA-002', memberName: 'Suresh Gupta', employeeId: 'EMP-109', department: 'Quality Assurance', isActive: true },
  { memberId: 'TM-005', teamId: 'QCC-QA-002', memberName: 'Pooja Saxena', employeeId: 'EMP-114', department: 'Quality Assurance', isActive: true },
  { memberId: 'TM-006', teamId: 'QCC-QA-002', memberName: 'Harish Rao', employeeId: 'EMP-115', department: 'Quality Assurance', isActive: false, deactivationReason: 'Transferred to another department', deactivatedAt: '2024-06-15' },
  { memberId: 'TM-007', teamId: 'QCC-ENG-003', memberName: 'Suresh Gupta', employeeId: 'EMP-109', department: 'Engineering', isActive: true },
  { memberId: 'TM-008', teamId: 'QCC-ENG-003', memberName: 'Rahul Verma', employeeId: 'EMP-111', department: 'Logistics', isActive: true },
  { memberId: 'TM-009', teamId: 'QCC-LOG-004', memberName: 'Rahul Verma', employeeId: 'EMP-111', department: 'Logistics', isActive: true },
  { memberId: 'TM-010', teamId: 'QCC-LOG-004', memberName: 'Kavita Nair', employeeId: 'EMP-116', department: 'Logistics', isActive: true },
  { memberId: 'TM-011', teamId: 'QCC-MFG-005', memberName: 'Anita Desai', employeeId: 'EMP-106', department: 'Manufacturing', isActive: true },
  { memberId: 'TM-012', teamId: 'QCC-MFG-005', memberName: 'Deepak Joshi', employeeId: 'EMP-117', department: 'Manufacturing', isActive: true },
];

export const mockTeams: Team[] = [
  {
    id: 'QCC-MFG-001', name: 'Precision Pioneers', department: 'Manufacturing', subDepartment: 'CNC Shop',
    leaderName: 'Priya Sharma', facilitatorName: 'Amit Patel', coordinatorName: 'Sneha Reddy',
    members: mockTeamMembers.filter(m => m.teamId === 'QCC-MFG-001'),
    projectTheme: 'Reducing CNC Machine Setup Time by 40%',
    createdAt: '2024-03-01', status: 'active', currentStage: 4, projectTitle: 'Reducing CNC Machine Setup Time by 40%'
  },
  {
    id: 'QCC-QA-002', name: 'Quality Champions', department: 'Quality Assurance', subDepartment: 'In-Process QC',
    leaderName: 'Meera Joshi', facilitatorName: 'Amit Patel', coordinatorName: 'Sneha Reddy',
    members: mockTeamMembers.filter(m => m.teamId === 'QCC-QA-002'),
    projectTheme: 'Eliminating Assembly Line Defects using Six Sigma',
    createdAt: '2024-03-15', status: 'active', currentStage: 2, projectTitle: 'Eliminating Assembly Line Defects'
  },
  {
    id: 'QCC-ENG-003', name: 'Innovation Squad', department: 'Engineering', subDepartment: 'Process Engineering',
    leaderName: 'Sneha Reddy', facilitatorName: 'Neha Kapoor', coordinatorName: 'Sneha Reddy',
    members: mockTeamMembers.filter(m => m.teamId === 'QCC-ENG-003'),
    projectTheme: 'Green Energy Optimization',
    createdAt: '2024-04-01', status: 'active', currentStage: 6, projectTitle: 'Optimizing Energy Consumption in HVAC'
  },
  {
    id: 'QCC-LOG-004', name: 'Lean Logistics', department: 'Logistics', subDepartment: 'Warehouse',
    leaderName: 'Priya Sharma', facilitatorName: 'Neha Kapoor', coordinatorName: 'Sneha Reddy',
    members: mockTeamMembers.filter(m => m.teamId === 'QCC-LOG-004'),
    projectTheme: '',
    createdAt: '2024-04-10', status: 'active', currentStage: 1, projectTitle: 'Warehouse Picking Efficiency Improvement'
  },
  {
    id: 'QCC-MFG-005', name: 'Zero Defect Team', department: 'Manufacturing', subDepartment: 'Welding Shop',
    leaderName: 'Priya Sharma', facilitatorName: 'Amit Patel', coordinatorName: 'Sneha Reddy',
    members: mockTeamMembers.filter(m => m.teamId === 'QCC-MFG-005'),
    projectTheme: 'Welding Porosity Reduction',
    createdAt: '2024-05-01', status: 'inactive', currentStage: 0, projectTitle: 'Welding Porosity Reduction'
  },
];

const makeSteps = (currentStage: number) => {
  const titles = [
    'Theme Selection',
    'Grasp the Current Situation and Set a Target',
    'Create an Activity Plan',
    'Root Cause Analysis',
    'Countermeasure Study and Implementation',
    'Check the Results',
    'Standardization & Establish Control'
  ];
  return titles.map((title, i) => {
    const stepNum = i + 1;
    let status: 'draft' | 'saved' | 'submitted' | 'under_review' | 'approved' | 'rework' = 'draft';
    if (stepNum < currentStage) status = 'approved';
    else if (stepNum === currentStage) status = 'submitted';
    return {
      stepNumber: stepNum,
      title,
      description: `Complete all requirements for ${title.toLowerCase()}`,
      status,
      completedAt: stepNum < currentStage ? '2024-06-15' : undefined,
      updatedAt: '2024-07-01',
      notes: stepNum < currentStage ? 'Step completed successfully.' : '',
      attachments: []
    };
  });
};

export const mockProjects: QCCProject[] = [
  {
    id: 'PRJ-001', teamId: 'QCC-MFG-001', title: 'Reducing CNC Machine Setup Time by 40%',
    problemStatement: 'Current CNC machine setup takes 45 minutes on average, causing production delays and increased downtime.',
    department: 'Manufacturing', steps: makeSteps(4), startedAt: '2024-03-15', targetCompletion: '2024-12-31',
    status: 'in_progress', beforeImages: [], afterImages: [], savings: 250000, impactScore: 85
  },
  {
    id: 'PRJ-002', teamId: 'QCC-QA-002', title: 'Eliminating Assembly Line Defects',
    problemStatement: 'Assembly line defect rate is at 3.2%, exceeding the target of 1.5%.',
    department: 'Quality Assurance', steps: makeSteps(2), startedAt: '2024-04-01', targetCompletion: '2024-11-30',
    status: 'in_progress', beforeImages: [], afterImages: [], savings: 180000, impactScore: 72
  },
  {
    id: 'PRJ-003', teamId: 'QCC-ENG-003', title: 'Optimizing Energy Consumption in HVAC',
    problemStatement: 'HVAC system accounts for 40% of facility energy costs with significant waste during non-peak hours.',
    department: 'Engineering', steps: makeSteps(6), startedAt: '2024-04-15', targetCompletion: '2024-10-31',
    status: 'completed', beforeImages: [], afterImages: [], savings: 420000, impactScore: 94
  },
  {
    id: 'PRJ-004', teamId: 'QCC-LOG-004', title: 'Warehouse Picking Efficiency Improvement',
    problemStatement: 'Average picking time per order is 18 minutes, target is under 12 minutes.',
    department: 'Logistics', steps: makeSteps(0), startedAt: '2024-05-01', targetCompletion: '2025-01-31',
    status: 'in_progress', beforeImages: [], afterImages: [], savings: 95000, impactScore: 60
  },
];

export const mockActions: ActionItem[] = [
  { id: 'ACT-001', projectId: 'PRJ-001', title: 'Conduct time study on CNC setup process', assigneeId: 'u6', dueDate: '2024-08-15', status: 'completed', priority: 'high', createdAt: '2024-07-01' },
  { id: 'ACT-002', projectId: 'PRJ-001', title: 'Implement SMED methodology trial', assigneeId: 'u7', dueDate: '2024-09-01', status: 'in_progress', priority: 'critical', createdAt: '2024-07-15' },
  { id: 'ACT-003', projectId: 'PRJ-001', title: 'Train operators on new setup procedure', assigneeId: 'u2', dueDate: '2024-09-20', status: 'open', priority: 'medium', createdAt: '2024-08-01' },
  { id: 'ACT-004', projectId: 'PRJ-002', title: 'Map defect types using Pareto analysis', assigneeId: 'u9', dueDate: '2024-07-30', status: 'overdue', priority: 'high', createdAt: '2024-07-01' },
  { id: 'ACT-005', projectId: 'PRJ-002', title: 'Review supplier quality documentation', assigneeId: 'u8', dueDate: '2024-08-10', status: 'in_progress', priority: 'medium', createdAt: '2024-07-20' },
  { id: 'ACT-006', projectId: 'PRJ-003', title: 'Install energy monitoring sensors', assigneeId: 'u9', dueDate: '2024-08-25', status: 'completed', priority: 'high', createdAt: '2024-06-01' },
  { id: 'ACT-007', projectId: 'PRJ-004', title: 'Audit current warehouse layout', assigneeId: 'u11', dueDate: '2024-09-15', status: 'open', priority: 'medium', createdAt: '2024-08-05' },
  { id: 'ACT-008', projectId: 'PRJ-001', title: 'Document standardized setup checklist', assigneeId: 'u6', dueDate: '2024-08-20', status: 'overdue', priority: 'high', createdAt: '2024-07-10' },
];

export const mockMeetings: MeetingMinute[] = [
  {
    id: 'MTG-001', projectId: 'PRJ-001', date: '2024-07-28', attendees: ['u2', 'u6', 'u7', 'u3'],
    agenda: 'Review SMED trial results and plan next steps',
    discussion: 'SMED trial showed 30% reduction in setup time. Team discussed further improvements for tool pre-staging. Facilitator suggested video recording for analysis.',
    actionItems: ['Implement tool pre-staging area', 'Record next 5 setup cycles'], nextMeeting: '2024-08-11', createdBy: 'u2'
  },
  {
    id: 'MTG-002', projectId: 'PRJ-002', date: '2024-07-25', attendees: ['u8', 'u9', 'u3'],
    agenda: 'Pareto analysis review and root cause discussion',
    discussion: 'Top 3 defect types account for 78% of all defects. Fishbone diagram completed for solder joint defects. Need supplier input on component quality.',
    actionItems: ['Contact top 3 suppliers for quality audit', 'Complete Ishikawa diagram for defect type #2'], nextMeeting: '2024-08-08', createdBy: 'u8'
  },
  {
    id: 'MTG-003', projectId: 'PRJ-003', date: '2024-08-01', attendees: ['u4', 'u9', 'u11', 'u12'],
    agenda: 'Final review and standardization documentation',
    discussion: 'Energy savings confirmed at 35% reduction. All documentation complete. Presentation prepared for management review. Team celebrated successful completion.',
    actionItems: ['Submit final report to dept head', 'Schedule knowledge sharing session'], nextMeeting: '', createdBy: 'u4'
  },
];

export const mockNotifications: Notification[] = [
  { id: 'n1', title: 'Step Approved', message: 'Step 4 of Precision Pioneers has been approved by Dept. Head.', type: 'success', read: false, createdAt: '2024-08-02T10:30:00' },
  { id: 'n2', title: 'Action Overdue', message: 'Document standardized setup checklist is overdue by 2 days.', type: 'error', read: false, createdAt: '2024-08-02T09:00:00' },
  { id: 'n3', title: 'New Approval Request', message: 'Quality Champions submitted Step 3 for review.', type: 'warning', read: false, createdAt: '2024-08-01T16:45:00' },
  { id: 'n4', title: 'Meeting Scheduled', message: 'Team meeting for Precision Pioneers on Aug 11.', type: 'info', read: true, createdAt: '2024-08-01T14:00:00' },
  { id: 'n5', title: 'Project Completed', message: 'Innovation Squad has completed all 6 steps successfully!', type: 'success', read: true, createdAt: '2024-07-31T11:00:00' },
];

export const mockApprovals: ApprovalRequest[] = [
  { id: 'APR-001', projectId: 'PRJ-001', stepNumber: 4, requestedBy: 'u2', requestedAt: '2024-07-30', status: 'pending' },
  { id: 'APR-002', projectId: 'PRJ-002', stepNumber: 2, requestedBy: 'u8', requestedAt: '2024-08-01', status: 'pending' },
  { id: 'APR-003', projectId: 'PRJ-001', stepNumber: 3, requestedBy: 'u2', requestedAt: '2024-07-15', status: 'approved', reviewedBy: 'u5', reviewedAt: '2024-07-18', comments: 'Excellent work on solution development.' },
  { id: 'APR-004', projectId: 'PRJ-003', stepNumber: 6, requestedBy: 'u4', requestedAt: '2024-07-25', status: 'approved', reviewedBy: 'u10', reviewedAt: '2024-07-28', comments: 'Outstanding results. Approved for standardization.' },
  { id: 'APR-005', projectId: 'PRJ-002', stepNumber: 1, requestedBy: 'u8', requestedAt: '2024-06-20', status: 'rework', reviewedBy: 'u10', reviewedAt: '2024-06-23', comments: 'Need more detail on root cause analysis methodology.' },
];

export const mockDepartments: Department[] = [
  { id: 'd1', name: 'Manufacturing', headId: 'u5', teamCount: 2, activeProjects: 1, subDepartments: mockSubDepartments.filter(s => s.parentId === 'Manufacturing') },
  { id: 'd2', name: 'Quality Assurance', headId: 'u10', teamCount: 1, activeProjects: 1, subDepartments: mockSubDepartments.filter(s => s.parentId === 'Quality Assurance') },
  { id: 'd3', name: 'Engineering', headId: 'u5', teamCount: 1, activeProjects: 0, subDepartments: mockSubDepartments.filter(s => s.parentId === 'Engineering') },
  { id: 'd4', name: 'Logistics', headId: 'u5', teamCount: 1, activeProjects: 1, subDepartments: mockSubDepartments.filter(s => s.parentId === 'Logistics') },
  { id: 'd5', name: 'R&D', headId: 'u10', teamCount: 0, activeProjects: 0, subDepartments: mockSubDepartments.filter(s => s.parentId === 'R&D') },
];

export const mockChangeRequests: TeamChangeRequest[] = [
  {
    id: 'CR-001',
    teamId: 'QCC-MFG-001',
    teamName: 'Precision Pioneers',
    requestedBy: 'u2',
    requestedByName: 'Priya Sharma',
    requestedAt: '2024-07-28T10:30:00',
    status: 'pending',
    changeReason: 'Need to update the team name to better reflect our focus area after management review.',
    changes: [
      { field: 'Team Name', oldValue: 'Precision Pioneers', newValue: 'CNC Excellence Team' },
      { field: 'Sub Department', oldValue: 'CNC Shop', newValue: 'Assembly Shop' },
    ],
    snapshot: { name: 'CNC Excellence Team', subDepartment: 'Assembly Shop' },
  },
  {
    id: 'CR-002',
    teamId: 'QCC-QA-002',
    teamName: 'Quality Champions',
    requestedBy: 'u8',
    requestedByName: 'Meera Joshi',
    requestedAt: '2024-07-25T14:15:00',
    status: 'pending',
    changeReason: 'Adding new members to strengthen our root cause analysis capability.',
    changes: [
      { field: 'Members', oldValue: '3 active members', newValue: '5 active members' },
    ],
    snapshot: {},
  },
  {
    id: 'CR-003',
    teamId: 'QCC-ENG-003',
    teamName: 'Innovation Squad',
    requestedBy: 'u4',
    requestedByName: 'Sneha Reddy',
    requestedAt: '2024-07-20T09:00:00',
    status: 'approved',
    reviewedBy: 'u1',
    reviewedAt: '2024-07-22T11:30:00',
    reviewComments: 'Approved. Facilitator change is justified due to transfer.',
    changeReason: 'Facilitator transferred to another plant. Need to assign new facilitator.',
    changes: [
      { field: 'Facilitator', oldValue: 'Neha Kapoor', newValue: 'Amit Patel' },
    ],
    snapshot: { facilitatorName: 'Amit Patel' },
  },
  {
    id: 'CR-004',
    teamId: 'QCC-LOG-004',
    teamName: 'Lean Logistics',
    requestedBy: 'u2',
    requestedByName: 'Priya Sharma',
    requestedAt: '2024-07-18T16:45:00',
    status: 'rejected',
    reviewedBy: 'u5',
    reviewedAt: '2024-07-19T10:00:00',
    reviewComments: 'Department change not allowed mid-cycle. Please complete current cycle first.',
    changeReason: 'Want to move team under Engineering department for better alignment.',
    changes: [
      { field: 'Department', oldValue: 'Logistics', newValue: 'Engineering' },
    ],
    snapshot: { department: 'Engineering' },
  },
];

export const mockCycles: QCCCycleConfig[] = [
  { id: 'cyc-1', name: 'QCC Cycle 2024-25', year: 2024, startDate: '2024-04-01', endDate: '2025-03-31', maxTeams: 20, isActive: true },
  { id: 'cyc-2', name: 'QCC Cycle 2023-24', year: 2023, startDate: '2023-04-01', endDate: '2024-03-31', maxTeams: 15, isActive: false },
];

export const mockEditHistory: EditHistoryEntry[] = [
  // PRJ-001 history
  { id: 'EH-001', projectId: 'PRJ-001', stepNumber: 1, editedBy: 'u2', editedByName: 'Priya Sharma', editedByRole: 'leader', editedAt: '2024-03-15T09:00:00', action: 'created', notes: 'Team registration completed with 5 members.' },
  { id: 'EH-002', projectId: 'PRJ-001', stepNumber: 2, editedBy: 'u2', editedByName: 'Priya Sharma', editedByRole: 'leader', editedAt: '2024-03-20T14:30:00', action: 'submitted', notes: 'Problem statement finalized after team discussion.' },
  { id: 'EH-003', projectId: 'PRJ-001', stepNumber: 2, editedBy: 'u5', editedByName: 'Vikram Singh', editedByRole: 'dept_head', editedAt: '2024-03-22T11:00:00', action: 'approved', notes: 'Problem well-defined and data-backed. Approved.' },
  { id: 'EH-004', projectId: 'PRJ-001', stepNumber: 3, editedBy: 'u6', editedByName: 'Anita Desai', editedByRole: 'member', editedAt: '2024-04-01T10:15:00', action: 'field_updated', fieldChanged: 'Root Cause Analysis', oldValue: 'Machine calibration issues', newValue: 'Setup procedure inconsistency identified as root cause' },
  { id: 'EH-005', projectId: 'PRJ-001', stepNumber: 3, editedBy: 'u2', editedByName: 'Priya Sharma', editedByRole: 'leader', editedAt: '2024-04-05T16:00:00', action: 'attachment_added', notes: 'Fishbone diagram uploaded' },
  { id: 'EH-006', projectId: 'PRJ-001', stepNumber: 3, editedBy: 'u5', editedByName: 'Vikram Singh', editedByRole: 'dept_head', editedAt: '2024-04-08T09:30:00', action: 'approved', notes: 'Thorough root cause analysis. Approved.' },
  { id: 'EH-007', projectId: 'PRJ-001', stepNumber: 4, editedBy: 'u7', editedByName: 'Karthik Nair', editedByRole: 'member', editedAt: '2024-04-15T13:00:00', action: 'field_updated', fieldChanged: 'Proposed Solutions', oldValue: 'SMED approach', newValue: 'Modified SMED with digital checklist integration' },
  { id: 'EH-008', projectId: 'PRJ-001', stepNumber: 4, editedBy: 'u2', editedByName: 'Priya Sharma', editedByRole: 'leader', editedAt: '2024-04-20T15:45:00', action: 'submitted', notes: 'Solution proposal submitted for management review.' },
  { id: 'EH-009', projectId: 'PRJ-001', stepNumber: 4, editedBy: 'u5', editedByName: 'Vikram Singh', editedByRole: 'dept_head', editedAt: '2024-04-22T10:00:00', action: 'approved', notes: 'Excellent work on solution development.' },
  { id: 'EH-010', projectId: 'PRJ-001', stepNumber: 5, editedBy: 'u2', editedByName: 'Priya Sharma', editedByRole: 'leader', editedAt: '2024-05-01T09:00:00', action: 'saved', notes: 'Action plan drafted with Gantt timeline.' },
  { id: 'EH-011', projectId: 'PRJ-001', stepNumber: 5, editedBy: 'u6', editedByName: 'Anita Desai', editedByRole: 'member', editedAt: '2024-05-10T11:30:00', action: 'note_added', notes: 'Updated milestone tracking sheet with week-wise targets.' },
  { id: 'EH-012', projectId: 'PRJ-001', stepNumber: 5, editedBy: 'u2', editedByName: 'Priya Sharma', editedByRole: 'leader', editedAt: '2024-05-15T14:00:00', action: 'submitted', notes: 'Implementation plan submitted for approval.' },
  // PRJ-002 history
  { id: 'EH-013', projectId: 'PRJ-002', stepNumber: 1, editedBy: 'u8', editedByName: 'Meera Joshi', editedByRole: 'leader', editedAt: '2024-04-01T10:00:00', action: 'created', notes: 'Quality Champions team formed.' },
  { id: 'EH-014', projectId: 'PRJ-002', stepNumber: 2, editedBy: 'u8', editedByName: 'Meera Joshi', editedByRole: 'leader', editedAt: '2024-04-10T15:00:00', action: 'submitted', notes: 'Assembly line defect problem identified.' },
  { id: 'EH-015', projectId: 'PRJ-002', stepNumber: 2, editedBy: 'u10', editedByName: 'Deepa Menon', editedByRole: 'dept_head', editedAt: '2024-04-12T09:00:00', action: 'approved', notes: 'Good problem selection aligned with QA goals.' },
  { id: 'EH-016', projectId: 'PRJ-002', stepNumber: 3, editedBy: 'u8', editedByName: 'Meera Joshi', editedByRole: 'leader', editedAt: '2024-04-20T11:00:00', action: 'submitted', notes: 'Root cause analysis with Ishikawa diagram.' },
  { id: 'EH-017', projectId: 'PRJ-002', stepNumber: 3, editedBy: 'u10', editedByName: 'Deepa Menon', editedByRole: 'dept_head', editedAt: '2024-04-23T14:00:00', action: 'rework', notes: 'Need more detail on root cause analysis methodology.' },
  { id: 'EH-018', projectId: 'PRJ-002', stepNumber: 3, editedBy: 'u8', editedByName: 'Meera Joshi', editedByRole: 'leader', editedAt: '2024-05-01T10:00:00', action: 'field_updated', fieldChanged: '5-Why Analysis', oldValue: 'Incomplete', newValue: 'Added 5 levels of why-analysis for solder defects' },
  { id: 'EH-019', projectId: 'PRJ-002', stepNumber: 3, editedBy: 'u8', editedByName: 'Meera Joshi', editedByRole: 'leader', editedAt: '2024-05-05T16:00:00', action: 'submitted', notes: 'Resubmitted after incorporating feedback.' },
  // PRJ-003 history
  { id: 'EH-020', projectId: 'PRJ-003', stepNumber: 1, editedBy: 'u4', editedByName: 'Sneha Reddy', editedByRole: 'coordinator', editedAt: '2024-04-15T09:00:00', action: 'created', notes: 'Innovation Squad registered for HVAC optimization.' },
  { id: 'EH-021', projectId: 'PRJ-003', stepNumber: 7, editedBy: 'u4', editedByName: 'Sneha Reddy', editedByRole: 'coordinator', editedAt: '2024-07-25T11:00:00', action: 'submitted', notes: 'All documentation complete. Ready for final review.' },
  { id: 'EH-022', projectId: 'PRJ-003', stepNumber: 7, editedBy: 'u10', editedByName: 'Deepa Menon', editedByRole: 'dept_head', editedAt: '2024-07-28T15:00:00', action: 'approved', notes: 'Outstanding results. Approved for standardization.' },
  { id: 'EH-023', projectId: 'PRJ-003', stepNumber: 6, editedBy: 'u9', editedByName: 'Suresh Gupta', editedByRole: 'member', editedAt: '2024-07-10T10:00:00', action: 'field_updated', fieldChanged: 'Improvement %', oldValue: '28%', newValue: '35% energy reduction confirmed after 30-day monitoring' },
  // PRJ-004 history
  { id: 'EH-024', projectId: 'PRJ-004', stepNumber: 1, editedBy: 'u2', editedByName: 'Priya Sharma', editedByRole: 'leader', editedAt: '2024-05-01T09:00:00', action: 'created', notes: 'Lean Logistics team formed for warehouse improvement.' },
  { id: 'EH-025', projectId: 'PRJ-004', stepNumber: 1, editedBy: 'u2', editedByName: 'Priya Sharma', editedByRole: 'leader', editedAt: '2024-05-05T14:00:00', action: 'saved', notes: 'Team formation in progress. Awaiting member confirmations.' },
];

// Helper to convert symbols to scores
const symbolToScore = (symbol: EvaluationSymbol): number => {
  switch (symbol) {
    case '◎': return 9;
    case '○': return 3;
    case '△': return 1;
    case '×': return 0;
    default: return 0;
  }
};

export const mockProblemEvaluations: ProblemEvaluation[] = [
  {
    projectId: 'PRJ-001',
    evaluatedBy: 'u2',
    evaluatedByName: 'Priya Sharma',
    evaluatedAt: '2024-03-18T14:30:00',
    memberScorings: [
      { memberId: 'u6', memberName: 'Anita Desai', problemId: 'p1', problemName: 'CNC Setup Time Reduction', rating: 9, improvementPoints: 'High impact on production efficiency' },
      { memberId: 'u6', memberName: 'Anita Desai', problemId: 'p2', problemName: 'Tool Change Optimization', rating: 3, improvementPoints: 'Moderate impact, limited scope' },
      { memberId: 'u6', memberName: 'Anita Desai', problemId: 'p3', problemName: 'Quality Inspection Delay', rating: 9, improvementPoints: 'Critical bottleneck in workflow' },
      { memberId: 'u6', memberName: 'Anita Desai', problemId: 'p4', problemName: 'Material Handling Issues', rating: 3, improvementPoints: 'Affects downstream processes' },
      { memberId: 'u6', memberName: 'Anita Desai', problemId: 'p5', problemName: 'Machine Downtime', rating: 9, improvementPoints: 'Major cost driver' },
      { memberId: 'u7', memberName: 'Karthik Nair', problemId: 'p1', problemName: 'CNC Setup Time Reduction', rating: 9, improvementPoints: 'Directly affects OEE metrics' },
      { memberId: 'u7', memberName: 'Karthik Nair', problemId: 'p2', problemName: 'Tool Change Optimization', rating: 9, improvementPoints: 'Quick win with high ROI' },
      { memberId: 'u7', memberName: 'Karthik Nair', problemId: 'p3', problemName: 'Quality Inspection Delay', rating: 3, improvementPoints: 'Important but resource intensive' },
      { memberId: 'u7', memberName: 'Karthik Nair', problemId: 'p4', problemName: 'Material Handling Issues', rating: 1, improvementPoints: 'Low priority currently' },
      { memberId: 'u7', memberName: 'Karthik Nair', problemId: 'p5', problemName: 'Machine Downtime', rating: 9, improvementPoints: 'Aligns with strategic goals' },
    ],
    evaluationMatrix: [
      {
        problemId: 'p1',
        problemName: 'CNC Setup Time Reduction',
        effects: '◎' as EvaluationSymbol, urgency: '◎' as EvaluationSymbol, extentOfProblems: '○' as EvaluationSymbol, futureOutlook: '◎' as EvaluationSymbol, hoshinAlignment: '◎' as EvaluationSymbol,
        participationByAll: '○' as EvaluationSymbol, activityPeriod: '◎' as EvaluationSymbol, actualCapability: '◎' as EvaluationSymbol,
        totalScore: 0, overallEvaluation: 'Excellent', recommendation: 'recommended' as const
      },
      {
        problemId: 'p2',
        problemName: 'Tool Change Optimization',
        effects: '○' as EvaluationSymbol, urgency: '○' as EvaluationSymbol, extentOfProblems: '△' as EvaluationSymbol, futureOutlook: '○' as EvaluationSymbol, hoshinAlignment: '○' as EvaluationSymbol,
        participationByAll: '◎' as EvaluationSymbol, activityPeriod: '○' as EvaluationSymbol, actualCapability: '○' as EvaluationSymbol,
        totalScore: 0, overallEvaluation: 'Good', recommendation: 'alternate' as const
      },
      {
        problemId: 'p3',
        problemName: 'Quality Inspection Delay',
        effects: '◎' as EvaluationSymbol, urgency: '○' as EvaluationSymbol, extentOfProblems: '◎' as EvaluationSymbol, futureOutlook: '○' as EvaluationSymbol, hoshinAlignment: '○' as EvaluationSymbol,
        participationByAll: '△' as EvaluationSymbol, activityPeriod: '△' as EvaluationSymbol, actualCapability: '○' as EvaluationSymbol,
        totalScore: 0, overallEvaluation: 'Moderate', recommendation: 'under_review' as const
      },
      {
        problemId: 'p4',
        problemName: 'Material Handling Issues',
        effects: '△' as EvaluationSymbol, urgency: '△' as EvaluationSymbol, extentOfProblems: '△' as EvaluationSymbol, futureOutlook: '△' as EvaluationSymbol, hoshinAlignment: '△' as EvaluationSymbol,
        participationByAll: '○' as EvaluationSymbol, activityPeriod: '△' as EvaluationSymbol, actualCapability: '△' as EvaluationSymbol,
        totalScore: 0, overallEvaluation: 'Weak'
      },
      {
        problemId: 'p5',
        problemName: 'Machine Downtime',
        effects: '◎' as EvaluationSymbol, urgency: '◎' as EvaluationSymbol, extentOfProblems: '◎' as EvaluationSymbol, futureOutlook: '◎' as EvaluationSymbol, hoshinAlignment: '◎' as EvaluationSymbol,
        participationByAll: '◎' as EvaluationSymbol, activityPeriod: '○' as EvaluationSymbol, actualCapability: '◎' as EvaluationSymbol,
        totalScore: 0, overallEvaluation: 'Excellent', recommendation: 'recommended' as const
      },
    ].map(row => ({
      ...row,
      totalScore: symbolToScore(row.effects) + symbolToScore(row.urgency) + symbolToScore(row.extentOfProblems) +
                  symbolToScore(row.futureOutlook) + symbolToScore(row.hoshinAlignment) + symbolToScore(row.participationByAll) +
                  symbolToScore(row.activityPeriod) + symbolToScore(row.actualCapability)
    })),
    topProblems: ['p1', 'p5', 'p2', 'p3', 'p4'],
    finalRecommendation: {
      selectedProblemId: 'p1',
      totalScore: 63,
      priorityRanking: 1,
      status: 'recommended' as const
    }
  },
  {
    projectId: 'PRJ-002',
    evaluatedBy: 'u8',
    evaluatedByName: 'Meera Joshi',
    evaluatedAt: '2024-04-08T10:15:00',
    memberScorings: [
      { memberId: 'u9', memberName: 'Suresh Gupta', problemId: 'p1', problemName: 'Solder Joint Defects', rating: 9, improvementPoints: 'Highest defect category (45%)' },
      { memberId: 'u9', memberName: 'Suresh Gupta', problemId: 'p2', problemName: 'Component Misalignment', rating: 9, improvementPoints: 'Causes rework and delays' },
      { memberId: 'u9', memberName: 'Suresh Gupta', problemId: 'p3', problemName: 'Testing Failures', rating: 3, improvementPoints: 'Lower frequency but high impact' },
      { memberId: 'u9', memberName: 'Suresh Gupta', problemId: 'p4', problemName: 'Supplier Quality Issues', rating: 9, improvementPoints: 'Root cause of many defects' },
      { memberId: 'u9', memberName: 'Suresh Gupta', problemId: 'p5', problemName: 'Process Variation', rating: 3, improvementPoints: 'Needs statistical analysis' },
    ],
    evaluationMatrix: [
      {
        problemId: 'p1',
        problemName: 'Solder Joint Defects',
        effects: '◎' as EvaluationSymbol, urgency: '◎' as EvaluationSymbol, extentOfProblems: '◎' as EvaluationSymbol, futureOutlook: '◎' as EvaluationSymbol, hoshinAlignment: '◎' as EvaluationSymbol,
        participationByAll: '◎' as EvaluationSymbol, activityPeriod: '◎' as EvaluationSymbol, actualCapability: '○' as EvaluationSymbol,
        totalScore: 0, overallEvaluation: 'Excellent', recommendation: 'recommended' as const
      },
      {
        problemId: 'p2',
        problemName: 'Component Misalignment',
        effects: '◎' as EvaluationSymbol, urgency: '○' as EvaluationSymbol, extentOfProblems: '◎' as EvaluationSymbol, futureOutlook: '○' as EvaluationSymbol, hoshinAlignment: '◎' as EvaluationSymbol,
        participationByAll: '○' as EvaluationSymbol, activityPeriod: '○' as EvaluationSymbol, actualCapability: '◎' as EvaluationSymbol,
        totalScore: 0, overallEvaluation: 'Good', recommendation: 'alternate' as const
      },
      {
        problemId: 'p3',
        problemName: 'Testing Failures',
        effects: '○' as EvaluationSymbol, urgency: '△' as EvaluationSymbol, extentOfProblems: '△' as EvaluationSymbol, futureOutlook: '○' as EvaluationSymbol, hoshinAlignment: '○' as EvaluationSymbol,
        participationByAll: '△' as EvaluationSymbol, activityPeriod: '△' as EvaluationSymbol, actualCapability: '○' as EvaluationSymbol,
        totalScore: 0, overallEvaluation: 'Moderate'
      },
      {
        problemId: 'p4',
        problemName: 'Supplier Quality Issues',
        effects: '◎' as EvaluationSymbol, urgency: '◎' as EvaluationSymbol, extentOfProblems: '◎' as EvaluationSymbol, futureOutlook: '◎' as EvaluationSymbol, hoshinAlignment: '○' as EvaluationSymbol,
        participationByAll: '△' as EvaluationSymbol, activityPeriod: '△' as EvaluationSymbol, actualCapability: '△' as EvaluationSymbol,
        totalScore: 0, overallEvaluation: 'Good', recommendation: 'under_review' as const
      },
      {
        problemId: 'p5',
        problemName: 'Process Variation',
        effects: '○' as EvaluationSymbol, urgency: '○' as EvaluationSymbol, extentOfProblems: '○' as EvaluationSymbol, futureOutlook: '◎' as EvaluationSymbol, hoshinAlignment: '◎' as EvaluationSymbol,
        participationByAll: '○' as EvaluationSymbol, activityPeriod: '△' as EvaluationSymbol, actualCapability: '○' as EvaluationSymbol,
        totalScore: 0, overallEvaluation: 'Good'
      },
    ].map(row => ({
      ...row,
      totalScore: symbolToScore(row.effects) + symbolToScore(row.urgency) + symbolToScore(row.extentOfProblems) +
                  symbolToScore(row.futureOutlook) + symbolToScore(row.hoshinAlignment) + symbolToScore(row.participationByAll) +
                  symbolToScore(row.activityPeriod) + symbolToScore(row.actualCapability)
    })),
    topProblems: ['p1', 'p4', 'p2', 'p5', 'p3'],
    finalRecommendation: {
      selectedProblemId: 'p1',
      totalScore: 66,
      priorityRanking: 1,
      status: 'recommended' as const
    }
  }
];

export const mockMeetingPlans: MeetingPlan[] = [
  {
    id: 'MP-001',
    teamId: 'QCC-MFG-001',
    teamName: 'Precision Pioneers',
    startDate: '2024-03-01',
    endDate: '2024-06-30',
    frequency: 'weekly',
    fixedMeetingDay: 'Wednesday',
    generatedMeetings: [
      {
        id: 'MTG-001-01',
        plannedDate: '2024-03-06',
        plannedDay: 'Wednesday',
        actualDate: '2024-03-06',
        actualDay: 'Wednesday',
        status: 'completed',
        attendance: [
          { empId: 'EMP-001', memberName: 'Priya Sharma', attendanceStatus: 'present' },
          { empId: 'EMP-002', memberName: 'Anita Desai', attendanceStatus: 'present' },
          { empId: 'EMP-003', memberName: 'Karthik Nair', attendanceStatus: 'present' },
        ],
        discussionPoints: [
          {
            id: 'DP-001',
            point: 'Review current CNC setup time baseline data',
            responsiblePerson: 'Priya Sharma',
            targetDate: '2024-03-13',
            status: 'completed',
            remarks: 'Baseline established at 45 minutes average'
          },
          {
            id: 'DP-002',
            point: 'Identify top 5 setup time bottlenecks',
            responsiblePerson: 'Anita Desai',
            targetDate: '2024-03-13',
            status: 'completed',
            remarks: 'Tool change, fixture alignment, material staging identified'
          }
        ],
        minutesSummary: 'Team reviewed baseline setup time data and identified key bottlenecks. Agreed to focus on tool change and fixture alignment processes.'
      },
      {
        id: 'MTG-001-02',
        plannedDate: '2024-03-13',
        plannedDay: 'Wednesday',
        actualDate: '2024-03-13',
        actualDay: 'Wednesday',
        status: 'completed',
        attendance: [
          { empId: 'EMP-001', memberName: 'Priya Sharma', attendanceStatus: 'present' },
          { empId: 'EMP-002', memberName: 'Anita Desai', attendanceStatus: 'present' },
          { empId: 'EMP-003', memberName: 'Karthik Nair', attendanceStatus: 'absent' },
        ],
        discussionPoints: [
          {
            id: 'DP-003',
            point: 'Analyze root causes of tool change delays',
            responsiblePerson: 'Anita Desai',
            targetDate: '2024-03-20',
            status: 'completed',
            remarks: 'Fishbone diagram completed'
          }
        ],
        minutesSummary: 'Discussed tool change delays. Karthik absent due to training. Root cause analysis in progress.'
      },
      {
        id: 'MTG-001-03',
        plannedDate: '2024-03-20',
        plannedDay: 'Wednesday',
        actualDate: '2024-03-21',
        actualDay: 'Thursday',
        status: 'delayed',
        attendance: [
          { empId: 'EMP-001', memberName: 'Priya Sharma', attendanceStatus: 'present' },
          { empId: 'EMP-002', memberName: 'Anita Desai', attendanceStatus: 'present' },
          { empId: 'EMP-003', memberName: 'Karthik Nair', attendanceStatus: 'present' },
        ],
        discussionPoints: [
          {
            id: 'DP-004',
            point: 'Develop SMED implementation plan',
            responsiblePerson: 'Priya Sharma',
            targetDate: '2024-03-27',
            status: 'in_progress',
            remarks: 'Draft plan under review'
          }
        ],
        minutesSummary: 'Meeting delayed by one day due to production schedule. SMED plan development ongoing.'
      },
      {
        id: 'MTG-001-04',
        plannedDate: '2024-03-27',
        plannedDay: 'Wednesday',
        actualDate: '',
        actualDay: '',
        status: 'missed',
        attendance: [],
        discussionPoints: [],
        minutesSummary: ''
      }
    ],
    createdAt: '2024-02-28'
  },
  {
    id: 'MP-002',
    teamId: 'QCC-QA-002',
    teamName: 'Quality Champions',
    startDate: '2024-04-01',
    endDate: '2024-07-31',
    frequency: 'bi_monthly',
    fixedMeetingDay: 'Tuesday',
    biMonthlyWeek1Day: 'Tuesday',
    biMonthlyWeek2Day: 'Thursday',
    generatedMeetings: [
      {
        id: 'MTG-002-01',
        plannedDate: '2024-04-02',
        plannedDay: 'Tuesday',
        actualDate: '2024-04-02',
        actualDay: 'Tuesday',
        status: 'completed',
        attendance: [
          { empId: 'EMP-004', memberName: 'Meera Joshi', attendanceStatus: 'present' },
          { empId: 'EMP-005', memberName: 'Rajesh Kumar', attendanceStatus: 'present' },
          { empId: 'EMP-006', memberName: 'Harish Rao', attendanceStatus: 'leave' },
        ],
        discussionPoints: [
          {
            id: 'DP-005',
            point: 'Define defect categories for assembly line',
            responsiblePerson: 'Meera Joshi',
            targetDate: '2024-04-09',
            status: 'completed',
            remarks: '8 defect categories identified'
          }
        ],
        minutesSummary: 'Team kickoff meeting. Defined project scope and defect categories.'
      },
      {
        id: 'MTG-002-02',
        plannedDate: '2024-04-04',
        plannedDay: 'Thursday',
        actualDate: '2024-04-04',
        actualDay: 'Thursday',
        status: 'completed',
        attendance: [
          { empId: 'EMP-004', memberName: 'Meera Joshi', attendanceStatus: 'present' },
          { empId: 'EMP-005', memberName: 'Rajesh Kumar', attendanceStatus: 'present' },
          { empId: 'EMP-006', memberName: 'Harish Rao', attendanceStatus: 'present' },
        ],
        discussionPoints: [
          {
            id: 'DP-006',
            point: 'Collect baseline defect data for 2 weeks',
            responsiblePerson: 'Rajesh Kumar',
            targetDate: '2024-04-18',
            status: 'completed',
            remarks: 'Data collection completed, 342 defects recorded'
          }
        ],
        minutesSummary: 'Data collection plan finalized. All members assigned specific assembly stations.'
      },
      {
        id: 'MTG-002-03',
        plannedDate: '2024-04-16',
        plannedDay: 'Tuesday',
        actualDate: '2024-04-16',
        actualDay: 'Tuesday',
        status: 'completed',
        attendance: [
          { empId: 'EMP-004', memberName: 'Meera Joshi', attendanceStatus: 'present' },
          { empId: 'EMP-005', memberName: 'Rajesh Kumar', attendanceStatus: 'present' },
          { empId: 'EMP-006', memberName: 'Harish Rao', attendanceStatus: 'present' },
        ],
        discussionPoints: [
          {
            id: 'DP-007',
            point: 'Create Pareto chart of defect data',
            responsiblePerson: 'Meera Joshi',
            targetDate: '2024-04-23',
            status: 'completed',
            remarks: 'Top 3 defects account for 78% of issues'
          }
        ],
        minutesSummary: 'Pareto analysis shows solder defects, misalignment, and missing components as top issues.'
      }
    ],
    createdAt: '2024-03-28'
  }
];

// Recurring Meeting Plan Mock Data
export const mockTimeSlots: TimeSlot[] = [
  { id: 'ts-1', startTime: '09:00', endTime: '10:30', label: 'Morning Slot 1' },
  { id: 'ts-2', startTime: '11:00', endTime: '12:30', label: 'Morning Slot 2' },
  { id: 'ts-3', startTime: '14:00', endTime: '15:30', label: 'Afternoon Slot 1' },
  { id: 'ts-4', startTime: '16:00', endTime: '17:30', label: 'Afternoon Slot 2' },
  { id: 'ts-5', startTime: '18:00', endTime: '19:30', label: 'Evening Slot' },
];

export const mockRecurringMeetingPlans: RecurringMeetingPlan[] = [
  {
    id: 'rmp-1',
    name: 'Manufacturing Weekly Review',
    description: 'Weekly progress review for all manufacturing teams',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    recurrencePattern: 'weekly',
    selectedDays: ['Monday'],
    timeSlots: [mockTimeSlots[0], mockTimeSlots[1]],
    teamAssignments: [
      { teamId: 'QCC-MFG-001', teamName: 'Precision Pioneers', department: 'Manufacturing', timeSlotId: 'ts-1', color: '#3b82f6' },
      { teamId: 'QCC-MFG-002', teamName: 'Quality Warriors', department: 'Manufacturing', timeSlotId: 'ts-2', color: '#10b981' },
    ],
    createdBy: 'u1',
    createdAt: '2024-01-01T10:00:00',
    isActive: true,
  },
  {
    id: 'rmp-2',
    name: 'Engineering Bi-Weekly Sync',
    description: 'Bi-weekly synchronization meeting for engineering teams',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    recurrencePattern: 'biweekly',
    selectedDays: ['Wednesday'],
    timeSlots: [mockTimeSlots[2]],
    teamAssignments: [
      { teamId: 'QCC-ENG-001', teamName: 'Innovation Squad', department: 'Engineering', timeSlotId: 'ts-3', color: '#8b5cf6' },
    ],
    createdBy: 'u1',
    createdAt: '2024-01-01T10:00:00',
    isActive: true,
  },
  {
    id: 'rmp-3',
    name: 'QA Daily Standup',
    description: 'Daily standup for quality assurance teams',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    recurrencePattern: 'daily',
    selectedDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    timeSlots: [mockTimeSlots[0]],
    teamAssignments: [
      { teamId: 'QCC-QA-001', teamName: 'Quality Champions', department: 'Quality Assurance', timeSlotId: 'ts-1', color: '#f59e0b' },
    ],
    createdBy: 'u1',
    createdAt: '2024-01-01T10:00:00',
    isActive: true,
  },
  {
    id: 'rmp-4',
    name: 'Logistics Monthly Planning',
    description: 'Monthly planning session for logistics optimization',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    recurrencePattern: 'monthly',
    selectedDays: [],
    dayOfMonth: 15,
    timeSlots: [mockTimeSlots[3], mockTimeSlots[4]],
    teamAssignments: [
      { teamId: 'QCC-LOG-001', teamName: 'Lean Logistics', department: 'Logistics', timeSlotId: 'ts-4', color: '#ec4899' },
      { teamId: 'QCC-LOG-002', teamName: 'Supply Chain Stars', department: 'Logistics', timeSlotId: 'ts-5', color: '#06b6d4' },
    ],
    createdBy: 'u1',
    createdAt: '2024-01-01T10:00:00',
    isActive: true,
  },
];

export const TEAM_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

export const mockMeetingSchedules: MeetingSchedule[] = [
  {
    id: 'MS-001',
    title: 'Manufacturing Weekly Standup',
    description: 'Weekly progress review for all manufacturing teams',
    dayOfWeek: 'monday',
    startTime: '09:00',
    endTime: '10:00',
    teamIds: ['QCC-MFG-001', 'QCC-MFG-002', 'QCC-MFG-003', 'QCC-MFG-004', 'QCC-MFG-005'],
    createdBy: 'u1',
    createdByName: 'Rajesh Kumar',
    createdAt: '2024-01-15T10:00:00',
    isRecurring: true,
    recurrencePattern: 'weekly',
    status: 'active',
    location: 'Conference Room A',
    meetingType: 'standup',
    recurrenceStartDate: '2024-04-01',
    recurrenceEndDate: '2025-03-31',
  },
  {
    id: 'MS-002',
    title: 'Quality Assurance Review',
    description: 'Bi-weekly quality review and audit findings discussion',
    dayOfWeek: 'tuesday',
    startTime: '14:00',
    endTime: '15:30',
    teamIds: ['QCC-QA-001', 'QCC-QA-002', 'QCC-QA-003', 'QCC-QA-004'],
    createdBy: 'u1',
    createdByName: 'Rajesh Kumar',
    createdAt: '2024-01-15T10:00:00',
    isRecurring: true,
    recurrencePattern: 'biweekly',
    status: 'active',
    location: 'QA Lab Meeting Room',
    meetingType: 'review',
    recurrenceStartDate: '2024-04-02',
    recurrenceEndDate: '2024-12-31',
  },
  {
    id: 'MS-003',
    title: 'Engineering Planning Session',
    description: 'Weekly planning and resource allocation for engineering projects',
    dayOfWeek: 'wednesday',
    startTime: '10:00',
    endTime: '11:30',
    teamIds: ['QCC-ENG-001', 'QCC-ENG-002', 'QCC-ENG-003'],
    createdBy: 'u1',
    createdByName: 'Rajesh Kumar',
    createdAt: '2024-01-15T10:00:00',
    isRecurring: true,
    recurrencePattern: 'weekly',
    status: 'active',
    location: 'Engineering Wing - Room 201',
    meetingType: 'planning',
    recurrenceStartDate: '2024-04-03',
    recurrenceEndDate: '2025-03-31',
  },
  {
    id: 'MS-004',
    title: 'Logistics Coordination',
    description: 'Daily coordination meeting for logistics and supply chain teams',
    dayOfWeek: 'thursday',
    startTime: '08:30',
    endTime: '09:15',
    teamIds: ['QCC-LOG-001', 'QCC-LOG-002'],
    createdBy: 'u2',
    createdByName: 'Priya Sharma',
    createdAt: '2024-02-01T09:00:00',
    isRecurring: true,
    recurrencePattern: 'weekly',
    status: 'active',
    location: 'Warehouse Office',
    meetingType: 'standup',
    recurrenceStartDate: '2024-05-01',
    recurrenceEndDate: '2024-10-31',
  },
  {
    id: 'MS-005',
    title: 'Cross-Department Retrospective',
    description: 'Monthly retrospective covering all active QCC projects',
    dayOfWeek: 'friday',
    startTime: '15:00',
    endTime: '16:30',
    teamIds: ['QCC-MFG-001', 'QCC-QA-001', 'QCC-ENG-001', 'QCC-LOG-001', 'QCC-MFG-002', 'QCC-QA-002'],
    createdBy: 'u1',
    createdByName: 'Rajesh Kumar',
    createdAt: '2024-01-20T14:00:00',
    isRecurring: true,
    recurrencePattern: 'monthly',
    status: 'active',
    location: 'Main Auditorium',
    meetingType: 'retrospective',
    recurrenceStartDate: '2024-04-01',
    recurrenceEndDate: '2025-03-31',
  },
  {
    id: 'MS-006',
    title: 'R&D Innovation Sync',
    description: 'Weekly sync for R&D teams to share innovations and progress',
    dayOfWeek: 'monday',
    startTime: '11:00',
    endTime: '12:00',
    teamIds: ['QCC-RND-001', 'QCC-RND-002'],
    createdBy: 'u1',
    createdByName: 'Rajesh Kumar',
    createdAt: '2024-01-25T11:00:00',
    isRecurring: true,
    recurrencePattern: 'weekly',
    status: 'active',
    location: 'Innovation Lab',
    meetingType: 'general',
  },
  {
    id: 'MS-007',
    title: 'Manufacturing Safety Review',
    description: 'Bi-weekly safety compliance and incident review',
    dayOfWeek: 'tuesday',
    startTime: '09:00',
    endTime: '10:00',
    teamIds: ['QCC-MFG-001', 'QCC-MFG-003', 'QCC-MFG-005'],
    createdBy: 'u1',
    createdByName: 'Rajesh Kumar',
    createdAt: '2024-02-05T10:00:00',
    isRecurring: true,
    recurrencePattern: 'biweekly',
    status: 'active',
    location: 'Safety Training Room',
    meetingType: 'review',
  },
  {
    id: 'MS-008',
    title: 'Saturday Knowledge Sharing Session',
    description: 'Cross-team knowledge sharing and best practices discussion',
    dayOfWeek: 'saturday',
    startTime: '10:00',
    endTime: '11:30',
    teamIds: ['QCC-MFG-001', 'QCC-QA-002', 'QCC-ENG-003'],
    createdBy: 'u1',
    createdByName: 'Rajesh Kumar',
    createdAt: '2024-03-01T10:00:00',
    isRecurring: true,
    recurrencePattern: 'weekly',
    status: 'active',
    location: 'Training Room B',
    meetingType: 'general',
  },
  {
    id: 'MS-009',
    title: 'Weekend Maintenance Planning',
    description: 'Plan upcoming week maintenance activities and resource allocation',
    dayOfWeek: 'saturday',
    startTime: '14:00',
    endTime: '15:00',
    teamIds: ['QCC-ENG-003', 'QCC-MFG-005'],
    createdBy: 'u1',
    createdByName: 'Rajesh Kumar',
    createdAt: '2024-03-10T10:00:00',
    isRecurring: true,
    recurrencePattern: 'weekly',
    status: 'active',
    location: 'Conference Room C',
    meetingType: 'planning',
  },
];

export const mockMeetingAssignments: MeetingAssignment[] = [
  { id: 'MA-001', scheduleId: 'MS-001', teamId: 'QCC-MFG-001', teamName: 'Precision Pioneers', assignedAt: '2024-01-15T10:00:00', assignedBy: 'u1' },
  { id: 'MA-002', scheduleId: 'MS-001', teamId: 'QCC-MFG-002', teamName: 'Efficiency Experts', assignedAt: '2024-01-15T10:00:00', assignedBy: 'u1' },
  { id: 'MA-003', scheduleId: 'MS-001', teamId: 'QCC-MFG-003', teamName: 'Quality Warriors', assignedAt: '2024-01-15T10:00:00', assignedBy: 'u1' },
  { id: 'MA-004', scheduleId: 'MS-001', teamId: 'QCC-MFG-004', teamName: 'Process Improvers', assignedAt: '2024-01-15T10:00:00', assignedBy: 'u1' },
  { id: 'MA-005', scheduleId: 'MS-001', teamId: 'QCC-MFG-005', teamName: 'Zero Defect Team', assignedAt: '2024-01-15T10:00:00', assignedBy: 'u1' },
  { id: 'MA-006', scheduleId: 'MS-002', teamId: 'QCC-QA-001', teamName: 'Quality Champions', assignedAt: '2024-01-15T10:00:00', assignedBy: 'u1' },
  { id: 'MA-007', scheduleId: 'MS-002', teamId: 'QCC-QA-002', teamName: 'Defect Detectives', assignedAt: '2024-01-15T10:00:00', assignedBy: 'u1' },
  { id: 'MA-008', scheduleId: 'MS-002', teamId: 'QCC-QA-003', teamName: 'Audit Aces', assignedAt: '2024-01-15T10:00:00', assignedBy: 'u1' },
  { id: 'MA-009', scheduleId: 'MS-002', teamId: 'QCC-QA-004', teamName: 'Compliance Crew', assignedAt: '2024-01-15T10:00:00', assignedBy: 'u1' },
  { id: 'MA-010', scheduleId: 'MS-003', teamId: 'QCC-ENG-001', teamName: 'Innovation Squad', assignedAt: '2024-01-15T10:00:00', assignedBy: 'u1' },
  { id: 'MA-011', scheduleId: 'MS-003', teamId: 'QCC-ENG-002', teamName: 'Tech Titans', assignedAt: '2024-01-15T10:00:00', assignedBy: 'u1' },
  { id: 'MA-012', scheduleId: 'MS-003', teamId: 'QCC-ENG-003', teamName: 'Design Thinkers', assignedAt: '2024-01-15T10:00:00', assignedBy: 'u1' },
  { id: 'MA-013', scheduleId: 'MS-004', teamId: 'QCC-LOG-001', teamName: 'Lean Logistics', assignedAt: '2024-02-01T09:00:00', assignedBy: 'u2' },
  { id: 'MA-014', scheduleId: 'MS-004', teamId: 'QCC-LOG-002', teamName: 'Supply Chain Stars', assignedAt: '2024-02-01T09:00:00', assignedBy: 'u2' },
];

// Mock QCC Activities for Step 3: Activity Plan
export const mockQCCActivities: QCCActivity[] = [
  // Project PRJ-001 Activities
  {
    id: 'ACT-001',
    projectId: 'PRJ-001',
    serialNumber: 1,
    activityName: 'Grasp Current Situation & Set Target',
    activityDescription: 'Analyze current CNC setup times and establish baseline metrics and improvement targets',
    personInCharge: 'u2',
    personInChargeName: 'Priya Sharma',
    priority: 'high',
    plannedStartDate: '2024-03-20',
    plannedEndDate: '2024-04-05',
    actualStartDate: '2024-03-20',
    actualEndDate: '2024-04-03',
    status: 'completed',
    progressPercentage: 100,
    delayDays: 0,
    remarks: 'Completed 2 days ahead of schedule',
    createdBy: 'u2',
    createdByName: 'Priya Sharma',
    createdAt: '2024-03-15T09:00:00',
    updatedBy: 'u2',
    updatedByName: 'Priya Sharma',
    updatedAt: '2024-04-03T16:00:00',
    isDefaultActivity: true
  },
  {
    id: 'ACT-002',
    projectId: 'PRJ-001',
    serialNumber: 2,
    activityName: 'Create Activity Plan',
    activityDescription: 'Develop detailed activity plan with timelines and resource allocation',
    personInCharge: 'u2',
    personInChargeName: 'Priya Sharma',
    priority: 'high',
    plannedStartDate: '2024-04-06',
    plannedEndDate: '2024-04-12',
    actualStartDate: '2024-04-06',
    actualEndDate: '2024-04-12',
    status: 'completed',
    progressPercentage: 100,
    delayDays: 0,
    remarks: 'Plan approved by facilitator',
    createdBy: 'u2',
    createdByName: 'Priya Sharma',
    createdAt: '2024-04-05T10:00:00',
    updatedBy: 'u3',
    updatedByName: 'Amit Patel',
    updatedAt: '2024-04-12T14:00:00',
    isDefaultActivity: true
  },
  {
    id: 'ACT-003',
    projectId: 'PRJ-001',
    serialNumber: 3,
    activityName: 'Root Cause Analysis',
    activityDescription: 'Conduct fishbone diagram and 5-why analysis to identify root causes',
    personInCharge: 'u6',
    personInChargeName: 'Anita Desai',
    priority: 'high',
    plannedStartDate: '2024-04-13',
    plannedEndDate: '2024-04-30',
    actualStartDate: '2024-04-13',
    actualEndDate: '2024-05-05',
    status: 'completed',
    progressPercentage: 100,
    delayDays: 5,
    remarks: 'Delayed due to additional data collection required',
    createdBy: 'u2',
    createdByName: 'Priya Sharma',
    createdAt: '2024-04-12T15:00:00',
    updatedBy: 'u6',
    updatedByName: 'Anita Desai',
    updatedAt: '2024-05-05T17:00:00',
    isDefaultActivity: true
  },
  {
    id: 'ACT-004',
    projectId: 'PRJ-001',
    serialNumber: 4,
    activityName: 'Countermeasure Study & Implementation',
    activityDescription: 'Develop and implement SMED methodology with digital checklist',
    personInCharge: 'u7',
    personInChargeName: 'Karthik Nair',
    priority: 'high',
    plannedStartDate: '2024-05-06',
    plannedEndDate: '2024-06-15',
    actualStartDate: '2024-05-08',
    actualEndDate: '2024-06-20',
    status: 'completed',
    progressPercentage: 100,
    delayDays: 5,
    remarks: 'Implementation completed with 5-day delay',
    createdBy: 'u2',
    createdByName: 'Priya Sharma',
    createdAt: '2024-05-05T09:00:00',
    updatedBy: 'u7',
    updatedByName: 'Karthik Nair',
    updatedAt: '2024-06-20T18:00:00',
    isDefaultActivity: true
  },
  {
    id: 'ACT-005',
    projectId: 'PRJ-001',
    serialNumber: 5,
    activityName: 'Check Results',
    activityDescription: 'Measure and verify improvements in setup time reduction',
    personInCharge: 'u2',
    personInChargeName: 'Priya Sharma',
    priority: 'high',
    plannedStartDate: '2024-06-21',
    plannedEndDate: '2024-07-05',
    actualStartDate: '2024-06-21',
    status: 'in_progress',
    progressPercentage: 75,
    delayDays: 0,
    remarks: 'Data collection in progress',
    createdBy: 'u2',
    createdByName: 'Priya Sharma',
    createdAt: '2024-06-20T10:00:00',
    updatedBy: 'u2',
    updatedByName: 'Priya Sharma',
    updatedAt: '2024-07-01T14:00:00',
    isDefaultActivity: true
  },
  {
    id: 'ACT-006',
    projectId: 'PRJ-001',
    serialNumber: 6,
    activityName: 'Standardization & Control',
    activityDescription: 'Document standardized procedures and establish control mechanisms',
    personInCharge: 'u6',
    personInChargeName: 'Anita Desai',
    priority: 'medium',
    plannedStartDate: '2024-07-06',
    plannedEndDate: '2024-07-20',
    status: 'planned',
    progressPercentage: 0,
    delayDays: 0,
    remarks: 'Scheduled to start after results verification',
    createdBy: 'u2',
    createdByName: 'Priya Sharma',
    createdAt: '2024-06-20T10:00:00',
    isDefaultActivity: true
  },
  {
    id: 'ACT-007',
    projectId: 'PRJ-001',
    serialNumber: 7,
    activityName: 'Future Plan',
    activityDescription: 'Develop plan for horizontal deployment and continuous improvement',
    personInCharge: 'u2',
    personInChargeName: 'Priya Sharma',
    priority: 'medium',
    plannedStartDate: '2024-07-21',
    plannedEndDate: '2024-08-05',
    status: 'not_started',
    progressPercentage: 0,
    delayDays: 0,
    remarks: 'Final phase of the project',
    createdBy: 'u2',
    createdByName: 'Priya Sharma',
    createdAt: '2024-06-20T10:00:00',
    isDefaultActivity: true
  },
  {
    id: 'ACT-008',
    projectId: 'PRJ-001',
    serialNumber: 8,
    activityName: 'Training Operators on New Procedures',
    activityDescription: 'Conduct training sessions for all CNC operators on new setup procedures',
    personInCharge: 'u7',
    personInChargeName: 'Karthik Nair',
    priority: 'high',
    plannedStartDate: '2024-06-25',
    plannedEndDate: '2024-07-10',
    actualStartDate: '2024-06-25',
    status: 'in_progress',
    progressPercentage: 60,
    delayDays: 0,
    remarks: 'Training 60% complete, 3 batches remaining',
    createdBy: 'u2',
    createdByName: 'Priya Sharma',
    createdAt: '2024-06-20T11:00:00',
    updatedBy: 'u7',
    updatedByName: 'Karthik Nair',
    updatedAt: '2024-07-02T16:00:00'
  },
  {
    id: 'ACT-009',
    projectId: 'PRJ-001',
    serialNumber: 9,
    activityName: 'Digital Checklist App Development',
    activityDescription: 'Develop mobile app for digital checklist integration',
    personInCharge: 'u7',
    personInChargeName: 'Karthik Nair',
    priority: 'medium',
    plannedStartDate: '2024-05-15',
    plannedEndDate: '2024-06-10',
    actualStartDate: '2024-05-15',
    actualEndDate: '2024-06-15',
    status: 'completed',
    progressPercentage: 100,
    delayDays: 5,
    remarks: 'App development completed with minor delay',
    createdBy: 'u7',
    createdByName: 'Karthik Nair',
    createdAt: '2024-05-10T09:00:00',
    updatedBy: 'u7',
    updatedByName: 'Karthik Nair',
    updatedAt: '2024-06-15T17:00:00'
  },
  {
    id: 'ACT-010',
    projectId: 'PRJ-001',
    serialNumber: 10,
    activityName: 'Weekly Progress Review Meetings',
    activityDescription: 'Conduct weekly team meetings to review progress and address issues',
    personInCharge: 'u2',
    personInChargeName: 'Priya Sharma',
    priority: 'medium',
    plannedStartDate: '2024-03-25',
    plannedEndDate: '2024-08-05',
    actualStartDate: '2024-03-25',
    status: 'in_progress',
    progressPercentage: 70,
    delayDays: 0,
    remarks: 'Ongoing activity, 70% of planned meetings completed',
    createdBy: 'u2',
    createdByName: 'Priya Sharma',
    createdAt: '2024-03-20T10:00:00',
    updatedBy: 'u2',
    updatedByName: 'Priya Sharma',
    updatedAt: '2024-07-01T09:00:00'
  },
];

export const mockActivityAudit: ActivityAuditEntry[] = [
  {
    id: 'AUD-001',
    activityId: 'ACT-001',
    action: 'created',
    performedBy: 'u2',
    performedByName: 'Priya Sharma',
    performedAt: '2024-03-15T09:00:00'
  },
  {
    id: 'AUD-002',
    activityId: 'ACT-001',
    action: 'updated',
    performedBy: 'u2',
    performedByName: 'Priya Sharma',
    performedAt: '2024-04-03T16:00:00',
    changes: [
      { field: 'status', oldValue: 'in_progress', newValue: 'completed' },
      { field: 'progressPercentage', oldValue: '80', newValue: '100' }
    ]
  },
  {
    id: 'AUD-003',
    activityId: 'ACT-003',
    action: 'updated',
    performedBy: 'u6',
    performedByName: 'Anita Desai',
    performedAt: '2024-05-05T17:00:00',
    changes: [
      { field: 'actualEndDate', oldValue: '2024-04-30', newValue: '2024-05-05' },
      { field: 'delayDays', oldValue: '0', newValue: '5' }
    ]
  },
  {
    id: 'AUD-004',
    activityId: 'ACT-005',
    action: 'status_changed',
    performedBy: 'u2',
    performedByName: 'Priya Sharma',
    performedAt: '2024-06-21T10:00:00',
    changes: [
      { field: 'status', oldValue: 'planned', newValue: 'in_progress' }
    ]
  }
];

export const mockActivitySteps: ActivityStep[] = [
  {
    id: 'step-1',
    order: 1,
    name: 'Theme Selection',
    description: 'Identify and select the quality improvement theme based on data analysis and team consensus',
    isDefault: true,
    isActive: true,
    linkedToWorkflow: true,
    workflowKey: 'theme',
    icon: 'Lightbulb',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'step-2',
    order: 2,
    name: 'Grasp the Current Situation and Set a Target',
    description: 'Analyze the current state, collect baseline data, and establish measurable improvement targets',
    isDefault: true,
    isActive: true,
    linkedToWorkflow: true,
    workflowKey: 'current-target',
    icon: 'Target',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'step-3',
    order: 3,
    name: 'Create an Activity Plan',
    description: 'Develop a detailed action plan with timelines, responsibilities, and resource allocation',
    isDefault: true,
    isActive: true,
    linkedToWorkflow: true,
    workflowKey: 'activity-plan',
    icon: 'Calendar',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'step-4',
    order: 4,
    name: 'Root Cause Analysis',
    description: 'Identify and analyze root causes using quality tools like fishbone diagrams, 5-Why analysis, and Pareto charts',
    isDefault: true,
    isActive: true,
    linkedToWorkflow: true,
    workflowKey: 'root-cause',
    icon: 'GitBranch',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'step-5',
    order: 5,
    name: 'Countermeasure Study and Implementation',
    description: 'Develop, evaluate, and implement countermeasures to address identified root causes',
    isDefault: true,
    isActive: true,
    linkedToWorkflow: true,
    workflowKey: 'countermeasure',
    icon: 'Rocket',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'step-6',
    order: 6,
    name: 'Check the Results',
    description: 'Verify the effectiveness of implemented countermeasures through data collection and statistical analysis',
    isDefault: true,
    isActive: true,
    linkedToWorkflow: true,
    workflowKey: 'results',
    icon: 'CheckCircle',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'step-7',
    order: 7,
    name: 'Standardization & Establish Control',
    description: 'Document successful practices, update procedures, and establish control mechanisms to sustain improvements',
    isDefault: true,
    isActive: true,
    linkedToWorkflow: true,
    workflowKey: 'standardization',
    icon: 'BookOpen',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'step-8',
    order: 8,
    name: 'Overall Benefits',
    description: 'Summarize the tangible and intangible benefits, savings and productivity gains achieved by the project',
    isDefault: true,
    isActive: true,
    linkedToWorkflow: true,
    workflowKey: 'benefits',
    icon: 'TrendingUp',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'step-9',
    order: 9,
    name: 'Final Project Closure',
    description: 'Advisor final approval, overall project status, final comments, lessons learned and workflow lock',
    isDefault: true,
    isActive: true,
    linkedToWorkflow: true,
    workflowKey: 'closure',
    icon: 'Flag',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
];

// Activity Plan Mock Data
export const mockActivityPlanConfigs: ActivityPlanConfig[] = [
  {
    id: 'config-prj-001',
    projectId: 'prj-001',
    isSubmitted: true,
    isApproved: true,
    submittedBy: 'u2',
    submittedAt: '2024-02-15T10:00:00Z',
    approvedBy: 'u1',
    approvedAt: '2024-02-16T14:30:00Z',
    lastUpdatedBy: 'u2',
    lastUpdatedAt: '2024-03-10T09:15:00Z',
  },
  {
    id: 'config-prj-002',
    projectId: 'prj-002',
    isSubmitted: true,
    isApproved: false,
    submittedBy: 'u8',
    submittedAt: '2024-03-01T11:00:00Z',
    lastUpdatedBy: 'u8',
    lastUpdatedAt: '2024-03-05T16:20:00Z',
  },
  {
    id: 'config-prj-003',
    projectId: 'prj-003',
    isSubmitted: false,
    isApproved: false,
    lastUpdatedBy: 'u4',
    lastUpdatedAt: '2024-03-08T13:45:00Z',
  },
  {
    id: 'config-prj-004',
    projectId: 'prj-004',
    isSubmitted: true,
    isApproved: true,
    submittedBy: 'u2',
    submittedAt: '2024-01-20T09:00:00Z',
    approvedBy: 'u5',
    approvedAt: '2024-01-21T10:00:00Z',
    lastUpdatedBy: 'u2',
    lastUpdatedAt: '2024-02-15T11:30:00Z',
  },
];

export const mockActivityPlanEntries: ActivityPlanEntry[] = [
  // Project 1 - Approved plan with mixed statuses
  {
    id: 'entry-001',
    projectId: 'prj-001',
    activityStepId: 'step-1',
    activityName: 'Theme Selection',
    pic: 'u6',
    plannedStart: '2024-02-01',
    plannedEnd: '2024-02-05',
    actualStart: '2024-02-01',
    actualEnd: '2024-02-04',
    status: 'completed',
    remarks: 'Completed ahead of schedule',
    isApproved: true,
    approvedBy: 'u1',
    approvedAt: '2024-02-16T14:30:00Z',
    createdBy: 'u2',
    createdAt: '2024-02-01T09:00:00Z',
    updatedBy: 'u6',
    updatedAt: '2024-02-04T17:00:00Z',
  },
  {
    id: 'entry-002',
    projectId: 'prj-001',
    activityStepId: 'step-2',
    activityName: 'Grasp the Current Situation and Set a Target',
    pic: 'u7',
    plannedStart: '2024-02-06',
    plannedEnd: '2024-02-15',
    actualStart: '2024-02-06',
    actualEnd: '2024-02-14',
    status: 'completed',
    remarks: 'Data collection completed successfully',
    isApproved: true,
    approvedBy: 'u1',
    approvedAt: '2024-02-16T14:30:00Z',
    createdBy: 'u2',
    createdAt: '2024-02-01T09:00:00Z',
    updatedBy: 'u7',
    updatedAt: '2024-02-14T16:30:00Z',
  },
  {
    id: 'entry-003',
    projectId: 'prj-001',
    activityStepId: 'step-3',
    activityName: 'Create an Activity Plan',
    pic: 'u2',
    plannedStart: '2024-02-16',
    plannedEnd: '2024-02-20',
    actualStart: '2024-02-16',
    actualEnd: '2024-02-19',
    status: 'completed',
    remarks: 'Activity plan created and approved',
    isApproved: true,
    approvedBy: 'u1',
    approvedAt: '2024-02-16T14:30:00Z',
    createdBy: 'u2',
    createdAt: '2024-02-01T09:00:00Z',
    updatedBy: 'u2',
    updatedAt: '2024-02-19T15:00:00Z',
  },
  {
    id: 'entry-004',
    projectId: 'prj-001',
    activityStepId: 'step-4',
    activityName: 'Root Cause Analysis',
    pic: 'u6',
    plannedStart: '2024-02-21',
    plannedEnd: '2024-03-05',
    actualStart: '2024-02-21',
    actualEnd: '',
    status: 'in_progress',
    remarks: 'Fishbone diagram in progress',
    isApproved: true,
    approvedBy: 'u1',
    approvedAt: '2024-02-16T14:30:00Z',
    createdBy: 'u2',
    createdAt: '2024-02-01T09:00:00Z',
    updatedBy: 'u6',
    updatedAt: '2024-03-01T10:00:00Z',
  },
  {
    id: 'entry-005',
    projectId: 'prj-001',
    activityStepId: 'step-5',
    activityName: 'Countermeasure Study and Implementation',
    pic: 'u7',
    plannedStart: '2024-03-06',
    plannedEnd: '2024-03-20',
    actualStart: '',
    actualEnd: '',
    status: 'not_started',
    remarks: '',
    isApproved: true,
    approvedBy: 'u1',
    approvedAt: '2024-02-16T14:30:00Z',
    createdBy: 'u2',
    createdAt: '2024-02-01T09:00:00Z',
  },
  {
    id: 'entry-006',
    projectId: 'prj-001',
    activityStepId: 'step-6',
    activityName: 'Check the Results',
    pic: 'u2',
    plannedStart: '2024-03-21',
    plannedEnd: '2024-03-30',
    actualStart: '',
    actualEnd: '',
    status: 'not_started',
    remarks: '',
    isApproved: true,
    approvedBy: 'u1',
    approvedAt: '2024-02-16T14:30:00Z',
    createdBy: 'u2',
    createdAt: '2024-02-01T09:00:00Z',
  },
  {
    id: 'entry-007',
    projectId: 'prj-001',
    activityStepId: 'step-7',
    activityName: 'Standardization & Establish Control',
    pic: 'u6',
    plannedStart: '2024-04-01',
    plannedEnd: '2024-04-10',
    actualStart: '',
    actualEnd: '',
    status: 'not_started',
    remarks: '',
    isApproved: true,
    approvedBy: 'u1',
    approvedAt: '2024-02-16T14:30:00Z',
    createdBy: 'u2',
    createdAt: '2024-02-01T09:00:00Z',
  },
  {
    id: 'entry-008',
    projectId: 'prj-001',
    activityStepId: 'step-8',
    activityName: 'Future Plan',
    pic: 'u2',
    plannedStart: '2024-04-11',
    plannedEnd: '2024-04-15',
    actualStart: '',
    actualEnd: '',
    status: 'not_started',
    remarks: '',
    isApproved: true,
    approvedBy: 'u1',
    approvedAt: '2024-02-16T14:30:00Z',
    createdBy: 'u2',
    createdAt: '2024-02-01T09:00:00Z',
  },
  // Project 2 - Submitted but not approved
  {
    id: 'entry-009',
    projectId: 'prj-002',
    activityStepId: 'step-1',
    activityName: 'Theme Selection',
    pic: 'u9',
    plannedStart: '2024-03-01',
    plannedEnd: '2024-03-05',
    actualStart: '2024-03-01',
    actualEnd: '2024-03-06',
    status: 'completed',
    remarks: 'Completed with slight delay',
    isApproved: false,
    createdBy: 'u8',
    createdAt: '2024-03-01T09:00:00Z',
    updatedBy: 'u9',
    updatedAt: '2024-03-06T17:00:00Z',
  },
  {
    id: 'entry-010',
    projectId: 'prj-002',
    activityStepId: 'step-2',
    activityName: 'Grasp the Current Situation and Set a Target',
    pic: 'u10',
    plannedStart: '2024-03-07',
    plannedEnd: '2024-03-15',
    actualStart: '2024-03-07',
    actualEnd: '',
    status: 'in_progress',
    remarks: 'Data collection ongoing',
    isApproved: false,
    createdBy: 'u8',
    createdAt: '2024-03-01T09:00:00Z',
    updatedBy: 'u10',
    updatedAt: '2024-03-10T11:00:00Z',
  },
  {
    id: 'entry-011',
    projectId: 'prj-002',
    activityStepId: 'step-3',
    activityName: 'Create an Activity Plan',
    pic: 'u8',
    plannedStart: '2024-03-16',
    plannedEnd: '2024-03-20',
    actualStart: '',
    actualEnd: '',
    status: 'not_started',
    remarks: '',
    isApproved: false,
    createdBy: 'u8',
    createdAt: '2024-03-01T09:00:00Z',
  },
  // Project 3 - Not submitted yet (draft)
  {
    id: 'entry-012',
    projectId: 'prj-003',
    activityStepId: 'step-1',
    activityName: 'Theme Selection',
    pic: 'u4',
    plannedStart: '2024-03-10',
    plannedEnd: '2024-03-15',
    actualStart: '',
    actualEnd: '',
    status: 'not_started',
    remarks: '',
    isApproved: false,
    createdBy: 'u4',
    createdAt: '2024-03-08T13:45:00Z',
  },
  {
    id: 'entry-013',
    projectId: 'prj-003',
    activityStepId: 'step-2',
    activityName: 'Grasp the Current Situation and Set a Target',
    pic: 'u5',
    plannedStart: '2024-03-16',
    plannedEnd: '2024-03-25',
    actualStart: '',
    actualEnd: '',
    status: 'not_started',
    remarks: '',
    isApproved: false,
    createdBy: 'u4',
    createdAt: '2024-03-08T13:45:00Z',
  },
  // Project 4 - Approved with delayed activity
  {
    id: 'entry-014',
    projectId: 'prj-004',
    activityStepId: 'step-1',
    activityName: 'Theme Selection',
    pic: 'u6',
    plannedStart: '2024-01-15',
    plannedEnd: '2024-01-20',
    actualStart: '2024-01-15',
    actualEnd: '2024-01-22',
    status: 'completed',
    remarks: 'Delayed by 2 days due to team availability',
    isApproved: true,
    approvedBy: 'u5',
    approvedAt: '2024-01-21T10:00:00Z',
    createdBy: 'u2',
    createdAt: '2024-01-15T09:00:00Z',
    updatedBy: 'u6',
    updatedAt: '2024-01-22T17:00:00Z',
  },
  {
    id: 'entry-015',
    projectId: 'prj-004',
    activityStepId: 'step-2',
    activityName: 'Grasp the Current Situation and Set a Target',
    pic: 'u7',
    plannedStart: '2024-01-23',
    plannedEnd: '2024-02-01',
    actualStart: '2024-01-23',
    actualEnd: '2024-02-05',
    status: 'delayed',
    remarks: 'Data collection took longer than expected',
    isApproved: true,
    approvedBy: 'u5',
    approvedAt: '2024-01-21T10:00:00Z',
    createdBy: 'u2',
    createdAt: '2024-01-15T09:00:00Z',
    updatedBy: 'u7',
    updatedAt: '2024-02-05T16:00:00Z',
  },
  {
    id: 'entry-016',
    projectId: 'prj-004',
    activityStepId: 'step-3',
    activityName: 'Create an Activity Plan',
    pic: 'u2',
    plannedStart: '2024-02-06',
    plannedEnd: '2024-02-10',
    actualStart: '2024-02-06',
    actualEnd: '2024-02-09',
    status: 'completed',
    remarks: 'Completed on time',
    isApproved: true,
    approvedBy: 'u5',
    approvedAt: '2024-01-21T10:00:00Z',
    createdBy: 'u2',
    createdAt: '2024-01-15T09:00:00Z',
    updatedBy: 'u2',
    updatedAt: '2024-02-09T15:00:00Z',
  },
];

export const QCC_STEPS = [
  { number: 1, title: 'Theme Selection', icon: 'Lightbulb' },
  { number: 2, title: 'Grasp the Current Situation and Set a Target', icon: 'Target' },
  { number: 3, title: 'Create an Activity Plan', icon: 'Calendar' },
  { number: 4, title: 'Root Cause Analysis', icon: 'GitBranch' },
  { number: 5, title: 'Countermeasure Study and Implementation', icon: 'Rocket' },
  { number: 6, title: 'Check the Results', icon: 'CheckCircle' },
  { number: 7, title: 'Standardization & Establish Control', icon: 'BookOpen' },
  { number: 8, title: 'Overall Benefits', icon: 'TrendingUp' },
  { number: 9, title: 'Final Project Closure', icon: 'Flag' },
];
