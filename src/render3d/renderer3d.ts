import * as THREE from 'three';
import { INSTRUMENTS } from '../content/instruments';
import type { SceneRenderer } from '../scene-renderer';
import {
  MAX_LAND_SLOPE,
  PAD_BULLSEYE,
  PHOTO_MAX_AGL,
  PHOTO_MIN_AGL,
  PHOTO_RADIUS,
  TARGET_RADIUS,
} from '../sim/constants';
import { daylight } from '../sim/daynight';
import { gustAt, hazeAt, rainAt } from '../sim/hazards';
import { cellCenter, type Obstacles } from '../sim/obstacles';
import { drawHud } from '../ui/hud';
import type { Surface } from '../ui/screens';
import { altitudeAGL, clockOf, weatherActive, type World } from '../sim/world';

/** The same side-on view as the 2D game: this much of the world's height fits on screen, widened with altitude. */
const VIEW_HEIGHT_M = 140;
const VIEW_ZOOM_OUT_PER_M = 0.35;
const VIEW_ZOOM_OUT_MAX_AGL = 250;
const MAX_DPR = 2;
const FOV_DEG = 50;
/** The camera sits off to one side and a little above the flight plane for a sense of depth. */
const CAM_YAW = 0.22;
const CAM_PITCH = 0.1;

/** Terrain grid: spacing along the track and the depth rows (z). The flight plane is z = 0. */
const GRID_DX = 4;
const GRID_NX = 181;
const ROWS = [90, 60, 40, 28, 18, 10, 4, 0, -4, -10, -18, -30, -45, -65, -90, -125, -170, -230, -310, -420, -560, -750];

const DAY_SKY = ['#6b3a14', '#c87a2c', '#e8a54a'];
const NIGHT_SKY = ['#05030a', '#160d18', '#241628'];

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();
const mix = (a: string, b: string, t: number): THREE.Color => tmpA.set(a).lerp(tmpB.set(b), t);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const frac = (v: number) => v - Math.floor(v);

function hash2(ix: number, iz: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** 2D value noise in [-1, 1], used only for scenery that has no effect on gameplay. */
function noise2(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return ((a + (b - a) * ux) * (1 - uz) + (c + (d - c) * ux) * uz) * 2 - 1;
}

const unlit = (color: THREE.ColorRepresentation, extra: THREE.MeshBasicMaterialParameters = {}) =>
  new THREE.MeshBasicMaterial({ color, fog: false, ...extra });
const lit = (color: THREE.ColorRepresentation, extra: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ color, fog: false, ...extra });

interface CraftModel {
  group: THREE.Group;
  body: THREE.MeshLambertMaterial;
  blades: THREE.Object3D[];
  discs: THREE.MeshBasicMaterial[];
  bladeMats: THREE.MeshLambertMaterial[];
}

function buildCraft(): CraftModel {
  const group = new THREE.Group();
  group.rotation.order = 'ZYX';
  const body = lit('#d9d9d9');
  const dark = lit('#4a4a50');
  const steel = lit('#9a9a9a');

  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1, 1.7), body);
  group.add(hull);
  const window = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.8), lit('#2b3a55'));
  window.position.set(1.32, 0.1, 0);
  group.add(window);
  // MMRTG power source slung under the tail.
  const rtg = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1.5, 12), dark);
  rtg.rotation.z = Math.PI / 2;
  rtg.position.set(-0.5, -0.7, 0);
  group.add(rtg);
  for (const x of [-1.05, -0.5, -0.0]) {
    const fin = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 12), lit('#c0392b'));
    fin.rotation.z = Math.PI / 2;
    fin.position.set(x - 0.0, -0.7, 0);
    group.add(fin);
  }
  // Skids and struts: the bottom of the skids is 1 m below the center, matching the sim.
  for (const z of [-0.65, 0.65]) {
    const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.1, 8), steel);
    skid.rotation.z = Math.PI / 2;
    skid.position.set(0, -0.95, z);
    group.add(skid);
    for (const x of [-1.0, 1.0]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 6), steel);
      strut.position.set(x, -0.62, z);
      strut.rotation.z = x > 0 ? -0.2 : 0.2;
      group.add(strut);
    }
  }

  // Four arms, each with a coaxial pair of rotors (eight in all).
  const blades: THREE.Object3D[] = [];
  const discs: THREE.MeshBasicMaterial[] = [];
  const bladeMats: THREE.MeshLambertMaterial[] = [];
  const corners: [number, number][] = [[-1.9, -1.35], [-1.9, 1.35], [1.9, -1.35], [1.9, 1.35]];
  corners.forEach(([x, z], k) => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(x - Math.sign(x) * 0.8, z), 0.1, 0.12), steel);
    arm.position.set((x + Math.sign(x) * 0.8) / 2, 0.5, z / 2);
    arm.rotation.y = -Math.atan2(z, x - Math.sign(x) * 0.8) + (x < 0 ? Math.PI : 0);
    group.add(arm);
    for (const [dy, dir] of [[0.62, 1], [0.86, -1]] as [number, number][]) {
      const hub = new THREE.Group();
      hub.position.set(x, dy, z);
      const bladeMat = lit('#e8e8e8');
      bladeMats.push(bladeMat);
      const bladeA = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.04, 0.16), bladeMat);
      const bladeB = bladeA.clone();
      bladeB.rotation.y = Math.PI / 2;
      const spin = new THREE.Group();
      spin.add(bladeA, bladeB);
      spin.userData.dir = dir * (k % 2 ? 1 : -1);
      hub.add(spin);
      blades.push(spin);
      const discMat = unlit('#f0ecdf', { transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide });
      discs.push(discMat);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1.35, 24), discMat);
      disc.rotation.x = -Math.PI / 2;
      hub.add(disc);
      group.add(hub);
    }
  });
  return { group, body, blades, discs, bladeMats };
}

