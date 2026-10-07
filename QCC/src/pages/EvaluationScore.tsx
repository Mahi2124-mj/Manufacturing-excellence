import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDate, formatTime } from '../lib/format';
import { useConfirm } from '../components/ConfirmDialog';
import { useHalfYear } from '../lib/halfYear';
import { api } from '../lib/api';
import type { Team as RegTeam } from '../types';
import {
  Trophy, Printer, RotateCcw, Plus, Trash2, Users, Award, Settings,
  ChevronRight, ChevronLeft, Download, Edit3, Check, X,
  AlertCircle, Lightbulb, Puzzle, Truck, Cog, Shield, Eye,
  ChevronDown, ChevronUp, Target, FileSpreadsheet, FileText, FileType,
} from 'lucide-react';

interface Team {
  id: string;
  name: string;
  projectTitle: string;
  department: string;
}

interface Judge {
  id: string;
  name: string;
  designation: string;
  department?: string;
  email?: string;
  contact?: string;
  status?: string;
}

interface Criteria {
  id: string;
  category: string;
  name: string;
  maxScore: number;
  guide: string;
}

interface Score {
  teamId: string;
  judgeId: string;
  criteriaId: string;
  score: number;
}

interface EvaluationSetup {
  eventName: string;
  eventDate: string;
  lastScoringDate: string;
  teams: Team[];
  judges: Judge[];
  criteria: Criteria[];
}

const DEFAULT_CRITERIA: Criteria[] = [
  { id: 'c1', category: '1. Problem Identification & Selection', name: 'Clarity & relevance of problem', maxScore: 5, guide: 'Well-defined, data-backed' },
  { id: 'c2', category: '1. Problem Identification & Selection', name: 'Use of quality tools for selection', maxScore: 5, guide: 'Pareto, brainstorming' },
  { id: 'c3', category: '2. Analysis of Problem', name: 'Data collection methodology', maxScore: 5, guide: 'Systematic approach' },
  { id: 'c4', category: '2. Analysis of Problem', name: 'Root cause identification', maxScore: 10, guide: 'Fishbone, 5-Why, etc.' },
  { id: 'c5', category: '2. Analysis of Problem', name: 'Validation of root causes', maxScore: 5, guide: 'Data-driven verification' },
  { id: 'c6', category: '3. Development of Solution', name: 'Creativity & innovation', maxScore: 10, guide: 'Original thinking' },
  { id: 'c7', category: '3. Development of Solution', name: 'Feasibility study', maxScore: 5, guide: 'Cost-benefit analysis' },
  { id: 'c8', category: '3. Development of Solution', name: 'Countermeasure implementation', maxScore: 10, guide: 'Action plan execution' },
  { id: 'c9', category: '4. Results & Verification', name: 'Quantitative improvements', maxScore: 10, guide: 'Measurable gains' },
  { id: 'c10', category: '4. Results & Verification', name: 'Qualitative benefits', maxScore: 5, guide: 'Team morale, safety, etc.' },
  { id: 'c11', category: '5. Standardization', name: 'Documentation & SOPs', maxScore: 5, guide: 'Procedures recorded' },
  { id: 'c12', category: '5. Standardization', name: 'Horizontal deployment', maxScore: 5, guide: 'Replication potential' },
  { id: 'c13', category: '6. Presentation', name: 'Clarity & organization', maxScore: 5, guide: 'Logical flow' },
  { id: 'c14', category: '6. Presentation', name: 'Use of visual aids', maxScore: 5, guide: 'Charts, graphs, photos' },
  { id: 'c15', category: '6. Presentation', name: 'Team participation', maxScore: 5, guide: 'All members involved' },
  { id: 'c16', category: '7. Overall Impression', name: 'Judge\'s overall assessment', maxScore: 10, guide: 'Holistic evaluation' },
];

// Rotating icon + tint per team card (keeps each card visually distinct).
const TEAM_ICONS = [Lightbulb, Puzzle, Truck, Cog, Shield, Award];
const TEAM_TINTS = [
  'bg-emerald-50 text-emerald-600', 'bg-violet-50 text-violet-600', 'bg-blue-50 text-blue-600',
  'bg-amber-50 text-amber-600', 'bg-rose-50 text-rose-600', 'bg-cyan-50 text-cyan-600',
];

// Per-category colour set for the Evaluation Criteria accordion (badge · points pill · total pill).
const CAT_COLORS = [
  { badge: 'bg-blue-100 text-blue-700', pill: 'bg-blue-50 text-blue-700', solid: 'bg-blue-600' },
  { badge: 'bg-rose-100 text-rose-700', pill: 'bg-rose-50 text-rose-700', solid: 'bg-rose-600' },
  { badge: 'bg-amber-100 text-amber-700', pill: 'bg-amber-50 text-amber-700', solid: 'bg-amber-600' },
  { badge: 'bg-emerald-100 text-emerald-700', pill: 'bg-emerald-50 text-emerald-700', solid: 'bg-emerald-600' },
  { badge: 'bg-violet-100 text-violet-700', pill: 'bg-violet-50 text-violet-700', solid: 'bg-violet-600' },
  { badge: 'bg-cyan-100 text-cyan-700', pill: 'bg-cyan-50 text-cyan-700', solid: 'bg-cyan-600' },
];

