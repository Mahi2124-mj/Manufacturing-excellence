import { useState, useEffect, useRef } from 'react';
import {
  Plus, Trash2, Upload, FileText, FileSpreadsheet, File, Image as ImageIcon,
  CheckCircle2, AlertCircle, Lock, Unlock, ShieldCheck,
} from 'lucide-react';
import { useConfirm } from './ConfirmDialog';

interface FileMeta { name: string; size: number; type: string }

interface StandardizationDoc {
  id: string;
  documentType: string;
  documentName: string;
  docNumber: string;
  revNo: string;
  uploadedDocument: FileMeta | null;
  createdAt: string;
}

interface CtrlRow {
  id: string;
  when: string;
  who: string;
  frequency: string;
  what: string;
  evidence: FileMeta | null;
}

const ALLOWED_FILE_TYPES = [
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf',
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
];
const ALLOWED_EXTENSIONS = ['.xls', '.xlsx', '.csv', '.ppt', '.pptx', '.doc', '.docx', '.pdf', '.jpg', '.jpeg', '.png', '.webp'];
// Evidence: PDF / Photo / Checklist
const EVIDENCE_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.xls', '.xlsx', '.csv', '.doc', '.docx'];

const STORAGE_KEY = 'qcc-standardization-control';

const defaultDocs = (): StandardizationDoc[] => [
  { id: '1', documentType: 'SOP', documentName: 'Standard Operating Procedure for CNC Setup', docNumber: 'SOP-MFG-001', revNo: 'Rev 1.0', uploadedDocument: null, createdAt: new Date().toISOString() },
];
const freshCtrl = (): CtrlRow[] =>
  Array.from({ length: 4 }, (_, i) => ({ id: `ctrl-${i}`, when: '', who: '', frequency: '', what: '', evidence: null }));

const validFile = (file: File, exts: string[]) => {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  return exts.includes(ext) || ALLOWED_FILE_TYPES.includes(file.type);
};
const getFileIcon = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['xls', 'xlsx', 'csv'].includes(ext || '')) return <FileSpreadsheet size={14} className="text-emerald-600" />;
  if (['doc', 'docx'].includes(ext || '')) return <FileText size={14} className="text-blue-600" />;
  if (['ppt', 'pptx'].includes(ext || '')) return <File size={14} className="text-orange-600" />;
  if (ext === 'pdf') return <FileText size={14} className="text-red-600" />;
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext || '')) return <ImageIcon size={14} className="text-purple-600" />;
  return <File size={14} className="text-slate-600" />;
};
const formatFileSize = (bytes: number) =>
  bytes < 1024 ? bytes + ' B' : bytes < 1024 * 1024 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / (1024 * 1024)).toFixed(1) + ' MB';

