import type { Profile } from '../profiles/profiles.ts';

type ScreenTooSmallDialogProps = {
  players: Profile[];
  /** How many boards the current window can show readably. */
  maxSeats: number;
  /** Removes the player in this seat (never seat 0). */
  onRemove: (seat: number) => void;
  onLeave: () => void;
};

/**
 * Shown while the window is too small for every board to stay readable. Play is paused
 * underneath; the dialog closes by itself once all boards fit again.
 */
export function ScreenTooSmallDialog({
  players,
  maxSeats,
  onRemove,
  onLeave,
}: ScreenTooSmallDialogProps) {
  const canRemove = players.length > 2;
  return (
    <div className="scores-backdrop">
      <section
        className="scores-dialog screen-too-small"
        role="dialog"
        aria-modal="true"
        aria-labelledby="too-small-title"
      >
        <div className="eyebrow">PLAY PAUSED</div>
        <h2 id="too-small-title">Not enough room for {players.length} boards</h2>
        <p>
          This window fits {maxSeats === 1 ? 'only one board' : `${maxSeats} boards`} at a readable
          size. Make the window larger or zoom out (Ctrl and −) to keep everyone playing: this
          message closes by itself once every board fits.
        </p>
        {canRemove && (
          <>
            <p>
              Or take a player out. Their board ends; their preferences and best score are kept.
            </p>
            <div className="too-small-seats">
              {players.slice(1).map((player, i) => (
                <button
                  key={player.id}
                  className="secondary"
                  onClick={() => {
                    if (window.confirm(`Remove ${player.settings.name} from this round?`))
                      onRemove(i + 1);
                  }}
                >
                  Remove {player.settings.name}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="recovery-actions">
          <button className="primary" onClick={onLeave}>
            Back to players
          </button>
        </div>
      </section>
    </div>
  );
}
