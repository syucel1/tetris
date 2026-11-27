import {
  useEffect,
  useState,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import {
  Copy,
  KeyRound,
  LogIn,
  LogOut,
  Play,
  RefreshCw,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { accountApi } from '../accounts/api.ts';
import {
  PASSWORD_MAX_LENGTH,
  USERNAME_MAX_LENGTH,
  passwordProblem,
  usernameProblem,
  type AccountListEntry,
} from '../accounts/rules.ts';
import type { Account } from '../accounts/useAccount.ts';

type Mode = 'signIn' | 'signUp' | 'recover';

const MODE_LABELS: Record<Mode, string> = {
  signIn: 'Sign in',
  signUp: 'Create account',
  recover: 'Forgot password',
};

const SAVE_LABELS = {
  saved: 'All changes saved to your account',
  saving: 'Saving…',
  retrying: 'Not saved yet: the server can’t be reached. Retrying…',
};

const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Try again.';

/** Runs a form action, tracking busy state and a user-facing error. */
function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}

function Field({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="account-field">
      <span>{label}</span>
      <input {...input} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

function FormError({ error }: { error: string }) {
  return error ? (
    <p className="account-error" role="alert">
      {error}
    </p>
  ) : null;
}

/** Shown once after sign-up or recovery. The code is the only way back in without help. */
function RecoveryCodePanel({ code, onDone }: { code: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <section className="account-card recovery-code-panel" aria-labelledby="recovery-code-title">
      <h3 id="recovery-code-title">
        <KeyRound size={16} /> Save your recovery code
      </h3>
      <p>
        If you forget your password, this code lets you set a new one. It is shown only now; store
        it somewhere safe, away from this computer. Each code works once, and you’ll get a new one
        when you use it.
      </p>
      <output className="recovery-code">{code}</output>
      <div className="account-actions">
        <button
          type="button"
          className="secondary"
          onClick={() =>
            navigator.clipboard?.writeText(code).then(
              () => setCopied(true),
              () => setCopied(false),
            )
          }
        >
          <Copy size={14} /> {copied ? 'Copied' : 'Copy code'}
        </button>
        <button type="button" className="primary" onClick={onDone}>
          I’ve saved it
        </button>
      </div>
    </section>
  );
}

function SignedOutForms({ account }: { account: Account }) {
  const [mode, setMode] = useState<Mode>('signIn');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const { busy, error, setError, run } = useAction();

  function switchMode(next: Mode) {
    setMode(next);
    setPassword('');
    setConfirm('');
    setError('');
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (mode !== 'signIn') {
      const problem =
        (mode === 'signUp' && usernameProblem(username)) || passwordProblem(password, username);
      if (problem) return setError(problem);
      if (password !== confirm) return setError('The passwords don’t match.');
    }
    run(async () => {
      if (mode === 'signIn') await account.signIn(username, password);
      else if (mode === 'signUp')
        account.showRecoveryCode(await account.signUp(username, password));
      else account.showRecoveryCode(await account.recover(username, code, password));
    });
  }

  const newPassword = mode !== 'signIn';
  return (
    <section className="account-card">
      <div className="account-tabs" role="tablist" aria-label="Account">
        {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            className={mode === m ? 'chosen' : ''}
            onClick={() => switchMode(m)}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>
      <form onSubmit={submit} noValidate>
        <Field
          label="Username"
          name="username"
          autoComplete="username"
          maxLength={USERNAME_MAX_LENGTH}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          hint={
            mode === 'signUp'
              ? '3–24 letters, numbers, dots, dashes or underscores. Others will see it.'
              : undefined
          }
          autoFocus
        />
        {mode === 'recover' && (
          <Field
            label="Recovery code"
            name="recovery-code"
            autoComplete="off"
            spellCheck={false}
            placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        )}
        <Field
          label={newPassword ? 'New password' : 'Password'}
          name="password"
          type="password"
          autoComplete={newPassword ? 'new-password' : 'current-password'}
          maxLength={PASSWORD_MAX_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={
            newPassword ? 'At least 8 characters. A short phrase is easy to remember.' : undefined
          }
        />
        {newPassword && (
          <Field
            label="Confirm password"
            name="confirm-password"
            type="password"
            autoComplete="new-password"
            maxLength={PASSWORD_MAX_LENGTH}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        )}
        <FormError error={error} />
        <button className="primary account-submit" type="submit" disabled={busy}>
          {mode === 'signUp' ? <UserPlus size={16} /> : <LogIn size={16} />}{' '}
          {busy ? 'Please wait…' : mode === 'recover' ? 'Set new password' : MODE_LABELS[mode]}
        </button>
      </form>
      {mode === 'recover' && (
        <p className="account-note">
          Lost your recovery code too? An administrator can give you a new one.
        </p>
      )}
    </section>
  );
}

function ChangePassword({ account }: { account: Account }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const { busy, error, setError, run } = useAction();
  const username = account.account?.username ?? '';

  function submit(event: FormEvent) {
    event.preventDefault();
    const problem = passwordProblem(next, username);
    if (problem) return setError(problem);
    if (next !== confirm) return setError('The new passwords don’t match.');
    run(async () => {
      await account.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
    });
  }

  return (
    <form className="account-card" onSubmit={submit} noValidate>
      <h3>Change password</h3>
      <input type="text" autoComplete="username" value={username} readOnly hidden />
      <Field
        label="Current password"
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={(e) => {
          setCurrent(e.target.value);
          setDone(false);
        }}
      />
      <Field
        label="New password"
        type="password"
        autoComplete="new-password"
        maxLength={PASSWORD_MAX_LENGTH}
        value={next}
        onChange={(e) => setNext(e.target.value)}
      />
      <Field
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        maxLength={PASSWORD_MAX_LENGTH}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      <FormError error={error} />
      {done && (
        <p className="account-success" role="status">
          Password changed. Other devices were signed out.
        </p>
      )}
      <button className="secondary" type="submit" disabled={busy || !current}>
        {busy ? 'Please wait…' : 'Change password'}
      </button>
    </form>
  );
}

function NewRecoveryCode({ account }: { account: Account }) {
  const [current, setCurrent] = useState('');
  const { busy, error, run } = useAction();
  return (
    <form
      className="account-card"
      onSubmit={(event) => {
        event.preventDefault();
        run(async () => {
          const { recoveryCode } = await account.newRecoveryCode(current);
          setCurrent('');
          account.showRecoveryCode(recoveryCode);
        });
      }}
    >
      <h3>Recovery code</h3>
      <p className="account-note">
        Lost your recovery code? Create a new one. The old code stops working.
      </p>
      <Field
        label="Current password"
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
      />
      <FormError error={error} />
      <button className="secondary" type="submit" disabled={busy || !current}>
        {busy ? 'Please wait…' : 'Create a new recovery code'}
      </button>
    </form>
  );
}

/** Administrators: every account, with disable/enable and a support recovery code. */
function AdminAccounts({ selfId }: { selfId: string }) {
  const [accounts, setAccounts] = useState<AccountListEntry[] | null>(null);
  const [issued, setIssued] = useState<{ username: string; code: string } | null>(null);
  const { busy, error, run } = useAction();

  const load = () => run(async () => setAccounts((await accountApi.listAccounts()).accounts));
  useEffect(() => {
    load();
  }, []);

  function toggle(entry: AccountListEntry) {
    const disabling = !entry.disabled;
    if (
      disabling &&
      !window.confirm(
        `Disable ${entry.username}? They are signed out everywhere and can’t sign in.`,
      )
    )
      return;
    run(async () => setAccounts((await accountApi.setDisabled(entry.id, disabling)).accounts));
  }

  function issue(entry: AccountListEntry) {
    if (
      !window.confirm(
        `Create a new recovery code for ${entry.username}? Their old code stops working.`,
      )
    )
      return;
    run(async () => {
      const { recoveryCode } = await accountApi.issueRecoveryCode(entry.id);
      setIssued({ username: entry.username, code: recoveryCode });
    });
  }

  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '—');

  return (
    <section className="account-card admin-accounts" aria-labelledby="admin-title">
      <div className="account-card-heading">
        <h3 id="admin-title">
          <ShieldCheck size={16} /> Accounts
        </h3>
        <button type="button" className="secondary" onClick={load} disabled={busy}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>
      <FormError error={error} />
      {issued && (
        <div className="account-success" role="status">
          New recovery code for {issued.username}:{' '}
          <output className="recovery-code">{issued.code}</output>
          <small>Give it to them privately. It is not shown again.</small>
          <button type="button" className="secondary" onClick={() => setIssued(null)}>
            Done
          </button>
        </div>
      )}
      {accounts && (
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Created</th>
                <th>Last sign-in</th>
                <th>Status</th>
                <th>
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.username}</td>
                  <td>{entry.role === 'admin' ? 'Admin' : 'Player'}</td>
                  <td>{date(entry.createdAt)}</td>
                  <td>{date(entry.lastLoginAt)}</td>
                  <td>{entry.disabled ? 'Disabled' : 'Active'}</td>
                  <td className="admin-actions">
                    {entry.id !== selfId && (
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={() => toggle(entry)}
                      >
                        {entry.disabled ? 'Enable' : 'Disable'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => issue(entry)}
                    >
                      New recovery code
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

type AccountPageProps = {
  account: Account;
  onPlay: () => void;
  onSignOut: () => void;
};

/** Sign in, create an account or recover it; when signed in, manage it (and others, as admin). */
export function AccountPage({ account, onPlay, onSignOut }: AccountPageProps) {
  const { status, profile, recoveryCode } = account;
  let body: ReactNode;

  if (recoveryCode)
    body = <RecoveryCodePanel code={recoveryCode} onDone={() => account.showRecoveryCode('')} />;
  else if (status === 'checking') body = <p className="account-note">Checking your account…</p>;
  else if (status === 'unavailable')
    body = (
      <section className="account-card">
        <h3>Online accounts are unavailable</h3>
        <p className="account-note">
          The account server can’t be reached. Local profiles and guest play still work. When the
          server is running (see the README), try again.
        </p>
        <button type="button" className="secondary" onClick={account.retry}>
          <RefreshCw size={14} /> Try again
        </button>
      </section>
    );
  else if (status === 'signedOut') body = <SignedOutForms account={account} />;
  else {
    const info = account.account!;
    body = (
      <>
        <section className="account-card account-summary">
          <span className="avatar">{info.username.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{info.username}</strong>
            {info.role === 'admin' && <span className="role-badge">Admin</span>}
            <small>
              Plays as {profile?.settings.name} · Best {profile?.best.toLocaleString() ?? 0}
            </small>
            <small role="status">{SAVE_LABELS[account.saveState]}</small>
          </div>
          <div className="account-actions">
            <button type="button" className="primary" onClick={onPlay}>
              <Play size={14} /> Play
            </button>
            <button type="button" className="secondary" onClick={onSignOut}>
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </section>
        <div className="account-grid">
          <ChangePassword account={account} />
          <NewRecoveryCode account={account} />
        </div>
        {info.role === 'admin' && <AdminAccounts selfId={info.id} />}
      </>
    );
  }

  return (
    <div className="profile-lobby app dark account-page">
      <main className="lobby-content">
        <div className="lobby-title">
          <KeyRound size={24} />
          <h2>Your account</h2>
          <p>
            Sign in to keep your name, look, controls and best score on every machine. Playing
            without an account still works.
          </p>
        </div>
        {account.notice && (
          <p className="account-error" role="status">
            {account.notice}
          </p>
        )}
        {body}
      </main>
    </div>
  );
}
