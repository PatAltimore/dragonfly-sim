import { GUST, ZONES, ZONE_RAMP, type Zone } from '../content/hazards';

function hash(i: number, salt: number): number {
  const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export interface GustState {
  /** 0 outside the warning window, rising to 1 just before the gust hits. */
  warn: number;
  /** Signed sideways acceleration (m/s^2); positive pushes right. */
  accel: number;
  /** -1 or 1: which way the gust is (or will be) blowing. */
  dir: number;
  /** 0..1 how hard it is blowing right now. */
  blow: number;
}

/** Gusts are a pure function of time: one per period, with a telegraphed warning. */
export function gustAt(time: number): GustState {
  const k = Math.floor(time / GUST.period);
  const start = k * GUST.period + hash(k, 1) * (GUST.period - GUST.warn - GUST.blow - 1);
  const dir = hash(k, 2) < 0.5 ? -1 : 1;
  const t = time - start;
  if (t >= 0 && t < GUST.warn) return { warn: t / GUST.warn, accel: 0, dir, blow: 0 };
  const b = t - GUST.warn;
  if (b >= 0 && b < GUST.blow) {
    const blow = Math.sin((Math.PI * b) / GUST.blow);
    return { warn: 0, accel: dir * GUST.strength * blow, dir, blow };
  }
  return { warn: 0, accel: 0, dir, blow: 0 };
}

export function zoneCenter(z: Zone, time: number): number {
  return z.center + z.drift * time;
}

function zoneIntensity(z: Zone, x: number, time: number): number {
  const d = Math.abs(x - zoneCenter(z, time));
  const edge = (z.halfWidth - d) / ZONE_RAMP;
  return Math.min(1, Math.max(0, edge + 0.5));
}

function strongest(kind: Zone['kind'], x: number, time: number): number {
  let best = 0;
  for (const z of ZONES) if (z.kind === kind) best = Math.max(best, zoneIntensity(z, x, time));
  return best;
}

/** Methane rain intensity at a spot along the track, 0..1. */
export const rainAt = (x: number, time: number): number => strongest('rain', x, time);
/** Haze intensity at a spot along the track, 0..1. */
export const hazeAt = (x: number, time: number): number => strongest('haze', x, time);
