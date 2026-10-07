// ─── QCC Cycles = single source of truth for QCC periods ────────────────────
// Admin → QCC Cycles "Create Cycle" writes here. The header QCC-period dropdown
// (see halfYear) is built from the ACTIVE cycles' years, so every active cycle
// becomes a selectable QCC period across the whole app. Toggling a cycle to
// inactive hides its period from the dropdown; deleting it removes it entirely.
//
// PERSISTENCE: cycles live in the BACKEND database (permanent, shared across
// devices/browsers). This provider loads them from the API on mount and writes
// every create/delete/toggle straight back to the API. A localStorage copy is
// kept only as an offline cache for instant first paint / when the API is down.
import {
  createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode,
} from 'react';
import type { QCCCycleConfig } from '../types';
import { api } from './api';

const STORAGE_KEY = 'qcc-cycles';

// Fallback used only before the backend responds (or if it is unreachable). The
// real list always comes from the DB — see the mount effect below.
const DEFAULT_CYCLES: QCCCycleConfig[] = [
  { id: 'cyc-2026', name: 'QCC 2026', year: 2026, startDate: '2026-04-01', endDate: '2026-11-02', maxTeams: 40, isActive: true },
];

function loadCache(): QCCCycleConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) { const p = JSON.parse(raw); if (Array.isArray(p) && p.length) return p as QCCCycleConfig[]; }
  } catch { /* fall through */ }
  return DEFAULT_CYCLES;
}
function saveCache(list: QCCCycleConfig[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

interface Ctx {
  cycles: QCCCycleConfig[];
  cycleYears: number[];                       // distinct ACTIVE-cycle years, newest first — drives the period dropdown
  createCycle: (data: { name: string; startDate: string; endDate: string; maxTeams: number }) => QCCCycleConfig | null;
  deleteCycle: (id: string) => void;
  setCycleActive: (id: string, active: boolean) => void;  // independent on/off — off = hidden from the header dropdown
}

const C = createContext<Ctx | null>(null);

export function CyclesProvider({ children }: { children: ReactNode }) {
  const [cycles, setCycles] = useState<QCCCycleConfig[]>(loadCache);

  const commit = useCallback((next: QCCCycleConfig[]) => { setCycles(next); saveCache(next); }, []);

  // Backend is the source of truth — load the persisted cycles on mount.
  useEffect(() => {
    api.listCycles()
      .then(list => { if (Array.isArray(list) && list.length) commit(list); })
      .catch(() => { /* offline → keep the cached copy */ });
  }, [commit]);

  // Reflect cache changes made in other tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) setCycles(loadCache()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const createCycle = useCallback((data: { name: string; startDate: string; endDate: string; maxTeams: number }): QCCCycleConfig | null => {
    const year = parseInt((data.startDate || '').slice(0, 4), 10);
    if (!data.name.trim() || !data.startDate || !Number.isFinite(year)) return null;
    // Teams are grouped by year, so there is exactly one cycle per year.
    if (cycles.some(c => c.year === year)) return null;
    const tempId = `cyc-${Date.now()}`;
    const entry: QCCCycleConfig = {
      id: tempId, name: data.name.trim(), year,
      startDate: data.startDate, endDate: data.endDate || '', maxTeams: data.maxTeams || 20, isActive: true,
    };
    // Optimistic: show it instantly …
    commit([entry, ...cycles]);
    // … then persist to the DB (same id), adopting the saved row or rolling back on failure.
    api.createCycle({ id: tempId, name: entry.name, startDate: entry.startDate, endDate: entry.endDate, maxTeams: entry.maxTeams })
      .then(saved => setCycles(prev => { const n = prev.map(c => (c.id === tempId ? saved : c)); saveCache(n); return n; }))
      .catch(() => setCycles(prev => { const n = prev.filter(c => c.id !== tempId); saveCache(n); return n; }));
    return entry;
  }, [cycles, commit]);

  const deleteCycle = useCallback((id: string) => {
    commit(cycles.filter(c => c.id !== id));
    api.deleteCycle(id).catch(() => { /* best-effort; the optimistic removal already applied */ });
  }, [cycles, commit]);

  const setCycleActive = useCallback((id: string, active: boolean) => {
    commit(cycles.map(c => (c.id === id ? { ...c, isActive: active } : c)));
    api.updateCycle(id, { isActive: active }).catch(() => { /* best-effort */ });
  }, [cycles, commit]);

  // Only ACTIVE cycles feed the header period dropdown — inactive ones are hidden, deleted ones drop out.
  const cycleYears = useMemo(() => [...new Set(cycles.filter(c => c.isActive).map(c => c.year))].sort((a, b) => b - a), [cycles]);

  const value = useMemo<Ctx>(() => ({ cycles, cycleYears, createCycle, deleteCycle, setCycleActive }),
    [cycles, cycleYears, createCycle, deleteCycle, setCycleActive]);

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useCycles(): Ctx {
  const ctx = useContext(C);
  if (!ctx) throw new Error('useCycles must be used within a CyclesProvider');
  return ctx;
}
