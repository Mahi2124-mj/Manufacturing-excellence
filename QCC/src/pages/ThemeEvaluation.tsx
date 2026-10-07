import { useState, useMemo, useCallback } from 'react';
import {
  Users, Plus, X, Trophy, Award, Medal, Star, ChevronDown, ChevronUp,
  MessageSquare, Send, CheckCircle2, Clock, AlertCircle, BarChart3,
  TrendingUp, Crown, Target, Sparkles, ArrowRight
} from 'lucide-react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';

// ─── Types ───────────────────────────────────────────────
interface Member {
  id: string;
  name: string;
  role: string;
  active: boolean;
}

interface ImprovementPoint {
  id: string;
  description: string;
  scores: Record<string, number>;
}

interface LeaderEvaluation {
  id: string;
  improvementPointId: string;
  criteria: string;
  value: string;
  autoRecommended: string;
  manualOverride: boolean;
  comment: string;
}

const EVALUATION_VALUES = ['◎', '○', '△', '×'] as const;
const EVALUATION_SCORES: Record<string, number> = { '◎': 4, '○': 3, '△': 2, '×': 1 };

// ─── Initial Data ────────────────────────────────────────
const initialMembers: Member[] = [
  { id: 'm1', name: 'John Doe', role: 'Circle Leader', active: true },
  { id: 'm2', name: 'Jane Smith', role: 'Facilitator', active: true },
  { id: 'm3', name: 'Mike Johnson', role: 'Department Head', active: true },
];

const initialImprovementPoints: ImprovementPoint[] = [
  { id: 'ip1', description: 'Reduce machine setup time by 40% using SMED methodology', scores: { m1: 8, m2: 7, m3: 9 } },
  { id: 'ip2', description: 'Eliminate assembly line defects through Six Sigma approach', scores: { m1: 7, m2: 8, m3: 7 } },
  { id: 'ip3', description: 'Optimize energy consumption in HVAC systems', scores: { m1: 9, m2: 9, m3: 8 } },
  { id: 'ip4', description: 'Improve warehouse picking efficiency to under 12 minutes', scores: { m1: 6, m2: 5, m3: 6 } },
  { id: 'ip5', description: 'Standardize welding procedures to reduce porosity defects', scores: { m1: 7, m2: 6, m3: 8 } },
];

const initialLeaderEvaluations: LeaderEvaluation[] = [
  { id: 'le1', improvementPointId: 'ip1', criteria: 'Feasibility', value: '◎', autoRecommended: '◎', manualOverride: false, comment: '' },
  { id: 'le2', improvementPointId: 'ip1', criteria: 'Impact', value: '○', autoRecommended: '○', manualOverride: false, comment: '' },
  { id: 'le3', improvementPointId: 'ip1', criteria: 'Cost-Benefit', value: '◎', autoRecommended: '◎', manualOverride: false, comment: '' },
  { id: 'le4', improvementPointId: 'ip2', criteria: 'Feasibility', value: '○', autoRecommended: '○', manualOverride: false, comment: '' },
  { id: 'le5', improvementPointId: 'ip2', criteria: 'Impact', value: '◎', autoRecommended: '◎', manualOverride: false, comment: '' },
  { id: 'le6', improvementPointId: 'ip2', criteria: 'Cost-Benefit', value: '△', autoRecommended: '○', manualOverride: true, comment: 'Higher implementation cost than initially estimated' },
  { id: 'le7', improvementPointId: 'ip3', criteria: 'Feasibility', value: '◎', autoRecommended: '◎', manualOverride: false, comment: '' },
  { id: 'le8', improvementPointId: 'ip3', criteria: 'Impact', value: '◎', autoRecommended: '◎', manualOverride: false, comment: '' },
  { id: 'le9', improvementPointId: 'ip3', criteria: 'Cost-Benefit', value: '◎', autoRecommended: '◎', manualOverride: false, comment: '' },
  { id: 'le10', improvementPointId: 'ip4', criteria: 'Feasibility', value: '△', autoRecommended: '△', manualOverride: false, comment: '' },
  { id: 'le11', improvementPointId: 'ip4', criteria: 'Impact', value: '○', autoRecommended: '○', manualOverride: false, comment: '' },
  { id: 'le12', improvementPointId: 'ip4', criteria: 'Cost-Benefit', value: '△', autoRecommended: '△', manualOverride: false, comment: '' },
  { id: 'le13', improvementPointId: 'ip5', criteria: 'Feasibility', value: '○', autoRecommended: '○', manualOverride: false, comment: '' },
  { id: 'le14', improvementPointId: 'ip5', criteria: 'Impact', value: '○', autoRecommended: '○', manualOverride: false, comment: '' },
  { id: 'le15', improvementPointId: 'ip5', criteria: 'Cost-Benefit', value: '○', autoRecommended: '○', manualOverride: false, comment: '' },
];

