// ─── Meeting Schedules = single source of truth for planned QCC meetings ─────
// Admin → Create Meeting Schedule writes here; Meeting Management reads the
// PUBLISHED entries and turns them into the respective team's meetings. Team
// details (dept, leader, members, advisor, coordinator, level) are NOT stored —
// they are fetched live from Team Registration by teamId, so there is no
// duplicate data entry. Persisted to localStorage + synced across tabs.
import {
  createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode,
} from 'react';

export type ScheduleStatus = 'draft' | 'published' | 'cancelled';

export interface MeetingScheduleEntry {
  id: string;
  teamId: string;          // link to Team Registration
  qccYear: number;
  month: number;           // 1-12
  meetingDay: string;      // 'Monday' … 'Saturday'
  week: string;            // 'W1' | 'W2' | 'W3' | 'W4' | 'Every'
  time: string;            // 'HH:mm'
  duration: number;        // minutes
  meetingType: string;     // Standup | Review | Planning | Retrospective | General
  agenda: string;
  venue: string;
  instructions: string;
  status: ScheduleStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEK_OPTIONS = ['W1', 'W2', 'W3', 'W4', 'Every'];
export const MEETING_TYPES = ['Standup', 'Review', 'Planning', 'Retrospective', 'General'];
const DOW_INDEX: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };

const STORAGE_KEY = 'qcc-meeting-schedules';

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toMin = (t: string) => { const [h, m] = (t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };

/** Concrete date for a schedule (the Nth weekday of its month); 'Every' → first occurrence. */
export function computeScheduleDate(e: Pick<MeetingScheduleEntry, 'qccYear' | 'month' | 'meetingDay' | 'week'>): string | null {
  const n = e.week === 'Every' ? 1 : Number(e.week.replace('W', '')) || 1;
  const targetDow = DOW_INDEX[e.meetingDay] ?? 1;
  const firstDow = new Date(e.qccYear, e.month - 1, 1).getDay();
  const day = 1 + ((targetDow - firstDow + 7) % 7) + (n - 1) * 7;
  const daysInMonth = new Date(e.qccYear, e.month, 0).getDate();
  if (day > daysInMonth) return null;
  return isoOf(new Date(e.qccYear, e.month - 1, day));
}

const sameSlot = (a: MeetingScheduleEntry, b: Partial<MeetingScheduleEntry>) =>
  a.qccYear === b.qccYear && a.month === b.month && a.week === b.week && a.meetingDay === b.meetingDay;
const overlaps = (a: MeetingScheduleEntry, b: Partial<MeetingScheduleEntry>) => {
  const as = toMin(a.time), ae = as + a.duration, bs = toMin(b.time || '0:0'), be = bs + (b.duration || 0);
  return as < be && bs < ae;
};

/** Returns human-readable conflict/duplicate reasons for a candidate schedule. */
export function detectConflicts(all: MeetingScheduleEntry[], candidate: Partial<MeetingScheduleEntry> & { id?: string }): string[] {
  const msgs: string[] = [];
  const others = all.filter(s => s.id !== candidate.id && s.status !== 'cancelled');
  if (others.some(s => s.teamId === candidate.teamId && sameSlot(s, candidate) && s.time === candidate.time))
    msgs.push('Duplicate meeting — this team already has a meeting at the same year, month, week, day and time.');
  others.filter(s => s.teamId === candidate.teamId && sameSlot(s, candidate) && s.time !== candidate.time && overlaps(s, candidate))
    .forEach(s => msgs.push(`Team clash — overlaps this team's ${s.meetingType} at ${s.time} on the same day.`));
  if ((candidate.venue || '').trim()) {
    others.filter(s => s.teamId !== candidate.teamId && sameSlot(s, candidate) && s.venue.trim().toLowerCase() === candidate.venue!.trim().toLowerCase() && overlaps(s, candidate))
      .forEach(s => msgs.push(`Venue conflict — "${candidate.venue}" is already booked at ${s.time} on the same day.`));
  }
  return [...new Set(msgs)];
}

function loadSchedules(): MeetingScheduleEntry[] {
  try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) return p; } } catch { /* ignore */ }
  return [];
}

interface Ctx {
  schedules: MeetingScheduleEntry[];
  publishedFor: (teamId: string) => MeetingScheduleEntry[];
  createSchedule: (data: Omit<MeetingScheduleEntry, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'publishedAt'>, publish?: boolean) => MeetingScheduleEntry;
  updateSchedule: (id: string, patch: Partial<MeetingScheduleEntry>) => void;
  publishSchedule: (id: string) => void;
  cancelSchedule: (id: string) => void;
  removeSchedule: (id: string) => void;
  conflictsFor: (candidate: Partial<MeetingScheduleEntry> & { id?: string }) => string[];
}

const C = createContext<Ctx | null>(null);

export function MeetingSchedulesProvider({ children }: { children: ReactNode }) {
  const [schedules, setSchedules] = useState<MeetingScheduleEntry[]>(loadSchedules);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) setSchedules(loadSchedules()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const commit = useCallback((updater: (prev: MeetingScheduleEntry[]) => MeetingScheduleEntry[]) => {
    setSchedules(prev => {
      const next = updater(prev);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const createSchedule: Ctx['createSchedule'] = useCallback((data, publish = false) => {
    const now = new Date().toISOString();
    const entry: MeetingScheduleEntry = {
      ...data, id: `SCH-${Date.now()}`,
      status: publish ? 'published' : 'draft',
      createdAt: now, updatedAt: now, publishedAt: publish ? now : undefined,
    };
    commit(prev => [entry, ...prev]);
    return entry;
  }, [commit]);

  const updateSchedule = useCallback((id: string, patch: Partial<MeetingScheduleEntry>) => {
    commit(prev => prev.map(s => (s.id === id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s)));
  }, [commit]);

  const publishSchedule = useCallback((id: string) => {
    commit(prev => prev.map(s => (s.id === id ? { ...s, status: 'published', publishedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : s)));
  }, [commit]);

  const cancelSchedule = useCallback((id: string) => {
    commit(prev => prev.map(s => (s.id === id ? { ...s, status: 'cancelled', updatedAt: new Date().toISOString() } : s)));
  }, [commit]);

  const removeSchedule = useCallback((id: string) => { commit(prev => prev.filter(s => s.id !== id)); }, [commit]);

  const value = useMemo<Ctx>(() => ({
    schedules,
    publishedFor: (teamId: string) => schedules.filter(s => s.teamId === teamId && s.status === 'published'),
    createSchedule, updateSchedule, publishSchedule, cancelSchedule, removeSchedule,
    conflictsFor: (candidate) => detectConflicts(schedules, candidate),
  }), [schedules, createSchedule, updateSchedule, publishSchedule, cancelSchedule, removeSchedule]);

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useMeetingSchedules(): Ctx {
  const ctx = useContext(C);
  if (!ctx) throw new Error('useMeetingSchedules must be used within a MeetingSchedulesProvider');
  return ctx;
}
