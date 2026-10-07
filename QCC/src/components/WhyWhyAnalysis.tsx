import { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Save,
  Send,
  Printer,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertCircle,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Info,
  Download,
} from 'lucide-react';
import { useConfirm } from './ConfirmDialog';

interface WhyLevel {
  id: string;
  text: string;
}

interface CauseRow {
  id: string;
  cause: string;
  whyLevels: {
    why1: WhyLevel[];
    why2: WhyLevel[];
    why3: WhyLevel[];
    why4: WhyLevel[];
    why5: WhyLevel[];
  };
  rootCause: string;
  countermeasure: string;
  status: 'draft' | 'in_progress' | 'completed' | 'approved';
  verification: {
    factVerified: boolean;
    dataAvailable: boolean;
    canExplain: boolean;
    actionable: boolean;
  };
}

const INITIAL_DATA: CauseRow[] = [
  {
    id: '1',
    cause: 'Operator skill gap',
    // Only Why 1 exists up front — deeper levels appear as the user clicks "Add Why".
    whyLevels: {
      why1: [{ id: 'w1-1', text: 'Operators lack proper training on new equipment' }],
      why2: [],
      why3: [],
      why4: [],
      why5: [],
    },
    rootCause: 'Absence of structured training needs assessment process',
    countermeasure: 'Implement quarterly skill gap analysis and update training curriculum',
    status: 'in_progress',
    verification: {
      factVerified: true,
      dataAvailable: false,
      canExplain: true,
      actionable: true,
    },
  },
];

