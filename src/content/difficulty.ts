import type { GustSpec } from './hazards';
import type { Level } from './levels';

export type Difficulty = 'easy' | 'medium' | 'hard';
export const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'medium', 'hard'];

/**
 * How a difficulty bends a sortie. Easy is the baseline. Medium and Hard make the weather and landing
 * stricter, make the ground rougher, and add obstacles that force the pilot to change altitude:
 * rock spires to climb over and turbulence cells to go around.
 */
export interface DifficultySpec {
  id: Difficulty;
  label: string;
  tagline: string;
  color: string;

  /** Multipliers on the level's own settings. */
  drainMult: number;
  gustStrength: number;
  gustPeriod: number;
  /** Warning time before a gust (s). */
  gustWarn: number;
  /** Scales the effect of methane rain on climb speed, drag and battery. */
  weatherMult: number;
  /** Scales how steep the far ridges get. */
  ridgeAmp: number;
  parMult: number;
  /** Scales the landing limits: lower is stricter. */
  landingTol: number;
  /** Scales how long drilling, scanning and imaging take. */
  scienceTime: number;
  /** Multiplier on the sortie's score. */
  scoreMult: number;

  /** Rock spires per km of track, their height and half-width ranges (m). */
  spiresPerKm: number;
  spireHeight: [number, number];
  spireHalfWidth: [number, number];
  /** Turbulence cells per km, their height above the ground, radius (m), drift (m/s) and peak shove (m/s). */
  cellsPerKm: number;
  cellAlt: [number, number];
  cellRadius: [number, number];
  cellDrift: number;
  turbulence: number;

  /** Squall fronts per km: fast storm bands sweeping horizontally through the high sky. Altitude (m) and speed (m/s) ranges. */
  squallsPerKm: number;
  squallAlt: [number, number];
  squallSpeed: [number, number];
  /** Cryo-vents: extra ones per km, the chance a landing target has one right on it, the eruption period (s) and plume height (m). */
  ventsPerKm: number;
  ventTargetChance: number;
  ventPeriod: [number, number];
  plumeHeight: [number, number];
  /** How many rotors can be lost before the craft goes down, and seconds of repair per rotor when landed at the base. */
  rotorsFatal: number;
  rotorRepair: number;
}

export const DIFFICULTIES: Record<Difficulty, DifficultySpec> = {
  easy: {
    id: 'easy',
    label: 'EASY',
    tagline: 'Open ground and fair weather. A good place to learn.',
    color: '#8be07a',
    drainMult: 1,
    gustStrength: 1,
    gustPeriod: 1,
    gustWarn: 2,
    weatherMult: 1,
    ridgeAmp: 1,
    parMult: 1,
    landingTol: 1,
    scienceTime: 1,
    scoreMult: 1,
    spiresPerKm: 0,
    spireHeight: [0, 0],
    spireHalfWidth: [0, 0],
    cellsPerKm: 0,
    cellAlt: [0, 0],
    cellRadius: [0, 0],
    cellDrift: 0,
    turbulence: 0,
    squallsPerKm: 0,
    squallAlt: [0, 0],
    squallSpeed: [0, 0],
    ventsPerKm: 0,
    ventTargetChance: 0,
    ventPeriod: [10, 10],
    plumeHeight: [0, 0],
    rotorsFatal: 99,
    rotorRepair: 6,
  },
  medium: {
    id: 'medium',
    label: 'MEDIUM',
    tagline: 'Rock spires and turbulence: climb, descend and weave.',
    color: '#ffd27a',
    drainMult: 1.15,
    gustStrength: 1.25,
    gustPeriod: 0.85,
    gustWarn: 1.6,
    weatherMult: 1.3,
    ridgeAmp: 1.35,
    parMult: 0.9,
    landingTol: 0.85,
    scienceTime: 1.25,
    scoreMult: 1.25,
    spiresPerKm: 2.5,
    spireHeight: [22, 52],
    spireHalfWidth: [3, 6],
    cellsPerKm: 0.8,
    cellAlt: [55, 110],
    cellRadius: [26, 36],
    cellDrift: 0,
    turbulence: 30,
    squallsPerKm: 0.8,
    squallAlt: [70, 170],
    squallSpeed: [30, 45],
    ventsPerKm: 0.6,
    ventTargetChance: 0.4,
    ventPeriod: [11, 15],
    plumeHeight: [40, 55],
    rotorsFatal: 4,
    rotorRepair: 6,
  },
  hard: {
    id: 'hard',
    label: 'HARD',
    tagline: 'Dense spires, drifting storms, harsh weather, tight landings.',
    color: '#ff6a4a',
    drainMult: 1.3,
    gustStrength: 1.5,
    gustPeriod: 0.7,
    gustWarn: 1.2,
    weatherMult: 1.6,
    ridgeAmp: 1.8,
    parMult: 0.8,
    landingTol: 0.7,
    scienceTime: 1.5,
    scoreMult: 1.5,
    spiresPerKm: 4.5,
    spireHeight: [30, 80],
    spireHalfWidth: [3, 7],
    cellsPerKm: 1.6,
    cellAlt: [45, 120],
    cellRadius: [28, 42],
    cellDrift: 4,
    turbulence: 42,
    squallsPerKm: 1.6,
    squallAlt: [55, 200],
    squallSpeed: [45, 70],
    ventsPerKm: 1.2,
    ventTargetChance: 0.75,
    ventPeriod: [8, 11],
    plumeHeight: [55, 75],
    rotorsFatal: 3,
    rotorRepair: 9,
  },
};

/** The level as flown at this difficulty: its own settings scaled by the difficulty's multipliers. */
export function applyDifficulty(level: Level, spec: DifficultySpec): Level {
  const gust: GustSpec | null = level.gust
    ? {
        ...level.gust,
        strength: level.gust.strength * spec.gustStrength,
        period: level.gust.period * spec.gustPeriod,
        warn: spec.gustWarn,
      }
    : null;
  return {
    ...level,
    ridgeAmp: level.ridgeAmp * spec.ridgeAmp,
    drainMult: level.drainMult * spec.drainMult,
    parTime: Math.round(level.parTime * spec.parMult),
    gust,
  };
}
