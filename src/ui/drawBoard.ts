import { BOARD_HEIGHT, BOARD_WIDTH, forEachCell } from '../game/engine.ts';
import { ghostRow, type GameState } from '../game/gameState.ts';
import type { Settings } from '../profiles/profiles.ts';

/** Drawing happens in a fixed logical coordinate space, scaled to the canvas size. */
export const CELL_SIZE = 30;
export const LOGICAL_WIDTH = BOARD_WIDTH * CELL_SIZE;
export const LOGICAL_HEIGHT = BOARD_HEIGHT * CELL_SIZE;
const BLOCK_INSET = 2;
const BLOCK_SIZE = CELL_SIZE - BLOCK_INSET * 2;

type DrawOptions = Pick<Settings, 'grid' | 'ghost' | 'theme'> & { colors: readonly string[] };

function drawGrid(ctx: CanvasRenderingContext2D, theme: Settings['theme']) {
  ctx.strokeStyle = theme === 'dark' ? '#28cfff20' : '#29194415';
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= LOGICAL_WIDTH; x += CELL_SIZE) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, LOGICAL_HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y <= LOGICAL_HEIGHT; y += CELL_SIZE) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(LOGICAL_WIDTH, y);
    ctx.stroke();
  }
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  color: string,
  ghost: boolean,
) {
  if (row < 0) return;
  const px = col * CELL_SIZE + BLOCK_INSET;
  const py = row * CELL_SIZE + BLOCK_INSET;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = ghost ? 0 : 12;
  if (ghost) {
    ctx.fillStyle = color + '10';
  } else {
    const fill = ctx.createLinearGradient(px, py, px + BLOCK_SIZE, py + BLOCK_SIZE);
    fill.addColorStop(0, color + 'b0');
    fill.addColorStop(0.45, color + '45');
    fill.addColorStop(1, color + '80');
    ctx.fillStyle = fill;
  }
  ctx.strokeStyle = ghost ? color + '70' : color;
  ctx.lineWidth = ghost ? 1 : 1.8;
  ctx.beginPath();
  ctx.roundRect(px, py, BLOCK_SIZE, BLOCK_SIZE, 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  if (!ghost) {
    // Inner bevel and top highlight.
    ctx.strokeStyle = '#ffffff70';
    ctx.lineWidth = 0.6;
    ctx.strokeRect(px + 2, py + 2, BLOCK_SIZE - 4, BLOCK_SIZE - 4);
    ctx.fillStyle = '#ffffff55';
    ctx.fillRect(px + 3, py + 2, BLOCK_SIZE - 6, 2);
  }
  ctx.restore();
}

/**
 * Renders the board, ghost and active piece. `cssWidth` is the canvas's CSS width;
 * the backing store is sized for the device pixel ratio.
 */
export function drawBoard(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  game: GameState,
  options: DrawOptions,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssWidth * (LOGICAL_HEIGHT / LOGICAL_WIDTH) * dpr);
  ctx.scale(canvas.width / LOGICAL_WIDTH, canvas.height / LOGICAL_HEIGHT);
  ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

  if (options.grid) drawGrid(ctx, options.theme);
  const colorOf = (value: number) => options.colors[value - 1];

  game.board.forEach((cells, row) =>
    cells.forEach((value, col) => {
      if (value) drawBlock(ctx, col, row, colorOf(value), false);
    }),
  );
  if (game.status === 'ready') return;
  if (options.ghost) {
    forEachCell(game.shape, game.x, ghostRow(game), (col, row, value) =>
      drawBlock(ctx, col, row, colorOf(value), true),
    );
  }
  forEachCell(game.shape, game.x, game.y, (col, row, value) =>
    drawBlock(ctx, col, row, colorOf(value), false),
  );
}
