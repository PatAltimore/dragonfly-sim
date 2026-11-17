import { dayPhase } from '../sim/daynight';
import { clockOf, type World } from '../sim/world';

/**
 * The infrared view is an artistic one. Titan's haze is opaque to the eye, but infrared light gets through
 * it better, so this view removes the haze and shows Saturn as it would hang in a clear sky over the
 * Saturn-facing side of Titan. The real landing region is on the far side, where Saturn is never up.
 */

/** Saturn seen from Titan without its rings: 5.09 degrees across (Titan orbits 1.22 million km out). */
export const SATURN_DIAMETER_DEG = 5.09;
/** The A ring's outer edge is about 136,775 km from Saturn's center, 2.27 times its 60,268 km equatorial radius. */
const RING_OUTER = 2.27;
/** Titan orbits in Saturn's equatorial plane, so the rings are seen edge-on, as a thin line. */
const RING_EDGE_THICKNESS = 0.02;
/** The vertical field of view the sky is drawn for (degrees), same as the 3D camera. */
export const SKY_FOV_DEG = 50;
/** Where Saturn hangs on screen as fractions of the width and height. It is fixed in the sky: Titan is tidally locked. */
export const SATURN_SPOT = { x: 0.55, y: 0.34 };
/** Width of the ring span in degrees, for sizing a texture. */
export const SATURN_SPAN_DEG = SATURN_DIAMETER_DEG * RING_OUTER;

export const IR_DAY_SKY = ['#0b1236', '#2b2a78', '#7b3f95'];
export const IR_NIGHT_SKY = ['#02030c', '#090a24', '#150f33'];

/**
 * How much of Saturn's disc is lit, 0 to 1. Titan's day and its orbit around Saturn are the same length, so
 * Saturn goes through a full set of phases over one Titan day: new at local noon, full at midnight.
 */
export function saturnLit(w: World): number {
  return (1 - Math.sin(2 * Math.PI * dayPhase(clockOf(w)))) / 2;
}

/** The lit limb is on the right between noon and midnight, and on the left between midnight and noon. */
export function saturnLitRight(w: World): boolean {
  const p = dayPhase(clockOf(w));
  return p > 0.25 && p < 0.75;
}

const BANDS: [number, number, string][] = [
  [0.0, 0.14, '#cdb888'],
  [0.14, 0.3, '#e9d6a2'],
  [0.3, 0.42, '#d3bb86'],
  [0.42, 0.62, '#efdfae'],
  [0.62, 0.76, '#d9c28f'],
  [0.76, 0.9, '#e6d29c'],
  [0.9, 1.0, '#c4ae80'],
];

/** Draw Saturn centered at (cx, cy) with disc radius r in pixels: a pale gold, banded globe and edge-on rings. */
export function drawSaturn(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, lit: number, litRight: boolean): void {
  ctx.save();
  ctx.translate(cx, cy);
  if (!litRight) ctx.scale(-1, 1);

  // The night side still shows faintly, lit by the rings and by the sky.
  ctx.fillStyle = '#2b2740';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  if (lit > 0.01) {
    // The lit region: the right limb, closed by the terminator (an ellipse as wide as |1 - 2 * lit| of the disc).
    const rx = r * Math.abs(1 - 2 * lit);
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
    ctx.ellipse(0, 0, Math.max(0.01, rx), r, 0, Math.PI / 2, -Math.PI / 2, lit < 0.5);
    ctx.closePath();
    ctx.clip();
    for (const [a, b, color] of BANDS) {
      ctx.fillStyle = color;
      ctx.fillRect(-r, -r + a * 2 * r, 2 * r, (b - a) * 2 * r + 1);
    }
    // Darker toward the limb.
    const g = ctx.createRadialGradient(-r * 0.2, -r * 0.1, r * 0.2, 0, 0, r);
    g.addColorStop(0, 'rgba(255,248,220,0.18)');
    g.addColorStop(1, 'rgba(60,40,20,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, 2 * r, 2 * r);
    ctx.restore();
  }
  ctx.restore();

  // Edge-on rings: a thin bright line that fades out toward its ends.
  const half = r * RING_OUTER;
  const thick = Math.max(1.2, r * RING_EDGE_THICKNESS);
  const g2 = ctx.createLinearGradient(cx - half, 0, cx + half, 0);
  g2.addColorStop(0, 'rgba(232,215,170,0)');
  g2.addColorStop(0.12, 'rgba(232,215,170,0.75)');
  g2.addColorStop(0.5, 'rgba(240,226,184,0.95)');
  g2.addColorStop(0.88, 'rgba(232,215,170,0.75)');
  g2.addColorStop(1, 'rgba(232,215,170,0)');
  ctx.fillStyle = g2;
  ctx.fillRect(cx - half, cy - thick / 2, half * 2, thick);
}

/** Saturn drawn into a 2D scene at its fixed place in the sky. */
export function drawSaturnSky(ctx: CanvasRenderingContext2D, cw: number, ch: number, w: World): void {
  const r = (ch / SKY_FOV_DEG) * (SATURN_DIAMETER_DEG / 2);
  drawSaturn(ctx, cw * SATURN_SPOT.x, ch * SATURN_SPOT.y, r, saturnLit(w), saturnLitRight(w));
}

/** A cool blue-violet wash for the infrared look, and a small badge that says what the view is. */
export function drawIrOverlay(ctx: CanvasRenderingContext2D, cw: number, ch: number): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(70,60,200,0.12)';
  ctx.fillRect(0, 0, cw, ch);
  ctx.restore();
}

export function drawIrBadge(ctx: CanvasRenderingContext2D, ch: number): void {
  const u = Math.max(10, ch / 50);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.textAlign = 'left';
  ctx.font = `${u * 0.75}px monospace`;
  ctx.fillStyle = 'rgba(190,200,255,0.85)';
  ctx.fillText('INFRARED VIEW (artistic): haze removed, Saturn shown. Press I to switch off', u, ch - u * 2.2);
  ctx.restore();
}
