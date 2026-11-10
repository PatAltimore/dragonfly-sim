import type { GustSpec } from './hazards';
import type { Level } from './levels';

export type Difficulty = 'easy' | 'medium' | 'hard';
export const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'medium', 'hard'];

/**
 * How a difficulty bends a sortie. Easy is the baseline. Medium and Hard make the weather and landing
 * stricter, make the ground rougher, and add ice vents that lob bouncing methane ice balls.
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

  /** Ice vents: extra ones per km, the chance each landing target has one nearby, and seconds between shots. */
  ventsPerKm: number;
  ventTargetChance: number;
  ventPeriod: [number, number];
  /** Ice balls: launch speed (m/s), the chances a shot is a low flat one or a mid-angle arc (the rest are steep lobs),
   * balls per shot, lifetime (s), radius (m), and the chance a shot is aimed toward the craft. */
  ballSpeed: [number, number];
  ballFlat: number;
  ballMid: number;
  ballBurst: number;
  ballLife: number;
  ballRadius: number;
  ballAim: number;
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
    ventsPerKm: 0,
    ventTargetChance: 0,
    ventPeriod: [10, 10],
    ballSpeed: [0, 0],
    ballFlat: 0,
    ballMid: 0,
    ballBurst: 0,
    ballLife: 0,
    ballRadius: 0,
    ballAim: 0,
  },
  medium: {
    id: 'medium',
    label: 'MEDIUM',
    tagline: 'Ice vents lob bouncing balls. Watch the sky, on the ground too.',
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
    ventsPerKm: 0.6,
    ventTargetChance: 0.4,
    ventPeriod: [9, 13],
    ballSpeed: [44, 60],
    ballFlat: 0.3,
    ballMid: 0.25,
    ballBurst: 1,
    ballLife: 16,
    ballRadius: 2,
    ballAim: 0.4,
  },
  hard: {
    id: 'hard',
    label: 'HARD',
    tagline: 'More vents, double shots, harsh weather, tight landings.',
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
    ventsPerKm: 1.2,
    ventTargetChance: 0.75,
    ventPeriod: [6.5, 9],
    ballSpeed: [48, 68],
    ballFlat: 0.35,
    ballMid: 0.25,
    ballBurst: 2,
    ballLife: 20,
    ballRadius: 2.3,
    ballAim: 0.6,
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
