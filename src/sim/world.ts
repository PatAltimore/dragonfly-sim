import {
  CLIMB_SPEED,
  DESCEND_SPEED,
  DRAG_X,
  GRAVITY,
  LAND_TAPER_MIN,
  LAND_TAPER_RATE,
  H_ACCEL,
  MAX_IMPACT_SPEED,
  MAX_LAND_SLOPE,
  MAX_LAND_TILT,
  MAX_SLIDE_SPEED,
  MAX_THRUST_ACCEL,
  MAX_TILT,
  SKID_DROP,
  THROTTLE_RESPONSE,
  TILT_RESPONSE,
  VS_GAIN,
} from './constants';
import { Terrain } from './terrain';

/** Abstract pilot input, independent of device. Both axes are in [-1, 1]. */
export interface Input {
  /** -1 = tilt left, +1 = tilt right. */
  tilt: number;
  /** +1 = climb, -1 = descend, 0 = hold altitude (auto-hover). */
  climb: number;
}

export type Status = 'flying' | 'landed' | 'crashed';

export interface Craft {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Body tilt in radians. Positive leans right, thrust pushes right. */
  pitch: number;
  /** Rotor throttle in [0, 1]. */
  throttle: number;
  /** Direction the craft faces: 1 = right, -1 = left. */
  facing: 1 | -1;
  /** Rotor spin phase in radians, cosmetic. */
  rotorPhase: number;
}

export interface World {
  terrain: Terrain;
  craft: Craft;
  status: Status;
  /** Why the craft crashed, or a landing note. */
  message: string;
  time: number;
  /** Horizontal wind acceleration (m/s^2), reserved for hazards. */
  wind: number;
}

export const NO_INPUT: Input = { tilt: 0, climb: 0 };

export function createWorld(seed = 1): World {
  const terrain = new Terrain(seed);
  const y = terrain.groundUnder(0) + SKID_DROP;
  return {
    terrain,
    craft: { x: 0, y, vx: 0, vy: 0, pitch: 0, throttle: 0, facing: 1, rotorPhase: 0 },
    status: 'landed',
    message: 'Ready for takeoff',
    time: 0,
    wind: 0,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Altitude above the ground under the craft's skids (m). */
export function altitudeAGL(w: World): number {
  return w.craft.y - SKID_DROP - w.terrain.groundUnder(w.craft.x);
}

export function step(w: World, input: Input, dt: number): void {
  const c = w.craft;
  w.time += dt;
  c.rotorPhase += (6 + c.throttle * 40) * dt;

  if (w.status === 'crashed') return;

  // Tilt follows the stick.
  const tiltTarget = clamp(input.tilt, -1, 1) * MAX_TILT;
  c.pitch += (tiltTarget - c.pitch) * (1 - Math.exp(-TILT_RESPONSE * dt));
  if (Math.abs(input.tilt) > 0.2) c.facing = input.tilt > 0 ? 1 : -1;

  // Arcade vertical control: pilot commands a climb rate, craft tracks it directly (no gravity lag).
  // Throttle just follows the command so the rotors look and sound right.
  // Descent rate tapers near the ground so holding "down" settles gently onto the surface.
  const descendSpeed = Math.min(DESCEND_SPEED, LAND_TAPER_MIN + LAND_TAPER_RATE * altitudeAGL(w));
  const vsTarget = input.climb > 0 ? CLIMB_SPEED * input.climb : descendSpeed * input.climb;
  const hoverThrottle = GRAVITY / MAX_THRUST_ACCEL / Math.max(0.6, Math.cos(c.pitch));
  const throttleTarget = w.status === 'landed' && input.climb <= 0 ? 0 : clamp(hoverThrottle + (vsTarget - c.vy) * 0.1, 0, 1);
  c.throttle += (throttleTarget - c.throttle) * (1 - Math.exp(-THROTTLE_RESPONSE * dt));

  if (w.status === 'landed') {
    // Sitting on the ground: slide to a stop, level out, lift off once thrust beats gravity.
    c.vx *= Math.exp(-4 * dt);
    c.y = w.terrain.groundUnder(c.x) + SKID_DROP;
    c.vy = 0;
    if (c.throttle * MAX_THRUST_ACCEL > GRAVITY * 1.05) {
      w.status = 'flying';
      w.message = '';
    } else {
      return;
    }
  }

  // Horizontal: tilt pushes, thick air pushes back, so speed settles quickly and stops quickly.
  c.vx += (H_ACCEL * Math.sin(c.pitch) - DRAG_X * c.vx + w.wind) * dt;
  c.vy += (vsTarget - c.vy) * (1 - Math.exp(-VS_GAIN * dt));
  c.x += c.vx * dt;
  c.y += c.vy * dt;

  resolveGround(w);
}

function resolveGround(w: World): void {
  const c = w.craft;
  const ground = w.terrain.groundUnder(c.x);
  if (c.y - SKID_DROP > ground) return;

  const slope = w.terrain.slopeAt(c.x);
  const slopeAngle = Math.atan(slope);
  // Surface normal and tangential components of velocity.
  const norm = Math.hypot(slope, 1);
  const nx = -slope / norm;
  const ny = 1 / norm;
  const impact = -(c.vx * nx + c.vy * ny);
  const slide = Math.abs(c.vx * ny - c.vy * nx);
  const tilt = Math.abs(c.pitch - slopeAngle);

  let reason = '';
  if (impact > MAX_IMPACT_SPEED) reason = `Hard impact (${impact.toFixed(1)} m/s)`;
  else if (Math.abs(slope) > MAX_LAND_SLOPE) reason = 'Slope too steep to land';
  else if (tilt > MAX_LAND_TILT) reason = 'Landed tilted';
  else if (slide > MAX_SLIDE_SPEED) reason = `Too fast over the ground (${slide.toFixed(1)} m/s)`;

  c.y = ground + SKID_DROP;
  if (reason) {
    w.status = 'crashed';
    w.message = reason;
    c.vx = 0;
    c.vy = 0;
    return;
  }
  w.status = 'landed';
  w.message = 'Touchdown';
  c.vy = 0;
}
