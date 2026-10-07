import { useState, useMemo, useRef, type ReactNode } from 'react';
import {
  CheckCircle2, BarChart3, TrendingUp, Award, Plus, Trash2,
  ChevronDown, ChevronUp, Target, PieChart, IndianRupee, Paperclip, Download,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import { useConfirm } from './ConfirmDialog';

// ─── Types ───────────────────────────────────────────────
interface ResultMetric {
  id: string;
  name: string;
  unit: string;
  beforeValue: number;
  targetValue: number;
  actualValue: number;
  higherIsBetter: boolean;
  remark: string;
  evidence: string[];   // supporting document file names
}

let _uid = 700;
const uid = () => `r${++_uid}`;

const COLORS = { before: '#ef4444', target: '#3b82f6', actual: '#10b981', notAchieved: '#f59e0b' };

// Achieved (target met) · Partial (improved but short of target) · Gap (no gain)
type MetricStatus = 'achieved' | 'partial' | 'gap';
const STATUS_META: Record<MetricStatus, { label: string; cls: string; dot: string }> = {
  achieved: { label: 'Achieved', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'text-emerald-600' },
  partial: { label: 'Partially Achieved', cls: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'text-amber-600' },
  gap: { label: 'Not Achieved', cls: 'bg-red-100 text-red-700 border-red-200', dot: 'text-red-600' },
};

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

// ─── Component ───────────────────────────────────────────
export default function ResultsCheck() {
  const [metrics, setMetrics] = useState<ResultMetric[]>([
    { id: uid(), name: 'Defect Rate', unit: '%', beforeValue: 3.2, targetValue: 1.5, actualValue: 1.3, higherIsBetter: false, remark: 'Defect reduced significantly', evidence: ['inspection-report.pdf', 'trend-chart.png'] },
    { id: uid(), name: 'Setup Time', unit: 'min', beforeValue: 45, targetValue: 27, actualValue: 25, higherIsBetter: false, remark: 'Setup standardization effective', evidence: ['smed-study.pdf'] },
    { id: uid(), name: 'First Pass Yield', unit: '%', beforeValue: 92, targetValue: 98, actualValue: 97.5, higherIsBetter: true, remark: 'Improvement observed', evidence: ['fpy-log.xlsx'] },
    { id: uid(), name: 'Output per Shift', unit: 'pcs', beforeValue: 180, targetValue: 220, actualValue: 235, higherIsBetter: true, remark: 'Productivity increased', evidence: ['output-data.xlsx', 'shift-report.pdf'] },
    { id: uid(), name: 'Downtime', unit: 'hrs/wk', beforeValue: 8.5, targetValue: 4, actualValue: 3.2, higherIsBetter: false, remark: 'Downtime reduced', evidence: ['maintenance-log.pdf'] },
  ]);
  const [annualSaving, setAnnualSaving] = useState<number>(1845200);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const askConfirm = useConfirm();
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const toggleExpand = (id: string) => setExpandedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const addMetric = () => {
    const m: ResultMetric = { id: uid(), name: '', unit: '', beforeValue: 0, targetValue: 0, actualValue: 0, higherIsBetter: false, remark: '', evidence: [] };
    setMetrics(prev => [...prev, m]);
    setExpandedIds(prev => new Set([...prev, m.id]));
  };
  const deleteMetric = (id: string) => { setMetrics(prev => prev.filter(m => m.id !== id)); setExpandedIds(prev => { const n = new Set(prev); n.delete(id); return n; }); };
  const updateMetric = (id: string, field: keyof ResultMetric, value: string | number | boolean | string[]) =>
    setMetrics(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m));
  const addEvidence = (id: string, files: FileList | null) => {
    if (!files || !files.length) return;
    const names = Array.from(files).map(f => f.name);
    setMetrics(prev => prev.map(m => m.id === id ? { ...m, evidence: [...m.evidence, ...names] } : m));
  };
  const removeEvidence = (id: string, name: string) =>
    setMetrics(prev => prev.map(m => m.id === id ? { ...m, evidence: m.evidence.filter(e => e !== name) } : m));

  // ── Derived helpers ──
  const statusOf = (m: ResultMetric): MetricStatus => {
    const met = m.higherIsBetter ? m.actualValue >= m.targetValue : m.actualValue <= m.targetValue;
    if (met) return 'achieved';
    const improved = m.higherIsBetter ? m.actualValue > m.beforeValue : m.actualValue < m.beforeValue;
    return improved ? 'partial' : 'gap';
  };
  const improvementPct = (m: ResultMetric) => {
    if (m.beforeValue <= 0) return 0;
    const raw = m.higherIsBetter ? (m.actualValue - m.beforeValue) / m.beforeValue : (m.beforeValue - m.actualValue) / m.beforeValue;
    return Math.round(raw * 1000) / 10; // one decimal
  };

  // ── Everything below is auto-generated from the entered metrics ──
  const chartData = useMemo(() => metrics.filter(m => m.name.trim()).map(m => ({
    name: m.name.length > 14 ? m.name.slice(0, 14) + '…' : m.name,
    fullName: m.name, unit: m.unit,
    before: m.beforeValue, target: m.targetValue, actual: m.actualValue,
    achieved: statusOf(m) === 'achieved', improvementPct: Math.abs(improvementPct(m)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [metrics]);

  const stats = useMemo(() => {
    const valid = metrics.filter(m => m.name.trim() && m.beforeValue > 0);
    const achieved = valid.filter(m => statusOf(m) === 'achieved').length;
    const successRate = valid.length ? Math.round((achieved / valid.length) * 100) : 0;
    const avgImprovement = valid.length ? Math.round((valid.reduce((s, m) => s + Math.abs(improvementPct(m)), 0) / valid.length) * 10) / 10 : 0;
    const overall = successRate >= 80 ? 'Achieved' : successRate >= 50 ? 'Partial' : 'In Progress';
    return { total: valid.length, achieved, successRate, avgImprovement, overall };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics]);

  const KPIS: { label: string; value: ReactNode; sub: string; icon: ReactNode; accent: string }[] = [
    { label: 'Metrics Achieved', value: `${stats.achieved} / ${stats.total}`, sub: `${stats.successRate}% Metrics achieved`, icon: <Target size={20} />, accent: 'text-emerald-600 bg-emerald-50' },
    { label: 'Overall Improvement', value: `${stats.avgImprovement}%`, sub: 'vs Before', icon: <TrendingUp size={20} />, accent: 'text-blue-600 bg-blue-50' },
    { label: 'Success Rate', value: `${stats.successRate}%`, sub: 'Achieved vs Total Metrics', icon: <PieChart size={20} />, accent: 'text-violet-600 bg-violet-50' },
    { label: 'Estimated Annual Saving', value: null, sub: 'Validated Saving', icon: <IndianRupee size={20} />, accent: 'text-amber-600 bg-amber-50' },
    { label: 'Overall Result', value: stats.overall, sub: stats.overall === 'Achieved' ? 'Project is successful' : 'Work in progress', icon: <Award size={20} />, accent: 'text-emerald-600 bg-emerald-50' },
  ];

  const exportReport = () => {
    const header = ['Metric', 'Unit', 'Before', 'Target', 'Actual', 'Improvement %', 'Status', 'Remark', 'Evidence'];
    const rows = metrics.filter(m => m.name.trim()).map(m => [
      m.name, m.unit, m.beforeValue, m.targetValue, m.actualValue, `${improvementPct(m)}%`, STATUS_META[statusOf(m)].label, m.remark, m.evidence.join('; '),
    ]);
    const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'check-the-results.csv';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const CmpTooltip = ({ active, payload }: any) => {
    if (active && payload?.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-xl p-3">
          <p className="text-xs font-bold text-slate-800 mb-1.5">{d.fullName}</p>
          <div className="text-[11px] text-slate-600">Before: <b className="text-red-700">{d.before} {d.unit}</b></div>
          <div className="text-[11px] text-slate-600">Target: <b className="text-blue-700">{d.target} {d.unit}</b></div>
          <div className="text-[11px] text-slate-600">Actual: <b className={d.achieved ? 'text-emerald-700' : 'text-amber-700'}>{d.actual} {d.unit}</b></div>
          <div className="text-[11px] text-slate-600 mt-1 pt-1 border-t border-slate-100">{d.achieved ? '✓ Target met' : 'Gap remains'} · Improvement {d.improvementPct}%</div>
        </div>
      );
    }
    return null;
  };

  const EMPTY = (msg: string) => <div className="h-[300px] flex items-center justify-center text-sm text-slate-400">{msg}</div>;

  return (
    <div className="space-y-4">
      {/* ── Export ── */}
      <div className="flex justify-end">
        <button onClick={exportReport} className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors">
          <Download size={15} /> Export Report
        </button>
      </div>

      {/* ── 5 KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {KPIS.map((k, i) => (
          <div key={i} className="rounded-xl bg-white border border-slate-200 shadow-sm p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] font-semibold text-slate-500">{k.label}</p>
              <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${k.accent}`}>{k.icon}</span>
            </div>
            {k.value == null ? (
              <div className="mt-1.5 flex items-center gap-1">
                <span className="text-lg font-bold text-slate-900">₹</span>
                <input
                  type="number"
                  value={annualSaving || ''}
                  onChange={e => setAnnualSaving(parseFloat(e.target.value) || 0)}
                  className="w-full min-w-0 text-lg font-bold text-slate-900 bg-transparent border-0 border-b border-transparent hover:border-slate-300 focus:border-blue-400 outline-none tabular-nums"
                />
              </div>
            ) : (
              <p className={`text-2xl font-bold mt-1.5 leading-tight ${k.label === 'Overall Result' ? 'text-emerald-600' : 'text-slate-900'}`}>{k.value}</p>
            )}
            <p className="text-[11px] text-slate-400 mt-1">{k.label === 'Estimated Annual Saving' ? `${inr(annualSaving)} · ${k.sub}` : k.sub}</p>
          </div>
        ))}
      </div>

      {/* ── 2 charts ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <BarChart3 size={16} className="text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800">Current vs Target vs Actual</h3>
          </div>
          <div className="p-4">
            {chartData.length === 0 ? EMPTY('Add a metric below to see the chart') : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ top: 24, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip content={<CmpTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="before" name="Before" fill={COLORS.before} radius={[4, 4, 0, 0]} barSize={20} />
                  <Bar dataKey="target" name="Target" fill={COLORS.target} radius={[4, 4, 0, 0]} barSize={20} />
                  <Bar dataKey="actual" name="Actual" radius={[4, 4, 0, 0]} barSize={20}>
                    {chartData.map((d, i) => <Cell key={i} fill={d.achieved ? COLORS.actual : COLORS.notAchieved} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-800">Improvement %</h3>
          </div>
          <div className="p-4">
            {chartData.length === 0 ? EMPTY('Add a metric below to see the chart') : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ top: 24, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={v => `${v}%`} />
                  <Tooltip formatter={(v: any) => [`${v}%`, 'Improvement']} labelFormatter={(_, p: any) => p?.[0]?.payload?.fullName || ''} />
                  <Bar dataKey="improvementPct" name="Improvement %" radius={[4, 4, 0, 0]} barSize={34} fill={COLORS.actual}>
                    <LabelList dataKey="improvementPct" position="top" fill="#475569" fontSize={11} fontWeight="bold" formatter={(v: any) => `${v}%`} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ── Achievement Summary table ── */}
      {metrics.some(m => m.name.trim()) && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <Award size={16} className="text-amber-500" />
            <h3 className="text-sm font-bold text-slate-800">Achievement Summary</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5 text-left">Metric</th>
                  <th className="px-4 py-2.5 text-center">Before</th>
                  <th className="px-4 py-2.5 text-center">Target</th>
                  <th className="px-4 py-2.5 text-center">Actual</th>
                  <th className="px-4 py-2.5 text-center">Improvement %</th>
                  <th className="px-4 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {metrics.filter(m => m.name.trim()).map(m => {
                  const st = statusOf(m);
                  const meta = STATUS_META[st];
                  return (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{m.name}{m.unit && <span className="text-[10px] text-slate-400 ml-1">({m.unit})</span>}</td>
                      <td className="px-4 py-2.5 text-center font-semibold text-slate-600 tabular-nums">{m.beforeValue}</td>
                      <td className="px-4 py-2.5 text-center font-semibold text-blue-700 tabular-nums">{m.targetValue}</td>
                      <td className="px-4 py-2.5 text-center font-semibold text-slate-800 tabular-nums">{m.actualValue}</td>
                      <td className="px-4 py-2.5 text-center font-semibold text-emerald-700 tabular-nums">{improvementPct(m)}%</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${meta.cls}`}>
                          <CheckCircle2 size={11} /> {meta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Result Metrics — Detailed Analysis ── */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-800">Result Metrics — Detailed Analysis</h3>
        <button onClick={addMetric} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"><Plus size={16} /> Add Metric</button>
      </div>

      {metrics.length === 0 && (
        <div className="text-center py-10 bg-slate-50 rounded-xl border-2 border-dashed border-slate-300">
          <BarChart3 size={24} className="text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-600">No result metrics yet</p>
          <p className="text-xs text-slate-400 mt-1">Click "Add Metric" to compare Before, Target and Actual.</p>
        </div>
      )}

      <div className="space-y-2.5">
        {metrics.map(metric => {
          const isExpanded = expandedIds.has(metric.id);
          const st = statusOf(metric);
          const meta = STATUS_META[st];
          const hasData = metric.name.trim() && metric.beforeValue > 0;
          return (
            <div key={metric.id} className={`rounded-xl border bg-white overflow-hidden ${
              hasData && st === 'achieved' ? 'border-emerald-200' : hasData && st === 'partial' ? 'border-amber-200' : 'border-slate-200'}`}>
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 flex-wrap">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0 ${meta.cls}`}><CheckCircle2 size={14} /></span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{metric.name || 'New Metric'}{metric.unit && <span className="text-slate-500 font-normal ml-1">({metric.unit})</span>}</p>
                    {hasData && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[11px] text-slate-500">
                        <span>Before: <b className="text-slate-700">{metric.beforeValue}</b></span>
                        <span>Target: <b className="text-blue-700">{metric.targetValue}</b></span>
                        <span>Actual: <b className="text-slate-800">{metric.actualValue}</b></span>
                        <span>Improvement: <b className="text-emerald-700">{improvementPct(metric)}%</b></span>
                        {metric.remark && <span>Remark: <b className="text-slate-600 font-medium">{metric.remark}</b></span>}
                        <span className="inline-flex items-center gap-1"><Paperclip size={11} className="text-slate-400" /> Evidence: <b className="text-slate-700">{metric.evidence.length} file{metric.evidence.length === 1 ? '' : 's'}</b></span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${meta.cls}`}><CheckCircle2 size={11} /> {meta.label}</span>
                  <button onClick={() => toggleExpand(metric.id)} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg">{isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
                  <button onClick={async () => { if (await askConfirm({ title: 'Delete this metric?', message: 'This metric and its comparison data will be removed.', confirmText: 'Delete' })) deleteMetric(metric.id); }} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                </div>
              </div>

              {isExpanded && (
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Metric Name <span className="text-red-500">*</span></label>
                      <input type="text" value={metric.name} onChange={e => updateMetric(metric.id, 'name', e.target.value)} placeholder="e.g., Defect Rate" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Unit</label>
                      <input type="text" value={metric.unit} onChange={e => updateMetric(metric.id, 'unit', e.target.value)} placeholder="%, pcs, min" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Direction</label>
                      <select value={metric.higherIsBetter ? 'higher' : 'lower'} onChange={e => updateMetric(metric.id, 'higherIsBetter', e.target.value === 'higher')} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                        <option value="lower">Lower is better</option>
                        <option value="higher">Higher is better</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-red-700 mb-1">Before (baseline)</label>
                      <input type="number" value={metric.beforeValue || ''} onChange={e => updateMetric(metric.id, 'beforeValue', parseFloat(e.target.value) || 0)} placeholder="0" className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:ring-2 focus:ring-red-300 outline-none font-semibold text-red-700" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-blue-700 mb-1">Target (goal)</label>
                      <input type="number" value={metric.targetValue || ''} onChange={e => updateMetric(metric.id, 'targetValue', parseFloat(e.target.value) || 0)} placeholder="0" className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-300 outline-none font-semibold text-blue-700" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-emerald-700 mb-1">Actual (after)</label>
                      <input type="number" value={metric.actualValue || ''} onChange={e => updateMetric(metric.id, 'actualValue', parseFloat(e.target.value) || 0)} placeholder="0" className="w-full px-3 py-2 border border-emerald-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-300 outline-none font-semibold text-emerald-700" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Remark</label>
                    <input type="text" value={metric.remark} onChange={e => updateMetric(metric.id, 'remark', e.target.value)} placeholder="Observation / note on this result" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>

                  {/* Evidence — supporting documents */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-slate-700">Evidence / Supporting Documents</label>
                      <button onClick={() => fileInputs.current[metric.id]?.click()} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-slate-300 rounded-lg text-xs font-medium text-blue-600 hover:border-blue-400 hover:bg-blue-50/40 transition-colors">
                        <Plus size={13} /> Add Document
                      </button>
                      <input ref={el => { fileInputs.current[metric.id] = el; }} type="file" multiple className="hidden" onChange={e => { addEvidence(metric.id, e.target.files); e.target.value = ''; }} />
                    </div>
                    {metric.evidence.length === 0 ? (
                      <p className="text-[11px] text-slate-400">No documents attached yet.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {metric.evidence.map((name, i) => (
                          <span key={i} className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs">
                            <Paperclip size={12} className="text-slate-400" /> <span className="max-w-[160px] truncate">{name}</span>
                            <button onClick={() => removeEvidence(metric.id, name)} className="p-0.5 rounded hover:bg-red-100 text-slate-400 hover:text-red-600"><Trash2 size={11} /></button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
