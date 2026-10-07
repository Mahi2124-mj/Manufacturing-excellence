import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import {
  Users, Plus, Lock, Hash, Building2, Trash2, Edit2, Eye,
  X, CheckCircle2, AlertCircle, Save, ArrowLeft, UserMinus,
  UserCheck, Clock, Lightbulb, ChevronRight, FileText,
  UserCircle, Briefcase, MapPin, CalendarRange, Filter,
  Upload, Download, FileSpreadsheet, Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useAuth } from '../lib/auth';
import { useHalfYear } from '../lib/halfYear';
import { useHierarchy } from '../lib/hierarchy';
import { api, ApiError } from '../lib/api';
import HeaderPortal from '../components/layout/HeaderPortal';
import StatCard, { STAT_GRADIENTS } from '../components/StatCard';
import type { Team, TeamMember, SubDepartment } from '../types';
import { useConfirm } from '../components/ConfirmDialog';

// ─── Types ───────────────────────────────────────────────
interface MemberRow {
  key: string;
  memberName: string;
  employeeId: string;
  department: string;
  deptEdited: boolean;   // true once the user manually overrides the auto-filled department
  isActive: boolean;
  deactivationReason: string;
  deactivatedAt: string;
}

interface FormErrors {
  teamName?: string;
  department?: string;
  leaderName?: string;
  facilitatorName?: string;
  coordinatorName?: string;
  members?: string;
  changeReason?: string;
  [key: string]: string | undefined;
}

interface Toast {
  show: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
}

// ─── Helpers ─────────────────────────────────────────────
const genId = () => Math.random().toString(36).substring(2, 9);

const genTeamId = (dept: string, existingTeams: Team[]) => {
  const prefix = dept.substring(0, 3).toUpperCase();
  const count = existingTeams.filter(t => t.department === dept).length + 1;
  return `QCC-${prefix}-${String(count).padStart(3, '0')}`;
};

const emptyMember = (): MemberRow => ({
  key: genId(), memberName: '', employeeId: '', department: '', deptEdited: false,
  isActive: true, deactivationReason: '', deactivatedAt: '',
});

// Colourful accent classes for section/card header icon-chips (cycled by index).
const CHIP_ACCENTS = [
  'bg-blue-50 text-blue-600',
  'bg-violet-50 text-violet-600',
  'bg-emerald-50 text-emerald-600',
  'bg-amber-50 text-amber-600',
  'bg-rose-50 text-rose-600',
  'bg-cyan-50 text-cyan-600',
];

