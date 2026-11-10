import { LEVELS } from '../content/levels';
import type { RunResult } from '../sim/scoring';

const KEY = 'dragonfly-sim-progress-v1';

export interface Progress {
  /** Best star rating per sortie, 0 = not cleared. */
  stars: number[];
  /** Best total score per sortie. */
  best: number[];
  muted: boolean;
}

const fresh = (): Progress => ({ stars: LEVELS.map(() => 0), best: LEVELS.map(() => 0), muted: false });

/** Browser storage can be missing or blocked; fall back to an in-memory fresh game. */
export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const data = JSON.parse(raw) as Partial<Progress>;
    const base = fresh();
    return {
      stars: base.stars.map((_, i) => Number(data.stars?.[i]) || 0),
      best: base.best.map((_, i) => Number(data.best?.[i]) || 0),
      muted: Boolean(data.muted),
    };
  } catch {
    return fresh();
  }
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage unavailable: progress simply won't persist.
  }
}

/** A sortie is open once the one before it has been cleared. */
export function isUnlocked(p: Progress, index: number): boolean {
  return index === 0 || p.stars[index - 1] > 0;
}

/** Record a finished sortie. Returns true if it set a new best score. */
export function recordResult(p: Progress, index: number, r: RunResult): boolean {
  if (!r.completed) return false;
  const isBest = r.total > p.best[index];
  if (isBest) p.best[index] = r.total;
  p.stars[index] = Math.max(p.stars[index], r.stars);
  saveProgress(p);
  return isBest;
}
