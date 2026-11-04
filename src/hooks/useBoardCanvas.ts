import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../game/gameState.ts';
import type { Settings } from '../profiles/profiles.ts';
import { drawBoard, LOGICAL_WIDTH } from '../ui/drawBoard.ts';

/** Keeps a canvas sized to its layout box and redraws whenever the game or look changes. */
export function useBoardCanvas(game: GameState, settings: Settings, colors: readonly string[]) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cssWidth, setCssWidth] = useState(LOGICAL_WIDTH);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) =>
      setCssWidth(Math.max(1, entry.contentRect.width)),
    );
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const { grid, ghost, theme } = settings;
  useEffect(() => {
    if (canvasRef.current)
      drawBoard(canvasRef.current, cssWidth, game, { grid, ghost, theme, colors });
  }, [game, grid, ghost, theme, colors, cssWidth]);

  return canvasRef;
}
