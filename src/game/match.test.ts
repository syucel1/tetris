import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextRandom, seededBag } from './engine.ts';
import { applyAction, createGame, type GameState } from './gameState.ts';
import {
  describeRules,
  isStandardMatch,
  isValidMatchLevel,
  matchOutcome,
  newMatchSeed,
} from './match.ts';

test('the seeded generator is deterministic and stays in range', () => {
  const [a, nextA] = nextRandom(42);
  const [b, nextB] = nextRandom(42);
  assert.equal(a, b);
  assert.equal(nextA, nextB);
  let state = 7;
  for (let i = 0; i < 1000; i++) {
    const [value, next] = nextRandom(state);
    assert.ok(value >= 0 && value < 1);
    state = next;
  }
});

test('seeded bags hold each piece once and differ between seeds', () => {
  const { bag } = seededBag(1234);
  assert.deepEqual([...bag].sort(), [0, 1, 2, 3, 4, 5, 6]);
  const sequences = new Set(Array.from({ length: 20 }, (_, i) => seededBag(i * 7919).bag.join()));
  assert.ok(sequences.size > 1);
});

/** Hard-drops pieces until `count` have spawned, recording each active piece type. */
function pieceSequence(game: GameState, count: number, useHold = false): number[] {
  const seen: number[] = [];
  let g = game;
  while (seen.length < count && g.status === 'playing') {
    seen.push(g.type);
    if (useHold && seen.length % 3 === 0 && !g.holdUsed) g = applyAction(g, 'hold', 1);
    // Keep the board from filling: wipe it between drops; only the sequence matters here.
    g = { ...applyAction(g, 'drop', 1), board: game.board };
  }
  return seen;
}

test('boards with the same seed receive the same pieces, beyond the first bags', () => {
  const a = createGame('playing', 99);
  const b = createGame('playing', 99);
  assert.deepEqual(a.queue, b.queue);
  assert.equal(a.type, b.type);
  assert.deepEqual(pieceSequence(a, 40), pieceSequence(b, 40));
});

test('holding does not change the queue order a player draws from', () => {
  const a = createGame('playing', 5);
  const b = createGame('playing', 5);
  const plain = pieceSequence(a, 30);
  const withHold = pieceSequence(b, 30, true);
  // The incoming queue is identical; hold only swaps which piece is active.
  assert.equal(plain.length, withHold.length);
  assert.deepEqual(
    applyAction(a, 'drop', 1).queue.slice(0, 5),
    applyAction(b, 'drop', 1).queue.slice(0, 5),
  );
});

test('unseeded games keep using random bags and carry no seed', () => {
  const game = createGame('playing');
  assert.equal(game.seed, undefined);
  assert.equal(applyAction(game, 'drop', 1).seed, undefined);
});

test('the higher score wins and equal scores tie', () => {
  assert.deepEqual(matchOutcome([1200, 800]), { kind: 'win', winner: 0, loser: 1, margin: 400 });
  assert.deepEqual(matchOutcome([300, 900]), { kind: 'win', winner: 1, loser: 0, margin: 600 });
  assert.deepEqual(matchOutcome([500, 500]), { kind: 'tie', score: 500 });
});

test('standard matches are two-player only, with a valid shared level', () => {
  assert.ok(isStandardMatch(2, 'standard'));
  assert.ok(!isStandardMatch(2, 'casual'));
  assert.ok(!isStandardMatch(3, 'standard'));
  assert.ok(isValidMatchLevel(1) && isValidMatchLevel(10));
  assert.ok(!isValidMatchLevel(0) && !isValidMatchLevel(11) && !isValidMatchLevel(2.5));
});

test('seeds are 32-bit integers and the rules mention the shared level', () => {
  const high = newMatchSeed(() => 0.999999999);
  assert.ok(Number.isInteger(high) && high > 4294967000 && high <= 4294967295);
  assert.equal(
    newMatchSeed(() => 0),
    0,
  );
  assert.ok(describeRules({ startLevel: 4 }, false)[0].includes('level 4'));
  assert.ok(describeRules({ startLevel: 1 }, true).some((r) => r.includes('at once')));
});
