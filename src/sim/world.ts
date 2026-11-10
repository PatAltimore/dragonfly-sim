import {
  BASE_CHARGE_MULT,
  BASE_RADIUS,
  CHUTE_SPEED,
  CHUTE_WIND,
  CLIMB_DRAIN,
  CLIMB_SPEED,
  DESCEND_SPEED,
  DRAG_X,
  FLIGHT_CHARGE,
  GRAVITY,
  HOVER_DRAIN,
  LANDED_CHARGE,
  LAND_TAPER_MIN,
  LAND_TAPER_RATE,
  H_ACCEL,
  MAX_IMPACT_SPEED,
  MAX_LAND_SLOPE,
  MAX_LAND_TILT,
  MAX_SLIDE_SPEED,
  MAX_THRUST_ACCEL,
  MAX_TILT,
  MIN_TAKEOFF_BATTERY,
  PAD_BULLSEYE,
  RAIN_CLIMB_PENALTY,
  RAIN_DRAG,
  RAIN_DRAIN,
  NIGHT_CHARGE_MULT,
  NIGHT_DRAIN_MULT,
  SKID_DROP,
  START_AGL,
  START_X,
  TILT_DRAIN,
  THROTTLE_RESPONSE,
  TILT_RESPONSE,
  VS_GAIN,
} from './constants';
import { stepDescent } from './descent';
import { isNight } from './daynight';
import { gustAt, rainAt } from './hazards';
import { applyDifficulty, DIFFICULTIES, type Difficulty, type DifficultySpec } from '../content/difficulty';
import type { Level } from '../content/levels';
import { generateObstacles, spireHit, turbulenceAt, type Obstacles } from './obstacles';
import { createScience, stepScience, type Science } from './science';
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

/** Entry sequence phases; 'flight' is normal powered flight. */
export type Phase = 'chute' | 'spinup' | 'flight';

/** Scoring for the intro touchdown. */
export interface LandingResult {
  /** Distance from the pad center (m). */
  offset: number;
  /** Ground speed at touchdown (m/s). */
  slide: number;
  /** Body tilt relative to the slope at touchdown (rad). */
  tilt: number;
  battery: number;
  score: number;
  rating: string;
  /** Set once the craft takes off again, so the results panel can go away. */
  dismissed: boolean;
}

export interface World {
  terrain: Terrain;
  /** The sortie as flown: the level's settings already scaled by the difficulty. */
  level: Level;
  difficulty: DifficultySpec;
  obstacles: Obstacles;
  phase: Phase;
  /** Rotor spin-up progress in [0, 1] during the 'spinup' phase. */
  spin: number;
  /** True when this run began with the entry descent. */
  intro: boolean;
  landing: LandingResult | null;
  science: Science;
  craft: Craft;
  status: Status;
  /** Why the craft crashed, or a landing note. */
  message: string;
  time: number;
  /** Battery charge as a fraction in [0, 1]. */
  battery: number;
  /** Horizontal wind acceleration (m/s^2), reserved for hazards. */
  wind: number;
  /** How hard turbulence is buffeting the craft right now, 0 to 1. */
  turbulence: number;
}

export const NO_INPUT: Input = { tilt: 0, climb: 0 };

/** Weather only applies once the pilot is on the sortie, not during the intro descent. */
export const weatherActive = (w: World): boolean => !w.intro || w.landing !== null;

/** Seconds on the Titan day clock: sim time plus the level's starting offset. */
export const clockOf = (w: World): number => w.time + w.level.clockOffset;

