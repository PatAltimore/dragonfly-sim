import { INSTRUMENTS, type InstrumentId } from '../content/instruments';
import { snapToFlat, type TargetSpec } from '../content/sortie';
import {
  BASE_RADIUS,
  PHOTO_MAX_AGL,
  PHOTO_MAX_SPEED,
  PHOTO_MIN_AGL,
  PHOTO_RADIUS,
  PROGRESS_DECAY,
  SKID_DROP,
  TARGET_RADIUS,
  UPLOAD_TIME,
} from './constants';
import type { Terrain } from './terrain';
import type { World } from './world';

export interface Target {
  id: number;
  kind: InstrumentId;
  x: number;
  /** Work done so far, in [0, 1]. Drains while the pilot isn't in position. */
  progress: number;
  collected: boolean;
}

export interface CargoItem {
  kind: InstrumentId;
  value: number;
}

export interface Science {
  targets: Target[];
  /** Data on board that has not reached the base yet. Lost if the craft crashes. */
  cargo: CargoItem[];
  /** Points banked by uploading at the base. */
  score: number;
  /** Id of the target being worked on this step, or null. */
  activeId: number | null;
  /** Upload progress at the base, in [0, 1]. */
  upload: number;
  /** Short event message ("DATA UPLOADED +350") and when it stops showing. */
  toast: string;
  toastUntil: number;
  /** Sim time until which the first-sortie hint shows; 0 until the first takeoff. */
  hintUntil: number;
  complete: boolean;
  completeTime: number;
  /** Battery level at the moment the sortie finished. */
  completeBattery: number;
  /** Value of the cargo destroyed in a crash. */
  lostValue: number;
}

export function createScience(terrain: Terrain, specs: TargetSpec[], hintUntil: number): Science {
  return {
    targets: specs.map((spec, id) => ({
      id,
      kind: spec.kind,
      x: INSTRUMENTS[spec.kind].landing ? snapToFlat(terrain, spec.x) : spec.x,
      progress: 0,
      collected: false,
    })),
    cargo: [],
    score: 0,
    activeId: null,
    upload: 0,
    toast: '',
    toastUntil: 0,
    hintUntil,
    complete: false,
    completeTime: 0,
    completeBattery: 0,
    lostValue: 0,
  };
}

export const cargoValue = (s: Science): number => s.cargo.reduce((sum, item) => sum + item.value, 0);

function say(w: World, text: string): void {
  w.science.toast = text;
  w.science.toastUntil = w.time + 3;
}

/** Collect, carry and bank science. Runs after the flight step. */
export function stepScience(w: World, dt: number): void {
  const s = w.science;
  if (w.phase !== 'flight' || s.complete) return;
  const c = w.craft;

  if (w.status === 'crashed') {
    if (s.cargo.length > 0) {
      s.lostValue = cargoValue(s);
      s.cargo = [];
    }
    return;
  }

  const agl = c.y - SKID_DROP - w.terrain.groundUnder(c.x);
  s.activeId = null;
  for (const t of s.targets) {
    if (t.collected) continue;
    const ins = INSTRUMENTS[t.kind];
    const dx = Math.abs(c.x - t.x);
    const inPosition = ins.landing
      ? w.status === 'landed' && dx <= TARGET_RADIUS
      : w.status === 'flying' &&
        dx <= PHOTO_RADIUS &&
        agl >= PHOTO_MIN_AGL &&
        agl <= PHOTO_MAX_AGL &&
        Math.abs(c.vx) <= PHOTO_MAX_SPEED;
    if (inPosition) {
      t.progress += dt / ins.needTime;
      s.activeId = t.id;
    } else {
      t.progress = Math.max(0, t.progress - PROGRESS_DECAY * dt);
    }
    if (t.progress >= 1) {
      t.progress = 1;
      t.collected = true;
      s.cargo.push({ kind: t.kind, value: ins.value });
      say(w, `${ins.label} DATA ACQUIRED: return to base to upload`);
    }
  }

  const atBase = w.status === 'landed' && Math.abs(c.x) <= BASE_RADIUS;
  if (atBase && s.cargo.length > 0) {
    s.upload += dt / UPLOAD_TIME;
    if (s.upload >= 1) {
      const gained = cargoValue(s);
      s.score += gained;
      s.cargo = [];
      s.upload = 0;
      say(w, `DATA UPLOADED +${gained}`);
    }
  } else {
    s.upload = 0;
  }

  if (s.cargo.length === 0 && s.targets.every((t) => t.collected)) {
    s.complete = true;
    s.completeTime = w.time;
    s.completeBattery = w.battery;
  }
}
