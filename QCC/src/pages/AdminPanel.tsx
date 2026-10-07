import { useState, useEffect, useCallback } from 'react';
import {
  Users, Settings, Calendar, UserPlus, Edit2, Trash2,
  ToggleLeft, ToggleRight, Search, Lock, Unlock,
  Building2, Plus, ChevronDown, GitBranch, X, Save,
  FolderTree, ListChecks, Check, Eye, Loader2, Wifi,
  RefreshCw, Network, Sliders, Bell, Users2, CalendarClock
} from 'lucide-react';
import { mockUsers, mockDepartments, DEPARTMENTS, mockSubDepartments } from '../lib/data';
import { ROLE_LABELS, ROLE_COLORS } from '../lib/auth';
import { api } from '../lib/api';
import { useHalfYear } from '../lib/halfYear';
import { useCycles } from '../lib/cycles';
import { useActivitySteps } from '../lib/activitySteps';
import { useHierarchy } from '../lib/hierarchy';
import type { UserRole, SubDepartment, Team, QCCProject } from '../types';
import ActivityStepsSettings from './ActivityStepsSettings';
import CreateMeetingSchedule from './CreateMeetingSchedule';
import { useConfirm } from '../components/ConfirmDialog';

type AdminTab = 'users' | 'teams' | 'cycles' | 'meetingSchedule' | 'hierarchy' | 'activitySteps' | 'settings';

