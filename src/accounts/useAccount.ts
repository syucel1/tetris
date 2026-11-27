import { useEffect, useRef, useState } from 'react';
import { logEvent } from '../logging/logging.ts';
import { normalizeSettings, type Profile } from '../profiles/profiles.ts';
import { ApiError, accountApi, isUnreachable, type SignedIn } from './api.ts';
import { accountProfileId, type AccountSummary } from './rules.ts';

/** Changes are sent shortly after the last edit; failed saves are retried. */
const SAVE_DELAY_MS = 800;
const RETRY_DELAY_MS = 15_000;

export type AccountStatus = 'checking' | 'unavailable' | 'signedOut' | 'signedIn';
export type SaveState = 'saved' | 'saving' | 'retrying';

export type Account = ReturnType<typeof useAccount>;

const toProfile = ({ account, profile }: SignedIn): Profile => ({
  id: accountProfileId(account.id),
  settings: normalizeSettings(profile.settings),
  best: profile.best,
});

/**
 * The signed-in account and its game profile. The profile lives only in memory (never in
 * localStorage) and every change is saved to the account server.
 */
export function useAccount() {
  const [status, setStatus] = useState<AccountStatus>('checking');
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  /** A message for the account page, e.g. after a session ended elsewhere. */
  const [notice, setNotice] = useState('');
  /** A just-issued recovery code, shown once until dismissed. Kept only in memory. */
  const [recoveryCode, setRecoveryCode] = useState('');

  const pending = useRef<Profile | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);

  function applySignedIn(data: SignedIn) {
    setAccount(data.account);
    setProfile(toProfile(data));
    setSaveState('saved');
    setNotice('');
    setStatus('signedIn');
  }

  function clearLocal() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
    setAccount(null);
    setProfile(null);
    setSaveState('saved');
    setRecoveryCode('');
  }

  async function check() {
    setStatus('checking');
    try {
      applySignedIn(await accountApi.me());
    } catch (error) {
      setStatus(isUnreachable(error) ? 'unavailable' : 'signedOut');
    }
  }

  useEffect(() => {
    check();
  }, []);

  // ── Saving ─────────────────────────────────────────────────────────────────
  async function flush() {
    timer.current = null;
    const next = pending.current;
    if (!next || saving.current) return;
    saving.current = true;
    pending.current = null;
    setSaveState('saving');
    try {
      const { profile: saved } = await accountApi.saveProfile(next.settings, next.best);
      // The server keeps the higher best score (e.g. one set on another machine).
      setProfile((p) => (p && p.id === next.id ? { ...p, best: Math.max(p.best, saved.best) } : p));
      if (!pending.current) setSaveState('saved');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearLocal();
        setStatus('signedOut');
        setNotice('Your session ended, so recent changes were not saved. Sign in again.');
        logEvent('WARN', 'account_session_ended');
      } else {
        pending.current ??= next;
        setSaveState('retrying');
        timer.current ??= setTimeout(flush, RETRY_DELAY_MS);
      }
    } finally {
      saving.current = false;
      if (pending.current && !timer.current) timer.current = setTimeout(flush, SAVE_DELAY_MS);
    }
  }

  /** Updates the account's profile in memory and saves it soon. */
  function updateProfile(next: Profile) {
    setProfile(next);
    pending.current = next;
    setSaveState((s) => (s === 'retrying' ? s : 'saving'));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  }

  // Leaving the page sends any unsaved change in the background.
  const latestPending = useRef(pending);
  latestPending.current = pending;
  useEffect(() => {
    const send = () => {
      const next = latestPending.current.current;
      if (next) accountApi.saveProfile(next.settings, next.best, true).catch(() => {});
    };
    window.addEventListener('pagehide', send);
    return () => window.removeEventListener('pagehide', send);
  }, []);

  // ── Sign-in flows (errors propagate to the form that called them) ───────────
  async function signIn(username: string, password: string) {
    applySignedIn(await accountApi.signIn(username, password));
    logEvent('INFO', 'account_signed_in');
  }

  /** Returns the recovery code to show once. */
  async function signUp(username: string, password: string) {
    const data = await accountApi.signUp(username, password);
    applySignedIn(data);
    logEvent('INFO', 'account_created');
    return data.recoveryCode;
  }

  /** Returns the replacement recovery code to show once. */
  async function recover(username: string, recoveryCode: string, newPassword: string) {
    const data = await accountApi.recover(username, recoveryCode, newPassword);
    applySignedIn(data);
    logEvent('INFO', 'account_recovered');
    return data.recoveryCode;
  }

  /**
   * Saves what is pending, ends the session and forgets the account in this browser. Local
   * data is cleared even if the server can't be reached, so the next person sees nothing.
   */
  async function signOut(): Promise<boolean> {
    if (timer.current) await flush().catch(() => {});
    let ended = true;
    try {
      await accountApi.signOut();
    } catch {
      ended = false;
    }
    clearLocal();
    setStatus('signedOut');
    setNotice(
      ended ? '' : 'Signed out here, but the server could not be reached to end the session.',
    );
    logEvent('INFO', 'account_signed_out');
    return ended;
  }

  return {
    status,
    account,
    profile,
    saveState,
    notice,
    recoveryCode,
    showRecoveryCode: setRecoveryCode,
    retry: check,
    signIn,
    signUp,
    recover,
    signOut,
    updateProfile,
    changePassword: accountApi.changePassword,
    newRecoveryCode: accountApi.newRecoveryCode,
  };
}
