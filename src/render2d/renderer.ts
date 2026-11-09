import { INSTRUMENTS } from '../content/instruments';
import {
  BASE_RADIUS,
  LOW_BATTERY,
  MAX_IMPACT_SPEED,
  MIN_TAKEOFF_BATTERY,
  PAD_BULLSEYE,
  PHOTO_MAX_AGL,
  PHOTO_MIN_AGL,
  PHOTO_RADIUS,
  SKID_DROP,
  TARGET_RADIUS,
} from '../sim/constants';
import { dayNumber, daylight, phaseLabel } from '../sim/daynight';
import { hintFor } from '../ui/hints';
import { cargoValue } from '../sim/science';
import { altitudeAGL, isPowerLost, type World } from '../sim/world';

/** Visible vertical span of the world in meters, widened with altitude so the ground stays in sight. */
const VIEW_HEIGHT_M = 140;
const VIEW_ZOOM_OUT_PER_M = 0.35;
const VIEW_ZOOM_OUT_MAX_AGL = 250;

interface Canopy {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
}

interface Dust {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private dust: Dust[] = [];
  private camX = 0;
  private camY = 0;
  private lastTime = 0;
  private viewH = VIEW_HEIGHT_M;
  private lastPhase = 'flight';
  private canopy: Canopy | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
  }

  /** Snap the camera onto the craft (call after a restart). */
  resetCamera(w: World): void {
    this.camX = w.craft.x;
    this.camY = w.craft.y + 8;
    this.dust = [];
    this.lastTime = w.time;
    this.viewH = this.targetViewH(w);
    this.lastPhase = w.phase;
    this.canopy = null;
  }

  private targetViewH(w: World): number {
    return VIEW_HEIGHT_M + Math.min(Math.max(altitudeAGL(w), 0), VIEW_ZOOM_OUT_MAX_AGL) * VIEW_ZOOM_OUT_PER_M;
  }

  draw(w: World): void {
    const { canvas, ctx } = this;
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.floor(canvas.clientWidth * dpr);
    const ch = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dt = Math.min(0.1, Math.max(0, w.time - this.lastTime));
    this.lastTime = w.time;
    this.viewH += (this.targetViewH(w) - this.viewH) * (1 - Math.exp(-2 * Math.max(dt, 1 / 60)));
    const scale = ch / this.viewH;

    // Camera follows the craft with a little lead in the direction of travel.
    const c = w.craft;
    const targetX = c.x + c.vx * 0.5;
    const targetY = Math.max(c.y + 6, w.terrain.heightAt(c.x) + this.viewH * 0.35);
    const k = 1 - Math.exp(-5 * Math.max(dt, 1 / 60));
    this.camX += (targetX - this.camX) * k;
    this.camY += (targetY - this.camY) * k;

    const sx = (x: number) => cw / 2 + (x - this.camX) * scale;
    const sy = (y: number) => ch / 2 - (y - this.camY) * scale;

    this.drawSky(cw, ch);
    this.drawWisps(cw, ch, scale, sx, sy);
    this.drawFarDunes(cw, ch, scale);
    this.drawTerrain(w, cw, ch, scale, sx, sy);
    this.drawBase(w, scale, sx, sy);
    this.drawTargets(w, scale, sx, sy);
    this.updateDust(w, dt);
    this.drawDust(scale, sx, sy);
    this.drawCanopy(w, dt, scale, sx, sy);
    this.drawCraft(w, scale, sx, sy);
    this.drawNight(w, cw, ch, scale, sx, sy);
    this.drawHud(w, cw, ch);
  }

  private drawSky(cw: number, ch: number): void {
    const g = this.ctx.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, '#6b3a14');
    g.addColorStop(0.55, '#c87a2c');
    g.addColorStop(1, '#e8a54a');
    this.ctx.fillStyle = g;
    this.ctx.fillRect(0, 0, cw, ch);
  }

  /** Faint drifting haze streaks fixed in the world, so falling and flying read as motion. */
  private drawWisps(cw: number, ch: number, scale: number, sx: (x: number) => number, sy: (y: number) => number): void {
    const { ctx } = this;
    const rowH = 28;
    const colW = 210;
    const top = this.camY + ch / 2 / scale;
    const bottom = this.camY - ch / 2 / scale;
    const left = this.camX - cw / 2 / scale - colW;
    const right = this.camX + cw / 2 / scale + colW;
    ctx.fillStyle = 'rgba(255,214,150,0.09)';
    for (let j = Math.floor(bottom / rowH); j <= Math.ceil(top / rowH); j++) {
      const hash = Math.abs(Math.sin(j * 127.1) * 43758.5453) % 1;
      const hash2 = Math.abs(Math.sin(j * 311.7) * 12345.678) % 1;
      for (let k = Math.floor(left / colW); k <= Math.ceil(right / colW); k++) {
        const x = k * colW + hash * colW;
        const y = j * rowH + hash2 * rowH;
        const len = 30 + hash2 * 60;
        ctx.beginPath();
        ctx.ellipse(sx(x), sy(y), len * scale * 0.5, scale * 1.1, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawCanopyShape(
    x: number,
    y: number,
    scale: number,
    sx: (x: number) => number,
    sy: (y: number) => number,
    craft: { x: number; y: number } | null,
  ): void {
    const { ctx } = this;
    const cx = sx(x);
    const cy = sy(y);
    if (craft) {
      ctx.strokeStyle = 'rgba(235,225,205,0.7)';
      ctx.lineWidth = Math.max(1, scale * 0.08);
      ctx.beginPath();
      for (const dx of [-7, -3.5, 3.5, 7]) {
        ctx.moveTo(cx + dx * scale, cy);
        ctx.lineTo(sx(craft.x) + dx * 0.12 * scale, sy(craft.y) - scale * 0.5);
      }
      ctx.stroke();
    }
    ctx.fillStyle = '#e9e1d2';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 7.5 * scale, 3.6 * scale, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d9542b';
    for (const [a, b] of [[-5.5, -3.5], [-1.8, 1.8], [3.5, 5.5]]) {
      ctx.beginPath();
      ctx.moveTo(cx + a * scale, cy);
      ctx.quadraticCurveTo(cx + ((a + b) / 2) * scale, cy - 3.5 * scale, cx + b * scale, cy);
      ctx.closePath();
      ctx.fill();
    }
  }

  /** The parachute: attached during descent, then it peels away when jettisoned. */
  private drawCanopy(w: World, dt: number, scale: number, sx: (x: number) => number, sy: (y: number) => number): void {
    const c = w.craft;
    if (this.lastPhase === 'chute' && w.phase === 'spinup') {
      this.canopy = { x: c.x, y: c.y + 9, vx: c.vx - 4, vy: -18, age: 0 };
    }
    this.lastPhase = w.phase;
    if (w.phase === 'chute') {
      this.drawCanopyShape(c.x + c.pitch * 12, c.y + 9, scale, sx, sy, c);
    } else if (this.canopy) {
      const k = this.canopy;
      k.age += dt;
      k.x += k.vx * dt;
      k.y += k.vy * dt;
      if (k.age < 6) {
        this.ctx.globalAlpha = Math.max(0, 1 - k.age / 6);
        this.drawCanopyShape(k.x, k.y, scale, sx, sy, null);
        this.ctx.globalAlpha = 1;
      } else {
        this.canopy = null;
      }
    }
  }

  /** Haze-faded dune layers with parallax. */
  private drawFarDunes(cw: number, ch: number, scale: number): void {
    const { ctx } = this;
    const layers = [
      { par: 0.25, off: 0.52, amp: 14, freq: 0.012, color: '#a8662a' },
      { par: 0.5, off: 0.62, amp: 11, freq: 0.02, color: '#7d4a1f' },
    ];
    for (const L of layers) {
      ctx.fillStyle = L.color;
      ctx.beginPath();
      ctx.moveTo(0, ch);
      for (let px = 0; px <= cw; px += 8) {
        const wx = this.camX * L.par + (px - cw / 2) / scale;
        const h = Math.sin(wx * L.freq) * L.amp + Math.sin(wx * L.freq * 2.7 + 1.3) * L.amp * 0.4;
        const camShift = (this.camY - 30) * scale * L.par;
        ctx.lineTo(px, ch * L.off + camShift - h * scale * 0.5);
      }
      ctx.lineTo(cw, ch);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawTerrain(
    w: World,
    cw: number,
    ch: number,
    scale: number,
    sx: (x: number) => number,
    sy: (y: number) => number,
  ): void {
    const { ctx } = this;
    const x0 = this.camX - cw / 2 / scale - 2;
    const x1 = this.camX + cw / 2 / scale + 2;
    ctx.beginPath();
    ctx.moveTo(sx(x0), ch);
    for (let x = x0; x <= x1; x += 1) ctx.lineTo(sx(x), sy(w.terrain.heightAt(x)));
    ctx.lineTo(sx(x1), ch);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, sy(8), 0, ch);
    g.addColorStop(0, '#3a2412');
    g.addColorStop(1, '#1a0f06');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#5a3a1c';
    ctx.lineWidth = Math.max(1, scale * 0.15);
    ctx.stroke();
  }

  /** Science target markers: landing rings for DraMS/DraGNS, hover boxes for DragonCam. */
  private drawTargets(w: World, scale: number, sx: (x: number) => number, sy: (y: number) => number): void {
    const { ctx } = this;
    const pulse = 0.65 + 0.35 * Math.sin(w.time * 4);
    ctx.textAlign = 'center';
    for (const t of w.science.targets) {
      const ins = INSTRUMENTS[t.kind];
      const gy = w.terrain.heightAt(t.x);
      const px = sx(t.x);
      const py = sy(gy);
      ctx.globalAlpha = t.collected ? 0.3 : 1;
      ctx.strokeStyle = ins.color;
      ctx.fillStyle = ins.color;
      ctx.lineWidth = Math.max(1.5, scale * 0.25);
      let labelY: number;
      if (ins.landing) {
        ctx.globalAlpha *= pulse;
        ctx.beginPath();
        ctx.ellipse(px, py, TARGET_RADIUS * scale, 1.3 * scale, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = t.collected ? 0.3 : 1;
        ctx.fillRect(px - scale * 0.15, py - 9 * scale, scale * 0.3, 9 * scale);
        ctx.beginPath();
        ctx.moveTo(px, py - 12 * scale);
        ctx.lineTo(px + 1.6 * scale, py - 9.8 * scale);
        ctx.lineTo(px, py - 7.6 * scale);
        ctx.lineTo(px - 1.6 * scale, py - 9.8 * scale);
        ctx.closePath();
        ctx.fill();
        labelY = py - 13.5 * scale;
      } else {
        const top = sy(gy + PHOTO_MAX_AGL);
        const bottom = sy(gy + PHOTO_MIN_AGL);
        ctx.setLineDash([scale * 1.2, scale * 0.8]);
        ctx.globalAlpha *= pulse;
        ctx.strokeRect(sx(t.x - PHOTO_RADIUS), top, 2 * PHOTO_RADIUS * scale, bottom - top);
        ctx.setLineDash([]);
        ctx.globalAlpha = t.collected ? 0.3 : 1;
        ctx.beginPath();
        ctx.arc(px, (top + bottom) / 2, scale * 1.4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(px, (top + bottom) / 2, scale * 0.5, 0, Math.PI * 2);
        ctx.fill();
        labelY = top - scale * 1.2;
      }
      ctx.font = `${Math.max(12, Math.round(scale * 1.7))}px monospace`;
      ctx.fillText(t.collected ? `${ins.label} ✓` : ins.label, px, labelY);
      if (t.progress > 0 && !t.collected) {
        const bw = 12 * scale;
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(20,10,0,0.6)';
        ctx.fillRect(px - bw / 2, labelY - scale * 3.4, bw, scale * 1.1);
        ctx.fillStyle = ins.color;
        ctx.fillRect(px - bw / 2, labelY - scale * 3.4, bw * t.progress, scale * 1.1);
      }
      ctx.globalAlpha = 1;
    }
  }

  /** Landing zone at x = 0: pad, bullseye marks and blinking beacons. */
  private drawBase(w: World, scale: number, sx: (x: number) => number, sy: (y: number) => number): void {
    const { ctx } = this;
    const gy = w.terrain.heightAt(0);
    ctx.fillStyle = '#6e6e6e';
    ctx.fillRect(sx(-12), sy(gy), 24 * scale, 0.5 * scale);
    ctx.fillStyle = '#ffd27a';
    ctx.fillRect(sx(-PAD_BULLSEYE), sy(gy), 2 * PAD_BULLSEYE * scale, 0.5 * scale);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(sx(-PAD_BULLSEYE + 1), sy(gy) + scale * 0.1, (2 * PAD_BULLSEYE - 2) * scale, scale * 0.3);
    ctx.fillStyle = '#ffd27a';
    for (const x of [-12, 12]) ctx.fillRect(sx(x) - scale * 0.15, sy(gy) - 5 * scale, scale * 0.3, 5 * scale);
    ctx.fillStyle = Math.floor(w.time * 2) % 2 === 0 ? '#ff5a3a' : '#7a2a1a';
    for (const x of [-12, 12]) {
      ctx.beginPath();
      ctx.arc(sx(x), sy(gy) - 5 * scale, scale * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#e6e6e6';
    ctx.font = `${Math.round(scale * 1.6)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('LZ', sx(0), sy(gy) + scale * 2.6);
  }

  private updateDust(w: World, dt: number): void {
    const c = w.craft;
    const agl = altitudeAGL(w);
    if (w.status !== 'crashed' && agl < 12 && c.throttle > 0.15 && dt > 0) {
      const strength = c.throttle * (1 - agl / 12);
      const n = Math.floor(strength * 4 + Math.random());
      const gy = w.terrain.heightAt(c.x);
      for (let i = 0; i < n; i++) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        this.dust.push({
          x: c.x + (Math.random() - 0.5) * 2,
          y: gy + 0.2,
          vx: dir * (2 + Math.random() * 5 * strength),
          vy: 0.3 + Math.random() * 1.2,
          life: 1,
        });
      }
    }
    for (const d of this.dust) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vx *= Math.exp(-1.2 * dt);
      d.life -= dt * 0.9;
    }
    this.dust = this.dust.filter((d) => d.life > 0);
  }

  private drawDust(scale: number, sx: (x: number) => number, sy: (y: number) => number): void {
    const { ctx } = this;
    for (const d of this.dust) {
      ctx.fillStyle = `rgba(190,130,70,${(d.life * 0.5).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(sx(d.x), sy(d.y), scale * (0.3 + (1 - d.life) * 0.7), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawCraft(w: World, scale: number, sx: (x: number) => number, sy: (y: number) => number): void {
    const { ctx } = this;
    const c = w.craft;
    ctx.save();
    ctx.translate(sx(c.x), sy(c.y));
    ctx.rotate(c.pitch);
    ctx.scale(scale, scale);
    ctx.scale(c.facing, 1);

    const crashed = w.status === 'crashed';
    // Skids
    ctx.strokeStyle = '#9a9a9a';
    ctx.lineWidth = 0.18;
    ctx.beginPath();
    ctx.moveTo(-1.5, SKID_DROP);
    ctx.lineTo(1.5, SKID_DROP);
    ctx.moveTo(-1.0, SKID_DROP);
    ctx.lineTo(-0.8, 0.3);
    ctx.moveTo(1.0, SKID_DROP);
    ctx.lineTo(0.8, 0.3);
    ctx.stroke();
    // Body
    ctx.fillStyle = crashed ? '#5a5a5a' : '#d9d9d9';
    ctx.beginPath();
    ctx.roundRect(-1.3, -0.5, 2.6, 1.0, 0.25);
    ctx.fill();
    ctx.fillStyle = '#2b3a55';
    ctx.fillRect(0.5, -0.3, 0.6, 0.35); // camera window
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(-1.3, -0.1, 0.5, 0.25); // MMRTG fins marker
    // Rotor arms and stacked rotor discs
    for (const rx of [-1.9, 1.9]) {
      ctx.strokeStyle = '#8a8a8a';
      ctx.lineWidth = 0.14;
      ctx.beginPath();
      ctx.moveTo(rx * 0.35, -0.3);
      ctx.lineTo(rx, -0.75);
      ctx.stroke();
      const len = 1.5;
      const alpha = crashed ? 1 : 0.25 + 0.5 * c.throttle;
      ctx.strokeStyle = `rgba(230,230,230,${alpha.toFixed(2)})`;
      ctx.lineWidth = 0.16;
      for (const dy of [-0.85, -1.05]) {
        ctx.beginPath();
        ctx.moveTo(rx - len, dy);
        ctx.lineTo(rx + len, dy);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Darkness overlay with warm light pools around the craft and the base pad. */
  private drawNight(
    w: World,
    cw: number,
    ch: number,
    scale: number,
    sx: (x: number) => number,
    sy: (y: number) => number,
  ): void {
    const dark = 1 - daylight(w.time);
    if (dark < 0.02) return;
    const { ctx } = this;
    ctx.fillStyle = `rgba(6,6,28,${(dark * 0.8).toFixed(3)})`;
    ctx.fillRect(0, 0, cw, ch);

    const pool = (x: number, y: number, radius: number, strength: number) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
      g.addColorStop(0, `rgba(255,200,120,${(strength * dark).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      ctx.globalCompositeOperation = 'source-over';
    };
    pool(sx(w.craft.x), sy(w.craft.y), scale * 30, 0.5);
    pool(sx(0), sy(w.terrain.heightAt(0)), scale * 14, 0.45);
  }

  private drawHud(w: World, cw: number, ch: number): void {
    const { ctx } = this;
    const c = w.craft;
    const u = Math.max(10, ch / 50);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `${u}px monospace`;
    ctx.textAlign = 'left';
    const agl = altitudeAGL(w);
    const risky = w.status === 'flying' && agl < 10 && -c.vy > MAX_IMPACT_SPEED * 0.8;
    const low = w.battery < LOW_BATTERY;
    const blink = Math.floor(w.time * 3) % 2 === 0;

    const lines: [string, string][] = [
      ['ALT', `${agl.toFixed(1)} m`],
      ['V/S', `${c.vy.toFixed(1)} m/s`],
      ['H/S', `${c.vx.toFixed(1)} m/s`],
      ['DIST', `${c.x.toFixed(0)} m`],
      ['SOL', `${dayNumber(w.time)} ${phaseLabel(w.time)}`],
      ['BATT', `${Math.round(w.battery * 100)}%`],
      ['CARGO', `${w.science.cargo.length} (${cargoValue(w.science)})`],
      ['SCORE', `${w.science.score}`],
    ];
    ctx.fillStyle = 'rgba(20,10,0,0.55)';
    ctx.fillRect(u * 0.6, u * 0.6, u * 12, u * (lines.length * 1.35 + 1.9));
    lines.forEach(([k, v], i) => {
      let color = '#ffe2b0';
      if (k === 'V/S' && risky) color = '#ff6a4a';
      if (k === 'BATT' && low) color = blink ? '#ff6a4a' : '#ffe2b0';
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

    this.drawIntroHud(w, cw, ch, u);
    this.drawSortieHud(w, cw, ch, u);

    ctx.textAlign = 'center';
    ctx.font = `${u * 0.9}px monospace`;
    ctx.fillStyle = 'rgba(255,226,176,0.7)';
    ctx.fillText('Arrows/WASD: tilt + climb/descend    R: restart    X: skip intro', cw / 2, ch - u * 0.8);
  }

  /** Target pointer, radar strip, work progress, event toasts and the sortie-complete panel. */
  private drawSortieHud(w: World, cw: number, ch: number, u: number): void {
    if (w.phase !== 'flight' || (w.intro && !w.landing)) return;
    const { ctx } = this;
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
  private drawIntroHud(w: World, cw: number, ch: number, u: number): void {
    if (!w.intro) return;
    const { ctx } = this;
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
}