export function createWorld(source: Level, opts: { skipIntro?: boolean; difficulty?: Difficulty } = {}): World {
  const difficulty = DIFFICULTIES[opts.difficulty ?? 'easy'];
  const level = applyDifficulty(source, difficulty);
  const intro = level.intro && !opts.skipIntro;
  const terrain = new Terrain(level.seed, 25, level.ridgeAmp);
  const science = createScience(terrain, level.targets, intro ? 0 : 20);
  const base = {
    terrain,
    level,
    difficulty,
    obstacles: generateObstacles(level, science.targets.map((t) => t.x), difficulty),
    spin: 1,
    intro,
    landing: null,
    science,
    time: 0,
    battery: 1,
    wind: 0,
    turbulence: 0,
  };
  if (intro) {
    const y = terrain.groundUnder(START_X) + START_AGL + SKID_DROP;
    return {
      ...base,
      phase: 'chute',
      spin: 0,
      craft: { x: START_X, y, vx: CHUTE_WIND, vy: -CHUTE_SPEED, pitch: 0, throttle: 0, facing: 1, rotorPhase: 0 },
      status: 'flying',
      message: '',
    };
  }
  const y = terrain.groundUnder(0) + SKID_DROP;
  return {
    ...base,
    phase: 'flight',
    craft: { x: 0, y, vx: 0, vy: 0, pitch: 0, throttle: 0, facing: 1, rotorPhase: 0 },
    status: 'landed',
    message: 'Ready for takeoff',
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Altitude above the ground under the craft's skids (m). */
export function altitudeAGL(w: World): number {
  return w.craft.y - SKID_DROP - w.terrain.groundUnder(w.craft.x);
}

/** Power is lost with an empty battery: the craft can only auto-descend. */
export function isPowerLost(w: World): boolean {
  return w.status === 'flying' && w.battery <= 0;
}

export function step(w: World, pilot: Input, dt: number): void {
  stepFlight(w, pilot, dt);
  stepScience(w, dt);
}

function stepFlight(w: World, pilot: Input, dt: number): void {
  const c = w.craft;
  w.time += dt;
  c.rotorPhase += (6 + c.throttle * 40) * dt;

  if (w.status === 'crashed') return;
  if (w.phase !== 'flight') {
    stepDescent(w, pilot, dt);
    return;
  }

  // Weather bites once the pilot is on the sortie: gusts push, rain thickens the air.
  const weatherOn = weatherActive(w);
  const rain = weatherOn ? rainAt(w.level.zones, c.x, w.time) : 0;
  /** Rain as it bites at this difficulty. */
  const wet = rain * w.difficulty.weatherMult;
  w.wind = weatherOn ? gustAt(w.level.gust, w.time).accel : 0;

  // Energy gates control: no power means an automatic, level descent; a flat battery can't lift off.
  let input = pilot;
  if (isPowerLost(w)) input = { tilt: 0, climb: -1 };
  else if (w.status === 'landed' && w.battery < MIN_TAKEOFF_BATTERY) input = { tilt: pilot.tilt, climb: Math.min(0, pilot.climb) };

  // Tilt follows the stick.
  const tiltTarget = clamp(input.tilt, -1, 1) * MAX_TILT;
  c.pitch += (tiltTarget - c.pitch) * (1 - Math.exp(-TILT_RESPONSE * dt));
  if (Math.abs(input.tilt) > 0.2) c.facing = input.tilt > 0 ? 1 : -1;

  // Arcade vertical control: pilot commands a climb rate, craft tracks it directly (no gravity lag).
  // Throttle just follows the command so the rotors look and sound right.
  // Descent rate tapers near the ground so holding "down" settles gently onto the surface.
  const descendSpeed = Math.min(DESCEND_SPEED, LAND_TAPER_MIN + LAND_TAPER_RATE * altitudeAGL(w));
  const vsTarget =
    input.climb > 0 ? CLIMB_SPEED * (1 - Math.min(0.75, RAIN_CLIMB_PENALTY * wet)) * input.climb : descendSpeed * input.climb;
  const hoverThrottle = GRAVITY / MAX_THRUST_ACCEL / Math.max(0.6, Math.cos(c.pitch));
  const throttleTarget = w.status === 'landed' && input.climb <= 0 ? 0 : clamp(hoverThrottle + (vsTarget - c.vy) * 0.1, 0, 1);
  c.throttle += (throttleTarget - c.throttle) * (1 - Math.exp(-THROTTLE_RESPONSE * dt));

  const night = isNight(clockOf(w));
  w.turbulence = 0;
  if (w.status === 'landed') {
    // Sitting on the ground: recharge, slide to a stop, lift off once thrust beats gravity.
    w.battery = Math.min(1, w.battery + LANDED_CHARGE * (night ? NIGHT_CHARGE_MULT : 1) * (Math.abs(c.x) <= BASE_RADIUS ? BASE_CHARGE_MULT : 1) * dt);
    if (w.battery < MIN_TAKEOFF_BATTERY) w.message = `Recharging: ${Math.round(w.battery * 100)}%`;
    else if (['Recharging', 'POWER', 'Safe'].some((m) => w.message.startsWith(m))) w.message = 'Ready for takeoff';
    c.vx *= Math.exp(-4 * dt);
    c.y = w.terrain.groundUnder(c.x) + SKID_DROP;
    c.vy = 0;
    if (input.climb > 0 && c.throttle * MAX_THRUST_ACCEL > GRAVITY * 1.05) {
      w.status = 'flying';
      w.message = '';
      if (w.landing) w.landing.dismissed = true;
      if (w.science.hintUntil === 0) w.science.hintUntil = w.time + 15;
    } else {
      return;
    }
  }

  // Pockets of turbulence (Medium and Hard) shove the craft and cost extra energy.
  const turb = weatherOn ? turbulenceAt(w, c.x, c.y) : { intensity: 0, vx: 0, vy: 0 };

  // Flight burns battery in proportion to climb and tilt effort; the MMRTG trickle barely offsets it.
  const load =
    HOVER_DRAIN + (CLIMB_DRAIN * Math.abs(c.vy)) / CLIMB_SPEED + (TILT_DRAIN * Math.abs(c.pitch)) / MAX_TILT;
  w.battery = Math.min(1, Math.max(0, w.battery + (FLIGHT_CHARGE - load * (night ? NIGHT_DRAIN_MULT : 1) * (1 + RAIN_DRAIN * wet) * (1 + 0.8 * turb.intensity) * w.level.drainMult) * dt));
  if (isPowerLost(w)) w.message = 'POWER LOST - emergency landing';

  // Horizontal: tilt pushes, thick air pushes back, so speed settles quickly and stops quickly.
  c.vx += (H_ACCEL * Math.sin(c.pitch) - DRAG_X * (1 + RAIN_DRAG * wet) * c.vx + w.wind) * dt;
  c.vy += (vsTarget - c.vy) * (1 - Math.exp(-VS_GAIN * dt));
  c.x += c.vx * dt;
  c.y += c.vy * dt;

  // Turbulence shoves the craft directly, whatever the pilot commands.
  c.x += turb.vx * dt;
  c.y += turb.vy * dt;
  w.turbulence = turb.intensity;

  if (spireHit(w)) {
    w.status = 'crashed';
    w.message = 'Hit a rock spire';
    c.vx = 0;
    c.vy = 0;
    return;
  }

  resolveGround(w);
}

function resolveGround(w: World): void {
  const c = w.craft;
  const ground = w.terrain.groundUnder(c.x);
  if (c.y - SKID_DROP > ground) return;
  /** Harder difficulties tighten the landing limits. */
  const tol = w.difficulty.landingTol;

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
  if (impact > MAX_IMPACT_SPEED * tol) reason = `Hard impact (${impact.toFixed(1)} m/s)`;
  else if (Math.abs(slope) > MAX_LAND_SLOPE) reason = 'Slope too steep to land';
  else if (tilt > MAX_LAND_TILT * tol) reason = 'Landed tilted';
  else if (slide > MAX_SLIDE_SPEED * tol) reason = `Too fast over the ground (${slide.toFixed(1)} m/s)`;

  c.y = ground + SKID_DROP;
  if (reason) {
    w.status = 'crashed';
    w.message = reason;
    c.vx = 0;
    c.vy = 0;
    return;
  }
  if (w.intro && !w.landing) w.landing = scoreLanding(w, slide, tilt);
  w.status = 'landed';
  w.message = w.battery <= 0 ? 'Safe emergency landing - recharging' : 'Touchdown';
  c.vy = 0;
}

function scoreLanding(w: World, slide: number, tilt: number): LandingResult {
  const offset = Math.abs(w.craft.x);
  const accuracy = offset <= PAD_BULLSEYE ? 1 : clamp(1 - (offset - PAD_BULLSEYE) / 90, 0, 1);
  const quality = clamp(1 - slide / 6 - tilt / (MAX_LAND_TILT * 2), 0, 1);
  const score = Math.round(accuracy * 500 + quality * 300 + w.battery * 200);
  const rating = score >= 850 ? 'EXCELLENT' : score >= 650 ? 'GOOD' : 'SAFE';
  return { offset, slide, tilt, battery: w.battery, score, rating, dismissed: false };
}
