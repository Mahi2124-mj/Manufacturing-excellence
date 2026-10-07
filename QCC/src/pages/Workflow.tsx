import { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Users, Search, GitBranch, Lightbulb, Rocket, CheckCircle, BookOpen,
  ChevronRight, Save, Send, RotateCcw, FileText, Image, Clock,
  Calendar, User, ChevronDown, AlertCircle, Loader2, Lock,
  Shield, Eye, FolderKanban, Target, TrendingUp, Flag, CornerUpLeft
} from 'lucide-react';
import { useActivitySteps, stepIconEl, type WorkflowStepView } from '../lib/activitySteps';
import { useAuth } from '../lib/auth';
import { useHalfYear } from '../lib/halfYear';
import { api, ApiError } from '../lib/api';
import { formatDate, formatDateTime } from '../lib/format';
import type { WorkflowStatus, QCCProject, Team } from '../types';
import ProblemIdentification from '../components/ProblemIdentification';
import CurrentSituationTarget from '../components/CurrentSituationTarget';
import ActivityPlan from '../components/ActivityPlan';
import RootCauseAnalysis from '../components/RootCauseAnalysis';
import CountermeasureStudy from '../components/CountermeasureStudy';
import OverallBenefits from '../components/OverallBenefits';
import BenefitsSection from '../components/BenefitsSection';
import ResultsCheck from '../components/ResultsCheck';
import WhyWhyAnalysis from '../components/WhyWhyAnalysis';
import StandardizationSection from '../components/StandardizationSection';
import LeaderCommentSection from '../components/LeaderCommentSection';
import FinalProjectClosure, { loadClosure, type ClosureState } from '../components/FinalProjectClosure';
import StepDocuments from '../components/StepDocuments';

// Steps that get a Document Register, with the documents a company quality project
// would typically attach at that phase (shown as guidance in the register).
const DOC_STEP_RECOMMEND: Record<string, string[]> = {
  'current-target': ['Current-status data sheet', 'Pareto / trend chart', 'Target statement'],
  'root-cause':     ['Fishbone diagram', 'Why-Why analysis sheet', 'Cause-validation data'],
  'countermeasure': ['Countermeasure matrix', 'Trial / implementation evidence', 'Cost-benefit sheet'],
  'results':        ['Before / after comparison', 'Result data & graphs', 'Target-achievement proof'],
};

const STATUS_CONFIG: Record<WorkflowStatus, { label: string; color: string; bg: string }> = {
  draft: { label: 'Draft', color: 'text-slate-600', bg: 'bg-slate-100' },
  saved: { label: 'Saved', color: 'text-blue-600', bg: 'bg-blue-100' },
  submitted: { label: 'Submitted', color: 'text-amber-600', bg: 'bg-amber-100' },
  under_review: { label: 'Under Review', color: 'text-purple-600', bg: 'bg-purple-100' },
  approved: { label: 'Approved', color: 'text-emerald-600', bg: 'bg-emerald-100' },
  rework: { label: 'Rework', color: 'text-red-600', bg: 'bg-red-100' },
};

