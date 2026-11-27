/** PostgreSQL storage for accounts, sessions and saved profiles. */
import pg from 'pg';
import type { AccountListEntry, AccountRole, AccountSummary } from '../../src/accounts/rules.ts';
import type { Settings } from '../../src/profiles/profiles.ts';

export type AccountRecord = AccountSummary & {
  passwordHash: string;
  recoveryHash: string;
  disabled: boolean;
};

export type StoredProfile = { settings: Settings; best: number; updatedAt: string };

/** Schema changes, applied in order exactly once. Never edit a released migration. */
const MIGRATIONS: string[] = [
  `CREATE TABLE accounts (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     username text NOT NULL,
     username_key text NOT NULL UNIQUE,
     password_hash text NOT NULL,
     recovery_hash text NOT NULL,
     role text NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'admin')),
     disabled_at timestamptz,
     created_at timestamptz NOT NULL DEFAULT now(),
     last_login_at timestamptz
   );
   CREATE TABLE sessions (
     token_hash text PRIMARY KEY,
     account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     created_at timestamptz NOT NULL DEFAULT now(),
     expires_at timestamptz NOT NULL
   );
   CREATE INDEX sessions_account_id ON sessions(account_id);
   CREATE TABLE profiles (
     account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
     settings jsonb NOT NULL,
     best bigint NOT NULL DEFAULT 0 CHECK (best >= 0),
     updated_at timestamptz NOT NULL DEFAULT now()
   );`,
];

type Row = Record<string, any>;

const toAccount = (row: Row): AccountRecord => ({
  id: row.id,
  username: row.username,
  role: row.role as AccountRole,
  passwordHash: row.password_hash,
  recoveryHash: row.recovery_hash,
  disabled: row.disabled_at !== null,
});

const toProfile = (row: Row): StoredProfile => ({
  settings: row.settings,
  best: Number(row.best),
  updatedAt: new Date(row.updated_at).toISOString(),
});

export const summary = ({ id, username, role }: AccountSummary): AccountSummary => ({
  id,
  username,
  role,
});

export class Store {
  readonly pool: pg.Pool;

  constructor(databaseUrl: string) {
    this.pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
  }

  close() {
    return this.pool.end();
  }

  async ping() {
    await this.pool.query('SELECT 1');
  }

