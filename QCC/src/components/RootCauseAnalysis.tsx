import { useState, useEffect } from 'react';
import { Plus, Edit2, X, Check } from 'lucide-react';
import FishboneDiagram from './FishboneDiagram';
import { useConfirm } from './ConfirmDialog';

type Category = 'Man' | 'Machine' | 'Method' | 'Material' | 'Measurement' | 'Environment';

interface Cause {
  id: string;
  category: Category;
  text: string;
  createdAt: string;
}

const CATEGORIES: Category[] = ['Man', 'Machine', 'Method', 'Material', 'Measurement', 'Environment'];

const CATEGORY_COLORS: Record<Category, string> = {
  Man: '#3b82f6',
  Machine: '#10b981',
  Method: '#f59e0b',
  Material: '#8b5cf6',
  Measurement: '#ef4444',
  Environment: '#06b6d4',
};

const INITIAL_CAUSES: Cause[] = [
  { id: '1', category: 'Man', text: 'Operator skill gap', createdAt: '2024-03-15' },
  { id: '3', category: 'Machine', text: 'Nozzle blockage', createdAt: '2024-03-15' },
  { id: '5', category: 'Method', text: 'No standard setting procedure', createdAt: '2024-03-15' },
  { id: '7', category: 'Material', text: 'Solder paste viscosity variation', createdAt: '2024-03-15' },
  { id: '9', category: 'Measurement', text: 'Gauge not calibrated', createdAt: '2024-03-15' },
  { id: '11', category: 'Environment', text: 'Temperature variation', createdAt: '2024-03-15' },
];

