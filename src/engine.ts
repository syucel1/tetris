export type Matrix = number[][];
export const SHAPES: Matrix[] = [
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
export const emptyBoard = (): Matrix => Array.from({ length: 20 }, () => Array(10).fill(0));
export function fits(board: Matrix, shape: Matrix, x: number, y: number): boolean {
  return shape.every((row, dy) =>
    row.every(
      (v, dx) =>
        !v || (x + dx >= 0 && x + dx < 10 && y + dy < 20 && (y + dy < 0 || !board[y + dy][x + dx])),
    ),
  );
}
export const rotate = (m: Matrix): Matrix => m[0].map((_, i) => m.map((r) => r[i]).reverse());
export function clearLines(board: Matrix) {
  const remaining = board.filter((r) => r.some((v) => !v));
  const lines = 20 - remaining.length;
  return {
    board: [...Array.from({ length: lines }, () => Array(10).fill(0)), ...remaining],
    lines,
  };
}
export function bag() {
  const a = [0, 1, 2, 3, 4, 5, 6];
  for (let i = 6; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
