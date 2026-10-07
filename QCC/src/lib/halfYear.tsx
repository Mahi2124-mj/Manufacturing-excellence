// ─── QCC Period scope (Year + Half) ─────────────────────────────────────────
// Every record belongs to a PERIOD = { year, half }:
//   H1  01 Apr – 09 Jul      H2  26 Jul – 02 Nov   (windows are Admin-editable in Settings)
// A single global period is picked from the header dropdown; every page filters
// its records to it. A record's period comes from its own date (team.createdAt,
// project.startedAt, …). A team may also carry an explicit period override
// (set at registration, or seeded below) which wins over its date.
//
// The dropdown is data-aware: pages call registerDates() with the dates they
// load, so the list offers the years that actually have data (plus the current
// year), each split into its two halves. On first load — until the user picks a
// period — the active period snaps to the latest one that has data, so the app
// never opens empty.
import { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect, type ReactNode } from 'react';
import { useCycles } from './cycles';

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
function loadTeamMap(): Record<string, Period> {
  const map: Record<string, Period> = { ...SEED_TEAM_PERIODS };
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
  periods: Period[];
  registerDates: (dates: (string | undefined)[]) => void;
  ranges: HalfRanges;
  setRanges: (r: HalfRanges) => void;
  labelHalf: (half: HalfKey) => string;    // "01 Apr – 09 Jul"
  labelPeriod: (p: Period) => string;      // "01 Apr – 09 Jul, 2024"
  isActive: (dateStr?: string) => boolean;  // by the record's own date; undated records are never hidden
  isProjectActive: (teamId?: string, dateStr?: string) => boolean; // a project follows its team's period
  teamHalf: (teamId: string, createdAt?: string) => HalfKey;
  teamYear: (teamId: string, createdAt?: string) => number;   // the team's QCC period year
  setTeamHalf: (teamId: string, half: HalfKey, dateOrYear?: string | number) => void;
  isTeamActive: (teamId: string, createdAt?: string) => boolean;
}

const Ctx = createContext<HalfYearCtx | null>(null);

export function HalfYearProvider({ children }: { children: ReactNode }) {
  const currentYear = new Date().getFullYear();
  const { cycleYears } = useCycles(); // the QCC-period dropdown is built from created cycles
  const [ranges, setRangesState] = useState<HalfRanges>(loadRanges);
  const [teamMap, setTeamMap] = useState<Record<string, Period>>(loadTeamMap);
  const stored = loadActive();
  const userPicked = useRef(stored != null);
  const [active, setActiveState] = useState<Period>(stored ?? { year: currentYear, half: 'H1' });

  const setRanges = useCallback((r: HalfRanges) => {
    setRangesState(r);
    try { localStorage.setItem(RANGES_KEY, JSON.stringify(r)); } catch { /* ignore */ }
  }, []);
  const setActive = useCallback((p: Period) => {
    userPicked.current = true;
    setActiveState(p);
    try { localStorage.setItem(ACTIVE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
  }, []);

  // If the currently-selected cycle year gets deleted, fall back to the newest remaining one.
  useEffect(() => {
    if (cycleYears.length && !cycleYears.includes(active.year)) {
      setActive({ year: cycleYears[0], half: active.half });
    }
  }, [cycleYears, active.year, active.half, setActive]);
  const setTeamHalf = useCallback((teamId: string, half: HalfKey, dateOrYear?: string | number) => {
    const year = typeof dateOrYear === 'number' ? dateOrYear : (yearOf(dateOrYear) ?? new Date().getFullYear());
    setTeamMap(prev => {
      const next = { ...prev, [teamId]: { year, half } };
      try {
        // persist only the user-set overrides (seeds live in code)
        const persistable: Record<string, Period> = {};
        Object.keys(next).forEach(k => { if (!(k in SEED_TEAM_PERIODS) || !samePeriod(next[k], SEED_TEAM_PERIODS[k])) persistable[k] = next[k]; });
        localStorage.setItem(TEAM_KEY, JSON.stringify(persistable));
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Periods come from the created QCC cycles now — kept as a no-op so callers stay simple.
  const registerDates = useCallback((_dates: (string | undefined)[]) => { /* no-op */ }, []);

  // Build the QCC-period dropdown strictly from the created cycles' years (Admin → QCC
  // Cycles). Only existing cycles show; deleting a cycle drops its period from the list.
  const periods = useMemo(() => {
    const years = cycleYears.length ? [...new Set(cycleYears)] : [currentYear];
    const out: Period[] = [];
    years.sort((a, b) => b - a).forEach(y => { out.push({ year: y, half: 'H2' }); out.push({ year: y, half: 'H1' }); });
    return out;
  }, [cycleYears, currentYear]);

  const value = useMemo<HalfYearCtx>(() => {
    const teamHalf = (teamId: string, createdAt?: string): HalfKey => teamMap[teamId]?.half ?? halfWith(ranges, createdAt);
    // Teams registered before multi-cycle support have no period override and no
    // (or legacy) createdAt — they belong to the original QCC cycle. Pin them to the
    // earliest existing cycle year so that adding a NEW cycle (e.g. 2027) opens EMPTY
    // instead of inheriting every old team. A team's year is: its explicit override →
    // its createdAt year (only if that year actually has a cycle) → the base year.
    const baseYear = cycleYears.length ? cycleYears[cycleYears.length - 1] : currentYear;
    const yearForTeam = (teamId: string, createdAt?: string): number => {
      const overrideYear = teamMap[teamId]?.year;
      if (overrideYear != null) return overrideYear;
      const yr = yearOf(createdAt);
      return yr != null && cycleYears.includes(yr) ? yr : baseYear;
    };
    const isActive = (dateStr?: string): boolean => {
      if (!dateStr) return true;
      const yr = yearOf(dateStr);
      if (yr == null) return true;
      return yr === active.year && halfWith(ranges, dateStr) === active.half;
    };
    // Both halves of the period have to match. The half is the team's explicit override
    // if it has one, otherwise the half its registration date falls into — defaulting
    // everyone to H1 was what made every team show up in every period.
    const isTeamActive = (teamId: string, createdAt?: string): boolean =>
      yearForTeam(teamId, createdAt) === active.year && teamHalf(teamId, createdAt) === active.half;

    return {
      active, setActive, periods, registerDates, ranges, setRanges,
      labelHalf: (half: HalfKey) => `${fmtMMDD(ranges[half].start)} – ${fmtMMDD(ranges[half].end)}`,
      labelPeriod: (p: Period) => `${fmtMMDD(ranges[p.half].start)} – ${fmtMMDD(ranges[p.half].end)}, ${p.year}`,
      // A dated record is in scope when BOTH its year and its half match the selection.
      // Undated records stay visible rather than vanishing from every period.
      isActive,
      // Projects, and everything hanging off them (actions, approvals, workflow), take
      // their period from the OWNING TEAM. Team registration stamps that period, so the
      // Teams list and the Projects list can never disagree about what a period contains.
      isProjectActive: (teamId?: string, dateStr?: string) =>
        (teamId ? isTeamActive(teamId, dateStr) : isActive(dateStr)),
      teamHalf,
      teamYear: (teamId: string, createdAt?: string) => yearForTeam(teamId, createdAt),
      setTeamHalf,
      // A team is in the active period only when BOTH its year and its half match —
      // year filtering is what keeps a new cycle's team list empty until teams are added.
      isTeamActive,
    };
  }, [active, periods, ranges, teamMap, cycleYears, currentYear, setActive, setRanges, setTeamHalf, registerDates]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHalfYear(): HalfYearCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useHalfYear must be used within a HalfYearProvider');
  return ctx;
}