export default function WhyWhyAnalysis({ projectId }: { projectId?: string }) {
  const storageKey = `qcc-whywhy-${projectId || 'default'}`;
  const [rows, setRows] = useState<CauseRow[]>(() => {
    try { const s = localStorage.getItem(storageKey); if (s) return JSON.parse(s); } catch { /* default */ }
    return INITIAL_DATA;
  });
  const [collapsed, setCollapsed] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const askConfirm = useConfirm();
  // Accordion: which cause cards are expanded (first one open by default).
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set(rows.slice(0, 1).map(r => r.id)));
  const toggleRow = (id: string) => setExpandedRows(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Persist Why-Why state and publish identified root causes so Step 5
  // (Countermeasure Study) can auto-import them.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(rows));
        const rcs = [...new Set(rows.map(r => r.rootCause.trim()).filter(Boolean))];
        localStorage.setItem(`qcc-step4-rootcauses-${projectId || 'default'}`, JSON.stringify(rcs));
      } catch { /* quota */ }
    }, 500);
    return () => clearTimeout(t);
  }, [rows, storageKey, projectId]);

  const addCause = () => {
    const newRow: CauseRow = {
      id: Date.now().toString(),
      cause: '',
      // Start with an empty Why 1 box ready to type in; Why 2+ appear via "Add Why".
      whyLevels: {
        why1: [{ id: `${Date.now()}-w1`, text: '' }],
        why2: [],
        why3: [],
        why4: [],
        why5: [],
      },
      rootCause: '',
      countermeasure: '',
      status: 'draft',
      verification: {
        factVerified: false,
        dataAvailable: false,
        canExplain: false,
        actionable: false,
      },
    };
    setRows([...rows, newRow]);
    setExpandedRows(prev => new Set(prev).add(newRow.id));
  };

  const removeCause = (id: string) => {
    setRows(rows.filter(r => r.id !== id));
    setExpandedRows(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  const updateCause = (id: string, cause: string) => {
    setRows(rows.map(r => (r.id === id ? { ...r, cause } : r)));
  };

  const addWhy = (id: string, level: keyof CauseRow['whyLevels']) => {
    setRows(
      rows.map(r => {
        if (r.id !== id) return r;
        const newWhy: WhyLevel = { id: Date.now().toString(), text: '' };
        return {
          ...r,
          whyLevels: {
            ...r.whyLevels,
            [level]: [...r.whyLevels[level], newWhy],
          },
        };
      })
    );
  };

  const updateWhy = (
    rowId: string,
    level: keyof CauseRow['whyLevels'],
    whyId: string,
    text: string
  ) => {
    setRows(
      rows.map(r => {
        if (r.id !== rowId) return r;
        return {
          ...r,
          whyLevels: {
            ...r.whyLevels,
            [level]: r.whyLevels[level].map(w => (w.id === whyId ? { ...w, text } : w)),
          },
        };
      })
    );
  };

  const removeWhy = (rowId: string, level: keyof CauseRow['whyLevels'], whyId: string) => {
    setRows(
      rows.map(r => {
        if (r.id !== rowId) return r;
        return {
          ...r,
          whyLevels: {
            ...r.whyLevels,
            [level]: r.whyLevels[level].filter(w => w.id !== whyId),
          },
        };
      })
    );
  };

  const updateRootCause = (id: string, rootCause: string) => {
    setRows(rows.map(r => (r.id === id ? { ...r, rootCause } : r)));
  };

  // Status is derived from how complete the cause's analysis is — no manual selection.
  const autoStatus = (row: CauseRow): CauseRow['status'] => {
    const v = row.verification;
    const verifiedAll = v.factVerified && v.dataAvailable && v.canExplain && v.actionable;
    const hasRoot = row.rootCause.trim() !== '';
    const hasCM = row.countermeasure.trim() !== '';
    const started = row.whyLevels.why1.some(w => w.text.trim() !== '');
    if (hasRoot && hasCM && verifiedAll) return 'approved';
    if (hasRoot && hasCM) return 'completed';
    if (started || hasRoot) return 'in_progress';
    return 'draft';
  };

  const toggleVerification = (
    id: string,
    key: keyof CauseRow['verification']
  ) => {
    setRows(
      rows.map(r => {
        if (r.id !== id) return r;
        return {
          ...r,
          verification: {
            ...r.verification,
            [key]: !r.verification[key],
          },
        };
      })
    );
  };

  const handleSaveDraft = () => {
    alert('Draft saved');
  };

  const handleSubmit = () => {
    const incomplete = rows.filter(r => !r.rootCause);
    if (incomplete.length > 0) {
      alert('Complete all fields first');
      return;
    }
    alert('Submitted for review');
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = () => {
    alert('Exporting to PDF...');
  };

  const handleExportExcel = () => {
    alert('Exporting to Excel...');
  };

  const handleExportCSV = () => {
    alert('Exporting to CSV...');
  };

  const getStatusColor = (status: CauseRow['status']) => {
    switch (status) {
      case 'draft':
        return 'bg-slate-100 text-slate-700';
      case 'in_progress':
        return 'bg-blue-100 text-blue-700';
      case 'completed':
        return 'bg-emerald-100 text-emerald-700';
      case 'approved':
        return 'bg-purple-100 text-purple-700';
    }
  };

  const getStatusLabel = (status: CauseRow['status']) => {
    switch (status) {
      case 'draft':
        return 'Draft';
      case 'in_progress':
        return 'In Progress';
      case 'completed':
        return 'Completed';
      case 'approved':
        return 'Approved';
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-3.5 sticky top-0 z-10">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
              <Lightbulb size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">Why-Why Analysis</h2>
              <p className="text-[11px] text-blue-100">5-level root cause investigation</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={handlePrint} title="Print" className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors"><Printer size={16} /></button>
            <div className="relative">
              <button onClick={() => setExportOpen(o => !o)} title="Export" className="flex items-center gap-0.5 px-2 py-2 rounded-lg hover:bg-white/10 text-white transition-colors"><Download size={16} /><ChevronDown size={12} className={`transition-transform ${exportOpen ? 'rotate-180' : ''}`} /></button>
              {exportOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
                  <div className="absolute right-0 mt-2 w-40 py-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 overflow-hidden">
                    <button onClick={() => { setExportOpen(false); handleExportExcel(); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><FileSpreadsheet size={15} className="text-emerald-600" /> Excel</button>
                    <button onClick={() => { setExportOpen(false); handleExportPDF(); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><FileText size={15} className="text-red-600" /> PDF</button>
                    <button onClick={() => { setExportOpen(false); handleExportCSV(); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><Download size={15} className="text-blue-600" /> CSV</button>
                  </div>
                </>
              )}
            </div>
            <button onClick={() => setCollapsed(!collapsed)} className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors">
              {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
            </button>
          </div>
        </div>
      </div>

      {!collapsed && (
        <div className="p-4 space-y-3">
            {rows.map((row, rowIndex) => {
              const isOpen = expandedRows.has(row.id);
              const whyCount = (['why1','why2','why3','why4','why5'] as const).filter(l => row.whyLevels[l].some(w => w.text.trim())).length;
              return (
              <div
                key={row.id}
                className="border border-slate-200 rounded-xl overflow-hidden bg-white"
              >
                {/* Accordion header — click to expand/collapse */}
                <button type="button" onClick={() => toggleRow(row.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${isOpen ? 'bg-blue-50/60' : 'bg-slate-50 hover:bg-slate-100'}`}>
                  {isOpen ? <ChevronUp size={16} className="text-slate-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-slate-400 flex-shrink-0" />}
                  <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{rowIndex + 1}</span>
                  <span className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-slate-800 truncate block">{row.cause.trim() || `Cause ${rowIndex + 1}`}</span>
                    <span className="text-[11px] text-slate-400">{whyCount}/5 whys{row.rootCause.trim() ? ' · root cause set' : ''}</span>
                  </span>
                  {row.rootCause.trim() && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0">Root cause ✓</span>}
                  <span onClick={async e => { e.stopPropagation(); if (await askConfirm({ title: 'Remove this cause?', message: 'This cause and all its Why levels will be removed.', confirmText: 'Delete' })) removeCause(row.id); }} title="Remove cause" className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 flex-shrink-0"><Trash2 size={15} /></span>
                </button>

                {/* Accordion body */}
                {isOpen && (
                <div className="p-4 space-y-4 border-t border-slate-100">
                  {/* Cause Input */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Cause
                    </label>
                    <input
                      type="text"
                      value={row.cause}
                      onChange={e => updateCause(row.id, e.target.value)}
                      placeholder="Enter the cause or problem..."
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>

                  {/* Why Levels — progressive: only the levels reached so far are shown.
                      A single "Add Why" button sits at the bottom-right under the last box
                      and reveals the next level when clicked. */}
                  {(() => {
                    const LEVELS = ['why1', 'why2', 'why3', 'why4', 'why5'] as const;
                    // Highest level that already has an entry (Why 1 is always visible).
                    const lastFilledIdx = LEVELS.reduce(
                      (acc, l, i) => (row.whyLevels[l].length > 0 ? i : acc), -1,
                    );
                    const visibleCount = Math.max(1, lastFilledIdx + 1);
                    const lastLevel = LEVELS[visibleCount - 1];
                    // Fill the current level if it's still empty, else open the next one.
                    const targetLevel =
                      row.whyLevels[lastLevel].length === 0
                        ? lastLevel
                        : visibleCount < LEVELS.length
                          ? LEVELS[visibleCount]
                          : null;

                    return (
                      <>
                        {LEVELS.slice(0, visibleCount).map((level, i) => {
                          const levelNum = i + 1;
                          const previousAnswer = i === 0 ? '' : (row.whyLevels[LEVELS[i - 1]][0]?.text || '');

                          return (
                            <div key={level} className="space-y-2">
                              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                                Why {levelNum}
                                <span className="text-xs font-normal text-slate-500">
                                  (Ask "Why did this happen?")
                                </span>
                              </label>

                              {row.whyLevels[level].length === 0 ? (
                                <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-500">
                                  <Info size={16} />
                                  <span>Click "Add Why" below to begin the analysis.</span>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {row.whyLevels[level].map(why => (
                                    <div key={why.id} className="flex gap-2">
                                      <div className="flex-1 relative">
                                        <textarea
                                          value={why.text}
                                          onChange={e =>
                                            updateWhy(row.id, level, why.id, e.target.value)
                                          }
                                          placeholder={
                                            previousAnswer
                                              ? `Based on: "${previousAnswer.substring(0, 50)}..."`
                                              : 'Enter your analysis...'
                                          }
                                          spellCheck
                                          className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                                          rows={2}
                                        />
                                        <div className="absolute bottom-2 right-3 text-xs text-slate-400">
                                          {why.text.length} chars
                                        </div>
                                      </div>
                                      <button
                                        onClick={async () => { if (await askConfirm({ title: "Remove this 'Why'?", message: 'This Why entry will be removed.', confirmText: 'Delete' })) removeWhy(row.id, level, why.id); }}
                                        className="p-2 rounded-lg hover:bg-red-50 text-red-600 transition-colors self-start"
                                        title="Remove"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* One "Add Why" button, bottom-right under the last box */}
                        {targetLevel ? (
                          <div className="flex justify-end">
                            <button
                              onClick={() => addWhy(row.id, targetLevel)}
                              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors"
                            >
                              <Plus size={14} />
                              Add Why
                            </button>
                          </div>
                        ) : (
                          <p className="text-right text-[11px] text-slate-400">
                            All 5 levels added — analysis complete.
                          </p>
                        )}
                      </>
                    );
                  })()}

                  {/* Root Cause */}
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <label className="flex items-center gap-2 text-sm font-semibold text-amber-900 mb-2">
                      Root Cause
                      <span className="text-xs font-normal text-amber-700">
                        (Required - The fundamental reason)
                      </span>
                    </label>
                    <textarea
                      value={row.rootCause}
                      onChange={e => updateRootCause(row.id, e.target.value)}
                      placeholder="Identify the root cause after completing the Why analysis..."
                      className="w-full px-4 py-2.5 border border-amber-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none bg-white"
                      rows={3}
                    />
                    {!row.rootCause && (
                      <div className="flex items-center gap-2 mt-2 text-xs text-amber-700">
                        <AlertCircle size={14} />
                        <span>Root cause is required before submission</span>
                      </div>
                    )}
                  </div>

                  {/* Verification Checklist */}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                    <label className="block text-sm font-semibold text-slate-700 mb-3">
                      Root Cause Verification
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {(
                        [
                          { key: 'factVerified', label: 'Fact Verified' },
                          { key: 'dataAvailable', label: 'Data Available' },
                          { key: 'canExplain', label: 'Can Explain Problem' },
                          { key: 'actionable', label: 'Actionable' },
                        ] as const
                      ).map(({ key, label }) => (
                        <label
                          key={key}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={row.verification[key]}
                            onChange={() => toggleVerification(row.id, key)}
                            className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                          />
                          <span className="text-sm text-slate-700">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                </div>
                )}
              </div>
              );
            })}

            {/* Add Cause Button */}
            <button
              onClick={addCause}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            >
              <Plus size={18} />
              Add New Cause
            </button>
        </div>
      )}
    </div>
  );
}
