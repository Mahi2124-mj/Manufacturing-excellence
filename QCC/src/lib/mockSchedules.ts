import type { TeamSchedule } from '../types/scheduling';

// Helper to get current week's Monday
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

const currentMonday = getMonday(new Date()).toISOString().split('T')[0];

export const mockSchedules: TeamSchedule[] = [
  // Team QCC-MFG-001 (Precision Pioneers) - Scheduled on Monday
  {
    id: 'sched-001',
    teamId: 'QCC-MFG-001',
    teamName: 'Precision Pioneers',
    weekStart: currentMonday,
    dayOfWeek: 0, // Monday
    timeSlot: '09:00-10:00',
    meetingType: 'standup',
    recurring: true,
    createdBy: 'Priya Sharma',
    createdAt: '2024-01-15T10:00:00Z',
    notes: 'Weekly team sync',
  },
  
  // Team QCC-QA-002 (Quality Champions) - Scheduled on Wednesday
  {
    id: 'sched-002',
    teamId: 'QCC-QA-002',
    teamName: 'Quality Champions',
    weekStart: currentMonday,
    dayOfWeek: 2, // Wednesday
    timeSlot: '14:00-15:00',
    meetingType: 'review',
    recurring: true,
    createdBy: 'Amit Patel',
    createdAt: '2024-01-16T14:00:00Z',
    notes: 'Quality review meeting',
  },
  
  // Team QCC-ENG-003 (Innovation Squad) - Scheduled on Friday
  {
    id: 'sched-003',
    teamId: 'QCC-ENG-003',
    teamName: 'Innovation Squad',
    weekStart: currentMonday,
    dayOfWeek: 4, // Friday
    timeSlot: '10:00-11:00',
    meetingType: 'planning',
    recurring: true,
    createdBy: 'Sneha Reddy',
    createdAt: '2024-01-17T09:00:00Z',
    notes: 'Sprint planning session',
  },
  
  // Team QCC-LOG-004 (Lean Logistics) - Not scheduled this week
  // Team QCC-MFG-005 (Zero Defect Team) - Not scheduled this week
];
