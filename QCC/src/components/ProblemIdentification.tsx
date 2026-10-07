import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Plus, Trash2, Award, Star, CheckCircle2, AlertCircle,
  ChevronRight, Target, BarChart3, Crown, ArrowDown,
  Users, BookmarkCheck, AlertTriangle, Check, X,
  ArrowRight, Lock, Hash,
  Medal, Trophy, BadgeCheck, CircleDot, ArrowUpDown
} from 'lucide-react';
import { useConfirm } from './ConfirmDialog';

/* ───────── Types ───────── */
interface ProblemIdentificationProps {
  projectId?: string;
  teamName: string;
  teamMembers: Array<{ id: string; name: string }>;
}

interface ImprovementPoint {
  id: string;
  sr: number;
  description: string;
  scores: Record<string, number | string>;
}

type EvalSymbol = '◎' | '○' | '△' | '×';

interface EvalRow {
  problemId: string;
  problemDescription: string;
  effects: EvalSymbol;
  urgency: EvalSymbol;
  extentOfProblems: EvalSymbol;
  futureOutlook: EvalSymbol;
  hoshinAlignment: EvalSymbol;
  participationByAll: EvalSymbol;
  activityPeriod: EvalSymbol;
  actualCapability: EvalSymbol;
  totalScore: number;
  overallEvaluation: 'Excellent' | 'Good' | 'Moderate' | 'Weak';
}

/* Everything persisted for this step, so nothing is lost when navigating away. */
interface SavedState {
  points: ImprovementPoint[];
  evalMatrix: EvalRow[];
  selectedMemberIds: string[];
  selectedThemeId: string | null;
  chooseDifferent: boolean;
  differentReason: string;
  themeAccepted: boolean;
}

function readSaved(key: string): SavedState | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as SavedState) : null;
  } catch {
    return null;
  }
}

/* ───────── Constants ───────── */
const SYMBOLS: EvalSymbol[] = ['◎', '○', '△', '×'];
// Scoring Methodology (per the official QCC Excel sheet):
//   ◎ : 3 pts,  ○ : 2 pts,  △ : 1 pt,  × : 0 pts   → 8 criteria × 3 = 24 max
const SYMBOL_SCORE: Record<EvalSymbol, number> = { '◎': 3, '○': 2, '△': 1, '×': 0 };
const MAX_EVAL_SCORE = 24;

// Column names exactly as they appear in the Excel sheet.
const EVAL_FIELDS: { key: keyof EvalRow; label: string; short: string; group: 'impact' | 'capability' }[] = [
  { key: 'effects', label: 'Effects', short: 'EFF', group: 'impact' },
  { key: 'urgency', label: 'Urgency', short: 'URG', group: 'impact' },
  { key: 'extentOfProblems', label: 'Extend of Problems', short: 'EXT', group: 'impact' },
  { key: 'futureOutlook', label: 'Future Outlook', short: 'FUT', group: 'impact' },
  { key: 'hoshinAlignment', label: 'Hoshin', short: 'HOS', group: 'impact' },
  { key: 'participationByAll', label: 'Participation by All', short: 'PAR', group: 'capability' },
  { key: 'activityPeriod', label: 'Activity Period', short: 'PRD', group: 'capability' },
  { key: 'actualCapability', label: 'Actual Capability', short: 'CAP', group: 'capability' },
];

const SYMBOL_META: Record<EvalSymbol, { label: string; color: string; bg: string; ring: string }> = {
  '◎': { label: 'Excellent', color: 'text-emerald-700', bg: 'bg-emerald-50', ring: 'ring-emerald-300' },
  '○': { label: 'Good', color: 'text-blue-700', bg: 'bg-blue-50', ring: 'ring-blue-300' },
  '△': { label: 'Moderate', color: 'text-amber-700', bg: 'bg-amber-50', ring: 'ring-amber-300' },
  '×': { label: 'Weak', color: 'text-red-700', bg: 'bg-red-50', ring: 'ring-red-300' },
};

