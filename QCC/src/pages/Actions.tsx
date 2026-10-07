import { useEffect, useState } from 'react';
import { Target, AlertTriangle, Clock, CheckCircle2, Plus, Calendar, Trash2, Loader2, X, RotateCcw, ClipboardList } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import HeaderPortal from '../components/layout/HeaderPortal';
import StatCard, { STAT_GRADIENTS } from '../components/StatCard';
import { useConfirm } from '../components/ConfirmDialog';
import { useHalfYear } from '../lib/halfYear';
import type { ActionItem, QCCProject, User } from '../types';

const PRIORITY_CONFIG: Record<string, { color: string; icon: string }> = {
  critical: { color: 'bg-red-100 text-red-700 border-red-200', icon: '🔴' },
  high: { color: 'bg-orange-100 text-orange-700 border-orange-200', icon: '🟠' },
  medium: { color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: '🟡' },
  low: { color: 'bg-green-100 text-green-700 border-green-200', icon: '🟢' },
};

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode }> = {
  open: { color: 'bg-blue-100 text-blue-700', icon: <Clock size={12} /> },
  in_progress: { color: 'bg-amber-100 text-amber-700', icon: <Target size={12} /> },
  completed: { color: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 size={12} /> },
  overdue: { color: 'bg-red-100 text-red-700', icon: <AlertTriangle size={12} /> },
};

const EMPTY_FORM = { title: '', projectId: '', assigneeId: '', dueDate: '', priority: 'medium' };

