// ─── Step Document Register ───────────────────────────────────────────────
// Company-grade document control for a QCC workflow step: upload with a drag-&-drop
// dialog + document metadata (category, reference no., description), an audit trail
// (uploaded-by / date / revision), and a searchable, filterable register table.
// Files are kept in localStorage per project+step (small files keep a data URL so
// they can be re-opened; large ones store metadata only).
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  FileText, Image as ImageIcon, FileSpreadsheet, Presentation, File as FileIcon,
  Plus, Trash2, FolderOpen, ExternalLink, Search, X, UploadCloud, ListChecks,
} from 'lucide-react';
import { useConfirm } from './ConfirmDialog';
import { useAuth } from '../lib/auth';

type DocKind = 'pdf' | 'image' | 'excel' | 'ppt' | 'word' | 'other';

interface DocItem {
  id: string;
  name: string;
  kind: DocKind;
  size: number;
  addedAt: string;
  uploadedBy: string;
  category: string;
  refNo?: string;
  description?: string;
  version: number;
  dataUrl?: string;
}

// Document categories a company quality project would file against.
const CATEGORIES = [
  'SOP / Standard', 'Work Instruction', 'Evidence / Photo', 'Data / Analysis',
  'Report', 'Drawing / Layout', 'Checklist', 'Other',
] as const;

const KIND_META: Record<DocKind, { label: string; icon: typeof FileText; color: string; bg: string }> = {
  pdf:   { label: 'PDF',        icon: FileText,        color: 'text-red-600',     bg: 'bg-red-50' },
  image: { label: 'Image',      icon: ImageIcon,       color: 'text-blue-600',    bg: 'bg-blue-50' },
  excel: { label: 'Excel',      icon: FileSpreadsheet, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ppt:   { label: 'PowerPoint', icon: Presentation,    color: 'text-orange-600',  bg: 'bg-orange-50' },
  word:  { label: 'Word',       icon: FileText,        color: 'text-sky-600',     bg: 'bg-sky-50' },
  other: { label: 'File',       icon: FileIcon,        color: 'text-slate-500',   bg: 'bg-slate-100' },
};

const CAT_BADGE: Record<string, string> = {
  'SOP / Standard':   'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Work Instruction': 'bg-blue-50 text-blue-700 border-blue-200',
  'Evidence / Photo': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Data / Analysis':  'bg-violet-50 text-violet-700 border-violet-200',
  'Report':           'bg-amber-50 text-amber-700 border-amber-200',
  'Drawing / Layout': 'bg-cyan-50 text-cyan-700 border-cyan-200',
  'Checklist':        'bg-rose-50 text-rose-700 border-rose-200',
  'Other':            'bg-slate-100 text-slate-600 border-slate-200',
};

// Accepted upload formats (broad, but still the office set a quality project uses).
const ACCEPT = '.pdf,image/*,.xls,.xlsx,.csv,.ppt,.pptx,.doc,.docx';
const MAX_INLINE = 1.5 * 1024 * 1024;   // keep a re-openable data URL only under 1.5 MB

const fmtSize = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
const fmtDate = (s: string) => { const d = new Date(s); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); };

function detectKind(name: string, type: string): DocKind {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (type.includes('pdf') || ext === 'pdf') return 'pdf';
  if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'heic'].includes(ext)) return 'image';
  if (type.includes('sheet') || type.includes('excel') || type.includes('csv') || ['xls', 'xlsx', 'csv'].includes(ext)) return 'excel';
  if (type.includes('presentation') || type.includes('powerpoint') || ['ppt', 'pptx'].includes(ext)) return 'ppt';
  if (type.includes('word') || ['doc', 'docx'].includes(ext)) return 'word';
  return 'other';
}

// Normalise older/simpler records so metadata columns always render.
function normalise(raw: any): DocItem {
  return {
    id: raw.id, name: raw.name, kind: raw.kind || 'other', size: raw.size || 0,
    addedAt: raw.addedAt || new Date().toISOString(), uploadedBy: raw.uploadedBy || '—',
    category: raw.category || 'Other', refNo: raw.refNo, description: raw.description,
    version: raw.version || 1, dataUrl: raw.dataUrl,
  };
}

