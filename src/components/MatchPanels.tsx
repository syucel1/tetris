import { Trophy } from 'lucide-react';
import { formatDuration, piecesPerMinute } from '../game/metrics.ts';
import type { BoardResult, MatchOutcome, MatchRules } from '../game/match.ts';
import { describeRules } from '../game/match.ts';

type MatchRulesStripProps = {
  rules: MatchRules;
  simultaneous: boolean;
  countdown: number | null;
  /** A rematch was asked for while a round is still running; offer to go back to it. */
  onCancel?: () => void;
};

/** Standard match, before the start: the shared rules both players are agreeing to. */
export function MatchRulesStrip({
  rules,
  simultaneous,
  countdown,
  onCancel,
}: MatchRulesStripProps) {
  return (
    <section className="match-strip" aria-label="Match rules">
      <strong className="match-strip-title">
        {countdown !== null ? `Starting in ${countdown}` : 'Standard match rules'}
      </strong>
      <ul>
        {describeRules(rules, simultaneous).map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
      {onCancel && (
        <button className="text-button" onClick={onCancel}>
          Back to the current round
        </button>
      )}
    </section>
  );
}

type MatchResultStripProps = {
  names: [string, string];
  results: [BoardResult, BoardResult];
  outcome: MatchOutcome;
};

/** Standard match, after both boards top out: the same result for both players. */
export function MatchResultStrip({ names, results, outcome }: MatchResultStripProps) {
  const headline =
    outcome.kind === 'tie'
      ? `Tie game — both scored ${outcome.score.toLocaleString()}`
      : `${names[outcome.winner]} wins by ${outcome.margin.toLocaleString()}`;
  return (
    <section className="match-strip match-result" aria-label="Match result">
      <strong className="match-strip-title" role="status">
        <Trophy size={14} /> {headline}
      </strong>
      <dl>
        {results.map((r, seat) => (
          <div
            key={seat}
            className={outcome.kind === 'win' && outcome.winner === seat ? 'winner' : ''}
          >
            <dt>{names[seat]}</dt>
            <dd>
              <b>{r.score.toLocaleString()}</b> · {r.lines} lines · {r.pieces} pieces ·{' '}
              {formatDuration(r.elapsed)} · {piecesPerMinute(r.pieces, r.elapsed)} PPM
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
