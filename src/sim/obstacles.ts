import type { DifficultySpec } from '../content/difficulty';
import type { Level } from '../content/levels';
import type { World } from './world';

/** An ice vent: a crater that lobs methane ice balls on a timer. Landing anywhere near one is a gamble. */
export interface Vent {
  x: number;
  /** Seconds between shots, and an offset so vents are out of step. */
  period: number;
  phase: number;
}

export interface Obstacles {
  vents: Vent[];
}

export const NO_OBSTACLES: Obstacles = { vents: [] };

/** Seconds a vent glows before a shot, and how long its muzzle flash lasts. */
export const VENT_WARN = 1.6;
export const VENT_FLASH = 0.6;

function rng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Place the ice vents along the sortie's track. The layout is deterministic for a level and difficulty,
 * keeps the base and every landing target clear, and puts many vents a short way from landing targets.
 */
export function generateObstacles(
  level: Level,
  targets: { x: number; landing: boolean }[],
  spec: DifficultySpec,
): Obstacles {
  if (spec.ventsPerKm + spec.ventTargetChance === 0) return NO_OBSTACLES;
  const targetXs = targets.map((t) => t.x);
  const xs = [0, ...targetXs];
  const lo = Math.min(...xs) - 250;
  const hi = Math.max(...xs) + 250;
  const km = (hi - lo) / 1000;
  const rand = rng(level.seed * 7919 + spec.id.charCodeAt(0) * 104729 + spec.id.length);

  const vents: Vent[] = [];
  const newVent = (x: number): Vent => ({
    x,
    period: lerp(spec.ventPeriod[0], spec.ventPeriod[1], rand()),
    phase: rand() * 20,
  });
  // Many stand a short way from landing targets, so working there means watching the sky.
  for (const t of targets) {
    if (!t.landing || rand() >= spec.ventTargetChance) continue;
    const x = t.x + (rand() < 0.5 ? -1 : 1) * lerp(25, 50, rand());
    if (Math.abs(x) >= 150) vents.push(newVent(x));
  }
  // A few more are scattered about.
  const wantExtra = Math.round(spec.ventsPerKm * km);
  for (let attempts = 0, added = 0; attempts < wantExtra * 40 && added < wantExtra; attempts++) {
    const x = lerp(lo, hi, rand());
    if (Math.abs(x) < 140) continue;
    if (targetXs.some((t) => Math.abs(t - x) < 30)) continue;
    if (vents.some((v) => Math.abs(v.x - x) < 40)) continue;
    vents.push(newVent(x));
    added++;
  }
  vents.sort((a, b) => a.x - b.x);
  return { vents };
}

export interface VentState {
  state: 'idle' | 'warn' | 'flash';
  /** Seconds until the next shot. */
  eta: number;
}

/** A vent's place in its cycle: quiet, glowing (about to fire) or showing its muzzle flash. */
export function ventState(w: World, v: Vent): VentState {
  const t = (w.time + v.phase) % v.period;
  const eta = v.period - t;
  if (t < VENT_FLASH) return { state: 'flash', eta };
  return { state: eta <= VENT_WARN ? 'warn' : 'idle', eta };
}

export interface Warnings {
  /** The nearest vent, and where it is in its cycle. */
  vent: { dist: number; dir: number; state: 'idle' | 'warn' | 'flash'; eta: number } | null;
  /** The nearest ice ball close to the craft. */
  ball: { dist: number; dir: number } | null;
}

/** What is nearby, for the HUD. */
export function warningsAhead(w: World): Warnings {
  const c = w.craft;
  let vent: Warnings['vent'] = null;
  for (const v of w.obstacles.vents) {
    const dx = v.x - c.x;
    if (Math.abs(dx) > 150) continue;
    const vs = ventState(w, v);
    if (!vent || Math.abs(dx) < vent.dist) vent = { dist: Math.abs(dx), dir: Math.sign(dx) || 1, state: vs.state, eta: vs.eta };
  }
  let ball: Warnings['ball'] = null;
  for (const b of w.balls) {
    if (b.delay > 0) continue;
    const dx = b.x - c.x;
    if (Math.abs(dx) > 170 || Math.abs(b.y - c.y) > 90) continue;
    if (!ball || Math.abs(dx) < ball.dist) ball = { dist: Math.abs(dx), dir: Math.sign(dx) || 1 };
  }
  return { vent, ball };
}
