import { useState, useEffect } from 'react';
import {
  ShieldCheck, Lock, Unlock, CheckCircle2, Download, Flag,
  CornerUpLeft, AlertTriangle, ClipboardList,
} from 'lucide-react';
import { openFinalReport, buildFinalReportHTML } from '../lib/finalReport';
import type { QCCProject, Team } from '../types';
import type { WorkflowStepView } from '../lib/activitySteps';

export interface ClosureApproval {
  decision: 'approved' | 'rejected';
  by: string;
  role: string;
  at: string;
  remarks?: string;
  sentBackToStep?: number; // 0-based activeStep index the project was sent back to
}
export interface ClosureState {
  overallStatus: string;
  closureDate: string;
  finalComments: string;
  lessonsLearned: string;
  approval: ClosureApproval | null;
}

export const CLOSURE_KEY = (projectId: string) => `qcc-final-closure-${projectId}`;

const STATUS_OPTIONS = [
  'Completed – Targets Achieved',
  'Completed – Targets Partially Achieved',
  'Completed with Deviations',
  'On Hold',
  'Cancelled',
];

const emptyClosure = (): ClosureState => ({
  overallStatus: STATUS_OPTIONS[0],
  closureDate: '',
  finalComments: '',
  lessonsLearned: '',
  approval: null,
});

export function loadClosure(projectId: string): ClosureState {
  try {
    const s = localStorage.getItem(CLOSURE_KEY(projectId));
    if (s) return { ...emptyClosure(), ...JSON.parse(s) };
  } catch { /* fall through to default */ }
  return emptyClosure();
}

interface Props {
  projectId: string;
  projectName?: string;
  teamName?: string;
  userRole?: string;
  steps: WorkflowStepView[];
  project?: QCCProject;
  team?: Team | null;
  periodLabel?: string;
  onSendBack: (stepIndex: number, remarks: string) => void;
  onClosureChange?: (c: ClosureState) => void;
}