// Grades are scaled to the 24-point maximum: 75% / 50% / 25%.
const EVAL_GRADE = (score: number): { label: string; color: string; bg: string; border: string } => {
  if (score >= 18) return { label: 'Excellent', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-300' };
  if (score >= 12) return { label: 'Good', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-300' };
  if (score >= 6) return { label: 'Moderate', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-300' };
  return { label: 'Weak', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-300' };
};

const RATING_OPTIONS: (number | string)[] = ['-', 1, 3, 9];

/* ───────── Helpers ───────── */
// Must not collide with ids restored from localStorage (a plain counter would restart
// at the same numbers after a reload and clash with already-saved rows).
const uid = () => `ip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const calcTotal = (row: EvalRow): number =>
  EVAL_FIELDS.reduce((sum, f) => sum + SYMBOL_SCORE[row[f.key] as EvalSymbol], 0);

const calcGrade = (total: number): EvalRow['overallEvaluation'] => {
  if (total >= 18) return 'Excellent';
  if (total >= 12) return 'Good';
  if (total >= 6) return 'Moderate';
  return 'Weak';
};

/* ───────── Score color helpers ───────── */
const cumulativeScoreColor = (score: number, maxPossible: number): string => {
  if (maxPossible === 0) return 'text-slate-400 bg-slate-50 border-slate-200';
  const ratio = score / maxPossible;
  if (ratio >= 0.75) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (ratio >= 0.50) return 'text-blue-700 bg-blue-50 border-blue-200';
  if (ratio >= 0.25) return 'text-amber-700 bg-amber-50 border-amber-200';
  return 'text-red-700 bg-red-50 border-red-200';
};

const memberScoreColor = (score: number): string => {
  if (score === 0) return 'border-slate-300 text-slate-500 bg-slate-50'; // '-' (not rated)
  if (score >= 9) return 'border-emerald-300 text-emerald-700 bg-emerald-50'; // 9 = high
  if (score >= 3) return 'border-amber-300 text-amber-700 bg-amber-50'; // 3 = medium
  if (score >= 1) return 'border-red-300 text-red-700 bg-red-50'; // 1 = low
  return 'border-slate-300 text-slate-500 bg-slate-50';
};

const rankBadge = (rank: number | null): string => {
  if (rank === 1) return 'bg-amber-100 text-amber-700 border-amber-300';
  if (rank === 2) return 'bg-slate-200 text-slate-700 border-slate-300';
  if (rank === 3) return 'bg-orange-100 text-orange-700 border-orange-300';
  return 'bg-slate-50 text-slate-500 border-slate-200';
};

const evalRatingLabel = (rank: number): { label: string; icon: React.ReactNode; color: string; bg: string; border: string } => {
  if (rank === 1) return { label: 'Top Rated', icon: <Trophy size={14} />, color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-300' };
  if (rank === 2) return { label: '2nd Rated', icon: <Medal size={14} />, color: 'text-slate-700', bg: 'bg-slate-100', border: 'border-slate-300' };
  if (rank === 3) return { label: '3rd Rated', icon: <BadgeCheck size={14} />, color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-300' };
  return { label: `#${rank}`, icon: <CircleDot size={14} />, color: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200' };
};

/* ───────── Component ───────── */
export default function ProblemIdentification({ projectId, teamName, teamMembers }: ProblemIdentificationProps) {
  /* ── Persistence: everything typed here survives navigating away and back.
        Data is only removed when the user explicitly deletes a row. ── */
  const storageKey = `qcc-problem-identification-${projectId || 'default'}`;
  const saved = useRef<SavedState | null>(readSaved(storageKey)).current;
  const askConfirm = useConfirm();

  /* ── Member Selection State ── */
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>(
    saved?.selectedMemberIds ?? teamMembers.map(m => m.id)
  );

  /* ── Table: Dynamic Scoring Table ── */
  const [points, setPoints] = useState<ImprovementPoint[]>(() => {
    if (saved?.points?.length) return saved.points;
    // Start every point UNRATED ('-'). Cumulative / Avg / Rank are then driven purely by
    // what the members actually select (the allowed scale is '-', 1, 3, 9).
    const unrated = () =>
      Object.fromEntries(teamMembers.map(m => [m.id, '-'])) as Record<string, number | string>;
    return [
      { id: uid(), sr: 1, description: 'Reduce weld defect rate from 3.2% to below 1%', scores: unrated() },
      { id: uid(), sr: 2, description: 'Improve CNC machine setup time by 40%', scores: unrated() },
      { id: uid(), sr: 3, description: 'Reduce material wastage in paint shop', scores: unrated() },
      { id: uid(), sr: 4, description: 'Eliminate assembly line bottlenecks', scores: unrated() },
      { id: uid(), sr: 5, description: 'Improve first-pass yield to 98%', scores: unrated() },
      { id: uid(), sr: 6, description: 'Reduce energy consumption in HVAC system', scores: unrated() },
    ];
  });
  const [newText, setNewText] = useState('');
  const [flashId, setFlashId] = useState<string | null>(null);

  /* ── Evaluation Matrix ── */
  const [evalMatrix, setEvalMatrix] = useState<EvalRow[]>(saved?.evalMatrix ?? []);
  const [evalInitialized, setEvalInitialized] = useState(!!saved?.evalMatrix?.length);

  /* ── Final Theme Selection ── */
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(saved?.selectedThemeId ?? null);
  // Always start collapsed — the "Choose a Different Theme" panel stays hidden behind
  // its button until the user opts in, even across reloads (persisted value is ignored).
  const [chooseDifferent, setChooseDifferent] = useState(false);
  const [differentReason, setDifferentReason] = useState(saved?.differentReason ?? '');
  const [differentError, setDifferentError] = useState('');
  const [themeAccepted, setThemeAccepted] = useState(saved?.themeAccepted ?? false);

  /* ── Auto-save (debounced) ── */
  useEffect(() => {
    const timer = setTimeout(() => {
      const payload: SavedState = {
        points, evalMatrix, selectedMemberIds, selectedThemeId,
        chooseDifferent, differentReason, themeAccepted,
      };
      try { localStorage.setItem(storageKey, JSON.stringify(payload)); } catch { /* quota */ }
    }, 600);
    return () => clearTimeout(timer);
  }, [storageKey, points, evalMatrix, selectedMemberIds, selectedThemeId, chooseDifferent, differentReason, themeAccepted]);

  /* ── Scroll a newly-added improvement point into view and flash it ── */
  useEffect(() => {
    if (!flashId) return;
    document.getElementById(`ip-row-${flashId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t = setTimeout(() => setFlashId(null), 2000);
    return () => clearTimeout(t);
  }, [flashId]);

  /* ── Section collapse state (removed — improvement summary removed) ── */

  /* ── Get selected members ── */
  const selectedMembers = useMemo(
    () => teamMembers.filter(m => selectedMemberIds.includes(m.id)),
    [teamMembers, selectedMemberIds]
  );

  const hasMembersSelected = selectedMembers.length > 0;

  /* ── Cumulative score for each improvement point ── */
  const cumulativeScore = useCallback(
    (p: ImprovementPoint) => {
      if (selectedMembers.length === 0) return 0;
      return selectedMembers.reduce((sum, m) => {
        const s = p.scores[m.id];
        if (s === undefined || s === '-') return sum;
        return sum + Number(s);
      }, 0);
    },
    [selectedMembers],
  );

  /* ── Average (only for selected members, excluding '-') ── */
  const avg = useCallback(
    (p: ImprovementPoint) => {
      if (selectedMembers.length === 0) return 0;
      const validScores = selectedMembers
        .map(m => p.scores[m.id])
        .filter(s => s !== undefined && s !== '-')
        .map(s => Number(s));
      if (validScores.length === 0) return 0;
      return validScores.reduce((s, v) => s + v, 0) / validScores.length;
    },
    [selectedMembers],
  );

  /* ── How many selected members have actually rated this point ── */
  const ratedCount = useCallback(
    (p: ImprovementPoint) =>
      selectedMembers.filter(m => {
        const s = p.scores[m.id];
        return s !== undefined && s !== '-';
      }).length,
    [selectedMembers],
  );

  /* Only points that have at least one real rating take part in ranking / top-5. */
  const sortedByAvg = useMemo(
    () => [...points]
      .filter(p => p.description.trim() && ratedCount(p) > 0)
      .sort((a, b) => avg(b) - avg(a)),
    [points, avg, ratedCount],
  );

  const top5 = useMemo(() => sortedByAvg.slice(0, 5), [sortedByAvg]);

  /* ── Auto-init evaluation matrix from top 5 ── */
  const top5Ids = top5.map(p => p.id).join(',');
  useEffect(() => {
    // Nothing rated yet → no themes to evaluate in Table 2.
    if (top5.length === 0) {
      setEvalMatrix(prev => (prev.length ? [] : prev));
      return;
    }
    const existing = new Map(evalMatrix.map(r => [r.problemId, r]));
    const rebuilt: EvalRow[] = top5.map(p => {
      const prev = existing.get(p.id);
      if (prev) return { ...prev, problemDescription: p.description };
      const row: EvalRow = {
        problemId: p.id,
        problemDescription: p.description,
        effects: '○',
        urgency: '○',
        extentOfProblems: '○',
        futureOutlook: '○',
        hoshinAlignment: '○',
        participationByAll: '○',
        activityPeriod: '○',
        actualCapability: '○',
        totalScore: 8 * SYMBOL_SCORE['○'],   // all-"Good" default = 16 / 24
        overallEvaluation: 'Good',
      };
      return row;
    });
    const changed = JSON.stringify(rebuilt.map(r => r.problemId)) !== JSON.stringify(evalMatrix.map(r => r.problemId));
    if (changed) {
      setEvalMatrix(rebuilt);
      setEvalInitialized(true);
    }
  }, [top5Ids]);

  /* ── Member toggle ── */
  const toggleMember = (memberId: string) => {
    setSelectedMemberIds(prev =>
      prev.includes(memberId) ? prev.filter(id => id !== memberId) : [...prev, memberId]
    );
  };

  const selectAllMembers = () => setSelectedMemberIds(teamMembers.map(m => m.id));
  const deselectAllMembers = () => setSelectedMemberIds([]);

  /* ── Table mutations — addPoint works WITHOUT member selection ── */
  const addPoint = () => {
    if (!newText.trim()) return;
    const id = uid();
    const newScores: Record<string, number | string> = {};
    // Pre-fill with '-' (no rating) for all team members
    teamMembers.forEach(m => { newScores[m.id] = '-'; });
    setPoints(prev => [...prev, { id, sr: prev.length + 1, description: newText.trim(), scores: newScores }]);
    setNewText('');
    setFlashId(id);   // scroll the new row into view + briefly highlight it
  };

  const deletePoint = (id: string) => {
    setPoints(prev => prev.filter(p => p.id !== id).map((p, i) => ({ ...p, sr: i + 1 })));
    if (selectedThemeId === id) { setSelectedThemeId(null); setChooseDifferent(false); setThemeAccepted(false); }
  };

  const updateDesc = (id: string, val: string) =>
    setPoints(prev => prev.map(p => (p.id === id ? { ...p, description: val } : p)));

  const updateScore = (pointId: string, memberId: string, val: number | string) =>
    setPoints(prev => prev.map(p => (p.id === pointId ? { ...p, scores: { ...p.scores, [memberId]: val } } : p)));

  /* ── Evaluation mutations ── */
  const updateEval = (problemId: string, field: keyof EvalRow, value: EvalSymbol) => {
    setEvalMatrix(prev =>
      prev.map(row => {
        if (row.problemId !== problemId) return row;
        const updated = { ...row, [field]: value };
        updated.totalScore = calcTotal(updated);
        updated.overallEvaluation = calcGrade(updated.totalScore);
        return updated;
      }),
    );
  };

  /* ── Theme selection helpers ── */
  const sortedEval = useMemo(() => [...evalMatrix].sort((a, b) => b.totalScore - a.totalScore), [evalMatrix]);
  const topEvalId = sortedEval.length > 0 ? sortedEval[0].problemId : null;
  const finalSelectedId = chooseDifferent ? selectedThemeId : topEvalId;

  const handleSelectTopRated = () => {
    setChooseDifferent(false);
    setSelectedThemeId(topEvalId);
    setDifferentReason('');
    setDifferentError('');
    setThemeAccepted(true);
  };

  const handleSelectDifferent = () => {
    setChooseDifferent(true);
    setSelectedThemeId(null);
    setDifferentError('');
    setThemeAccepted(false);
  };

  const confirmDifferentSelection = () => {
    if (!selectedThemeId) { setDifferentError('Please select a theme from the list.'); return; }
    if (!differentReason.trim()) { setDifferentError('Reason for choosing a different theme is mandatory.'); return; }
    setDifferentError('');
    setThemeAccepted(true);
  };

  /* ── Max possible cumulative score (9 is the max rating) ── */
  const maxCumulative = selectedMembers.length * 9;

  /* ── Total improvement points added ── */
  const totalPointsAdded = points.filter(p => p.description.trim()).length;

  return (
    <div className="space-y-6">

      {/* ─── Section Divider: Member Selection ─── */}
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-[#082B4A] to-[#0f3d66] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center">
              <Users size={18} className="text-[#C9A46A]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Select Evaluators</h3>
              <p className="text-xs text-slate-300">Toggle members to include them as scoring columns — Theme Recommendation appears after selection</p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <button onClick={selectAllMembers} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200">
              <Check size={12} /> Select All
            </button>
            <button onClick={deselectAllMembers} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200">
              <X size={12} /> Deselect All
            </button>
            <span className="ml-auto text-xs text-slate-500">{selectedMembers.length} of {teamMembers.length} selected</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {teamMembers.map(member => {
              const isSelected = selectedMemberIds.includes(member.id);
              return (
                <button
                  key={member.id}
                  onClick={() => toggleMember(member.id)}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-200 hover:bg-blue-700'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {member.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <span>{member.name}</span>
                  {isSelected && <Check size={14} className="text-white" />}
                </button>
              );
            })}
          </div>

          {selectedMembers.length === 0 && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle size={16} className="text-amber-600" />
              <p className="text-xs text-amber-800">Select at least one member to enable scoring columns and Theme Recommendation.</p>
            </div>
          )}
        </div>
      </section>

      {/* ─── Section Divider ─── */}
      <div className="border-t border-slate-200" />

      {/* ─── Table 1: Problem Identification & Scoring ─── */}
      <section className={`bg-white rounded-2xl shadow-sm border-2 overflow-hidden transition-all duration-300 ${
        hasMembersSelected ? 'border-blue-300' : 'border-slate-300'
      }`}>
        {/* Section Header */}
        <div className="bg-gradient-to-r from-[#082B4A] to-[#0f3d66] px-6 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                <BarChart3 size={22} className="text-[#C9A46A]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-[#C9A46A] uppercase tracking-widest">Table 1</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    hasMembersSelected ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/80'
                  }`}>
                    {hasMembersSelected ? '✓ Scoring Enabled' : '○ Points Only'}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white mt-0.5">Problem Identification & Scoring</h3>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="px-4 py-2 rounded-lg bg-white/10 border border-white/20">
                <p className="text-xs text-slate-300">Team</p>
                <p className="text-sm font-semibold text-white">{teamName}</p>
              </div>
              <div className="px-4 py-2 rounded-lg bg-white/10 border border-white/20">
                <p className="text-xs text-slate-300">Points</p>
                <p className="text-sm font-semibold text-[#C9A46A]">{totalPointsAdded}</p>
              </div>
              <div className="px-4 py-2 rounded-lg bg-white/10 border border-white/20">
                <p className="text-xs text-slate-300">Evaluators</p>
                <p className="text-sm font-semibold text-[#C9A46A]">{selectedMembers.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Main Unified Scoring Table ─── */}
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: hasMembersSelected ? `${480 + selectedMembers.length * 100}px` : '420px' }}>
            <thead>
              {/* Column Group Headers */}
              <tr className="bg-slate-100 border-b border-slate-300">
                <th className="px-2 py-2 text-center text-[9px] font-bold text-slate-500 uppercase tracking-wider" colSpan={2}>
                  Improvement Point
                </th>
                {hasMembersSelected && (
                  <>
                    <th className="px-2 py-2 text-center text-[9px] font-bold text-blue-700 uppercase tracking-wider bg-blue-50 border-x border-blue-200">
                      Cumulative Score
                    </th>
                    <th className="px-2 py-2 text-center text-[9px] font-bold text-indigo-700 uppercase tracking-wider bg-indigo-50 border-x border-indigo-200" colSpan={selectedMembers.length}>
                      Member Ranking Scores
                    </th>
                    <th className="px-2 py-2 text-center text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                      Avg
                    </th>
                    <th className="px-2 py-2 text-center text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                      Rank
                    </th>
                    <th className="px-2 py-2 text-center text-[9px] font-bold text-emerald-700 uppercase tracking-wider bg-emerald-50 border-x border-emerald-200">
                      Theme Recommendation
                    </th>
                  </>
                )}
                <th className="px-2 py-2 w-10"></th>
              </tr>
              {/* Column Sub-headers */}
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-2 py-2.5 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider w-10">SR</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider min-w-[200px]">Description</th>
                {hasMembersSelected && (
                  <>
                    <th className="px-2 py-2.5 text-center text-[10px] font-bold text-blue-600 uppercase tracking-wider bg-blue-50/50 w-28 border-x border-blue-100">
                      <div className="flex flex-col items-center gap-0.5">
                        <Hash size={12} />
                        <span>Total</span>
                      </div>
                    </th>
                    {selectedMembers.map(m => (
                      <th key={m.id} className="px-2 py-2.5 text-center text-[10px] font-bold text-indigo-600 uppercase tracking-wider bg-indigo-50/50 min-w-[85px] border-r border-indigo-100 last:border-r-0">
                        <div className="flex flex-col items-center gap-1">
                          <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-[9px] font-bold text-indigo-700">
                            {m.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <span className="max-w-[70px] truncate text-[9px]">{m.name.split(' ')[0]}</span>
                        </div>
                      </th>
                    ))}
                    <th className="px-2 py-2.5 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider w-16">Avg</th>
                    <th className="px-2 py-2.5 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider w-14">#</th>
                    <th className="px-2 py-2.5 text-center text-[10px] font-bold text-emerald-600 uppercase tracking-wider bg-emerald-50/50 w-36 border-x border-emerald-100">
                      <div className="flex items-center justify-center gap-1">
                        <BookmarkCheck size={12} />
                        Select
                      </div>
                    </th>
                  </>
                )}
                <th className="px-2 py-2.5 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {points.map((point) => {
                const cumScore = cumulativeScore(point);
                const rated = ratedCount(point);          // how many members rated this point
                const pointAvg = avg(point);
                const rankIdx = sortedByAvg.findIndex(p => p.id === point.id);
                // Unrated points get no average and no rank — nothing to rank them by.
                const rank = rated > 0 && rankIdx >= 0 ? rankIdx + 1 : null;
                const isTop = rank === 1;
                const isTop5 = rank !== null && rank <= 5;
                const scoreClass = cumulativeScoreColor(cumScore, maxCumulative);
                const isInEval = evalMatrix.some(r => r.problemId === point.id);

                return (
                  <tr key={point.id} id={`ip-row-${point.id}`} className={`group transition-colors ${
                    flashId === point.id ? 'ring-2 ring-inset ring-blue-400 bg-blue-50' :
                    isTop ? 'bg-amber-50/40' : isTop5 ? 'bg-blue-50/20' : 'hover:bg-slate-50/70'
                  }`}>
                    {/* SR */}
                    <td className="px-2 py-3 text-center">
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold ${
                        isTop ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {point.sr}
                      </span>
                    </td>

                    {/* Description */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {isTop && <Crown size={14} className="text-amber-500 flex-shrink-0" />}
                        <input
                          type="text"
                          value={point.description}
                          onChange={e => updateDesc(point.id, e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all"
                          placeholder="Describe the improvement point..."
                        />
                      </div>
                    </td>

                    {/* Scoring columns — only visible after member selection */}
                    {hasMembersSelected && (
                      <>
                        {/* Cumulative Score */}
                        <td className="px-2 py-3 text-center bg-blue-50/30 border-x border-blue-100">
                          <div className={`inline-flex flex-col items-center px-3 py-1.5 rounded-lg border ${scoreClass}`}>
                            <span className="text-sm font-bold">{cumScore}</span>
                            <span className="text-[9px] opacity-60">/ {maxCumulative}</span>
                          </div>
                        </td>

                        {/* Member Scores */}
                        {selectedMembers.map(m => {
                          const scoreVal = point.scores[m.id] ?? '-';
                          const numVal = scoreVal === '-' ? 0 : Number(scoreVal);
                          return (
                            <td key={m.id} className="px-2 py-3 text-center bg-indigo-50/20 border-r border-indigo-50 last:border-r-0">
                              <select
                                value={scoreVal}
                                onChange={e => {
                                  const val = e.target.value === '-' ? '-' : Number(e.target.value);
                                  updateScore(point.id, m.id, val);
                                }}
                                className={`w-full max-w-[72px] mx-auto px-2 py-2 border rounded-lg text-sm text-center font-bold focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none bg-white appearance-none cursor-pointer transition-colors ${memberScoreColor(numVal)}`}
                              >
                                {RATING_OPTIONS.map(opt => (
                                  <option key={String(opt)} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </td>
                          );
                        })}

                        {/* Average — computed only from members who actually rated */}
                        <td className="px-2 py-3 text-center">
                          <span
                            className={`inline-block min-w-[44px] px-2.5 py-1.5 rounded-lg text-sm font-bold ${
                              rated === 0 ? 'bg-slate-50 text-slate-300' :
                              pointAvg >= 8 ? 'bg-emerald-100 text-emerald-700' :
                              pointAvg >= 6 ? 'bg-blue-100 text-blue-700' :
                              pointAvg >= 4 ? 'bg-amber-100 text-amber-700' :
                              'bg-slate-100 text-slate-600'
                            }`}
                            title={rated === 0 ? 'Not rated yet' : `Average of ${rated} rating${rated > 1 ? 's' : ''}`}
                          >
                            {rated === 0 ? '—' : pointAvg.toFixed(1)}
                          </span>
                        </td>

                        {/* Rank */}
                        <td className="px-2 py-3 text-center">
                          {rank && rank <= 3 ? (
                            <span className={`inline-flex items-center gap-0.5 px-2 py-1 rounded-full text-[10px] font-bold border ${rankBadge(rank)}`}>
                              {rank === 1 && <Star size={10} fill="currentColor" />}
                              #{rank}
                            </span>
                          ) : rank ? (
                            <span className="text-xs text-slate-400">#{rank}</span>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>

                        {/* Theme Recommendation — only after member selection */}
                        <td className="px-2 py-3 text-center bg-emerald-50/30 border-x border-emerald-100">
                          {isInEval ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 size={11} /> In Evaluation
                            </span>
                          ) : isTop5 ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200">
                              <Target size={11} /> Top 5
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">—</span>
                          )}
                        </td>
                      </>
                    )}

                    {/* Delete — always visible */}
                    <td className="px-2 py-3 text-center">
                      <button
                        onClick={async () => { if (await askConfirm({ title: 'Delete this point?', message: 'This improvement point and its scores will be removed.', confirmText: 'Delete' })) deletePoint(point.id); }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="px-6 py-2.5 bg-[#082B4A] border-t border-white/10 flex flex-wrap items-center gap-4">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Scale:</span>
          <span className="text-xs text-slate-300"><strong className="text-[#C9A46A]">-</strong> = Not Rated</span>
          <span className="text-xs text-slate-300"><strong className="text-[#C9A46A]">1</strong> = Low Priority</span>
          <span className="text-xs text-slate-300"><strong className="text-[#C9A46A]">3</strong> = Medium Priority</span>
          <span className="text-xs text-slate-300"><strong className="text-[#C9A46A]">9</strong> = High Priority</span>
          {hasMembersSelected && (
            <span className="text-xs text-slate-400 ml-auto">Cumulative = sum of all member scores • Avg across {selectedMembers.length} evaluators</span>
          )}
        </div>

        {/* Add Improvement Point - Below Table */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200">
          <div className="flex gap-3">
            <input
              type="text"
              value={newText}
              onChange={e => setNewText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addPoint()}
              placeholder="Type a new improvement point and press Enter or click Add..."
              className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none bg-white"
            />
            <button
              onClick={addPoint}
              disabled={!newText.trim()}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 shadow-sm"
            >
              <Plus size={16} /> Add Improvement Point
            </button>
          </div>
        </div>
      </section>

      {/* ─── Section Divider ─── */}
      <div className="border-t border-slate-200" />

      {/* ─── Table 2: Evaluation Matrix by Leader ─── */}
      {evalInitialized && evalMatrix.length > 0 && (
        <section className={`bg-white rounded-2xl shadow-sm border-2 overflow-hidden transition-all duration-300 ${
          hasMembersSelected ? 'border-purple-300' : 'border-slate-300 opacity-60'
        }`}>
          <div className={`bg-gradient-to-r from-purple-700 to-indigo-700 px-6 py-5 ${!hasMembersSelected && 'opacity-70'}`}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <Award size={22} className="text-purple-200" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-purple-200 uppercase tracking-widest">Table 2</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      hasMembersSelected ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/80'
                    }`}>
                      {hasMembersSelected ? '✓ Enabled' : '✗ Disabled'}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white mt-0.5">Evaluation Matrix by Leader</h3>
                </div>
              </div>
              <div className="px-4 py-2 rounded-lg bg-white/10 border border-white/20">
                <p className="text-xs text-purple-200">Top 5 Themes</p>
                <p className="text-sm font-semibold text-white">{evalMatrix.length} Problems Under Review</p>
              </div>
            </div>
          </div>

          {!hasMembersSelected && (
            <div className="relative">
              <div className="absolute inset-0 bg-slate-100/90 backdrop-blur-sm z-10 flex items-center justify-center">
                <div className="text-center">
                  <Lock size={48} className="mx-auto text-slate-400 mb-3" />
                  <p className="text-sm font-semibold text-slate-700">Evaluation Matrix Disabled</p>
                  <p className="text-xs text-slate-500 mt-1">Select at least one member to enable evaluation</p>
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1240px]">
              <thead>
                <tr className="bg-slate-50 border-b-2 border-purple-200">
                  <th className="px-3 py-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider w-12" rowSpan={2}>SR No.</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider min-w-[180px]" rowSpan={2}>Problem / Theme</th>
                  <th className="px-2 py-2 text-center text-[10px] font-bold text-purple-700 uppercase tracking-wider bg-purple-50" colSpan={5}>Necessity / Impact</th>
                  <th className="px-2 py-2 text-center text-[10px] font-bold text-indigo-700 uppercase tracking-wider bg-indigo-50" colSpan={3}>Circle Capability</th>
                  <th className="px-3 py-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider w-20" rowSpan={2}>Score</th>
                  <th className="px-3 py-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider w-28" rowSpan={2}>Overall Evaluation</th>
                  <th className="px-3 py-3 text-center text-[10px] font-bold text-amber-700 uppercase tracking-wider bg-amber-50 border-x border-amber-200 w-32" rowSpan={2}>
                    <div className="flex items-center justify-center gap-1">
                      <Trophy size={12} />
                      Rating
                    </div>
                  </th>
                </tr>
                <tr className="bg-white border-b border-slate-200">
                  {EVAL_FIELDS.map(f => (
                    <th key={f.key as string} className={`px-1.5 py-2 text-center text-[9px] font-bold leading-tight min-w-[86px] ${
                      f.group === 'impact' ? 'text-purple-600 bg-purple-50/50' : 'text-indigo-600 bg-indigo-50/50'
                    }`}>
                      {f.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {evalMatrix.map((row, idx) => {
                  const g = EVAL_GRADE(row.totalScore);
                  // Rank is derived from the score ordering, but the ROW ORDER stays fixed —
                  // otherwise changing a symbol re-sorts the table and the cell you just
                  // clicked jumps to a different position.
                  const rank = sortedEval.findIndex(r => r.problemId === row.problemId) + 1;
                  const rating = evalRatingLabel(rank);
                  const isHighest = rank === 1;
                  return (
                    <tr key={row.problemId} className={`transition-colors ${isHighest ? 'bg-amber-50/30 hover:bg-amber-50/50' : 'hover:bg-purple-50/30'}`}>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold ${
                          isHighest ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                        }`}>{idx + 1}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {isHighest && <Star size={14} className="text-amber-500 flex-shrink-0" />}
                          <p className="text-sm font-medium text-slate-800 leading-snug">{row.problemDescription}</p>
                        </div>
                      </td>
                      {EVAL_FIELDS.map(f => {
                        const sym = row[f.key] as EvalSymbol;
                        const meta = SYMBOL_META[sym];
                        return (
                          <td key={f.key as string} className={`px-1 py-2 ${f.group === 'impact' ? 'bg-purple-50/30' : 'bg-indigo-50/30'}`}>
                            <div className="flex justify-center">
                              <div className="relative">
                                <select
                                  value={sym}
                                  onChange={e => updateEval(row.problemId, f.key, e.target.value as EvalSymbol)}
                                  className={`w-12 h-9 border rounded-lg text-center text-base font-bold cursor-pointer focus:ring-2 focus:ring-purple-400 outline-none appearance-none ${meta.color} ${meta.bg} border-slate-200`}
                                >
                                  {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                  <span className={`text-base font-bold ${meta.color}`}>{sym}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-block min-w-[44px] px-2.5 py-1.5 rounded-lg text-sm font-bold ${
                          g.color + ' ' + g.bg + ' border ' + g.border
                        }`}>{row.totalScore}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-block px-3 py-1.5 rounded-full text-[10px] font-bold ${g.color} ${g.bg} border ${g.border}`}>
                          {row.overallEvaluation}
                        </span>
                      </td>
                      {/* NEW: Rating Column — Top Rated / 2nd / 3rd */}
                      <td className="px-3 py-3 text-center bg-amber-50/30 border-x border-amber-100">
                        <div className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border-2 transition-all ${rating.color} ${rating.bg} ${rating.border}`}>
                          {rating.icon}
                          <span>{rating.label}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-3 bg-slate-50 border-t border-slate-200">
            <div className="inline-flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Legend</span>
              {SYMBOLS.map(s => {
                const meta = SYMBOL_META[s];
                const pts = SYMBOL_SCORE[s];
                return (
                  <span key={s} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-base ${meta.bg} ${meta.color} ring-1 ${meta.ring}`}>{s}</span>
                    {meta.label} <span className="text-slate-400">({pts} {pts === 1 ? 'pt' : 'pts'})</span>
                  </span>
                );
              })}
              <span className="text-[11px] text-slate-500 font-semibold border-l border-slate-200 pl-4">Max {MAX_EVAL_SCORE} pts</span>
            </div>
          </div>
        </section>
      )}

      {/* ─── Section Divider ─── */}
      <div className="border-t border-slate-200" />

      {/* ─── Final Theme Selection ─── */}
      {sortedEval.length > 0 && (
        <section className={`bg-white rounded-2xl shadow-sm border-2 overflow-hidden transition-all duration-300 ${
          themeAccepted ? 'border-emerald-400' : hasMembersSelected ? 'border-blue-300' : 'border-slate-300 opacity-60'
        }`}>
          <div className={`bg-gradient-to-r ${themeAccepted ? 'from-emerald-600 to-teal-600' : 'from-emerald-700 to-teal-700'} px-6 py-5`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                {themeAccepted ? <CheckCircle2 size={22} className="text-white" /> : <BookmarkCheck size={22} className="text-emerald-200" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-emerald-200 uppercase tracking-widest">Final Decision</span>
                  {themeAccepted && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-500/30 text-white">
                      ✓ Confirmed
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-white mt-0.5">
                  {themeAccepted ? 'Theme Selected' : 'Select Final Theme'}
                </h3>
              </div>
            </div>
          </div>

          {themeAccepted ? (
            /* ── Confirmed State ── */
            <div className="p-6">
              <div className="flex items-start gap-4 p-5 bg-emerald-50 border-2 border-emerald-200 rounded-xl">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 size={24} className="text-emerald-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-emerald-800 mb-1">Final Theme Confirmed</p>
                  <p className="text-base font-semibold text-slate-800">
                    {(() => {
                      const selected = sortedEval.find(r => r.problemId === finalSelectedId);
                      return selected?.problemDescription || 'Unknown';
                    })()}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    {chooseDifferent ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                        <AlertTriangle size={10} /> Different from Top Rated
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                        <Trophy size={10} /> Top Rated Theme Accepted
                      </span>
                    )}
                    {(() => {
                      const selected = sortedEval.find(r => r.problemId === finalSelectedId);
                      if (!selected) return null;
                      const g = EVAL_GRADE(selected.totalScore);
                      return (
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${g.color} ${g.bg} border ${g.border}`}>
                          Score: {selected.totalScore} — {selected.overallEvaluation}
                        </span>
                      );
                    })()}
                  </div>
                  {chooseDifferent && differentReason && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider mb-1">Reason for Different Selection</p>
                      <p className="text-xs text-amber-800">{differentReason}</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-end mt-4">
                <button
                  onClick={() => { setThemeAccepted(false); setChooseDifferent(false); setSelectedThemeId(null); }}
                  className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Change Selection
                </button>
              </div>
            </div>
          ) : (
            /* ── Selection State ── */
            <div className="p-6 space-y-5">
              {/* Option A: Accept Top Rated */}
              <div className="flex items-start gap-4 p-5 bg-emerald-50 border-2 border-emerald-200 rounded-xl hover:border-emerald-300 transition-colors">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <Trophy size={24} className="text-emerald-600" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">Recommended</p>
                  <p className="text-sm font-bold text-slate-800 mb-1">Accept Top-Rated Theme</p>
                  <p className="text-sm text-slate-600">
                    {sortedEval[0]?.problemDescription || 'No themes evaluated yet'}
                  </p>
                  {sortedEval[0] && (
                    <div className="flex items-center gap-2 mt-2">
                      {(() => {
                        const g = EVAL_GRADE(sortedEval[0].totalScore);
                        return (
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${g.color} ${g.bg} border ${g.border}`}>
                            Score: {sortedEval[0].totalScore} — {sortedEval[0].overallEvaluation}
                          </span>
                        );
                      })()}
                    </div>
                  )}
                </div>
                <button
                  onClick={handleSelectTopRated}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm flex-shrink-0"
                >
                  Accept
                </button>
              </div>

              {/* Option B: Choose Different — collapsed to a single button until the user
                  opts in, so by default only the top-rated theme (Option A) is shown. */}
              {!chooseDifferent ? (
                <div className="text-center pt-1">
                  <button
                    onClick={handleSelectDifferent}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-amber-700 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-colors"
                  >
                    <ArrowUpDown size={16} /> Choose a different theme
                  </button>
                </div>
              ) : (
                <div className="p-5 border-2 border-amber-300 bg-amber-50/50 rounded-xl transition-colors">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                      <ArrowUpDown size={20} className="text-amber-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-slate-800">Choose a Different Theme</p>
                      <p className="text-xs text-slate-500">Override the top-rated recommendation with justification</p>
                    </div>
                  </div>

                  <div className="space-y-4 mt-4">
                    {/* Selectable theme cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {sortedEval.map((row, idx) => {
                        const g = EVAL_GRADE(row.totalScore);
                        const isSelected = selectedThemeId === row.problemId;
                        return (
                          <button
                            key={row.problemId}
                            onClick={() => { setSelectedThemeId(row.problemId); setDifferentError(''); }}
                            className={`text-left p-3 rounded-lg border-2 transition-all ${
                              isSelected
                                ? 'border-amber-400 bg-amber-50 shadow-sm'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                idx === 0 ? 'bg-amber-200 text-amber-800' : 'bg-slate-200 text-slate-600'
                              }`}>{idx + 1}</span>
                              {isSelected && <Check size={14} className="text-amber-600" />}
                            </div>
                            <p className="text-xs font-medium text-slate-800 line-clamp-2">{row.problemDescription}</p>
                            <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${g.color} ${g.bg} border ${g.border}`}>
                              {row.totalScore} pts — {row.overallEvaluation}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Reason */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Reason for Different Selection <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={differentReason}
                        onChange={e => { setDifferentReason(e.target.value); setDifferentError(''); }}
                        placeholder="Explain why you are choosing a different theme instead of the top-rated one..."
                        rows={3}
                        className={`w-full px-4 py-2.5 border rounded-lg text-sm outline-none resize-none transition-all ${
                          differentError ? 'border-red-400 bg-red-50/50' : 'border-slate-300 focus:ring-2 focus:ring-amber-400 focus:border-amber-500'
                        }`}
                      />
                      {differentError && (
                        <p className="flex items-center gap-1 mt-1.5 text-xs text-red-600">
                          <AlertCircle size={12} /> {differentError}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={confirmDifferentSelection}
                        className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
                      >
                        Confirm Selection
                      </button>
                      <button
                        onClick={() => { setChooseDifferent(false); setSelectedThemeId(null); setDifferentReason(''); setDifferentError(''); }}
                        className="px-4 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
