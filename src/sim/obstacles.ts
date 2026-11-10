import type { DifficultySpec } from '../content/difficulty';
import type { Level } from '../content/levels';
import { SKID_DROP } from './constants';
import type { World } from './world';

/** A rock spire standing on the flight path. Solid: touching it is a crash, so climb over it. */
export interface Spire {
  x: number;
  /** Half-width at the ground and at the top (m). */
  baseHalf: number;
  topHalf: number;
  /** Height above the ground at its base (m). */
  height: number;
}

/** A pocket of violent air that shoves the craft around. Not solid, but it costs energy and can push you into things. */
export interface Cell {
  /** Center along the track at time 0 (m). */
  x: number;
  /** Center height above the ground (m). */
  alt: number;
  radius: number;
  /** Drift along the track (m/s). */
  drift: number;
  phase: number;
  /** -1 for a downdraft (pushes you toward the ground), 1 for an updraft. */
  lift: 1 | -1;
}

/** A squall front: a fast storm band that patrols back and forth through the high sky. Flying into it knocks out a rotor. */
export interface Squall {
  /** Middle of its patrol along the track (m) and how far it ranges either side. */
  center: number;
  amp: number;
  /** Speed along the track (m/s) and height of its middle (m). */
  speed: number;
  alt: number;
  length: number;
  thick: number;
  /** Where in its back-and-forth cycle it starts, in [0, 2). */
  phase: number;
}

/** A cryo-vent: a crack in the ground that erupts a plume of icy slush on a timer. Landing near one is a gamble. */
export interface Vent {
  x: number;
  /** Seconds between eruptions, and an offset so vents are out of step. */
  period: number;
  phase: number;
  halfWidth: number;
  /** Plume height at full eruption (m). */
  plume: number;
}

export interface Obstacles {
  spires: Spire[];
  cells: Cell[];
  squalls: Squall[];
  vents: Vent[];
}

export const NO_OBSTACLES: Obstacles = { spires: [], cells: [], squalls: [], vents: [] };

/** Seconds a vent glows before erupting, and how long the eruption lasts. */
export const VENT_WARN = 1.8;
export const VENT_ERUPT = 1.1;

/** Craft half-width used when testing against spires (m). */
const CRAFT_HALF = 1.6;

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
 * Place spires and turbulence cells along the sortie's track. The layout is deterministic for a level
 * and difficulty, keeps the base and every target clear, and never walls the path in: there is no
 * ceiling, so there is always a way over.
 */
export function generateObstacles(
  level: Level,
  targets: { x: number; landing: boolean }[],
  spec: DifficultySpec,
): Obstacles {
  if (spec.spiresPerKm + spec.cellsPerKm + spec.squallsPerKm + spec.ventsPerKm === 0) return NO_OBSTACLES;
  const targetXs = targets.map((t) => t.x);
  const xs = [0, ...targetXs];
  const lo = Math.min(...xs) - 250;
  const hi = Math.max(...xs) + 250;
  const km = (hi - lo) / 1000;
  const rand = rng(level.seed * 7919 + spec.id.charCodeAt(0) * 104729 + spec.id.length);

  const spires: Spire[] = [];
  const wantSpires = Math.round(spec.spiresPerKm * km);
  for (let attempts = 0; attempts < wantSpires * 40 && spires.length < wantSpires; attempts++) {
    const x = lerp(lo, hi, rand());
    if (Math.abs(x) < 90) continue;
    if (targetXs.some((t) => Math.abs(t - x) < 55)) continue;
    if (spires.some((s) => Math.abs(s.x - x) < 90)) continue;
    const baseHalf = lerp(spec.spireHalfWidth[0], spec.spireHalfWidth[1], rand());
    spires.push({ x, baseHalf, topHalf: baseHalf * 0.25, height: lerp(spec.spireHeight[0], spec.spireHeight[1], rand()) });
  }
  spires.sort((a, b) => a.x - b.x);

  const cells: Cell[] = [];
  const wantCells = Math.round(spec.cellsPerKm * km);
  for (let attempts = 0; attempts < wantCells * 40 && cells.length < wantCells; attempts++) {
    const x = lerp(lo, hi, rand());
    if (Math.abs(x) < 110) continue;
    if (targetXs.some((t) => Math.abs(t - x) < 80)) continue;
    if (cells.some((c) => Math.abs(c.x - x) < 140)) continue;
    cells.push({
      x,
      alt: lerp(spec.cellAlt[0], spec.cellAlt[1], rand()),
      radius: lerp(spec.cellRadius[0], spec.cellRadius[1], rand()),
      drift: (rand() * 2 - 1) * spec.cellDrift,
      phase: rand() * Math.PI * 2,
      lift: rand() < 0.6 ? -1 : 1,
    });
  }
  cells.sort((a, b) => a.x - b.x);

  // Squall fronts patrol the high sky, never over the base, so cruising high is not free.
  const squalls: Squall[] = [];
  const wantSqualls = Math.round(spec.squallsPerKm * km);
  for (let i = 0; i < wantSqualls; i++) {
    const amp = lerp(220, 400, rand());
    let center = lerp(lo, hi, rand());
    if (Math.abs(center) < amp + 170) center = (rand() < 0.5 ? -1 : 1) * (amp + 170 + rand() * 300);
    squalls.push({
      center,
      amp,
      speed: lerp(spec.squallSpeed[0], spec.squallSpeed[1], rand()),
      alt: lerp(spec.squallAlt[0], spec.squallAlt[1], rand()),
      length: lerp(55, 90, rand()),
      thick: lerp(13, 18, rand()),
      phase: rand() * 2,
    });
  }

  // Cryo-vents: some sit right on landing targets, so drilling has to be timed; a few more are scattered about.
  const vents: Vent[] = [];
  const newVent = (x: number): Vent => ({
    x,
    period: lerp(spec.ventPeriod[0], spec.ventPeriod[1], rand()),
    phase: rand() * 20,
    halfWidth: 8.5,
    plume: lerp(spec.plumeHeight[0], spec.plumeHeight[1], rand()),
  });
  for (const t of targets) if (t.landing && rand() < spec.ventTargetChance) vents.push(newVent(t.x + (rand() * 2 - 1) * 3));
  const wantExtra = Math.round(spec.ventsPerKm * km);
  for (let attempts = 0, added = 0; attempts < wantExtra * 40 && added < wantExtra; attempts++) {
    const x = lerp(lo, hi, rand());
    if (Math.abs(x) < 140) continue;
    if (targetXs.some((t) => Math.abs(t - x) < 30)) continue;
    if (spires.some((s) => Math.abs(s.x - x) < 25)) continue;
    if (vents.some((v) => Math.abs(v.x - x) < 40)) continue;
    vents.push(newVent(x));
    added++;
  }
  vents.sort((a, b) => a.x - b.x);
  return { spires, cells, squalls, vents };
}

