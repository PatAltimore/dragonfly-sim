import { LIBRARY, SECTIONS, type Entry, type VisualKind } from '../content/library';
import {
  buttonRow,
  CREAM,
  DIM,
  dim,
  GOLD,
  panel,
  text,
  unit,
  wrap,
  type Hit,
  type Surface,
} from './screens';

/** Index of the first page of each section, for the tabs. */
export const SECTION_START: number[] = SECTIONS.map((s) => LIBRARY.findIndex((e) => e.section === s.id));

export const sectionOf = (page: number): number => SECTIONS.findIndex((s) => s.id === LIBRARY[page].section);

interface PageLayout {
  size: number;
  lines: { text: string; gap: boolean }[];
  fits: boolean;
}

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  u: number;
  /** Top of the content area (below title and visual) and its bottom edge. */
  bodyTop: number;
  bodyBottom: number;
  visualTop: number;
  visualH: number;
}

function frame(s: Surface, entry: Entry): Frame {
  const u = unit(s);
  const w = Math.min(s.cw * 0.95, u * 50);
  const h = s.ch - u * 3.2;
  const x = s.cw / 2 - w / 2;
  const y = u * 1.6;
  const tabsBottom = y + u * 4.4;
  const titleBottom = tabsBottom + u * 3.2;
  const visualH = entry.visual ? u * (s.cw < s.ch ? 8.4 : 6.4) : 0;
  const visualTop = titleBottom;
  const bodyTop = titleBottom + (visualH ? visualH + u * 0.8 : u * 0.4);
  const bodyBottom = y + h - u * 5.4;
  return { x, y, w, h, u, bodyTop, bodyBottom, visualTop, visualH };
}

/** Pick the largest font that fits the entry's text into the body area. */
function layoutPage(s: Surface, entry: Entry, f: Frame): PageLayout {
  const maxW = f.w - f.u * 4.4;
  const avail = f.bodyBottom - f.bodyTop;
  let best: PageLayout = { size: f.u, lines: [], fits: false };
  for (let size = f.u * 1.2; size >= f.u * 0.78; size -= f.u * 0.05) {
    s.ctx.font = `${size}px monospace`;
    const lines: { text: string; gap: boolean }[] = [];
    entry.body.forEach((para, i) => {
      wrap(s.ctx, para, maxW).forEach((line, j) => lines.push({ text: line, gap: i > 0 && j === 0 }));
    });
    const height = lines.reduce((sum, l) => sum + size * 1.38 + (l.gap ? size * 0.55 : 0), 0);
    best = { size, lines, fits: height <= avail };
    if (best.fits) break;
  }
  return best;
}

/** Pages whose text does not fit this screen size even at the smallest font. Used to test the layout. */
export function overflowingPages(s: Surface): number[] {
  const bad: number[] = [];
  LIBRARY.forEach((e, i) => {
    if (!layoutPage(s, e, frame(s, e)).fits) bad.push(i);
  });
  return bad;
}

export function drawLibrary(s: Surface, page: number): Hit[] {
  const entry = LIBRARY[page];
  const f = frame(s, entry);
  const { ctx } = s;
  const { u } = f;
  const hits: Hit[] = [];
  dim(s, 0.7);
  panel(s, f.x, f.y, f.w, f.h);

  // Section tabs.
  const active = sectionOf(page);
  const tabW = (f.w - u * 2) / SECTIONS.length;
  SECTIONS.forEach((sec, i) => {
    const tx = f.x + u + i * tabW;
    const ty = f.y + u * 0.9;
    ctx.fillStyle = i === active ? 'rgba(255,210,122,0.25)' : 'rgba(255,210,122,0.06)';
    ctx.fillRect(tx + 1, ty, tabW - 2, u * 2.4);
    ctx.strokeStyle = i === active ? GOLD : DIM;
    ctx.lineWidth = 1;
    ctx.strokeRect(tx + 1, ty, tabW - 2, u * 2.4);
    text(s, sec.label, tx + tabW / 2, ty + u * 1.6, Math.min(u * 0.85, tabW / 6.4), i === active ? GOLD : CREAM, 'center', i === active);
    hits.push({ id: `tab:${i}`, x: tx, y: ty, w: tabW, h: u * 2.4 });
  });

  // Title and page counter.
  const titleY = f.y + u * 7.2;
  text(s, entry.title.toUpperCase(), s.cw / 2, titleY, Math.min(u * 1.9, (f.w - u * 4) / (entry.title.length * 0.62)), entry.accent ?? GOLD, 'center', true);
  const inSection = LIBRARY.filter((e) => e.section === entry.section);
  const nth = inSection.indexOf(entry) + 1;
  text(s, `${nth} of ${inSection.length}`, f.x + f.w - u * 1.4, f.y + u * 4.6, u * 0.8, DIM, 'right');

  if (entry.visual) drawVisual(s, entry.visual, f.x + u * 2.2, f.visualTop, f.w - u * 4.4, f.visualH, u);

  const layout = layoutPage(s, entry, f);
  ctx.font = `${layout.size}px monospace`;
  let y = f.bodyTop + layout.size;
  for (const line of layout.lines) {
    if (line.gap) y += layout.size * 0.55;
    text(s, line.text, f.x + u * 2.2, y, layout.size, CREAM, 'left');
    y += layout.size * 1.38;
  }

  // Page position and navigation.
  text(s, `Page ${page + 1} of ${LIBRARY.length}`, s.cw / 2, f.y + f.h - u * 5.9, u * 0.8, DIM);
  hits.push(
    ...buttonRow(
      s,
      [
        { id: 'prev', label: '< PREV' },
        { id: 'close', label: 'CLOSE (Esc)', primary: true },
        { id: 'next', label: 'NEXT >' },
      ],
      s.cw / 2,
      f.y + f.h - u * 4.2,
      u,
    ),
  );
  return hits;
}

