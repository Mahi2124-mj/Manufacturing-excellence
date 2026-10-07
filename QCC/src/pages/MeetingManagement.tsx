import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CalendarDays, Clock3, FileText, CheckCircle2, MapPin,
  Eye, ClipboardCheck, Gauge, Search, X, AlertCircle, Loader2, Calendar as CalendarIcon,
  UserCheck, Lock, ChevronLeft, ChevronRight, Users,
} from 'lucide-react';
import { mockMeetingSchedules } from '../lib/data';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useMeetingSchedules, computeScheduleDate } from '../lib/meetingSchedules';
import { useActivitySteps } from '../lib/activitySteps';
import { useHierarchy } from '../lib/hierarchy';
import { loadClosure } from '../components/FinalProjectClosure';
import type { Team, QCCProject } from '../types';

type MeetingStatus = 'today' | 'upcoming' | 'pending_mom' | 'completed';

interface MeetingExec {
  attendanceMarked?: boolean;
  attendancePresent?: string[];      // memberIds present
  momSubmitted?: boolean;
  mom?: { agenda: string; discussion: string; decisions: string; nextDate: string };
  progress?: number;                 // 0-100
}

interface MeetingRow {
  id: string;
  team: Team;
  teamName: string;
  department: string;
  subDepartment?: string;
  leader: string;
  advisor: string;
  coordinator: string;
  date: string;                      // ISO yyyy-mm-dd
  dayOffset: number;
  startTime: string;
  endTime: string;
  venue: string;
  title: string;
  meetingType: string;
  agenda: string;
  instructions: string;
  source: 'scheduled' | 'auto';
  scheduleId?: string;
  actualStep: string;
  status: MeetingStatus;
  progress: number;
  momSubmitted: boolean;
  attendanceMarked: boolean;
  presentCount: number;
  totalMembers: number;
}

const STORAGE_KEY = 'qcc-meeting-execution';

const STATUS_META: Record<MeetingStatus, { label: string; cls: string; dot: string }> = {
  today: { label: 'Today', cls: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  upcoming: { label: 'Upcoming', cls: 'bg-violet-100 text-violet-700', dot: 'bg-violet-500' },
  pending_mom: { label: 'Pending MOM', cls: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  completed: { label: 'Completed', cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
};

// Deterministic spread so the dashboard always shows a realistic mix of dates.
const OFFSETS = [0, 1, 2, 3, 5, 7, -1, -2, -4, -8, -10, 4, 6, -3, -6, 8, -12, 9];

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addMinutes = (t: string, mins: number) => {
  const [h, m] = (t || '0:0').split(':').map(Number);
  const total = (h || 0) * 60 + (m || 0) + mins;
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
};
const prettyDate = (iso: string) => {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short' });
};

// ── Status-report periods ───────────────────────────────────────────────────
// The report rolls the same meeting rows up into weeks or months, so the numbers
// always agree with the Meetings tab — there is no second source of truth.
type Tab = 'meetings' | 'status';
type Granularity = 'weekly' | 'monthly';

/** Monday 00:00 of the week the given date falls in. */
const startOfWeek = (d: Date) => {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));   // Sunday (0) counts as day 6
  x.setHours(0, 0, 0, 0);
  return x;
};
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

/** Start of the period `offset` periods away from the one containing `from`. */
const periodStart = (from: Date, gran: Granularity, offset: number) => {
  if (gran === 'weekly') {
    const s = startOfWeek(from);
    s.setDate(s.getDate() + offset * 7);
    return s;
  }
  const s = startOfMonth(from);
  return new Date(s.getFullYear(), s.getMonth() + offset, 1);
};
/** Last day (inclusive) of the period that starts at `start`. */
const periodEnd = (start: Date, gran: Granularity) => {
  const e = gran === 'weekly'
    ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
    : new Date(start.getFullYear(), start.getMonth() + 1, 0);
  e.setHours(0, 0, 0, 0);
  return e;
};
const periodLabel = (start: Date, gran: Granularity) => {
  if (gran === 'monthly') return start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const end = periodEnd(start, gran);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
  return `${fmt(start)} – ${fmt(end)}, ${end.getFullYear()}`;
};
const shortPeriodLabel = (start: Date, gran: Granularity) =>
  gran === 'monthly'
    ? start.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    : start.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

function loadExec(): Record<string, MeetingExec> {
  try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) return JSON.parse(raw); } catch { /* ignore */ }
  return {};
}

