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
export const MAX_CYCLES_PER_YEAR = 2;   // a QCC year has two cycles (H1 and H2)

// The last list this browser saw, shown until the backend answers. An empty list is a
// real answer (every cycle deleted), so it is kept as empty — no built-in default cycle
// may reappear after the admin deleted them all.
function loadCache(): QCCCycleConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) return p as QCCCycleConfig[]; }
  } catch { /* fall through */ }
  return [];
}
function saveCache(list: QCCCycleConfig[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

interface Ctx {
  cycles: QCCCycleConfig[];
  cycleYears: number[];                       // distinct ACTIVE-cycle years, newest first — drives the period dropdown
  createCycle: (data: { name: string; startDate: string; endDate: string; maxTeams: number }) => QCCCycleConfig | null;
  deleteCycle: (id: string) => Promise<boolean>;   // false = the server refused, the cycle is back
  setCycleActive: (id: string, active: boolean) => void;  // independent on/off — off = hidden from the header dropdown
}

const C = createContext<Ctx | null>(null);

export function CyclesProvider({ children }: { children: ReactNode }) {
  const [cycles, setCycles] = useState<QCCCycleConfig[]>(loadCache);

  const commit = useCallback((next: QCCCycleConfig[]) => { setCycles(next); saveCache(next); }, []);

  // Backend is the source of truth — load the persisted cycles on mount.
  useEffect(() => {
    api.listCycles()
      .then(list => { if (Array.isArray(list)) commit(list); })
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
    // A QCC year runs two cycles (one per half), so at most two per year.
    if (cycles.filter(c => c.year === year).length >= MAX_CYCLES_PER_YEAR) return null;
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

  // Removed at once; if the server refuses, the cycle comes back and the caller is told.
  const deleteCycle = useCallback(async (id: string): Promise<boolean> => {
    const before = cycles;
    commit(cycles.filter(c => c.id !== id));
    try {
      await api.deleteCycle(id);
      return true;
    } catch {
      commit(before);
      return false;
    }
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
