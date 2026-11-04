import { useEffect, useRef, useState } from 'react';
import { createPlayClock } from '../game/metrics.ts';

const DISPLAY_REFRESH_MS = 250;

/**
 * Active-play stopwatch for one game. Resets to `initialElapsed` whenever `gameId` changes,
 * and only runs while `running` is true.
 */
export function usePlayClock(gameId: string, running: boolean, initialElapsed: () => number) {
  const clock = useRef(createPlayClock());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = initialElapsed();
    clock.current.reset(start);
    setElapsed(start);
  }, [gameId]);

  useEffect(() => {
    clock.current.setRunning(running);
    setElapsed(clock.current.elapsed());
    if (!running) return;
    const timer = setInterval(() => setElapsed(clock.current.elapsed()), DISPLAY_REFRESH_MS);
    return () => {
      clock.current.setRunning(false);
      clearInterval(timer);
    };
  }, [gameId, running]);

  return { elapsed, readElapsed: () => clock.current.elapsed() };
}