// ─── Trophy Icons ────────────────────────────────────────
const TrophyIcon = ({ rank }: { rank: number }) => {
  if (rank === 1) {
    return (
      <div className="relative">
        <Trophy size={40} className="text-yellow-500 drop-shadow-lg" strokeWidth={2.5} />
        <Crown size={20} className="absolute -top-3 left-1/2 -translate-x-1/2 text-yellow-400" />
      </div>
    );
  } else if (rank === 2) {
    return <Trophy size={32} className="text-gray-400 drop-shadow" strokeWidth={2} />;
  } else if (rank === 3) {
    return <Trophy size={28} className="text-amber-700 drop-shadow" strokeWidth={1.8} />;
  } else {
    return <Medal size={24} className="text-slate-400" strokeWidth={1.5} />;
  }
};

// ─── Component ───────────────────────────────────────────
export default function ThemeEvaluation() {
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [improvementPoints, setImprovementPoints] = useState<ImprovementPoint[]>(initialImprovementPoints);
  const [leaderEvaluations, setLeaderEvaluations] = useState<LeaderEvaluation[]>(initialLeaderEvaluations);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('Member');
  const [newImprovementPoint, setNewImprovementPoint] = useState('');
  const [selectedRank, setSelectedRank] = useState<number | null>(null);
  const [reviewComment, setReviewComment] = useState('');

  // ─── Member Management ─────────────────────────────────
  const addMember = useCallback(() => {
    if (!newMemberName.trim()) return;
    const newMember: Member = {
      id: `m${Date.now()}`,
      name: newMemberName.trim(),
      role: newMemberRole,
      active: true,
    };
    setMembers(prev => [...prev, newMember]);
    setImprovementPoints(prev =>
      prev.map(ip => ({ ...ip, scores: { ...ip.scores, [newMember.id]: 5 } }))
    );
    setNewMemberName('');
  }, [newMemberName, newMemberRole]);

  const removeMember = useCallback((memberId: string) => {
    setMembers(prev => prev.filter(m => m.id !== memberId));
    setImprovementPoints(prev =>
      prev.map(ip => {
        const newScores = { ...ip.scores };
        delete newScores[memberId];
        return { ...ip, scores: newScores };
      })
    );
  }, []);

  const toggleMember = useCallback((memberId: string) => {
    setMembers(prev =>
      prev.map(m => (m.id === memberId ? { ...m, active: !m.active } : m))
    );
  }, []);

  // ─── Improvement Points ────────────────────────────────
  const addImprovementPoint = useCallback(() => {
    if (!newImprovementPoint.trim()) return;
    const newIp: ImprovementPoint = {
      id: `ip${Date.now()}`,
      description: newImprovementPoint.trim(),
      scores: Object.fromEntries(members.filter(m => m.active).map(m => [m.id, 5])),
    };
    setImprovementPoints(prev => [...prev, newIp]);
    setNewImprovementPoint('');
  }, [newImprovementPoint, members]);

  const updateScore = useCallback((ipId: string, memberId: string, score: number) => {
    setImprovementPoints(prev =>
      prev.map(ip =>
        ip.id === ipId ? { ...ip, scores: { ...ip.scores, [memberId]: Math.max(1, Math.min(10, score)) } } : ip
      )
    );
  }, []);

  // ─── Calculations ──────────────────────────────────────
  const activeMembers = useMemo(() => members.filter(m => m.active), [members]);

  const themeAverages = useMemo(() => {
    return improvementPoints.map(ip => {
      const activeScores = activeMembers.map(m => ip.scores[m.id] || 0);
      const avg = activeScores.length > 0 ? activeScores.reduce((a, b) => a + b, 0) / activeScores.length : 0;
      return { ...ip, average: avg };
    });
  }, [improvementPoints, activeMembers]);

  const rankedThemes = useMemo(() => {
    return [...themeAverages].sort((a, b) => b.average - a.average);
  }, [themeAverages]);

  const recommendedTheme = rankedThemes[0];

  // ─── Leader Evaluation ─────────────────────────────────
  const updateEvaluation = useCallback((evalId: string, value: string) => {
    setLeaderEvaluations(prev =>
      prev.map(e => {
        if (e.id !== evalId) return e;
        const isOverride = value !== e.autoRecommended;
        return {
          ...e,
          value,
          manualOverride: isOverride,
          comment: isOverride ? e.comment : '',
        };
      })
    );
  }, []);

  const updateEvaluationComment = useCallback((evalId: string, comment: string) => {
    setLeaderEvaluations(prev =>
      prev.map(e => (e.id === evalId ? { ...e, comment } : e))
    );
  }, []);

  const leaderEvaluationScores = useMemo(() => {
    const scores: Record<string, number> = {};
    leaderEvaluations.forEach(e => {
      if (!scores[e.improvementPointId]) scores[e.improvementPointId] = 0;
      scores[e.improvementPointId] += EVALUATION_SCORES[e.value] || 0;
    });
    return scores;
  }, [leaderEvaluations]);

  const leaderRecommendedTheme = useMemo(() => {
    const entries = Object.entries(leaderEvaluationScores).sort((a, b) => b[1] - a[1]);
    return entries[0]?.[0] || null;
  }, [leaderEvaluationScores]);

  // ─── Analytics Data ────────────────────────────────────
  const analyticsData = useMemo(() => {
    return rankedThemes.slice(0, 5).map((theme, idx) => ({
      name: theme.description.length > 30 ? theme.description.substring(0, 30) + '...' : theme.description,
      score: Number(theme.average.toFixed(1)),
      rank: idx + 1,
      fill: idx === 0 ? '#fbbf24' : idx === 1 ? '#9ca3af' : idx === 2 ? '#d97706' : '#64748b',
    }));
  }, [rankedThemes]);

  const radarData = useMemo(() => {
    if (selectedRank !== null && rankedThemes[selectedRank - 1]) {
      const theme = rankedThemes[selectedRank - 1];
      return [
        { criteria: 'Feasibility', score: theme.average * 2.5 },
        { criteria: 'Impact', score: theme.average * 2.8 },
        { criteria: 'Cost-Benefit', score: theme.average * 2.2 },
        { criteria: 'Timeline', score: theme.average * 2.0 },
        { criteria: 'Resources', score: theme.average * 1.8 },
        { criteria: 'Risk', score: theme.average * 2.4 },
      ];
    }
    return [
      { criteria: 'Feasibility', score: 7.5 },
      { criteria: 'Impact', score: 8.2 },
      { criteria: 'Cost-Benefit', score: 6.8 },
      { criteria: 'Timeline', score: 7.0 },
      { criteria: 'Resources', score: 6.5 },
      { criteria: 'Risk', score: 7.8 },
    ];
  }, [selectedRank, rankedThemes]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* ═══ Header ═══ */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-navy-900 to-navy-700 flex items-center justify-center">
                <Target size={20} className="text-yellow-400" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900">Step 1: Theme Selection</h1>
            </div>
            <p className="text-sm text-slate-600">
              Evaluate and prioritize improvement themes using member scoring and leader evaluation
            </p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-navy-900 to-navy-800 rounded-lg shadow-lg">
            <Users size={18} className="text-yellow-400" />
            <div>
              <p className="text-xs text-blue-200">Team</p>
              <p className="text-sm font-semibold text-white">Precision Pioneers</p>
            </div>
          </div>
        </div>

        {/* ═══ Member Selection Pills ═══ */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Users size={20} className="text-navy-600" />
              Scoring Members
            </h2>
            <span className="text-xs text-slate-500">{activeMembers.length} active</span>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {members.map(member => (
              <button
                key={member.id}
                onClick={() => toggleMember(member.id)}
                className={`group relative flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  member.active
                    ? 'bg-gradient-to-r from-navy-600 to-navy-700 text-white shadow-md hover:shadow-lg'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                <span>{member.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${member.active ? 'bg-white/20' : 'bg-slate-200'}`}>
                  {member.role}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeMember(member.id);
                  }}
                  className={`ml-1 p-0.5 rounded-full hover:bg-red-500 hover:text-white transition-colors ${
                    member.active ? 'text-white/70' : 'text-slate-400'
                  }`}
                >
                  <X size={14} />
                </button>
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
              placeholder="New member name"
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-navy-500 focus:border-navy-500 outline-none"
            />
            <select
              value={newMemberRole}
              onChange={(e) => setNewMemberRole(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-navy-500 outline-none"
            >
              <option>Member</option>
              <option>Circle Leader</option>
              <option>Facilitator</option>
              <option>Department Head</option>
            </select>
            <button
              onClick={addMember}
              disabled={!newMemberName.trim()}
              className="px-6 py-2 bg-navy-600 hover:bg-navy-700 disabled:bg-slate-300 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              <Plus size={16} /> Add Member
            </button>
          </div>
        </div>

        {/* ═══ Improvement Points Scoring Table ═══ */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50/50">
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Sparkles size={20} className="text-yellow-500" />
              Improvement Points & Member Scoring
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Score each improvement point from 1-10. Average scores are calculated in real-time.
            </p>
          </div>

          <div className="overflow-x-auto">
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full">
                <thead className="bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider w-12">#</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Improvement Point</th>
                    {activeMembers.map(member => (
                      <th key={member.id} className="text-center px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                        {member.name.split(' ')[0]}
                      </th>
                    ))}
                    <th className="text-center px-4 py-3 text-xs font-semibold text-navy-700 uppercase tracking-wider bg-yellow-50">
                      Average
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {improvementPoints.map((ip, idx) => {
                    const avg = themeAverages.find(t => t.id === ip.id)?.average || 0;
                    const isRecommended = recommendedTheme?.id === ip.id;
                    return (
                      <tr key={ip.id} className={`hover:bg-slate-50 transition-colors ${isRecommended ? 'bg-yellow-50/50' : ''}`}>
                        <td className="px-6 py-3 text-sm text-slate-500">{idx + 1}</td>
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            <p className="text-sm text-slate-800">{ip.description}</p>
                            {isRecommended && (
                              <span className="flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
                                <Star size={12} /> Recommended
                              </span>
                            )}
                          </div>
                        </td>
                        {activeMembers.map(member => (
                          <td key={member.id} className="px-4 py-3 text-center">
                            <input
                              type="number"
                              min="1"
                              max="10"
                              value={ip.scores[member.id] || 0}
                              onChange={(e) => updateScore(ip.id, member.id, parseInt(e.target.value) || 0)}
                              className="w-16 px-2 py-1 border border-slate-300 rounded text-center text-sm focus:ring-2 focus:ring-navy-500 focus:border-navy-500 outline-none"
                            />
                          </td>
                        ))}
                        <td className="px-4 py-3 text-center bg-yellow-50/50">
                          <span className={`text-lg font-bold ${avg >= 8 ? 'text-emerald-600' : avg >= 6 ? 'text-blue-600' : 'text-slate-600'}`}>
                            {avg.toFixed(1)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={newImprovementPoint}
                onChange={(e) => setNewImprovementPoint(e.target.value)}
                placeholder="Add new improvement point..."
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-navy-500 focus:border-navy-500 outline-none"
              />
              <button
                onClick={addImprovementPoint}
                disabled={!newImprovementPoint.trim()}
                className="px-6 py-2 bg-navy-600 hover:bg-navy-700 disabled:bg-slate-300 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <Plus size={16} /> Add Improvement Point
              </button>
            </div>
          </div>
        </div>

        {/* ═══ Theme Selection Leaderboard ═══ */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-6 flex items-center gap-2">
            <Trophy size={20} className="text-yellow-500" />
            Theme Selection Leaderboard
          </h2>

          <div className="space-y-4">
            {rankedThemes.slice(0, 5).map((theme, idx) => {
              const rank = idx + 1;
              return (
                <div
                  key={theme.id}
                  className={`flex items-center gap-4 p-4 rounded-lg border-2 transition-all ${
                    rank === 1
                      ? 'border-yellow-400 bg-gradient-to-r from-yellow-50 to-amber-50 shadow-md'
                      : rank === 2
                      ? 'border-gray-300 bg-gray-50'
                      : rank === 3
                      ? 'border-amber-600/30 bg-amber-50/50'
                      : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex-shrink-0 w-16 flex justify-center">
                    <TrophyIcon rank={rank} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        rank === 1 ? 'bg-yellow-400 text-yellow-900' :
                        rank === 2 ? 'bg-gray-300 text-gray-700' :
                        rank === 3 ? 'bg-amber-600 text-white' :
                        'bg-slate-300 text-slate-700'
                      }`}>
                        Rank #{rank}
                      </span>
                      {rank === 1 && (
                        <span className="text-xs font-semibold text-yellow-700">🏆 Top Recommended</span>
                      )}
                    </div>
                    <p className={`text-sm font-medium ${rank === 1 ? 'text-slate-900' : 'text-slate-700'}`}>
                      {theme.description}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className={`text-2xl font-bold ${rank === 1 ? 'text-yellow-600' : 'text-slate-600'}`}>
                      {theme.average.toFixed(1)}
                    </p>
                    <p className="text-xs text-slate-500">avg score</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ═══ Circle Leader Evaluation Matrix ═══ */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-navy-900 to-navy-800">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Crown size={20} className="text-yellow-400" />
              Circle Leader Evaluation Matrix
            </h2>
            <p className="text-xs text-blue-200 mt-1">
              Evaluate each improvement point using ◎ (Excellent), ○ (Good), △ (Fair), × (Poor)
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Improvement Point</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Criteria</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Auto-Rec.</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Evaluation</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Comment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {improvementPoints.map(ip => {
                  const evals = leaderEvaluations.filter(e => e.improvementPointId === ip.id);
                  const isLeaderRecommended = leaderRecommendedTheme === ip.id;
                  return evals.map((eval_, idx) => (
                    <tr key={eval_.id} className={`hover:bg-slate-50 transition-colors ${isLeaderRecommended && idx === 0 ? 'bg-yellow-50/30' : ''}`}>
                      {idx === 0 && (
                        <td className="px-6 py-3 border-r border-slate-100" rowSpan={evals.length}>
                          <div className="flex items-center gap-2">
                            <p className="text-sm text-slate-800">{ip.description}</p>
                            {isLeaderRecommended && (
                              <span className="flex items-center gap-1 px-2 py-0.5 bg-navy-100 text-navy-700 text-xs font-medium rounded-full">
                                <Award size={12} /> Leader Rec.
                              </span>
                            )}
                          </div>
                        </td>
                      )}
                      <td className="px-4 py-3 text-center text-sm text-slate-700">{eval_.criteria}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-lg font-semibold text-navy-600">{eval_.autoRecommended}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <select
                          value={eval_.value}
                          onChange={(e) => updateEvaluation(eval_.id, e.target.value)}
                          className={`px-3 py-1 border rounded text-center text-lg font-semibold focus:ring-2 focus:ring-navy-500 outline-none ${
                            eval_.manualOverride
                              ? 'border-amber-400 bg-amber-50 text-amber-700'
                              : 'border-slate-300 bg-white text-navy-700'
                          }`}
                        >
                          {EVALUATION_VALUES.map(val => (
                            <option key={val} value={val}>{val}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        {eval_.manualOverride ? (
                          <input
                            type="text"
                            value={eval_.comment}
                            onChange={(e) => updateEvaluationComment(eval_.id, e.target.value)}
                            placeholder="Required: explain override..."
                            className="w-full px-3 py-1 border border-amber-300 rounded text-sm bg-amber-50 focus:ring-2 focus:ring-amber-500 outline-none"
                          />
                        ) : (
                          <span className="text-xs text-slate-400 italic">Auto-recommended</span>
                        )}
                      </td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ═══ Evaluation Analytics ═══ */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <BarChart3 size={20} className="text-navy-600" />
              Evaluation Analytics
            </h2>
            {selectedRank !== null && (
              <button
                onClick={() => setSelectedRank(null)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors"
              >
                <X size={16} /> Show All
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bar Chart */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">
                {selectedRank ? `Rank #${selectedRank} Score` : 'All Themes Comparison'}
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={selectedRank ? [analyticsData[selectedRank - 1]] : analyticsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} angle={-20} textAnchor="end" height={80} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                    labelStyle={{ fontWeight: 'bold' }}
                  />
                  <Bar dataKey="score" fill="#1e40af" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 mt-3 justify-center">
                {analyticsData.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedRank(selectedRank === item.rank ? null : item.rank)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                      selectedRank === item.rank
                        ? 'bg-navy-600 text-white shadow-md'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Rank #{item.rank}
                  </button>
                ))}
              </div>
            </div>

            {/* Radar Chart */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">
                {selectedRank ? `Rank #${selectedRank} Multi-Criteria Analysis` : 'Overall Criteria Profile'}
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#cbd5e1" />
                  <PolarAngleAxis dataKey="criteria" tick={{ fontSize: 11, fill: '#475569' }} />
                  <PolarRadiusAxis angle={30} domain={[0, 10]} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                  <Radar
                    name="Score"
                    dataKey="score"
                    stroke={selectedRank ? '#1e40af' : '#64748b'}
                    fill={selectedRank ? '#1e40af' : '#94a3b8'}
                    fillOpacity={0.3}
                    strokeWidth={2}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                  />
                </RadarChart>
              </ResponsiveContainer>
              {selectedRank && (
                <div className="mt-3 p-3 bg-navy-50 border border-navy-200 rounded-lg">
                  <p className="text-xs text-navy-700">
                    <span className="font-semibold">Isolated View:</span> Rank #{selectedRank} - {rankedThemes[selectedRank - 1]?.description}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ═══ Management Summary & Approvals ═══ */}
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <CheckCircle2 size={20} className="text-emerald-600" />
            Management Summary & Approvals
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Circle Leader */}
            <div className="p-4 bg-gradient-to-br from-navy-50 to-blue-50 rounded-lg border border-navy-200">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-navy-600 flex items-center justify-center text-white font-bold">
                  CL
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Circle Leader</p>
                  <p className="text-xs text-slate-600">John Doe, Facilitator</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-emerald-600">
                <CheckCircle2 size={14} />
                <span>Approved on {new Date().toLocaleDateString()}</span>
              </div>
            </div>

            {/* Coordinator */}
            <div className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border border-purple-200">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold">
                  CO
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Coordinator</p>
                  <p className="text-xs text-slate-600">Jane Smith, Coordinator</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-amber-600">
                <Clock size={14} />
                <span>Pending Review</span>
              </div>
            </div>

            {/* Dept. Head */}
            <div className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg border border-emerald-200">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold">
                  DH
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Dept. Head</p>
                  <p className="text-xs text-slate-600">Mike Johnson, Department Head</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Clock size={14} />
                <span>Awaiting Coordinator</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder="Review comment from HOS/Admin..."
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-navy-500 focus:border-navy-500 outline-none"
            />
            <button className="px-6 py-2 bg-gradient-to-r from-navy-600 to-navy-700 hover:from-navy-700 hover:to-navy-800 text-white text-sm font-medium rounded-lg transition-all flex items-center gap-2 shadow-md">
              <Send size={16} /> Submit for Review
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
