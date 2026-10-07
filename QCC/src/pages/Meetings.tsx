import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { mockMeetingSchedules, mockMeetingAssignments, mockTeams, TEAM_COLORS } from '../lib/data';
import {
  Calendar, CalendarDays, Clock, Users, MapPin, Plus, Edit2, Trash2, Check, X,
  GripVertical, Search, ChevronDown, Repeat,
  Building2, AlertCircle, Save, Tag
} from 'lucide-react';
import HeaderPortal from '../components/layout/HeaderPortal';
import StatCard, { STAT_GRADIENTS } from '../components/StatCard';
import type { MeetingSchedule } from '../types';
import { useConfirm } from '../components/ConfirmDialog';

const DAYS_OF_WEEK = [
  { id: 'monday', label: 'Monday', short: 'Mon' },
  { id: 'tuesday', label: 'Tuesday', short: 'Tue' },
  { id: 'wednesday', label: 'Wednesday', short: 'Wed' },
  { id: 'thursday', label: 'Thursday', short: 'Thu' },
  { id: 'friday', label: 'Friday', short: 'Fri' },
  { id: 'saturday', label: 'Saturday', short: 'Sat' },
];

const MEETING_TYPES = [
  { value: 'standup', label: 'Standup', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'review', label: 'Review', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { value: 'planning', label: 'Planning', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { value: 'retrospective', label: 'Retrospective', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'general', label: 'General', color: 'bg-slate-100 text-slate-700 border-slate-200' },
];

const RECURRENCE_PATTERNS = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
];

// ─── Recurrence Enforcement Logic ────────────────────────
// Builds a map of teamId → { dayOfWeek → scheduleInfo } to detect conflicts
type TeamWeekMap = Record<string, Record<string, { scheduleId: string; scheduleTitle: string; time: string; pattern: string }[]>>;

function buildTeamWeeklyMap(schedules: MeetingSchedule[]): TeamWeekMap {
  const map: TeamWeekMap = {};
  schedules.forEach(s => {
    if (s.status !== 'active') return;
    s.teamIds.forEach(teamId => {
      if (!map[teamId]) map[teamId] = {};
      if (!map[teamId][s.dayOfWeek]) map[teamId][s.dayOfWeek] = [];
      map[teamId][s.dayOfWeek].push({
        scheduleId: s.id,
        scheduleTitle: s.title,
        time: `${s.startTime}–${s.endTime}`,
        pattern: s.recurrencePattern || 'weekly',
      });
    });
  });
  return map;
}

// For a given team + day, check if they already have a recurring meeting that week
function getTeamDayConflicts(
  teamId: string,
  dayOfWeek: string,
  weekMap: TeamWeekMap,
  excludeScheduleId?: string,
): { hasConflict: boolean; conflicts: { scheduleTitle: string; time: string; pattern: string }[] } {
  const teamDays = weekMap[teamId];
  if (!teamDays) return { hasConflict: false, conflicts: [] };

  // For weekly recurrence: a team can only have ONE meeting per week total
  // Check ALL days for this team — if they have any weekly meeting, they're booked
  const allConflicts: { scheduleTitle: string; time: string; pattern: string; day: string }[] = [];

  DAYS_OF_WEEK.forEach(day => {
    const dayMeetings = teamDays[day.id];
    if (!dayMeetings) return;
    dayMeetings.forEach(m => {
      if (excludeScheduleId && m.scheduleId === excludeScheduleId) return;
      allConflicts.push({ ...m, day: day.label });
    });
  });

  // For weekly pattern: team is blocked if they have ANY weekly meeting anywhere in the week
  const weeklyConflicts = allConflicts.filter(c => c.pattern === 'weekly');
  // For biweekly: team is blocked on alternating weeks — we treat as conflict for safety
  const biweeklyConflicts = allConflicts.filter(c => c.pattern === 'biweekly');
  // Monthly: less restrictive, only block the same day
  const monthlyConflicts = allConflicts.filter(c => c.pattern === 'monthly' && c.day !== dayOfWeek);

  const effectiveConflicts = [...weeklyConflicts, ...biweeklyConflicts];

  return {
    hasConflict: effectiveConflicts.length > 0,
    conflicts: effectiveConflicts,
  };
}

// Returns scheduling state for each team across all days
type TeamSchedulingState = 'available' | 'scheduled' | 'selected' | 'disabled';

function getTeamSchedulingStates(
  teamId: string,
  selectedDay: string,
  selectedTeamIds: string[],
  weekMap: TeamWeekMap,
  excludeScheduleId?: string,
): { state: TeamSchedulingState; reason?: string; meetingInfo?: string } {
  const isSelected = selectedTeamIds.includes(teamId);
  if (isSelected) return { state: 'selected' };

  const teamDays = weekMap[teamId];
  if (!teamDays) return { state: 'available' };

  // Check if team has ANY weekly/biweekly meeting this week
  const { hasConflict, conflicts } = getTeamDayConflicts(teamId, selectedDay, weekMap, excludeScheduleId);

  if (hasConflict) {
    const first = conflicts[0];
    return {
      state: 'disabled',
      reason: `Already has a ${first.pattern} recurring meeting: "${first.scheduleTitle}" (${first.time})`,
      meetingInfo: `${first.scheduleTitle} · ${first.time}`,
    };
  }

  // Check if team has a meeting on this specific day
  const dayMeetings = teamDays[selectedDay];
  if (dayMeetings && dayMeetings.length > 0) {
    const existing = dayMeetings.filter(m => !excludeScheduleId || m.scheduleId !== excludeScheduleId);
    if (existing.length > 0) {
      return {
        state: 'scheduled',
        reason: `Has a meeting on this day: "${existing[0].scheduleTitle}"`,
        meetingInfo: existing.map(m => m.scheduleTitle).join(', '),
      };
    }
  }

  return { state: 'available' };
}

// ─── Multi-Select Team Dropdown with Recurrence Guard ────
function TeamMultiSelect({
  selectedTeamIds,
  onChange,
  existingSchedules,
  selectedDay,
  excludeScheduleId,
}: {
  selectedTeamIds: string[];
  onChange: (ids: string[]) => void;
  existingSchedules: MeetingSchedule[];
  selectedDay: string;
  excludeScheduleId?: string;
}) {
  const askConfirm = useConfirm();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [hoveredTeam, setHoveredTeam] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build the weekly map for conflict detection
  const weekMap = useMemo(() => buildTeamWeeklyMap(existingSchedules), [existingSchedules]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const activeTeams = mockTeams.filter(t => t.status === 'active');

  // Compute scheduling state for each team
  const teamStates = useMemo(() => {
    const states: Record<string, { state: TeamSchedulingState; reason?: string; meetingInfo?: string }> = {};
    activeTeams.forEach(team => {
      states[team.id] = getTeamSchedulingStates(
        team.id, selectedDay, selectedTeamIds, weekMap, excludeScheduleId
      );
    });
    return states;
  }, [activeTeams, selectedDay, selectedTeamIds, weekMap, excludeScheduleId]);

  // Count stats
  const availableCount = activeTeams.filter(t => teamStates[t.id]?.state === 'available').length;
  const disabledCount = activeTeams.filter(t => teamStates[t.id]?.state === 'disabled').length;
  const scheduledCount = activeTeams.filter(t => teamStates[t.id]?.state === 'scheduled').length;

  const filteredTeams = useMemo(() => {
    if (!searchTerm) return activeTeams;
    return activeTeams.filter(t =>
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm, activeTeams]);

  // Sort: available first, then scheduled, then disabled, then selected
  const sortedTeams = useMemo(() => {
    const stateOrder: Record<TeamSchedulingState, number> = { selected: 0, available: 1, scheduled: 2, disabled: 3 };
    return [...filteredTeams].sort((a, b) => {
      const aState = teamStates[a.id]?.state || 'available';
      const bState = teamStates[b.id]?.state || 'available';
      return stateOrder[aState] - stateOrder[bState];
    });
  }, [filteredTeams, teamStates]);

  const getTeamColor = (teamId: string) => {
    const index = mockTeams.findIndex(t => t.id === teamId);
    return TEAM_COLORS[index % TEAM_COLORS.length];
  };

  const toggleTeam = (teamId: string) => {
    const state = teamStates[teamId]?.state;
    if (state === 'disabled') return; // Can't select disabled teams

    if (selectedTeamIds.includes(teamId)) {
      onChange(selectedTeamIds.filter(id => id !== teamId));
    } else {
      onChange([...selectedTeamIds, teamId]);
    }
    setSearchTerm('');
    inputRef.current?.focus();
  };

  const removeTeam = (teamId: string) => {
    onChange(selectedTeamIds.filter(id => id !== teamId));
  };

  const selectAllAvailable = () => {
    const available = activeTeams.filter(t => teamStates[t.id]?.state === 'available').map(t => t.id);
    onChange([...new Set([...selectedTeamIds, ...available])]);
  };

  const clearAll = () => {
    onChange([]);
  };

  const getStateStyles = (state: TeamSchedulingState) => {
    switch (state) {
      case 'selected': return 'bg-blue-50 border-blue-200';
      case 'available': return 'hover:bg-emerald-50/50';
      case 'scheduled': return 'hover:bg-amber-50/50';
      case 'disabled': return 'opacity-50 cursor-not-allowed bg-slate-50/80';
    }
  };

  const getStateBadge = (state: TeamSchedulingState, info?: string) => {
    switch (state) {
      case 'selected':
        return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">Selected</span>;
      case 'available':
        return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">Available</span>;
      case 'scheduled':
        return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">Has Meeting</span>;
      case 'disabled':
        return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold">Booked This Week</span>;
    }
  };

  return (
    <div ref={dropdownRef} className="relative">
      {/* Selected chips area */}
      <div
        onClick={() => { setIsOpen(true); inputRef.current?.focus(); }}
        className={`w-full min-h-[48px] px-3 py-2 border rounded-xl bg-white cursor-text transition-all ${
          isOpen
            ? 'border-blue-400 ring-2 ring-blue-100'
            : 'border-slate-300 hover:border-slate-400'
        }`}
      >
        <div className="flex flex-wrap gap-1.5 items-center">
          {selectedTeamIds.length === 0 && !isOpen && (
            <span className="text-sm text-slate-400 py-0.5">Select teams for this meeting...</span>
          )}
          {selectedTeamIds.map(teamId => {
            const team = mockTeams.find(t => t.id === teamId);
            if (!team) return null;
            return (
              <span
                key={teamId}
                className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200 group"
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: getTeamColor(teamId) }}
                />
                <span className="max-w-[120px] truncate">{team.name}</span>
                <button
                  type="button"
                  onClick={async (e) => { e.stopPropagation(); if (await askConfirm({ title: 'Remove this team?', message: 'This action cannot be undone.' })) removeTeam(teamId); }}
                  className="p-0.5 rounded hover:bg-blue-200 text-blue-500 hover:text-blue-700 transition-colors"
                >
                  <X size={12} />
                </button>
              </span>
            );
          })}
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => setIsOpen(true)}
            placeholder={selectedTeamIds.length > 0 ? 'Add more teams...' : 'Search teams...'}
            className="flex-1 min-w-[120px] py-0.5 text-sm text-slate-700 placeholder-slate-400 outline-none bg-transparent"
          />
        </div>
      </div>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-[scaleIn_0.15s_ease-out]">
          {/* Scheduling Rules Banner */}
          <div className="px-4 py-2.5 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200">
            <div className="flex items-start gap-2">
              <AlertCircle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-semibold text-amber-800">Recurring Meeting Rule: Max 1 per team per week</p>
                <p className="text-[10px] text-amber-600 mt-0.5">
                  Teams with existing weekly/biweekly recurring meetings are automatically disabled.
                  Monthly meetings on different days are allowed.
                </p>
              </div>
            </div>
          </div>

          {/* Search bar */}
          <div className="px-3 py-2.5 border-b border-slate-100 bg-slate-50/80">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-white border border-slate-200 rounded-lg">
              <Search size={14} className="text-slate-400 flex-shrink-0" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by team name, department, or ID..."
                className="flex-1 text-sm text-slate-700 placeholder-slate-400 outline-none bg-transparent"
                autoFocus
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="text-slate-400 hover:text-slate-600">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Status bar with counts */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 bg-white">
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">
                <span className="font-semibold text-slate-700">{selectedTeamIds.length}</span> selected
              </span>
              <span className="text-slate-200">|</span>
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {availableCount} available
              </span>
              {scheduledCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  {scheduledCount} has meeting
                </span>
              )}
              {disabledCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] text-red-500 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  {disabledCount} blocked
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectAllAvailable}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                Select Available
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-slate-500 hover:text-slate-700 font-medium"
              >
                Clear All
              </button>
            </div>
          </div>

          {/* Team list */}
          <div className="max-h-[280px] overflow-y-auto">
            {sortedTeams.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <Search size={20} className="mx-auto text-slate-300 mb-2" />
                <p className="text-xs text-slate-500">No teams match "{searchTerm}"</p>
              </div>
            ) : (
              sortedTeams.map(team => {
                const isSelected = selectedTeamIds.includes(team.id);
                const stateInfo = teamStates[team.id] || { state: 'available' as TeamSchedulingState };
                const isDisabled = stateInfo.state === 'disabled';
                const isHovered = hoveredTeam === team.id;

                return (
                  <div key={team.id} className="relative">
                    <button
                      type="button"
                      onClick={() => toggleTeam(team.id)}
                      onMouseEnter={() => setHoveredTeam(team.id)}
                      onMouseLeave={() => setHoveredTeam(null)}
                      disabled={isDisabled}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${getStateStyles(stateInfo.state)}`}
                    >
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-blue-600 border-blue-600'
                          : isDisabled
                          ? 'border-slate-200 bg-slate-100'
                          : 'border-slate-300'
                      }`}>
                        {isSelected && <Check size={10} className="text-white" />}
                        {isDisabled && <X size={10} className="text-slate-400" />}
                      </div>
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: getTeamColor(team.id) }}
                      />
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-medium block truncate ${isDisabled ? 'text-slate-400' : 'text-slate-800'}`}>
                          {team.name}
                        </span>
                        <span className={`text-[10px] ${isDisabled ? 'text-slate-300' : 'text-slate-500'}`}>
                          {team.department} · {team.id}
                        </span>
                      </div>
                      {getStateBadge(stateInfo.state, stateInfo.meetingInfo)}
                    </button>

                    {/* Tooltip for disabled/hovered teams */}
                    {isHovered && isDisabled && stateInfo.reason && (
                      <div className="absolute z-50 left-full top-0 ml-2 w-64 p-3 bg-slate-800 text-white rounded-lg shadow-xl text-xs pointer-events-none">
                        <div className="flex items-start gap-2">
                          <AlertCircle size={12} className="text-red-400 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold text-red-300 mb-1">Cannot Schedule</p>
                            <p className="text-slate-300 leading-relaxed">{stateInfo.reason}</p>
                          </div>
                        </div>
                        <div className="absolute right-full top-3 border-4 border-transparent border-r-slate-800" />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-4 text-[10px] text-slate-500">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400" /> Available
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400" /> Has meeting (same day OK)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-400" /> Blocked (weekly limit reached)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Validation hint */}
      {selectedTeamIds.length > 0 && (
        <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1">
          <Check size={12} /> {selectedTeamIds.length} team{selectedTeamIds.length !== 1 ? 's' : ''} assigned
        </p>
      )}
    </div>
  );
}

// ─── Main Meetings Page ─────────────────────────────────
export default function Meetings() {
  const askConfirm = useConfirm();
  const { user } = useAuth();
  const [schedules, setSchedules] = useState(mockMeetingSchedules);
  const [assignments, setAssignments] = useState(mockMeetingAssignments);
  const [selectedDay, setSelectedDay] = useState<string>('monday');
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<MeetingSchedule | null>(null);
  const [showTeamPanel, setShowTeamPanel] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  const isAdmin = user?.role === 'admin';
  const isLeader = user?.role === 'leader';

  const filteredSchedules = useMemo(() => {
    let filtered = schedules;

    if (isLeader && user) {
      const leaderTeamIds = mockTeams
        .filter(t => t.leaderName === user.name)
        .map(t => t.id);
      filtered = schedules.filter(s =>
        s.teamIds.some(teamId => leaderTeamIds.includes(teamId))
      );
    }

    if (filterType !== 'all') {
      filtered = filtered.filter(s => s.meetingType === filterType);
    }

    if (searchTerm) {
      filtered = filtered.filter(s =>
        s.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return filtered;
  }, [schedules, user, isLeader, filterType, searchTerm]);

  const schedulesByDay = useMemo(() => {
    const grouped: Record<string, MeetingSchedule[]> = {};
    DAYS_OF_WEEK.forEach(day => {
      grouped[day.id] = filteredSchedules.filter(s => s.dayOfWeek === day.id);
    });
    return grouped;
  }, [filteredSchedules]);

  const getTeamColor = (teamId: string) => {
    const index = mockTeams.findIndex(t => t.id === teamId);
    return TEAM_COLORS[index % TEAM_COLORS.length];
  };

  const getTeamName = (teamId: string) => {
    return mockTeams.find(t => t.id === teamId)?.name || 'Unknown Team';
  };

  const handleSaveSchedule = (scheduleData: Partial<MeetingSchedule>) => {
    if (editingSchedule) {
      setSchedules(prev => prev.map(s =>
        s.id === editingSchedule.id ? { ...s, ...scheduleData } : s
      ));
    } else {
      const newSchedule: MeetingSchedule = {
        id: `MS-${String(schedules.length + 1).padStart(3, '0')}`,
        title: scheduleData.title || '',
        description: scheduleData.description,
        dayOfWeek: scheduleData.dayOfWeek || 'monday',
        startTime: scheduleData.startTime || '09:00',
        endTime: scheduleData.endTime || '10:00',
        teamIds: scheduleData.teamIds || [],
        createdBy: user?.id || '',
        createdByName: user?.name || '',
        createdAt: new Date().toISOString(),
        isRecurring: scheduleData.isRecurring || true,
        recurrencePattern: scheduleData.recurrencePattern || 'weekly',
        recurrenceStartDate: scheduleData.recurrenceStartDate,
        recurrenceEndDate: scheduleData.recurrenceEndDate,
        status: 'active',
        location: scheduleData.location,
        meetingType: scheduleData.meetingType || 'general',
      };
      setSchedules(prev => [...prev, newSchedule]);
    }
    setShowCreateModal(false);
    setEditingSchedule(null);
  };

  const handleDeleteSchedule = (scheduleId: string) => {
    setSchedules(prev => prev.filter(s => s.id !== scheduleId));
    setAssignments(prev => prev.filter(a => a.scheduleId !== scheduleId));
  };

  const handleTeamAssignment = (scheduleId: string, teamId: string, checked: boolean) => {
    if (checked) {
      setSchedules(prev => prev.map(s =>
        s.id === scheduleId ? { ...s, teamIds: [...s.teamIds, teamId] } : s
      ));
      const team = mockTeams.find(t => t.id === teamId);
      if (team) {
        setAssignments(prev => [...prev, {
          id: `MA-${String(assignments.length + 1).padStart(3, '0')}`,
          scheduleId,
          teamId,
          teamName: team.name,
          assignedAt: new Date().toISOString(),
          assignedBy: user?.id || '',
        }]);
      }
    } else {
      setSchedules(prev => prev.map(s =>
        s.id === scheduleId ? { ...s, teamIds: s.teamIds.filter(id => id !== teamId) } : s
      ));
      setAssignments(prev => prev.filter(a => !(a.scheduleId === scheduleId && a.teamId === teamId)));
    }
  };

  const handleDragStart = (e: React.DragEvent, teamId: string) => {
    e.dataTransfer.setData('teamId', teamId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, scheduleId: string) => {
    e.preventDefault();
    const teamId = e.dataTransfer.getData('teamId');
    if (teamId && !schedules.find(s => s.id === scheduleId)?.teamIds.includes(teamId)) {
      handleTeamAssignment(scheduleId, teamId, true);
    }
  };

  // ─── Stats ──────────────────────────────────────────
  const totalMeetings = schedules.length;
  const totalTeamAssignments = schedules.reduce((sum, s) => sum + s.teamIds.length, 0);
  const activeSchedules = schedules.filter(s => s.status === 'active').length;

  // Build weekly map for conflict detection
  const weekMap = useMemo(() => buildTeamWeeklyMap(schedules), [schedules]);
  const activeTeamList = mockTeams.filter(t => t.status === 'active');

  // Compute per-team weekly stats
  const teamWeeklyStats = useMemo(() => {
    return activeTeamList.map(team => {
      const daysWithMeetings: string[] = [];
      const totalMeetingsThisWeek = 0;
      let hasWeeklyRecurring = false;
      let hasBiweeklyRecurring = false;

      DAYS_OF_WEEK.forEach(day => {
        const dayMeetings = weekMap[team.id]?.[day.id];
        if (dayMeetings && dayMeetings.length > 0) {
          daysWithMeetings.push(day.id);
          dayMeetings.forEach(m => {
            if (m.pattern === 'weekly') hasWeeklyRecurring = true;
            if (m.pattern === 'biweekly') hasBiweeklyRecurring = true;
          });
        }
      });

      const isFullyBooked = hasWeeklyRecurring || hasBiweeklyRecurring;

      return {
        teamId: team.id,
        teamName: team.name,
        department: team.department,
        daysWithMeetings,
        meetingCount: daysWithMeetings.length,
        isFullyBooked,
        hasWeeklyRecurring,
        hasBiweeklyRecurring,
      };
    });
  }, [activeTeamList, weekMap]);

  const fullyBookedCount = teamWeeklyStats.filter(t => t.isFullyBooked).length;
  const availableTeamsCount = activeTeamList.length - fullyBookedCount;

  return (
    <div className="space-y-6">
      {/* Header action injected into the top bar */}
      {isAdmin && (
        <HeaderPortal>
          <button
            onClick={() => { setShowCreateModal(true); setEditingSchedule(null); }}
            className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
          >
            <Plus size={16} /> Create Meeting Schedule
          </button>
        </HeaderPortal>
      )}

      {/* Summary Cards — click to open the related page */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Total Schedules"
          value={totalMeetings}
          icon={<Calendar size={20} />}
          grad={STAT_GRADIENTS[0 % STAT_GRADIENTS.length]}
          onClick={() => navigate('/meeting-management')}
        />
        <StatCard
          label="Active Recurring"
          value={activeSchedules}
          icon={<Repeat size={20} />}
          grad={STAT_GRADIENTS[1 % STAT_GRADIENTS.length]}
          onClick={() => navigate('/meeting-management')}
        />
        <StatCard
          label="Team Assignments"
          value={totalTeamAssignments}
          icon={<Users size={20} />}
          grad={STAT_GRADIENTS[2 % STAT_GRADIENTS.length]}
          onClick={() => navigate('/team-registration')}
        />
        <StatCard
          label="Active Teams"
          value={mockTeams.filter(t => t.status === 'active').length}
          icon={<Building2 size={20} />}
          grad={STAT_GRADIENTS[3 % STAT_GRADIENTS.length]}
          onClick={() => navigate('/team-registration')}
        />
      </div>

      {/* Weekly Team Availability Overview */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0"><Repeat size={16} /></span>
                Weekly Team Availability
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Teams with weekly/biweekly recurring meetings are blocked from additional scheduling that week
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-emerald-400 border-2 border-emerald-200" />
                <span className="text-slate-600">{availableTeamsCount} Available</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-red-400 border-2 border-red-200" />
                <span className="text-slate-600">{fullyBookedCount} Blocked</span>
              </span>
            </div>
          </div>
        </div>

        {/* Team × Day Grid */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-5 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider w-[200px]">Team</th>
                <th className="text-left px-3 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Dept</th>
                {DAYS_OF_WEEK.map(day => (
                  <th key={day.id} className="text-center px-2 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider min-w-[70px]">
                    {day.short}
                  </th>
                ))}
                <th className="text-center px-3 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {teamWeeklyStats.map(teamStat => {
                const team = mockTeams.find(t => t.id === teamStat.teamId);
                const teamColor = getTeamColor(teamStat.teamId);
                return (
                  <tr key={teamStat.teamId} className={`hover:bg-slate-50/80 transition-colors ${teamStat.isFullyBooked ? 'bg-red-50/30' : ''}`}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: teamColor }} />
                        <span className="text-sm font-medium text-slate-800 truncate">{teamStat.teamName}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500">{teamStat.department}</td>
                    {DAYS_OF_WEEK.map(day => {
                      const dayMeetings = weekMap[teamStat.teamId]?.[day.id];
                      const hasMeeting = dayMeetings && dayMeetings.length > 0;
                      const isWeekly = dayMeetings?.some(m => m.pattern === 'weekly');
                      const isBiweekly = dayMeetings?.some(m => m.pattern === 'biweekly');
                      const isMonthly = dayMeetings?.some(m => m.pattern === 'monthly');

                      return (
                        <td key={day.id} className="px-2 py-3 text-center">
                          {hasMeeting ? (
                            <div
                              className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-[10px] font-bold ${
                                isWeekly
                                  ? 'bg-blue-100 text-blue-700 border border-blue-200'
                                  : isBiweekly
                                  ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                  : isMonthly
                                  ? 'bg-teal-100 text-teal-700 border border-teal-200'
                                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}
                              title={dayMeetings?.map(m => `${m.scheduleTitle} (${m.pattern})`).join('\n')}
                            >
                              {dayMeetings?.length}
                            </div>
                          ) : (
                            <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-50 text-emerald-400 border border-emerald-100">
                              <span className="text-[10px]">—</span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 text-center">
                      {teamStat.isFullyBooked ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                          Blocked
                        </span>
                      ) : teamStat.meetingCount > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          {teamStat.meetingCount} day{teamStat.meetingCount !== 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Free
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Grid Legend */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50">
          <div className="flex flex-wrap items-center gap-4 text-[10px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-blue-100 border border-blue-200 flex items-center justify-center text-[8px] font-bold text-blue-700">1</span>
              Weekly
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-purple-100 border border-purple-200 flex items-center justify-center text-[8px] font-bold text-purple-700">1</span>
              Bi-weekly
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-teal-100 border border-teal-200 flex items-center justify-center text-[8px] font-bold text-teal-700">1</span>
              Monthly
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-emerald-50 border border-emerald-100 flex items-center justify-center text-[8px] text-emerald-400">—</span>
              No meeting
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-400">Hover cells for meeting details</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2 flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
            <Search size={16} className="text-slate-400" />
            <input
              type="text"
              placeholder="Search meetings by title or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-transparent text-sm text-slate-700 outline-none w-full placeholder-slate-400"
            />
          </div>
          <div className="relative">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="appearance-none px-4 py-2.5 pr-10 border border-slate-200 rounded-lg text-sm bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
            >
              <option value="all">All Types</option>
              {MEETING_TYPES.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Weekly Schedule Planner */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center flex-shrink-0"><CalendarDays size={16} /></span>
                Weekly Schedule Planner
              </h2>
              <p className="text-xs text-slate-500 mt-1">Monday through Saturday · Click a day to view and manage meetings</p>
            </div>
            {isAdmin && (
              <button
                onClick={() => setShowTeamPanel(!showTeamPanel)}
                className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
                  showTeamPanel ? 'bg-blue-100 text-blue-700' : 'text-blue-600 hover:bg-blue-50'
                }`}
              >
                <Users size={14} className="inline mr-1.5" />
                {showTeamPanel ? 'Hide' : 'Show'} Team Panel
              </button>
            )}
          </div>
        </div>

        {/* Day Tabs — Monday to Saturday */}
        <div className="flex border-b border-slate-200 overflow-x-auto">
          {DAYS_OF_WEEK.map(day => {
            const count = schedulesByDay[day.id]?.length || 0;
            const isSelected = selectedDay === day.id;
            return (
              <button
                key={day.id}
                onClick={() => setSelectedDay(day.id)}
                className={`flex-1 min-w-[100px] px-3 py-3.5 text-sm font-medium transition-all relative ${
                  isSelected
                    ? 'text-blue-700 bg-blue-50/80'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex flex-col items-center gap-1">
                  <span className="text-sm font-semibold">{day.short}</span>
                  <span className={`text-[10px] ${isSelected ? 'text-blue-500' : 'text-slate-400'}`}>
                    {count} meeting{count !== 1 ? 's' : ''}
                  </span>
                  {count > 0 && (
                    <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-blue-500' : 'bg-slate-300'}`} />
                  )}
                </div>
                {isSelected && (
                  <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-blue-600 rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* Selected Day Content */}
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0"><Calendar size={16} /></span>
                {DAYS_OF_WEEK.find(d => d.id === selectedDay)?.label} Meetings
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {schedulesByDay[selectedDay]?.length || 0} schedule{(schedulesByDay[selectedDay]?.length || 0) !== 1 ? 's' : ''} configured
              </p>
            </div>
            {isAdmin && (
              <button
                onClick={() => { setShowCreateModal(true); setEditingSchedule(null); }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
              >
                <Plus size={14} /> Add to {DAYS_OF_WEEK.find(d => d.id === selectedDay)?.short}
              </button>
            )}
          </div>

          <div className={`grid gap-6 ${showTeamPanel && isAdmin ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'}`}>
            {/* Meetings List */}
            <div className={showTeamPanel && isAdmin ? 'lg:col-span-2 space-y-4' : 'space-y-4'}>
              {schedulesByDay[selectedDay]?.length === 0 ? (
                <div className="text-center py-16 bg-slate-50/50 rounded-xl border-2 border-dashed border-slate-200">
                  <Calendar size={48} className="mx-auto text-slate-300 mb-3" />
                  <p className="text-slate-500 text-sm font-medium">
                    No meetings scheduled for {DAYS_OF_WEEK.find(d => d.id === selectedDay)?.label}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Create a recurring schedule to get started</p>
                  {isAdmin && (
                    <button
                      onClick={() => { setShowCreateModal(true); setEditingSchedule(null); }}
                      className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                    >
                      <Plus size={14} /> Create Meeting Schedule
                    </button>
                  )}
                </div>
              ) : (
                schedulesByDay[selectedDay]?.map(schedule => (
                  <div
                    key={schedule.id}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, schedule.id)}
                    className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <h4 className="text-base font-bold text-slate-800">{schedule.title}</h4>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            MEETING_TYPES.find(t => t.value === schedule.meetingType)?.color
                          }`}>
                            {MEETING_TYPES.find(t => t.value === schedule.meetingType)?.label}
                          </span>
                          {schedule.isRecurring && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 text-indigo-600 border border-indigo-200">
                              <Repeat size={10} /> {schedule.recurrencePattern}
                            </span>
                          )}
                        </div>
                        {schedule.description && (
                          <p className="text-sm text-slate-500">{schedule.description}</p>
                        )}
                      </div>
                      {isAdmin && (
                        <div className="flex gap-1 ml-3">
                          <button
                            onClick={() => { setEditingSchedule(schedule); setShowCreateModal(true); }}
                            className="p-2 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                            title="Edit schedule"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            onClick={async () => { if (await askConfirm({ title: 'Delete this schedule?', message: 'This action cannot be undone.', confirmText: 'Delete' })) handleDeleteSchedule(schedule.id); }}
                            className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                            title="Delete schedule"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Meeting meta grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                        <Clock size={14} className="text-blue-500" />
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wider">Time</p>
                          <p className="text-xs font-semibold text-slate-700">{schedule.startTime} – {schedule.endTime}</p>
                        </div>
                      </div>
                      {schedule.location && (
                        <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                          <MapPin size={14} className="text-rose-500" />
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wider">Location</p>
                            <p className="text-xs font-semibold text-slate-700 truncate">{schedule.location}</p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                        <Repeat size={14} className="text-indigo-500" />
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wider">Recurrence</p>
                          <p className="text-xs font-semibold text-slate-700 capitalize">{schedule.recurrencePattern}</p>
                        </div>
                      </div>
                      {(schedule.recurrenceStartDate || schedule.recurrenceEndDate) && (
                        <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg col-span-2 sm:col-span-1">
                          <Calendar size={14} className="text-teal-500" />
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wider">Date Range</p>
                            <p className="text-xs font-semibold text-slate-700">
                              {schedule.recurrenceStartDate && new Date(schedule.recurrenceStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              {schedule.recurrenceStartDate && schedule.recurrenceEndDate && ' → '}
                              {schedule.recurrenceEndDate && new Date(schedule.recurrenceEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                        <div className={`w-3 h-3 rounded-full ${
                          schedule.status === 'active' ? 'bg-emerald-500' :
                          schedule.status === 'paused' ? 'bg-amber-500' : 'bg-slate-400'
                        }`} />
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wider">Status</p>
                          <p className="text-xs font-semibold text-slate-700 capitalize">{schedule.status}</p>
                        </div>
                      </div>
                    </div>

                    {/* Assigned Teams */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                          <Tag size={12} className="text-slate-400" />
                          Assigned Teams ({schedule.teamIds.length})
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {schedule.teamIds.map(teamId => (
                          <div
                            key={teamId}
                            className="group flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 hover:border-blue-300 transition-colors"
                            style={{ borderLeftColor: getTeamColor(teamId), borderLeftWidth: '3px' }}
                          >
                            <span className="text-xs font-medium text-slate-700">{getTeamName(teamId)}</span>
                            {isAdmin && (
                              <button
                                onClick={() => handleTeamAssignment(schedule.id, teamId, false)}
                                className="text-slate-400 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                                title="Remove team"
                              >
                                <X size={12} />
                              </button>
                            )}
                          </div>
                        ))}
                        {schedule.teamIds.length === 0 && (
                          <span className="text-xs text-slate-400 italic">No teams assigned yet</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Team Panel */}
            {showTeamPanel && isAdmin && (
              <div className="lg:col-span-1">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 sticky top-6">
                  <h4 className="text-sm font-semibold text-slate-800 mb-1">Available Teams</h4>
                  <p className="text-[10px] text-slate-500 mb-3">Drag teams onto meeting cards to assign</p>
                  <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
                    {mockTeams.filter(t => t.status === 'active').map(team => (
                      <div
                        key={team.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, team.id)}
                        className="flex items-center gap-2.5 p-2.5 bg-white rounded-lg border border-slate-200 hover:border-blue-300 hover:shadow-sm cursor-move transition-all"
                      >
                        <GripVertical size={14} className="text-slate-300" />
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: getTeamColor(team.id) }}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-slate-700 block truncate">{team.name}</span>
                          <span className="text-[10px] text-slate-400">{team.department}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <MeetingScheduleModal
          schedule={editingSchedule}
          onSave={handleSaveSchedule}
          onClose={() => { setShowCreateModal(false); setEditingSchedule(null); }}
          selectedDay={selectedDay}
          existingSchedules={schedules}
        />
      )}
    </div>
  );
}

// ─── Meeting Schedule Modal ─────────────────────────────
function MeetingScheduleModal({
  schedule,
  onSave,
  onClose,
  selectedDay,
  existingSchedules,
}: {
  schedule: MeetingSchedule | null;
  onSave: (data: Partial<MeetingSchedule>) => void;
  onClose: () => void;
  selectedDay: string;
  existingSchedules: MeetingSchedule[];
}) {
  const [formData, setFormData] = useState<Partial<MeetingSchedule>>({
    title: schedule?.title || '',
    description: schedule?.description || '',
    dayOfWeek: schedule?.dayOfWeek || selectedDay as any,
    startTime: schedule?.startTime || '09:00',
    endTime: schedule?.endTime || '10:00',
    teamIds: schedule?.teamIds || [],
    isRecurring: schedule?.isRecurring ?? true,
    recurrencePattern: schedule?.recurrencePattern || 'weekly',
    recurrenceStartDate: schedule?.recurrenceStartDate || new Date().toISOString().split('T')[0],
    recurrenceEndDate: schedule?.recurrenceEndDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    location: schedule?.location || '',
    meetingType: schedule?.meetingType || 'general',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflictWarnings, setConflictWarnings] = useState<string[]>([]);

  // Build week map for conflict detection
  const weekMap = useMemo(() => buildTeamWeeklyMap(existingSchedules), [existingSchedules]);

  // Check for conflicts when team selection changes
  useEffect(() => {
    if (!formData.isRecurring || formData.recurrencePattern === 'monthly') {
      setConflictWarnings([]);
      return;
    }

    const warnings: string[] = [];
    const selectedDay = formData.dayOfWeek || 'monday';

    (formData.teamIds || []).forEach(teamId => {
      const { hasConflict, conflicts } = getTeamDayConflicts(teamId, selectedDay, weekMap, schedule?.id);
      if (hasConflict) {
        const team = mockTeams.find(t => t.id === teamId);
        const teamName = team?.name || teamId;
        conflicts.forEach(c => {
          warnings.push(`${teamName} already has a ${c.pattern} meeting: "${c.scheduleTitle}"`);
        });
      }
    });

    setConflictWarnings(warnings);
  }, [formData.teamIds, formData.dayOfWeek, formData.isRecurring, formData.recurrencePattern, weekMap, schedule?.id]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!formData.title?.trim()) errs.title = 'Meeting title is required.';
    if (!formData.dayOfWeek) errs.dayOfWeek = 'Day is required.';
    if (!formData.startTime) errs.startTime = 'Start time is required.';
    if (!formData.endTime) errs.endTime = 'End time is required.';
    if (!formData.teamIds || formData.teamIds.length === 0) errs.teamIds = 'At least one team must be assigned.';
    if (formData.startTime && formData.endTime && formData.startTime >= formData.endTime) {
      errs.endTime = 'End time must be after start time.';
    }
    if (formData.isRecurring) {
      if (!formData.recurrenceStartDate) errs.recurrenceStartDate = 'Start Date is required for recurring meetings.';
      if (!formData.recurrenceEndDate) errs.recurrenceEndDate = 'End Date is required for recurring meetings.';
      if (formData.recurrenceStartDate && formData.recurrenceEndDate && formData.recurrenceStartDate >= formData.recurrenceEndDate) {
        errs.recurrenceEndDate = 'End Date must be after Start Date.';
      }

      // Recurrence conflict validation
      if (formData.recurrencePattern !== 'monthly' && conflictWarnings.length > 0) {
        errs.teamIds = `${conflictWarnings.length} team(s) have scheduling conflicts. Remove blocked teams or change recurrence pattern.`;
      }
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    onSave(formData);
  };

  const fieldError = (field: string) => errors[field] ? (
    <p className="flex items-center gap-1 mt-1 text-xs text-red-600">
      <AlertCircle size={11} /> {errors[field]}
    </p>
  ) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-[scaleIn_0.2s_ease-out]">
        {/* Modal Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              {schedule ? 'Edit Meeting Schedule' : 'Create Meeting Schedule'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Assign one schedule to multiple teams on the same day
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Section 1: Basic Info */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">1</div>
              <h3 className="text-sm font-bold text-slate-800">Basic Information</h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Meeting Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => { setFormData({ ...formData, title: e.target.value }); setErrors(p => ({ ...p, title: '' })); }}
                  placeholder="e.g., Weekly Team Standup"
                  className={`w-full px-4 py-2.5 border rounded-lg text-sm outline-none transition-all ${
                    errors.title ? 'border-red-400 bg-red-50/50 focus:ring-2 focus:ring-red-200' : 'border-slate-300 focus:ring-2 focus:ring-blue-100 focus:border-blue-400'
                  }`}
                />
                {fieldError('title')}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Meeting purpose and agenda..."
                  rows={2}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none resize-none"
                />
              </div>

              {/* Meeting Type */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Meeting Type <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {MEETING_TYPES.map(type => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, meetingType: type.value as any })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        formData.meetingType === type.value
                          ? type.color + ' ring-2 ring-offset-1 ring-blue-300'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Schedule */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">2</div>
              <h3 className="text-sm font-bold text-slate-800">Schedule & Timing</h3>
            </div>

            {/* Day selector — visual buttons for Mon-Sat */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Day of Week <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {DAYS_OF_WEEK.map(day => (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => setFormData({ ...formData, dayOfWeek: day.id as any })}
                    className={`py-2.5 rounded-lg text-xs font-semibold transition-all ${
                      formData.dayOfWeek === day.id
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-50 text-slate-600 border border-slate-200 hover:border-blue-300 hover:bg-blue-50'
                    }`}
                  >
                    {day.short}
                  </button>
                ))}
              </div>
              {fieldError('dayOfWeek')}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Start Time <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  required
                  value={formData.startTime}
                  onChange={(e) => { setFormData({ ...formData, startTime: e.target.value }); setErrors(p => ({ ...p, startTime: '' })); }}
                  className={`w-full px-4 py-2.5 border rounded-lg text-sm outline-none transition-all ${
                    errors.startTime ? 'border-red-400 bg-red-50/50' : 'border-slate-300 focus:ring-2 focus:ring-blue-100 focus:border-blue-400'
                  }`}
                />
                {fieldError('startTime')}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  End Time <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  required
                  value={formData.endTime}
                  onChange={(e) => { setFormData({ ...formData, endTime: e.target.value }); setErrors(p => ({ ...p, endTime: '' })); }}
                  className={`w-full px-4 py-2.5 border rounded-lg text-sm outline-none transition-all ${
                    errors.endTime ? 'border-red-400 bg-red-50/50' : 'border-slate-300 focus:ring-2 focus:ring-blue-100 focus:border-blue-400'
                  }`}
                />
                {fieldError('endTime')}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Location</label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="e.g., Room A"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Recurrence */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">3</div>
              <h3 className="text-sm font-bold text-slate-800">Recurrence Settings</h3>
            </div>

            <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-5">
              {/* Recurring toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, isRecurring: !formData.isRecurring })}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                    formData.isRecurring ? 'bg-blue-600' : 'bg-slate-300'
                  }`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    formData.isRecurring ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
                <div>
                  <span className="text-sm font-semibold text-slate-700 block">Recurring Meeting</span>
                  <span className="text-xs text-slate-500">This meeting repeats on a regular schedule</span>
                </div>
              </label>

              {formData.isRecurring && (
                <>
                  {/* Recurrence Pattern */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Recurrence Pattern <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-2">
                      {RECURRENCE_PATTERNS.map(pattern => (
                        <button
                          key={pattern.value}
                          type="button"
                          onClick={() => setFormData({ ...formData, recurrencePattern: pattern.value as any })}
                          className={`flex-1 py-2.5 rounded-lg text-xs font-medium border transition-all ${
                            formData.recurrencePattern === pattern.value
                              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                          }`}
                        >
                          {pattern.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2">
                      {formData.recurrencePattern === 'weekly' && `Repeats every ${DAYS_OF_WEEK.find(d => d.id === formData.dayOfWeek)?.label || 'selected day'}`}
                      {formData.recurrencePattern === 'biweekly' && `Repeats every other ${DAYS_OF_WEEK.find(d => d.id === formData.dayOfWeek)?.label || 'selected day'}`}
                      {formData.recurrencePattern === 'monthly' && `Repeats monthly on the same day`}
                    </p>
                  </div>

                  {/* Start Date & End Date */}
                  <div className="bg-white rounded-lg p-4 border border-slate-200 space-y-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar size={14} className="text-blue-600" />
                      <h4 className="text-sm font-semibold text-slate-800">Recurrence Date Range</h4>
                    </div>
                    <p className="text-xs text-slate-500 -mt-2">Define when this recurring schedule starts and ends</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                          Start Date <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="date"
                          required
                          value={formData.recurrenceStartDate || ''}
                          onChange={(e) => {
                            setFormData({ ...formData, recurrenceStartDate: e.target.value });
                            setErrors(p => ({ ...p, recurrenceStartDate: '' }));
                          }}
                          className={`w-full px-4 py-2.5 border rounded-lg text-sm outline-none transition-all ${
                            errors.recurrenceStartDate
                              ? 'border-red-400 bg-red-50/50 focus:ring-2 focus:ring-red-200'
                              : 'border-slate-300 focus:ring-2 focus:ring-blue-100 focus:border-blue-400'
                          }`}
                        />
                        {errors.recurrenceStartDate && (
                          <p className="flex items-center gap-1 mt-1 text-xs text-red-600">
                            <AlertCircle size={11} /> {errors.recurrenceStartDate}
                          </p>
                        )}
                        {formData.recurrenceStartDate && !errors.recurrenceStartDate && (
                          <p className="text-[10px] text-emerald-600 mt-1 flex items-center gap-1">
                            <Check size={10} /> {new Date(formData.recurrenceStartDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                          End Date <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="date"
                          required
                          value={formData.recurrenceEndDate || ''}
                          min={formData.recurrenceStartDate || ''}
                          onChange={(e) => {
                            setFormData({ ...formData, recurrenceEndDate: e.target.value });
                            setErrors(p => ({ ...p, recurrenceEndDate: '' }));
                          }}
                          className={`w-full px-4 py-2.5 border rounded-lg text-sm outline-none transition-all ${
                            errors.recurrenceEndDate
                              ? 'border-red-400 bg-red-50/50 focus:ring-2 focus:ring-red-200'
                              : 'border-slate-300 focus:ring-2 focus:ring-blue-100 focus:border-blue-400'
                          }`}
                        />
                        {errors.recurrenceEndDate && (
                          <p className="flex items-center gap-1 mt-1 text-xs text-red-600">
                            <AlertCircle size={11} /> {errors.recurrenceEndDate}
                          </p>
                        )}
                        {formData.recurrenceEndDate && !errors.recurrenceEndDate && (
                          <p className="text-[10px] text-emerald-600 mt-1 flex items-center gap-1">
                            <Check size={10} /> {new Date(formData.recurrenceEndDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Duration summary */}
                    {formData.recurrenceStartDate && formData.recurrenceEndDate && !errors.recurrenceStartDate && !errors.recurrenceEndDate && (
                      <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <Repeat size={14} className="text-blue-600 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-medium text-blue-800">
                            {(() => {
                              const start = new Date(formData.recurrenceStartDate!);
                              const end = new Date(formData.recurrenceEndDate!);
                              const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                              const weeks = Math.floor(diffDays / 7);
                              const months = Math.floor(diffDays / 30);
                              if (months > 0) return `Duration: ~${months} month${months !== 1 ? 's' : ''} (${diffDays} days)`;
                              if (weeks > 0) return `Duration: ${weeks} week${weeks !== 1 ? 's' : ''} (${diffDays} days)`;
                              return `Duration: ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
                            })()}
                          </p>
                          <p className="text-[10px] text-blue-600 mt-0.5">
                            {(() => {
                              const start = new Date(formData.recurrenceStartDate!);
                              const end = new Date(formData.recurrenceEndDate!);
                              const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                              let occurrences = 0;
                              if (formData.recurrencePattern === 'weekly') occurrences = Math.ceil(diffDays / 7);
                              else if (formData.recurrencePattern === 'biweekly') occurrences = Math.ceil(diffDays / 14);
                              else if (formData.recurrencePattern === 'monthly') occurrences = Math.ceil(diffDays / 30);
                              return `~${occurrences} occurrence${occurrences !== 1 ? 's' : ''} expected`;
                            })()}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Section 4: Team Assignment */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">4</div>
              <h3 className="text-sm font-bold text-slate-800">Assign Teams</h3>
            </div>

            {/* Conflict Warnings */}
            {conflictWarnings.length > 0 && formData.isRecurring && formData.recurrencePattern !== 'monthly' && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
                <div className="flex items-start gap-2.5">
                  <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-800 mb-1.5">
                      Recurrence Conflict Detected
                    </p>
                    <p className="text-xs text-red-700 mb-2">
                      The following teams already have a weekly/biweekly recurring meeting and cannot be assigned to another:
                    </p>
                    <ul className="space-y-1">
                      {conflictWarnings.map((warning, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-red-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0 mt-1.5" />
                          {warning}
                        </li>
                      ))}
                    </ul>
                    <p className="text-[11px] text-red-600 mt-2 font-medium">
                      → Remove the conflicting teams or change the recurrence pattern to "Monthly" to proceed.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <TeamMultiSelect
              selectedTeamIds={formData.teamIds || []}
              onChange={(ids) => { setFormData({ ...formData, teamIds: ids }); setErrors(p => ({ ...p, teamIds: '' })); }}
              existingSchedules={existingSchedules}
              selectedDay={formData.dayOfWeek || selectedDay}
              excludeScheduleId={schedule?.id}
            />
            {fieldError('teamIds')}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm shadow-blue-600/20"
            >
              <Save size={16} />
              {schedule ? 'Update Schedule' : 'Create Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
