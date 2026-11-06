import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft } from 'lucide-react';
import { GUEST_SEAT, Lobby } from './components/Lobby.tsx';
import { Navigation, type MenuItem } from './components/Navigation.tsx';
import { PlayerGame } from './components/PlayerGame.tsx';
import { RecoveryPrompt, RecoveryStatus } from './components/RecoveryPanels.tsx';
import { ScoresDialog } from './components/ScoresDialog.tsx';
import { ScreenTooSmallDialog } from './components/ScreenTooSmallDialog.tsx';
import { StorageWarning } from './components/StorageWarning.tsx';
import { useViewportSize } from './hooks/useViewportSize.ts';
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
import {
  MAX_LOCAL_PLAYERS,
  assignSeparateKeys,
  keyClashes,
  maxSeatsFor,
  nextTurn,
  seatLayout,
  type PlayStyle,
} from './session/seating.ts';

/** Seats after the first: a saved profile (by id) or a temporary guest. */
type ExtraSeat = { kind: 'profile'; id: string } | { kind: 'guest'; profile: Profile };

function readStoredActiveProfile(fallback: string) {
  try {
    return localStorage.getItem(STORAGE_KEYS.activeProfile) || fallback;
  } catch {
    return fallback;
  }
}

/** "Guest 2", "Guest 3"…: the lowest number not already used by another guest seat. */
function newGuestSeat(seats: ExtraSeat[]): ExtraSeat {
  const names = new Set(
    seats.flatMap((s) => (s.kind === 'guest' ? [s.profile.settings.name] : [])),
  );
  let n = 2;
  while (names.has(`Guest ${n}`)) n++;
  return { kind: 'guest', profile: createGuest(`Guest ${n}`) };
}

