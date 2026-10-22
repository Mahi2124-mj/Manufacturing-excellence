// Typed API client for the QCC backend (FastAPI).
//
// The base URL comes from VITE_API_URL (see .env), defaulting to the local
// backend. Every call attaches the persisted Bearer token automatically and
// surfaces backend error messages via ApiError.
import type {
  User, Team, QCCProject, QCCStep, ActionItem, ApprovalRequest,
  Department, SubDepartment, QCCCycleConfig, DashboardStats, MeetingMinute, TeamChangeRequest,
} from '../types';

// The backend runs on port 8000 of the same machine that serves this page, so build its
// address from the page's own host: a PC on the network that opened
// http://192.168.x.x:6001 talks to http://192.168.x.x:8000. On the server itself
// "localhost" becomes 127.0.0.1 — the IPv4 address the backend binds — to avoid IPv6
// (::1) resolution flakiness on Windows. VITE_API_URL in a .env file overrides this.
const pageHost = typeof window !== 'undefined' ? window.location.hostname : '';
export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
  || `http://${!pageHost || pageHost === 'localhost' ? '127.0.0.1' : pageHost}:8000`;

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
  form?: FormData;   // multipart upload (sent as-is, no JSON content type)
  blob?: boolean;    // return the response body as a Blob (file download)
  auth?: boolean; // attach Bearer token (default true)
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, form, blob, auth = true } = opts;
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
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
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
  if (blob) return (await res.blob()) as T;
  return (await res.json()) as T;
}

// ---------- shared documents ----------
// Content that used to live only in one browser's localStorage (step sheets, meeting
// minutes, evaluation, assessment, admin config), now stored on the server.
export interface SharedDoc<T = unknown> {
  key: string;
  data: T | null;
  version: number;         // 0 = nothing saved yet
  updatedAt?: string;
  updatedByName?: string;
  canEdit: boolean;
}

export interface StoredFileMeta {
  id: string;
  scope: string;
  fileName: string;
  contentType?: string;
  size: number;
  uploadedByName?: string;
  uploadedAt?: string;
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
  // admin only: create a login, change role / activation, reset someone's password
  createUser: (body: { name: string; email: string; role: string; department: string; password: string }) =>
    request<User>('/api/users', { method: 'POST', body }),
  updateUser: (id: string, body: { role?: string; isActive?: boolean }) =>
    request<User>(`/api/users/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  resetUserPassword: (id: string, newPassword: string) =>
    request<{ ok: boolean }>(`/api/users/${encodeURIComponent(id)}/password`, { method: 'POST', body: { newPassword } }),

  // teams
  listTeams: () => request<Team[]>('/api/teams'),
  getTeam: (id: string) => request<Team>(`/api/teams/${id}`),
  createTeam: (body: Partial<Team>) => request<Team>('/api/teams', { method: 'POST', body }),
  // Admin edits apply at once; anyone else's edit comes back as a pending change request.
  updateTeam: (id: string, body: Partial<Team> & { changeReason?: string }) =>
    request<{ applied: boolean; team?: Team; changeRequestId?: string; message?: string }>(
      `/api/teams/${id}`, { method: 'PATCH', body }),
  // Admin: every request; anyone else: the requests they raised.
  listChangeRequests: (status?: 'pending' | 'approved' | 'rejected') =>
    request<TeamChangeRequest[]>(`/api/teams/change-requests${status ? `?status=${status}` : ''}`),
  decideChangeRequest: (id: string, status: 'approved' | 'rejected', comments?: string) =>
    request<TeamChangeRequest>(
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

  // shared documents (see lib/sharedStore.ts) — a save names the version it started from
  getDocs: (keys: string[]) => request<SharedDoc[]>(`/api/docs?keys=${encodeURIComponent(keys.join(','))}`),
  getDocsByKind: (kind: string) => request<SharedDoc[]>(`/api/docs/kind/${encodeURIComponent(kind)}`),
  saveDoc: (key: string, data: unknown, baseVersion: number) =>
    request<SharedDoc>('/api/docs', { method: 'PUT', body: { key, data, baseVersion } }),

  // step document files
  uploadFile: (scope: string, file: File) => {
    const form = new FormData();
    form.append('scope', scope);
    form.append('file', file);
    return request<StoredFileMeta>('/api/files', { method: 'POST', form });
  },
  downloadFile: (id: string) => request<Blob>(`/api/files/${encodeURIComponent(id)}`, { blob: true }),
  deleteFile: (id: string) => request<{ ok: boolean }>(`/api/files/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
