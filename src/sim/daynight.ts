import { DAY_LENGTH, START_PHASE } from './constants';

/** Fraction of the Titan day elapsed, in [0, 1). 0 is dawn, 0.25 noon, 0.5 dusk, 0.75 midnight. */
export function dayPhase(time: number): number {
  const p = (time / DAY_LENGTH + START_PHASE) % 1;
  return p < 0 ? p + 1 : p;
}

/** Daylight in [0, 1]: 1 at noon, 0 through the deep night. */
export function daylight(time: number): number {
  const l = 0.5 + 0.8 * Math.sin(2 * Math.PI * dayPhase(time));
  return Math.min(1, Math.max(0, l));
}

export function isNight(time: number): boolean {
  return daylight(time) < 0.25;
}

/** 1-based Titan day number. */
export function dayNumber(time: number): number {
  return Math.floor(time / DAY_LENGTH + START_PHASE) + 1;
}

export function phaseLabel(time: number): string {
  const p = dayPhase(time);
  if (isNight(time)) return 'NIGHT';
  if (p < 0.12) return 'DAWN';
  if (p > 0.38 && p < 0.55) return 'DUSK';
  return 'DAY';
}