// ─── Component ───────────────────────────────────────────
export default function TeamRegistration() {
  const { user } = useAuth();
  const askConfirm = useConfirm();
  const hy = useHalfYear();
  const hierarchy = useHierarchy();   // departments + sub-departments come from Admin → Dept Hierarchy
  const navigate = useNavigate();

  const [view, setView] = useState<'list' | 'form' | 'detail'>('list');
  // KPI cards on the list view double as filters for the team list below.
  const [teamFilter, setTeamFilter] = useState<'all' | 'active' | 'members' | 'theme' | 'incomplete'>('all');
  const [teams, setTeams] = useState<Team[]>([]);
  const subDepartments = hierarchy.nodes;   // live from the Dept Hierarchy store
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [viewingTeamId, setViewingTeamId] = useState<string | null>(null);

  const [teamName, setTeamName] = useState('');
  const [department, setDepartment] = useState('');
  const [subDepartment, setSubDepartment] = useState('');
  const [selectedLine, setSelectedLine] = useState('');
  const [leaderName, setLeaderName] = useState('');
  const [facilitatorName, setFacilitatorName] = useState('');
  const [coordinatorName, setCoordinatorName] = useState('');
  const [projectTheme, setProjectTheme] = useState('');
  const [members, setMembers] = useState<MemberRow[]>([emptyMember(), emptyMember()]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<Toast>({ show: false, message: '', type: 'success' });
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [showSearchLeader, setShowSearchLeader] = useState(false);
  const [showSearchFacilitator, setShowSearchFacilitator] = useState(false);
  const [showSearchCoordinator, setShowSearchCoordinator] = useState(false);

  const [deactivateTarget, setDeactivateTarget] = useState<string | null>(null);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [deactivateError, setDeactivateError] = useState('');

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formTopRef = useRef<HTMLDivElement>(null);

  const isLeader = user?.role === 'leader';
  const isAdmin = user?.role === 'admin';

  // Scope every team view to the active half-year (switched from the header).
  const halfYearTeams = teams.filter(t => hy.isTeamActive(t.id, t.createdAt));
  const roleTeams = isLeader && user ? halfYearTeams.filter(t => t.leaderName === user.name) : halfYearTeams;
  // A registration is "incomplete" if a required part is missing: no leader / no
  // coordinator, fewer than 2 active members, or any active member without a code.
  const isIncomplete = (t: Team): boolean => {
    const active = t.members.filter(m => m.isActive);
    return !t.leaderName?.trim() || !t.coordinatorName?.trim() || active.length < 2 || active.some(m => !m.employeeId?.trim());
  };
  // The list obeys the KPI filter chosen from the summary cards above it.
  const filteredTeams = roleTeams.filter(t =>
    teamFilter === 'active' ? t.status === 'active'
      : teamFilter === 'theme' ? !!t.projectTheme
        : teamFilter === 'members' ? t.members.some(m => m.isActive)
          : teamFilter === 'incomplete' ? isIncomplete(t)
            : true);

  const getSubDepartmentsForDept = (dept: string) => subDepartments.filter(sd => sd.parentId === dept && sd.level === 'sub_department' && sd.isActive);
  const getLinesForSubDept = (subDeptId: string) => subDepartments.filter(sd => sd.parentId === subDeptId && sd.level === 'line' && sd.isActive);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3500);
  }, []);

  // Load teams from the backend so newly-registered teams persist and appear here.
  const reloadTeams = useCallback(async () => {
    try { setTeams(await api.listTeams()); } catch { /* keep current list on failure */ }
  }, []);

  useEffect(() => { reloadTeams(); }, [reloadTeams]);
  // Feed the header period dropdown with the years present in the team data.
  useEffect(() => { hy.registerDates(teams.map(t => t.createdAt)); }, [teams]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (view !== 'form') return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      const hasData = teamName || department || leaderName || facilitatorName || coordinatorName || members.some(m => m.memberName);
      if (hasData) setDraftSavedAt(new Date().toLocaleTimeString());
    }, 3000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [teamName, department, subDepartment, selectedLine, leaderName, facilitatorName, coordinatorName, projectTheme, members, view]);

  useEffect(() => { setSubDepartment(''); setSelectedLine(''); }, [department]);
  useEffect(() => { setSelectedLine(''); }, [subDepartment]);
  // Auto-fill each member's department from the team's dept / sub-dept — but keep
  // any member whose department was manually changed.
  useEffect(() => {
    const auto = subDepartment || department;
    setMembers(prev => prev.map(m => (m.deptEdited ? m : { ...m, department: auto })));
  }, [department, subDepartment]);

  const loadTeamForEdit = (team: Team) => {
    setEditingTeamId(team.id);
    setTeamName(team.name); setDepartment(team.department);
    setSubDepartment(team.subDepartment || ''); setSelectedLine('');
    setLeaderName(team.leaderName); setFacilitatorName(team.facilitatorName);
    setCoordinatorName(team.coordinatorName); setProjectTheme(team.projectTheme);
    const loadedMembers = team.members.length > 0
      ? team.members.map(m => ({ key: genId(), memberName: m.memberName, employeeId: m.employeeId, department: m.department, deptEdited: true, isActive: m.isActive, deactivationReason: m.deactivationReason || '', deactivatedAt: m.deactivatedAt || '' }))
      : [emptyMember(), emptyMember()];
    setMembers(loadedMembers); setErrors({}); setTouched({});
    setView('form'); window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openNewForm = () => {
    setEditingTeamId(null); setTeamName(''); setDepartment(''); setSubDepartment(''); setSelectedLine('');
    setLeaderName(''); setFacilitatorName(''); setCoordinatorName(''); setProjectTheme('');
    setMembers([emptyMember(), emptyMember()]); setErrors({}); setTouched({}); setDraftSavedAt(null);
    setView('form'); window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openDetail = (teamId: string) => { setViewingTeamId(teamId); setView('detail'); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const addMember = () => setMembers(prev => [...prev, { ...emptyMember(), department: subDepartment || department }]);

  // Change a member's department manually (overrides the auto value). Selecting the
  // blank "Auto from team" option resets it back to auto-fill.
  const changeMemberDept = (key: string, value: string) => {
    const auto = subDepartment || department;
    setMembers(prev => prev.map(m => m.key === key
      ? (value === '' ? { ...m, department: auto, deptEdited: false } : { ...m, department: value, deptEdited: true })
      : m));
  };

  const removeMember = (key: string) => {
    if (members.length <= 2) { showToast('Need at least 2 members', 'error'); return; }
    setMembers(prev => prev.filter(m => m.key !== key));
    setErrors(prev => { const n = { ...prev }; delete n[`member_name_${key}`]; delete n[`member_empid_${key}`]; delete n.members; return n; });
  };

  const updateMember = (key: string, field: keyof MemberRow, value: string) => {
    setMembers(prev => prev.map(m => m.key === key ? { ...m, [field]: value } : m));
    setErrors(prev => { const n = { ...prev }; delete n[`member_name_${key}`]; delete n[`member_empid_${key}`]; return n; });
  };

  const openDeactivatePopup = (key: string) => { setDeactivateTarget(key); setDeactivateReason(''); setDeactivateError(''); };

  const confirmDeactivate = () => {
    if (!deactivateReason.trim()) { setDeactivateError('Reason for deactivation is mandatory.'); return; }
    setMembers(prev => prev.map(m => m.key === deactivateTarget ? { ...m, isActive: false, deactivationReason: deactivateReason.trim(), deactivatedAt: new Date().toISOString().split('T')[0] } : m));
    setDeactivateTarget(null); setDeactivateReason(''); showToast('Member deactivated', 'info');
  };

  const reactivateMember = (key: string) => {
    setMembers(prev => prev.map(m => m.key === key ? { ...m, isActive: true, deactivationReason: '', deactivatedAt: '' } : m));
    showToast('Member reactivated.', 'success');
  };

  const validate = (): boolean => {
    const errs: FormErrors = {};
    if (!teamName.trim()) errs.teamName = 'Team Name is required.';
    if (!department) errs.department = 'Department is required.';
    if (!leaderName.trim()) errs.leaderName = 'Leader Name is required.';
    // Facilitator Name is optional — no longer mandatory.
    if (!coordinatorName.trim()) errs.coordinatorName = 'Coordinator Name is required.';
    const activeMembers = members.filter(m => m.isActive);
    if (activeMembers.length < 2) errs.members = 'At least 2 active team members are required.';
    members.forEach(m => {
      if (m.isActive) {
        if (!m.memberName.trim()) errs[`member_name_${m.key}`] = 'Member Name is required.';
        if (!m.employeeId.trim()) errs[`member_empid_${m.key}`] = 'Employee ID is required.';
      }
    });
    setErrors(errs);
    setTouched({ teamName: true, department: true, leaderName: true, facilitatorName: true, coordinatorName: true, members: true });
    return Object.keys(errs).length === 0;
  };

  const handleSave = async (isDraft: boolean) => {
    if (!isDraft && !validate()) { showToast('Fix the errors first', 'error'); formTopRef.current?.scrollIntoView({ behavior: 'smooth' }); return; }
    if (isDraft) { setDraftSavedAt(new Date().toLocaleTimeString()); showToast('Draft saved', 'info'); return; }
    const teamId = editingTeamId || genTeamId(department, teams);
    // No sub-department → carry the department name in its place.
    const teamSubDept = subDepartment || department;
    const memberDept = teamSubDept;
    const teamMembers: TeamMember[] = members.map((m, i) => ({ memberId: `TM-${String(Date.now()).slice(-3)}-${i + 1}`, teamId, memberName: m.memberName.trim(), employeeId: m.employeeId.trim(), department: m.department || memberDept, isActive: m.isActive, deactivationReason: m.deactivationReason || undefined, deactivatedAt: m.deactivatedAt || undefined }));
    if (editingTeamId) {
      hy.setTeamHalf(editingTeamId, hy.active.half, hy.active.year);
      setTeams(prev => prev.map(t => t.id === editingTeamId ? { ...t, name: teamName.trim(), department, subDepartment: teamSubDept, leaderName: leaderName.trim(), facilitatorName: facilitatorName.trim(), coordinatorName: coordinatorName.trim(), projectTheme: projectTheme.trim(), members: teamMembers } : t));
      showToast('Team updated', 'success');
    } else {
      // NEW team → persist to the backend, then reload so it shows in the list.
      try {
        const created = await api.createTeam({
          name: teamName.trim(), department,
          subDepartment: teamSubDept,
          leaderName: leaderName.trim(), facilitatorName: facilitatorName.trim(),
          coordinatorName: coordinatorName.trim(), projectTheme: projectTheme.trim(),
          members: teamMembers,
        });
        // Add the team to the currently-selected period (the header/form selector).
        hy.setTeamHalf(created.id, hy.active.half, hy.active.year);
        await reloadTeams();
        showToast('Team registered', 'success');
      } catch (e) {
        showToast(e instanceof ApiError ? e.message : 'Failed to register team', 'error');
        return;
      }
    }
    setView('list'); setEditingTeamId(null); setDraftSavedAt(null);
  };

  // ── Bulk import — read the template OR a company Excel/CSV exactly as given ───
  interface BulkRow { name: string; department: string; subDepartment: string; leader: string; facilitator: string; coordinator: string; theme: string; members: { name: string; empId: string; dept?: string }[]; error?: string; warn?: string; }
  const BULK_HEADERS = ['Team Name', 'Department', 'Sub Department', 'Leader', 'Facilitator', 'Coordinator', 'Project Theme', 'Members (Name:EmpID; …)'];
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkSummary, setBulkSummary] = useState<{ imported: number; incomplete: number; failed: number; failures: string[] } | null>(null);

  const parseCSVLine = (line: string): string[] => {
    const out: string[] = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur); return out;
  };

  // Header → field synonyms. These are used ONLY to locate the right column — the
  // cell VALUES are always imported verbatim (never renamed, merged or truncated).
  const H_NORM = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const FIELD_SYNONYMS: Record<string, string[]> = {
    team: ['teamname', 'team', 'circlename', 'circle', 'qccname', 'qcccircle', 'qcc', 'nameofcircle', 'nameofteam', 'circletitle', 'groupname'],
    dept: ['department', 'dept', 'division', 'div'],
    subdept: ['subdepartment', 'subdept', 'section', 'area', 'shop', 'line', 'zone', 'cell', 'workarea', 'subdivision', 'process'],
    leader: ['leader', 'teamleader', 'teamleadername', 'circleleader', 'leadername', 'tlname', 'tlnm', 'tl', 'groupleader'],
    facilitator: ['facilitator', 'advisor', 'adviser', 'guide', 'mentor', 'facilitatoradvisor'],
    coordinator: ['coordinatorname', 'coordinator', 'coord'],
    theme: ['theme', 'projecttheme', 'problem', 'problemstatement', 'topic', 'projecttitle', 'improvementtheme'],
    memberName: ['membername', 'name', 'participant', 'employeename', 'empname', 'participantname'],
    empId: ['empid', 'employeeid', 'empcode', 'employeecode', 'membercode', 'ecode', 'code', 'empno', 'employeeno', 'staffid', 'ticketno', 'tokenno', 'ecno', 'payrollno'],
  };
  // First number found in a header — pairs "Member 1" with "M- 1 Code" / "M- 1 Dept.".
  const numOf = (h: string): number | null => { const m = String(h).match(/(\d+)/); return m ? Number(m[1]) : null; };

  // Turn a raw grid (array-of-rows) into BulkRows. Values are copied exactly as they
  // appear in the file; blank cells/columns are skipped; only a completely missing
  // required field (Team Name / Department) becomes an error.
  const parseGrid = (aoa: string[][]): BulkRow[] => {
    const grid = aoa.filter(r => r && r.some(c => String(c ?? '').trim()));
    if (grid.length < 2) return [];

    // Detect the header row — company sheets often carry a title/blank rows on top.
    let headerIdx = 0, bestScore = 0;
    for (let r = 0; r < Math.min(grid.length, 15); r++) {
      let score = 0;
      grid[r].map(H_NORM).forEach(c => { if (c && Object.values(FIELD_SYNONYMS).some(syns => syns.some(s => c === s || c.includes(s) || s.includes(c)))) score++; });
      if (score > bestScore) { bestScore = score; headerIdx = r; }
    }
    const headers = grid[headerIdx].map(h => String(h ?? '').trim());
    const H = headers.map(H_NORM);
    const used = new Set<number>();

    // Member columns first (so a "Name" column isn't mistaken for the team name).
    const memberNameCols: number[] = [];
    const empIdCols: number[] = [];        // per-member code columns ("M- 1 Code", "Emp Code 1", …)
    const memberDeptCols: number[] = [];   // per-member dept columns ("M- 1 Dept.")
    let membersListCol = -1;
    headers.forEach((h, i) => {
      const hl = h.toLowerCase(); const n = H[i]; if (!n) return;
      // Per-member DEPT column, e.g. "M- 1 Dept." — captured but kept out of the team dept.
      const isMemberDept = /^m[-\s.]*\d+\s*dept/.test(hl) || /member\s*\d+\s*dept/.test(hl);
      // Employee CODE — the file may call it "Member Code" / "M- 1 Code" (no "emp" at all).
      const isEmpId = !isMemberDept && (FIELD_SYNONYMS.empId.some(s => n === s || n.includes(s)) || /code/.test(hl) || /emp\.?\s*(id|no)/.test(hl) || /employee\s*(id|code|no)/.test(hl));
      const isList = n.startsWith('members') || ['teammembers', 'participants', 'memberdetails'].includes(n);
      const isName = FIELD_SYNONYMS.memberName.some(s => n === s) || n === 'member' || /member\s*\d+/.test(hl) || /member\s*name/.test(hl) || /^name\s*\d+$/.test(hl) || /participant/.test(hl);
      // Order matters: member-dept → code → list → name (a "Members (…)" list column must
      // win over the code test even though its header text may contain "code"/"empid").
      if (isMemberDept) { memberDeptCols.push(i); used.add(i); }
      else if (isList) { membersListCol = i; used.add(i); }
      else if (isEmpId) { empIdCols.push(i); used.add(i); }
      else if (isName) { memberNameCols.push(i); used.add(i); }
    });
    if (memberNameCols.length && membersListCol >= 0) { used.delete(membersListCol); membersListCol = -1; }

    // Single-value roles. A column is assigned to the field it matches BEST (so a
    // "Dept" header goes to Department, not Sub-Department, even though "subdept"
    // weakly contains "dept"). Strong best-field matches are claimed first, then any
    // leftover field falls back to the best remaining column.
    const scoreOf = (n: string, field: string): number => {
      let sc = 0;
      for (const s of FIELD_SYNONYMS[field]) {
        if (n === s) sc = Math.max(sc, 3);
        else if (n.startsWith(s) || n.endsWith(s)) sc = Math.max(sc, 2);
        else if (n.includes(s) || s.includes(n)) sc = Math.max(sc, 1);
      }
      return sc;
    };
    const SINGLE_FIELDS = ['team', 'dept', 'subdept', 'leader', 'coordinator', 'facilitator', 'theme'];
    const colBest: Record<number, { field: string; score: number }> = {};
    H.forEach((n, i) => {
      if (used.has(i) || !n) return;
      let bf = '', bs = 0;
      for (const f of SINGLE_FIELDS) { const s = scoreOf(n, f); if (s > bs) { bs = s; bf = f; } }
      if (bs > 0) colBest[i] = { field: bf, score: bs };
    });
    const assign: Record<string, number> = {};
    // Pass 1 — give each field the column that most prefers it.
    for (const f of SINGLE_FIELDS) {
      let best = -1, bs = 0;
      for (const [k, info] of Object.entries(colBest)) {
        const i = Number(k);
        if (used.has(i) || info.field !== f) continue;
        if (info.score > bs) { bs = info.score; best = i; }
      }
      if (best >= 0) { assign[f] = best; used.add(best); }
    }
    // Pass 2 — fill any still-empty field from the best remaining column.
    for (const f of SINGLE_FIELDS) {
      if (assign[f] !== undefined) continue;
      let best = -1, bs = 0;
      H.forEach((n, i) => { if (used.has(i) || !n) return; const s = scoreOf(n, f); if (s > bs) { bs = s; best = i; } });
      if (best >= 0) { assign[f] = best; used.add(best); }
    }
    const cLeader = assign.leader ?? -1;
    const cCoord = assign.coordinator ?? -1;
    // A "Coordinator No." column means coordinator names are merged across a group of
    // rows (blank on continuation rows). Only THEN do we carry the coordinator down —
    // in a flat sheet a blank coordinator is genuinely blank (→ flagged Incomplete).
    const cCoordNo = H.findIndex(n => !!n && /coord/.test(n) && /(no|number)$/.test(n));
    const cFacil = assign.facilitator ?? -1;
    const cTheme = assign.theme ?? -1;
    const cSub = assign.subdept ?? -1;
    const cDept = assign.dept ?? -1;
    const cTeam = assign.team ?? -1;

    const val = (row: string[], idx: number) => (idx >= 0 ? String(row[idx] ?? '').trim() : '');

    // Pair member-name columns with their code / dept columns by the number in the
    // header (Member 1 ↔ M- 1 Code ↔ M- 1 Dept.); otherwise pair them left-to-right.
    const nameNums = memberNameCols.map(ci => numOf(headers[ci]));
    const idNums = empIdCols.map(ci => numOf(headers[ci]));
    const deptNums = memberDeptCols.map(ci => numOf(headers[ci]));
    const pairIdByNum = empIdCols.length > 0 && nameNums.every(x => x != null) && idNums.every(x => x != null);
    const pairDeptByNum = memberDeptCols.length > 0 && nameNums.every(x => x != null) && deptNums.every(x => x != null);

    // Coordinator (and, if merged the same way, leader) can be blank on continuation
    // rows of a merged cell — carry the last non-blank value down.
    let lastCoord = '';

    return grid.slice(headerIdx + 1)
      .filter(r => r.some(c => String(c ?? '').trim()))   // skip fully-blank rows silently
      .flatMap(row => {
        const name = val(row, cTeam);
        const department = val(row, cDept);
        // A team with no sub-department just carries the department name.
        const subDepartment = val(row, cSub) || department;
        const leader = val(row, cLeader);
        const facilitator = val(row, cFacil);
        let coordinator = val(row, cCoord);
        if (coordinator) lastCoord = coordinator;
        else if (cCoordNo >= 0) coordinator = lastCoord;   // merged-cell fill (grouped sheets only)
        const theme = val(row, cTheme);

        // Build the member list EXACTLY as provided — every member + its own code & dept,
        // blank cells skipped, nothing renamed or merged.
        let members: { name: string; empId: string; dept?: string }[] = [];
        if (membersListCol >= 0) {
          // Template format: "Name:EmpID; Name2:EmpID2". Split on ';' / newline, then
          // the FIRST ':' only (so names never get truncated).
          members = val(row, membersListCol).split(/[;\n]+/).map(p => p.trim()).filter(Boolean).map(p => {
            const idx = p.indexOf(':');
            return idx >= 0 ? { name: p.slice(0, idx).trim(), empId: p.slice(idx + 1).trim() } : { name: p, empId: '' };
          });
        } else if (memberNameCols.length) {
          members = memberNameCols.map((ci, k) => {
            const mName = val(row, ci);
            let empId = '', mDept = '';
            if (pairIdByNum) { const j = idNums.indexOf(nameNums[k]); if (j >= 0) empId = val(row, empIdCols[j]); }
            else if (empIdCols[k] !== undefined) empId = val(row, empIdCols[k]);
            if (pairDeptByNum) { const j = deptNums.indexOf(nameNums[k]); if (j >= 0) mDept = val(row, memberDeptCols[j]); }
            else if (memberDeptCols[k] !== undefined) mDept = val(row, memberDeptCols[k]);
            return { name: mName, empId, dept: mDept || undefined };
          });
        }
        // Keep EVERY named member — even without a code (blank code is imported as-is).
        members = members.filter(m => m.name);
        // Silently skip spacer/total rows that carry no team name AND no members (these
        // appear between coordinator groups and at the sheet's end — not real teams).
        if (!name && members.length === 0) return [];

        // Hard error = the backend cannot store the team at all (needs a name + department).
        // These rows are the ONLY ones left out of the import.
        let error = '';
        if (!name) error = 'Team Name missing';
        else if (!department) error = 'Department missing';

        // "Incomplete" = the team DOES import, but something is missing so the user can
        // fix it later (flagged by the Incomplete KPI on the list too). Employee codes /
        // coordinators may repeat across teams — that is allowed and never flagged.
        const reasons: string[] = [];
        if (!error) {
          if (!leader) reasons.push('no leader');
          if (!coordinator) reasons.push('no coordinator');
          if (members.length < 2) reasons.push('fewer than 2 members');
          const noCode = members.filter(m => !m.empId).map(m => m.name);
          if (noCode.length) reasons.push(`no code: ${noCode.join(', ')}`);
        }
        const warn = reasons.length ? `Incomplete — ${reasons.join('; ')}` : undefined;

        return [{ name, department, subDepartment, leader, facilitator, coordinator, theme, members, error: error || undefined, warn }];
      });
  };

  const applyGrid = (aoa: string[][]) => {
    const rows = parseGrid(aoa);
    setBulkRows(rows); setBulkSummary(null);
    if (!rows.length) showToast('No teams found in file', 'error');
  };

  const handleBulkFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const isExcel = /\.xlsx?$/i.test(file.name);
    const reader = new FileReader();
    reader.onerror = () => showToast('Could not read the file.', 'error');
    if (isExcel) {
      reader.onload = () => {
        try {
          const wb = XLSX.read(reader.result as ArrayBuffer, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const aoa = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, blankrows: false, defval: '' });
          applyGrid(aoa);
        } catch { showToast('Could not read the Excel file.', 'error'); }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = () => {
        const text = String(reader.result || '');
        applyGrid(text.split(/\r?\n/).filter(l => l.trim()).map(parseCSVLine));
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  };

  const closeBulk = () => { if (bulkImporting) return; setBulkOpen(false); setBulkRows([]); setBulkSummary(null); };

  const downloadBulkTemplate = () => {
    const csv = BULK_HEADERS.join(',') + '\n'
      + 'Alpha Circle,Manufacturing,Press Shop,Priya Sharma,Amit Patel,Neha Kapoor,Reduce CNC setup time,Ravi Kumar:E101; Sunita Rao:E102; Arjun Mehta:E103\n'
      + 'Beta Circle,Quality Assurance,RQC,Meera Joshi,,Rahul Verma,Reduce line defects,Kiran S:E201; Deepak M:E202';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'team-registration-template.csv';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const downloadBulkTemplateXlsx = () => {
    const rows = [
      BULK_HEADERS,
      ['Alpha Circle', 'Manufacturing', 'Press Shop', 'Priya Sharma', 'Amit Patel', 'Neha Kapoor', 'Reduce CNC setup time', 'Ravi Kumar:E101; Sunita Rao:E102; Arjun Mehta:E103'],
      ['Beta Circle', 'Quality Assurance', 'RQC', 'Meera Joshi', '', 'Rahul Verma', 'Reduce line defects', 'Kiran S:E201; Deepak M:E202'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Teams');
    XLSX.writeFile(wb, 'team-registration-template.xlsx');
  };

  const importBulk = async () => {
    const valid = bulkRows.filter(r => !r.error);
    if (!valid.length) { showToast('No valid rows to import', 'error'); return; }
    setBulkImporting(true);
    let ok = 0, incompleteOk = 0; const failures: string[] = [];
    for (const r of valid) {
      try {
        const members: TeamMember[] = r.members.map((m, i) => ({
          memberId: `TM-${Date.now().toString(36)}-${i + 1}`, teamId: '', memberName: m.name,
          employeeId: m.empId, department: m.dept || r.subDepartment || r.department, isActive: true,
        }));
        // Persisting through the shared backend means the team instantly appears in
        // Team Control, Dashboard, Meeting Management, Projects & every other module —
        // no duplicate data entry needed anywhere.
        const created = await api.createTeam({
          name: r.name, department: r.department, subDepartment: r.subDepartment || undefined,
          leaderName: r.leader, facilitatorName: r.facilitator, coordinatorName: r.coordinator,
          projectTheme: r.theme, members,
        });
        hy.setTeamHalf(created.id, hy.active.half, hy.active.year);
        ok++;
        if (r.warn) incompleteOk++;
      } catch (e) { failures.push(`${r.name || 'Unnamed team'}: ${e instanceof ApiError ? e.message : 'import failed'}`); }
    }
    await reloadTeams();
    setBulkImporting(false);
    setBulkRows([]);
    setBulkSummary({ imported: ok, incomplete: incompleteOk, failed: failures.length, failures });
    showToast(`Imported ${ok} team${ok === 1 ? '' : 's'}${incompleteOk ? ` (${incompleteOk} incomplete)` : ''}${failures.length ? `, ${failures.length} failed` : ''}.`, failures.length ? 'info' : 'success');
  };

  // Names already used for each role across existing teams — shown as hints (ideas).
  const usedNames = (pick: (t: Team) => string) => [...new Set(teams.map(pick).map(s => (s || '').trim()).filter(Boolean))];
  const usedLeaders = usedNames(t => t.leaderName);
  const usedFacilitators = usedNames(t => t.facilitatorName);
  const usedCoordinators = usedNames(t => t.coordinatorName);
  const matchUsed = (list: string[], text: string) => list.filter(n => n.toLowerCase().includes(text.trim().toLowerCase()));

  // Department options for a member: the current value + team dept/sub-dept + all
  // departments + all sub-departments (deduped) so any of them can be picked.
  const deptOptionsFor = (cur: string) =>
    [...new Set([cur, subDepartment, department, ...hierarchy.departments, ...hierarchy.nodes.filter(n => n.level === 'sub_department').map(n => n.name)].filter(Boolean))];

  const fieldClass = (fieldName: string, hasError: boolean) =>
    `w-full px-4 py-3 border rounded-xl text-sm outline-none transition-all duration-200 ${hasError && touched[fieldName] ? 'border-red-300 bg-red-50/30 focus:ring-2 focus:ring-red-200 focus:border-red-400' : 'border-slate-200 bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-400'}`;

  const memberFieldClass = (hasError: boolean) =>
    `w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all duration-200 ${hasError ? 'border-red-300 bg-red-50/30 focus:ring-2 focus:ring-red-200 focus:border-red-400' : 'border-slate-200 bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-400'}`;

  const activeMembers = members.filter(m => m.isActive);
  const viewingTeam = teams.find(t => t.id === viewingTeamId);
  const availableSubDepts = hierarchy.subDeptsOf(department);
  const availableLines = getLinesForSubDept(subDepartment);
  const errorCount = Object.values(errors).filter(Boolean).length;

  const renderToast = () => {
    if (!toast.show) return null;
    const colors = { success: 'bg-emerald-600', error: 'bg-red-600', info: 'bg-blue-600' };
    const icons = { success: <CheckCircle2 size={18} />, error: <AlertCircle size={18} />, info: <Save size={18} /> };
    return <div className="fixed top-6 right-6 z-[100] animate-[slideIn_0.3s_ease-out]"><div className={`${colors[toast.type]} text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 max-w-sm`}>{icons[toast.type]}<p className="text-sm font-medium">{toast.message}</p></div></div>;
  };

  const renderDeactivatePopup = () => {
    if (!deactivateTarget) return null;
    const member = members.find(m => m.key === deactivateTarget);
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-[scaleIn_0.2s_ease-out]">
          <div className="bg-red-50 px-6 py-4 border-b border-red-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center"><UserMinus size={20} className="text-red-600" /></div>
            <div><h3 className="text-sm font-bold text-red-800">Deactivate Member</h3><p className="text-xs text-red-600">{member?.memberName || 'Member'}</p></div>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Reason for Deactivation <span className="text-red-500">*</span></label>
              <textarea value={deactivateReason} onChange={e => { setDeactivateReason(e.target.value); setDeactivateError(''); }} placeholder="Please provide a reason..." rows={3} className={`w-full px-4 py-2.5 border rounded-lg text-sm outline-none resize-none transition-all ${deactivateError ? 'border-red-400 bg-red-50/50' : 'border-slate-300 focus:ring-2 focus:ring-blue-400 focus:border-blue-500'}`} />
              {deactivateError && <p className="flex items-center gap-1 mt-1.5 text-xs text-red-600"><AlertCircle size={12} /> {deactivateError}</p>}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setDeactivateTarget(null); setDeactivateReason(''); setDeactivateError(''); }} className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg">Cancel</button>
              <button onClick={confirmDeactivate} className="px-5 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm">Confirm Deactivate</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ─── LIST VIEW ─────────────────────────────────────────
  if (view === 'list') {
    return (
      <div className="space-y-6">
        {renderToast()}
        <HeaderPortal>
          {(user?.role === 'admin' || user?.role === 'leader' || user?.role === 'facilitator') && <button onClick={() => { setBulkRows([]); setBulkSummary(null); setBulkOpen(true); }} className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold rounded-lg shadow-sm"><Upload size={16} /> Upload</button>}
          {(user?.role === 'admin' || user?.role === 'leader' || user?.role === 'facilitator') && <button onClick={openNewForm} className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm"><Plus size={16} /> New Team</button>}
        </HeaderPortal>

        {bulkOpen && (
          <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={closeBulk}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden animate-[scaleIn_0.18s_ease-out] flex flex-col max-h-[88vh]" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0"><Upload size={18} /></span>
                  <div><h3 className="text-sm font-bold text-slate-800">Import teams</h3><p className="text-[11px] text-slate-500">Use our template <b>or drop your company's own team Excel</b> — columns are auto-mapped. Adds into QCC {hy.active.year} · {hy.labelHalf(hy.active.half)}</p></div>
                </div>
                <button onClick={closeBulk} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"><X size={18} /></button>
              </div>

              <div className="p-6 space-y-4 overflow-y-auto">
                {/* ── Import summary (shown after an import completes) ── */}
                {bulkSummary ? (
                  <div className="space-y-4">
                    <div className={`rounded-xl border p-5 ${bulkSummary.failed ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                      <div className="flex items-center gap-3">
                        <span className={`w-10 h-10 rounded-full flex items-center justify-center ${bulkSummary.failed ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                          {bulkSummary.failed ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
                        </span>
                        <div>
                          <h4 className="text-sm font-bold text-slate-800">Import complete</h4>
                          <p className="text-xs text-slate-600 mt-0.5"><b className="text-emerald-700">{bulkSummary.imported}</b> team{bulkSummary.imported === 1 ? '' : 's'} imported{bulkSummary.incomplete ? <> · <b className="text-amber-600">{bulkSummary.incomplete}</b> flagged incomplete</> : ''}{bulkSummary.failed ? <> · <b className="text-red-600">{bulkSummary.failed}</b> couldn't import</> : ''}. They now appear in Team Control, Dashboard, Meetings &amp; Projects{bulkSummary.incomplete ? <> — open the <b>Incomplete</b> filter to finish them</> : ''}.</p>
                        </div>
                      </div>
                      {bulkSummary.failures.length > 0 && (
                        <ul className="mt-3 pt-3 border-t border-amber-200/70 space-y-1 max-h-40 overflow-y-auto">
                          {bulkSummary.failures.map((f, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-[11px] text-red-700"><AlertCircle size={11} className="mt-0.5 flex-shrink-0" /> {f}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                ) : (
                <>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button onClick={downloadBulkTemplate} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"><Download size={15} /> CSV template</button>
                  <button onClick={downloadBulkTemplateXlsx} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"><Download size={15} /> Excel template</button>
                  <label className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-slate-300 rounded-lg text-sm font-medium text-blue-600 hover:border-blue-400 hover:bg-blue-50/40 cursor-pointer">
                    <FileSpreadsheet size={15} /> Choose file — template OR company Excel…
                    <input type="file" accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" className="hidden" onChange={handleBulkFile} />
                  </label>
                </div>
                <p className="text-[11px] text-slate-400">Upload our template <b>or your own company team Excel/CSV</b> — data is read exactly as entered. Rows with missing details (no employee code, no coordinator/leader, fewer than 2 members) <b>still import</b> but are flagged <span className="text-amber-600 font-semibold">Incomplete</span> so you can complete them later. Only a row with <b>no Team&nbsp;Name or Department</b> can't be imported.</p>

                {bulkRows.length > 0 && (
                  <div>
                    <div className="flex items-center gap-3 text-xs mb-2">
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold"><CheckCircle2 size={13} /> {bulkRows.filter(r => !r.error && !r.warn).length} complete</span>
                      {bulkRows.some(r => !r.error && r.warn) && <span className="inline-flex items-center gap-1 text-amber-600 font-semibold"><AlertCircle size={13} /> {bulkRows.filter(r => !r.error && r.warn).length} incomplete (will import)</span>}
                      {bulkRows.some(r => r.error) && <span className="inline-flex items-center gap-1 text-red-600 font-semibold"><AlertCircle size={13} /> {bulkRows.filter(r => r.error).length} can't import</span>}
                    </div>
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <div className="overflow-x-auto max-h-64 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 sticky top-0"><tr>
                            <th className="px-3 py-2 text-left font-semibold text-slate-500">#</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-500">Team</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-500">Department</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-500">Leader</th>
                            <th className="px-3 py-2 text-center font-semibold text-slate-500">Members</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-500">Status</th>
                          </tr></thead>
                          <tbody className="divide-y divide-slate-100">
                            {bulkRows.map((r, i) => (
                              <tr key={i} className={r.error ? 'bg-red-50/40' : r.warn ? 'bg-amber-50/50' : ''}>
                                <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                                <td className="px-3 py-2 font-medium text-slate-800">{r.name || '—'}</td>
                                <td className="px-3 py-2 text-slate-600">{r.department || '—'}{r.subDepartment && r.subDepartment !== r.department && ` › ${r.subDepartment}`}</td>
                                <td className="px-3 py-2 text-slate-600">{r.leader || '—'}</td>
                                <td className="px-3 py-2 text-center text-slate-600">{r.members.length}</td>
                                <td className="px-3 py-2">{r.error
                                  ? <span className="inline-flex items-center gap-1 text-red-600" title={r.warn || undefined}><AlertCircle size={11} /> {r.error}{r.warn ? ` · ${r.warn}` : ''}</span>
                                  : r.warn
                                    ? <span className="inline-flex items-center gap-1 text-amber-600" title={r.warn}><AlertCircle size={11} /> {r.warn}</span>
                                    : <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 size={11} /> Complete</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
                </>
                )}
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                {bulkSummary ? (
                  <button onClick={closeBulk} className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg">Done</button>
                ) : (
                <>
                <button onClick={closeBulk} className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg">Cancel</button>
                <button onClick={importBulk} disabled={bulkImporting || bulkRows.filter(r => !r.error).length === 0} className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
                  {bulkImporting ? <><Loader2 size={15} className="animate-spin" /> Importing…</> : <><Upload size={15} /> Import {bulkRows.filter(r => !r.error).length || ''} team{bulkRows.filter(r => !r.error).length === 1 ? '' : 's'}</>}
                </button>
                </>
                )}
              </div>
            </div>
          </div>
        )}
        {!isLeader && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {([
                { icon: <Users size={20} />, value: halfYearTeams.length, label: 'Total Teams', key: 'all' },
                { icon: <CheckCircle2 size={20} />, value: halfYearTeams.filter(t => t.status === 'active').length, label: 'Active Teams', key: 'active' },
                { icon: <UserCheck size={20} />, value: halfYearTeams.reduce((s, t) => s + t.members.filter(m => m.isActive).length, 0), label: 'Total Members', key: 'members' },
                { icon: <Lightbulb size={20} />, value: halfYearTeams.filter(t => t.projectTheme).length, label: 'With Theme', key: 'theme' },
                { icon: <AlertCircle size={20} />, value: halfYearTeams.filter(isIncomplete).length, label: 'Incomplete', key: 'incomplete' },
              ] as { icon: ReactNode; value: number; label: string; key: 'all' | 'active' | 'members' | 'theme' | 'incomplete' }[]).map((s, i) => (
                <StatCard key={i} label={s.label} value={s.value} icon={s.icon} grad={STAT_GRADIENTS[i % STAT_GRADIENTS.length]}
                  active={teamFilter === s.key}
                  onClick={() => setTeamFilter(s.key)} />
              ))}
            </div>
            {teamFilter !== 'all' && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Filter size={13} className="text-blue-500" />
                Showing <b className="text-slate-700">{filteredTeams.length}</b> of {roleTeams.length} teams
                <button onClick={() => setTeamFilter('all')} className="ml-1 font-semibold text-blue-600 hover:underline">Clear filter</button>
              </div>
            )}
          </>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredTeams.map((team, i) => {
            const activeCount = team.members.filter(m => m.isActive).length;
            const totalCount = team.members.length;
            const incomplete = isIncomplete(team);
            const canEdit = isAdmin || (isLeader && team.leaderName === user?.name);
            return (
              <div key={team.id} className="bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-all duration-200 overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0 flex-1 flex items-center gap-2.5"><span className={`w-8 h-8 rounded-lg ${CHIP_ACCENTS[i % CHIP_ACCENTS.length]} flex items-center justify-center flex-shrink-0`}><Users size={16} /></span><div className="min-w-0"><div className="flex items-center gap-2 mb-1"><h3 className="text-sm font-bold text-slate-800 truncate">{team.name}</h3>{user?.role === 'admin' && <span title="Admin-locked"><Lock size={12} className="text-slate-400 flex-shrink-0" /></span>}</div><p className="text-xs text-blue-600 font-mono font-medium">{team.id}</p></div></div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                      {incomplete && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700" title="Missing leader, coordinator or member codes"><AlertCircle size={10} /> Incomplete</span>}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${team.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{team.status}</span>
                    </div>
                  </div>
                  <div className="space-y-1.5 mb-3 text-xs text-slate-600">
                    <div className="flex items-center gap-2"><Building2 size={13} className="text-slate-400 flex-shrink-0" /><span className="truncate">{team.department}{team.subDepartment && team.subDepartment !== team.department && ` > ${team.subDepartment}`}</span></div>
                    <div className="flex items-center gap-2"><Users size={13} className="text-slate-400 flex-shrink-0" />{activeCount} active / {totalCount} total members</div>
                    {team.projectTheme && <div className="flex items-center gap-2"><Lightbulb size={13} className="text-amber-500 flex-shrink-0" /><span className="truncate">{team.projectTheme}</span></div>}
                  </div>
                  <div className="pt-3 border-t border-slate-100 space-y-1">
                    <p className="text-[11px] text-slate-500"><span className="font-medium">Leader:</span> {team.leaderName || <span className="text-amber-600">—</span>}</p>
                    <p className="text-[11px] text-slate-500"><span className="font-medium">Coordinator:</span> {team.coordinatorName || <span className="text-amber-600">—</span>}</p>
                    <p className="text-[11px] text-slate-500"><span className="font-medium">Stage:</span> {team.currentStage === 0 ? 'Not Started' : `Step ${team.currentStage} of 7`}</p>
                  </div>
                  <div className="mt-3"><div className="flex items-center justify-between text-[10px] text-slate-500 mb-1"><span>Workflow Progress</span><span>{Math.round((team.currentStage / 7) * 100)}%</span></div><div className="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${(team.currentStage / 7) * 100}%` }} /></div></div>
                </div>
                <div className="border-t border-slate-100 px-5 py-2.5 flex items-center gap-1 bg-slate-50/50">
                  <button onClick={() => openDetail(team.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg"><Eye size={13} /> View</button>
                  {canEdit && <button onClick={() => loadTeamForEdit(team)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"><Edit2 size={13} /> Edit</button>}
                </div>
              </div>
            );
          })}
        </div>
        {filteredTeams.length === 0 && <div className="text-center py-16"><div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4"><Users size={32} className="text-slate-400" /></div><p className="text-slate-600 font-medium">No teams found</p><p className="text-sm text-slate-500 mt-1">{teamFilter !== 'all' ? 'No teams match this filter.' : isLeader ? 'You have not registered any teams yet.' : 'No teams have been registered yet.'}</p>{teamFilter !== 'all' && <button onClick={() => setTeamFilter('all')} className="mt-3 text-xs font-semibold text-blue-600 hover:underline">Clear filter</button>}</div>}
      </div>
    );
  }

  // ─── DETAIL VIEW ───────────────────────────────────────
  if (view === 'detail' && viewingTeam) {
    const t = viewingTeam;
    const canEdit = isAdmin || (isLeader && t.leaderName === user?.name);
    return (
      <div className="space-y-6">{renderToast()}
        <button onClick={() => setView('list')} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-blue-600"><ArrowLeft size={16} /> Back to Teams</button>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-800 px-6 py-5 text-white"><div className="flex items-start justify-between"><div><div className="flex items-center gap-2 mb-1"><h1 className="text-xl font-bold">{t.name}</h1>{user?.role === 'admin' && <Lock size={14} className="opacity-70" />}</div><p className="text-sm text-blue-200 font-mono">{t.id}</p></div><span className={`px-3 py-1 rounded-full text-xs font-semibold ${t.status === 'active' ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/20 text-white/80'}`}>{t.status}</span></div></div>
          <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 text-sm"><div><p className="text-[10px] text-slate-500 uppercase tracking-wider">Department</p><p className="font-semibold text-slate-800 mt-0.5">{t.department}</p></div><div><p className="text-[10px] text-slate-500 uppercase tracking-wider">Sub Department</p><p className="font-semibold text-slate-800 mt-0.5">{t.subDepartment || '—'}</p></div><div><p className="text-[10px] text-slate-500 uppercase tracking-wider">Leader</p><p className="font-semibold text-slate-800 mt-0.5">{t.leaderName || '—'}</p></div><div><p className="text-[10px] text-slate-500 uppercase tracking-wider">Facilitator</p><p className="font-semibold text-slate-800 mt-0.5">{t.facilitatorName || '—'}</p></div><div><p className="text-[10px] text-slate-500 uppercase tracking-wider">Coordinator</p><p className="font-semibold text-slate-800 mt-0.5">{t.coordinatorName || '—'}</p></div></div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200"><div className="flex items-center justify-between mb-2"><h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0"><Lightbulb size={16} /></span> Project Theme</h3>{canEdit && <button onClick={() => loadTeamForEdit(t)} className="text-xs text-blue-600 hover:text-blue-700 font-medium">{t.projectTheme ? 'Update' : 'Add'}</button>}</div>{t.projectTheme ? <p className="text-sm text-slate-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">{t.projectTheme}</p> : <p className="text-sm text-slate-400 italic bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">No project theme assigned yet.</p>}</div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"><div className="px-6 py-4 border-b border-slate-100"><h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2.5"><span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0"><Users size={16} /></span>Team Members ({t.members.filter(m => m.isActive).length} active / {t.members.length} total)</h3></div><div className="overflow-x-auto"><table className="w-full"><thead><tr className="bg-slate-50"><th className="text-left px-5 py-2.5 text-[10px] font-semibold text-slate-500 uppercase">#</th><th className="text-left px-5 py-2.5 text-[10px] font-semibold text-slate-500 uppercase">Name</th><th className="text-left px-5 py-2.5 text-[10px] font-semibold text-slate-500 uppercase">Employee ID</th><th className="text-left px-5 py-2.5 text-[10px] font-semibold text-slate-500 uppercase">Department</th><th className="text-left px-5 py-2.5 text-[10px] font-semibold text-slate-500 uppercase">Status</th><th className="text-left px-5 py-2.5 text-[10px] font-semibold text-slate-500 uppercase">Notes</th></tr></thead><tbody className="divide-y divide-slate-100">{t.members.map((m, i) => (<tr key={m.memberId} className={`hover:bg-slate-50 ${!m.isActive ? 'opacity-60' : ''}`}><td className="px-5 py-3 text-xs text-slate-500">{i + 1}</td><td className="px-5 py-3 text-sm font-medium text-slate-800">{m.memberName}</td><td className="px-5 py-3 text-xs font-mono text-slate-600">{m.employeeId}</td><td className="px-5 py-3 text-xs text-slate-600">{m.department || '—'}</td><td className="px-5 py-3"><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${m.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{m.isActive ? <CheckCircle2 size={10} /> : <X size={10} />}{m.isActive ? 'Active' : 'Deactivated'}</span></td><td className="px-5 py-3 text-xs text-slate-500">{!m.isActive && m.deactivationReason ? <span className="italic">{m.deactivationReason}</span> : '—'}</td></tr>))}</tbody></table></div></div>
        {canEdit && <div className="flex justify-end"><button onClick={() => loadTeamForEdit(t)} className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm"><Edit2 size={16} /> Edit Team</button></div>}
      </div>
    );
  }

  // ─── FORM VIEW ─────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-5xl" ref={formTopRef}>
      {renderToast()}{renderDeactivatePopup()}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setView('list')} className="p-2 rounded-lg hover:bg-white text-slate-500 hover:text-blue-600"><ArrowLeft size={20} /></button>
          <div><h1 className="text-2xl font-bold text-slate-800">{editingTeamId ? 'Edit Team' : 'Register New QCC Team'}</h1><p className="text-sm text-slate-500 mt-0.5">Fields marked with <span className="text-red-500 font-bold">*</span> are mandatory</p></div>
        </div>
        <div className="flex items-center gap-3">
          {draftSavedAt && <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"><Clock size={13} /> Draft saved at {draftSavedAt}</div>}
          {errorCount > 0 && <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2"><AlertCircle size={13} /> {errorCount} error{errorCount > 1 ? 's' : ''}</div>}
        </div>
      </div>

      {/* Team ID Banner */}
      {department && (
        <div className="flex items-center gap-3 px-5 py-3.5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl">
          <Hash size={18} className="text-blue-600" />
          <div><p className="text-[10px] text-blue-600 font-medium uppercase tracking-wider">Auto-Generated Team ID</p><p className="text-base font-bold text-blue-800 font-mono">{editingTeamId || genTeamId(department, teams)}</p></div>
        </div>
      )}

      {/* ─── SECTION 1: Basic Information ─── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs font-bold shadow-sm">1</div>
            <div><h2 className="text-sm font-bold text-slate-800">Basic Information</h2><p className="text-[11px] text-slate-500">Team identity and organizational placement</p></div>
          </div>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="flex items-center gap-1 text-sm font-semibold text-slate-700 mb-2">Team Name <span className="text-red-500 text-base leading-none">*</span></label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><Users size={16} /></div>
                <input type="text" value={teamName} onChange={e => { setTeamName(e.target.value); setErrors(p => ({ ...p, teamName: undefined })); }} onBlur={() => setTouched(p => ({ ...p, teamName: true }))} placeholder="e.g., Precision Pioneers" className={`${fieldClass('teamName', !!errors.teamName)} pl-10`} />
              </div>
              {errors.teamName && touched.teamName && <p className="flex items-center gap-1 mt-1.5 text-xs text-red-600"><AlertCircle size={12} /> {errors.teamName}</p>}
            </div>
            <div>
              <label className="flex items-center gap-1 text-sm font-semibold text-slate-700 mb-2">Department <span className="text-red-500 text-base leading-none">*</span></label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><Building2 size={16} /></div>
                <select value={department} onChange={e => { setDepartment(e.target.value); setErrors(p => ({ ...p, department: undefined })); }} onBlur={() => setTouched(p => ({ ...p, department: true }))} className={`${fieldClass('department', !!errors.department)} pl-10 bg-white`}>
                  <option value="">Select Department</option>
                  {hierarchy.departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              {errors.department && touched.department && <p className="flex items-center gap-1 mt-1.5 text-xs text-red-600"><AlertCircle size={12} /> {errors.department}</p>}
            </div>
          </div>
          {department && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-slate-600 mb-2"><MapPin size={14} className="text-slate-400" />Sub Department</label>
                <select value={subDepartment} onChange={e => setSubDepartment(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none bg-white disabled:bg-slate-100 disabled:text-slate-400" disabled={availableSubDepts.length === 0}>
                  <option value="">{availableSubDepts.length === 0 ? 'No sub-departments for this department' : 'Select Sub Department'}</option>
                  {availableSubDepts.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>
              {subDepartment && availableLines.length > 0 && (
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-slate-600 mb-2"><MapPin size={14} className="text-slate-400" />Line</label>
                  <select value={selectedLine} onChange={e => setSelectedLine(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none bg-white">
                    <option value="">Select Line</option>
                    {availableLines.map(line => <option key={line.id} value={line.id}>{line.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-2"><CalendarRange size={14} className="text-slate-400" />QCC Period</label>
            <div className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-slate-50 flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-800">QCC {hy.active.year} · {hy.labelHalf(hy.active.half)}</span>
              <span className="text-[10px] text-slate-400">from header</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">The team is added to the period selected in the header — change it there.</p>
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-600 mb-2"><Lightbulb size={14} className="text-slate-400" />Project Theme / QC Theme</label>
            <input type="text" value={projectTheme} onChange={e => setProjectTheme(e.target.value)} placeholder="e.g., Reducing CNC Machine Setup Time by 40%" className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none bg-white" />
            <p className="text-[10px] text-slate-400 mt-1">You can leave this blank and update it later from the Edit Team screen.</p>
          </div>
        </div>
      </div>

      {/* ─── SECTION 2: Leadership Roles ─── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs font-bold shadow-sm">2</div>
            <div><h2 className="text-sm font-bold text-slate-800">Leadership Roles</h2><p className="text-[11px] text-slate-500">Team leadership and coordination assignments</p></div>
          </div>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Leader */}
            <div className="relative">
              <label className="flex items-center gap-1 text-sm font-semibold text-slate-700 mb-2"><UserCircle size={14} className="text-slate-400" />Leader <span className="text-red-500 text-base leading-none">*</span></label>
              <div className="relative">
                <input type="text" value={leaderName} onChange={e => { setLeaderName(e.target.value); setErrors(p => ({ ...p, leaderName: undefined })); setShowSearchLeader(e.target.value.length > 0); }} onBlur={() => { setTouched(p => ({ ...p, leaderName: true })); setTimeout(() => setShowSearchLeader(false), 200); }} onFocus={() => setShowSearchLeader(true)} placeholder="Search or type name..." className={`${fieldClass('leaderName', !!errors.leaderName)} pl-4`} />
              </div>
              {showSearchLeader && matchUsed(usedLeaders, leaderName).length > 0 && <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">{matchUsed(usedLeaders, leaderName).map(n => <button key={n} type="button" onMouseDown={e => { e.preventDefault(); setLeaderName(n); setErrors(p => ({ ...p, leaderName: undefined })); setShowSearchLeader(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 text-slate-700">{n}</button>)}</div>}
              {errors.leaderName && touched.leaderName && <p className="flex items-center gap-1 mt-1.5 text-xs text-red-600"><AlertCircle size={12} /> {errors.leaderName}</p>}
            </div>
            {/* Facilitator */}
            <div className="relative">
              <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-2"><Briefcase size={14} className="text-slate-400" />Facilitator</label>
              <div className="relative">
                <input type="text" value={facilitatorName} onChange={e => { setFacilitatorName(e.target.value); setErrors(p => ({ ...p, facilitatorName: undefined })); setShowSearchFacilitator(e.target.value.length > 0); }} onBlur={() => { setTouched(p => ({ ...p, facilitatorName: true })); setTimeout(() => setShowSearchFacilitator(false), 200); }} onFocus={() => setShowSearchFacilitator(true)} placeholder="Search or type name..." className={`${fieldClass('facilitatorName', !!errors.facilitatorName)} pl-4`} />
              </div>
              {showSearchFacilitator && matchUsed(usedFacilitators, facilitatorName).length > 0 && <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">{matchUsed(usedFacilitators, facilitatorName).map(n => <button key={n} type="button" onMouseDown={e => { e.preventDefault(); setFacilitatorName(n); setShowSearchFacilitator(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 text-slate-700">{n}</button>)}</div>}
              {errors.facilitatorName && touched.facilitatorName && <p className="flex items-center gap-1 mt-1.5 text-xs text-red-600"><AlertCircle size={12} /> {errors.facilitatorName}</p>}
            </div>
            {/* Coordinator */}
            <div className="relative">
              <label className="flex items-center gap-1 text-sm font-semibold text-slate-700 mb-2"><MapPin size={14} className="text-slate-400" />Coordinator <span className="text-red-500 text-base leading-none">*</span></label>
              <div className="relative">
                <input type="text" value={coordinatorName} onChange={e => { setCoordinatorName(e.target.value); setErrors(p => ({ ...p, coordinatorName: undefined })); setShowSearchCoordinator(e.target.value.length > 0); }} onBlur={() => { setTouched(p => ({ ...p, coordinatorName: true })); setTimeout(() => setShowSearchCoordinator(false), 200); }} onFocus={() => setShowSearchCoordinator(true)} placeholder="Search or type name..." className={`${fieldClass('coordinatorName', !!errors.coordinatorName)} pl-4`} />
              </div>
              {showSearchCoordinator && matchUsed(usedCoordinators, coordinatorName).length > 0 && <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">{matchUsed(usedCoordinators, coordinatorName).map(n => <button key={n} type="button" onMouseDown={e => { e.preventDefault(); setCoordinatorName(n); setShowSearchCoordinator(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 text-slate-700">{n}</button>)}</div>}
              {errors.coordinatorName && touched.coordinatorName && <p className="flex items-center gap-1 mt-1.5 text-xs text-red-600"><AlertCircle size={12} /> {errors.coordinatorName}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* ─── SECTION 3: Team Members ─── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs font-bold shadow-sm">3</div>
              <div><h2 className="text-sm font-bold text-slate-800">Team Members <span className="text-red-500">*</span></h2><p className="text-[11px] text-slate-500">Minimum 2 active members required • Name, Employee ID mandatory</p></div>
            </div>
            <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${activeMembers.length >= 2 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{activeMembers.length} Active</span>
          </div>
        </div>
        <div className="p-6">
          {errors.members && touched.members && <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg mb-4"><AlertCircle size={14} className="text-red-500 flex-shrink-0" /><p className="text-xs text-red-700">{errors.members}</p></div>}
          <div className="space-y-3">
            {members.map((member, index) => {
              const nameErr = errors[`member_name_${member.key}`];
              const empErr = errors[`member_empid_${member.key}`];
              return (
                <div key={member.key} className={`rounded-xl border transition-all duration-200 ${!member.isActive ? 'border-red-200 bg-red-50/30' : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'}`}>
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${member.isActive ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-600'}`}>{index + 1}</div>
                      <div><span className="text-sm font-semibold text-slate-700">Member {index + 1}</span>{!member.isActive && <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Deactivated</span>}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {member.isActive ? (
                        <button type="button" onClick={() => openDeactivatePopup(member.key)} className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium text-red-600 hover:bg-red-50 rounded-lg"><UserMinus size={13} />Deactivate</button>
                      ) : (
                        <button type="button" onClick={() => reactivateMember(member.key)} className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium text-emerald-600 hover:bg-emerald-50 rounded-lg"><UserCheck size={13} />Reactivate</button>
                      )}
                      <button type="button" onClick={async () => { if (await askConfirm({ title: 'Remove this team member?', message: 'This member will be removed from the team.', confirmText: 'Remove' })) removeMember(member.key); }} disabled={members.length <= 2} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed" title={members.length <= 2 ? 'Minimum 2 members required' : 'Remove Member'}><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="flex items-center gap-1 text-xs font-medium text-slate-600 mb-1.5">Member Name <span className="text-red-500">*</span></label>
                        <input type="text" value={member.memberName} onChange={e => updateMember(member.key, 'memberName', e.target.value)} placeholder="Full name" disabled={!member.isActive} className={`${memberFieldClass(!!nameErr)} disabled:bg-slate-100 disabled:text-slate-400`} />
                        {nameErr && <p className="flex items-center gap-1 mt-1 text-[10px] text-red-600"><AlertCircle size={10} /> {nameErr}</p>}
                      </div>
                      <div>
                        <label className="flex items-center gap-1 text-xs font-medium text-slate-600 mb-1.5">Employee ID <span className="text-red-500">*</span></label>
                        <input type="text" value={member.employeeId} onChange={e => updateMember(member.key, 'employeeId', e.target.value)} placeholder="e.g., EMP-101" disabled={!member.isActive} className={`${memberFieldClass(!!empErr)} disabled:bg-slate-100 disabled:text-slate-400`} />
                        {empErr && <p className="flex items-center gap-1 mt-1 text-[10px] text-red-600"><AlertCircle size={10} /> {empErr}</p>}
                      </div>
                      <div>
                        <label className="flex items-center gap-1 text-xs font-medium text-slate-600 mb-1.5">Department {member.deptEdited && <span className="text-[9px] font-normal text-blue-500">(manual)</span>}</label>
                        <input type="text" list={`dept-opts-${member.key}`} value={member.department} onChange={e => changeMemberDept(member.key, e.target.value)} disabled={!member.isActive}
                          placeholder="Auto from team — or type to add manually"
                          title={member.deptEdited ? 'Manually set — clear the field to reset to the team department' : 'Auto-filled from the team; type to change or add a second department manually'}
                          className={`w-full px-3 py-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 disabled:bg-slate-100 disabled:text-slate-400 ${member.deptEdited ? 'bg-white border-blue-300 text-slate-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`} />
                        <datalist id={`dept-opts-${member.key}`}>
                          {deptOptionsFor(member.department).map(d => <option key={d} value={d} />)}
                        </datalist>
                      </div>
                    </div>
                    {!member.isActive && member.deactivationReason && (
                      <div className="mt-2 flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
                        <AlertCircle size={12} className="text-red-500 mt-0.5 flex-shrink-0" />
                        <div><p className="text-[10px] text-red-600 font-medium">Reason: {member.deactivationReason}</p>{member.deactivatedAt && <p className="text-[9px] text-red-400">Deactivated on {member.deactivatedAt}</p>}</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {/* Add Member Button */}
            <button type="button" onClick={addMember} className="w-full flex items-center justify-center gap-2.5 px-4 py-4 border-2 border-dashed border-slate-300 rounded-xl text-sm font-medium text-slate-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 transition-all">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center"><Plus size={18} className="text-blue-600" /></div>
              Add Member
            </button>
          </div>
        </div>
      </div>

      {/* ─── Action Buttons ─── */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <button onClick={() => handleSave(true)} className="flex items-center justify-center gap-2 px-5 py-2.5 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"><Save size={16} /> Save as Draft</button>
          <button onClick={() => handleSave(false)} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm shadow-blue-600/20"><CheckCircle2 size={16} /> {editingTeamId ? 'Update Team' : 'Register Team'}</button>
          <button onClick={() => setView('list')} className="flex items-center justify-center gap-2 px-5 py-2.5 text-slate-600 text-sm font-medium hover:bg-slate-50 rounded-lg">Cancel</button>
        </div>
      </div>

      {/* Validation Summary */}
      {errorCount > 0 && Object.values(touched).some(Boolean) && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-red-800 flex items-center gap-2 mb-3"><AlertCircle size={16} /> Please fix the following errors</h3>
          <ul className="space-y-1">{Object.entries(errors).map(([key, msg]) => { if (!msg) return null; return <li key={key} className="flex items-center gap-2 text-xs text-red-700"><span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />{msg}</li>; })}</ul>
        </div>
      )}
    </div>
  );
}
