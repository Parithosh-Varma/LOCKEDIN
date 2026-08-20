import { useEffect, useRef, useState } from "react";

/**
 * Accurate countdown based on timestamps, not decrementing variables.
 * Survives re-renders and page refresh (persist endAt).
 */
export function useCountdown(endAt: number | null, paused: boolean, onComplete?: () => void) {
  const [remaining, setRemaining] = useState<number>(() => (endAt ? Math.max(0, endAt - Date.now()) : 0));
  const doneRef = useRef(false);

  useEffect(() => {
    if (endAt === null) return;
    const tick = () => {
      const left = Math.max(0, endAt - Date.now());
      setRemaining(left);
      if (left <= 0 && !doneRef.current) {
        doneRef.current = true;
        onComplete?.();
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [endAt, paused]);

  return { remaining, total: endAt ? endAt - (endAt - remaining) : 0 };
}

/** Uptime counter (elapsed) based on start timestamp. */
export function useElapsed(startAt: number | null, paused: boolean) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (startAt === null) return;
    const tick = () => setElapsed(Math.max(0, Date.now() - startAt));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [startAt, paused]);

  return elapsed;
}

export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}