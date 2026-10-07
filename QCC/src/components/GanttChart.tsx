import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { Calendar as CalIcon, AlertTriangle, Info, X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────
export interface GanttActivity {
  id: string;
  serialNumber: number;
  activityName: string;
  pic: string;
  plannedStart: string;
  plannedEnd: string;
  actualStart: string;
  actualEnd: string;
  status: string;
  delayDays: number;
}

export type GanttViewMode = 'day' | 'week' | 'month';

interface GanttChartProps {
  activities: GanttActivity[];
  viewMode: GanttViewMode;
  highlightedRow: string | null;
  onRowHighlight: (id: string | null) => void;
  onBarClick: (activity: GanttActivity) => void;
  onDateChange?: (id: string, field: 'plannedStart' | 'plannedEnd' | 'actualStart' | 'actualEnd', newDate: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const parseDate = (s: string) => s ? new Date(s + 'T00:00:00') : null;
const formatDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

const STATUS_COLORS: Record<string, string> = {
  not_started: '#94a3b8',
  planning: '#60a5fa',
  in_progress: '#3b82f6',
  hold: '#f59e0b',
  delayed: '#ef4444',
  completed: '#059669',
};

// ─── Component ───────────────────────────────────────────
export default function GanttChart({ activities, viewMode, highlightedRow, onRowHighlight, onBarClick, onDateChange }: GanttChartProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ activity: GanttActivity; x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState<{ id: string; edge: 'start' | 'end'; type: 'planned' | 'actual'; startX: number; origDate: string } | null>(null);

  const today = useMemo(() => new Date(), []);

  // ── Timeline range ──
  const { timelineStart, timelineEnd, totalDays } = useMemo(() => {
    const allDates: Date[] = [];
    activities.forEach(a => {
      [a.plannedStart, a.plannedEnd, a.actualStart, a.actualEnd].forEach(d => {
        const parsed = parseDate(d);
        if (parsed) allDates.push(parsed);
      });
    });
    if (allDates.length === 0) {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const e = new Date(today.getFullYear(), today.getMonth() + 3, 0);
      return { timelineStart: s, timelineEnd: e, totalDays: daysBetween(s, e) + 1 };
    }
    const min = new Date(Math.min(...allDates.map(d => d.getTime())));
    const max = new Date(Math.max(...allDates.map(d => d.getTime())));
    const s = addDays(min, -7);
    const e = addDays(max, 14);
    return { timelineStart: s, timelineEnd: e, totalDays: daysBetween(s, e) + 1 };
  }, [activities, today]);

  // ── Column width per day ──
  const dayWidth = useMemo(() => {
    switch (viewMode) {
      case 'day': return 36;
      case 'week': return 14;
      case 'month': return 5;
    }
  }, [viewMode]);

  const totalWidth = totalDays * dayWidth;

  // ── Generate header columns ──
  const headerRows = useMemo(() => {
    if (viewMode === 'month') {
      const months: { label: string; width: number; offset: number }[] = [];
      let cursor = new Date(timelineStart);
      while (cursor <= timelineEnd) {
        const mStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
        const mEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
        const effStart = mStart < timelineStart ? timelineStart : mStart;
        const effEnd = mEnd > timelineEnd ? timelineEnd : mEnd;
        const days = daysBetween(effStart, effEnd) + 1;
        months.push({
          label: `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`,
          width: days * dayWidth,
          offset: daysBetween(timelineStart, effStart) * dayWidth,
        });
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }
      return { top: months, bottom: [] as typeof months };
    }

    if (viewMode === 'week') {
      const weeks: { label: string; width: number; offset: number }[] = [];
      const days: { label: string; width: number; offset: number; isWeekend: boolean }[] = [];
      let cursor = new Date(timelineStart);
      while (cursor <= timelineEnd) {
        const weekStart = new Date(cursor);
        const dow = cursor.getDay();
        const daysUntilSunday = 6 - dow;
        const weekEnd = addDays(cursor, Math.min(daysUntilSunday, daysBetween(cursor, timelineEnd)));
        const wDays = daysBetween(weekStart, weekEnd) + 1;
        weeks.push({
          label: `W${Math.ceil((weekStart.getDate()) / 7)} ${MONTH_NAMES[weekStart.getMonth()]}`,
          width: wDays * dayWidth,
          offset: daysBetween(timelineStart, weekStart) * dayWidth,
        });
        for (let d = 0; d < wDays; d++) {
          const day = addDays(weekStart, d);
          if (day > timelineEnd) break;
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;
          days.push({
            label: `${day.getDate()}`,
            width: dayWidth,
            offset: daysBetween(timelineStart, day) * dayWidth,
            isWeekend,
          });
        }
        cursor = addDays(weekEnd, 1);
      }
      return { top: weeks, bottom: days };
    }

    // Day view
    const months: { label: string; width: number; offset: number }[] = [];
    const days: { label: string; width: number; offset: number; isWeekend: boolean; dayName: string }[] = [];
    let mCursor = new Date(timelineStart);
    while (mCursor <= timelineEnd) {
      const mStart = new Date(mCursor.getFullYear(), mCursor.getMonth(), 1);
      const mEnd = new Date(mCursor.getFullYear(), mCursor.getMonth() + 1, 0);
      const effStart = mStart < timelineStart ? timelineStart : mStart;
      const effEnd = mEnd > timelineEnd ? timelineEnd : mEnd;
      const mDays = daysBetween(effStart, effEnd) + 1;
      months.push({
        label: `${MONTH_NAMES[mCursor.getMonth()]} ${mCursor.getFullYear()}`,
        width: mDays * dayWidth,
        offset: daysBetween(timelineStart, effStart) * dayWidth,
      });
      mCursor = new Date(mCursor.getFullYear(), mCursor.getMonth() + 1, 1);
    }
    let dCursor = new Date(timelineStart);
    while (dCursor <= timelineEnd) {
      const isWeekend = dCursor.getDay() === 0 || dCursor.getDay() === 6;
      days.push({
        label: `${dCursor.getDate()}`,
        width: dayWidth,
        offset: daysBetween(timelineStart, dCursor) * dayWidth,
        isWeekend,
        dayName: DAY_NAMES[dCursor.getDay()],
      });
      dCursor = addDays(dCursor, 1);
    }
    return { top: months, bottom: days as any[] };
  }, [viewMode, timelineStart, timelineEnd, dayWidth]);

  // ── Today line position ──
  const todayOffset = useMemo(() => {
    if (today < timelineStart || today > timelineEnd) return -1;
    return daysBetween(timelineStart, today) * dayWidth;
  }, [today, timelineStart, timelineEnd, dayWidth]);

  // ── Bar position calculator ──
  const getBarStyle = useCallback((startStr: string, endStr: string) => {
    const start = parseDate(startStr);
    const end = parseDate(endStr);
    if (!start || !end) return null;
    const left = daysBetween(timelineStart, start) * dayWidth;
    const width = Math.max((daysBetween(start, end) + 1) * dayWidth, dayWidth);
    return { left, width };
  }, [timelineStart, dayWidth]);

  // ── Mouse handlers for drag ──
  const handleMouseDown = useCallback((e: React.MouseEvent, activityId: string, edge: 'start' | 'end', type: 'planned' | 'actual', origDate: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging({ id: activityId, edge, type, startX: e.clientX, origDate });
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging || !onDateChange) return;
      const dx = e.clientX - dragging.startX;
      const daysDelta = Math.round(dx / dayWidth);
      if (daysDelta === 0) return;
      const orig = parseDate(dragging.origDate);
      if (!orig) return;
      const newDate = addDays(orig, daysDelta);
      const field = dragging.type === 'planned'
        ? (dragging.edge === 'start' ? 'plannedStart' : 'plannedEnd')
        : (dragging.edge === 'start' ? 'actualStart' : 'actualEnd');
      onDateChange(dragging.id, field as any, formatDate(newDate));
    };
    const handleMouseUp = () => setDragging(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, dayWidth, onDateChange]);

  // ── Scroll to today ──
  useEffect(() => {
    if (scrollRef.current && todayOffset > 0) {
      scrollRef.current.scrollLeft = Math.max(0, todayOffset - 300);
    }
  }, [todayOffset]);

  const ROW_HEIGHT = 44;
  const HEADER_HEIGHT = viewMode === 'day' ? 56 : 36;

  return (
    <div className="relative flex flex-col h-full" style={{ minHeight: activities.length * ROW_HEIGHT + HEADER_HEIGHT + 20 }}>
      {/* Timeline Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200" style={{ height: HEADER_HEIGHT }}>
        <div className="relative" style={{ width: totalWidth, height: '100%' }}>
          {/* Top row: months/weeks */}
          <div className="absolute top-0 left-0 right-0 flex" style={{ height: HEADER_HEIGHT / 2 }}>
            {headerRows.top.map((col, i) => (
              <div key={i} className="border-r border-slate-200 flex items-center justify-center text-[10px] font-semibold text-slate-700 bg-slate-50 overflow-hidden" style={{ width: col.width, position: 'absolute', left: col.offset }}>
                {col.label}
              </div>
            ))}
          </div>
          {/* Bottom row: days/weeks */}
          {headerRows.bottom.length > 0 && (
            <div className="absolute left-0 right-0 flex" style={{ top: HEADER_HEIGHT / 2, height: HEADER_HEIGHT / 2 }}>
              {headerRows.bottom.map((col: any, i: number) => (
                <div key={i} className={`border-r flex flex-col items-center justify-center text-[9px] overflow-hidden ${col.isWeekend ? 'bg-amber-50/60 border-amber-100' : 'border-slate-100 bg-white'}`} style={{ width: col.width, position: 'absolute', left: col.offset }}>
                  {viewMode === 'day' && <span className="text-[8px] text-slate-400 leading-none">{col.dayName?.[0]}</span>}
                  <span className={`leading-none font-medium ${col.isWeekend ? 'text-amber-600' : 'text-slate-600'}`}>{col.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Scrollable body */}
      <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-auto" style={{ scrollBehavior: 'smooth' }}>
        <div className="relative" style={{ width: totalWidth, minHeight: activities.length * ROW_HEIGHT }}>
          {/* Grid lines */}
          {activities.map((_, i) => (
            <div key={i} className="absolute left-0 right-0 border-b border-slate-100" style={{ top: i * ROW_HEIGHT, height: ROW_HEIGHT }} />
          ))}

          {/* Weekend columns (day view) */}
          {viewMode === 'day' && headerRows.bottom.map((col: any, i: number) =>
            col.isWeekend ? (
              <div key={`we-${i}`} className="absolute top-0 bottom-0 bg-amber-50/30" style={{ left: col.offset, width: col.width }} />
            ) : null
          )}

          {/* Today line */}
          {todayOffset >= 0 && (
            <div className="absolute top-0 bottom-0 z-10 pointer-events-none" style={{ left: todayOffset }}>
              <div className="w-0.5 h-full bg-amber-500 opacity-80" />
              <div className="absolute -top-0 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-amber-500 text-white text-[8px] font-bold rounded-b whitespace-nowrap">
                TODAY
              </div>
            </div>
          )}

          {/* Activity bars */}
          {activities.map((activity, idx) => {
            const planned = getBarStyle(activity.plannedStart, activity.plannedEnd);
            const actual = getBarStyle(activity.actualStart, activity.actualEnd);
            const isHighlighted = highlightedRow === activity.id;
            const isDelayed = activity.delayDays > 0;
            const barY = idx * ROW_HEIGHT + 6;
            const barH = 14;
            const actualBarH = 14;

            // Delay bar: portion of actual that exceeds planned
            let delayBar = null;
            if (isDelayed && actual && planned && activity.actualEnd && activity.plannedEnd) {
              const plannedEndDate = parseDate(activity.plannedEnd)!;
              const actualEndDate = parseDate(activity.actualEnd)!;
              const delayStart = daysBetween(timelineStart, plannedEndDate) * dayWidth + dayWidth;
              const delayWidth = daysBetween(plannedEndDate, actualEndDate) * dayWidth;
              delayBar = { left: delayStart, width: Math.max(delayWidth, dayWidth) };
            }

            return (
              <div key={activity.id}>
                {/* Planned bar (blue) */}
                {planned && (
                  <div
                    className={`absolute rounded cursor-pointer transition-shadow ${isHighlighted ? 'shadow-lg ring-2 ring-blue-400' : 'hover:shadow-md'}`}
                    style={{
                      left: planned.left,
                      top: barY,
                      width: planned.width,
                      height: barH,
                      backgroundColor: '#2563EB',
                      opacity: 0.35,
                      zIndex: 5,
                    }}
                    onMouseEnter={(e) => setTooltip({ activity, x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setTooltip(null)}
                    onClick={() => onBarClick(activity)}
                  >
                    {/* Drag handle: start */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-800/30 rounded-l"
                      onMouseDown={(e) => handleMouseDown(e, activity.id, 'start', 'planned', activity.plannedStart)}
                    />
                    {/* Drag handle: end */}
                    <div
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-800/30 rounded-r"
                      onMouseDown={(e) => handleMouseDown(e, activity.id, 'end', 'planned', activity.plannedEnd)}
                    />
                  </div>
                )}

                {/* Actual bar (green) */}
                {actual && (
                  <div
                    className={`absolute rounded cursor-pointer transition-shadow ${isHighlighted ? 'shadow-lg ring-2 ring-emerald-400' : 'hover:shadow-md'}`}
                    style={{
                      left: actual.left,
                      top: barY + barH + 2,
                      width: actual.width,
                      height: actualBarH,
                      backgroundColor: isDelayed ? '#059669' : '#10B981',
                      zIndex: 6,
                    }}
                    onMouseEnter={(e) => setTooltip({ activity, x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setTooltip(null)}
                    onClick={() => onBarClick(activity)}
                  >
                    {/* Progress fill */}
                    <div className="absolute inset-0 rounded overflow-hidden">
                      <div
                        className="h-full opacity-40 bg-white"
                        style={{ width: `${activity.status === 'completed' ? 100 : activity.status === 'in_progress' ? 50 : 0}%` }}
                      />
                    </div>
                    {/* Drag handle: start */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-emerald-800/30 rounded-l"
                      onMouseDown={(e) => handleMouseDown(e, activity.id, 'start', 'actual', activity.actualStart)}
                    />
                    {/* Drag handle: end */}
                    <div
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-emerald-800/30 rounded-r"
                      onMouseDown={(e) => handleMouseDown(e, activity.id, 'end', 'actual', activity.actualEnd)}
                    />
                  </div>
                )}

                {/* Delay bar (red overlay) */}
                {delayBar && (
                  <div
                    className="absolute rounded-r pointer-events-none"
                    style={{
                      left: delayBar.left,
                      top: barY + barH + 2,
                      width: delayBar.width,
                      height: actualBarH,
                      backgroundColor: '#EF4444',
                      opacity: 0.7,
                      zIndex: 7,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-[200] pointer-events-none"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          <div className="bg-slate-900 text-white rounded-lg shadow-2xl px-4 py-3 text-xs max-w-xs">
            <p className="font-bold text-sm mb-1.5">{tooltip.activity.activityName}</p>
            <div className="space-y-1 text-slate-300">
              <div className="flex justify-between gap-4">
                <span>PIC:</span>
                <span className="font-medium text-white">{tooltip.activity.pic || '—'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>Planned:</span>
                <span className="font-medium text-blue-300">{tooltip.activity.plannedStart || '—'} → {tooltip.activity.plannedEnd || '—'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>Actual:</span>
                <span className="font-medium text-emerald-300">{tooltip.activity.actualStart || '—'} → {tooltip.activity.actualEnd || '—'}</span>
              </div>
              {tooltip.activity.delayDays > 0 && (
                <div className="flex justify-between gap-4 pt-1 border-t border-slate-700">
                  <span className="text-red-400 font-semibold">Delay:</span>
                  <span className="text-red-300 font-bold">{tooltip.activity.delayDays} days</span>
                </div>
              )}
              <div className="flex justify-between gap-4 pt-1 border-t border-slate-700">
                <span>Status:</span>
                <span className="font-medium capitalize text-white">{tooltip.activity.status.replace('_', ' ')}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
