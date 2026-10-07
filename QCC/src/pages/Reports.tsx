import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, FileSpreadsheet, FileText, ChevronDown, FolderKanban, TrendingUp, Target, Users, BarChart3, Loader2, RefreshCw } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import { api, ApiError } from '../lib/api';
import StatCard, { STAT_GRADIENTS } from '../components/StatCard';
import { loadClosure } from '../components/FinalProjectClosure';
import { useHalfYear } from '../lib/halfYear';
import type { QCCProject, Team } from '../types';

// Trigger a browser download for a blob (no backend needed).
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Build a CSV file and download it.
function exportCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (c: string | number) => `"${String(c).replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename);
}

// Build an Excel-compatible file (HTML table that Excel opens natively) and download it.
function exportExcel(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (c: string | number) => String(c).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const th = headers.map(h => `<th style="background:#e2e8f0;text-align:left">${esc(h)}</th>`).join('');
  const trs = rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1">${`<thead><tr>${th}</tr></thead>`}<tbody>${trs}</tbody></table></body></html>`;
  triggerDownload(new Blob([html], { type: 'application/vnd.ms-excel' }), filename);
}

export default function Reports() {
  const navigate = useNavigate();
  const [reportType, setReportType] = useState('overview');
  const [exportOpen, setExportOpen] = useState(false);

  // Live data — pulled from the same backend Team Registration & Projects write to, so
  // the charts and department performance auto-update as teams/projects change.
  const hy = useHalfYear();
  const [rawProjects, setRawProjects] = useState<QCCProject[]>([]);
  const [rawTeams, setRawTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = () => {
    setLoading(true);
    Promise.all([api.listProjects(), api.listTeams()])
      .then(([p, t]) => { setRawProjects(p); setRawTeams(t); setError(null); })
      .catch(e => setError(e instanceof ApiError ? e.message : 'Failed to load report data'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadData(); }, []);

  // Scope everything to the QCC period chosen in the header (projects follow their team's period).
  const teams = useMemo(() => rawTeams.filter(t => hy.isTeamActive(t.id, t.createdAt)), [rawTeams, hy]);
  const projects = useMemo(() => rawProjects.filter(p => hy.isTeamActive(p.teamId)), [rawProjects, hy]);

  // Departments come from the live teams (Team Registration) + any project department.
  const departments = useMemo(
    () => [...new Set([...teams.map(t => t.department), ...projects.map(p => p.department)].filter(Boolean))],
    [teams, projects],
  );

  // Projects closed & approved via Step 9 (Final Project Closure) — their savings count
  // as "realized" and they're flagged in the Project Impact chart & exports.
  const closedIds = useMemo(
    () => new Set(projects.filter(p => loadClosure(p.id).approval?.decision === 'approved').map(p => p.id)),
    [projects],
  );
  const closedCount = closedIds.size;
  const realizedSavings = useMemo(
    () => projects.filter(p => closedIds.has(p.id)).reduce((s, p) => s + (p.savings || 0), 0),
    [projects, closedIds],
  );

  // Shared report data used by every export format.
  const REPORT_HEADERS = ['Project', 'Department', 'Status', 'Closure', 'Savings (₹)', 'Impact Score'];
  const reportRows = (): (string | number)[][] =>
    projects.map(p => [p.title, p.department, p.status, closedIds.has(p.id) ? 'Closed & Approved' : 'Open', p.savings || 0, p.impactScore || 0]);

  const exportProjectsCSV = (filename = 'qcc-projects-report.csv') =>
    exportCSV(filename, REPORT_HEADERS, reportRows());

  const handleExport = (format: 'excel' | 'pdf' | 'csv') => {
    setExportOpen(false);
    if (format === 'excel') exportExcel('qcc-projects-report.xls', REPORT_HEADERS, reportRows());
    else if (format === 'csv') exportCSV('qcc-projects-report.csv', REPORT_HEADERS, reportRows());
    else window.print(); // PDF via the browser's print-to-PDF dialog
  };

  // Per-department performance — team count from Team Registration, active projects &
  // savings summed from that department's projects. Auto-updates with the live data.
  const deptPerformance = useMemo(() => departments.map(name => {
    const deptTeams = teams.filter(t => t.department === name);
    const deptProjects = projects.filter(p => p.department === name);
    return {
      name: name.length > 8 ? name.substring(0, 8) + '…' : name,
      fullName: name,
      teams: deptTeams.length,
      projects: deptProjects.filter(p => p.status === 'in_progress').length,
      savings: Math.round(deptProjects.reduce((s, p) => s + (p.savings || 0), 0) / 1000),
    };
  }), [departments, teams, projects]);

  const impactData = useMemo(() => projects.map(p => ({
    project: (closedIds.has(p.id) ? '✓ ' : '') + (p.title.length > 15 ? p.title.substring(0, 15) + '…' : p.title),
    impact: p.impactScore || 0,
    savings: (p.savings || 0) / 1000,
    closed: closedIds.has(p.id),
  })), [projects, closedIds]);

  // Real data-driven performance snapshot (0-100 per dimension).
  const radarData = useMemo(() => {
    const projCount = Math.max(1, projects.length);
    const avgImpact = Math.round(projects.reduce((s, p) => s + (p.impactScore || 0), 0) / projCount);
    const completedPct = Math.round((projects.filter(p => p.status === 'completed').length / projCount) * 100);
    const onTrackPct = Math.round((projects.filter(p => p.status !== 'on_hold').length / projCount) * 100);
    const activeTeamPct = Math.round((teams.filter(t => t.status === 'active').length / Math.max(1, teams.length)) * 100);
    const savingsScore = Math.min(100, Math.round(projects.reduce((s, p) => s + (p.savings || 0), 0) / 10000));
    return [
      { metric: 'Quality', A: avgImpact, fullMark: 100 },
      { metric: 'Cost Savings', A: savingsScore, fullMark: 100 },
      { metric: 'Timeline', A: onTrackPct, fullMark: 100 },
      { metric: 'Team Work', A: activeTeamPct, fullMark: 100 },
      { metric: 'Innovation', A: avgImpact, fullMark: 100 },
      { metric: 'Standardization', A: completedPct, fullMark: 100 },
    ];
  }, [projects, teams]);

  const totalSavings = projects.reduce((s, p) => s + (p.savings || 0), 0);
  const avgImpactScore = projects.length ? Math.round(projects.reduce((s, p) => s + (p.impactScore || 0), 0) / projects.length) : 0;
  const activeTeams = teams.filter(t => t.status === 'active').length;

  const reportTypes = [
    { id: 'overview', label: 'Overview Report' },
    { id: 'department', label: 'Department Report' },
    { id: 'team', label: 'Team Performance' },
    { id: 'financial', label: 'Financial Impact' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex-1 flex items-center gap-2 text-xs text-slate-500">
          {loading ? <><Loader2 size={13} className="animate-spin" /> Loading live data…</>
            : <><span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" /> QCC {hy.active.year} · {hy.labelHalf(hy.active.half)} · {teams.length} teams · {projects.length} projects</>}
        </div>
        <div className="relative flex items-center gap-2 justify-end">
          <button onClick={loadData} title="Refresh" className="inline-flex items-center gap-1.5 px-3 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button
            onClick={() => setExportOpen(o => !o)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
            <Download size={16} /> Export
            <ChevronDown size={14} className={`transition-transform ${exportOpen ? 'rotate-180' : ''}`} />
          </button>
          {exportOpen && (
            <>
              {/* click-away layer */}
              <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
              <div className="absolute right-0 top-full mt-2 w-44 py-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 overflow-hidden">
                <button
                  onClick={() => handleExport('excel')}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                  <FileSpreadsheet size={15} className="text-emerald-600" /> Excel (.xls)
                </button>
                <button
                  onClick={() => handleExport('pdf')}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                  <FileText size={15} className="text-red-600" /> PDF
                </button>
                <button
                  onClick={() => handleExport('csv')}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                  <Download size={15} className="text-blue-600" /> CSV
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {error && <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      {/* Report Type Selector */}
      <div className="flex gap-2 flex-wrap">
        {reportTypes.map(rt => (
          <button
            key={rt.id}
            onClick={() => setReportType(rt.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              reportType === rt.id ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {rt.label}
          </button>
        ))}
      </div>

      {/* Summary Cards — click to open the page that data lives on */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          label="Total Projects"
          value={projects.length}
          icon={<FolderKanban size={20} />}
          grad={STAT_GRADIENTS[0]}
          sub={`Across ${departments.length} departments`}
          onClick={() => navigate('/projects')}
        />
        <StatCard
          label="Total Savings"
          value={`₹${(totalSavings / 100000).toFixed(1)}L`}
          icon={<TrendingUp size={20} />}
          grad={STAT_GRADIENTS[1]}
          sub="Cumulative impact"
          onClick={() => navigate('/projects')}
        />
        <StatCard
          label="Avg Impact Score"
          value={avgImpactScore}
          icon={<Target size={20} />}
          grad={STAT_GRADIENTS[2]}
          sub="Out of 100"
          onClick={() => navigate('/projects')}
        />
        <StatCard
          label="Active Teams"
          value={activeTeams}
          icon={<Users size={20} />}
          grad={STAT_GRADIENTS[3]}
          sub="From Team Registration"
          onClick={() => navigate('/team-registration')}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Department Performance */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0"><BarChart3 size={16} /></span>
            <h3 className="text-sm font-semibold text-slate-800">Department Performance</h3>
            <span className="ml-auto text-[10px] text-slate-400">savings ₹K · from Team Registration</span>
          </div>
          {deptPerformance.length === 0 ? (
            <div className="h-[250px] flex items-center justify-center text-sm text-slate-400">{loading ? 'Loading…' : 'No department data yet'}</div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={deptPerformance}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} labelFormatter={(l: any) => deptPerformance.find(d => d.name === l)?.fullName || String(l)} />
                <Bar dataKey="savings" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Savings (K)" />
                <Bar dataKey="teams" fill="#10b981" radius={[4, 4, 0, 0]} name="Teams" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* QCC Performance Radar */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center flex-shrink-0"><Target size={16} /></span>
            <h3 className="text-sm font-semibold text-slate-800">QCC Performance Radar</h3>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: '#64748b' }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9, fill: '#94a3b8' }} />
              <Radar name="Performance" dataKey="A" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Project Impact */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <div className="flex items-center gap-2.5 mb-4">
          <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0"><TrendingUp size={16} /></span>
          <h3 className="text-sm font-semibold text-slate-800">Project Impact &amp; Savings</h3>
          <span className="ml-auto text-[10px] text-slate-400">{closedCount} of {projects.length} closed &amp; approved · ₹{(realizedSavings / 100000).toFixed(1)}L realized</span>
        </div>
        {impactData.length === 0 ? (
          <div className="h-[250px] flex items-center justify-center text-sm text-slate-400">{loading ? 'Loading…' : 'No project data yet'}</div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(250, impactData.length * 32)}>
            <BarChart data={impactData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis type="category" dataKey="project" tick={{ fontSize: 10, fill: '#64748b' }} width={120} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
              <Bar dataKey="impact" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="Impact Score" />
              <Bar dataKey="savings" fill="#10b981" radius={[0, 4, 4, 0]} name="Savings (K)" />
            </BarChart>
          </ResponsiveContainer>
        )}
        {closedCount > 0 && <p className="text-[10px] text-slate-400 mt-2">✓ = project closed &amp; approved via Final Project Closure (Step 9) — its savings count as realized.</p>}
      </div>

      {/* Downloadable Reports Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0"><FileText size={16} /></span>
            <h3 className="text-sm font-semibold text-slate-800">Available Reports</h3>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {[
            { name: 'QCC Cycle Summary Report', type: 'PDF', date: '2024-08-01', size: '2.4 MB' },
            { name: 'Department-wise Analysis', type: 'Excel', date: '2024-08-01', size: '1.8 MB' },
            { name: 'Team Performance Scorecard', type: 'PDF', date: '2024-07-28', size: '3.1 MB' },
            { name: 'Financial Impact Statement', type: 'Excel', date: '2024-07-25', size: '0.9 MB' },
            { name: 'Action Item Status Report', type: 'PDF', date: '2024-08-02', size: '1.2 MB' },
            { name: 'Meeting Minutes Compilation', type: 'PDF', date: '2024-08-01', size: '4.5 MB' },
          ].map((report, i) => (
            <div key={i} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  report.type === 'PDF' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
                }`}>
                  {report.type === 'PDF' ? <FileText size={16} /> : <FileSpreadsheet size={16} />}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">{report.name}</p>
                  <p className="text-[10px] text-slate-500">{report.type} • {report.size} • {report.date}</p>
                </div>
              </div>
              <button
                onClick={() => exportProjectsCSV(`${report.name.replace(/\s+/g, '-').toLowerCase()}.csv`)}
                title={`Download ${report.name}`}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors">
                <Download size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
