/**
 * Account rules shared by the browser and the account server: username and password
 * requirements, recovery-code format, and how an account appears as a game profile.
 */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 24;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Letters, digits, and `_ . -` after the first character. */
const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

export const ACCOUNT_ROLES = ['player', 'admin'] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

/** What the browser knows about the signed-in account. */
export type AccountSummary = { id: string; username: string; role: AccountRole };

/** One row of the administrator's account list. */
export type AccountListEntry = AccountSummary & {
  createdAt: string;
  lastLoginAt: string | null;
  disabled: boolean;
};

/** Usernames are unique regardless of letter case. */
export const usernameKey = (username: string) => username.trim().toLowerCase();

/** A user-facing problem with the username, or null when it is acceptable. */
export function usernameProblem(username: unknown): string | null {
  if (typeof username !== 'string' || !username.trim()) return 'Enter a username.';
  const name = username.trim();
  if (name.length < USERNAME_MIN_LENGTH || name.length > USERNAME_MAX_LENGTH)
    return `Use ${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} characters.`;
  if (!USERNAME_PATTERN.test(name))
    return 'Use letters, numbers, dots, dashes or underscores, starting with a letter or number.';
  return null;
}

/** A user-facing problem with a new password, or null when it is acceptable. */
export function passwordProblem(password: unknown, username = ''): string | null {
  if (typeof password !== 'string' || !password) return 'Enter a password.';
  if (password.length < PASSWORD_MIN_LENGTH)
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password.length > PASSWORD_MAX_LENGTH)
    return `Use ${PASSWORD_MAX_LENGTH} characters or fewer.`;
  if (username && password.trim().toLowerCase() === usernameKey(username))
    return 'Choose a password that is different from your username.';
  return null;
}

/** Recovery codes avoid look-alike characters (0/O, 1/I/L, U). */
export const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
export const RECOVERY_GROUPS = 4;
export const RECOVERY_GROUP_LENGTH = 5;

/** Uppercase, with spaces and dashes removed, so codes can be typed loosely. */
export const normalizeRecoveryCode = (code: unknown) =>
  typeof code === 'string' ? code.toUpperCase().replace(/[\s-]/g, '') : '';

/** Groups a normalized code as XXXXX-XXXXX-XXXXX-XXXXX for display. */
export const formatRecoveryCode = (code: string) =>
  normalizeRecoveryCode(code)
    .match(new RegExp(`.{1,${RECOVERY_GROUP_LENGTH}}`, 'g'))
    ?.join('-') ?? '';

/** The signed-in account is seated in games as a profile with this id prefix. */
export const ACCOUNT_PROFILE_PREFIX = 'account-';
export const accountProfileId = (accountId: string) => ACCOUNT_PROFILE_PREFIX + accountId;
export const isAccountProfileId = (id: string) => id.startsWith(ACCOUNT_PROFILE_PREFIX);
