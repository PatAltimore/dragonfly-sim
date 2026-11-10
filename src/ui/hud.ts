import { INSTRUMENTS } from '../content/instruments';
import {
  BASE_RADIUS,
  LOW_BATTERY,
  MAX_IMPACT_SPEED,
  MAX_LAND_SLOPE,
  MIN_TAKEOFF_BATTERY,
  PAD_BULLSEYE,
} from '../sim/constants';
import { dayNumber, phaseLabel } from '../sim/daynight';
import { hintFor } from './hints';
import { gustAt, hazeAt, rainAt, zoneCenter } from '../sim/hazards';
import { cargoValue } from '../sim/science';
import { altitudeAGL, clockOf, isPowerLost, weatherActive, type World } from '../sim/world';

/** The flight HUD, drawn onto a 2D canvas over whichever renderer shows the world. */
export function drawHud(ctx: CanvasRenderingContext2D, w: World, cw: number, ch: number, keyHints: boolean): void {
  const c = w.craft;
  const u = Math.max(10, ch / 50);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = `${u}px monospace`;
  ctx.textAlign = 'left';
  const agl = altitudeAGL(w);
  const risky = w.status === 'flying' && agl < 10 && -c.vy > MAX_IMPACT_SPEED * 0.8;
  const low = w.battery < LOW_BATTERY;
  const slope = w.terrain.slopeAt(c.x);
  const blink = Math.floor(w.time * 3) % 2 === 0;

  const lines: [string, string][] = [
    ['ALT', `${agl.toFixed(1)} m`],
    ['V/S', `${c.vy.toFixed(1)} m/s`],
    ['H/S', `${c.vx.toFixed(1)} m/s`],
    ['DIST', `${c.x.toFixed(0)} m`],
    ['SOL', `${dayNumber(clockOf(w))} ${phaseLabel(clockOf(w))}`],
    ['BATT', `${Math.round(w.battery * 100)}%`],
    ['CARGO', `${w.science.cargo.length} (${cargoValue(w.science)})`],
    ['SCORE', `${w.science.score}`],
    ['SLOPE', agl < 30 ? slope.toFixed(2) : '--'],
  ];
  ctx.fillStyle = 'rgba(20,10,0,0.55)';
  ctx.fillRect(u * 0.6, u * 0.6, u * 12, u * (lines.length * 1.35 + 1.9));
  lines.forEach(([k, v], i) => {
    let color = '#ffe2b0';
    if (k === 'V/S' && risky) color = '#ff6a4a';
    if (k === 'BATT' && low) color = blink ? '#ff6a4a' : '#ffe2b0';
    if (k === 'SLOPE' && agl < 30 && Math.abs(slope) > MAX_LAND_SLOPE) color = '#ff6a4a';
    ctx.fillStyle = color;
    ctx.fillText(`${k.padEnd(6)}${v}`, u, u * (1.9 + i * 1.35));
  });
  // Battery bar with the takeoff minimum marked.
  const by = u * (1.9 + lines.length * 1.35) - u * 0.2;
  const bw = u * 9.5;
  ctx.fillStyle = 'rgba(255,226,176,0.25)';
  ctx.fillRect(u, by, bw, u * 0.7);
  ctx.fillStyle = low ? '#ff6a4a' : '#8be07a';
  ctx.fillRect(u, by, bw * w.battery, u * 0.7);
  ctx.fillStyle = '#ffe2b0';
  ctx.fillRect(u + bw * MIN_TAKEOFF_BATTERY - 1, by - u * 0.15, 2, u * 1.0);

  // Status banner
  ctx.textAlign = 'center';
  if (w.status === 'crashed') {
    ctx.fillStyle = '#ff6a4a';
    ctx.font = `bold ${u * 2.4}px monospace`;
    ctx.fillText('CRASHED', cw / 2, ch * 0.35);
    ctx.font = `${u * 1.3}px monospace`;
    ctx.fillStyle = '#ffe2b0';
    ctx.fillText(w.message, cw / 2, ch * 0.35 + u * 2);
    ctx.fillText('Press R to restart', cw / 2, ch * 0.35 + u * 3.8);
    if (w.science.lostValue > 0) {
      ctx.fillStyle = '#ff6a4a';
      ctx.fillText(`${w.science.lostValue} points of unsent data lost`, cw / 2, ch * 0.35 + u * 5.6);
    }
  } else if (isPowerLost(w)) {
    ctx.fillStyle = blink ? '#ff6a4a' : '#ffe2b0';
    ctx.font = `bold ${u * 1.8}px monospace`;
    ctx.fillText(w.message, cw / 2, ch * 0.3);
  } else if (w.status === 'flying' && low) {
    ctx.fillStyle = blink ? '#ff6a4a' : '#ffe2b0';
    ctx.font = `bold ${u * 1.5}px monospace`;
    ctx.fillText('LOW BATTERY - land to recharge', cw / 2, ch * 0.3);
  } else if (w.status === 'landed' && !(w.landing && !w.landing.dismissed)) {
    ctx.fillStyle = '#ffe2b0';
    ctx.font = `${u * 1.3}px monospace`;
    ctx.fillText(w.message, cw / 2, ch * 0.3);
  }

  drawIntroHud(ctx, w, cw, ch, u);
  drawHazardHud(ctx, w, cw, u);
  drawSortieHud(ctx, w, cw, ch, u);

  ctx.textAlign = 'center';
  ctx.font = `${u * 0.9}px monospace`;
  ctx.fillStyle = 'rgba(255,226,176,0.7)';
  if (keyHints) ctx.fillText('Arrows/WASD: tilt + climb/descend    R: restart    X: skip intro    Esc: pause', cw / 2, ch - u * 0.8);
}

