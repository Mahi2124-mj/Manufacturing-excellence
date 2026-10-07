import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Calendar, Clock, Users, Plus, X, Check, Search, ChevronDown,
  ChevronRight, Save, Edit2, Trash2, AlertCircle, CheckCircle2,
  RefreshCw, Filter, Tag, CalendarDays, Info, Copy, ToggleLeft,
  ToggleRight, ChevronUp, Building2, ArrowLeft, MoreVertical,
  CircleDot, Timer, Repeat, Layers, Settings, FileText
} from 'lucide-react';
import { mockTeams, mockRecurringMeetingPlans, mockTimeSlots, TEAM_COLORS, DEPARTMENTS } from '../lib/data';
import { useAuth } from '../lib/auth';
import { useHierarchy } from '../lib/hierarchy';
import type { Team, RecurringMeetingPlan, TimeSlot, TeamMeetingAssignment, RecurrencePattern, DayOfWeek } from '../types';

// ─── Constants ───────────────────────────────────────────
const WEEK_DAYS: { key: DayOfWeek; short: string; label: string }[] = [
  { key: 'Monday', short: 'Mon', label: 'Monday' },
  { key: 'Tuesday', short: 'Tue', label: 'Tuesday' },
  { key: 'Wednesday', short: 'Wed', label: 'Wednesday' },
  { key: 'Thursday', short: 'Thu', label: 'Thursday' },
  { key: 'Friday', short: 'Fri', label: 'Friday' },
  { key: 'Saturday', short: 'Sat', label: 'Saturday' },
];

const RECURRENCE_OPTIONS: { value: RecurrencePattern; label: string; desc: string }[] = [
  { value: 'weekly', label: 'Weekly', desc: 'Every week on selected days' },
  { value: 'biweekly', label: 'Bi-Weekly', desc: 'Every other week on selected days' },
  { value: 'monthly', label: 'Monthly', desc: 'Once per month on a specific date' },
];

const MEETING_TYPES = [
  { value: 'general', label: 'General', color: 'bg-blue-100 text-blue-700' },
  { value: 'review', label: 'Review', color: 'bg-purple-100 text-purple-700' },
  { value: 'planning', label: 'Planning', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'standup', label: 'Standup', color: 'bg-amber-100 text-amber-700' },
  { value: 'retrospective', label: 'Retrospective', color: 'bg-rose-100 text-rose-700' },
];

const DURATION_OPTIONS = [30, 45, 60, 90, 120];

const TIME_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const h = Math.floor(i / 2) + 7;
  const m = i % 2 === 0 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
}).filter(t => {
  const hour = parseInt(t.split(':')[0]);
  return hour >= 7 && hour <= 20;
});

// ─── Types ───────────────────────────────────────────────
interface Toast {
  show: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface FormErrors {
  title?: string;
  teams?: string;
  days?: string;
  timeSlot?: string;
  startDate?: string;
  endDate?: string;
  [key: string]: string | undefined;
}

// ─── Component ───────────────────────────────────────────
export default function MeetingScheduler() {
  const { user } = useAuth();
  const hierarchy = useHierarchy();

  // ── State ──
  const [view, setView] = useState<'list' | 'form' | 'planner'>('list');
  const [plans, setPlans] = useState<RecurringMeetingPlan[]>(mockRecurringMeetingPlans);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [recurrence, setRecurrence] = useState<RecurrencePattern>('weekly');
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>([]);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [startTime, setStartTime] = useState('09:00');
  const [duration, setDuration] = useState(60);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [location, setLocation] = useState('');

  // UI state
  const [errors, setErrors] = useState<FormErrors>({});
  const [toast, setToast] = useState<Toast>({ show: false, message: '', type: 'success' });
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);
  const [teamSearch, setTeamSearch] = useState('');
  const [teamDeptFilter, setTeamDeptFilter] = useState('all');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const teamDropdownRef = useRef<HTMLDivElement>(null);
  const formTopRef = useRef<HTMLDivElement>(null);

