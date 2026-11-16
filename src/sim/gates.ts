import type { DifficultySpec } from '../content/difficulty';
import type { Level } from '../content/levels';
import { CRAFT_RADIUS, GATE_BASE_CLEAR, GATE_CLOUD_DEPTH, GATE_FLASH, GATE_POINTS, GATE_TARGET_CLEAR } from './constants';
import type { Terrain } from './terrain';
import type { World } from './world';

/**
 * A gate: a hill of dune rock below and a bank of methane cloud above, with a gap between them.
 * Fly through the gap. Touching the hill or the cloud destroys the craft.
 */
export interface Gate {
  /** Center of the gate (m). */
  x: number;
  /** Hill half-width (m) and the altitude of its peak (m, absolute). */
  hillR: number;
  top: number;
  /** Vertical gap between the hill peak and the cloud's lowest point at rest (m). */
  gap: number;
  /** Cloud half-width (m). */
  cloudW: number;
  /** The cloud bank breathes up and down (m, s, offset): the gap is never smaller than `gap`. */
  bobAmp: number;
  bobPeriod: number;
  bobPhase: number;
  /** Set once the craft has flown through. */
  passed: boolean;
}

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
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Where the underside of a gate's cloud is at a given time (m, absolute). */
export const cloudBottom = (g: Gate, time: number): number =>
  g.top + g.gap + g.bobAmp * (1 + Math.sin((time / g.bobPeriod) * Math.PI * 2 + g.bobPhase));

/** Underside of the cloud at a horizontal offset from its center: it curls up toward the edges. */
export const cloudUnderside = (g: Gate, time: number, dx: number): number => {
  const u = Math.min(1, Math.abs(dx) / g.cloudW);
  return cloudBottom(g, time) + u * u * 16;
};

/** The altitude of the middle of the gap at a time, for aiming and for radar. */
export const gapCenter = (g: Gate, time: number): number => (g.top + cloudBottom(g, time)) / 2;

/**
 * Place the gates along the sortie's track and raise their hills in the terrain. The layout is
 * deterministic for a level and difficulty. Gates keep clear of the base, every target and the
 * intro descent, and the gap drifts gradually from one gate to the next so each is reachable.
 */
export function generateGates(
  level: Level,
  terrain: Terrain,
  targetXs: number[],
  spec: DifficultySpec,
): Gate[] {
  if (spec.gateGap[1] <= 0) return [];
  const rand = rng(level.seed * 6151 + spec.id.charCodeAt(0) * 7919 + 13);
  const xs = [0, ...targetXs];
  const lo = Math.min(...xs) - 150;
  const hi = Math.max(...xs) + 150;

  const spots: number[] = [];
  for (const dir of [-1, 1]) {
    let x = dir * lerp(GATE_BASE_CLEAR, GATE_BASE_CLEAR + 60, rand());
    for (let guard = 0; guard < 80 && x >= lo && x <= hi; guard++) {
      // A spot that falls on the base or a target slides along the track to the nearest clear place.
      const clear = (px: number) =>
        !(level.intro && px > -340 && px < 130) &&
        Math.abs(px) >= GATE_BASE_CLEAR &&
        !targetXs.some((t) => Math.abs(t - px) < GATE_TARGET_CLEAR) &&
        !spots.some((s) => Math.abs(s - px) < 150);
      const slid = [0, 25, -25, 50, -50, 75, -75, 100, -100].map((o) => x + o).find(clear);
      if (slid !== undefined && slid >= lo && slid <= hi) spots.push(slid);
      x += dir * lerp(spec.gateSpacing[0], spec.gateSpacing[1], rand());
    }
  }
  spots.sort((a, b) => a - b);

  const gates: Gate[] = [];
  let hill = lerp(spec.gateHill[0], spec.gateHill[1], 0.4);
  for (const x of spots) {
    hill = clamp(hill + (rand() - 0.5) * 2 * spec.gateStep, spec.gateHill[0], spec.gateHill[1]);
    const hillR = lerp(60, 78, rand());
    const base = terrain.heightAt(x);
    const gap = lerp(spec.gateGap[0], spec.gateGap[1], rand());
    terrain.addBump(x, hillR, hill);
    gates.push({
      x,
      hillR,
      top: base + hill,
      gap,
      cloudW: lerp(42, 56, rand()),
      bobAmp: spec.gateBob * (0.6 + 0.4 * rand()),
      bobPeriod: lerp(5, 8, rand()),
      bobPhase: rand() * Math.PI * 2,
      passed: false,
    });
  }
  return gates;
}

/** Gates are live once the sortie proper begins, like the weather. */
function gatesLive(w: World): boolean {
  return !w.intro || w.landing !== null;
}

/** Score gates as the craft flies through them, and destroy the craft if it touches a cloud. */
export function stepGates(w: World, prevX: number): void {
  const gates = w.obstacles.gates;
  if (gates.length === 0 || w.status === 'crashed' || !gatesLive(w) || w.phase !== 'flight') return;
  const c = w.craft;
  for (const g of gates) {
    const dx = c.x - g.x;
    if (Math.abs(dx) > g.cloudW + CRAFT_RADIUS + 2) {
      if (!g.passed && (prevX - g.x) * dx < 0) {
        // Crossed the gate's center line while it was far from the cloud's reach: still counts.
        g.passed = true;
        w.gatesPassed++;
        w.gateFlash = { until: w.time + GATE_FLASH, points: GATE_POINTS };
      }
      continue;
    }
    const bottom = cloudUnderside(g, w.time, Math.max(0, Math.abs(dx) - CRAFT_RADIUS));
    if (c.y + CRAFT_RADIUS * 0.7 > bottom && c.y - CRAFT_RADIUS < bottom + GATE_CLOUD_DEPTH) {
      w.status = 'crashed';
      w.message = 'Flew into a methane cloud';
      c.vx = 0;
      c.vy = 0;
      return;
    }
    if (!g.passed && (prevX - g.x) * dx <= 0 && prevX !== c.x) {
      g.passed = true;
      w.gatesPassed++;
      w.gateFlash = { until: w.time + GATE_FLASH, points: GATE_POINTS };
    }
  }
}

/** The next gate that hasn't been flown through, nearest to the craft, within `range` meters. */
export function nearestGate(w: World, range: number): Gate | null {
  let best: Gate | null = null;
  for (const g of w.obstacles.gates) {
    const d = Math.abs(g.x - w.craft.x);
    if (d > range) continue;
    if (!best || d < Math.abs(best.x - w.craft.x)) best = g;
  }
  return best;
}

/** Cameras use this to keep a nearby gap in frame: the altitude to lean toward and how strongly (0 to 1). */
export function gateFraming(w: World): { y: number; k: number } | null {
  let best: { y: number; k: number } | null = null;
  for (const g of w.obstacles.gates) {
    const d = Math.abs(g.x - w.craft.x);
    if (d > 190) continue;
    const k = 0.7 * (1 - d / 190);
    if (!best || k > best.k) best = { y: gapCenter(g, w.time), k };
  }
  return best;
}
