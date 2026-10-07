import { useState, useEffect, useMemo, Fragment } from 'react';
import { Plus, Trash2, Info, ArrowUp, ArrowDown, Minus, Users, ArrowRight, Save, Check, X, Building2, ChevronDown, ChevronUp } from 'lucide-react';
import { CIRCLE_ASSESSMENT, circleLevel, type AssessCategory } from '../lib/circleAssessment';
import { api } from '../lib/api';
import { useConfirm } from '../components/ConfirmDialog';
import { useHalfYear } from '../lib/halfYear';
import type { Team } from '../types';

const STORAGE_KEY = 'qcc-circle-assessment-v4';
type Phase = 'before' | 'after';

interface Member { id: string; name: string; }
// checked[memberId][phase] = set of "catCode:itemIndex"
type Checked = Record<string, Record<Phase, Set<string>>>;

const EMPTY_INFO = { circleName: '', department: '', date: '', leader: '', advisor: '' };
const CATS_X = CIRCLE_ASSESSMENT[0].categories;
const CATS_Y = CIRCLE_ASSESSMENT[1].categories;
const AXIS_COLOR = { x: '#2563eb', y: '#7c3aed' } as const;
const itemKey = (code: string, i: number) => `${code}:${i}`;

// Left-border accent styling for the Summary KPI strip.
const KPI_ACCENT: Record<string, { border: string; text: string }> = {
  violet:  { border: 'border-violet-500',  text: 'text-violet-600' },
  blue:    { border: 'border-blue-500',    text: 'text-blue-600' },
  emerald: { border: 'border-emerald-500', text: 'text-emerald-600' },
  amber:   { border: 'border-amber-500',   text: 'text-amber-600' },
  cyan:    { border: 'border-cyan-500',    text: 'text-cyan-600' },
};

let _uid = 0;
const uid = () => `m${Date.now().toString(36)}${_uid++}`;

// Colour-coded score badge classes (score 0–10).
const scoreColor = (n: number) =>
  n === 0 ? 'bg-slate-100 text-slate-400 border-slate-200'
    : n <= 4 ? 'bg-red-100 text-red-700 border-red-200'
      : n <= 7 ? 'bg-amber-100 text-amber-700 border-amber-200'
        : 'bg-emerald-100 text-emerald-700 border-emerald-200';

