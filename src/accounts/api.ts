/** Browser client for the account server (same origin, under /api). */
import type { Settings } from '../profiles/profiles.ts';
import type { AccountListEntry, AccountSummary } from './rules.ts';

export type ServerProfile = { settings: Settings; best: number; updatedAt: string | null };
export type SignedIn = { account: AccountSummary; profile: ServerProfile };

const REQUEST_TIMEOUT_MS = 8000;
export const UNREACHABLE =
  'The account server can’t be reached. Local profiles and guest play still work.';

/** `status` 0 means the server could not be reached at all. */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const isUnreachable = (error: unknown) => error instanceof ApiError && error.status === 0;

async function request<T>(method: string, path: string, body?: unknown, keepalive = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch('/api' + path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      keepalive,
    });
  } catch {
    throw new ApiError(0, UNREACHABLE);
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 204) return undefined as T;
  const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
  // A static host or a stopped server answers without the API's JSON: treat as unreachable.
  if (!isJson) throw new ApiError(0, UNREACHABLE);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Something went wrong. Try again.');
  return data as T;
}

export const accountApi = {
  me: () => request<SignedIn>('GET', '/auth/me'),
  signUp: (username: string, password: string) =>
    request<SignedIn & { recoveryCode: string }>('POST', '/auth/signup', { username, password }),
  signIn: (username: string, password: string) =>
    request<SignedIn>('POST', '/auth/login', { username, password }),
  signOut: () => request<void>('POST', '/auth/logout', {}),
  recover: (username: string, recoveryCode: string, newPassword: string) =>
    request<SignedIn & { recoveryCode: string }>('POST', '/auth/recover', {
      username,
      recoveryCode,
      newPassword,
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>('POST', '/auth/password', { currentPassword, newPassword }),
  newRecoveryCode: (currentPassword: string) =>
    request<{ recoveryCode: string }>('POST', '/auth/recovery-code', { currentPassword }),
  saveProfile: (settings: Settings, best: number, keepalive = false) =>
    request<{ profile: ServerProfile }>('PUT', '/profile', { settings, best }, keepalive),
  listAccounts: () => request<{ accounts: AccountListEntry[] }>('GET', '/admin/accounts'),
  setDisabled: (id: string, disabled: boolean) =>
    request<{ accounts: AccountListEntry[] }>(
      'POST',
      `/admin/accounts/${encodeURIComponent(id)}/${disabled ? 'disable' : 'enable'}`,
      {},
    ),
  issueRecoveryCode: (id: string) =>
    request<{ recoveryCode: string }>(
      'POST',
      `/admin/accounts/${encodeURIComponent(id)}/recovery-code`,
      {},
    ),
};
