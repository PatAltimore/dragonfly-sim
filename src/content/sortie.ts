import type { Terrain } from '../sim/terrain';
import type { InstrumentId } from './instruments';

export interface TargetSpec {
  kind: InstrumentId;
  /** Nominal position along the track (m). Landing targets are nudged onto flat ground. */
  x: number;
}

/** Nearest x to the wanted one where the ground is flat enough to land on comfortably. */
export function snapToFlat(terrain: Terrain, x: number): number {
  const flat = (px: number) => Math.abs(terrain.slopeAt(px - 5)) < 0.12 && Math.abs(terrain.slopeAt(px + 5)) < 0.12 && Math.abs(terrain.slopeAt(px)) < 0.12;
  for (let d = 0; d <= 200; d += 2) {
    if (flat(x + d)) return x + d;
    if (flat(x - d)) return x - d;
  }
  return x;
}
