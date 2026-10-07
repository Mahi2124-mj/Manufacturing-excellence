import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import ForgotPassword from '../components/ForgotPassword';

// Quick demo logins — one representative account per role, for demos only.
// These seeded demo accounts share the password `demo123`.
// NOTE: the Admin account is intentionally NOT here — it is a real account whose
// password is managed in Settings (changing it there persists and the old one
// stops working). Hard-coding demo123 for admin would be a backdoor. Admin signs
// in via the form above with its real password.
const DEMO_ACCOUNTS = [
  { label: 'Dept Head', name: 'Vikram Singh', email: 'vikram@qcc.com' },
  { label: 'Facilitator', name: 'Amit Patel', email: 'amit@qcc.com' },
  { label: 'Coordinator', name: 'Sneha Reddy', email: 'sneha@qcc.com' },
  { label: 'Leader', name: 'Priya Sharma', email: 'priya@qcc.com' },
  { label: 'Member', name: 'Anita Desai', email: 'anita@qcc.com' },
];

export default function Login() {
  const { login, error: authError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await login(email, password);
    setLoading(false);
  };

  const quickLogin = async (acct: (typeof DEMO_ACCOUNTS)[number]) => {
    setEmail(acct.email);
    setPassword('demo123');
    setLoading(true);
    await login(acct.email, 'demo123');
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }} />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white shadow-lg shadow-blue-600/30 mb-4 overflow-hidden">
            <img
              src="/logo.png"
              alt="Toyota Boshoku"
              className="w-full h-full object-contain p-1.5"
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
          </div>
          <h1 className="text-2xl font-bold text-white">QCC Monitor</h1>
          <p className="text-sm text-blue-200 mt-1">Quality Circle Activity Monitoring Portal</p>
        </div>

        {/* Login card, or the password-recovery flow in its place */}
        {forgotMode ? (
          <ForgotPassword onBack={() => setForgotMode(false)} />
        ) : (
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-bold text-slate-800 mb-1">Welcome back</h2>
          <p className="text-sm text-slate-500 mb-6">Sign in to your account to continue</p>

          {authError && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg mb-4">
              <AlertCircle size={16} className="text-red-500" />
              <p className="text-sm text-red-700">{authError}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Username or Email</label>
              <input
                type="text"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="e.g. admin or leader"
                autoComplete="username"
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                required
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-slate-700">Password</label>
                <button
                  type="button"
                  onClick={() => setForgotMode(true)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <><Loader2 size={16} className="animate-spin" /> Signing in...</> : 'Sign In'}
            </button>
          </form>

          {/* Quick demo login */}
          <div className="mt-6">
            <div className="relative flex items-center">
              <div className="flex-1 border-t border-slate-200" />
              <span className="px-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Quick demo login</span>
              <div className="flex-1 border-t border-slate-200" />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {DEMO_ACCOUNTS.map(acct => (
                <button
                  key={acct.email}
                  type="button"
                  onClick={() => quickLogin(acct)}
                  disabled={loading}
                  className="text-left px-3 py-2 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50 disabled:opacity-60 transition-colors"
                >
                  <span className="block text-sm font-semibold text-slate-700">{acct.label}</span>
                  <span className="block text-xs text-slate-400 truncate">{acct.name}</span>
                </button>
              ))}
            </div>
            <p className="text-center text-xs text-slate-400 mt-3">
              Demo accounts use <span className="font-mono font-medium text-slate-500">demo123</span>. Admin signs in above with its own password.
            </p>
          </div>
        </div>
        )}

        <p className="text-center text-xs text-blue-300 mt-6">
          © 2024 QCC Monitor • Quality Circle Activity Portal
        </p>
      </div>
    </div>
  );
}
