import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderKanban, Search, Filter, Calendar, TrendingUp, Loader2, GitBranch,
  BarChart3, GanttChartSquare, CheckCircle2, Clock, PauseCircle, Flag,
  Users, Wallet, ArrowRight, Check,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useHalfYear } from '../lib/halfYear';
import { useActivitySteps } from '../lib/activitySteps';
import { useHierarchy } from '../lib/hierarchy';
import type { QCCProject, Team } from '../types';

// Colour of a workflow-step node by its status.
const stepClr = (s?: string) =>
  s === 'approved' ? 'bg-emerald-500 text-white border-emerald-500'
    : s === 'submitted' ? 'bg-blue-500 text-white border-blue-500'
      : s === 'under_review' ? 'bg-amber-400 text-white border-amber-400'
        : s === 'rework' ? 'bg-red-500 text-white border-red-500'
          : 'bg-white text-slate-400 border-slate-300';

const fmtDate = (s?: string) => {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Whole days from today to the given date (negative = overdue).
const daysTo = (s?: string) => {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
};

const statusBadge = (status: string) =>
  status === 'completed' ? 'bg-emerald-100 text-emerald-700'
    : status === 'in_progress' ? 'bg-blue-100 text-blue-700'
      : status === 'on_hold' ? 'bg-amber-100 text-amber-700'
        : 'bg-slate-100 text-slate-600';

const priorityBadge = (score: number) =>
  score >= 8 ? { label: 'Critical', cls: 'bg-red-50 text-red-700 border-red-200' }
    : score >= 6 ? { label: 'High', cls: 'bg-orange-50 text-orange-700 border-orange-200' }
      : score >= 4 ? { label: 'Medium', cls: 'bg-amber-50 text-amber-700 border-amber-200' }
        : { label: 'Low', cls: 'bg-slate-100 text-slate-600 border-slate-200' };

const healthBadge = (p: QCCProject, progress: number) => {
  if (p.status === 'completed') return { label: 'Completed', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' };
  if (p.status === 'on_hold') return { label: 'On Hold', cls: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' };
  const d = daysTo(p.targetCompletion);
  if (d != null && d < 0) return { label: 'Delayed', cls: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' };
  if (progress < 40 || (d != null && d <= 14)) return { label: 'At Risk', cls: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' };
  return { label: 'On Track', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' };
};

export default function Projects() {
  const navigate = useNavigate();
  const hy = useHalfYear();
  const { workflowSteps } = useActivitySteps();
  const hierarchy = useHierarchy();   // department filter options come from Dept Hierarchy
  const TOTAL_STEPS = workflowSteps.length; // workflow steps (+ a final "Done" node in the tracker)
  const [searchTerm, setSearchTerm] = useState('');
  // Persisted so the Dashboard "Completed" KPI can deep-link here with the filter applied.
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    try { return localStorage.getItem('qcc-projects-status') || 'all'; } catch { return 'all'; }
  });
  useEffect(() => { try { localStorage.setItem('qcc-projects-status', statusFilter); } catch { /* ignore */ } }, [statusFilter]);
  const [deptFilter, setDeptFilter] = useState('all');
  const [sortBy, setSortBy] = useState('progress');

  const [projects, setProjects] = useState<QCCProject[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([api.listProjects(), api.listTeams()])
      .then(([p, t]) => { if (!cancelled) { setProjects(p); setTeams(t); } })
      .catch(e => { if (!cancelled) setError(e instanceof ApiError ? e.message : 'Failed to load projects'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { hy.registerDates([...projects.map(p => p.startedAt), ...teams.map(t => t.createdAt)]); }, [projects, teams]); // eslint-disable-line react-hooks/exhaustive-deps

  const getTeamName = (teamId: string) => teams.find(t => t.id === teamId)?.name || '';
  const getLeaderName = (teamId: string) => teams.find(t => t.id === teamId)?.leaderName || '';
  const progressOf = (p: QCCProject) => Math.round((p.steps.filter(s => s.status === 'approved').length / TOTAL_STEPS) * 100);

  // Everything shown obeys the active half-year (header switcher).
  const scoped = useMemo(() => projects.filter(p => hy.isProjectActive(p.teamId, p.startedAt)), [projects, hy]);
  const departments = [...new Set(scoped.map(p => p.department))];

  const kpis = useMemo(() => ({
    total: scoped.length,
    inProgress: scoped.filter(p => p.status === 'in_progress').length,
    completed: scoped.filter(p => p.status === 'completed').length,
    onHold: scoped.filter(p => p.status === 'on_hold').length,
    savings: scoped.reduce((s, p) => s + (p.savings || 0), 0),
  }), [scoped]);

  const filtered = useMemo(() => {
    const list = scoped.filter(p => {
      const q = searchTerm.toLowerCase();
      const matchSearch = p.title.toLowerCase().includes(q) || p.problemStatement.toLowerCase().includes(q) || getTeamName(p.teamId).toLowerCase().includes(q);
      const matchStatus = statusFilter === 'all' || p.status === statusFilter;
      const matchDept = deptFilter === 'all' || p.department === deptFilter;
      return matchSearch && matchStatus && matchDept;
    });
    const sorted = [...list];
    if (sortBy === 'progress') sorted.sort((a, b) => progressOf(b) - progressOf(a));
    else if (sortBy === 'savings') sorted.sort((a, b) => (b.savings || 0) - (a.savings || 0));
    else if (sortBy === 'due') sorted.sort((a, b) => (daysTo(a.targetCompletion) ?? 1e9) - (daysTo(b.targetCompletion) ?? 1e9));
    else if (sortBy === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title));
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, searchTerm, statusFilter, deptFilter, sortBy]);

  const KPI_CARDS = [
    { key: 'all', label: 'Total Projects', value: kpis.total, icon: <FolderKanban size={18} />, accent: 'text-blue-600 bg-blue-50', border: 'border-blue-500', ring: 'ring-blue-300' },
    { key: 'in_progress', label: 'In Progress', value: kpis.inProgress, icon: <Clock size={18} />, accent: 'text-sky-600 bg-sky-50', border: 'border-sky-500', ring: 'ring-sky-300' },
    { key: 'completed', label: 'Completed', value: kpis.completed, icon: <CheckCircle2 size={18} />, accent: 'text-emerald-600 bg-emerald-50', border: 'border-emerald-500', ring: 'ring-emerald-300' },
    { key: 'on_hold', label: 'On Hold', value: kpis.onHold, icon: <PauseCircle size={18} />, accent: 'text-amber-600 bg-amber-50', border: 'border-amber-500', ring: 'ring-amber-300' },
    { key: null, label: 'Total Savings', value: `₹${(kpis.savings / 1000).toFixed(0)}K`, icon: <Wallet size={18} />, accent: 'text-violet-600 bg-violet-50', border: 'border-violet-500', ring: 'ring-violet-300' },
  ] as { key: string | null; label: string; value: ReactNode; icon: ReactNode; accent: string; border: string; ring: string }[];

  return (
    <div className="space-y-5">
      {error && <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      {/* ── KPI summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {KPI_CARDS.map((c, i) => {
          const clickable = c.key != null;
          const active = clickable && statusFilter === c.key;
          const Comp: any = clickable ? 'button' : 'div';
          return (
            <Comp key={i} {...(clickable ? { type: 'button', onClick: () => setStatusFilter(c.key as string) } : {})}
              className={`text-left rounded-xl bg-white border border-l-4 ${c.border} shadow-sm p-4 transition-all w-full ${active ? `ring-2 ${c.ring}` : 'border-slate-200'} ${clickable ? 'hover:shadow-md hover:-translate-y-0.5 cursor-pointer' : ''}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${c.accent}`}>{c.icon}</span>
              </div>
              <p className="text-2xl font-bold text-slate-900 leading-tight">{c.value}</p>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">{c.label}</p>
            </Comp>
          );
        })}
      </div>

      {/* ── Advanced filters ── */}
      <div className="bg-white rounded-xl p-3.5 shadow-sm border border-slate-200">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <span className="hidden lg:flex w-8 h-8 rounded-lg bg-blue-50 text-blue-600 items-center justify-center flex-shrink-0"><Filter size={16} /></span>
          <div className="flex items-center gap-2 flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 min-w-0">
            <Search size={16} className="text-slate-400 flex-shrink-0" />
            <input type="text" placeholder="Search projects, teams…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="bg-transparent text-sm text-slate-700 outline-none w-full" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Status filtering is handled by the KPI cards above — dept stays as an extra filter. */}
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-100">
              <option value="all">All Departments</option>
              {hierarchy.departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
          <span>Showing <b className="text-slate-700">{filtered.length}</b> of {scoped.length} projects</span>
          <span className="hidden sm:flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1"><span className="w-3 h-2 rounded-full bg-emerald-500" /> Approved</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-2 rounded-full bg-blue-500" /> Submitted</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-2 rounded-full bg-amber-400" /> Under review</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-2 rounded-full bg-red-500" /> Rework</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-2 rounded-full bg-slate-200" /> Not started</span>
          </span>
        </div>
      </div>

      {/* ── Project cards ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {filtered.map(project => {
          const approvedSteps = project.steps.filter(s => s.status === 'approved').length;
          const progress = progressOf(project);
          const health = healthBadge(project, progress);
          const prio = priorityBadge(project.impactScore || 0);
          const dLeft = daysTo(project.targetCompletion);
          const dueText = dLeft == null ? '' : dLeft < 0 ? `${Math.abs(dLeft)}d overdue` : dLeft === 0 ? 'Due today' : `${dLeft}d left`;
          const done = project.status === 'completed';

          return (
            <div key={project.id} className="bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-md hover:border-blue-300 transition-all flex flex-col overflow-hidden">
              {/* Header */}
              <div className="p-5 pb-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <FolderKanban size={18} className="text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-bold text-slate-800 leading-snug">{project.title}</h3>
                      <span className={`flex-shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-semibold capitalize ${statusBadge(project.status)}`}>{project.status.replace('_', ' ')}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{project.problemStatement}</p>
                  </div>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap items-center gap-1.5 mt-3">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${health.cls}`}><span className={`w-1.5 h-1.5 rounded-full ${health.dot}`} />{health.label}</span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${prio.cls}`}><Flag size={10} />{prio.label}</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border border-violet-200 bg-violet-50 text-violet-700"><TrendingUp size={10} />₹{((project.savings || 0) / 1000).toFixed(0)}K</span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${dLeft != null && dLeft < 0 ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}><Calendar size={10} />{fmtDate(project.targetCompletion)}{dueText && <span className="opacity-70">· {dueText}</span>}</span>
                </div>

                {/* Meta */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" />{project.department}</span>
                  <span className="inline-flex items-center gap-1"><Users size={11} />{getTeamName(project.teamId) || '—'}</span>
                  <span className="inline-flex items-center gap-1"><span className="text-slate-400">Leader:</span>{getLeaderName(project.teamId) || '—'}</span>
                </div>
              </div>

              {/* Progress */}
              <div className="px-5">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-slate-500">Progress · <b className="text-slate-700">{approvedSteps}/{TOTAL_STEPS} steps</b></span>
                  <span className="font-bold text-slate-800">{progress}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${done ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${progress}%` }} />
                </div>
              </div>

              {/* 9-step workflow tracker (8 steps + final Done) */}
              <div className="px-5 pt-4">
                <div className="flex items-center gap-0 overflow-x-auto no-scrollbar pb-1">
                  {workflowSteps.map((qs, i) => {
                    const status = project.steps[i]?.status;
                    return (
                      <div key={qs.id} className="flex items-center flex-shrink-0">
                        {i > 0 && <div className={`h-0.5 w-4 ${project.steps[i - 1]?.status === 'approved' ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
                        <div title={`Step ${qs.number}: ${qs.title}`} className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-bold ${stepClr(status)}`}>
                          {status === 'approved' ? <Check size={12} /> : qs.number}
                        </div>
                      </div>
                    );
                  })}
                  {/* Final completion node → makes it a 9-node tracker */}
                  <div className="flex items-center flex-shrink-0">
                    <div className={`h-0.5 w-4 ${done ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                    <div title="Project completed" className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${done ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-400 border-slate-300'}`}>
                      <CheckCircle2 size={12} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick actions */}
              <div className="mt-auto grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100 mt-4">
                <button onClick={() => navigate('/workflow')} className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors"><GitBranch size={14} /> Workflow</button>
                <button onClick={() => navigate('/reports')} className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"><BarChart3 size={14} /> Report</button>
                <button onClick={() => navigate('/workflow', { state: { projectId: project.id, stepKey: 'activity-plan' } })} className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"><GanttChartSquare size={14} /> Timeline</button>
              </div>
            </div>
          );
        })}
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-slate-400"><Loader2 size={20} className="animate-spin inline mr-2" /> Loading projects…</div>
      ) : filtered.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-300">
          <FolderKanban size={44} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-600">No projects found</p>
          <p className="text-xs text-slate-400 mt-1">Try adjusting the filters or the half-year selector.</p>
          {(searchTerm || statusFilter !== 'all' || deptFilter !== 'all') && (
            <button onClick={() => { setSearchTerm(''); setStatusFilter('all'); setDeptFilter('all'); }} className="mt-3 text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1 mx-auto">Clear filters <ArrowRight size={12} /></button>
          )}
        </div>
      )}
    </div>
  );
}
