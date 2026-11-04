import { useEffect, useRef, useState } from 'react';
import {
  createProfile,
  defaultSettings,
  loadProfiles,
  PROFILE_KEY,
  type Profile,
} from './profiles';
import { Users, UserPlus, Play, ArrowLeft } from 'lucide-react';
import './profiles.css';
import { useRecovery } from './useRecovery';
import { type BoardCheckpoint } from './recovery';
import './recovery.css';
import { Navigation, type MenuItem } from './Navigation';
import { setLogPlayers, logEvent, errorDetails } from './logging';
export type PlayerGameProps = {
  profile: Profile;
  onProfileChange: (profile: Profile) => void;
  onBack: () => void;
  multiplayer?: boolean;
  active?: boolean;
  roundId?: number;
  paused?: boolean;
  onPause?: () => void;
  onStart?: () => void;
  onTurnEnd?: (over: boolean) => void;
  settingsRequest?: number;
  menuOpen?: boolean;
  checkpoint?: BoardCheckpoint;
  onCheckpoint?: (board: BoardCheckpoint, important?: boolean) => void;
  onNewGame?: () => void;
};
export function ProfileApp({ Game }: { Game: React.ComponentType<PlayerGameProps> }) {
  const [profiles, setProfiles] = useState(() => {
    try {
      return loadProfiles(localStorage);
    } catch {
      return [{ id: 'player-one', settings: { ...defaultSettings }, best: 0 }];
    }
  });
  const [selected, setSelected] = useState(() => {
    try {
      return localStorage.getItem('tetris-active-profile') || profiles[0].id;
    } catch {
      return profiles[0].id;
    }
  });
  const [guest, setGuest] = useState<Profile | null>(null);
  const [playing, setPlaying] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profiles));
      setSaveError(false);
    } catch (error) {
      if (!saveError)
        logEvent('WARN', 'profile_storage_unavailable', { error: errorDetails(error) });
      setSaveError(true);
    }
  }, [profiles]);
  const [menu, setMenu] = useState<MenuItem>('Home');
  const [scoresOpen, setScoresOpen] = useState(false);
  const [settingsRequest, setSettingsRequest] = useState(0);
  const [second, setSecond] = useState('');
  const [guestTwo, setGuestTwo] = useState<Profile>(() => ({
    id: 'guest-' + crypto.randomUUID(),
    settings: { ...defaultSettings, name: 'Guest 2' },
    best: 0,
  }));
  const [round, setRound] = useState(0);
  const [turn, setTurn] = useState(0);
  const [paused, setPaused] = useState(false);
  const [finished, setFinished] = useState<number[]>([]);
  const ended = useRef<number[]>([]);
  function update(p: Profile) {
    if (p.id === guestTwo.id) setGuestTwo(p);
    else if (p.id.startsWith('guest-')) setGuest(p);
    else setProfiles((all) => all.map((existing) => (existing.id === p.id ? p : existing)));
  }
  const active =
    guest?.id === selected ? guest : profiles.find((p) => p.id === selected) || profiles[0];
  function choose(id: string) {
    setSelected(id);
    setGuest(null);
    try {
      localStorage.setItem('tetris-active-profile', id);
    } catch {}
  }
  function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      const p = createProfile(name, profiles);
      setProfiles((all) => [...all, p]);
      choose(p.id);
      setName('');
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const opponent =
    second === 'guest' ? guestTwo : profiles.find((p) => p.id === second && p.id !== active.id);
  const multi = !!opponent;
  const players = opponent ? [active, opponent] : [active];
  useEffect(() => {
    setLogPlayers(playing ? players.map((p) => p.id) : []);
    return () => setLogPlayers([]);
  }, [playing, active.id, opponent?.id]);
  const recovery = useRecovery(
    playing,
    players,
    turn,
    profiles.map((p) => p.id),
  );
  const [restored, setRestored] = useState<Record<string, BoardCheckpoint>>({});
  function resumeSaved() {
    const match = recovery.resume();
    if (!match) return;
    const savedProfiles = match.boards.map((b) => b.profile);
    setProfiles((all) =>
      all.map((p) => {
        const saved = savedProfiles.find((saved) => saved.id === p.id);
        return saved ? { ...saved, best: Math.max(p.best, saved.best) } : p;
      }),
    );
    const first = savedProfiles[0];
    setSelected(first.id);
    setGuest(first.id.startsWith('guest-') ? first : null);
    if (match.mode === 'multiplayer') {
      const other = savedProfiles[1];
      setSecond(other.id.startsWith('guest-') ? 'guest' : other.id);
      if (other.id.startsWith('guest-')) setGuestTwo(other);
    } else setSecond('');
    setRestored(Object.fromEntries(match.boards.map((b) => [b.profile.id, b])));
    setRound(match.mode === 'multiplayer' ? 1 : 0);
    setTurn(match.turn);
    const over = match.boards.flatMap((b, i) => (b.game.status === 'over' ? [i] : []));
    ended.current = over;
    setFinished(over);
    setPaused(true);
    setPlaying(true);
    logEvent('INFO', 'game_recovery_restored', { playerIds: savedProfiles.map((p) => p.id) });
  }
  const recoveryPrompt = recovery.pending && (
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
          {recovery.pending.boards.map((b) => b.profile.settings.name).join(' vs ')} · Saved{' '}
          {new Date(recovery.pending.savedAt).toLocaleString()}
        </p>
        <p>
          Restore the latest successful checkpoint. Play resumes paused, with no time charged while
          you were away.
        </p>
        <div className="recovery-actions">
          <button className="primary" autoFocus onClick={resumeSaved}>
            Resume saved game
          </button>
          <button className="secondary" onClick={() => recovery.discard()}>
            Discard saved game
          </button>
        </div>
      </section>
    </div>
  );
  const recoveryInfo = (
    <div className="recovery-status">
      {players.some((p) => p.id.startsWith('guest-')) && (
        <label>
          <input
            type="checkbox"
            checked={recovery.guestConsent}
            onChange={(e) => recovery.consent(e.target.checked)}
          />{' '}
          Save this game for recovery, including Guest boards
        </label>
      )}
      {recovery.notice ? (
        <span role="status">{recovery.notice}</span>
      ) : (
        playing && (
          <small>
            {players.some((p) => p.id.startsWith('guest-')) && !recovery.guestConsent
              ? 'Guest game · recovery off'
              : recovery.savedAt
                ? 'Checkpoint saved locally · resumes paused'
                : 'Recovery ready · saves when play starts'}
          </small>
        )
      )}
    </div>
  );
  function start() {
    recovery.reset();
    setRestored({});
    ended.current = [];
    setFinished([]);
    setTurn(0);
    setPaused(false);
    setRound((n) => n + 1);
  }
  function advance(index: number, over: boolean) {
    if (over) ended.current = [...new Set([...ended.current, index])];
    setFinished([...ended.current]);
    const other = 1 - index;
    setTurn(ended.current.includes(other) ? index : other);
  }
  function back() {
    if (
      round > 0 &&
      finished.length < 2 &&
      !window.confirm('Leave this round? Boards reset; saved preferences and best scores are kept.')
    )
      return false;
    recovery.discard();
    setRestored({});
    setPlaying(false);
    setSettingsRequest(0);
    setRound(0);
    setPaused(false);
    setFinished([]);
    setGuest(null);
    if (active.id.startsWith('guest-')) setSelected(profiles[0].id);
    setGuestTwo({
      id: 'guest-' + crypto.randomUUID(),
      settings: { ...defaultSettings, name: 'Guest 2' },
      best: 0,
    });
    return true;
  }
  function navigate(item: MenuItem) {
    if (item === 'Scores') {
      setScoresOpen(true);
      if (playing && multi && round) setPaused(true);
      return;
    }
    if (item === 'Settings') {
      if (!playing) {
        setSecond('');
        setPlaying(true);
      }
      setSettingsRequest((n) => n + 1);
      return;
    }
    if (item === 'Single' || item === 'Versus') {
      if (playing && (item === 'Versus') === multi) {
        setMenu(item);
        return;
      }
      if (playing && back() === false) return;
      setSecond(item === 'Versus' ? (second && second !== active.id ? second : 'guest') : '');
      setPlaying(true);
      setMenu(item);
      return;
    }
    if (playing && back() === false) return;
    setMenu(item);
  }
  const navigation = (
    <Navigation active={playing ? (multi ? 'Versus' : 'Single') : menu} onNavigate={navigate} />
  );
  const scores = scoresOpen && (
    <div className="scores-backdrop" onClick={() => setScoresOpen(false)}>
      <section
        className="scores-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scores-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setScoresOpen(false);
        }}
      >
        <div className="scores-title">
          <h2 id="scores-title">Personal bests</h2>
          <button autoFocus onClick={() => setScoresOpen(false)}>
            Close
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>High score</th>
            </tr>
          </thead>
          <tbody>
            {[...profiles]
              .sort((a, b) => b.best - a.best)
              .map((p) => (
                <tr key={p.id}>
                  <td>{p.settings.name}</td>
                  <td>{p.best.toLocaleString()}</td>
                </tr>
              ))}
          </tbody>
        </table>
        <p>Saved scores on this device. Guest scores are temporary.</p>
      </section>
    </div>
  );
  if (playing)
    return (
      <>
        {navigation}
        {scores}
        {recoveryPrompt}
        {recoveryInfo}
        <div className={multi ? 'multiplayer-session' : 'single-session'}>
          {multi ? (
            <header className="session-toolbar">
              <h1>Tetris</h1>
              <span aria-live="polite">
                {finished.length === 2
                  ? 'Round complete'
                  : round === 0
                    ? 'One piece per turn'
                    : paused
                      ? 'Paused'
                      : `${players[turn].settings.name}’s turn`}
              </span>
              <div>
                <button onClick={back}>Players</button>
                <button
                  onClick={() => {
                    if (!round || finished.length === 2 || window.confirm('Restart both boards?'))
                      start();
                  }}
                >
                  {round ? 'New round' : 'Start round'}
                </button>
                <button
                  disabled={!round || finished.length === 2}
                  onClick={() => setPaused((p) => !p)}
                >
                  {paused ? 'Resume' : 'Pause'}
                </button>
              </div>
            </header>
          ) : (
            <button className="players-back" onClick={back}>
              <ArrowLeft size={14} /> Players
            </button>
          )}
          {saveError && (
            <div role="status" className="storage-error">
              Browser storage is unavailable. Changes will last for this session only.
            </div>
          )}
          <div className={multi ? 'multiplayer-boards' : ''}>
            {players.map((p, index) => (
              <section
                className={
                  multi
                    ? `player-seat ${turn === index && finished.length < 2 ? 'current-turn' : ''}`
                    : ''
                }
                key={p.id + (multi ? '-versus' : '-solo')}
              >
                {multi && (
                  <div className="seat-heading">
                    <strong>{p.settings.name}</strong>
                    <span>
                      {finished.includes(index)
                        ? 'Finished'
                        : !round
                          ? 'Ready'
                          : turn === index
                            ? 'Your turn'
                            : 'Waiting'}
                    </span>
                  </div>
                )}
                <Game
                  profile={p}
                  onProfileChange={update}
                  onBack={back}
                  multiplayer={multi}
                  active={!multi || turn === index}
                  roundId={round}
                  paused={paused}
                  onPause={() => setPaused((p) => !p)}
                  onStart={start}
                  onTurnEnd={(over) => advance(index, over)}
                  settingsRequest={index === 0 ? settingsRequest : 0}
                  menuOpen={scoresOpen}
                  checkpoint={restored[p.id]}
                  onCheckpoint={recovery.checkpoint}
                  onNewGame={recovery.reset}
                />
              </section>
            ))}
          </div>
        </div>
      </>
    );
  return (
    <>
      {navigation}
      {scores}
      {recoveryPrompt}
      {recoveryInfo}
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
            <select value={second} onChange={(e) => setSecond(e.target.value)}>
              <option value="">Solo game</option>
              {profiles
                .filter((p) => p.id !== active.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.settings.name}
                  </option>
                ))}
              <option value="guest">Guest (temporary)</option>
            </select>
          </label>
          <div className="profile-list">
            {profiles.map((p) => (
              <button
                key={p.id}
                className={`profile-option ${selected === p.id ? 'chosen' : ''}`}
                onClick={() => choose(p.id)}
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
              className={`profile-option ${selected === guest?.id ? 'chosen' : ''}`}
              onClick={() => {
                const p = {
                  id: 'guest-' + crypto.randomUUID(),
                  settings: { ...defaultSettings, name: 'Guest' },
                  best: 0,
                };
                setGuest(p);
                setSelected(p.id);
              }}
            >
              <span className="avatar">G</span>
              <span>
                <strong>Guest</strong>
                <small>Play without saving a profile</small>
              </span>
              <span className="selection-dot" />
            </button>
          </div>
          <form className="create-profile" onSubmit={add}>
            <label htmlFor="new-player">Create a player</label>
            <div>
              <input
                id="new-player"
                placeholder="Player name"
                maxLength={24}
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
          {saveError && (
            <p role="status" className="setting-help">
              Browser storage is unavailable. Changes will last for this session only.
            </p>
          )}
          <button
            className="primary lobby-play"
            onClick={() => {
              setPlaying(true);
              setRound(0);
              setFinished([]);
              setTurn(0);
            }}
          >
            <Play size={16} /> {multi ? 'Continue with 2 players' : 'Play solo'}
          </button>
          <p className="local-profile-note">
            Named profiles keep their own preferences and personal best in this browser. No password
            or login. Guest progress is temporary.
          </p>
        </main>
      </div>
    </>
  );
}
