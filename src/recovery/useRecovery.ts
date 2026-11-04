import { useEffect, useRef, useState } from 'react';
import { logEvent } from '../logging/logging.ts';
import { isGuestId, type Profile } from '../profiles/profiles.ts';
import {
  discardRecovery,
  loadRecovery,
  saveRecovery,
  type BoardCheckpoint,
  type RecoveryLoadResult,
  type SavedMatch,
} from './recovery.ts';

/** Routine (movement) checkpoints are coalesced; important ones (placements, status) save now. */
const ROUTINE_SAVE_DELAY_MS = 1000;
const SAVE_FAILED_NOTICE =
  'Recovery could not be saved. The last successful checkpoint is kept; this round may not be recoverable.';

type SessionState = {
  playing: boolean;
  players: Profile[];
  turn: number;
};

export type Recovery = ReturnType<typeof useRecovery>;

/**
 * Collects per-board checkpoints from each `PlayerGame` and persists them as one match.
 * Offers a saved match (`pending`) on startup until it is resumed or discarded.
 */
export function useRecovery({ playing, players, turn }: SessionState, profileIds: string[]) {
  const [initial] = useState<RecoveryLoadResult>(() => {
    try {
      return loadRecovery(localStorage, profileIds);
    } catch {
      return { match: null, warning: 'Recovery storage is unavailable.' };
    }
  });
  const [pending, setPending] = useState<SavedMatch | null>(initial.match);
  const [notice, setNotice] = useState(initial.warning ?? '');
  const [guestConsent, setGuestConsent] = useState(false);
  const [savedAt, setSavedAt] = useState(0);

  const boards = useRef(new Map<string, BoardCheckpoint>());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Set after an explicit discard until a new round starts or a save is resumed. */
  const disabled = useRef(false);
  const warned = useRef(false);

  // Timers and page-lifecycle listeners read the latest values through this ref.
  const latest = useRef({ playing, players, turn, guestConsent, pending, notice });
  latest.current = { playing, players, turn, guestConsent, pending, notice };

  function cancelScheduledSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
  }

  function scheduleSave(delay: number) {
    if (!saveTimer.current) saveTimer.current = setTimeout(() => saveNowRef.current(), delay);
  }

  function reportFailure() {
    setNotice(SAVE_FAILED_NOTICE);
    if (!warned.current) {
      logEvent('WARN', 'recovery_storage_unavailable');
      warned.current = true;
    }
  }

  function clearStorage() {
    try {
      discardRecovery(localStorage);
      setSavedAt(0);
    } catch {
      reportFailure();
    }
  }

  function buildMatch(): SavedMatch | 'finished' | null {
    const { playing, players, turn, guestConsent, pending } = latest.current;
    if (disabled.current || !playing || pending) return null;
    if (players.some((p) => isGuestId(p.id)) && !guestConsent) return null;

    const snapshots = players.map((p) => boards.current.get(p.id));
    if (snapshots.some((b) => !b || b.game.status === 'ready')) return null;
    const ready = snapshots as BoardCheckpoint[];
    if (ready.every((b) => b.game.status === 'over')) return 'finished';

    const activeTurn =
      ready[turn]?.game.status === 'over' ? ready.findIndex((b) => b.game.status !== 'over') : turn;
    return {
      version: 1,
      savedAt: Date.now(),
      mode: ready.length === 1 ? 'solo' : 'multiplayer',
      turn: activeTurn,
      guestConsent,
      boards: ready,
    };
  }

  function saveNow() {
    saveTimer.current = null;
    const match = buildMatch();
    if (!match) return;
    if (match === 'finished') {
      clearStorage();
      return;
    }
    try {
      saveRecovery(localStorage, match);
      setSavedAt(match.savedAt);
      if (warned.current || latest.current.notice) {
        setNotice('');
        warned.current = false;
      }
    } catch {
      reportFailure();
    }
  }
  const saveNowRef = useRef(saveNow);
  saveNowRef.current = saveNow;

  useEffect(() => {
    const flush = () => saveNowRef.current();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelScheduledSave();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  /** Records a board's latest state; called by each board on every change. */
  function checkpoint(board: BoardCheckpoint, important = false) {
    boards.current.set(board.profile.id, board);
    if (disabled.current) return;
    if (important) cancelScheduledSave();
    scheduleSave(important ? 0 : ROUTINE_SAVE_DELAY_MS);
  }

  /** Forget everything for a brand-new round. */
  function reset() {
    cancelScheduledSave();
    boards.current.clear();
    disabled.current = false;
    clearStorage();
  }

  /** Drop the offered or current save and stop saving until the next round. */
  function discard() {
    setGuestConsent(false);
    latest.current.guestConsent = false;
    disabled.current = true;
    cancelScheduledSave();
    clearStorage();
    setPending(null);
  }

  /** Accept the offered save; returns it for the caller to restore. */
  function resume(): SavedMatch | null {
    const match = pending;
    if (!match) return null;
    boards.current = new Map(match.boards.map((b) => [b.profile.id, b]));
    setGuestConsent(match.guestConsent);
    setPending(null);
    disabled.current = false;
    return match;
  }

  function setConsent(value: boolean) {
    setGuestConsent(value);
    latest.current.guestConsent = value;
    if (value) scheduleSave(0);
    else clearStorage();
  }

  return {
    pending,
    notice,
    savedAt,
    guestConsent,
    checkpoint,
    reset,
    discard,
    resume,
    setConsent,
  };
}