  // ── Close dropdown on outside click ──
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (teamDropdownRef.current && !teamDropdownRef.current.contains(e.target as Node)) {
        setShowTeamDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ── Toast ──
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3500);
  }, []);

  // ── Filtered teams ──
  const filteredTeams = useMemo(() => {
    return mockTeams.filter(team => {
      const matchSearch = team.name.toLowerCase().includes(teamSearch.toLowerCase()) ||
        team.id.toLowerCase().includes(teamSearch.toLowerCase()) ||
        team.leaderName.toLowerCase().includes(teamSearch.toLowerCase());
      const matchDept = teamDeptFilter === 'all' || team.department === teamDeptFilter;
      return matchSearch && matchDept;
    });
  }, [teamSearch, teamDeptFilter]);

  const selectedTeamsList = useMemo(() =>
    mockTeams.filter(t => selectedTeamIds.includes(t.id)),
    [selectedTeamIds]
  );

  const endTime = useMemo(() => {
    const [h, m] = startTime.split(':').map(Number);
    const totalMin = h * 60 + m + duration;
    return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
  }, [startTime, duration]);

  // ── Day toggle ──
  const toggleDay = (day: DayOfWeek) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
    setErrors(prev => ({ ...prev, days: undefined }));
  };

  // ── Team toggle ──
  const toggleTeam = (teamId: string) => {
    setSelectedTeamIds(prev =>
      prev.includes(teamId) ? prev.filter(id => id !== teamId) : [...prev, teamId]
    );
    setErrors(prev => ({ ...prev, teams: undefined }));
  };

  const removeTeamChip = (teamId: string) => {
    setSelectedTeamIds(prev => prev.filter(id => id !== teamId));
  };

  const selectAllFiltered = () => {
    const allIds = filteredTeams.map(t => t.id);
    setSelectedTeamIds(prev => [...new Set([...prev, ...allIds])]);
  };

  const deselectAll = () => {
    setSelectedTeamIds([]);
  };

  // ── Open form ──
  const openNewForm = () => {
    setEditingPlanId(null);
    setTitle('');
    setDescription('');
    setRecurrence('weekly');
    setSelectedDays([]);
    setDayOfMonth(1);
    setStartTime('09:00');
    setDuration(60);
    setSelectedTeamIds([]);
    setStartDate('');
    setEndDate('');
    setLocation('');
    setErrors({});
    setView('form');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openEditForm = (plan: RecurringMeetingPlan) => {
    setEditingPlanId(plan.id);
    setTitle(plan.name);
    setDescription(plan.description);
    setRecurrence(plan.recurrencePattern);
    setSelectedDays(plan.selectedDays);
    setDayOfMonth(plan.dayOfMonth || 1);
    const firstSlot = plan.timeSlots[0];
    setStartTime(firstSlot?.startTime || '09:00');
    if (firstSlot) {
      const [sh, sm] = firstSlot.startTime.split(':').map(Number);
      const [eh, em] = firstSlot.endTime.split(':').map(Number);
      setDuration((eh * 60 + em) - (sh * 60 + sm));
    }
    setSelectedTeamIds(plan.teamAssignments.map(a => a.teamId));
    setStartDate(plan.startDate);
    setEndDate(plan.endDate);
    setLocation('');
    setErrors({});
    setView('form');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Validation ──
  const validate = (): boolean => {
    const errs: FormErrors = {};
    if (!title.trim()) errs.title = 'Meeting plan title is required.';
    if (selectedTeamIds.length === 0) errs.teams = 'At least one team must be selected.';
    if (recurrence !== 'monthly' && selectedDays.length === 0) errs.days = 'Select at least one meeting day.';
    if (!startDate) errs.startDate = 'Start date is required.';
    if (!endDate) errs.endDate = 'End date is required.';
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) errs.endDate = 'End date must be after start date.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Save ──
  const handleSave = () => {
    if (!validate()) {
      showToast('Fix the errors first', 'error');
      formTopRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    const timeSlot: TimeSlot = {
      id: `ts-${Date.now()}`,
      startTime,
      endTime,
      label: `${startTime} - ${endTime}`,
    };

    const teamAssignments: TeamMeetingAssignment[] = selectedTeamsList.map((team, i) => ({
      teamId: team.id,
      teamName: team.name,
      department: team.department,
      timeSlotId: timeSlot.id,
      color: TEAM_COLORS[i % TEAM_COLORS.length],
    }));

    if (editingPlanId) {
      setPlans(prev => prev.map(p =>
        p.id === editingPlanId
          ? {
              ...p,
              name: title.trim(),
              description: description.trim(),
              recurrencePattern: recurrence,
              selectedDays,
              dayOfMonth: recurrence === 'monthly' ? dayOfMonth : undefined,
              timeSlots: [timeSlot],
              teamAssignments,
              startDate,
              endDate,
            }
          : p
      ));
      showToast('Meeting plan updated', 'success');
    } else {
      const newPlan: RecurringMeetingPlan = {
        id: `rmp-${Date.now()}`,
        name: title.trim(),
        description: description.trim(),
        recurrencePattern: recurrence,
        selectedDays,
        dayOfMonth: recurrence === 'monthly' ? dayOfMonth : undefined,
        timeSlots: [timeSlot],
        teamAssignments,
        startDate,
        endDate,
        createdBy: user?.id || 'u1',
        createdAt: new Date().toISOString(),
        isActive: true,
      };
      setPlans(prev => [...prev, newPlan]);
      showToast('Meeting plan created', 'success');
    }

    setView('list');
    setEditingPlanId(null);
  };

  // ── Delete ──
  const handleDelete = (planId: string) => {
    setPlans(prev => prev.filter(p => p.id !== planId));
    setShowDeleteConfirm(null);
    showToast('Meeting plan deleted', 'info');
  };

  // ── Toggle active ──
  const togglePlanActive = (planId: string) => {
    setPlans(prev => prev.map(p =>
      p.id === planId ? { ...p, isActive: !p.isActive } : p
    ));
  };

  // ── Field class ──
  const fieldClass = (fieldName: string, hasError: boolean) =>
    `w-full px-4 py-2.5 border rounded-lg text-sm outline-none transition-all duration-200 ${
      hasError
        ? 'border-red-400 bg-red-50/50 focus:ring-2 focus:ring-red-300 focus:border-red-500'
        : 'border-slate-300 bg-white focus:ring-2 focus:ring-blue-400 focus:border-blue-500'
    }`;

  // ─── Render: Toast ─────────────────────────────────────
  const renderToast = () => {
    if (!toast.show) return null;
    const colors = { success: 'bg-emerald-600', error: 'bg-red-600', info: 'bg-blue-600' };
    const icons = { success: <CheckCircle2 size={18} />, error: <AlertCircle size={18} />, info: <Info size={18} /> };
    return (
      <div className="fixed top-6 right-6 z-[100] animate-[slideIn_0.3s_ease-out]">
        <div className={`${colors[toast.type]} text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 max-w-sm`}>
          {icons[toast.type]}
          <p className="text-sm font-medium">{toast.message}</p>
        </div>
      </div>
    );
  };

  // ─── Render: Delete Confirm ────────────────────────────
  const renderDeleteConfirm = () => {
    if (!showDeleteConfirm) return null;
    const plan = plans.find(p => p.id === showDeleteConfirm);
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-[scaleIn_0.2s_ease-out]">
          <div className="bg-red-50 px-6 py-4 border-b border-red-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <Trash2 size={20} className="text-red-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-red-800">Delete Meeting Plan</h3>
              <p className="text-xs text-red-600">{plan?.name}</p>
            </div>
          </div>
          <div className="p-6">
            <p className="text-sm text-slate-600 mb-4">
              Are you sure you want to delete this recurring meeting plan? This will remove all scheduled meetings and team assignments. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDeleteConfirm(null)} className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={() => handleDelete(showDeleteConfirm)} className="px-5 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm">
                Delete Plan
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ─── Render: Weekly Planner ────────────────────────────
  const renderWeeklyPlanner = () => {
    const activePlans = plans.filter(p => p.isActive);
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setView('list')} className="p-2 rounded-lg hover:bg-white text-slate-500 hover:text-blue-600 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Weekly Schedule Planner</h1>
            <p className="text-sm text-slate-500 mt-0.5">Monday to Saturday view of all recurring meetings</p>
          </div>
        </div>

        {/* Legend */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
          <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">Active Plans</h3>
          <div className="flex flex-wrap gap-2">
            {activePlans.map(plan => (
              <div key={plan.id} className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: plan.teamAssignments[0]?.color || '#3b82f6' }} />
                <span className="text-xs font-medium text-slate-700">{plan.name}</span>
                <span className="text-[10px] text-slate-400">({plan.teamAssignments.length} teams)</span>
              </div>
            ))}
            {activePlans.length === 0 && <p className="text-xs text-slate-400 italic">No active meeting plans</p>}
          </div>
        </div>

        {/* Weekly Grid */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              {/* Header */}
              <div className="grid grid-cols-7 border-b border-slate-200">
                <div className="px-4 py-3 bg-slate-50 border-r border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Time</span>
                </div>
                {WEEK_DAYS.map(day => (
                  <div key={day.key} className="px-3 py-3 bg-slate-50 border-r border-slate-100 last:border-r-0 text-center">
                    <p className="text-xs font-bold text-slate-700">{day.short}</p>
                    <p className="text-[10px] text-slate-400">{day.label}</p>
                  </div>
                ))}
              </div>

              {/* Time rows */}
              {['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'].map(time => {
                const hour = parseInt(time.split(':')[0]);
                return (
                  <div key={time} className="grid grid-cols-7 border-b border-slate-50 min-h-[60px]">
                    <div className="px-4 py-2 border-r border-slate-200 bg-slate-50/30">
                      <span className="text-[10px] font-mono text-slate-500">{time}</span>
                    </div>
                    {WEEK_DAYS.map(day => {
                      const meetingsHere = activePlans.filter(plan =>
                        plan.selectedDays.includes(day.key) &&
                        plan.timeSlots.some(ts => {
                          const tsHour = parseInt(ts.startTime.split(':')[0]);
                          return tsHour === hour;
                        })
                      );

                      return (
                        <div key={day.key} className="px-1 py-1 border-r border-slate-50 last:border-r-0 relative">
                          {meetingsHere.map(plan => {
                            const slot = plan.timeSlots.find(ts => parseInt(ts.startTime.split(':')[0]) === hour);
                            if (!slot) return null;
                            return (
                              <div
                                key={plan.id}
                                className="rounded-lg p-1.5 mb-1 text-white text-[10px] leading-tight cursor-pointer hover:opacity-90 transition-opacity"
                                style={{ backgroundColor: plan.teamAssignments[0]?.color || '#3b82f6' }}
                                title={`${plan.name}\n${slot.startTime} - ${slot.endTime}\n${plan.teamAssignments.length} teams`}
                              >
                                <p className="font-semibold truncate">{plan.name}</p>
                                <p className="opacity-80">{slot.startTime}-{slot.endTime}</p>
                                <div className="flex flex-wrap gap-0.5 mt-0.5">
                                  {plan.teamAssignments.slice(0, 3).map(a => (
                                    <span key={a.teamId} className="px-1 py-0.5 bg-white/20 rounded text-[8px] truncate max-w-[60px]">
                                      {a.teamName.split(' ')[0]}
                                    </span>
                                  ))}
                                  {plan.teamAssignments.length > 3 && (
                                    <span className="px-1 py-0.5 bg-white/20 rounded text-[8px]">
                                      +{plan.teamAssignments.length - 3}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ─── Render: List View ─────────────────────────────────
  if (view === 'list') {
    return (
      <div className="space-y-6">
        {renderToast()}
        {renderDeleteConfirm()}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Recurring Meeting Plans</h1>
            <p className="text-sm text-slate-500 mt-0.5">Schedule and manage recurring meetings for multiple teams</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setView('planner')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors shadow-sm"
            >
              <CalendarDays size={16} /> Weekly Planner
            </button>
            <button
              onClick={openNewForm}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm shadow-blue-600/20 hover:shadow-md"
            >
              <Plus size={16} /> Create Plan
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl p-3.5 shadow-sm border border-slate-200 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
              <Repeat size={16} className="text-blue-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-800">{plans.length}</p>
              <p className="text-[10px] text-slate-500">Total Plans</p>
            </div>
          </div>
          <div className="bg-white rounded-xl p-3.5 shadow-sm border border-slate-200 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 size={16} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-800">{plans.filter(p => p.isActive).length}</p>
              <p className="text-[10px] text-slate-500">Active Plans</p>
            </div>
          </div>
          <div className="bg-white rounded-xl p-3.5 shadow-sm border border-slate-200 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center">
              <Users size={16} className="text-purple-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-800">{plans.reduce((s, p) => s + p.teamAssignments.length, 0)}</p>
              <p className="text-[10px] text-slate-500">Team Assignments</p>
            </div>
          </div>
          <div className="bg-white rounded-xl p-3.5 shadow-sm border border-slate-200 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
              <Calendar size={16} className="text-amber-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-800">{plans.reduce((s, p) => s + p.selectedDays.length, 0)}</p>
              <p className="text-[10px] text-slate-500">Meeting Days/Week</p>
            </div>
          </div>
        </div>

        {/* Plans Grid */}
        <div className="space-y-4">
          {plans.map(plan => {
            const slot = plan.timeSlots[0];
            return (
              <div key={plan.id} className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all hover:shadow-md ${!plan.isActive ? 'opacity-60' : ''}`}>
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-bold text-slate-800 truncate">{plan.name}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          plan.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {plan.isActive ? 'Active' : 'Paused'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-1">{plan.description}</p>
                    </div>
                    <div className="flex items-center gap-1 ml-3">
                      <button
                        onClick={() => togglePlanActive(plan.id)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
                        title={plan.isActive ? 'Pause plan' : 'Activate plan'}
                      >
                        {plan.isActive ? <ToggleRight size={18} className="text-emerald-600" /> : <ToggleLeft size={18} />}
                      </button>
                      <button
                        onClick={() => openEditForm(plan)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors"
                        title="Edit plan"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(plan.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600 transition-colors"
                        title="Delete plan"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <RefreshCw size={13} className="text-slate-400" />
                      <span className="capitalize">{plan.recurrencePattern}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <Clock size={13} className="text-slate-400" />
                      {slot ? `${slot.startTime} - ${slot.endTime}` : '—'}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <CalendarDays size={13} className="text-slate-400" />
                      {plan.selectedDays.length > 0 ? plan.selectedDays.map(d => d.substring(0, 3)).join(', ') : 'Monthly'}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <Users size={13} className="text-slate-400" />
                      {plan.teamAssignments.length} teams
                    </div>
                  </div>

                  {/* Day pills */}
                  {plan.selectedDays.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {WEEK_DAYS.map(day => {
                        const isSelected = plan.selectedDays.includes(day.key);
                        return (
                          <span key={day.key} className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                            isSelected ? 'bg-blue-100 text-blue-700' : 'bg-slate-50 text-slate-400'
                          }`}>
                            {day.short}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Team chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {plan.teamAssignments.map(a => (
                      <span
                        key={a.teamId}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium text-white"
                        style={{ backgroundColor: a.color }}
                      >
                        <div className="w-3.5 h-3.5 rounded-full bg-white/20 flex items-center justify-center text-[7px] font-bold">
                          {a.teamName.split(' ').map(w => w[0]).join('').substring(0, 2)}
                        </div>
                        {a.teamName}
                      </span>
                    ))}
                  </div>

                  {/* Date range */}
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                    <span>{plan.startDate} → {plan.endDate}</span>
                    <span>Created {new Date(plan.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {plans.length === 0 && (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4">
              <Calendar size={32} className="text-slate-400" />
            </div>
            <p className="text-slate-600 font-medium">No meeting plans yet</p>
            <p className="text-sm text-slate-500 mt-1">Create your first recurring meeting plan to get started.</p>
          </div>
        )}
      </div>
    );
  }

  // ─── Render: Planner View ──────────────────────────────
  if (view === 'planner') {
    return (
      <div className="space-y-6">
        {renderToast()}
        {renderWeeklyPlanner()}
      </div>
    );
  }

  // ─── Render: Form View ─────────────────────────────────
  return (
    <div className="space-y-6" ref={formTopRef}>
      {renderToast()}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setView('list')} className="p-2 rounded-lg hover:bg-white text-slate-500 hover:text-blue-600 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              {editingPlanId ? 'Edit Meeting Plan' : 'Create Recurring Meeting Plan'}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Schedule a recurring meeting for one or multiple teams
            </p>
          </div>
        </div>
      </div>

      {/* Section 1: Basic Info */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">1</div>
            Meeting Details
          </h2>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Plan Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text" value={title}
                onChange={e => { setTitle(e.target.value); setErrors(p => ({ ...p, title: undefined })); }}
                placeholder="e.g., Manufacturing Weekly Review"
                className={fieldClass('title', !!errors.title)}
              />
              {errors.title && (
                <p className="flex items-center gap-1 mt-1.5 text-xs text-red-600">
                  <AlertCircle size={12} /> {errors.title}
                </p>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Description <span className="text-[10px] text-slate-400 font-normal">(Optional)</span>
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Brief description of the meeting purpose..."
                rows={2}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-500 outline-none transition-all resize-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Start Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date" value={startDate}
                onChange={e => { setStartDate(e.target.value); setErrors(p => ({ ...p, startDate: undefined })); }}
                className={fieldClass('startDate', !!errors.startDate)}
              />
              {errors.startDate && (
                <p className="flex items-center gap-1 mt-1.5 text-xs text-red-600">
                  <AlertCircle size={12} /> {errors.startDate}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                End Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date" value={endDate}
                onChange={e => { setEndDate(e.target.value); setErrors(p => ({ ...p, endDate: undefined })); }}
                className={fieldClass('endDate', !!errors.endDate)}
              />
              {errors.endDate && (
                <p className="flex items-center gap-1 mt-1.5 text-xs text-red-600">
                  <AlertCircle size={12} /> {errors.endDate}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Team Selection */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">2</div>
            Select Teams <span className="text-red-500">*</span>
          </h2>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            selectedTeamIds.length > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
          }`}>
            {selectedTeamIds.length} selected
          </span>
        </div>
        <div className="p-6 space-y-4">
          {errors.teams && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
              <p className="text-xs text-red-700">{errors.teams}</p>
            </div>
          )}

          {/* Selected Team Chips */}
          {selectedTeamsList.length > 0 && (
            <div className="flex flex-wrap gap-2 p-3 bg-blue-50/50 border border-blue-100 rounded-lg">
              {selectedTeamsList.map(team => (
                <span
                  key={team.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 rounded-full text-xs font-medium text-blue-800 shadow-sm"
                >
                  <div className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center text-[8px] font-bold text-white">
                    {team.name.split(' ').map(w => w[0]).join('').substring(0, 2)}
                  </div>
                  <span className="max-w-[120px] truncate">{team.name}</span>
                  <span className="text-[9px] text-blue-400">({team.department})</span>
                  <button
                    onClick={() => removeTeamChip(team.id)}
                    className="ml-0.5 p-0.5 rounded-full hover:bg-blue-100 text-blue-400 hover:text-blue-700 transition-colors"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              <button
                onClick={deselectAll}
                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-red-600 hover:bg-red-50 rounded-full transition-colors"
              >
                <X size={10} /> Clear All
              </button>
            </div>
          )}

          {/* Multi-Select Dropdown */}
          <div ref={teamDropdownRef} className="relative">
            <button
              onClick={() => setShowTeamDropdown(!showTeamDropdown)}
              className={`w-full flex items-center justify-between px-4 py-2.5 border rounded-lg text-sm transition-all duration-200 ${
                showTeamDropdown
                  ? 'border-blue-500 ring-2 ring-blue-400 bg-white'
                  : 'border-slate-300 bg-white hover:border-blue-400'
              }`}
            >
              <span className={selectedTeamIds.length === 0 ? 'text-slate-400' : 'text-slate-700'}>
                {selectedTeamIds.length === 0 ? 'Search and select teams...' : `${selectedTeamIds.length} team${selectedTeamIds.length > 1 ? 's' : ''} selected`}
              </span>
              <ChevronDown size={16} className={`text-slate-400 transition-transform ${showTeamDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showTeamDropdown && (
              <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                {/* Search & Filter */}
                <div className="p-3 border-b border-slate-100 space-y-2">
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <Search size={14} className="text-slate-400" />
                    <input
                      type="text"
                      value={teamSearch}
                      onChange={e => setTeamSearch(e.target.value)}
                      placeholder="Search teams by name, ID, or leader..."
                      className="bg-transparent text-sm text-slate-700 outline-none w-full"
                      autoFocus
                    />
                    {teamSearch && (
                      <button onClick={() => setTeamSearch('')} className="text-slate-400 hover:text-slate-600">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={teamDeptFilter}
                      onChange={e => setTeamDeptFilter(e.target.value)}
                      className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white outline-none"
                    >
                      <option value="all">All Departments</option>
                      {hierarchy.departments.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <button
                      onClick={selectAllFiltered}
                      className="px-2.5 py-1.5 text-[10px] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                    >
                      Select All
                    </button>
                  </div>
                </div>

                {/* Team List */}
                <div className="max-h-64 overflow-y-auto">
                  {filteredTeams.length === 0 ? (
                    <div className="px-4 py-6 text-center">
                      <Search size={20} className="mx-auto text-slate-300 mb-2" />
                      <p className="text-xs text-slate-400">No teams found</p>
                    </div>
                  ) : (
                    filteredTeams.map(team => {
                      const isSelected = selectedTeamIds.includes(team.id);
                      return (
                        <button
                          key={team.id}
                          onClick={() => toggleTeam(team.id)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                            isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                            isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
                          }`}>
                            {isSelected && <Check size={10} className="text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-800 truncate">{team.name}</span>
                              <span className="text-[9px] font-mono text-blue-600">{team.id}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-500">
                              <Building2 size={10} /> {team.department}
                              <span className="text-slate-300">•</span>
                              <Users size={10} /> {team.members.filter(m => m.isActive).length} members
                              <span className="text-slate-300">•</span>
                              Leader: {team.leaderName}
                            </div>
                          </div>
                          {isSelected && (
                            <CheckCircle2 size={16} className="text-blue-600 flex-shrink-0" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>

                {/* Footer */}
                <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">
                    {filteredTeams.length} teams shown • {selectedTeamIds.length} selected
                  </span>
                  <button
                    onClick={() => setShowTeamDropdown(false)}
                    className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Section 3: Recurrence Settings */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">3</div>
            Recurrence Settings
          </h2>
        </div>
        <div className="p-6 space-y-5">
          {/* Recurrence Pattern */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-3">Frequency</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {RECURRENCE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setRecurrence(opt.value);
                    if (opt.value === 'monthly') setSelectedDays([]);
                  }}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    recurrence === opt.value
                      ? 'border-blue-500 bg-blue-50 shadow-sm'
                      : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      recurrence === opt.value ? 'border-blue-600' : 'border-slate-300'
                    }`}>
                      {recurrence === opt.value && <div className="w-2 h-2 rounded-full bg-blue-600" />}
                    </div>
                    <span className={`text-sm font-semibold ${recurrence === opt.value ? 'text-blue-700' : 'text-slate-700'}`}>
                      {opt.label}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 ml-6">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Day Selector (Mon-Sat) */}
          {recurrence !== 'monthly' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Meeting Days <span className="text-red-500">*</span>
                <span className="text-[10px] text-slate-400 font-normal ml-1">(Monday to Saturday)</span>
              </label>
              {errors.days && (
                <p className="flex items-center gap-1 mb-2 text-xs text-red-600">
                  <AlertCircle size={12} /> {errors.days}
                </p>
              )}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {WEEK_DAYS.map(day => {
                  const isSelected = selectedDays.includes(day.key);
                  return (
                    <button
                      key={day.key}
                      onClick={() => toggleDay(day.key)}
                      className={`relative py-3 px-2 rounded-xl border-2 text-center transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50 shadow-sm'
                          : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-8 h-8 mx-auto rounded-full flex items-center justify-center mb-1 transition-all ${
                        isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                      }`}>
                        <span className="text-xs font-bold">{day.short.substring(0, 2)}</span>
                      </div>
                      <p className={`text-[10px] font-medium ${isSelected ? 'text-blue-700' : 'text-slate-500'}`}>
                        {day.label}
                      </p>
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5">
                          <Check size={12} className="text-blue-600" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              {selectedDays.length > 0 && (
                <p className="mt-2 text-xs text-slate-500">
                  Selected: {selectedDays.join(', ')} ({selectedDays.length} day{selectedDays.length > 1 ? 's' : ''}/week)
                </p>
              )}
            </div>
          )}

          {/* Monthly Day Selector */}
          {recurrence === 'monthly' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Day of Month <span className="text-red-500">*</span>
              </label>
              <select
                value={dayOfMonth}
                onChange={e => setDayOfMonth(parseInt(e.target.value))}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-500 outline-none bg-white"
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                  <option key={d} value={d}>{d}{d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'} of every month</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Section 4: Time Settings */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">4</div>
            Time Settings
          </h2>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Start Time <span className="text-red-500">*</span>
              </label>
              <select
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-500 outline-none bg-white"
              >
                {TIME_OPTIONS.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Duration <span className="text-red-500">*</span>
              </label>
              <select
                value={duration}
                onChange={e => setDuration(parseInt(e.target.value))}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-500 outline-none bg-white"
              >
                {DURATION_OPTIONS.map(d => (
                  <option key={d} value={d}>
                    {d < 60 ? `${d} minutes` : d === 60 ? '1 hour' : `${d / 60}h ${d % 60 > 0 ? `${d % 60}m` : ''}`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                End Time
              </label>
              <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <Clock size={14} className="text-slate-400" />
                <span className="text-sm font-medium text-slate-700">{endTime}</span>
              </div>
            </div>
          </div>

          {/* Time Preview */}
          <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
            <Timer size={16} className="text-blue-600" />
            <div>
              <p className="text-xs font-medium text-blue-800">Meeting Time Preview</p>
              <p className="text-sm font-bold text-blue-900">{startTime} → {endTime} ({duration} min)</p>
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Location / Room <span className="text-[10px] text-slate-400 font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="e.g., Conference Room A, Virtual (Zoom)"
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-500 outline-none transition-all"
            />
          </div>
        </div>
      </div>

      {/* Summary Card */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
        <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
          <FileText size={16} className="text-blue-600" /> Plan Summary
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Title</p>
            <p className="font-semibold text-slate-800 mt-0.5 truncate">{title || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Frequency</p>
            <p className="font-semibold text-slate-800 mt-0.5 capitalize">{recurrence}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Teams</p>
            <p className="font-semibold text-slate-800 mt-0.5">{selectedTeamIds.length} selected</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Schedule</p>
            <p className="font-semibold text-slate-800 mt-0.5">
              {recurrence === 'monthly'
                ? `${dayOfMonth}${dayOfMonth === 1 ? 'st' : dayOfMonth === 2 ? 'nd' : dayOfMonth === 3 ? 'rd' : 'th'} monthly`
                : selectedDays.length > 0 ? `${selectedDays.length} day${selectedDays.length > 1 ? 's' : ''}/week` : '—'
              }
            </p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <button
            onClick={handleSave}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm shadow-blue-600/20"
          >
            <Save size={16} /> {editingPlanId ? 'Update Plan' : 'Create Plan'}
          </button>
          <button
            onClick={() => setView('list')}
            className="flex items-center justify-center gap-2 px-5 py-2.5 text-slate-600 text-sm font-medium hover:bg-slate-50 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Validation Summary */}
      {Object.keys(errors).length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-red-800 flex items-center gap-2 mb-3">
            <AlertCircle size={16} /> Please fix the following errors
          </h3>
          <ul className="space-y-1">
            {Object.entries(errors).map(([key, msg]) => {
              if (!msg) return null;
              return (
                <li key={key} className="flex items-center gap-2 text-xs text-red-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                  {msg}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