/** Target pointer, radar strip, work progress, event toasts and the sortie-complete panel. */
function drawSortieHud(ctx: CanvasRenderingContext2D, w: World, cw: number, ch: number, u: number): void {
  if (w.phase !== 'flight' || (w.intro && !w.landing)) return;
  const s = w.science;
  const c = w.craft;
  ctx.textAlign = 'center';
  const dir = (dx: number) => (dx > 0 ? '►' : '◄');

  if (!s.complete && w.status !== 'crashed') {
    const open = s.targets.filter((t) => !t.collected);
    if (open.length > 0) {
      const t = open.reduce((a, b) => (Math.abs(a.x - c.x) < Math.abs(b.x - c.x) ? a : b));
      const ins = INSTRUMENTS[t.kind];
      const dx = t.x - c.x;
      ctx.font = `bold ${u * 1.4}px monospace`;
      ctx.fillStyle = ins.color;
      ctx.fillText(`${ins.label} ${dir(dx)} ${Math.abs(dx).toFixed(0)} m`, cw / 2, u * 2.2);
    }
    if (s.cargo.length > 0) {
      const dx = -c.x;
      ctx.font = `${u * 1.1}px monospace`;
      ctx.fillStyle = '#ffe2b0';
      const where = Math.abs(dx) <= BASE_RADIUS ? 'AT BASE: land to upload' : `BASE ${dir(dx)} ${Math.abs(dx).toFixed(0)} m`;
      ctx.fillText(`CARGO ${cargoValue(s)} pts  ${where}`, cw / 2, u * 3.7);
    }

    // Radar strip along the track: base, targets and the craft.
    const xs = [0, c.x, ...s.targets.map((t) => t.x)];
    const lo = Math.min(...xs) - 80;
    const hi = Math.max(...xs) + 80;
    const rw = Math.min(cw * 0.55, u * 36);
    const rx = cw / 2 - rw / 2;
    const ry = u * 5.4;
    const at = (x: number) => rx + ((x - lo) / (hi - lo)) * rw;
    ctx.fillStyle = 'rgba(20,10,0,0.55)';
    ctx.fillRect(rx - u * 0.6, ry - u * 1.1, rw + u * 1.2, u * 2.2);
    ctx.fillStyle = 'rgba(255,226,176,0.35)';
    ctx.fillRect(rx, ry - 1, rw, 2);
    for (const z of w.level.zones) {
      const a = Math.max(lo, zoneCenter(z, w.time) - z.halfWidth);
      const b = Math.min(hi, zoneCenter(z, w.time) + z.halfWidth);
      if (b <= a) continue;
      ctx.fillStyle = z.kind === 'rain' ? 'rgba(110,160,255,0.45)' : 'rgba(230,170,90,0.4)';
      ctx.fillRect(at(a), ry - u * 0.9, at(b) - at(a), u * 1.8);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(at(0) - u * 0.4, ry - u * 0.4, u * 0.8, u * 0.8);
    for (const t of s.targets) {
      const color = INSTRUMENTS[t.kind].color;
      ctx.beginPath();
      ctx.arc(at(t.x), ry, u * 0.4, 0, Math.PI * 2);
      if (t.collected) {
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = color;
        ctx.fill();
      }
    }
    ctx.fillStyle = '#ffd27a';
    ctx.beginPath();
    ctx.moveTo(at(c.x), ry - u * 0.9);
    ctx.lineTo(at(c.x) + u * 0.5, ry - u * 0.2);
    ctx.lineTo(at(c.x) - u * 0.5, ry - u * 0.2);
    ctx.closePath();
    ctx.fill();
  }

  // Work in progress: drilling, scanning, imaging or uploading.
  const active = s.targets.find((t) => t.id === s.activeId);
  let label = '';
  let frac = 0;
  let color = '#ffd27a';
  if (active) {
    const ins = INSTRUMENTS[active.kind];
    label = `${ins.verb} ${ins.label}`;
    frac = active.progress;
    color = ins.color;
  } else if (s.upload > 0) {
    label = 'UPLOADING DATA';
    frac = s.upload;
    color = '#8be07a';
  }
  if (label) {
    const bw = u * 16;
    ctx.font = `bold ${u * 1.2}px monospace`;
    ctx.fillStyle = '#ffe2b0';
    ctx.fillText(`${label} ${Math.round(frac * 100)}%`, cw / 2, ch - u * 10);
    ctx.fillStyle = 'rgba(255,226,176,0.25)';
    ctx.fillRect(cw / 2 - bw / 2, ch - u * 9.2, bw, u * 0.9);
    ctx.fillStyle = color;
    ctx.fillRect(cw / 2 - bw / 2, ch - u * 9.2, bw * frac, u * 0.9);
  }

  if (s.toastUntil > w.time && w.status !== 'crashed') {
    ctx.font = `bold ${u * 1.5}px monospace`;
    ctx.fillStyle = '#8be07a';
    ctx.fillText(s.toast, cw / 2, ch * 0.22);
    if (s.toastNote) {
      ctx.font = `${u * 1.05}px monospace`;
      ctx.fillStyle = '#ffe2b0';
      ctx.fillText(s.toastNote, cw / 2, ch * 0.22 + u * 1.9);
    }
  }

  if (s.complete) {
    const pw = u * 26;
    const ph = u * 13;
    const x = cw / 2 - pw / 2;
    const y = ch * 0.45 - ph / 2;
    ctx.fillStyle = 'rgba(20,10,0,0.78)';
    ctx.fillRect(x, y, pw, ph);
    ctx.strokeStyle = '#8be07a';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, pw, ph);
    ctx.fillStyle = '#8be07a';
    ctx.font = `bold ${u * 2}px monospace`;
    ctx.fillText('SORTIE COMPLETE', cw / 2, y + u * 3);
    ctx.fillStyle = '#ffe2b0';
    ctx.font = `${u * 1.3}px monospace`;
    ctx.fillText(`Science score ${s.score}`, cw / 2, y + u * 5.6);
    const m = Math.floor(s.completeTime / 60);
    const sec = Math.floor(s.completeTime % 60);
    ctx.font = `${u * 1.1}px monospace`;
    ctx.fillText(`Mission time ${m}:${String(sec).padStart(2, '0')}`, cw / 2, y + u * 7.6);
    ctx.fillText(`Battery left ${Math.round(w.battery * 100)}%`, cw / 2, y + u * 9.1);
    ctx.fillStyle = '#ffd27a';
    ctx.fillText('Press R to fly again', cw / 2, y + u * 11.4);
  }
}

