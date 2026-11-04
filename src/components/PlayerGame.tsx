import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  RotateCcw,
  RotateCw,
  Settings2,
  Volume2,
} from 'lucide-react';
import {
  applyAction,
  createGame,
  gravityDelay,
  levelFor,
  pause,
  resume,
  type GameAction,
  type GameState,
} from '../game/gameState.ts';
import { useBoardCanvas } from '../hooks/useBoardCanvas.ts';
import { useKeyboardControls } from '../hooks/useKeyboardControls.ts';
import { usePlayClock } from '../hooks/usePlayClock.ts';
import { createGameLifecycleLogger } from '../logging/logging.ts';
import type { Profile, Settings } from '../profiles/profiles.ts';
import { restoreBoard, type BoardCheckpoint } from '../recovery/recovery.ts';
import { keyLabel } from '../ui/keyLabels.ts';
import { playLineClearSound } from '../ui/lineClearSound.ts';
import { paletteColors } from '../ui/palettes.ts';
import { BoardFrame } from './BoardFrame.tsx';
import { MetricsPanel } from './MetricsPanel.tsx';
import { SettingsModal, type UpdateSetting } from './SettingsModal.tsx';
import { ControlsCard, HoldCard, NextPiecesCard, ScoreCard } from './SidePanels.tsx';

const CLEAR_ANIMATION_MS = 700;
/** Movement-only progress is checkpointed on this interval rather than on every move. */
const ACTIVE_CHECKPOINT_MS = 2000;

export type PlayerGameProps = {
  profile: Profile;
  onProfileChange: (profile: Profile) => void;
  /** Two-board, one-piece-per-turn mode. Turn and pause state are then owned by the session. */
  multiplayer?: boolean;
  /** Multiplayer: whether it is this board's turn. */
  isMyTurn?: boolean;
  /** Multiplayer round counter; 0 before the first round. A change starts a new game. */
  round?: number;
  /** Multiplayer: the shared pause state. */
  sessionPaused?: boolean;
  onTogglePause?: () => void;
  onStartRound?: () => void;
  /** Multiplayer: called after every placement, with whether this board just topped out. */
  onTurnEnd?: (gameOver: boolean) => void;
  /** Incrementing this opens the settings dialog. */
  settingsRequest?: number;
  /** Another dialog (e.g. scores) covers the game; solo play pauses and the clock stops. */
  dialogOpen?: boolean;
  restoredCheckpoint?: BoardCheckpoint;
  onCheckpoint?: (board: BoardCheckpoint, important?: boolean) => void;
  /** Solo: a fresh game is starting. */
  onNewGame?: () => void;
};

