import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { clock } from './clock.ts';

export const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Count up/down to `target` in 600 ms (family timing); instant under reduced motion. */
export function useAnimatedNumber(target: number, ms = 600) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (REDUCED) { setValue(target); from.current = target; return; }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const e = 1 - (1 - k) ** 3; // easeCubicOut
      const v = a + (target - a) * e;
      setValue(v);
      from.current = v;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

export function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(query); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => window.matchMedia(query).matches,
  );
}

/** The clock's current hour as a fractional number (re-renders every frame). */
export const useClockHour = () => useSyncExternalStore(clock.subscribe, () => clock.hour);
/** The clock's whole hour (re-renders only when the hour changes). */
export const useWholeHour = () => useSyncExternalStore(clock.subscribe, () => Math.floor(clock.hour));
export const usePlaying = () => useSyncExternalStore(clock.subscribe, () => clock.playing);
