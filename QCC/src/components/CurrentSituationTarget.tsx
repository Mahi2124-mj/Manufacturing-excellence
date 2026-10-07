import { useState, useMemo } from 'react';
import { Plus, Trash2, BarChart3, PieChart as PieIcon, X } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, ComposedChart, PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, LabelList, ReferenceLine,
} from 'recharts';

// ─── Types ───────────────────────────────────────────────
interface Metric { id: string; name: string; unit: string; currentValue: number; targetValue: number; }
interface Row { id: string; label: string; value: number; }

type ChartType = 'bar' | 'line' | 'pareto' | 'pie' | 'doughnut';
type Category = 'Machine' | 'Shift' | 'Defect' | 'Operator' | 'Process' | 'Custom';

let _uid = 500;
const uid = () => `m${++_uid}`;

const CHART_TYPES: { key: ChartType; label: string }[] = [
  { key: 'bar', label: 'Bar' },
  { key: 'line', label: 'Line' },
  { key: 'pareto', label: 'Pareto' },
  { key: 'pie', label: 'Pie' },
  { key: 'doughnut', label: 'Doughnut' },
];
const CATEGORIES: Category[] = ['Machine', 'Shift', 'Defect', 'Operator', 'Process', 'Custom'];
const CAT_HINT: Record<Category, string> = {
  Machine: 'e.g., M-1', Shift: 'e.g., Shift A', Defect: 'e.g., Scratches',
  Operator: 'e.g., Op-1', Process: 'e.g., Assembly', Custom: 'Label',
};
const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#14b8a6', '#e11d48', '#6366f1'];
const CV = { current: '#ef4444', target: '#3b82f6', cum: '#f97316' };

