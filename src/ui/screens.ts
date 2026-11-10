import { DIFFICULTIES, DIFFICULTY_ORDER } from '../content/difficulty';
import { INSTRUMENTS, type InstrumentId } from '../content/instruments';
import { LEVELS, type Level } from '../content/levels';
import { DID_YOU_KNOW } from '../content/library';
import { isUnlocked, type Progress } from '../save/progress';
import { phaseLabel } from '../sim/daynight';
import type { RunResult } from '../sim/scoring';
import type { World } from '../sim/world';

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

export const GOLD = '#ffd27a';
export const CREAM = '#ffe2b0';
export const GREEN = '#8be07a';
export const RED = '#ff6a4a';
export const DIM = 'rgba(255,226,176,0.45)';

export const unit = (s: Surface) => Math.max(10, Math.min(s.ch / 42, s.cw / 46));

const stars = (n: number): string => '★'.repeat(n) + '☆'.repeat(3 - n);

export function dim(s: Surface, alpha: number): void {
  s.ctx.setTransform(1, 0, 0, 1, 0, 0);
  s.ctx.fillStyle = `rgba(12,6,0,${alpha})`;
  s.ctx.fillRect(0, 0, s.cw, s.ch);
}

export function panel(s: Surface, x: number, y: number, w: number, h: number, border = GOLD): void {
  s.ctx.fillStyle = 'rgba(20,10,0,0.82)';
  s.ctx.fillRect(x, y, w, h);
  s.ctx.strokeStyle = border;
  s.ctx.lineWidth = 2;
  s.ctx.strokeRect(x, y, w, h);
}

export function text(s: Surface, str: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center', bold = false): void {
  s.ctx.font = `${bold ? 'bold ' : ''}${size}px monospace`;
  s.ctx.fillStyle = color;
  s.ctx.textAlign = align;
  s.ctx.fillText(str, x, y);
}

/** Draw a button and return its hit rectangle. */
export function button(s: Surface, id: string, label: string, x: number, y: number, w: number, h: number, primary = false): Hit {
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
export function buttonRow(s: Surface, items: { id: string; label: string; primary?: boolean }[], cx: number, y: number, u: number): Hit[] {
  const gap = u * 1.2;
  const w = Math.min(u * 12, (s.cw * 0.92 - (items.length - 1) * gap) / items.length);
  const total = items.length * w + (items.length - 1) * gap;
  return items.map((it, i) => button(s, it.id, it.label, cx - total / 2 + i * (w + gap), y, w, u * 3, it.primary));
}

export function wrap(ctx: CanvasRenderingContext2D, str: string, maxWidth: number): string[] {
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
  // Difficulty chips: Easy, Medium and Hard, with the selected one's blurb underneath.
  const chipW = Math.min(u * 11, (s.cw * 0.9 - u * 1.6) / 3);
  const chipGap = u * 0.8;
  const chipX = s.cw / 2 - (chipW * 3 + chipGap * 2) / 2;
  DIFFICULTY_ORDER.forEach((id, i) => {
    const spec = DIFFICULTIES[id];
    const on = progress.difficulty === id;
    const cx0 = chipX + i * (chipW + chipGap);
    s.ctx.fillStyle = on ? 'rgba(255,255,255,0.12)' : 'rgba(255,210,122,0.05)';
    s.ctx.fillRect(cx0, u * 8, chipW, u * 2.4);
    s.ctx.strokeStyle = on ? spec.color : DIM;
    s.ctx.lineWidth = on ? 3 : 1;
    s.ctx.strokeRect(cx0, u * 8, chipW, u * 2.4);
    text(s, spec.label, cx0 + chipW / 2, u * 9.6, u * 1.05, on ? spec.color : CREAM, 'center', on);
    hits.push({ id: `diff:${i}`, x: cx0, y: u * 8, w: chipW, h: u * 2.4 });
  });
  text(s, DIFFICULTIES[progress.difficulty].tagline, s.cw / 2, u * 11.6, u * 0.9, DIM);

  const rowH = u * 2.5;
  const top = u * 12.9;
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
      const earned = progress.stars[progress.difficulty][i];
      const best = progress.best[progress.difficulty][i];
      text(s, stars(earned), x + w - u * 1.2, y + u * 0.7, u * 1.3, earned ? GOLD : DIM, 'right');
      if (best > 0) text(s, `best ${best}`, x + w - u * 1.2, y + u * 1.8, u * 0.85, DIM, 'right');
    }
    hits.push({ id: `row:${i}`, x, y: y - u * 0.5, w, h: rowH });
  });
  hits.push(button(s, 'sound', progress.muted ? 'SOUND OFF' : 'SOUND ON', s.cw - u * 9.6, u * 1, u * 8.6, u * 2.4));
  hits.push(button(s, 'view', view3d ? 'VIEW: 3D' : 'VIEW: 2D', u * 1, u * 1, u * 8.6, u * 2.4));
  const fileW = Math.min(u * 32, s.cw * 0.9);
  hits.push(button(s, 'library', 'MISSION FILE: Titan and the science (L)', s.cw / 2 - fileW / 2, top + rowH * LEVELS.length + u * 1.5, fileW, u * 2.6));
  text(s, '↑/↓ sortie   ←/→ difficulty   Enter launch   M sound   V view   L file', s.cw / 2, s.ch - u * 1.2, u * 0.95, CREAM);
  return hits;
}

