import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { User, UserRole } from '../types';
import { api, ApiError, getToken, getStoredUser, setSession, clearSession, setUnauthorizedHandler } from './api';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (identifier: string, password: string) => Promise<boolean>;
  logout: () => void;
  /** Swap in a token minted by the server (e.g. after changing your own password). */
  refreshToken: (accessToken: string) => void;
  /** Start a session from a token+user the server already issued (password reset). */
  adoptSession: (accessToken: string, user: User) => void;
  token: string | null;
  loading: boolean;      // true while rehydrating a stored session on first load
  error: string | null;  // last login error message (for the UI)
}

const AuthContext = createContext<AuthContextType | null>(null);

// Convenience: let users sign in with a short username instead of the full email.
// The typed password is still verified by the backend.
const USERNAME_TO_EMAIL: Record<string, string> = {
  admin: 'admin@qcc.com',
  leader: 'priya@qcc.com',
};

// How often to re-check with the server that this session is still valid. A password
// change revokes tokens server-side; without this poll an idle tab would keep showing
// the signed-in UI until the user's next action.
const SESSION_CHECK_MS = 30_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => (getToken() ? getStoredUser() : null));
  const [token, setToken] = useState<string | null>(() => getToken());
  const [loading, setLoading] = useState<boolean>(!!getToken());
  const [error, setError] = useState<string | null>(null);

  // On first load, if we have a stored token, confirm it is still valid with the
  // backend (and refresh the user profile). Invalid/expired -> drop the session.
  useEffect(() => {
    let cancelled = false;
    if (!getToken()) { setLoading(false); return; }
    api.me()
      .then(fresh => {
        if (cancelled) return;
        setUser(fresh);
        setSession(getToken()!, fresh);
      })
      .catch(() => {
        if (cancelled) return;
        clearSession();
        setUser(null);
        setToken(null);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Any 401 from the API (expired token, or a session revoked because the password was
  // changed) signs the user out here and now, so the app redirects to /login.
  useEffect(() => {
    setUnauthorizedHandler(reason => {
      setUser(null);
      setToken(null);
      setError(reason);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  // Poll the server while signed in so a revoked session is noticed within ~30s even if
  // the tab sits idle. api.me() raising 401 triggers the handler above.
  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => { api.me().catch(() => { /* 401 handled above */ }); }, SESSION_CHECK_MS);
    return () => clearInterval(id);
  }, [user]);

  const login = useCallback(async (identifier: string, password: string): Promise<boolean> => {
    setError(null);
    const id = identifier.trim().toLowerCase();
    const email = USERNAME_TO_EMAIL[id] ?? id;
    try {
      const { accessToken, user: loggedIn } = await api.login(email, password);
      setSession(accessToken, loggedIn);
      setToken(accessToken);
      setUser(loggedIn);
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Login failed. Please try again.');
      return false;
    }
  }, []);

  // After changing your own password the server issues a replacement token; persist it
  // so this device stays signed in while every other device is signed out.
  const refreshToken = useCallback((accessToken: string) => {
    setToken(accessToken);
    setUser(current => {
      if (current) setSession(accessToken, current);
      return current;
    });
  }, []);

  // Completing a password reset returns a ready-made session — sign the user in with
  // it instead of making them type the password they just chose.
  const adoptSession = useCallback((accessToken: string, nextUser: User) => {
    setSession(accessToken, nextUser);
    setToken(accessToken);
    setUser(nextUser);
    setError(null);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
    setToken(null);
    setError(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout, refreshToken, adoptSession, token, loading, error }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrator',
  leader: 'Team Leader',
  facilitator: 'Facilitator',
  coordinator: 'Coordinator',
  dept_head: 'Dept. Head',
  member: 'Member',
};

export const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-red-100 text-red-700',
  leader: 'bg-blue-100 text-blue-700',
  facilitator: 'bg-purple-100 text-purple-700',
  coordinator: 'bg-amber-100 text-amber-700',
  dept_head: 'bg-emerald-100 text-emerald-700',
  member: 'bg-slate-100 text-slate-700',
};
