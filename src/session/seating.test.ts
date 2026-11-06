import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_KEYS } from '../profiles/profiles.ts';
import {
  MAX_LOCAL_PLAYERS,
  MIN_BOARD_WIDTH,
  assignSeparateKeys,
  keyClashes,
  maxSeatsFor,
  nextTurn,
  seatLayout,
} from './seating.ts';

test('a large display fits every seat in one row', () => {
  const layout = seatLayout(4, 1920, 1080);
  assert.equal(layout.rows, 1);
  assert.equal(layout.columns, 4);
  assert.ok(layout.fits);
  assert.equal(maxSeatsFor(1920, 1080), MAX_LOCAL_PLAYERS);
});

test('boards get smaller as seats are added, and never below the minimum when they fit', () => {
  const widths = [1, 2, 3, 4].map((n) => seatLayout(n, 1366, 768).boardWidth);
  for (let i = 1; i < widths.length; i++) assert.ok(widths[i] <= widths[i - 1]);
  for (let n = 1; n <= MAX_LOCAL_PLAYERS; n++) {
    const layout = seatLayout(n, 1366, 768);
    assert.equal(layout.fits, layout.boardWidth >= MIN_BOARD_WIDTH);
  }
});

test('a portrait display uses two rows when that gives larger boards', () => {
  assert.equal(seatLayout(4, 1366, 768).rows, 1);
  const layout = seatLayout(4, 1080, 1920);
  assert.equal(layout.rows, 2);
  assert.equal(layout.columns, 2);
  assert.ok(layout.fits);
});

test('a narrow window holds fewer players but solo always fits', () => {
  assert.equal(maxSeatsFor(600, 900), 3);
  assert.equal(maxSeatsFor(320, 300), 1);
  assert.equal(seatLayout(2, 320, 300).fits, false);
});

test('two-player Versus still fits a 360px-wide phone', () => {
  assert.ok(seatLayout(2, 360, 740).fits);
  assert.equal(seatLayout(3, 360, 740).fits, false);
});

test('turns rotate through the seats and skip finished players', () => {
  assert.equal(nextTurn(0, 3, []), 1);
  assert.equal(nextTurn(2, 3, []), 0);
  assert.equal(nextTurn(0, 3, [1]), 2);
  assert.equal(nextTurn(0, 3, [1, 2]), 0);
  assert.equal(nextTurn(0, 3, [0, 1, 2]), -1);
});

test('default keys clash between seats, but a shared pause key does not', () => {
  const clashes = keyClashes([DEFAULT_KEYS, DEFAULT_KEYS]);
  assert.ok(clashes.some((c) => c.key === 'ArrowLeft' && c.seats.join() === '0,1'));
  assert.ok(!clashes.some((c) => c.key === 'p'));
  assert.deepEqual(keyClashes([DEFAULT_KEYS]), []);
});

test('separate keys are assigned only to clashing seats and leave pause alone', () => {
  const custom = {
    ...DEFAULT_KEYS,
    left: 'z',
    right: 'x',
    rotate: 'v',
    down: 'b',
    drop: 'n',
    hold: 'm',
  };
  const result = assignSeparateKeys([DEFAULT_KEYS, custom, DEFAULT_KEYS, DEFAULT_KEYS]);
  assert.deepEqual(result[0], DEFAULT_KEYS);
  assert.deepEqual(result[1], custom);
  assert.equal(result[2].left, 'a');
  assert.equal(result[3].left, 'j');
  assert.ok(result.every((k) => k.pause === 'p'));
  assert.deepEqual(keyClashes(result), []);
});