/**
 * Top level: profiles and the lobby, plus the play session (solo, or 2–4 shared-screen seats
 * playing alternating turns or simultaneously), navigation and crash recovery.
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
  const [extraSeats, setExtraSeats] = useState<ExtraSeat[]>([]);
  const [playStyle, setPlayStyle] = useState<PlayStyle>('turns');
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
  const players: Profile[] = [activeProfile];
  for (const seat of extraSeats) {
    const profile = seat.kind === 'guest' ? seat.profile : profiles.find((p) => p.id === seat.id);
    if (profile && !players.some((p) => p.id === profile.id)) players.push(profile);
  }
  const isMultiplayer = players.length > 1;
  const isVersus = players.length === 2 && playStyle === 'turns';
  const simultaneous = isMultiplayer && playStyle === 'simultaneous';
  const hasGuest = players.some((p) => isGuestId(p.id));
  const clashes = simultaneous ? keyClashes(players.map((p) => p.settings.keys)) : [];

  const viewport = useViewportSize();
  const maxSeats = maxSeatsFor(viewport.width, viewport.height);
  const layout = seatLayout(players.length, viewport.width, viewport.height);

  function updateProfile(profile: Profile) {
    if (isGuestId(profile.id) && guest?.id === profile.id) setGuest(profile);
    else if (isGuestId(profile.id))
      setExtraSeats((seats) =>
        seats.map((s) =>
          s.kind === 'guest' && s.profile.id === profile.id ? { ...s, profile } : s,
        ),
      );
    else setProfiles((all) => all.map((p) => (p.id === profile.id ? profile : p)));
  }

  /** A profile can sit in only one seat: an extra seat holding it becomes a guest. */
  function freeSeatsUsing(id: string) {
    setExtraSeats((seats) =>
      seats.map((s, i) =>
        s.kind === 'profile' && s.id === id ? newGuestSeat(seats.filter((_, j) => j !== i)) : s,
      ),
    );
  }

  function selectProfile(id: string) {
    setSelectedId(id);
    setGuest(null);
    freeSeatsUsing(id);
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

  // ── Lobby seats ────────────────────────────────────────────────────────────
  function addSeat() {
    if (players.length >= Math.min(maxSeats, MAX_LOCAL_PLAYERS)) return;
    setExtraSeats((seats) => [...seats, newGuestSeat(seats)]);
  }

  /** `index` counts extra seats only (0 is the second player). */
  function changeSeat(index: number, choice: string) {
    setExtraSeats((seats) =>
      seats.map((s, i) => {
        if (i !== index) return s;
        if (choice !== GUEST_SEAT) return { kind: 'profile', id: choice };
        return s.kind === 'guest' ? s : newGuestSeat(seats.filter((_, j) => j !== i));
      }),
    );
  }

  function removeExtraSeat(index: number) {
    setExtraSeats((seats) => seats.filter((_, i) => i !== index));
  }

  /** Simultaneous play on one keyboard: give clashing players their own key sets. */
  function assignKeys() {
    const keys = assignSeparateKeys(players.map((p) => p.settings.keys));
    players.forEach((p, seat) => {
      if (JSON.stringify(keys[seat]) !== JSON.stringify(p.settings.keys))
        updateProfile({ ...p, settings: { ...p.settings, keys: keys[seat] } });
    });
  }

  // ── Session ────────────────────────────────────────────────────────────────
  const [playing, setPlaying] = useState(false);
  const [menu, setMenu] = useState<MenuItem>('Home');
  const [scoresOpen, setScoresOpen] = useState(false);
  const [settingsRequest, setSettingsRequest] = useState(0);
  /** Multiplayer round counter; 0 until the first round starts. */
  const [round, setRound] = useState(0);
  const [turn, setTurn] = useState(0);
  const [sessionPaused, setSessionPaused] = useState(false);
  /** Seat indexes whose boards have topped out this round. */
  const [finished, setFinished] = useState<number[]>([]);
  // Mirrors `finished` synchronously so consecutive turn ends see each other.
  const finishedRef = useRef<number[]>([]);
  const roundComplete = isMultiplayer && finished.length === players.length;
  const [restored, setRestored] = useState<Record<string, BoardCheckpoint>>({});
  const roundRunning = isMultiplayer && round > 0 && !roundComplete;
  const tooSmall = playing && isMultiplayer && !layout.fits;

  const playerIds = players.map((p) => p.id).join();
  useEffect(() => {
    setLogPlayers(playing ? players.map((p) => p.id) : []);
    return () => setLogPlayers([]);
  }, [playing, playerIds]);

  const recovery = useRecovery(
    { playing, players, turn, style: playStyle },
    profiles.map((p) => p.id),
  );

  // Shrinking the window below a readable size pauses play until the layout is adjusted.
  useEffect(() => {
    if (tooSmall && roundRunning && !sessionPaused) setSessionPaused(true);
  }, [tooSmall, roundRunning, sessionPaused]);

  // Several boards can hear the same pause key press; it toggles the session only once.
  const pauseToggled = useRef(false);
  function togglePause() {
    if (pauseToggled.current) return;
    pauseToggled.current = true;
    setTimeout(() => (pauseToggled.current = false), 0);
    if (sessionPaused && tooSmall) return;
    setSessionPaused((p) => !p);
  }

  function setFinishedSeats(seats: number[]) {
    finishedRef.current = seats;
    setFinished(seats);
  }

  function startRound() {
    recovery.reset();
    setRestored({});
    setFinishedSeats([]);
    setTurn(0);
    setSessionPaused(tooSmall);
    setRound((n) => n + 1);
  }

  function endTurn(seat: number, gameOver: boolean) {
    if (gameOver && !finishedRef.current.includes(seat))
      setFinishedSeats([...finishedRef.current, seat]);
    else setFinished([...finishedRef.current]);
    if (playStyle === 'simultaneous') return;
    // Finished players are skipped; the last one left keeps playing alone.
    const next = nextTurn(seat, players.length, finishedRef.current);
    setTurn(next === -1 ? seat : next);
  }

  /** Takes a player out mid-session (seat > 0). Their board ends; everyone else carries on. */
  function removeSeatInSession(seat: number) {
    const remaining = players.length - 1;
    const shifted = finishedRef.current
      .filter((s) => s !== seat)
      .map((s) => (s > seat ? s - 1 : s));
    setFinishedSeats(shifted);
    let nextSeat = turn > seat ? turn - 1 : turn === seat ? seat % remaining : turn;
    if (shifted.includes(nextSeat)) nextSeat = nextTurn(nextSeat, remaining, shifted);
    setTurn(Math.max(0, nextSeat));
    removeExtraSeat(seat - 1);
  }

  function enterSession() {
    setPlaying(true);
    setRound(0);
    setFinishedSeats([]);
    setTurn(0);
  }

  /** Back to the lobby. Returns false if the player cancels leaving a round in progress. */
  function leaveSession(): boolean {
    if (
      roundRunning &&
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
    // Guests are temporary: keep the seats, but with fresh guests.
    setExtraSeats((seats) =>
      seats.map((s) =>
        s.kind === 'guest' ? { kind: 'guest', profile: createGuest(s.profile.settings.name) } : s,
      ),
    );
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
    const [first, ...others] = savedProfiles;
    setSelectedId(first.id);
    setGuest(isGuestId(first.id) ? first : null);
    setExtraSeats(
      others.map(
        (p): ExtraSeat =>
          isGuestId(p.id) ? { kind: 'guest', profile: p } : { kind: 'profile', id: p.id },
      ),
    );
    setPlayStyle(match.style ?? 'turns');
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
        if (roundRunning) setSessionPaused(true);
        return;
      case 'Settings':
        if (!playing) {
          setExtraSeats([]);
          setPlaying(true);
        }
        setSettingsRequest((n) => n + 1);
        return;
      case 'Single':
      case 'Versus': {
        const wantsVersus = item === 'Versus';
        if (playing && (wantsVersus ? isVersus : !isMultiplayer)) {
          setMenu(item);
          return;
        }
        if (playing && !leaveSession()) return;
        // Versus is the classic two-player, alternating-turns match.
        setExtraSeats((seats) => (wantsVersus ? [seats[0] ?? newGuestSeat([])] : []));
        if (wantsVersus) setPlayStyle('turns');
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
        active={playing ? (!isMultiplayer ? 'Single' : isVersus ? 'Versus' : 'Players') : menu}
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
          guestSelected={guest !== null && guest.id === selectedId}
          players={players}
          seatChoices={extraSeats.map((s) => (s.kind === 'guest' ? GUEST_SEAT : s.id))}
          maxSeats={Math.min(maxSeats, MAX_LOCAL_PLAYERS)}
          playStyle={playStyle}
          clashes={clashes}
          storageError={storageError}
          onSelectProfile={selectProfile}
          onSelectGuest={selectGuest}
          onCreateProfile={addProfile}
          onAddSeat={addSeat}
          onChangeSeat={changeSeat}
          onRemoveSeat={removeExtraSeat}
          onPlayStyleChange={setPlayStyle}
          onAssignKeys={assignKeys}
          onPlay={enterSession}
        />
      </>
    );

  function sessionStatus() {
    if (roundComplete) return 'Round complete';
    if (round === 0) return simultaneous ? 'Everyone plays at once' : 'One piece per turn';
    if (sessionPaused) return 'Paused';
    if (simultaneous) return 'Everyone is playing';
    return `${players[turn]?.settings.name}’s turn`;
  }

  function seatStatus(seat: number) {
    if (finished.includes(seat)) return 'Finished';
    if (!round) return 'Ready';
    if (simultaneous) return sessionPaused ? 'Paused' : 'Playing';
    return turn === seat ? 'Your turn' : 'Waiting';
  }

  const seatStyle = {
    '--seat-columns': layout.columns,
    '--seat-board-width': `${Math.max(layout.boardWidth, 1)}px`,
  } as CSSProperties;

  return (
    <>
      {chrome}
      <div
        className={
          isMultiplayer ? `multiplayer-session seated seats-${players.length}` : 'single-session'
        }
        style={isMultiplayer ? seatStyle : undefined}
      >
        {isMultiplayer ? (
          <header className="session-toolbar">
            <h1>Tetris</h1>
            <span aria-live="polite">{sessionStatus()}</span>
            {clashes.length > 0 && (
              <span className="key-clash-note" role="status">
                Some players share keys — check Settings → Controls
              </span>
            )}
            <div>
              <button onClick={leaveSession}>Players</button>
              <button
                onClick={() => {
                  if (!roundRunning || window.confirm('Restart every board?')) startRound();
                }}
              >
                {round ? 'New round' : 'Start round'}
              </button>
              <button disabled={!roundRunning || (sessionPaused && tooSmall)} onClick={togglePause}>
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
        <div className={isMultiplayer ? 'multiplayer-boards' : ''}>
          {players.map((player, seat) => {
            const isCurrent = !roundComplete && (simultaneous ? round > 0 : turn === seat);
            return (
              <section
                className={
                  isMultiplayer
                    ? `player-seat ${isCurrent && !finished.includes(seat) ? 'current-turn' : ''}`
                    : ''
                }
                key={player.id + (isMultiplayer ? '-versus' : '-solo')}
              >
                {isMultiplayer && (
                  <div className="seat-heading">
                    <strong>{player.settings.name}</strong>
                    <span>{seatStatus(seat)}</span>
                  </div>
                )}
                <PlayerGame
                  profile={player}
                  onProfileChange={updateProfile}
                  multiplayer={isMultiplayer}
                  isMyTurn={!isMultiplayer || simultaneous || turn === seat}
                  round={round}
                  sessionPaused={sessionPaused}
                  onTogglePause={togglePause}
                  onPause={() => setSessionPaused(true)}
                  onStartRound={startRound}
                  onTurnEnd={(gameOver) => endTurn(seat, gameOver)}
                  settingsRequest={seat === 0 ? settingsRequest : 0}
                  dialogOpen={scoresOpen || tooSmall}
                  restoredCheckpoint={restored[player.id]}
                  onCheckpoint={recovery.checkpoint}
                  onNewGame={recovery.reset}
                />
              </section>
            );
          })}
        </div>
      </div>
      {tooSmall && (
        <ScreenTooSmallDialog
          players={players}
          maxSeats={maxSeats}
          onRemove={removeSeatInSession}
          onLeave={leaveSession}
        />
      )}
    </>
  );
}
