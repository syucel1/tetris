/**
 * The account API. Every route is under /api; the session lives in an HttpOnly, SameSite=Strict
 * cookie, and state-changing requests must be same-origin JSON.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  normalizeRecoveryCode,
  passwordProblem,
  usernameKey,
  usernameProblem,
  type AccountSummary,
} from '../../src/accounts/rules.ts';
import { MAX_NAME_LENGTH, freshSettings, normalizeSettings } from '../../src/profiles/profiles.ts';
import type { Config } from './config.ts';
import { log } from './log.ts';
import { RateLimiter } from './rateLimit.ts';
import {
  dummySecretHash,
  hashSecret,
  newRecoveryCode,
  newSessionToken,
  sessionTokenHash,
  verifySecret,
} from './secrets.ts';
import { summary, type AccountRecord, type Store, type StoredProfile } from './store.ts';

export const SESSION_COOKIE = 'tetris_session';
const MAX_BODY_BYTES = 16 * 1024;
const MAX_BEST = Number.MAX_SAFE_INTEGER;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FAILED_SIGN_IN = 'Incorrect username or password.';
const FAILED_RECOVERY = 'That username and recovery code do not match.';
const DISABLED = 'This account is disabled. Ask an administrator for help.';

export class HttpError extends Error {
  readonly status: number;
  readonly retryAfter?: number;
  constructor(status: number, message: string, retryAfter?: number) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

type Body = Record<string, unknown>;
type Context = {
  req: IncomingMessage;
  res: ServerResponse;
  body: Body;
  params: string[];
  ip: string;
  token: string;
};
type Handler = (ctx: Context) => Promise<unknown>;
type Route = { method: string; pattern: RegExp; handler: Handler };

export type AppOptions = {
  /** Failed sign-in, recovery or password checks allowed per username in each window. */
  attemptLimit?: number;
  attemptWindowMs?: number;
  /** Failures allowed per address in each window (default: three times `attemptLimit`). */
  addressLimit?: number;
  /** Accounts that one address may create in each window. */
  signupLimit?: number;
};

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0) cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return cookies;
}

async function readJson(req: IncomingMessage): Promise<Body> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request is too large.');
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch {
    // Fall through.
  }
  throw new HttpError(400, 'Request body must be a JSON object.');
}

