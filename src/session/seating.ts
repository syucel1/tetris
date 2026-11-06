/**
 * Shared-screen seating rules: how many boards fit on this display, how they are arranged,
 * whose turn is next, and whether players' keys clash when everyone plays at once.
 * Pure functions, unit tested; components supply the viewport size.
 */
import { CONTROL_ACTIONS, type ControlAction, type KeyBindings } from '../profiles/profiles.ts';

/** More than four people sharing one keyboard is impractical. */
export const MAX_LOCAL_PLAYERS = 4;
/**
 * Narrowest readable board in CSS px (10 cells wide, so 12px cells). Low enough that
 * two-player Versus keeps working on 360px-wide phones, as it did before seats were added.
 */
export const MIN_BOARD_WIDTH = 120;

export const PLAY_STYLES = ['turns', 'simultaneous'] as const;
export type PlayStyle = (typeof PLAY_STYLES)[number];

export const PLAY_STYLE_LABELS: Record<PlayStyle, string> = {
  turns: 'Alternating turns',
  simultaneous: 'Simultaneous',
};

/**
 * Space around the boards. The single-row allowance matches the two-player sizing the
 * session used before seats were added (the page may scroll a little to the touch controls).
 * Each extra row adds a full seat: heading, header, score and round cards, frame, controls.
 */
const SESSION_CHROME_HEIGHT = { wide: 355, narrow: 390 };
const EXTRA_ROW_HEIGHT = 390;
const NARROW_VIEWPORT = 800;
/** Seat border, padding and board frame, plus the gap between seats (compact on phones). */
const SEAT_CHROME_WIDTH = { wide: 60, compact: 55 };
const COMPACT_VIEWPORT = 650;

export type SeatLayout = {
  columns: number;
  rows: number;
  /** Board canvas width in CSS px (the board is twice as tall). */
  boardWidth: number;
  /** Whether every board is at least `MIN_BOARD_WIDTH` wide. */
  fits: boolean;
};

function boardWidthFor(count: number, rows: number, width: number, height: number) {
  const columns = Math.ceil(count / rows);
  const chrome =
    (width <= NARROW_VIEWPORT ? SESSION_CHROME_HEIGHT.narrow : SESSION_CHROME_HEIGHT.wide) +
    (rows - 1) * EXTRA_ROW_HEIGHT;
  const seatWidth = width <= COMPACT_VIEWPORT ? SEAT_CHROME_WIDTH.compact : SEAT_CHROME_WIDTH.wide;
  const byHeight = (height - chrome) / rows / 2;
  const byWidth = (width - columns * seatWidth) / columns;
  return { columns, boardWidth: Math.floor(Math.min(byHeight, byWidth)) };
}

/** Best arrangement for `count` boards: one row, or two rows when that gives larger boards. */
export function seatLayout(count: number, width: number, height: number): SeatLayout {
  const seats = Math.max(1, count);
  let best = { rows: 1, ...boardWidthFor(seats, 1, width, height) };
  if (seats >= 3) {
    const twoRows = { rows: 2, ...boardWidthFor(seats, 2, width, height) };
    if (twoRows.boardWidth > best.boardWidth) best = twoRows;
  }
  return { ...best, fits: best.boardWidth >= MIN_BOARD_WIDTH };
}

/** How many readable boards this viewport can hold (at least 1: solo always plays). */
export function maxSeatsFor(width: number, height: number): number {
  let seats = 1;
  for (let n = 2; n <= MAX_LOCAL_PLAYERS; n++) if (seatLayout(n, width, height).fits) seats = n;
  return seats;
}

/**
 * The seat that plays after `current`, skipping finished seats. Returns `current` when it is
 * the only seat still playing, and -1 when every seat has finished.
 */
export function nextTurn(current: number, count: number, finished: readonly number[]): number {
  for (let step = 1; step <= count; step++) {
    const seat = (current + step) % count;
    if (!finished.includes(seat)) return seat;
  }
  return -1;
}

/** Pause is session-wide, so sharing a pause key is harmless and is not a clash. */
const PLAY_ACTIONS = CONTROL_ACTIONS.filter((a) => a !== 'pause');

export type KeyClash = { key: string; seats: number[] };

/** Keys bound to a play action by more than one seat (case-insensitive, like the controls). */
export function keyClashes(bindings: readonly KeyBindings[]): KeyClash[] {
  const owners = new Map<string, { key: string; seats: Set<number> }>();
  bindings.forEach((keys, seat) => {
    for (const action of PLAY_ACTIONS) {
      const key = keys[action];
      const entry = owners.get(key.toLowerCase()) ?? { key, seats: new Set<number>() };
      owners.set(key.toLowerCase(), { ...entry, seats: entry.seats.add(seat) });
    }
  });
  return [...owners.values()]
    .filter(({ seats }) => seats.size > 1)
    .map(({ key, seats }) => ({ key, seats: [...seats].sort((a, b) => a - b) }));
}

type PlayKeys = Record<Exclude<ControlAction, 'pause'>, string>;

/** Non-overlapping layouts for simultaneous play on one keyboard. */
export const KEY_PRESETS: readonly PlayKeys[] = [
  {
    left: 'ArrowLeft',
    right: 'ArrowRight',
    rotate: 'ArrowUp',
    down: 'ArrowDown',
    drop: ' ',
    hold: 'c',
  },
  { left: 'a', right: 'd', rotate: 'w', down: 's', drop: 'q', hold: 'e' },
  { left: 'j', right: 'l', rotate: 'i', down: 'k', drop: 'u', hold: 'o' },
  { left: '4', right: '6', rotate: '8', down: '5', drop: '0', hold: '7' },
];

const playKeysOf = (keys: KeyBindings) =>
  new Set(PLAY_ACTIONS.map((action) => keys[action].toLowerCase()));

/**
 * Gives every seat whose keys clash with an earlier seat the first preset that is free.
 * Seats without a clash, and every pause key, are left unchanged.
 */
export function assignSeparateKeys(bindings: readonly KeyBindings[]): KeyBindings[] {
  const result: KeyBindings[] = [];
  for (const keys of bindings) {
    const taken = new Set(result.flatMap((k) => [...playKeysOf(k)]));
    const clashes = [...playKeysOf(keys)].some((key) => taken.has(key));
    const preset = clashes
      ? KEY_PRESETS.find((p) => Object.values(p).every((key) => !taken.has(key.toLowerCase())))
      : undefined;
    result.push(preset ? { ...keys, ...preset } : { ...keys });
  }
  return result;
}
