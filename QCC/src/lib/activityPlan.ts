// Shared Activity-Plan store used by BOTH the Activity Plan (Gantt) page and the
// Approvals page. Persisted in localStorage so an approval made on the Approvals
// page is reflected on the Activity Plan page (which reloads from here on mount).

export type GanttStatus = 'Not Started' | 'Planning' | 'In Progress' | 'Hold' | 'Delayed' | 'Completed';

export interface Activity {
  id: string;
  srNo: number;
  name: string;
  pic: string;
  plannedStart: string;
  plannedEnd: string;
  actualStart: string;
  actualEnd: string;      // NOT user-editable — set to the management approval date
  approved: boolean;
  approvalDate: string;   // date management approved this activity (on the Approvals page)
  approvedBy: string;
  status: GanttStatus;
  remarks: string;
}

export const ACTIVITY_STORAGE_KEY = 'qcc-gantt-activities-v3';

export const STATUS_OPTIONS: GanttStatus[] = ['Not Started', 'Planning', 'In Progress', 'Hold', 'Delayed', 'Completed'];

export const STATUS_PROGRESS: Record<GanttStatus, number> = {
  'Not Started': 0, 'Planning': 20, 'In Progress': 50, 'Hold': 60, 'Delayed': 75, 'Completed': 100,
};

