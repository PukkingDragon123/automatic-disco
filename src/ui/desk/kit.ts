// Shared bits for the desk's parts: cached material textures, interactive "hot" objects, dynamic decals, springs.
import * as THREE from 'three';
import { mat, tex, quad, type DeskMat, type MatOpts } from './gfx';
import { swatch, Pix } from './paint';

type Sw = Parameters<typeof swatch>[0];
const TEX = new Map<string, THREE.Texture>();
export function swTex(name: Sw) { let t = TEX.get(name); if (!t) TEX.set(name, (t = tex(swatch(name), true))); return t; }
/** a fresh material on a material swatch (fresh so hover lighting stays per object) */
export function M(name: Sw, o: MatOpts = {}): DeskMat { return mat({ map: swTex(name), ...o }); }
/** a decal material from a painted Pix (alpha-cut) */
export function D(p: Pix | THREE.Texture, o: MatOpts = {}): DeskMat { return mat({ map: p instanceof THREE.Texture ? p : tex(p), ...o }); }
/** a decal quad sized to its texture (one texel per art pixel), lying in a parent's XY plane a hair in front */
export function decal(p: Pix, o: MatOpts = {}, scale = 1) {
  const m = new THREE.Mesh(quad(p.w * scale, p.h * scale), D(p, { flat: 0.55, ...o }));
  m.position.z = 0.35;
  return m;
}

/** a decal whose pixels are redrawn (screens, readouts): paint into `p`, then call flush() */
export class LiveDecal {
  readonly p: Pix; readonly cv: HTMLCanvasElement; readonly tex: THREE.CanvasTexture; readonly mesh: THREE.Mesh; readonly mat: DeskMat;
  private g: CanvasRenderingContext2D; key = '';
  constructor(w: number, h: number, o: MatOpts = {}) {
    this.p = new Pix(w, h);
    this.cv = document.createElement('canvas'); this.cv.width = w; this.cv.height = h;
    this.g = this.cv.getContext('2d')!;
    this.tex = tex(this.cv);
    this.mat = mat({ map: this.tex, flat: 1, ...o });
    this.mesh = new THREE.Mesh(quad(w, h), this.mat);
    this.mesh.position.z = 0.35;
  }
  clear(c?: number) { this.p.d.fill(0); if (c !== undefined) this.p.rect(0, 0, this.p.w, this.p.h, c); }
  flush() { this.g.putImageData(this.p.image(), 0, 0); this.tex.needsUpdate = true; }
}

/** something on the desk that answers the pointer */
export interface Hot {
  obj: THREE.Object3D;
  /** the typed tag over it */
  name: string;
  /** a longer tooltip */
  tip?: () => string;
  key?: string;
  click?: (h: HitInfo) => void;
  /** drag handling (a drag that does not move is a click) */
  drag?: { down?(h: HitInfo): void; move(h: HitInfo, dx: number, dy: number): void; up?(h: HitInfo): void };
  wheel?: (dy: number, h: HitInfo) => void;
  /** lifts and lights on hover */
  lift?: THREE.Object3D; liftBy?: number;
  mats?: DeskMat[];
  /** hover state (0..1 eased) */
  hv?: number;
  /** disabled lamps the tag in red */
  off?: () => string | false;
  /** right-click */
  alt?: (h: HitInfo) => void;
  /** a press animation */
  press?: number;
}
export interface HitInfo { point: THREE.Vector3; local: THREE.Vector3; obj: THREE.Object3D; x: number; y: number; button: number; shift: boolean }

/** collect every material under an object (for hover lighting) */
export function matsOf(o: THREE.Object3D): DeskMat[] {
  const out: DeskMat[] = [];
  o.traverse((m) => { const mm = (m as THREE.Mesh).material as DeskMat | undefined; if (mm && (mm as DeskMat).uniforms?.uHover && !out.includes(mm)) out.push(mm); });
  return out;
}

/** a damped spring toward a target (value, velocity) */
export class Spring {
  v = 0; x: number;
  constructor(x = 0, public k = 160, public d = 14) { this.x = x; }
  step(target: number, dt: number) { const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n; for (let i = 0; i < n; i++) { this.v += (this.k * (target - this.x) - this.d * this.v) * h; this.x += this.v * h; } return this.x; }
  kick(v: number) { this.v += v; }
}
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const DEG = Math.PI / 180;
