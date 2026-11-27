import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRecoveryCode, RECOVERY_ALPHABET } from '../../src/accounts/rules.ts';
import { RateLimiter } from './rateLimit.ts';
import {
  hashSecret,
  newRecoveryCode,
  newSessionToken,
  sessionTokenHash,
  verifySecret,
} from './secrets.ts';

test('passwords are salted and verified, never stored in plain text', async () => {
  const a = await hashSecret('correct horse');
  const b = await hashSecret('correct horse');
  assert.notEqual(a, b);
  assert.ok(!a.includes('correct'));
  assert.equal(await verifySecret('correct horse', a), true);
  assert.equal(await verifySecret('correct hors', a), false);
  assert.equal(await verifySecret('anything', 'garbage'), false);
});

test('recovery codes use the readable alphabet in four groups', () => {
  const code = newRecoveryCode();
  assert.match(code, /^[A-Z0-9]{5}(-[A-Z0-9]{5}){3}$/);
  assert.ok([...normalizeRecoveryCode(code)].every((c) => RECOVERY_ALPHABET.includes(c)));
  assert.notEqual(newRecoveryCode(), code);
});

test('session tokens are random and stored only as a hash', () => {
  const token = newSessionToken();
  assert.ok(token.length >= 43);
  assert.notEqual(newSessionToken(), token);
  assert.match(sessionTokenHash(token), /^[0-9a-f]{64}$/);
  assert.equal(sessionTokenHash(token), sessionTokenHash(token));
});

test('the rate limiter blocks after the limit until the window passes', () => {
  let now = 0;
  const limiter = new RateLimiter(2, 60_000, () => now);
  assert.equal(limiter.retryAfter('ip'), 0);
  limiter.record('ip');
  assert.equal(limiter.retryAfter('ip'), 0);
  limiter.record('ip');
  assert.equal(limiter.retryAfter('ip'), 60);
  assert.equal(limiter.retryAfter('other'), 0);
  now = 30_000;
  assert.equal(limiter.retryAfter('ip'), 30);
  now = 60_000;
  assert.equal(limiter.retryAfter('ip'), 0);
  limiter.record('ip');
  limiter.record('ip');
  limiter.reset('ip');
  assert.equal(limiter.retryAfter('ip'), 0);
});
