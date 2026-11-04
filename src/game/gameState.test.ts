import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_HEIGHT, BOARD_WIDTH, SHAPES } from './engine.ts';
import {
  applyAction,
  createGame,
  gravityDelay,
  levelFor,
  SPAWN_X,
  type GameState,
} from './gameState.ts';

const I = 0;
const O = 3;

function playing(overrides: Partial<GameState> = {}): GameState {
  const game = createGame('playing');
  const type = overrides.type ?? O;
  return { ...game, type, shape: SHAPES[type], queue: [I, I, I, I, I, I, I, I, I], ...overrides };
}

test('levels rise every ten lines and cap at ten', () => {
  assert.equal(levelFor(1, 0), 1);
  assert.equal(levelFor(1, 19), 2);
  assert.equal(levelFor(8, 50), 10);
  assert.equal(gravityDelay(1), 850);
  assert.equal(gravityDelay(30), 80);
});

test('new games start with a full queue and an empty board', () => {
  const game = createGame();
  assert.equal(game.status, 'ready');
  assert.equal(game.queue.length, 13);
  assert.equal(game.x, SPAWN_X);
  assert.ok(game.board.every((row) => row.every((cell) => cell === 0)));
});

test('movement is blocked by walls and ignored unless playing', () => {
  let game = playing({ x: 0 });
  assert.equal(applyAction(game, 'left', 1), game);
  game = applyAction(game, 'right', 1);
  assert.equal(game.x, 1);
  const paused = { ...game, status: 'paused' as const };
  assert.equal(applyAction(paused, 'right', 1), paused);
});

test('pause toggles only between playing and paused', () => {
  const game = playing();
  assert.equal(applyAction(game, 'pause', 1).status, 'paused');
  assert.equal(applyAction(applyAction(game, 'pause', 1), 'pause', 1).status, 'playing');
  const over = { ...game, status: 'over' as const };
  assert.equal(applyAction(over, 'pause', 1), over);
});

test('rotation kicks away from the wall', () => {
  const game = playing({ type: I, shape: SHAPES[I].map((r) => [...r]), x: 6 });
  const vertical = applyAction(game, 'rotate', 1);
  assert.equal(vertical.shape.length, 4);
  const back = applyAction({ ...vertical, x: 8 }, 'rotate', 1);
  assert.equal(back.shape.length, 1);
  assert.equal(back.x, BOARD_WIDTH - 4);
});

test('soft drop scores one point per row; gravity scores nothing', () => {
  const game = playing();
  assert.equal(applyAction(game, 'down', 1).score, 1);
  assert.equal(applyAction(game, 'tick', 1).score, 0);
});

test('hard drop scores two per row, locks and spawns the next piece', () => {
  const game = playing();
  const next = applyAction(game, 'drop', 1);
  assert.equal(next.score, (BOARD_HEIGHT - 2) * 2);
  assert.equal(next.pieces, 1);
  assert.equal(next.placements, 1);
  assert.equal(next.type, I);
  assert.equal(next.board[BOARD_HEIGHT - 1][SPAWN_X], O + 1);
});

test('clearing lines scores by count and level', () => {
  const board = Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(0));
  for (const row of [18, 19])
    for (let x = 0; x < BOARD_WIDTH; x++) if (x < 3 || x > 4) board[row][x] = 1;
  const next = applyAction(playing({ board }), 'drop', 3);
  assert.equal(next.lines, 2);
  assert.equal(next.score, 300 * 3 + 18 * 2);
  assert.ok(next.board[19].every((cell) => cell === 0));
});

test('hold swaps once per piece', () => {
  const game = playing();
  const first = applyAction(game, 'hold', 1);
  assert.equal(first.held, O);
  assert.equal(first.type, I);
  assert.equal(applyAction(first, 'hold', 1), first);
  const afterLock = applyAction(first, 'drop', 1);
  const swapped = applyAction(afterLock, 'hold', 1);
  assert.equal(swapped.type, O);
  assert.equal(swapped.held, afterLock.type);
});

test('a blocked spawn ends the game and counts as a placement', () => {
  const board = Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(0));
  board[0][SPAWN_X] = 1;
  board[1][SPAWN_X] = 1;
  // Hold with an empty hold slot pulls the next piece, which can't enter.
  const held = applyAction(playing({ board, y: 5 }), 'hold', 1);
  assert.equal(held.status, 'over');
  assert.equal(held.placements, 1);
  // Locking into a blocked spawn also ends the game, counted once.
  const dropped = applyAction(playing({ board, y: 5, holdUsed: true }), 'drop', 1);
  assert.equal(dropped.status, 'over');
  assert.equal(dropped.placements, 1);
});
