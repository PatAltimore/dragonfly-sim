import { LIBRARY, type Entry } from '../content/library';
import { isNight } from '../sim/daynight';
import { gustAt, hazeAt, rainAt } from '../sim/hazards';
import { warningsAhead } from '../sim/obstacles';
import { LOW_BATTERY } from '../sim/constants';
import { clockOf, weatherActive, type World } from '../sim/world';
import { wrap } from './screens';

/**
 * The mission log overlay: a small card that shows the Mission File page for whatever the pilot is
 * meeting right now (a vent, a gate, a target, the weather, a low battery), and otherwise rotates
 * through the whole log. It can be collapsed to a single line.
 */

const STORAGE_KEY = 'dragonfly-sim-log-collapsed';
/** A page stays up at least this long (s of sortie time), and rotating pages change this often. */
const MIN_SHOW = 7;
const ROTATE_EVERY = 13;
const MAX_LINES = 5;

let collapsed: boolean | null = null;
let current = 0;
let showUntil = 0;
let rotateAt = 0;
let rotation = 0;
let lastTime = 0;
let rect = { x: 0, y: 0, w: 0, h: 0 };

function readCollapsed(cw: number): boolean {
  if (collapsed !== null) return collapsed;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v !== null) return (collapsed = v === '1');
  } catch {
    // Storage unavailable: just use the default.
  }
  // Small screens start with the card folded away.
  return (collapsed = cw < 700);
}

/** Fold or unfold the card. Remembered between visits. */
export function toggleMissionLog(): void {
  collapsed = !(collapsed ?? false);
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    // Ignore.
  }
}

/** True if a point (canvas pixels) is on the card's header, so a tap there folds it instead of steering. */
export function missionLogHit(x: number, y: number): boolean {
  return rect.w > 0 && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

/** Forget what was showing, e.g. when a new sortie starts. */
export function resetMissionLog(): void {
  current = 0;
  showUntil = 0;
  rotateAt = 0;
  rotation = 0;
  lastTime = 0;
  rect = { x: 0, y: 0, w: 0, h: 0 };
}

const pageIndex = (title: string): number => LIBRARY.findIndex((e) => e.title === title);

/** The title of the page that matches what is happening, or null when nothing in particular is. */
function contextTitle(w: World): string | null {
  const c = w.craft;
  if (w.phase !== 'flight') return w.intro ? 'Landing: 105 minutes, alone' : null;
  if (w.status === 'crashed') return null;

  const ahead = warningsAhead(w);
  if (ahead.ball || (ahead.vent && ahead.vent.state !== 'idle')) return 'Ice volcanoes?';

  if (w.battery < LOW_BATTERY) return 'A nuclear battery';

  const s = w.science;
  if (!s.complete) {
    const near = s.targets.filter((t) => !t.collected && Math.abs(t.x - c.x) < 90).sort((a, b) => Math.abs(a.x - c.x) - Math.abs(b.x - c.x))[0];
    if (near) return near.kind === 'dragms' ? 'DraMS' : near.kind === 'dragns' ? 'DraGNS' : 'DragonCam';
  }
  if (s.cargo.length > 0 && Math.abs(c.x) < 90) return 'Calling home';

  if (w.obstacles.gates.some((g) => Math.abs(g.x - c.x) < 130)) return 'Clouds and storms';

  if (weatherActive(w)) {
    const g = gustAt(w.level.gust, w.time);
    if (g.warn > 0 || g.blow > 0.05) return 'Dunes of organics';
    if (rainAt(w.level.zones, c.x, w.time) > 0.15) return 'Methane weather';
    if (hazeAt(w.level.zones, c.x, w.time) > 0.15) return 'An orange haze';
  }
  if (isNight(clockOf(w))) return 'A day on Titan';
  if (!w.assist && w.time < 30) return 'Flying it yourself';
  return null;
}

/** Choose the page to show now: a relevant one if there is one, else keep rotating. */
function choosePage(w: World): number {
  if (w.time < lastTime) resetMissionLog();
  lastTime = w.time;
  const ctx = contextTitle(w);
  const want = ctx ? pageIndex(ctx) : -1;
  if (want >= 0) {
    if (want !== current && w.time >= showUntil) {
      current = want;
      showUntil = w.time + MIN_SHOW;
    } else if (want === current) {
      showUntil = Math.max(showUntil, w.time + 2);
    }
    rotateAt = w.time + ROTATE_EVERY;
  } else if (w.time >= showUntil && w.time >= rotateAt) {
    rotation = (rotation + 1) % LIBRARY.length;
    current = rotation;
    rotateAt = w.time + ROTATE_EVERY;
  }
  return current;
}

/** Cut a paragraph to fit `lines` wrapped lines, ending in an ellipsis if it is cut. */
function fitLines(ctx: CanvasRenderingContext2D, str: string, maxW: number, lines: number): string[] {
  const all = wrap(ctx, str, maxW);
  if (all.length <= lines) return all;
  const out = all.slice(0, lines);
  let last = out[lines - 1];
  while (last.length > 1 && ctx.measureText(`${last}...`).width > maxW) last = last.slice(0, -1);
  out[lines - 1] = `${last.trimEnd()}...`;
  return out;
}

export function drawMissionLog(ctx: CanvasRenderingContext2D, w: World, cw: number, ch: number, u: number, keyHints: boolean): void {
  const entry: Entry | undefined = LIBRARY[choosePage(w)];
  if (!entry) return;
  const fold = readCollapsed(cw);
  const width = Math.min(u * 23, cw * 0.34);
  const x = cw - width - u;
  const y = keyHints ? u * 9 : ch * 0.22;
  const pad = u * 0.7;
  const size = u * 0.82;

  ctx.save();
  ctx.textAlign = 'left';
  ctx.font = `${size}px monospace`;
  const lines = fold ? [] : fitLines(ctx, entry.body[0], width - pad * 2, MAX_LINES);
  const headH = u * 2.9;
  const h = fold ? u * 1.8 : headH + lines.length * size * 1.35 + u * 1.5;

  ctx.fillStyle = 'rgba(20,10,0,0.62)';
  ctx.fillRect(x, y, width, h);
  ctx.strokeStyle = 'rgba(255,210,122,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, h);

  ctx.font = `bold ${size}px monospace`;
  ctx.fillStyle = '#ffd27a';
  ctx.fillText(fold ? `MISSION LOG: ${entry.title}`.slice(0, Math.floor(width / (size * 0.6)) - 3) : 'MISSION LOG', x + pad, y + u * 1.2);
  ctx.textAlign = 'right';
  ctx.fillText(fold ? '[+]' : '[-]', x + width - pad, y + u * 1.2);
  ctx.textAlign = 'left';
  rect = { x, y, w: width, h: fold ? h : headH };

  if (!fold) {
    ctx.font = `bold ${u * 0.95}px monospace`;
    ctx.fillStyle = entry.accent ?? '#ffe2b0';
    ctx.fillText(entry.title, x + pad, y + u * 2.4, width - pad * 2);
    ctx.font = `${size}px monospace`;
    ctx.fillStyle = '#ffe2b0';
    lines.forEach((l, i) => ctx.fillText(l, x + pad, y + headH + size * 0.9 + i * size * 1.35));
    ctx.fillStyle = 'rgba(255,226,176,0.55)';
    ctx.font = `${u * 0.7}px monospace`;
    ctx.fillText(keyHints ? 'K: fold   Pause, then L: read more' : 'Tap the header to fold', x + pad, y + h - u * 0.5);
  }
  ctx.restore();
}
