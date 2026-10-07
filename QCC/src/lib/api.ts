// Typed API client for the QCC backend (FastAPI).
//
// The base URL comes from VITE_API_URL (see .env), defaulting to the local
// backend. Every call attaches the persisted Bearer token automatically and
// surfaces backend error messages via ApiError.
import type {
  User, Team, QCCProject, QCCStep, ActionItem, ApprovalRequest,
  Department, SubDepartment, QCCCycleConfig, DashboardStats, MeetingMinute,
} from '../types';

// Default to 127.0.0.1 (not "localhost") so the browser hits the IPv4 address the
// backend binds to — avoids IPv6 (::1) resolution flakiness on Windows. Override
// with VITE_API_URL in a .env file for other hosts.
export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || 'http://127.0.0.1:8000';

const TOKEN_KEY = 'qcc_token';
const USER_KEY = 'qcc_user';

// ---------- session persistence ----------
export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);

export const getStoredUser = (): User | null => {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as User; } catch { return null; }
};

export const setSession = (token: string, user: User): void => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const clearSession = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

// ---------- session-revoked hook ----------
// The backend rejects a token as soon as the account's password changes. AuthProvider
// registers here so that 401 clears the React auth state too — otherwise the app would
// keep showing the signed-in UI until the next full page load.
let onUnauthorized: ((reason: string) => void) | null = null;
export const setUnauthorizedHandler = (fn: ((reason: string) => void) | null): void => {
  onUnauthorized = fn;
};

// ---------- core request helper ----------
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean; // attach Bearer token (default true)
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = opts;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, `Cannot reach the API at ${API_BASE}. Is the backend running?`);
  }

  if (res.status === 401) {
    // Token expired, invalid, or revoked by a password change — drop the stale session
    // and tell the app so it returns to the login screen right away.
    clearSession();
    let reason = 'Your session has ended. Please sign in again.';
    try {
      const data = await res.clone().json();
      if (typeof data?.detail === 'string') reason = data.detail;
    } catch { /* non-JSON error body */ }
    onUnauthorized?.(reason);
  }

  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.detail) detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
    } catch { /* non-JSON error body */ }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---------- auth ----------
export interface LoginResponse {
  accessToken: string;
  tokenType: string;
  user: User;
}

export const api = {
  health: () => request<{ status: string; service: string }>('/api/health', { auth: false }),

  login: (email: string, password: string) =>
    request<LoginResponse>('/api/auth/login', { method: 'POST', body: { email, password }, auth: false }),

  me: () => request<User>('/api/auth/me'),

  // --- forgot password (3 steps: email a code -> verify it -> set a new password) ---
  // Step 1 answers the same way whether or not the address is registered, so the UI
  // must not treat a success as proof that an account exists.
  forgotPassword: (email: string) =>
    request<{ ok: boolean; message: string; emailConfigured: boolean }>(
      '/api/auth/forgot-password', { method: 'POST', body: { email }, auth: false }),

  verifyResetCode: (email: string, code: string) =>
    request<{ ok: boolean; resetToken: string }>(
      '/api/auth/verify-reset-code', { method: 'POST', body: { email, code }, auth: false }),

  // On success the user is signed straight in with the new password.
  resetPassword: (resetToken: string, newPassword: string) =>
    request<LoginResponse>('/api/auth/reset-password', { method: 'POST', body: { resetToken, newPassword }, auth: false }),

  // Returns a fresh token: changing the password revokes every token issued under the
  // old one, so this device has to swap in the new token to stay signed in.
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean; accessToken: string }>('/api/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }),

  // users
  listUsers: () => request<User[]>('/api/users'),
  createUser: (body: { name: string; email: string; role: string; department: string; password?: string }) =>
    request<User>('/api/users', { method: 'POST', body }),

  // teams
  listTeams: () => request<Team[]>('/api/teams'),
  getTeam: (id: string) => request<Team>(`/api/teams/${id}`),
  createTeam: (body: Partial<Team>) => request<Team>('/api/teams', { method: 'POST', body }),
  updateTeam: (id: string, body: Partial<Team>) =>
    request<{ applied: boolean; team?: Team; changeRequestId?: string; message?: string }>(
      `/api/teams/${id}`, { method: 'PATCH', body }),
  decideChangeRequest: (id: string, status: 'approved' | 'rejected', comments?: string) =>
    request<{ ok: boolean; status: string }>(
      `/api/teams/change-requests/${id}/decision`, { method: 'POST', body: { status, comments } }),

  // projects / workflow
  listProjects: () => request<QCCProject[]>('/api/projects'),
  getProject: (id: string) => request<QCCProject>(`/api/projects/${id}`),
  listSteps: (projectId: string) => request<QCCStep[]>(`/api/projects/${projectId}/steps`),
  updateStep: (projectId: string, stepNumber: number, body: Partial<QCCStep>) =>
    request<QCCStep>(`/api/projects/${projectId}/steps/${stepNumber}`, { method: 'PATCH', body }),

  // actions
  listActions: () => request<ActionItem[]>('/api/actions'),
  createAction: (body: { projectId: string; title: string; assigneeId?: string; dueDate?: string; status?: string; priority?: string }) =>
    request<ActionItem>('/api/actions', { method: 'POST', body }),
  updateAction: (id: string, body: Partial<ActionItem>) =>
    request<ActionItem>(`/api/actions/${id}`, { method: 'PATCH', body }),
  deleteAction: (id: string) => request<{ ok: boolean }>(`/api/actions/${id}`, { method: 'DELETE' }),

  // approvals
  listApprovals: () => request<ApprovalRequest[]>('/api/approvals'),
  decideApproval: (id: string, status: 'approved' | 'rejected' | 'rework', comments?: string) =>
    request<ApprovalRequest>(`/api/approvals/${id}/decision`, { method: 'POST', body: { status, comments } }),

  // meta
  listDepartments: () => request<Department[]>('/api/departments'),
  listSubDepartments: () => request<SubDepartment[]>('/api/sub-departments'),
  listCycles: () => request<QCCCycleConfig[]>('/api/cycles'),
  createCycle: (body: { id?: string; name: string; startDate: string; endDate?: string; maxTeams?: number }) =>
    request<QCCCycleConfig>('/api/cycles', { method: 'POST', body }),
  updateCycle: (id: string, body: { isActive?: boolean; name?: string }) =>
    request<QCCCycleConfig>(`/api/cycles/${id}`, { method: 'PATCH', body }),
  deleteCycle: (id: string) => request<{ ok: boolean }>(`/api/cycles/${id}`, { method: 'DELETE' }),

  // dashboard
  dashboardStats: () => request<DashboardStats>('/api/dashboard/stats'),
  listMeetings: () => request<MeetingMinute[]>('/api/meetings'),
};
