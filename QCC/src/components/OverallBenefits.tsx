import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { Coins, Sparkles, Award, TrendingUp, TrendingDown, CheckCircle2, Plus, Trash2, Wallet, Gauge } from 'lucide-react';
import { useConfirm } from './ConfirmDialog';

/* ───────── Types ───────── */
interface TangibleRow {
  id: string;
  benefit: string;
  beforeLabel: string;
  afterLabel: string;
  before: string;
  after: string;
  frequency: string;
  yearlySaving: string;
  remarks: string;
  custom?: boolean;     // user-added row (editable name + deletable)
}

interface IntangibleRow {
  id: string;
  benefit: string;
  achieved: boolean;
  remarks: string;
  custom?: boolean;
}

interface OverallBenefitsProps {
  projectId?: string;
}

/* ───────── Standard QCC benefits template ───────── */
const TANGIBLE_TEMPLATE: Omit<TangibleRow, 'before' | 'after' | 'frequency' | 'yearlySaving' | 'remarks'>[] = [
  { id: 'cost-saving', benefit: 'Cost Saving', beforeLabel: 'Before Cost', afterLabel: 'After Cost' },
  { id: 'productivity', benefit: 'Productivity Improvement', beforeLabel: 'Before Qty', afterLabel: 'After Qty' },
  { id: 'manpower', benefit: 'Manpower Saving', beforeLabel: 'Before MP', afterLabel: 'After MP' },
  { id: 'rework', benefit: 'Rework Reduction', beforeLabel: 'Before Rework Qty', afterLabel: 'After Rework Qty' },
  { id: 'scrap', benefit: 'Scrap Reduction', beforeLabel: 'Before Scrap Qty', afterLabel: 'After Scrap Qty' },
  { id: 'energy', benefit: 'Energy Saving', beforeLabel: 'Before KWH used', afterLabel: 'After KWH Used' },
  { id: 'inventory', benefit: 'Inventory Reduction', beforeLabel: 'Before Inventory', afterLabel: 'After Inventory' },
  { id: 'tool-cost', benefit: 'Tool Cost Reduction', beforeLabel: 'Before Cost', afterLabel: 'After Cost' },
  { id: 'maintenance', benefit: 'Maintenance Cost Saving', beforeLabel: 'Before Cost', afterLabel: 'After Cost' },
  { id: 'space', benefit: 'Space Saving', beforeLabel: 'Before Area', afterLabel: 'After Area' },
];

const INTANGIBLE_TEMPLATE: string[] = [
  'Improved Safety Culture',
  'Better Teamwork',
  'Higher Employee Morale',
  'Customer Satisfaction',
  'Better Workplace Discipline (5S)',
  'Skill Development',
  'Quality Awareness',
  'Improved Company Image',
  'Environmental Responsibility',
  'Strong Continuous Improvement Culture',
];

const FREQUENCIES = ['', 'One time', 'Avg. Monthly'];
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const freshTangible = (): TangibleRow[] =>
  TANGIBLE_TEMPLATE.map(t => ({ ...t, before: '', after: '', frequency: '', yearlySaving: '', remarks: '' }));

const freshIntangible = (): IntangibleRow[] =>
  INTANGIBLE_TEMPLATE.map((benefit, i) => ({ id: `intangible-${i}`, benefit, achieved: false, remarks: '' }));

/* Merge saved editable values onto the fixed template, keeping user-added custom rows. */
function mergeTangible(saved: unknown): TangibleRow[] {
  const rows = Array.isArray(saved) ? (saved as TangibleRow[]) : [];
  const merged = freshTangible().map(t => {
    const s = rows.find(r => r.id === t.id);
    return s ? { ...t, before: s.before ?? '', after: s.after ?? '', frequency: s.frequency ?? '', yearlySaving: s.yearlySaving ?? '', remarks: s.remarks ?? '' } : t;
  });
  return [...merged, ...rows.filter(r => r.custom)];
}
function mergeIntangible(saved: unknown): IntangibleRow[] {
  const rows = Array.isArray(saved) ? (saved as IntangibleRow[]) : [];
  const merged = freshIntangible().map(t => {
    const s = rows.find(r => r.id === t.id);
    return s ? { ...t, achieved: !!s.achieved, remarks: s.remarks ?? '' } : t;
  });
  return [...merged, ...rows.filter(r => r.custom)];
}