export function drawBriefing(s: Surface, world: World, index: number): Hit[] {
  const level = world.level;
  dim(s, 0.7);
  const u = unit(s);
  const w = Math.min(s.cw * 0.94, u * 48);
  const x = s.cw / 2 - w / 2;
  const y = u * 2.4;
  const h = s.ch - u * 5;
  panel(s, x, y, w, h);
  text(s, `SORTIE ${index + 1}   ${world.difficulty.label}`, s.cw / 2, y + u * 2.6, u * 1.2, world.difficulty.color, 'center', true);
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
    row += u * 1.45;
  };
  stat('Targets', `${level.targets.length}: ${targets}`);
  stat('Max science', `${maxScience(level)} pts, farthest ${far} m out`);
  stat('Starts at', `${phaseLabel(level.clockOffset)}${level.intro ? ', with parachute descent' : ''}`);
  stat('Weather', weather.length ? weather.join(', ') : 'calm', weather.length ? GOLD : GREEN);
  const { spires, cells } = world.obstacles;
  const hazardous = spires.length + cells.length > 0;
  stat(
    'Obstacles',
    hazardous
      ? `${spires.length} rock spires (up to ${Math.round(Math.max(...spires.map((sp) => sp.height)))} m), ${cells.length} turbulence cells`
      : 'none',
    hazardous ? world.difficulty.color : GREEN,
  );
  stat('Par time', `${mmss(level.parTime)}    score x${world.difficulty.scoreMult}`);

  row += u * 0.6;
  const lineH = u * 1.25;
  const innerW = w - u * 5;
  const bottom = y + h - u * 6;

  // The science brief: this sortie's instruments, then a mission fact. Both are wrapped first so we know
  // how much room they need and can drop the less important parts on short screens.
  s.ctx.font = `${u * 0.95}px monospace`;
  type BriefLine = { str: string; color: string; bold?: boolean; gap?: boolean };
  const instrumentLines: BriefLine[] = [{ str: 'INSTRUMENTS ON THIS SORTIE', color: GOLD, bold: true }];
  for (const k of Object.keys(counts) as InstrumentId[]) {
    if (counts[k] === 0) continue;
    const ins = INSTRUMENTS[k];
    wrap(s.ctx, `${ins.label}: ${ins.role}`, innerW).forEach((l) => instrumentLines.push({ str: l, color: ins.color }));
  }
  const factLines: BriefLine[] = [{ str: 'MISSION FACT', color: GOLD, bold: true, gap: true }];
  wrap(s.ctx, level.fact, innerW).forEach((l) => factLines.push({ str: l, color: CREAM }));
  const heightOf = (lines: BriefLine[]) => u * 1.8 + lines.reduce((sum, b2) => sum + lineH + (b2.gap ? u * 0.5 : 0), 0);

  s.ctx.font = `${u * 1.05}px monospace`;
  const bullets: string[] = [];
  for (const b2 of level.briefing) bullets.push(...wrap(s.ctx, b2, w - u * 6));
  const bulletsH = bullets.length * u * 1.3;

  let brief = [...instrumentLines, ...factLines];
  const roomForBullets = row + bulletsH + heightOf(brief) + u * 0.6 <= bottom;
  if (!roomForBullets && row + heightOf(brief) > bottom) brief = instrumentLines;
  if (roomForBullets) {
    for (const line of bullets) {
      text(s, `• ${line}`, x + u * 2.4, row, u * 1.05, CREAM, 'left');
      row += u * 1.3;
    }
  }

  const boxH = heightOf(brief);
  const boxY = bottom - boxH;
  s.ctx.fillStyle = 'rgba(255,210,122,0.1)';
  s.ctx.fillRect(x + u * 1.2, boxY, w - u * 2.4, boxH);
  let by = boxY + u * 1.6;
  for (const b2 of brief) {
    if (b2.gap) by += u * 0.5;
    text(s, b2.str, x + u * 2.2, by, u * 0.95, b2.color, 'left', b2.bold);
    by += lineH;
  }

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
  const h = u * (r.completed ? 33 : 24);
  const x = s.cw / 2 - w / 2;
  const y = s.ch / 2 - h / 2;
  panel(s, x, y, w, h, r.completed ? GREEN : RED);
  text(s, r.completed ? 'SORTIE COMPLETE' : 'MISSION LOST', s.cw / 2, y + u * 3.2, u * 2.4, r.completed ? GREEN : RED, 'center', true);
  text(s, `Sortie ${index + 1}: ${level.name}  (${r.difficulty})`, s.cw / 2, y + u * 5.2, u * 1.1, DIM);

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
    if (r.difficultyMult !== 1) line(`${r.difficulty} difficulty x${r.difficultyMult}`, `+${r.difficultyBonus}`, GREEN);
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
  const fact = DID_YOU_KNOW[(index * 3 + (r.completed ? 1 : 0)) % DID_YOU_KNOW.length];
  s.ctx.font = `${u * 0.95}px monospace`;
  const factLines = wrap(s.ctx, fact, w - u * 6);
  const factH = u * 2 + factLines.length * u * 1.2;
  const factY = y + h - u * 5.4 - factH;
  s.ctx.fillStyle = 'rgba(255,210,122,0.1)';
  s.ctx.fillRect(x + u * 1.2, factY, w - u * 2.4, factH);
  text(s, 'DID YOU KNOW?', x + u * 2.2, factY + u * 1.5, u * 0.95, GOLD, 'left', true);
  factLines.forEach((l, i) => text(s, l, x + u * 2.2, factY + u * (2.9 + i * 1.2), u * 0.95, CREAM, 'left'));
  return buttonRow(s, items, s.cw / 2, y + h - u * 4.4, u);
}

export function drawPause(s: Surface, muted: boolean): Hit[] {
  dim(s, 0.55);
  const u = unit(s);
  const w = Math.min(s.cw * 0.9, u * 24);
  const h = u * 25;
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
    button(s, 'library', 'MISSION FILE (L)', bx, y + u * 20, bw, u * 3),
  ];
}
