export interface TeamSchedule {
  id: string;
  teamId: string;
  teamName: string;
  weekStart: string; // ISO date string for Monday
  dayOfWeek: 0 | 1 | 2 | 3 | 4; // 0=Monday, 4=Friday
  timeSlot: string; // e.g., "09:00-10:00"
  meetingType: 'standup' | 'review' | 'planning' | 'retrospective';
  recurring: boolean;
  createdBy: string;
  createdAt: string;
  notes?: string;
}

export interface TimeSlot {
  id: string;
  label: string;
  start: string;
  end: string;
}

export type DayOfWeek = 0 | 1 | 2 | 3 | 4;

export const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;

export const TIME_SLOTS: TimeSlot[] = [
  { id: 'slot-1', label: '09:00 - 10:00', start: '09:00', end: '10:00' },
  { id: 'slot-2', label: '10:00 - 11:00', start: '10:00', end: '11:00' },
  { id: 'slot-3', label: '11:00 - 12:00', start: '11:00', end: '12:00' },
  { id: 'slot-4', label: '14:00 - 15:00', start: '14:00', end: '15:00' },
  { id: 'slot-5', label: '15:00 - 16:00', start: '15:00', end: '16:00' },
  { id: 'slot-6', label: '16:00 - 17:00', start: '16:00', end: '17:00' },
];

export const MEETING_TYPES = [
  { value: 'standup', label: 'Daily Standup', color: 'blue' },
  { value: 'review', label: 'Sprint Review', color: 'green' },
  { value: 'planning', label: 'Sprint Planning', color: 'purple' },
  { value: 'retrospective', label: 'Retrospective', color: 'orange' },
] as const;
