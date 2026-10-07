import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, useNavigationType } from 'react-router-dom';
import { Bell, Menu, ArrowLeft, CalendarRange } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useHalfYear, type HalfKey } from '../../lib/halfYear';
import { mockNotifications } from '../../lib/data';
import { formatDateTime } from '../../lib/format';

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
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifs, setNotifs] = useState(mockNotifications);
  const notifRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifs.filter(n => !n.read).length;
  const pageTitle = PAGE_TITLES[location.pathname];

  // Route a notification to the page where its underlying record lives.
  const notifTarget = (n: typeof notifs[number]): string => {
    const s = `${n.title} ${n.message}`.toLowerCase();
    if (s.includes('approval') || s.includes('approved')) return '/approvals';
    if (s.includes('overdue') || s.includes('action')) return '/actions';
    if (s.includes('meeting')) return '/meetings';
    if (s.includes('step') || s.includes('completed') || s.includes('project')) return '/workflow';
    return '/';
  };

  const handleNotifClick = (n: typeof notifs[number]) => {
    setNotifs(prev => prev.map(x => (x.id === n.id ? { ...x, read: true } : x)));
    setShowNotifications(false);
    navigate(notifTarget(n));
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

          {/* Global QCC period scope (year + half). Chosen on the Dashboard only — the
              choice is remembered and every other page follows it, so the period cannot
              be changed halfway through a workflow by accident. */}
          {location.pathname === '/' && (
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 pl-2 pr-1.5 py-1" title="QCC period — sets the data shown across the whole app">
            <CalendarRange size={15} className="text-blue-600 flex-shrink-0" />
            <select
              value={`${hy.active.year}|${hy.active.half}`}
              onChange={e => { const [y, h] = e.target.value.split('|'); hy.setActive({ year: parseInt(y, 10), half: h as HalfKey }); }}
              className="bg-transparent text-xs sm:text-sm font-semibold text-slate-700 outline-none cursor-pointer"
            >
              {hy.periods.map(p => (
                <option key={`${p.year}|${p.half}`} value={`${p.year}|${p.half}`}>QCC {p.year} · {hy.labelHalf(p.half)}</option>
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
                          <p className="text-[10px] text-slate-400 mt-1">{formatDateTime(n.createdAt)}</p>
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
