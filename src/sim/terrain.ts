import { SKID_HALF_SPAN } from './constants';

function hash(i: number, seed: number): number {
  let h = Math.imul(i, 374761393) + Math.imul(seed, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

/** 1D smooth value noise in [-1, 1]. */
function noise(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash(i, seed);
  const b = hash(i + 1, seed);
  return (a + (b - a) * u) * 2 - 1;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Dune-field heightfield, deterministic from a seed. y is up, in meters. */
export class Terrain {
  constructor(
    readonly seed: number,
    /** Half-width of the flat base pad around x = 0. */
    readonly padRadius = 25,
  ) {}

  heightAt(x: number): number {
    const s = this.seed;
    const h = 7 * noise(x / 90, s) + 3 * noise(x / 35 + 100, s + 1) + 0.8 * noise(x / 12 + 200, s + 2);
    const flat = smoothstep(this.padRadius, this.padRadius + 40, Math.abs(x));
    return h * flat;
  }

  /** dh/dx by central difference. */
  slopeAt(x: number): number {
    const e = 0.5;
    return (this.heightAt(x + e) - this.heightAt(x - e)) / (2 * e);
  }

  /** Highest ground under a craft's skids centered at x. */
  groundUnder(x: number): number {
    return Math.max(this.heightAt(x - SKID_HALF_SPAN), this.heightAt(x), this.heightAt(x + SKID_HALF_SPAN));
  }
}