/** Landing-zone pointer, tutorial hint, rotor spin-up bar and touchdown results. */
function drawIntroHud(ctx: CanvasRenderingContext2D, w: World, cw: number, ch: number, u: number): void {
  if (!w.intro) return;
  ctx.textAlign = 'center';

  if (!w.landing && w.status !== 'crashed') {
    const dx = -w.craft.x;
    const arrow = dx > 0 ? '►' : '◄';
    const label = Math.abs(dx) < PAD_BULLSEYE ? 'LZ  OVER TARGET' : dx > 0 ? `LZ ${Math.abs(dx).toFixed(0)} m ${arrow}` : `${arrow} ${Math.abs(dx).toFixed(0)} m LZ`;
    ctx.font = `bold ${u * 1.4}px monospace`;
    ctx.fillStyle = '#ffd27a';
    ctx.fillText(label, cw / 2, u * 2.2);
  }

  const hint = hintFor(w);
  if (hint) {
    ctx.font = `${u * 1.2}px monospace`;
    const tw = ctx.measureText(hint).width;
    ctx.fillStyle = 'rgba(20,10,0,0.55)';
    ctx.fillRect(cw / 2 - tw / 2 - u, ch - u * 6.6, tw + u * 2, u * 2.2);
    ctx.fillStyle = '#ffe2b0';
    ctx.fillText(hint, cw / 2, ch - u * 5.1);
  }

  if (w.phase === 'spinup') {
    const bw = u * 16;
    const x = cw / 2 - bw / 2;
    const y = ch - u * 8.2;
    ctx.fillStyle = 'rgba(255,226,176,0.25)';
    ctx.fillRect(x, y, bw, u * 0.9);
    ctx.fillStyle = '#ffd27a';
    ctx.fillRect(x, y, bw * w.spin, u * 0.9);
  }

  const r = w.landing;
  if (r && !r.dismissed && w.status === 'landed') {
    const pw = u * 26;
    const ph = u * 15;
    const x = cw / 2 - pw / 2;
    const y = ch * 0.5 - ph / 2;
    ctx.fillStyle = 'rgba(20,10,0,0.75)';
    ctx.fillRect(x, y, pw, ph);
    ctx.strokeStyle = '#ffd27a';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, pw, ph);
    ctx.fillStyle = '#ffd27a';
    ctx.font = `bold ${u * 2}px monospace`;
    ctx.fillText(`TOUCHDOWN: ${r.rating}`, cw / 2, y + u * 3);
    ctx.fillStyle = '#ffe2b0';
    ctx.font = `${u * 1.3}px monospace`;
    ctx.fillText(`Score ${r.score} / 1000`, cw / 2, y + u * 5.4);
    ctx.font = `${u * 1.1}px monospace`;
    ctx.fillText(`Off target   ${r.offset.toFixed(0)} m`, cw / 2, y + u * 7.4);
    ctx.fillText(`Ground speed ${r.slide.toFixed(1)} m/s`, cw / 2, y + u * 8.9);
    ctx.fillText(`Battery left ${Math.round(r.battery * 100)}%`, cw / 2, y + u * 10.4);
    ctx.fillStyle = '#ffd27a';
    ctx.fillText('Press ↑ to take off and begin the sortie', cw / 2, y + u * 13);
  }
}