export default function MeetingManagement() {
  const { user } = useAuth();
  const { schedules } = useMeetingSchedules();      // published schedules from Admin → Create Meeting Schedule
  const { workflowSteps } = useActivitySteps();     // for "Actual Step"
  const hierarchy = useHierarchy();

  const [teams, setTeams] = useState<Team[]>([]);
  const [projects, setProjects] = useState<QCCProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [exec, setExec] = useState<Record<string, MeetingExec>>(loadExec);

  const [statusFilter, setStatusFilter] = useState<'all' | MeetingStatus>('all');
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');

  // Two views on the same data: the meeting list, and the weekly/monthly roll-up.
  const [tab, setTab] = useState<Tab>(() => {
    try { const v = localStorage.getItem('qcc-meeting-tab'); if (v === 'meetings' || v === 'status') return v; } catch { /* default */ }
    return 'meetings';
  });
  useEffect(() => { try { localStorage.setItem('qcc-meeting-tab', tab); } catch { /* ignore */ } }, [tab]);

  // Status report: weekly or monthly, and how many periods back from today (0 = current).
  const [gran, setGran] = useState<Granularity>('weekly');
  const [periodOffset, setPeriodOffset] = useState(0);
  useEffect(() => { setPeriodOffset(0); }, [gran]);   // switching the unit returns to "now"

  const [modal, setModal] = useState<{ type: 'view' | 'attendance' | 'mom' | 'progress'; id: string } | null>(null);
  const [attendanceDraft, setAttendanceDraft] = useState<string[]>([]);
  const [momDraft, setMomDraft] = useState({ agenda: '', discussion: '', decisions: '', nextDate: '' });
  const [progressDraft, setProgressDraft] = useState(0);
  const [momError, setMomError] = useState('');                        // inline required-field message
  const [successPopup, setSuccessPopup] = useState<string | null>(null); // "submitted successfully" popup

  const role = user?.role ?? 'member';
  const isAdmin = role === 'admin';
  const isLeader = role === 'leader';
  const isAdvisor = role === 'facilitator';         // QCC "Advisor" maps to the Facilitator
  const isCoordinator = role === 'coordinator';
  const seesAll = isAdmin || isAdvisor || isCoordinator || role === 'dept_head';

  // ── Auto-sync teams from Team Registration ──
  // Runs on mount, on window focus and every 15s, so the page stays current without a
  // manual Refresh button.
  const sync = useCallback(async () => {
    try { const [t, p] = await Promise.all([api.listTeams(), api.listProjects()]); setTeams(t); setProjects(p); }
    catch { /* keep last snapshot */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { sync(); }, [sync]);
  useEffect(() => {
    const onFocus = () => sync();
    window.addEventListener('focus', onFocus);
    const iv = setInterval(sync, 15000);
    return () => { window.removeEventListener('focus', onFocus); clearInterval(iv); };
  }, [sync]);

  useEffect(() => { if (successPopup) { const t = setTimeout(() => setSuccessPopup(null), 2200); return () => clearTimeout(t); } }, [successPopup]);

  const persistExec = (id: string, patch: MeetingExec) => {
    setExec(prev => {
      const next = { ...prev, [id]: { ...prev[id], ...patch } };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // ── Build meeting instances: published Admin schedules first, then a default
  //    per team that has none — so the dashboard is always populated and every
  //    published schedule appears in its team's Meeting Management. ──
  const allMeetings = useMemo<MeetingRow[]>(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    // Teams whose project was closed & approved via Step 9 (Final Project Closure) —
    // their meetings are shown as Completed automatically.
    const closedTeamIds = new Set(
      projects.filter(p => loadClosure(p.id).approval?.decision === 'approved').map(p => p.teamId),
    );
    const approvedOf = (p: QCCProject) => p.steps.filter(s => s.status === 'approved').length;
    const actualStepOf = (teamId: string): string => {
      const projs = projects.filter(p => p.teamId === teamId);
      if (!projs.length) return 'Not started';
      const proj = projs.reduce((a, b) => (approvedOf(b) > approvedOf(a) ? b : a));
      const realCount = proj.steps.length || 7;
      const approvedReal = approvedOf(proj);
      const frontDone = realCount > 0 && approvedReal === realCount;
      const stage = approvedReal + (frontDone ? Math.max(0, workflowSteps.length - realCount) : 0);
      if (stage >= workflowSteps.length) return 'Completed';
      return workflowSteps[stage]?.title ?? `Step ${stage + 1}`;
    };

    type Extra = Pick<MeetingRow, 'startTime' | 'endTime' | 'venue' | 'title' | 'meetingType' | 'agenda' | 'instructions' | 'source' | 'scheduleId'>;
    const makeRow = (id: string, team: Team, date: string, extra: Extra): MeetingRow => {
      const dObj = new Date(date + 'T00:00:00');
      const dayOffset = Math.round((dObj.getTime() - today.getTime()) / 86400000);
      const ex = exec[id] || {};
      const teamClosed = closedTeamIds.has(team.id);   // project closed → meeting complete
      const defaultMom = dayOffset <= -7;
      const momSubmitted = teamClosed || (ex.momSubmitted ?? defaultMom);
      let status: MeetingStatus;
      if (momSubmitted) status = 'completed';
      else if (dayOffset > 0) status = 'upcoming';
      else if (dayOffset === 0) status = 'today';
      else status = 'pending_mom';
      const members = team.members.filter(m => m.isActive);
      const present = ex.attendancePresent ?? [];
      const defaultProgress = momSubmitted ? 100 : status === 'pending_mom' ? 70 : status === 'today' ? 25 : 0;
      return {
        id, team, teamName: team.name, department: team.department, subDepartment: team.subDepartment,
        leader: team.leaderName, advisor: team.facilitatorName || '—', coordinator: team.coordinatorName || '—',
        date, dayOffset, ...extra,
        actualStep: teamClosed ? 'Completed' : actualStepOf(team.id),
        status, progress: ex.progress ?? defaultProgress, momSubmitted,
        attendanceMarked: ex.attendanceMarked ?? false,
        presentCount: ex.attendanceMarked ? present.length : 0,
        totalMembers: members.length,
      };
    };

    const teamById = new Map(teams.map(t => [t.id, t]));
    const rows: MeetingRow[] = [];
    const scheduledTeams = new Set<string>();

    // 1) Published schedules → one meeting each (respects backend team RBAC).
    schedules.filter(s => s.status === 'published').forEach(s => {
      const team = teamById.get(s.teamId);
      if (!team || team.status !== 'active') return;
      scheduledTeams.add(team.id);
      const date = computeScheduleDate(s) || isoOf(today);
      rows.push(makeRow(`MTG-${s.id}`, team, date, {
        startTime: s.time, endTime: addMinutes(s.time, s.duration), venue: s.venue,
        title: `${team.name} · ${s.meetingType}`, meetingType: s.meetingType, agenda: s.agenda,
        instructions: s.instructions, source: 'scheduled', scheduleId: s.id,
      }));
    });

    // 2) Active teams without a published schedule → default auto meeting.
    teams.filter(t => t.status === 'active' && !scheduledTeams.has(t.id)).forEach((team, i) => {
      const sched = mockMeetingSchedules.find(sc => sc.teamIds.includes(team.id));
      const d = new Date(today); d.setDate(d.getDate() + OFFSETS[i % OFFSETS.length]);
      rows.push(makeRow(`MTG-${team.id}`, team, isoOf(d), {
        startTime: sched?.startTime || '09:00', endTime: sched?.endTime || '10:00',
        venue: sched?.location || `${team.department} Meeting Room`,
        title: sched?.title || `${team.name} QCC Review`, meetingType: sched?.meetingType || 'Review',
        agenda: '', instructions: '', source: 'auto', scheduleId: undefined,
      }));
    });

    return rows;
  }, [teams, exec, schedules, projects, workflowSteps]);

  // ── Role scoping ──
  const visibleMeetings = useMemo(() => {
    if (seesAll) return allMeetings;
    if (isLeader) return allMeetings.filter(m => m.leader === user?.name);
    return allMeetings.filter(m => m.team.members.some(mm => mm.memberName === user?.name)); // member
  }, [allMeetings, seesAll, isLeader, user?.name]);

  const canExecute = (m: MeetingRow) => isAdmin || (isLeader && m.leader === user?.name);

  const departments = useMemo(() => [...new Set(visibleMeetings.map(m => m.department))].sort(), [visibleMeetings]);

  const filtered = useMemo(() => visibleMeetings.filter(m => {
    if (statusFilter !== 'all' && m.status !== statusFilter) return false;
    if (deptFilter !== 'all' && m.department !== deptFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(m.teamName.toLowerCase().includes(q) || m.leader.toLowerCase().includes(q) || m.department.toLowerCase().includes(q) || m.advisor.toLowerCase().includes(q))) return false;
    }
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date)), [visibleMeetings, statusFilter, deptFilter, search]);

  const kpis = useMemo(() => ({
    today: visibleMeetings.filter(m => m.status === 'today').length,
    upcoming: visibleMeetings.filter(m => m.status === 'upcoming').length,
    pending: visibleMeetings.filter(m => m.status === 'pending_mom').length,
    completed: visibleMeetings.filter(m => m.status === 'completed').length,
  }), [visibleMeetings]);

  // ── Status report ─────────────────────────────────────────────────────────
  // Department + search apply here too, but not the status chips: the report is
  // meant to show every status side by side for the chosen week or month.
  const reportPool = useMemo(() => visibleMeetings.filter(m => {
    if (deptFilter !== 'all' && m.department !== deptFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(m.teamName.toLowerCase().includes(q) || m.leader.toLowerCase().includes(q)
        || m.department.toLowerCase().includes(q) || m.advisor.toLowerCase().includes(q))) return false;
    }
    return true;
  }), [visibleMeetings, deptFilter, search]);

  /** Roll a set of meetings up into the counts the report shows. */
  const summarise = useCallback((rows: MeetingRow[]) => {
    const present = rows.reduce((s, m) => s + m.presentCount, 0);
    const seats = rows.reduce((s, m) => s + (m.attendanceMarked ? m.totalMembers : 0), 0);
    return {
      total: rows.length,
      completed: rows.filter(m => m.status === 'completed').length,
      pendingMom: rows.filter(m => m.status === 'pending_mom').length,
      today: rows.filter(m => m.status === 'today').length,
      upcoming: rows.filter(m => m.status === 'upcoming').length,
      momSubmitted: rows.filter(m => m.momSubmitted).length,
      attendanceMarked: rows.filter(m => m.attendanceMarked).length,
      attendanceRate: pct(present, seats),
      avgProgress: rows.length ? Math.round(rows.reduce((s, m) => s + m.progress, 0) / rows.length) : 0,
    };
  }, []);

  const selected = useMemo(() => {
    const start = periodStart(new Date(), gran, periodOffset);
    const end = periodEnd(start, gran);
    const fromISO = isoOf(start), toISO = isoOf(end);
    const rows = reportPool.filter(m => m.date >= fromISO && m.date <= toISO);
    return { start, end, fromISO, toISO, rows, label: periodLabel(start, gran), summary: summarise(rows) };
  }, [reportPool, gran, periodOffset, summarise]);

  // One row per team for the selected period.
  const teamRows = useMemo(() => {
    const byTeam = new Map<string, MeetingRow[]>();
    selected.rows.forEach(m => {
      if (!byTeam.has(m.team.id)) byTeam.set(m.team.id, []);
      byTeam.get(m.team.id)!.push(m);
    });
    return [...byTeam.entries()]
      .map(([teamId, rows]) => ({ teamId, head: rows[0], rows, summary: summarise(rows) }))
      .sort((a, b) => a.head.teamName.localeCompare(b.head.teamName));
  }, [selected.rows, summarise]);

  // The six periods up to and including the selected one — the trend matrix columns.
  const trend = useMemo(() => {
    const cols = [];
    for (let i = 5; i >= 0; i--) {
      const start = periodStart(new Date(), gran, periodOffset - i);
      const end = periodEnd(start, gran);
      const fromISO = isoOf(start), toISO = isoOf(end);
      const rows = reportPool.filter(m => m.date >= fromISO && m.date <= toISO);
      cols.push({
        key: fromISO, label: shortPeriodLabel(start, gran), isSelected: i === 0,
        rows, summary: summarise(rows),
      });
    }
    return cols;
  }, [reportPool, gran, periodOffset, summarise]);

  // Teams that appear anywhere in the six periods, so the matrix has stable rows.
  const trendTeams = useMemo(() => {
    const seen = new Map<string, string>();
    trend.forEach(c => c.rows.forEach(m => { if (!seen.has(m.team.id)) seen.set(m.team.id, m.teamName); }));
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [trend]);

  const activeMeeting = modal ? allMeetings.find(m => m.id === modal.id) || null : null;

  // ── Action openers ──
  const openView = (m: MeetingRow) => setModal({ type: 'view', id: m.id });
  const openAttendance = (m: MeetingRow) => {
    const ex = exec[m.id] || {};
    setAttendanceDraft(ex.attendancePresent ?? m.team.members.filter(mm => mm.isActive).map(mm => mm.memberId));
    setModal({ type: 'attendance', id: m.id });
  };
  const openMom = (m: MeetingRow) => {
    const ex = exec[m.id] || {};
    setMomDraft(ex.mom ?? { agenda: '', discussion: '', decisions: '', nextDate: '' });
    setMomError('');
    setModal({ type: 'mom', id: m.id });
  };
  const openProgress = (m: MeetingRow) => { setProgressDraft(m.progress); setModal({ type: 'progress', id: m.id }); };

  const saveAttendance = () => {
    if (!activeMeeting) return;
    persistExec(activeMeeting.id, { attendanceMarked: true, attendancePresent: attendanceDraft });
    setModal(null); setSuccessPopup('Attendance saved successfully');
  };
  const saveMom = () => {
    if (!activeMeeting) return;
    if (!momDraft.agenda.trim()) { setMomError('Agenda is required.'); return; }  // inline, inside the modal
    persistExec(activeMeeting.id, { momSubmitted: true, mom: momDraft, progress: 100 });
    setModal(null); setSuccessPopup('MOM submitted successfully');
  };
  const saveProgress = () => {
    if (!activeMeeting) return;
    persistExec(activeMeeting.id, { progress: progressDraft });
    setModal(null); setSuccessPopup('Progress updated successfully');
  };

  const KPI_CARDS = [
    { key: 'today' as const, label: "Today's Meetings", value: kpis.today, icon: <CalendarDays size={18} />, cls: 'text-blue-600 bg-blue-50' },
    { key: 'upcoming' as const, label: 'Upcoming Meetings', value: kpis.upcoming, icon: <Clock3 size={18} />, cls: 'text-violet-600 bg-violet-50' },
    { key: 'pending_mom' as const, label: 'Pending MOM', value: kpis.pending, icon: <FileText size={18} />, cls: 'text-amber-600 bg-amber-50' },
    { key: 'completed' as const, label: 'Completed Meetings', value: kpis.completed, icon: <CheckCircle2 size={18} />, cls: 'text-emerald-600 bg-emerald-50' },
  ];

  const roleNote = isAdmin ? 'Full access'
    : isLeader ? 'You can mark attendance, submit MOM & update progress for your team'
    : (isAdvisor || isCoordinator) ? 'Review access — you can view meeting details'
    : 'View access';

  return (
    <div className="space-y-5">
      {/* Success popup — shown after a successful submit */}
      {successPopup && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/30" onClick={() => setSuccessPopup(null)}>
          <div className="bg-white rounded-2xl shadow-2xl px-8 py-7 text-center max-w-xs w-full" onClick={e => e.stopPropagation()}>
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 size={30} className="text-emerald-600" />
            </div>
            <p className="text-base font-bold text-slate-800">{successPopup}</p>
            <button onClick={() => setSuccessPopup(null)} className="mt-4 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg">OK</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0"><CalendarIcon size={17} /></span>
          <div>
            <h2 className="text-sm font-bold text-slate-800">Meeting Execution Dashboard</h2>
            <p className="text-[11px] text-slate-500">Auto-synced with Team Registration &amp; Meeting Schedule · <span className="font-medium text-slate-600">{roleNote}</span></p>
          </div>
        </div>

        {/* View switcher: the meeting list is its own button, and the dropdown picks the
            roll-up unit for the status report (which it also switches to). */}
        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setTab('meetings')}
            className={`px-3.5 py-2 rounded-lg text-sm font-semibold border transition-colors ${
              tab === 'meetings'
                ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            Meetings
          </button>
          {/* On the meetings view the value is blank, so picking either unit always fires
              onChange and switches over to the report. */}
          <select
            value={tab === 'status' ? gran : ''}
            onChange={e => { setGran(e.target.value as Granularity); setTab('status'); }}
            title="Weekly / monthly status report"
            className={`px-3 py-2 rounded-lg text-sm font-semibold border outline-none focus:ring-2 focus:ring-blue-500 ${
              tab === 'status'
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white border-slate-300 text-slate-700'
            }`}
          >
            {tab !== 'status' && <option value="" disabled>Weekly / Monthly</option>}
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
      </div>

      {tab === 'meetings' && (<>
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {KPI_CARDS.map(c => {
          const active = statusFilter === c.key;
          return (
            <button key={c.key} onClick={() => setStatusFilter(active ? 'all' : c.key)}
              className={`text-left bg-white rounded-xl border shadow-sm p-4 flex items-center gap-3 transition-all ${active ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200 hover:border-blue-300 hover:shadow-md'}`}>
              <span className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${c.cls}`}>{c.icon}</span>
              <div>
                <p className="text-2xl font-bold text-slate-800 leading-none">{c.value}</p>
                <p className="text-[11px] text-slate-500 mt-1.5">{c.label}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <Search size={15} className="text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search team, leader, advisor, department…" className="bg-transparent text-sm text-slate-700 outline-none w-full" />
        </div>
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All Departments</option>
          {hierarchy.departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        {statusFilter !== 'all' && (
          <button onClick={() => setStatusFilter('all')} className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-300 text-slate-600 text-sm rounded-lg hover:bg-slate-50">
            <X size={14} /> {STATUS_META[statusFilter].label}
          </button>
        )}
      </div>

      {/* Meeting list */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['Team', 'Department', 'Leader', 'Advisor', 'Date', 'Time', 'Venue', 'Status', 'Actions'].map((h, i) => (
                  <th key={h} className={`px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wide ${i === 8 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400"><Loader2 size={18} className="animate-spin inline mr-2" /> Loading meetings…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-400">No meetings match the current view.</td></tr>
              ) : filtered.map(m => {
                const meta = STATUS_META[m.status];
                const execAllowed = canExecute(m);
                return (
                  <tr key={m.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                        {m.teamName}
                        {m.source === 'scheduled' && <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-blue-100 text-blue-600 uppercase tracking-wide">Scheduled</span>}
                      </div>
                      <div className="text-[10px] text-slate-400">{m.title}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{m.department}{m.subDepartment ? <span className="text-slate-400"> · {m.subDepartment}</span> : ''}</td>
                    <td className="px-4 py-3 text-xs text-slate-700">{m.leader || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-700">{m.advisor}</td>
                    <td className="px-4 py-3 text-xs text-slate-700 whitespace-nowrap">{prettyDate(m.date)}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{m.startTime}–{m.endTime}</td>
                    <td className="px-4 py-3 text-xs text-slate-600"><span className="inline-flex items-center gap-1"><MapPin size={11} className="text-slate-400" /> {m.venue}</span></td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${meta.cls}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} /> {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openView(m)} title="Review details" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors"><Eye size={15} /></button>
                        {execAllowed ? (
                          <>
                            <button onClick={() => openAttendance(m)} title="Mark attendance" className={`p-1.5 rounded-lg hover:bg-slate-100 transition-colors ${m.attendanceMarked ? 'text-emerald-600' : 'text-slate-500 hover:text-emerald-600'}`}><UserCheck size={15} /></button>
                            <button onClick={() => openMom(m)} title={m.momSubmitted ? 'View / edit MOM' : 'Submit MOM'} className={`p-1.5 rounded-lg hover:bg-slate-100 transition-colors ${m.momSubmitted ? 'text-emerald-600' : 'text-slate-500 hover:text-blue-600'}`}><ClipboardCheck size={15} /></button>
                            <button onClick={() => openProgress(m)} title="Update progress" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-violet-600 transition-colors"><Gauge size={15} /></button>
                          </>
                        ) : (
                          <span title="Review only" className="p-1.5 text-slate-300"><Lock size={13} /></span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      </>)}

      {tab === 'status' && (
        <div className="space-y-5">
          {/* Period controls */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 flex flex-col lg:flex-row lg:items-center gap-3">
            {/* Search first, then the week/month picker, then the department — the
                weekly/monthly choice itself lives in the view dropdown up in the header. */}
            <div className="flex items-center gap-2 flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 min-w-[200px]">
              <Search size={15} className="text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search team, leader, advisor…" className="bg-transparent text-sm text-slate-700 outline-none w-full" />
            </div>

            {/* Which week / month */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button onClick={() => setPeriodOffset(o => o - 1)} title={`Previous ${gran === 'weekly' ? 'week' : 'month'}`}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><ChevronLeft size={15} /></button>
              <div className="px-3 min-w-[184px] text-center">
                <p className="text-sm font-bold text-slate-800 leading-tight">{selected.label}</p>
                <p className="text-[10px] text-slate-400">
                  {periodOffset === 0 ? `This ${gran === 'weekly' ? 'week' : 'month'}`
                    : `${Math.abs(periodOffset)} ${gran === 'weekly' ? 'week' : 'month'}${Math.abs(periodOffset) > 1 ? 's' : ''} ${periodOffset < 0 ? 'ago' : 'ahead'}`}
                </p>
              </div>
              <button onClick={() => setPeriodOffset(o => o + 1)} title={`Next ${gran === 'weekly' ? 'week' : 'month'}`}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><ChevronRight size={15} /></button>
              {periodOffset !== 0 && (
                <button onClick={() => setPeriodOffset(0)} className="ml-1 px-2.5 py-1.5 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 rounded-lg">Today</button>
              )}
            </div>

            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500 flex-shrink-0">
              <option value="all">All Departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {/* Period summary */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            {[
              { label: 'Meetings', value: selected.summary.total, sub: gran === 'weekly' ? 'this week' : 'this month', icon: <CalendarDays size={16} />, cls: 'text-blue-600 bg-blue-50' },
              { label: 'Completed', value: selected.summary.completed, sub: `${pct(selected.summary.completed, selected.summary.total)}% of meetings`, icon: <CheckCircle2 size={16} />, cls: 'text-emerald-600 bg-emerald-50' },
              { label: 'Pending MOM', value: selected.summary.pendingMom, sub: 'awaiting minutes', icon: <FileText size={16} />, cls: 'text-amber-600 bg-amber-50' },
              { label: 'Upcoming', value: selected.summary.upcoming + selected.summary.today, sub: 'today & ahead', icon: <Clock3 size={16} />, cls: 'text-violet-600 bg-violet-50' },
              { label: 'Attendance', value: `${selected.summary.attendanceRate}%`, sub: `${selected.summary.attendanceMarked} of ${selected.summary.total} marked`, icon: <Users size={16} />, cls: 'text-cyan-600 bg-cyan-50' },
              { label: 'Avg Progress', value: `${selected.summary.avgProgress}%`, sub: 'across meetings', icon: <Gauge size={16} />, cls: 'text-rose-600 bg-rose-50' },
            ].map(c => (
              <div key={c.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-3.5">
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${c.cls}`}>{c.icon}</span>
                <p className="text-2xl font-bold text-slate-800 leading-none mt-2.5">{c.value}</p>
                <p className="text-[11px] font-medium text-slate-600 mt-1.5">{c.label}</p>
                <p className="text-[10px] text-slate-400">{c.sub}</p>
              </div>
            ))}
          </div>

          {/* Team-wise status for the selected period */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-800">Team-wise status · {selected.label}</h3>
              <p className="text-[11px] text-slate-500">Attendance, minutes and progress for every meeting in this {gran === 'weekly' ? 'week' : 'month'}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Team', 'Department', 'Leader', 'Meetings', 'Attendance', 'MOM', 'Avg Progress', 'Status'].map((h, i) => (
                      <th key={h} className={`px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wide ${i >= 3 ? 'text-center' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400"><Loader2 size={18} className="animate-spin inline mr-2" /> Loading…</td></tr>
                  ) : teamRows.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-400">
                      No meetings fall in this {gran === 'weekly' ? 'week' : 'month'}. Use the arrows to look at another one.
                    </td></tr>
                  ) : teamRows.map(({ teamId, head, summary }) => {
                    const allDone = summary.total > 0 && summary.completed === summary.total;
                    return (
                      <tr key={teamId} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-slate-800">{head.teamName}</p>
                          <p className="text-[10px] text-slate-400">Advisor: {head.advisor}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">{head.department}</td>
                        <td className="px-4 py-3 text-xs text-slate-700">{head.leader || '—'}</td>
                        <td className="px-4 py-3 text-center text-sm font-semibold text-slate-800 tabular-nums">{summary.total}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-sm font-semibold tabular-nums ${summary.attendanceMarked ? 'text-slate-800' : 'text-slate-300'}`}>
                            {summary.attendanceMarked ? `${summary.attendanceRate}%` : '—'}
                          </span>
                          <p className="text-[10px] text-slate-400">{summary.attendanceMarked}/{summary.total} marked</p>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            summary.momSubmitted === summary.total ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {summary.momSubmitted}/{summary.total}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden min-w-[52px]">
                              <div className="h-full rounded-full bg-blue-500" style={{ width: `${summary.avgProgress}%` }} />
                            </div>
                            <span className="text-[11px] font-semibold text-slate-600 tabular-nums w-8 text-right">{summary.avgProgress}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            allDone ? STATUS_META.completed.cls : summary.pendingMom > 0 ? STATUS_META.pending_mom.cls : STATUS_META.upcoming.cls
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              allDone ? STATUS_META.completed.dot : summary.pendingMom > 0 ? STATUS_META.pending_mom.dot : STATUS_META.upcoming.dot
                            }`} />
                            {allDone ? 'Completed' : summary.pendingMom > 0 ? `${summary.pendingMom} Pending MOM` : 'Scheduled'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Six-period trend — every week/month side by side in one grid */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-800">Last 6 {gran === 'weekly' ? 'weeks' : 'months'}</h3>
              <p className="text-[11px] text-slate-500">Completed / total meetings per team. The highlighted column is the one selected above.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wide sticky left-0 bg-slate-50">Team</th>
                    {trend.map(c => (
                      <th key={c.key} className={`px-3 py-3 text-center text-[10px] font-bold uppercase tracking-wide ${c.isSelected ? 'text-blue-700 bg-blue-50' : 'text-slate-500'}`}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {trendTeams.length === 0 ? (
                    <tr><td colSpan={trend.length + 1} className="px-4 py-12 text-center text-sm text-slate-400">
                      No meetings in the last 6 {gran === 'weekly' ? 'weeks' : 'months'}.
                    </td></tr>
                  ) : trendTeams.map(t => (
                    <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-2.5 text-xs font-semibold text-slate-800 whitespace-nowrap sticky left-0 bg-white">{t.name}</td>
                      {trend.map(c => {
                        const rows = c.rows.filter(m => m.team.id === t.id);
                        const done = rows.filter(m => m.status === 'completed').length;
                        return (
                          <td key={c.key} className={`px-3 py-2.5 text-center ${c.isSelected ? 'bg-blue-50/50' : ''}`}>
                            {rows.length === 0 ? <span className="text-slate-200 text-xs">·</span> : (
                              <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold tabular-nums ${
                                done === rows.length ? 'bg-emerald-100 text-emerald-700' : done > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                              }`}>{done}/{rows.length}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                {trendTeams.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-200">
                      <td className="px-4 py-2.5 text-[11px] font-bold text-slate-600 sticky left-0 bg-slate-50">All teams</td>
                      {trend.map(c => (
                        <td key={c.key} className={`px-3 py-2.5 text-center text-[11px] font-bold text-slate-700 tabular-nums ${c.isSelected ? 'bg-blue-50' : ''}`}>
                          {c.summary.total === 0 ? <span className="text-slate-300">·</span> : `${c.summary.completed}/${c.summary.total}`}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {modal && activeMeeting && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/40" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  {modal.type === 'view' ? 'Meeting Details' : modal.type === 'attendance' ? 'Mark Attendance' : modal.type === 'mom' ? 'Minutes of Meeting (MOM)' : 'Update Meeting Progress'}
                </h3>
                <p className="text-[11px] text-slate-500">{activeMeeting.teamName} · {prettyDate(activeMeeting.date)} · {activeMeeting.startTime}</p>
              </div>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X size={18} /></button>
            </div>

            <div className="p-5 overflow-y-auto">
              {/* View / Review */}
              {modal.type === 'view' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { k: 'Department', v: activeMeeting.department },
                      { k: 'Level', v: activeMeeting.subDepartment ? `${activeMeeting.department} › ${activeMeeting.subDepartment}` : activeMeeting.department },
                      { k: 'Leader', v: activeMeeting.leader || '—' },
                      { k: 'Advisor', v: activeMeeting.advisor },
                      { k: 'Coordinator', v: activeMeeting.coordinator },
                      { k: 'Meeting Type', v: activeMeeting.meetingType },
                      { k: 'Venue', v: activeMeeting.venue },
                      { k: 'Actual Step', v: activeMeeting.actualStep },
                    ].map(f => (
                      <div key={f.k} className="bg-slate-50 rounded-lg px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{f.k}</p>
                        <p className="text-xs text-slate-700 font-medium mt-0.5">{f.v}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Attendance</span>
                    <span className="font-medium text-slate-700">{activeMeeting.attendanceMarked ? `${activeMeeting.presentCount}/${activeMeeting.totalMembers} present` : 'Not marked'}</span>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1"><span className="text-slate-500">Progress</span><span className="font-medium text-slate-700">{activeMeeting.progress}%</span></div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${activeMeeting.progress >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${activeMeeting.progress}%` }} /></div>
                  </div>

                  {/* Plan vs Actual — auto-updated after the meeting completes */}
                  <div className="rounded-lg border border-slate-200 overflow-hidden">
                    <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center justify-between">
                      <span>Plan vs Actual</span>
                      <span className="text-[9px] font-medium text-slate-400 normal-case">{activeMeeting.source === 'scheduled' ? 'From published schedule' : 'Default schedule'}</span>
                    </div>
                    <table className="w-full text-xs">
                      <tbody className="divide-y divide-slate-100">
                        <tr><td className="px-3 py-1.5 text-slate-500 w-24">Meeting</td><td className="px-3 py-1.5 text-slate-600">Plan: {prettyDate(activeMeeting.date)} · {activeMeeting.startTime}</td><td className="px-3 py-1.5 font-medium text-slate-700">{activeMeeting.status === 'completed' ? 'Actual: Held' : activeMeeting.status === 'pending_mom' ? 'Actual: Held' : 'Actual: —'}</td></tr>
                        <tr><td className="px-3 py-1.5 text-slate-500">Attendance</td><td className="px-3 py-1.5 text-slate-600">Plan: {activeMeeting.totalMembers} members</td><td className="px-3 py-1.5 font-medium text-slate-700">{activeMeeting.attendanceMarked ? `Actual: ${activeMeeting.presentCount}/${activeMeeting.totalMembers}` : 'Actual: —'}</td></tr>
                        <tr><td className="px-3 py-1.5 text-slate-500">MOM</td><td className="px-3 py-1.5 text-slate-600">Plan: required</td><td className={`px-3 py-1.5 font-medium ${activeMeeting.momSubmitted ? 'text-emerald-600' : 'text-amber-600'}`}>{activeMeeting.momSubmitted ? 'Actual: Submitted' : 'Actual: Pending'}</td></tr>
                        <tr><td className="px-3 py-1.5 text-slate-500">Step</td><td className="px-3 py-1.5 text-slate-600">Plan: per workflow</td><td className="px-3 py-1.5 font-medium text-slate-700">Actual: {activeMeeting.actualStep}</td></tr>
                      </tbody>
                    </table>
                  </div>

                  {(activeMeeting.agenda || activeMeeting.instructions) && (
                    <div className="space-y-2">
                      {activeMeeting.agenda && <div><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Agenda</p><p className="text-xs text-slate-600 whitespace-pre-wrap">{activeMeeting.agenda}</p></div>}
                      {activeMeeting.instructions && <div><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Instructions</p><p className="text-xs text-slate-600 whitespace-pre-wrap">{activeMeeting.instructions}</p></div>}
                    </div>
                  )}
                  {exec[activeMeeting.id]?.mom ? (
                    <div className="border border-slate-200 rounded-lg p-3 space-y-2">
                      <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5"><ClipboardCheck size={13} className="text-emerald-600" /> Minutes of Meeting</p>
                      {(['agenda', 'discussion', 'decisions'] as const).map(k => (
                        <div key={k}><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{k}</p><p className="text-xs text-slate-600 whitespace-pre-wrap">{exec[activeMeeting.id]!.mom![k] || '—'}</p></div>
                      ))}
                      <div><p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Next meeting</p><p className="text-xs text-slate-600">{exec[activeMeeting.id]!.mom!.nextDate || '—'}</p></div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"><AlertCircle size={14} /> MOM not submitted yet.</div>
                  )}
                </div>
              )}

              {/* Attendance */}
              {modal.type === 'attendance' && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">Toggle members present at this meeting.</p>
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-72 overflow-y-auto">
                    {activeMeeting.team.members.filter(m => m.isActive).map(mm => {
                      const present = attendanceDraft.includes(mm.memberId);
                      return (
                        <label key={mm.memberId} className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-50">
                          <span className="text-sm text-slate-700">{mm.memberName}</span>
                          <input type="checkbox" checked={present} onChange={() => setAttendanceDraft(prev => present ? prev.filter(id => id !== mm.memberId) : [...prev, mm.memberId])} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500" />
                        </label>
                      );
                    })}
                    {activeMeeting.team.members.filter(m => m.isActive).length === 0 && <p className="px-3 py-4 text-xs text-slate-400">No active members.</p>}
                  </div>
                  <p className="text-xs text-slate-500">{attendanceDraft.length}/{activeMeeting.totalMembers} present</p>
                </div>
              )}

              {/* MOM */}
              {modal.type === 'mom' && (
                <div className="space-y-3">
                  {(['agenda', 'discussion', 'decisions'] as const).map(k => (
                    <div key={k}>
                      <label className="block text-xs font-semibold text-slate-600 mb-1 capitalize">{k}{k === 'agenda' && <span className="text-red-500"> *</span>}</label>
                      <textarea value={momDraft[k]} onChange={e => { setMomDraft(d => ({ ...d, [k]: e.target.value })); if (k === 'agenda') setMomError(''); }} rows={k === 'discussion' ? 3 : 2} placeholder={`Enter ${k}…`}
                        className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none ${k === 'agenda' && momError ? 'border-red-400' : 'border-slate-200'}`} />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Next meeting date</label>
                    <input type="date" value={momDraft.nextDate} onChange={e => setMomDraft(d => ({ ...d, nextDate: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  {momError && <p className="flex items-center gap-1.5 text-xs font-medium text-red-600"><AlertCircle size={13} /> {momError}</p>}
                </div>
              )}

              {/* Progress */}
              {modal.type === 'progress' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between"><span className="text-sm text-slate-600">Meeting progress</span><span className="text-lg font-bold text-slate-800">{progressDraft}%</span></div>
                  <input type="range" min={0} max={100} step={5} value={progressDraft} onChange={e => setProgressDraft(Number(e.target.value))} className="w-full accent-blue-600" />
                  <div className="flex gap-2">
                    {[0, 25, 50, 75, 100].map(v => (
                      <button key={v} onClick={() => setProgressDraft(v)} className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${progressDraft === v ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{v}%</button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100">Close</button>
              {modal.type === 'attendance' && <button onClick={saveAttendance} className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">Save Attendance</button>}
              {modal.type === 'mom' && <button onClick={saveMom} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg">Submit MOM</button>}
              {modal.type === 'progress' && <button onClick={saveProgress} className="px-4 py-2 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg">Save Progress</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