const STEP_DETAILS: Record<number, { fields: string[]; guidance: string }> = {
  1: {
    fields: ['Theme / Problem Title', 'Problem Background', 'Selection Criteria', 'Team Consensus', 'Management Alignment'],
    guidance: 'Select a theme that aligns with organizational goals. Use data to justify the selection. Ensure team consensus and management support.'
  },
  2: {
    fields: ['Current Situation Data', 'Data Collection Method', 'Stratification', 'Target Value', 'Target Justification'],
    guidance: 'Grasp the present status by collecting relevant data. Stratify the problem to understand it better. Set a clear, measurable target based on data analysis.'
  },
  3: {
    fields: ['Activity Schedule', 'Responsibility Assignment', 'Milestones', 'Resources Required', 'Review Mechanism'],
    guidance: 'Create a detailed activity plan with clear timelines, responsibilities, and milestones. Define how progress will be reviewed and tracked.'
  },
  4: {
    fields: ['Cause & Effect Diagram', '5-Why Analysis', 'Data Validation of Causes', 'Root Cause Verification', 'Cause-Effect Relationship'],
    guidance: 'Analyze the problem deeply using quality tools like Fishbone diagram and 5-Why. Identify true root causes, not symptoms. Validate each cause with data.'
  },
  5: {
    fields: ['Proposed Countermeasures', 'Feasibility Study', 'Cost-Benefit Analysis', 'Implementation Plan', 'Trial Results'],
    guidance: 'Generate multiple countermeasures and evaluate each for feasibility, cost, and impact. Implement the best solution and document trial results.'
  },
  6: {
    fields: ['Before/After Data Comparison', 'Statistical Analysis', 'Improvement Percentage', 'Target Achievement', 'Intangible Benefits'],
    guidance: 'Check the results by comparing before and after data. Verify target achievement. Calculate both tangible (cost savings) and intangible benefits (morale, safety).'
  },
  7: {
    fields: ['Standard Operating Procedure', 'Control Plan', 'Training Records', 'Horizontal Deployment', 'Future Improvement Plans'],
    guidance: 'Standardize the successful countermeasures. Establish control mechanisms to sustain gains. Document procedures, train personnel, and plan horizontal deployment to similar areas.'
  },
  8: {
    fields: ['Leader Comments', 'Overall Benefits', 'Future Improvement Plans', 'Horizontal Deployment', 'Next Theme Ideas'],
    guidance: 'Capture the leader’s closing comments and the overall tangible & intangible benefits, then plan future improvements and the next theme.'
  },
};