interface TargetModel {
  group: THREE.Group;
  materials: THREE.Material[];
  spinner: THREE.Object3D | null;
  landing: boolean;
  groundY: number;
}

interface Dust {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  life: number;
}

/**
 * Three.js version of the flight view. It draws the same 2D simulation as a side-on 3D scene: the
 * flight plane stays at z = 0 while the terrain, sky and weather gain real depth. The HUD and menu
 * screens are painted on a transparent 2D canvas over the WebGL canvas.
 */
export class Renderer3D implements SceneRenderer {
  keyHints = true;
  private ctx: CanvasRenderingContext2D;
  private gl: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 1, 4000);
  private hemi = new THREE.HemisphereLight(0xe8b070, 0x4a2c14, 1.2);
  private sun = new THREE.DirectionalLight(0xffd9a0, 2.2);
  private craftLight = new THREE.PointLight(0xffc880, 0, 140, 1.4);
  private padLight = new THREE.PointLight(0xffc880, 0, 120, 1.4);

  private skyCanvas = document.createElement('canvas');
  private skyTexture: THREE.CanvasTexture;
  private skyKey = '';
  private fog = new THREE.Fog(0xc87a2c, 100, 900);

  private terrainMesh: THREE.Mesh;
  private terrainGeo: THREE.BufferGeometry;
  private steepGeo: THREE.BufferGeometry;
  private trackGeo: THREE.BufferGeometry;
  private snapX = Number.NaN;
  private terrainRef: object | null = null;

  private craft = buildCraft();
  private yaw = 0;
  private canopyGroup = new THREE.Group();
  private canopyLines: THREE.LineSegments;
  private canopyMats: THREE.Material[] = [];
  private canopyFree: { x: number; y: number; vx: number; vy: number; age: number } | null = null;
  private lastPhase = 'flight';

  private baseLights: THREE.Mesh[] = [];
  private targets: TargetModel[] = [];
  private targetsRef: object | null = null;
  private targetRoot = new THREE.Group();

  private spireRoot = new THREE.Group();
  private cellRoot = new THREE.Group();
  private spireLamps: THREE.Mesh[] = [];
  private cellModels: { group: THREE.Group; outer: THREE.MeshBasicMaterial; rings: THREE.Mesh[]; phase: number }[] = [];
  private obstaclesRef: Obstacles | null = null;

  private rain: THREE.LineSegments;
  private wind: THREE.LineSegments;
  private dustPoints: THREE.Points;
  private dust: Dust[] = [];

  private camX = 0;
  private camY = 0;
  private viewH = VIEW_HEIGHT_M;
  private lastTime = 0;
  private width = 0;
  private height = 0;
  private projected = new THREE.Vector3();

  constructor(
    private overlay: HTMLCanvasElement,
    glCanvas: HTMLCanvasElement,
  ) {
    const ctx = overlay.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    this.gl = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, powerPreference: 'high-performance' });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;

    this.skyCanvas.width = 2;
    this.skyCanvas.height = 128;
    this.skyTexture = new THREE.CanvasTexture(this.skyCanvas);
    this.skyTexture.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = this.skyTexture;
    this.scene.fog = this.fog;

    this.sun.position.set(-120, 80, 100);
    this.scene.add(this.hemi, this.sun, this.craftLight, this.padLight);

    // Terrain: a grid that follows the camera along the track; heights come from the sim at z = 0.
    const rows = ROWS.length;
    this.terrainGeo = new THREE.BufferGeometry();
    this.terrainGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(GRID_NX * rows * 3), 3));
    this.terrainGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(GRID_NX * rows * 3), 3));
    const index: number[] = [];
    for (let r = 0; r < rows - 1; r++) {
      for (let i = 0; i < GRID_NX - 1; i++) {
        const a = r * GRID_NX + i;
        const b = a + 1;
        const c = a + GRID_NX;
        const d = c + 1;
        index.push(a, b, c, b, d, c);
      }
    }
    this.terrainGeo.setIndex(index);
    this.terrainMesh = new THREE.Mesh(this.terrainGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.terrainMesh.frustumCulled = false;
    this.scene.add(this.terrainMesh);

    // A lighter strip along the flight plane's ground, so the surface you land on reads clearly.
    this.trackGeo = new THREE.BufferGeometry();
    this.trackGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(GRID_NX * 2 * 3), 3));
    const trackIndex: number[] = [];
    for (let i = 0; i < GRID_NX - 1; i++) trackIndex.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    this.trackGeo.setIndex(trackIndex);
    const track = new THREE.Mesh(this.trackGeo, new THREE.MeshBasicMaterial({ color: 0x9a6330, side: THREE.DoubleSide }));
    track.frustumCulled = false;
    this.scene.add(track);

    // Ground too steep to land on glows red along the flight plane, as in the 2D view.
    this.steepGeo = new THREE.BufferGeometry();
    this.steepGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(GRID_NX * 4 * 3), 3));
    const steepIndex: number[] = [];
    for (let i = 0; i < GRID_NX; i++) steepIndex.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2);
    this.steepGeo.setIndex(steepIndex);
    const steep = new THREE.Mesh(this.steepGeo, new THREE.MeshBasicMaterial({ color: 0xff5a3a, fog: false, side: THREE.DoubleSide }));
    steep.frustumCulled = false;
    this.scene.add(steep);

    this.scene.add(this.craft.group);

    // Parachute canopy with suspension lines.
    this.canopyGroup.visible = false;
    this.buildCanopy();
    this.canopyLines = this.canopyGroup.children.find((o) => o instanceof THREE.LineSegments) as THREE.LineSegments;
    this.scene.add(this.canopyGroup);

    this.scene.add(this.targetRoot, this.spireRoot, this.cellRoot);

    // Weather: rain streaks, wind streaks and thrown-up dust.
    this.rain = this.streaks(700, 0xbfd0ea);
    this.wind = this.streaks(70, 0xffecc8);
    this.scene.add(this.rain, this.wind);
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(150 * 3), 3));
    this.dustPoints = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({ color: 0xc08848, size: 3, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    this.dustPoints.frustumCulled = false;
    this.scene.add(this.dustPoints);
  }

  private streaks(count: number, color: number): THREE.LineSegments {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 6), 3));
    const lines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0, fog: false, depthWrite: false }),
    );
    lines.frustumCulled = false;
    lines.visible = false;
    return lines;
  }

  private buildCanopy(): void {
    const geo = new THREE.SphereGeometry(7.5, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    geo.scale(1, 0.5, 1);
    const pos = geo.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const red = new THREE.Color('#d9542b');
    const cream = new THREE.Color('#e9e1d2');
    for (let i = 0; i < pos.count; i++) {
      const sector = Math.floor((((Math.atan2(pos.getZ(i), pos.getX(i)) + Math.PI) / (Math.PI * 2)) * 8) % 8);
      const c = sector % 2 ? red : cream;
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false, transparent: true });
    this.canopyMats.push(mat);
    this.canopyGroup.add(new THREE.Mesh(geo, mat));

    const lineMat = new THREE.LineBasicMaterial({ color: 0xebe1cd, transparent: true, opacity: 0.7, fog: false });
    this.canopyMats.push(lineMat);
    const lines = new THREE.LineSegments(new THREE.BufferGeometry(), lineMat);
    lines.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 6), 3));
    lines.frustumCulled = false;
    this.canopyGroup.add(lines);
  }

  resetCamera(w: World): void {
    this.camX = w.craft.x;
    this.camY = w.craft.y + 8;
    this.viewH = this.targetViewH(w);
    this.lastTime = w.time;
    this.lastPhase = w.phase;
    this.canopyFree = null;
    this.dust = [];
    this.snapX = Number.NaN;
    this.yaw = w.craft.facing === 1 ? 0 : Math.PI;
  }

  private targetViewH(w: World): number {
    return VIEW_HEIGHT_M + clamp(altitudeAGL(w), 0, VIEW_ZOOM_OUT_MAX_AGL) * VIEW_ZOOM_OUT_PER_M;
  }

  surface(): Surface {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    return { ctx: this.ctx, cw: this.overlay.width, ch: this.overlay.height };
  }

  /** Scenery height at a point of the depth grid. At z = 0 it is exactly the sim's terrain. */
  private sceneHeight(w: World, x: number, z: number): number {
    const track = w.terrain.heightAt(x);
    if (z >= 0) return track - z * z * 0.012;
    const dz = -z;
    const s = smoothstep(0, 140, dz);
    const far =
      9 * noise2(x / 70, dz / 60) +
      18 * noise2(x / 190 + 50, dz / 120 + 9) +
      45 * smoothstep(100, 700, dz) * (0.5 + 0.5 * noise2(x / 400, 7));
    return track * (1 - s) + far * s;
  }

  private updateTerrain(w: World, snapX: number): void {
    const pos = this.terrainGeo.getAttribute('position') as THREE.BufferAttribute;
    const col = this.terrainGeo.getAttribute('color') as THREE.BufferAttribute;
    const half = (GRID_NX - 1) / 2;
    for (let r = 0; r < ROWS.length; r++) {
      const z = ROWS[r];
      for (let i = 0; i < GRID_NX; i++) {
        const lx = (i - half) * GRID_DX;
        const wx = snapX + lx;
        const h = this.sceneHeight(w, wx, z);
        const k = r * GRID_NX + i;
        pos.setXYZ(k, lx, h, z);
        // Sandy browns with a little speckle, darker toward the near edge of the diorama.
        const speckle = noise2(wx / 7, z / 7) * 0.025;
        const shade = 0.16 + speckle + clamp(h / 90, -0.04, 0.06);
        const dim = z > 0 ? 0.55 : 1;
        col.setXYZ(k, shade * 1.25 * dim, shade * 0.72 * dim, shade * 0.3 * dim);
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.terrainGeo.computeVertexNormals();

    const tp = this.trackGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < GRID_NX; i++) {
      const wx = snapX + (i - half) * GRID_DX;
      const y = w.terrain.heightAt(wx) + 0.05;
      tp.setXYZ(i * 2, wx, y, 1.8);
      tp.setXYZ(i * 2 + 1, wx, y, -1.8);
    }
    tp.needsUpdate = true;

    const sp = this.steepGeo.getAttribute('position') as THREE.BufferAttribute;
    let n = 0;
    for (let i = 0; i < GRID_NX - 1; i++) {
      const wx = snapX + (i - half) * GRID_DX;
      if (Math.abs(w.terrain.slopeAt(wx + GRID_DX / 2)) <= MAX_LAND_SLOPE) continue;
      const y0 = w.terrain.heightAt(wx) + 0.15;
      const y1 = w.terrain.heightAt(wx + GRID_DX) + 0.15;
      const o = n * 4;
      sp.setXYZ(o, wx, y0, 1.4);
      sp.setXYZ(o + 1, wx + GRID_DX, y1, 1.4);
      sp.setXYZ(o + 2, wx, y0, -1.4);
      sp.setXYZ(o + 3, wx + GRID_DX, y1, -1.4);
      n++;
    }
    sp.needsUpdate = true;
    this.steepGeo.setDrawRange(0, n * 6);
  }

  /** Rebuild the rock spires and turbulence cells for a world. */
  private rebuildObstacles(w: World): void {
    for (const root of [this.spireRoot, this.cellRoot]) {
      for (const child of [...root.children]) {
        root.remove(child);
        child.traverse((o) => {
          const mesh = o as THREE.Mesh;
          mesh.geometry?.dispose();
          const mat = mesh.material as THREE.Material | undefined;
          mat?.dispose();
        });
      }
    }
    this.spireLamps = [];
    this.cellModels = [];

    for (const s of w.obstacles.spires) {
      const surface = w.terrain.heightAt(s.x);
      const geo = new THREE.CylinderGeometry(s.topHalf, s.baseHalf, s.height + 3, 8, 4);
      // Roughen the column so it reads as rock rather than a pipe.
      const p = geo.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        p.setX(i, p.getX(i) * (1 + 0.2 * noise2(p.getX(i) * 0.7 + s.x, y * 0.3)));
        p.setZ(i, p.getZ(i) * (1 + 0.2 * noise2(p.getZ(i) * 0.7 + s.x, y * 0.3 + 9)));
      }
      geo.computeVertexNormals();
      const rock = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: '#7a5f42', flatShading: true }));
      rock.position.set(s.x, surface - 3 + (s.height + 3) / 2, 0);
      this.spireRoot.add(rock);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), unlit('#ff5a3a'));
      lamp.position.set(s.x, surface + s.height + 1.8, 0);
      this.spireRoot.add(lamp);
      this.spireLamps.push(lamp);
    }

    for (const cell of w.obstacles.cells) {
      const down = cell.lift < 0;
      const group = new THREE.Group();
      const outerMat = new THREE.MeshBasicMaterial({
        color: down ? '#3d4466' : '#7a6650',
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        fog: false,
      });
      group.add(new THREE.Mesh(new THREE.SphereGeometry(cell.radius, 24, 16), outerMat));
      const innerMat = new THREE.MeshBasicMaterial({
        color: down ? '#232848' : '#5a4838',
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
        fog: false,
      });
      group.add(new THREE.Mesh(new THREE.SphereGeometry(cell.radius * 0.6, 20, 12), innerMat));
      const rings: THREE.Mesh[] = [];
      for (let k = 0; k < 2; k++) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(cell.radius * (0.8 - k * 0.22), 0.7, 6, 48),
          new THREE.MeshBasicMaterial({ color: 0xc9d0ff, transparent: true, opacity: 0.45, depthWrite: false, fog: false }),
        );
        rings.push(ring);
        group.add(ring);
      }
      // The arrow says which way the air is going: down is the dangerous one.
      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(cell.radius * 0.22, cell.radius * 0.5, 12),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, fog: false }),
      );
      arrow.rotation.x = down ? Math.PI : 0;
      group.add(arrow);
      this.cellRoot.add(group);
      this.cellModels.push({ group, outer: outerMat, rings, phase: cell.phase });
    }
    this.obstaclesRef = w.obstacles;
  }

  private updateObstacles(w: World): void {
    const blink = Math.floor(w.time * 2) % 2 === 0;
    for (const lamp of this.spireLamps) (lamp.material as THREE.MeshBasicMaterial).color.set(blink ? '#ff5a3a' : '#6a2214');
    w.obstacles.cells.forEach((cell, i) => {
      const m = this.cellModels[i];
      if (!m) return;
      const ctr = cellCenter(w, cell);
      m.group.position.set(ctr.x, ctr.y, 0);
      m.rings[0].rotation.set(Math.PI / 2 + 0.35, w.time * 1.4 + m.phase, 0);
      m.rings[1].rotation.set(Math.PI / 2 - 0.5, -w.time * 1.9 + m.phase, 0.4);
      // An occasional flicker, like lightning inside the cloud.
      m.outer.opacity = 0.27 + 0.18 * Math.max(0, Math.sin(w.time * 5 + m.phase)) ** 8;
    });
  }

  private rebuildTargets(w: World): void {
    for (const t of this.targets) {
      this.targetRoot.remove(t.group);
      for (const m of t.materials) m.dispose();
    }
    this.targets = w.science.targets.map((t) => {
      const ins = INSTRUMENTS[t.kind];
      const color = new THREE.Color(ins.color);
      const group = new THREE.Group();
      const materials: THREE.Material[] = [];
      const groundY = w.terrain.heightAt(t.x);
      let spinner: THREE.Object3D | null = null;
      if (ins.landing) {
        const ringMat = unlit(color, { transparent: true });
        const beamMat = unlit(color, { transparent: true, opacity: 0.3, depthWrite: false });
        const gemMat = unlit(color, { transparent: true });
        materials.push(ringMat, beamMat, gemMat);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(TARGET_RADIUS, 0.28, 8, 48), ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = groundY + 0.3;
        group.add(ring);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 9, 8), beamMat);
        beam.position.y = groundY + 4.5;
        group.add(beam);
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1.7), gemMat);
        gem.scale.y = 1.4;
        gem.position.y = groundY + 10.5;
        group.add(gem);
        spinner = gem;
        group.userData.ring = ringMat;
      } else {
        const boxMat = new THREE.LineDashedMaterial({ color, dashSize: 1.4, gapSize: 1, transparent: true, fog: false });
        const dotMat = unlit(color, { transparent: true });
        materials.push(boxMat, dotMat);
        const height = PHOTO_MAX_AGL - PHOTO_MIN_AGL;
        const box = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(PHOTO_RADIUS * 2, height, PHOTO_RADIUS * 2)),
          boxMat,
        );
        box.computeLineDistances();
        box.position.y = groundY + PHOTO_MIN_AGL + height / 2;
        group.add(box);
        const lens = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.18, 8, 24), dotMat);
        lens.position.y = box.position.y;
        group.add(lens);
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), dotMat);
        core.position.y = box.position.y;
        group.add(core);
        spinner = lens;
      }
      group.position.x = t.x;
      this.targetRoot.add(group);
      return { group, materials, spinner, landing: ins.landing, groundY };
    });
    this.targetsRef = w.science.targets;
  }

  private baseBuilt = false;
  private buildBase(): void {
    const g = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(24, 0.6, 12), new THREE.MeshLambertMaterial({ color: '#6e6e6e' }));
    slab.position.y = -0.26;
    g.add(slab);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(PAD_BULLSEYE * 2, 0.06, 8), new THREE.MeshLambertMaterial({ color: '#ffd27a' }));
    eye.position.y = 0.06;
    g.add(eye);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(PAD_BULLSEYE * 2 - 2, 0.06, 6), new THREE.MeshLambertMaterial({ color: '#3a3a3a' }));
    inner.position.y = 0.09;
    g.add(inner);
    for (const x of [-12, 12]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 5, 8), new THREE.MeshLambertMaterial({ color: '#ffd27a' }));
      pole.position.set(x, 2.5, 0);
      g.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), unlit('#ff5a3a'));
      lamp.position.set(x, 5.3, 0);
      g.add(lamp);
      this.baseLights.push(lamp);
    }
    this.scene.add(g);
    this.baseBuilt = true;
  }

  draw(w: World, hud = true): void {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const cw = Math.floor(this.overlay.clientWidth * dpr);
    const ch = Math.floor(this.overlay.clientHeight * dpr);
    if (cw !== this.width || ch !== this.height) {
      this.width = cw;
      this.height = ch;
      this.overlay.width = cw;
      this.overlay.height = ch;
      this.gl.setPixelRatio(dpr);
      this.gl.setSize(this.overlay.clientWidth, this.overlay.clientHeight, false);
      this.camera.aspect = cw / Math.max(1, ch);
      this.camera.updateProjectionMatrix();
    }
    if (!this.baseBuilt) this.buildBase();

    const dt = Math.min(0.1, Math.max(0, w.time - this.lastTime));
    this.lastTime = w.time;
    const c = w.craft;

    if (this.targetsRef !== w.science.targets) this.rebuildTargets(w);
    if (this.obstaclesRef !== w.obstacles) this.rebuildObstacles(w);
    if (this.terrainRef !== w.terrain) {
      this.terrainRef = w.terrain;
      this.snapX = Number.NaN;
    }

    // Camera follows the craft with a little lead, as in the 2D view; distance sets how much of the world fits.
    this.viewH += (this.targetViewH(w) - this.viewH) * (1 - Math.exp(-2 * Math.max(dt, 1 / 60)));
    const targetX = c.x + c.vx * 0.5;
    const targetY = Math.max(c.y + 6, w.terrain.heightAt(c.x) + this.viewH * 0.35);
    const k = 1 - Math.exp(-5 * Math.max(dt, 1 / 60));
    this.camX += (targetX - this.camX) * k;
    this.camY += (targetY - this.camY) * k;
    const dist = this.viewH / 2 / Math.tan((FOV_DEG * Math.PI) / 360);
    // Turbulence shakes the view.
    const shake = w.turbulence;
    const shx = shake > 0.02 ? (Math.sin(w.time * 53) + Math.sin(w.time * 31.7)) * 0.012 * this.viewH * shake : 0;
    const shy = shake > 0.02 ? (Math.sin(w.time * 47) + Math.sin(w.time * 29.3)) * 0.012 * this.viewH * shake : 0;
    this.camera.position.set(
      this.camX + shx - Math.sin(CAM_YAW) * Math.cos(CAM_PITCH) * dist,
      this.camY + shy + Math.sin(CAM_PITCH) * dist,
      Math.cos(CAM_YAW) * Math.cos(CAM_PITCH) * dist,
    );
    this.camera.lookAt(this.camX + shx, this.camY + shy, 0);

    // Terrain grid recenters on a lattice so vertices stay put in the world.
    const snap = Math.round(this.camX / GRID_DX) * GRID_DX;
    if (snap !== this.snapX) {
      this.snapX = snap;
      this.updateTerrain(w, snap);
    }
    this.terrainMesh.position.x = snap;

    this.updateAtmosphere(w, dist);
    this.updateCraft(w, dt);
    this.updateCanopy(w, dt);
    this.updateTargets(w, dt);
    this.updateObstacles(w);
    this.updateEffects(w, dt);
    for (let i = 0; i < this.baseLights.length; i++) {
      (this.baseLights[i].material as THREE.MeshBasicMaterial).color.set(Math.floor(w.time * 2) % 2 === 0 ? '#ff5a3a' : '#6a2214');
    }

    this.gl.render(this.scene, this.camera);

    // Overlay: clear, then labels and HUD.
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    this.drawLabels(w, cw, ch);
    if (hud) drawHud(ctx, w, cw, ch, this.keyHints);
  }

  /** Sky gradient, fog, and sun/ambient light follow the time of day, haze and rain. */
  private updateAtmosphere(w: World, dist: number): void {
    const light = daylight(clockOf(w));
    const dark = 1 - light;
    const weather = weatherActive(w);
    const rain = weather ? rainAt(w.level.zones, w.craft.x, w.time) : 0;
    const haze = weather ? hazeAt(w.level.zones, w.craft.x, w.time) : 0;

    const key = `${dark.toFixed(2)}|${rain.toFixed(2)}`;
    if (key !== this.skyKey) {
      this.skyKey = key;
      const g = this.skyCanvas.getContext('2d');
      if (g) {
        const grad = g.createLinearGradient(0, 0, 0, 128);
        for (let i = 0; i < 3; i++) {
          const c = mix(DAY_SKY[i], NIGHT_SKY[i], dark).lerp(tmpB.set('#7a7468'), rain * 0.35);
          grad.addColorStop(i / 2, c.getStyle());
        }
        g.fillStyle = grad;
        g.fillRect(0, 0, 2, 128);
        this.skyTexture.needsUpdate = true;
      }
    }

    const horizon = mix(DAY_SKY[1], NIGHT_SKY[1], dark).lerp(tmpB.set('#6e685c'), rain * 0.4);
    this.fog.color.copy(horizon);
    // Haze pulls the fog in close enough to veil the ground; rain thins the far distance.
    this.fog.near = dist * (1.5 - 1.15 * haze);
    this.fog.far = (dist * 1.5 + 900 * (1 - haze) + 120) * (1 - 0.45 * rain);

    this.sun.intensity = 0.1 + 2.3 * light;
    this.sun.color.set(mix('#ffd9a0', '#6a78b8', dark));
    this.hemi.intensity = 0.4 + 0.9 * light;
    this.hemi.color.set(mix('#e8b070', '#222a50', dark));
    this.hemi.groundColor.set(mix('#4a2c14', '#0c0a14', dark));

    // Lights of the craft and the pad matter after dark.
    this.craftLight.position.set(w.craft.x, w.craft.y + 1, 14);
    this.craftLight.intensity = dark * 900;
    this.padLight.position.set(0, 6, 12);
    this.padLight.intensity = dark * 700;
  }

  private updateCraft(w: World, dt: number): void {
    const c = w.craft;
    const m = this.craft;
    const crashed = w.status === 'crashed';
    m.group.position.set(c.x, c.y, 0);
    m.group.rotation.z = -c.pitch;
    const targetYaw = c.facing === 1 ? 0 : Math.PI;
    this.yaw += (targetYaw - this.yaw) * (1 - Math.exp(-9 * Math.max(dt, 1 / 60)));
    m.group.rotation.y = this.yaw;
    m.body.color.set(crashed ? '#55555a' : '#d9d9d9');
    const throttle = crashed ? 0 : c.throttle;
    for (const d of m.discs) d.opacity = crashed ? 0 : 0.06 + 0.5 * clamp(throttle * 1.6, 0, 1);
    m.blades.forEach((b) => {
      b.rotation.y = crashed ? b.rotation.y : c.rotorPhase * 3 * b.userData.dir;
    });
    for (const mat of m.bladeMats) {
      mat.transparent = true;
      mat.opacity = crashed ? 1 : clamp(1 - throttle * 3, 0.15, 1);
    }
  }

  private updateCanopy(w: World, dt: number): void {
    const c = w.craft;
    if (this.lastPhase === 'chute' && w.phase === 'spinup') {
      this.canopyFree = { x: c.x, y: c.y + 9, vx: c.vx - 4, vy: -18, age: 0 };
    }
    this.lastPhase = w.phase;
    const g = this.canopyGroup;
    if (w.phase === 'chute') {
      g.visible = true;
      const cx = c.x + c.pitch * 12;
      g.position.set(cx, c.y + 9, 0);
      this.canopyMats.forEach((m) => ((m as THREE.Material).opacity = m instanceof THREE.LineBasicMaterial ? 0.7 : 1));
      this.canopyLines.visible = true;
      const pos = this.canopyLines.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        pos.setXYZ(i * 2, Math.cos(a) * 7.5, 0, Math.sin(a) * 7.5);
        pos.setXYZ(i * 2 + 1, c.x - cx + Math.cos(a) * 0.9, c.y - (c.y + 9) + 0.8, Math.sin(a) * 0.9);
      }
      pos.needsUpdate = true;
    } else if (this.canopyFree) {
      const f = this.canopyFree;
      f.age += dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      g.visible = f.age < 6;
      g.position.set(f.x, f.y, 0);
      this.canopyLines.visible = false;
      const fade = Math.max(0, 1 - f.age / 6);
      this.canopyMats.forEach((m) => ((m as THREE.Material).opacity = fade));
      if (f.age >= 6) this.canopyFree = null;
    } else {
      g.visible = false;
    }
  }

  private updateTargets(w: World, dt: number): void {
    const pulse = 0.65 + 0.35 * Math.sin(w.time * 4);
    w.science.targets.forEach((t, i) => {
      const m = this.targets[i];
      if (!m) return;
      const base = t.collected ? 0.28 : 1;
      m.materials.forEach((mat, j) => {
        const anyMat = mat as THREE.Material & { opacity: number };
        // The first material of each kind is the pulsing outline; the rest are solid or faint.
        anyMat.opacity = j === 0 ? base * pulse : j === 1 && m.landing ? base * 0.3 : base;
      });
      if (m.spinner) {
        m.spinner.rotation.y += dt * 1.6;
        if (m.landing) m.spinner.position.y = m.groundY + 10.5 + Math.sin(w.time * 2.4 + i) * 0.6;
      }
    });
  }

  /** Thrown-up dust near the ground, rain and wind streaks. */
  private updateEffects(w: World, dt: number): void {
    const c = w.craft;
    const agl = altitudeAGL(w);
    if (w.status !== 'crashed' && agl < 12 && c.throttle > 0.15 && dt > 0) {
      const strength = c.throttle * (1 - agl / 12);
      const n = Math.floor(strength * 4 + Math.random());
      const gy = w.terrain.heightAt(c.x);
      for (let i = 0; i < n && this.dust.length < 150; i++) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        this.dust.push({
          x: c.x + (Math.random() - 0.5) * 2,
          y: gy + 0.3,
          z: (Math.random() - 0.5) * 3,
          vx: dir * (2 + Math.random() * 5 * strength),
          vy: 0.3 + Math.random() * 1.2,
          life: 1,
        });
      }
    }
    const dp = this.dustPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (const d of this.dust) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vx *= Math.exp(-1.2 * dt);
      d.life -= dt * 0.9;
    }
    this.dust = this.dust.filter((d) => d.life > 0);
    for (let i = 0; i < 150; i++) {
      const d = this.dust[i];
      if (d) dp.setXYZ(i, d.x, d.y, d.z);
      else dp.setXYZ(i, 0, -9999, 0);
    }
    dp.needsUpdate = true;

    const weather = weatherActive(w);
    const rain = weather ? rainAt(w.level.zones, this.camX, w.time) : 0;
    const rp = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
    this.rain.visible = rain > 0.02;
    if (this.rain.visible) {
      (this.rain.material as THREE.LineBasicMaterial).opacity = rain * 0.5;
      const count = rp.count / 2;
      const live = Math.floor(count * rain);
      for (let i = 0; i < count; i++) {
        if (i >= live) {
          rp.setXYZ(i * 2, 0, -9999, 0);
          rp.setXYZ(i * 2 + 1, 0, -9999, 0);
          continue;
        }
        const hx = frac(Math.sin(i * 12.9898) * 43758.5453);
        const hy = frac(Math.sin(i * 78.233) * 12345.678);
        const hz = frac(Math.sin(i * 39.346) * 24634.6345);
        const x = this.camX + (hx * 2 - 1) * 170;
        const y = this.camY + (frac(hy - w.time * 1.0) * 2 - 1) * 85;
        const z = -30 + hz * 170;
        rp.setXYZ(i * 2, x, y, z);
        rp.setXYZ(i * 2 + 1, x - 1.4, y - 6, z);
      }
      rp.needsUpdate = true;
    }

    const gust = weather ? gustAt(w.level.gust, w.time) : gustAt(null, 0);
    const wp = this.wind.geometry.getAttribute('position') as THREE.BufferAttribute;
    this.wind.visible = gust.blow > 0.05;
    if (this.wind.visible) {
      (this.wind.material as THREE.LineBasicMaterial).opacity = gust.blow * 0.55;
      const count = wp.count / 2;
      for (let i = 0; i < count; i++) {
        const hx = frac(Math.sin(i * 39.346) * 43758.5453);
        const hy = frac(Math.sin(i * 11.135) * 12345.678);
        const hz = frac(Math.sin(i * 5.7) * 24634.6345);
        const u = frac(hx + gust.dir * w.time * 0.7);
        const x = this.camX + (u * 2 - 1) * 230;
        const y = this.camY + (hy * 2 - 1) * 70;
        const z = -20 + hz * 150;
        const len = 14 + hz * 30;
        wp.setXYZ(i * 2, x, y, z);
        wp.setXYZ(i * 2 + 1, x - gust.dir * len, y, z);
      }
      wp.needsUpdate = true;
    }
  }

  /** Project a world point (flight plane) to canvas pixels, or null if it is behind the camera. */
  private project(x: number, y: number, cw: number, ch: number): { x: number; y: number } | null {
    this.projected.set(x, y, 0).project(this.camera);
    if (this.projected.z > 1) return null;
    return { x: (this.projected.x * 0.5 + 0.5) * cw, y: (-this.projected.y * 0.5 + 0.5) * ch };
  }

  /** Target names, progress bars and the LZ tag, positioned over their 3D markers. */
  private drawLabels(w: World, cw: number, ch: number): void {
    const ctx = this.ctx;
    const u = Math.max(10, ch / 50);
    ctx.textAlign = 'center';
    ctx.font = `bold ${Math.round(u * 1.05)}px monospace`;
    for (const t of w.science.targets) {
      const ins = INSTRUMENTS[t.kind];
      const gy = w.terrain.heightAt(t.x);
      const top = ins.landing ? gy + 14 : gy + PHOTO_MAX_AGL + 3;
      const p = this.project(t.x, top, cw, ch);
      if (!p || p.x < -100 || p.x > cw + 100) continue;
      ctx.globalAlpha = t.collected ? 0.4 : 1;
      ctx.fillStyle = ins.color;
      ctx.fillText(t.collected ? `${ins.label} ✓` : ins.label, p.x, p.y);
      if (t.progress > 0 && !t.collected) {
        const bw = u * 7;
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(20,10,0,0.6)';
        ctx.fillRect(p.x - bw / 2, p.y - u * 2, bw, u * 0.7);
        ctx.fillStyle = ins.color;
        ctx.fillRect(p.x - bw / 2, p.y - u * 2, bw * t.progress, u * 0.7);
      }
      ctx.globalAlpha = 1;
    }
    const lz = this.project(0, 7.5, cw, ch);
    if (lz) {
      ctx.fillStyle = '#e6e6e6';
      ctx.fillText('LZ', lz.x, lz.y);
    }
  }
}
