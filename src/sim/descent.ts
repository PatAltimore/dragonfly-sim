import {
  AUTO_RELEASE_AGL,
  CHUTE_SPEED,
  CHUTE_STEER_SPEED,
  CHUTE_WIND,
  MIN_RECOVERY_AGL,
  SKID_DROP,
  SPINUP_GRAVITY,
  SPINUP_MAX_FALL,
  SPINUP_TIME,
} from './constants';
import { spireHit } from './obstacles';
import type { Input, World } from './world';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function crash(w: World, message: string): void {
  const c = w.craft;
  w.status = 'crashed';
  w.message = message;
  c.vx = 0;
  c.vy = 0;
  c.y = w.terrain.groundUnder(c.x) + SKID_DROP;
}

/**
 * The scripted entry sequence before powered flight: parachute, jettison, rotor spin-up.
 * The pilot steers sideways and chooses when to jettison; everything else is on rails.
 */
export function stepDescent(w: World, pilot: Input, dt: number): void {
  const c = w.craft;
  const agl = c.y - SKID_DROP - w.terrain.groundUnder(c.x);
  const tilt = clamp(pilot.tilt, -1, 1);
  if (Math.abs(tilt) > 0.2) c.facing = tilt > 0 ? 1 : -1;
  const k = 1 - Math.exp(-1.5 * dt);

  if (w.phase === 'chute') {
    c.vx += (CHUTE_WIND + tilt * CHUTE_STEER_SPEED - c.vx) * k;
    c.vy += (-CHUTE_SPEED - c.vy) * k;
    c.pitch = 0.07 * Math.sin(w.time * 1.7) - tilt * 0.12;
    if (pilot.climb > 0 || agl <= AUTO_RELEASE_AGL) {
      w.phase = 'spinup';
      w.spin = 0;
      w.message = 'Chute away: spinning up rotors';
    }
  } else {
    w.spin = Math.min(1, w.spin + dt / SPINUP_TIME);
    c.vx += (tilt * CHUTE_STEER_SPEED * 0.5 - c.vx) * k;
    c.vy = Math.max(-SPINUP_MAX_FALL, c.vy - SPINUP_GRAVITY * dt);
    c.pitch += (tilt * 0.15 - c.pitch) * (1 - Math.exp(-6 * dt));
    c.throttle = w.spin * 0.5;
  }

  c.x += c.vx * dt;
  c.y += c.vy * dt;

  if (spireHit(w)) {
    crash(w, 'Hit a rock spire');
    return;
  }

  const ground = w.terrain.groundUnder(c.x);
  if (c.y - SKID_DROP <= ground) {
    crash(w, w.phase === 'chute' ? 'Hit the ground under the parachute' : 'Hit the ground before the rotors spun up');
    return;
  }
  if (w.phase === 'spinup' && w.spin >= 1) {
    if (c.y - SKID_DROP - ground < MIN_RECOVERY_AGL) {
      crash(w, 'Rotors spun up too low to recover');
      return;
    }
    w.phase = 'flight';
    w.message = '';
  }
}
