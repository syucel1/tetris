/**
 * Structured browser-console logging. Records are objects so they can be filtered in devtools.
 * Level: `localStorage['tetris-log-level']` overrides the build-time `VITE_LOG_LEVEL` (default INFO).
 */
import log from 'loglevel';
import type { GameStatus } from '../game/gameState.ts';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export type LogContext = Record<string, unknown>;
export type Emit = (level: LogLevel, event: string, context?: LogContext) => void;
const LOG_LEVELS: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
const LOG_LEVEL_STORAGE_KEY = 'tetris-log-level';

/** Unique per page load. */
export const sessionId = crypto.randomUUID();

export function resolveLogLevel(value: unknown): LogLevel {
  const upper = typeof value === 'string' ? (value.toUpperCase() as LogLevel) : null;
  return upper && LOG_LEVELS.includes(upper) ? upper : 'INFO';
}

const logger = log.getLogger('tetris');

function configuredLevel(): unknown {
  // import.meta.env is provided by Vite; it is undefined under the Node test runner.
  const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
  try {
    return localStorage.getItem(LOG_LEVEL_STORAGE_KEY) || env?.VITE_LOG_LEVEL;
  } catch {
    return env?.VITE_LOG_LEVEL;
  }
}
logger.setLevel(resolveLogLevel(configuredLevel()), false);

/** Player IDs attached to every record while a game session is open. */
let currentPlayerIds: string[] = [];
export function setLogPlayers(ids: string[]) {
  currentPlayerIds = [...ids];
}

export function setLogLevel(level: LogLevel) {
  logger.setLevel(resolveLogLevel(level), false);
}

export const logEvent: Emit = (level, event, context = {}) => {
  logger[level.toLowerCase() as 'debug' | 'info' | 'warn' | 'error']({
    timestamp: new Date().toISOString(),
    ...context,
    level,
    event,
    sessionId,
    ...(currentPlayerIds.length ? { playerIds: [...currentPlayerIds] } : {}),
  });
};
export function errorDetails(error: unknown) {
  return error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { message: typeof error === 'string' ? error : 'Unknown error' };
}

export function reportError(event: string, error: unknown, context: LogContext = {}) {
  logEvent('ERROR', event, { ...context, error: errorDetails(error) });
}

type LifecycleSnapshot = { id: string; status: GameStatus; score: number; lines: number };

function lifecycleEvent(from: GameStatus, to: GameStatus): string | null {
  if (to === 'playing') return from === 'paused' ? 'game_resumed' : 'game_started';
  if (to === 'paused') return 'game_paused';
  if (to === 'over') return 'game_over';
  return null;
}

/**
 * Returns an observer to call with each committed game state. It logs status transitions only —
 * never ticks, movement, renders or turn changes.
 */
export function createGameLifecycleLogger(context: LogContext, emit: Emit = logEvent) {
  let previous: LifecycleSnapshot | undefined;
  return (game: LifecycleSnapshot) => {
    if (previous?.id !== game.id) {
      emit('INFO', 'game_created', { ...context, gameId: game.id });
      previous = { ...game, status: 'ready' };
    }
    if (previous.status !== game.status) {
      const event = lifecycleEvent(previous.status, game.status);
      if (event)
        emit('INFO', event, {
          ...context,
          gameId: game.id,
          ...(game.status === 'over' ? { score: game.score, lines: game.lines } : {}),
        });
    }
    previous = { ...game };
  };
}

/** Logs startup and installs global error handlers. Returns an uninstall function. */
export function installApplicationLogging(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
) {
  logEvent('INFO', 'application_started');
  const onError = (event: Event) => {
    const e = event as ErrorEvent;
    reportError('unexpected_error', e.error || e.message, {
      source: 'window',
      filename: e.filename,
      line: e.lineno,
    });
  };
  const onRejection = (event: Event) =>
    reportError('unhandled_rejection', (event as PromiseRejectionEvent).reason, {
      source: 'promise',
    });
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}