export default function AdminPanel() {
  const askConfirm = useConfirm();
  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    try { const v = localStorage.getItem('qcc-admin-tab') as AdminTab | null; if (v && ['users', 'teams', 'cycles', 'meetingSchedule', 'hierarchy', 'activitySteps', 'settings'].includes(v)) return v; } catch { /* default */ }
    return 'users';
  });
  useEffect(() => { try { localStorage.setItem('qcc-admin-tab', activeTab); } catch { /* ignore */ } }, [activeTab]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showUserForm, setShowUserForm] = useState(false);
  const [showCycleForm, setShowCycleForm] = useState(false);
  // QCC Cycles — created here, they drive the header QCC-period dropdown app-wide.
  const { cycles, createCycle, deleteCycle, setCycleActive } = useCycles();
  const [cycleForm, setCycleForm] = useState({ name: '', startDate: '', endDate: '', maxTeams: '' });
  const [cycleMsg, setCycleMsg] = useState<string | null>(null);

  // System Settings — persisted so "Save" actually stores the configuration.
  const SYS_KEY = 'qcc-system-settings';
  type SysSettings = {
    approval: Record<string, boolean>;
    orgName: string; fiscalYearStart: string; currency: string; maxUploadMb: number;
    notifications: { label: string; email: boolean; push: boolean }[];
  };
  const [sysSettings, setSysSettings] = useState<SysSettings>(() => {
    const def: SysSettings = {
      approval: { autoStep1: true, deptHead: true, admin: true, rework: true, emailOnApproval: false },
      orgName: 'Acme Manufacturing Ltd.', fiscalYearStart: 'April', currency: 'INR (₹)', maxUploadMb: 10,
      notifications: [
        { label: 'New team registration', email: true, push: true },
        { label: 'Step submission for review', email: true, push: true },
        { label: 'Approval/rejection updates', email: true, push: false },
        { label: 'Overdue action reminders', email: true, push: true },
        { label: 'Meeting minute submissions', email: false, push: true },
      ],
    };
    try {
      const s = localStorage.getItem('qcc-system-settings');
      if (s) { const p = JSON.parse(s) as Partial<SysSettings>; return { ...def, ...p, approval: { ...def.approval, ...(p.approval || {}) }, notifications: Array.isArray(p.notifications) && p.notifications.length ? p.notifications : def.notifications }; }
    } catch { /* fall back to defaults */ }
    return def;
  });
  const [settingsSaved, setSettingsSaved] = useState(false);
  const saveSysSettings = () => {
    try { localStorage.setItem(SYS_KEY, JSON.stringify(sysSettings)); } catch { /* ignore */ }
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2500);
  };
  const toggleApproval = (key: string) => setSysSettings(prev => ({ ...prev, approval: { ...prev.approval, [key]: !prev.approval[key] } }));
  const setNotif = (i: number, ch: 'email' | 'push', val: boolean) => setSysSettings(prev => ({ ...prev, notifications: prev.notifications.map((n, j) => j === i ? { ...n, [ch]: val } : n) }));

  // Hierarchy state
  const hier = useHierarchy();                 // shared Dept Hierarchy store (also drives Team Registration)
  const [newDeptName, setNewDeptName] = useState('');
  const [expandedDept, setExpandedDept] = useState<string | null>('Manufacturing');
  const [showAddNode, setShowAddNode] = useState(false);
  const [newNodeName, setNewNodeName] = useState('');
  const [newNodeParent, setNewNodeParent] = useState('');
  const [newNodeLevel, setNewNodeLevel] = useState<'sub_department' | 'line'>('sub_department');
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingNodeName, setEditingNodeName] = useState('');

  // Users are editable now (role = the management right). Backed by state so edit/delete work.
  const [users, setUsers] = useState(mockUsers);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  // ── Team Control: auto-synced from Team Registration (no manual entry here) ──
  const hy = useHalfYear();
  const { workflowSteps } = useActivitySteps(); // workflow stages come from Activity Steps config
  const [teams, setTeams] = useState<Team[]>([]);
  const [projects, setProjects] = useState<QCCProject[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [busyTeam, setBusyTeam] = useState<string | null>(null);
  const [viewTeamId, setViewTeamId] = useState<string | null>(null);
  const [teamLocks, setTeamLocks] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('qcc-team-locks') || '{}'); } catch { return {}; }
  });

  // Pull the live team + workflow data straight from the backend (same source Team
  // Registration writes to) so this page always mirrors it.
  const syncTeams = useCallback(async () => {
    setSyncing(true);
    try {
      const [t, p] = await Promise.all([api.listTeams(), api.listProjects()]);
      setTeams(t); setProjects(p); setLastSync(new Date());
    } catch { /* keep last good snapshot on failure */ }
    finally { setSyncing(false); setTeamsLoading(false); }
  }, []);

  useEffect(() => { syncTeams(); }, [syncTeams]);
  // Auto-sync while the Team Control tab is open: on open, on window focus, and a light poll —
  // so anything changed in Team Registration reflects here almost instantly.
  useEffect(() => {
    if (activeTab !== 'teams') return;
    syncTeams();
    const onFocus = () => syncTeams();
    window.addEventListener('focus', onFocus);
    const iv = setInterval(syncTeams, 10000);
    return () => { window.removeEventListener('focus', onFocus); clearInterval(iv); };
  }, [activeTab, syncTeams]);
  useEffect(() => { hy.registerDates(teams.map(t => t.createdAt)); }, [teams]); // eslint-disable-line react-hooks/exhaustive-deps

  const setLock = (teamId: string, locked: boolean) => {
    setTeamLocks(prev => {
      const next = { ...prev };
      if (locked) next[teamId] = true; else delete next[teamId];
      try { localStorage.setItem('qcc-team-locks', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // Activate / deactivate a team — admin edits apply directly on the backend.
  const toggleActive = async (team: Team) => {
    const next: Team['status'] = team.status === 'active' ? 'inactive' : 'active';
    setBusyTeam(team.id);
    setTeams(prev => prev.map(t => (t.id === team.id ? { ...t, status: next } : t))); // optimistic
    try {
      const res = await api.updateTeam(team.id, { status: next });
      if (res.applied && res.team) setTeams(prev => prev.map(t => (t.id === team.id ? res.team! : t)));
    } catch {
      setTeams(prev => prev.map(t => (t.id === team.id ? { ...t, status: team.status } : t))); // revert
    } finally { setBusyTeam(null); }
  };

  // Live workflow stage for a team, derived from its project's approved steps (mirrors the
  // Workflow page: 7 backend steps + 2 frontend documentation steps = 9 total).
  const TOTAL_STAGES = workflowSteps.length;
  const stageInfo = (teamId: string) => {
    const projs = projects.filter(p => p.teamId === teamId);
    if (projs.length === 0) return { stage: 0, total: TOTAL_STAGES, pct: 0, label: 'Not started', done: false };
    const approvedOf = (p: QCCProject) => p.steps.filter(s => s.status === 'approved').length;
    const proj = projs.reduce((a, b) => (approvedOf(b) > approvedOf(a) ? b : a));
    const realCount = proj.steps.length || 7;
    const approvedReal = approvedOf(proj);
    const frontDone = realCount > 0 && approvedReal === realCount;
    const stage = approvedReal + (frontDone ? (TOTAL_STAGES - realCount) : 0);
    const pct = Math.round((stage / TOTAL_STAGES) * 100);
    const done = stage >= TOTAL_STAGES;
    return { stage, total: TOTAL_STAGES, pct, label: done ? 'Completed' : (workflowSteps[stage]?.title ?? `Step ${stage + 1}`), done };
  };

  // Teams shown here follow the app-wide QCC Period scope (header switcher).
  const visibleTeams = teams.filter(t => hy.isTeamActive(t.id, t.createdAt));
  const viewTeam = teams.find(t => t.id === viewTeamId) || null;

  const deleteUser = (id: string) => {
    setUsers(prev => prev.filter(u => u.id !== id));
    if (editingUserId === id) setEditingUserId(null);
  };
  const updateUserRole = (id: string, role: UserRole) =>
    setUsers(prev => prev.map(u => (u.id === id ? { ...u, role } : u)));

  // Create a QCC cycle → it saves, becomes active, and its year appears in the header period dropdown.
  // Teams are grouped by the cycle's YEAR, so a brand-new cycle must be a new year — that is
  // what makes it open EMPTY (a fresh slate) instead of inheriting the previous year's teams.
  const handleCreateCycle = () => {
    const year = parseInt((cycleForm.startDate || '').slice(0, 4), 10);
    if (!cycleForm.name.trim() || !cycleForm.startDate || !Number.isFinite(year)) {
      setCycleMsg('Enter cycle name and valid date'); setTimeout(() => setCycleMsg(null), 3500); return;
    }
    if (cycles.some(c => c.year === year)) {
      setCycleMsg(`Cycle for ${year} already exists`);
      setTimeout(() => setCycleMsg(null), 7000); return;
    }
    const created = createCycle({ name: cycleForm.name, startDate: cycleForm.startDate, endDate: cycleForm.endDate, maxTeams: Number(cycleForm.maxTeams) || 20 });
    if (!created) { setCycleMsg('Enter cycle name and start date'); setTimeout(() => setCycleMsg(null), 3000); return; }
    hy.setActive({ year: created.year, half: 'H1' }); // switch the app to the new (empty) cycle's period
    setCycleForm({ name: '', startDate: '', endDate: '', maxTeams: '' });
    setCycleMsg(null);
    setShowCycleForm(false);
  };

  const tabs: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: 'users', label: 'User Management', icon: <Users size={16} /> },
    { id: 'teams', label: 'Team Control', icon: <Building2 size={16} /> },
    { id: 'cycles', label: 'QCC Cycles', icon: <Calendar size={16} /> },
    { id: 'meetingSchedule', label: 'Meeting Scheduling', icon: <CalendarClock size={16} /> },
    { id: 'hierarchy', label: 'Dept Hierarchy', icon: <FolderTree size={16} /> },
    { id: 'activitySteps', label: 'Activity Steps', icon: <ListChecks size={16} /> },
    { id: 'settings', label: 'System Settings', icon: <Settings size={16} /> },
  ];

  const handleAddNode = () => {
    if (!newNodeName.trim() || !newNodeParent) return;
    hier.addNode(newNodeName, newNodeParent, newNodeLevel);
    setNewNodeName('');
    setShowAddNode(false);
  };
  const handleAddDepartment = () => {
    if (!newDeptName.trim()) return;
    hier.addDepartment(newDeptName);
    setNewDeptName('');
  };

  const handleDeleteNode = (nodeId: string) => hier.deleteNode(nodeId);        // store cascades to children
  const handleToggleNode = (nodeId: string) => hier.toggleNode(nodeId);
  const handleSaveNodeEdit = (nodeId: string) => {
    if (!editingNodeName.trim()) return;
    hier.updateNode(nodeId, editingNodeName);
    setEditingNodeId(null);
    setEditingNodeName('');
  };

  const getSubDepts = (dept: string) => hier.nodes.filter(h => h.parentId === dept && h.level === 'sub_department');
  const getLines = (subDeptId: string) => hier.nodes.filter(h => h.parentId === subDeptId && h.level === 'line');

  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-slate-200 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-2 flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2">
              <Search size={16} className="text-slate-400" />
              <input
                type="text" placeholder="Search users..." value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="bg-transparent text-sm text-slate-700 outline-none w-full"
              />
            </div>
            <button
              onClick={() => setShowUserForm(!showUserForm)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <UserPlus size={16} /> Add User
            </button>
          </div>

          {showUserForm && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <div className="flex items-center gap-2.5 mb-4">
                <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0"><UserPlus size={16} /></span>
                <h3 className="text-sm font-semibold text-slate-800">Add New User</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Full Name</label>
                  <input type="text" placeholder="Enter name" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
                  <input type="email" placeholder="Enter email" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Role</label>
                  <select className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white outline-none">
                    {Object.entries(ROLE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Department</label>
                  <select className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white outline-none">
                    {hier.departments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setShowUserForm(false)} className="px-4 py-2 text-sm text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg">Cancel</button>
                <button onClick={() => setShowUserForm(false)} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg">Create User</button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">User</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Role</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Department</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Joined</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">
                            {u.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-800">{u.name}</p>
                            <p className="text-[10px] text-slate-500">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        {editingUserId === u.id ? (
                          <select
                            value={u.role}
                            onChange={e => updateUserRole(u.id, e.target.value as UserRole)}
                            className="px-2 py-1 border border-slate-300 rounded-lg text-xs bg-white outline-none focus:ring-2 focus:ring-blue-400"
                          >
                            {Object.entries(ROLE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                          </select>
                        ) : (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${ROLE_COLORS[u.role]}`}>
                            {ROLE_LABELS[u.role]}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-600">{u.department}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${u.isActive ? 'text-emerald-700' : 'text-slate-500'}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${u.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                          {u.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">{u.joinedAt}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditingUserId(editingUserId === u.id ? null : u.id)}
                            title={editingUserId === u.id ? 'Done' : 'Edit role'}
                            className={`p-1.5 rounded-lg hover:bg-slate-100 transition-colors ${editingUserId === u.id ? 'text-emerald-600' : 'text-slate-500 hover:text-blue-600'}`}
                          >
                            {editingUserId === u.id ? <Check size={14} /> : <Edit2 size={14} />}
                          </button>
                          <button
                            onClick={async () => { if (await askConfirm({ title: 'Delete this user?', message: 'This action cannot be undone.', confirmText: 'Delete' })) deleteUser(u.id); }}
                            title="Delete user"
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-red-600 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Teams Tab — auto-synced mirror of Team Registration (monitoring & admin actions only) */}
      {activeTab === 'teams' && (
        <div className="space-y-4">
          {/* Header: auto-sync status + refresh */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0"><Building2 size={17} /></span>
              <div>
                <h2 className="text-sm font-bold text-slate-800">Team Control</h2>
                <p className="text-[11px] text-slate-500">Auto-populated from Team Registration · read-only details, admin controls only</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-medium">
                <Wifi size={12} /> Auto-synced{lastSync ? ` · ${lastSync.toLocaleTimeString()}` : ''}
              </span>
              <button
                onClick={syncTeams}
                disabled={syncing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 disabled:opacity-60 transition-colors"
              >
                <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Teams', value: visibleTeams.length, icon: <Users2 size={15} />, cls: 'text-blue-600 bg-blue-50' },
              { label: 'Active', value: visibleTeams.filter(t => t.status === 'active').length, icon: <ToggleRight size={15} />, cls: 'text-emerald-600 bg-emerald-50' },
              { label: 'Inactive', value: visibleTeams.filter(t => t.status !== 'active').length, icon: <ToggleLeft size={15} />, cls: 'text-slate-500 bg-slate-100' },
              { label: 'Locked', value: visibleTeams.filter(t => teamLocks[t.id]).length, icon: <Lock size={15} />, cls: 'text-amber-600 bg-amber-50' },
            ].map((s, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-3.5 flex items-center gap-3">
                <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${s.cls}`}>{s.icon}</span>
                <div>
                  <p className="text-lg font-bold text-slate-800 leading-none">{s.value}</p>
                  <p className="text-[11px] text-slate-500 mt-1">{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px]">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Team ID</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Team Name</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Department</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Members</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Workflow Stage</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase">QCC Year</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Admin Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {teamsLoading ? (
                    <tr><td colSpan={8} className="px-5 py-12 text-center text-slate-400"><Loader2 size={18} className="animate-spin inline mr-2" /> Loading teams…</td></tr>
                  ) : visibleTeams.length === 0 ? (
                    <tr><td colSpan={8} className="px-5 py-12 text-center text-sm text-slate-400">No teams registered for the selected QCC period. New teams from Team Registration appear here automatically.</td></tr>
                  ) : visibleTeams.map(team => {
                    const st = stageInfo(team.id);
                    const locked = !!teamLocks[team.id];
                    const membersCount = team.members.filter(m => m.isActive).length;
                    return (
                      <tr key={team.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3"><span className="text-xs font-mono font-medium text-blue-600">{team.id}</span></td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-800">{team.name}</span>
                            {locked && <span title="Locked" className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700"><Lock size={9} /> Locked</span>}
                          </div>
                          {team.projectTitle && <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[220px]" title={team.projectTitle}>{team.projectTitle}</p>}
                        </td>
                        <td className="px-5 py-3 text-xs text-slate-600">
                          {team.department}{team.subDepartment ? <span className="text-slate-400"> · {team.subDepartment}</span> : ''}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="inline-flex items-center gap-1 text-xs text-slate-700 font-medium"><Users size={12} className="text-slate-400" /> {membersCount}</span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${st.done ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${st.pct}%` }} />
                            </div>
                            <span className="text-[10px] text-slate-500 whitespace-nowrap">{st.stage}/{st.total}</span>
                          </div>
                          <p className={`text-[10px] mt-1 ${st.done ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}>{st.label}</p>
                        </td>
                        <td className="px-3 py-3 text-center"><span className="text-xs font-medium text-slate-700">{hy.teamYear(team.id, team.createdAt)}</span></td>
                        <td className="px-5 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${
                            team.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                            team.status === 'inactive' ? 'bg-slate-100 text-slate-600' :
                            'bg-amber-100 text-amber-700'
                          }`}>{team.status}</span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => setViewTeamId(team.id)} title="View details" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors">
                              <Eye size={15} />
                            </button>
                            <button onClick={() => setLock(team.id, !locked)} title={locked ? 'Unlock team' : 'Lock team'} className={`p-1.5 rounded-lg hover:bg-slate-100 transition-colors ${locked ? 'text-amber-600' : 'text-slate-500 hover:text-amber-600'}`}>
                              {locked ? <Unlock size={15} /> : <Lock size={15} />}
                            </button>
                            <button onClick={() => toggleActive(team)} disabled={busyTeam === team.id} title={team.status === 'active' ? 'Deactivate team' : 'Activate team'} className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-50 transition-colors">
                              {busyTeam === team.id ? <Loader2 size={15} className="animate-spin text-slate-400" /> : team.status === 'active' ? <ToggleRight size={16} className="text-emerald-600" /> : <ToggleLeft size={16} className="text-slate-400" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Cycles Tab */}
      {activeTab === 'cycles' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowCycleForm(!showCycleForm)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Calendar size={16} /> Create Cycle
            </button>
          </div>

          {showCycleForm && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <div className="flex items-center gap-2.5 mb-4">
                <span className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center flex-shrink-0"><Calendar size={16} /></span>
                <h3 className="text-sm font-semibold text-slate-800">New QCC Cycle</h3>
                <span className="text-[11px] text-slate-400">— the year becomes a selectable QCC period in the header</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Cycle Name</label>
                  <input type="text" value={cycleForm.name} onChange={e => setCycleForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g., QCC 2026" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Start Date <span className="text-red-500">*</span></label>
                  <input type="date" value={cycleForm.startDate} onChange={e => setCycleForm(f => ({ ...f, startDate: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">End Date</label>
                  <input type="date" value={cycleForm.endDate} onChange={e => setCycleForm(f => ({ ...f, endDate: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Max Teams</label>
                  <input type="number" value={cycleForm.maxTeams} onChange={e => setCycleForm(f => ({ ...f, maxTeams: e.target.value }))} placeholder="20" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
              </div>
              <p className="text-[11px] text-slate-500 mt-3 flex items-start gap-1.5">
                <Calendar size={13} className="text-blue-500 mt-0.5 flex-shrink-0" />
                {cycleForm.startDate
                  ? <span>This creates the <b className="text-slate-700">{(cycleForm.startDate || '').slice(0, 4)}</b> cycle. It opens <b>empty</b> — register or import teams into it. Teams are grouped by year, so old years' teams never carry over.</span>
                  : <span>Pick a start date — its <b>year</b> identifies the cycle. Each new year starts fresh with no old teams; the same year shares its teams.</span>}
              </p>
              {cycleMsg && <p className="text-xs text-red-600 mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{cycleMsg}</p>}
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => { setShowCycleForm(false); setCycleMsg(null); }} className="px-4 py-2 text-sm text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg">Cancel</button>
                <button onClick={handleCreateCycle} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg">Create</button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {cycles.map(cycle => (
              <div key={cycle.id} className={`bg-white rounded-xl p-5 shadow-sm border ${cycle.isActive ? 'border-emerald-300 ring-1 ring-emerald-100' : 'border-slate-200'}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0"><RefreshCw size={16} /></span>
                      <h3 className="text-sm font-bold text-slate-800">{cycle.name}</h3>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">Year: {cycle.year}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setCycleActive(cycle.id, !cycle.isActive)}
                      title={cycle.isActive ? 'Active — showing in the header QCC-period dropdown. Click to hide it.' : 'Inactive — hidden from the header QCC-period dropdown. Click to show it.'}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors ${cycle.isActive ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${cycle.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      {cycle.isActive ? 'Active' : 'Inactive'}
                    </button>
                    <button onClick={async () => { if (await askConfirm({ title: 'Delete cycle?', message: `Delete "${cycle.name}"? Its QCC period will be removed.`, confirmText: 'Delete' })) deleteCycle(cycle.id); }} title="Delete cycle" className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="space-y-2 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span>Duration</span>
                    <span className="font-medium">{cycle.startDate || '—'} → {cycle.endDate || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Max Teams</span>
                    <span className="font-medium">{cycle.maxTeams}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Registered Teams</span>
                    <span className="font-medium">{teams.length}</span>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                    <span>Capacity</span>
                    <span>{Math.round((teams.length / cycle.maxTeams) * 100)}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, (teams.length / cycle.maxTeams) * 100)}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Meeting Schedule Tab */}
      {activeTab === 'meetingSchedule' && <CreateMeetingSchedule />}

      {/* Dept Hierarchy Tab */}
      {activeTab === 'hierarchy' && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0"><Network size={16} /></span>
                <h2 className="text-lg font-semibold text-slate-800">Department Hierarchy</h2>
              </div>
              <p className="text-xs text-slate-500 mt-1">Manage Department → Sub Department → Line — these drive the Team Registration form's dropdowns.</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <input value={newDeptName} onChange={e => setNewDeptName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddDepartment()} placeholder="New department name" className="px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400 w-48" />
              <button onClick={handleAddDepartment} disabled={!newDeptName.trim()} className="inline-flex items-center gap-1.5 px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-sm font-medium rounded-lg transition-colors">
                <Plus size={16} /> Department
              </button>
              <button onClick={() => setShowAddNode(!showAddNode)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
                <Plus size={16} /> Add Node
              </button>
            </div>
          </div>

          {showAddNode && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <div className="flex items-center gap-2.5 mb-4">
                <span className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center flex-shrink-0"><Plus size={16} /></span>
                <h3 className="text-sm font-semibold text-slate-800">Add Hierarchy Node</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Level</label>
                  <select
                    value={newNodeLevel}
                    onChange={e => setNewNodeLevel(e.target.value as 'sub_department' | 'line')}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white outline-none"
                  >
                    <option value="sub_department">Sub Department</option>
                    <option value="line">Line</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    {newNodeLevel === 'sub_department' ? 'Parent Department' : 'Parent Sub Department'}
                  </label>
                  <select
                    value={newNodeParent}
                    onChange={e => setNewNodeParent(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white outline-none"
                  >
                    <option value="">Select...</option>
                    {newNodeLevel === 'sub_department'
                      ? hier.departments.map(d => <option key={d} value={d}>{d}</option>)
                      : hier.nodes.filter(h => h.level === 'sub_department').map(sd => (
                          <option key={sd.id} value={sd.id}>{sd.name} ({sd.parentId})</option>
                        ))
                    }
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
                  <input
                    type="text"
                    value={newNodeName}
                    onChange={e => setNewNodeName(e.target.value)}
                    placeholder="Enter name"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => { setShowAddNode(false); setNewNodeName(''); setNewNodeParent(''); }}
                  className="px-4 py-2 text-sm text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddNode}
                  disabled={!newNodeName.trim() || !newNodeParent}
                  className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 rounded-lg"
                >
                  Add Node
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 space-y-3">
              {hier.departments.map(dept => {
                const subDepts = getSubDepts(dept);
                const isExpanded = expandedDept === dept;
                return (
                  <div key={dept} className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="flex items-center bg-slate-50">
                      <button
                        onClick={() => setExpandedDept(isExpanded ? null : dept)}
                        className="flex-1 flex items-center justify-between px-4 py-3 hover:bg-slate-100 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0"><Building2 size={16} /></span>
                          <span className="font-medium text-slate-800">{dept}</span>
                          <span className="text-xs text-slate-500">({subDepts.length} sub-departments)</span>
                        </div>
                        <ChevronDown size={16} className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                      <button onClick={async () => { if (await askConfirm({ title: 'Delete department?', message: `Delete department "${dept}" and its sub-departments?`, confirmText: 'Delete' })) hier.deleteDepartment(dept); }} title="Delete department" className="px-3 self-stretch text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0">
                        <Trash2 size={15} />
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="p-4 space-y-2 bg-white">
                        {subDepts.length === 0 ? (
                          <p className="text-xs text-slate-400 italic pl-6">No sub-departments configured</p>
                        ) : (
                          subDepts.map(sd => {
                            const lines = getLines(sd.id);
                            const isEditing = editingNodeId === sd.id;
                            return (
                              <div key={sd.id} className="ml-4 border-l-2 border-blue-200 pl-4">
                                <div className="flex items-center justify-between py-2">
                                  {isEditing ? (
                                    <div className="flex items-center gap-2 flex-1">
                                      <input
                                        type="text"
                                        value={editingNodeName}
                                        onChange={e => setEditingNodeName(e.target.value)}
                                        className="flex-1 px-2 py-1 border border-slate-300 rounded text-sm outline-none"
                                        autoFocus
                                      />
                                      <button
                                        onClick={() => handleSaveNodeEdit(sd.id)}
                                        className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                      >
                                        <Save size={14} />
                                      </button>
                                      <button
                                        onClick={() => { setEditingNodeId(null); setEditingNodeName(''); }}
                                        className="p-1 text-slate-500 hover:bg-slate-100 rounded"
                                      >
                                        <X size={14} />
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="flex items-center gap-2">
                                        <GitBranch size={14} className="text-purple-600" />
                                        <span className="text-sm text-slate-700">{sd.name}</span>
                                        <span className="text-xs text-slate-400">({lines.length} lines)</span>
                                        {!sd.isActive && (
                                          <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded">Inactive</span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={() => { setEditingNodeId(sd.id); setEditingNodeName(sd.name); }}
                                          className="p-1 text-slate-500 hover:bg-slate-100 rounded"
                                          title="Edit"
                                        >
                                          <Edit2 size={14} />
                                        </button>
                                        <button
                                          onClick={() => handleToggleNode(sd.id)}
                                          className="p-1 text-slate-500 hover:bg-slate-100 rounded"
                                          title={sd.isActive ? 'Deactivate' : 'Activate'}
                                        >
                                          {sd.isActive ? <ToggleRight size={14} className="text-emerald-600" /> : <ToggleLeft size={14} />}
                                        </button>
                                        <button
                                          onClick={async () => { if (await askConfirm({ title: 'Delete this sub-department?', message: 'This action cannot be undone.', confirmText: 'Delete' })) handleDeleteNode(sd.id); }}
                                          className="p-1 text-slate-500 hover:bg-red-50 hover:text-red-600 rounded"
                                          title="Delete"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                                {lines.length > 0 && (
                                  <div className="ml-4 mt-1 space-y-1">
                                    {lines.map(line => {
                                      const isEditingLine = editingNodeId === line.id;
                                      return (
                                        <div key={line.id} className="flex items-center justify-between py-1.5 pl-3 border-l border-slate-200">
                                          {isEditingLine ? (
                                            <div className="flex items-center gap-2 flex-1">
                                              <input
                                                type="text"
                                                value={editingNodeName}
                                                onChange={e => setEditingNodeName(e.target.value)}
                                                className="flex-1 px-2 py-1 border border-slate-300 rounded text-xs outline-none"
                                                autoFocus
                                              />
                                              <button
                                                onClick={() => handleSaveNodeEdit(line.id)}
                                                className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                              >
                                                <Save size={12} />
                                              </button>
                                              <button
                                                onClick={() => { setEditingNodeId(null); setEditingNodeName(''); }}
                                                className="p-1 text-slate-500 hover:bg-slate-100 rounded"
                                              >
                                                <X size={12} />
                                              </button>
                                            </div>
                                          ) : (
                                            <>
                                              <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                                <span className="text-xs text-slate-600">{line.name}</span>
                                                {!line.isActive && (
                                                  <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">Inactive</span>
                                                )}
                                              </div>
                                              <div className="flex items-center gap-1">
                                                <button
                                                  onClick={() => { setEditingNodeId(line.id); setEditingNodeName(line.name); }}
                                                  className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                                                  title="Edit"
                                                >
                                                  <Edit2 size={12} />
                                                </button>
                                                <button
                                                  onClick={() => handleToggleNode(line.id)}
                                                  className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                                                  title={line.isActive ? 'Deactivate' : 'Activate'}
                                                >
                                                  {line.isActive ? <ToggleRight size={12} className="text-emerald-600" /> : <ToggleLeft size={12} />}
                                                </button>
                                                <button
                                                  onClick={async () => { if (await askConfirm({ title: 'Delete this line?', message: 'This action cannot be undone.', confirmText: 'Delete' })) handleDeleteNode(line.id); }}
                                                  className="p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 rounded"
                                                  title="Delete"
                                                >
                                                  <Trash2 size={12} />
                                                </button>
                                              </div>
                                            </>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Activity Steps Tab */}
      {activeTab === 'activitySteps' && <ActivityStepsSettings />}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-8 h-8 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center flex-shrink-0"><Sliders size={16} /></span>
              <h3 className="text-sm font-semibold text-slate-800">Approval Flow Configuration</h3>
            </div>
            <div className="space-y-3">
              {[
                { key: 'autoStep1', label: 'Auto-approve Step 1 (Team Registration)' },
                { key: 'deptHead', label: 'Dept. Head approval required for Steps 2-8' },
                { key: 'admin', label: 'Admin approval required for Step 9' },
                { key: 'rework', label: 'Allow rework submissions' },
                { key: 'emailOnApproval', label: 'Email notifications on approval' },
              ].map(setting => {
                const enabled = sysSettings.approval[setting.key];
                return (
                  <div key={setting.key} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-b-0">
                    <span className="text-sm text-slate-700">{setting.label}</span>
                    <button type="button" role="switch" aria-checked={enabled} aria-label={setting.label} onClick={() => toggleApproval(setting.key)} className={`relative w-10 h-5 rounded-full transition-colors ${enabled ? 'bg-blue-600' : 'bg-slate-300'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0"><Settings size={16} /></span>
              <h3 className="text-sm font-semibold text-slate-800">System Settings</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Organization Name</label>
                <input type="text" value={sysSettings.orgName} onChange={e => setSysSettings(prev => ({ ...prev, orgName: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Fiscal Year Start</label>
                <select value={sysSettings.fiscalYearStart} onChange={e => setSysSettings(prev => ({ ...prev, fiscalYearStart: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-400">
                  <option>April</option>
                  <option>January</option>
                  <option>July</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Default Currency</label>
                <select value={sysSettings.currency} onChange={e => setSysSettings(prev => ({ ...prev, currency: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-400">
                  <option>INR (₹)</option>
                  <option>USD ($)</option>
                  <option>EUR (€)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Max File Upload Size (MB)</label>
                <input type="number" value={sysSettings.maxUploadMb} onChange={e => setSysSettings(prev => ({ ...prev, maxUploadMb: Number(e.target.value) || 0 }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-4">
              {settingsSaved && <span className="text-sm text-emerald-600 font-medium inline-flex items-center gap-1.5"><Check size={16} /> Saved</span>}
              <button onClick={saveSysSettings} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
                Save
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center flex-shrink-0"><Bell size={16} /></span>
              <h3 className="text-sm font-semibold text-slate-800">Notification Preferences</h3>
            </div>
            <div className="space-y-3">
              {sysSettings.notifications.map((pref, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-b-0">
                  <span className="text-sm text-slate-700">{pref.label}</span>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1.5 text-xs text-slate-600">
                      <input type="checkbox" checked={pref.email} onChange={e => setNotif(i, 'email', e.target.checked)} className="rounded border-slate-300" />
                      Email
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-slate-600">
                      <input type="checkbox" checked={pref.push} onChange={e => setNotif(i, 'push', e.target.checked)} className="rounded border-slate-300" />
                      Push
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Team details — read-only viewer (no editing here) */}
      {viewTeam && (() => {
        const st = stageInfo(viewTeam.id);
        const locked = !!teamLocks[viewTeam.id];
        return (
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/40" onClick={() => setViewTeamId(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0"><Building2 size={17} /></span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">{viewTeam.name}</h3>
                    <p className="text-[11px] text-slate-500 font-mono">{viewTeam.id}</p>
                  </div>
                </div>
                <button onClick={() => setViewTeamId(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X size={18} /></button>
              </div>
              <div className="p-5 overflow-y-auto space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { k: 'Department', v: viewTeam.department },
                    { k: 'Sub-Department', v: viewTeam.subDepartment || '—' },
                    { k: 'QCC Year', v: String(hy.teamYear(viewTeam.id, viewTeam.createdAt)) },
                    { k: 'Members', v: String(viewTeam.members.filter(m => m.isActive).length) },
                    { k: 'Workflow Stage', v: `${st.stage}/${st.total} · ${st.label}` },
                    { k: 'Status', v: viewTeam.status },
                    { k: 'Lock', v: locked ? 'Locked' : 'Unlocked' },
                    { k: 'Registered', v: viewTeam.createdAt },
                  ].map(f => (
                    <div key={f.k} className="bg-slate-50 rounded-lg px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{f.k}</p>
                      <p className="text-xs text-slate-700 font-medium mt-0.5 capitalize">{f.v}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { k: 'Leader', v: viewTeam.leaderName },
                    { k: 'Facilitator', v: viewTeam.facilitatorName || '—' },
                    { k: 'Coordinator', v: viewTeam.coordinatorName || '—' },
                  ].map(f => (
                    <div key={f.k} className="border border-slate-200 rounded-lg px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{f.k}</p>
                      <p className="text-xs text-slate-700 font-medium mt-0.5">{f.v}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-2">Members ({viewTeam.members.filter(m => m.isActive).length})</p>
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                    {viewTeam.members.filter(m => m.isActive).map((m, i) => (
                      <div key={m.memberId || i} className="flex items-center justify-between px-3 py-2">
                        <span className="text-xs text-slate-700">{m.memberName}</span>
                        <span className="text-[10px] text-slate-400">{m.department || viewTeam.department}</span>
                      </div>
                    ))}
                    {viewTeam.members.filter(m => m.isActive).length === 0 && <p className="px-3 py-3 text-xs text-slate-400">No active members.</p>}
                  </div>
                </div>
              </div>
              <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center gap-1.5 text-[11px] text-slate-500">
                <Eye size={13} /> Read-only view — team details are managed in Team Registration.
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