/** Blocks cross-site form posts: writes must be JSON from the same origin. */
function checkWriteRequest(req: IncomingMessage) {
  const type = req.headers['content-type'] ?? '';
  if (!type.toLowerCase().startsWith('application/json'))
    throw new HttpError(415, 'Send JSON with Content-Type: application/json.');
  const origin = req.headers.origin;
  if (origin) {
    let host = '';
    try {
      host = new URL(origin).host;
    } catch {
      // Invalid origins are rejected below.
    }
    if (host !== req.headers.host) throw new HttpError(403, 'Cross-site requests are not allowed.');
  }
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');

function requireValid(problem: string | null) {
  if (problem) throw new HttpError(400, problem);
}

export function createApp(store: Store, config: Config, options: AppOptions = {}) {
  const limit = options.attemptLimit ?? 10;
  const windowMs = options.attemptWindowMs ?? 15 * 60 * 1000;
  // Failures are counted per username, and per address so one machine can't sweep many names.
  const failuresByUsername = new RateLimiter(limit, windowMs);
  const failuresByAddress = new RateLimiter(options.addressLimit ?? limit * 3, windowMs);
  const signups = new RateLimiter(options.signupLimit ?? 20, 60 * 60 * 1000);
  const routes: Route[] = [];
  const route = (method: string, path: string, handler: Handler) =>
    routes.push({ method, pattern: new RegExp(`^${path.replace(/:id/g, '([^/]+)')}$`), handler });

  // ── Helpers ────────────────────────────────────────────────────────────────
  function tooMany(wait: number) {
    return new HttpError(429, `Too many attempts. Try again in ${Math.ceil(wait / 60)} min.`, wait);
  }

  /** Refuses while this address or username is cooling down after repeated failures. */
  function throttle(ctx: Context, username: string) {
    const wait = Math.max(
      failuresByAddress.retryAfter(ctx.ip),
      username ? failuresByUsername.retryAfter(usernameKey(username)) : 0,
    );
    if (wait) throw tooMany(wait);
  }

  function recordFailure(ctx: Context, username: string) {
    failuresByAddress.record(ctx.ip);
    if (username) failuresByUsername.record(usernameKey(username));
  }

  function recordSuccess(username: string) {
    failuresByUsername.reset(usernameKey(username));
  }

  function setSessionCookie(res: ServerResponse, token: string, maxAgeSeconds: number) {
    const parts = [
      `${SESSION_COOKIE}=${token}`,
      'Path=/api',
      'HttpOnly',
      'SameSite=Strict',
      `Max-Age=${maxAgeSeconds}`,
    ];
    if (config.cookieSecure) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
  }

  async function startSession(ctx: Context, account: AccountRecord) {
    const token = newSessionToken();
    const days = config.sessionDays;
    await store.createSession(
      sessionTokenHash(token),
      account.id,
      new Date(Date.now() + days * 86_400_000),
    );
    setSessionCookie(ctx.res, token, Math.round(days * 86_400));
    ctx.token = token;
  }

  async function currentAccount(ctx: Context): Promise<AccountRecord> {
    const account = ctx.token ? await store.findSessionAccount(sessionTokenHash(ctx.token)) : null;
    if (!account) throw new HttpError(401, 'Sign in to continue.');
    return account;
  }

  async function currentAdmin(ctx: Context): Promise<AccountRecord> {
    const account = await currentAccount(ctx);
    if (account.role !== 'admin') throw new HttpError(403, 'Administrators only.');
    return account;
  }

  /** Stored settings are re-normalized on the way out, so older data stays valid. */
  function profileFor(account: AccountSummary, stored: StoredProfile | null) {
    const settings = normalizeSettings(stored?.settings ?? freshSettings(account.username));
    if (!settings.name.trim()) settings.name = account.username.slice(0, MAX_NAME_LENGTH);
    return { settings, best: stored?.best ?? 0, updatedAt: stored?.updatedAt ?? null };
  }

  async function signedInResponse(account: AccountRecord) {
    return {
      account: summary(account),
      profile: profileFor(account, await store.getProfile(account.id)),
    };
  }

  // ── Authentication ─────────────────────────────────────────────────────────
  route('POST', '/api/auth/signup', async (ctx) => {
    const username = text(ctx.body.username).trim();
    const password = text(ctx.body.password);
    const wait = signups.retryAfter(ctx.ip);
    if (wait) throw tooMany(wait);
    signups.record(ctx.ip);
    requireValid(usernameProblem(username));
    requireValid(passwordProblem(password, username));
    const recoveryCode = newRecoveryCode();
    const account = await store.createAccount(
      username,
      usernameKey(username),
      await hashSecret(password),
      await hashSecret(normalizeRecoveryCode(recoveryCode)),
      freshSettings(username.slice(0, MAX_NAME_LENGTH)),
    );
    if (!account) throw new HttpError(409, 'That username is already taken.');
    await startSession(ctx, account);
    log('INFO', 'account_created', { accountId: account.id });
    ctx.res.statusCode = 201;
    return { ...(await signedInResponse(account)), recoveryCode };
  });

  route('POST', '/api/auth/login', async (ctx) => {
    const username = text(ctx.body.username);
    const password = text(ctx.body.password);
    throttle(ctx, username);
    if (!username || !password) throw new HttpError(400, 'Enter your username and password.');
    const account = await store.findAccountByUsername(usernameKey(username));
    const valid = await verifySecret(password, account?.passwordHash ?? (await dummySecretHash()));
    if (!account || !valid) {
      recordFailure(ctx, username);
      log('WARN', 'sign_in_failed', { reason: account ? 'password' : 'username' });
      throw new HttpError(401, FAILED_SIGN_IN);
    }
    if (account.disabled) throw new HttpError(403, DISABLED);
    recordSuccess(username);
    await store.recordLogin(account.id);
    await startSession(ctx, account);
    log('INFO', 'signed_in', { accountId: account.id });
    return signedInResponse(account);
  });

  route('POST', '/api/auth/logout', async (ctx) => {
    if (ctx.token) await store.deleteSession(sessionTokenHash(ctx.token));
    setSessionCookie(ctx.res, '', 0);
    ctx.res.statusCode = 204;
  });

  route('GET', '/api/auth/me', async (ctx) => signedInResponse(await currentAccount(ctx)));

  /** Forgotten password: the recovery code proves ownership. Both the password and code change. */
  route('POST', '/api/auth/recover', async (ctx) => {
    const username = text(ctx.body.username);
    const code = normalizeRecoveryCode(ctx.body.recoveryCode);
    const newPassword = text(ctx.body.newPassword);
    throttle(ctx, username);
    if (!username || !code) throw new HttpError(400, 'Enter your username and recovery code.');
    const account = await store.findAccountByUsername(usernameKey(username));
    const valid = await verifySecret(code, account?.recoveryHash ?? (await dummySecretHash()));
    if (!account || !valid) {
      recordFailure(ctx, username);
      log('WARN', 'recovery_failed', {});
      throw new HttpError(401, FAILED_RECOVERY);
    }
    if (account.disabled) throw new HttpError(403, DISABLED);
    requireValid(passwordProblem(newPassword, account.username));
    const recoveryCode = newRecoveryCode();
    await store.setPasswordHash(account.id, await hashSecret(newPassword));
    await store.setRecoveryHash(account.id, await hashSecret(normalizeRecoveryCode(recoveryCode)));
    await store.deleteSessions(account.id);
    recordSuccess(username);
    await store.recordLogin(account.id);
    await startSession(ctx, account);
    log('INFO', 'account_recovered', { accountId: account.id });
    return { ...(await signedInResponse(account)), recoveryCode };
  });

  /** Changing the password signs out every other device. */
  route('POST', '/api/auth/password', async (ctx) => {
    const account = await currentAccount(ctx);
    throttle(ctx, account.username);
    const valid = await verifySecret(text(ctx.body.currentPassword), account.passwordHash);
    if (!valid) {
      recordFailure(ctx, account.username);
      throw new HttpError(401, 'Your current password is incorrect.');
    }
    const newPassword = text(ctx.body.newPassword);
    requireValid(passwordProblem(newPassword, account.username));
    await store.setPasswordHash(account.id, await hashSecret(newPassword));
    await store.deleteSessions(account.id, sessionTokenHash(ctx.token));
    log('INFO', 'password_changed', { accountId: account.id });
    ctx.res.statusCode = 204;
  });

  /** A fresh recovery code for the signed-in player; the previous one stops working. */
  route('POST', '/api/auth/recovery-code', async (ctx) => {
    const account = await currentAccount(ctx);
    throttle(ctx, account.username);
    const valid = await verifySecret(text(ctx.body.currentPassword), account.passwordHash);
    if (!valid) {
      recordFailure(ctx, account.username);
      throw new HttpError(401, 'Your current password is incorrect.');
    }
    const recoveryCode = newRecoveryCode();
    await store.setRecoveryHash(account.id, await hashSecret(normalizeRecoveryCode(recoveryCode)));
    return { recoveryCode };
  });

  // ── Profile ────────────────────────────────────────────────────────────────
  route('GET', '/api/profile', async (ctx) => {
    const account = await currentAccount(ctx);
    return { profile: profileFor(account, await store.getProfile(account.id)) };
  });

  route('PUT', '/api/profile', async (ctx) => {
    const account = await currentAccount(ctx);
    const best = ctx.body.best;
    if (!Number.isSafeInteger(best) || (best as number) < 0 || (best as number) > MAX_BEST)
      throw new HttpError(400, 'Best score must be a whole number of zero or more.');
    if (!ctx.body.settings || typeof ctx.body.settings !== 'object')
      throw new HttpError(400, 'Settings are missing.');
    const settings = normalizeSettings(ctx.body.settings as never);
    if (!settings.name.trim()) settings.name = account.username.slice(0, MAX_NAME_LENGTH);
    const saved = await store.saveProfile(account.id, settings, best as number);
    return { profile: profileFor(account, saved) };
  });

  // ── Administration ─────────────────────────────────────────────────────────
  route('GET', '/api/admin/accounts', async (ctx) => {
    await currentAdmin(ctx);
    return { accounts: await store.listAccounts() };
  });

  async function adminTarget(ctx: Context) {
    const admin = await currentAdmin(ctx);
    const id = ctx.params[0];
    if (!UUID.test(id)) throw new HttpError(404, 'Account not found.');
    const target = await store.findAccountById(id);
    if (!target) throw new HttpError(404, 'Account not found.');
    return { admin, target };
  }

  route('POST', '/api/admin/accounts/:id/disable', async (ctx) => {
    const { admin, target } = await adminTarget(ctx);
    if (target.id === admin.id) throw new HttpError(400, 'You cannot disable your own account.');
    await store.setDisabled(target.id, true);
    log('INFO', 'account_disabled', { accountId: target.id, by: admin.id });
    return { accounts: await store.listAccounts() };
  });

  route('POST', '/api/admin/accounts/:id/enable', async (ctx) => {
    const { admin, target } = await adminTarget(ctx);
    await store.setDisabled(target.id, false);
    log('INFO', 'account_enabled', { accountId: target.id, by: admin.id });
    return { accounts: await store.listAccounts() };
  });

  /** Account support: a new recovery code to hand to a player who lost theirs. */
  route('POST', '/api/admin/accounts/:id/recovery-code', async (ctx) => {
    const { admin, target } = await adminTarget(ctx);
    const recoveryCode = newRecoveryCode();
    await store.setRecoveryHash(target.id, await hashSecret(normalizeRecoveryCode(recoveryCode)));
    log('INFO', 'recovery_code_issued', { accountId: target.id, by: admin.id });
    return { recoveryCode };
  });

  route('GET', '/api/health', async () => {
    await store.ping();
    return { ok: true };
  });

  // ── Dispatch ───────────────────────────────────────────────────────────────
  return async function handle(req: IncomingMessage, res: ServerResponse) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const path = (req.url ?? '/').split('?')[0];
    const forwarded = String(req.headers['x-forwarded-for'] ?? '')
      .split(',')[0]
      .trim();
    const ctx: Context = {
      req,
      res,
      body: {},
      params: [],
      ip: (config.trustProxy && forwarded) || req.socket.remoteAddress || 'unknown',
      token: parseCookies(req.headers.cookie)[SESSION_COOKIE] ?? '',
    };
    try {
      const matching = routes.filter((r) => r.pattern.test(path));
      if (!matching.length) throw new HttpError(404, 'Not found.');
      const found = matching.find((r) => r.method === req.method);
      if (!found) {
        res.setHeader('Allow', matching.map((r) => r.method).join(', '));
        throw new HttpError(405, 'Method not allowed.');
      }
      ctx.params = (found.pattern.exec(path) ?? []).slice(1).map(decodeURIComponent);
      if (req.method !== 'GET') {
        checkWriteRequest(req);
        ctx.body = await readJson(req);
      }
      const result = await found.handler(ctx);
      if (res.statusCode === 204 || result === undefined) {
        if (res.statusCode === 200) res.statusCode = 204;
        res.end();
        return;
      }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(result));
    } catch (error) {
      const known = error instanceof HttpError;
      if (!known)
        log('ERROR', 'request_failed', {
          path,
          error: error instanceof Error ? error.message : String(error),
        });
      res.statusCode = known ? error.status : 500;
      if (known && error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({ error: known ? error.message : 'Something went wrong. Try again.' }),
      );
    }
  };
}