function load(key: string): DocItem[] {
  try { const raw = localStorage.getItem(key); if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) return p.map(normalise); } } catch { /* ignore */ }
  return [];
}

let _uid = 0;
const nid = () => `doc-${Date.now().toString(36)}-${_uid++}`;

export default function StepDocuments({ storageKey, disabled = false, recommended = [] }: { storageKey: string; disabled?: boolean; recommended?: string[] }) {
  const askConfirm = useConfirm();
  const { user } = useAuth();
  const [docs, setDocs] = useState<DocItem[]>(() => load(storageKey));
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');

  // Upload dialog state.
  const [showUpload, setShowUpload] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [refNo, setRefNo] = useState('');
  const [description, setDescription] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDocs(load(storageKey)); }, [storageKey]);

  const persist = (next: DocItem[]) => {
    setDocs(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* quota — state still holds it */ }
  };

  const openUpload = () => { setFile(null); setCategory(CATEGORIES[0]); setRefNo(''); setDescription(''); setDragActive(false); setShowUpload(true); };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  };

  const save = () => {
    if (!file) return;
    const kind = detectKind(file.name, file.type);
    const version = docs.filter(d => d.name === file.name && d.category === category).length + 1;
    const base: DocItem = {
      id: nid(), name: file.name, kind, size: file.size, addedAt: new Date().toISOString(),
      uploadedBy: user?.name || 'You', category, refNo: refNo.trim() || undefined,
      description: description.trim() || undefined, version,
    };
    const done = (item: DocItem) => { persist([item, ...docs]); setShowUpload(false); };
    if (file.size <= MAX_INLINE) {
      const reader = new FileReader();
      reader.onload = () => done({ ...base, dataUrl: typeof reader.result === 'string' ? reader.result : undefined });
      reader.onerror = () => done(base);
      reader.readAsDataURL(file);
    } else {
      done(base);
    }
  };

  const removeDoc = async (d: DocItem) => {
    if (await askConfirm({ title: 'Delete this document?', message: `“${d.name}” will be removed from the register.` })) {
      persist(docs.filter(x => x.id !== d.id));
    }
  };

  const totalSize = useMemo(() => docs.reduce((s, d) => s + d.size, 0), [docs]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter(d =>
      (catFilter === 'all' || d.category === catFilter) &&
      (!q || d.name.toLowerCase().includes(q) || (d.refNo || '').toLowerCase().includes(q) || d.category.toLowerCase().includes(q) || d.uploadedBy.toLowerCase().includes(q)));
  }, [docs, search, catFilter]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm"><FolderOpen size={17} /></span>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Document Register</h3>
            <p className="text-[11px] text-slate-500">{docs.length} document{docs.length === 1 ? '' : 's'}{docs.length > 0 && ` · ${fmtSize(totalSize)}`} · attached to this step</p>
          </div>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={openUpload}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg shadow-sm transition-colors self-start sm:self-auto"
        >
          <Plus size={14} /> Add Document
        </button>
      </div>

      {/* Recommended documents for this step (company checklist guidance) */}
      {recommended.length > 0 && (
        <div className="px-5 py-2.5 bg-blue-50/40 border-b border-blue-100 flex items-start gap-2">
          <ListChecks size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-slate-600">
            <span className="font-semibold text-slate-700">Recommended for this step:</span>{' '}
            {recommended.join(' · ')}
          </p>
        </div>
      )}

      {/* Search + category filter (only when there's something to sift) */}
      {docs.length > 0 && (
        <div className="px-5 py-3 border-b border-slate-100 flex flex-col sm:flex-row gap-2">
          <div className="flex items-center gap-2 flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 min-w-0">
            <Search size={14} className="text-slate-400 flex-shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, ref no, category, uploaded by…" className="bg-transparent text-xs text-slate-700 outline-none w-full" />
          </div>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-100">
            <option value="all">All categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}

      {/* Body */}
      {docs.length === 0 ? (
        <div className="p-6">
          <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl">
            <UploadCloud size={26} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-medium text-slate-600">No documents attached yet</p>
            <p className="text-xs text-slate-400 mt-1">Add SOPs, evidence photos, data sheets, drawings or reports for this step.</p>
            {!disabled && <button type="button" onClick={openUpload} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline"><Plus size={13} /> Add the first document</button>}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                <th className="text-left px-5 py-2.5">Document</th>
                <th className="text-left px-3 py-2.5">Category</th>
                <th className="text-center px-3 py-2.5">Rev.</th>
                <th className="text-left px-3 py-2.5">Uploaded By</th>
                <th className="text-left px-3 py-2.5">Date</th>
                <th className="text-right px-3 py-2.5">Size</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(d => {
                const meta = KIND_META[d.kind];
                const Icon = meta.icon;
                return (
                  <tr key={d.id} className="hover:bg-slate-50/70 align-top">
                    <td className="px-5 py-3">
                      <div className="flex items-start gap-3">
                        <span className={`w-9 h-9 rounded-lg ${meta.bg} ${meta.color} flex items-center justify-center flex-shrink-0`}><Icon size={17} /></span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate max-w-[280px]">{d.name}</p>
                          <p className="text-[11px] text-slate-400">
                            {meta.label}{d.refNo && <> · Ref: <span className="font-medium text-slate-500">{d.refNo}</span></>}
                          </p>
                          {d.description && <p className="text-[11px] text-slate-500 mt-0.5 max-w-[300px] truncate">{d.description}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3"><span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold border ${CAT_BADGE[d.category] || CAT_BADGE.Other}`}>{d.category}</span></td>
                    <td className="px-3 py-3 text-center text-xs font-semibold text-slate-600">v{d.version}</td>
                    <td className="px-3 py-3 text-xs text-slate-600">{d.uploadedBy}</td>
                    <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtDate(d.addedAt)}</td>
                    <td className="px-3 py-3 text-right text-xs text-slate-500 whitespace-nowrap">{fmtSize(d.size)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {d.dataUrl && (
                          <a href={d.dataUrl} target="_blank" rel="noreferrer" download={d.name} title="Open / download" className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><ExternalLink size={15} /></a>
                        )}
                        <button type="button" onClick={() => removeDoc(d)} disabled={disabled} title="Delete document" className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-xs text-slate-400">No documents match your search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Upload dialog ── */}
      {showUpload && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowUpload(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-[scaleIn_0.18s_ease-out]" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center"><UploadCloud size={18} /></span>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Add Document</h3>
                  <p className="text-[11px] text-slate-500">Attach a supporting file with its details</p>
                </div>
              </div>
              <button onClick={() => setShowUpload(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"><X size={18} /></button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Drop zone / picker */}
              <div
                onDragOver={e => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                className={`rounded-xl border-2 border-dashed px-4 py-6 text-center cursor-pointer transition-colors ${dragActive ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-blue-300 hover:bg-slate-50'}`}
              >
                {file ? (
                  <div className="flex items-center justify-center gap-3">
                    {(() => { const m = KIND_META[detectKind(file.name, file.type)]; const I = m.icon; return <span className={`w-10 h-10 rounded-lg ${m.bg} ${m.color} flex items-center justify-center flex-shrink-0`}><I size={19} /></span>; })()}
                    <div className="min-w-0 text-left">
                      <p className="text-sm font-medium text-slate-800 truncate max-w-[320px]">{file.name}</p>
                      <p className="text-[11px] text-slate-400">{fmtSize(file.size)} · click to change</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <UploadCloud size={24} className="mx-auto text-slate-400 mb-2" />
                    <p className="text-sm text-slate-600 font-medium">Drag &amp; drop a file here, or <span className="text-blue-600">browse</span></p>
                    <p className="text-[11px] text-slate-400 mt-1">PDF, Image, Excel, PowerPoint or Word</p>
                  </>
                )}
                <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = ''; }} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Document Category</label>
                  <select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400">
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Reference No. <span className="text-slate-400 font-normal">(optional)</span></label>
                  <input value={refNo} onChange={e => setRefNo(e.target.value)} placeholder="e.g. QCC/SOP/012" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Description / Remarks <span className="text-slate-400 font-normal">(optional)</span></label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="What this document contains / why it's attached…" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none resize-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400" />
              </div>

              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span>Uploaded by <b className="text-slate-500">{user?.name || 'You'}</b> · {fmtDate(new Date().toISOString())}</span>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => setShowUpload(false)} className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={save} disabled={!file} className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg shadow-sm">Add to Register</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
