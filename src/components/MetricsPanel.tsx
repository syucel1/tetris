import { compareBest, formatDuration, piecesPerMinute } from '../game/metrics.ts';

type MetricsPanelProps = {
  elapsed: number;
  pieces: number;
  lines: number;
  score: number;
  previousBest: number;
  summary?: boolean;
};
/** Live "This round" card, or the end-of-round summary when `summary` is set. */
export function MetricsPanel({
  elapsed,
  pieces,
  lines,
  score,
  previousBest,
  summary = false,
}: MetricsPanelProps) {
  return (
    <section
      className={summary ? 'round-summary' : 'card metrics-panel'}
      aria-label={summary ? 'Round summary' : 'Game metrics'}
    >
      <div className="metrics-heading">
        {summary ? 'ROUND SUMMARY' : 'THIS ROUND'}
        {!summary && <span>ACTIVE PLAY</span>}
      </div>
      <dl className="metrics-grid">
        <div>
          <dt>Play time</dt>
          <dd>{formatDuration(elapsed)}</dd>
        </div>
        <div>
          <dt>Pieces placed</dt>
          <dd>{pieces.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Lines cleared</dt>
          <dd>{lines.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Pieces / min</dt>
          <dd>{piecesPerMinute(pieces, elapsed)}</dd>
        </div>
      </dl>
      {summary ? (
        <div className={`best-comparison ${score > previousBest ? 'new-best' : ''}`}>
          {compareBest(score, previousBest)}
        </div>
      ) : (
        <small>Pause and waiting time excluded</small>
      )}
    </section>
  );
}
