import { useState, useEffect, useMemo } from 'react';
import {
  Rocket, Plus, Trash2, Crown, CheckCircle2, XCircle,
  ClipboardList, AlertCircle, Lock, MessageSquare, Calendar, User, ListChecks,
} from 'lucide-react';
import { mockTeams } from '../lib/data';
import { useConfirm } from './ConfirmDialog';

/* ───────── Types ───────── */
interface CountermeasureStudyProps {
  projectId: string;
  teamId: string;
  userRole: string;
}

// Evaluation criteria shown as table columns. `key` stays A–F: it is the key the
// scores are stored under in localStorage, so already-saved evaluations keep working
// while the header shows the real criterion name.
const EVAL_CRITERIA = [
  { key: 'A', label: 'Effectiveness' },
  { key: 'B', label: 'Feasibility' },
  { key: 'C', label: 'Cost' },
  { key: 'D', label: 'Implementation Time' },
  { key: 'E', label: 'Safety' },
  { key: 'F', label: 'Quality Impact' },
] as const;
const EVAL_COLS = EVAL_CRITERIA.map(c => c.key);
type EvalCol = typeof EVAL_CRITERIA[number]['key'];

type ImplStatus = 'not_started' | 'in_progress' | 'completed' | 'delayed';

interface Countermeasure {
  id: string;
  text: string;
  scores: Partial<Record<EvalCol, number>>;
}

interface ImplTask {
  id: string;
  task: string;
  owner: string;
  dueDate: string;
  status: ImplStatus;
  progress: number;
}

interface RootCauseItem {
  id: string;
  text: string;
  countermeasures: Countermeasure[];
  approvalStatus: 'pending' | 'approved' | 'rejected';
  approvedCountermeasureId?: string;
  approvedBy?: string;
  approvedAt?: string;
  approvalComments: string;
  implementation: ImplTask[];
}

/* ───────── Constants ───────── */
// Points are entered by hand against each criterion; Evaluation is their sum.
const MAX_POINTS = 10;                          // highest score allowed per criterion
const MIN_CMS = 3;                              // each root cause keeps at least 3 countermeasures

const ADVISOR_ROLES = ['admin', 'dept_head'];

