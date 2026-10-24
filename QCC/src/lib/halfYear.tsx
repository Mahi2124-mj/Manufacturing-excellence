// ─── QCC Period scope (Year + Half) = one QCC cycle ────────────────────────
// Every record belongs to a PERIOD = { year, half }, and each period is one QCC cycle
// (Admin → QCC Cycles): a cycle starting Jan–Jun is its year's H1, Jul–Dec its H2, and
// the cycle's own start/end dates are the period's window. A half without a cycle
// falls back to the default window below (only used before any cycle exists).
//
// A single global period is picked from the header dropdown (one entry per active
// cycle); every page filters its records to it. A team's period is its explicit pin
// (stamped at registration, or seeded below), otherwise the cycle that was running on
// its registration date. So a newly created cycle opens EMPTY: older teams stay with
// the cycle they were registered in.
import { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect, type ReactNode } from 'react';
import { useCycles, cycleHalf } from './cycles';
import { sharedStore } from './sharedStore';
import { useServerConfig } from './useServerConfig';

export type HalfKey = 'H1' | 'H2';
export interface HalfRange { start: string; end: string } // 'MM-DD'
export interface HalfRanges { H1: HalfRange; H2: HalfRange }
export interface Period { year: number; half: HalfKey }

export const DEFAULT_RANGES: HalfRanges = {
  H1: { start: '04-01', end: '07-09' },
  H2: { start: '07-26', end: '11-02' },
};

// Teams shifted to a specific period regardless of (or lacking) their own date.
// localStorage overrides win over these seeds.
const SEED_TEAM_PERIODS: Record<string, Period> = {
  'QCC-MNT-001': { year: 2026, half: 'H2' }, // ELIMINATOR → 26 Jul – 02 Nov 2026
};

const RANGES_KEY = 'qcc-halfyear-ranges';
const ACTIVE_KEY = 'qcc-active-period';
const TEAM_KEY = 'qcc-team-period';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtMMDD(mmdd: string): string {
  const [mm, dd] = mmdd.split('-');
  const mi = parseInt(mm, 10) - 1;
  return `${(parseInt(dd, 10) || 0).toString().padStart(2, '0')} ${MONTHS[mi] ?? mm}`;
}

