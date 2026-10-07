import { useState, useEffect, useRef } from 'react';
import { Bell, Shield, Palette, Save, User, Check, LogOut, Edit2 } from 'lucide-react';
import { useAuth, ROLE_LABELS } from '../lib/auth';
import { api, ApiError } from '../lib/api';
import { DEPARTMENTS } from '../lib/data';

const STORAGE_KEY = 'qcc-user-settings';

interface NotifPref { key: string; label: string; enabled: boolean; }

const DEFAULT_NOTIFS: NotifPref[] = [
  { key: 'emailApprovals', label: 'Email notifications for approvals', enabled: true },
  { key: 'pushActions', label: 'Push notifications for action items', enabled: true },
  { key: 'weeklyDigest', label: 'Weekly digest summary', enabled: false },
  { key: 'meetingReminders', label: 'Meeting reminders', enabled: true },
  { key: 'systemAnnouncements', label: 'System announcements', enabled: true },
];

function loadSettings(): Record<string, unknown> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

export default function Settings() {
  const { user, logout, refreshToken } = useAuth();
  const [activeSection, setActiveSection] = useState(() => { try { return localStorage.getItem('qcc-settings-section') || 'profile'; } catch { return 'profile'; } });
  useEffect(() => { try { localStorage.setItem('qcc-settings-section', activeSection); } catch { /* ignore */ } }, [activeSection]);
  const saved = useRef(loadSettings()).current;

  // ── Profile ──
  const [fullName, setFullName] = useState((saved.fullName as string) ?? user?.name ?? '');
  const [email, setEmail] = useState((saved.email as string) ?? user?.email ?? '');
  const [phone, setPhone] = useState((saved.phone as string) ?? '');
  const [department, setDepartment] = useState((saved.department as string) ?? user?.department ?? '');
  const deptOptions = [...new Set([department, ...DEPARTMENTS].filter(Boolean))];
  const [editingProfile, setEditingProfile] = useState(false); // view details by default; edit on demand

  // ── Notifications ──
  const [notifs, setNotifs] = useState<NotifPref[]>(() => {
    const s = (saved.notifications as Record<string, boolean>) || {};
    return DEFAULT_NOTIFS.map(n => ({ ...n, enabled: s[n.key] ?? n.enabled }));
  });

  // ── Security ──
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');

  // ── Appearance ──
  const [theme, setTheme] = useState((saved.theme as string) ?? 'Light');
  const [sidebarDefault, setSidebarDefault] = useState((saved.sidebarDefault as string) ?? 'Collapsed');

  // ── Toast ──
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2500);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const persist = (patch: Record<string, unknown>) => {
    const merged = { ...loadSettings(), ...patch };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  };

  const saveProfile = () => {
    if (!fullName.trim()) { showToast('Name cannot be empty'); return; }
    persist({ fullName, email, phone, department });
    setEditingProfile(false);
    showToast('Profile saved');
  };

  const toggleNotif = (key: string) =>
    setNotifs(prev => prev.map(n => (n.key === key ? { ...n, enabled: !n.enabled } : n)));

  const saveNotifications = () => {
    persist({ notifications: Object.fromEntries(notifs.map(n => [n.key, n.enabled])) });
    showToast('Preferences saved');
  };

  const [pwBusy, setPwBusy] = useState(false);
  const updatePassword = async () => {
    if (!curPw || !newPw || !confirmPw) { setPwError('Please fill in all password fields.'); return; }
    if (newPw.length < 6) { setPwError('New password must be at least 6 characters.'); return; }
    if (newPw !== confirmPw) { setPwError('New passwords do not match.'); return; }
    if (newPw === curPw) { setPwError('New password must be different from the current one.'); return; }
    if (!user?.email) { setPwError('No signed-in user.'); return; }
    setPwError(''); setPwBusy(true);
    try {
      // Update the password on the server (hashed, stored in the DB) so the next
      // sign-in verifies against the new one. The backend re-checks the current password.
      // This is the single source of truth — the new password stays until the user
      // changes it again; there is no demo/default password that overrides it.
      const { accessToken } = await api.changePassword(curPw, newPw);
      // Changing the password revokes every token issued under the old one, so any
      // other device signed in as this user is dropped to the login screen. Adopt the
      // replacement token the server just issued to keep THIS device signed in.
      refreshToken(accessToken);
      setCurPw(''); setNewPw(''); setConfirmPw('');
      showToast('Password updated — other devices have been signed out');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Could not update the password.';
      setPwError(/current password/i.test(msg) ? 'Current password is incorrect.' : msg);
    } finally {
      setPwBusy(false);
    }
  };

  const saveAppearance = () => {
    persist({ theme, sidebarDefault });
    showToast('Appearance saved');
  };

  const sections = [
    { id: 'profile', label: 'Profile', icon: <User size={16} />, chip: 'bg-blue-50 text-blue-600' },
    { id: 'notifications', label: 'Notifications', icon: <Bell size={16} />, chip: 'bg-amber-50 text-amber-600' },
    { id: 'security', label: 'Security', icon: <Shield size={16} />, chip: 'bg-emerald-50 text-emerald-600' },
    { id: 'appearance', label: 'Appearance', icon: <Palette size={16} />, chip: 'bg-violet-50 text-violet-600' },
  ];

  const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Section nav */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-2 h-fit">
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeSection === s.id ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className={`w-8 h-8 rounded-lg ${s.chip} flex items-center justify-center flex-shrink-0`}>{s.icon}</span>
              {s.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="lg:col-span-3 space-y-4">
          {activeSection === 'profile' && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">Profile Information</h3>
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-xl font-bold text-white">
                  {(fullName || user?.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800">{fullName || user?.name}</p>
                  <p className="text-xs text-slate-500">{ROLE_LABELS[user?.role || 'member']} • {department || user?.department}</p>
                  <p className="text-xs text-slate-400 truncate">{email || user?.email}</p>
                </div>
                <button
                  onClick={logout}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors flex-shrink-0"
                >
                  <LogOut size={16} /> Sign Out
                </button>
              </div>
              {editingProfile ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Full Name</label>
                      <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
                      <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Department</label>
                      <select value={department} onChange={e => setDepartment(e.target.value)} className={inputCls + ' bg-white'}>
                        {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
                      <input type="tel" inputMode="numeric" maxLength={10} value={phone}
                        onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="10-digit mobile number" className={inputCls} />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    <button onClick={() => setEditingProfile(false)} className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">Cancel</button>
                    <button onClick={saveProfile} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
                      <Save size={16} /> Save Changes
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {([
                      ['Full Name', fullName || user?.name || '—'],
                      ['Email', email || user?.email || '—'],
                      ['Department', department || user?.department || '—'],
                      ['Phone', phone || '—'],
                    ] as [string, string][]).map(([label, val]) => (
                      <div key={label}>
                        <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
                        <p className="text-sm text-slate-800 font-medium bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 truncate">{val}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end mt-4">
                    <button onClick={() => setEditingProfile(true)} className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
                      <Edit2 size={16} /> Change profile details
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {activeSection === 'notifications' && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">Notification Preferences</h3>
              <div className="space-y-3">
                {notifs.map(n => (
                  <div key={n.key} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-b-0">
                    <span className="text-sm text-slate-700">{n.label}</span>
                    <button
                      type="button"
                      onClick={() => toggleNotif(n.key)}
                      className={`relative w-10 h-5 rounded-full transition-colors ${n.enabled ? 'bg-blue-600' : 'bg-slate-300'}`}
                      aria-pressed={n.enabled}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${n.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex justify-end mt-4">
                <button onClick={saveNotifications} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
                  <Save size={16} /> Save Changes
                </button>
              </div>
            </div>
          )}

          {activeSection === 'security' && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">Security Settings</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Current Password</label>
                  <input type="password" value={curPw} onChange={e => { setCurPw(e.target.value); setPwError(''); }} placeholder="Enter current password" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">New Password</label>
                  <input type="password" value={newPw} onChange={e => { setNewPw(e.target.value); setPwError(''); }} placeholder="Enter new password" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Confirm New Password</label>
                  <input type="password" value={confirmPw} onChange={e => { setConfirmPw(e.target.value); setPwError(''); }} placeholder="Confirm new password" className={inputCls} />
                </div>
                {pwError && <p className="text-xs text-red-600 font-medium">{pwError}</p>}
                <button onClick={updatePassword} disabled={pwBusy} className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors">
                  {pwBusy ? 'Updating…' : 'Update Password'}
                </button>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-200">
                <h4 className="text-sm font-semibold text-slate-800 mb-3">Two-Factor Authentication</h4>
                <p className="text-xs text-slate-500 mb-3">Add an extra layer of security to your account.</p>
                <button onClick={() => showToast('2FA setup coming soon')} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors">
                  Enable 2FA
                </button>
              </div>
            </div>
          )}

          {activeSection === 'appearance' && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">Appearance</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-2">Theme</label>
                  <div className="flex gap-3">
                    {['Light', 'Dark', 'System'].map(t => (
                      <button key={t} onClick={() => setTheme(t)} className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        theme === t ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-2">Sidebar Default</label>
                  <div className="flex gap-3">
                    {['Expanded', 'Collapsed'].map(opt => (
                      <button key={opt} onClick={() => setSidebarDefault(opt)} className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        sidebarDefault === opt ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}>
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex justify-end mt-4">
                <button onClick={saveAppearance} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
                  <Save size={16} /> Save Changes
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Success toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[200] flex items-center gap-2 px-4 py-3 bg-slate-900 text-white rounded-xl shadow-2xl animate-[slideIn_0.2s_ease-out]">
          <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center"><Check size={13} /></span>
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}
    </div>
  );
}
