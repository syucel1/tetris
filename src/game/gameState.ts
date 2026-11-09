/**
 * The rules of a single board as a pure state machine: `applyAction(state, action)` → next state.
 * React components own timing, input and side effects; this module owns the rules.
 */
import {
  SHAPES,
  clearLines,
  createBag,
  createEmptyBoard,
  seededBag,
  dropRow,
  fits,
  forEachCell,
  rotate,
  type Matrix,
} from './engine.ts';

export type GameStatus = 'ready' | 'playing' | 'paused' | 'over';

/** Field names are persisted in recovery checkpoints; renaming them breaks saved games. */
export type GameState = {
  id: string;
  status: GameStatus;
  board: Matrix;
  /** Active piece type (index into SHAPES), its current rotation and position. */
  type: number;
  shape: Matrix;
  x: number;
  y: number;
  /** Upcoming piece types, refilled one bag at a time. */
  queue: number[];
  held: number | null;
  /** Hold may be used once per spawned piece. */
  holdUsed: boolean;
  score: number;
  lines: number;
  /** Pieces locked onto the board (shown in metrics). */
  pieces: number;
  /** Turn-ending events: locked pieces plus failed spawns. Drives multiplayer turn changes. */
  placements: number;
  /**
   * Piece-sequence generator state for standard matches, where both boards start from the same
   * seed and so receive identical pieces. Absent for casual and solo games (bags use Math.random).
   */
  seed?: number;
};

/** Every input the board reacts to. `tick` is gravity. */
export type GameAction = 'left' | 'right' | 'rotate' | 'down' | 'drop' | 'hold' | 'pause' | 'tick';

export const SPAWN_X = 3;
export const SPAWN_Y = 0;
export const MAX_LEVEL = 10;
export const LINES_PER_LEVEL = 10;
/** Points for clearing 0–4 lines at once, multiplied by the level. */
export const LINE_CLEAR_POINTS = [0, 100, 300, 500, 800] as const;
export const SOFT_DROP_POINTS = 1;
export const HARD_DROP_POINTS = 2;
/** The queue is topped up with a new bag once it falls below this length. */
const MIN_QUEUE_LENGTH = 8;
/** Horizontal offsets tried, in order, when a rotation collides. */
const WALL_KICKS = [0, -1, 1, -2, 2];

export function levelFor(startLevel: number, lines: number): number {
  return Math.min(MAX_LEVEL, startLevel + Math.floor(lines / LINES_PER_LEVEL));
}

/** Milliseconds between gravity ticks at a level. */
export function gravityDelay(level: number): number {
  return Math.max(80, 850 * Math.pow(0.77, level - 1));
}

/** A fresh board. Pass `seed` for a reproducible piece sequence (standard matches). */
export function createGame(status: GameStatus = 'ready', seed?: number): GameState {
  let queue: number[];
  let nextSeed = seed;
  if (seed === undefined) queue = [...createBag(), ...createBag()];
  else {
    const first = seededBag(seed);
    const second = seededBag(first.seed);
    queue = [...first.bag, ...second.bag];
    nextSeed = second.seed;
  }
  const type = queue.shift()!;
  return {
    id: crypto.randomUUID(),
    status,
    board: createEmptyBoard(),
    type,
    shape: SHAPES[type],
    x: SPAWN_X,
    y: SPAWN_Y,
    queue,
    held: null,
    holdUsed: false,
    score: 0,
    lines: 0,
    pieces: 0,
    placements: 0,
    ...(nextSeed !== undefined && { seed: nextSeed }),
  };
}

/** Appends the next bag, from the board's seeded generator when it has one. */
function refillQueue(game: GameState): Pick<GameState, 'queue' | 'seed'> {
  if (game.queue.length >= MIN_QUEUE_LENGTH) return { queue: game.queue, seed: game.seed };
  if (game.seed === undefined) return { queue: [...game.queue, ...createBag()], seed: undefined };
  const next = seededBag(game.seed);
  return { queue: [...game.queue, ...next.bag], seed: next.seed };
}

