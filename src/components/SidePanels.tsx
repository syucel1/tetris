import { Keyboard, Sparkles, Trophy } from 'lucide-react';
import { LINES_PER_LEVEL, MAX_LEVEL, type GameState } from '../game/gameState.ts';
import type { KeyBindings } from '../profiles/profiles.ts';
import { keyLabel } from '../ui/keyLabels.ts';
import { PiecePreview } from './PiecePreview.tsx';

const NEXT_PIECE_COUNT = 3;

export function ScoreCard({ game, best, level }: { game: GameState; best: number; level: number }) {
  const linesIntoLevel = game.lines % LINES_PER_LEVEL;
  return (
    <section className="card score-card">
      <div className="label">
        YOUR SCORE <Sparkles size={14} />
      </div>
      <div className="score">{game.score.toLocaleString().padStart(6, '0')}</div>
      <div className="best">
        <Trophy size={14} />
        <span>Personal best</span>
        <strong>{best.toLocaleString()}</strong>
      </div>
      <div className="stats">
        <div>
          <span>LEVEL</span>
          <strong>{String(level).padStart(2, '0')}</strong>
        </div>
        <div>
          <span>LINES</span>
          <strong>{String(game.lines).padStart(2, '0')}</strong>
        </div>
      </div>
      <div className="progress">
        <i style={{ width: `${(linesIntoLevel / LINES_PER_LEVEL) * 100}%` }} />
      </div>
      <small className="muted">
        {LINES_PER_LEVEL - linesIntoLevel} lines to next level
        {level === MAX_LEVEL ? ' · max speed' : ''}
      </small>
    </section>
  );
}

export function HoldCard({
  held,
  holdKey,
  colors,
}: {
  held: number | null;
  holdKey: string;
  colors: readonly string[];
}) {
  return (
    <section className="card hold-card">
      <div className="label">
        HOLD <kbd>{keyLabel(holdKey)}</kbd>
      </div>
      <PiecePreview type={held} colors={colors} />
      <small className="muted">Save a piece for later</small>
    </section>
  );
}

export function NextPiecesCard({ queue, colors }: { queue: number[]; colors: readonly string[] }) {
  return (
    <section className="card next-card">
      <div className="label">
        UP NEXT <span className="tag">{NEXT_PIECE_COUNT}</span>
      </div>
      {queue.slice(0, NEXT_PIECE_COUNT).map((type, i) => (
        <div className={`next-piece next-${i}`} key={i}>
          <PiecePreview type={type} colors={colors} />
        </div>
      ))}
    </section>
  );
}

export function ControlsCard({ keys }: { keys: KeyBindings }) {
  const rows = [
    ['Move', `${keyLabel(keys.left)} ${keyLabel(keys.right)}`],
    ['Rotate', keyLabel(keys.rotate)],
    ['Soft drop', keyLabel(keys.down)],
    ['Hard drop', keyLabel(keys.drop)],
    ['Hold piece', keyLabel(keys.hold)],
    ['Pause', keyLabel(keys.pause)],
  ];
  return (
    <section className="card controls-card">
      <div className="label">
        <Keyboard size={15} /> HOW TO PLAY
      </div>
      {rows.map(([label, key]) => (
        <div className="control" key={label}>
          <span>{label}</span>
          <kbd>{key}</kbd>
        </div>
      ))}
    </section>
  );
}
