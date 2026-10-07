import { useState, useEffect, useMemo } from 'react';
import {
  Clock, CheckCircle2, XCircle, RotateCcw, Lock, GanttChartSquare, List, LayoutGrid,
  Filter, Search, RefreshCw, ExternalLink, FileText, MessageSquare, Paperclip, UserCheck, X,
} from 'lucide-react';
import { mockProjects, mockUsers } from '../lib/data';
import type { ApprovalRequest, QCCProject, Team, WorkflowStatus } from '../types';
import { useAuth, ROLE_LABELS } from '../lib/auth';
import { useHalfYear } from '../lib/halfYear';
import { useActivitySteps } from '../lib/activitySteps';
import { api, ApiError } from '../lib/api';
import { formatDate, daysBetween } from '../lib/activityPlan';
import StatCard, { STAT_GRADIENTS } from '../components/StatCard';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700', icon: <Clock size={12} /> },
  approved: { label: 'Approved', color: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 size={12} /> },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: <XCircle size={12} /> },
  rework: { label: 'Rework', color: 'bg-orange-100 text-orange-700', icon: <RotateCcw size={12} /> },
};
const PRIORITY: Record<string, string> = {
  High: 'bg-red-50 text-red-600', Medium: 'bg-amber-50 text-amber-600', Low: 'bg-blue-50 text-blue-600',
};

// Per-step cell style in the Activity Plan matrix.
const STEP_CELL: Record<WorkflowStatus, { label: string; short: string; cls: string }> = {
  approved: { label: 'Approved', short: 'Appr.', cls: 'bg-emerald-100 text-emerald-700' },
  submitted: { label: 'Submitted — awaiting approval', short: 'Sub.', cls: 'bg-amber-100 text-amber-700' },
  under_review: { label: 'Under review', short: 'Rev.', cls: 'bg-blue-100 text-blue-700' },
  rework: { label: 'Sent for rework', short: 'Rwk.', cls: 'bg-orange-100 text-orange-700' },
  saved: { label: 'Draft saved', short: 'Draft', cls: 'bg-slate-100 text-slate-500' },
  draft: { label: 'Not started', short: '—', cls: 'bg-slate-50 text-slate-400' },
};
const OVERALL: Record<string, { cls: string; icon: React.ReactNode }> = {
  Completed: { cls: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 size={11} /> },
  'In Progress': { cls: 'bg-blue-100 text-blue-700', icon: <Clock size={11} /> },
  Delayed: { cls: 'bg-red-100 text-red-700', icon: <XCircle size={11} /> },
};

const APPROVER_ROLES = ['admin', 'dept_head', 'facilitator'];
const todayStr = () => new Date().toISOString().split('T')[0];
type Tab = 'all' | 'pending' | 'approved' | 'rework' | 'rejected' | 'activity';