/** A page-sized caption under a visual. */
function caption(s: Surface, str: string, x: number, y: number, size: number): void {
  text(s, str, x, y, size, DIM, 'left');
}

function drawVisual(s: Surface, kind: VisualKind, x: number, y: number, w: number, h: number, u: number): void {
  const { ctx } = s;
  ctx.fillStyle = 'rgba(255,210,122,0.06)';
  ctx.fillRect(x - u * 0.5, y, w + u, h);
  const px = x + u * 0.4;
  const pw = w - u * 0.8;
  const small = u * 0.82;

  if (kind === 'compare') {
    // Titan against Earth: bars share a scale per row.
    const rows: [string, number, number, string][] = [
      ['Diameter', 5150, 12742, 'km'],
      ['Gravity', 0.138, 1, 'g'],
      ['Surface pressure', 1.45, 1, 'atm'],
    ];
    const rowH = h / 3.3;
    rows.forEach(([label, titan, earth, unitLabel], i) => {
      const ry = y + u * 0.6 + i * rowH;
      const max = Math.max(titan, earth);
      text(s, `${label} (${unitLabel})`, px, ry + small * 0.9, small, CREAM, 'left');
      const bw = pw * 0.62;
      const bx = px + pw * 0.34;
      ctx.fillStyle = GOLD;
      ctx.fillRect(bx, ry + small * 0.1, (bw * titan) / max, small * 0.45);
      ctx.fillStyle = '#6fa8ff';
      ctx.fillRect(bx, ry + small * 0.7, (bw * earth) / max, small * 0.45);
      text(s, String(titan), bx + (bw * titan) / max + u * 0.4, ry + small * 0.55, small * 0.9, GOLD, 'left');
      text(s, String(earth), bx + (bw * earth) / max + u * 0.4, ry + small * 1.15, small * 0.9, '#9cc4ff', 'left');
    });
    text(s, 'Titan', px + pw - u * 5.6, y + h - u * 0.5, small * 0.9, GOLD, 'left');
    text(s, 'Earth', px + pw - u * 2.6, y + h - u * 0.5, small * 0.9, '#9cc4ff', 'left');
  } else if (kind === 'atmosphere') {
    const by = y + h * 0.3;
    const bh = h * 0.28;
    ctx.fillStyle = '#d88a3c';
    ctx.fillRect(px, by, pw * 0.95, bh);
    ctx.fillStyle = '#6fa8ff';
    ctx.fillRect(px + pw * 0.95, by, pw * 0.05, bh);
    text(s, 'Nitrogen, about 95%', px, by - small * 0.5, small, CREAM, 'left');
    text(s, 'Methane, about 5% near the ground', px + pw, by + bh + small * 1.5, small, '#9cc4ff', 'right');
    caption(s, 'Titan\'s lower atmosphere (a little hydrogen too)', px, y + h - u * 0.6, small * 0.9);
  } else if (kind === 'tsol') {
    const by = y + h * 0.3;
    const bh = h * 0.28;
    ctx.fillStyle = GOLD;
    ctx.fillRect(px, by, pw / 2, bh);
    ctx.fillStyle = '#1c2850';
    ctx.fillRect(px + pw / 2, by, pw / 2, bh);
    ctx.strokeStyle = DIM;
    ctx.strokeRect(px, by, pw, bh);
    text(s, 'Daylight: fly and scout', px + pw * 0.25, by + bh / 2 + small * 0.35, small, '#2a1608', 'center', true);
    text(s, 'Night: charge and study', px + pw * 0.75, by + bh / 2 + small * 0.35, small, CREAM, 'center');
    text(s, '1 Tsol = about 16 Earth days', px + pw / 2, by - small * 0.6, small, CREAM);
    caption(s, 'Night is about 8 Earth days long', px, y + h - u * 0.6, small * 0.9);
  } else {
    // Descent timeline: roughly proportional segments of the ~105-minute descent.
    const by = y + h * 0.3;
    const bh = h * 0.28;
    const segs: [string, number, string][] = [
      ['Entry', 5, '#d9542b'],
      ['Drogue chute ~80', 80, '#c79bff'],
      ['Main ~20', 20, '#5fd0ff'],
    ];
    let cx = px;
    for (const [label, mins, color] of segs) {
      const sw = (pw * mins) / 105;
      ctx.fillStyle = color;
      ctx.fillRect(cx, by, sw - 1, bh);
      if (sw > u * 6) text(s, label, cx + sw / 2, by + bh / 2 + small * 0.35, small * 0.9, '#1a0f06', 'center', true);
      cx += sw;
    }
    text(s, 'Whole descent: about 105 minutes (minutes shown are approximate)', px, by - small * 0.6, small * 0.9, CREAM, 'left');
    text(s, 'Powered flight starts near 1.2 km up', px + pw, by + bh + small * 1.6, small, GOLD, 'right');
  }
}

