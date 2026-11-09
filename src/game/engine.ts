/**
 * Board and piece primitives. Everything here is pure and framework-free.
 *
 * Cells hold 0 for empty or a piece colour index 1–7 (piece type + 1).
 */
export type Matrix = number[][];

export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;
export const PIECE_TYPE_COUNT = 7;

/** I, J, L, O, S, T, Z — each cell value is the piece's colour index. */
export const SHAPES: readonly Matrix[] = [
  [[1, 1, 1, 1]],
  [
    [2, 0, 0],
    [2, 2, 2],
  ],
  [
    [0, 0, 3],
    [3, 3, 3],
  ],
  [
    [4, 4],
    [4, 4],
  ],
  [
    [0, 5, 5],
    [5, 5, 0],
  ],
  [
    [0, 6, 0],
    [6, 6, 6],
  ],
  [
    [7, 7, 0],
    [0, 7, 7],
  ],
];

const emptyRow = () => Array<number>(BOARD_WIDTH).fill(0);

export const createEmptyBoard = (): Matrix => Array.from({ length: BOARD_HEIGHT }, emptyRow);

/** True when `shape` placed with its top-left at (x, y) stays in bounds and overlaps no blocks. */
export function fits(board: Matrix, shape: Matrix, x: number, y: number): boolean {
  return shape.every((row, dy) =>
    row.every((cell, dx) => {
      if (!cell) return true;
      const col = x + dx;
      const rowIndex = y + dy;
      if (col < 0 || col >= BOARD_WIDTH || rowIndex >= BOARD_HEIGHT) return false;
      return rowIndex < 0 || !board[rowIndex][col];
    }),
  );
}

/** Rotates a matrix 90° clockwise. */
export const rotate = (matrix: Matrix): Matrix =>
  matrix[0].map((_, col) => matrix.map((row) => row[col]).reverse());

/** Removes every full row and pads the top with empty rows. */
export function clearLines(board: Matrix): { board: Matrix; lines: number } {
  const remaining = board.filter((row) => row.some((cell) => !cell));
  const lines = BOARD_HEIGHT - remaining.length;
  return { board: [...Array.from({ length: lines }, emptyRow), ...remaining], lines };
}

/**
 * One step of the mulberry32 generator: a value in [0, 1) and the next 32-bit state.
 * Small, fast and deterministic, so two boards given the same seed see the same pieces.
 */
export function nextRandom(state: number): [value: number, next: number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = Math.imul(next ^ (next >>> 15), next | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

/** A seven-bag drawn from a seeded generator, with the generator state that follows it. */
export function seededBag(seed: number): { bag: number[]; seed: number } {
  let state = seed >>> 0;
  const bag = createBag(() => {
    const [value, next] = nextRandom(state);
    state = next;
    return value;
  });
  return { bag, seed: state };
}

/** A Fisher–Yates shuffled "seven-bag" containing each piece type exactly once. */
export function createBag(random: () => number = Math.random): number[] {
  const bag = Array.from({ length: PIECE_TYPE_COUNT }, (_, type) => type);
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

/** Lowest row the shape can fall to from (x, y). */
export function dropRow(board: Matrix, shape: Matrix, x: number, y: number): number {
  let row = y;
  while (fits(board, shape, x, row + 1)) row++;
  return row;
}

/** Calls `visit` for every filled cell of a shape placed at (x, y). */
export function forEachCell(
  shape: Matrix,
  x: number,
  y: number,
  visit: (col: number, row: number, value: number) => void,
): void {
  shape.forEach((cells, dy) =>
    cells.forEach((value, dx) => {
      if (value) visit(x + dx, y + dy, value);
    }),
  );
}