export default function Actions() {
  const hy = useHalfYear();
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [projects, setProjects] = useState<QCCProject[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const askConfirm = useConfirm();
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');

  // New-action modal
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const loadActions = async () => {
    setError(null);
    try {
      setActions(await api.listActions());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load actions');
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([api.listActions(), api.listProjects(), api.listUsers()])
      .then(([a, p, u]) => { if (!cancelled) { setActions(a); setProjects(p); setUsers(u); } })
      .catch(e => { if (!cancelled) setError(e instanceof ApiError ? e.message : 'Failed to load actions'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { hy.registerDates(projects.map(p => p.startedAt)); }, [projects]); // eslint-disable-line react-hooks/exhaustive-deps

  const openModal = () => {
    setForm({ ...EMPTY_FORM, projectId: projects[0]?.id ?? '' });
    setFormError('');
    setShowModal(true);
  };

  const createAction = async () => {
    if (!form.title.trim()) { setFormError('Title is required.'); return; }
    if (!form.projectId) { setFormError('Please select a project.'); return; }
    setSaving(true);
    setFormError('');
    try {
      await api.createAction({
        projectId: form.projectId,
        title: form.title.trim(),
        assigneeId: form.assigneeId || undefined,
        dueDate: form.dueDate || undefined,
        priority: form.priority,
      });
      setShowModal(false);
      await loadActions();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Failed to create action');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (id: string, status: string) => {
    try {
      await api.updateAction(id, { status: status as ActionItem['status'] });
      await loadActions();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to update action');
    }
  };

  // Status is auto-derived — the only manual signal is "done". Everything else
  // (open / in-progress / overdue) is computed from the due date.
  const today = new Date().toISOString().slice(0, 10);
  const deriveStatus = (a: ActionItem): ActionItem['status'] => {
    if (a.status === 'completed') return 'completed';
    if (a.dueDate && a.dueDate < today) return 'overdue';
    if (a.dueDate) return 'in_progress';
    return 'open';
  };
  const toggleComplete = (a: ActionItem) =>
    changeStatus(a.id, a.status === 'completed' ? 'open' : 'completed');

  const removeAction = async (id: string) => {
    // Confirmation is handled by the ConfirmDialog at the call site.
    try {
      await api.deleteAction(id);
      await loadActions();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to delete action');
    }
  };

  // Scope to the QCC period picked on the Dashboard, via each action's parent project.
  const scopedActions = actions.filter(a => {
    const proj = projects.find(p => p.id === a.projectId);
    return proj ? hy.isProjectActive(proj.teamId, proj.startedAt) : hy.isActive(a.createdAt);
  });

  const filtered = scopedActions.filter(a => {
    const matchStatus = statusFilter === 'all' || deriveStatus(a) === statusFilter;
    const matchPriority = priorityFilter === 'all' || a.priority === priorityFilter;
    const matchProject = projectFilter === 'all' || a.projectId === projectFilter;
    return matchStatus && matchPriority && matchProject;
  });

  const stats = {
    total: scopedActions.length,
    open: scopedActions.filter(a => deriveStatus(a) === 'open').length,
    inProgress: scopedActions.filter(a => deriveStatus(a) === 'in_progress').length,
    completed: scopedActions.filter(a => deriveStatus(a) === 'completed').length,
    overdue: scopedActions.filter(a => deriveStatus(a) === 'overdue').length,
  };

  const getProjectTitle = (id: string) => projects.find(p => p.id === id)?.title || '';
  const getUserName = (id: string) => users.find(u => u.id === id)?.name || '';

  return (
    <div className="space-y-6">
      <HeaderPortal>
        <button
          onClick={openModal}
          className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
        >
          <Plus size={16} /> New Action
        </button>
      </HeaderPortal>

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: stats.total, icon: <Target size={20} />, filter: 'all' },
          { label: 'Open', value: stats.open, icon: <Clock size={20} />, filter: 'open' },
          { label: 'In Progress', value: stats.inProgress, icon: <Loader2 size={20} />, filter: 'in_progress' },
          { label: 'Completed', value: stats.completed, icon: <CheckCircle2 size={20} />, filter: 'completed' },
          { label: 'Overdue', value: stats.overdue, icon: <AlertTriangle size={20} />, filter: 'overdue' },
        ].map((s, i) => (
          <StatCard
            key={i}
            label={s.label}
            value={s.value}
            icon={s.icon}
            grad={STAT_GRADIENTS[i % STAT_GRADIENTS.length]}
            onClick={() => setStatusFilter(s.filter)}
          />
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex flex-wrap gap-3">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white outline-none">
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="overdue">Overdue</option>
          </select>
          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white outline-none">
            <option value="all">All Priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white outline-none">
            <option value="all">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
      </div>

      {/* Actions Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Action</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Project</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Assignee</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Due Date</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Priority</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-400">
                  <Loader2 size={18} className="animate-spin inline mr-2" /> Loading actions…
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-400">No action items found.</td></tr>
              ) : filtered.map(action => (
                <tr key={action.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3">
                    <p className="text-sm font-medium text-slate-800">{action.title}</p>
                    <p className="text-[10px] text-slate-500">{action.id}</p>
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-600 max-w-[180px] truncate">
                    {getProjectTitle(action.projectId)}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-700">
                        {getUserName(action.assigneeId).split(' ').map(n => n[0]).join('')}
                      </div>
                      <span className="text-xs text-slate-700">{getUserName(action.assigneeId) || '—'}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1 text-xs text-slate-600">
                      <Calendar size={12} /> {action.dueDate || '—'}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border ${PRIORITY_CONFIG[action.priority]?.color ?? ''}`}>
                      {action.priority}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {(() => {
                      const st = deriveStatus(action);
                      const label = st === 'in_progress' ? 'in progress' : st;
                      return (
                        <span
                          title="Auto-updated from the due date — mark done with the ✓ button"
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium ${STATUS_CONFIG[st]?.color ?? 'bg-slate-100 text-slate-700'}`}
                        >
                          {STATUS_CONFIG[st]?.icon} {label}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => toggleComplete(action)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          action.status === 'completed'
                            ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                            : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                        }`}
                        title={action.status === 'completed' ? 'Reopen (not done)' : 'Mark as done'}
                      >
                        {action.status === 'completed' ? <RotateCcw size={15} /> : <CheckCircle2 size={15} />}
                      </button>
                      <button
                        onClick={async () => { if (await askConfirm({ title: 'Delete this action?', message: 'This action cannot be undone.', confirmText: 'Delete' })) removeAction(action.id); }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete action"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Action Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !saving && setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0"><ClipboardList size={16} /></span>
                <h2 className="text-lg font-bold text-slate-800">New Action Item</h2>
              </div>
              <button onClick={() => !saving && setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>

            {formError && (
              <div className="px-3 py-2 mb-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{formError}</div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Title *</label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Collect defect data from Line 3"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Project *</label>
                <select
                  value={form.projectId}
                  onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a project…</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Assignee</label>
                <select
                  value={form.assigneeId}
                  onChange={e => setForm(f => ({ ...f, assigneeId: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Unassigned</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Priority</label>
                  <select
                    value={form.priority}
                    onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowModal(false)} disabled={saving}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={createAction} disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition-colors">
                {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : 'Create Action'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