/** Places `type` at the spawn point; a blocked spawn ends the game. */
function enterPiece(game: GameState, type: number): GameState {
  const shape = SHAPES[type];
  const status = fits(game.board, shape, SPAWN_X, SPAWN_Y) ? 'playing' : 'over';
  return { ...game, type, shape, x: SPAWN_X, y: SPAWN_Y, status };
}

function spawnNext(game: GameState): GameState {
  const { queue, seed } = refillQueue(game);
  const [type, ...rest] = queue;
  const next: GameState = { ...game, queue: rest };
  if (seed !== undefined) next.seed = seed;
  return { ...enterPiece(next, type), holdUsed: false };
}

function lockPiece(game: GameState, startLevel: number): GameState {
  const board = game.board.map((row) => [...row]);
  let overflow = false;
  forEachCell(game.shape, game.x, game.y, (col, row, value) => {
    if (row < 0) overflow = true;
    else board[row][col] = value;
  });
  if (overflow) return { ...game, placements: game.placements + 1, status: 'over' };

  const cleared = clearLines(board);
  const level = levelFor(startLevel, game.lines);
  return spawnNext({
    ...game,
    board: cleared.board,
    lines: game.lines + cleared.lines,
    score: game.score + LINE_CLEAR_POINTS[cleared.lines] * level,
    pieces: game.pieces + 1,
    placements: game.placements + 1,
  });
}

function hold(game: GameState): GameState {
  if (game.holdUsed) return game;
  const next =
    game.held === null
      ? spawnNext({ ...game, held: game.type })
      : enterPiece({ ...game, held: game.type }, game.held);
  // A hold that tops out still ends the player's turn.
  return {
    ...next,
    holdUsed: true,
    placements: next.placements + (next.status === 'over' ? 1 : 0),
  };
}

function moveDown(game: GameState, startLevel: number, points: number): GameState {
  if (fits(game.board, game.shape, game.x, game.y + 1))
    return { ...game, y: game.y + 1, score: game.score + points };
  return lockPiece(game, startLevel);
}

export function togglePause(game: GameState): GameState {
  if (game.status === 'playing') return { ...game, status: 'paused' };
  if (game.status === 'paused') return { ...game, status: 'playing' };
  return game;
}

export function pause(game: GameState): GameState {
  return game.status === 'playing' ? { ...game, status: 'paused' } : game;
}

export function resume(game: GameState): GameState {
  return game.status === 'paused' ? { ...game, status: 'playing' } : game;
}

/** Applies one input. Returns the same object when nothing changes. */
export function applyAction(game: GameState, action: GameAction, startLevel: number): GameState {
  if (action === 'pause') return togglePause(game);
  if (game.status !== 'playing') return game;

  switch (action) {
    case 'left':
    case 'right': {
      const x = game.x + (action === 'left' ? -1 : 1);
      return fits(game.board, game.shape, x, game.y) ? { ...game, x } : game;
    }
    case 'rotate': {
      const shape = rotate(game.shape);
      const offset = WALL_KICKS.find((dx) => fits(game.board, shape, game.x + dx, game.y));
      return offset === undefined ? game : { ...game, shape, x: game.x + offset };
    }
    case 'hold':
      return hold(game);
    case 'drop': {
      const y = dropRow(game.board, game.shape, game.x, game.y);
      return lockPiece(
        { ...game, y, score: game.score + (y - game.y) * HARD_DROP_POINTS },
        startLevel,
      );
    }
    case 'down':
      return moveDown(game, startLevel, SOFT_DROP_POINTS);
    case 'tick':
      return moveDown(game, startLevel, 0);
  }
}

/** Row where the active piece would land; used for the ghost piece. */
export const ghostRow = (game: GameState) => dropRow(game.board, game.shape, game.x, game.y);
