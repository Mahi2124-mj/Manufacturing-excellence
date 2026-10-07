// ─── Activity Steps = single source of truth for the QCC Workflow ───────────
// Admin → Activity Steps edits this config; the QCC Workflow (and the Projects
// tracker, Admin Team-Control stage, Approvals labels) all read `workflowSteps`
// from here, so add / edit / delete / reorder / rename / activate instantly and
// consistently reshape every workflow. Persisted to localStorage so it survives
// reloads and syncs across tabs.
import {
  createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode,
} from 'react';
import {
  Lightbulb, Target, Calendar, GitBranch, Rocket, CheckCircle, BookOpen,
  TrendingUp, Flag, ListChecks, ClipboardList, Wrench, Search, BarChart3,
  Award, Users, FileText, Settings, type LucideIcon,
} from 'lucide-react';
import { mockActivitySteps } from './data';
import type { ActivityStep } from '../types';

// v2: re-seed the corrected step order for everyone (7 Standardization → 8 Overall
// Benefits → 9 Final Project Closure); bumping the key discards any stale v1 order.
const STORAGE_KEY = 'qcc-activity-steps-v2';

const ICON_MAP: Record<string, LucideIcon> = {
  Lightbulb, Target, Calendar, GitBranch, Rocket, CheckCircle, BookOpen,
  TrendingUp, Flag, ListChecks, ClipboardList, Wrench, Search, BarChart3,
  Award, Users, FileText, Settings,
};

/** Render the lucide icon for a step by its stored icon name (falls back to a generic one). */
export function stepIconEl(name: string | undefined, size = 18) {
  const Icon = (name && ICON_MAP[name]) || ListChecks;
  return <Icon size={size} />;
}

/** A workflow step as consumed by the QCC Workflow — numbered by live sequence. */
export interface WorkflowStepView {
  id: string;
  number: number;        // 1-based position among the ACTIVE steps
  title: string;
  icon?: string;
  workflowKey?: string;  // maps to the rich workflow component (undefined → generic step form)
  description: string;
}

function loadSteps(): ActivityStep[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as ActivityStep[];
    }
  } catch { /* fall through to defaults */ }
  return mockActivitySteps.map(s => ({ ...s }));
}

interface ActivityStepsCtx {
  steps: ActivityStep[];               // every step, in configured order
  workflowSteps: WorkflowStepView[];   // active steps only, renumbered 1..n
  addStep: (name: string, description?: string) => void;
  updateStep: (id: string, patch: Partial<ActivityStep>) => void;
  deleteStep: (id: string) => void;
  moveStep: (id: string, dir: -1 | 1) => void;
  toggleActive: (id: string) => void;
}

const Ctx = createContext<ActivityStepsCtx | null>(null);

export function ActivityStepsProvider({ children }: { children: ReactNode }) {
  const [steps, setSteps] = useState<ActivityStep[]>(loadSteps);

  // Keep in sync when another tab edits the config.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) setSteps(loadSteps()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Every mutation runs through here: re-number `order` to array position and persist.
  const persist = useCallback((updater: (prev: ActivityStep[]) => ActivityStep[]) => {
    setSteps(prev => {
      const next = updater(prev).map((s, i) => ({ ...s, order: i + 1 }));
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const addStep = useCallback((name: string, description = '') => {
    const now = new Date().toISOString();
    persist(prev => [...prev, {
      id: `step-${Date.now()}`, order: prev.length + 1, name: name.trim(), description,
      isDefault: false, isActive: true, createdAt: now, updatedAt: now,
    }]);
  }, [persist]);

  const updateStep = useCallback((id: string, patch: Partial<ActivityStep>) => {
    persist(prev => prev.map(s => (s.id === id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s)));
  }, [persist]);

  const deleteStep = useCallback((id: string) => {
    persist(prev => prev.filter(s => s.id !== id));
  }, [persist]);

  const toggleActive = useCallback((id: string) => {
    persist(prev => prev.map(s => (s.id === id ? { ...s, isActive: !s.isActive, updatedAt: new Date().toISOString() } : s)));
  }, [persist]);

  const moveStep = useCallback((id: string, dir: -1 | 1) => {
    persist(prev => {
      const idx = prev.findIndex(s => s.id === id);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }, [persist]);

  const workflowSteps = useMemo<WorkflowStepView[]>(() =>
    steps.filter(s => s.isActive).map((s, i) => ({
      id: s.id, number: i + 1, title: s.name, icon: s.icon, workflowKey: s.workflowKey, description: s.description,
    })), [steps]);

  const value = useMemo<ActivityStepsCtx>(() => ({
    steps, workflowSteps, addStep, updateStep, deleteStep, moveStep, toggleActive,
  }), [steps, workflowSteps, addStep, updateStep, deleteStep, moveStep, toggleActive]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useActivitySteps(): ActivityStepsCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useActivitySteps must be used within an ActivityStepsProvider');
  return ctx;
}