export const STATUS_STYLES: Record<GanttStatus, { bg: string; text: string; dot: string }> = {
  'Not Started': { bg: 'bg-slate-100', text: 'text-slate-700', dot: 'bg-slate-400' },
  'Planning': { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
  'In Progress': { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
  'Hold': { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  'Delayed': { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' },
  'Completed': { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
};

export const DEFAULT_ACTIVITIES: Activity[] = [
  { id: 'act-1', srNo: 1, name: 'Theme Selection', pic: 'Priya Sharma', plannedStart: '2024-03-15', plannedEnd: '2024-03-25', actualStart: '2024-03-15', actualEnd: '2024-03-24', approved: true, approvalDate: '2024-03-24', approvedBy: 'Vikram Singh', status: 'Completed', remarks: 'Theme finalized after team consensus.' },
  { id: 'act-2', srNo: 2, name: 'Grasp Current Situation & Set Target', pic: 'Amit Patel', plannedStart: '2024-03-26', plannedEnd: '2024-04-10', actualStart: '2024-03-26', actualEnd: '2024-04-12', approved: true, approvalDate: '2024-04-12', approvedBy: 'Vikram Singh', status: 'Completed', remarks: 'Data collection took longer than expected.' },
  { id: 'act-3', srNo: 3, name: 'Activity Plan', pic: 'Sneha Reddy', plannedStart: '2024-04-13', plannedEnd: '2024-04-22', actualStart: '2024-04-14', actualEnd: '', approved: false, approvalDate: '', approvedBy: '', status: 'In Progress', remarks: 'Gantt chart being prepared.' },
  { id: 'act-4', srNo: 4, name: 'Root Cause Analysis', pic: 'Anita Desai', plannedStart: '2024-04-23', plannedEnd: '2024-05-12', actualStart: '', actualEnd: '', approved: false, approvalDate: '', approvedBy: '', status: 'Planning', remarks: '' },
  { id: 'act-5', srNo: 5, name: 'Countermeasure Implementation', pic: 'Karthik Nair', plannedStart: '2024-05-13', plannedEnd: '2024-06-08', actualStart: '', actualEnd: '', approved: false, approvalDate: '', approvedBy: '', status: 'Not Started', remarks: '' },
  { id: 'act-6', srNo: 6, name: 'Check Results', pic: 'Meera Joshi', plannedStart: '2024-06-09', plannedEnd: '2024-06-22', actualStart: '', actualEnd: '', approved: false, approvalDate: '', approvedBy: '', status: 'Not Started', remarks: '' },
  { id: 'act-7', srNo: 7, name: 'Standardization', pic: 'Priya Sharma', plannedStart: '2024-06-23', plannedEnd: '2024-07-06', actualStart: '', actualEnd: '', approved: false, approvalDate: '', approvedBy: '', status: 'Not Started', remarks: '' },
  { id: 'act-8', srNo: 8, name: 'Future Plan', pic: 'Amit Patel', plannedStart: '2024-07-07', plannedEnd: '2024-07-18', actualStart: '', actualEnd: '', approved: false, approvalDate: '', approvedBy: '', status: 'Not Started', remarks: '' },
];

export function loadActivities(): Activity[] {
  const saved = localStorage.getItem(ACTIVITY_STORAGE_KEY);
  if (!saved) return DEFAULT_ACTIVITIES;
  try {
    const parsed: Activity[] = JSON.parse(saved);
    return parsed.map(a => ({
      ...a,
      approved: a.approved ?? !!a.actualEnd,
      approvalDate: a.approvalDate ?? (a.actualEnd || ''),
      approvedBy: a.approvedBy ?? '',
    }));
  } catch {
    return DEFAULT_ACTIVITIES;
  }
}

export function saveActivities(activities: Activity[]): void {
  localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(activities));
}

// Apply a management approval: Actual End becomes the chosen approval date.
export function applyApproval(activities: Activity[], id: string, approvalDate: string, approvedBy: string): Activity[] {
  return activities.map(a => {
    if (a.id !== id) return a;
    const late = !!a.plannedEnd && approvalDate > a.plannedEnd;
    return {
      ...a,
      approved: true,
      approvalDate,
      approvedBy,
      actualEnd: approvalDate,
      status: late ? 'Delayed' : 'Completed',
    };
  });
}

export function revokeApproval(activities: Activity[], id: string): Activity[] {
  return activities.map(a => (
    a.id === id
      ? { ...a, approved: false, approvalDate: '', approvedBy: '', actualEnd: '', status: a.actualStart ? 'In Progress' : 'Not Started' }
      : a
  ));
}

// ── date helpers shared by both pages ──
export const formatDate = (dateStr: string): string => {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  return `${day}-${month}-${d.getFullYear()}`;
};

export const daysBetween = (start: string, end: string): number => {
  if (!start || !end) return 0;
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  return Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
};

export const calculateDelay = (a: Activity): number => {
  if (!a.actualEnd || !a.plannedEnd) return 0;
  const d = daysBetween(a.plannedEnd, a.actualEnd);
  return d > 0 ? d : 0;
};

/* ────────────────────────────────────────────────────────────────────────────
 * QCC Workflow (Step 3) activity-plan entries.
 * These live per project under `gantt-<projectId>` and use the app's
 * ActivityPlanEntry shape. Their Actual End follows the same rule as above:
 * it is NOT user-editable — management stamps it when approving.
 * ──────────────────────────────────────────────────────────────────────────── */
import type { ActivityPlanEntry } from '../types';

export const workflowKey = (projectId: string) => `gantt-${projectId}`;

export function loadWorkflowEntries(projectId: string): ActivityPlanEntry[] {
  const raw = localStorage.getItem(workflowKey(projectId));
  if (!raw) return [];
  try {
    const parsed: ActivityPlanEntry[] = JSON.parse(raw);
    // Legacy rows that already carry an actualEnd count as approved.
    return parsed.map(e => ({ ...e, isApproved: e.isApproved ?? !!e.actualEnd }));
  } catch {
    return [];
  }
}

export function saveWorkflowEntries(projectId: string, entries: ActivityPlanEntry[]): void {
  localStorage.setItem(workflowKey(projectId), JSON.stringify(entries));
}

/** Approving an entry stamps its Actual End with the approval date. */
export function approveWorkflowEntry(
  entries: ActivityPlanEntry[], id: string, approvalDate: string, approvedBy: string,
): ActivityPlanEntry[] {
  return entries.map(e => {
    if (e.id !== id) return e;
    const late = !!e.plannedEnd && approvalDate > e.plannedEnd;
    return {
      ...e,
      isApproved: true,
      approvedBy,
      approvedAt: approvalDate,
      actualEnd: approvalDate,
      status: late ? 'delayed' : 'completed',
    };
  });
}

export function revokeWorkflowEntry(entries: ActivityPlanEntry[], id: string): ActivityPlanEntry[] {
  return entries.map(e =>
    e.id === id
      ? { ...e, isApproved: false, approvedBy: undefined, approvedAt: undefined, actualEnd: '',
          status: e.actualStart ? 'in_progress' : 'not_started' }
      : e,
  );
}