export default function Approvals() {
  const { user } = useAuth();
  const hy = useHalfYear();
  const { workflowSteps } = useActivitySteps();
  const canApprove = !!user && APPROVER_ROLES.includes(user.role);

  const [tab, setTab] = useState<Tab>(() => {
    try { const v = localStorage.getItem('qcc-approvals-tab') as Tab | null; if (v && ['all', 'pending', 'approved', 'rework', 'rejected', 'activity'].includes(v)) return v; } catch { /* default */ }
    return 'all';
  });
  useEffect(() => { try { localStorage.setItem('qcc-approvals-tab', tab); } catch { /* ignore */ } }, [tab]);

  // Filter panel (collapsed behind the filter icon) + fields.
  const [filterOpen, setFilterOpen] = useState(false);
  const [q, setQ] = useState('');
  const [fStep, setFStep] = useState('');
  const [fTeam, setFTeam] = useState('');
  const [fUser, setFUser] = useState('');
  const [fPriority, setFPriority] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const clearFilters = () => { setQ(''); setFStep(''); setFTeam(''); setFUser(''); setFPriority(''); setFFrom(''); setFTo(''); };
  const activeFilterCount = [q, fStep, fTeam, fUser, fPriority, fFrom, fTo].filter(Boolean).length;

  const [view, setView] = useState<'list' | 'grid'>('list');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comment, setComment] = useState('');

  // ── Live data from the backend ──
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [projects, setProjects] = useState<QCCProject[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [approvalsError, setApprovalsError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = () => {
    setLoading(true);
    api.listApprovals().then(setApprovals).catch(e => setApprovalsError(e instanceof ApiError ? e.message : 'Failed to load approvals')).finally(() => setLoading(false));
    api.listProjects().then(setProjects).catch(() => { /* ignore */ });
    api.listTeams().then(setTeams).catch(() => { /* ignore */ });
  };
  useEffect(() => { reload(); }, []);
  useEffect(() => { hy.registerDates(projects.map(p => p.startedAt)); }, [projects]); // eslint-disable-line react-hooks/exhaustive-deps

  const getProjectTitle = (id: string) => projects.find(p => p.id === id)?.title || mockProjects.find(p => p.id === id)?.title || id;
  const getUserName = (id: string) => mockUsers.find(u => u.id === id)?.name || id;
  const getUserRole = (id: string) => { const r = mockUsers.find(u => u.id === id)?.role; return r ? ROLE_LABELS[r] : 'Member'; };

  const priorApproved = (projectId: string, stepNumber: number): boolean => {
    if (stepNumber <= 1) return true;
    const proj = projects.find(p => p.id === projectId);
    if (!proj) return true;
    return proj.steps.filter(s => s.stepNumber < stepNumber).every(s => s.status === 'approved');
  };

  const decide = async (id: string, status: 'approved' | 'rejected' | 'rework') => {
    setDeciding(id); setApprovalsError(null);
    try {
      await api.decideApproval(id, status, comment || undefined);
      setApprovals(await api.listApprovals());
      setSelectedId(null); setComment('');
    } catch (err) {
      setApprovalsError(err instanceof ApiError ? err.message : 'Failed to submit decision');
    } finally { setDeciding(null); }
  };

  // Scope to the QCC period picked on the Dashboard, via each approval's parent project.
  const scoped = approvals.filter(a => {
    const proj = projects.find(p => p.id === a.projectId);
    return proj ? hy.isProjectActive(proj.teamId, proj.startedAt) : hy.isActive(a.requestedAt);
  });
  const stats = {
    all: scoped.length,
    pending: scoped.filter(a => a.status === 'pending').length,
    approved: scoped.filter(a => a.status === 'approved').length,
    rework: scoped.filter(a => a.status === 'rework').length,
    rejected: scoped.filter(a => a.status === 'rejected').length,
  };

  // Build a display row (with derived priority / due-in) for each approval.
  const rows = useMemo(() => {
    const build = (a: ApprovalRequest) => {
      const proj = projects.find(p => p.id === a.projectId);
      const team = teams.find(t => t.id === proj?.teamId);
      const reqDate = (a.requestedAt || '').slice(0, 10);
      const reqTime = /T(\d{2}:\d{2})/.exec(a.requestedAt || '')?.[1] || '';
      const age = reqDate ? daysBetween(reqDate, todayStr()) : 0;
      const dueIn = 5 - age;  // simple 5-day SLA from submission
      const priority = age >= 3 ? 'High' : age >= 1 ? 'Medium' : 'Low';
      return {
        a,
        title: getProjectTitle(a.projectId),
        teamName: team?.name || proj?.department || '',
        dept: team?.department || proj?.department || '',
        stepTitle: workflowSteps[a.stepNumber - 1]?.title || '',
        byName: getUserName(a.requestedBy),
        byRole: getUserRole(a.requestedBy),
        reqDate, reqTime, dueIn, priority,
      };
    };
    const inTab = (a: ApprovalRequest) => tab === 'all' || tab === 'activity' ? true : a.status === tab;
    return scoped.filter(inTab).map(build).filter(r => {
      if (q && !`${r.title} ${r.teamName} ${r.stepTitle} ${r.a.id} ${r.byName}`.toLowerCase().includes(q.toLowerCase())) return false;
      if (fStep && r.stepTitle !== fStep) return false;
      if (fTeam && r.teamName !== fTeam) return false;
      if (fUser && r.byName !== fUser) return false;
      if (fPriority && r.priority !== fPriority) return false;
      if (fFrom && r.reqDate < fFrom) return false;
      if (fTo && r.reqDate > fTo) return false;
      return true;
    }).sort((x, y) => sort === 'newest' ? y.reqDate.localeCompare(x.reqDate) : x.reqDate.localeCompare(y.reqDate));
  }, [scoped, tab, q, fStep, fTeam, fUser, fPriority, fFrom, fTo, sort, projects, teams, workflowSteps]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter dropdown option lists (from the data in scope).
  const stepOptions = workflowSteps.map(s => s.title);
  const teamOptions = [...new Set(scoped.map(a => teams.find(t => t.id === projects.find(p => p.id === a.projectId)?.teamId)?.name).filter(Boolean) as string[])];
  const userOptions = [...new Set(scoped.map(a => getUserName(a.requestedBy)))];

  const selected = rows.find(r => r.a.id === selectedId) || (selectedId ? scoped.filter(a => a.id === selectedId).map(a => rows.find(r => r.a.id === a.id)).find(Boolean) : undefined);

  // ── Activity Plan matrix (kept as a tab) ──
  const stepCount = workflowSteps.length || 8;
  const teamRows = projects
    .filter(p => hy.isProjectActive(p.teamId, p.startedAt))
    .map(p => {
      const team = teams.find(t => t.id === p.teamId);
      const stepStatus = (n: number): WorkflowStatus => (p.steps.find(s => s.stepNumber === n)?.status ?? 'draft') as WorkflowStatus;
      const stepDate = (n: number): string => { const s = p.steps.find(st => st.stepNumber === n); return (s?.completedAt || s?.updatedAt || '').slice(0, 10); };
      const approvedCount = Array.from({ length: stepCount }, (_, i) => stepStatus(i + 1)).filter(s => s === 'approved').length;
      const done = p.status === 'completed' || (stepCount > 0 && approvedCount === stepCount);
      const overdue = !done && !!p.targetCompletion && p.targetCompletion < todayStr();
      const delayDays = overdue ? daysBetween(p.targetCompletion, todayStr()) : 0;
      const overallStatus = done ? 'Completed' : overdue ? 'Delayed' : 'In Progress';
      return { p, team, stepStatus, stepDate, approvedCount, delayDays, overallStatus };
    })
    .sort((a, b) => b.approvedCount - a.approvedCount);

  const dueLabel = (r: { a: ApprovalRequest; dueIn: number }) =>
    r.a.status !== 'pending' ? '—' : r.dueIn > 0 ? `${r.dueIn} day${r.dueIn === 1 ? '' : 's'}` : r.dueIn === 0 ? 'today' : `${-r.dueIn}d overdue`;
  const dueColor = (r: { a: ApprovalRequest; dueIn: number }) =>
    r.a.status !== 'pending' ? 'text-slate-400' : r.dueIn <= 0 ? 'text-red-600' : r.dueIn <= 1 ? 'text-red-600' : r.dueIn <= 3 ? 'text-amber-600' : 'text-slate-500';

  return (
    <div className="space-y-5">
      {/* ── Title + Refresh ── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Approvals</h1>
          <p className="text-sm text-slate-500 mt-0.5">Review and take action on workflow step approval requests</p>
        </div>
        <button onClick={reload} className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium rounded-lg shadow-sm">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'All Requests', value: stats.all, icon: <List size={20} />, go: 'all' as Tab },
          { label: 'Pending', value: stats.pending, icon: <Clock size={20} />, go: 'pending' as Tab },
          { label: 'Approved', value: stats.approved, icon: <CheckCircle2 size={20} />, go: 'approved' as Tab },
          { label: 'Rework', value: stats.rework, icon: <RotateCcw size={20} />, go: 'rework' as Tab },
          { label: 'Rejected', value: stats.rejected, icon: <XCircle size={20} />, go: 'rejected' as Tab },
        ].map((s, i) => (
          <StatCard key={s.label} label={s.label} value={s.value} icon={s.icon}
            grad={STAT_GRADIENTS[i % STAT_GRADIENTS.length]}
            active={tab === s.go} onClick={() => { setTab(s.go); setSelectedId(null); }} />
        ))}
      </div>

      {/* ── View toggle (status comes from the KPI cards) + toolbar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200">
        <div className="flex items-center gap-1 overflow-x-auto">
          {([['requests', 'Approval Requests'], ['activity', 'Activity Plan']] as const).map(([key, label]) => {
            const isActivity = key === 'activity';
            const on = isActivity ? tab === 'activity' : tab !== 'activity';
            return (
              <button key={key} onClick={() => { setTab(isActivity ? 'activity' : (tab === 'activity' ? 'all' : tab)); setSelectedId(null); }}
                className={`relative px-3.5 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${on ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
                {label}
                {on && <span className="absolute left-0 -bottom-px h-0.5 w-full bg-blue-600 rounded-full" />}
              </button>
            );
          })}
          {/* Active status filter (from a KPI card) — shown so it's clear what's filtered */}
          {tab !== 'activity' && tab !== 'all' && (
            <button onClick={() => setTab('all')} className="ml-2 inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100">
              {STATUS_CONFIG[tab]?.label || tab} <X size={12} />
            </button>
          )}
        </div>
        {tab !== 'activity' && (
          <div className="flex items-center gap-2 pb-2 sm:pb-0">
            <label className="text-xs text-slate-500 hidden sm:block">Sort by:</label>
            <select value={sort} onChange={e => setSort(e.target.value as 'newest' | 'oldest')}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white outline-none focus:ring-2 focus:ring-blue-400">
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </select>
            <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden">
              <button onClick={() => setView('list')} title="List view" className={`p-1.5 ${view === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}><List size={15} /></button>
              <button onClick={() => setView('grid')} title="Grid view" className={`p-1.5 border-l border-slate-300 ${view === 'grid' ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}><LayoutGrid size={15} /></button>
            </div>
            {/* FILTER — collapsed behind this icon; opens the panel */}
            <button onClick={() => setFilterOpen(o => !o)} title="Filters"
              className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${filterOpen || activeFilterCount ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
              <Filter size={14} /> Filters
              {activeFilterCount > 0 && <span className={`ml-0.5 rounded-full px-1.5 text-[10px] font-bold ${filterOpen ? 'bg-white/25' : 'bg-blue-100 text-blue-700'}`}>{activeFilterCount}</span>}
            </button>
          </div>
        )}
      </div>

      {approvalsError && <div className="px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{approvalsError}</div>}

      {/* ── Activity Plan tab ── */}
      {tab === 'activity' ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2 flex-wrap">
            <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center"><GanttChartSquare size={18} className="text-indigo-600" /></div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Activity Plan — Team Progress</h2>
              <p className="text-[11px] text-slate-500">Live from <b>QCC Workflow</b> — every team's step status, approvals &amp; delay. Scroll right for all steps.</p>
            </div>
            <div className="ml-auto flex items-center gap-2.5 text-[10px] text-slate-500">
              <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" />Approved</span>
              <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400" />Submitted</span>
              <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-400" />Rework</span>
              <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-slate-300" />Pending</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="sticky left-0 z-20 bg-slate-50 text-left px-4 py-2.5 font-semibold text-slate-600 min-w-[190px]">Team</th>
                  {Array.from({ length: stepCount }, (_, i) => (
                    <th key={i} title={`Step ${i + 1}: ${workflowSteps[i]?.title || ''}`} className="px-3 py-2 font-semibold text-slate-600 text-center align-bottom cursor-default min-w-[92px]">
                      <span className="block text-[10px] text-slate-400 font-bold">S{i + 1}</span>
                      <span className="block text-[11px] font-medium text-slate-600 truncate max-w-[100px] mx-auto">{workflowSteps[i]?.title || `Step ${i + 1}`}</span>
                    </th>
                  ))}
                  <th className="px-3 py-2.5 font-semibold text-slate-600 text-center whitespace-nowrap">Approved</th>
                  <th className="px-3 py-2.5 font-semibold text-slate-600 text-center whitespace-nowrap">Status</th>
                  <th className="px-3 py-2.5 font-semibold text-slate-600 text-center whitespace-nowrap">Delay</th>
                </tr>
              </thead>
              <tbody>
                {teamRows.length === 0 && <tr><td colSpan={stepCount + 4} className="text-center text-slate-400 py-10 text-sm">No teams with workflow activity in this period.</td></tr>}
                {teamRows.map(({ p, team, stepStatus, stepDate, approvedCount, delayDays, overallStatus }) => {
                  const ov = OVERALL[overallStatus] ?? OVERALL['In Progress'];
                  return (
                    <tr key={p.id} className="group border-b border-slate-100 hover:bg-slate-50/60">
                      <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 px-4 py-2.5">
                        <div className="font-semibold text-slate-800 truncate max-w-[190px]">{team?.name || p.title}</div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[190px]">{p.department}</div>
                      </td>
                      {Array.from({ length: stepCount }, (_, i) => {
                        const c = STEP_CELL[stepStatus(i + 1)] ?? STEP_CELL.draft;
                        const d = stepDate(i + 1);
                        return <td key={i} className="px-3 py-2.5 text-center"><span title={`Step ${i + 1}: ${workflowSteps[i]?.title || ''}\nStatus: ${c.label}${d ? `\nDate: ${formatDate(d)}` : ''}`} className={`inline-flex items-center justify-center px-2 py-1 rounded-md text-[10px] font-bold cursor-default ${c.cls}`}>{c.short}</span></td>;
                      })}
                      <td className="px-3 py-2.5 text-center font-semibold text-slate-700 whitespace-nowrap">{approvedCount}/{stepCount}</td>
                      <td className="px-3 py-2.5 text-center"><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${ov.cls}`}>{ov.icon}{overallStatus}</span></td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">{delayDays > 0 ? <span className="text-[11px] font-bold text-red-600">+{delayDays}d late</span> : <span className="text-[11px] font-medium text-emerald-600">On track</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── Request list (table/grid) with an optional filter sidebar ── */
        <div className={`flex gap-4 ${filterOpen ? '' : ''}`}>
          {/* Filter sidebar — only when the filter icon is toggled on */}
          {filterOpen && (
            <aside className="w-60 flex-shrink-0 bg-white rounded-xl border border-slate-200 shadow-sm p-4 h-fit">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5"><Filter size={14} className="text-blue-600" /> Filters</h3>
                <button onClick={clearFilters} className="text-xs font-medium text-blue-600 hover:underline">Clear All</button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Search</label>
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Project, team, step…" className="w-full pl-8 pr-2 py-1.5 border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400" />
                  </div>
                </div>
                {[
                  { label: 'Workflow Step', value: fStep, set: setFStep, opts: stepOptions, allLabel: 'All Steps' },
                  { label: 'Project / Team', value: fTeam, set: setFTeam, opts: teamOptions, allLabel: 'All Projects' },
                  { label: 'Requested By', value: fUser, set: setFUser, opts: userOptions, allLabel: 'All Users' },
                  { label: 'Priority', value: fPriority, set: setFPriority, opts: ['High', 'Medium', 'Low'], allLabel: 'All Priorities' },
                ].map(f => (
                  <div key={f.label}>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">{f.label}</label>
                    <select value={f.value} onChange={e => f.set(e.target.value)} className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white outline-none focus:ring-2 focus:ring-blue-400">
                      <option value="">{f.allLabel}</option>
                      {f.opts.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Requested On</label>
                  <div className="flex items-center gap-1.5">
                    <input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-[11px] outline-none focus:ring-2 focus:ring-blue-400" />
                    <input type="date" value={fTo} onChange={e => setFTo(e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-[11px] outline-none focus:ring-2 focus:ring-blue-400" />
                  </div>
                </div>
                <button onClick={() => setFilterOpen(false)} className="w-full mt-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg"><Filter size={13} /> Apply Filters</button>
              </div>
            </aside>
          )}

          <div className="flex-1 min-w-0 space-y-4">
            {/* LIST (table) */}
            {view === 'list' ? (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                        <th className="px-4 py-3">Request</th>
                        <th className="px-4 py-3">Project / Team</th>
                        <th className="px-4 py-3">Workflow Step</th>
                        <th className="px-4 py-3">Requested By</th>
                        <th className="px-4 py-3 whitespace-nowrap">Requested On</th>
                        <th className="px-4 py-3">Priority</th>
                        <th className="px-4 py-3 whitespace-nowrap">Due In</th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.length === 0 && <tr><td colSpan={8} className="text-center py-12 text-slate-400"><UserCheck size={40} className="mx-auto text-slate-300 mb-2" />No approval requests found.</td></tr>}
                      {rows.map(r => {
                        const cfg = STATUS_CONFIG[r.a.status] ?? STATUS_CONFIG.pending;
                        return (
                          <tr key={r.a.id} onClick={() => { setSelectedId(r.a.id); setComment(''); }}
                            className={`cursor-pointer transition-colors ${selectedId === r.a.id ? 'bg-blue-50/60' : 'hover:bg-slate-50/70'}`}>
                            <td className="px-4 py-3 align-top">
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${cfg.color}`}>{cfg.icon} {cfg.label}</span>
                              <span className="block text-[10px] text-slate-400 font-mono mt-1">{r.a.id}</span>
                              <span className="block text-[13px] font-semibold text-slate-800 mt-0.5 max-w-[220px] truncate">{r.title}</span>
                              <span className="block text-[11px] text-slate-400">{r.teamName}</span>
                            </td>
                            <td className="px-4 py-3 align-top text-slate-700">{r.teamName}<span className="block text-[11px] text-slate-400">{r.dept}</span></td>
                            <td className="px-4 py-3 align-top"><span className="font-medium text-slate-800">Step {r.a.stepNumber}</span><span className="block text-[11px] text-slate-500 max-w-[150px] truncate">{r.stepTitle}</span></td>
                            <td className="px-4 py-3 align-top text-slate-700">{r.byName}<span className="block text-[11px] text-slate-400">{r.byRole}</span></td>
                            <td className="px-4 py-3 align-top whitespace-nowrap text-slate-600">{r.reqDate ? formatDate(r.reqDate) : '—'}{r.reqTime && <span className="block text-[11px] text-slate-400">{r.reqTime}</span>}</td>
                            <td className="px-4 py-3 align-top"><span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${PRIORITY[r.priority]}`}>{r.priority}</span></td>
                            <td className={`px-4 py-3 align-top whitespace-nowrap text-[12px] font-medium ${dueColor(r)}`}>{dueLabel(r)}</td>
                            <td className="px-4 py-3 align-top text-right">
                              <button onClick={e => { e.stopPropagation(); setSelectedId(r.a.id); setComment(''); }} className="px-3 py-1.5 border border-blue-200 text-blue-600 hover:bg-blue-50 text-xs font-semibold rounded-lg">Review</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* GRID (cards) */
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {rows.length === 0 && <div className="col-span-full text-center py-12 text-slate-400"><UserCheck size={40} className="mx-auto text-slate-300 mb-2" />No approval requests found.</div>}
                {rows.map(r => {
                  const cfg = STATUS_CONFIG[r.a.status] ?? STATUS_CONFIG.pending;
                  return (
                    <div key={r.a.id} onClick={() => { setSelectedId(r.a.id); setComment(''); }} className={`bg-white rounded-xl border shadow-sm p-4 cursor-pointer transition-all ${selectedId === r.a.id ? 'border-blue-400 ring-1 ring-blue-100' : 'border-slate-200 hover:shadow-md'}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${cfg.color}`}>{cfg.icon} {cfg.label}</span>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${PRIORITY[r.priority]}`}>{r.priority}</span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-800 truncate">{r.title}</h3>
                      <p className="text-[11px] text-slate-500">{r.teamName} · Step {r.a.stepNumber}: {r.stepTitle}</p>
                      <div className="flex items-center justify-between mt-2 text-[11px] text-slate-500">
                        <span>{r.byName}</span><span className={dueColor(r)}>{dueLabel(r)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Detail panel (selected request) ── */}
            {selected && (() => {
              const r = selected; const a = r.a; const cfg = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.pending;
              const priorOk = priorApproved(a.projectId, a.stepNumber);
              return (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="w-9 h-9 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center flex-shrink-0"><FileText size={18} /></span>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${cfg.color}`}>{cfg.icon} {cfg.label}</span>
                          <span className="text-[10px] font-mono text-slate-400">{a.id}</span>
                        </div>
                        <h3 className="text-sm font-bold text-slate-800 mt-1">{r.title} <span className="text-[11px] font-medium text-blue-600">Step {a.stepNumber}: {r.stepTitle}</span></h3>
                      </div>
                    </div>
                    <button className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:underline flex-shrink-0"><ExternalLink size={12} /> View Full Details</button>
                  </div>

                  <div className="px-5 py-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 text-xs border-b border-slate-100 bg-slate-50/50">
                    <div><p className="text-[10px] text-slate-500 uppercase tracking-wide">Project / Team</p><p className="font-semibold text-slate-800 mt-0.5">{r.teamName}{r.dept && ` (${r.dept})`}</p></div>
                    <div><p className="text-[10px] text-slate-500 uppercase tracking-wide">Requested By</p><p className="font-semibold text-slate-800 mt-0.5">{r.byName} ({r.byRole})</p></div>
                    <div><p className="text-[10px] text-slate-500 uppercase tracking-wide">Requested On</p><p className="font-semibold text-slate-800 mt-0.5">{r.reqDate ? formatDate(r.reqDate) : '—'}{r.reqTime && `, ${r.reqTime}`}</p></div>
                    <div><p className="text-[10px] text-slate-500 uppercase tracking-wide">Due In</p><p className={`font-semibold mt-0.5 ${dueColor(r)}`}>{dueLabel(r)}</p></div>
                    <div><p className="text-[10px] text-slate-500 uppercase tracking-wide">Priority</p><p className="mt-0.5"><span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${PRIORITY[r.priority]}`}>{r.priority}</span></p></div>
                  </div>

                  <div className="p-5 grid grid-cols-1 lg:grid-cols-4 gap-5">
                    <div>
                      <p className="text-xs font-semibold text-slate-700 mb-1.5">Request Description</p>
                      <p className="text-xs text-slate-600 leading-relaxed">{a.comments || `${r.byName} submitted Step ${a.stepNumber} — ${r.stepTitle} — for approval.`}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-700 mb-1.5">Attachments</p>
                      <p className="text-xs text-slate-400 inline-flex items-center gap-1"><Paperclip size={12} /> No attachments</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-700 mb-1.5">Review Comments</p>
                      <textarea value={comment} onChange={e => setComment(e.target.value)} maxLength={500} rows={4} placeholder="Enter your comments here…"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs outline-none resize-none focus:ring-2 focus:ring-blue-400" />
                      <p className="text-[10px] text-slate-400 text-right mt-0.5">{comment.length} / 500</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-700 mb-1.5">Approval History</p>
                      <ol className="space-y-2.5">
                        <li className="flex gap-2 text-[11px]"><span className="w-2 h-2 rounded-full bg-emerald-500 mt-1 flex-shrink-0" /><span><b className="text-slate-700">Submitted</b><span className="block text-slate-500">{r.reqDate ? formatDate(r.reqDate) : '—'}{r.reqTime && `, ${r.reqTime}`} by {r.byName}</span></span></li>
                        <li className="flex gap-2 text-[11px]"><span className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${a.status === 'pending' ? 'bg-amber-500' : 'bg-slate-300'}`} /><span><b className="text-slate-700">{cfg.label}</b><span className="block text-slate-500">{a.status === 'pending' ? 'Waiting for your action' : a.reviewedBy ? `by ${getUserName(a.reviewedBy)}` : ''}</span></span></li>
                        {a.status === 'pending' && <li className="flex gap-2 text-[11px]"><span className="w-2 h-2 rounded-full bg-slate-200 mt-1 flex-shrink-0" /><span className="text-slate-400">Next — Approval decision</span></li>}
                      </ol>
                    </div>
                  </div>

                  <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
                    {a.status === 'pending' && canApprove && !priorOk && (
                      <span className="mr-auto inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1"><Lock size={10} /> Approve the earlier steps first</span>
                    )}
                    {a.status === 'pending' && canApprove ? (
                      <>
                        <button onClick={() => decide(a.id, 'approved')} disabled={deciding === a.id || !priorOk} title={!priorOk ? `Step ${a.stepNumber - 1} must be approved first` : undefined} className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg"><CheckCircle2 size={14} /> Approve</button>
                        <button onClick={() => decide(a.id, 'rework')} disabled={deciding === a.id} className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-xs font-semibold rounded-lg"><RotateCcw size={14} /> Rework</button>
                        <button onClick={() => decide(a.id, 'rejected')} disabled={deciding === a.id} className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg"><XCircle size={14} /> Reject</button>
                      </>
                    ) : a.status === 'pending' ? (
                      <span className="text-[11px] text-slate-400 inline-flex items-center gap-1"><Lock size={11} /> Approver role required</span>
                    ) : (
                      <span className="text-[11px] text-slate-500 inline-flex items-center gap-1.5"><MessageSquare size={12} /> Already {cfg.label.toLowerCase()}{a.comments ? ` — “${a.comments}”` : ''}</span>
                    )}
                    <button onClick={() => setSelectedId(null)} className="px-4 py-2 text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 text-xs font-medium rounded-lg">Close</button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
