import { useState, useMemo } from 'react';
import {
  Calendar, CalendarDays, Users, UserCheck, UserX, Plus, Minus,
  Clock, Repeat, ArrowRight, Save, Info, Search, Filter, Check
} from 'lucide-react';
import { mockTeams } from '../lib/data';
import { useAuth } from '../lib/auth';
import { useHierarchy } from '../lib/hierarchy';

type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly' | 'custom';
type WeekDay = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

const WEEK_DAYS: WeekDay[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const RECURRENCE_OPTIONS: { value: RecurrenceType; label: string; description: string }[] = [
  { value: 'none', label: 'One-time', description: 'Single occurrence only' },
  { value: 'daily', label: 'Daily', description: 'Repeats every day' },
  { value: 'weekly', label: 'Weekly', description: 'Repeats on selected days' },
  { value: 'monthly', label: 'Monthly', description: 'Repeats each month' },
  { value: 'custom', label: 'Custom', description: 'Define your own pattern' },
];

export default function Scheduling() {
  const { user } = useAuth();
  const hierarchy = useHierarchy();

  const today = new Date().toISOString().split('T')[0];
  const defaultEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [assignedTeamIds, setAssignedTeamIds] = useState<string[]>(['QCC-MFG-001', 'QCC-QA-002']);
  const [teamSearch, setTeamSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [recurrence, setRecurrence] = useState<RecurrenceType>('weekly');
  const [selectedDays, setSelectedDays] = useState<WeekDay[]>(['Mon', 'Wed', 'Fri']);
  const [recurrenceStartDate, setRecurrenceStartDate] = useState(today);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(defaultEnd);
  const [customInterval, setCustomInterval] = useState(2);
  const [customUnit, setCustomUnit] = useState<'days' | 'weeks' | 'months'>('weeks');
  const [meetingTime, setMeetingTime] = useState('10:00');
  const [duration, setDuration] = useState('60');
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' | 'info' }>({
    show: false, message: '', type: 'success'
  });

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3500);
  };

  const departments = useMemo(() => [...new Set(mockTeams.map(t => t.department))], []);

  const filteredUnassignedTeams = useMemo(() => {
    return mockTeams.filter(t => {
      if (assignedTeamIds.includes(t.id)) return false;
      if (teamFilter !== 'all' && t.department !== teamFilter) return false;
      if (teamSearch) {
        const q = teamSearch.toLowerCase();
        return (
          t.name.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          t.department.toLowerCase().includes(q) ||
          t.leaderName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [assignedTeamIds, teamFilter, teamSearch]);

  const assignedTeams = useMemo(() => {
    return mockTeams.filter(t => assignedTeamIds.includes(t.id));
  }, [assignedTeamIds]);

  const assignTeam = (teamId: string) => {
    setAssignedTeamIds(prev => [...prev, teamId]);
  };

  const unassignTeam = (teamId: string) => {
    setAssignedTeamIds(prev => prev.filter(id => id !== teamId));
  };

  const assignAll = () => {
    const allIds = filteredUnassignedTeams.map(t => t.id);
    setAssignedTeamIds(prev => [...prev, ...allIds]);
  };

  const unassignAll = () => {
    setAssignedTeamIds([]);
  };

  const toggleDay = (day: WeekDay) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleSave = () => {
    if (!startDate || !endDate) {
      showToast('Select start and end dates', 'error');
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      showToast('End date before start date', 'error');
      return;
    }
    if (assignedTeamIds.length === 0) {
      showToast('Assign at least one team', 'error');
      return;
    }
    showToast(`Schedule created for ${assignedTeamIds.length} team(s)`, 'success');
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    });
  };

  const daysBetween = (start: string, end: string) => {
    if (!start || !end) return 0;
    const diff = new Date(end).getTime() - new Date(start).getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {toast.show && (
        <div className="fixed top-6 right-6 z-[100] animate-[slideIn_0.3s_ease-out]">
          <div className={`${
            toast.type === 'success' ? 'bg-emerald-500' :
            toast.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
          } text-white px-6 py-3.5 rounded-xl shadow-lg flex items-center gap-3`}>
            {toast.type === 'success' ? <Check size={18} /> :
             toast.type === 'error' ? <UserX size={18} /> : <Info size={18} />}
            <p className="text-sm font-medium">{toast.message}</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team Scheduling</h1>
          <p className="text-sm text-slate-600 mt-1">
            Plan and schedule QCC team activities with recurrence patterns
          </p>
        </div>
        <button
          onClick={handleSave}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-all shadow-sm hover:shadow-md"
        >
          <Save size={16} /> Save Schedule
        </button>
      </div>

      {/* Schedule Period - Prominent Date Pickers */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
              <CalendarDays size={20} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Schedule Period</h2>
              <p className="text-sm text-slate-600">Define the overall active window for this schedule</p>
            </div>
          </div>
        </div>

        <div className="p-8 space-y-6">
          {/* Date Pickers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                <span className="text-red-500">*</span>
                Start Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full px-5 py-4 bg-white border-2 border-slate-200 rounded-xl text-base font-semibold text-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all hover:border-slate-300"
                />
              </div>
              <p className="text-xs text-slate-500 mt-2 font-medium">{formatDate(startDate)}</p>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                <span className="text-red-500">*</span>
                End Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  min={startDate}
                  className="w-full px-5 py-4 bg-white border-2 border-slate-200 rounded-xl text-base font-semibold text-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all hover:border-slate-300"
                />
              </div>
              <p className="text-xs text-slate-500 mt-2 font-medium">{formatDate(endDate)}</p>
            </div>
          </div>

          {/* Duration Badge */}
          <div className="flex items-center justify-center pt-2">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-100 rounded-full">
              <Clock size={14} className="text-blue-600" />
              <span className="text-sm font-semibold text-blue-900">
                {daysBetween(startDate, endDate)} day{daysBetween(startDate, endDate) !== 1 ? 's' : ''} duration
              </span>
            </div>
          </div>

          {/* Meeting Time & Duration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                <Clock size={14} className="text-slate-400" />
                Meeting Time
              </label>
              <input
                type="time"
                value={meetingTime}
                onChange={e => setMeetingTime(e.target.value)}
                className="w-full px-5 py-3.5 bg-white border-2 border-slate-200 rounded-xl text-base font-semibold text-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all hover:border-slate-300"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700 mb-3 block">
                Duration
              </label>
              <select
                value={duration}
                onChange={e => setDuration(e.target.value)}
                className="w-full px-5 py-3.5 bg-white border-2 border-slate-200 rounded-xl text-base font-semibold text-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all hover:border-slate-300"
              >
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
                <option value="90">1.5 hours</option>
                <option value="120">2 hours</option>
                <option value="180">3 hours</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Team Assignment - Dual Panel */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                <Users size={20} className="text-indigo-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Team Assignment</h2>
                <p className="text-sm text-slate-600">Move teams between panels to include them in the schedule</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-lg">
                {assignedTeams.length} Assigned
              </span>
              <span className="px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg">
                {filteredUnassignedTeams.length} Available
              </span>
            </div>
          </div>
        </div>

        <div className="p-8 grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-6">
          {/* Assigned Teams Panel */}
          <div className="border-2 border-emerald-200 bg-emerald-50/20 rounded-xl overflow-hidden">
            <div className="px-5 py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-white">
                <UserCheck size={18} />
                <h3 className="text-sm font-bold">Assigned Teams</h3>
                <span className="px-2.5 py-0.5 bg-white/20 backdrop-blur rounded-full text-xs font-bold">
                  {assignedTeams.length}
                </span>
              </div>
              {assignedTeams.length > 0 && (
                <button
                  onClick={unassignAll}
                  className="text-xs text-white/90 hover:text-white font-semibold underline underline-offset-2"
                >
                  Remove all
                </button>
              )}
            </div>

            <div className="p-4 max-h-[480px] overflow-y-auto">
              {assignedTeams.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 mb-4">
                    <UserX size={28} className="text-emerald-400" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700">No teams assigned</p>
                  <p className="text-xs text-slate-500 mt-1">Select teams from the right panel</p>
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {assignedTeams.map(team => (
                    <li
                      key={team.id}
                      className="group bg-white rounded-xl border border-emerald-200 p-4 hover:border-emerald-400 hover:shadow-md transition-all"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                          <UserCheck size={18} className="text-emerald-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-sm font-bold text-slate-900 truncate">{team.name}</h4>
                          </div>
                          <p className="text-[11px] font-mono text-emerald-700 font-semibold">{team.id}</p>
                          <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-600">
                            <span className="font-medium">{team.department}</span>
                            <span className="text-slate-400">•</span>
                            <span>{team.members.filter(m => m.isActive).length} members</span>
                          </div>
                          <p className="text-[11px] text-slate-600 mt-1">
                            Lead: <span className="font-semibold text-slate-800">{team.leaderName}</span>
                          </p>
                        </div>
                        <button
                          onClick={() => unassignTeam(team.id)}
                          className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Remove team"
                        >
                          <Minus size={16} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Transfer Buttons */}
          <div className="hidden lg:flex flex-col items-center justify-center gap-4">
            <button
              onClick={assignAll}
              disabled={filteredUnassignedTeams.length === 0}
              className="w-11 h-11 rounded-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white flex items-center justify-center transition-all shadow-md hover:shadow-lg disabled:shadow-none"
              title="Assign all visible"
            >
              <ArrowRight size={20} className="rotate-180" />
            </button>
            <div className="w-0.5 h-20 bg-slate-200" />
            <button
              onClick={unassignAll}
              disabled={assignedTeams.length === 0}
              className="w-11 h-11 rounded-full bg-slate-200 hover:bg-slate-300 disabled:bg-slate-100 text-slate-700 disabled:text-slate-400 flex items-center justify-center transition-all"
              title="Unassign all"
            >
              <ArrowRight size={20} />
            </button>
          </div>

          {/* Unassigned Teams Panel */}
          <div className="border-2 border-slate-200 bg-slate-50/30 rounded-xl overflow-hidden">
            <div className="px-5 py-4 bg-gradient-to-r from-slate-600 to-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-white">
                <Users size={18} />
                <h3 className="text-sm font-bold">Unassigned Teams</h3>
                <span className="px-2.5 py-0.5 bg-white/20 backdrop-blur rounded-full text-xs font-bold">
                  {filteredUnassignedTeams.length}
                </span>
              </div>
              {filteredUnassignedTeams.length > 0 && (
                <button
                  onClick={assignAll}
                  className="text-xs text-white/90 hover:text-white font-semibold underline underline-offset-2"
                >
                  Add all
                </button>
              )}
            </div>

            {/* Search & Filter */}
            <div className="p-4 border-b border-slate-200 bg-white space-y-3">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <Search size={16} className="text-slate-400" />
                <input
                  type="text"
                  value={teamSearch}
                  onChange={e => setTeamSearch(e.target.value)}
                  placeholder="Search by name, ID, leader..."
                  className="flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter size={14} className="text-slate-400" />
                <select
                  value={teamFilter}
                  onChange={e => setTeamFilter(e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none font-medium"
                >
                  <option value="all">All Departments</option>
                  {hierarchy.departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>

            <div className="p-4 max-h-[380px] overflow-y-auto">
              {filteredUnassignedTeams.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4">
                    <Search size={28} className="text-slate-400" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700">No teams found</p>
                  <p className="text-xs text-slate-500 mt-1">Try adjusting your filters</p>
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {filteredUnassignedTeams.map(team => (
                    <li
                      key={team.id}
                      className="group bg-white rounded-xl border border-slate-200 p-4 hover:border-blue-400 hover:shadow-md transition-all"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                          <Users size={18} className="text-slate-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-bold text-slate-900 truncate">{team.name}</h4>
                          <p className="text-[11px] font-mono text-slate-600 font-semibold">{team.id}</p>
                          <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-600">
                            <span className="font-medium">{team.department}</span>
                            <span className="text-slate-400">•</span>
                            <span>{team.members.filter(m => m.isActive).length} members</span>
                          </div>
                          <p className="text-[11px] text-slate-600 mt-1">
                            Lead: <span className="font-semibold text-slate-800">{team.leaderName}</span>
                          </p>
                        </div>
                        <button
                          onClick={() => assignTeam(team.id)}
                          className="p-2 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                          title="Add team"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Transfer Buttons */}
        <div className="lg:hidden px-8 pb-6 flex gap-3">
          <button
            onClick={assignAll}
            disabled={filteredUnassignedTeams.length === 0}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-sm font-semibold rounded-lg transition-all"
          >
            <Plus size={16} /> Assign All Visible
          </button>
          <button
            onClick={unassignAll}
            disabled={assignedTeams.length === 0}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-slate-200 hover:bg-slate-300 disabled:bg-slate-100 text-slate-700 disabled:text-slate-400 text-sm font-semibold rounded-lg transition-all"
          >
            <Minus size={16} /> Remove All
          </button>
        </div>
      </section>

      {/* Recurrence Settings */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center">
              <Repeat size={20} className="text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Recurrence Settings</h2>
              <p className="text-sm text-slate-600">Define how often this schedule repeats</p>
            </div>
          </div>
        </div>

        <div className="p-8 space-y-7">
          {/* Frequency Selection */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-4">
              Frequency
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {RECURRENCE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setRecurrence(opt.value)}
                  className={`px-4 py-4 rounded-xl border-2 text-left transition-all ${
                    recurrence === opt.value
                      ? 'border-purple-500 bg-purple-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <p className={`text-sm font-bold ${recurrence === opt.value ? 'text-purple-700' : 'text-slate-900'}`}>
                    {opt.label}
                  </p>
                  <p className="text-[11px] text-slate-600 mt-1">{opt.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Weekly Day Selection */}
          {recurrence === 'weekly' && (
            <div className="animate-[fadeIn_0.2s_ease-out]">
              <label className="block text-sm font-semibold text-slate-700 mb-4">
                Repeat on Days
              </label>
              <div className="flex flex-wrap gap-2.5">
                {WEEK_DAYS.map(day => {
                  const isSelected = selectedDays.includes(day);
                  return (
                    <button
                      key={day}
                      onClick={() => toggleDay(day)}
                      className={`w-14 h-14 rounded-xl font-bold text-sm transition-all ${
                        isSelected
                          ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30 scale-105'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
              {selectedDays.length > 0 && (
                <p className="text-xs text-slate-600 mt-3 font-medium">
                  Repeats every {selectedDays.join(', ')}
                </p>
              )}
            </div>
          )}

          {/* Custom Interval */}
          {recurrence === 'custom' && (
            <div className="animate-[fadeIn_0.2s_ease-out]">
              <label className="block text-sm font-semibold text-slate-700 mb-4">
                Custom Interval
              </label>
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-700 font-medium">Repeat every</span>
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={customInterval}
                  onChange={e => setCustomInterval(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20 px-4 py-2.5 border-2 border-slate-200 rounded-lg text-sm font-bold text-center outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-50"
                />
                <select
                  value={customUnit}
                  onChange={e => setCustomUnit(e.target.value as 'days' | 'weeks' | 'months')}
                  className="px-4 py-2.5 border-2 border-slate-200 rounded-lg text-sm font-bold bg-white outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-50"
                >
                  <option value="days">day(s)</option>
                  <option value="weeks">week(s)</option>
                  <option value="months">month(s)</option>
                </select>
              </div>
            </div>
          )}


          {/* Recurrence Date Range */}
          {recurrence !== 'none' && (
            <div className="pt-6 border-t border-slate-200">
              <label className="block text-sm font-semibold text-slate-700 mb-4">
                Recurrence Date Range
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 items-end">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">
                    Recurrence Start Date
                  </label>
                  <input
                    type="date"
                    value={recurrenceStartDate}
                    onChange={e => setRecurrenceStartDate(e.target.value)}
                    min={startDate}
                    max={endDate}
                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-lg text-sm font-semibold text-slate-900 outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-50 transition-all hover:border-slate-300"
                  />
                </div>

                <div className="hidden sm:flex items-center justify-center pb-2">
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                    <ArrowRight size={18} className="text-purple-600" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">
                    Recurrence End Date
                  </label>
                  <input
                    type="date"
                    value={recurrenceEndDate}
                    onChange={e => setRecurrenceEndDate(e.target.value)}
                    min={recurrenceStartDate}
                    max={endDate}
                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-lg text-sm font-semibold text-slate-900 outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-50 transition-all hover:border-slate-300"
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3 text-xs">
                <div className="inline-flex items-center gap-2 px-3 py-2 bg-purple-50 border border-purple-200 rounded-lg">
                  <Calendar size={14} className="text-purple-600" />
                  <span className="text-purple-900 font-semibold">
                    {formatDate(recurrenceStartDate)}
                  </span>
                </div>
                <span className="text-slate-400 self-center font-bold">→</span>
                <div className="inline-flex items-center gap-2 px-3 py-2 bg-purple-50 border border-purple-200 rounded-lg">
                  <Calendar size={14} className="text-purple-600" />
                  <span className="text-purple-900 font-semibold">
                    {formatDate(recurrenceEndDate)}
                  </span>
                </div>
                <span className="text-slate-600 self-center font-medium">
                  ({daysBetween(recurrenceStartDate, recurrenceEndDate)} day span)
                </span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Schedule Summary */}
      <section className="bg-gradient-to-br from-slate-50 to-blue-50/30 rounded-2xl border border-slate-200 p-8">
        <h3 className="text-base font-bold text-slate-900 mb-5 flex items-center gap-2">
          <Info size={18} className="text-blue-600" />
          Schedule Summary
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
            <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Period</p>
            <p className="text-lg font-bold text-slate-900 mt-2">
              {daysBetween(startDate, endDate)} days
            </p>
            <p className="text-xs text-slate-600 mt-1 font-medium">
              {formatDate(startDate).split(',')[0]} → {formatDate(endDate).split(',')[0]}
            </p>
          </div>
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
            <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Teams</p>
            <p className="text-lg font-bold text-slate-900 mt-2">
              {assignedTeams.length} assigned
            </p>
            <p className="text-xs text-slate-600 mt-1 font-medium">
              {assignedTeams.reduce((s, t) => s + t.members.filter(m => m.isActive).length, 0)} total members
            </p>
          </div>
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
            <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Frequency</p>
            <p className="text-lg font-bold text-slate-900 mt-2">
              {RECURRENCE_OPTIONS.find(r => r.value === recurrence)?.label}
            </p>
            <p className="text-xs text-slate-600 mt-1 font-medium">
              {recurrence === 'weekly' && selectedDays.length > 0
                ? selectedDays.join(', ')
                : recurrence === 'custom'
                ? `Every ${customInterval} ${customUnit}`
                : '—'}
            </p>
          </div>
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
            <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Meeting</p>
            <p className="text-lg font-bold text-slate-900 mt-2">
              {meetingTime}
            </p>
            <p className="text-xs text-slate-600 mt-1 font-medium">
              {duration} minutes duration
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-end">
          <button className="px-6 py-3 border-2 border-slate-300 text-slate-700 text-sm font-semibold rounded-lg hover:bg-white transition-all">
            Save as Draft
          </button>
          <button
            onClick={handleSave}
            className="inline-flex items-center justify-center gap-2 px-8 py-3 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-all shadow-md hover:shadow-lg"
          >
            <Save size={16} /> Save Schedule
          </button>
        </div>
      </section>
    </div>
  );
}
