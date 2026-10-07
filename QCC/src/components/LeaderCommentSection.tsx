import { useState, useRef } from 'react';
import { Upload, Image as ImageIcon, CheckCircle2, Calendar } from 'lucide-react';

interface LeaderReview {
  leaderComment: string;
  goodPoints: string;
  badPointsLessonLearned: string;
  leaderSign: string;
  facilitatorSign: string;
  coordinatorSign: string;
  leaderSignDate: string;
  facilitatorSignDate: string;
  coordinatorSignDate: string;
  leaderSignatureImage: { name: string; size: number } | null;
  facilitatorSignatureImage: { name: string; size: number } | null;
  coordinatorSignatureImage: { name: string; size: number } | null;
}

export default function LeaderCommentSection() {
  const [leaderReview, setLeaderReview] = useState<LeaderReview>({
    leaderComment: '',
    goodPoints: '',
    badPointsLessonLearned: '',
    leaderSign: '',
    facilitatorSign: '',
    coordinatorSign: '',
    leaderSignDate: '',
    facilitatorSignDate: '',
    coordinatorSignDate: '',
    leaderSignatureImage: null,
    facilitatorSignatureImage: null,
    coordinatorSignatureImage: null
  });

  const signatureInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const updateLeaderReview = (field: keyof LeaderReview, value: string) => {
    setLeaderReview(prev => ({ ...prev, [field]: value }));
  };

  const uploadSignature = (type: 'leader' | 'facilitator' | 'coordinator', file: File | null) => {
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      alert('Only image files (JPG, PNG, WebP) are allowed for signatures.');
      return;
    }

    const fieldName = `${type}SignatureImage` as keyof LeaderReview;
    setLeaderReview(prev => ({
      ...prev,
      [fieldName]: {
        name: file.name,
        size: file.size
      }
    }));
  };

  const handleSignatureSelect = (type: 'leader' | 'facilitator' | 'coordinator', event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadSignature(type, file);
    }
  };

  const triggerSignatureUpload = (type: string) => {
    signatureInputRefs.current[type]?.click();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="space-y-4 mt-6">
      {/* Section Header */}
      <div className="border-b-2 border-blue-600 pb-2">
        <h3 className="text-base font-bold text-slate-800">Leader Comment</h3>
        <p className="text-xs text-slate-500 mt-0.5">Review and provide feedback on the standardization process</p>
      </div>

      {/* Leader Comment */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
          Leader Comment
        </label>
        <textarea
          value={leaderReview.leaderComment}
          onChange={(e) => updateLeaderReview('leaderComment', e.target.value)}
          placeholder="Enter leader comment..."
          rows={4}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
        />
      </div>

      {/* Good Points and Bad Points */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Good Points */}
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <label className="block text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-2">
            Good Points
          </label>
          <textarea
            value={leaderReview.goodPoints}
            onChange={(e) => updateLeaderReview('goodPoints', e.target.value)}
            placeholder="Enter good points..."
            rows={6}
            className="w-full px-3 py-2 border border-emerald-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-none bg-emerald-50/30"
          />
        </div>

        {/* Bad Points / Lesson Learned */}
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <label className="block text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">
            Bad Points / Lesson Learned
          </label>
          <textarea
            value={leaderReview.badPointsLessonLearned}
            onChange={(e) => updateLeaderReview('badPointsLessonLearned', e.target.value)}
            placeholder="Enter bad points and lesson learned..."
            rows={6}
            className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none bg-amber-50/30"
          />
        </div>
      </div>

      {/* Signature Section */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-4">Signatures</h4>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Leader Sign */}
          <div className="border border-slate-200 rounded-lg p-3 space-y-2">
            <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
              Leader Sign
            </label>
            <input
              type="text"
              value={leaderReview.leaderSign}
              onChange={(e) => updateLeaderReview('leaderSign', e.target.value)}
              placeholder="Name / Signature"
              className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <div className="flex items-center gap-2">
              <Calendar size={12} className="text-slate-400" />
              <input
                type="date"
                value={leaderReview.leaderSignDate}
                onChange={(e) => updateLeaderReview('leaderSignDate', e.target.value)}
                className="flex-1 px-2 py-1 border border-slate-200 rounded text-[10px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <input
              ref={(el) => { signatureInputRefs.current['leader'] = el; }}
              type="file"
              onChange={(e) => handleSignatureSelect('leader', e)}
              accept="image/jpeg,image/jpg,image/png,image/webp"
              className="hidden"
            />
            <button
              onClick={() => triggerSignatureUpload('leader')}
              className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1.5 border border-slate-300 rounded text-[10px] font-medium text-slate-700 hover:bg-slate-50 hover:border-blue-400 transition-colors"
            >
              <Upload size={10} />
              Upload Signature
            </button>
            {leaderReview.leaderSignatureImage && (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded">
                <ImageIcon size={10} className="text-emerald-600" />
                <span className="text-[9px] text-emerald-700 font-medium truncate" title={leaderReview.leaderSignatureImage.name}>
                  {leaderReview.leaderSignatureImage.name}
                </span>
                <CheckCircle2 size={10} className="text-emerald-600 flex-shrink-0" />
              </div>
            )}
          </div>

          {/* Facilitator Sign */}
          <div className="border border-slate-200 rounded-lg p-3 space-y-2">
            <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
              Facilitator Sign
            </label>
            <input
              type="text"
              value={leaderReview.facilitatorSign}
              onChange={(e) => updateLeaderReview('facilitatorSign', e.target.value)}
              placeholder="Name / Signature"
              className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <div className="flex items-center gap-2">
              <Calendar size={12} className="text-slate-400" />
              <input
                type="date"
                value={leaderReview.facilitatorSignDate}
                onChange={(e) => updateLeaderReview('facilitatorSignDate', e.target.value)}
                className="flex-1 px-2 py-1 border border-slate-200 rounded text-[10px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <input
              ref={(el) => { signatureInputRefs.current['facilitator'] = el; }}
              type="file"
              onChange={(e) => handleSignatureSelect('facilitator', e)}
              accept="image/jpeg,image/jpg,image/png,image/webp"
              className="hidden"
            />
            <button
              onClick={() => triggerSignatureUpload('facilitator')}
              className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1.5 border border-slate-300 rounded text-[10px] font-medium text-slate-700 hover:bg-slate-50 hover:border-blue-400 transition-colors"
            >
              <Upload size={10} />
              Upload Signature
            </button>
            {leaderReview.facilitatorSignatureImage && (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded">
                <ImageIcon size={10} className="text-emerald-600" />
                <span className="text-[9px] text-emerald-700 font-medium truncate" title={leaderReview.facilitatorSignatureImage.name}>
                  {leaderReview.facilitatorSignatureImage.name}
                </span>
                <CheckCircle2 size={10} className="text-emerald-600 flex-shrink-0" />
              </div>
            )}
          </div>

          {/* Coordinator Sign */}
          <div className="border border-slate-200 rounded-lg p-3 space-y-2">
            <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
              Coordinator Sign
            </label>
            <input
              type="text"
              value={leaderReview.coordinatorSign}
              onChange={(e) => updateLeaderReview('coordinatorSign', e.target.value)}
              placeholder="Name / Signature"
              className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <div className="flex items-center gap-2">
              <Calendar size={12} className="text-slate-400" />
              <input
                type="date"
                value={leaderReview.coordinatorSignDate}
                onChange={(e) => updateLeaderReview('coordinatorSignDate', e.target.value)}
                className="flex-1 px-2 py-1 border border-slate-200 rounded text-[10px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <input
              ref={(el) => { signatureInputRefs.current['coordinator'] = el; }}
              type="file"
              onChange={(e) => handleSignatureSelect('coordinator', e)}
              accept="image/jpeg,image/jpg,image/png,image/webp"
              className="hidden"
            />
            <button
              onClick={() => triggerSignatureUpload('coordinator')}
              className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1.5 border border-slate-300 rounded text-[10px] font-medium text-slate-700 hover:bg-slate-50 hover:border-blue-400 transition-colors"
            >
              <Upload size={10} />
              Upload Signature
            </button>
            {leaderReview.coordinatorSignatureImage && (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded">
                <ImageIcon size={10} className="text-emerald-600" />
                <span className="text-[9px] text-emerald-700 font-medium truncate" title={leaderReview.coordinatorSignatureImage.name}>
                  {leaderReview.coordinatorSignatureImage.name}
                </span>
                <CheckCircle2 size={10} className="text-emerald-600 flex-shrink-0" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
