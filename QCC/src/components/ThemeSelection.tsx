import { useState, useMemo } from 'react';
import { Check, Plus, Star, Users, Award, TrendingUp, Target, Crown, Zap, AlertCircle } from 'lucide-react';

interface Member {
  id: string;
  name: string;
}

interface ImprovementPoint {
  id: string;
  sr: number;
  point: string;
  scores: { [memberId: string]: number };
}

interface EvaluationMatrix {
  id: string;
  sr: number;
  theme: string;
  effects: string;
  urgency: string;
  extent: string;
  future: string;
  hoshin: string;
  participation: string;
  activity: string;
  capability: string;
}

const SYMBOL_SCORES: { [key: string]: number } = {
  '◎': 9,
  '○': 3,
  '△': 1,
  '×': 0,
};

const SYMBOL_COLORS: { [key: string]: string } = {
  '◎': 'bg-emerald-100 text-emerald-700 border-emerald-300',
  '○': 'bg-blue-100 text-blue-700 border-blue-300',
  '△': 'bg-yellow-100 text-yellow-700 border-yellow-300',
  '×': 'bg-red-100 text-red-700 border-red-300',
};

const SYMBOLS = ['◎', '○', '△', '×'];

export default function ThemeSelection() {
  const [members] = useState<Member[]>([
    { id: '1', name: 'Rajesh Kumar' },
    { id: '2', name: 'Priya Sharma' },
    { id: '3', name: 'Anil Mehta' },
    { id: '4', name: 'Suresh Patel' },
    { id: '5', name: 'Meena Rao' },
  ]);

  const [selectedMembers, setSelectedMembers] = useState<string[]>(['1', '2', '3']);
  
  const [improvementPoints, setImprovementPoints] = useState<ImprovementPoint[]>([
    {
      id: '1',
      sr: 1,
      point: 'Reduce weld defect rate',
      scores: { '1': 9, '2': 3, '3': 9 },
    },
    {
      id: '2',
      sr: 2,
      point: 'Quality Improve',
      scores: { '1': 3, '2': 3, '3': 3 },
    },
    {
      id: '3',
      sr: 3,
      point: 'Reduce setup time by 40%',
      scores: { '1': 9, '2': 9, '3': 3 },
    },
    {
      id: '4',
      sr: 4,
      point: 'Improve OEE in CNC machines',
      scores: { '1': 3, '2': 9, '3': 3 },
    },
    {
      id: '5',
      sr: 5,
      point: 'Reduce material wastage',
      scores: { '1': 9, '2': 3, '3': 3 },
    },
  ]);

  const [evaluationMatrix, setEvaluationMatrix] = useState<EvaluationMatrix[]>([]);
  const [newPointText, setNewPointText] = useState('');

  // Toggle member selection
  const toggleMember = (memberId: string) => {
    setSelectedMembers(prev => 
      prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  };

  // Update score for a member on a specific improvement point
  const updateScore = (pointId: string, memberId: string, value: number) => {
    setImprovementPoints(prev =>
      prev.map(point =>
        point.id === pointId
          ? { ...point, scores: { ...point.scores, [memberId]: value } }
          : point
      )
    );
  };

  // Calculate average for a row based on selected members
  const calculateAverage = (point: ImprovementPoint): number => {
    if (selectedMembers.length === 0) return 0;
    
    const sum = selectedMembers.reduce((total, memberId) => {
      return total + (point.scores[memberId] || 0);
    }, 0);
    
    return sum / selectedMembers.length;
  };

  // Get top 5 themes by average score
  const getTop5Themes = (): ImprovementPoint[] => {
    if (improvementPoints.length === 0 || selectedMembers.length === 0) return [];

    return [...improvementPoints]
      .sort((a, b) => calculateAverage(b) - calculateAverage(a))
      .slice(0, 5);
  };

  // Update evaluation matrix when top 5 changes
  const updateEvaluationMatrix = () => {
    const top5 = getTop5Themes();
    const newMatrix: EvaluationMatrix[] = top5.map((theme, idx) => ({
      id: theme.id,
      sr: idx + 1,
      theme: theme.point,
      effects: '○',
      urgency: '○',
      extent: '○',
      future: '○',
      hoshin: '○',
      participation: '○',
      activity: '○',
      capability: '○',
    }));
    setEvaluationMatrix(newMatrix);
  };

  // Update symbol in evaluation matrix
  const updateEvaluationSymbol = (matrixId: string, field: keyof EvaluationMatrix, symbol: string) => {
    setEvaluationMatrix(prev =>
      prev.map(row =>
        row.id === matrixId
          ? { ...row, [field]: symbol }
          : row
      )
    );
  };

  // Calculate row total for evaluation matrix
  const calculateRowTotal = (row: EvaluationMatrix): number => {
    const fields: (keyof EvaluationMatrix)[] = ['effects', 'urgency', 'extent', 'future', 'hoshin', 'participation', 'activity', 'capability'];
    return fields.reduce((total, field) => {
      const symbol = row[field] as string;
      return total + (SYMBOL_SCORES[symbol] || 0);
    }, 0);
  };

  // Get color class based on score
  const getScoreColor = (score: number): string => {
    if (score >= 60) return 'bg-emerald-100 text-emerald-700 border-emerald-300';
    if (score >= 45) return 'bg-blue-100 text-blue-700 border-blue-300';
    if (score >= 30) return 'bg-yellow-100 text-yellow-700 border-yellow-300';
    return 'bg-red-100 text-red-700 border-red-300';
  };

  // Get recommendation status
  const getRecommendationStatus = (score: number, rank: number): { label: string; color: string; icon: any } => {
    if (rank === 1 && score >= 60) return { label: 'Recommended', color: 'bg-emerald-600 text-white', icon: Crown };
    if (rank === 2 && score >= 45) return { label: 'Alternate Choice', color: 'bg-blue-600 text-white', icon: Zap };
    return { label: 'Under Review', color: 'bg-yellow-600 text-white', icon: AlertCircle };
  };

  // Add new improvement point
  const addImprovementPoint = () => {
    if (!newPointText.trim()) return;

    const newPoint: ImprovementPoint = {
      id: Date.now().toString(),
      sr: improvementPoints.length + 1,
      point: newPointText.trim(),
      scores: {},
    };

    // Initialize scores for selected members with default value 3
    selectedMembers.forEach(memberId => {
      newPoint.scores[memberId] = 3;
    });

    setImprovementPoints(prev => [...prev, newPoint]);
    setNewPointText('');
  };

  const selectedMemberObjects = useMemo(() => 
    members.filter(m => selectedMembers.includes(m.id)),
    [members, selectedMembers]
  );

  const top5Themes = useMemo(() => getTop5Themes(), [improvementPoints, selectedMembers]);

  // Sort evaluation matrix by total score
  const sortedEvaluationMatrix = useMemo(() => {
    return [...evaluationMatrix].sort((a, b) => calculateRowTotal(b) - calculateRowTotal(a));
  }, [evaluationMatrix]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-[#102A43] mb-2">
                Step 2: Theme Selection
              </h1>
              <p className="text-sm text-[#7A8CA3]">
                Multi-member scoring (1,3,9 scale) • Evaluation matrix • Auto-ranking
              </p>
            </div>
            <div className="flex items-center gap-2 bg-[#082B4A] text-white px-4 py-2 rounded-lg shadow-lg">
              <Users className="w-5 h-5 text-[#C9A46A]" />
              <span className="font-semibold">Kaizen Eagles • {selectedMembers.length} Selected</span>
            </div>
          </div>
        </div>

        {/* Member Selection */}
        <div className="bg-white rounded-xl shadow-lg border border-[#D8E1EA] p-6 mb-6">
          <label className="block text-sm font-bold text-[#102A43] mb-4 uppercase tracking-wide">
            Select Members (Multiple allowed)
          </label>
          <div className="flex flex-wrap gap-3">
            {members.map(member => {
              const isSelected = selectedMembers.includes(member.id);
              return (
                <button
                  key={member.id}
                  onClick={() => toggleMember(member.id)}
                  className={`
                    px-6 py-3 rounded-full font-semibold text-sm transition-all duration-200
                    ${isSelected
                      ? 'bg-[#082B4A] text-white shadow-md'
                      : 'bg-white text-[#082B4A] border-2 border-[#D8E1EA] hover:border-[#082B4A] hover:shadow-sm'
                    }
                  `}
                >
                  <span className="flex items-center gap-2">
                    {isSelected && <Check className="w-4 h-4" />}
                    {member.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Table 1: Dynamic Scoring Table */}
        <div className="bg-white rounded-xl shadow-lg border border-[#D8E1EA] overflow-hidden mb-6">
          <div className="bg-gradient-to-r from-[#082B4A] to-[#0A3A5F] px-6 py-4 border-b border-[#D8E1EA]">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-[#C9A46A]" />
              Table 1: Dynamic Scoring by Members
            </h2>
            <p className="text-xs text-[#C9A46A] mt-1">Rate each improvement point (1=Low, 3=Medium, 9=High)</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#F8FAFC] border-b-2 border-[#D8E1EA]">
                  <th className="px-4 py-4 text-left text-sm font-bold uppercase tracking-wide w-16 text-[#102A43]">
                    SR
                  </th>
                  <th className="px-4 py-4 text-left text-sm font-bold uppercase tracking-wide text-[#102A43]">
                    Improvement Point
                  </th>
                  {selectedMemberObjects.map(member => (
                    <th
                      key={member.id}
                      className="px-4 py-4 text-center text-sm font-bold uppercase tracking-wide bg-[#F0F4F8] text-[#102A43] min-w-[120px]"
                    >
                      {member.name}
                    </th>
                  ))}
                  <th className="px-4 py-4 text-center text-sm font-bold uppercase tracking-wide bg-[#E8F4F8] text-[#102A43] min-w-[120px]">
                    Avg Score
                  </th>
                  <th className="px-4 py-4 text-center text-sm font-bold uppercase tracking-wide min-w-[140px] text-[#102A43]">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {improvementPoints.map((point, idx) => {
                  const avg = calculateAverage(point);
                  const isTop5 = top5Themes.some(t => t.id === point.id);

                  return (
                    <tr
                      key={point.id}
                      className={`border-b border-[#D8E1EA] transition-colors ${
                        isTop5 ? 'bg-[#FFF9E6]' : idx % 2 === 0 ? 'bg-white' : 'bg-[#F8FAFC]'
                      }`}
                    >
                      <td className="px-4 py-4 text-center font-bold text-[#102A43]">
                        {point.sr}
                      </td>
                      <td className="px-4 py-4 text-[#102A43] font-medium">
                        {point.point}
                      </td>
                      {selectedMemberObjects.map(member => (
                        <td key={member.id} className="px-4 py-4">
                          <select
                            value={point.scores[member.id] || 3}
                            onChange={(e) => updateScore(point.id, member.id, Number(e.target.value))}
                            className="w-full px-3 py-2 border-2 border-[#D8E1EA] rounded-lg text-center font-semibold text-[#102A43] focus:border-[#082B4A] focus:outline-none transition-colors bg-white"
                          >
                            {[1, 3, 9].map(val => (
                              <option key={val} value={val}>
                                {val}
                              </option>
                            ))}
                          </select>
                        </td>
                      ))}
                      <td className="px-4 py-4 text-center bg-[#E8F4F8]">
                        <span className={`text-2xl font-bold px-3 py-1 rounded-lg ${
                          avg >= 7 ? 'text-emerald-700' : avg >= 4 ? 'text-blue-700' : 'text-yellow-700'
                        }`}>
                          {selectedMembers.length > 0 ? avg.toFixed(1) : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        {isTop5 ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#C9A46A] text-[#082B4A] rounded-full text-xs font-bold shadow-md">
                            <Star className="w-3 h-3 fill-current" />
                            TOP 5
                          </span>
                        ) : (
                          <span className="text-xs text-[#7A8CA3]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add New Improvement Point */}
        <div className="bg-white rounded-xl shadow-lg border border-[#D8E1EA] p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              value={newPointText}
              onChange={(e) => setNewPointText(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addImprovementPoint()}
              placeholder="Add new improvement point..."
              className="flex-1 px-4 py-3 border-2 border-[#D8E1EA] rounded-lg text-[#102A43] placeholder-[#7A8CA3] focus:border-[#082B4A] focus:outline-none transition-colors"
            />
            <button
              onClick={addImprovementPoint}
              disabled={!newPointText.trim()}
              className="px-6 py-3 bg-[#082B4A] text-white rounded-lg font-bold hover:bg-[#06243D] disabled:bg-[#7A8CA3] disabled:cursor-not-allowed transition-colors shadow-lg flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              ADD IMPROVEMENT POINT
            </button>
          </div>
        </div>

        {/* Generate Evaluation Matrix Button */}
        {top5Themes.length > 0 && evaluationMatrix.length === 0 && (
          <div className="bg-gradient-to-r from-[#082B4A] to-[#0A3A5F] rounded-xl shadow-xl p-6 mb-6 text-center">
            <p className="text-white mb-4 text-lg font-semibold">
              Top 5 themes identified! Generate evaluation matrix for detailed analysis.
            </p>
            <button
              onClick={updateEvaluationMatrix}
              className="px-8 py-3 bg-[#C9A46A] text-[#082B4A] rounded-lg font-bold hover:bg-[#B8935A] transition-colors shadow-lg inline-flex items-center gap-2"
            >
              <TrendingUp className="w-5 h-5" />
              GENERATE EVALUATION MATRIX
            </button>
          </div>
        )}

        {/* Table 2: Evaluation Matrix by Leader */}
        {evaluationMatrix.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg border border-[#D8E1EA] overflow-hidden mb-6">
            <div className="bg-gradient-to-r from-[#082B4A] to-[#0A3A5F] px-6 py-4 border-b border-[#D8E1EA]">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Award className="w-5 h-5 text-[#C9A46A]" />
                Table 2: Evaluation Matrix by Leader
              </h2>
              <p className="text-xs text-[#C9A46A] mt-1">◎=Excellent(9) • ○=Good(3) • △=Moderate(1) • ×=Weak(0)</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  {/* Group Headers */}
                  <tr className="bg-[#082B4A] text-white">
                    <th rowSpan={2} className="px-3 py-3 text-center text-xs font-bold uppercase tracking-wide border-r border-[#0A3A5F] w-12">
                      SR
                    </th>
                    <th rowSpan={2} className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wide border-r border-[#0A3A5F] min-w-[200px]">
                      Theme
                    </th>
                    <th colSpan={5} className="px-3 py-2 text-center text-xs font-bold uppercase tracking-wide bg-[#06243D] border-r border-[#0A3A5F]">
                      Necessity / Impact
                    </th>
                    <th colSpan={3} className="px-3 py-2 text-center text-xs font-bold uppercase tracking-wide bg-[#06243D] border-r border-[#0A3A5F]">
                      Circle Capability
                    </th>
                    <th rowSpan={2} className="px-3 py-3 text-center text-xs font-bold uppercase tracking-wide bg-[#C9A46A] text-[#082B4A] min-w-[100px]">
                      Total
                    </th>
                  </tr>
                  {/* Column Headers */}
                  <tr className="bg-[#F8FAFC] border-b-2 border-[#D8E1EA]">
                    <th className="px-2 py-3 text-center text-xs font-bold text-[#102A43] border-r border-[#D8E1EA]">Effects</th>
                    <th className="px-2 py-3 text-center text-xs font-bold text-[#102A43] border-r border-[#D8E1EA]">Urgency</th>
                    <th className="px-2 py-3 text-center text-xs font-bold text-[#102A43] border-r border-[#D8E1EA]">Extent</th>
                    <th className="px-2 py-3 text-center text-xs font-bold text-[#102A43] border-r border-[#D8E1EA]">Future</th>
                    <th className="px-2 py-3 text-center text-xs font-bold text-[#102A43] border-r-2 border-[#D8E1EA]">Hoshin</th>
                    <th className="px-2 py-3 text-center text-xs font-bold text-[#102A43] border-r border-[#D8E1EA]">Participation</th>
                    <th className="px-2 py-3 text-center text-xs font-bold text-[#102A43] border-r border-[#D8E1EA]">Activity</th>
                    <th className="px-2 py-3 text-center text-xs font-bold text-[#102A43] border-r border-[#D8E1EA]">Capability</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluationMatrix.map((row, idx) => {
                    const total = calculateRowTotal(row);
                    const colorClass = getScoreColor(total);
                    
                    return (
                      <tr
                        key={row.id}
                        className={`border-b border-[#D8E1EA] transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-[#F8FAFC]'}`}
                      >
                        <td className="px-3 py-4 text-center font-bold text-[#102A43] border-r border-[#D8E1EA]">
                          {row.sr}
                        </td>
                        <td className="px-3 py-4 text-[#102A43] font-medium border-r border-[#D8E1EA]">
                          {row.theme}
                        </td>
                        
                        {/* Necessity/Impact Columns */}
                        <td className="px-2 py-4 border-r border-[#D8E1EA]">
                          <select
                            value={row.effects}
                            onChange={(e) => updateEvaluationSymbol(row.id, 'effects', e.target.value)}
                            className={`w-full px-2 py-2 border-2 rounded-lg text-center font-bold text-xl focus:outline-none transition-colors ${SYMBOL_COLORS[row.effects]}`}
                          >
                            {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-4 border-r border-[#D8E1EA]">
                          <select
                            value={row.urgency}
                            onChange={(e) => updateEvaluationSymbol(row.id, 'urgency', e.target.value)}
                            className={`w-full px-2 py-2 border-2 rounded-lg text-center font-bold text-xl focus:outline-none transition-colors ${SYMBOL_COLORS[row.urgency]}`}
                          >
                            {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-4 border-r border-[#D8E1EA]">
                          <select
                            value={row.extent}
                            onChange={(e) => updateEvaluationSymbol(row.id, 'extent', e.target.value)}
                            className={`w-full px-2 py-2 border-2 rounded-lg text-center font-bold text-xl focus:outline-none transition-colors ${SYMBOL_COLORS[row.extent]}`}
                          >
                            {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-4 border-r border-[#D8E1EA]">
                          <select
                            value={row.future}
                            onChange={(e) => updateEvaluationSymbol(row.id, 'future', e.target.value)}
                            className={`w-full px-2 py-2 border-2 rounded-lg text-center font-bold text-xl focus:outline-none transition-colors ${SYMBOL_COLORS[row.future]}`}
                          >
                            {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-4 border-r-2 border-[#D8E1EA]">
                          <select
                            value={row.hoshin}
                            onChange={(e) => updateEvaluationSymbol(row.id, 'hoshin', e.target.value)}
                            className={`w-full px-2 py-2 border-2 rounded-lg text-center font-bold text-xl focus:outline-none transition-colors ${SYMBOL_COLORS[row.hoshin]}`}
                          >
                            {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        
                        {/* Circle Capability Columns */}
                        <td className="px-2 py-4 border-r border-[#D8E1EA]">
                          <select
                            value={row.participation}
                            onChange={(e) => updateEvaluationSymbol(row.id, 'participation', e.target.value)}
                            className={`w-full px-2 py-2 border-2 rounded-lg text-center font-bold text-xl focus:outline-none transition-colors ${SYMBOL_COLORS[row.participation]}`}
                          >
                            {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-4 border-r border-[#D8E1EA]">
                          <select
                            value={row.activity}
                            onChange={(e) => updateEvaluationSymbol(row.id, 'activity', e.target.value)}
                            className={`w-full px-2 py-2 border-2 rounded-lg text-center font-bold text-xl focus:outline-none transition-colors ${SYMBOL_COLORS[row.activity]}`}
                          >
                            {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-4 border-r border-[#D8E1EA]">
                          <select
                            value={row.capability}
                            onChange={(e) => updateEvaluationSymbol(row.id, 'capability', e.target.value)}
                            className={`w-full px-2 py-2 border-2 rounded-lg text-center font-bold text-xl focus:outline-none transition-colors ${SYMBOL_COLORS[row.capability]}`}
                          >
                            {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        
                        {/* Total */}
                        <td className="px-3 py-4 text-center border-r border-[#D8E1EA] bg-[#F8FAFC]">
                          <span className={`text-2xl font-bold px-3 py-2 rounded-lg border-2 ${colorClass}`}>
                            {total}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Final Theme Recommendation */}
        {evaluationMatrix.length > 0 && (
          <div className="bg-gradient-to-br from-[#082B4A] via-[#0A3A5F] to-[#082B4A] rounded-xl shadow-2xl p-8 mb-6">
            <div className="flex items-center gap-3 mb-6">
              <Crown className="w-8 h-8 text-[#C9A46A]" />
              <h2 className="text-2xl font-bold text-white">Final Theme Recommendation</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedEvaluationMatrix.slice(0, 3).map((row, idx) => {
                const total = calculateRowTotal(row);
                const status = getRecommendationStatus(total, idx + 1);
                const StatusIcon = status.icon;
                
                return (
                  <div
                    key={row.id}
                    className={`bg-white rounded-xl p-6 shadow-xl border-2 ${
                      idx === 0 ? 'border-[#C9A46A]' : 'border-[#D8E1EA]'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                          idx === 0 ? 'bg-[#C9A46A] text-[#082B4A]' : 'bg-[#F0F4F8] text-[#102A43]'
                        }`}>
                          #{idx + 1}
                        </div>
                        <div>
                          <div className="text-xs text-[#7A8CA3] font-semibold uppercase">Rank {idx + 1}</div>
                          <div className="text-sm font-bold text-[#102A43]">{row.theme}</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mb-4">
                      <div className="text-xs text-[#7A8CA3] mb-1">Total Score</div>
                      <div className={`text-4xl font-bold px-4 py-2 rounded-lg border-2 inline-block ${getScoreColor(total)}`}>
                        {total}
                      </div>
                      <div className="text-xs text-[#7A8CA3] mt-1">out of 72</div>
                    </div>
                    
                    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold ${status.color}`}>
                      <StatusIcon className="w-4 h-4" />
                      {status.label}
                    </div>
                  </div>
                );
              })}
            </div>

            {sortedEvaluationMatrix.length > 0 && (
              <div className="mt-6 bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
                <div className="flex items-center gap-2 text-white">
                  <Check className="w-5 h-5 text-[#C9A46A]" />
                  <span className="font-semibold">Recommendation Complete</span>
                </div>
                <p className="text-sm text-white/80 mt-2">
                  The theme <strong className="text-[#C9A46A]">"{sortedEvaluationMatrix[0]?.theme}"</strong> has been selected as the primary recommendation with a score of <strong className="text-[#C9A46A]">{calculateRowTotal(sortedEvaluationMatrix[0])}</strong> points.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
