import type { World } from './world';

export interface RunResult {
  completed: boolean;
  crashed: boolean;
  /** Why the run ended badly, if it did. */
  reason: string;
  /** Points from uploaded science. */
  science: number;
  timeBonus: number;
  batteryBonus: number;
  total: number;
  /** 0 for a failed run, otherwise 1 to 3. */
  stars: number;
  /** Mission time in seconds. */
  time: number;
  battery: number;
  /** Cargo value destroyed in a crash. */
  lost: number;
}

/** Bonus points needed on top of completing the sortie for the second and third star. */
const STAR2_BONUS = 150;
const STAR3_BONUS = 300;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Score the run as it stands: complete, crashed, or abandoned. */
export function evaluate(w: World): RunResult {
  const s = w.science;
  const completed = s.complete;
  const crashed = w.status === 'crashed';
  const time = completed ? s.completeTime : w.time;
  const timeBonus = completed ? Math.round(clamp((w.level.parTime - time) * 4, 0, 300)) : 0;
  const battery = completed ? s.completeBattery : w.battery;
  const batteryBonus = completed ? Math.round(battery * 200) : 0;
  const bonus = timeBonus + batteryBonus;
  const stars = !completed ? 0 : bonus >= STAR3_BONUS ? 3 : bonus >= STAR2_BONUS ? 2 : 1;
  return {
    completed,
    crashed,
    reason: crashed ? w.message : '',
    science: s.score,
    timeBonus,
    batteryBonus,
    total: s.score + bonus,
    stars,
    time,
    battery,
    lost: s.lostValue,
  };
}