export default function FinalProjectClosure({
  projectId, projectName = 'QCC Project', teamName = '', userRole = 'member',
  steps, project, team, periodLabel, onSendBack, onClosureChange,
}: Props) {
  const isAdvisor = userRole === 'admin' || userRole === 'facilitator';

  const [state, setState] = useState<ClosureState>(() => loadClosure(projectId));
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectStep, setRejectStep] = useState(0);
  const [rejectRemarks, setRejectRemarks] = useState('');

  useEffect(() => { setState(loadClosure(projectId)); setRejectOpen(false); }, [projectId]);

  const locked = state.approval?.decision === 'approved';
  const rejected = state.approval?.decision === 'rejected';

  const persist = (next: ClosureState) => {
    setState(next);
    localStorage.setItem(CLOSURE_KEY(projectId), JSON.stringify(next));
    onClosureChange?.(next);
  };
  const patch = (p: Partial<ClosureState>) => persist({ ...state, ...p });

  const approve = () => {
    if (!isAdvisor) return;
    persist({ ...state, approval: { decision: 'approved', by: 'Advisor', role: userRole, at: new Date().toISOString() } });
  };
  const unlock = () => {
    if (!isAdvisor) return;
    persist({ ...state, approval: null });
  };
  const sendBack = () => {
    if (!isAdvisor || !rejectRemarks.trim()) return;
    const remarks = rejectRemarks.trim();
    persist({ ...state, approval: { decision: 'rejected', by: 'Advisor', role: userRole, at: new Date().toISOString(), remarks, sentBackToStep: rejectStep } });
    setRejectOpen(false);
    setRejectRemarks('');
    onSendBack(rejectStep, remarks); // auto-route the workflow back to the chosen step
  };

  // Steps the advisor can send the project back to (everything before this closure step).
  const priorSteps = steps.slice(0, Math.max(0, steps.length - 1));

  // Generate the full, print-ready A4 Final Report (opens in a new tab → Save as PDF).
  const downloadReport = () => {
    if (!project) { alert('Report data is still loading — please try again in a moment.'); return; }
    const ctx = { project, team: team ?? null, workflowSteps: steps, closure: state, periodLabel, generatedAt: new Date().toLocaleString() };
    if (openFinalReport(ctx)) return;
    // Pop-up blocked → download the same report as a self-contained HTML file instead.
    const blob = new Blob([buildFinalReportHTML(ctx)], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(project.title || 'QCC').replace(/[^\w-]+/g, '_')}_Final_Report.html`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const field = `w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed`;

  return (
    <div className="space-y-4">
      {/* ── Status / lock banner ── */}
      <div className={`rounded-xl border shadow-sm p-4 flex items-center justify-between gap-3 flex-wrap ${
        locked ? 'bg-emerald-50 border-emerald-200' : rejected ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'
      }`}>
        <div className="flex items-center gap-2.5">
          <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
            locked ? 'bg-emerald-100 text-emerald-600' : rejected ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'
          }`}>
            {locked ? <Lock size={18} /> : rejected ? <AlertTriangle size={18} /> : <Flag size={18} />}
          </span>
          <div>
            <p className="text-sm font-bold text-slate-800">
              {locked ? 'Project Closed & Locked' : rejected ? 'Sent back for correction' : 'Pending Advisor Final Approval'}
            </p>
            <p className="text-[11px] text-slate-500">
              {locked
                ? `Approved by ${state.approval!.by} · ${new Date(state.approval!.at).toLocaleString()}. The entire workflow is read-only — only an Advisor can unlock it.`
                : rejected
                ? `Returned to Step ${(state.approval!.sentBackToStep ?? 0) + 1}${steps[(state.approval!.sentBackToStep ?? 0)] ? ' — ' + steps[(state.approval!.sentBackToStep ?? 0)].title : ''} with remarks. Re-approve once corrected.`
                : 'Complete the closure details below, then the Advisor gives the final approval to close and lock the project.'}
            </p>
          </div>
        </div>
        {isAdvisor && locked && (
          <button onClick={unlock} className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors">
            <Unlock size={15} /> Unlock Workflow
          </button>
        )}
      </div>

      {/* ── Closure details ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><ClipboardList size={15} className="text-blue-600" /> Project Closure Details</h3>
          <button onClick={downloadReport} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors">
            <Download size={14} /> Download Final Report (PDF)
          </button>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Overall Project Status</label>
            <select value={state.overallStatus} onChange={e => patch({ overallStatus: e.target.value })} disabled={locked} className={field}>
              {STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Project Closure Date</label>
            <input type="date" value={state.closureDate} onChange={e => patch({ closureDate: e.target.value })} disabled={locked} className={field} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Final Comments</label>
            <textarea value={state.finalComments} onChange={e => patch({ finalComments: e.target.value })} disabled={locked} rows={3} placeholder="Closing summary of the project outcome…" className={`${field} resize-none`} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Lessons Learned</label>
            <textarea value={state.lessonsLearned} onChange={e => patch({ lessonsLearned: e.target.value })} disabled={locked} rows={3} placeholder="Key takeaways, what worked, what to improve next time…" className={`${field} resize-none`} />
          </div>
        </div>
      </div>

      {/* ── Advisor final approval ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <ShieldCheck size={15} className="text-emerald-600" />
          <h3 className="text-sm font-bold text-slate-800">Advisor Final Approval</h3>
        </div>
        <div className="p-4">
          {!isAdvisor ? (
            <div className="flex items-start gap-2.5 text-sm text-slate-500">
              <AlertTriangle size={16} className="text-slate-400 flex-shrink-0 mt-0.5" />
              <span>Only the <strong className="text-slate-700">Advisor</strong> can give the final approval. Current decision:{' '}
                <strong className={locked ? 'text-emerald-600' : rejected ? 'text-red-600' : 'text-slate-600'}>
                  {locked ? 'Approved & Closed' : rejected ? 'Sent back for correction' : 'Pending'}
                </strong>.
              </span>
            </div>
          ) : locked ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 size={16} /> Final approval granted — the project is closed and the workflow is locked.
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">Leader &amp; Coordinator approvals are already captured in the earlier steps. Give the final closure decision below.</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={approve} className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors">
                  <CheckCircle2 size={15} /> Approve &amp; Close Project
                </button>
                <button onClick={() => setRejectOpen(o => !o)} className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg border transition-colors ${rejectOpen ? 'bg-red-600 text-white border-red-600' : 'border-red-300 text-red-600 hover:bg-red-50'}`}>
                  <CornerUpLeft size={15} /> Reject &amp; Send Back
                </button>
              </div>

              {rejectOpen && (
                <div className="rounded-lg border border-red-200 bg-red-50/60 p-3 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">Send back to step (for correction)</label>
                      <select value={rejectStep} onChange={e => setRejectStep(Number(e.target.value))} className={field}>
                        {priorSteps.map(s => <option key={s.number} value={s.number - 1}>Step {s.number} — {s.title}</option>)}
                      </select>
                    </div>
                    <div className="flex items-end">
                      <p className="text-[11px] text-red-600/80 leading-snug">On send-back the project auto-returns to the selected step and your remarks are shown there for correction.</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Remarks for correction <span className="text-red-500">*</span></label>
                    <textarea value={rejectRemarks} onChange={e => setRejectRemarks(e.target.value)} rows={2} placeholder="Describe what needs to be corrected…" className={`${field} resize-none`} />
                  </div>
                  <div className="flex justify-end">
                    <button onClick={sendBack} disabled={!rejectRemarks.trim()} className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors">
                      <CornerUpLeft size={15} /> Send Back for Correction
                    </button>
                  </div>
                </div>
              )}

              {rejected && !rejectOpen && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  <p className="font-semibold mb-0.5">Last decision: sent back to Step {(state.approval!.sentBackToStep ?? 0) + 1} for correction.</p>
                  <p className="text-red-600/90">Remarks: {state.approval!.remarks || '—'}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