/** Where a turbulence cell is right now (it drifts and bobs). */
export function cellCenter(w: World, c: Cell): { x: number; y: number } {
  const x = c.x + c.drift * w.time;
  return { x, y: w.terrain.heightAt(x) + c.alt + 6 * Math.sin(0.35 * w.time + c.phase) };
}

/** Half-width of a spire at a given height above its base. */
export function spireHalfAt(s: Spire, h: number): number {
  const t = Math.min(1, Math.max(0, h / s.height));
  return s.baseHalf + (s.topHalf - s.baseHalf) * t;
}

/** The spire the craft is touching, if any. Flying above a spire's tip is clear. */
export function spireHit(w: World): Spire | null {
  const c = w.craft;
  for (const s of w.obstacles.spires) {
    if (Math.abs(c.x - s.x) > s.baseHalf + CRAFT_HALF + 1) continue;
    const ground = w.terrain.heightAt(s.x);
    if (c.y - SKID_DROP >= ground + s.height) continue;
    const half = spireHalfAt(s, c.y - ground);
    if (Math.abs(c.x - s.x) < half + CRAFT_HALF) return s;
  }
  return null;
}

export interface Turbulence {
  /** 0 outside any cell, rising to 1 at a cell's center. */
  intensity: number;
  /** Velocity shove (m/s) to add to the craft's motion. */
  vx: number;
  vy: number;
}

const NO_TURBULENCE: Turbulence = { intensity: 0, vx: 0, vy: 0 };

/** Turbulence at a point: the strongest cell wins. Gusty and uneven, so it feels like buffeting rather than a steady push. */
export function turbulenceAt(w: World, x: number, y: number): Turbulence {
  let best: Turbulence = NO_TURBULENCE;
  const peak = w.difficulty.turbulence;
  for (const cell of w.obstacles.cells) {
    const ctr = cellCenter(w, cell);
    const d = Math.hypot(x - ctr.x, y - ctr.y);
    if (d >= cell.radius) continue;
    const t = 1 - d / cell.radius;
    const intensity = t * t * (3 - 2 * t);
    if (intensity <= best.intensity) continue;
    const time = w.time;
    // A steady updraft or downdraft plus buffeting. Downdrafts shove harder: they push toward the ground.
    const base = cell.lift * (cell.lift < 0 ? 0.9 : 0.6);
    const noiseY = 0.45 * (Math.sin(time * 2.6 + cell.phase * 1.3) + 0.4 * Math.sin(time * 6.1 + cell.phase));
    const noiseX = 0.6 * (Math.sin(time * 1.9 + cell.phase) + 0.4 * Math.sin(time * 4.7 + cell.phase * 2));
    best = { intensity, vx: noiseX * peak * intensity, vy: (base + noiseY) * peak * intensity };
  }
  return best;
}

