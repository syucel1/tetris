/**
 * Versioned, validated crash-recovery checkpoints in localStorage.
 * The previous valid checkpoint is kept as a backup so a damaged write can fall back to it.
 */
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  PIECE_TYPE_COUNT,
  SHAPES,
  fits,
  rotate,
} from '../game/engine.ts';
import type { GameState } from '../game/gameState.ts';
import { PALETTE_NAMES } from '../ui/palettes.ts';
import {
  CONTROL_ACTIONS,
  MAX_DIFFICULTY,
  MAX_NAME_LENGTH,
  MIN_DIFFICULTY,
  SOUND_OPTIONS,
  THEMES,
  isGuestId,
  normalizeSettings,
  type Profile,
  type Settings,
} from '../profiles/profiles.ts';

export type BoardCheckpoint = {
  profile: Profile;
  game: GameState;
  /** Active play time in ms at the moment of the checkpoint. */
  elapsed: number;
  /** Personal best when the round started, for the end-of-round comparison. */
  previousBest: number;
};

export type SavedMatch = {
  version: 1;
  savedAt: number;
  mode: 'solo' | 'multiplayer';
  /** Index into `boards` of the player whose turn it is. */
  turn: number;
  guestConsent: boolean;
  boards: BoardCheckpoint[];
};

export type RecoveryLoadResult = { match: SavedMatch | null; warning?: string };

export const RECOVERY_KEY = 'tetris-recovery-v1';
export const BACKUP_KEY = RECOVERY_KEY + '-backup';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type UnknownRecord = Record<string, any>;

const MAX_QUEUE_LENGTH = 21;
const MAX_KEY_LENGTH = 32;

const isCount = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER;
const isInteger = (n: unknown): n is number => isCount(n) && Number.isInteger(n);
const isPieceType = (n: unknown): n is number => isInteger(n) && n < PIECE_TYPE_COUNT;
const isRecord = (v: unknown): v is UnknownRecord =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const includes = (options: readonly unknown[], value: unknown) => options.includes(value);

function isValidSettings(s: unknown): s is Settings {
  return (
    isRecord(s) &&
    typeof s.name === 'string' &&
    !!s.name.trim() &&
    s.name.length <= MAX_NAME_LENGTH &&
    includes(THEMES, s.theme) &&
    includes(PALETTE_NAMES, s.palette) &&
    isInteger(s.difficulty) &&
    s.difficulty >= MIN_DIFFICULTY &&
    s.difficulty <= MAX_DIFFICULTY &&
    isCount(s.volume) &&
    s.volume <= 100 &&
    includes(SOUND_OPTIONS, s.sound) &&
    ['animations', 'ghost', 'grid'].every((k) => typeof s[k] === 'boolean') &&
    isRecord(s.keys) &&
    CONTROL_ACTIONS.every(
      (action) =>
        typeof s.keys[action] === 'string' &&
        s.keys[action].length > 0 &&
        s.keys[action].length < MAX_KEY_LENGTH,
    )
  );
}

function isValidBoard(board: unknown): boolean {
  return (
    Array.isArray(board) &&
    board.length === BOARD_HEIGHT &&
    board.every(
      (row: unknown) =>
        Array.isArray(row) &&
        row.length === BOARD_WIDTH &&
        row.every((cell) => isInteger(cell) && cell <= PIECE_TYPE_COUNT),
    )
  );
}

/** The shape must be one of the four rotations of its piece type. */
function isRotationOf(type: number, shape: unknown): boolean {
  const target = JSON.stringify(shape);
  let rotation = SHAPES[type];
  for (let i = 0; i < 4; i++) {
    if (JSON.stringify(rotation) === target) return true;
    rotation = rotate(rotation);
  }
  return false;
}

function isValidGame(g: unknown): boolean {
  if (!isRecord(g)) return false;
  return (
    typeof g.id === 'string' &&
    !!g.id &&
    includes(['playing', 'paused', 'over'], g.status) &&
    ['score', 'lines', 'pieces', 'placements'].every((k) => isInteger(g[k])) &&
    g.placements >= g.pieces &&
    typeof g.holdUsed === 'boolean' &&
    isPieceType(g.type) &&
    (g.held === null || isPieceType(g.held)) &&
    Array.isArray(g.queue) &&
    g.queue.length >= 1 &&
    g.queue.length <= MAX_QUEUE_LENGTH &&
    g.queue.every(isPieceType) &&
    isValidBoard(g.board) &&
    isRotationOf(g.type, g.shape) &&
    Number.isInteger(g.x) &&
    g.x >= 0 &&
    g.x < BOARD_WIDTH &&
    Number.isInteger(g.y) &&
    g.y >= 0 &&
    g.y < BOARD_HEIGHT &&
    (g.status === 'over' || fits(g.board, g.shape, g.x, g.y))
  );
}

