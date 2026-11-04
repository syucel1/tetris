import { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { GUEST_OPPONENT, Lobby } from './components/Lobby.tsx';
import { Navigation, type MenuItem } from './components/Navigation.tsx';
import { PlayerGame } from './components/PlayerGame.tsx';
import { RecoveryPrompt, RecoveryStatus } from './components/RecoveryPanels.tsx';
import { ScoresDialog } from './components/ScoresDialog.tsx';
import { StorageWarning } from './components/StorageWarning.tsx';
import { errorDetails, logEvent, setLogPlayers } from './logging/logging.ts';
import {
  STORAGE_KEYS,
  createGuest,
  createProfile,
  defaultProfile,
  isGuestId,
  loadProfiles,
  type Profile,
} from './profiles/profiles.ts';
import type { BoardCheckpoint } from './recovery/recovery.ts';
import { useRecovery } from './recovery/useRecovery.ts';

const SECOND_GUEST_NAME = 'Guest 2';

function readStoredActiveProfile(fallback: string) {
  try {
    return localStorage.getItem(STORAGE_KEYS.activeProfile) || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Top level: profiles and the lobby, plus the play session (solo or two-player turns),
 * navigation and crash recovery.
 */
export function App() {
  // ── Profiles ───────────────────────────────────────────────────────────────
  const [profiles, setProfiles] = useState<Profile[]>(() => {
    try {
      return loadProfiles(localStorage);
    } catch {
      return [defaultProfile()];
    }
  });
  const [selectedId, setSelectedId] = useState(() => readStoredActiveProfile(profiles[0].id));
  /** The first player's temporary profile, when "Guest" is selected in the lobby. */
  const [guest, setGuest] = useState<Profile | null>(null);
  /** A second-player guest is always kept ready so selecting it is instant. */
  const [secondGuest, setSecondGuest] = useState(() => createGuest(SECOND_GUEST_NAME));
  /** '' for solo, GUEST_OPPONENT, or a profile id. */
  const [opponentChoice, setOpponentChoice] = useState('');
  const [storageError, setStorageError] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.profiles, JSON.stringify(profiles));
      setStorageError(false);
    } catch (error) {
      if (!storageError)
        logEvent('WARN', 'profile_storage_unavailable', { error: errorDetails(error) });
      setStorageError(true);
    }
  }, [profiles]);

  const activeProfile =
    guest?.id === selectedId ? guest : (profiles.find((p) => p.id === selectedId) ?? profiles[0]);
  const opponent =
    opponentChoice === GUEST_OPPONENT
      ? secondGuest
      : profiles.find((p) => p.id === opponentChoice && p.id !== activeProfile.id);
  const isTwoPlayer = !!opponent;
  const players = opponent ? [activeProfile, opponent] : [activeProfile];
  const hasGuest = players.some((p) => isGuestId(p.id));

  function updateProfile(profile: Profile) {
    if (profile.id === secondGuest.id) setSecondGuest(profile);
    else if (isGuestId(profile.id)) setGuest(profile);
    else setProfiles((all) => all.map((p) => (p.id === profile.id ? profile : p)));
  }

  function selectProfile(id: string) {
    setSelectedId(id);
    setGuest(null);
    try {
      localStorage.setItem(STORAGE_KEYS.activeProfile, id);
    } catch {
      // Not remembering the selection is harmless.
    }
  }

  function selectGuest() {
    const newGuest = createGuest();
    setGuest(newGuest);
    setSelectedId(newGuest.id);
  }

  function addProfile(name: string) {
    const profile = createProfile(name, profiles);
    setProfiles((all) => [...all, profile]);
    selectProfile(profile.id);
  }

  // ── Session ────────────────────────────────────────────────────────────────
  const [playing, setPlaying] = useState(false);
  const [menu, setMenu] = useState<MenuItem>('Home');
  const [scoresOpen, setScoresOpen] = useState(false);
  const [settingsRequest, setSettingsRequest] = useState(0);
  /** Two-player round counter; 0 until the first round starts. */
  const [round, setRound] = useState(0);
  const [turn, setTurn] = useState(0);
  const [sessionPaused, setSessionPaused] = useState(false);
  /** Seat indexes whose boards have topped out this round. */
  const [finished, setFinished] = useState<number[]>([]);
  // Mirrors `finished` synchronously so consecutive turn ends see each other.
  const finishedRef = useRef<number[]>([]);
  const roundComplete = isTwoPlayer && finished.length === 2;
  const [restored, setRestored] = useState<Record<string, BoardCheckpoint>>({});

  useEffect(() => {
    setLogPlayers(playing ? players.map((p) => p.id) : []);
    return () => setLogPlayers([]);
  }, [playing, activeProfile.id, opponent?.id]);

  const recovery = useRecovery(
    { playing, players, turn },
    profiles.map((p) => p.id),
  );

  function setFinishedSeats(seats: number[]) {
    finishedRef.current = seats;
    setFinished(seats);
  }

  function startRound() {
    recovery.reset();
    setRestored({});
    setFinishedSeats([]);
    setTurn(0);
    setSessionPaused(false);
    setRound((n) => n + 1);
  }

  function endTurn(seat: number, gameOver: boolean) {
    if (gameOver && !finishedRef.current.includes(seat))
      setFinishedSeats([...finishedRef.current, seat]);
    else setFinished([...finishedRef.current]);
    const other = 1 - seat;
    // A finished player is skipped; the remaining player keeps playing alone.
    setTurn(finishedRef.current.includes(other) ? seat : other);
  }

  function enterSession() {
    setPlaying(true);
    setRound(0);
    setFinishedSeats([]);
    setTurn(0);
  }

  /** Back to the lobby. Returns false if the player cancels leaving a round in progress. */
  function leaveSession(): boolean {
    const roundInProgress = round > 0 && !roundComplete;
    if (
      roundInProgress &&
      !window.confirm('Leave this round? Boards reset; saved preferences and best scores are kept.')
    )
      return false;
    recovery.discard();
    setRestored({});
    setPlaying(false);
    setSettingsRequest(0);
    setRound(0);
    setSessionPaused(false);
    setFinishedSeats([]);
    setGuest(null);
    if (isGuestId(activeProfile.id)) setSelectedId(profiles[0].id);
    setSecondGuest(createGuest(SECOND_GUEST_NAME));
    return true;
  }

  function resumeSavedMatch() {
    const match = recovery.resume();
    if (!match) return;
    const savedProfiles = match.boards.map((b) => b.profile);
    setProfiles((all) =>
      all.map((p) => {
        const saved = savedProfiles.find((s) => s.id === p.id);
        // Restoring an older checkpoint must never lower a personal best.
        return saved ? { ...saved, best: Math.max(p.best, saved.best) } : p;
      }),
    );
    const [first, second] = savedProfiles;
    setSelectedId(first.id);
    setGuest(isGuestId(first.id) ? first : null);
    if (second) {
      setOpponentChoice(isGuestId(second.id) ? GUEST_OPPONENT : second.id);
      if (isGuestId(second.id)) setSecondGuest(second);
    } else setOpponentChoice('');
    setRestored(Object.fromEntries(match.boards.map((b) => [b.profile.id, b])));
    setRound(match.mode === 'multiplayer' ? 1 : 0);
    setTurn(match.turn);
    setFinishedSeats(match.boards.flatMap((b, i) => (b.game.status === 'over' ? [i] : [])));
    setSessionPaused(true);
    setPlaying(true);
    logEvent('INFO', 'game_recovery_restored', { playerIds: savedProfiles.map((p) => p.id) });
  }

  function navigate(item: MenuItem) {
    switch (item) {
      case 'Scores':
        setScoresOpen(true);
        if (playing && isTwoPlayer && round) setSessionPaused(true);
        return;
      case 'Settings':
        if (!playing) {
          setOpponentChoice('');
          setPlaying(true);
        }
        setSettingsRequest((n) => n + 1);
        return;
      case 'Single':
      case 'Versus': {
        const wantsVersus = item === 'Versus';
        if (playing && wantsVersus === isTwoPlayer) {
          setMenu(item);
          return;
        }
        if (playing && !leaveSession()) return;
        const keepOpponent = opponentChoice && opponentChoice !== activeProfile.id;
        setOpponentChoice(wantsVersus ? (keepOpponent ? opponentChoice : GUEST_OPPONENT) : '');
        setPlaying(true);
        setMenu(item);
        return;
      }
      default:
        if (playing && !leaveSession()) return;
        setMenu(item);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const chrome = (
    <>
      <Navigation
        active={playing ? (isTwoPlayer ? 'Versus' : 'Single') : menu}
        onNavigate={navigate}
      />
      {scoresOpen && <ScoresDialog profiles={profiles} onClose={() => setScoresOpen(false)} />}
      {recovery.pending && (
        <RecoveryPrompt
          match={recovery.pending}
          onResume={resumeSavedMatch}
          onDiscard={recovery.discard}
        />
      )}
      <RecoveryStatus
        playing={playing}
        hasGuest={hasGuest}
        guestConsent={recovery.guestConsent}
        savedAt={recovery.savedAt}
        notice={recovery.notice}
        onConsentChange={recovery.setConsent}
      />
    </>
  );

  if (!playing)
    return (
      <>
        {chrome}
        <Lobby
          profiles={profiles}
          selectedId={selectedId}
          activeProfileId={activeProfile.id}
          guestSelected={guest !== null && guest.id === selectedId}
          opponentChoice={opponentChoice}
          isTwoPlayer={isTwoPlayer}
          storageError={storageError}
          onOpponentChange={setOpponentChoice}
          onSelectProfile={selectProfile}
          onSelectGuest={selectGuest}
          onCreateProfile={addProfile}
          onPlay={enterSession}
        />
      </>
    );

  function sessionStatus() {
    if (roundComplete) return 'Round complete';
    if (round === 0) return 'One piece per turn';
    if (sessionPaused) return 'Paused';
    return `${players[turn].settings.name}’s turn`;
  }

  function seatStatus(seat: number) {
    if (finished.includes(seat)) return 'Finished';
    if (!round) return 'Ready';
    return turn === seat ? 'Your turn' : 'Waiting';
  }

  return (
    <>
      {chrome}
      <div className={isTwoPlayer ? 'multiplayer-session' : 'single-session'}>
        {isTwoPlayer ? (
          <header className="session-toolbar">
            <h1>Tetris</h1>
            <span aria-live="polite">{sessionStatus()}</span>
            <div>
              <button onClick={leaveSession}>Players</button>
              <button
                onClick={() => {
                  if (!round || roundComplete || window.confirm('Restart both boards?'))
                    startRound();
                }}
              >
                {round ? 'New round' : 'Start round'}
              </button>
              <button
                disabled={!round || roundComplete}
                onClick={() => setSessionPaused((p) => !p)}
              >
                {sessionPaused ? 'Resume' : 'Pause'}
              </button>
            </div>
          </header>
        ) : (
          <button className="players-back" onClick={leaveSession}>
            <ArrowLeft size={14} /> Players
          </button>
        )}
        {storageError && <StorageWarning className="storage-error" />}
        <div className={isTwoPlayer ? 'multiplayer-boards' : ''}>
          {players.map((player, seat) => (
            <section
              className={
                isTwoPlayer
                  ? `player-seat ${turn === seat && !roundComplete ? 'current-turn' : ''}`
                  : ''
              }
              key={player.id + (isTwoPlayer ? '-versus' : '-solo')}
            >
              {isTwoPlayer && (
                <div className="seat-heading">
                  <strong>{player.settings.name}</strong>
                  <span>{seatStatus(seat)}</span>
                </div>
              )}
              <PlayerGame
                profile={player}
                onProfileChange={updateProfile}
                multiplayer={isTwoPlayer}
                isMyTurn={!isTwoPlayer || turn === seat}
                round={round}
                sessionPaused={sessionPaused}
                onTogglePause={() => setSessionPaused((p) => !p)}
                onStartRound={startRound}
                onTurnEnd={(gameOver) => endTurn(seat, gameOver)}
                settingsRequest={seat === 0 ? settingsRequest : 0}
                dialogOpen={scoresOpen}
                restoredCheckpoint={restored[player.id]}
                onCheckpoint={recovery.checkpoint}
                onNewGame={recovery.reset}
              />
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
