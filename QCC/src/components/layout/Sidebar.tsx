import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, CalendarCheck,
  BarChart3, Settings, Shield, UserCheck,
  GitBranch, BookOpen, Target, FolderKanban,
  LogIn, ClipboardCheck
} from 'lucide-react';
import { useAuth, ROLE_LABELS } from '../../lib/auth';
import type { UserRole } from '../../types';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: <LayoutDashboard size={20} />, roles: ['admin', 'leader', 'facilitator', 'coordinator', 'dept_head', 'member'] },
  { label: 'Team Registration', path: '/team-registration', icon: <Users size={20} />, roles: ['admin', 'leader', 'facilitator', 'coordinator'] },
  { label: 'QCC Projects', path: '/projects', icon: <FolderKanban size={20} />, roles: ['admin', 'leader', 'facilitator', 'coordinator', 'dept_head', 'member'] },
  { label: 'QCC Workflow', path: '/workflow', icon: <GitBranch size={20} />, roles: ['admin', 'leader', 'facilitator', 'coordinator', 'member'] },
  { label: 'Team Evaluation', path: '/evaluation-score', icon: <Target size={20} />, roles: ['admin', 'leader', 'facilitator', 'coordinator', 'dept_head', 'member'] },
  { label: 'Team Assessment', path: '/circle-assessment', icon: <ClipboardCheck size={20} />, roles: ['admin', 'leader', 'facilitator', 'coordinator', 'dept_head', 'member'] },
  { label: 'Action Tracker', path: '/actions', icon: <Target size={20} />, roles: ['admin', 'leader', 'facilitator', 'coordinator', 'dept_head', 'member'] },
  { label: 'Meeting Management', path: '/meeting-management', icon: <BookOpen size={20} />, roles: ['admin', 'leader', 'facilitator', 'coordinator', 'member'] },
  { label: 'Approvals', path: '/approvals', icon: <UserCheck size={20} />, roles: ['admin', 'dept_head', 'facilitator'] },
  { label: 'Reports', path: '/reports', icon: <BarChart3 size={20} />, roles: ['admin', 'leader', 'facilitator', 'coordinator', 'dept_head'] },
  { label: 'Admin Panel', path: '/admin', icon: <Shield size={20} />, roles: ['admin'] },
  { label: 'Settings', path: '/settings', icon: <Settings size={20} />, roles: ['admin', 'leader', 'facilitator', 'coordinator', 'dept_head', 'member'] },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onHoverChange?: (hovering: boolean) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidebar({ collapsed, onHoverChange, mobileOpen, onMobileClose }: SidebarProps) {
  const { user, logout } = useAuth();
  const location = useLocation();

  useEffect(() => {
    onMobileClose();
  }, [location.pathname]);

  // "Switch User" signs the current user out → the app redirects to the login
  // page, where the next user must enter their credentials to get access.
  if (!user) return null;

  const filteredNav = NAV_ITEMS.filter(item => item.roles.includes(user.role));

  const sidebarContent = (
    <div className="flex flex-col h-full bg-slate-900 text-white">
      {/* Logo */}
      <div className={`flex items-center gap-3 px-4 py-5 border-b border-slate-700/50 ${collapsed ? 'justify-center' : ''}`}>
        <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center flex-shrink-0 overflow-hidden">
          <img
            src="/logo.png"
            alt="Toyota Boshoku"
            className="w-full h-full object-contain p-0.5"
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-sm font-bold tracking-tight text-white">QCC Monitor</h1>
            <p className="text-[10px] text-slate-400 font-medium">Quality Circle Portal</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto no-scrollbar">
        {filteredNav.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150
              ${isActive
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }
              ${collapsed ? 'justify-center' : ''}`
            }
            title={collapsed ? item.label : undefined}
          >
            <span className="flex-shrink-0">{item.icon}</span>
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User Card */}
      <div className={`border-t border-slate-700/50 p-3 ${collapsed ? 'text-center' : ''}`}>
        {!collapsed && (
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold">
              {user.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-semibold truncate">{user.name}</p>
              <p className="text-[10px] text-slate-400">{ROLE_LABELS[user.role]}</p>
            </div>
          </div>
        )}
        {!collapsed && (
          <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 font-medium mb-2">
            {user.department}
          </span>
        )}
        {/* Switch User → logs out to the login page */}
        <button
          onClick={logout}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white transition-colors ${collapsed ? 'justify-center' : ''}`}
          title={collapsed ? 'Switch User' : undefined}
        >
          <LogIn size={16} className="flex-shrink-0" />
          {!collapsed && <span>Switch User</span>}
        </button>
      </div>

    </div>
  );

  return (
    <>
      {/* Desktop Sidebar — collapsed to icons; expands on hover */}
      <aside
        onMouseEnter={() => onHoverChange?.(true)}
        onMouseLeave={() => onHoverChange?.(false)}
        className={`hidden lg:flex flex-col flex-shrink-0 h-screen sticky top-0 transition-all duration-300 ease-in-out ${
          collapsed ? 'w-[72px]' : 'w-[250px]'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={onMobileClose} />
          <aside className="relative w-[260px] h-full">
            {sidebarContent}
          </aside>
        </div>
      )}

    </>
  );
}