export default function EvaluationScore() {
  const navigate = useNavigate();
  const [editingJudgeId, setEditingJudgeId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [setup, setSetup] = useState<EvaluationSetup>(() => {
    const saved = localStorage.getItem('qcc-judge-evaluation-setup-v2');
    const base = saved ? JSON.parse(saved) : {
      eventName: 'QCC Competition 2024',
      eventDate: new Date().toISOString().split('T')[0],
      lastScoringDate: '',
      teams: [
        { id: 't1', name: 'Precision Pioneers', projectTitle: 'Reducing CNC Setup Time by 40%', department: 'Manufacturing' },
        { id: 't2', name: 'Quality Champions', projectTitle: 'Eliminating Assembly Line Defects', department: 'Quality Assurance' },
        { id: 't3', name: 'Innovation Squad', projectTitle: 'Optimizing HVAC Energy Consumption', department: 'Engineering' },
      ],
      judges: [
        { id: 'j1', name: 'Dr. Rajesh Kumar', designation: 'Chief Quality Officer', department: 'Quality Assurance', email: '', contact: '', status: 'active' },
        { id: 'j2', name: 'Mr. Vikram Singh', designation: 'Manufacturing Head', department: 'Manufacturing', email: '', contact: '', status: 'active' },
        { id: 'j3', name: 'Ms. Deepa Menon', designation: 'QA Director', department: 'Quality Assurance', email: '', contact: '', status: 'active' },
      ],
      criteria: DEFAULT_CRITERIA,
    };
    if (base.lastScoringDate === undefined) base.lastScoringDate = '';
    return base;
  });

  // Evaluation-criteria accordion — first category open by default.
  const [expandedCats, setExpandedCats] = useState<Set<string>>(() => {
    const cats = [...new Set(setup.criteria.map((c: Criteria) => c.category))];
    return new Set(cats.slice(0, 1));
  });
  const toggleCat = (cat: string) => setExpandedCats(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });

  const [scores, setScores] = useState<Score[]>(() => {
    const saved = localStorage.getItem('qcc-judge-evaluation-scores-v2');
    return saved ? JSON.parse(saved) : [];
  });

  const [view, setView] = useState<'setup' | 'scoring' | 'results'>(() => {
    try { const v = localStorage.getItem('qcc-eval-view'); if (v === 'setup' || v === 'scoring' || v === 'results') return v; } catch { /* default */ }
    return 'setup';
  });
  // Remember the current screen so a browser refresh stays here instead of jumping back to Setup.
  useEffect(() => { try { localStorage.setItem('qcc-eval-view', view); } catch { /* ignore */ } }, [view]);
  const [activeJudge, setActiveJudge] = useState<string>(setup.judges[0]?.id || '');
  const [editingField, setEditingField] = useState<{ type: string; id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  const [remarks, setRemarks] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('qcc-judge-evaluation-remarks-v2') || '{}'); } catch { return {}; }
  });
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const askConfirm = useConfirm();
  const hy = useHalfYear();

  // Teams come from Team Registration, scoped to the QCC period picked in the header —
  // change the period in the header and this evaluation follows it, on this page too.
  const [regTeams, setRegTeams] = useState<RegTeam[]>([]);
  useEffect(() => { api.listTeams().then(setRegTeams).catch(() => { /* keep empty */ }); }, []);
  const teams = useMemo<Team[]>(() =>
    regTeams
      .filter(t => hy.isTeamActive(t.id, t.createdAt))
      .map(t => ({ id: t.id, name: t.name, projectTitle: t.projectTheme || '', department: t.department })),
    [regTeams, hy]);

  // Gemba level per team (Staff / Associate) — set in the scoring table, splits the results.
  const [teamLevels, setTeamLevels] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('qcc-eval-team-levels') || '{}'); } catch { return {}; }
  });
  useEffect(() => { localStorage.setItem('qcc-eval-team-levels', JSON.stringify(teamLevels)); }, [teamLevels]);
  const levelOf = (teamId: string) => teamLevels[teamId] || 'Staff';
  const setLevel = (teamId: string, level: string) => setTeamLevels(prev => ({ ...prev, [teamId]: level }));

  // Per-judge submission — each judge submits their own scoring; timestamp persisted.
  const [submittedJudges, setSubmittedJudges] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('qcc-eval-submitted-judges') || '{}'); } catch { return {}; }
  });
  useEffect(() => { localStorage.setItem('qcc-eval-submitted-judges', JSON.stringify(submittedJudges)); }, [submittedJudges]);
  const submitJudge = (judgeId: string) => setSubmittedJudges(prev => ({ ...prev, [judgeId]: new Date().toLocaleString() }));
  const unsubmitJudge = (judgeId: string) => setSubmittedJudges(prev => { const n = { ...prev }; delete n[judgeId]; return n; });

  // Scroll a newly-added team / judge / criteria into view and briefly highlight it
  // (the Add buttons sit at the top of each list, so new rows append out of view).
  useEffect(() => {
    if (!flashId) return;
    document.getElementById(`eval-item-${flashId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t = setTimeout(() => setFlashId(null), 2000);
    return () => clearTimeout(t);
  }, [flashId]);

  useEffect(() => {
    localStorage.setItem('qcc-judge-evaluation-setup-v2', JSON.stringify(setup));
  }, [setup]);

  // Auto-save on every score change, with a short "saved" confirmation.
  useEffect(() => {
    localStorage.setItem('qcc-judge-evaluation-scores-v2', JSON.stringify(scores));
    setSavedAt(formatTime(new Date()));
  }, [scores]);

  useEffect(() => {
    localStorage.setItem('qcc-judge-evaluation-remarks-v2', JSON.stringify(remarks));
  }, [remarks]);

  /* A criterion counts as "completed" only when an entry exists — this keeps an
     explicit 0 distinct from "not scored yet". */
  const hasScore = (teamId: string, judgeId: string, criteriaId: string): boolean =>
    scores.some(s => s.teamId === teamId && s.judgeId === judgeId && s.criteriaId === criteriaId);

  const clearScore = (teamId: string, judgeId: string, criteriaId: string) =>
    setScores(prev => prev.filter(
      s => !(s.teamId === teamId && s.judgeId === judgeId && s.criteriaId === criteriaId),
    ));

  /** Set a score, always clamped to the criterion's maximum. */
  const setScoreValue = (teamId: string, judgeId: string, criteriaId: string, value: number) => {
    const max = setup.criteria.find(c => c.id === criteriaId)?.maxScore ?? 0;
    const clamped = Math.min(Math.max(0, value), max);
    setScores(prev => {
      const exists = prev.some(s => s.teamId === teamId && s.judgeId === judgeId && s.criteriaId === criteriaId);
      return exists
        ? prev.map(s => (s.teamId === teamId && s.judgeId === judgeId && s.criteriaId === criteriaId
            ? { ...s, score: clamped } : s))
        : [...prev, { teamId, judgeId, criteriaId, score: clamped }];
    });
  };

  const evalKey = (teamId: string, judgeId: string) => `${teamId}|${judgeId}`;

  const getScore = (teamId: string, judgeId: string, criteriaId: string): number => {
    return scores.find(s => s.teamId === teamId && s.judgeId === judgeId && s.criteriaId === criteriaId)?.score || 0;
  };

  const getTeamTotal = (teamId: string, judgeId: string): number => {
    return setup.criteria.reduce((total, criteria) => {
      return total + getScore(teamId, judgeId, criteria.id);
    }, 0);
  };

  const getMaxPossible = (): number => {
    return setup.criteria.reduce((total, criteria) => total + criteria.maxScore, 0);
  };

  const getTeamAverageScore = (teamId: string): number => {
    if (setup.judges.length === 0) return 0;
    const total = setup.judges.reduce((sum, judge) => sum + getTeamTotal(teamId, judge.id), 0);
    return total / setup.judges.length;
  };

  const getCategoryTotal = (teamId: string, judgeId: string, category: string): number => {
    return setup.criteria
      .filter(c => c.category === category)
      .reduce((total, criteria) => total + getScore(teamId, judgeId, criteria.id), 0);
  };

  const getCategoryMax = (category: string): number => {
    return setup.criteria
      .filter(c => c.category === category)
      .reduce((total, criteria) => total + criteria.maxScore, 0);
  };

  const getCategories = (): string[] => {
    return [...new Set(setup.criteria.map(c => c.category))];
  };

  const addTeam = () => {
    const newTeam: Team = { id: `t${Date.now()}`, name: '', projectTitle: '', department: '' };
    setSetup(prev => ({ ...prev, teams: [...prev.teams, newTeam] }));
    setFlashId(newTeam.id);
  };

  const removeTeam = (id: string) => {
    setSetup(prev => ({ ...prev, teams: prev.teams.filter(t => t.id !== id) }));
    setScores(prev => prev.filter(s => s.teamId !== id));
  };

  const addJudge = () => {
    const newJudge: Judge = { id: `j${Date.now()}`, name: '', designation: '', department: '', email: '', contact: '', status: 'active' };
    setSetup(prev => ({ ...prev, judges: [...prev.judges, newJudge] }));
    if (!activeJudge) setActiveJudge(newJudge.id);
    setFlashId(newJudge.id);
  };

  const removeJudge = (id: string) => {
    setSetup(prev => ({ ...prev, judges: prev.judges.filter(j => j.id !== id) }));
    setScores(prev => prev.filter(s => s.judgeId !== id));
    if (activeJudge === id) {
      setActiveJudge(setup.judges[0]?.id || '');
    }
  };

  const addCriteria = () => {
    const newCriteria: Criteria = { id: `c${Date.now()}`, category: '', name: '', maxScore: 10, guide: '' };
    setSetup(prev => ({ ...prev, criteria: [...prev.criteria, newCriteria] }));
    setFlashId(newCriteria.id);
  };

  const removeCriteria = (id: string) => {
    setSetup(prev => ({ ...prev, criteria: prev.criteria.filter(c => c.id !== id) }));
    setScores(prev => prev.filter(s => s.criteriaId !== id));
  };

  // Rename a whole category (its group header) — updates every criterion under it.
  const renameCategory = (oldName: string, newName: string) => {
    setSetup(prev => ({ ...prev, criteria: prev.criteria.map(c => c.category === oldName ? { ...c, category: newName } : c) }));
  };
  // Add a criterion under a specific category (from its group header).
  const addCriteriaTo = (category: string) => {
    const nc: Criteria = { id: `c${Date.now()}`, category, name: '', maxScore: 10, guide: '' };
    setSetup(prev => ({ ...prev, criteria: [...prev.criteria, nc] }));
    setFlashId(nc.id);
  };

  // Bring back the standard criteria: any deleted defaults are restored (in order),
  // existing edits are kept, and custom-added criteria are preserved at the end.
  const restoreDefaultCriteria = async () => {
    if (!(await askConfirm({ title: 'Restore default criteria?', message: 'All standard criteria are reset to their original name, max score & guide (your custom rows are kept).', confirmText: 'Restore', tone: 'default' }))) return;
    setSetup(prev => {
      const custom = prev.criteria.filter(c => !DEFAULT_CRITERIA.some(d => d.id === c.id));
      return { ...prev, criteria: [...DEFAULT_CRITERIA.map(d => ({ ...d })), ...custom] };
    });
  };

  // Direct (Excel-style) inline edits for setup rows — no click-to-edit needed
  const updateTeam = (id: string, patch: Partial<Team>) => {
    setSetup(prev => ({ ...prev, teams: prev.teams.map(t => t.id === id ? { ...t, ...patch } : t) }));
  };
  const updateJudge = (id: string, patch: Partial<Judge>) => {
    setSetup(prev => ({ ...prev, judges: prev.judges.map(j => j.id === id ? { ...j, ...patch } : j) }));
  };
  const updateCriteria = (id: string, patch: Partial<Criteria>) => {
    setSetup(prev => ({ ...prev, criteria: prev.criteria.map(c => c.id === id ? { ...c, ...patch } : c) }));
  };

  const startEditing = (type: string, id: string, field: string, currentValue: string) => {
    setEditingField({ type, id, field });
    setEditValue(currentValue);
  };

  const saveEdit = () => {
    if (!editingField) return;
    const { type, id, field } = editingField;
    if (type === 'event') {
      setSetup(prev => ({ ...prev, [field]: editValue }));
    }
    setEditingField(null);
    setEditValue('');
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValue('');
  };

  // Reset the entered DATA (scores) only — the setup (teams / judges / criteria) stays.
  const resetAll = async () => {
    if (await askConfirm({ title: 'Reset all scores?', message: 'Every entered score will be cleared. The setup (teams / judges / criteria) stays.', confirmText: 'Reset' })) {
      setScores([]);
    }
  };

  const exportToCSV = () => {
    let csv = 'Team,Project,Department,';
    csv += setup.judges.map(j => `${j.name} Total`).join(',') + ',';
    csv += 'Average Score,Rank\n';

    const teamScores = teams.map(team => ({
      team,
      avgScore: getTeamAverageScore(team.id),
    })).sort((a, b) => b.avgScore - a.avgScore);

    teamScores.forEach((item, idx) => {
      csv += `"${item.team.name}","${item.team.projectTitle}","${item.team.department}",`;
      csv += setup.judges.map(j => getTeamTotal(item.team.id, j.id)).join(',') + ',';
      csv += `${item.avgScore.toFixed(2)},${idx + 1}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${setup.eventName}_results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Excel export — an HTML table Excel opens natively (.xls).
  const exportExcel = () => {
    const teamScores = teams.map(team => ({ team, avgScore: getTeamAverageScore(team.id) })).sort((a, b) => b.avgScore - a.avgScore);
    const headers = ['Team', 'Project', 'Department', ...setup.judges.map(j => `${j.name} Total`), 'Average Score', 'Rank'];
    const th = headers.map(h => `<th style="border:1px solid #ccc;padding:6px;background:#f1f5f9">${h}</th>`).join('');
    const trs = teamScores.map((item, idx) => {
      const cells = [item.team.name, item.team.projectTitle, item.team.department, ...setup.judges.map(j => getTeamTotal(item.team.id, j.id)), item.avgScore.toFixed(2), idx + 1];
      return `<tr>${cells.map(c => `<td style="border:1px solid #ccc;padding:6px">${c}</td>`).join('')}</tr>`;
    }).join('');
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></body></html>`;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${setup.eventName}_results.xls`; a.click(); URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  // Single Export button → format menu (Excel · CSV · PDF).
  const handleExport = (fmt: 'excel' | 'csv' | 'pdf') => {
    setExportOpen(false);
    if (fmt === 'csv') exportToCSV();
    else if (fmt === 'excel') exportExcel();
    else handlePrint(); // PDF via the browser's print → Save as PDF
  };

  // Judge names are mandatory — Start Scoring stays disabled until every judge has a name.
  const allJudgesNamed = setup.judges.every(j => j.name.trim() !== '');
  const canStart = teams.length > 0 && setup.judges.length > 0 && setup.criteria.length > 0 && allJudgesNamed;

  // Setup Screen
  if (view === 'setup') {
    return (
      <div className="print:bg-white">
        <div className="space-y-6 print:p-0">
          {/* Start Scoring — top action */}
          <div className="flex justify-end print:hidden">
            <button
              onClick={() => setView('scoring')}
              disabled={!canStart}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2 shadow-sm"
            >
              Start Scoring <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Header band — title + KPI stats */}
          <div className="bg-gradient-to-r from-blue-900 to-blue-800 rounded-xl shadow-xl px-6 py-5">
            <div className="flex items-center justify-between gap-6 flex-wrap">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-yellow-500 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Trophy className="w-8 h-8 text-blue-900" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white leading-tight">Judge Evaluation Scoring Sheet</h1>
                  <p className="text-blue-200 text-sm">QCC Competition Assessment System</p>
                </div>
              </div>
              <div className="flex items-center gap-5 sm:gap-7">
                {[
                  { icon: <Users className="w-5 h-5" />, label: 'Total Teams', value: teams.length },
                  { icon: <Award className="w-5 h-5" />, label: 'Judges', value: setup.judges.length },
                  { icon: <Edit3 className="w-5 h-5" />, label: 'Max Score', value: getMaxPossible() },
                ].map((k, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <span className="w-9 h-9 rounded-lg bg-white/10 text-blue-100 flex items-center justify-center flex-shrink-0">{k.icon}</span>
                    <div>
                      <p className="text-[11px] text-blue-200 leading-none">{k.label}</p>
                      <p className="text-xl font-bold text-white leading-tight mt-1 tabular-nums">{k.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Event Details */}
          <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6 mb-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5" /> Event Details
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Event Name</label>
                <input
                  type="text"
                  value={setup.eventName}
                  onChange={(e) => setSetup(prev => ({ ...prev, eventName: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none hover:border-blue-400 focus:border-blue-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Event Date</label>
                <input
                  type="date"
                  value={setup.eventDate}
                  onChange={(e) => setSetup(prev => ({ ...prev, eventDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none hover:border-blue-400 focus:border-blue-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Last Date for Scoring</label>
                <input
                  type="date"
                  value={setup.lastScoringDate || ''}
                  onChange={(e) => setSetup(prev => ({ ...prev, lastScoringDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none hover:border-blue-400 focus:border-blue-500 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Teams — auto-loaded from Team Registration for the QCC period in the header */}
          <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Users className="w-5 h-5" /> Participating Teams ({teams.length})
              </h2>
              <button onClick={() => navigate('/team-registration')} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                <Eye className="w-4 h-4" /> View Team Details
              </button>
            </div>
            {teams.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-slate-200 rounded-lg">
                <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-600">No teams registered for this QCC period</p>
                <p className="text-xs text-slate-400 mt-1">Register teams for QCC {hy.active.year} · {hy.labelHalf(hy.active.half)}, or switch the period from the header dropdown.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {teams.map((team, i) => {
                  const Icon = TEAM_ICONS[i % TEAM_ICONS.length];
                  const tint = TEAM_TINTS[i % TEAM_TINTS.length];
                  return (
                    <div key={team.id} className="border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition-all">
                      <div className="flex items-start gap-3">
                        <span className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${tint}`}><Icon className="w-5 h-5" /></span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="w-5 h-5 rounded-full bg-blue-600 text-white inline-flex items-center justify-center text-[10px] font-bold flex-shrink-0">{i + 1}</span>
                              <p className="text-sm font-bold text-slate-800 truncate">{team.name}</p>
                            </div>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 flex-shrink-0">Active</span>
                          </div>
                          <p className="text-xs text-slate-600 mt-2"><span className="text-slate-400">Theme:</span> {team.projectTitle || 'No project theme'}</p>
                          <p className="text-xs text-slate-600 mt-1"><span className="text-slate-400">Department:</span> {team.department}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Judges */}
          <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Award className="w-5 h-5" /> Judges Panel ({setup.judges.length})
              </h2>
              <button
                onClick={addJudge}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm"
              >
                <Plus className="w-4 h-4" /> Add Judge
              </button>
            </div>
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full min-w-[840px] text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="px-4 py-3 text-left w-8">#</th>
                    <th className="px-4 py-3 text-left">Judge Name</th>
                    <th className="px-4 py-3 text-left">Designation</th>
                    <th className="px-4 py-3 text-left">Department</th>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-left">Contact</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {setup.judges.map((judge, i) => {
                    const editing = editingJudgeId === judge.id;
                    const nameMissing = !judge.name.trim();
                    const cell = 'w-full px-2 py-1 border border-slate-300 rounded text-sm outline-none focus:ring-1 focus:ring-blue-400';
                    return (
                      <tr key={judge.id} id={`eval-item-${judge.id}`} className={flashId === judge.id ? 'bg-blue-50' : 'hover:bg-slate-50/60'}>
                        <td className="px-4 py-3 text-slate-400 font-medium tabular-nums">{i + 1}</td>
                        {editing ? (
                          <>
                            <td className="px-3 py-2"><input value={judge.name} onChange={e => updateJudge(judge.id, { name: e.target.value })} placeholder="Judge name" className={`${cell} font-medium ${nameMissing ? 'border-red-300 bg-red-50/40' : ''}`} /></td>
                            <td className="px-3 py-2"><input value={judge.designation} onChange={e => updateJudge(judge.id, { designation: e.target.value })} placeholder="Designation" className={cell} /></td>
                            <td className="px-3 py-2"><input value={judge.department || ''} onChange={e => updateJudge(judge.id, { department: e.target.value })} placeholder="Department" className={cell} /></td>
                            <td className="px-3 py-2"><input value={judge.email || ''} onChange={e => updateJudge(judge.id, { email: e.target.value })} placeholder="name@company.com" className={cell} /></td>
                            <td className="px-3 py-2"><input value={judge.contact || ''} onChange={e => updateJudge(judge.id, { contact: e.target.value })} placeholder="Contact" className={cell} /></td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3 font-medium text-slate-800">{judge.name || <span className="text-red-400 italic font-normal">Unnamed</span>}</td>
                            <td className="px-4 py-3 text-slate-600">{judge.designation || '—'}</td>
                            <td className="px-4 py-3 text-slate-600">{judge.department || '—'}</td>
                            <td className="px-4 py-3 text-slate-600">{judge.email || '—'}</td>
                            <td className="px-4 py-3 text-slate-600 tabular-nums">{judge.contact || '—'}</td>
                          </>
                        )}
                        <td className="px-4 py-3 text-center"><span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600">Active</span></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => setEditingJudgeId(editing ? null : judge.id)} title={editing ? 'Done' : 'Edit'} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">{editing ? <Check className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}</button>
                            <button onClick={async () => { if (await askConfirm({ title: 'Remove this judge?', message: 'This action cannot be undone.', confirmText: 'Delete' })) removeJudge(judge.id); }} title="Delete" className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Evaluation Criteria */}
          <div id="eval-criteria" className="bg-white rounded-xl shadow-md border border-slate-200 p-6 mb-6 scroll-mt-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Award className="w-5 h-5" /> Evaluation Criteria ({setup.criteria.length} items, Max: {getMaxPossible()} points)
              </h2>
              <button
                onClick={addCriteria}
                title="Add criteria"
                aria-label="Add criteria"
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1 text-sm font-medium"
              >
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>
            <div className="space-y-3">
              {getCategories().map((cat, catIdx) => {
                const catCriteria = setup.criteria.filter(c => c.category === cat);
                const catMax = catCriteria.reduce((s, c) => s + (c.maxScore || 0), 0);
                const color = CAT_COLORS[catIdx % CAT_COLORS.length];
                const open = expandedCats.has(cat);
                return (
                  <div key={catIdx} className="border border-slate-200 rounded-xl overflow-hidden">
                    {/* Category header */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${color.badge}`}>{catIdx + 1}</span>
                      <input
                        type="text"
                        value={cat}
                        onChange={(e) => renameCategory(cat, e.target.value)}
                        placeholder="Category name"
                        className="flex-1 min-w-0 text-base font-bold text-slate-800 bg-transparent border-0 focus:outline-none focus:bg-blue-50 rounded px-1"
                      />
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0 ${color.pill}`}>{catMax} Points</span>
                      <button onClick={() => toggleCat(cat)} aria-label={open ? 'Collapse' : 'Expand'} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 flex-shrink-0">
                        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Expanded: criteria table */}
                    {open && (
                      <div className="border-t border-slate-100">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                                <th className="px-4 py-2.5 text-left w-14">#</th>
                                <th className="px-4 py-2.5 text-left">Criteria</th>
                                <th className="px-4 py-2.5 text-left">Guide</th>
                                <th className="px-4 py-2.5 text-center w-28">Max Score</th>
                                <th className="px-2 py-2.5 w-10"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {catCriteria.map((criteria, i) => (
                                <tr key={criteria.id} id={`eval-item-${criteria.id}`} className={flashId === criteria.id ? 'bg-blue-50' : 'hover:bg-slate-50/60'}>
                                  <td className="px-4 py-2.5 text-xs font-bold text-slate-400 align-top tabular-nums">{catIdx + 1}.{i + 1}</td>
                                  <td className="px-4 py-2">
                                    <div className="flex items-center gap-2">
                                      <span className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${color.pill}`}><Target className="w-3.5 h-3.5" /></span>
                                      <input type="text" value={criteria.name} onChange={e => updateCriteria(criteria.id, { name: e.target.value })} placeholder="Criteria name" className="flex-1 min-w-0 text-sm text-slate-800 bg-transparent border-0 focus:outline-none focus:bg-blue-50 rounded px-1" />
                                    </div>
                                  </td>
                                  <td className="px-4 py-2"><input type="text" value={criteria.guide} onChange={e => updateCriteria(criteria.id, { guide: e.target.value })} placeholder="Evaluation guide" className="w-full text-sm text-slate-500 bg-transparent border-0 focus:outline-none focus:bg-blue-50 rounded px-1" /></td>
                                  <td className="px-4 py-2 text-center">
                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${color.pill}`}>
                                      <input type="number" value={criteria.maxScore} onChange={e => updateCriteria(criteria.id, { maxScore: parseInt(e.target.value) || 0 })} className="w-8 text-center bg-transparent border-0 focus:outline-none tabular-nums" /> pts
                                    </span>
                                  </td>
                                  <td className="px-2 py-2 text-center">
                                    <button onClick={async () => { if (await askConfirm({ title: 'Remove this criteria?', message: 'This action cannot be undone.', confirmText: 'Delete' })) removeCriteria(criteria.id); }} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"><Trash2 className="w-4 h-4" /></button>
                                  </td>
                                </tr>
                              ))}
                              <tr className="bg-slate-50/70 border-t border-slate-200">
                                <td colSpan={3} className="px-4 py-2.5 text-sm font-semibold text-slate-700">Total Score for this Section</td>
                                <td className="px-4 py-2.5 text-center"><span className={`px-3 py-1 rounded-full text-xs font-bold text-white ${color.solid}`}>{catMax} Points</span></td>
                                <td className="px-2 py-2.5 text-center"><button onClick={() => addCriteriaTo(cat)} title="Add criteria" aria-label="Add criteria" className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-100"><Plus className="w-4 h-4" /></button></td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="print:hidden">
            <div className="flex gap-3">
              <button
                onClick={() => setView('scoring')}
                disabled={!canStart}
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <Trophy className="w-5 h-5" /> Start Scoring
              </button>
              <button
                onClick={resetAll}
                title="Reset the entered scores (setup stays)"
                className="px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors flex items-center gap-2"
              >
                <RotateCcw className="w-5 h-5" /> Reset
              </button>
            </div>
            {setup.judges.length > 0 && !allJudgesNamed && (
              <p className="mt-2 text-sm text-red-600 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" /> Every judge needs a name before you can start scoring.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Scoring Screen — all teams in one scrollable table ──────────────────
  if (view === 'scoring') {
    const categories = getCategories();
    const maxPossible = getMaxPossible();
    const currentJudge = setup.judges.find(j => j.id === activeJudge) || setup.judges[0];

    if (teams.length === 0 || setup.criteria.length === 0 || !currentJudge) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center max-w-md">
            <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-slate-800">Nothing to score yet</h2>
            <p className="text-sm text-slate-500 mt-1">Add at least one team, one judge and the criteria in Setup.</p>
            <button onClick={() => setView('setup')} className="mt-5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg">
              Go to Setup
            </button>
          </div>
        </div>
      );
    }

    const judgeId = currentJudge.id;
    const teamPct = (tid: string) => (maxPossible > 0 ? (getTeamTotal(tid, judgeId) / maxPossible) * 100 : 0);
    const stickyCls = 'sticky left-0 z-10';

    return (
      <div className="print:bg-white">
        <div className="space-y-4 print:p-0">

          {/* ── Top bar ── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-3 print:hidden">
            <button
              onClick={() => setView('setup')}
              className="inline-flex items-center justify-center p-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              title="Back to Setup"
              aria-label="Back to Setup"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800 leading-tight">{setup.eventName}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{formatDate(setup.eventDate)} · {teams.length} teams</p>
              </div>
            </div>

            <div className="h-8 w-px bg-slate-200 hidden sm:block" />

            <label className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Judge</span>
              <select
                value={judgeId}
                onChange={e => setActiveJudge(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-medium bg-white outline-none focus:ring-2 focus:ring-blue-400"
              >
                {setup.judges.map(j => <option key={j.id} value={j.id}>{j.name || 'Unnamed judge'}</option>)}
              </select>
            </label>

            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => setView('results')} className="px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
                <Trophy className="w-4 h-4 inline mr-1" /> Results
              </button>
              <button onClick={handlePrint} className="px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <Printer className="w-4 h-4 inline mr-1" /> Print
              </button>
            </div>
          </div>

          {/* ── Judge banner ── */}
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl shadow-lg px-5 py-3.5 flex items-center justify-between flex-wrap gap-3 print:hidden">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 print:text-slate-500">Scoring as judge</p>
              <p className="text-lg font-bold text-white print:text-black leading-tight">
                {currentJudge.name}
                {currentJudge.designation && <span className="text-sm font-normal text-slate-300 print:text-slate-600"> · {currentJudge.designation}</span>}
              </p>
            </div>
          </div>

          {/* ── All-teams scoring matrix (horizontally scrollable) — screen only ── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden print:hidden">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-blue-600" />
              <h3 className="text-base font-bold text-slate-800">Gemba-wise</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="border-collapse text-sm min-w-max">
                <thead>
                  <tr className="bg-slate-100">
                    <th className={`${stickyCls} bg-slate-100 border border-slate-300 px-3 py-2.5 text-left text-xs font-bold text-slate-700 uppercase min-w-[260px]`}>Criteria</th>
                    <th className="border border-slate-300 px-2 py-2.5 text-center text-xs font-bold text-slate-700 uppercase w-16">Max</th>
                    {teams.map((t, i) => (
                      <th key={t.id} className="border border-slate-300 px-3 py-2.5 text-center text-xs font-bold text-slate-700 min-w-[130px]">
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-blue-600 text-white inline-flex items-center justify-center text-[10px] flex-shrink-0">{i + 1}</span>
                          <span className="truncate max-w-[110px]">{t.name || 'Unnamed'}</span>
                        </div>
                        {t.projectTitle && <div className="text-[10px] font-normal text-slate-400 normal-case truncate max-w-[130px] mt-0.5 mx-auto">{t.projectTitle}</div>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Gemba level per team — Staff / Associate (splits the results) */}
                  <tr className="bg-blue-50/50">
                    <td className={`${stickyCls} bg-blue-50/50 border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700`}>Level</td>
                    <td className="border border-slate-300" />
                    {teams.map(t => (
                      <td key={t.id} className="border border-slate-300 px-2 py-1.5 text-center">
                        <select value={levelOf(t.id)} onChange={e => setLevel(t.id, e.target.value)} className="w-full px-1.5 py-1 border border-slate-300 rounded text-xs font-medium bg-white outline-none focus:ring-1 focus:ring-blue-400">
                          <option value="Staff">Staff</option>
                          <option value="Associate">Associate</option>
                        </select>
                      </td>
                    ))}
                  </tr>
                  {categories.map((category, ci) => {
                    const catCriteria = setup.criteria.filter(c => c.category === category);
                    return (
                      <React.Fragment key={category}>
                        <tr className="bg-slate-50">
                          {/* Main-point row: number derived once + name, and NO max/subtotal numbers (only the grand total shows numbers). */}
                          <td className={`${stickyCls} bg-slate-50 border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700`}>{ci + 1}. {(category || 'Uncategorised').replace(/^\s*(?:\d+\s*[.)-]?\s*)+/, '')}</td>
                          <td className="border border-slate-300" />
                          {teams.map(t => (
                            <td key={t.id} className="border border-slate-300" />
                          ))}
                        </tr>
                        {catCriteria.map((criteria, i) => (
                          <tr key={criteria.id} className="hover:bg-blue-50/30">
                            <td className={`${stickyCls} bg-white border border-slate-200 px-3 py-2`}>
                              <div className="flex items-start gap-1.5">
                                <span className="text-[11px] font-bold text-slate-400 mt-0.5 flex-shrink-0">{ci + 1}.{i + 1}</span>
                                <div className="min-w-0">
                                  <p className="text-sm text-slate-800 leading-snug">{criteria.name}</p>
                                  {criteria.guide && <p className="text-[10px] text-slate-400 italic">{criteria.guide}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="border border-slate-200 px-2 py-2 text-center text-xs font-semibold text-blue-700">{criteria.maxScore}</td>
                            {teams.map(t => {
                              const scored = hasScore(t.id, judgeId, criteria.id);
                              const val = getScore(t.id, judgeId, criteria.id);
                              return (
                                <td key={t.id} className="border border-slate-200 px-1.5 py-1.5 text-center">
                                  <input
                                    type="number"
                                    min={0}
                                    max={criteria.maxScore}
                                    step={0.5}
                                    value={scored ? val : ''}
                                    onChange={e => {
                                      if (e.target.value === '') clearScore(t.id, judgeId, criteria.id);
                                      else setScoreValue(t.id, judgeId, criteria.id, parseFloat(e.target.value));
                                    }}
                                    placeholder="—"
                                    className={`w-16 px-1.5 py-1 border rounded text-sm font-semibold text-center outline-none focus:ring-2 focus:ring-blue-300 ${scored ? 'border-slate-300 text-slate-800 bg-white' : 'border-slate-200 text-slate-400 bg-slate-50'}`}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}

                  {/* Grand total */}
                  <tr className="bg-slate-900 text-white">
                    <td className={`${stickyCls} bg-slate-900 border border-slate-700 px-3 py-2.5 text-sm font-bold`}>GRAND TOTAL</td>
                    <td className="border border-slate-700 px-2 py-2.5 text-center text-sm font-bold text-slate-300">{maxPossible}</td>
                    {teams.map(t => (
                      <td key={t.id} className="border border-slate-700 px-2 py-2.5 text-center">
                        <div className="text-base font-bold text-yellow-400">{getTeamTotal(t.id, judgeId)}</div>
                        <div className="text-[10px] text-slate-300">{teamPct(t.id).toFixed(0)}%</div>
                      </td>
                    ))}
                  </tr>

                  {/* Judge's remarks (per team) */}
                  <tr>
                    <td className={`${stickyCls} bg-white border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600`}>Judge&apos;s Remarks</td>
                    <td className="border border-slate-200" />
                    {teams.map(t => {
                      const k = evalKey(t.id, judgeId);
                      return (
                        <td key={t.id} className="border border-slate-200 px-1.5 py-1.5">
                          <input
                            type="text"
                            value={remarks[k] || ''}
                            onChange={e => setRemarks(prev => ({ ...prev, [k]: e.target.value }))}
                            placeholder="Remarks…"
                            className="w-full min-w-[120px] px-2 py-1 border border-slate-200 rounded text-xs outline-none focus:ring-2 focus:ring-blue-300"
                          />
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Print-only: complete scoring table for EVERY judge ── */}
          <div className="hidden print:block space-y-6">
            <div className="text-center mb-2">
              <h1 className="text-lg font-bold">{setup.eventName} — Judge Evaluation Scoring</h1>
              <p className="text-xs">{formatDate(setup.eventDate)} · {teams.length} teams · {setup.judges.length} judges</p>
            </div>
            {setup.judges.map(judge => (
              <div key={judge.id} style={{ breakInside: 'avoid' }}>
                <h2 className="text-sm font-bold mb-1">Judge: {judge.name || 'Unnamed'}{judge.designation ? ` — ${judge.designation}` : ''}</h2>
                <table className="w-full border-collapse text-[10px]">
                  <thead>
                    <tr>
                      <th className="border border-black px-1.5 py-1 text-left">Criteria</th>
                      <th className="border border-black px-1.5 py-1">Max</th>
                      {teams.map(t => <th key={t.id} className="border border-black px-1.5 py-1">{t.name}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((cat, ci) => (
                      <React.Fragment key={cat}>
                        <tr>
                          <td colSpan={2 + teams.length} className="border border-black px-1.5 py-0.5 font-bold bg-slate-100">{ci + 1}. {(cat || 'Uncategorised').replace(/^\s*(?:\d+\s*[.)-]?\s*)+/, '')}</td>
                        </tr>
                        {setup.criteria.filter(c => c.category === cat).map((c, i) => (
                          <tr key={c.id}>
                            <td className="border border-black px-1.5 py-0.5">{ci + 1}.{i + 1} {c.name}</td>
                            <td className="border border-black px-1.5 py-0.5 text-center">{c.maxScore}</td>
                            {teams.map(t => <td key={t.id} className="border border-black px-1.5 py-0.5 text-center">{hasScore(t.id, judge.id, c.id) ? getScore(t.id, judge.id, c.id) : '—'}</td>)}
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                    <tr className="font-bold">
                      <td className="border border-black px-1.5 py-1">GRAND TOTAL</td>
                      <td className="border border-black px-1.5 py-1 text-center">{maxPossible}</td>
                      {teams.map(t => <td key={t.id} className="border border-black px-1.5 py-1 text-center">{getTeamTotal(t.id, judge.id)}</td>)}
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          {/* ── Submit — records the current judge; Next appears once ALL judges submit ── */}
          {(() => {
            const submittedCount = setup.judges.filter(j => submittedJudges[j.id]).length;
            const allSubmitted = setup.judges.length > 0 && submittedCount === setup.judges.length;
            return (
              <div className="flex items-center justify-end gap-3 flex-wrap print:hidden">
                <button onClick={() => submitJudge(judgeId)} className="inline-flex items-center gap-2 px-7 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors">
                  Submit
                </button>
                {allSubmitted && (
                  <button onClick={() => setView('results')} className="inline-flex items-center gap-2 px-7 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors">
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })()}

          {/* Scoring guide */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 print:border-black">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> Scoring Guidelines
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px] text-slate-600">
              <div className="px-3 py-2 bg-emerald-50 rounded-lg"><b className="text-emerald-700">Excellent (80-100%)</b><br />Exceeds expectations</div>
              <div className="px-3 py-2 bg-blue-50 rounded-lg"><b className="text-blue-700">Good (60-79%)</b><br />Meets all requirements</div>
              <div className="px-3 py-2 bg-amber-50 rounded-lg"><b className="text-amber-700">Satisfactory (40-59%)</b><br />Room for improvement</div>
              <div className="px-3 py-2 bg-red-50 rounded-lg"><b className="text-red-700">Needs Work (0-39%)</b><br />Below expectations</div>
            </div>
          </div>

        </div>
      </div>
    );
  }

  // Results Screen
  if (view === 'results') {
    const teamResults = teams.map(team => {
      const avgScore = getTeamAverageScore(team.id);
      const judgeScores = setup.judges.map(judge => ({
        judge,
        total: getTeamTotal(team.id, judge.id),
      }));
      return { team, avgScore, judgeScores };
    }).sort((a, b) => b.avgScore - a.avgScore);

    // The top-5 teams per level (same set shown in Detailed Results) — used to limit
    // the Category-wise Performance columns too.
    const topTeams = (['Staff', 'Associate'] as const).flatMap(lvl =>
      teamResults.filter(r => levelOf(r.team.id) === lvl).slice(0, 5).map(r => r.team),
    );

    return (
      <div className="print:bg-white">
        <div className="space-y-6 print:p-0">
          {/* Header */}
          <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 rounded-xl shadow-xl p-6 mb-6 print:bg-white print:border-2 print:border-black print:rounded-none">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setView('scoring')}
                  title="Back"
                  aria-label="Back"
                  className="w-9 h-9 flex items-center justify-center bg-blue-900 text-white rounded-lg hover:bg-blue-800 transition-colors print:hidden flex-shrink-0"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <Trophy className="w-10 h-10 text-blue-900" />
                <div>
                  <h1 className="text-2xl font-bold text-blue-900">{setup.eventName} - Final Results</h1>
                  <p className="text-blue-900/70 text-sm">Date: {setup.eventDate}</p>
                </div>
              </div>
              <div className="flex gap-2 print:hidden">
                <div className="relative">
                  <button
                    onClick={() => setExportOpen(o => !o)}
                    className="px-4 py-2 bg-white text-blue-900 rounded-lg hover:bg-slate-100 transition-colors text-sm font-medium flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" /> Export <ChevronDown className="w-4 h-4" />
                  </button>
                  {exportOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
                      <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-20">
                        <button onClick={() => handleExport('excel')} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Excel (.xls)</button>
                        <button onClick={() => handleExport('csv')} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"><FileText className="w-4 h-4 text-blue-600" /> CSV</button>
                        <button onClick={() => handleExport('pdf')} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"><FileType className="w-4 h-4 text-red-600" /> PDF</button>
                      </div>
                    </>
                  )}
                </div>
                <button
                  onClick={handlePrint}
                  className="px-4 py-2 bg-white text-blue-900 rounded-lg hover:bg-slate-100 transition-colors text-sm flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" /> Print
                </button>
              </div>
            </div>
          </div>

          {/* Podium */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 print:hidden">
            {teamResults.slice(0, 3).map((result, idx) => {
              const medals = ['🥇', '🥈', '🥉'];
              const colors = ['from-yellow-400 to-yellow-500', 'from-slate-300 to-slate-400', 'from-orange-400 to-orange-500'];
              const borderColors = ['border-yellow-500', 'border-slate-400', 'border-orange-500'];

              return (
                <div
                  key={result.team.id}
                  className={`bg-gradient-to-br ${colors[idx]} rounded-xl shadow-lg p-6 border-4 ${borderColors[idx]}`}
                >
                  <div className="text-center">
                    <div className="text-5xl mb-2">{medals[idx]}</div>
                    <div className="text-sm font-semibold text-slate-700 mb-1">Rank #{idx + 1}</div>
                    <div className="text-xl font-bold text-slate-900 mb-1">{result.team.name}</div>
                    <div className="text-xs text-slate-700 mb-3">{result.team.projectTitle}</div>
                    <div className="text-4xl font-bold text-slate-900 mb-1">
                      {result.avgScore.toFixed(1)}
                    </div>
                    <div className="text-xs text-slate-700">out of {getMaxPossible()}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detailed Results — main heading, with Staff / Associate as sub-sections (each ranked highest-first) */}
          <div className="space-y-5">
            <h2 className="text-xl font-extrabold text-slate-800">Detailed Results</h2>
          {(['Staff', 'Associate'] as const).map(lvl => {
            // Only the TOP 5 highest-scoring teams per level (teamResults is sorted highest-first).
            const allForLevel = teamResults.filter(r => levelOf(r.team.id) === lvl);
            const rows = allForLevel.slice(0, 5);
            return (
              <div key={lvl} className="bg-white rounded-xl shadow-md border-2 border-slate-300 overflow-hidden">
                <div className="bg-slate-800 px-6 py-4 print:bg-slate-100 print:border-b-2 print:border-black flex items-center justify-between gap-3">
                  <h3 className="text-base font-bold text-white print:text-black flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${lvl === 'Staff' ? 'bg-blue-400' : 'bg-amber-400'}`} />{lvl} <span className="text-xs font-normal text-white/60 print:text-slate-500">— Top 5</span></h3>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/15 text-white print:text-black print:border print:border-black">Top {rows.length}{allForLevel.length > 5 ? ` of ${allForLevel.length}` : ''}</span>
                </div>
                {rows.length === 0 ? (
                  <p className="px-6 py-8 text-center text-sm text-slate-400">No teams marked as {lvl} yet — set each team's level in the scoring table.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-slate-100 print:bg-slate-200">
                          <th className="border-2 border-slate-300 px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">Rank</th>
                          <th className="border-2 border-slate-300 px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">Team</th>
                          <th className="border-2 border-slate-300 px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">Project</th>
                          <th className="border-2 border-slate-300 px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">Department</th>
                          {setup.judges.map(judge => (
                            <th key={judge.id} className="border-2 border-slate-300 px-4 py-3 text-center text-xs font-bold text-slate-700 uppercase">{judge.name}</th>
                          ))}
                          <th className="border-2 border-slate-300 px-4 py-3 text-center text-xs font-bold text-slate-700 uppercase bg-blue-100">Average</th>
                          <th className="border-2 border-slate-300 px-4 py-3 text-center text-xs font-bold text-slate-700 uppercase bg-yellow-100">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((result, idx) => {
                          const percent = getMaxPossible() > 0 ? (result.avgScore / getMaxPossible()) * 100 : 0;
                          return (
                            <tr key={result.team.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                              <td className="border-2 border-slate-300 px-4 py-3 text-center">
                                <div className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${
                                  idx === 0 ? 'bg-yellow-400 text-yellow-900' :
                                  idx === 1 ? 'bg-slate-300 text-slate-700' :
                                  idx === 2 ? 'bg-orange-400 text-orange-900' :
                                  'bg-slate-200 text-slate-600'
                                }`}>{idx + 1}</div>
                              </td>
                              <td className="border-2 border-slate-300 px-4 py-3 font-semibold text-slate-800">{result.team.name}</td>
                              <td className="border-2 border-slate-300 px-4 py-3 text-sm text-slate-700">{result.team.projectTitle}</td>
                              <td className="border-2 border-slate-300 px-4 py-3 text-sm text-slate-700">{result.team.department}</td>
                              {result.judgeScores.map(js => (
                                <td key={js.judge.id} className="border-2 border-slate-300 px-4 py-3 text-center font-semibold text-slate-800">{js.total}</td>
                              ))}
                              <td className="border-2 border-slate-300 px-4 py-3 text-center font-bold text-lg text-blue-700 bg-blue-50">{result.avgScore.toFixed(1)}</td>
                              <td className="border-2 border-slate-300 px-4 py-3 text-center">
                                <div className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                                  percent >= 80 ? 'bg-green-100 text-green-700' :
                                  percent >= 60 ? 'bg-blue-100 text-blue-700' :
                                  percent >= 40 ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 text-red-700'
                                }`}>{percent.toFixed(1)}%</div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
          </div>

          {/* Category Breakdown */}
          <div className="bg-white rounded-xl shadow-md border-2 border-slate-300 overflow-hidden mt-6">
            <div className="bg-slate-800 px-6 py-4 print:bg-slate-100 print:border-b-2 print:border-black">
              <h2 className="text-lg font-bold text-white print:text-black">Category-wise Performance (Average across all judges)</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border-2 border-slate-300 px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">Category</th>
                    <th className="border-2 border-slate-300 px-4 py-3 text-center text-xs font-bold text-slate-700 uppercase">Max</th>
                    {topTeams.map(team => (
                      <th key={team.id} className="border-2 border-slate-300 px-4 py-3 text-center text-xs font-bold text-slate-700 uppercase">
                        {team.name}
                        <div className="text-[9px] font-semibold text-blue-600 normal-case mt-0.5">{levelOf(team.id)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {getCategories().map(category => {
                    const categoryMax = getCategoryMax(category);
                    return (
                      <tr key={category} className="hover:bg-slate-50">
                        <td className="border-2 border-slate-300 px-4 py-3 font-semibold text-slate-800">
                          {category}
                        </td>
                        <td className="border-2 border-slate-300 px-4 py-3 text-center font-bold text-blue-700">
                          {categoryMax}
                        </td>
                        {topTeams.map(team => {
                          const avgCategoryScore = setup.judges.reduce((sum, judge) => {
                            return sum + getCategoryTotal(team.id, judge.id, category);
                          }, 0) / Math.max(1, setup.judges.length);
                          const percent = categoryMax > 0 ? (avgCategoryScore / categoryMax) * 100 : 0;

                          return (
                            <td key={team.id} className="border-2 border-slate-300 px-4 py-3 text-center">
                              <div className="font-bold text-slate-800">{avgCategoryScore.toFixed(1)}</div>
                              <div className={`text-xs font-semibold ${
                                percent >= 80 ? 'text-green-600' :
                                percent >= 60 ? 'text-blue-600' :
                                percent >= 40 ? 'text-yellow-600' :
                                'text-red-600'
                              }`}>
                                {percent.toFixed(0)}%
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