export default function StandardizationSection({ userRole = 'member' }: { userRole?: string }) {
  const isAdmin = userRole === 'admin';
  const askConfirm = useConfirm();

  const [standardizationDocs, setStandardizationDocs] = useState<StandardizationDoc[]>(() => {
    try { const s = localStorage.getItem(STORAGE_KEY); if (s) return JSON.parse(s).docs ?? defaultDocs(); } catch { /* default */ }
    return defaultDocs();
  });
  const [ctrl, setCtrl] = useState<CtrlRow[]>(() => {
    try { const s = localStorage.getItem(STORAGE_KEY); if (s) return JSON.parse(s).ctrl ?? freshCtrl(); } catch { /* default */ }
    return freshCtrl();
  });
  const [approval, setApproval] = useState<{ at: string; by: string } | null>(() => {
    try { const s = localStorage.getItem(STORAGE_KEY); if (s) return JSON.parse(s).approval ?? null; } catch { /* none */ }
    return null;
  });
  const locked = !!approval; // once approved, the whole step is read-only

  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [uploadSuccess, setUploadSuccess] = useState<Record<string, boolean>>({});
  const docRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const evidenceRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem(STORAGE_KEY, JSON.stringify({ docs: standardizationDocs, ctrl, approval })), 500);
    return () => clearTimeout(t);
  }, [standardizationDocs, ctrl, approval]);

  // ── Standardization documents ──
  const addDocumentRow = () => setStandardizationDocs(d => [...d, { id: Date.now().toString(), documentType: '', documentName: '', docNumber: '', revNo: '', uploadedDocument: null, createdAt: new Date().toISOString() }]);
  const updateDocumentRow = (id: string, field: keyof StandardizationDoc, value: string) =>
    setStandardizationDocs(docs => docs.map(doc => (doc.id === id ? { ...doc, [field]: value } : doc)));
  const deleteDocumentRow = (id: string) => {
    setStandardizationDocs(docs => docs.filter(doc => doc.id !== id));
    setUploadErrors(e => { const n = { ...e }; delete n[id]; return n; });
    setUploadSuccess(s => { const n = { ...s }; delete n[id]; return n; });
  };
  const uploadDoc = (id: string, file: File | null) => {
    if (!file) return;
    if (!validFile(file, ALLOWED_EXTENSIONS)) { setUploadErrors(e => ({ ...e, [id]: 'Only Excel, Word, PPT, PDF and Image files are allowed.' })); return; }
    setUploadErrors(e => { const n = { ...e }; delete n[id]; return n; });
    setStandardizationDocs(docs => docs.map(d => (d.id === id ? { ...d, uploadedDocument: { name: file.name, size: file.size, type: file.type } } : d)));
    setUploadSuccess(s => ({ ...s, [id]: true }));
    setTimeout(() => setUploadSuccess(s => { const n = { ...s }; delete n[id]; return n; }), 3000);
  };

  // ── Control plan rows ──
  const patchCtrl = (id: string, field: keyof CtrlRow, value: string) => setCtrl(rows => rows.map(r => (r.id === id ? { ...r, [field]: value } : r)));
  const addCtrl = () => setCtrl(rows => [...rows, { id: `ctrl-${Date.now()}`, when: '', who: '', frequency: '', what: '', evidence: null }]);
  const removeCtrl = (id: string) => setCtrl(rows => rows.filter(r => r.id !== id));
  const uploadEvidence = (id: string, file: File | null) => {
    if (!file) return;
    if (!validFile(file, EVIDENCE_EXTENSIONS)) { setUploadErrors(e => ({ ...e, [id]: 'Evidence must be a PDF, photo or checklist file.' })); return; }
    setUploadErrors(e => { const n = { ...e }; delete n[id]; return n; });
    setCtrl(rows => rows.map(r => (r.id === id ? { ...r, evidence: { name: file.name, size: file.size, type: file.type } } : r)));
    setUploadSuccess(s => ({ ...s, [id]: true }));
    setTimeout(() => setUploadSuccess(s => { const n = { ...s }; delete n[id]; return n; }), 3000);
  };

  const approve = () => setApproval({ at: new Date().toISOString(), by: 'Admin' });
  const unlock = () => setApproval(null);

  const cell = `w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed`;
  const th = 'px-3 py-2 text-left text-[10px] font-bold text-slate-600 uppercase tracking-wide border border-slate-200';

  return (
    <div className="space-y-4">
      {/* ── Approval / lock banner ── */}
      <div className={`rounded-xl border shadow-sm p-4 flex items-center justify-between gap-3 flex-wrap ${locked ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center gap-2.5">
          <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${locked ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{locked ? <Lock size={18} /> : <ShieldCheck size={18} />}</span>
          <div>
            <p className="text-sm font-bold text-slate-800">{locked ? 'Approved — Step 7 locked (read-only)' : 'Pending approval'}</p>
            <p className="text-[11px] text-slate-500">{locked
              ? `Approved by ${approval!.by} · ${new Date(approval!.at).toLocaleString()}. Only an Admin can unlock it for editing.`
              : 'Fill the standardization document & control plan below, then an Admin approves and locks this step.'}</p>
          </div>
        </div>
        {isAdmin ? (
          locked
            ? <button onClick={unlock} className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors"><Unlock size={15} /> Unlock</button>
            : <button onClick={approve} className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors"><CheckCircle2 size={15} /> Approve &amp; Lock</button>
        ) : (
          !locked && <span className="text-[11px] text-slate-400">Awaiting Admin approval</span>
        )}
      </div>

      {/* ── Standardization Document ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-800">Standardization Document</h3>
          <button onClick={addDocumentRow} disabled={locked} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-medium rounded-lg transition-colors">
            <Plus size={14} /> Add Document
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-600 uppercase tracking-wide">Document Type</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-600 uppercase tracking-wide">Document Name</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-600 uppercase tracking-wide">Doc Number</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-600 uppercase tracking-wide">Rev No.</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-600 uppercase tracking-wide">Upload Document</th>
                <th className="px-3 py-2.5 text-center text-[10px] font-bold text-slate-600 uppercase tracking-wide w-14">Delete</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {standardizationDocs.map(doc => (
                <tr key={doc.id} className="hover:bg-slate-50/50">
                  <td className="px-3 py-2.5">
                    <select value={doc.documentType} onChange={e => updateDocumentRow(doc.id, 'documentType', e.target.value)} disabled={locked} className={cell}>
                      <option value="">Select Type</option>
                      <option value="SOP">SOP</option>
                      <option value="Work Instruction">Work Instruction</option>
                      <option value="Control Plan">Control Plan</option>
                      <option value="Checklist">Checklist</option>
                      <option value="Manual">Manual</option>
                      <option value="Form">Form</option>
                    </select>
                  </td>
                  <td className="px-3 py-2.5"><input type="text" value={doc.documentName} onChange={e => updateDocumentRow(doc.id, 'documentName', e.target.value)} disabled={locked} placeholder="Enter document name" className={cell} /></td>
                  <td className="px-3 py-2.5"><input type="text" value={doc.docNumber} onChange={e => updateDocumentRow(doc.id, 'docNumber', e.target.value)} disabled={locked} placeholder="DOC-001" className={cell} /></td>
                  <td className="px-3 py-2.5"><input type="text" value={doc.revNo} onChange={e => updateDocumentRow(doc.id, 'revNo', e.target.value)} disabled={locked} placeholder="Rev 1.0" className={cell} /></td>
                  <td className="px-3 py-2.5">
                    <input ref={el => { docRefs.current[doc.id] = el; }} type="file" onChange={e => uploadDoc(doc.id, e.target.files?.[0] ?? null)} accept={ALLOWED_EXTENSIONS.join(',')} className="hidden" />
                    {!locked && (
                      <button onClick={() => docRefs.current[doc.id]?.click()} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-300 rounded text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-blue-400 transition-colors"><Upload size={12} /> Upload</button>
                    )}
                    {doc.uploadedDocument && (
                      <div className="flex items-center gap-1.5 px-2 py-1 mt-1 bg-emerald-50 border border-emerald-200 rounded w-fit">
                        {getFileIcon(doc.uploadedDocument.name)}
                        <span className="text-[10px] text-emerald-700 font-medium truncate max-w-[130px]" title={doc.uploadedDocument.name}>{doc.uploadedDocument.name}</span>
                        <span className="text-[9px] text-emerald-600">({formatFileSize(doc.uploadedDocument.size)})</span>
                        {uploadSuccess[doc.id] && <CheckCircle2 size={12} className="text-emerald-600 flex-shrink-0" />}
                      </div>
                    )}
                    {uploadErrors[doc.id] && <div className="flex items-start gap-1 px-2 py-1 mt-1 bg-red-50 border border-red-200 rounded"><AlertCircle size={12} className="text-red-600 flex-shrink-0 mt-0.5" /><span className="text-[10px] text-red-700 leading-tight">{uploadErrors[doc.id]}</span></div>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <button onClick={async () => { if (await askConfirm({ title: 'Delete this document row?', message: 'This standardization document row will be removed.', confirmText: 'Delete' })) deleteDocumentRow(doc.id); }} disabled={locked} className="p-1.5 text-red-600 hover:bg-red-50 disabled:text-slate-300 disabled:hover:bg-transparent rounded transition-colors" title="Delete row"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {standardizationDocs.length === 0 && <div className="text-center py-10 bg-slate-50 border-t border-slate-200"><FileText size={28} className="mx-auto text-slate-300 mb-2" /><p className="text-sm text-slate-500">No documents yet — click "Add Document".</p></div>}
      </div>

      {/* ── Control Plan ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Control Plan</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Periodic checks that the standardized process is followed — with evidence.</p>
          </div>
          <button onClick={addCtrl} disabled={locked} className="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-medium rounded-lg transition-colors"><Plus size={13} /> Row</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[640px]">
            <thead className="bg-slate-50">
              <tr>
                <th className={th}>When</th>
                <th className={th}>Who</th>
                <th className={th}>Frequency</th>
                <th className={th}>What</th>
                <th className={th}>Evidence</th>
                <th className="w-9 border border-slate-200" />
              </tr>
            </thead>
            <tbody>
              {ctrl.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/50">
                  <td className="px-1.5 py-1.5 border border-slate-200"><input value={r.when} onChange={e => patchCtrl(r.id, 'when', e.target.value)} disabled={locked} className={cell} /></td>
                  <td className="px-1.5 py-1.5 border border-slate-200"><input value={r.who} onChange={e => patchCtrl(r.id, 'who', e.target.value)} disabled={locked} className={cell} /></td>
                  <td className="px-1.5 py-1.5 border border-slate-200"><input value={r.frequency} onChange={e => patchCtrl(r.id, 'frequency', e.target.value)} disabled={locked} placeholder="e.g. Daily" className={cell} /></td>
                  <td className="px-1.5 py-1.5 border border-slate-200"><input value={r.what} onChange={e => patchCtrl(r.id, 'what', e.target.value)} disabled={locked} className={cell} /></td>
                  <td className="px-1.5 py-1.5 border border-slate-200">
                    <input ref={el => { evidenceRefs.current[r.id] = el; }} type="file" onChange={e => uploadEvidence(r.id, e.target.files?.[0] ?? null)} accept={EVIDENCE_EXTENSIONS.join(',')} className="hidden" />
                    {r.evidence ? (
                      <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded">
                        {getFileIcon(r.evidence.name)}
                        <span className="text-[10px] text-emerald-700 font-medium truncate max-w-[110px]" title={r.evidence.name}>{r.evidence.name}</span>
                        {!locked && <button onClick={() => patchCtrl(r.id, 'evidence', '')} className="text-emerald-600 hover:text-red-600" title="Remove"><Trash2 size={11} /></button>}
                      </div>
                    ) : !locked ? (
                      <button onClick={() => evidenceRefs.current[r.id]?.click()} className="inline-flex items-center gap-1.5 px-2 py-1.5 border border-slate-300 rounded text-[11px] font-medium text-slate-600 hover:bg-slate-50 hover:border-blue-400 transition-colors" title="PDF / Photo / Checklist"><Upload size={12} /> Upload</button>
                    ) : <span className="text-[11px] text-slate-400">—</span>}
                    {uploadErrors[r.id] && <div className="flex items-start gap-1 px-2 py-1 mt-1 bg-red-50 border border-red-200 rounded"><AlertCircle size={11} className="text-red-600 flex-shrink-0 mt-0.5" /><span className="text-[10px] text-red-700 leading-tight">{uploadErrors[r.id]}</span></div>}
                  </td>
                  <td className="px-1 py-1.5 border border-slate-200 text-center">
                    <button onClick={async () => { if (await askConfirm({ title: 'Remove this row?', message: 'This control plan row will be removed.', confirmText: 'Delete' })) removeCtrl(r.id); }} disabled={locked} className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:text-slate-200 disabled:hover:bg-transparent rounded" title="Remove row"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