export default function CircleAssessment() {
  const [info, setInfo] = useState<Record<string, string>>(EMPTY_INFO);
  const [members, setMembers] = useState<Member[]>([]);
  const [checked, setChecked] = useState<Checked>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const askConfirm = useConfirm();
  const hy = useHalfYear();   // scope the team picker to the QCC period chosen in the header
  // Team Registration link — pick a team and its members auto-populate the assessment.
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState(() => { try { return localStorage.getItem('qcc-assessment-team') || ''; } catch { return ''; } });
  // Cell being edited in the comparison table → opens that member+category's item checklist.
  const [editCell, setEditCell] = useState<{ memberId: string; catCode: string } | null>(null);
  // Collapsible categories in the Before/After scoring tables (keeps the long item list manageable).
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const toggleAssessCat = (key: string) => setOpenCats(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  // Direct per-member X/Y score entry (independent of the checklist) — submit & see all in one place.
  // Assessment view: Before / After / Summary (compare)
  const [skillView, setSkillView] = useState<'before' | 'after' | 'summary'>(() => {
    try { const v = localStorage.getItem('qcc-assessment-view'); if (v === 'before' || v === 'after' || v === 'summary') return v; } catch { /* default */ }
    return 'summary';
  });
  const [savedMsg, setSavedMsg] = useState(false);
  // Keep the current view + selected team across a refresh.
  useEffect(() => { try { localStorage.setItem('qcc-assessment-view', skillView); } catch { /* ignore */ } }, [skillView]);
  useEffect(() => { try { localStorage.setItem('qcc-assessment-team', teamId); } catch { /* ignore */ } }, [teamId]);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const s = JSON.parse(raw);
      setInfo({ ...EMPTY_INFO, ...s.info });
      setMembers(s.members || []);
      const c: Checked = {};
      for (const [mid, phases] of Object.entries(s.checked || {})) {
        c[mid] = { before: new Set((phases as any).before || []), after: new Set((phases as any).after || []) };
      }
      setChecked(c);
      setActiveId((s.members || [])[0]?.id ?? null);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      const serial: Record<string, { before: string[]; after: string[] }> = {};
      for (const [mid, p] of Object.entries(checked)) serial[mid] = { before: [...p.before], after: [...p.after] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ info, members, checked: serial }));
    }, 400);
    return () => clearTimeout(t);
  }, [info, members, checked]);

  const addMember = () => {
    const name = newName.trim();
    if (!name) return;
    const m: Member = { id: uid(), name };
    setMembers(prev => [...prev, m]);
    setActiveId(m.id);
    setNewName('');
  };
  const removeMember = (id: string) => {
    setMembers(prev => prev.filter(m => m.id !== id));
    setChecked(prev => { const n = { ...prev }; delete n[id]; return n; });
    if (activeId === id) setActiveId(members.find(m => m.id !== id)?.id ?? null);
  };

  // Load teams from Team Registration for the team picker.
  useEffect(() => { api.listTeams().then(setTeams).catch(() => { /* keep empty */ }); }, []);

  // Selecting a team auto-fills its members + header details — no manual entry needed.
  const selectTeam = (id: string) => {
    setTeamId(id);
    const team = teams.find(t => t.id === id);
    if (!team) return;
    const teamMembers: Member[] = team.members.filter(m => m.isActive).map(m => ({ id: m.memberId, name: m.memberName }));
    setMembers(teamMembers);
    setActiveId(teamMembers[0]?.id ?? null);
    setInfo(prev => ({
      ...prev,
      circleName: team.name,
      department: team.department,
      leader: team.leaderName || '',
      advisor: team.facilitatorName || '',
    }));
  };

  // Explicit save — writes the whole assessment to storage and flashes a confirmation.
  const saveAll = () => {
    const serial: Record<string, { before: string[]; after: string[] }> = {};
    for (const [mid, p] of Object.entries(checked)) serial[mid] = { before: [...p.before], after: [...p.after] };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ info, members, checked: serial }));
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2500);
  };

  const toggleItem = (memberId: string, phase: Phase, key: string) => {
    setChecked(prev => {
      const cur = prev[memberId] || { before: new Set<string>(), after: new Set<string>() };
      const next = new Set(cur[phase]);
      next.has(key) ? next.delete(key) : next.add(key);
      return { ...prev, [memberId]: { before: new Set(cur.before), after: new Set(cur.after), [phase]: next } };
    });
  };

  const catCount = (memberId: string, phase: Phase, cat: AssessCategory) => {
    const set = checked[memberId]?.[phase];
    if (!set) return 0;
    let n = 0;
    for (let i = 0; i < cat.items.length; i++) if (set.has(itemKey(cat.code, i))) n++;
    return n;
  };
  const memberAxisAvg = (memberId: string, phase: Phase, cats: AssessCategory[]) =>
    cats.reduce((s, c) => s + catCount(memberId, phase, c), 0) / cats.length;
  const teamCatAvg = (phase: Phase, cat: AssessCategory) =>
    members.length ? members.reduce((s, m) => s + catCount(m.id, phase, cat), 0) / members.length : 0;
  const teamAxis = (phase: Phase, cats: AssessCategory[]) => cats.map(c => teamCatAvg(phase, c));
  const overallAxisAvg = (phase: Phase, cats: AssessCategory[]) =>
    cats.reduce((s, c) => s + teamCatAvg(phase, c), 0) / cats.length;

  const overall = useMemo(() => {
    const mk = (p: Phase) => { const x = overallAxisAvg(p, CATS_X); const y = overallAxisAvg(p, CATS_Y); return { x, y, level: circleLevel(x, y) }; };
    return { before: mk('before'), after: mk('after') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, members]);

  const B = overall.before, A = overall.after;
  const dX = +(A.x - B.x).toFixed(1);
  const dY = +(A.y - B.y).toFixed(1);
  const improvePct = (B.x + B.y) > 0 ? Math.round((((A.x + A.y) - (B.x + B.y)) / (B.x + B.y)) * 100) : 0;
  const active = members.find(m => m.id === activeId) || null;

  // Persist a per-team assessment summary so the Dashboard's Improvement chart has data.
  // Value = Before→After % when a baseline exists; otherwise the After achievement %
  // (so a team scored on "After" only still shows a meaningful number on the dashboard).
  useEffect(() => {
    if (!teamId) return;
    const afterPct = Math.round(((A.x + A.y) / 20) * 100);
    const value = (B.x + B.y) > 0 ? improvePct : afterPct;
    try {
      const raw = localStorage.getItem('qcc-assessment-summary-v1');
      const map = raw ? JSON.parse(raw) : {};
      map[teamId] = { improvement: value, improvePct, afterPct, beforeX: +B.x.toFixed(1), beforeY: +B.y.toFixed(1), afterX: +A.x.toFixed(1), afterY: +A.y.toFixed(1) };
      localStorage.setItem('qcc-assessment-summary-v1', JSON.stringify(map));
    } catch { /* ignore */ }
  }, [teamId, improvePct, B.x, B.y, A.x, A.y]);

  // Summary KPI cards act as jump-links: click one to scroll to & highlight its section.
  const [activeKpi, setActiveKpi] = useState<string | null>(null);
  const focusSection = (key: string, id: string) => {
    setActiveKpi(key);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };


  return (
    <div className="space-y-6">
      {/* ── Edit-items popup (opened from a score cell in the comparison table) ── */}
      {editCell && (() => {
        const cat = [...CATS_X, ...CATS_Y].find(c => c.code === editCell.catCode);
        const mem = members.find(m => m.id === editCell.memberId);
        const ph: Phase = skillView === 'after' ? 'after' : 'before';
        if (!cat || !mem) return null;
        return (
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setEditCell(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">{mem.name} — {cat.name}</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5 capitalize">{ph} · score <b className="text-slate-700">{catCount(mem.id, ph, cat)}</b>/{cat.items.length}</p>
                </div>
                <button onClick={() => setEditCell(null)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X size={18} /></button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
                {cat.items.map((item, i) => {
                  const key = itemKey(cat.code, i);
                  const on = checked[mem.id]?.[ph]?.has(key) ?? false;
                  return (
                    <label key={i} className="flex items-start gap-3 px-5 py-2.5 hover:bg-slate-50/60 cursor-pointer">
                      <input type="checkbox" checked={on} onChange={() => toggleItem(mem.id, ph, key)} className="w-4 h-4 mt-0.5 rounded border-slate-300 flex-shrink-0" />
                      <span className="text-[12.5px] leading-snug text-slate-600"><span className="text-slate-400 mr-1">{i + 1}.</span>{item}</span>
                    </label>
                  );
                })}
              </div>
              <div className="px-5 py-3 border-t border-slate-200 flex justify-end">
                <button onClick={() => setEditCell(null)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg">Done</button>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Circle name = team picker — selecting a team auto-loads its members & details */}
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1.5"><Building2 size={13} className="text-blue-600" /> Circle name</label>
            <select value={teamId} onChange={e => selectTeam(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400">
              <option value="">Select a team…</option>
              {teams.filter(t => t.status === 'active' && hy.isTeamActive(t.id, t.createdAt)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          {[['department', 'Department'], ['date', 'Date'], ['leader', 'Leader'], ['advisor', 'Advisor']].map(([k, label]) => (
            <div key={k}>
              <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
              <input type={k === 'date' ? 'date' : 'text'} value={info[k] || ''} onChange={e => setInfo(prev => ({ ...prev, [k]: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400" />
            </div>
          ))}
        </div>
      </div>

      {/* ── View toggle: Summary / Before / After ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-3">
        <h3 className="text-sm font-bold text-slate-800">QC circle assessment — {skillView === 'summary' ? 'Summary (Before → After)' : skillView === 'after' ? 'After' : 'Before'}</h3>
        <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden">
          {(['summary', 'before', 'after'] as const).map((v, idx) => (
            <button key={v} onClick={() => setSkillView(v)} className={`px-4 py-1.5 text-sm font-medium capitalize transition-colors ${idx > 0 ? 'border-l border-slate-300' : ''} ${skillView === v ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{v}</button>
          ))}
        </div>
      </div>

      {/* ── Summary KPI strip: overall level + axis totals + improvement ── */}
      {skillView === 'summary' && (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {([
          { key: 'level',   label: 'Overall level', accent: 'violet',  before: B.level.grade,  after: A.level.grade, target: 'ca-level-compare' },
          { key: 'x',       label: 'Ability (X)',   accent: 'blue',     before: B.x.toFixed(1), after: A.x.toFixed(1), delta: dX, target: 'ca-overall-x' },
          { key: 'y',       label: 'Workplace (Y)', accent: 'emerald',  before: B.y.toFixed(1), after: A.y.toFixed(1), delta: dY, target: 'ca-overall-y' },
          { key: 'improve', label: 'Avg improvement', accent: 'amber',  single: `${improvePct > 0 ? '+' : ''}${improvePct}%`, target: 'ca-level-compare' },
          { key: 'members', label: 'Members',       accent: 'cyan',     single: String(members.length), target: 'ca-matrix-x' },
        ] as { key: string; label: string; accent: string; before?: string; after?: string; delta?: number; single?: string; target: string }[]).map(kpi => {
          const ac = KPI_ACCENT[kpi.accent];
          const on = activeKpi === kpi.key;
          return (
            <button key={kpi.key} type="button" onClick={() => focusSection(kpi.key, kpi.target)}
              className={`text-left rounded-xl bg-white border border-l-4 ${ac.border} shadow-sm p-4 transition-all w-full hover:shadow-md hover:-translate-y-0.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-300 ${on ? 'ring-2 ring-blue-200 border-slate-300' : 'border-slate-200'}`}>
              <p className={`text-[11px] font-bold uppercase tracking-wide ${ac.text} mb-1.5`}>{kpi.label}</p>
              {kpi.single != null ? (
                <p className="text-2xl font-bold text-slate-900 leading-tight">{kpi.single}</p>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="text-lg font-semibold text-slate-400">{kpi.before}</span>
                  <ArrowRight size={14} className="text-slate-300 flex-shrink-0" />
                  <span className="text-2xl font-bold text-slate-900 leading-tight">{kpi.after}</span>
                  {kpi.delta != null && (
                    <span className={`ml-auto text-[11px] font-semibold ${kpi.delta > 0 ? 'text-emerald-600' : kpi.delta < 0 ? 'text-red-600' : 'text-slate-400'}`}>{kpi.delta > 0 ? `+${kpi.delta}` : kpi.delta}</span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
      )}

      {/* ── Overall assessment result (a–e breakdown) — top of Summary ── */}
      {skillView === 'summary' && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {([['x', "Circle's Ability (X-axis)", CATS_X, AXIS_COLOR.x, B.x, A.x],
           ['y', 'Positive & satisfying workplace (Y-axis)', CATS_Y, AXIS_COLOR.y, B.y, A.y]] as const).map(
          ([key, title, cats, color, bTot, aTot]) => (
            <div key={key} id={`ca-overall-${key}`} className={`bg-white rounded-xl border shadow-sm p-5 scroll-mt-4 transition-all ${activeKpi === key ? 'border-blue-400 ring-2 ring-blue-200' : 'border-slate-200'}`}>
              <h3 className="text-sm font-semibold text-slate-800 mb-1">Overall result — {title}</h3>
              <p className="text-[11px] text-slate-400 mb-3">Team average per category (0–10) · Before vs After</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-200">
                    <th className="text-left font-medium py-1.5">Item</th>
                    <th className="text-center font-medium py-1.5 w-16">Before</th>
                    <th className="text-center font-medium py-1.5 w-16">After</th>
                    <th className="text-center font-medium py-1.5 w-12">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {cats.map((c, i) => {
                    const b = teamCatAvg('before', c), a = teamCatAvg('after', c);
                    const d = +(a - b).toFixed(1);
                    return (
                      <tr key={c.code} className="border-b border-slate-100">
                        <td className="py-1.5 text-slate-700">({String.fromCharCode(97 + i)}) {c.name}</td>
                        <td className="text-center text-slate-500">{b.toFixed(1)}</td>
                        <td className="text-center font-semibold" style={{ color }}>{a.toFixed(1)}</td>
                        <td className={`text-center font-medium ${d > 0 ? 'text-emerald-600' : d < 0 ? 'text-red-600' : 'text-slate-400'}`}>{d > 0 ? `+${d}` : d}</td>
                      </tr>
                    );
                  })}
                  <tr className="font-bold text-slate-800">
                    <td className="py-2">Total (avg)</td>
                    <td className="text-center">{bTot.toFixed(1)}</td>
                    <td className="text-center" style={{ color }}>{aTot.toFixed(1)}</td>
                    <td className="text-center text-emerald-600">{aTot - bTot > 0 ? `+${(aTot - bTot).toFixed(1)}` : (aTot - bTot).toFixed(1)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
      )}

      {/* ── Circle level matrix + overall radar (Summary = Before→After · Before/After = single phase) ── */}
      {skillView === 'summary' ? (
        <>
          {/* Per-member item matrix — Ability (X) & Positive workplace (Y), Before/After + Average */}
          {([
            { key: 'x' as const, cats: CATS_X, color: AXIS_COLOR.x, title: 'Ability of the circle team' },
            { key: 'y' as const, cats: CATS_Y, color: AXIS_COLOR.y, title: 'Positive & satisfying workplace' },
          ] as { key: 'x' | 'y'; cats: AssessCategory[]; color: string; title: string }[]).map(({ key, cats, color, title }) => (
            <div key={`mat-${key}`} id={`ca-matrix-${key}`} className={`bg-white rounded-xl border shadow-sm overflow-hidden scroll-mt-4 transition-all ${activeKpi === 'members' ? 'border-blue-400 ring-2 ring-blue-200' : 'border-slate-200'}`}>
              <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-2">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white" style={{ background: color }}>{key === 'x' ? 'X-axis' : 'Y-axis'}</span>
                <h3 className="text-sm font-bold text-slate-800">{title}</h3>
              </div>
              <div className="p-4 overflow-x-auto">
                {members.length === 0 ? <p className="text-sm text-slate-400 py-3 text-center">Add members below to build the assessment.</p> : (
                  <table className="text-xs whitespace-nowrap border-collapse w-full">
                    <thead>
                      <tr className="text-slate-500">
                        <th rowSpan={2} className="text-left font-medium py-1.5 px-2 border-b border-slate-200">Item</th>
                        {members.map(m => <th key={m.id} colSpan={2} className="text-center font-semibold py-1.5 px-2 border-b border-l border-slate-200 text-slate-700">{m.name}</th>)}
                        <th colSpan={2} className="text-center font-semibold py-1.5 px-2 border-b border-l border-slate-200" style={{ color }}>Circle avg</th>
                      </tr>
                      <tr className="text-slate-400 text-[10px]">
                        {members.flatMap(m => [
                          <th key={`${m.id}b`} className="text-center font-medium py-1 px-2 border-b border-l border-slate-200">Before</th>,
                          <th key={`${m.id}a`} className="text-center font-medium py-1 px-2 border-b border-slate-200">After</th>,
                        ])}
                        <th className="text-center font-medium py-1 px-2 border-b border-l border-slate-200">Before</th>
                        <th className="text-center font-medium py-1 px-2 border-b border-slate-200">After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cats.map((c, i) => (
                        <tr key={c.code} className="border-b border-slate-100">
                          <td className="py-1.5 px-2 text-slate-700">({String.fromCharCode(97 + i)}) {c.name}</td>
                          {members.flatMap(m => [
                            <td key={`${m.id}b`} className="text-center text-slate-600 border-l border-slate-100">{catCount(m.id, 'before', c)}</td>,
                            <td key={`${m.id}a`} className="text-center font-medium" style={{ color }}>{catCount(m.id, 'after', c)}</td>,
                          ])}
                          <td className="text-center text-slate-500 border-l border-slate-200">{teamCatAvg('before', c).toFixed(1)}</td>
                          <td className="text-center font-semibold" style={{ color }}>{teamCatAvg('after', c).toFixed(1)}</td>
                        </tr>
                      ))}
                      <tr className="font-bold text-slate-800 border-t border-slate-200">
                        <td className="py-1.5 px-2">Average</td>
                        {members.flatMap(m => [
                          <td key={`${m.id}b`} className="text-center border-l border-slate-100">{memberAxisAvg(m.id, 'before', cats).toFixed(1)}</td>,
                          <td key={`${m.id}a`} className="text-center" style={{ color }}>{memberAxisAvg(m.id, 'after', cats).toFixed(1)}</td>,
                        ])}
                        <td className="text-center border-l border-slate-200">{overallAxisAvg('before', cats).toFixed(1)}</td>
                        <td className="text-center" style={{ color }}>{overallAxisAvg('after', cats).toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ))}

          {/* Per-member radars — X-Abilities & Y-Cheerful per member (Before → After) */}
          <MemberRadarMatrix members={members} catCount={catCount} phase="summary" />
        </>
      ) : (() => {
        const ph: Phase = skillView === 'after' ? 'after' : 'before';
        const ox = overallAxisAvg(ph, CATS_X), oy = overallAxisAvg(ph, CATS_Y);
        const lvl = circleLevel(ox, oy);
        const zx = CATS_X.map(() => 0), zy = CATS_Y.map(() => 0);
        const xv = teamAxis(ph, CATS_X), yv = teamAxis(ph, CATS_Y);
        return (
          <>
            {/* Circle level matrix + circle assessment radars — side by side in one row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
              {/* Circle level matrix (this phase) */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <h3 className="text-sm font-semibold text-slate-800 mb-1">Circle level matrix — <span className="capitalize">{ph}</span></h3>
                <p className="text-[11px] text-slate-400 mb-3">Average of all {members.length} member{members.length === 1 ? '' : 's'} · X = Ability, Y = Workplace (points 0–10)</p>
                <div className="flex justify-center"><div className="w-full max-w-[260px]"><LevelMatrix label={ph === 'after' ? 'After' : 'Before'} x={ox} y={oy} color={ph === 'after' ? lvl.color : '#dc2626'} show={ox > 0 || oy > 0} /></div></div>
                <p className="text-center text-[11px] text-slate-500 mt-2">Level <span className="inline-flex items-center justify-center w-5 h-5 rounded text-white text-[10px] font-bold align-middle" style={{ background: lvl.color }}>{lvl.grade}</span> · X (Ability) <b className="text-slate-700">{ox.toFixed(1)}</b> · Y (Workplace) <b className="text-slate-700">{oy.toFixed(1)}</b> pts</p>
              </div>
              {/* Circle assessment radars — circle aggregate X (Ability) & Y (Workplace) */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <h3 className="text-sm font-bold text-slate-800 mb-3">Circle assessment radars — <span className="capitalize">{ph}</span></h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Radar title="Circle's Ability (X-axis)" cats={CATS_X} before={ph === 'before' ? xv : zx} after={ph === 'after' ? xv : zx} color={AXIS_COLOR.x} hideLegend showValues />
                  <Radar title="Positive & satisfying workplace (Y-axis)" cats={CATS_Y} before={ph === 'before' ? yv : zy} after={ph === 'after' ? yv : zy} color={AXIS_COLOR.y} hideLegend showValues />
                </div>
              </div>
            </div>
            {/* Per-member radars — X-Abilities & Y-Cheerful per member (same style as Summary) */}
            <MemberRadarMatrix members={members} catCount={catCount} phase={ph} />
          </>
        );
      })()}

      {/* Before → After circle level compare + overall level — Summary only */}
      {skillView === 'summary' && (
      <div id="ca-level-compare" className="space-y-6 scroll-mt-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className={`bg-white rounded-xl border shadow-sm p-5 transition-all ${activeKpi === 'level' || activeKpi === 'improve' ? 'border-blue-400 ring-2 ring-blue-200' : 'border-slate-200'}`}>
            <h3 className="text-sm font-semibold text-slate-800 mb-1">Circle level matrix — Before → After</h3>
            <p className="text-[11px] text-slate-400 mb-3">Average of all {members.length} member{members.length === 1 ? '' : 's'} · plotted on the QC-circle level grid</p>
            <div className="flex items-center gap-1">
              <LevelMatrix label="Before" x={B.x} y={B.y} color="#dc2626" show={B.x > 0 || B.y > 0} />
              <ArrowRight size={26} className="text-blue-500 flex-shrink-0" />
              <LevelMatrix label="After" x={A.x} y={A.y} color={A.level.color} show={A.x > 0 || A.y > 0} />
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Circle result — Before vs After</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {([['before', B], ['after', A]] as const).map(([k, s]) => (
                <div key={k} className={`rounded-xl border p-3 ${k === 'after' ? 'border-slate-200' : 'border-dashed border-slate-300'}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">{k === 'before' ? 'Before review' : 'After review'}</p>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-2xl font-bold flex-shrink-0" style={{ background: s.level.color }}>{s.level.grade}</div>
                    <div className="text-[11px] text-slate-500 leading-tight"><div>X <b className="text-slate-700">{s.x.toFixed(1)}</b></div><div>Y <b className="text-slate-700">{s.y.toFixed(1)}</b></div></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3"><Delta label="Ability (X)" value={dX} /><Delta label="Workplace (Y)" value={dY} /></div>
          </div>
        </div>
        <div className="flex items-center justify-center gap-3 bg-white rounded-xl border border-slate-200 shadow-sm py-3 text-sm">
          <span className="text-slate-500">Overall circle level:</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ background: '#dc2626' }}>{B.level.grade}</span><span className="text-[11px] text-slate-400">Before</span></span>
          <ArrowRight size={18} className="text-blue-500" />
          <span className="inline-flex items-center gap-1.5"><span className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ background: A.level.color }}>{A.level.grade}</span><span className="text-[11px] text-slate-400">After</span></span>
        </div>
      </div>
      )}


      {/* ── Per-member score entry (X-axis & Y-axis tables) — hidden in Summary. Members
             come straight from the selected team; no manual member management here. ── */}
      {skillView !== 'summary' && (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {members.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">Select a team above to load its members and score them.</div>
        ) : (
              <div className="p-5 space-y-5">
                {([
                  { key: 'x' as const, cats: CATS_X, color: AXIS_COLOR.x, title: "Circle's Ability" },
                  { key: 'y' as const, cats: CATS_Y, color: AXIS_COLOR.y, title: 'Positive & satisfying workplace' },
                ]).map(({ key, cats, color, title }) => {
                  const ph: Phase = skillView === 'after' ? 'after' : 'before';
                  return (
                    <div key={key} className="rounded-xl border border-slate-200 overflow-hidden" style={{ borderTop: `3px solid ${color}` }}>
                      <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white flex-shrink-0" style={{ background: color }}>{key === 'x' ? 'X-axis' : 'Y-axis'}</span>
                        <h4 className="text-sm font-bold text-slate-800">{title} <span className="font-normal text-slate-400 capitalize">· {ph}</span></h4>
                        <span className="ml-auto text-[10px] text-slate-400">Tick the items each member has achieved</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse whitespace-nowrap">
                          <thead>
                            <tr className="bg-slate-50 text-slate-500">
                              <th className="text-left font-semibold px-3 py-2 sticky left-0 bg-slate-50 z-10 border-b border-slate-200 min-w-[300px]">Item</th>
                              {members.map(m => <th key={m.id} className="text-center font-semibold px-2 py-2 border-b border-l border-slate-200 min-w-[96px]">{m.name}</th>)}
                              <th className="text-center font-semibold px-2 py-2 border-b border-l border-slate-200" style={{ color }}>Avg</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cats.map((cat, i) => {
                              const catKey = `${key}-${cat.code}`;
                              const open = openCats.has(catKey);
                              return (
                              <Fragment key={cat.code}>
                                {/* Category header — click the arrow to expand its items */}
                                <tr className="bg-slate-100/70 border-b border-slate-200">
                                  <td className="px-3 py-1.5 sticky left-0 bg-slate-100/70 z-10">
                                    <button type="button" onClick={() => toggleAssessCat(catKey)} className="flex items-center gap-1.5 font-bold text-slate-700 text-left w-full">
                                      {open ? <ChevronUp className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />}
                                      <span className="text-slate-400 mr-1">({String.fromCharCode(97 + i)})</span>{cat.name}
                                    </button>
                                  </td>
                                  {members.map(m => <td key={m.id} className="text-center px-2 py-1.5 border-l border-slate-200 font-bold" style={{ color }}>{catCount(m.id, ph, cat)}</td>)}
                                  <td className="text-center px-2 py-1.5 border-l border-slate-200 font-bold" style={{ color }}>{teamCatAvg(ph, cat).toFixed(1)}</td>
                                </tr>
                                {/* One row per checklist item, a checkbox per member (only when the category is expanded) */}
                                {open && cat.items.map((item, idx) => {
                                  const k = itemKey(cat.code, idx);
                                  return (
                                    <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/60">
                                      <td className="px-3 py-1.5 text-slate-600 sticky left-0 bg-white z-10 whitespace-normal"><span className="text-slate-400 mr-1">{idx + 1}.</span>{item}</td>
                                      {members.map(m => {
                                        const on = checked[m.id]?.[ph]?.has(k) ?? false;
                                        return (
                                          <td key={m.id} onClick={() => toggleItem(m.id, ph, k)} title={on ? 'Achieved — click to clear' : 'Click to mark achieved'}
                                            className="text-center px-2 py-1.5 border-l border-slate-100 cursor-pointer select-none hover:bg-slate-50">
                                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-md border transition-colors"
                                              style={on ? { backgroundColor: color, borderColor: color } : { borderColor: '#cbd5e1' }}>
                                              {on && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                                            </span>
                                          </td>
                                        );
                                      })}
                                      <td className="border-l border-slate-100" />
                                    </tr>
                                  );
                                })}
                              </Fragment>
                              );
                            })}
                            <tr className="bg-slate-50 font-bold text-slate-800 border-t-2 border-slate-200">
                              <td className="px-3 py-2 sticky left-0 bg-slate-50 z-10">Overall Average</td>
                              {members.map(m => <td key={m.id} className="text-center px-2 py-2 border-l border-slate-200">{memberAxisAvg(m.id, ph, cats).toFixed(1)}</td>)}
                              <td className="text-center px-2 py-2 border-l border-slate-200" style={{ color }}>{overallAxisAvg(ph, cats).toFixed(1)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
        )}
      </div>
      )}


    </div>
  );
}

// ── One QC-circle level grid (Ability X × Workplace Y) with the level bands, used for Before & After ──
function LevelMatrix({ label, x, y, color, show }: { label: string; x: number; y: number; color: string; show: boolean }) {
  const ox = 42, oy = 200, size = 168;
  const px = (v: number) => ox + (v / 10) * size;
  const py = (v: number) => oy - (v / 10) * size;
  const poly = (pts: [number, number][]) => pts.map(([a, b]) => `${px(a)},${py(b)}`).join(' ');
  return (
    <div className="flex-1 min-w-0">
      <div className="text-center mb-1"><span className="text-[11px] font-semibold px-2.5 py-0.5 rounded bg-slate-100 text-slate-600">{label}</span></div>
      <svg viewBox="0 0 222 224" width="100%" height="200">
        <polygon points={poly([[0, 0], [10, 0], [0, 10]])} fill="#ece9f9" />
        <polygon points={poly([[10, 0], [10, 4], [4, 10], [0, 10]])} fill="#dcd4f6" />
        <polygon points={poly([[10, 4], [10, 7], [7, 10], [4, 10]])} fill="#c9d6f6" />
        <polygon points={poly([[10, 7], [10, 10], [7, 10]])} fill="#fcd7ac" />
        {[0, 2, 4, 6, 8, 10].map(v => <g key={v} stroke="#94a3b8" strokeOpacity="0.85"><line x1={px(v)} y1={py(0)} x2={px(v)} y2={py(10)} /><line x1={px(0)} y1={py(v)} x2={px(10)} y2={py(v)} /></g>)}
        <text x={px(8.6)} y={py(8.6)} fontSize="13" fontWeight="700" fill="#c2410c" textAnchor="middle">A</text>
        <text x={px(6.4)} y={py(6.4)} fontSize="12" fontWeight="700" fill="#4338ca" textAnchor="middle">B</text>
        <text x={px(4)} y={py(4)} fontSize="12" fontWeight="700" fill="#6d28d9" textAnchor="middle">C</text>
        <text x={px(1.4)} y={py(1.4)} fontSize="12" fontWeight="700" fill="#7c3aed" textAnchor="middle">D</text>
        <text x={px(1)} y={py(8.8)} fontSize="8.5" fontWeight="600" fill="#8b5cf6" textAnchor="middle">D-1</text>
        <text x={px(3)} y={py(9)} fontSize="8.5" fontWeight="600" fill="#7c3aed" textAnchor="middle">C-1</text>
        <text x={px(9)} y={py(3)} fontSize="8.5" fontWeight="600" fill="#7c3aed" textAnchor="middle">C-2</text>
        <text x={px(8.9)} y={py(1)} fontSize="8.5" fontWeight="600" fill="#8b5cf6" textAnchor="middle">D-2</text>
        <line x1={px(0)} y1={py(0)} x2={px(10)} y2={py(0)} stroke="#64748b" />
        <line x1={px(0)} y1={py(0)} x2={px(0)} y2={py(10)} stroke="#64748b" />
        <text x={px(5)} y={218} fontSize="10" fill="#64748b" textAnchor="middle">Ability (X) →</text>
        <text x={12} y={py(5)} fontSize="10" fill="#64748b" textAnchor="middle" transform={`rotate(-90 12 ${py(5)})`}>Workplace (Y) →</text>
        {show && <>
          <line x1={px(0)} y1={py(y)} x2={px(x)} y2={py(y)} stroke={color} strokeWidth="1.2" strokeDasharray="3 2" />
          <line x1={px(x)} y1={py(0)} x2={px(x)} y2={py(y)} stroke={color} strokeWidth="1.2" strokeDasharray="3 2" />
          <circle cx={px(x)} cy={py(y)} r="7" fill={color} fillOpacity="0.3" />
          <circle cx={px(x)} cy={py(y)} r="4.5" fill={color} stroke="#fff" strokeWidth="1.5" />
          <text x={px(x)} y={py(y) - 9} fontSize="9" fontWeight="700" fill={color} textAnchor="middle">{x.toFixed(1)}, {y.toFixed(1)}</text>
        </>}
      </svg>
    </div>
  );
}

// Per-member radar matrix — matches the QC-circle sheet: X-Abilities & Y-Cheerful are
// the two rows, each member is a column, one radar per cell. Name written once (column
// header). Same component drives Summary (before→after), Before, and After.
function MemberRadarMatrix({ members, catCount, phase }: {
  members: Member[];
  catCount: (id: string, ph: Phase, cat: AssessCategory) => number;
  phase: 'summary' | 'before' | 'after';
}) {
  const rows = [
    { key: 'X', label: 'X-Abilities', cats: CATS_X, color: AXIS_COLOR.x },
    { key: 'Y', label: 'Y-Cheerful & Participation', cats: CATS_Y, color: AXIS_COLOR.y },
  ] as const;
  const beforeArr = (id: string, cats: AssessCategory[]) => (phase === 'after' ? cats.map(() => 0) : cats.map(c => catCount(id, 'before', c)));
  const afterArr = (id: string, cats: AssessCategory[]) => (phase === 'before' ? cats.map(() => 0) : cats.map(c => catCount(id, 'after', c)));
  const title = phase === 'summary' ? 'Member radars — Before → After' : `Member radars — ${phase === 'after' ? 'After' : 'Before'}`;
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-2 flex-wrap">
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        <span className="ml-auto inline-flex items-center gap-3 text-[10px] text-slate-500">
          {phase !== 'after' && <span className="inline-flex items-center gap-1"><span className="inline-block w-3.5 border-t-2 border-dashed" style={{ borderColor: '#dc2626' }} /> Before</span>}
          {phase !== 'before' && <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm bg-slate-400" /> After</span>}
        </span>
      </div>
      {members.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">Select a team above to load its members and see their radars.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-collapse w-full">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white z-10 px-3 py-2 border-b border-slate-200 text-left w-[140px]"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Member →</span></th>
                {members.map(m => <th key={m.id} className="px-2 py-2 border-b border-l border-slate-100 text-xs font-semibold text-slate-700 text-center min-w-[150px]">{m.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.key}>
                  <td className="sticky left-0 bg-white z-10 px-3 py-2 border-b border-slate-100 align-middle">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white" style={{ background: row.color }}>{row.key}-axis</span>
                    <p className="text-xs font-bold text-slate-700 mt-1.5 leading-tight">{row.label}</p>
                  </td>
                  {members.map(m => (
                    <td key={m.id} className="px-1 py-1 border-b border-l border-slate-100 align-top">
                      <Radar title="" cats={row.cats} before={beforeArr(m.id, row.cats)} after={afterArr(m.id, row.cats)} color={row.color} hideLegend />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Radar({ title, cats, before, after, color, hideLegend, showValues }: { title: string; cats: { code: string }[]; before: number[]; after: number[]; color: string; hideLegend?: boolean; showValues?: boolean }) {
  const n = cats.length, cx = 100, cy = 96, R = 66;
  const pt = (i: number, v: number): [number, number] => {
    const ang = (-90 + i * (360 / n)) * Math.PI / 180;
    const r = (Math.max(0, Math.min(10, v)) / 10) * R;
    return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
  };
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, v).join(',')).join(' ');
  const grid = (lvl: number) => cats.map((_, i) => pt(i, lvl).join(',')).join(' ');
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
      {title && <p className="text-xs font-semibold text-slate-600 text-center mb-1">{title}</p>}
      <svg viewBox="0 0 200 194" width="100%" height="180">
        {[2, 4, 6, 8, 10].map(l => <polygon key={l} points={grid(l)} fill="none" stroke={l === 10 ? '#94a3b8' : '#d5dce4'} />)}
        {cats.map((_, i) => { const [x, y] = pt(i, 10); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#cbd5e1" />; })}
        {cats.map((c, i) => { const [x, y] = pt(i, 11.7); return <text key={i} x={x} y={y} fontSize="10" fontWeight="700" fill="#64748b" textAnchor="middle" dominantBaseline="middle">{c.code.split('-')[1].toUpperCase()}</text>; })}
        {before.some(v => v > 0) && <polygon points={poly(before)} fill="none" stroke="#dc2626" strokeWidth="2" strokeDasharray="4 2" />}
        {before.some(v => v > 0) && before.map((v, i) => { const [x, y] = pt(i, v); return <circle key={`b${i}`} cx={x} cy={y} r="2" fill="#dc2626" />; })}
        {after.some(v => v > 0) && <polygon points={poly(after)} fill={color} fillOpacity="0.25" stroke={color} strokeWidth="2" />}
        {after.some(v => v > 0) && after.map((v, i) => { const [x, y] = pt(i, v); return <circle key={`a${i}`} cx={x} cy={y} r="2" fill={color} />; })}
        {/* Numeric point values (clear identification, 0–10) */}
        {showValues && after.some(v => v > 0) && after.map((v, i) => { const [x, y] = pt(i, v); return <text key={`av${i}`} x={x} y={y - 4} fontSize="9" fontWeight="700" fill={color} textAnchor="middle">{v}</text>; })}
        {showValues && before.some(v => v > 0) && before.map((v, i) => { const [x, y] = pt(i, v); return <text key={`bv${i}`} x={x} y={y - 4} fontSize="9" fontWeight="700" fill="#dc2626" textAnchor="middle">{v}</text>; })}
      </svg>
      {showValues && <p className="text-center text-[9px] text-slate-400 -mt-1">points out of 10 · a–e per category</p>}
      {!hideLegend && (
        <div className="flex items-center justify-center gap-3 text-[9px] text-slate-500 -mt-1">
          <span className="inline-flex items-center gap-1"><span className="inline-block w-3.5 border-t-2 border-dashed" style={{ borderColor: '#dc2626' }} /> Before</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm" style={{ background: color, opacity: 0.55 }} /> After</span>
        </div>
      )}
    </div>
  );
}

function Delta({ label, value }: { label: string; value: number }) {
  const up = value > 0, down = value < 0;
  const color = up ? '#16a34a' : down ? '#dc2626' : '#64748b';
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
      <p className="text-[11px] text-slate-500">{label} change</p>
      <p className="text-sm font-bold flex items-center gap-1" style={{ color }}>{up ? <ArrowUp size={14} /> : down ? <ArrowDown size={14} /> : <Minus size={14} />}{value > 0 ? '+' : ''}{value.toFixed(1)}</p>
    </div>
  );
}