export default function RootCauseAnalysis({ projectId }: { projectId?: string }) {
  // Persist the fishbone per project so the Final Report (Step 9) can render it.
  const STORAGE_KEY = projectId ? `qcc-fishbone-${projectId}` : '';
  const seed = (() => {
    if (!STORAGE_KEY) return null;
    try { const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); return s && Array.isArray(s.causes) ? s : null; } catch { return null; }
  })();

  const [problemStatement, setProblemStatement] = useState(seed?.problemStatement || 'Inconsistent solder paste application volume');
  const [isEditingProblem, setIsEditingProblem] = useState(false);
  const [tempProblemText, setTempProblemText] = useState('');
  const [causes, setCauses] = useState<Cause[]>(seed?.causes ?? INITIAL_CAUSES);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<Category>('Man');
  const [newCauseText, setNewCauseText] = useState('');
  const askConfirm = useConfirm();

  // Save the fishbone (problem + causes) so the downloaded Final Report can chart it.
  useEffect(() => {
    if (!STORAGE_KEY) return;
    const t = setTimeout(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ problemStatement, causes })); } catch { /* ignore */ } }, 400);
    return () => clearTimeout(t);
  }, [STORAGE_KEY, problemStatement, causes]);

  const addCause = () => {
    if (!newCauseText.trim()) return;
    const id = Date.now().toString();
    setCauses([...causes, {
      id,
      category: selectedCategory,
      text: newCauseText.trim(),
      createdAt: new Date().toISOString().split('T')[0],
    }]);
    setSelected(prev => { const n = new Set(prev); n.add(id); return n; }); // a newly added problem starts selected
    setNewCauseText('');
  };

  const editCause = (id: string, text: string) =>
    setCauses(causes.map(c => c.id === id ? { ...c, text } : c));

  // Delete a cause (bone) — asks for confirmation, then also drops it from selection.
  const deleteCause = async (id: string) => {
    const c = causes.find(x => x.id === id);
    if (!(await askConfirm({ title: 'Delete this cause?', message: c ? `“${c.text}” will be removed from the fishbone.` : 'This cause will be removed from the fishbone.' }))) return;
    setCauses(prev => prev.filter(x => x.id !== id));
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  // Select / unselect a problem — this only affects the numbered list, never the chart.
  const toggleSelect = (id: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Problems currently selected, in selection order.
  const selectedList = [...selected].map(id => causes.find(c => c.id === id)).filter((c): c is Cause => !!c);
  const numberOf = new Map<string, number>();
  selectedList.forEach((c, i) => numberOf.set(c.id, i + 1));

  const startEditProblem = () => { setTempProblemText(problemStatement); setIsEditingProblem(true); };
  const saveProblemStatement = () => { if (tempProblemText.trim()) setProblemStatement(tempProblemText.trim()); setIsEditingProblem(false); };
  const cancelEditProblem = () => { setIsEditingProblem(false); setTempProblemText(''); };

  return (
    <div className="space-y-4">
      {/* Problem Statement */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h2 className="text-sm font-bold text-slate-800">Problem Statement</h2>
          {!isEditingProblem ? (
            <button onClick={startEditProblem} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors flex-shrink-0"><Edit2 size={15} /></button>
          ) : (
            <div className="flex gap-1 flex-shrink-0">
              <button onClick={saveProblemStatement} className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600"><Check size={15} /></button>
              <button onClick={cancelEditProblem} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600"><X size={15} /></button>
            </div>
          )}
        </div>
        {isEditingProblem ? (
          <textarea
            value={tempProblemText}
            onChange={(e) => setTempProblemText(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            rows={2}
            autoFocus
          />
        ) : (
          <p className="text-sm text-slate-700 bg-slate-50 px-4 py-2.5 rounded-lg">{problemStatement}</p>
        )}
      </div>

      {/* Fishbone Diagram — editable */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <h2 className="text-sm font-bold text-slate-800 mb-3">Fishbone (Ishikawa) Diagram</h2>
        <FishboneDiagram
          causes={causes.map(c => ({ id: c.id, category: c.category, text: c.text, number: numberOf.get(c.id) }))}
          problemStatement={problemStatement}
          onEditCause={editCause}
          onDeleteCause={deleteCause}
          onToggleSelect={toggleSelect}
        />
      </div>

      {/* Add Problem — compact: category chips inline with the title, then one input row */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-800 mb-2.5">Add Problem</h3>
        <div className="flex gap-2 flex-wrap sm:flex-nowrap">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value as Category)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-semibold bg-white outline-none focus:ring-2 focus:ring-blue-500 flex-shrink-0"
            style={{ color: CATEGORY_COLORS[selectedCategory] }}
            title="Category (4M / Environment)"
          >
            {CATEGORIES.map(cat => <option key={cat} value={cat} style={{ color: '#334155' }}>{cat}</option>)}
          </select>
          <input
            type="text"
            value={newCauseText}
            onChange={(e) => setNewCauseText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCause()}
            placeholder={`Problem under ${selectedCategory}…`}
            className="flex-1 min-w-0 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <button
            onClick={addCause}
            disabled={!newCauseText.trim()}
            className="px-4 py-2 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-1.5 disabled:bg-slate-300 flex-shrink-0"
            style={!newCauseText.trim() ? undefined : { background: CATEGORY_COLORS[selectedCategory] }}
          >
            <Plus size={15} /> Add
          </button>
        </div>
        <p className="text-[11px] text-slate-400 mt-1.5">Becomes <span className="font-medium text-slate-600">Problem {selected.size + 1}</span> on “{selectedCategory}”, or click the <span className="font-medium text-slate-600">+</span> on any bone.</p>
      </div>

      {/* Selected Problems — compact chips */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <h3 className="text-sm font-semibold text-slate-800">Selected Problems <span className="text-slate-400 font-normal">({selectedList.length})</span></h3>
          <span className="text-[11px] text-slate-400">✕ only unselects</span>
        </div>
        {selectedList.length === 0 ? (
          <p className="text-xs text-slate-400">Nothing selected yet — click the <span className="font-medium text-slate-600">+</span> on a bone (or add a problem).</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {selectedList.map((c, i) => (
              <div key={c.id} className="inline-flex items-center gap-2 pl-1.5 pr-1 py-1 rounded-full border" style={{ borderColor: `${CATEGORY_COLORS[c.category]}55`, background: `${CATEGORY_COLORS[c.category]}0f` }} title={`${c.category}: ${c.text}`}>
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ background: CATEGORY_COLORS[c.category] }}>{i + 1}</span>
                <span className="text-[13px] text-slate-700 max-w-[220px] truncate"><span className="font-semibold" style={{ color: CATEGORY_COLORS[c.category] }}>{c.category}:</span> {c.text}</span>
                <button onClick={() => toggleSelect(c.id)} title="Unselect (keeps it on the chart)" className="p-0.5 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-100 transition-colors flex-shrink-0"><X size={13} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