export interface Warnings {
  /** Nearest spire ahead that is tall enough to hit, with its distance (m). */
  spire: { dist: number; dir: number } | null;
  /** Nearest turbulence cell ahead at roughly the craft's height. */
  cell: { dist: number; dir: number; lift: 1 | -1 } | null;
  /** A squall front near the craft's altitude, and whether it is above or below. */
  squall: { dist: number; dir: number; above: boolean } | null;
  /** The nearest vent that could reach the craft, and where it is in its cycle. */
  vent: { dist: number; dir: number; state: 'idle' | 'warn' | 'erupt'; eta: number } | null;
}

/** What lies ahead, for the HUD. "Ahead" is the direction of travel, or the facing when nearly still. */
export function warningsAhead(w: World): Warnings {
  const c = w.craft;
  const dir = Math.abs(c.vx) > 3 ? Math.sign(c.vx) : c.facing;
  let spire: Warnings['spire'] = null;
  for (const s of w.obstacles.spires) {
    const dist = (s.x - c.x) * dir;
    if (dist < -s.baseHalf || dist > 260) continue;
    const top = w.terrain.heightAt(s.x) + s.height;
    if (c.y - SKID_DROP > top + 4) continue;
    if (!spire || dist < spire.dist) spire = { dist: Math.max(0, dist), dir };
  }
  let cell: Warnings['cell'] = null;
  for (const k of w.obstacles.cells) {
    const ctr = cellCenter(w, k);
    const dist = (ctr.x - c.x) * dir;
    if (dist + k.radius < 0 || dist > 220) continue;
    if (Math.abs(ctr.y - c.y) > k.radius + 12) continue;
    if (!cell || dist < cell.dist) cell = { dist: Math.max(0, dist - k.radius), dir, lift: k.lift };
  }
  let squall: Warnings['squall'] = null;
  for (const s of w.obstacles.squalls) {
    const st = squallState(w, s);
    const dx = st.x - c.x;
    if (Math.abs(dx) > 320 || Math.abs(st.y - c.y) > s.thick / 2 + 40) continue;
    if (!squall || Math.abs(dx) < squall.dist) squall = { dist: Math.abs(dx), dir: Math.sign(dx) || 1, above: st.y > c.y };
  }
  let vent: Warnings['vent'] = null;
  for (const v of w.obstacles.vents) {
    const dx = v.x - c.x;
    if (Math.abs(dx) > 130) continue;
    if (c.y - SKID_DROP > w.terrain.heightAt(v.x) + v.plume + 12) continue;
    const vs = ventState(w, v);
    if (!vent || Math.abs(dx) < vent.dist) vent = { dist: Math.abs(dx), dir: Math.sign(dx) || 1, state: vs.state, eta: vs.eta };
  }
  return { spire, cell, squall, vent };
}

/** Where a squall front is right now, and which way it is heading. It sweeps back and forth at constant speed. */
export function squallState(w: World, s: Squall): { x: number; y: number; dir: 1 | -1 } {
  const cycle = (w.time * s.speed) / (2 * s.amp) + s.phase;
  const u = cycle - Math.floor(cycle / 2) * 2;
  const pos = u < 1 ? -s.amp + 2 * s.amp * u : s.amp - 2 * s.amp * (u - 1);
  return { x: s.center + pos, y: s.alt, dir: u < 1 ? 1 : -1 };
}

export interface VentState {
  state: 'idle' | 'warn' | 'erupt';
  /** Seconds until the next eruption starts (0 while erupting). */
  eta: number;
  /** Height of the plume right now (m). */
  height: number;
}

/** A vent's place in its cycle: quiet, glowing (about to erupt) or erupting. */
export function ventState(w: World, v: Vent): VentState {
  const t = (w.time + v.phase) % v.period;
  const start = v.period - VENT_ERUPT;
  if (t >= start) return { state: 'erupt', eta: 0, height: v.plume * Math.min(1, (t - start) / 0.2) };
  const eta = start - t;
  return { state: eta <= VENT_WARN ? 'warn' : 'idle', eta, height: 0 };
}

/** Is the craft inside an erupting plume or a squall right now? Works for a craft sitting on the ground too. */
export function strikeCheck(w: World): { kind: 'squall' | 'vent'; dir: number } | null {
  const c = w.craft;
  for (const v of w.obstacles.vents) {
    if (Math.abs(c.x - v.x) > v.halfWidth + CRAFT_HALF) continue;
    const vs = ventState(w, v);
    if (vs.state !== 'erupt') continue;
    if (c.y - SKID_DROP < w.terrain.heightAt(v.x) + vs.height) return { kind: 'vent', dir: 0 };
  }
  for (const s of w.obstacles.squalls) {
    const st = squallState(w, s);
    if (Math.abs(c.x - st.x) < s.length / 2 + CRAFT_HALF && Math.abs(c.y - st.y) < s.thick / 2 + 1.3) return { kind: 'squall', dir: st.dir };
  }
  return null;
}