const IMPL_STATUS: { value: ImplStatus; label: string; color: string }[] = [
  { value: 'not_started', label: 'Not Started', color: 'bg-slate-100 text-slate-700' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-blue-100 text-blue-700' },
  { value: 'delayed', label: 'Delayed', color: 'bg-red-100 text-red-700' },
  { value: 'completed', label: 'Completed', color: 'bg-emerald-100 text-emerald-700' },
];

const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const freshCms = (): Countermeasure[] =>
  Array.from({ length: MIN_CMS }, () => ({ id: uid('cm'), text: '', scores: {} }));

const newRootCause = (text: string): RootCauseItem => ({
  id: uid('rc'), text, countermeasures: freshCms(),
  approvalStatus: 'pending', approvalComments: '', implementation: [],
});

const totalOf = (cm: Countermeasure) => EVAL_COLS.reduce((sum, c) => sum + (cm.scores[c] ?? 0), 0);
const isScored = (cm: Countermeasure) => EVAL_COLS.some(c => cm.scores[c] !== undefined);
const bestCmOf = (rc: RootCauseItem) => {
  const scored = rc.countermeasures.filter(isScored);
  if (!scored.length) return null;
  const best = Math.max(...scored.map(totalOf));
  return scored.find(c => totalOf(c) === best) || null;
};

const STATUS_BADGE: Record<string, { label: string; cls: string; dot: string }> = {
  approved: { label: 'Approved · Locked', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500' },
  pending: { label: 'Pending Approval', cls: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
};

/* ───────── Component ───────── */
export default function CountermeasureStudy({ projectId, teamId, userRole }: CountermeasureStudyProps) {
  // v2 key: this sheet holds ONLY the selected project's root causes (no generic defaults).
  const storageKey = `qcc-countermeasure-v2-${projectId}`;
  const canApprove = ADVISOR_ROLES.includes(userRole);
  const askConfirm = useConfirm();

  const [rootCauses, setRootCauses] = useState<RootCauseItem[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch { /* start empty */ }
    return [];
  });
  // The root cause the cursor is currently in — new countermeasures go here, and its
  // approval / implementation panel is the one shown below the table.
  const [activeRcId, setActiveRcId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // ── Root causes come from Step 4 (Why-Why) for THIS project ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`qcc-step4-rootcauses-${projectId}`);
      if (!raw) return;
      const imported: string[] = JSON.parse(raw);
      if (!Array.isArray(imported) || !imported.length) return;
      setRootCauses(prev => {
        const seen = new Set(prev.map(r => r.text.trim().toLowerCase()));
        const add = imported
          .map(t => (t || '').trim())
          .filter(t => t && !seen.has(t.toLowerCase()))
          .map(t => newRootCause(t));
        return add.length ? [...prev, ...add] : prev;
      });
    } catch { /* ignore */ }
  }, [projectId]);

  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem(storageKey, JSON.stringify(rootCauses));
      setSavedAt(new Date().toLocaleTimeString());
    }, 600);
    return () => clearTimeout(t);
  }, [rootCauses, storageKey]);

  // Keep an active root cause selected so the footer button always has a target.
  useEffect(() => {
    if (!activeRcId && rootCauses.length) setActiveRcId(rootCauses[0].id);
  }, [rootCauses, activeRcId]);

  const teamMembers = useMemo(() => {
    const team = mockTeams.find(t => t.id === teamId);
    if (!team) return [];
    const names = [team.leaderName, team.facilitatorName, team.coordinatorName].filter(Boolean) as string[];
    team.members.filter(m => m.isActive).forEach(m => names.push(m.memberName));
    return [...new Set(names)];
  }, [teamId]);

  /* ── Mutations ── */
  const patchRc = (id: string, patch: Partial<RootCauseItem>) =>
    setRootCauses(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));

  const addCountermeasure = (rcId: string) =>
    setRootCauses(prev => prev.map(r => (r.id === rcId
      ? { ...r, countermeasures: [...r.countermeasures, { id: uid('cm'), text: '', scores: {} }] } : r)));

  const removeCountermeasure = (rcId: string, cmId: string) =>
    setRootCauses(prev => prev.map(r => (r.id === rcId && r.countermeasures.length > MIN_CMS
      ? { ...r, countermeasures: r.countermeasures.filter(c => c.id !== cmId) } : r)));

  const updateCountermeasure = (rcId: string, cmId: string, text: string) =>
    setRootCauses(prev => prev.map(r => (r.id === rcId
      ? { ...r, countermeasures: r.countermeasures.map(c => (c.id === cmId ? { ...c, text } : c)) } : r)));

  const setScore = (rcId: string, cmId: string, col: EvalCol, raw: string) =>
    setRootCauses(prev => prev.map(r => {
      if (r.id !== rcId) return r;
      return {
        ...r,
        countermeasures: r.countermeasures.map(c => {
          if (c.id !== cmId) return c;
          const scores = { ...c.scores };
          const n = parseInt(raw, 10);
          if (raw === '' || Number.isNaN(n)) delete scores[col];
          else scores[col] = Math.min(MAX_POINTS, Math.max(0, n));
          return { ...c, scores };
        }),
      };
    }));

  /* ── Implementation tasks ── */
  const addTask = (rcId: string) =>
    setRootCauses(prev => prev.map(r => (r.id === rcId
      ? { ...r, implementation: [...r.implementation, { id: uid('task'), task: '', owner: '', dueDate: '', status: 'not_started', progress: 0 }] } : r)));
  const updateTask = (rcId: string, taskId: string, patch: Partial<ImplTask>) =>
    setRootCauses(prev => prev.map(r => (r.id === rcId
      ? { ...r, implementation: r.implementation.map(t => (t.id === taskId ? { ...t, ...patch } : t)) } : r)));
  const removeTask = (rcId: string, taskId: string) =>
    setRootCauses(prev => prev.map(r => (r.id === rcId
      ? { ...r, implementation: r.implementation.filter(t => t.id !== taskId) } : r)));

  /* ── Empty: root causes are owned by Step 4 ── */
  if (rootCauses.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-amber-300 bg-amber-50/40 p-8 text-center">
        <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
        <p className="text-sm font-semibold text-slate-700">No root causes for this project yet</p>
        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
          Root causes are taken from <strong>Step 4 — Root Cause Analysis (Why-Why)</strong>. Add them there for this
          project and they will appear here automatically, each with {MIN_CMS} countermeasure rows.
        </p>
      </div>
    );
  }

  const activeRc = rootCauses.find(r => r.id === activeRcId) || rootCauses[0];
  const recommended = bestCmOf(activeRc);
  const isApproved = activeRc.approvalStatus === 'approved';
  const rcBadge = STATUS_BADGE[activeRc.approvalStatus] || STATUS_BADGE.pending;

  return (
    <div className="space-y-4">
      {/* ── Root cause selector ── */}
      {rootCauses.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {rootCauses.map((rc, i) => {
            const on = rc.id === activeRc.id;
            const s = STATUS_BADGE[rc.approvalStatus] || STATUS_BADGE.pending;
            return (
              <button key={rc.id} onClick={() => setActiveRcId(rc.id)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${on ? 'bg-white/25' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</span>
                <span className="max-w-[150px] truncate">{rc.text}</span>
                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
              </button>
            );
          })}
        </div>
      )}

      {/* ── Selected root cause — compact card ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-slate-900 flex items-center justify-center flex-shrink-0"><Rocket className="w-4 h-4 text-white" /></div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Selected Root Cause</p>
              <p className="text-sm font-bold text-slate-800 leading-snug">{activeRc.text}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            {recommended && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-lg text-xs" title="Recommended — highest score">
                <Crown className="w-3.5 h-3.5 text-amber-500" />
                <span className="font-semibold text-amber-700 max-w-[150px] truncate">{recommended.text || 'Untitled'}</span>
                <span className="font-bold text-amber-800">{totalOf(recommended)} pts</span>
              </span>
            )}
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${rcBadge.cls}`}>{isApproved && <Lock className="w-3 h-3" />}{rcBadge.label}</span>
          </div>
        </div>
      </div>

      {/* ── Countermeasures table ── */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><ListChecks className="w-4 h-4 text-blue-600" /> Countermeasures</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b-2 border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                <th className="w-9 px-1 py-2.5 text-center">#</th>
                <th className="px-3 py-2.5 text-left min-w-[260px]">Countermeasure</th>
                {EVAL_CRITERIA.map(c => (
                  <th key={c.key} className="w-[92px] px-1 py-2.5 text-center leading-tight normal-case" title={c.label}>{c.label}</th>
                ))}
                <th className="w-[92px] px-1 py-2.5 text-center">Evaluation</th>
                <th className="w-10 px-1 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {(() => {
                const rc = activeRc;
                return rc.countermeasures.map((cm, ci) => {
                  const total = totalOf(cm);
                  const scored = isScored(cm);
                  const isBest = scored && recommended?.id === cm.id;
                  const isApprovedOne = rc.approvedCountermeasureId === cm.id;
                  return (
                    <tr key={cm.id}
                      className={`border-b border-slate-100 ${
                        isApprovedOne ? 'bg-emerald-50/60' : isBest ? 'bg-amber-50/40' : 'hover:bg-slate-50'
                      }`}>
                      <td className="px-1 py-2 text-center text-xs font-bold text-slate-500">{ci + 1}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {isBest && !isApprovedOne && <Crown className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                          {isApprovedOne && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />}
                          <input
                            value={cm.text}
                            onChange={e => updateCountermeasure(rc.id, cm.id, e.target.value)}
                            onFocus={() => setActiveRcId(rc.id)}
                            disabled={isApproved}
                            placeholder="Describe the countermeasure..."
                            className="w-full px-2 py-1.5 border border-transparent hover:border-slate-300 focus:border-blue-400 rounded text-sm outline-none bg-transparent focus:bg-white disabled:text-slate-500"
                          />
                        </div>
                      </td>
                      {EVAL_CRITERIA.map(({ key: col, label }) => (
                        <td key={col} className="px-1 py-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={2}
                            value={cm.scores[col] ?? ''}
                            onChange={e => setScore(rc.id, cm.id, col, e.target.value.replace(/\D/g, ''))}
                            onFocus={() => setActiveRcId(rc.id)}
                            disabled={isApproved}
                            title={`${label} — points out of ${MAX_POINTS}`}
                            className={`w-full px-1 py-1.5 border rounded text-sm font-bold text-center outline-none focus:ring-1 focus:ring-blue-400 disabled:cursor-not-allowed ${
                              cm.scores[col] === undefined ? 'border-slate-200 text-slate-400 bg-slate-50' : 'border-slate-300 text-slate-800 bg-white'
                            }`}
                          />
                        </td>
                      ))}
                      <td className="px-1 py-2">
                        {/* Auto-calculated: the sum of the points typed above. Read-only. */}
                        <span className={`block w-full px-1 py-1.5 border rounded text-sm font-bold text-center tabular-nums ${
                          scored ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-400'
                        }`}>
                          {scored ? total : ' '}
                        </span>
                      </td>
                      <td className="px-1 py-2 text-center">
                        {rc.countermeasures.length > MIN_CMS && !isApproved && (
                          <button onClick={async () => { if (await askConfirm({ title: 'Remove countermeasure?', message: 'This countermeasure will be deleted.', confirmText: 'Remove' })) removeCountermeasure(rc.id, cm.id); }} className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Remove countermeasure">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>

        {/* ── Footer: add a countermeasure to the selected root cause ── */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end flex-wrap gap-3">
          <button
            onClick={() => activeRc && addCountermeasure(activeRc.id)}
            disabled={!activeRc || activeRc.approvalStatus === 'approved'}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add Countermeasure
          </button>
        </div>
      </section>

      {/* ── Approval + implementation for the root cause the cursor is in ── */}
      {activeRc && (
        <SelectedRcPanel
          rc={activeRc}
          canApprove={canApprove}
          teamMembers={teamMembers}
          patchRc={patchRc}
          addTask={addTask}
          updateTask={updateTask}
          removeTask={removeTask}
        />
      )}
    </div>
  );
}

/* ───────── Active root cause: approval + implementation ───────── */
function SelectedRcPanel({ rc, canApprove, teamMembers, patchRc, addTask, updateTask, removeTask }: {
  rc: RootCauseItem;
  canApprove: boolean;
  teamMembers: string[];
  patchRc: (id: string, patch: Partial<RootCauseItem>) => void;
  addTask: (rcId: string) => void;
  updateTask: (rcId: string, taskId: string, patch: Partial<ImplTask>) => void;
  removeTask: (rcId: string, taskId: string) => void;
}) {
  const askConfirm = useConfirm();
  const recommended = bestCmOf(rc);
  const isApproved = rc.approvalStatus === 'approved';
  const isRejected = rc.approvalStatus === 'rejected';
  const approvedCm = rc.countermeasures.find(c => c.id === rc.approvedCountermeasureId);
  const implProgress = rc.implementation.length
    ? Math.round(rc.implementation.reduce((s, t) => s + t.progress, 0) / rc.implementation.length) : 0;
  const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400';

  return (
    <>
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center"><ClipboardList className="w-4 h-4 text-indigo-600" /></div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Advisor Approval</h3>
            <p className="text-[11px] text-slate-500">For root cause: <strong className="text-slate-700">{rc.text}</strong></p>
          </div>
        </div>
        <div className="p-5 space-y-4">
          {!canApprove && (
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500">
              <Lock className="w-3.5 h-3.5" /> Only Administrators and Department Heads can approve.
            </div>
          )}
          {isApproved ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 flex items-start gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-emerald-800">Approved: {approvedCm?.text || 'Selected countermeasure'}</p>
                  <p className="text-[11px] text-emerald-600">by {rc.approvedBy} · {rc.approvedAt ? new Date(rc.approvedAt).toLocaleString() : ''}</p>
                </div>
              </div>
              {canApprove && (
                <button onClick={() => patchRc(rc.id, { approvalStatus: 'pending', approvedBy: undefined, approvedAt: undefined, approvedCountermeasureId: undefined })}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-300 rounded-lg">Reopen</button>
              )}
            </div>
          ) : (
            <>
              {isRejected && (
                <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
                  <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm font-semibold text-red-800">Rejected — revise the countermeasures</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Countermeasure to approve</label>
                <select
                  value={rc.approvedCountermeasureId || recommended?.id || ''}
                  onChange={e => patchRc(rc.id, { approvedCountermeasureId: e.target.value })}
                  disabled={!canApprove || !recommended}
                  className={inputCls + ' disabled:bg-slate-50 disabled:text-slate-400'}
                >
                  {!recommended && <option value="">Score at least one countermeasure first</option>}
                  {rc.countermeasures.filter(isScored).map(c => (
                    <option key={c.id} value={c.id}>{c.text || 'Untitled'} — {totalOf(c)} pts{c.id === recommended?.id ? '  (recommended)' : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> Advisor Comments</label>
                <textarea value={rc.approvalComments} onChange={e => patchRc(rc.id, { approvalComments: e.target.value })} disabled={!canApprove} rows={2}
                  placeholder="Reason for approval or rejection..." className={inputCls + ' resize-none disabled:bg-slate-50'} />
              </div>
              {canApprove && (
                <div className="flex flex-col sm:flex-row gap-2">
                  <button onClick={() => patchRc(rc.id, { approvalStatus: 'approved', approvedCountermeasureId: rc.approvedCountermeasureId || recommended?.id, approvedBy: 'Advisor', approvedAt: new Date().toISOString() })}
                    disabled={!recommended}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-bold rounded-lg">
                    <CheckCircle2 className="w-4 h-4" /> Approve
                  </button>
                  <button onClick={() => patchRc(rc.id, { approvalStatus: 'rejected', approvedBy: 'Advisor', approvedAt: new Date().toISOString() })}
                    disabled={!recommended}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-red-100 hover:bg-red-200 disabled:bg-slate-100 disabled:text-slate-400 text-red-700 text-sm font-bold rounded-lg">
                    <XCircle className="w-4 h-4" /> Reject
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {isApproved && (
        <section className="bg-white rounded-xl border-2 border-emerald-300 shadow-sm overflow-hidden">
          <div className="px-5 py-4 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center"><Rocket className="w-4 h-4 text-emerald-700" /></div>
              <div>
                <h3 className="text-sm font-bold text-emerald-900">Implementation Plan</h3>
                <p className="text-[11px] text-emerald-700 truncate max-w-[420px]">{approvedCm?.text}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right"><p className="text-[10px] text-emerald-700 uppercase font-bold tracking-wider">Overall</p><p className="text-lg font-bold text-emerald-800 leading-none">{implProgress}%</p></div>
              <button onClick={() => addTask(rc.id)} className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg"><Plus className="w-3.5 h-3.5" /> Add Task</button>
            </div>
          </div>
          {rc.implementation.length === 0 ? (
            <div className="p-8 text-center">
              <ListChecks className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No implementation tasks yet.</p>
              <button onClick={() => addTask(rc.id)} className="mt-3 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg">Add the first task</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                    <th className="w-10 px-2 py-2.5 text-center">#</th>
                    <th className="px-3 py-2.5 text-left min-w-[220px]">Task</th>
                    <th className="px-2 py-2.5 text-left w-[160px]">Owner</th>
                    <th className="px-2 py-2.5 text-center w-[140px]">Due Date</th>
                    <th className="px-2 py-2.5 text-center w-[130px]">Status</th>
                    <th className="px-2 py-2.5 text-center w-[170px]">Progress</th>
                    <th className="w-12 px-2 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {rc.implementation.map((t, i) => {
                    const st = IMPL_STATUS.find(s => s.value === t.status)!;
                    return (
                      <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-2 py-2 text-center text-xs font-bold text-slate-500">{i + 1}</td>
                        <td className="px-3 py-2"><input value={t.task} onChange={e => updateTask(rc.id, t.id, { task: e.target.value })} placeholder="What needs to be done..." className="w-full px-2 py-1.5 border border-transparent hover:border-slate-300 focus:border-blue-400 rounded text-sm outline-none bg-transparent focus:bg-white" /></td>
                        <td className="px-2 py-2">
                          <select value={t.owner} onChange={e => updateTask(rc.id, t.id, { owner: e.target.value })} className="w-full px-1.5 py-1.5 border border-slate-200 rounded text-xs bg-white outline-none focus:ring-1 focus:ring-blue-400">
                            <option value="">Select owner</option>
                            {teamMembers.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-2"><input type="date" min="1990-01-01" max="2100-12-31" value={t.dueDate} onChange={e => updateTask(rc.id, t.id, { dueDate: e.target.value })} className="w-full px-1.5 py-1.5 border border-slate-200 rounded text-xs text-center outline-none focus:ring-1 focus:ring-blue-400" /></td>
                        <td className="px-2 py-2">
                          <select value={t.status} onChange={e => updateTask(rc.id, t.id, { status: e.target.value as ImplStatus })} className={`w-full px-1.5 py-1.5 border rounded text-[11px] font-semibold outline-none focus:ring-1 focus:ring-blue-400 ${st.color}`}>
                            {IMPL_STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2">
                            <input type="range" min={0} max={100} step={5} value={t.progress} onChange={e => updateTask(rc.id, t.id, { progress: parseInt(e.target.value, 10) })} className="flex-1 accent-emerald-600" />
                            <span className="text-[11px] font-bold text-slate-700 w-9 text-right">{t.progress}%</span>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-center"><button onClick={async () => { if (await askConfirm({ title: 'Remove task?', message: 'This implementation task will be deleted.', confirmText: 'Remove' })) removeTask(rc.id, t.id); }} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Remove task"><Trash2 className="w-3.5 h-3.5" /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {rc.implementation.length > 0 && (
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Overall progress</span>
              <div className="flex-1 h-2.5 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${implProgress}%` }} /></div>
              <span className="text-sm font-bold text-slate-800">{implProgress}%</span>
              <span className="text-[11px] text-slate-500 flex items-center gap-1"><User className="w-3 h-3" /> {rc.implementation.filter(t => t.owner).length} assigned</span>
            </div>
          )}
        </section>
      )}
    </>
  );
}
