import { DIFFICULTY_ORDER, type Difficulty } from '../content/difficulty';
import { LEVELS } from '../content/levels';
import type { RunResult } from '../sim/scoring';

const KEY = 'dragonfly-sim-progress-v1';

export interface Progress {
  /** Best star rating, per difficulty and then per sortie. 0 = not cleared. */
  stars: Record<Difficulty, number[]>;
  /** Best total score, per difficulty and then per sortie. */
  best: Record<Difficulty, number[]>;
  muted: boolean;
  /** The difficulty chosen on the menu. */
  difficulty: Difficulty;
}

const blank = (): number[] => LEVELS.map(() => 0);

const fresh = (): Progress => ({
  stars: { easy: blank(), medium: blank(), hard: blank() },
  best: { easy: blank(), medium: blank(), hard: blank() },
  muted: false,
  difficulty: 'easy',
});

/** Read one list of per-sortie numbers, padding or trimming to the current number of sortie. */
function numbers(raw: unknown): number[] {
  const list = Array.isArray(raw) ? raw : [];
  return LEVELS.map((_, i) => Number(list[i]) || 0);
}

/** Browser storage can be missing or blocked; fall back to an in-memory fresh game. */
export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const data = JSON.parse(raw) as {
      stars?: unknown;
      best?: unknown;
      muted?: unknown;
      difficulty?: unknown;
    };
    const p = fresh();
    // Older saves kept one list of stars and scores: that was the (only) Easy difficulty.
    if (Array.isArray(data.stars)) {
      p.stars.easy = numbers(data.stars);
      p.best.easy = numbers(data.best);
    } else {
      const stars = (data.stars ?? {}) as Partial<Record<Difficulty, unknown>>;
      const best = (data.best ?? {}) as Partial<Record<Difficulty, unknown>>;
      for (const d of DIFFICULTY_ORDER) {
        p.stars[d] = numbers(stars[d]);
        p.best[d] = numbers(best[d]);
      }
    }
    p.muted = Boolean(data.muted);
    if (DIFFICULTY_ORDER.includes(data.difficulty as Difficulty)) p.difficulty = data.difficulty as Difficulty;
    return p;
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

/** A sortie is open once the one before it has been cleared, on any difficulty. */
export function isUnlocked(p: Progress, index: number): boolean {
  return index === 0 || DIFFICULTY_ORDER.some((d) => p.stars[d][index - 1] > 0);
}

/** Record a finished sortie. Returns true if it set a new best score at that difficulty. */
export function recordResult(p: Progress, index: number, difficulty: Difficulty, r: RunResult): boolean {
  if (!r.completed) return false;
  const isBest = r.total > p.best[difficulty][index];
  if (isBest) p.best[difficulty][index] = r.total;
  p.stars[difficulty][index] = Math.max(p.stars[difficulty][index], r.stars);
  saveProgress(p);
  return isBest;
}
