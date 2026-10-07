import { useState, useEffect, useMemo } from 'react';
import {
  Calendar, Filter, Download, Printer, AlertCircle, CheckCircle2,
  Clock, TrendingUp, X, Upload, Trash2, FileSpreadsheet, GripVertical, Lock
} from 'lucide-react';
import { mockProjects } from '../lib/data';
import {
  type Activity, type GanttStatus,
  STATUS_OPTIONS, STATUS_PROGRESS, STATUS_STYLES,
  loadActivities, saveActivities, formatDate, daysBetween, calculateDelay,
} from '../lib/activityPlan';
import { useConfirm } from '../components/ConfirmDialog';

type ViewMode = 'day' | 'week' | 'month';

interface TooltipData { activity: Activity; x: number; y: number; }

const genId = () => `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const toDateStr = (ms: number) => new Date(ms).toISOString().split('T')[0];

// A native <input type="date"> emits partly-typed years (0002, 0020, …) while the user
// edits. Those must NOT drive the timeline range, or it would try to render hundreds of
// thousands of day-cells and freeze the page. So we ignore implausible years and hard-cap
// the number of days rendered.
const MAX_TIMELINE_DAYS = 1200;
const SANE_MIN_MS = new Date('1990-01-01T00:00:00').getTime();
const SANE_MAX_MS = new Date('2999-12-31T00:00:00').getTime();

// Left (data) column widths — header and body cells share these so everything lines up.
const W = { sr: 44, name: 184, pic: 120, ps: 112, pe: 112, as: 112, ae: 122, st: 110, dl: 56 };
const LEFT_W = Object.values(W).reduce((a, b) => a + b, 0);
const ROW_H = 46;

export default function GanttChart() {
  const askConfirm = useConfirm();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [filterPIC, setFilterPIC] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedProject, setSelectedProject] = useState(mockProjects[0]?.id || '');
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [detailActivity, setDetailActivity] = useState<Activity | null>(null);
  const [autoSavedAt, setAutoSavedAt] = useState<string | null>(null);

  // ── Load / auto-save via the shared store ──
  useEffect(() => { setActivities(loadActivities()); }, []);
  useEffect(() => {
    if (activities.length === 0) return;
    const timer = setTimeout(() => {
      saveActivities(activities);
      setAutoSavedAt(new Date().toLocaleTimeString());
    }, 1200);
    return () => clearTimeout(timer);
  }, [activities]);

  // ── Row operations (Actual End / approval are managed on the Approvals page) ──
  const updateActivity = (id: string, field: keyof Activity, value: string) => {
    setActivities(prev => prev.map(a => (a.id === id ? { ...a, [field]: value } : a)));
  };

  const addActivity = () => {
    setActivities(prev => [...prev, {
      id: genId(), srNo: prev.length + 1, name: '', pic: '',
      plannedStart: '', plannedEnd: '', actualStart: '', actualEnd: '',
      approved: false, approvalDate: '', approvedBy: '', status: 'Not Started', remarks: '',
    }]);
  };

  const removeActivity = (id: string) => {
    setActivities(prev => prev.filter(a => a.id !== id).map((a, i) => ({ ...a, srNo: i + 1 })));
  };

  const openDetail = (activity: Activity) => { setDetailActivity(activity); setShowDetailPanel(true); };

  // ── Filtering ──
  const filtered = useMemo(() => activities.filter(a => {
    if (filterPIC !== 'all' && a.pic !== filterPIC) return false;
    if (filterStatus !== 'all' && a.status !== filterStatus) return false;
    return true;
  }), [activities, filterPIC, filterStatus]);

  const uniquePICs = useMemo(() => [...new Set(activities.map(a => a.pic).filter(Boolean))], [activities]);

  const stats = useMemo(() => {
    const total = activities.length;
    const completed = activities.filter(a => a.status === 'Completed').length;
    const inProgress = activities.filter(a => a.status === 'In Progress').length;
    const delayed = activities.filter(a => a.status === 'Delayed').length;
    const progress = total > 0 ? Math.round(activities.reduce((s, a) => s + STATUS_PROGRESS[a.status], 0) / total) : 0;
    return { total, completed, inProgress, delayed, progress };
  }, [activities]);

  // ── Timeline ──
  const timeline = useMemo(() => {
    const defaultRange = () => {
      const now = new Date();
      const start = new Date(now); start.setDate(start.getDate() - 30);
      const end = new Date(now); end.setDate(end.getDate() + 30);
      return { start, end, totalDays: 60 };
    };

    // Only consider valid, in-range dates for the visible window.
    let minMs = Infinity, maxMs = -Infinity;
    for (const a of activities) {
      for (const d of [a.plannedStart, a.plannedEnd, a.actualStart, a.actualEnd]) {
        if (!d) continue;
        const t = new Date(d + 'T00:00:00').getTime();
        if (Number.isNaN(t) || t < SANE_MIN_MS || t > SANE_MAX_MS) continue;
        if (t < minMs) minMs = t;
        if (t > maxMs) maxMs = t;
      }
    }
    if (minMs === Infinity) return defaultRange();

    const minDate = new Date(minMs); minDate.setDate(minDate.getDate() - 5);
    const maxDate = new Date(maxMs); maxDate.setDate(maxDate.getDate() + 10);
    const DAY = 1000 * 60 * 60 * 24;
    let totalDays = Math.ceil((maxDate.getTime() - minDate.getTime()) / DAY);
    if (totalDays < 30) totalDays = 30;
    if (totalDays > MAX_TIMELINE_DAYS) {
      totalDays = MAX_TIMELINE_DAYS;
      maxDate.setTime(minDate.getTime() + MAX_TIMELINE_DAYS * DAY);
    }
    return { start: minDate, end: maxDate, totalDays };
  }, [activities]);

  const cellWidth = viewMode === 'day' ? 44 : viewMode === 'week' ? 22 : 8;
  const timelineWidth = timeline.totalDays * cellWidth;

  const getBarStyle = (startDate: string, endDate: string) => {
    if (!startDate || !endDate) return { left: 0, width: 0 };
    const DAY = 1000 * 60 * 60 * 24;
    const rawLeft = ((new Date(startDate + 'T00:00:00').getTime() - timeline.start.getTime()) / DAY) * cellWidth;
    const rawRight = ((new Date(endDate + 'T00:00:00').getTime() - timeline.start.getTime()) / DAY) * cellWidth;
    // Clamp to the visible window so a far-off / half-typed date can't push a bar
    // thousands of pixels away and blow up the horizontal scroll area.
    const left = Math.max(0, Math.min(rawLeft, timelineWidth));
    const right = Math.max(0, Math.min(rawRight, timelineWidth));
    const visible = rawRight > 0 && rawLeft < timelineWidth;
    const width = visible ? Math.max(right - left, 3) : 0;
    return { left, width };
  };

  const clampToTimeline = (dateStr: string) => {
    const t = new Date(dateStr + 'T00:00:00').getTime();
    return toDateStr(Math.min(Math.max(t, timeline.start.getTime()), timeline.end.getTime()));
  };

  // Green (act start → plan end) + optional Red overshoot (plan end → act end / today).
  const actualSegments = (act: Activity) => {
    if (!act.actualStart) return null;
    const inProgress = !act.actualEnd;
    const effEnd = act.actualEnd || clampToTimeline(new Date().toISOString().split('T')[0]);
    const t = (d: string) => new Date(d + 'T00:00:00').getTime();
    if (t(effEnd) <= t(act.actualStart)) {
      return { green: getBarStyle(act.actualStart, effEnd), red: null, inProgress };
    }
    const splitMs = act.plannedEnd
      ? Math.min(Math.max(t(act.plannedEnd), t(act.actualStart)), t(effEnd))
      : t(effEnd);
    const splitStr = toDateStr(splitMs);
    const green = getBarStyle(act.actualStart, splitStr);
    const red = t(effEnd) > splitMs ? getBarStyle(splitStr, effEnd) : null;
    return { green, red, inProgress };
  };

  const todayOffset = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return ((today.getTime() - timeline.start.getTime()) / (1000 * 60 * 60 * 24)) * cellWidth;
  }, [timeline, cellWidth]);

  const timelineHeaders = useMemo(() => {
    const cells: { isToday: boolean; isWeekend: boolean; label: string; subLabel: string }[] = [];
    for (let i = 0; i < timeline.totalDays; i++) {
      const d = new Date(timeline.start);
      d.setDate(d.getDate() + i);
      const isToday = d.toDateString() === new Date().toDateString();
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      let label = ''; let subLabel = '';
      if (viewMode === 'day') { label = String(d.getDate()); subLabel = d.toLocaleDateString('en-US', { month: 'short' }); }
      else if (viewMode === 'week') { if (d.getDate() % 7 === 1 || i === 0) { label = String(d.getDate()); subLabel = d.toLocaleDateString('en-US', { month: 'short' }); } }
      else { if (d.getDate() === 1 || i === 0) { label = d.toLocaleDateString('en-US', { month: 'short' }); subLabel = String(d.getFullYear()); } }
      cells.push({ isToday, isWeekend, label, subLabel });
    }
    return cells;
  }, [timeline, viewMode]);

  // ── Export / import ──
  const exportCSV = () => {
    const headers = ['Sr No', 'Activity Name', 'PIC', 'Planned Start', 'Planned End', 'Actual Start', 'Actual End (Approved)', 'Approved By', 'Status', 'Planned Duration', 'Delay Days', 'Remarks'];
    const rows = activities.map(a => [
      a.srNo, `"${a.name}"`, `"${a.pic}"`, formatDate(a.plannedStart), formatDate(a.plannedEnd),
      formatDate(a.actualStart), formatDate(a.actualEnd), `"${a.approvedBy}"`, a.status,
      daysBetween(a.plannedStart, a.plannedEnd), calculateDelay(a) || '—', `"${a.remarks}"`,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `QCC_Gantt_Chart_${new Date().toISOString().split('T')[0]}.csv`; link.click();
    URL.revokeObjectURL(url);
  };
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(activities, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `QCC_Gantt_Data_${new Date().toISOString().split('T')[0]}.json`; link.click();
    URL.revokeObjectURL(url);
  };
  const importJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try { const data = JSON.parse(ev.target?.result as string); if (Array.isArray(data)) { setActivities(data); saveActivities(data); } }
      catch { alert('Invalid JSON file'); }
    };
    reader.readAsText(file);
  };
  const handlePrint = () => window.print();

  const inputCls = 'w-full px-1.5 py-1 text-xs border border-transparent hover:border-slate-300 focus:border-blue-400 rounded outline-none bg-transparent focus:bg-white transition-all';
  const headCell = 'flex-shrink-0 px-2 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wide border-r border-slate-200';

  // ── Render ──
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Activity Plan — Gantt Chart</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Step 3: Interactive Project Timeline • QCC Workflow
            {autoSavedAt && <span className="ml-2 text-emerald-600">• Auto-saved {autoSavedAt}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-400">
            {mockProjects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <button onClick={exportCSV} className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg"><FileSpreadsheet size={14} /> Excel</button>
          <button onClick={handlePrint} className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg"><Printer size={14} /> Print</button>
          <button onClick={exportJSON} className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-600 hover:bg-slate-700 text-white text-xs font-medium rounded-lg"><Download size={14} /> JSON</button>
          <label className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg cursor-pointer">
            <Upload size={14} /> Import
            <input type="file" accept=".json" onChange={importJSON} className="hidden" />
          </label>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total Activities', value: stats.total, icon: <Calendar size={18} />, bg: 'from-blue-500 to-blue-700' },
          { label: 'Completed', value: stats.completed, icon: <CheckCircle2 size={18} />, bg: 'from-emerald-500 to-emerald-700' },
          { label: 'In Progress', value: stats.inProgress, icon: <Clock size={18} />, bg: 'from-amber-500 to-amber-700' },
          { label: 'Delayed', value: stats.delayed, icon: <AlertCircle size={18} />, bg: 'from-red-500 to-red-700' },
          { label: 'Overall Progress', value: `${stats.progress}%`, icon: <TrendingUp size={18} />, bg: 'from-indigo-500 to-indigo-700' },
        ].map((card, i) => (
          <div key={i} className={`bg-gradient-to-br ${card.bg} rounded-xl p-4 text-white shadow-lg`}>
            <div className="flex items-center justify-between">
              <div><p className="text-xs opacity-80">{card.label}</p><p className="text-2xl font-bold mt-1">{card.value}</p></div>
              <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">{card.icon}</div>
            </div>
            {card.label === 'Overall Progress' && (
              <div className="mt-2 h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-white rounded-full transition-all duration-700" style={{ width: `${stats.progress}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex items-center gap-3 flex-wrap">
          <Filter size={16} className="text-slate-500" />
          <select value={filterPIC} onChange={e => setFilterPIC(e.target.value)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white outline-none">
            <option value="all">All PIC</option>{uniquePICs.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white outline-none">
            <option value="all">All Status</option>{STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400"><Lock size={12} /> Actual End is set by management on the Approvals page</span>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-500">View:</span>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              {(['day', 'week', 'month'] as ViewMode[]).map(m => (
                <button key={m} onClick={() => setViewMode(m)} className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === m ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Combined table + timeline (one scroll area) ── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">Activity Plan</h3>
          <span className="text-[11px] text-slate-400">Blue = Planned · Green = Actual · Red = Overshoot · {filtered.length} activities</span>
        </div>

        <div className="overflow-auto no-scrollbar" style={{ maxHeight: 'calc(100vh - 340px)', minHeight: '360px' }}>
          <div style={{ width: `${LEFT_W + timelineWidth}px` }}>
            {/* Header row */}
            <div className="flex sticky top-0 z-30 bg-slate-50 border-b border-slate-200">
              <div className="flex bg-slate-50 border-r-2 border-slate-200" style={{ width: `${LEFT_W}px` }}>
                <div className={headCell + ' text-center'} style={{ width: W.sr }}>Sr</div>
                <div className={headCell} style={{ width: W.name }}>Activity Name</div>
                <div className={headCell} style={{ width: W.pic }}>PIC</div>
                <div className={headCell + ' text-center'} style={{ width: W.ps }}>Plan Start</div>
                <div className={headCell + ' text-center'} style={{ width: W.pe }}>Plan End</div>
                <div className={headCell + ' text-center'} style={{ width: W.as }}>Act Start</div>
                <div className={headCell + ' text-center'} style={{ width: W.ae }}>Act End</div>
                <div className={headCell + ' text-center'} style={{ width: W.st }}>Status</div>
                <div className={headCell + ' text-center border-r-0'} style={{ width: W.dl }}>Delay</div>
              </div>
              {/* Timeline date headers */}
              <div className="relative flex" style={{ width: `${timelineWidth}px` }}>
                {timelineHeaders.map((cell, i) => (
                  <div key={i} className={`flex-shrink-0 border-r text-center py-2 ${cell.isToday ? 'bg-amber-50 border-amber-200' : cell.isWeekend ? 'bg-slate-100/70 border-slate-200' : 'border-slate-100'}`} style={{ width: `${cellWidth}px` }}>
                    {cell.label && (<><div className={`text-[10px] font-bold ${cell.isToday ? 'text-amber-700' : 'text-slate-700'}`}>{cell.label}</div>{cell.subLabel && <div className="text-[8px] text-slate-400">{cell.subLabel}</div>}</>)}
                  </div>
                ))}
                {todayOffset >= 0 && todayOffset <= timelineWidth && (
                  <div className="absolute top-0 z-20 px-1.5 py-0.5 bg-amber-500 text-white text-[8px] font-bold rounded shadow-sm" style={{ left: `${todayOffset}px`, transform: 'translateX(-50%)' }}>TODAY</div>
                )}
              </div>
            </div>

            {/* Body rows */}
            {filtered.map((act) => {
              const delay = calculateDelay(act);
              const isSelected = selectedActivityId === act.id;
              const plannedBar = getBarStyle(act.plannedStart, act.plannedEnd);
              const seg = actualSegments(act);
              const rowBg = delay > 0 ? 'bg-red-50/50' : isSelected ? 'bg-blue-50' : 'bg-white';
              return (
                <div key={act.id} className="flex border-b border-slate-100 group" style={{ height: `${ROW_H}px` }} onClick={() => setSelectedActivityId(act.id)}>
                  {/* Data columns */}
                  <div className={`flex border-r-2 border-slate-200 ${rowBg} group-hover:brightness-[0.98]`} style={{ width: `${LEFT_W}px` }}>
                    <div className="flex items-center justify-center flex-shrink-0" style={{ width: W.sr }}>
                      <span className="text-xs font-semibold text-slate-500">{act.srNo}</span>
                    </div>
                    <div className="flex items-center gap-1 px-1 flex-shrink-0" style={{ width: W.name }}>
                      <GripVertical size={12} className="text-slate-300 flex-shrink-0 cursor-pointer" onClick={(e) => { e.stopPropagation(); openDetail(act); }} />
                      <input type="text" value={act.name} onChange={e => updateActivity(act.id, 'name', e.target.value)} onClick={e => e.stopPropagation()} placeholder="Activity name" className={inputCls + ' font-medium text-slate-800'} />
                    </div>
                    <div className="flex items-center px-1 flex-shrink-0" style={{ width: W.pic }}>
                      <input type="text" value={act.pic} onChange={e => updateActivity(act.id, 'pic', e.target.value)} onClick={e => e.stopPropagation()} placeholder="Assign PIC" className={inputCls} />
                    </div>
                    {(['plannedStart', 'plannedEnd', 'actualStart'] as const).map((field, idx) => (
                      <div key={field} className="flex items-center px-1 flex-shrink-0" style={{ width: [W.ps, W.pe, W.as][idx] }}>
                        <input type="date" min="1990-01-01" max="2100-12-31" value={act[field]} onChange={e => updateActivity(act.id, field, e.target.value)} onClick={e => e.stopPropagation()} className={inputCls + ' text-center'} />
                      </div>
                    ))}
                    {/* Act End — read only (set on Approvals page) */}
                    <div className="flex items-center justify-center px-1 flex-shrink-0" style={{ width: W.ae }} onClick={e => e.stopPropagation()}>
                      {act.approved ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 rounded text-[11px] font-semibold" title={`Approved by ${act.approvedBy || 'Management'}`}>
                          <Lock size={11} /> {formatDate(act.actualEnd)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 bg-slate-100 text-slate-400 rounded text-[11px] font-medium">Pending</span>
                      )}
                    </div>
                    <div className="flex items-center px-1 flex-shrink-0" style={{ width: W.st }}>
                      <select value={act.status} onChange={e => updateActivity(act.id, 'status', e.target.value as GanttStatus)} onClick={e => e.stopPropagation()} disabled={act.approved}
                        className={`w-full px-1.5 py-1 text-[11px] font-semibold border rounded outline-none disabled:opacity-70 ${STATUS_STYLES[act.status].bg} ${STATUS_STYLES[act.status].text}`}>
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center justify-center flex-shrink-0" style={{ width: W.dl }}>
                      {delay > 0 ? <span className="inline-flex items-center px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-bold">{delay}d</span> : <span className="text-[10px] text-slate-300">—</span>}
                    </div>
                  </div>

                  {/* Timeline bars for this row */}
                  <div className={`relative flex-shrink-0 ${isSelected ? 'bg-blue-50/40' : ''}`} style={{ width: `${timelineWidth}px` }}>
                    {/* weekend shading + today line */}
                    {timelineHeaders.map((cell, i) => cell.isWeekend && (
                      <div key={`we-${i}`} className="absolute top-0 bottom-0 bg-slate-50/60" style={{ left: `${i * cellWidth}px`, width: `${cellWidth}px` }} />
                    ))}
                    {todayOffset >= 0 && todayOffset <= timelineWidth && (
                      <div className="absolute top-0 bottom-0 w-0.5 bg-amber-500 z-30 pointer-events-none" style={{ left: `${todayOffset}px` }} />
                    )}
                    {/* Planned (blue) */}
                    {act.plannedStart && act.plannedEnd && (
                      <div className="absolute rounded-md shadow-sm cursor-pointer hover:brightness-110 z-10" style={{ left: `${plannedBar.left}px`, width: `${plannedBar.width}px`, top: '7px', height: '13px', background: 'linear-gradient(135deg, #2563EB, #3B82F6)' }}
                        onMouseEnter={e => setTooltip({ activity: act, x: e.clientX, y: e.clientY })} onMouseLeave={() => setTooltip(null)}
                        onClick={e => { e.stopPropagation(); openDetail(act); }} />
                    )}
                    {/* Actual (green) */}
                    {seg && seg.green.width > 0 && (
                      <div className={`absolute rounded-l-md ${seg.red ? '' : 'rounded-r-md'} shadow-sm cursor-pointer hover:brightness-110 z-10 ${seg.inProgress ? 'animate-pulse' : ''}`}
                        style={{ left: `${seg.green.left}px`, width: `${seg.green.width}px`, top: '25px', height: '13px', background: act.status === 'Completed' ? 'linear-gradient(135deg, #065F46, #059669)' : 'linear-gradient(135deg, #10B981, #34D399)', opacity: seg.inProgress ? 0.75 : 1 }}
                        onMouseEnter={e => setTooltip({ activity: act, x: e.clientX, y: e.clientY })} onMouseLeave={() => setTooltip(null)}
                        onClick={e => { e.stopPropagation(); openDetail(act); }} />
                    )}
                    {/* Overshoot (red) */}
                    {seg && seg.red && (
                      <div className="absolute rounded-r-md shadow-sm z-20" style={{ left: `${seg.red.left}px`, width: `${seg.red.width}px`, top: '25px', height: '13px', background: 'linear-gradient(135deg, #EF4444, #F87171)' }}
                        onMouseEnter={e => setTooltip({ activity: act, x: e.clientX, y: e.clientY })} onMouseLeave={() => setTooltip(null)}>
                        {delay > 0 && seg.red.width > 22 && <div className="absolute inset-0 flex items-center justify-center"><span className="text-[9px] font-bold text-white">+{delay}d</span></div>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Add row */}
            <div className="flex" style={{ width: `${LEFT_W}px` }}>
              <button onClick={addActivity} className="w-full flex items-center justify-center gap-2 py-3 text-xs text-blue-600 hover:bg-blue-50 transition-colors">
                <span className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">+</span> Add Activity
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div className="fixed z-[200] pointer-events-none" style={{ left: `${tooltip.x + 12}px`, top: `${tooltip.y - 10}px` }}>
          <div className="bg-slate-900 text-white rounded-lg shadow-2xl p-3 text-xs max-w-[280px]">
            <p className="font-bold text-sm mb-2 text-blue-300">{tooltip.activity.name}</p>
            <div className="space-y-1">
              <div className="flex justify-between gap-4"><span className="text-slate-400">PIC:</span><span className="font-medium">{tooltip.activity.pic || '—'}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-400">Planned:</span><span>{formatDate(tooltip.activity.plannedStart)} → {formatDate(tooltip.activity.plannedEnd)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-400">Actual:</span><span>{formatDate(tooltip.activity.actualStart)} → {tooltip.activity.actualEnd ? formatDate(tooltip.activity.actualEnd) : 'Ongoing'}</span></div>
              {tooltip.activity.approved && <div className="flex justify-between gap-4"><span className="text-slate-400">Approved by:</span><span className="font-medium">{tooltip.activity.approvedBy || 'Management'}</span></div>}
              {calculateDelay(tooltip.activity) > 0 && <div className="flex justify-between gap-4 text-red-400"><span>Delay:</span><span className="font-bold">{calculateDelay(tooltip.activity)} days</span></div>}
              <div className="flex justify-between gap-4"><span className="text-slate-400">Status:</span><span className={`font-semibold ${STATUS_STYLES[tooltip.activity.status].text}`}>{tooltip.activity.status}</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Detail panel (delete lives here now) */}
      {showDetailPanel && detailActivity && (
        <div className="fixed inset-0 z-[100] flex items-center justify-end bg-black/30 backdrop-blur-sm" onClick={() => setShowDetailPanel(false)}>
          <div className="w-full max-w-md bg-white h-full shadow-2xl overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
              <h3 className="text-lg font-bold text-slate-800">Activity Details</h3>
              <button onClick={() => setShowDetailPanel(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Activity #{detailActivity.srNo}</p>
                <h4 className="text-lg font-bold text-slate-800 mt-1">{detailActivity.name || '—'}</h4>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-lg p-3"><p className="text-[10px] text-blue-600 font-semibold uppercase">Person In Charge</p><p className="text-sm font-bold text-slate-800 mt-1">{detailActivity.pic || '—'}</p></div>
                <div className={`rounded-lg p-3 ${STATUS_STYLES[detailActivity.status].bg}`}><p className={`text-[10px] font-semibold uppercase ${STATUS_STYLES[detailActivity.status].text}`}>Status</p><p className={`text-sm font-bold mt-1 ${STATUS_STYLES[detailActivity.status].text}`}>{detailActivity.status}</p></div>
              </div>
              <div className="space-y-3">
                <h5 className="text-sm font-semibold text-slate-700">Schedule</h5>
                <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-xs"><span className="text-slate-500">Planned Start</span><span className="font-medium text-slate-800">{formatDate(detailActivity.plannedStart)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-slate-500">Planned End</span><span className="font-medium text-slate-800">{formatDate(detailActivity.plannedEnd)}</span></div>
                  <div className="border-t border-slate-200 my-2" />
                  <div className="flex justify-between text-xs"><span className="text-slate-500">Actual Start</span><span className="font-medium text-slate-800">{formatDate(detailActivity.actualStart)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-slate-500 flex items-center gap-1">Actual End <Lock size={10} className="text-slate-400" /></span><span className="font-medium text-slate-800">{detailActivity.approved ? formatDate(detailActivity.actualEnd) : 'Pending approval'}</span></div>
                  {detailActivity.approved && <div className="flex justify-between text-xs"><span className="text-slate-500">Approved By</span><span className="font-medium text-emerald-700">{detailActivity.approvedBy || 'Management'}</span></div>}
                  {calculateDelay(detailActivity) > 0 && (<><div className="border-t border-slate-200 my-2" /><div className="flex justify-between text-xs"><span className="text-red-600 font-semibold">Delay (past plan end)</span><span className="font-bold text-red-600">{calculateDelay(detailActivity)} days</span></div></>)}
                </div>
              </div>
              {detailActivity.remarks && (<div><h5 className="text-sm font-semibold text-slate-700 mb-2">Remarks</h5><p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3">{detailActivity.remarks}</p></div>)}
              <div className="pt-4 border-t border-slate-200 flex gap-2">
                <button onClick={async () => { if (await askConfirm({ title: 'Delete this activity?', message: 'This cannot be undone.' })) { removeActivity(detailActivity.id); setShowDetailPanel(false); } }} className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-medium rounded-lg"><Trash2 size={15} /> Delete</button>
                <button onClick={() => setShowDetailPanel(false)} className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex items-center gap-6 flex-wrap">
          <span className="text-xs font-semibold text-slate-500 uppercase">Legend:</span>
          <div className="flex items-center gap-2"><div className="w-6 h-3 rounded-sm" style={{ background: 'linear-gradient(135deg, #2563EB, #3B82F6)' }} /><span className="text-xs text-slate-700">Planned (Plan Start → Plan End)</span></div>
          <div className="flex items-center gap-2"><div className="w-6 h-3 rounded-sm" style={{ background: 'linear-gradient(135deg, #10B981, #34D399)' }} /><span className="text-xs text-slate-700">Actual (Act Start → Act End)</span></div>
          <div className="flex items-center gap-2"><div className="w-6 h-3 rounded-sm" style={{ background: 'linear-gradient(135deg, #EF4444, #F87171)' }} /><span className="text-xs text-slate-700">Overshoot past Plan End</span></div>
          <div className="flex items-center gap-2"><Lock size={13} className="text-slate-500" /><span className="text-xs text-slate-700">Act End set on Approvals page</span></div>
          <div className="flex items-center gap-2"><div className="w-0.5 h-4 bg-amber-500" /><span className="text-xs text-slate-700">Today</span></div>
        </div>
      </div>
    </div>
  );
}