function isValidCheckpoint(b: unknown): b is BoardCheckpoint {
  return (
    isRecord(b) &&
    isRecord(b.profile) &&
    typeof b.profile.id === 'string' &&
    !!b.profile.id &&
    isValidSettings(b.profile.settings) &&
    isCount(b.profile.best) &&
    isCount(b.elapsed) &&
    isCount(b.previousBest) &&
    isValidGame(b.game)
  );
}

/** Structural validation of untrusted saved data. Also rejects matches with nothing left to play. */
export function validateMatch(value: unknown): value is SavedMatch {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !isCount(value.savedAt) ||
    !includes(['solo', 'multiplayer'], value.mode) ||
    typeof value.guestConsent !== 'boolean' ||
    !Array.isArray(value.boards) ||
    value.boards.length !== (value.mode === 'solo' ? 1 : 2) ||
    !isInteger(value.turn) ||
    value.turn >= value.boards.length
  )
    return false;

  const ids = new Set<string>();
  for (const board of value.boards) {
    if (!isValidCheckpoint(board) || ids.has(board.profile.id)) return false;
    if (isGuestId(board.profile.id) && !value.guestConsent) return false;
    ids.add(board.profile.id);
  }
  const boards = value.boards as BoardCheckpoint[];
  return boards[value.turn].game.status !== 'over';
}

const isDiscardMarker = (data: unknown) =>
  isRecord(data) && data.version === 1 && data.discarded === true;

/**
 * Loads the latest valid checkpoint, falling back to the backup when the primary is damaged.
 * Never throws: storage failures become a warning.
 */
export function loadRecovery(storage: StorageLike, profileIds: string[]): RecoveryLoadResult {
  try {
    let damaged = false;
    for (const key of [RECOVERY_KEY, BACKUP_KEY]) {
      const raw = storage.getItem(key);
      if (!raw) continue;
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch {
        damaged = true;
        continue;
      }
      if (isDiscardMarker(data)) return { match: null };
      if (!validateMatch(data)) {
        damaged = true;
        continue;
      }
      const missingProfile = data.boards.some(
        (b) => !isGuestId(b.profile.id) && !profileIds.includes(b.profile.id),
      );
      if (missingProfile)
        return {
          match: null,
          warning: 'A saved player profile is missing. Start a fresh game instead.',
        };
      return damaged
        ? {
            match: data,
            warning: 'The latest save was damaged. The previous valid checkpoint is available.',
          }
        : { match: data };
    }
    return damaged
      ? {
          match: null,
          warning: 'The saved game is damaged or incompatible. You can start a fresh game.',
        }
      : { match: null };
  } catch {
    return { match: null, warning: 'Browser storage is unavailable. Recovery cannot be loaded.' };
  }
}

/** Writes a checkpoint, first promoting the current valid one to the backup slot. */
export function saveRecovery(storage: StorageLike, match: SavedMatch): void {
  if (!validateMatch(match)) throw new Error('Invalid recovery checkpoint');
  const previous = storage.getItem(RECOVERY_KEY);
  if (previous && isParsableMatch(previous)) storage.setItem(BACKUP_KEY, previous);
  storage.setItem(RECOVERY_KEY, JSON.stringify(match));
}

function isParsableMatch(raw: string): boolean {
  try {
    return validateMatch(JSON.parse(raw));
  } catch {
    return false;
  }
}

/**
 * Writes a discard marker before removing the backup, so that if removal fails
 * the backup can't be resurrected on the next load.
 */
export function discardRecovery(storage: StorageLike): void {
  storage.setItem(RECOVERY_KEY, JSON.stringify({ version: 1, discarded: true }));
  storage.removeItem(BACKUP_KEY);
}

/** Prepares a saved board for play: normalised settings, and always resumes paused. */
export function restoreBoard(board: BoardCheckpoint): BoardCheckpoint {
  return {
    ...board,
    profile: { ...board.profile, settings: normalizeSettings(board.profile.settings) },
    game: { ...board.game, status: board.game.status === 'over' ? 'over' : 'paused' },
  };
}
