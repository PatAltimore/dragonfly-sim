import { INSTRUMENTS, type InstrumentId } from '../content/instruments';
import { LEVELS, type Level } from '../content/levels';
import { isUnlocked, type Progress } from '../save/progress';
import { phaseLabel } from '../sim/daynight';
import type { RunResult } from '../sim/scoring';

/** The canvas drawing surface the screens paint onto. */
export interface Surface {
  ctx: CanvasRenderingContext2D;
  cw: number;
  ch: number;
}

/** A tappable button or row a screen drew, in canvas pixels. The game maps ids to actions. */
export interface Hit {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const GOLD = '#ffd27a';
const CREAM = '#ffe2b0';
const GREEN = '#8be07a';
const RED = '#ff6a4a';
const DIM = 'rgba(255,226,176,0.45)';

const unit = (s: Surface) => Math.max(10, Math.min(s.ch / 42, s.cw / 46));

const stars = (n: number): string => '★'.repeat(n) + '☆'.repeat(3 - n);

function dim(s: Surface, alpha: number): void {
  s.ctx.setTransform(1, 0, 0, 1, 0, 0);
  s.ctx.fillStyle = `rgba(12,6,0,${alpha})`;
  s.ctx.fillRect(0, 0, s.cw, s.ch);
}

function panel(s: Surface, x: number, y: number, w: number, h: number, border = GOLD): void {
  s.ctx.fillStyle = 'rgba(20,10,0,0.82)';
  s.ctx.fillRect(x, y, w, h);
  s.ctx.strokeStyle = border;
  s.ctx.lineWidth = 2;
  s.ctx.strokeRect(x, y, w, h);
}

function text(s: Surface, str: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center', bold = false): void {
  s.ctx.font = `${bold ? 'bold ' : ''}${size}px monospace`;
  s.ctx.fillStyle = color;
  s.ctx.textAlign = align;
  s.ctx.fillText(str, x, y);
}

/** Draw a button and return its hit rectangle. */
function button(s: Surface, id: string, label: string, x: number, y: number, w: number, h: number, primary = false): Hit {
  const { ctx } = s;
  ctx.fillStyle = primary ? 'rgba(255,210,122,0.28)' : 'rgba(255,210,122,0.1)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = primary ? GOLD : DIM;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  text(s, label, x + w / 2, y + h / 2 + h * 0.18, h * 0.42, primary ? GOLD : CREAM, 'center', primary);
  return { id, x, y, w, h };
}

/** Lay out a row of equal buttons centered at cx. */
function buttonRow(s: Surface, items: { id: string; label: string; primary?: boolean }[], cx: number, y: number, u: number): Hit[] {
  const gap = u * 1.2;
  const w = Math.min(u * 12, (s.cw * 0.92 - (items.length - 1) * gap) / items.length);
  const total = items.length * w + (items.length - 1) * gap;
  return items.map((it, i) => button(s, it.id, it.label, cx - total / 2 + i * (w + gap), y, w, u * 3, it.primary));
}

function wrap(ctx: CanvasRenderingContext2D, str: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of str.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function maxScience(level: Level): number {
  return level.targets.reduce((sum, t) => sum + INSTRUMENTS[t.kind].value, 0);
}

export function drawMenu(s: Surface, progress: Progress, cursor: number, view3d: boolean): Hit[] {
  dim(s, 0.62);
  const u = unit(s);
  const hits: Hit[] = [];
  const w = Math.min(s.cw * 0.94, u * 50);
  const x = s.cw / 2 - w / 2;
  text(s, 'DRAGONFLY', s.cw / 2, u * 4.2, u * 3.4, GOLD, 'center', true);
  text(s, 'TITAN SORTIE', s.cw / 2, u * 6.6, u * 1.7, CREAM);
  text(s, 'Pilot NASA\'s nuclear-powered rotorcraft across the dunes of Saturn\'s moon', s.cw / 2, u * 8.6, u * 0.95, DIM);

  const rowH = u * 2.5;
  const top = u * 10.4;
  panel(s, x, top - u * 0.8, w, rowH * LEVELS.length + u * 1.6);
  LEVELS.forEach((lv, i) => {
    const y = top + i * rowH;
    const open = isUnlocked(progress, i);
    if (i === cursor) {
      s.ctx.fillStyle = 'rgba(255,210,122,0.18)';
      s.ctx.fillRect(x + u * 0.4, y - u * 0.5, w - u * 0.8, rowH - u * 0.2);
    }
    const color = !open ? DIM : i === cursor ? GOLD : CREAM;
    text(s, `${i + 1}`, x + u * 1.6, y + u * 0.9, u * 1.4, color, 'left', true);
    text(s, lv.name, x + u * 3.4, y + u * 0.6, u * 1.25, color, 'left', true);
    text(s, open ? lv.tagline : 'Locked: clear the previous sortie', x + u * 3.4, y + u * 1.75, u * 0.85, DIM, 'left');
    if (open) {
      text(s, stars(progress.stars[i]), x + w - u * 1.2, y + u * 0.7, u * 1.3, progress.stars[i] ? GOLD : DIM, 'right');
      if (progress.best[i] > 0) text(s, `best ${progress.best[i]}`, x + w - u * 1.2, y + u * 1.8, u * 0.85, DIM, 'right');
    }
    hits.push({ id: `row:${i}`, x, y: y - u * 0.5, w, h: rowH });
  });
  hits.push(button(s, 'sound', progress.muted ? 'SOUND OFF' : 'SOUND ON', s.cw - u * 9.6, u * 1, u * 8.6, u * 2.4));
  hits.push(button(s, 'view', view3d ? 'VIEW: 3D' : 'VIEW: 2D', u * 1, u * 1, u * 8.6, u * 2.4));
  text(s, '↑/↓ or tap to choose    Enter or tap again to launch    M sound    V view', s.cw / 2, s.ch - u * 1.2, u * 0.95, CREAM);
  return hits;
}

export function drawBriefing(s: Surface, level: Level, index: number): Hit[] {
  dim(s, 0.7);
  const u = unit(s);
  const w = Math.min(s.cw * 0.94, u * 48);
  const x = s.cw / 2 - w / 2;
  const y = u * 2.4;
  const h = s.ch - u * 5;
  panel(s, x, y, w, h);
  text(s, `SORTIE ${index + 1}`, s.cw / 2, y + u * 2.6, u * 1.2, DIM);
  text(s, level.name.toUpperCase(), s.cw / 2, y + u * 5, u * 2.6, GOLD, 'center', true);

  const counts: Record<InstrumentId, number> = { dragms: 0, dragns: 0, dragoncam: 0 };
  for (const t of level.targets) counts[t.kind]++;
  const targets = (Object.keys(counts) as InstrumentId[])
    .filter((k) => counts[k] > 0)
    .map((k) => `${counts[k]}× ${INSTRUMENTS[k].label}`)
    .join('  ');
  const weather: string[] = [];
  if (level.gust) weather.push('gusts');
  if (level.zones.some((z) => z.kind === 'rain')) weather.push('methane rain');
  if (level.zones.some((z) => z.kind === 'haze')) weather.push('haze');
  const far = Math.max(...level.targets.map((t) => Math.abs(t.x)));

  let row = y + u * 7.6;
  const stat = (label: string, value: string, color = CREAM) => {
    text(s, label, x + u * 2, row, u * 1.05, DIM, 'left');
    text(s, value, x + u * 12, row, u * 1.05, color, 'left');
    row += u * 1.6;
  };
  stat('Targets', `${level.targets.length}: ${targets}`);
  stat('Max science', `${maxScience(level)} pts, farthest ${far} m out`);
  stat('Starts at', `${phaseLabel(level.clockOffset)}${level.intro ? ', with parachute descent' : ''}`);
  stat('Weather', weather.length ? weather.join(', ') : 'calm', weather.length ? GOLD : GREEN);
  stat('Par time', mmss(level.parTime));

  row += u * 0.6;
  s.ctx.font = `${u * 1.05}px monospace`;
  for (const b of level.briefing) {
    for (const line of wrap(s.ctx, b, w - u * 6)) {
      text(s, `• ${line}`, x + u * 2.4, row, u * 1.05, CREAM, 'left');
      row += u * 1.4;
    }
  }

  // Mission fact box above the buttons.
  s.ctx.font = `${u * 0.95}px monospace`;
  const lines = wrap(s.ctx, level.fact, w - u * 5);
  const boxH = u * (2.8 + lines.length * 1.3);
  const boxY = y + h - boxH - u * 6.2;
  s.ctx.fillStyle = 'rgba(255,210,122,0.1)';
  s.ctx.fillRect(x + u * 1.2, boxY, w - u * 2.4, boxH);
  text(s, 'MISSION FACT', x + u * 2.2, boxY + u * 1.6, u * 0.95, GOLD, 'left', true);
  lines.forEach((l, i) => text(s, l, x + u * 2.2, boxY + u * (3 + i * 1.3), u * 0.95, CREAM, 'left'));

  return buttonRow(
    s,
    [
      { id: 'back', label: 'BACK (Esc)' },
      { id: 'launch', label: 'LAUNCH (Enter)', primary: true },
    ],
    s.cw / 2,
    y + h - u * 4.4,
    u,
  );
}

export function drawDebrief(s: Surface, r: RunResult, level: Level, index: number, newBest: boolean, hasNext: boolean): Hit[] {
  dim(s, 0.55);
  const u = unit(s);
  const w = Math.min(s.cw * 0.94, u * 40);
  const h = u * (r.completed ? 25 : 20);
  const x = s.cw / 2 - w / 2;
  const y = s.ch / 2 - h / 2;
  panel(s, x, y, w, h, r.completed ? GREEN : RED);
  text(s, r.completed ? 'SORTIE COMPLETE' : 'MISSION LOST', s.cw / 2, y + u * 3.2, u * 2.4, r.completed ? GREEN : RED, 'center', true);
  text(s, `Sortie ${index + 1}: ${level.name}`, s.cw / 2, y + u * 5.2, u * 1.1, DIM);

  let row = y + u * 7.8;
  const line = (label: string, value: string, color = CREAM) => {
    text(s, label, x + u * 3, row, u * 1.2, color, 'left');
    text(s, value, x + w - u * 3, row, u * 1.2, color, 'right');
    row += u * 1.8;
  };
  if (r.completed) {
    text(s, stars(r.stars), s.cw / 2, y + u * 7.4, u * 2.2, GOLD);
    row = y + u * 10.4;
    line('Science uploaded', `${r.science}`);
    line(`Time ${mmss(r.time)} (par ${mmss(level.parTime)})`, `+${r.timeBonus}`);
    line(`Battery ${Math.round(r.battery * 100)}%`, `+${r.batteryBonus}`);
    row += u * 0.3;
    line('TOTAL', `${r.total}`, GOLD);
    if (newBest) text(s, 'NEW BEST', s.cw / 2, row, u * 1.2, GREEN, 'center', true);
  } else {
    line('Cause', r.reason || 'Abandoned');
    line('Science banked', `${r.science}`);
    if (r.lost > 0) line('Unsent data lost', `${r.lost}`, RED);
  }
  const items = r.completed
    ? [
        { id: 'menu', label: 'MENU' },
        { id: 'retry', label: 'RETRY (R)' },
        { id: 'primary', label: hasNext ? 'NEXT (Enter)' : 'DONE (Enter)', primary: true },
      ]
    : [
        { id: 'menu', label: 'MENU (Esc)' },
        { id: 'primary', label: 'RETRY (Enter)', primary: true },
      ];
  return buttonRow(s, items, s.cw / 2, y + h - u * 4.4, u);
}

export function drawPause(s: Surface, muted: boolean): Hit[] {
  dim(s, 0.55);
  const u = unit(s);
  const w = Math.min(s.cw * 0.9, u * 24);
  const h = u * 21;
  const x = s.cw / 2 - w / 2;
  const y = s.ch / 2 - h / 2;
  panel(s, x, y, w, h);
  text(s, 'PAUSED', s.cw / 2, y + u * 3.4, u * 2.4, GOLD, 'center', true);
  const bw = w - u * 4;
  const bx = x + u * 2;
  return [
    button(s, 'resume', 'RESUME (Esc)', bx, y + u * 5.6, bw, u * 3, true),
    button(s, 'restart', 'RESTART (R)', bx, y + u * 9.2, bw, u * 3),
    button(s, 'quit', 'QUIT TO MENU (Q)', bx, y + u * 12.8, bw, u * 3),
    button(s, 'sound', muted ? 'SOUND OFF (M)' : 'SOUND ON (M)', bx, y + u * 16.4, bw, u * 3),
  ];
}