/** One player's board, side panels and settings. */
export function PlayerGame({
  profile,
  onProfileChange,
  multiplayer = false,
  isMyTurn = true,
  round = 0,
  sessionPaused = false,
  onTogglePause,
  onStartRound,
  onTurnEnd,
  settingsRequest = 0,
  dialogOpen = false,
  restoredCheckpoint,
  onCheckpoint,
  onNewGame,
}: PlayerGameProps) {
  const [settings, setSettings] = useState<Settings>(() => ({
    ...(restoredCheckpoint?.profile.settings ?? profile.settings),
  }));
  const [game, setGame] = useState<GameState>(() =>
    restoredCheckpoint ? restoreBoard(restoredCheckpoint).game : createGame(),
  );
  const [best, setBest] = useState(profile.best);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [burstLines, setBurstLines] = useState(0);
  const gameRef = useRef(game);
  gameRef.current = game;

  /** In multiplayer, input and gravity only run on this player's unpaused turn. */
  const canAct = !multiplayer || (isMyTurn && !sessionPaused);
  const colors = paletteColors(settings.palette);
  const level = levelFor(settings.difficulty, game.lines);

  const updateSetting: UpdateSetting = (key, value) => setSettings((s) => ({ ...s, [key]: value }));

  // ── Profile and personal best ──────────────────────────────────────────────
  useEffect(() => {
    onProfileChange({ ...profile, settings, best });
  }, [settings, best]);

  useEffect(() => {
    if (game.score > best) setBest(game.score);
  }, [game.score, best]);

  // ── Lifecycle logging ──────────────────────────────────────────────────────
  const [logLifecycle] = useState(() =>
    createGameLifecycleLogger({ playerId: profile.id, mode: multiplayer ? 'multiplayer' : 'solo' }),
  );
  useEffect(() => {
    const sharedPause = multiplayer && sessionPaused && game.status === 'playing';
    logLifecycle({ ...game, status: sharedPause ? 'paused' : game.status });
  }, [game.id, game.status, multiplayer, sessionPaused]);

  // ── Round metrics ──────────────────────────────────────────────────────────
  const roundStartBest = useRef(profile.best);
  const restoredFor = (gameId: string) =>
    restoredCheckpoint?.game.id === gameId ? restoredCheckpoint : undefined;
  const clockRunning = game.status === 'playing' && canAct && !settingsOpen && !dialogOpen;
  const { elapsed, readElapsed } = usePlayClock(game.id, clockRunning, () => {
    const saved = restoredFor(game.id);
    roundStartBest.current = saved?.previousBest ?? best;
    return saved?.elapsed ?? 0;
  });
  const metrics = {
    elapsed,
    pieces: game.pieces,
    lines: game.lines,
    score: game.score,
    previousBest: roundStartBest.current,
  };

  // ── Line-clear feedback (sound + burst), derived from the lines counter ─────
  const linesSeen = useRef({ id: game.id, lines: game.lines });
  useEffect(() => {
    const seen = linesSeen.current;
    linesSeen.current = { id: game.id, lines: game.lines };
    const cleared = seen.id === game.id ? game.lines - seen.lines : 0;
    if (cleared <= 0) return;
    playLineClearSound(settings.sound, settings.volume);
    if (!settings.animations) return;
    setBurstLines(cleared);
    const timer = setTimeout(() => setBurstLines(0), CLEAR_ANIMATION_MS);
    return () => {
      clearTimeout(timer);
      setBurstLines(0);
    };
  }, [game.id, game.lines]);

  // ── Input and gravity ──────────────────────────────────────────────────────
  function dispatch(action: GameAction) {
    if (multiplayer && action === 'pause') {
      onTogglePause?.();
      return;
    }
    if (!canAct) return;
    setGame((g) => applyAction(g, action, settings.difficulty));
  }
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  useKeyboardControls(settings.keys, canAct, dispatch);

  useEffect(() => {
    if (game.status !== 'playing' || !canAct) return;
    const timer = setInterval(() => dispatchRef.current('tick'), gravityDelay(level));
    return () => clearInterval(timer);
  }, [game.status, level, canAct]);

  // Losing window focus pauses play.
  useEffect(() => {
    const onBlur = () => {
      if (!multiplayer) setGame(pause);
      else if (canAct && gameRef.current.status === 'playing') onTogglePause?.();
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [multiplayer, canAct]);

  // ── Starting, pausing and settings ─────────────────────────────────────────
  function startNewGame() {
    if (multiplayer) {
      onStartRound?.();
      return;
    }
    onNewGame?.();
    setGame(createGame('playing'));
  }

  function confirmRestart() {
    const inProgress = game.status === 'playing' || game.status === 'paused';
    if (!inProgress || window.confirm('Start a fresh game? Your current round will end.'))
      startNewGame();
  }

  function openSettings() {
    if (!multiplayer) setGame(pause);
    else if (!sessionPaused && round) onTogglePause?.();
    setSettingsOpen(true);
  }

  useEffect(() => {
    if (settingsRequest) openSettings();
  }, [settingsRequest]);

  useEffect(() => {
    if (dialogOpen && !multiplayer) setGame(pause);
  }, [dialogOpen, multiplayer]);

  // ── Multiplayer round and turn handling ────────────────────────────────────
  const reportedPlacements = useRef(restoredCheckpoint?.game.placements ?? 0);
  const restoredRound = useRef(restoredCheckpoint ? round : -1);
  useEffect(() => {
    if (multiplayer && round && round !== restoredRound.current) {
      reportedPlacements.current = 0;
      setGame(createGame('playing'));
    }
  }, [round, multiplayer]);

  useEffect(() => {
    if (multiplayer && game.placements > reportedPlacements.current) {
      reportedPlacements.current = game.placements;
      onTurnEnd?.(game.status === 'over');
    }
  }, [game.placements, game.status, multiplayer]);

  useEffect(() => {
    if (multiplayer && !sessionPaused && round) setGame(resume);
  }, [multiplayer, sessionPaused, round]);

  // ── Recovery checkpoints ───────────────────────────────────────────────────
  const buildCheckpoint = (): BoardCheckpoint => ({
    profile: { ...profile, settings, best: Math.max(best, game.score) },
    game,
    elapsed: readElapsed(),
    previousBest: roundStartBest.current,
  });

  // Every state change is offered to recovery; new games, placements and status changes save now.
  const lastCheckpointed = useRef({ id: '', placements: -1, status: '' });
  useEffect(() => {
    const last = lastCheckpointed.current;
    const important =
      last.id !== game.id || last.placements !== game.placements || last.status !== game.status;
    lastCheckpointed.current = { id: game.id, placements: game.placements, status: game.status };
    onCheckpoint?.(buildCheckpoint(), important);
  }, [game, settings, best, isMyTurn, sessionPaused]);

  // While actively playing, refresh the elapsed time periodically and when the page is hidden.
  const captureActive = useRef(() => {});
  captureActive.current = () => {
    if (game.status === 'playing' && canAct) onCheckpoint?.(buildCheckpoint(), false);
  };
  useEffect(() => {
    const capture = () => captureActive.current();
    const timer = setInterval(capture, ACTIVE_CHECKPOINT_MS);
    window.addEventListener('pagehide', capture);
    return () => {
      clearInterval(timer);
      window.removeEventListener('pagehide', capture);
    };
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  const canvasRef = useBoardCanvas(game, settings, colors);
  const turnShield =
    multiplayer && game.status === 'playing' && !canAct
      ? sessionPaused
        ? 'Paused'
        : 'Waiting for your turn'
      : null;

  return (
    <div className={`app ${settings.theme} ${!settings.animations ? 'no-motion' : ''}`}>
      <header>
        <h1 className="game-title">Tetris</h1>
        <div className="header-actions">
          <button className="secondary" onClick={openSettings}>
            <Settings2 size={16} /> Settings
          </button>
          <button className="profile" onClick={openSettings}>
            <span className="avatar">{settings.name.slice(0, 1).toUpperCase() || 'P'}</span>
            <span>{settings.name}</span>
            <ChevronDown size={14} />
          </button>
        </div>
      </header>
      <div className="arcade-scene" aria-hidden="true">
        <div className="tunnel tunnel-left" />
        <div className="tunnel tunnel-right" />
        <div className="tunnel-floor" />
        <div className="scan-rays" />
        <div className="floating-block block-a" />
        <div className="floating-block block-b" />
        <div className="floating-block block-c" />
      </div>
      <main>
        <div className="game-layout">
          <aside className="left-rail">
            <ScoreCard game={game} best={best} level={level} />
            <HoldCard held={game.held} holdKey={settings.keys.hold} colors={colors} />
            <MetricsPanel {...metrics} />
          </aside>
          <BoardFrame
            game={game}
            canvasRef={canvasRef}
            colors={colors}
            paletteName={settings.palette}
            pauseKeyLabel={keyLabel(settings.keys.pause)}
            burstLines={burstLines}
            turnShield={turnShield}
            summary={<MetricsPanel {...metrics} summary />}
            onPrimary={() => (game.status === 'paused' ? dispatch('pause') : startNewGame())}
            onTogglePause={() => dispatch('pause')}
            onCustomize={openSettings}
          />
          <aside className="right-rail">
            <NextPiecesCard queue={game.queue} colors={colors} />
            <ControlsCard keys={settings.keys} />
            <button className="restart" onClick={confirmRestart}>
              <RotateCcw size={14} /> Start fresh
            </button>
          </aside>
        </div>
        <div className="touch-controls">
          <button aria-label="Move left" onClick={() => dispatch('left')}>
            <ArrowLeft />
          </button>
          <button aria-label="Rotate" onClick={() => dispatch('rotate')}>
            <RotateCw />
          </button>
          <button aria-label="Move right" onClick={() => dispatch('right')}>
            <ArrowRight />
          </button>
          <button aria-label="Soft drop" onClick={() => dispatch('down')}>
            <ArrowDown />
          </button>
          <button onClick={() => dispatch('drop')}>Drop</button>
          <button onClick={() => dispatch('hold')}>Hold</button>
        </div>
        <footer>
          <span>Saved on this device</span>
          <button
            onClick={() => updateSetting('sound', settings.sound === 'Off' ? 'Crystal' : 'Off')}
          >
            <Volume2 size={14} /> Sound {settings.sound === 'Off' ? 'off' : 'on'}
          </button>
        </footer>
      </main>
      {settingsOpen && (
        <SettingsModal
          settings={settings}
          best={best}
          onChange={updateSetting}
          onPreviewSound={() => playLineClearSound(settings.sound, settings.volume)}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