const num = (v: string) => { const n = parseFloat(v.replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; };

// Yearly Cost Saving is auto-calculated: (Before − After) × 12 for "Avg. Monthly", ×1 otherwise.
// Can be negative (cost went up) or positive (real saving) — both are shown as-is.
const computeYearly = (b: { before: string; after: string; frequency: string }) =>
  Math.round((num(b.before) - num(b.after)) * (b.frequency === 'Avg. Monthly' ? 12 : 1));

/* ───────── Component ───────── */
export default function OverallBenefits({ projectId = 'default' }: OverallBenefitsProps) {
  const storageKey = `qcc-overall-benefits-v2-${projectId}`;
  const askConfirm = useConfirm();

  const [tangible, setTangible] = useState<TangibleRow[]>(() => {
    try { const s = localStorage.getItem(storageKey); if (s) return mergeTangible(JSON.parse(s).tangible); } catch { /* template */ }
    return freshTangible();
  });
  const [intangible, setIntangible] = useState<IntangibleRow[]>(() => {
    try { const s = localStorage.getItem(storageKey); if (s) return mergeIntangible(JSON.parse(s).intangible); } catch { /* template */ }
    return freshIntangible();
  });

  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem(storageKey, JSON.stringify({ tangible, intangible })), 600);
    return () => clearTimeout(t);
  }, [tangible, intangible, storageKey]);

  const patchT = (id: string, patch: Partial<TangibleRow>) =>
    setTangible(prev => prev.map(b => {
      if (b.id !== id) return b;
      const next = { ...b, ...patch };
      next.yearlySaving = String(computeYearly(next)); // keep the auto-calculated saving in sync
      return next;
    }));
  const patchI = (id: string, patch: Partial<IntangibleRow>) =>
    setIntangible(prev => prev.map(b => (b.id === id ? { ...b, ...patch } : b)));

  const addTangible = () => setTangible(prev => [...prev,
    { id: uid('t'), benefit: '', beforeLabel: '', afterLabel: '', before: '', after: '', frequency: '', yearlySaving: '', remarks: '', custom: true }]);
  const removeTangible = (id: string) => setTangible(prev => prev.filter(b => b.id !== id));
  const addIntangible = () => setIntangible(prev => [...prev, { id: uid('i'), benefit: '', achieved: false, remarks: '', custom: true }]);
  const removeIntangible = (id: string) => setIntangible(prev => prev.filter(b => b.id !== id));

  const totalYearly = useMemo(() => tangible.reduce((s, b) => s + computeYearly(b), 0), [tangible]);
  const achievedCount = useMemo(() => intangible.filter(b => b.achieved).length, [intangible]);

  const cellInput = 'w-full px-2 py-1.5 border border-transparent hover:border-slate-300 focus:border-blue-400 rounded text-sm outline-none bg-transparent focus:bg-white transition-all';

  // ── Auto-calculated from the entered benefit data ──
  const rowById = (id: string) => tangible.find(t => t.id === id);
  const improvementPct = (before: string, after: string, higherBetter: boolean) => {
    const b = num(before), a = num(after);
    if (b <= 0) return 0;
    return Math.round(((higherBetter ? a - b : b - a) / b) * 100);
  };
  const HIGHER_BETTER = new Set(['productivity']); // productivity/output ↑ is good; the rest are reductions
  const costSaving = (() => { const r = rowById('cost-saving'); return r ? computeYearly(r) : 0; })();
  const productivityInc = (() => { const r = rowById('productivity'); return r ? improvementPct(r.before, r.after, true) : 0; })();
  const qualityImp = (() => {
    const rows = ['rework', 'scrap'].map(rowById).filter((r): r is TangibleRow => !!r && num(r.before) > 0);
    if (!rows.length) return 0;
    return Math.round(rows.reduce((s, r) => s + improvementPct(r.before, r.after, false), 0) / rows.length);
  })();

  const KPIS: { label: string; value: ReactNode; icon: ReactNode; border: string; accent: string }[] = [
    { label: 'Annual Saving', value: `₹${totalYearly.toLocaleString('en-IN')}`, icon: <Wallet size={18} />, border: 'border-emerald-500', accent: 'text-emerald-600 bg-emerald-50' },
    { label: 'Productivity Increase', value: `${productivityInc}%`, icon: <TrendingUp size={18} />, border: 'border-blue-500', accent: 'text-blue-600 bg-blue-50' },
    { label: 'Quality Improvement', value: `${qualityImp}%`, icon: <Gauge size={18} />, border: 'border-violet-500', accent: 'text-violet-600 bg-violet-50' },
    { label: 'Cost Saving', value: `₹${costSaving.toLocaleString('en-IN')}`, icon: <Coins size={18} />, border: 'border-amber-500', accent: 'text-amber-600 bg-amber-50' },
  ];

  const breakdown = useMemo(() => tangible.filter(t => t.benefit.trim() && (num(t.before) > 0 || num(t.after) > 0)).map(t => ({
    benefit: t.benefit, before: t.before, after: t.after,
    imp: improvementPct(t.before, t.after, HIGHER_BETTER.has(t.id)), up: num(t.after) >= num(t.before),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [tangible]);

  const savingChart = useMemo(() => tangible.filter(t => t.benefit.trim() && computeYearly(t) > 0).map(t => ({
    name: t.benefit.length > 12 ? t.benefit.slice(0, 12) + '…' : t.benefit, full: t.benefit, saving: computeYearly(t),
  })), [tangible]);
  const SAVE_PALETTE = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#06b6d4', '#ef4444', '#14b8a6', '#f97316', '#6366f1', '#e11d48'];

  return (
    <div className="space-y-4">
      {/* ── 4 KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {KPIS.map((k, i) => (
          <div key={i} className={`rounded-xl bg-white border border-slate-200 border-l-4 ${k.border} shadow-sm p-4`}>
            <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${k.accent}`}>{k.icon}</span>
            <p className="text-xl font-bold text-slate-900 mt-2 leading-tight">{k.value}</p>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {/* ── Summary: savings by benefit + before → after (or a helpful empty state) ── */}
      {(savingChart.length > 0 || breakdown.length > 0) ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={15} className="text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-800">Annual saving by benefit</h3>
              <span className="ml-auto text-[11px] text-slate-400">₹{totalYearly.toLocaleString('en-IN')}</span>
            </div>
            {savingChart.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">Enter yearly savings in the table below.</p>
            ) : (() => {
              const max = Math.max(...savingChart.map(s => s.saving));
              return (
                <div className="space-y-2.5">
                  {savingChart.map((s, i) => (
                    <div key={i}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-600 truncate pr-2" title={s.full}>{s.full}</span>
                        <span className="font-semibold text-slate-800 flex-shrink-0">₹{s.saving.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-2 rounded-full" style={{ width: `${max > 0 ? (s.saving / max) * 100 : 0}%`, background: SAVE_PALETTE[i % SAVE_PALETTE.length] }} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Gauge size={15} className="text-blue-600" />
              <h3 className="text-sm font-bold text-slate-800">Before → after</h3>
            </div>
            {breakdown.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">Enter before / after values in the table below.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {breakdown.map((d, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="text-slate-600 truncate pr-2">{d.benefit}</span>
                    <span className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-slate-400">{d.before || '—'}</span>
                      <span className="text-slate-300">→</span>
                      <span className="font-semibold text-slate-800">{d.after || '—'}</span>
                      <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${d.imp >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                        {d.up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{Math.abs(d.imp)}%
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-dashed border-slate-300 p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3"><Wallet className="w-6 h-6 text-slate-400" /></div>
          <p className="text-sm font-semibold text-slate-700">No benefit data yet</p>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">Fill in the <span className="font-semibold text-slate-600">Tangible Benefits</span> table below — before, after &amp; yearly saving — and this summary (KPIs, savings and before → after) builds automatically.</p>
        </div>
      )}

        {/* ── Tangible Benefits ── */}
        <div className="border border-emerald-200 rounded-xl overflow-hidden bg-emerald-50/20">
          <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-200 flex items-center gap-2">
            <Coins className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-emerald-800">Tangible Benefits (₹ Measurable)</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm border-collapse">
              <thead>
                <tr className="bg-white border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                  <th className="px-3 py-2.5 text-left min-w-[170px]">Benefit</th>
                  <th className="px-2 py-2.5 text-center min-w-[110px]">Before</th>
                  <th className="px-2 py-2.5 text-center min-w-[110px]">After</th>
                  <th className="px-2 py-2.5 text-center min-w-[130px]">One time / Avg. Monthly</th>
                  <th className="px-2 py-2.5 text-center min-w-[120px]">Yearly Cost Saving</th>
                  <th className="px-2 py-2.5 text-left min-w-[150px]">Remarks</th>
                  <th className="w-9 px-1 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {tangible.map(b => (
                  <tr key={b.id} className="border-b border-slate-100 bg-white hover:bg-emerald-50/40">
                    <td className="px-3 py-2 font-semibold text-slate-800">
                      {b.custom
                        ? <input value={b.benefit} onChange={e => patchT(b.id, { benefit: e.target.value })} className={cellInput + ' font-semibold'} />
                        : b.benefit}
                    </td>
                    <td className="px-1 py-2"><input value={b.before} onChange={e => patchT(b.id, { before: e.target.value })} className={cellInput + ' text-center'} /></td>
                    <td className="px-1 py-2"><input value={b.after} onChange={e => patchT(b.id, { after: e.target.value })} className={cellInput + ' text-center'} /></td>
                    <td className="px-1 py-2">
                      <select value={b.frequency} onChange={e => patchT(b.id, { frequency: e.target.value })}
                        className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs text-center bg-white outline-none focus:border-blue-400">
                        {FREQUENCIES.map(f => <option key={f} value={f}>{f || '—'}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-2 text-center">{(() => { const y = computeYearly(b); const cls = y > 0 ? 'text-emerald-700' : y < 0 ? 'text-red-600' : 'text-slate-500'; return <span className={`text-sm font-semibold ${cls}`}>{y < 0 ? `-₹${Math.abs(y).toLocaleString('en-IN')}` : `₹${y.toLocaleString('en-IN')}`}</span>; })()}</td>
                    <td className="px-1 py-2"><input value={b.remarks} onChange={e => patchT(b.id, { remarks: e.target.value })} className={cellInput + ' text-slate-600'} /></td>
                    <td className="px-1 py-2 text-center">
                      {b.custom && (
                        <button onClick={async () => { if (await askConfirm({ title: 'Remove this row?', message: 'This tangible benefit row will be removed.', confirmText: 'Delete' })) removeTangible(b.id); }} className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Remove row">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tangible footer: add button + total */}
          <div className="px-4 py-3 bg-emerald-50 border-t border-emerald-200 flex items-center gap-4 flex-wrap">
            <button onClick={addTangible} className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add Tangible Benefit
            </button>
            <div className="ml-auto flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center flex-shrink-0"><TrendingUp className="w-4 h-4 text-emerald-600" /></div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-bold">Total Yearly Cost Saving</p>
                <p className="text-lg font-bold text-emerald-800 leading-tight">₹{totalYearly.toLocaleString('en-IN')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Intangible Benefits ── */}
        <div className="border border-purple-200 rounded-xl overflow-hidden bg-purple-50/20">
          <div className="px-4 py-3 bg-purple-50 border-b border-purple-200 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-600" />
            <h3 className="text-sm font-bold text-purple-800">Intangible Benefits</h3>
            <span className="ml-auto text-[11px] font-medium text-purple-600">{achievedCount} of {intangible.length} marked</span>
          </div>

          <div className="divide-y divide-slate-100">
            {intangible.map(b => (
              <div key={b.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-2.5 bg-white hover:bg-purple-50/40">
                <label className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer">
                  <input type="checkbox" checked={b.achieved} onChange={e => patchI(b.id, { achieved: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-400 cursor-pointer" />
                  {b.custom
                    ? <input value={b.benefit} onChange={e => patchI(b.id, { benefit: e.target.value })}
                        className="flex-1 px-2 py-1 border border-transparent hover:border-slate-300 focus:border-purple-400 rounded text-sm font-medium text-slate-700 outline-none bg-transparent focus:bg-white" />
                    : <span className={`text-sm font-medium ${b.achieved ? 'text-purple-800' : 'text-slate-700'}`}>{b.benefit}</span>}
                  {b.achieved && !b.custom && <CheckCircle2 className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />}
                </label>
                <input value={b.remarks} onChange={e => patchI(b.id, { remarks: e.target.value })}
                  className="sm:w-64 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 outline-none focus:border-purple-400 bg-white" />
                {b.custom && (
                  <button onClick={async () => { if (await askConfirm({ title: 'Remove this benefit?', message: 'This intangible benefit will be removed.', confirmText: 'Delete' })) removeIntangible(b.id); }} className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 flex-shrink-0" title="Remove">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Intangible footer: add button */}
          <div className="px-4 py-3 bg-purple-50 border-t border-purple-200">
            <button onClick={addIntangible} className="inline-flex items-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-lg transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add Intangible Benefit
            </button>
          </div>
        </div>
      </div>
  );
}
