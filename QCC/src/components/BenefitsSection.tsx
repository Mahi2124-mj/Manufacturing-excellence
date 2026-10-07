import { useState, useMemo, useRef } from 'react';
import {
  Plus, Trash2, Upload, FileText, FileSpreadsheet, Image as ImageIcon,
  File, TrendingUp, DollarSign, Clock, Zap, Users, Award,
  Package, Info, Calculator, ChevronDown, ChevronUp, AlertCircle,
  Camera, Eye, X, ArrowRight, CheckCircle2
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────
interface Benefit {
  id: string;
  category: 'tangible' | 'intangible' | '';
  benefitType: string;
  // Cost Saving fields
  beforeMonthlyCost: number;
  afterMonthlyCost: number;
  monthlyCostSaving: number;
  yearlyCostSaving: number;
  // Cycle Time Reduction fields
  beforeCycleTime: number;
  afterCycleTime: number;
  cycleTimeSaving: number;
  reductionArea: string;
  // Other Tangible fields
  monthlySaving: number;
  yearlySaving: number;
  // Intangible fields
  impactLevel: 'low' | 'medium' | 'high' | '';
  // Common fields
  description: string;
  evidenceFile: File | null;
  evidenceFileName: string;
  createdAt: string;
}

// ─── Constants ───────────────────────────────────────────
const TANGIBLE_TYPES = [
  { value: 'cost_saving', label: 'Cost Saving' },
  { value: 'cycle_time_reduction', label: 'Cycle Time Reduction' },
  { value: 'productivity_improvement', label: 'Productivity Improvement' },
  { value: 'manpower_saving', label: 'Manpower Saving' },
  { value: 'rework_reduction', label: 'Rework Reduction' },
  { value: 'energy_saving', label: 'Energy Saving' },
  { value: 'breakdown_reduction', label: 'Breakdown Reduction' },
  { value: 'quality_improvement', label: 'Quality Improvement' },
  { value: 'defect_reduction', label: 'Defect Reduction' },
  { value: 'scrap_reduction', label: 'Scrap Reduction' },
  { value: 'setup_time_reduction', label: 'Setup Time Reduction' },
  { value: 'waiting_time_reduction', label: 'Waiting Time Reduction' },
  { value: 'material_saving', label: 'Material Saving' },
  { value: 'space_saving', label: 'Space Saving' },
  { value: 'inventory_reduction', label: 'Inventory Reduction' },
  { value: 'other', label: 'Other' },
];

const INTANGIBLE_TYPES = [
  { value: 'safety_improvement', label: 'Safety Improvement' },
  { value: 'morale_improvement', label: 'Morale Improvement' },
  { value: 'skill_improvement', label: 'Skill Improvement' },
  { value: '5s_improvement', label: '5S Improvement' },
  { value: 'quality_awareness', label: 'Quality Awareness' },
  { value: 'teamwork_improvement', label: 'Teamwork Improvement' },
  { value: 'customer_satisfaction', label: 'Customer Satisfaction' },
  { value: 'other', label: 'Other' },
];

const REDUCTION_AREAS = [
  'Single Process',
  'Full Line',
  'Bottleneck Process'
];

const ALLOWED_FILE_TYPES = [
  '.xls', '.xlsx', '.csv',
  '.ppt', '.pptx',
  '.jpg', '.jpeg', '.png', '.webp',
  '.pdf'
];

// ─── Helpers ─────────────────────────────────────────────
const formatCurrency = (n: number): string => {
  if (Math.abs(n) >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
};

// ─── Evidence File Type ──────────────────────────────────
interface EvidenceFile {
  id: string;
  file: File;
  fileName: string;
  fileType: 'image' | 'document' | 'spreadsheet' | 'pdf' | 'other';
  previewUrl?: string;
  uploadedAt: string;
}

// ─── Component ───────────────────────────────────────────
export default function BenefitsSection() {
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  
  // Evidence state for Before/After
  const [beforeEvidence, setBeforeEvidence] = useState<EvidenceFile[]>([]);
  const [afterEvidence, setAfterEvidence] = useState<EvidenceFile[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  const beforeInputRef = useRef<HTMLInputElement>(null);
  const afterInputRef = useRef<HTMLInputElement>(null);

  const createEmptyBenefit = (): Benefit => ({
    id: `ben-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    category: '',
    benefitType: '',
    beforeMonthlyCost: 0,
    afterMonthlyCost: 0,
    monthlyCostSaving: 0,
    yearlyCostSaving: 0,
    beforeCycleTime: 0,
    afterCycleTime: 0,
    cycleTimeSaving: 0,
    reductionArea: '',
    monthlySaving: 0,
    yearlySaving: 0,
    impactLevel: '',
    description: '',
    evidenceFile: null,
    evidenceFileName: '',
    createdAt: new Date().toISOString(),
  });

  // ── Add Benefit ──
  const addBenefit = () => {
    const newBen = createEmptyBenefit();
    setBenefits(prev => [...prev, newBen]);
    setExpandedIds(prev => new Set([...prev, newBen.id]));
  };

  // ── Delete Benefit ──
  const deleteBenefit = (id: string) => {
    setBenefits(prev => prev.filter(b => b.id !== id));
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  // ── Toggle Expand ──
  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Calculation Functions ──
  const calculateCostSaving = (before: number, after: number) => {
    const monthlySaving = before - after;
    const yearlySaving = monthlySaving * 12;
    return { monthlyCostSaving: monthlySaving, yearlyCostSaving: yearlySaving };
  };

  const calculateCycleTimeSaving = (before: number, after: number) => {
    return before - after;
  };

  const calculateYearlySaving = (monthly: number) => {
    return monthly * 12;
  };

  // ── Update Benefit ──
  const updateBenefit = (id: string, field: keyof Benefit, value: any) => {
    setBenefits(prev => prev.map(b => {
      if (b.id !== id) return b;
      const updated = { ...b, [field]: value };

      // Cost Saving calculations
      if (field === 'beforeMonthlyCost' || field === 'afterMonthlyCost') {
        const before = field === 'beforeMonthlyCost' ? (parseFloat(value) || 0) : b.beforeMonthlyCost;
        const after = field === 'afterMonthlyCost' ? (parseFloat(value) || 0) : b.afterMonthlyCost;
        const savings = calculateCostSaving(before, after);
        updated.monthlyCostSaving = savings.monthlyCostSaving;
        updated.yearlyCostSaving = savings.yearlyCostSaving;
      }

      // Cycle Time calculations
      if (field === 'beforeCycleTime' || field === 'afterCycleTime') {
        const before = field === 'beforeCycleTime' ? (parseFloat(value) || 0) : b.beforeCycleTime;
        const after = field === 'afterCycleTime' ? (parseFloat(value) || 0) : b.afterCycleTime;
        updated.cycleTimeSaving = calculateCycleTimeSaving(before, after);
      }

      // Monthly Saving → Yearly Saving
      if (field === 'monthlySaving') {
        updated.yearlySaving = calculateYearlySaving(parseFloat(value) || 0);
      }

      // Reset type-dependent fields when category changes
      if (field === 'category') {
        updated.benefitType = '';
        updated.beforeMonthlyCost = 0;
        updated.afterMonthlyCost = 0;
        updated.monthlyCostSaving = 0;
        updated.yearlyCostSaving = 0;
        updated.beforeCycleTime = 0;
        updated.afterCycleTime = 0;
        updated.cycleTimeSaving = 0;
        updated.reductionArea = '';
        updated.monthlySaving = 0;
        updated.yearlySaving = 0;
        updated.impactLevel = '';
      }

      // Reset type-dependent fields when benefit type changes
      if (field === 'benefitType') {
        updated.beforeMonthlyCost = 0;
        updated.afterMonthlyCost = 0;
        updated.monthlyCostSaving = 0;
        updated.yearlyCostSaving = 0;
        updated.beforeCycleTime = 0;
        updated.afterCycleTime = 0;
        updated.cycleTimeSaving = 0;
        updated.reductionArea = '';
        updated.monthlySaving = 0;
        updated.yearlySaving = 0;
        updated.impactLevel = '';
      }

      return updated;
    }));
  };

  // ── File Validation ──
  const validateEvidenceFile = (file: File): boolean => {
    const fileName = file.name.toLowerCase();
    return ALLOWED_FILE_TYPES.some(ext => fileName.endsWith(ext));
  };

  // ── Upload Evidence ──
  const uploadBenefitEvidence = (id: string, file: File) => {
    if (!validateEvidenceFile(file)) {
      alert('Only Excel, PPT, Picture, and PDF files are allowed.');
      return;
    }
    setBenefits(prev => prev.map(b =>
      b.id === id ? { ...b, evidenceFile: file, evidenceFileName: file.name } : b
    ));
  };

  // ── File Icon ──
  const getFileIcon = (fileName: string) => {
    const ext = fileName.toLowerCase().split('.').pop();
    if (['xls', 'xlsx', 'csv'].includes(ext || '')) return <FileSpreadsheet size={16} className="text-green-600" />;
    if (['ppt', 'pptx'].includes(ext || '')) return <FileText size={16} className="text-orange-600" />;
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext || '')) return <ImageIcon size={16} className="text-blue-600" />;
    if (ext === 'pdf') return <File size={16} className="text-red-600" />;
    return <File size={16} className="text-slate-600" />;
  };

  // ── Summary Stats ──
  const summaryStats = useMemo(() => {
    const tangible = benefits.filter(b => b.category === 'tangible');
    const intangible = benefits.filter(b => b.category === 'intangible');
    const totalYearlySaving = tangible.reduce((s, b) => {
      if (b.benefitType === 'cost_saving') return s + b.yearlyCostSaving;
      return s + b.yearlySaving;
    }, 0);
    const totalMonthlySaving = tangible.reduce((s, b) => {
      if (b.benefitType === 'cost_saving') return s + b.monthlyCostSaving;
      return s + b.monthlySaving;
    }, 0);
    return {
      totalBenefits: benefits.length,
      tangibleCount: tangible.length,
      intangibleCount: intangible.length,
      totalYearlySaving,
      totalMonthlySaving,
    };
  }, [benefits]);

  // ── Evidence File Helpers ──
  const getEvidenceFileType = (fileName: string): EvidenceFile['fileType'] => {
    const ext = fileName.toLowerCase().split('.').pop() || '';
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return 'image';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'spreadsheet';
    if (ext === 'pdf') return 'pdf';
    if (['ppt', 'pptx'].includes(ext)) return 'document';
    return 'other';
  };

  const getEvidenceIcon = (fileType: EvidenceFile['fileType']) => {
    switch (fileType) {
      case 'image': return <ImageIcon size={14} className="text-blue-600" />;
      case 'spreadsheet': return <FileSpreadsheet size={14} className="text-green-600" />;
      case 'pdf': return <File size={14} className="text-red-600" />;
      case 'document': return <FileText size={14} className="text-orange-600" />;
      default: return <File size={14} className="text-slate-600" />;
    }
  };

  const handleEvidenceUpload = (
    type: 'before' | 'after',
    files: FileList | null
  ) => {
    if (!files) return;

    const newFiles: EvidenceFile[] = [];
    Array.from(files).forEach(file => {
      if (!validateEvidenceFile(file)) {
        alert(`Invalid file type: ${file.name}\n\nOnly Excel, PPT, Image, and PDF files are allowed.`);
        return;
      }

      const fileType = getEvidenceFileType(file.name);
      const evidence: EvidenceFile = {
        id: `ev-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        fileName: file.name,
        fileType,
        uploadedAt: new Date().toISOString(),
      };

      // Generate preview for images
      if (fileType === 'image') {
        evidence.previewUrl = URL.createObjectURL(file);
      }

      newFiles.push(evidence);
    });

    if (type === 'before') {
      setBeforeEvidence(prev => [...prev, ...newFiles]);
    } else {
      setAfterEvidence(prev => [...prev, ...newFiles]);
    }
  };

  const handleDeleteEvidence = (type: 'before' | 'after', id: string) => {
    if (type === 'before') {
      setBeforeEvidence(prev => {
        const file = prev.find(f => f.id === id);
        if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
        return prev.filter(f => f.id !== id);
      });
    } else {
      setAfterEvidence(prev => {
        const file = prev.find(f => f.id === id);
        if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
        return prev.filter(f => f.id !== id);
      });
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-5">
      {/* ── Image Preview Modal ── */}
      {previewImage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-3xl max-h-[85vh] w-full">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-3 -right-3 z-10 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center text-slate-600 hover:text-red-600 transition-colors"
            >
              <X size={16} />
            </button>
            <img
              src={previewImage}
              alt="Evidence preview"
              className="w-full h-full object-contain rounded-xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* ── Check the Results: Before / After Evidence ── */}
      <div className="bg-gradient-to-br from-slate-50 to-blue-50/40 rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 bg-white border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <CheckCircle2 size={14} className="text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Check the Results</h3>
              <p className="text-[10px] text-slate-500">Upload before & after evidence for comparison</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded font-medium">{beforeEvidence.length}</span>
            <ArrowRight size={10} className="text-slate-400" />
            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded font-medium">{afterEvidence.length}</span>
          </div>
        </div>

        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* ── Before Implementation Card ── */}
            <div className="rounded-lg border border-red-200 bg-white overflow-hidden">
              <div className="px-3 py-2 bg-red-50 border-b border-red-100 flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                  <span className="text-[9px] font-bold text-white">B</span>
                </div>
                <span className="text-xs font-semibold text-red-800">Upload Evidence</span>
                <span className="text-[9px] text-red-600 ml-auto">(Before Implementation)</span>
              </div>

              <div className="p-3 space-y-2">
                {/* Compact Upload Trigger */}
                <input
                  ref={beforeInputRef}
                  type="file"
                  multiple
                  accept={ALLOWED_FILE_TYPES.join(',')}
                  onChange={(e) => handleEvidenceUpload('before', e.target.files)}
                  className="hidden"
                />
                <button
                  onClick={() => beforeInputRef.current?.click()}
                  className="w-full flex items-center gap-2 px-3 py-2 border border-dashed border-red-300 rounded-lg hover:bg-red-50 hover:border-red-400 transition-all group"
                >
                  <div className="w-7 h-7 rounded-md bg-red-100 flex items-center justify-center group-hover:bg-red-200 transition-colors">
                    <Upload size={13} className="text-red-600" />
                  </div>
                  <div className="text-left">
                    <p className="text-[11px] font-medium text-slate-700">Upload files</p>
                    <p className="text-[9px] text-slate-400">Images, Excel, PPT, PDF</p>
                  </div>
                </button>

                {/* Image Thumbnails */}
                {beforeEvidence.filter(f => f.fileType === 'image').length > 0 && (
                  <div className="grid grid-cols-4 gap-1.5">
                    {beforeEvidence.filter(f => f.fileType === 'image').map(ev => (
                      <div key={ev.id} className="relative group aspect-square rounded-md overflow-hidden border border-slate-200">
                        <img
                          src={ev.previewUrl}
                          alt={ev.fileName}
                          className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => setPreviewImage(ev.previewUrl || null)}
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                          <Eye size={14} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                        </div>
                        <button
                          onClick={() => handleDeleteEvidence('before', ev.id)}
                          className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={8} className="text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Document Files */}
                {beforeEvidence.filter(f => f.fileType !== 'image').length > 0 && (
                  <div className="space-y-1">
                    {beforeEvidence.filter(f => f.fileType !== 'image').map(ev => (
                      <div key={ev.id} className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 rounded-md border border-slate-100 group">
                        {getEvidenceIcon(ev.fileType)}
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-medium text-slate-700 truncate">{ev.fileName}</p>
                          <p className="text-[8px] text-slate-400">{formatFileSize(ev.file.size)}</p>
                        </div>
                        <button
                          onClick={() => handleDeleteEvidence('before', ev.id)}
                          className="p-1 text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {beforeEvidence.length === 0 && (
                  <p className="text-center text-[10px] text-slate-400 py-1">No evidence uploaded</p>
                )}
              </div>
            </div>

            {/* ── After Implementation Card ── */}
            <div className="rounded-lg border border-emerald-200 bg-white overflow-hidden">
              <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-100 flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                  <span className="text-[9px] font-bold text-white">A</span>
                </div>
                <span className="text-xs font-semibold text-emerald-800">Attachments</span>
                <span className="text-[9px] text-emerald-600 ml-auto">(After Implementation)</span>
              </div>

              <div className="p-3 space-y-2">
                {/* Compact Upload Trigger */}
                <input
                  ref={afterInputRef}
                  type="file"
                  multiple
                  accept={ALLOWED_FILE_TYPES.join(',')}
                  onChange={(e) => handleEvidenceUpload('after', e.target.files)}
                  className="hidden"
                />
                <button
                  onClick={() => afterInputRef.current?.click()}
                  className="w-full flex items-center gap-2 px-3 py-2 border border-dashed border-emerald-300 rounded-lg hover:bg-emerald-50 hover:border-emerald-400 transition-all group"
                >
                  <div className="w-7 h-7 rounded-md bg-emerald-100 flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
                    <Upload size={13} className="text-emerald-600" />
                  </div>
                  <div className="text-left">
                    <p className="text-[11px] font-medium text-slate-700">Upload files</p>
                    <p className="text-[9px] text-slate-400">Images, Excel, PPT, PDF</p>
                  </div>
                </button>

                {/* Image Thumbnails */}
                {afterEvidence.filter(f => f.fileType === 'image').length > 0 && (
                  <div className="grid grid-cols-4 gap-1.5">
                    {afterEvidence.filter(f => f.fileType === 'image').map(ev => (
                      <div key={ev.id} className="relative group aspect-square rounded-md overflow-hidden border border-slate-200">
                        <img
                          src={ev.previewUrl}
                          alt={ev.fileName}
                          className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => setPreviewImage(ev.previewUrl || null)}
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                          <Eye size={14} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                        </div>
                        <button
                          onClick={() => handleDeleteEvidence('after', ev.id)}
                          className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={8} className="text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Document Files */}
                {afterEvidence.filter(f => f.fileType !== 'image').length > 0 && (
                  <div className="space-y-1">
                    {afterEvidence.filter(f => f.fileType !== 'image').map(ev => (
                      <div key={ev.id} className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 rounded-md border border-slate-100 group">
                        {getEvidenceIcon(ev.fileType)}
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-medium text-slate-700 truncate">{ev.fileName}</p>
                          <p className="text-[8px] text-slate-400">{formatFileSize(ev.file.size)}</p>
                        </div>
                        <button
                          onClick={() => handleDeleteEvidence('after', ev.id)}
                          className="p-1 text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {afterEvidence.length === 0 && (
                  <p className="text-center text-[10px] text-slate-400 py-1">No evidence uploaded</p>
                )}
              </div>
            </div>
          </div>

          {/* Compact comparison hint when both have images */}
          {beforeEvidence.filter(f => f.fileType === 'image').length > 0 && afterEvidence.filter(f => f.fileType === 'image').length > 0 && (
            <div className="mt-2 flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-md">
              <Camera size={12} className="text-blue-500 flex-shrink-0" />
              <p className="text-[10px] text-blue-700">Click any thumbnail to preview full size. Compare before & after evidence side by side.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Summary Card ── */}
      {benefits.length > 0 && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calculator size={18} className="text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800">Benefits Summary</h3>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white rounded-lg p-3 border border-blue-200">
              <p className="text-[10px] font-semibold text-blue-600 uppercase mb-1">Total Benefits</p>
              <p className="text-2xl font-bold text-blue-800">{summaryStats.totalBenefits}</p>
              <p className="text-[10px] text-blue-600">{summaryStats.tangibleCount} tangible · {summaryStats.intangibleCount} intangible</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-emerald-200">
              <p className="text-[10px] font-semibold text-emerald-600 uppercase mb-1">Annual Savings</p>
              <p className="text-2xl font-bold text-emerald-800">{formatCurrency(summaryStats.totalYearlySaving)}</p>
              <p className="text-[10px] text-emerald-600">{formatCurrency(summaryStats.totalMonthlySaving)}/month</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Benefits</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">Add tangible and intangible benefits with calculations</p>
        </div>
        <button
          onClick={addBenefit}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={16} />
          Add Benefit
        </button>
      </div>

      {/* ── Empty State ── */}
      {benefits.length === 0 && (
        <div className="text-center py-12 bg-slate-50 rounded-xl border-2 border-dashed border-slate-300">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-100 mb-3">
            <Calculator size={24} className="text-blue-600" />
          </div>
          <p className="text-sm font-medium text-slate-700">No benefits recorded yet</p>
          <p className="text-xs text-slate-500 mt-1">Click "Add Benefit" to document your verification results</p>
        </div>
      )}

      {/* ── Benefits List ── */}
      <div className="space-y-4">
        {benefits.map((benefit, index) => {
          const isExpanded = expandedIds.has(benefit.id);
          const isTangible = benefit.category === 'tangible';
          const isIntangible = benefit.category === 'intangible';
          const isCostSaving = benefit.benefitType === 'cost_saving';
          const isCycleTime = benefit.benefitType === 'cycle_time_reduction';
          const isOtherTangible = isTangible && !isCostSaving && !isCycleTime;

          return (
            <div
              key={benefit.id}
              className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                isTangible ? 'border-blue-200 bg-white' :
                isIntangible ? 'border-purple-200 bg-white' :
                'border-slate-200 bg-white'
              }`}
            >
              {/* ── Card Header ── */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${
                    isTangible ? 'bg-blue-100 text-blue-700' :
                    isIntangible ? 'bg-purple-100 text-purple-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {benefit.benefitType
                        ? (isTangible
                            ? TANGIBLE_TYPES.find(t => t.value === benefit.benefitType)?.label
                            : INTANGIBLE_TYPES.find(t => t.value === benefit.benefitType)?.label)
                        : 'New Benefit Entry'}
                    </p>
                    {benefit.category && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        isTangible ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                      }`}>
                        {isTangible ? 'Tangible' : 'Intangible'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleExpand(benefit.id)}
                    className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                    title={isExpanded ? 'Collapse' : 'Expand'}
                  >
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <button
                    onClick={() => deleteBenefit(benefit.id)}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete benefit"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* ── Card Body ── */}
              {isExpanded && (
                <div className="p-5 space-y-4">
                  {/* Category & Type Selection */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Benefit Category <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={benefit.category}
                        onChange={(e) => updateBenefit(benefit.id, 'category', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                      >
                        <option value="">Select Category</option>
                        <option value="tangible">Tangible Benefit</option>
                        <option value="intangible">Intangible Benefit</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Benefit Type <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={benefit.benefitType}
                        onChange={(e) => updateBenefit(benefit.id, 'benefitType', e.target.value)}
                        disabled={!benefit.category}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white disabled:bg-slate-100 disabled:cursor-not-allowed"
                      >
                        <option value="">Select Type</option>
                        {benefit.category === 'tangible' &&
                          TANGIBLE_TYPES.map(t => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))
                        }
                        {benefit.category === 'intangible' &&
                          INTANGIBLE_TYPES.map(t => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))
                        }
                      </select>
                    </div>
                  </div>

                  {/* ── Cost Saving Fields ── */}
                  {isCostSaving && (
                    <div className="space-y-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-3">
                        <DollarSign size={16} className="text-emerald-600" />
                        <h4 className="text-sm font-bold text-emerald-800">Cost Saving Calculation</h4>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                            Before Monthly Cost (₹)
                          </label>
                          <input
                            type="number"
                            value={benefit.beforeMonthlyCost || ''}
                            onChange={(e) => updateBenefit(benefit.id, 'beforeMonthlyCost', e.target.value)}
                            placeholder="0"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                            After Monthly Cost (₹)
                          </label>
                          <input
                            type="number"
                            value={benefit.afterMonthlyCost || ''}
                            onChange={(e) => updateBenefit(benefit.id, 'afterMonthlyCost', e.target.value)}
                            placeholder="0"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-emerald-200">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                            Monthly Cost Saving (₹) <span className="text-[10px] text-slate-500">(Auto-calculated)</span>
                          </label>
                          <input
                            type="text"
                            value={benefit.monthlyCostSaving > 0 ? formatCurrency(benefit.monthlyCostSaving) : '₹0'}
                            readOnly
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 font-semibold text-emerald-700 cursor-not-allowed"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                            Yearly Cost Saving (₹) <span className="text-[10px] text-slate-500">(Auto-calculated)</span>
                          </label>
                          <input
                            type="text"
                            value={benefit.yearlyCostSaving > 0 ? formatCurrency(benefit.yearlyCostSaving) : '₹0'}
                            readOnly
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 font-semibold text-emerald-700 cursor-not-allowed"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Cycle Time Reduction Fields ── */}
                  {isCycleTime && (
                    <div className="space-y-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-3">
                        <Clock size={16} className="text-blue-600" />
                        <h4 className="text-sm font-bold text-blue-800">Cycle Time Reduction</h4>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                            Before Cycle Time (seconds)
                          </label>
                          <input
                            type="number"
                            value={benefit.beforeCycleTime || ''}
                            onChange={(e) => updateBenefit(benefit.id, 'beforeCycleTime', e.target.value)}
                            placeholder="0"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                            After Cycle Time (seconds)
                          </label>
                          <input
                            type="number"
                            value={benefit.afterCycleTime || ''}
                            onChange={(e) => updateBenefit(benefit.id, 'afterCycleTime', e.target.value)}
                            placeholder="0"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-blue-200">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                            Cycle Time Saving (seconds) <span className="text-[10px] text-slate-500">(Auto-calculated)</span>
                          </label>
                          <input
                            type="text"
                            value={benefit.cycleTimeSaving > 0 ? `${benefit.cycleTimeSaving} sec` : '0 sec'}
                            readOnly
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 font-semibold text-blue-700 cursor-not-allowed"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                            Reduction Area
                          </label>
                          <select
                            value={benefit.reductionArea}
                            onChange={(e) => updateBenefit(benefit.id, 'reductionArea', e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                          >
                            <option value="">Select Area</option>
                            {REDUCTION_AREAS.map(area => (
                              <option key={area} value={area}>{area}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {benefit.reductionArea === 'Bottleneck Process' && (
                        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-amber-900">
                            <span className="font-semibold">Note:</span> Bottleneck process improvement may improve full line output.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Other Tangible Benefits ── */}
                  {isOtherTangible && (
                    <div className="space-y-4 p-4 bg-cyan-50 border border-cyan-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-3">
                        <TrendingUp size={16} className="text-cyan-600" />
                        <h4 className="text-sm font-bold text-cyan-800">
                          {TANGIBLE_TYPES.find(t => t.value === benefit.benefitType)?.label}
                        </h4>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                            Monthly Saving / Benefit
                          </label>
                          <input
                            type="number"
                            value={benefit.monthlySaving || ''}
                            onChange={(e) => updateBenefit(benefit.id, 'monthlySaving', e.target.value)}
                            placeholder="0"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                            Yearly Saving / Benefit <span className="text-[10px] text-slate-500">(Auto-calculated)</span>
                          </label>
                          <input
                            type="text"
                            value={benefit.yearlySaving > 0 ? benefit.yearlySaving.toLocaleString() : '0'}
                            readOnly
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 font-semibold text-cyan-700 cursor-not-allowed"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Intangible Benefits ── */}
                  {isIntangible && (
                    <div className="space-y-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-3">
                        <Award size={16} className="text-purple-600" />
                        <h4 className="text-sm font-bold text-purple-800">Intangible Benefit Assessment</h4>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                          Impact Level
                        </label>
                        <select
                          value={benefit.impactLevel}
                          onChange={(e) => updateBenefit(benefit.id, 'impactLevel', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                        >
                          <option value="">Select Impact Level</option>
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* ── Description (All Benefits) ── */}
                  {benefit.benefitType && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Benefit Description
                      </label>
                      <textarea
                        value={benefit.description}
                        onChange={(e) => updateBenefit(benefit.id, 'description', e.target.value)}
                        placeholder="Enter benefit details..."
                        rows={3}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                      />
                    </div>
                  )}

                  {/* ── Evidence Upload (All Benefits) ── */}
                  {benefit.benefitType && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Upload Evidence
                      </label>
                      <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 hover:border-blue-400 transition-colors">
                        <input
                          type="file"
                          id={`evidence-${benefit.id}`}
                          accept={ALLOWED_FILE_TYPES.join(',')}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadBenefitEvidence(benefit.id, file);
                          }}
                          className="hidden"
                        />
                        <label htmlFor={`evidence-${benefit.id}`} className="cursor-pointer flex flex-col items-center gap-2">
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                            <Upload size={18} className="text-blue-600" />
                          </div>
                          <span className="text-sm font-medium text-slate-700">Upload Evidence</span>
                          <span className="text-[10px] text-slate-500">Upload Excel, PPT, PDF, Image</span>
                        </label>
                      </div>

                      {/* Uploaded File Preview */}
                      {benefit.evidenceFileName && (
                        <div className="mt-3 flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {getFileIcon(benefit.evidenceFileName)}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-slate-800 truncate">{benefit.evidenceFileName}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => updateBenefit(benefit.id, 'evidenceFileName', '')}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                            title="Remove file"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