export default function Workflow() {
  const { user } = useAuth();
  const hy = useHalfYear();
  const location = useLocation();
  const { workflowSteps } = useActivitySteps(); // steps come from Admin → Activity Steps

  const [projects, setProjects] = useState<QCCProject[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Persisted so a browser refresh keeps the same project + step instead of resetting.
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => {
    try { return localStorage.getItem('qcc-workflow-project'); } catch { return null; }
  });
  const [activeStep, setActiveStep] = useState<number>(() => {
    try { const v = parseInt(localStorage.getItem('qcc-workflow-step') || '', 10); return Number.isFinite(v) && v >= 0 ? v : 0; } catch { return 0; }
  });
  const [notes, setNotes] = useState('');
  const [savingStep, setSavingStep] = useState(false);
  const [stepMsg, setStepMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [closure, setClosure] = useState<ClosureState | null>(null);

  // Load projects (with their steps + statuses) and teams from the backend so drafts,
  // submitted steps and approvals persist across sessions and are visible to everyone.
  useEffect(() => {
    Promise.all([api.listProjects(), api.listTeams()])
      .then(([p, t]) => { setProjects(p); setTeams(t); })
      .catch(e => setLoadError(e instanceof ApiError ? e.message : 'Failed to load workflow data'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { hy.registerDates([...projects.map(p => p.startedAt), ...teams.map(t => t.createdAt)]); }, [projects, teams]); // eslint-disable-line react-hooks/exhaustive-deps

  // Remember the open project + step across refreshes.
  useEffect(() => { try { if (selectedProjectId) localStorage.setItem('qcc-workflow-project', selectedProjectId); } catch { /* ignore */ } }, [selectedProjectId]);
  useEffect(() => { try { localStorage.setItem('qcc-workflow-step', String(activeStep)); } catch { /* ignore */ } }, [activeStep]);

  const availableProjects = useMemo(() => {
    if (!user) return [];
    // Scope to the QCC period picked on the Dashboard, via each project's team.
    const scoped = projects.filter(p => hy.isProjectActive(p.teamId, p.startedAt));
    if (user.role === 'admin' || user.role === 'dept_head' || user.role === 'facilitator' || user.role === 'coordinator') {
      return scoped;
    }
    if (user.role === 'leader') {
      const ids = teams.filter(t => t.leaderName === user.name).map(t => t.id);
      return scoped.filter(p => ids.includes(p.teamId));
    }
    const ids = teams.filter(t => t.members.some(m => m.memberName === user.name)).map(t => t.id);
    return scoped.filter(p => ids.includes(p.teamId));
  }, [user, projects, teams, hy]);

  // Default the selection to the first available project once data arrives.
  useEffect(() => {
    if (!selectedProjectId && availableProjects.length > 0) setSelectedProjectId(availableProjects[0].id);
  }, [availableProjects, selectedProjectId]);

  // Deep-link from the QCC Projects "Timeline" button → open this project on the
  // Activity Plan step (Step 3). navigate('/workflow', { state: { projectId, stepKey } }).
  useEffect(() => {
    const st = location.state as { projectId?: string; stepKey?: string } | null;
    if (!st) return;
    if (st.projectId) setSelectedProjectId(st.projectId);
    if (st.stepKey) {
      const idx = workflowSteps.findIndex(s => s.workflowKey === st.stepKey);
      if (idx >= 0) {
        setActiveStep(idx);
        // Timeline → land directly on the Activity Plan table (scroll past the step's KPI cards).
        // The table renders/expands async, so retry a few times until it settles at the top.
        if (st.stepKey === 'activity-plan') {
          let tries = 0;
          const scrollToTable = () => {
            const el = document.getElementById('qcc-activity-plan-table');
            if (el) el.scrollIntoView({ block: 'start', behavior: tries === 0 ? 'auto' : 'smooth' });
            if (tries++ < 5) setTimeout(scrollToTable, 400);
          };
          setTimeout(scrollToTable, 500);
        }
      }
    }
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-dismiss the save / submit toast.
  useEffect(() => {
    if (!stepMsg) return;
    const t = setTimeout(() => setStepMsg(null), 4000);
    return () => clearTimeout(t);
  }, [stepMsg]);

  // If Admin removed / deactivated steps and the config shrank, clamp the active step.
  useEffect(() => {
    if (workflowSteps.length > 0 && activeStep > workflowSteps.length - 1) setActiveStep(workflowSteps.length - 1);
  }, [workflowSteps.length, activeStep]);

  const selectedProject = availableProjects.find(p => p.id === selectedProjectId) || availableProjects[0] || null;

  // Load the Final Project Closure state for the selected project (drives the workflow-wide lock).
  useEffect(() => { setClosure(selectedProject ? loadClosure(selectedProject.id) : null); }, [selectedProject?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save/submit the current step to the backend (PATCH /api/projects/{id}/steps/{n}).
  // Validation — a step can't be submitted for review while its form / table is completely empty.
  const stepHasData = (): boolean => {
    const root = document.getElementById('workflow-step-content');
    if (!root) return true;
    const controls = root.querySelectorAll('input, textarea, select');
    if (controls.length === 0) return true; // display-only step — nothing to fill
    for (const c of Array.from(controls)) {
      const el = c as HTMLInputElement;
      if (el.disabled) continue;
      if (el.type === 'checkbox' || el.type === 'radio') { if (el.checked) return true; }
      else if ((el.value ?? '').trim() !== '') return true;
    }
    return false;
  };

  const saveStep = async (status: WorkflowStatus) => {
    if (!selectedProject) return;
    // Sequential gate: block save/submit until every earlier step is approved.
    if (selectedProject.steps.slice(0, Math.min(activeStep, selectedProject.steps.length)).some(s => s.status !== 'approved')) {
      setStepMsg({ ok: false, text: 'Locked — approve the previous step first' });
      return;
    }
    // Validation: block submit when the step's form / table has no data filled in.
    if (status === 'submitted' && !stepHasData()) {
      setStepMsg({ ok: false, text: 'Fill in the step first' });
      return;
    }
    setSavingStep(true);
    setStepMsg(null);
    try {
      // Send the step title so the backend can CREATE this step if it doesn't exist yet
      // (admin-added steps beyond the seeded ones) — making it real & approvable.
      const body: { status: WorkflowStatus; title?: string; notes?: string } = { status, title: workflowSteps[activeStep]?.title };
      if (notes.trim()) body.notes = notes;
      const updated = await api.updateStep(selectedProject.id, activeStep + 1, body);
      setProjects(prev => prev.map(p => {
        if (p.id !== selectedProject.id) return p;
        const exists = p.steps.some(s => s.stepNumber === updated.stepNumber);
        const steps = exists
          ? p.steps.map(s => (s.stepNumber === updated.stepNumber ? updated : s))
          : [...p.steps, updated].sort((a, b) => a.stepNumber - b.stepNumber);
        return { ...p, steps };
      }));
      setStepMsg({ ok: true, text: status === 'saved' ? 'Draft saved' : 'Submitted for review' });
    } catch (e) {
      setStepMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Failed to save step' });
    } finally {
      setSavingStep(false);
    }
  };

  // No file-upload endpoint yet — open a picker and acknowledge the selection.
  const pickFile = (accept: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) setStepMsg({ ok: true, text: 'File uploads not available yet' });
    };
    input.click();
  };

  const handleProjectChange = (projectId: string) => {
    setSelectedProjectId(projectId);
    setActiveStep(0);
    setNotes('');
  };

  if (!user) return null;
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500">
        <Loader2 size={20} className="animate-spin mr-2" /> Loading workflow…
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="max-w-lg mx-auto mt-10 flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
        <AlertCircle size={20} className="text-red-600 flex-shrink-0" />
        <p className="text-sm font-medium text-red-800">{loadError}</p>
      </div>
    );
  }
  if (!selectedProject) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle size={20} className="text-amber-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">No projects available</p>
            <p className="text-xs text-amber-600 mt-0.5">No projects are registered under your account.</p>
          </div>
        </div>
      </div>
    );
  }

  const stepCount = workflowSteps.length;
  const currentStep = workflowSteps[Math.min(activeStep, Math.max(0, stepCount - 1))];
  const currentStepInfo = selectedProject.steps[activeStep];
  const selectedTeam = teams.find(t => t.id === selectedProject.teamId);
  // Where the Final Project Closure step currently sits (drives the workflow-wide lock).
  const closureIndex = workflowSteps.findIndex(s => s.workflowKey === 'closure');

  const realStepCount = selectedProject.steps.length;   // backend-backed workflow steps
  const approvedReal = selectedProject.steps.filter(s => s.status === 'approved').length;
  // Steps beyond the backend-backed count are frontend-only documentation steps with no
  // backend status — count them done once the backing QC process is fully approved, so
  // progress can still reach 100%.
  const frontendOnlyDone = realStepCount > 0 && approvedReal === realStepCount;
  const approvedSteps = approvedReal + (frontendOnlyDone ? Math.max(0, stepCount - realStepCount) : 0);
  const progressPercent = stepCount ? Math.round((approvedSteps / stepCount) * 100) : 0;

  // ── Final Project Closure drives a workflow-wide lock ──
  const closureLocked = closure?.approval?.decision === 'approved';
  const correction = closure?.approval?.decision === 'rejected'
    ? { stepIndex: closure.approval.sentBackToStep ?? 0, remarks: closure.approval.remarks ?? '' }
    : null;

  // ── Sequential gating: a step opens only after EVERY earlier step is approved ──
  // (You can't work on / submit step N until step N-1 is approved.)
  const stepLocked = (i: number) =>
    selectedProject.steps.slice(0, Math.min(i, selectedProject.steps.length)).some(s => s.status !== 'approved');
  const currentLocked = stepLocked(activeStep);

  // The QCC Workflow renders a rich component per step, chosen by the step's stable
  // workflowKey (from Admin → Activity Steps). Custom / admin-added steps with no key
  // fall back to a generic notes + attachments form. This is what keeps the workflow
  // in sync with the Activity Steps config — reorder / rename / add just reshapes this.
  const renderStepContent = (step?: WorkflowStepView) => {
    switch (step?.workflowKey) {
      case 'theme':
        return (
          <ProblemIdentification
            projectId={selectedProject.id}
            teamName={selectedProject.title}
            teamMembers={teams.find(t => t.id === selectedProject.teamId)?.members.filter(m => m.isActive).map((m, idx) => ({ id: `m${idx + 1}`, name: m.memberName })) || []}
          />
        );
      case 'current-target':
        return <CurrentSituationTarget />;
      case 'activity-plan':
        return (
          <ActivityPlan
            projectId={selectedProject.id}
            projectName={selectedProject.title}
            teamId={selectedProject.teamId}
            userRole={user.role}
            stepStatus={currentStepInfo?.status || 'draft'}
          />
        );
      case 'root-cause':
        return (<><RootCauseAnalysis projectId={selectedProject.id} /><WhyWhyAnalysis projectId={selectedProject.id} /></>);
      case 'countermeasure':
        return <CountermeasureStudy key={selectedProject.id} projectId={selectedProject.id} teamId={selectedProject.teamId} userRole={user?.role || 'member'} />;
      case 'results':
        return <ResultsCheck />;
      case 'standardization':
        return <StandardizationSection userRole={user?.role || 'member'} />;
      case 'benefits':
        return <OverallBenefits projectId={selectedProject.id} />;
      case 'closure':
        return (
          <FinalProjectClosure
            projectId={selectedProject.id}
            projectName={selectedProject.title}
            teamName={selectedTeam?.name || ''}
            userRole={user?.role || 'member'}
            steps={workflowSteps}
            project={selectedProject}
            team={selectedTeam || null}
            periodLabel={hy.labelPeriod(hy.active)}
            onClosureChange={setClosure}
            onSendBack={(stepIndex) => { setActiveStep(stepIndex); setNotes(selectedProject.steps[stepIndex]?.notes || ''); }}
          />
        );
      default:
        return (
          <>
            {step?.description && <p className="text-sm text-slate-600 mb-4 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">{step.description}</p>}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Notes &amp; Observations</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Add notes, observations, and key findings..."
                rows={4}
                className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
              />
            </div>
            <div className="mt-4">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Attachments</label>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => pickFile('.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx')} className="inline-flex items-center gap-1.5 px-3 py-2 border border-dashed border-slate-300 rounded-lg text-xs text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-colors">
                  <FileText size={14} /> Upload Document
                </button>
                <button onClick={() => pickFile('image/*')} className="inline-flex items-center gap-1.5 px-3 py-2 border border-dashed border-slate-300 rounded-lg text-xs text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-colors">
                  <Image size={14} /> Before/After Images
                </button>
              </div>
            </div>
          </>
        );
    }
  };


  return (
    <div className="space-y-6">
      {/* Toast notification for save / submit */}
      {stepMsg && (
        <div className="fixed top-6 right-6 z-[100] animate-[slideIn_0.25s_ease-out]">
          <div className={`flex items-center gap-2.5 px-5 py-3 rounded-xl shadow-2xl text-white text-sm font-medium max-w-sm ${
            stepMsg.ok ? 'bg-emerald-600' : 'bg-red-600'
          }`}>
            {stepMsg.ok ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
            <span>{stepMsg.text}</span>
            <button onClick={() => setStepMsg(null)} className="ml-1 text-white/80 hover:text-white flex-shrink-0" aria-label="Dismiss">
              <span className="text-lg leading-none">×</span>
            </button>
          </div>
        </div>
      )}

      {/* Project Selector */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-slate-50 to-blue-50/50 px-5 py-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <FolderKanban size={16} className="text-blue-600" />
            <span className="text-sm font-semibold text-slate-800">Select Project</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
              {availableProjects.length} available
            </span>
          </div>
        </div>
        <div className="p-5">
          {availableProjects.length === 0 ? (
            <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertCircle size={20} className="text-amber-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800">No projects available</p>
                <p className="text-xs text-amber-600 mt-0.5">No projects are registered under your account.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <select
                value={selectedProject.id}
                onChange={(e) => handleProjectChange(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white hover:border-blue-300 transition-colors"
              >
                {availableProjects.map(p => {
                  const team = teams.find(t => t.id === p.teamId);
                  return (
                    <option key={p.id} value={p.id}>
                      {p.title} — {team?.name || p.teamId}
                    </option>
                  );
                })}
              </select>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  Team: <strong className="text-slate-800">{selectedTeam?.name || selectedProject.teamId}</strong>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Leader: <strong className="text-slate-800">{selectedTeam?.leaderName || '—'}</strong>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                  Dept: <strong className="text-slate-800">{selectedProject.department}</strong>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Target: <strong className="text-slate-800">{selectedProject.targetCompletion}</strong>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Step Navigation */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <div className="flex" style={{ minWidth: `${Math.max(700, stepCount * 96)}px` }}>
            {workflowSteps.map((step, i) => {
              const stepStatus = selectedProject.steps[i]?.status || 'draft';
              const config = STATUS_CONFIG[stepStatus];
              const isActive = i === activeStep;
              const locked = stepLocked(i);
              return (
                <button
                  key={step.id}
                  onClick={() => { setActiveStep(i); setNotes(selectedProject.steps[i]?.notes || ''); }}
                  title={locked ? 'Locked — approve the previous step first' : step.title}
                  className={`flex-1 px-3 py-4 border-r border-slate-100 last:border-r-0 transition-all relative ${
                    isActive ? 'bg-blue-50' : locked ? 'bg-slate-50/70 hover:bg-slate-100' : 'hover:bg-slate-50'
                  }`}
                >
                  {isActive && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
                  <div className={`flex flex-col items-center text-center gap-1.5 ${locked ? 'opacity-60' : ''}`}>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                      stepStatus === 'approved' ? 'bg-emerald-100 text-emerald-600' :
                      locked ? 'bg-slate-100 text-slate-400' :
                      isActive ? 'bg-blue-100 text-blue-600' :
                      'bg-slate-100 text-slate-500'
                    }`}>
                      {stepStatus === 'approved' ? <CheckCircle size={18} /> : locked ? <Lock size={15} /> : stepIconEl(step.icon, 18)}
                    </div>
                    <p className={`text-[10px] font-medium leading-tight ${isActive ? 'text-blue-700' : 'text-slate-600'}`}>
                      {step.number}. {step.title}
                    </p>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${locked ? 'bg-slate-100 text-slate-400' : `${config.bg} ${config.color}`}`}>
                      {locked ? 'Locked' : config.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Workflow-wide lock banner — shown once the project is closed & approved */}
      {closureLocked && activeStep !== closureIndex && (
        <div className="flex items-center gap-2.5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl">
          <Lock size={18} className="text-emerald-600 flex-shrink-0" />
          <p className="text-sm text-emerald-800"><strong>Project closed & locked.</strong> The workflow is read-only after final approval — open <strong>Step {closureIndex + 1} · Final Project Closure</strong> to unlock (Advisor only).</p>
        </div>
      )}

      {/* Correction request — when the Advisor sent the project back to this step */}
      {correction && correction.stepIndex === activeStep && (
        <div className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-xl">
          <CornerUpLeft size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">Correction requested by Advisor</p>
            <p className="text-xs text-red-600 mt-0.5">{correction.remarks || 'Please review and correct this step.'}</p>
          </div>
        </div>
      )}

      {/* Main Content - Full Width */}
      <div id="workflow-step-content" className={`bg-white rounded-xl p-6 shadow-sm border border-slate-200 scroll-mt-4 ${closureLocked && activeStep !== closureIndex ? 'opacity-60 pointer-events-none select-none' : ''}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
            {stepIconEl(currentStep?.icon, 18)}
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Step {activeStep + 1}: {currentStep?.title}</h2>
          </div>
        </div>

        {renderStepContent(currentStep)}
      </div>

      {/* Document Register (upload PDF / image / Excel / PPT / Word) — steps 2, 4, 5, 6 */}
      {currentStep?.workflowKey && DOC_STEP_RECOMMEND[currentStep.workflowKey] && (
        <StepDocuments
          storageKey={`stepdocs-${selectedProject.id}-${currentStep.workflowKey}`}
          recommended={DOC_STEP_RECOMMEND[currentStep.workflowKey]}
          disabled={closureLocked && activeStep !== closureIndex}
        />
      )}

      {/* Step submit footer — on every step */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        {closureLocked && activeStep !== closureIndex ? (
          <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
            <Lock size={15} /> Project is closed &amp; locked — editing is disabled. Unlock from the Final Project Closure step.
          </div>
        ) : (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center sm:justify-end gap-2">
          {currentStepInfo?.status === 'rework' && !currentLocked && (
            <button
              onClick={() => saveStep('submitted')}
              disabled={savingStep}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-100 hover:bg-amber-200 disabled:opacity-60 text-amber-700 text-sm font-medium rounded-lg transition-colors">
              <RotateCcw size={16} /> Resubmit After Rework
            </button>
          )}
          <button
            onClick={() => saveStep('saved')}
            disabled={savingStep}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 text-sm font-medium rounded-lg transition-colors">
            <Save size={16} /> Save Draft
          </button>
          <button
            onClick={() => saveStep('submitted')}
            disabled={savingStep}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors shadow-sm shadow-blue-600/20">
            <Send size={16} /> Submit for Review
          </button>
        </div>
        )}
      </div>


    </div>
  );
}
