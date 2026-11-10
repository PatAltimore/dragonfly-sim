import { INSTRUMENTS } from '../content/instruments';
import {
  MAX_LAND_SLOPE,
  PAD_BULLSEYE,
  PHOTO_MAX_AGL,
  PHOTO_MIN_AGL,
  PHOTO_RADIUS,
  SKID_DROP,
  TARGET_RADIUS,
} from '../sim/constants';
import { daylight } from '../sim/daynight';
import { drawHud } from '../ui/hud';
import { gustAt, hazeAt, rainAt } from '../sim/hazards';
import { cellCenter } from '../sim/obstacles';
import { altitudeAGL, clockOf, weatherActive, type World } from '../sim/world';

/** Visible vertical span of the world in meters, widened with altitude so the ground stays in sight. */
const VIEW_HEIGHT_M = 140;
const VIEW_ZOOM_OUT_PER_M = 0.35;
const VIEW_ZOOM_OUT_MAX_AGL = 250;
/** Cap the canvas resolution so high-density phones don't pay for pixels nobody can see. */
const MAX_DPR = 2;
const FOG_LAYERS: [number, number][] = [[90, 0.3], [45, 0.3], [15, 0.25]];

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
  /** Show the keyboard cheat-sheet along the bottom (hidden on touch devices). */
  keyHints = true;
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

  /** The canvas surface, for screens that paint over the scene. Valid after draw(). */
  surface(): { ctx: CanvasRenderingContext2D; cw: number; ch: number } {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    return { ctx: this.ctx, cw: this.canvas.width, ch: this.canvas.height };
  }

  draw(w: World, hud = true): void {
    const { canvas, ctx } = this;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
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

    // Turbulence shakes the view.
    const shake = w.turbulence;
    const shakeX = shake > 0.02 ? (Math.sin(w.time * 53) + Math.sin(w.time * 31.7)) * 0.45 * shake : 0;
    const shakeY = shake > 0.02 ? (Math.sin(w.time * 47) + Math.sin(w.time * 29.3)) * 0.45 * shake : 0;
    const sx = (x: number) => cw / 2 + (x - this.camX + shakeX) * scale;
    const sy = (y: number) => ch / 2 - (y - this.camY + shakeY) * scale;

    this.drawSky(cw, ch);
    this.drawWisps(cw, ch, scale, sx, sy);
    this.drawFarDunes(cw, ch, scale);
    this.drawTerrain(w, cw, ch, scale, sx, sy);
    this.drawBase(w, scale, sx, sy);
    this.drawTargets(w, scale, sx, sy);
    this.drawSpires(w, cw, scale, sx, sy);
    this.updateDust(w, dt);
    this.drawDust(scale, sx, sy);
    this.drawFog(w, cw, ch, scale, sy);
    this.drawCells(w, cw, scale, sx, sy);
    this.drawCanopy(w, dt, scale, sx, sy);
    this.drawCraft(w, scale, sx, sy);
    this.drawWeatherFx(w, cw, ch);
    this.drawNight(w, cw, ch, scale, sx, sy);
    if (hud) drawHud(ctx, w, cw, ch, this.keyHints);
  }

  /** Rock spires: solid obstacles to climb over, with a blinking warning lamp on the tip. */
  private drawSpires(w: World, cw: number, scale: number, sx: (x: number) => number, sy: (y: number) => number): void {
    const { ctx } = this;
    const reach = cw / 2 / scale + 15;
    const blink = Math.floor(w.time * 2) % 2 === 0;
    for (const s of w.obstacles.spires) {
      if (Math.abs(s.x - this.camX) > reach) continue;
      const surface = w.terrain.heightAt(s.x);
      const top = surface + s.height;
      const left = sx(s.x - s.baseHalf);
      const right = sx(s.x + s.baseHalf);
      ctx.beginPath();
      ctx.moveTo(left, sy(surface - 3));
      ctx.lineTo(sx(s.x - s.topHalf), sy(top - 2));
      ctx.lineTo(sx(s.x - s.topHalf * 0.3), sy(top + 1.5));
      ctx.lineTo(sx(s.x + s.topHalf), sy(top - 1));
      ctx.lineTo(right, sy(surface - 3));
      ctx.closePath();
      const g = ctx.createLinearGradient(left, 0, right, 0);
      g.addColorStop(0, '#3b2d20');
      g.addColorStop(0.55, '#5e4930');
      g.addColorStop(1, '#2a1f16');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = '#8a6a44';
      ctx.lineWidth = Math.max(1, scale * 0.2);
      ctx.stroke();
      ctx.fillStyle = blink ? '#ff5a3a' : '#7a2a1a';
      ctx.beginPath();
      ctx.arc(sx(s.x), sy(top + 2.6), scale * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Turbulence cells: swirling dark cloud with an arrow showing whether it is an updraft or a downdraft. */
  private drawCells(w: World, cw: number, scale: number, sx: (x: number) => number, sy: (y: number) => number): void {
    const { ctx } = this;
    for (const cell of w.obstacles.cells) {
      const ctr = cellCenter(w, cell);
      if (Math.abs(ctr.x - this.camX) > cw / 2 / scale + cell.radius) continue;
      const px = sx(ctr.x);
      const py = sy(ctr.y);
      const r = cell.radius * scale;
      const down = cell.lift < 0;
      const g = ctx.createRadialGradient(px, py, r * 0.1, px, py, r);
      g.addColorStop(0, down ? 'rgba(40,44,70,0.7)' : 'rgba(120,96,72,0.6)');
      g.addColorStop(1, 'rgba(60,60,80,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(200,205,235,0.45)';
      ctx.lineWidth = Math.max(1, scale * 0.3);
      for (let k = 0; k < 3; k++) {
        const a0 = w.time * (1.5 - 0.3 * k) + cell.phase + k * 2;
        ctx.beginPath();
        ctx.arc(px, py, r * (0.35 + 0.2 * k), a0, a0 + 2.2);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = `bold ${Math.round(r * 0.5)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(down ? '▼' : '▲', px, py);
      ctx.textBaseline = 'alphabetic';
    }
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
    // Ground too steep to land on glows red.
    ctx.strokeStyle = '#ff5a3a';
    ctx.lineWidth = Math.max(2, scale * 0.35);
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 2) {
      if (Math.abs(w.terrain.slopeAt(x)) > MAX_LAND_SLOPE) {
        ctx.moveTo(sx(x), sy(w.terrain.heightAt(x)));
        ctx.lineTo(sx(x + 2), sy(w.terrain.heightAt(x + 2)));
      }
    }
    ctx.stroke();
  }

  /** Haze banks hide the ground: a fog layer that follows the terrain contour. */
  private drawFog(w: World, cw: number, ch: number, scale: number, sy: (y: number) => number): void {
    if (!weatherActive(w)) return;
    const { ctx } = this;
    const x0 = this.camX - cw / 2 / scale;
    const step = 6;
    for (let px = 0; px < cw; px += step) {
      const wx = x0 + (px + step / 2) / scale;
      const haze = hazeAt(w.level.zones, wx, w.time);
      if (haze < 0.02) continue;
      const gy = w.terrain.heightAt(wx);
      for (const [height, alpha] of FOG_LAYERS) {
        ctx.fillStyle = `rgba(226,168,98,${(alpha * haze).toFixed(3)})`;
        const top = sy(gy + height);
        ctx.fillRect(px, Math.round(top), step, ch - Math.round(top));
      }
    }
  }

  /** Methane rain streaks and gloom, plus wind streaks while a gust is blowing. */
  private drawWeatherFx(w: World, cw: number, ch: number): void {
    if (!weatherActive(w)) return;
    const { ctx } = this;
    const rain = rainAt(w.level.zones, this.camX, w.time);
    if (rain > 0.02) {
      ctx.fillStyle = `rgba(40,45,60,${(rain * 0.3).toFixed(3)})`;
      ctx.fillRect(0, 0, cw, ch);
      ctx.strokeStyle = `rgba(190,205,230,${(rain * 0.45).toFixed(3)})`;
      ctx.lineWidth = Math.max(1, ch / 500);
      ctx.beginPath();
      const n = Math.floor(rain * 160);
      const len = ch / 30;
      for (let i = 0; i < n; i++) {
        const x = (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1;
        const y0 = (Math.sin(i * 78.233) * 12345.678 % 1 + 1) % 1;
        const px = x * cw;
        const py = (((y0 * ch + w.time * ch * 1.1) % ch) + ch) % ch;
        ctx.moveTo(px, py);
        ctx.lineTo(px - len * 0.25, py + len);
      }
      ctx.stroke();
    }

    const gust = gustAt(w.level.gust, w.time);
    if (gust.blow > 0.05) {
      ctx.strokeStyle = `rgba(255,236,200,${(gust.blow * 0.35).toFixed(3)})`;
      ctx.lineWidth = Math.max(1, ch / 450);
      ctx.beginPath();
      const n = Math.floor(gust.blow * 50);
      for (let i = 0; i < n; i++) {
        const x = (Math.sin(i * 39.346) * 43758.5453 % 1 + 1) % 1;
        const y = (Math.sin(i * 11.135) * 12345.678 % 1 + 1) % 1;
        const len = cw * (0.04 + 0.06 * ((Math.sin(i * 5.7) + 1) / 2));
        const px = (((x * cw + gust.dir * w.time * cw * 1.4) % cw) + cw) % cw;
        ctx.moveTo(px, y * ch);
        ctx.lineTo(px - gust.dir * len, y * ch);
      }
      ctx.stroke();
    }
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
    const dark = 1 - daylight(clockOf(w));
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

}
