import { MAX_IMPACT_SPEED, SKID_DROP } from '../sim/constants';
import { altitudeAGL, type World } from '../sim/world';

/** Visible vertical span of the world in meters. */
const VIEW_HEIGHT_M = 90;

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
    const scale = ch / VIEW_HEIGHT_M;
    const dt = Math.min(0.1, Math.max(0, w.time - this.lastTime));
    this.lastTime = w.time;

    // Camera follows the craft with a little lead in the direction of travel.
    const c = w.craft;
    const targetX = c.x + c.vx * 1.2;
    const targetY = Math.max(c.y + 6, w.terrain.heightAt(c.x) + VIEW_HEIGHT_M * 0.35);
    const k = 1 - Math.exp(-3 * Math.max(dt, 1 / 60));
    this.camX += (targetX - this.camX) * k;
    this.camY += (targetY - this.camY) * k;

    const sx = (x: number) => cw / 2 + (x - this.camX) * scale;
    const sy = (y: number) => ch / 2 - (y - this.camY) * scale;

    this.drawSky(cw, ch);
    this.drawFarDunes(cw, ch, scale);
    this.drawTerrain(w, cw, ch, scale, sx, sy);
    this.drawBase(w, scale, sx, sy);
    this.updateDust(w, dt);
    this.drawDust(scale, sx, sy);
    this.drawCraft(w, scale, sx, sy);
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
        const camShift = (this.camY - 30) * scale * L.par * 0.5;
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

  /** Landing pad at x = 0. */
  private drawBase(w: World, scale: number, sx: (x: number) => number, sy: (y: number) => number): void {
    const { ctx } = this;
    const gy = w.terrain.heightAt(0);
    ctx.fillStyle = '#6e6e6e';
    ctx.fillRect(sx(-6), sy(gy), 12 * scale, 0.5 * scale);
    ctx.fillStyle = '#d8d8d8';
    for (let i = -5; i <= 5; i += 2) ctx.fillRect(sx(i) - scale * 0.15, sy(gy) + scale * 0.1, scale * 0.3, scale * 0.3);
    ctx.fillStyle = '#e6e6e6';
    ctx.font = `${Math.round(scale * 1.6)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('BASE', sx(0), sy(gy) + scale * 2.6);
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

  private drawHud(w: World, cw: number, ch: number): void {
    const { ctx } = this;
    const c = w.craft;
    const u = Math.max(10, ch / 50);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `${u}px monospace`;
    ctx.textAlign = 'left';
    const agl = altitudeAGL(w);
    const risky = w.status === 'flying' && agl < 10 && -c.vy > MAX_IMPACT_SPEED * 0.8;

    const lines: [string, string][] = [
      ['ALT', `${agl.toFixed(1)} m`],
      ['V/S', `${c.vy.toFixed(1)} m/s`],
      ['H/S', `${c.vx.toFixed(1)} m/s`],
      ['DIST', `${c.x.toFixed(0)} m`],
    ];
    ctx.fillStyle = 'rgba(20,10,0,0.45)';
    ctx.fillRect(u * 0.6, u * 0.6, u * 11, u * (lines.length * 1.35 + 2.4));
    lines.forEach(([k, v], i) => {
      ctx.fillStyle = k === 'V/S' && risky ? '#ff6a4a' : '#ffe2b0';
      ctx.fillText(`${k.padEnd(5)}${v}`, u, u * (1.9 + i * 1.35));
    });
    // Throttle bar
    const by = u * (1.9 + lines.length * 1.35) - u * 0.2;
    ctx.fillStyle = 'rgba(255,226,176,0.25)';
    ctx.fillRect(u, by, u * 9.5, u * 0.7);
    ctx.fillStyle = '#ffd27a';
    ctx.fillRect(u, by, u * 9.5 * Math.min(1, c.throttle), u * 0.7);

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
    } else if (w.status === 'landed') {
      ctx.fillStyle = '#ffe2b0';
      ctx.font = `${u * 1.3}px monospace`;
      ctx.fillText(w.message, cw / 2, ch * 0.3);
    }
    ctx.font = `${u * 0.9}px monospace`;
    ctx.fillStyle = 'rgba(255,226,176,0.7)';
    ctx.fillText('Arrows/WASD: tilt + climb/descend    R: restart', cw / 2, ch - u * 0.8);
  }
}