  /** Applies pending migrations. Safe to run on every start, also from several processes. */
  async migrate() {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock(7240305)');
      await client.query(
        'CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
      );
      const { rows } = await client.query('SELECT max(version) AS version FROM schema_migrations');
      for (let version = (rows[0].version ?? 0) + 1; version <= MIGRATIONS.length; version++) {
        await client.query('BEGIN');
        try {
          await client.query(MIGRATIONS[version - 1]);
          await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock(7240305)').catch(() => {});
      client.release();
    }
  }

  /** Creates the account and its profile together. Returns null when the username is taken. */
  async createAccount(
    username: string,
    usernameKey: string,
    passwordHash: string,
    recoveryHash: string,
    settings: Settings,
  ): Promise<AccountRecord | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO accounts (username, username_key, password_hash, recovery_hash, last_login_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (username_key) DO NOTHING RETURNING *`,
        [username, usernameKey, passwordHash, recoveryHash],
      );
      if (!rows.length) {
        await client.query('ROLLBACK');
        return null;
      }
      await client.query('INSERT INTO profiles (account_id, settings) VALUES ($1, $2)', [
        rows[0].id,
        settings,
      ]);
      await client.query('COMMIT');
      return toAccount(rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findAccountByUsername(usernameKey: string): Promise<AccountRecord | null> {
    const { rows } = await this.pool.query('SELECT * FROM accounts WHERE username_key = $1', [
      usernameKey,
    ]);
    return rows.length ? toAccount(rows[0]) : null;
  }

  async findAccountById(id: string): Promise<AccountRecord | null> {
    const { rows } = await this.pool.query('SELECT * FROM accounts WHERE id = $1', [id]);
    return rows.length ? toAccount(rows[0]) : null;
  }

  async recordLogin(accountId: string) {
    await this.pool.query('UPDATE accounts SET last_login_at = now() WHERE id = $1', [accountId]);
  }

  async setPasswordHash(accountId: string, passwordHash: string) {
    await this.pool.query('UPDATE accounts SET password_hash = $2 WHERE id = $1', [
      accountId,
      passwordHash,
    ]);
  }

  async setRecoveryHash(accountId: string, recoveryHash: string) {
    await this.pool.query('UPDATE accounts SET recovery_hash = $2 WHERE id = $1', [
      accountId,
      recoveryHash,
    ]);
  }

  /** Disabling also ends every session of the account. */
  async setDisabled(accountId: string, disabled: boolean): Promise<AccountRecord | null> {
    const { rows } = await this.pool.query(
      `UPDATE accounts SET disabled_at = CASE WHEN $2 THEN coalesce(disabled_at, now()) END
       WHERE id = $1 RETURNING *`,
      [accountId, disabled],
    );
    if (disabled) await this.deleteSessions(accountId);
    return rows.length ? toAccount(rows[0]) : null;
  }

  async setRole(usernameKey: string, role: AccountRole): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'UPDATE accounts SET role = $2 WHERE username_key = $1',
      [usernameKey, role],
    );
    return rowCount === 1;
  }

  async listAccounts(): Promise<AccountListEntry[]> {
    const { rows } = await this.pool.query(
      'SELECT id, username, role, created_at, last_login_at, disabled_at FROM accounts ORDER BY username_key',
    );
    return rows.map((row) => ({
      id: row.id,
      username: row.username,
      role: row.role,
      createdAt: new Date(row.created_at).toISOString(),
      lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
      disabled: row.disabled_at !== null,
    }));
  }

  // ── Sessions ───────────────────────────────────────────────────────────────
  async createSession(tokenHash: string, accountId: string, expiresAt: Date) {
    await this.pool.query(
      'INSERT INTO sessions (token_hash, account_id, expires_at) VALUES ($1, $2, $3)',
      [tokenHash, accountId, expiresAt],
    );
  }

  /** The session's account, unless the session has expired or the account is disabled. */
  async findSessionAccount(tokenHash: string): Promise<AccountRecord | null> {
    const { rows } = await this.pool.query(
      `SELECT a.* FROM sessions s JOIN accounts a ON a.id = s.account_id
       WHERE s.token_hash = $1 AND s.expires_at > now() AND a.disabled_at IS NULL`,
      [tokenHash],
    );
    return rows.length ? toAccount(rows[0]) : null;
  }

  async deleteSession(tokenHash: string) {
    await this.pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
  }

  /** Ends every session of an account, optionally keeping the current one. */
  async deleteSessions(accountId: string, exceptTokenHash = '') {
    await this.pool.query('DELETE FROM sessions WHERE account_id = $1 AND token_hash <> $2', [
      accountId,
      exceptTokenHash,
    ]);
  }

  async deleteExpiredSessions() {
    await this.pool.query('DELETE FROM sessions WHERE expires_at <= now()');
  }

  // ── Profiles ───────────────────────────────────────────────────────────────
  async getProfile(accountId: string): Promise<StoredProfile | null> {
    const { rows } = await this.pool.query('SELECT * FROM profiles WHERE account_id = $1', [
      accountId,
    ]);
    return rows.length ? toProfile(rows[0]) : null;
  }

  /** Saves settings. The personal best only ever goes up. */
  async saveProfile(accountId: string, settings: Settings, best: number): Promise<StoredProfile> {
    const { rows } = await this.pool.query(
      `INSERT INTO profiles (account_id, settings, best) VALUES ($1, $2, $3)
       ON CONFLICT (account_id) DO UPDATE
         SET settings = EXCLUDED.settings, best = GREATEST(profiles.best, EXCLUDED.best), updated_at = now()
       RETURNING *`,
      [accountId, settings, best],
    );
    return toProfile(rows[0]);
  }
}
