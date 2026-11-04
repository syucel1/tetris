import type { SavedMatch } from '../recovery/recovery.ts';

export function RecoveryPrompt({
  match,
  onResume,
  onDiscard,
}: {
  match: SavedMatch;
  onResume: () => void;
  onDiscard: () => void;
}) {
  const players = match.boards.map((b) => b.profile.settings.name).join(' vs ');
  return (
    <div className="scores-backdrop">
      <section
        className="scores-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-title"
      >
        <div className="eyebrow">LOCAL CHECKPOINT</div>
        <h2 id="recovery-title">Resume your saved game?</h2>
        <p>
          {players} · Saved {new Date(match.savedAt).toLocaleString()}
        </p>
        <p>
          Restore the latest successful checkpoint. Play resumes paused, with no time charged while
          you were away.
        </p>
        <div className="recovery-actions">
          <button className="primary" autoFocus onClick={onResume}>
            Resume saved game
          </button>
          <button className="secondary" onClick={onDiscard}>
            Discard saved game
          </button>
        </div>
      </section>
    </div>
  );
}

type RecoveryStatusProps = {
  playing: boolean;
  hasGuest: boolean;
  guestConsent: boolean;
  savedAt: number;
  notice: string;
  onConsentChange: (consent: boolean) => void;
};

/** Thin status bar: guest consent checkbox plus the current save state or warning. */
export function RecoveryStatus({
  playing,
  hasGuest,
  guestConsent,
  savedAt,
  notice,
  onConsentChange,
}: RecoveryStatusProps) {
  let status = 'Recovery ready · saves when play starts';
  if (hasGuest && !guestConsent) status = 'Guest game · recovery off';
  else if (savedAt) status = 'Checkpoint saved locally · resumes paused';
  return (
    <div className="recovery-status">
      {hasGuest && (
        <label>
          <input
            type="checkbox"
            checked={guestConsent}
            onChange={(e) => onConsentChange(e.target.checked)}
          />{' '}
          Save this game for recovery, including Guest boards
        </label>
      )}
      {notice ? <span role="status">{notice}</span> : playing && <small>{status}</small>}
    </div>
  );
}
