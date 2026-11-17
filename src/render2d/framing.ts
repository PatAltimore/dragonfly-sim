import { PHOTO_MAX_AGL } from '../sim/constants';
import type { World } from '../sim/world';

/** The area the camera should keep in view: the craft and whatever it is probably heading for. */
export interface FrameBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Targets and the base this close along the track (m) pull the camera toward them. */
const POI_RANGE = 300;
/** Horizontal margin (m) around the craft and the destination, and the largest view the camera will zoom out to (m). */
const MARGIN_X = 40;
export const MAX_VIEW_H = 480;

/**
 * The craft and the nearest destination: an unfinished target, or the base once there is cargo to upload.
 * Dropping into a valley between hills, or lining up a landing, keeps the landing spot on screen.
 */
export function poiBox(w: World): FrameBox | null {
  if (w.phase !== 'flight' || w.status === 'crashed') return null;
  const c = w.craft;
  const s = w.science;
  let best: { x: number; top: number } | null = null;
  const consider = (x: number, top: number) => {
    if (Math.abs(x - c.x) > POI_RANGE) return;
    if (!best || Math.abs(x - c.x) < Math.abs(best.x - c.x)) best = { x, top };
  };
  if (!s.complete) {
    for (const t of s.targets) {
      if (t.collected) continue;
      consider(t.x, t.kind === 'dragoncam' ? PHOTO_MAX_AGL : 12);
    }
  }
  if (s.cargo.length > 0 || s.complete || (w.intro && !w.landing)) consider(0, 12);
  if (!best) return null;
  const poi = best as { x: number; top: number };
  const ground = w.terrain.heightAt(poi.x);
  return {
    x0: Math.min(c.x, poi.x) - MARGIN_X,
    x1: Math.max(c.x, poi.x) + MARGIN_X,
    y0: Math.min(c.y - 4, ground) - 8,
    y1: Math.max(c.y + 10, ground + poi.top) + 6,
  };
}

/** The view height (m) that fits the box on a screen of this aspect ratio, with a little room to spare. */
export const boxViewH = (b: FrameBox, aspect: number): number =>
  Math.min(MAX_VIEW_H, Math.max((b.y1 - b.y0) * 1.25, ((b.x1 - b.x0) * 1.15) / Math.max(0.5, aspect)));
