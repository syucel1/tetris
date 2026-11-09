import type { CSSProperties, ReactNode, RefObject } from 'react';
import { Layers, Pause, Play, Settings2 } from 'lucide-react';
import { BOARD_HEIGHT, BOARD_WIDTH } from '../game/engine.ts';
import type { GameState, GameStatus } from '../game/gameState.ts';

const BURST_PARTICLES = 24;

type StatusCopy = { banner: string; eyebrow: string; title: string; body: string; action: string };

const STATUS_COPY: Record<Exclude<GameStatus, 'playing'>, StatusCopy> = {
  ready: {
    banner: 'YOUR NEXT CHALLENGE',
    eyebrow: 'SYSTEM READY',
    title: 'Ready to play?',
    body: 'The classic you know. A new dimension.\nSet your pace. Make your move.',
    action: 'Launch game',
  },
  paused: {
    banner: 'TAKE A BREATH',
    eyebrow: 'A MOMENT TO RESET',
    title: 'On pause.',
    body: 'Your next piece can wait.\nPick up right where you left off.',
    action: 'Resume game',
  },
  over: {
    banner: 'YOUR NEXT CHALLENGE',
    eyebrow: 'NICE RUN',
    title: 'One more round?',
    body: 'Every round is a new beginning.',
    action: 'Play again',
  },
};

function ClearBurst({ lines, colors }: { lines: number; colors: readonly string[] }) {
  return (
    <div className="clear-burst" aria-hidden="true">
      <div className="burst-core" />
      {Array.from({ length: BURST_PARTICLES }, (_, i) => (
        <i
          key={i}
          style={
            {
              '--angle': (i * 360) / BURST_PARTICLES + 'deg',
              '--distance': 65 + (i % 5) * 22 + 'px',
              background: colors[i % colors.length],
            } as CSSProperties
          }
        />
      ))}
      <strong>
        {lines} LINE{lines > 1 ? 'S' : ''}
        <br />
        CLEAR
      </strong>
    </div>
  );
}

/**
 * A standard-match message for this player (ready check, waiting, result). Shown over the
 * board in place of the usual status overlay, whatever the board's status.
 */
export type BoardPrompt = {
  eyebrow: string;
  title: string;
  body: string;
  /** Omit for an informational prompt with no button. */
  action?: string;
  onAction?: () => void;
  /** Show the end-of-round metrics summary. */
  summary?: boolean;
  /** Marks the action as a toggled-on state (e.g. this player is ready). */
  pressed?: boolean;
};

function PromptOverlay({ prompt, summary }: { prompt: BoardPrompt; summary: ReactNode }) {
  return (
    <div className="overlay match-prompt">
      <div className="overlay-symbol">
        <Layers size={32} />
      </div>
      <span className="eyebrow">{prompt.eyebrow}</span>
      <h2 aria-live="polite">{prompt.title}</h2>
      <p>{prompt.body}</p>
      {prompt.summary && summary}
      {prompt.action && (
        <button
          className={prompt.pressed ? 'secondary' : 'primary'}
          aria-pressed={prompt.pressed}
          onClick={prompt.onAction}
        >
          {!prompt.pressed && <Play size={16} fill="currentColor" />}
          {prompt.action}
        </button>
      )}
    </div>
  );
}

type StatusOverlayProps = {
  game: GameState;
  summary: ReactNode;
  onPrimary: () => void;
  onCustomize: () => void;
};

function StatusOverlay({ game, summary, onPrimary, onCustomize }: StatusOverlayProps) {
  if (game.status === 'playing') return null;
  const copy = STATUS_COPY[game.status];
  const body =
    game.status === 'over'
      ? `You scored ${game.score.toLocaleString()} points.\n${copy.body}`
      : copy.body;
  return (
    <div className="overlay">
      <div className="overlay-symbol">
        <Layers size={32} />
      </div>
      <span className="eyebrow">{copy.eyebrow}</span>
      <h2>{copy.title}</h2>
      <p>{body}</p>
      {game.status === 'over' && summary}
      <button className="primary" onClick={onPrimary}>
        <Play size={16} fill="currentColor" />
        {copy.action}
      </button>
      {game.status === 'ready' && (
        <button className="text-button" onClick={onCustomize}>
          <Settings2 size={14} /> Customize your game
        </button>
      )}
      <small>{game.status === 'ready' ? 'Your preferences are saved automatically.' : ''}</small>
    </div>
  );
}

type BoardFrameProps = {
  game: GameState;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  colors: readonly string[];
  paletteName: string;
  pauseKeyLabel: string;
  /** Lines in the clear animation currently showing, or 0 for none. */
  burstLines: number;
  /** Shown over the board when it isn't this player's turn (multiplayer only). */
  turnShield: string | null;
  /** Standard-match message; replaces the status overlay and turn shield. */
  prompt?: BoardPrompt | null;
  summary: ReactNode;
  onPrimary: () => void;
  onTogglePause: () => void;
  onCustomize: () => void;
};

export function BoardFrame({
  game,
  canvasRef,
  colors,
  paletteName,
  pauseKeyLabel,
  burstLines,
  turnShield,
  prompt,
  summary,
  onPrimary,
  onTogglePause,
  onCustomize,
}: BoardFrameProps) {
  const banner = game.status === 'playing' ? 'IN THE FLOW' : STATUS_COPY[game.status].banner;
  const paused = game.status === 'paused';
  return (
    <section className={`board-frame ${burstLines ? 'flash' : ''}`} aria-label="Tetris game">
      <div className="board-top">
        <span>
          <i /> {banner}
        </span>
        <span>
          {BOARD_WIDTH} × {BOARD_HEIGHT}
        </span>
      </div>
      <div className="canvas-wrap">
        {turnShield && !prompt && (
          <div className="turn-shield">
            <strong>{turnShield}</strong>
          </div>
        )}
        <div className="board-scan" aria-hidden="true" />
        {burstLines > 0 && <ClearBurst lines={burstLines} colors={colors} />}
        <canvas ref={canvasRef} aria-label={`Game board. Score ${game.score}. ${game.status}`} />
        {prompt ? (
          <PromptOverlay prompt={prompt} summary={summary} />
        ) : (
          <StatusOverlay
            game={game}
            summary={summary}
            onPrimary={onPrimary}
            onCustomize={onCustomize}
          />
        )}
      </div>
      <div className="board-bottom">
        <span>
          <span className="purple-dot" /> {paletteName} theme
        </span>
        <button
          onClick={onTogglePause}
          disabled={game.status === 'ready' || game.status === 'over'}
        >
          {paused ? <Play size={14} /> : <Pause size={14} />} {paused ? 'Resume' : 'Pause'}{' '}
          <kbd>{pauseKeyLabel}</kbd>
        </button>
      </div>
    </section>
  );
}