function mdOfRange(mmdd: string): number {
  const [mm, dd] = mmdd.split('-').map(x => parseInt(x, 10));
  return (mm || 0) * 100 + (dd || 0);
}
function mdOfDate(dateStr?: string): number | null {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (m) return parseInt(m[2], 10) * 100 + parseInt(m[3], 10);
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : (d.getMonth() + 1) * 100 + d.getDate();
}
// 'YYYY-MM-DD' of a date string (ISO dates and timestamps as stored), or null.
function isoDay(dateStr?: string): string | null {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr.slice(0, 10);
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function yearOf(dateStr?: string): number | null {
  if (!dateStr) return null;
  const m = /^(\d{4})/.exec(dateStr);
  if (m) return parseInt(m[1], 10);
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d.getFullYear();
}

// Which half a date falls in — inside a window → that half; in the gap/outside →
// split at H2's start so every date resolves to exactly one half.
export function halfWith(ranges: HalfRanges, dateStr?: string): HalfKey {
  const md = mdOfDate(dateStr);
  if (md == null) return 'H1';
  const h1s = mdOfRange(ranges.H1.start), h1e = mdOfRange(ranges.H1.end);
  const h2s = mdOfRange(ranges.H2.start), h2e = mdOfRange(ranges.H2.end);
  if (md >= h1s && md <= h1e) return 'H1';
  if (md >= h2s && md <= h2e) return 'H2';
  return md < h2s ? 'H1' : 'H2';
}

function loadRanges(): HalfRanges {
  try { const raw = localStorage.getItem(RANGES_KEY); if (raw) return { ...DEFAULT_RANGES, ...JSON.parse(raw) }; } catch { /* ignore */ }
  return DEFAULT_RANGES;
}
// A team's pinned period. cycleId names the exact cycle it was registered in, so the pin
// still holds if another cycle is added to that year later (which can renumber H1/H2).
type TeamPin = Period & { cycleId?: string };

function loadTeamMap(): Record<string, TeamPin> {
  const map: Record<string, TeamPin> = { ...SEED_TEAM_PERIODS };
  try { const raw = localStorage.getItem(TEAM_KEY); if (raw) Object.assign(map, JSON.parse(raw)); } catch { /* ignore */ }
  return map;
}
function loadActive(): Period | null {
  try { const raw = localStorage.getItem(ACTIVE_KEY); if (raw) { const p = JSON.parse(raw); if (typeof p?.year === 'number' && (p.half === 'H1' || p.half === 'H2')) return p; } } catch { /* ignore */ }
  return null;
}
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const samePeriod = (a: Period, b: Period) => a.year === b.year && a.half === b.half;

interface HalfYearCtx {
  active: Period;
  setActive: (p: Period) => void;
  periods: Period[];                        // one per active QCC cycle, newest first (empty: no cycle)
  hasCycles: boolean;                       // false → no cycle, so no team or dated record shows
  registerDates: (dates: (string | undefined)[]) => void;
  ranges: HalfRanges;
  setRanges: (r: HalfRanges) => void;
  periodRange: (p: Period) => { start: string; end: string };   // 'YYYY-MM-DD' window of a period
  labelHalf: (half: HalfKey, year?: number) => string;   // "01 Jul – 30 Nov" (year: the active one)
  labelPeriod: (p: Period) => string;      // "01 Jul – 30 Nov, 2026"
  isActive: (dateStr?: string) => boolean;  // by the record's own date; undated records are never hidden
  isProjectActive: (teamId?: string, dateStr?: string) => boolean; // a project follows its team's period
  teamCycleId: (teamId: string, createdAt?: string) => string | null;   // the id of the cycle a team belongs to
  cyclePeriod: (cycleId: string) => Period | null;                      // the period (dropdown entry) of a cycle
  teamHalf: (teamId: string, createdAt?: string) => HalfKey;
  teamYear: (teamId: string, createdAt?: string) => number;   // the team's QCC period year
  setTeamHalf: (teamId: string, half: HalfKey, dateOrYear?: string | number) => void;
  isTeamActive: (teamId: string, createdAt?: string) => boolean;
}

const Ctx = createContext<HalfYearCtx | null>(null);

export function HalfYearProvider({ children }: { children: ReactNode }) {
  const currentYear = new Date().getFullYear();
  const { cycles, loaded: cyclesLoaded } = useCycles(); // the QCC periods ARE the created cycles
  const [ranges, setRangesState] = useState<HalfRanges>(loadRanges);
  const [teamMap, setTeamMap] = useState<Record<string, TeamPin>>(loadTeamMap);
  const stored = loadActive();
  const userPicked = useRef(stored != null);
  const [active, setActiveState] = useState<Period>(stored ?? { year: currentYear, half: 'H1' });

  // The half-year windows and the per-team period pins are shared through the server so
  // every PC files teams into the same period; localStorage keeps a cache copy.
  useServerConfig('config-halfyear-ranges', data => {
    if (!data || typeof data !== 'object') return;
    const r = { ...DEFAULT_RANGES, ...(data as Partial<HalfRanges>) };
    setRangesState(r);
    try { localStorage.setItem(RANGES_KEY, JSON.stringify(r)); } catch { /* ignore */ }
  });
  useServerConfig('config-team-periods', data => {
    if (!data || typeof data !== 'object') return;
    setTeamMap({ ...SEED_TEAM_PERIODS, ...(data as Record<string, TeamPin>) });
    try { localStorage.setItem(TEAM_KEY, JSON.stringify(data)); } catch { /* ignore */ }
  });

  const setRanges = useCallback((r: HalfRanges) => {
    setRangesState(r);
    try { localStorage.setItem(RANGES_KEY, JSON.stringify(r)); } catch { /* ignore */ }
    sharedStore.set('config-halfyear-ranges', r);
  }, []);
  const setActive = useCallback((p: Period) => {
    userPicked.current = true;
    setActiveState(p);
    try { localStorage.setItem(ACTIVE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
  }, []);

  // Every cycle as a period. All cycles (active or not) decide which period a date falls
  // in, so hiding a cycle never moves teams; only active ones are offered in the dropdown.
  const cyclePeriods = useMemo(() => cycles
    .filter(c => c.startDate)
    .map(c => ({
      id: c.id,
      year: c.year ?? yearOf(c.startDate) ?? currentYear,
      half: cycleHalf(c, cycles) as HalfKey,   // the year's first or second cycle, by start date
      start: c.startDate.slice(0, 10),
      end: (c.endDate || '').slice(0, 10),
      isActive: c.isActive,
    }))
    .sort((a, b) => a.start.localeCompare(b.start)), [cycles, currentYear]);

  const setTeamHalf = useCallback((teamId: string, half: HalfKey, dateOrYear?: string | number) => {
    const year = typeof dateOrYear === 'number' ? dateOrYear : (yearOf(dateOrYear) ?? new Date().getFullYear());
    const cycleId = cyclePeriods.find(c => c.year === year && c.half === half)?.id;
    setTeamMap(prev => {
      const next = { ...prev, [teamId]: cycleId ? { year, half, cycleId } : { year, half } };
      try {
        // persist only the user-set overrides (seeds live in code)
        const persistable: Record<string, TeamPin> = {};
        Object.keys(next).forEach(k => { if (!(k in SEED_TEAM_PERIODS) || !samePeriod(next[k], SEED_TEAM_PERIODS[k])) persistable[k] = next[k]; });
        localStorage.setItem(TEAM_KEY, JSON.stringify(persistable));
        sharedStore.set('config-team-periods', persistable);
      } catch { /* ignore */ }
      return next;
    });
  }, [cyclePeriods]);

  // Periods come from the created QCC cycles now — kept as a no-op so callers stay simple.
  const registerDates = useCallback((_dates: (string | undefined)[]) => { /* no-op */ }, []);

  // The header dropdown: one entry per active cycle, newest first (both halves of the
  // current year only before any cycle exists).
  const periods = useMemo<Period[]>(() => cyclePeriods
    .filter(c => c.isActive).map(c => ({ year: c.year, half: c.half }))
    .filter((p, i, all) => all.findIndex(q => samePeriod(q, p)) === i)
    .sort((a, b) => b.year - a.year || b.half.localeCompare(a.half)), [cyclePeriods]);

  // If the selected cycle is deleted or hidden, move to the newest remaining one (only
  // once the server's cycle list is in, so a stale browser copy cannot move it).
  useEffect(() => {
    if (cyclesLoaded && periods.length && !periods.some(p => samePeriod(p, active))) setActive(periods[0]);
  }, [cyclesLoaded, periods, active, setActive]);

  const value = useMemo<HalfYearCtx>(() => {
    // Every team and dated record belongs to a cycle; with no cycle at all, none shows.
    const hasCycles = cyclePeriods.length > 0;
    // Data shows only for the selected cycle, and only while that cycle is active: a
    // deactivated (or deleted) cycle leaves the dropdown and its data stops showing.
    const selectable = periods.some(p => samePeriod(p, active));
    const asPeriod = (c: { year: number; half: HalfKey }): Period => ({ year: c.year, half: c.half });
    type CyclePeriod = (typeof cyclePeriods)[number];
    // The cycle a date belongs to: the cycle running on that day (the later-starting one
    // when two overlap). A date outside every cycle — older data, or a deleted cycle's —
    // belongs to none, so a new cycle never inherits it. (Teams registered in the app are
    // pinned to their cycle, so this only decides for older, unpinned records.)
    const cycleOfDate = (dateStr?: string): CyclePeriod | null => {
      const d = isoDay(dateStr);
      if (!d) return null;
      const running = cyclePeriods.filter(c => c.start <= d && (!c.end || d <= c.end));
      return running[running.length - 1] ?? null;
    };
    const periodOfDate = (dateStr?: string): Period | null => {
      const c = cycleOfDate(dateStr);
      return c ? asPeriod(c) : null;
    };
    // A team's cycle: its pin (stamped when it was registered) — the exact cycle it names,
    // so a deleted cycle's teams belong to no cycle instead of moving into another one;
    // older pins without a cycle id name a year + half. Unpinned teams go by their date.
    const teamCycle = (teamId: string, createdAt?: string): CyclePeriod | null => {
      const pin = teamMap[teamId];
      if (pin) {
        return (pin.cycleId
          ? cyclePeriods.find(x => x.id === pin.cycleId)
          : cyclePeriods.find(x => x.year === pin.year && x.half === pin.half)) ?? null;
      }
      return cycleOfDate(createdAt);
    };
    const teamPeriod = (teamId: string, createdAt?: string): Period | null => {
      const c = teamCycle(teamId, createdAt);
      return c ? asPeriod(c) : null;
    };
    const isActive = (dateStr?: string): boolean => {
      if (!dateStr) return true;
      if (!hasCycles || !selectable) return false;
      const p = periodOfDate(dateStr);
      return !!p && samePeriod(p, active);
    };
    const isTeamActive = (teamId: string, createdAt?: string): boolean => {
      if (!hasCycles || !selectable) return false;
      const p = teamPeriod(teamId, createdAt);
      return !!p && samePeriod(p, active);
    };
    // A period's window: its cycle's own dates, else the default half-year window.
    const periodRange = (p: Period) => {
      const c = cyclePeriods.find(x => x.year === p.year && x.half === p.half);
      return c ? { start: c.start, end: c.end || `${p.year}-12-31` }
        : { start: `${p.year}-${ranges[p.half].start}`, end: `${p.year}-${ranges[p.half].end}` };
    };
    const labelHalf = (half: HalfKey, year: number = active.year) => {
      const r = periodRange({ year, half });
      return `${fmtMMDD(r.start.slice(5))} – ${fmtMMDD(r.end.slice(5))}`;
    };

    return {
      active, setActive, periods, hasCycles, registerDates, ranges, setRanges, periodRange,
      labelHalf,
      labelPeriod: (p: Period) => `${labelHalf(p.half, p.year)}, ${p.year}`,
      // A dated record is in scope when it falls in the selected cycle (a record outside
      // every cycle shows in none). Undated records stay visible.
      isActive,
      // Projects, and everything hanging off them (actions, approvals, workflow), take
      // their period from the OWNING TEAM. Team registration stamps that period, so the
      // Teams list and the Projects list can never disagree about what a period contains.
      isProjectActive: (teamId?: string, dateStr?: string) =>
        (teamId ? isTeamActive(teamId, dateStr) : isActive(dateStr)),
      teamCycleId: (teamId: string, createdAt?: string) => teamCycle(teamId, createdAt)?.id ?? null,
      cyclePeriod: (cycleId: string) => { const c = cyclePeriods.find(x => x.id === cycleId); return c ? asPeriod(c) : null; },
      teamHalf: (teamId: string, createdAt?: string) => teamPeriod(teamId, createdAt)?.half ?? 'H1',
      teamYear: (teamId: string, createdAt?: string) => teamPeriod(teamId, createdAt)?.year ?? yearOf(createdAt) ?? currentYear,
      setTeamHalf,
      // A team shows only in its own cycle, so a newly created cycle opens empty.
      isTeamActive,
    };
  }, [active, periods, ranges, teamMap, cyclePeriods, currentYear, setActive, setRanges, setTeamHalf, registerDates]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHalfYear(): HalfYearCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useHalfYear must be used within a HalfYearProvider');
  return ctx;
}
