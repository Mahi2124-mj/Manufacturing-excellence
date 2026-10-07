import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  User, CheckCircle, Clock, AlertTriangle, PlayCircle,
  PauseCircle, Save, Send, History, FileText,
  ArrowRight, Edit2, X, Check, BarChart3, Download, Printer,
  Filter, Search, ChevronDown, TrendingUp, Activity, Target,
  FileSpreadsheet, Eye, ChevronRight, Info, Plus, Trash2, RotateCcw,
  Lock, Unlock
} from 'lucide-react';
import { mockActivitySteps, mockUsers, mockTeams } from '../lib/data';
import { useAuth } from '../lib/auth';
import type { ActivityPlanEntry, ActivityPlanConfig } from '../types';
// The timeline is now rendered inline (merged with the table into one scroll area);
// only the shared types are still needed from the standalone Gantt component.
import { type GanttActivity, type GanttViewMode } from './GanttChart';

// ─── Constants ───────────────────────────────────────────
const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not Started', color: 'bg-slate-100 text-slate-700', icon: Clock, progress: 0 },
  { value: 'planning', label: 'Planning', color: 'bg-sky-100 text-sky-700', icon: FileText, progress: 20 },
  { value: 'in_progress', label: 'In Progress', color: 'bg-blue-100 text-blue-700', icon: PlayCircle, progress: 50 },
  { value: 'hold', label: 'Hold', color: 'bg-amber-100 text-amber-700', icon: PauseCircle, progress: 60 },
  { value: 'delayed', label: 'Delayed', color: 'bg-red-100 text-red-700', icon: AlertTriangle, progress: 75 },
  { value: 'completed', label: 'Completed', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle, progress: 100 },
];

const PROGRESS_MAP: Record<string, number> = {
  not_started: 0, planning: 20, in_progress: 50, hold: 60, delayed: 75, completed: 100,
};

const formatDateDisplay = (dateStr: string) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
};

const daysDiff = (a: string, b: string) => {
  if (!a || !b) return 0;
  const d1 = new Date(a + 'T00:00:00');
  const d2 = new Date(b + 'T00:00:00');
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
};

// ── Auto status from the dates (no manual dropdown) ──
//   finished late  → Delayed · finished on time → Completed
//   started, past planned end → Delayed · started → In Progress
//   not started, past planned start → Delayed · has a plan → Planning · else Not Started
type ActStatus = 'not_started' | 'planning' | 'in_progress' | 'hold' | 'delayed' | 'completed';
const autoStatus = (e: { actualStart?: string; actualEnd?: string; plannedStart?: string; plannedEnd?: string }): ActStatus => {
  const today = new Date().toISOString().split('T')[0];
  if (e.actualEnd) return (e.plannedEnd && e.actualEnd > e.plannedEnd) ? 'delayed' : 'completed';
  if (e.actualStart) return (e.plannedEnd && today > e.plannedEnd) ? 'delayed' : 'in_progress';
  if (e.plannedStart && today > e.plannedStart) return 'delayed';
  if (e.plannedStart) return 'planning';
  return 'not_started';
};

// ─── Merged table + timeline layout ──────────────────────
// A native <input type="date"> emits partly-typed years (0002, 0020, …) while editing;
// ignore implausible years and cap the rendered day-cells so the page can never freeze.
const DAY_MS = 1000 * 60 * 60 * 24;
const MAX_TIMELINE_DAYS = 1200;
const SANE_MIN_MS = new Date('1990-01-01T00:00:00').getTime();
const SANE_MAX_MS = new Date('2999-12-31T00:00:00').getTime();
const toDateStr = (ms: number) => new Date(ms).toISOString().split('T')[0];

// Data-column widths — header and body cells share these so everything lines up.
const W = { sr: 40, name: 168, pic: 104, ps: 122, pe: 122, as: 122, ae: 122, st: 92, rs: 128 };

// Field-level date-lock status: 'approved' (locked), 'pending' (has value, not approved), 'editable'.
type DateField = 'plannedStart' | 'plannedEnd' | 'actualStart' | 'actualEnd';
const DATE_FIELDS: { field: DateField; accent: 'blue' | 'emerald'; w: number; kind: 'plan' | 'actual' }[] = [
  { field: 'plannedStart', accent: 'blue', w: W.ps, kind: 'plan' },
  { field: 'plannedEnd', accent: 'blue', w: W.pe, kind: 'plan' },
  { field: 'actualStart', accent: 'emerald', w: W.as, kind: 'actual' },
  { field: 'actualEnd', accent: 'emerald', w: W.ae, kind: 'actual' },
];
const LEFT_W = Object.values(W).reduce((a, b) => a + b, 0);
const ROW_H = 56;

// ─── Default Activities ──────────────────────────────────
const DEFAULT_ACTIVITIES = [
  { name: 'Theme Selection', desc: 'Select and finalize the QCC theme' },
  { name: 'Grasp Current Situation & Set Target', desc: 'Understand current status and define targets' },
  { name: 'Activity Plan', desc: 'Create detailed activity schedule' },
  { name: 'Root Cause Analysis', desc: 'Identify root causes using quality tools' },
  { name: 'Countermeasure Implementation', desc: 'Implement solutions and countermeasures' },
  { name: 'Check Results', desc: 'Verify results against targets' },
  { name: 'Standardization', desc: 'Standardize successful measures' },
  { name: 'Future Plan', desc: 'Plan next steps and improvements' },
];

