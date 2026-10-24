import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, useNavigationType } from 'react-router-dom';
import { Bell, Menu, ArrowLeft, CalendarRange } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useHalfYear, type HalfKey } from '../../lib/halfYear';
import { useActivitySteps } from '../../lib/activitySteps';
import { api } from '../../lib/api';
import { formatDate, formatDateTime } from '../../lib/format';

interface Notif {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  createdAt: string;
  to: string;
  adminTab?: string;   // opens this Admin Panel tab
  read?: boolean;
}

const APPROVER_ROLES = ['admin', 'dept_head', 'facilitator'];
const RECENT_DAYS = 30;  // decisions older than this are not shown

interface HeaderProps {
  onMenuClick: () => void;
}

// Page title shown centered in the header (matches the sidebar labels).
const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/team-registration': 'Team Registration',
  '/projects': 'QCC Projects',
  '/workflow': 'QCC Workflow',
  '/evaluation-score': 'Team Evaluation',
  '/circle-assessment': 'Team Assessment',
  '/actions': 'Action Tracker',
  '/meetings': 'Meeting Management',
  '/meeting-management': 'Meeting Management',
  '/approvals': 'Approvals',
  '/reports': 'Reports',
  '/admin': 'Admin Panel',
  '/settings': 'Settings',
};

// Pages that do not show the QCC period picker (they are not scoped to a period).
const NO_PERIOD_PAGES = ['/settings'];