/** Warnings for the hazards the craft is flying into or through. */
function drawHazardHud(ctx: CanvasRenderingContext2D, w: World, cw: number, u: number): void {
  if (!weatherActive(w) || w.status === 'crashed') return;
  const blink = Math.floor(w.time * 4) % 2 === 0;
  const rows: [string, string][] = [];
  const gust = gustAt(w.level.gust, w.time);
  const arrow = gust.dir > 0 ? '►►►' : '◄◄◄';
  if (gust.warn > 0) rows.push([blink ? '#ffd27a' : '#ff9a4a', `WIND GUST INCOMING ${arrow}`]);
  else if (gust.blow > 0.05) rows.push(['#ffd27a', `WIND GUST ${arrow}`]);
  if (rainAt(w.level.zones, w.craft.x, w.time) > 0.15) rows.push(['#9fc4ff', 'METHANE RAIN: slow, high drain']);
  if (hazeAt(w.level.zones, w.craft.x, w.time) > 0.15) rows.push(['#f0c070', 'HAZE: watch the slope readout']);
  ctx.textAlign = 'center';
  ctx.font = `bold ${u * 1.1}px monospace`;
  rows.forEach(([color, text], i) => {
    ctx.fillStyle = color;
    ctx.fillText(text, cw / 2, u * 8.6 + i * u * 1.5);
  });
}
