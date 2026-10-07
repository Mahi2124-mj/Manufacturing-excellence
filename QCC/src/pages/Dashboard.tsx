import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Users, FolderKanban, Clock, CheckCircle2, AlertTriangle,
  TrendingUp, ArrowUpRight, ArrowDownRight, Calendar, Filter, RefreshCw, Plus, FileText,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, Area, AreaChart, Legend, LabelList, PieChart, Pie,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import HeaderPortal from '../components/layout/HeaderPortal';
import { useHalfYear } from '../lib/halfYear';
import { useHierarchy } from '../lib/hierarchy';
import { useActivitySteps } from '../lib/activitySteps';
import { useMeetingSchedules, computeScheduleDate } from '../lib/meetingSchedules';
import type { Team, QCCProject, Department, DashboardStats } from '../types';

export default function Dashboard() {
  const navigate = useNavigate();
  const hy = useHalfYear();
  const hierarchy = useHierarchy();
  const { workflowSteps } = useActivitySteps();   // same step config that drives QCC Workflow
  const { schedules } = useMeetingSchedules();     // Admin → Meeting Schedule (for the Upcoming Meetings card)
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');

  const [stats, setStats] = useState<DashboardStats>({
    totalTeams: 0, activeProjects: 0, overdueActions: 0,
    pendingApprovals: 0, completedProjects: 0, totalSavings: 0,
  });
  const [teams, setTeams] = useState<Team[]>([]);
  const [projects, setProjects] = useState<QCCProject[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([api.dashboardStats(), api.listTeams(), api.listProjects(), api.listDepartments()])
      .then(([s, t, p, d]) => {
        if (cancelled) return;
        setStats(s); setTeams(t); setProjects(p); setDepartments(d);
      })
      .catch(e => { if (!cancelled) setError(e instanceof ApiError ? e.message : 'Failed to load dashboard'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { hy.registerDates([...teams.map(t => t.createdAt), ...projects.map(p => p.startedAt)]); }, [teams, projects]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scope teams & projects to the active period (header switcher).
  const hyTeams = useMemo(() => teams.filter(t => hy.isTeamActive(t.id, t.createdAt)), [teams, hy]);
  const hyProjects = useMemo(() => projects.filter(p => hy.isProjectActive(p.teamId, p.startedAt)), [projects, hy]);

  // ── Team Involvement (masterlist) — level from Team Evaluation, improvement from Team Assessment ──
  const teamLevels = useMemo<Record<string, string>>(() => { try { return JSON.parse(localStorage.getItem('qcc-eval-team-levels') || '{}'); } catch { return {}; } }, []);
  const assessSummary = useMemo<Record<string, { improvement: number }>>(() => { try { return JSON.parse(localStorage.getItem('qcc-assessment-summary-v1') || '{}'); } catch { return {}; } }, []);
  const involvement = useMemo(() => hyTeams.map(t => ({
    id: t.id, name: t.name, theme: t.projectTitle || '—', department: t.department,
    level: teamLevels[t.id] || 'Staff',
    members: t.members.filter(m => m.isActive).length,
    improvement: assessSummary[t.id]?.improvement,
  })), [hyTeams, teamLevels, assessSummary]);
  const staffCount = involvement.filter(i => i.level === 'Staff').length;
  const associateCount = involvement.filter(i => i.level === 'Associate').length;
  // Team Involvement — filtered to the level picked in its own dropdown.
  const [involvementLevel, setInvolvementLevel] = useState<'Staff' | 'Associate'>('Staff');
  const involvementChart = useMemo(() => involvement
    .filter(r => r.level === involvementLevel)
    .map(r => ({
      name: r.name.length > 12 ? r.name.slice(0, 12) + '…' : r.name,
      fullName: r.name, theme: r.theme, department: r.department, level: r.level, members: r.members,
      improvement: r.improvement ?? 0, assessed: r.improvement !== undefined,
    })), [involvement, involvementLevel]);

  // Improvement pie — filtered to the level picked in the dropdown.
  const [improvementLevel, setImprovementLevel] = useState<'Staff' | 'Associate'>('Staff');
  const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ef4444', '#14b8a6', '#f97316', '#6366f1', '#e11d48'];
  const improvementPie = useMemo(
    () => involvement.filter(i => i.level === improvementLevel && (i.improvement ?? 0) > 0).map(i => ({ name: i.name, value: i.improvement as number })),
    [involvement, improvementLevel],
  );

  // ── Stage-wise distribution ──────────────────────────────────────────
  // X axis = the QCC Workflow's steps, Y axis = teams. Each bar is stacked into the
  // teams that have already CLEARED that step and the teams sitting ON it right now, so
  // the chart shows how far every team has got, not only where it stopped.
  //
  // Both numbers come from the workflow step rows in the database — the same rows the
  // QCC Workflow writes on every save / submit / approve — so filling a step in the
  // workflow moves the teams along this chart.
  const stageData = useMemo(() => {
    const filteredTeams = selectedDepartment === 'all'
      ? hyTeams
      : hyTeams.filter(t => t.department === selectedDepartment);
    // Steps come from Admin → Activity Steps (the same config the QCC Workflow renders).
    const stepCount = workflowSteps.length || 8;

    // How many steps a team has finished, and which step it stands on now. "Cleared" is
    // an approved step; the current step is the first one still waiting for approval —
    // exactly the step the QCC Workflow leaves unlocked for that team.
    const progressOfTeam = (teamId: string): { cleared: number; current: number } => {
      const proj = hyProjects.find(p => p.teamId === teamId);
      if (!proj) return { cleared: 0, current: 1 };  // registered but no project yet
      const steps = [...proj.steps].sort((a, b) => a.stepNumber - b.stepNumber);
      const cleared = steps.filter(s => s.status === 'approved').length;
      const pending = steps.find(s => s.status !== 'approved');
      return {
        cleared: Math.min(cleared, stepCount),
        // Every step approved → the team has finished; it no longer stands on a step.
        current: pending ? Math.min(pending.stepNumber, stepCount) : 0,
      };
    };

    const teamProgress = filteredTeams.map(t => ({ team: t, ...progressOfTeam(t.id) }));
    const brief = (t: Team, cleared: number) => ({
      id: t.id, name: t.name, department: t.department, leader: t.leaderName,
      project: t.projectTitle, cleared,
    });

    return Array.from({ length: stepCount }, (_, i) => i + 1).map(s => {
      const onStep = teamProgress.filter(x => x.current === s);
      const clearedStep = teamProgress.filter(x => x.cleared >= s);
      return {
        stage: `Step ${s}`,
        title: workflowSteps[s - 1]?.title || `Step ${s}`,
        cleared: clearedStep.length,          // teams that have crossed this step
        count: onStep.length,                 // teams working on it right now
        reached: clearedStep.length + onStep.length,
        teams: onStep.map(x => brief(x.team, x.cleared)),
        clearedTeams: clearedStep.map(x => brief(x.team, x.cleared)),
      };
    });
  }, [selectedDepartment, hyTeams, hyProjects, workflowSteps]);

  // Department-wise teams & projects, straight from the records: teams as registered in
  // Team Registration and projects as listed in QCC Projects, both already scoped to the
  // selected QCC period. A project is counted under its own team's department so the two
  // bars in a column always describe the same group.
  const deptData = useMemo(() => {
    const rows = new Map<string, { name: string; teams: number; projects: number }>();
    const row = (dept: string) => {
      const key = dept || 'Unassigned';
      if (!rows.has(key)) rows.set(key, { name: key, teams: 0, projects: 0 });
      return rows.get(key)!;
    };

    hyTeams.forEach(t => { row(t.department).teams += 1; });
    hyProjects.forEach(p => {
      const team = hyTeams.find(t => t.id === p.teamId);
      row(team?.department || p.department).projects += 1;
    });

    // Busiest departments first; a department with nothing in it is not worth a column.
    return [...rows.values()]
      .filter(d => d.teams > 0 || d.projects > 0)
      .sort((a, b) => (b.teams - a.teams) || (b.projects - a.projects) || a.name.localeCompare(b.name));
  }, [hyTeams, hyProjects]);

  const monthlyTrend = [
    { month: 'Jan', projects: 1, completions: 0 }, { month: 'Feb', projects: 2, completions: 0 },
    { month: 'Mar', projects: 3, completions: 0 }, { month: 'Apr', projects: 4, completions: 1 },
    { month: 'May', projects: 4, completions: 1 }, { month: 'Jun', projects: 5, completions: 2 },
    { month: 'Jul', projects: 5, completions: 2 }, { month: 'Aug', projects: 5, completions: 3 },
  ];

  const statusDistribution = [
    { name: 'In Progress', value: hyProjects.filter(p => p.status === 'in_progress').length, color: '#3b82f6' },
    { name: 'Completed', value: hyProjects.filter(p => p.status === 'completed').length, color: '#10b981' },
    { name: 'On Hold', value: hyProjects.filter(p => p.status === 'on_hold').length, color: '#f59e0b' },
  ];
  const statusTotal = statusDistribution.reduce((sum, s) => sum + s.value, 0);
  const statusSorted = [...statusDistribution].sort((a, b) => b.value - a.value);
  const statusPieData = statusSorted.filter(s => s.value > 0);

  const activeSteps = stageData.filter(s => s.count > 0).length;

  // Stage chart hover card. `closeTimer` gives the pointer a moment to travel from a
  // bar onto the card; entering the card cancels it, so the card can be read and
  // scrolled. Leaving the card (or the chart, without arriving) closes it.
  const [stageHover, setStageHover] = useState<{ index: number; x: number } | null>(null);
  const stageCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelStageClose = () => {
    if (stageCloseTimer.current) { clearTimeout(stageCloseTimer.current); stageCloseTimer.current = null; }
  };
  const scheduleStageClose = () => {
    cancelStageClose();
    stageCloseTimer.current = setTimeout(() => setStageHover(null), 260);
  };
  useEffect(() => cancelStageClose, []);
  const hoveredStage = stageHover ? stageData[stageHover.index] : null;

  // Step 1's "cleared" count is every team that finished step 1, step 2's is every team
  // that finished step 2, and so on — adding them up gives the total steps cleared.
  const avgStepsCleared = useMemo(() => {
    const teamCount = stageData[0] ? stageData[0].cleared + stageData[0].count : 0;
    if (!teamCount) return '0';
    const totalCleared = stageData.reduce((sum, s) => sum + s.cleared, 0);
    return (totalCleared / teamCount).toFixed(1);
  }, [stageData]);
  const peakActive = Math.max(0, ...monthlyTrend.map(m => m.projects));

  // Total Savings comes from Step 8 (Overall Benefits → tangible / total cost saving) of the
  // QCC Workflow — sum each project's saved yearly savings; fall back to the project's own
  // savings figure only when that step hasn't been filled yet.
  const benefitsIndex = useMemo(() => {
    const i = workflowSteps.findIndex(s => s.workflowKey === 'benefits');
    return i >= 0 ? i : Math.max(0, (workflowSteps.length || 8) - 1);
  }, [workflowSteps]);
  const stepEightSavings = useMemo(() => hyProjects.reduce((total, p) => {
    try {
      const raw = localStorage.getItem(`qcc-overall-benefits-v2-${p.id}`);
      if (!raw) return total;
      const rows = JSON.parse(raw).tangible;
      if (!Array.isArray(rows)) return total;
      return total + rows.reduce((s: number, r: { yearlySaving?: string }) => s + (parseFloat(String(r.yearlySaving ?? '').replace(/[^0-9.-]/g, '')) || 0), 0);
    } catch { return total; }
  }, 0), [hyProjects]);
  const totalSavings = stepEightSavings > 0 ? stepEightSavings : hyProjects.reduce((s, p) => s + (p.savings || 0), 0);
  const openBenefitsStep = () => { try { localStorage.setItem('qcc-workflow-step', String(benefitsIndex)); } catch { /* ignore */ } navigate('/workflow'); };
  const openCompletedProjects = () => { try { localStorage.setItem('qcc-projects-status', 'completed'); } catch { /* ignore */ } navigate('/projects'); };

  // KPI cards — soft pastel gradient cards with a white icon box + big value + corner sparkline.
  const statCards: { label: string; value: number | string; icon: ReactNode; accent: string; sub: string; to?: string; onClick?: () => void }[] = [
    { label: 'Registered Teams', value: hyTeams.length, icon: <Users size={20} />, accent: 'violet', sub: 'total teams', to: '/team-registration' },
    { label: 'Active Projects', value: hyProjects.filter(p => p.status === 'in_progress').length, icon: <FolderKanban size={20} />, accent: 'emerald', sub: 'in progress', to: '/projects' },
    { label: 'Overdue Actions', value: stats.overdueActions, icon: <Clock size={20} />, accent: 'blue', sub: 'need attention', to: '/actions' },
    { label: 'Pending Approvals', value: stats.pendingApprovals, icon: <AlertTriangle size={20} />, accent: 'amber', sub: 'awaiting review', to: '/approvals' },
    { label: 'Completed', value: hyProjects.filter(p => p.status === 'completed').length, icon: <CheckCircle2 size={20} />, accent: 'cyan', sub: 'projects done', onClick: openCompletedProjects },
    { label: 'Total Savings', value: `₹${(totalSavings / 1000).toFixed(0)}K`, icon: <TrendingUp size={20} />, accent: 'rose', sub: 'from Step 8 benefits', onClick: openBenefitsStep },
  ];

  const KPI_ACCENT: Record<string, { bg: string; icon: string; spark: string }> = {
    violet:  { bg: 'from-violet-200 to-violet-100',   icon: 'text-violet-700',  spark: '#8b5cf6' },
    emerald: { bg: 'from-emerald-200 to-emerald-100', icon: 'text-emerald-700', spark: '#10b981' },
    blue:    { bg: 'from-blue-200 to-blue-100',       icon: 'text-blue-700',    spark: '#3b82f6' },
    amber:   { bg: 'from-amber-200 to-amber-100',     icon: 'text-amber-700',   spark: '#f59e0b' },
    cyan:    { bg: 'from-cyan-200 to-cyan-100',       icon: 'text-cyan-700',    spark: '#06b6d4' },
    rose:    { bg: 'from-rose-200 to-rose-100',       icon: 'text-rose-700',    spark: '#f43f5e' },
  };

  // ── Project-based KPIs for the quick cards (scoped to the active period) ──
  const activeProjects = hyProjects.filter(p => p.status === 'in_progress');
  const todayISO = new Date().toISOString().slice(0, 10);
  // On-Time / Delayed use the SAME rule as the Approvals → Activity Plan matrix: a team is
  // "done" when completed or all steps approved; "delayed" when not done and past its target.
  const isDone = (p: QCCProject) => p.status === 'completed' || (p.steps.length > 0 && p.steps.every(s => s.status === 'approved'));
  const isOverdue = (p: QCCProject) => !isDone(p) && !!p.targetCompletion && p.targetCompletion.slice(0, 10) < todayISO;
  const delayedTeams = hyProjects.filter(isOverdue).length;
  const onTimeTeams = hyProjects.filter(p => !isOverdue(p)).length;
  const avgProgress = activeProjects.length
    ? Math.round(activeProjects.reduce((sum, p) => {
        const steps = p.steps || [];
        const done = steps.filter(st => st.status === 'approved').length;
        return sum + (steps.length ? (done / steps.length) * 100 : 0);
      }, 0) / activeProjects.length)
    : 0;

  // Upcoming meetings = schedules whose computed date is today or later (Admin → Meeting Schedule).
  const upcomingMeetings = useMemo(() =>
    schedules.filter(s => { const d = computeScheduleDate(s); return d != null && d >= todayISO; }).length,
    [schedules, todayISO]);
  // On-Time / Delayed open the Activity Plan tab of Approvals; Upcoming opens Admin → Meeting Schedule.
  const goActivityPlan = () => { try { localStorage.setItem('qcc-approvals-tab', 'activity'); } catch { /* ignore */ } navigate('/approvals'); };
  const goMeetingSchedule = () => { try { localStorage.setItem('qcc-admin-tab', 'meetingSchedule'); } catch { /* ignore */ } navigate('/admin'); };

  const quickCards: { label: string; value: number | string | null; sub: string; cta?: string; onClick?: () => void; icon: ReactNode; tint: string; color: string }[] = [
    { label: 'On-Time Teams', value: onTimeTeams, sub: 'On schedule (Activity Plan)', cta: 'View Activity Plan', onClick: goActivityPlan, icon: <CheckCircle2 size={18} />, tint: '#ecfdf5', color: '#10b981' },
    { label: 'Delayed Teams', value: delayedTeams, sub: 'Past target (Activity Plan)', cta: 'View Activity Plan', onClick: goActivityPlan, icon: <AlertTriangle size={18} />, tint: '#fef2f2', color: '#ef4444' },
    { label: 'Upcoming Meetings', value: upcomingMeetings, sub: 'Scheduled meetings', cta: 'Meeting Schedule', onClick: goMeetingSchedule, icon: <Calendar size={18} />, tint: '#eff6ff', color: '#3b82f6' },
    { label: 'Avg Progress', value: `${avgProgress}%`, sub: 'Across active projects', icon: <TrendingUp size={18} />, tint: '#f5f3ff', color: '#8b5cf6' },
  ];

  // Hover card for the stage chart. Rendered by us (not by Recharts) so it can hold
  // still, be moved onto, and be scrolled — see stageHover below.
  const StageHoverCard = ({ data }: { data: typeof stageData[number] }) => (
    <div className="bg-white p-4 rounded-lg shadow-xl border border-slate-200 w-72">
      <p className="font-semibold text-slate-800">{data.stage}</p>
      <p className="text-xs text-slate-500 mb-2">{data.title}</p>
      <div className="flex items-center gap-4 mb-3 text-sm">
        <span className="inline-flex items-center gap-1.5 text-slate-600">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
          <span className="font-medium">{data.cleared}</span> cleared
        </span>
        <span className="inline-flex items-center gap-1.5 text-slate-600">
          <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
          <span className="font-medium">{data.count}</span> on this step
        </span>
      </div>
      {data.teams.length > 0 && (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Working on this step:</p>
          {data.teams.map((team: any) => (
            <div key={team.id} className="text-xs border-l-2 border-blue-400 pl-2 py-1">
              <p className="font-medium text-slate-700">{team.name}</p>
              <p className="text-slate-500">{team.department}</p>
              <p className="text-slate-500">Leader: {team.leader}</p>
              {team.project && <p className="text-slate-500 italic truncate">"{team.project}"</p>}
            </div>
          ))}
        </div>
      )}
      {data.clearedTeams.length > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-100 max-h-40 overflow-y-auto">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Already cleared this step:</p>
          {data.clearedTeams.map((team: any) => (
            <div key={team.id} className="text-xs border-l-2 border-emerald-400 pl-2 py-1">
              <p className="font-medium text-slate-700">{team.name}</p>
              <p className="text-slate-500">{team.department} · {team.cleared} step{team.cleared !== 1 ? 's' : ''} cleared</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const TeamInvTooltip = ({ active, payload }: any) => {
    if (active && payload?.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-slate-200 max-w-xs">
          <p className="font-semibold text-slate-800">{d.fullName}</p>
          {d.theme && d.theme !== '—' && <p className="text-[11px] text-slate-500 italic mb-1">"{d.theme}"</p>}
          <div className="text-[11px] text-slate-600 space-y-0.5">
            <div>Department: <b className="text-slate-700">{d.department}</b></div>
            <div>Level: <b className={d.level === 'Associate' ? 'text-amber-700' : 'text-blue-700'}>{d.level}</b></div>
            <div>Members involved: <b className="text-slate-700">{d.members}</b></div>
            <div>Improvement: {d.assessed ? <b className={d.improvement > 0 ? 'text-emerald-700' : d.improvement < 0 ? 'text-red-700' : 'text-slate-700'}>{d.improvement}%</b> : <span className="text-slate-400">not assessed yet</span>}</div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {error && <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      {loading && <div className="px-4 py-2 text-xs text-slate-500">Loading live data…</div>}

      {/* Actions injected into the header bar */}
      <HeaderPortal>
        <button onClick={() => navigate('/actions')} className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors">
          <Plus size={16} /> Add Task
        </button>
        <button onClick={() => navigate('/reports')} className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg shadow-sm hover:bg-slate-50 transition-colors">
          <FileText size={16} /> Generate Report
        </button>
      </HeaderPortal>

      {/* ── KPI row (6 soft pastel gradient cards) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {statCards.map((card, i) => {
          const a = KPI_ACCENT[card.accent] || KPI_ACCENT.violet;
          return (
            <button
              key={i}
              type="button"
              onClick={() => (card.onClick ? card.onClick() : card.to && navigate(card.to))}
              title={`View ${card.label}`}
              className={`relative overflow-hidden text-left rounded-2xl p-4 bg-gradient-to-br ${a.bg} border border-white/60 shadow-sm hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-400 transition-all cursor-pointer`}
            >
              <span className={`w-10 h-10 rounded-xl bg-white/70 ${a.icon} flex items-center justify-center shadow-sm mb-3`}>{card.icon}</span>
              <p className="text-2xl font-bold text-slate-900 leading-tight">{card.value}</p>
              <p className="text-sm font-semibold text-slate-700 mt-0.5">{card.label}</p>
              <p className="text-[11px] text-slate-500">{card.sub}</p>
              <svg className="absolute bottom-2.5 right-2.5 w-20 h-9" viewBox="0 0 80 32" preserveAspectRatio="none" aria-hidden="true">
                <path d="M0,24 L11,17 L23,21 L34,11 L46,19 L57,8 L69,14 L80,6" fill="none" stroke={a.spark} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          );
        })}
      </div>

      {/* ── Charts (2 per row) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Project Status Distribution */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 flex flex-col">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Project Status Distribution</h3>
          <div className="flex-1 flex items-center justify-center gap-6 flex-wrap">
            <div className="relative flex-shrink-0" style={{ width: 170, height: 170 }}>
              <svg viewBox="0 0 170 170" width="170" height="170">
                <circle cx="85" cy="85" r="60" fill="none" stroke="#eef2f7" strokeWidth="18" />
                {(() => {
                  let acc = 0;
                  return statusPieData.map((s, i) => {
                    const pct = statusTotal > 0 ? (s.value / statusTotal) * 100 : 0;
                    const el = (
                      <circle key={i} cx="85" cy="85" r="60" fill="none" stroke={s.color} strokeWidth="18"
                        pathLength={100} strokeDasharray={`${Math.max(pct - 2, 0.5)} 100`} strokeDashoffset={-acc}
                        transform="rotate(-90 85 85)" />
                    );
                    acc += pct;
                    return el;
                  });
                })()}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-3xl font-bold text-slate-800 leading-none">{statusTotal}</span>
                <span className="text-[11px] text-slate-500 mt-1">Total Projects</span>
              </div>
            </div>
            <div className="space-y-3">
              {statusSorted.map((s, i) => {
                const pct = statusTotal > 0 ? Math.round((s.value / statusTotal) * 100) : 0;
                return (
                  <div key={i} className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-sm text-slate-600 w-20">{s.name}</span>
                    <span className="text-sm font-semibold text-slate-800">{pct}%</span>
                    <span className="text-xs text-slate-400">({s.value})</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5"><RefreshCw size={12} className="text-slate-400" /> Last updated: just now</span>
          </div>
        </div>

        {/* Stage-wise Distribution */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h3 className="text-sm font-semibold text-slate-800">Stage-wise Distribution</h3>
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-slate-400" />
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="all">All Departments</option>
                {hierarchy.departments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
              </select>
            </div>
          </div>
          <div className="flex-1 relative">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stageData} margin={{ top: 5, right: 5, left: 0, bottom: 18 }}
                onMouseMove={(s: any) => {
                  // Recharts 3 reports the active index as a STRING ("0", "1", ...), so it
                  // has to be parsed rather than type-checked as a number.
                  const idx = Number(s?.activeTooltipIndex);
                  if (Number.isInteger(idx) && idx >= 0 && idx < stageData.length) {
                    cancelStageClose();
                    setStageHover({ index: idx, x: s.activeCoordinate?.x ?? 0 });
                  }
                }}
                onMouseLeave={scheduleStageClose}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="stage" tick={{ fontSize: 10, fill: '#64748b' }} interval={0}
                  label={{ value: 'Workflow Step', position: 'insideBottom', offset: -14, fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false}
                  label={{ value: 'Teams', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#94a3b8' }} />
                {/* Recharts' own tooltip is off: it tracks the cursor, so moving onto it
                    to scroll would swap in whichever bar the pointer crossed. Only its
                    column highlight is kept, via an empty tooltip. */}
                <Tooltip content={() => null} cursor={{ fill: '#f8fafc' }} />
                <Legend verticalAlign="top" height={28} iconType="square" iconSize={9}
                  wrapperStyle={{ fontSize: 11, color: '#64748b' }} />
                {/* Stacked: how many teams got past this step, plus who is on it now. */}
                <Bar dataKey="cleared" name="Cleared" stackId="teams" fill="#10b981" animationDuration={800} />
                <Bar dataKey="count" name="On this step" stackId="teams" fill="#3b82f6" radius={[8, 8, 0, 0]} animationDuration={800} />
              </BarChart>
            </ResponsiveContainer>

            {hoveredStage && (
              <div
                className="absolute top-0 z-20"
                // Follows the bar horizontally, but stays pinned to the top of the chart so
                // the pointer never has to cross another bar to reach it.
                style={{ left: `min(max(${stageHover!.x - 40}px, 0px), calc(100% - 18rem))` }}
                onMouseEnter={cancelStageClose}
                onMouseLeave={scheduleStageClose}
              >
                <StageHoverCard data={hoveredStage} />
              </div>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-around text-sm">
            <span className="text-slate-500">Total Steps <strong className="text-slate-800 ml-1">{stageData.length}</strong></span>
            <span className="text-slate-500">Active Steps <strong className="text-blue-700 ml-1">{activeSteps}</strong></span>
            <span className="text-slate-500">Avg Steps Cleared <strong className="text-emerald-700 ml-1">{avgStepsCleared}</strong></span>
          </div>
        </div>

        {/* Monthly Project Trend */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 flex flex-col">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Monthly Project Trend</h3>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Area type="monotone" dataKey="projects" stroke="#3b82f6" fill="#dbeafe" strokeWidth={2} name="Active Projects" />
                <Area type="monotone" dataKey="completions" stroke="#10b981" fill="#d1fae5" strokeWidth={2} name="Completions" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-around text-sm">
            <span className="text-slate-500">Peak Active <strong className="text-slate-800 ml-1">{peakActive}</strong></span>
            <span className="text-slate-500">Total Completed <strong className="text-emerald-700 ml-1">{stats.completedProjects}</strong></span>
          </div>
        </div>
        {/* Department-wise Teams & Projects */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 flex flex-col">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Department-wise Teams & Projects</h3>
          {/* With every real department shown this can outgrow the card, so it scrolls
              sideways instead of squeezing the labels into illegible stubs. */}
          <div className="flex-1 overflow-x-auto">
            <div style={{ minWidth: `${Math.max(deptData.length * 62, 320)}px` }}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={deptData} margin={{ top: 5, right: 5, left: 0, bottom: 58 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} interval={0}
                  angle={-40} textAnchor="end" height={70} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '11px' }} verticalAlign="top" height={24} />
                <Bar dataKey="teams" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Teams" />
                <Bar dataKey="projects" fill="#10b981" radius={[4, 4, 0, 0]} name="Projects" />
              </BarChart>
            </ResponsiveContainer>
            </div>
          </div>
          {/* Totals of what the chart is showing: this period's teams and projects. */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-around text-xs">
            <span className="text-slate-500">Departments <strong className="text-slate-800 ml-1">{deptData.length}</strong></span>
            <span className="text-slate-500">Teams <strong className="text-slate-800 ml-1">{hyTeams.length}</strong></span>
            <span className="text-slate-500">Projects <strong className="text-slate-800 ml-1">{hyProjects.length}</strong></span>
          </div>
        </div>
      </div>

      {/* ── Team Involvement (bar) + Improvement by level (pie + dropdown) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Team Involvement — members involved per team, coloured by level */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Users size={16} className="text-blue-600" /> Team Involvement <span className="text-[11px] font-normal text-slate-400">({involvementLevel === 'Staff' ? staffCount : associateCount} {involvementLevel})</span></h3>
            <select
              value={involvementLevel}
              onChange={e => setInvolvementLevel(e.target.value as 'Staff' | 'Associate')}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium bg-white outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="Staff">Staff ({staffCount})</option>
              <option value="Associate">Associate ({associateCount})</option>
            </select>
          </div>
          <div className="p-4">
            {involvementChart.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-sm text-slate-400 text-center px-6">No {involvementLevel} teams for this QCC period.</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={involvementChart} margin={{ top: 24, right: 10, left: 0, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-15} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                  <Tooltip content={<TeamInvTooltip />} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="members" name="Members involved" radius={[4, 4, 0, 0]} barSize={30}>
                    {involvementChart.map((d, i) => <Cell key={i} fill={d.level === 'Associate' ? '#f59e0b' : '#3b82f6'} />)}
                    <LabelList dataKey="members" position="top" fill="#475569" fontSize={10} fontWeight="bold" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Improvement by level — pie, filtered by the Staff/Associate dropdown */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><TrendingUp size={16} className="text-emerald-600" /> Improvement <span className="text-[11px] font-normal text-slate-400">(Before → After)</span></h3>
            <select
              value={improvementLevel}
              onChange={e => setImprovementLevel(e.target.value as 'Staff' | 'Associate')}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium bg-white outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="Staff">Staff</option>
              <option value="Associate">Associate</option>
            </select>
          </div>
          <div className="p-4">
            {improvementPie.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-sm text-slate-400 text-center px-6">No assessed {improvementLevel} teams yet — improvement comes from Team Assessment (Before → After).</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={improvementPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={100} paddingAngle={2} label={({ name, value }: any) => `${name}: ${value}%`} labelLine={false}>
                    {improvementPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any, _n: any, p: any) => [`${v}%`, p?.payload?.name]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ── Badge cards (2×2) + Recent Projects ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* 4 badge cards — 2 columns × 2 rows, on the left of Recent Projects */}
        <div className="lg:col-span-2 grid grid-cols-2 gap-4 content-start">
          {quickCards.map((c, i) => {
            const Comp: any = c.onClick ? 'button' : 'div';
            return (
              <Comp
                key={i}
                {...(c.onClick ? { type: 'button', onClick: c.onClick } : {})}
                className={`text-left bg-white rounded-xl p-4 shadow-sm border border-slate-200 transition-all ${c.onClick ? 'hover:shadow-md hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer' : ''}`}
              >
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style={{ background: c.tint, color: c.color }}>
                  {c.icon}
                </div>
                {c.value !== null && <p className="text-2xl font-bold text-slate-800">{c.value}</p>}
                <p className="text-sm font-medium text-slate-700 truncate">{c.label}</p>
                <p className="text-xs text-slate-500 truncate">{c.sub}</p>
                {c.cta && <span className="text-xs font-medium text-blue-600">{c.cta}</span>}
              </Comp>
            );
          })}
        </div>

        {/* Recent Projects Table */}
        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Recent Projects</h3>
            <button onClick={() => navigate('/projects')} className="text-xs font-medium text-blue-600 hover:text-blue-800">View All</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Project</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Department</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Stage</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projects.map(p => {
                  const progress = Math.round((p.steps.filter(s => s.status === 'approved').length / 7) * 100);
                  return (
                    <tr key={p.id} onClick={() => navigate('/projects')} className="hover:bg-blue-50 cursor-pointer transition-colors">
                      <td className="px-6 py-3">
                        <p className="text-sm font-medium text-slate-800">{p.title}</p>
                        <p className="text-xs text-slate-500">{p.teamId}</p>
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-600">{p.department}</td>
                      <td className="px-6 py-3">
                        <span className="text-xs font-medium text-slate-700">Step {p.steps.filter(s => s.status === 'approved').length + 1} / 7</span>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          p.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                          p.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                          p.status === 'on_hold' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'
                        }`}>{p.status.replace('_', ' ')}</span>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                          </div>
                          <span className="text-xs font-medium text-slate-600 w-8">{progress}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
