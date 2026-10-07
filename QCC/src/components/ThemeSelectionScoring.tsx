import { useState, useMemo } from 'react';
import { Check, Plus, Star, Users, TrendingUp } from 'lucide-react';

interface Member {
  id: string;
  name: string;
}

interface ImprovementPoint {
  id: string;
  sr: number;
  name: string;
  scores: Record<string, number>;
}

interface ThemeSelectionScoringProps {
  teamName?: string;
  teamMembers?: Member[];
  initialPoints?: ImprovementPoint[];
}

export default function ThemeSelectionScoring({
  teamName = 'Kaizen Eagles',
  teamMembers = [
    { id: 'm1', name: 'Rajesh Kumar' },
    { id: 'm2', name: 'Priya Sharma' },
    { id: 'm3', name: 'Anil Mehta' },
    { id: 'm4', name: 'Suresh Patel' },
    { id: 'm5', name: 'Meena Rao' },
  ],
  initialPoints = [
    {
      id: 'ip1',
      sr: 1,
      name: 'Reduce weld defect rate',
      scores: { m1: 9, m2: 3, m3: 9, m4: 1, m5: 1 },
    },
    {
      id: 'ip2',
      sr: 2,
      name: 'Quality Improve',
      scores: { m1: 3, m2: 3, m3: 3, m4: 1, m5: 1 },
    },
  ],
}: ThemeSelectionScoringProps) {
  const [selectedMembers, setSelectedMembers] = useState<string[]>(['m1', 'm2', 'm3']);
  const [improvementPoints, setImprovementPoints] = useState<ImprovementPoint[]>(initialPoints);
  const [newPointName, setNewPointName] = useState('');

  // Toggle member selection
  const toggleMember = (memberId: string) => {
    setSelectedMembers(prev =>
      prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  };

  // Update score for a specific row and member
  const updateScore = (rowId: string, memberId: string, value: number) => {
    setImprovementPoints(prev =>
      prev.map(point =>
        point.id === rowId
          ? { ...point, scores: { ...point.scores, [memberId]: value } }
          : point
      )
    );
  };

  // Calculate average for a row based on selected members
  const calculateAverage = (point: ImprovementPoint): number => {
    if (selectedMembers.length === 0) return 0;
    
    const sum = selectedMembers.reduce((acc, memberId) => {
      return acc + (point.scores[memberId] || 0);
    }, 0);
    
    return Math.round((sum / selectedMembers.length) * 10) / 10;
  };

  // Get the recommended row (highest average)
  const getRecommendedRowId = (): string | null => {
    if (improvementPoints.length === 0 || selectedMembers.length === 0) return null;
    
    let maxAvg = -1;
    let recommendedId: string | null = null;
    
    improvementPoints.forEach(point => {
      const avg = calculateAverage(point);
      if (avg > maxAvg) {
        maxAvg = avg;
        recommendedId = point.id;
      }
    });
    
    return recommendedId;
  };

  // Add new improvement point
  const addImprovementPoint = () => {
    if (!newPointName.trim()) return;
    
    const newSr = improvementPoints.length + 1;
    const newId = `ip${Date.now()}`;
    
    // Initialize scores with default value 1 for all members
    const defaultScores: Record<string, number> = {};
    teamMembers.forEach(member => {
      defaultScores[member.id] = 1;
    });
    
    const newPoint: ImprovementPoint = {
      id: newId,
      sr: newSr,
      name: newPointName.trim(),
      scores: defaultScores,
    };
    
    setImprovementPoints(prev => [...prev, newPoint]);
    setNewPointName('');
  };

  const recommendedRowId = useMemo(() => getRecommendedRowId(), [improvementPoints, selectedMembers]);
  const selectedMemberObjects = teamMembers.filter(m => selectedMembers.includes(m.id));

  return (
    <div className="w-full max-w-7xl mx-auto p-6 bg-[#F8FAFC]">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold text-[#082B4A] mb-1">
              Step 1: Theme Selection
            </h1>
            <p className="text-sm text-[#7A8CA3]">
              Multi-member scoring • Dynamic columns • Real-time average
            </p>
          </div>
          <div className="bg-[#082B4A] text-white px-4 py-2 rounded-lg shadow-md">
            <div className="flex items-center gap-2">
              <Users size={16} />
              <span className="font-semibold text-sm">{teamName}</span>
              <span className="text-xs opacity-75">• {selectedMembers.length} Selected</span>
            </div>
          </div>
        </div>
      </div>

      {/* Member Selection Section */}
      <div className="mb-6">
        <label className="block text-xs font-semibold text-[#102A43] mb-3 uppercase tracking-wide">
          Select Members (Multiple allowed)
        </label>
        <div className="flex flex-wrap gap-2">
          {teamMembers.map(member => {
            const isSelected = selectedMembers.includes(member.id);
            return (
              <button
                key={member.id}
                onClick={() => toggleMember(member.id)}
                className={`
                  px-4 py-2 rounded-full font-medium text-sm transition-all duration-200
                  flex items-center gap-2
                  ${isSelected
                    ? 'bg-[#06243D] text-white shadow-lg'
                    : 'bg-white text-[#082B4A] border-2 border-[#D8E1EA] hover:border-[#082B4A] hover:shadow-md'
                  }
                `}
              >
                {isSelected && <Check size={16} />}
                {member.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scoring Table */}
      <div className="bg-white rounded-xl shadow-lg border border-[#D8E1EA] overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#082B4A]">
                <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wide border-r border-[#1a3a5c]">
                  SR
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wide border-r border-[#1a3a5c] min-w-[200px]">
                  Improvement Point
                </th>
                
                {/* Dynamic member columns */}
                {selectedMemberObjects.map(member => (
                  <th
                    key={member.id}
                    className="px-4 py-3 text-center text-xs font-semibold text-white uppercase tracking-wide border-r border-[#1a3a5c] bg-[#1a3a5c] min-w-[120px]"
                  >
                    {member.name}
                  </th>
                ))}
                
                <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase tracking-wide border-r border-[#1a3a5c] bg-[#2a4a6c] min-w-[120px]">
                  Avg of Selected
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase tracking-wide min-w-[150px]">
                  Recommended
                </th>
              </tr>
            </thead>
            <tbody>
              {improvementPoints.map(point => {
                const avg = calculateAverage(point);
                const isRecommended = point.id === recommendedRowId;
                
                return (
                  <tr
                    key={point.id}
                    className={`border-b border-[#D8E1EA] hover:bg-[#F8FAFC] transition-colors ${
                      isRecommended ? 'bg-[#FFF9E6]' : ''
                    }`}
                  >
                    <td className="px-4 py-3 text-sm font-semibold text-[#102A43] border-r border-[#D8E1EA]">
                      {point.sr}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-[#102A43] border-r border-[#D8E1EA]">
                      {point.name}
                    </td>
                    
                    {/* Dynamic member score columns */}
                    {selectedMemberObjects.map(member => (
                      <td key={member.id} className="px-4 py-3 text-center border-r border-[#D8E1EA]">
                        <select
                          value={point.scores[member.id] || 1}
                          onChange={(e) => updateScore(point.id, member.id, parseInt(e.target.value))}
                          className="w-16 px-2 py-1.5 text-sm font-semibold text-center border-2 border-[#D8E1EA] rounded-lg bg-white hover:border-[#082B4A] focus:border-[#082B4A] focus:outline-none transition-colors"
                        >
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(val => (
                            <option key={val} value={val}>
                              {val}
                            </option>
                          ))}
                        </select>
                      </td>
                    ))}
                    
                    {/* Average column */}
                    <td className="px-4 py-3 text-center border-r border-[#D8E1EA] bg-[#F1F5F9]">
                      <div className="text-2xl font-bold text-[#082B4A]">
                        {selectedMembers.length > 0 ? avg.toFixed(1) : '-'}
                      </div>
                    </td>
                    
                    {/* Recommended column */}
                    <td className="px-4 py-3 text-center">
                      {isRecommended && (
                        <div className="inline-flex items-center gap-1.5 bg-[#C9A46A] text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-md">
                          <Star size={14} fill="currentColor" />
                          SELECTED THEME
                        </div>
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
      <div className="bg-white rounded-xl shadow-md border border-[#D8E1EA] p-4">
        <div className="flex gap-3">
          <input
            type="text"
            value={newPointName}
            onChange={(e) => setNewPointName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addImprovementPoint()}
            placeholder="Add new improvement point..."
            className="flex-1 px-4 py-2.5 border-2 border-[#D8E1EA] rounded-lg text-sm focus:border-[#082B4A] focus:outline-none transition-colors"
          />
          <button
            onClick={addImprovementPoint}
            disabled={!newPointName.trim()}
            className="px-6 py-2.5 bg-[#06243D] text-white font-semibold text-sm rounded-lg hover:bg-[#082B4A] disabled:bg-[#7A8CA3] disabled:cursor-not-allowed transition-colors flex items-center gap-2 shadow-md"
          >
            <Plus size={18} />
            ADD IMPROVEMENT POINT
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      {selectedMembers.length > 0 && improvementPoints.length > 0 && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow-md border border-[#D8E1EA] p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#082B4A] flex items-center justify-center">
                <Users size={20} className="text-white" />
              </div>
              <div>
                <p className="text-xs text-[#7A8CA3] font-medium">Selected Members</p>
                <p className="text-xl font-bold text-[#082B4A]">{selectedMembers.length}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-md border border-[#D8E1EA] p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#C9A46A] flex items-center justify-center">
                <TrendingUp size={20} className="text-white" />
              </div>
              <div>
                <p className="text-xs text-[#7A8CA3] font-medium">Improvement Points</p>
                <p className="text-xl font-bold text-[#082B4A]">{improvementPoints.length}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-md border border-[#D8E1EA] p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#10b981] flex items-center justify-center">
                <Star size={20} className="text-white" />
              </div>
              <div>
                <p className="text-xs text-[#7A8CA3] font-medium">Highest Average</p>
                <p className="text-xl font-bold text-[#082B4A]">
                  {recommendedRowId
                    ? calculateAverage(improvementPoints.find(p => p.id === recommendedRowId)!).toFixed(1)
                    : '-'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