// ─── Component ───────────────────────────────────────────
export default function CurrentSituationTarget() {
  // Chart 1 — Current vs Target metrics
  const [metrics, setMetrics] = useState<Metric[]>([
    { id: uid(), name: 'Setup Time', unit: 'min', currentValue: 45, targetValue: 27 },
    { id: uid(), name: 'Defect Rate', unit: '%', currentValue: 3.2, targetValue: 1.5 },
    { id: uid(), name: 'Reject Count', unit: 'pcs/day', currentValue: 28, targetValue: 12 },
  ]);

  // Chart 2 — configurable analysis chart
  const [chartType, setChartType] = useState<ChartType>('pareto');
  const [category, setCategory] = useState<Category>('Defect');
  const [customName, setCustomName] = useState('');
  const [rows, setRows] = useState<Row[]>([
    { id: uid(), label: 'Scratches', value: 45 },
    { id: uid(), label: 'Misalignment', value: 28 },
    { id: uid(), label: 'Burr', value: 15 },
    { id: uid(), label: 'Contamination', value: 8 },
    { id: uid(), label: 'Other', value: 4 },
  ]);

  // Data-entry popups
  const [showMetrics, setShowMetrics] = useState(false);
  const [showData, setShowData] = useState(false);

  // Metric CRUD
  const addMetric = () => setMetrics(prev => [...prev, { id: uid(), name: '', unit: '', currentValue: 0, targetValue: 0 }]);
  const delMetric = (id: string) => setMetrics(prev => prev.filter(m => m.id !== id));
  const setMetric = (id: string, f: keyof Metric, v: string | number) => setMetrics(prev => prev.map(m => m.id === id ? { ...m, [f]: v } : m));

  // Row CRUD
  const addRow = () => setRows(prev => [...prev, { id: uid(), label: '', value: 0 }]);
  const delRow = (id: string) => setRows(prev => prev.filter(r => r.id !== id));
  const setRow = (id: string, f: keyof Row, v: string | number) => setRows(prev => prev.map(r => r.id === id ? { ...r, [f]: v } : r));

  // ── Chart 1 data ──
  const cvtData = useMemo(() => metrics.filter(m => m.name.trim()).map(m => ({
    name: m.name.length > 12 ? m.name.slice(0, 12) + '…' : m.name,
    fullName: m.name, current: m.currentValue, target: m.targetValue, unit: m.unit,
  })), [metrics]);

  // ── Chart 2 data (sorted + cumulative for Pareto) ──
  const catLabel = category === 'Custom' ? (customName.trim() || 'Category') : category;
  const data2 = useMemo(() => {
    const valid = rows.filter(r => r.label.trim() && r.value > 0);
    if (chartType === 'pareto') {
      const sorted = [...valid].sort((a, b) => b.value - a.value);
      const total = sorted.reduce((s, r) => s + r.value, 0) || 1;
      let run = 0;
      return sorted.map(r => { run += r.value; return { label: r.label, value: r.value, cum: Math.round((run / total) * 100) }; });
    }
    return valid.map(r => ({ label: r.label, value: r.value, cum: 0 }));
  }, [rows, chartType]);

  const CvtTooltip = ({ active, payload }: any) => {
    if (active && payload?.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-xl p-3 max-w-[200px]">
          <p className="text-xs font-bold text-slate-800 mb-1.5">{d.fullName}</p>
          <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm bg-red-500" /><span className="text-[10px] text-slate-600">Current: <strong>{d.current} {d.unit}</strong></span></div>
          <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500" /><span className="text-[10px] text-slate-600">Target: <strong>{d.target} {d.unit}</strong></span></div>
        </div>
      );
    }
    return null;
  };

  const EMPTY = (msg: string) => <div className="h-[320px] flex items-center justify-center text-sm text-slate-400">{msg}</div>;
  const feedBtn = 'inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors';
  const inputCls = 'w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400';

  // ── Chart 2 renderer ──
  const renderChart2 = () => {
    if (data2.length === 0) return EMPTY(`Click "Feed data" to add ${catLabel.toLowerCase()} data`);
    if (chartType === 'pie' || chartType === 'doughnut') {
      return (
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Pie data={data2} dataKey="value" nameKey="label" cx="50%" cy="50%"
              outerRadius={110} innerRadius={chartType === 'doughnut' ? 64 : 0}
              label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
              {data2.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      );
    }
    if (chartType === 'line') {
      return (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={data2} margin={{ top: 20, right: 15, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} />
            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
            <Tooltip />
            <Line type="monotone" dataKey="value" name={catLabel} stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }}>
              <LabelList dataKey="value" position="top" fill="#475569" fontSize={10} fontWeight="bold" />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      );
    }
    if (chartType === 'pareto') {
      return (
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={data2} margin={{ top: 20, right: 5, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} />
            <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#f97316' }} />
            <Tooltip />
            <ReferenceLine yAxisId="right" y={80} stroke="#f59e0b" strokeDasharray="5 4" />
            <Bar yAxisId="left" dataKey="value" name={catLabel} radius={[4, 4, 0, 0]} barSize={30}>
              {data2.map((d, i) => <Cell key={i} fill={d.cum <= 80 ? '#3b82f6' : '#93c5fd'} />)}
              <LabelList dataKey="value" position="top" fill="#475569" fontSize={10} fontWeight="bold" />
            </Bar>
            <Line yAxisId="right" type="monotone" dataKey="cum" name="Cumulative %" stroke={CV.cum} strokeWidth={2.5} dot={{ r: 3.5, fill: CV.cum }} />
          </ComposedChart>
        </ResponsiveContainer>
      );
    }
    // bar (default)
    return (
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data2} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} />
          <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
          <Tooltip />
          <Bar dataKey="value" name={catLabel} radius={[4, 4, 0, 0]} barSize={34}>
            {data2.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            <LabelList dataKey="value" position="top" fill="#475569" fontSize={11} fontWeight="bold" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div className="space-y-5">
      {/* ── Chart 1: Current vs Target ── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <BarChart3 size={16} className="text-blue-600" />
          <h3 className="text-sm font-bold text-slate-800">Current vs Target</h3>
          <button onClick={() => setShowMetrics(true)} className={`ml-auto ${feedBtn}`}><Plus size={14} /> Add Metric</button>
        </div>
        <div className="p-4">
          {cvtData.length === 0 ? EMPTY('Click "Feed data" to add metrics') : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={cvtData} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip content={<CvtTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="current" name="Current" fill={CV.current} radius={[4, 4, 0, 0]} barSize={30}>
                  <LabelList dataKey="current" position="top" fill={CV.current} fontSize={11} fontWeight="bold" />
                </Bar>
                <Bar dataKey="target" name="Target" fill={CV.target} radius={[4, 4, 0, 0]} barSize={30}>
                  <LabelList dataKey="target" position="top" fill={CV.target} fontSize={11} fontWeight="bold" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Chart 2: Configurable analysis chart ── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2 flex-wrap">
          <PieIcon size={16} className="text-violet-600" />
          <h3 className="text-sm font-bold text-slate-800">Analysis chart</h3>
          <span className="text-[10px] text-slate-500 hidden sm:inline">· {catLabel} · <span className="capitalize">{chartType}</span></span>
          <button onClick={() => setShowData(true)} className={`ml-auto ${feedBtn}`}><Plus size={14} /> Create Chart</button>
        </div>
        <div className="p-4">{renderChart2()}</div>
      </div>

      {/* ── Popup: Chart 1 metrics ── */}
      {showMetrics && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowMetrics(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Current vs Target — data</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Metric name, unit, current &amp; target — the chart updates automatically.</p>
              </div>
              <button onClick={() => setShowMetrics(false)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="p-5 max-h-[65vh] overflow-y-auto">
              <div className="grid grid-cols-[1fr,72px,76px,76px,28px] gap-1.5 text-[10px] font-semibold text-slate-400 uppercase px-1 mb-1">
                <span>Metric name</span><span>Unit</span><span className="text-right">Current</span><span className="text-right">Target</span><span />
              </div>
              <div className="space-y-1.5">
                {metrics.map(m => (
                  <div key={m.id} className="grid grid-cols-[1fr,72px,76px,76px,28px] gap-1.5 items-center">
                    <input type="text" value={m.name} onChange={e => setMetric(m.id, 'name', e.target.value)} placeholder="Setup Time" className={inputCls} />
                    <input type="text" value={m.unit} onChange={e => setMetric(m.id, 'unit', e.target.value)} placeholder="min" className={inputCls} />
                    <input type="number" value={m.currentValue || ''} onChange={e => setMetric(m.id, 'currentValue', parseFloat(e.target.value) || 0)} placeholder="0" className={`${inputCls} text-right font-semibold text-red-600`} />
                    <input type="number" value={m.targetValue || ''} onChange={e => setMetric(m.id, 'targetValue', parseFloat(e.target.value) || 0)} placeholder="0" className={`${inputCls} text-right font-semibold text-blue-600`} />
                    <button onClick={() => delMetric(m.id)} className="p-1 text-red-500 hover:bg-red-50 rounded-md transition-colors"><Trash2 size={14} /></button>
                  </div>
                ))}
                {metrics.length === 0 && <p className="text-xs text-slate-400 text-center py-4">No metrics yet.</p>}
              </div>
              <button onClick={addMetric} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg transition-colors"><Plus size={14} /> Add metric</button>
            </div>
            <div className="px-5 py-3 border-t border-slate-200 flex justify-end">
              <button onClick={() => setShowMetrics(false)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Popup: Chart 2 data ── */}
      {showData && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowData(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Create chart</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Pick a chart type &amp; data category, enter the data, then Save.</p>
              </div>
              <button onClick={() => setShowData(false)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="p-5 max-h-[65vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Chart type</label>
                  <select value={chartType} onChange={e => setChartType(e.target.value as ChartType)} className={`${inputCls} bg-white`}>
                    {CHART_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Data category</label>
                  <select value={category} onChange={e => setCategory(e.target.value as Category)} className={`${inputCls} bg-white`}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              {category === 'Custom' && (
                <div className="mb-3">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Category name</label>
                  <input type="text" value={customName} onChange={e => setCustomName(e.target.value)} placeholder="e.g., Supplier, Location…" className={inputCls} />
                </div>
              )}
              <div className="grid grid-cols-[1fr,96px,28px] gap-1.5 text-[10px] font-semibold text-slate-400 uppercase px-1 mb-1">
                <span>{catLabel}</span><span className="text-right">Value</span><span />
              </div>
              <div className="space-y-1.5">
                {rows.map(r => (
                  <div key={r.id} className="grid grid-cols-[1fr,96px,28px] gap-1.5 items-center">
                    <input type="text" value={r.label} onChange={e => setRow(r.id, 'label', e.target.value)} placeholder={CAT_HINT[category]} className={inputCls} />
                    <input type="number" value={r.value || ''} onChange={e => setRow(r.id, 'value', parseFloat(e.target.value) || 0)} placeholder="0" className={`${inputCls} text-right font-semibold text-slate-700`} />
                    <button onClick={() => delRow(r.id)} className="p-1 text-red-500 hover:bg-red-50 rounded-md transition-colors"><Trash2 size={14} /></button>
                  </div>
                ))}
                {rows.length === 0 && <p className="text-xs text-slate-400 text-center py-4">No data yet.</p>}
              </div>
              <button onClick={addRow} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50 px-2.5 py-1.5 rounded-lg transition-colors"><Plus size={14} /> Add row</button>
              <p className="text-[11px] text-slate-400 mt-3">Pareto sorts by value &amp; shows the cumulative % (80% line). Chart updates automatically.</p>
            </div>
            <div className="px-5 py-3 border-t border-slate-200 flex justify-end">
              <button onClick={() => setShowData(false)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
