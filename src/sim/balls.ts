import {
  BALL_BASE_SHIELD,
  BALL_BOUNCE_KEEP,
  BALL_GRAVITY,
  BALL_GROUND_PUSH,
  BALL_LIMIT,
  BALL_REST_SPEED,
  BALL_RESTITUTION,
  BALL_ROLL_DRAG,
  BALL_WIND_COUPLING,
  WIND_SPEED_PER_ACCEL,
} from './constants';
import type { Vent } from './obstacles';
import type { World } from './world';

/** Craft radius used when testing against balls (m). */
const CRAFT_RADIUS = 1.8;

/**
 * A methane ice ball lobbed by a vent. It flies on a ballistic arc, bounces on the terrain, settles
 * into rolling, and is pushed around by gusts the whole time. It disappears after its lifetime runs
 * out. Touching the craft, in the air or on the ground, destroys it.
 */
export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  age: number;
  life: number;
  /** Seconds before this ball leaves the vent (the second ball of a burst waits a moment). */
  delay: number;
  /** True once it has stopped bouncing and is rolling along the ground. */
  grounded: boolean;
  bounces: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A reproducible pseudo-random number from three integers, so every run of a sortie fires the same shots. */
function hash01(a: number, b: number, c: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** How many shots a vent has fired by a given time. Vents are out of step through their phase. */
export const shotsAt = (v: Vent, time: number): number => Math.floor((time + v.phase) / v.period);

/** Starting shot counts, so nothing fires in the first instant. */
export const initialShots = (vents: Vent[]): number[] => vents.map((v) => shotsAt(v, 0));

/** How a shot leaves the vent: a steep lob, a mid-angle arc, or a low, fast, flatter parabola. */
type Style = 'lob' | 'mid' | 'flat';

/** Launch angle range above the horizontal (degrees) and a speed scale for each style. */
const STYLES: Record<Style, { angle: [number, number]; speed: number }> = {
  lob: { angle: [66, 86], speed: 1 },
  mid: { angle: [36, 56], speed: 0.95 },
  flat: { angle: [10, 26], speed: 0.95 },
};

/**
 * Launch one shot from a vent: a ball, or a short burst. Every ball picks its own style, so a vent
 * mixes shots that go almost straight up with ones that skim low across the ground. Some shots are
 * aimed toward where the craft is now.
 */
function fire(w: World, v: Vent, index: number, shot: number): void {
  const spec = w.difficulty;
  const c = w.craft;
  const ground = w.terrain.heightAt(v.x);
  for (let b = 0; b < spec.ballBurst; b++) {
    const salt = b * 11 + 1;
    const r1 = hash01(index + 1, shot, salt);
    const r2 = hash01(index + 1, shot, salt + 2);
    const r3 = hash01(index + 1, shot, salt + 4);
    const r4 = hash01(index + 1, shot, salt + 6);
    const r5 = hash01(index + 1, shot, salt + 8);

    const style: Style = r4 < spec.ballFlat ? 'flat' : r4 < spec.ballFlat + spec.ballMid ? 'mid' : 'lob';
    const def = STYLES[style];
    const speed = lerp(spec.ballSpeed[0], spec.ballSpeed[1], r2) * def.speed;
    const angle = (lerp(def.angle[0], def.angle[1], r5) * Math.PI) / 180;
    const aimed = r3 < spec.ballAim && Math.abs(c.x - v.x) < 280;
    const dir = aimed ? Math.sign(c.x - v.x) || 1 : r1 < 0.5 ? -1 : 1;

    let vx = dir * speed * Math.cos(angle);
    const vy = speed * Math.sin(angle);
    if (aimed && style === 'lob') {
      // An aimed lob comes down roughly where the craft is, with some error. The vent's flash gives you time to move.
      const flight = (2 * vy) / BALL_GRAVITY;
      vx = clamp(((c.x - v.x) / flight) * (0.85 + 0.3 * r1), -speed * 0.6, speed * 0.6);
    }
    w.balls.push({
      x: v.x,
      y: ground + 3,
      vx,
      vy,
      r: spec.ballRadius,
      age: 0,
      life: spec.ballLife,
      delay: b * 0.35,
      grounded: false,
      bounces: 0,
    });
  }
  while (w.balls.length > BALL_LIMIT) w.balls.shift();
}

/** Fire due shots, move every ball, retire spent ones, and destroy the craft if one touches it. */
export function stepBalls(w: World, dt: number): void {
  const spec = w.difficulty;
  if (spec.ballBurst === 0 || w.obstacles.vents.length === 0) return;
  // Like the other hazards, balls wait until the intro descent is over.
  if (w.intro && !w.landing) return;
  const c = w.craft;

  w.obstacles.vents.forEach((v, i) => {
    const due = shotsAt(v, w.time);
    while (w.ventShots[i] < due) {
      w.ventShots[i]++;
      fire(w, v, i, w.ventShots[i]);
    }
  });

  // Gusts move balls: in the air they are dragged toward the wind speed, on the ground they are pushed along.
  const windSpeed = w.wind * WIND_SPEED_PER_ACCEL;
  for (const b of w.balls) {
    if (b.delay > 0) {
      b.delay -= dt;
      continue;
    }
    b.age += dt;
    if (b.grounded) {
      const slope = w.terrain.slopeAt(b.x);
      // Rolls downhill, gets shoved by gusts, and slows by friction.
      b.vx += ((-BALL_GRAVITY * slope) / (1 + slope * slope) * 0.6 + windSpeed * BALL_GROUND_PUSH) * dt;
      b.vx *= Math.exp(-BALL_ROLL_DRAG * dt);
      b.x += b.vx * dt;
      b.y = w.terrain.heightAt(b.x) + b.r;
      continue;
    }
    b.vy -= BALL_GRAVITY * dt;
    b.vx += (windSpeed - b.vx) * BALL_WIND_COUPLING * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    const ground = w.terrain.heightAt(b.x);
    if (b.y - b.r > ground) continue;

    // Bounce off the slope: reflect the speed into the ground, keep most of the sideways speed.
    const slope = w.terrain.slopeAt(b.x);
    const norm = Math.hypot(slope, 1);
    const nx = -slope / norm;
    const ny = 1 / norm;
    const into = b.vx * nx + b.vy * ny;
    b.y = ground + b.r + 0.01;
    if (into >= 0) continue;
    const tx = b.vx - into * nx;
    const ty = b.vy - into * ny;
    if (-into < BALL_REST_SPEED) {
      b.grounded = true;
      b.vx = tx;
      b.vy = 0;
    } else {
      b.vx = tx * BALL_BOUNCE_KEEP - BALL_RESTITUTION * into * nx;
      b.vy = ty * BALL_BOUNCE_KEEP - BALL_RESTITUTION * into * ny;
      b.bounces++;
    }
  }

  // Balls dissolve when their time is up, break up before reaching the base, and are dropped when far away.
  w.balls = w.balls.filter((b) => b.age < b.life && Math.abs(b.x) >= BALL_BASE_SHIELD && Math.abs(b.x - c.x) < 1800);

  if (w.status === 'crashed') return;
  for (const b of w.balls) {
    if (b.delay > 0) continue;
    if (Math.hypot(b.x - c.x, b.y - c.y) < b.r + CRAFT_RADIUS) {
      w.status = 'crashed';
      w.message = 'Hit by a methane ice ball';
      c.vx = 0;
      c.vy = 0;
      return;
    }
  }
}