export default function Header({ onMenuClick }: HeaderProps) {
  const { user } = useAuth();
  const hy = useHalfYear();
  const navigate = useNavigate();
  const location = useLocation();
  const navType = useNavigationType();

  // How many pages deep we are *inside* the app. Going back past 0 would land on
  // /login (and drop the in-memory session), so at depth 0 we go to the Dashboard.
  const depth = useRef(0);
  useEffect(() => {
    if (navType === 'PUSH') depth.current += 1;
    else if (navType === 'POP') depth.current = Math.max(0, depth.current - 1);
  }, [location.key, navType]);

  const handleBack = () => {
    if (depth.current > 0) navigate(-1);
    else navigate('/');
  };
  const { workflowSteps } = useActivitySteps();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const notifRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifs.filter(n => !n.read).length;
  const pageTitle = PAGE_TITLES[location.pathname];

  // Notifications are built from the live records this user can see: approval requests
  // (pending for approvers, decisions for everyone), overdue actions, and team change
  // requests. "Read" is remembered per user in this browser.
  const readKey = user ? `qcc-notif-read-${user.id}` : '';
  const loadNotifications = useCallback(async () => {
    if (!user) return;
    const [approvals, actions, projects, teams, changeRequests] = await Promise.all([
      api.listApprovals().catch(() => []), api.listActions().catch(() => []),
      api.listProjects().catch(() => []), api.listTeams().catch(() => []),
      api.listChangeRequests().catch(() => []),
    ]);
    const teamOf = (projectId: string) => {
      const p = projects.find(x => x.id === projectId);
      return teams.find(t => t.id === p?.teamId)?.name || p?.title || projectId;
    };
    // Only the selected QCC cycle's records: a new cycle starts without old notifications.
    const projectInPeriod = (projectId: string) => {
      const p = projects.find(x => x.id === projectId);
      return !!p && hy.isProjectActive(p.teamId, p.startedAt);
    };
    const teamInPeriod = (teamId: string) => {
      const t = teams.find(x => x.id === teamId);
      return !!t && hy.isTeamActive(t.id, t.createdAt);
    };
    const stepName = (n: number) => `Step ${n}${workflowSteps[n - 1] ? ` (${workflowSteps[n - 1].title})` : ''}`;
    const since = new Date(Date.now() - RECENT_DAYS * 86400000).toISOString();
    const list: Notif[] = [];
    if (APPROVER_ROLES.includes(user.role)) {
      approvals.filter(a => a.status === 'pending' && projectInPeriod(a.projectId)).forEach(a => list.push({
        id: `apr-p-${a.id}`, title: 'New Approval Request', type: 'warning', to: '/approvals', createdAt: a.requestedAt || '',
        message: `${teamOf(a.projectId)} submitted ${stepName(a.stepNumber)} for review.`,
      }));
    }
    approvals.filter(a => a.status !== 'pending' && (a.reviewedAt || '') >= since && projectInPeriod(a.projectId)).forEach(a => list.push({
      id: `apr-d-${a.id}`, to: '/workflow', createdAt: a.reviewedAt || '',
      title: a.status === 'approved' ? 'Step Approved' : a.status === 'rework' ? 'Rework Requested' : 'Step Rejected',
      type: a.status === 'approved' ? 'success' : 'error',
      message: `${stepName(a.stepNumber)} of ${teamOf(a.projectId)} was ${a.status === 'rework' ? 'sent back for rework' : a.status}.${a.comments ? ` "${a.comments}"` : ''}`,
    }));
    actions.filter(a => a.status === 'overdue' && projectInPeriod(a.projectId)).forEach(a => list.push({
      id: `act-${a.id}`, title: 'Action Overdue', type: 'error', to: '/actions', createdAt: a.dueDate || '',
      message: `${a.title} (${teamOf(a.projectId)}) was due ${formatDate(a.dueDate)}.`,
    }));
    if (user.role === 'admin') {
      changeRequests.filter(c => c.status === 'pending' && teamInPeriod(c.teamId)).forEach(c => list.push({
        id: `cr-p-${c.id}`, title: 'Team Change Request', type: 'warning', to: '/admin', adminTab: 'changeRequests', createdAt: c.requestedAt || '',
        message: `${c.requestedByName || 'A user'} wants to change ${c.teamName || c.teamId}.`,
      }));
    } else {
      changeRequests.filter(c => c.status !== 'pending' && (c.reviewedAt || '') >= since && teamInPeriod(c.teamId)).forEach(c => list.push({
        id: `cr-d-${c.id}`, to: '/team-registration', createdAt: c.reviewedAt || '',
        title: c.status === 'approved' ? 'Team Change Approved' : 'Team Change Rejected',
        type: c.status === 'approved' ? 'success' : 'error',
        message: `Your change to ${c.teamName || c.teamId} was ${c.status}.${c.reviewComments ? ` "${c.reviewComments}"` : ''}`,
      }));
    }
    let read: string[] = [];
    try { read = JSON.parse(localStorage.getItem(readKey) || '[]'); } catch { /* none read */ }
    setNotifs(list
      .map(n => ({ ...n, read: read.includes(n.id) }))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 30));
  }, [user, workflowSteps, readKey, hy]);

  // Refresh when the dashboard (where the bell lives) is opened.
  useEffect(() => { if (location.pathname === '/') loadNotifications(); }, [location.pathname, loadNotifications]);

  const handleNotifClick = (n: Notif) => {
    setNotifs(prev => prev.map(x => (x.id === n.id ? { ...x, read: true } : x)));
    try {
      const read: string[] = JSON.parse(localStorage.getItem(readKey) || '[]');
      if (!read.includes(n.id)) localStorage.setItem(readKey, JSON.stringify([...read, n.id].slice(-500)));
      if (n.adminTab) localStorage.setItem('qcc-admin-tab', n.adminTab);
    } catch { /* ignore */ }
    setShowNotifications(false);
    navigate(n.to);
  };

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifications(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!user) return null;

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
      <div className="relative flex items-center justify-between h-16 px-4 lg:px-6">
        {/* Left: Back + Menu */}
        <div className="flex items-center gap-3">
          {location.pathname !== '/evaluation-score' && (
            <button
              onClick={handleBack}
              title="Go back"
              aria-label="Go back"
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-600"
          >
            <Menu size={20} />
          </button>

          {/* Global QCC period scope (one QCC cycle), on every page except Settings.
              The choice is remembered and every page follows it. */}
          {/* No cycle left (all deleted): say so instead of offering a period that does not exist. */}
          {!NO_PERIOD_PAGES.includes(location.pathname) && hy.periods.length === 0 && (
            <button
              type="button"
              onClick={() => { if (user.role !== 'admin') return; try { localStorage.setItem('qcc-admin-tab', 'cycles'); } catch { /* ignore */ } navigate('/admin'); }}
              title={user.role === 'admin' ? 'Create a QCC cycle in Admin Panel → QCC Cycles' : 'Ask the QCC Admin to create a QCC cycle'}
              className={`flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs sm:text-sm font-semibold text-amber-700 ${user.role === 'admin' ? 'hover:bg-amber-100' : 'cursor-default'}`}
            >
              <CalendarRange size={15} className="flex-shrink-0" /> No QCC cycle
            </button>
          )}
          {!NO_PERIOD_PAGES.includes(location.pathname) && hy.periods.length > 0 && (
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 pl-2 pr-1.5 py-1" title="QCC period — sets the data shown across the whole app">
            <CalendarRange size={15} className="text-blue-600 flex-shrink-0" />
            <select
              value={`${hy.active.year}|${hy.active.half}`}
              onChange={e => { const [y, h] = e.target.value.split('|'); hy.setActive({ year: parseInt(y, 10), half: h as HalfKey }); }}
              className="bg-transparent text-xs sm:text-sm font-semibold text-slate-700 outline-none cursor-pointer"
            >
              {hy.periods.map(p => (
                <option key={`${p.year}|${p.half}`} value={`${p.year}|${p.half}`}>QCC {p.year} · {hy.labelHalf(p.half, p.year)}</option>
              ))}
            </select>
          </div>
          )}
        </div>

        {/* Center: page title */}
        {pageTitle && (
          <h1 className="absolute left-1/2 -translate-x-1/2 text-3xl font-extrabold text-slate-900">{pageTitle}</h1>
        )}

        {/* Right: page actions (portal slot) + Notifications */}
        <div className="flex items-center gap-2">
          {/* Pages inject their top action buttons here via <HeaderPortal> */}
          <div id="header-actions" className="flex items-center gap-2" />

          {/* Notifications — only on the dashboard */}
          {location.pathname === '/' && (
          <div ref={notifRef} className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>
            {showNotifications && (
              <div className="absolute right-0 top-12 w-80 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-800">Notifications</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{unreadCount} new</span>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifs.length === 0 && <p className="px-4 py-6 text-center text-xs text-slate-400">No notifications</p>}
                  {notifs.map(n => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => handleNotifClick(n)}
                      className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors ${!n.read ? 'bg-blue-50/50' : ''}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                          n.type === 'success' ? 'bg-emerald-500' :
                          n.type === 'error' ? 'bg-red-500' :
                          n.type === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
                        }`} />
                        <div>
                          <p className="text-xs font-semibold text-slate-800">{n.title}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">{n.message}</p>
                          {/* Due dates carry no time of day — show the date alone for those. */}
                          <p className="text-[10px] text-slate-400 mt-1">{n.createdAt.length <= 10 ? formatDate(n.createdAt) : formatDateTime(n.createdAt)}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          )}
        </div>
      </div>
    </header>
  );
}
