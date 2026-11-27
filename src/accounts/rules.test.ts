import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RECOVERY_ALPHABET,
  accountProfileId,
  formatRecoveryCode,
  isAccountProfileId,
  normalizeRecoveryCode,
  passwordProblem,
  usernameKey,
  usernameProblem,
} from './rules.ts';

test('usernames: length, characters and case-insensitive identity', () => {
  assert.equal(usernameProblem('ana'), null);
  assert.equal(usernameProblem('Ana_B.2-x'), null);
  assert.ok(usernameProblem('ab'));
  assert.ok(usernameProblem('x'.repeat(25)));
  assert.ok(usernameProblem('_ana'));
  assert.ok(usernameProblem('ana smith'));
  assert.ok(usernameProblem('anä'));
  assert.ok(usernameProblem(undefined));
  assert.equal(usernameKey('  AnA '), 'ana');
});

test('passwords: length limits and not the username', () => {
  assert.equal(passwordProblem('correct horse'), null);
  assert.ok(passwordProblem('short'));
  assert.ok(passwordProblem('x'.repeat(129)));
  assert.ok(passwordProblem('Ana_player', 'ana_player'));
  assert.ok(passwordProblem(42));
});

test('recovery codes can be typed loosely and display in groups', () => {
  assert.equal(normalizeRecoveryCode('abcde-fghjk mnpqr'), 'ABCDEFGHJKMNPQR');
  assert.equal(formatRecoveryCode('ABCDEFGHJKMNPQRSTVWX'), 'ABCDE-FGHJK-MNPQR-STVWX');
  assert.equal(normalizeRecoveryCode(null), '');
  assert.ok(!/[01ILOU]/.test(RECOVERY_ALPHABET));
});

test('account profiles are recognisable by id', () => {
  assert.ok(isAccountProfileId(accountProfileId('123')));
  assert.ok(!isAccountProfileId('player-one'));
});
