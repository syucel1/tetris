import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RECOVERY_KEY,
  BACKUP_KEY,
  validateMatch,
  loadRecovery,
  saveRecovery,
  discardRecovery,
  restoreBoard,
  type SavedMatch,
} from './recovery.ts';
import { DEFAULT_SETTINGS } from '../profiles/profiles.ts';
import { createEmptyBoard, SHAPES } from '../game/engine.ts';
function fixture(): SavedMatch {
  return {
    version: 1,
    savedAt: 1234,
    mode: 'solo',
    turn: 0,
    guestConsent: false,
    boards: [
      {
        profile: { id: 'a', settings: structuredClone(DEFAULT_SETTINGS), best: 400 },
        game: {
          id: 'game-a',
          pieces: 2,
          placements: 2,
          board: createEmptyBoard(),
          shape: SHAPES[5],
          x: 3,
          y: 4,
          queue: [0, 1, 2, 3, 4, 5, 6],
          held: 2,
          type: 5,
          holdUsed: true,
          score: 140,
          lines: 0,
          status: 'playing',
        },
        elapsed: 12345,
        previousBest: 400,
      },
    ],
  };
}
function memory() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
test('round-trips all game state and restores paused without charging elapsed time', () => {
  const store = memory(),
    match = fixture();
  saveRecovery(store, match);
  const loaded = loadRecovery(store, ['a']).match!;
  assert.deepEqual(loaded, match);
  const b = restoreBoard(loaded.boards[0]);
  assert.equal(b.game.status, 'paused');
  assert.equal(b.elapsed, 12345);
  assert.equal(b.previousBest, 400);
  assert.deepEqual(b.game.queue, match.boards[0].game.queue);
  assert.equal(b.game.holdUsed, true);
});
test('validates multiplayer turn and retains a finished board', () => {
  const m = fixture();
  m.mode = 'multiplayer';
  m.boards.push(structuredClone(m.boards[0]));
  m.boards[1].profile.id = 'b';
  m.boards[1].game.id = 'game-b';
  m.boards[0].game.status = 'over';
  m.turn = 1;
  assert.equal(validateMatch(m), true);
  const store = memory();
  saveRecovery(store, m);
  assert.equal(loadRecovery(store, ['a', 'b']).match?.turn, 1);
  assert.equal(restoreBoard(m.boards[0]).game.status, 'over');
  m.turn = 0;
  assert.equal(validateMatch(m), false);
});
test('accepts up to four seats and keeps the play style', () => {
  const m = fixture();
  m.mode = 'multiplayer';
  m.style = 'simultaneous';
  for (const id of ['b', 'c', 'd']) {
    const board = structuredClone(m.boards[0]);
    board.profile.id = id;
    board.game.id = 'game-' + id;
    m.boards.push(board);
  }
  // Simultaneous play has no current turn: any unfinished board keeps the match resumable.
  m.boards[0].game.status = 'over';
  m.turn = 0;
  assert.equal(validateMatch(m), true);
  const store = memory();
  saveRecovery(store, m);
  assert.equal(loadRecovery(store, ['a', 'b', 'c', 'd']).match?.style, 'simultaneous');
  m.boards.forEach((b) => (b.game.status = 'over'));
  assert.equal(validateMatch(m), false);
  const five = fixture();
  five.mode = 'multiplayer';
  for (const id of ['b', 'c', 'd', 'e']) {
    const board = structuredClone(five.boards[0]);
    board.profile.id = id;
    five.boards.push(board);
  }
  assert.equal(validateMatch(five), false);
  assert.equal(validateMatch({ ...m, style: 'chaos' }), false);
});
test('rejects corrupt, incompatible and unsafe snapshots', () => {
  for (const mutate of [
    (m: any) => (m.version = 99),
    (m: any) => (m.boards[0].game.board = []),
    (m: any) => (m.boards[0].game.score = -1),
    (m: any) => (m.boards[0].game.shape = [[99]]),
    (m: any) => (m.boards[0].game.queue = [8]),
    (m: any) => (m.boards[0].profile.settings.keys.left = null),
    (m: any) => (m.boards[0].game.x = 10),
    (m: any) => (m.boards[0].elapsed = Infinity),
  ]) {
    const m = fixture();
    mutate(m);
    assert.equal(validateMatch(m), false);
  }
});
test('damaged primary falls back to the last valid checkpoint', () => {
  const store = memory(),
    first = fixture();
  saveRecovery(store, first);
  const second = structuredClone(first);
  second.boards[0].game.score = 200;
  saveRecovery(store, second);
  store.setItem(RECOVERY_KEY, '{broken');
  const loaded = loadRecovery(store, ['a']);
  assert.deepEqual(loaded.match, first);
  assert.ok(loaded.warning);
});
test('failed writes leave the last successful save intact', () => {
  const store = memory(),
    first = fixture();
  saveRecovery(store, first);
  const fail = {
    ...store,
    setItem: () => {
      throw new Error('quota');
    },
  };
  const next = structuredClone(first);
  next.savedAt++;
  assert.throws(() => saveRecovery(fail, next));
  assert.deepEqual(loadRecovery(store, ['a']).match, first);
});
test('discard tombstone prevents backup resurrection even if backup cleanup fails', () => {
  const store = memory();
  saveRecovery(store, fixture());
  saveRecovery(store, fixture());
  assert.ok(store.getItem(BACKUP_KEY));
  assert.throws(() =>
    discardRecovery({
      ...store,
      removeItem: () => {
        throw new Error('blocked');
      },
    }),
  );
  assert.equal(loadRecovery(store, ['a']).match, null);
});
test('completed games cannot be saved and discarded games are not offered', () => {
  const store = memory(),
    m = fixture();
  m.boards[0].game.status = 'over';
  assert.equal(validateMatch(m), false);
  assert.throws(() => saveRecovery(store, m));
  saveRecovery(store, fixture());
  discardRecovery(store);
  assert.equal(loadRecovery(store, ['a']).match, null);
});
test('missing profiles and unavailable storage never prevent a fresh game', () => {
  const store = memory();
  saveRecovery(store, fixture());
  const missing = loadRecovery(store, []);
  assert.equal(missing.match, null);
  assert.ok(missing.warning);
  assert.equal(
    loadRecovery(
      {
        ...store,
        getItem: () => {
          throw new Error('disabled');
        },
      },
      ['a'],
    ).match,
    null,
  );
});
test('guest checkpoint requires explicit consent and does not require a saved guest profile', () => {
  const m = fixture();
  m.boards[0].profile.id = 'guest-123';
  assert.equal(validateMatch(m), false);
  m.guestConsent = true;
  const store = memory();
  saveRecovery(store, m);
  assert.ok(loadRecovery(store, []).match);
});
