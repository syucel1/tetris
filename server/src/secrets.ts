/**
 * Password and recovery-code hashing (scrypt, per-secret salt) and session tokens.
 * Only hashes are stored: a database leak does not reveal passwords, codes or live sessions.
 */
import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import {
  RECOVERY_ALPHABET,
  RECOVERY_GROUPS,
  RECOVERY_GROUP_LENGTH,
  formatRecoveryCode,
} from '../../src/accounts/rules.ts';

/** scrypt cost: N=2^15, r=8 uses 32 MiB and roughly 50–100 ms per hash. */
const COST = { N: 32768, r: 8, p: 1 };
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;

function derive(secret: string, salt: Buffer, cost = COST): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(
      secret.normalize('NFKC'),
      salt,
      KEY_LENGTH,
      { ...cost, maxmem: MAX_MEMORY },
      (err, key) => (err ? reject(err) : resolve(key)),
    ),
  );
}

/** `scrypt$N$r$p$salt$hash`, base64url. */
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(secret, salt);
  return [
    'scrypt',
    COST.N,
    COST.r,
    COST.p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = await derive(secret, Buffer.from(salt, 'base64url'), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * A real hash of a random secret. Checking a password against it when the username does not
 * exist keeps response times the same, so timing does not reveal which usernames are taken.
 */
let dummyHash: Promise<string> | undefined;
export const dummySecretHash = () => (dummyHash ??= hashSecret(randomBytes(16).toString('hex')));

/** A session token for the cookie (256 bits). */
export const newSessionToken = () => randomBytes(32).toString('base64url');

/** Sessions are looked up by a SHA-256 of the token, never by the token itself. */
export const sessionTokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

/** XXXXX-XXXXX-XXXXX-XXXXX from a 30-letter alphabet: about 98 bits. */
export function newRecoveryCode(): string {
  let code = '';
  for (let i = 0; i < RECOVERY_GROUPS * RECOVERY_GROUP_LENGTH; i++)
    code += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
  return formatRecoveryCode(code);
}