// ─── Props ───────────────────────────────────────────────
interface ActivityPlanProps {
  projectId: string;
  projectName: string;
  teamId: string;
  userRole: string;
  stepStatus: string;
}

// ─── Component ───────────────────────────────────────────
export default function ActivityPlan({ projectId, projectName, teamId, userRole, stepStatus }: ActivityPlanProps) {
  const { user } = useAuth();
  const userId = user?.id || 'unknown';

  // ── State ──
  const [entries, setEntries] = useState<ActivityPlanEntry[]>(() => {
    const saved = localStorage.getItem(`gantt-${projectId}`);
    if (saved) {
      try {
        const parsed: ActivityPlanEntry[] = JSON.parse(saved);
        // Legacy rows that already carry an actualEnd count as approved.
        return parsed.map(e => ({ ...e, isApproved: e.isApproved ?? !!e.actualEnd }));
      } catch { /* fall through to defaults */ }
    }
    return generateDefaultEntries(projectId, teamId);
  });

  const [config, setConfig] = useState<ActivityPlanConfig>({
    id: `config-${projectId}`,
    projectId,
    isSubmitted: false,
    isApproved: false,
    lastUpdatedBy: userId,
    lastUpdatedAt: new Date().toISOString(),
  });

  const [viewMode, setViewMode] = useState<GanttViewMode>('week');
  const [highlightedRow, setHighlightedRow] = useState<string | null>(null);
  const [selectedBar, setSelectedBar] = useState<GanttActivity | null>(null);
  const [filterPIC, setFilterPIC] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editHistory, setEditHistory] = useState<{ time: string; user: string; action: string; field?: string }[]>([]);

  const tableRef = useRef<HTMLDivElement>(null);

  // ── Activity Steps ──
  const activitySteps = useMemo(() => {
    const configured = mockActivitySteps?.filter(s => s.isActive).sort((a, b) => a.order - b.order);
    if (configured && configured.length > 0) return configured;
    return DEFAULT_ACTIVITIES.map((a, i) => ({
      id: `step-${i + 1}`,
      order: i + 1,
      name: a.name,
      description: a.desc,
      isDefault: true,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  // ── Team Members ──
  const teamMembers = useMemo(() => {
    const team = mockTeams.find(t => t.id === teamId);
    if (!team) return [];
    const members = [{ name: team.leaderName, role: 'Leader' }];
    if (team.facilitatorName) members.push({ name: team.facilitatorName, role: 'Facilitator' });
    if (team.coordinatorName) members.push({ name: team.coordinatorName, role: 'Coordinator' });
    team.members.filter(m => m.isActive).forEach(m => members.push({ name: m.memberName, role: 'Member' }));
    return members;
  }, [teamId]);

  // ── Auto-save to localStorage ──
  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem(`gantt-${projectId}`, JSON.stringify(entries));
    }, 1000);
    return () => clearTimeout(timer);
  }, [entries, projectId]);

  // ── Delay detection ──
  // Same rule as the standalone Activity Plan page: a delay only exists once management
  // has approved the activity (which stamps the Actual End). Until then there is nothing
  // to measure against, so an in-progress activity is NEVER auto-marked "Delayed" — and
  // finishing ON the planned end date counts as on time.
  // The stored delayDays is deliberately NOT used as a fallback: stale values from earlier
  // edits would otherwise stick around forever.
  const updateDelays = useCallback((items: ActivityPlanEntry[]) => {
    return items.map(entry => {
      let delayDays = 0;
      if (entry.actualEnd && entry.plannedEnd) {
        const diff = daysDiff(entry.plannedEnd, entry.actualEnd);
        if (diff > 0) delayDays = diff;
      }
      // Status is derived from the dates now (no manual dropdown).
      return { ...entry, delayDays, status: autoStatus(entry) };
    });
  }, []);

  // ── Filtered entries ──
  const filteredEntries = useMemo(() => {
    let result = updateDelays(entries);
    if (filterPIC !== 'all') {
      result = result.filter(e => e.pic === filterPIC);
    }
    if (filterStatus !== 'all') {
      result = result.filter(e => e.status === filterStatus);
    }
    return result;
  }, [entries, filterPIC, filterStatus, updateDelays]);

  // ── Gantt activities ──
  const ganttActivities: GanttActivity[] = useMemo(() => {
    return filteredEntries.map((entry, i) => ({
      id: entry.id,
      serialNumber: i + 1,
      activityName: activitySteps.find(s => s.id === entry.activityStepId)?.name || entry.activityName,
      pic: entry.pic,
      plannedStart: entry.plannedStart,
      plannedEnd: entry.plannedEnd,
      actualStart: entry.actualStart,
      actualEnd: entry.actualEnd,
      status: entry.status,
      delayDays: (entry as any).delayDays || 0,
    }));
  }, [filteredEntries, activitySteps]);

  // ── Summary stats ──
  const summary = useMemo(() => {
    const derived = updateDelays(entries);
    const total = derived.length;
    const completed = derived.filter(e => e.status === 'completed').length;
    const inProgress = derived.filter(e => e.status === 'in_progress').length;
    const delayed = derived.filter(e => e.status === 'delayed').length;
    const onHold = derived.filter(e => e.status === 'hold').length;
    const notStarted = derived.filter(e => e.status === 'not_started').length;
    const planning = derived.filter(e => e.status === 'planning').length;
    const overallProgress = total > 0
      ? Math.round(derived.reduce((sum, e) => sum + (PROGRESS_MAP[e.status] || 0), 0) / total)
      : 0;
    return { total, completed, inProgress, delayed, onHold, notStarted, planning, overallProgress };
  }, [entries, updateDelays]);

  // ── Handlers ──
  const updateEntry = useCallback((id: string, field: string, value: string) => {
    setEntries(prev => {
      const updated = prev.map(e => e.id === id ? { ...e, [field]: value, updatedBy: userId, updatedAt: new Date().toISOString() } : e);
      return updateDelays(updated);
    });
    const entry = entries.find(e => e.id === id);
    const stepName = activitySteps.find(s => s.id === entry?.activityStepId)?.name || '';
    setEditHistory(prev => [...prev, {
      time: new Date().toLocaleString(),
      user: user?.name || 'Unknown',
      action: `Updated ${field}`,
      field: `${stepName} → ${field}`,
    }]);
  }, [entries, userId, user, activitySteps, updateDelays]);

  const handleDateChange = useCallback((id: string, field: string, newDate: string) => {
    updateEntry(id, field, newDate);
  }, [updateEntry]);


  // ── Export functions ──
  const exportJSON = useCallback(() => {
    const data = { projectId, entries, config, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-plan-${projectId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [projectId, entries, config]);

  const exportCSV = useCallback(() => {
    const headers = ['Sr No', 'Activity Name', 'PIC', 'Planned Start', 'Planned End', 'Actual Start', 'Actual End', 'Status', 'Delay Days', 'Duration'];
    const rows = filteredEntries.map((e, i) => {
      const stepName = activitySteps.find(s => s.id === e.activityStepId)?.name || e.activityName;
      const duration = e.plannedStart && e.plannedEnd ? daysDiff(e.plannedStart, e.plannedEnd) + 1 : '';
      return [i + 1, stepName, e.pic, e.plannedStart, e.plannedEnd, e.actualStart || '', e.actualEnd || '', e.status, (e as any).delayDays || 0, duration];
    });
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-plan-${projectId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredEntries, activitySteps, projectId]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  // ── Role permissions ──
  const canEdit = useMemo(() => {
    // Once the step is submitted for review / approved, the whole plan (actual + planned dates) is locked — no edits.
    if (stepStatus === 'submitted' || stepStatus === 'under_review' || stepStatus === 'approved') return false;
    if (userRole === 'admin' || userRole === 'dept_head') return true;
    if (userRole === 'leader' && !config.isApproved) return true;
    return false;
  }, [userRole, config.isApproved, stepStatus]);

  // ── Field-level date locking ──
  // Plan dates → Admin sets them.  Actual dates → Team Leader fills them.
  // Approve / lock / unlock → Admin only, per field.
  const isAdmin = userRole === 'admin';
  const isLeader = userRole === 'leader';
  const canEditPlan = isAdmin;
  const canEditActual = isAdmin || isLeader;
  const canApprove = isAdmin;
  const isLocked = (e: ActivityPlanEntry, f: DateField) => !!e.dateLocks?.[f];
  const toggleLock = (id: string, f: DateField) => {
    if (!isAdmin) return; // approval/unlock authority = Admin only
    setEntries(prev => prev.map(e => {
      if (e.id !== id) return e;
      const locks = { ...(e.dateLocks || {}) };
      locks[f] = !locks[f];
      return { ...e, dateLocks: locks, approvedBy: user?.name, approvedAt: new Date().toISOString(), updatedBy: userId, updatedAt: new Date().toISOString() };
    }));
    setEditHistory(prev => [...prev, { time: new Date().toLocaleString(), user: user?.name || 'Unknown', action: 'Date lock toggled', field: f }]);
  };

  // ── Timeline (rendered inside the SAME scroll area as the table) ──
  const timeline = useMemo(() => {
    const defaultRange = () => {
      const now = new Date();
      const start = new Date(now); start.setDate(start.getDate() - 30);
      const end = new Date(now); end.setDate(end.getDate() + 30);
      return { start, end, totalDays: 60 };
    };
    let minMs = Infinity, maxMs = -Infinity;
    for (const e of entries) {
      for (const d of [e.plannedStart, e.plannedEnd, e.actualStart, e.actualEnd]) {
        if (!d) continue;
        const t = new Date(d + 'T00:00:00').getTime();
        if (Number.isNaN(t) || t < SANE_MIN_MS || t > SANE_MAX_MS) continue;
        if (t < minMs) minMs = t;
        if (t > maxMs) maxMs = t;
      }
    }
    if (minMs === Infinity) return defaultRange();
    const minDate = new Date(minMs); minDate.setDate(minDate.getDate() - 5);
    const maxDate = new Date(maxMs); maxDate.setDate(maxDate.getDate() + 10);
    let totalDays = Math.ceil((maxDate.getTime() - minDate.getTime()) / DAY_MS);
    if (totalDays < 30) totalDays = 30;
    if (totalDays > MAX_TIMELINE_DAYS) {
      totalDays = MAX_TIMELINE_DAYS;
      maxDate.setTime(minDate.getTime() + MAX_TIMELINE_DAYS * DAY_MS);
    }
    return { start: minDate, end: maxDate, totalDays };
  }, [entries]);

  const cellWidth = viewMode === 'day' ? 44 : viewMode === 'week' ? 22 : 8;
  const timelineWidth = timeline.totalDays * cellWidth;

  // Bars are clamped to the visible window so a far-off date can't blow up the scroll area.
  const getBarStyle = useCallback((startDate: string, endDate: string) => {
    if (!startDate || !endDate) return { left: 0, width: 0 };
    const rawLeft = ((new Date(startDate + 'T00:00:00').getTime() - timeline.start.getTime()) / DAY_MS) * cellWidth;
    const rawRight = ((new Date(endDate + 'T00:00:00').getTime() - timeline.start.getTime()) / DAY_MS) * cellWidth;
    const left = Math.max(0, Math.min(rawLeft, timelineWidth));
    const right = Math.max(0, Math.min(rawRight, timelineWidth));
    const visible = rawRight > 0 && rawLeft < timelineWidth;
    return { left, width: visible ? Math.max(right - left, 3) : 0 };
  }, [timeline, cellWidth, timelineWidth]);

  // Green (actual start → planned end) + Red overshoot (planned end → actual end / today).
  const actualSegments = useCallback((e: ActivityPlanEntry) => {
    if (!e.actualStart) return null;
    const t = (d: string) => new Date(d + 'T00:00:00').getTime();
    const inProgress = !e.actualEnd;
    // Normalise "today" to midnight — otherwise an activity still running ON its planned
    // end date would render a sliver of red overshoot just because of the time of day.
    const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
    const clamped = Math.min(Math.max(todayMidnight.getTime(), timeline.start.getTime()), timeline.end.getTime());
    const effEnd = e.actualEnd || toDateStr(clamped);
    if (t(effEnd) <= t(e.actualStart)) {
      return { green: getBarStyle(e.actualStart, effEnd), red: null, inProgress };
    }
    const splitMs = e.plannedEnd
      ? Math.min(Math.max(t(e.plannedEnd), t(e.actualStart)), t(effEnd))
      : t(effEnd);
    const splitStr = toDateStr(splitMs);
    return {
      green: getBarStyle(e.actualStart, splitStr),
      red: t(effEnd) > splitMs ? getBarStyle(splitStr, effEnd) : null,
      inProgress,
    };
  }, [timeline, getBarStyle]);

  const todayOffset = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return ((today.getTime() - timeline.start.getTime()) / DAY_MS) * cellWidth;
  }, [timeline, cellWidth]);

  const timelineHeaders = useMemo(() => {
    const cells: { isToday: boolean; isWeekend: boolean; label: string; subLabel: string }[] = [];
    for (let i = 0; i < timeline.totalDays; i++) {
      const d = new Date(timeline.start);
      d.setDate(d.getDate() + i);
      const isToday = d.toDateString() === new Date().toDateString();
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      let label = ''; let subLabel = '';
      if (viewMode === 'day') { label = String(d.getDate()); subLabel = d.toLocaleDateString('en-US', { month: 'short' }); }
      else if (viewMode === 'week') { if (d.getDate() % 7 === 1 || i === 0) { label = String(d.getDate()); subLabel = d.toLocaleDateString('en-US', { month: 'short' }); } }
      else { if (d.getDate() === 1 || i === 0) { label = d.toLocaleDateString('en-US', { month: 'short' }); subLabel = String(d.getFullYear()); } }
      cells.push({ isToday, isWeekend, label, subLabel });
    }
    return cells;
  }, [timeline, viewMode]);

  const headCell = 'flex-shrink-0 px-2 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wide border-r border-slate-200';

  return (
    <div className="space-y-5">
      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total Activities', value: summary.total, icon: <Activity size={18} />, color: 'from-blue-500 to-blue-600', textColor: 'text-blue-600', filterVal: 'all' as string | null },
          { label: 'Completed', value: summary.completed, icon: <CheckCircle size={18} />, color: 'from-emerald-500 to-emerald-600', textColor: 'text-emerald-600', filterVal: 'completed' as string | null },
          { label: 'In Progress', value: summary.inProgress, icon: <PlayCircle size={18} />, color: 'from-sky-500 to-sky-600', textColor: 'text-sky-600', filterVal: 'in_progress' as string | null },
          { label: 'Delayed', value: summary.delayed, icon: <AlertTriangle size={18} />, color: 'from-red-500 to-red-600', textColor: 'text-red-600', filterVal: 'delayed' as string | null },
          { label: 'Overall Progress', value: `${summary.overallProgress}%`, icon: <TrendingUp size={18} />, color: 'from-violet-500 to-violet-600', textColor: 'text-violet-600', filterVal: null as string | null },
        ].map((card, i) => {
          const clickable = card.filterVal != null;
          const isActive = clickable && filterStatus === card.filterVal;
          const Comp: any = clickable ? 'button' : 'div';
          return (
          <Comp
            key={i}
            {...(clickable ? { type: 'button', onClick: () => setFilterStatus(filterStatus === card.filterVal ? 'all' : card.filterVal!) } : {})}
            className={`relative overflow-hidden bg-white rounded-xl border shadow-sm transition-all text-left w-full ${isActive ? 'border-blue-400 ring-2 ring-blue-200' : 'border-slate-200'} ${clickable ? 'hover:shadow-md hover:-translate-y-0.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-300' : ''}`}
          >
            <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${card.color}`} />
            <div className="p-3.5">
              <div className="flex items-center justify-between mb-1.5">
                <div className={`p-1.5 rounded-lg bg-gradient-to-br ${card.color} text-white`}>
                  {card.icon}
                </div>
                {i === 4 && (
                  <div className="w-10 h-10 relative">
                    <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#7c3aed" strokeWidth="3" strokeDasharray={`${summary.overallProgress}, 100`} strokeLinecap="round" />
                    </svg>
                  </div>
                )}
              </div>
              <p className={`text-xl font-bold ${card.textColor}`}>{card.value}</p>
              <p className="text-[10px] text-slate-500 font-medium">{card.label}</p>
            </div>
          </Comp>
          );
        })}
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2 bg-white rounded-xl px-4 py-3 border border-slate-200 shadow-sm">
        {/* View Mode */}
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 mr-2">
          {(['day', 'week', 'month'] as GanttViewMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                viewMode === mode ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>

        {/* Filters */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            showFilters || filterPIC !== 'all' || filterStatus !== 'all'
              ? 'bg-blue-50 text-blue-700 border border-blue-200'
              : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
          }`}
        >
          <Filter size={13} /> Filters
          {(filterPIC !== 'all' || filterStatus !== 'all') && (
            <span className="w-4 h-4 bg-blue-600 text-white rounded-full text-[9px] flex items-center justify-center">
              {(filterPIC !== 'all' ? 1 : 0) + (filterStatus !== 'all' ? 1 : 0)}
            </span>
          )}
        </button>

        <div className="flex-1" />

        {/* History */}
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <History size={13} /> History
        </button>

        {/* Export */}
        <div className="flex items-center gap-1">
          <button onClick={exportCSV} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors" title="Export Excel/CSV">
            <FileSpreadsheet size={13} /> Excel
          </button>
          <button onClick={handlePrint} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors" title="Print">
            <Printer size={13} /> Print
          </button>
        </div>
      </div>

      {/* ── Filters Panel ── */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-3 bg-blue-50/50 rounded-xl px-4 py-3 border border-blue-200 animate-[slideIn_0.2s_ease-out]">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-700">PIC:</label>
            <select
              value={filterPIC}
              onChange={e => setFilterPIC(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="all">All Members</option>
              {teamMembers.map(m => (
                <option key={m.name} value={m.name}>{m.name} ({m.role})</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-700">Status:</label>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="all">All Statuses</option>
              {STATUS_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          {(filterPIC !== 'all' || filterStatus !== 'all') && (
            <button
              onClick={() => { setFilterPIC('all'); setFilterStatus('all'); }}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* ── Edit History Panel ── */}
      {showHistory && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <History size={13} className="text-blue-600" /> Edit History
            </h3>
            <button onClick={() => setShowHistory(false)} className="p-1 rounded hover:bg-slate-200 text-slate-500">
              <X size={14} />
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {editHistory.length === 0 ? (
              <p className="px-4 py-6 text-xs text-slate-400 text-center italic">No edits recorded yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {[...editHistory].reverse().slice(0, 20).map((h, i) => (
                  <div key={i} className="px-4 py-2 flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Edit2 size={10} className="text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-700">{h.action}{h.field ? ` — ${h.field}` : ''}</p>
                      <p className="text-[10px] text-slate-400">{h.user} • {h.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Selected Bar Detail Panel ── */}
      {selectedBar && (
        <div className="bg-white rounded-xl border border-blue-200 shadow-sm overflow-hidden animate-[slideIn_0.2s_ease-out]">
          <div className="px-4 py-3 bg-blue-50 border-b border-blue-200 flex items-center justify-between">
            <h3 className="text-xs font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1.5">
              <Info size={13} /> Activity Detail
            </h3>
            <button onClick={() => setSelectedBar(null)} className="p-1 rounded hover:bg-blue-100 text-blue-600">
              <X size={14} />
            </button>
          </div>
          <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <p className="text-slate-500 mb-0.5">Activity</p>
              <p className="font-semibold text-slate-800">{selectedBar.activityName}</p>
            </div>
            <div>
              <p className="text-slate-500 mb-0.5">PIC</p>
              <p className="font-semibold text-slate-800">{selectedBar.pic || '—'}</p>
            </div>
            <div>
              <p className="text-slate-500 mb-0.5">Planned</p>
              <p className="font-semibold text-blue-700">{formatDateDisplay(selectedBar.plannedStart)} → {formatDateDisplay(selectedBar.plannedEnd)}</p>
              <p className="text-[10px] text-slate-400">{daysDiff(selectedBar.plannedStart, selectedBar.plannedEnd) + 1} days</p>
            </div>
            <div>
              <p className="text-slate-500 mb-0.5">Actual</p>
              <p className="font-semibold text-emerald-700">{formatDateDisplay(selectedBar.actualStart)} → {formatDateDisplay(selectedBar.actualEnd)}</p>
              {selectedBar.actualStart && selectedBar.actualEnd && (
                <p className="text-[10px] text-slate-400">{daysDiff(selectedBar.actualStart, selectedBar.actualEnd) + 1} days</p>
              )}
            </div>
            {selectedBar.delayDays > 0 && (
              <div className="col-span-2 sm:col-span-4 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                <AlertTriangle size={14} className="text-red-500" />
                <span className="text-red-700 font-medium">Delayed by {selectedBar.delayDays} days</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Merged Table + Timeline (ONE scroll area — everything scrolls together L→R) ── */}
      <div id="qcc-activity-plan-table" className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden scroll-mt-4">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-4 flex-wrap">
          <h3 className="text-sm font-bold text-slate-800">Activity Plan</h3>
          <div className="flex items-center gap-3.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-700"><span className="w-4 h-2 rounded-sm" style={{ background: 'linear-gradient(135deg, #2563EB, #3B82F6)' }} /> Planned</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-700"><span className="w-4 h-2 rounded-sm" style={{ background: 'linear-gradient(135deg, #10B981, #34D399)' }} /> Actual</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-700"><span className="w-4 h-2 rounded-sm" style={{ background: 'linear-gradient(135deg, #EF4444, #F87171)' }} /> Delay</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-700"><span className="w-0.5 h-3.5 bg-amber-500" /> Today</span>
            <span className="text-[11px] text-slate-400 border-l border-slate-200 pl-3.5">{filteredEntries.length} activities</span>
          </div>
        </div>

        {/* Field-level date-lock legend */}
        <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/60 flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px] text-slate-600">
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300" /> Editable</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> Pending approval</span>
          <span className="inline-flex items-center gap-1"><Lock size={11} className="text-emerald-600" /> Approved (locked)</span>
        </div>

        <div className="overflow-auto no-scrollbar" ref={tableRef} style={{ maxHeight: 'calc(100vh - 300px)', minHeight: '380px' }}>
          <div style={{ width: `${LEFT_W + timelineWidth}px` }}>
            {/* Header row */}
            <div className="flex sticky top-0 z-30 bg-slate-50 border-b border-slate-200">
              <div className="flex bg-slate-50 border-r-2 border-slate-200 sticky left-0 z-40" style={{ width: `${LEFT_W}px` }}>
                <div className={headCell + ' text-center'} style={{ width: W.sr }}>Sr</div>
                <div className={headCell} style={{ width: W.name }}>Activity Name</div>
                <div className={headCell} style={{ width: W.pic }}>PIC</div>
                <div className={headCell + ' text-center'} style={{ width: W.ps }}>Planned Start</div>
                <div className={headCell + ' text-center'} style={{ width: W.pe }}>Planned End</div>
                <div className={headCell + ' text-center'} style={{ width: W.as }}>Actual Start</div>
                <div className={headCell + ' text-center'} style={{ width: W.ae }}>Actual End</div>
                <div className={headCell + ' text-center'} style={{ width: W.st }}>Status</div>
                <div className={headCell + ' border-r-0'} style={{ width: W.rs }}>Reason</div>
              </div>
              <div className="relative flex isolate" style={{ width: `${timelineWidth}px` }}>
                {timelineHeaders.map((cell, i) => (
                  <div
                    key={i}
                    className={`flex-shrink-0 border-r text-center py-2 ${
                      cell.isToday ? 'bg-amber-50 border-amber-200' :
                      cell.isWeekend ? 'bg-slate-100/70 border-slate-200' : 'border-slate-100'
                    }`}
                    style={{ width: `${cellWidth}px` }}
                  >
                    {cell.label && (
                      <>
                        <div className={`text-[10px] font-bold ${cell.isToday ? 'text-amber-700' : 'text-slate-700'}`}>{cell.label}</div>
                        {cell.subLabel && <div className="text-[8px] text-slate-400">{cell.subLabel}</div>}
                      </>
                    )}
                  </div>
                ))}
                {todayOffset >= 0 && todayOffset <= timelineWidth && (
                  <div
                    className="absolute top-0 z-20 px-1.5 py-0.5 bg-amber-500 text-white text-[8px] font-bold rounded shadow-sm"
                    style={{ left: `${todayOffset}px`, transform: 'translateX(-50%)' }}
                  >
                    TODAY
                  </div>
                )}
              </div>
            </div>

            {/* Body rows */}
            {filteredEntries.map((entry, idx) => {
              const step = activitySteps.find(s => s.id === entry.activityStepId);
              const delayDays = (entry as any).delayDays || 0;
              const isHighlighted = highlightedRow === entry.id;
              const duration = entry.plannedStart && entry.plannedEnd ? daysDiff(entry.plannedStart, entry.plannedEnd) + 1 : 0;
              const plannedBar = getBarStyle(entry.plannedStart, entry.plannedEnd);
              const seg = actualSegments(entry);
              // No status-based row colouring — just an opaque background (so the timeline
              // bars never bleed through the frozen columns) plus a light hover highlight.
              const rowBg = isHighlighted ? 'bg-blue-50' : 'bg-white';

              return (
                <div
                  key={entry.id}
                  className="flex border-b border-slate-100 transition-colors cursor-pointer"
                  style={{ height: `${ROW_H}px` }}
                  onMouseEnter={() => setHighlightedRow(entry.id)}
                  onMouseLeave={() => setHighlightedRow(null)}
                  onClick={() => {
                    const act = ganttActivities.find(a => a.id === entry.id);
                    if (act) setSelectedBar(act);
                  }}
                >
                  {/* Data columns (frozen — stay visible while the timeline scrolls) */}
                  <div className={`flex border-r-2 border-slate-200 sticky left-0 z-20 ${rowBg}`} style={{ width: `${LEFT_W}px` }}>
                    <div className="flex items-center justify-center flex-shrink-0" style={{ width: W.sr }}>
                      <span className="text-xs font-semibold text-slate-500">{idx + 1}</span>
                    </div>
                    <div className="flex flex-col justify-center px-2 flex-shrink-0 overflow-hidden" style={{ width: W.name }}>
                      <p className="text-xs font-semibold text-slate-800 leading-tight truncate" title={step?.name || entry.activityName}>
                        {step?.name || entry.activityName}
                      </p>
                      {duration > 0 && <p className="text-[9px] text-slate-400 mt-0.5">{duration} days planned</p>}
                    </div>
                    <div className="flex items-center px-1.5 flex-shrink-0" style={{ width: W.pic }}>
                      {canEdit ? (
                        <select
                          value={entry.pic}
                          onChange={e => updateEntry(entry.id, 'pic', e.target.value)}
                          onClick={e => e.stopPropagation()}
                          className="w-full px-1.5 py-1 border border-slate-200 rounded text-[11px] bg-white outline-none focus:ring-1 focus:ring-blue-400"
                        >
                          <option value="">Select</option>
                          {teamMembers.map(m => (
                            <option key={m.name} value={m.name}>{m.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-slate-700 truncate">{entry.pic || '—'}</span>
                      )}
                    </div>
                    {/* Date fields — Plan (Admin) / Actual (Leader) filled, each approved & locked by Admin */}
                    {DATE_FIELDS.map(({ field, w, accent, kind }) => {
                      const val = entry[field] || '';
                      const locked = isLocked(entry, field);
                      const canEditThis = !locked && (kind === 'plan' ? canEditPlan : canEditActual);
                      const border = accent === 'emerald' ? 'border-emerald-200 focus:ring-emerald-400' : 'border-slate-300 focus:ring-blue-400';
                      return (
                        <div key={field} className="flex flex-col items-center justify-center gap-0.5 px-1 flex-shrink-0" style={{ width: w }} onClick={e => e.stopPropagation()}>
                          {locked ? (
                            <button type="button" onClick={() => canApprove && toggleLock(entry.id, field)}
                              title={canApprove ? 'Approved & locked — click to unlock (Admin)' : 'Approved & locked'}
                              className={`w-full inline-flex items-center justify-center gap-1 px-1 py-1 rounded border border-emerald-300 bg-emerald-50 text-emerald-700 text-[10px] font-semibold ${canApprove ? 'cursor-pointer hover:bg-emerald-100' : 'cursor-default'}`}>
                              <Lock size={10} className="flex-shrink-0" />{formatDateDisplay(val) || '—'}
                            </button>
                          ) : canEditThis ? (
                            <div className="flex items-center gap-0.5 w-full">
                              <input type="date" min="1990-01-01" max="2100-12-31" value={val}
                                onChange={e => updateEntry(entry.id, field, e.target.value)} onClick={e => e.stopPropagation()}
                                className={`flex-1 min-w-0 px-1 py-1 border ${border} rounded text-[10px] text-center bg-white outline-none focus:ring-1`} />
                              {canApprove && (
                                <button type="button" onClick={() => toggleLock(entry.id, field)} disabled={!val}
                                  title={val ? 'Approve & lock this date' : 'Enter a date first'}
                                  className="flex-shrink-0 p-0.5 text-slate-400 hover:text-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed"><Unlock size={13} /></button>
                              )}
                            </div>
                          ) : (
                            <span className={`w-full text-center text-[10px] ${val ? 'text-slate-600' : 'text-slate-400'}`}>{formatDateDisplay(val) || '—'}</span>
                          )}
                        </div>
                      );
                    })}
                    {/* Status — auto-derived from the dates (read only) */}
                    <div className="flex items-center justify-center px-1 flex-shrink-0" style={{ width: W.st }}>
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        STATUS_OPTIONS.find(s => s.value === entry.status)?.color || 'bg-slate-100 text-slate-700'
                      }`}>
                        {STATUS_OPTIONS.find(s => s.value === entry.status)?.label || entry.status}
                      </span>
                    </div>
                    {/* Reason — writable for editors and always for Admin */}
                    <div className="flex items-center gap-1 px-1.5 flex-shrink-0" style={{ width: W.rs }} onClick={e => e.stopPropagation()}>
                      {(canEdit || isAdmin) ? (
                        <input
                          value={(entry as any).delayReason || ''}
                          onChange={e => updateEntry(entry.id, 'delayReason', e.target.value)}
                          placeholder="Type reason…"
                          className="flex-1 min-w-0 px-1.5 py-1 border border-slate-200 rounded text-[10px] bg-white outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      ) : (
                        <span className="text-[10px] text-slate-600 truncate">{(entry as any).delayReason || '—'}</span>
                      )}
                    </div>
                  </div>

                  {/* Timeline bars for this row.
                      `isolate` puts every bar/line into its OWN stacking context, so the whole
                      timeline group always paints UNDER the frozen data columns (z-20) — nothing
                      bleeds through them while scrolling. */}
                  <div className={`relative flex-shrink-0 isolate ${isHighlighted ? 'bg-blue-50/40' : ''}`} style={{ width: `${timelineWidth}px` }}>
                    {timelineHeaders.map((cell, i) => cell.isWeekend && (
                      <div key={`we-${i}`} className="absolute top-0 bottom-0 bg-slate-50/60" style={{ left: `${i * cellWidth}px`, width: `${cellWidth}px` }} />
                    ))}
                    {todayOffset >= 0 && todayOffset <= timelineWidth && (
                      <div className="absolute top-0 bottom-0 w-0.5 bg-amber-500 z-20 pointer-events-none" style={{ left: `${todayOffset}px` }} />
                    )}
                    {entry.plannedStart && entry.plannedEnd && plannedBar.width > 0 && (
                      <div
                        className="absolute rounded-md shadow-sm z-10"
                        style={{ left: `${plannedBar.left}px`, width: `${plannedBar.width}px`, top: '10px', height: '14px', background: 'linear-gradient(135deg, #2563EB, #3B82F6)' }}
                        title={`Planned: ${formatDateDisplay(entry.plannedStart)} → ${formatDateDisplay(entry.plannedEnd)}`}
                      />
                    )}
                    {seg && seg.green.width > 0 && (
                      <div
                        className={`absolute rounded-l-md ${seg.red ? '' : 'rounded-r-md'} shadow-sm z-10 ${seg.inProgress ? 'animate-pulse' : ''}`}
                        style={{
                          left: `${seg.green.left}px`, width: `${seg.green.width}px`, top: '30px', height: '14px',
                          background: entry.status === 'completed' ? 'linear-gradient(135deg, #065F46, #059669)' : 'linear-gradient(135deg, #10B981, #34D399)',
                          opacity: seg.inProgress ? 0.8 : 1,
                        }}
                        title={`Actual from ${formatDateDisplay(entry.actualStart)}`}
                      />
                    )}
                    {seg && seg.red && (
                      <div
                        className="absolute rounded-r-md shadow-sm z-10"
                        style={{ left: `${seg.red.left}px`, width: `${seg.red.width}px`, top: '30px', height: '14px', background: 'linear-gradient(135deg, #EF4444, #F87171)' }}
                        title={`${delayDays}d past planned end`}
                      >
                        {delayDays > 0 && seg.red.width > 22 && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[9px] font-bold text-white">+{delayDays}d</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

    </div>
  );
}

// ─── Generate Default Entries ────────────────────────────
function generateDefaultEntries(projectId: string, teamId: string): ActivityPlanEntry[] {
  const team = mockTeams.find(t => t.id === teamId);
  const leaderName = team?.leaderName || '';
  const members = team?.members.filter(m => m.isActive).map(m => m.memberName) || [];
  const allPICs = [leaderName, ...members];

  const today = new Date();
  const baseStart = new Date(today.getFullYear(), today.getMonth(), 1);

  return DEFAULT_ACTIVITIES.map((act, i) => {
    const plannedStart = new Date(baseStart);
    plannedStart.setDate(plannedStart.getDate() + i * 14);
    const plannedEnd = new Date(plannedStart);
    plannedEnd.setDate(plannedEnd.getDate() + 13);

    // Simulate some actual dates for earlier activities
    let actualStart = '';
    let actualEnd = '';
    let status: 'not_started' | 'planning' | 'in_progress' | 'hold' | 'delayed' | 'completed' = 'not_started';

    if (i < 2) {
      actualStart = formatDateStr(plannedStart);
      actualEnd = formatDateStr(new Date(plannedEnd.getTime() + (i === 0 ? 0 : 2 * 86400000)));
      status = 'completed';
    } else if (i === 2) {
      actualStart = formatDateStr(plannedStart);
      status = 'in_progress';
    } else if (i === 3) {
      status = 'planning';
    }

    return {
      id: `entry-${projectId}-${i + 1}`,
      projectId,
      activityStepId: `step-${i + 1}`,
      activityName: act.name,
      pic: allPICs[i % allPICs.length] || '',
      plannedStart: formatDateStr(plannedStart),
      plannedEnd: formatDateStr(plannedEnd),
      actualStart,
      actualEnd,
      status,
      remarks: '',
      // A finished (Actual End stamped) activity counts as approved, so the next one
      // in the sequence unlocks — matching the loader's legacy rule.
      isApproved: !!actualEnd,
      createdBy: 'system',
      createdAt: new Date().toISOString(),
    };
  });
}

function formatDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
