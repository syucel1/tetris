import { useState, type FormEvent } from 'react';
import { Play, UserPlus, Users } from 'lucide-react';
import { MAX_NAME_LENGTH, type Profile } from '../profiles/profiles.ts';
import { StorageWarning } from './StorageWarning.tsx';

/** `opponentChoice` value meaning "a temporary guest". Empty string means solo. */
export const GUEST_OPPONENT = 'guest';

type LobbyProps = {
  profiles: Profile[];
  selectedId: string;
  activeProfileId: string;
  guestSelected: boolean;
  opponentChoice: string;
  isTwoPlayer: boolean;
  storageError: boolean;
  onOpponentChange: (choice: string) => void;
  onSelectProfile: (id: string) => void;
  onSelectGuest: () => void;
  /** Throws with a user-facing message when the name is invalid. */
  onCreateProfile: (name: string) => void;
  onPlay: () => void;
};

/** "Who's playing?" — choose or create a profile and an optional second player. */
export function Lobby({
  profiles,
  selectedId,
  activeProfileId,
  guestSelected,
  opponentChoice,
  isTwoPlayer,
  storageError,
  onOpponentChange,
  onSelectProfile,
  onSelectGuest,
  onCreateProfile,
  onPlay,
}: LobbyProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

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
          <p>Choose profiles for solo or two-player, one-piece-per-turn play.</p>
        </div>
        <label className="second-player">
          Second player
          <select value={opponentChoice} onChange={(e) => onOpponentChange(e.target.value)}>
            <option value="">Solo game</option>
            {profiles
              .filter((p) => p.id !== activeProfileId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.settings.name}
                </option>
              ))}
            <option value={GUEST_OPPONENT}>Guest (temporary)</option>
          </select>
        </label>
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
        <button className="primary lobby-play" onClick={onPlay}>
          <Play size={16} /> {isTwoPlayer ? 'Continue with 2 players' : 'Play solo'}
        </button>
        <p className="local-profile-note">
          Named profiles keep their own preferences and personal best in this browser. No password
          or login. Guest progress is temporary.
        </p>
      </main>
    </div>
  );
}
