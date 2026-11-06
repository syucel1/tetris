import { useState, type FormEvent } from 'react';
import { Keyboard, Play, Plus, UserPlus, Users, X } from 'lucide-react';
import { MAX_NAME_LENGTH, type Profile } from '../profiles/profiles.ts';
import {
  MAX_LOCAL_PLAYERS,
  PLAY_STYLES,
  PLAY_STYLE_LABELS,
  type KeyClash,
  type PlayStyle,
} from '../session/seating.ts';
import { keyLabel } from '../ui/keyLabels.ts';
import { StorageWarning } from './StorageWarning.tsx';

/** Seat choice meaning "a temporary guest"; any other value is a profile id. */
export const GUEST_SEAT = 'guest';

const STYLE_HELP: Record<PlayStyle, string> = {
  turns: 'One piece per turn. Only the active board moves.',
  simultaneous: 'Every board plays at once. Each player needs their own keys.',
};

type LobbyProps = {
  profiles: Profile[];
  selectedId: string;
  guestSelected: boolean;
  /** Everyone seated, first player first. */
  players: Profile[];
  /** One entry per seat after the first: a profile id or `GUEST_SEAT`. */
  seatChoices: string[];
  /** Seats this window can show readably. */
  maxSeats: number;
  playStyle: PlayStyle;
  clashes: KeyClash[];
  storageError: boolean;
  onSelectProfile: (id: string) => void;
  onSelectGuest: () => void;
  /** Throws with a user-facing message when the name is invalid. */
  onCreateProfile: (name: string) => void;
  onAddSeat: () => void;
  onChangeSeat: (index: number, choice: string) => void;
  onRemoveSeat: (index: number) => void;
  onPlayStyleChange: (style: PlayStyle) => void;
  onAssignKeys: () => void;
  onPlay: () => void;
};

const listNames = (names: string[]) =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

/** "Who's playing?" — choose the first player, then add up to three more seats. */
export function Lobby({
  profiles,
  selectedId,
  guestSelected,
  players,
  seatChoices,
  maxSeats,
  playStyle,
  clashes,
  storageError,
  onSelectProfile,
  onSelectGuest,
  onCreateProfile,
  onAddSeat,
  onChangeSeat,
  onRemoveSeat,
  onPlayStyleChange,
  onAssignKeys,
  onPlay,
}: LobbyProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const count = players.length;
  const tooMany = count > maxSeats;
  const blocked = tooMany || clashes.length > 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      onCreateProfile(name);
      setName('');
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const seatName = (seat: number) => players[seat]?.settings.name ?? `Player ${seat + 1}`;

  return (
    <div className="profile-lobby app dark">
      <header>
        <h1 className="game-title">Tetris</h1>
        <span className="local-badge">Local profiles</span>
      </header>
      <main className="lobby-content">
        <div className="lobby-title">
          <Users size={24} />
          <h2>Who’s playing?</h2>
          <p>
            Choose the first player, then add up to {MAX_LOCAL_PLAYERS - 1} more to share the
            screen.
          </p>
        </div>

        <div className="profile-list">
          {profiles.map((p) => (
            <button
              key={p.id}
              className={`profile-option ${selectedId === p.id ? 'chosen' : ''}`}
              onClick={() => onSelectProfile(p.id)}
            >
              <span className="avatar">{p.settings.name.slice(0, 1).toUpperCase()}</span>
              <span>
                <strong>{p.settings.name}</strong>
                <small>
                  Best {p.best.toLocaleString()} · Level {p.settings.difficulty} ·{' '}
                  {p.settings.palette}
                </small>
              </span>
              <span className="selection-dot" />
            </button>
          ))}
          <button
            className={`profile-option ${guestSelected ? 'chosen' : ''}`}
            onClick={onSelectGuest}
          >
            <span className="avatar">G</span>
            <span>
              <strong>Guest</strong>
              <small>Play without saving a profile</small>
            </span>
            <span className="selection-dot" />
          </button>
        </div>
        <form className="create-profile" onSubmit={submit}>
          <label htmlFor="new-player">Create a player</label>
          <div>
            <input
              id="new-player"
              placeholder="Player name"
              maxLength={MAX_NAME_LENGTH}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
            />
            <button className="secondary" type="submit">
              <UserPlus size={16} /> Create
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
        </form>
        {storageError && <StorageWarning className="setting-help" as="p" />}
        <section className="seat-list" aria-label="Seats">
          <div className="seat-list-heading">
            <span>Players</span>
            <small>
              {count} of {maxSeats} for this screen
            </small>
          </div>
          <div className="seat-row first-seat">
            <span className="seat-number">1</span>
            <strong>{seatName(0)}</strong>
            <small>chosen above</small>
          </div>
          {seatChoices.map((choice, i) => {
            const taken = new Set([players[0].id, ...seatChoices.filter((_, j) => j !== i)]);
            return (
              <div className="seat-row" key={i}>
                <span className="seat-number">{i + 2}</span>
                <select
                  aria-label={`Player ${i + 2}`}
                  value={choice}
                  onChange={(e) => onChangeSeat(i, e.target.value)}
                >
                  {profiles
                    .filter((p) => !taken.has(p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.settings.name}
                      </option>
                    ))}
                  <option value={GUEST_SEAT}>
                    {choice === GUEST_SEAT ? seatName(i + 1) : 'Guest'} (temporary)
                  </option>
                </select>
                <button
                  className="seat-remove"
                  aria-label={`Remove player ${i + 2}`}
                  onClick={() => onRemoveSeat(i)}
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
          {count < MAX_LOCAL_PLAYERS && (
            <button className="secondary seat-add" disabled={count >= maxSeats} onClick={onAddSeat}>
              <Plus size={14} /> Add player
            </button>
          )}
          {count >= maxSeats && count < MAX_LOCAL_PLAYERS && !tooMany && (
            <p className="seat-hint">Make the window larger to fit more boards.</p>
          )}
          {tooMany && (
            <p className="seat-hint warning" role="alert">
              This window fits {maxSeats === 1 ? 'one board' : `${maxSeats} boards`} at a readable
              size. Make it larger or remove a player.
            </p>
          )}
        </section>

        {count > 1 && (
          <fieldset className="play-style">
            <legend>How to play</legend>
            {PLAY_STYLES.map((style) => (
              <label key={style} className={playStyle === style ? 'chosen' : ''}>
                <input
                  type="radio"
                  name="play-style"
                  value={style}
                  checked={playStyle === style}
                  onChange={() => onPlayStyleChange(style)}
                />
                <span>
                  <strong>{PLAY_STYLE_LABELS[style]}</strong>
                  <small>{STYLE_HELP[style]}</small>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {clashes.length > 0 && (
          <div className="key-clash" role="alert">
            <p>
              <Keyboard size={14} />{' '}
              {listNames([...new Set(clashes.flatMap((c) => c.seats))].map(seatName))} share keys (
              {clashes
                .slice(0, 5)
                .map((c) => keyLabel(c.key))
                .join(' ')}
              {clashes.length > 5 && ' …'}). Playing at once, everyone needs their own.
            </p>
            <button className="secondary" onClick={onAssignKeys}>
              Give each player separate keys
            </button>
          </div>
        )}

        <button className="primary lobby-play" disabled={blocked} onClick={onPlay}>
          <Play size={16} /> {count > 1 ? `Continue with ${count} players` : 'Play solo'}
        </button>
        <p className="local-profile-note">
          Named profiles keep their own preferences and personal best in this browser. No password
          or login. Guest progress is temporary.
        </p>
      </main>
    </div>
  );
}
