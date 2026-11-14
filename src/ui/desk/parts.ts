// The desk's instruments, built in art-pixel units on a panel face (x right, y up the face, z out of it). Each one is
// a small real model: rolling counter wheels behind a bezel, needle gauges under glass, the reactor's core in a dome,
// the four resource vessels (an ore hopper filling with nuggets, a furnace window, a water tube that sloshes, a soil
// scale), the power drum and its FIRE plunger, the MODE selector, levers and alarm beacons.
import * as THREE from 'three';
import { mat, tex, box, cyl, lathe, quad, mesh, facet, type DeskMat } from './gfx';
import { M, D, decal, LiveDecal, Spring, clamp01, DEG } from './kit';
import { R, digitBand, gaugeFace, glassStreak, label, text5, textW5, text3s, textW3s, iconPix, Pix } from './paint';

// ------------------------------------------------------------------ counter wheels
const CELL = 8, WR = (CELL * 10) / (Math.PI * 2);
let bandTex: THREE.Texture | null = null;
function wheelGeo() {
  const S = 20, w = 7, pos: number[] = [], uv: number[] = [];
  for (let i = 0; i < S; i++) {
    const a0 = (i / S) * Math.PI * 2, a1 = ((i + 1) / S) * Math.PI * 2;
    const p = (a: number, x: number) => [x, WR * Math.sin(a), WR * Math.cos(a)];
    const v0 = i / S, v1 = (i + 1) / S;
    const A = p(a0, -w / 2), B = p(a0, w / 2), C = p(a1, w / 2), Dd = p(a1, -w / 2);
    pos.push(...A, ...B, ...C, ...A, ...C, ...Dd);
    uv.push(0, v0, 1, v0, 1, v1, 0, v0, 1, v1, 0, v1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
let WG: THREE.BufferGeometry | null = null;
/** n rolling number wheels behind a steel bezel; set() rolls them, carrying like the real thing */
export class Counter {
  readonly root = new THREE.Group();
  private wheels: THREE.Mesh[] = []; private ang: number[] = []; private tgt: number[] = [];
  readonly bezel: DeskMat;
  value = -1;
  constructor(readonly n: number) {
    if (!bandTex) bandTex = tex(digitBand(CELL));
    WG ??= wheelGeo();
    const m = mat({ map: bandTex, flat: 0.55 });
    for (let i = 0; i < n; i++) {
      const w = new THREE.Mesh(WG, m);
      w.position.set((i - (n - 1) / 2) * 7, 0, -WR + 1.4);
      this.root.add(w); this.wheels.push(w); this.ang.push(0); this.tgt.push(0);
    }
    // the bezel: four bars round the window, a hair proud of the wheels
    this.bezel = M('steel', { spec: 1 });
    const W = n * 7 + 2;
    this.root.add(mesh(box(W + 2, 2, 3), this.bezel, 0, 5.5, 0.6), mesh(box(W + 2, 2, 3), this.bezel, 0, -5.5, 0.6), mesh(box(2, 13, 3), this.bezel, -W / 2, 0, 0.6), mesh(box(2, 13, 3), this.bezel, W / 2, 0, 0.6));
    for (let i = 1; i < n; i++) this.root.add(mesh(box(0.6, 9, 1.4), M('rubber'), (i - n / 2) * 7, 0, 0.6));
  }
  set(v: number) {
    v = Math.max(0, Math.floor(v)); if (v === this.value) return; this.value = v;
    const top = 10 ** this.n - 1, s = String(Math.min(top, v)).padStart(this.n, '0');
    for (let i = 0; i < this.n; i++) {
      const d = +s[i], cur = this.tgt[i], base = Math.floor(cur / (Math.PI * 2)) * Math.PI * 2;
      let t = base + ((d + 0.5) / 10) * Math.PI * 2;
      if (t < cur - 1e-3) t += Math.PI * 2; // always roll forward
      this.tgt[i] = t;
    }
  }
  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      const d = this.tgt[i] - this.ang[i];
      this.ang[i] += Math.sign(d) * Math.min(Math.abs(d), dt * (2 + Math.abs(d) * 8));
      // the wheels click into place: snap the last fraction of a cell
      const cellA = (Math.PI * 2) / 10, q = this.ang[i] / cellA;
      const shown = Math.abs(d) < 0.02 ? this.ang[i] : (Math.floor(q) + Math.min(1, (q % 1) * 1.6)) * cellA;
      this.wheels[i].rotation.x = shown;
    }
  }
}

// ------------------------------------------------------------------ needle gauge
export class Gauge {
  readonly root = new THREE.Group();
  readonly needle = new THREE.Group();
  private sp = new Spring(0, 90, 9);
  private val = 0;
  readonly mark: THREE.Mesh;
  marked = -1;
  constructor(readonly Dm: number, private a0: number, private a1: number, o: { ticks: number; red?: [number, number]; word?: string }) {
    const r = Dm / 2;
    this.root.add(mesh(lathe([[r + 2.6, 0], [r + 2.6, 1.6], [r + 1.2, 2.4], [r, 1.4]], 14, 64).rotateX(Math.PI / 2), M('steel', { spec: 1 })));
    const f = decal(gaugeFace(Dm, { a0, a1, ...o }), { flat: 0.7 }); f.position.z = 0.4; this.root.add(f);
    // needle: a thin blade with a counterweight, on a brass boss
    const nm = mat({ tint: R.stampRed[3], flat: 0.4 });
    this.needle.add(mesh(box(1, r - 1.5, 0.6), nm, 0, (r - 1.5) / 2, 0), mesh(box(1.6, 3, 0.6), mat({ tint: R.ink[1] }), 0, -1.2, 0));
    this.needle.position.z = 1;
    this.root.add(this.needle, mesh(cyl(1.4, 1.4, 1.2, 8).rotateX(Math.PI / 2), M('brass', { spec: 1 }), 0, 0, 1.4));
    // an amber index on the rim (the cost of the chosen power, on the charge gauge)
    this.mark = mesh(box(1.4, 2.6, 0.8), mat({ tint: R.glowAmber[3], emit: 0.3, flat: 0.6 }));
    this.mark.visible = false; this.root.add(this.mark);
    const gl = new THREE.Mesh(new THREE.CircleGeometry(r + 0.6, 14), mat({ map: tex(glassStreak(Dm + 2, Dm + 2)), glass: 0.55, flat: 1 }));
    gl.position.z = 2.2; this.root.add(gl);
  }
  set(v: number) { this.val = clamp01(v); }
  kick(v: number) { this.sp.kick(v); }
  setMark(f: number | null) {
    if (f === null) { this.mark.visible = false; return; }
    const a = this.a0 + (this.a1 - this.a0) * clamp01(f), r = this.Dm / 2 + 1.2;
    this.mark.visible = true; this.mark.position.set(Math.sin(a) * r, Math.cos(a) * r, 1.6); this.mark.rotation.z = -a;
  }
  update(dt: number) {
    const x = this.sp.step(this.val, dt);
    this.needle.rotation.z = -(this.a0 + (this.a1 - this.a0) * Math.max(-0.04, Math.min(1.04, x)));
  }
}

// ------------------------------------------------------------------ reactor dome
export class Reactor {
  readonly root = new THREE.Group();
  private core: THREE.Mesh; private cm: DeskMat; private t = 0;
  level = 0; hot = 0;
  constructor() {
    this.root.add(mesh(lathe([[7.5, 0], [7.5, 1.5], [6.5, 2.5], [6.5, 3.5]], 10), M('brass', { spec: 1 })));
    this.cm = mat({ tint: R.glowTeal[3], emit: 0.4, flat: 0.3 });
    this.core = mesh(facet(new THREE.IcosahedronGeometry(3.4, 0)), this.cm, 0, 7, 0);
    this.root.add(this.core);
    this.root.add(mesh(cyl(1.2, 1.6, 4, 6), M('steel'), 0, 4.5, 0));
    const pts: [number, number][] = []; for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; pts.push([Math.cos(a) * 6.4, 3.5 + Math.sin(a) * 8]); }
    const dome = mesh(lathe(pts, 10), mat({ map: tex(glassStreak(40, 16)), glass: 0.45, flat: 0.6 }));
    this.root.add(dome);
    this.root.rotation.x = Math.PI / 2; // stands out of the panel face
  }
  update(dt: number) {
    this.t += dt * (1.2 + this.level * 3);
    this.hot = Math.max(0, this.hot - dt);
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 2.4);
    this.cm.uniforms.uEmit.value = 0.15 + this.level * 0.75 * (0.7 + 0.3 * pulse) + this.hot;
    this.core.rotation.y += dt * (0.6 + this.level * 2.5); this.core.rotation.x += dt * 0.4;
    this.core.scale.setScalar(0.85 + this.level * 0.3 + pulse * 0.06);
  }
}

// ------------------------------------------------------------------ resource vessels
export type ResKind = 'ore' | 'carbon' | 'water' | 'soil';
/** the instrument that shows how full one hold is */
export class Vessel {
  readonly root = new THREE.Group();
  private f = 0; private sp = new Spring(0, 60, 6); private t = 0;
  private nug?: THREE.InstancedMesh; private nugPos: THREE.Vector3[] = [];
  private glow?: DeskMat; private liquid?: THREE.Mesh; private surf?: THREE.Group; private pan?: THREE.Group; private heap?: THREE.Mesh;
  constructor(readonly kind: ResKind) {
    const g = this.root;
    if (kind === 'ore') {
      // a riveted steel hopper with a glass front: the ore piles up inside in nuggets
      const sm = M('steel');
      g.add(mesh(box(14, 1.4, 6), sm, 0, -7, 2), mesh(box(1.4, 15, 6), sm, -7, 0, 2), mesh(box(1.4, 15, 6), sm, 7, 0, 2), mesh(box(14, 15, 0.8), M('rubber'), 0, 0, -0.6));
      g.add(mesh(box(16, 2, 7), M('olive'), 0, 8, 2.2));
      const n = 18;
      this.nug = new THREE.InstancedMesh(facet(new THREE.IcosahedronGeometry(1.7, 0)), mat({ spec: 1 }), n);
      const cols = [R.copper[4], R.iron[4], R.copper[3], R.iron[5], R.rust[4]];
      for (let i = 0; i < n; i++) {
        const row = Math.floor(i / 5), col = i % 5;
        this.nugPos.push(new THREE.Vector3(-4.8 + col * 2.4 + (row % 2) * 1.1, -5 + row * 2.6, 2 + ((i * 7) % 3) * 0.6));
        this.nug.setColorAt(i, new THREE.Color(cols[i % cols.length]));
      }
      g.add(this.nug);
      const gl = mesh(quad(13, 14), mat({ map: tex(glassStreak(13, 14)), glass: 0.4, flat: 1 }), 0, 0, 5.1);
      g.add(gl);
    } else if (kind === 'carbon') {
      // a cast-iron furnace door; through its grate the coals glow brighter the fuller the bunker
      const im = M('steel', { tint: 0x8a8a8a });
      g.add(mesh(box(15, 16, 3), im, 0, 0, 1.5));
      const win = new Pix(9, 7);
      for (let y = 0; y < 7; y++) for (let x = 0; x < 9; x++) win.set(x, y, y > 4 ? R.rust[5] : (x + y * 2) % 4 === 0 ? R.ochre[6] : R.rust[4]);
      for (const x of [2, 4, 6]) for (let y = 0; y < 7; y++) win.set(x, y, R.ink[0]);
      this.glow = mat({ map: tex(win), flat: 1, emit: 0 });
      const w = mesh(quad(9, 7), this.glow, 0, 1, 3.1); g.add(w);
      g.add(mesh(box(11, 1.4, 1.4), M('steel', { spec: 1 }), 0, 5.2, 3.4), mesh(box(11, 1.4, 1.4), M('steel', { spec: 1 }), 0, -3.2, 3.4));
      g.add(mesh(cyl(1, 1, 5, 6).rotateZ(Math.PI / 2), M('brass', { spec: 1 }), 4, -5.6, 3.6)); // the latch
    } else if (kind === 'water') {
      // a sight glass: a brass-capped tube, the water sloshing in it
      const bm = M('brass', { spec: 1 });
      g.add(mesh(cyl(3.2, 3.2, 2, 8), bm, 0, -8, 2), mesh(cyl(3.2, 3.2, 2, 8), bm, 0, 8, 2));
      this.liquid = mesh(cyl(2.2, 2.2, 1, 8), mat({ tint: R.water[4], emit: 0.15, flat: 0.3 }), 0, -7, 2);
      this.liquid.geometry.translate(0, 0.5, 0);
      g.add(this.liquid);
      this.surf = new THREE.Group();
      this.surf.add(mesh(cyl(2.25, 2.25, 0.8, 8), mat({ tint: R.water[6], emit: 0.2, flat: 0.4 })));
      g.add(this.surf);
      g.add(mesh(cyl(2.7, 2.7, 14, 8, 64, false), mat({ map: tex(glassStreak(20, 14)), glass: 0.35, flat: 0.7, side: THREE.DoubleSide }), 0, 0, 2));
      g.add(mesh(box(1, 14, 0.8), M('steel'), 3.8, 0, 1.2)); // a scale bar
    } else {
      // a little platform scale: a pan on a stem, a heap of soil, the beam swinging down as it fills
      const sm = M('steel', { spec: 1 });
      g.add(mesh(box(14, 2, 6), M('olive'), 0, -8, 2), mesh(cyl(1, 1, 8, 6), sm, 0, -4, 2));
      this.pan = new THREE.Group();
      this.pan.add(mesh(cyl(6.5, 5, 1.6, 10), sm));
      this.heap = mesh(lathe([[5, 0], [3.8, 1.6], [2, 3], [0.3, 3.8]], 8), M('wood', { tint: 0x9a7a5a }), 0, 0.8, 0);
      this.pan.add(this.heap);
      this.pan.position.set(0, 0, 2);
      g.add(this.pan);
    }
  }
  set(f: number) { this.f = clamp01(f); }
  kick(v: number) { this.sp.kick(v); }
  update(dt: number) {
    this.t += dt;
    const f = this.f, wob = this.sp.step(0, dt);
    if (this.nug) {
      const n = Math.round(f * this.nugPos.length), m = new THREE.Matrix4(), q = new THREE.Quaternion();
      for (let i = 0; i < this.nugPos.length; i++) {
        const s = i < n ? 1 : 0, p = this.nugPos[i];
        q.setFromEuler(new THREE.Euler(i * 1.3, i * 0.7 + wob * 0.2, i * 2.1));
        m.compose(new THREE.Vector3(p.x + wob * 0.4 * (i % 2 ? 1 : -1), p.y, p.z), q, new THREE.Vector3(s, s, s));
        this.nug.setMatrixAt(i, m);
      }
      this.nug.instanceMatrix.needsUpdate = true;
    }
    if (this.glow) this.glow.uniforms.uEmit.value = f > 0 ? 0.15 + f * 0.9 + Math.sin(this.t * 9) * 0.06 * f + Math.sin(this.t * 23) * 0.04 : -0.6;
    if (this.liquid && this.surf) {
      const h = 0.4 + f * 13;
      this.liquid.scale.y = h; this.surf.position.set(0, -7 + h, 2);
      this.surf.rotation.z = wob * 0.5 + Math.sin(this.t * 7) * 0.05 * Math.min(1, Math.abs(wob) * 4);
    }
    if (this.pan && this.heap) {
      this.pan.position.y = 2.5 - f * 3 + wob * 0.6;
      this.heap.scale.set(0.3 + f * 0.75, 0.05 + f, 0.3 + f * 0.75); this.heap.visible = f > 0.01;
    }
  }
}

// ------------------------------------------------------------------ the power drum
/** a steel reel lying across the panel; the installed powers sit in it as brass cartridges pointing out, their
 *  engraved caps facing the operator one at a time. It turns on its axle under a sprung pawl. */
export class Drum {
  readonly root = new THREE.Group();
  readonly reel = new THREE.Group();
  private carts: { g: THREE.Group; cap: DeskMat; body: DeskMat; out: number; sp: Spring; ax: THREE.Vector3 }[] = [];
  readonly hitMesh: THREE.Mesh;
  readonly pawl = new THREE.Group();
  private pawlK = 0;
  static R = 13;
  constructor() {
    const r = Drum.R;
    // the axle frame: two Bakelite cheeks on steel feet
    for (const s of [-1, 1]) {
      this.root.add(mesh(box(3, 2 * r + 4, 6), M('bake', { spec: 1 }), s * 15.5, 0, -1));
      this.root.add(mesh(cyl(3, 3, 3, 8).rotateZ(Math.PI / 2), M('steel', { spec: 1 }), s * 15.5, 0, 3));
    }
    this.root.add(mesh(box(34, 3, 10), M('steel'), 0, -r - 2.5, -2));
    // the reel itself: a faceted steel barrel with knurled Bakelite end rings
    this.reel.add(mesh(cyl(r - 4, r - 4, 26, 12).rotateZ(Math.PI / 2), M('steel', { spec: 1 })));
    for (const s of [-1, 1]) this.reel.add(mesh(cyl(r - 1, r - 1, 2, 16).rotateZ(Math.PI / 2), M('bake', { spec: 1 }), s * 12.5, 0, 0));
    this.root.add(this.reel);
    this.reel.position.z = 4;
    // an invisible hit cylinder (the drag handle)
    this.hitMesh = mesh(cyl(r + 2, r + 2, 28, 8).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ visible: false }), 0, 0, 4);
    this.root.add(this.hitMesh);
    // the pawl: a hardened steel finger riding on the cartridges from above, on a sprung arm
    this.pawl.add(mesh(box(3, 9, 2), M('steel', { spec: 1 }), 0, 4.5, 0), mesh(box(4, 3, 3), mat({ tint: R.glowAmber[2], spec: 1 }), 0, 0, 0.5));
    this.pawl.position.set(0, r + 5, 8); this.pawl.rotation.x = -0.5;
    this.root.add(this.pawl);
  }
  /** (re)load the cartridges: one per installed power, each capped with its engraved icon */
  load(icons: string[]) {
    for (const c of this.carts) c.g.removeFromParent();
    this.carts = [];
    const n = Math.max(1, icons.length), r = Drum.R;
    icons.forEach((ic, i) => {
      const g = new THREE.Group(), body = M('brass', { spec: 1 }), cap = mat({ map: tex(capArt(ic)), flat: 0.35, spec: 0 });
      g.add(mesh(cyl(4.6, 4.6, 6, 10), body, 0, 3, 0));
      g.add(mesh(cyl(5.4, 5.4, 1.2, 10), body, 0, 6.2, 0)); // the rim
      const face = mesh(new THREE.CircleGeometry(4.4, 10), cap, 0, 6.9, 0); face.rotation.x = -Math.PI / 2; g.add(face);
      const a = (i / n) * Math.PI * 2;
      g.rotation.x = Math.PI / 2 - a; // radial: cartridge i points along +z (toward the operator) when the reel is at angle a
      this.reel.add(g);
      this.carts.push({ g, cap, body, out: 1, sp: new Spring(1, 120, 12), ax: new THREE.Vector3(0, 1, 0).applyEuler(g.rotation) });
      void r;
    });
  }
  /** per chamber: how far the cartridge stands out (0 sunk = recharging .. 1), dim (cannot afford), glow (armed) */
  update(dt: number, ang: number, st: { out: number; dim: boolean; glow: number; front: boolean }[]) {
    this.reel.rotation.x = ang;
    this.carts.forEach((c, i) => {
      const s = st[i]; if (!s) return;
      const o = c.sp.step(s.out, dt);
      // cartridges slide out along their own axis from inside the barrel
      c.g.position.copy(c.ax).multiplyScalar(Drum.R - 10 + o * 3.4);
      c.cap.uniforms.uDim.value = s.dim ? 0.45 : 0; c.body.uniforms.uDim.value = s.dim ? 0.35 : 0;
      (c.cap.uniforms.uGlow.value as THREE.Color).setRGB(s.glow * 0.5, s.glow * 0.33, s.glow * 0.08);
      c.cap.uniforms.uHover.value = s.front ? 0.25 : 0;
    });
    this.pawlK = Math.max(0, this.pawlK - dt * 8);
    this.pawl.rotation.x = -0.5 - this.pawlK * 0.35;
  }
  tick() { this.pawlK = 1; }
}
/** a cartridge cap: brass with the power's vignette engraved in it */
const capCache = new Map<string, Pix>();
function capArt(icon: string) {
  let p = capCache.get(icon); if (p) return p;
  p = new Pix(12, 12);
  p.rect(0, 0, 12, 12, R.brass[2]);
  const ic = iconPix(icon, 10);
  for (let y = 0; y < ic.h; y++) for (let x = 0; x < ic.w; x++) { const a = ic.a(x, y); if (a > 100) p.set(1 + x, 1 + y, ic.get(x, y)); }
  capCache.set(icon, p);
  return p;
}

// ------------------------------------------------------------------ FIRE plunger
export class Plunger {
  readonly root = new THREE.Group();
  readonly cap: DeskMat; private shaft = new THREE.Group(); private sp = new Spring(0, 260, 13); private down = 0;
  constructor() {
    this.root.add(mesh(lathe([[9, 0], [9, 2], [7.5, 3.2], [5, 3.2], [4, 2.6]], 12), M('steel', { spec: 1 })));
    this.cap = mat({ map: undefined, tint: R.stampRed[3], spec: 1 });
    const capG = lathe([[3, 0], [8, 0.6], [8.4, 2], [7.4, 4.2], [4.6, 5.8], [0.1, 6.4]], 12);
    this.shaft.add(mesh(cyl(2.6, 2.6, 8, 8), M('steel', { spec: 1 }), 0, 4, 0), mesh(capG, this.cap, 0, 8, 0));
    this.root.add(this.shaft);
    const lb = decal(label('FIRE', R.bone[4], true), { flat: 0.6 }); lb.position.set(0, -12, 0.6); lb.rotation.x = -Math.PI / 2; lb.position.set(0, 0.2, 12.5);
    this.root.add(lb);
    this.root.rotation.x = Math.PI / 2;
  }
  press() { this.down = 1; this.sp.kick(-30); }
  release() { this.down = 0; }
  update(dt: number, state: 'idle' | 'dead' | 'armed', t: number) {
    const y = this.sp.step(this.down ? -4.5 : 0, dt);
    this.shaft.position.y = y;
    const blink = state === 'armed' ? (Math.floor(t * 3) % 2 ? 0.55 : 0.2) : 0;
    (this.cap.uniforms.uGlow.value as THREE.Color).setRGB(blink * 0.9, blink * 0.4, blink * 0.1);
    this.cap.uniforms.uDim.value = state === 'dead' ? 0.35 : 0;
  }
}

// ------------------------------------------------------------------ MODE selector
export const MODES = ['explore', 'build', 'command', 'bio', 'survey'] as const;
export type Mode = typeof MODES[number];
export const MODE_NAME: Record<Mode, string> = { explore: 'EXPLORE', build: 'BUILD', command: 'COMMAND', bio: 'BIO', survey: 'SURVEY' };
/** a big Bakelite range switch on a printed dial plate: five stops, a lamp at each, the mode's name in a backlit window */
export class ModeKnob {
  readonly root = new THREE.Group();
  readonly knob = new THREE.Group();
  readonly win: LiveDecal;
  private sp = new Spring(0, 140, 11); private lamps: DeskMat[] = [];
  static A = (i: number) => (-2 + i) * 34 * DEG;
  constructor() {
    const plate = new Pix(40, 40), c = 19.5;
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) { const d = Math.hypot(x - c, y - c); if (d < 19.6) plate.set(x, y, d > 18.6 ? R.steel[1] : d > 17.6 ? R.steel[4] : R.steel[2]); }
    for (let i = 0; i < 5; i++) { const a = ModeKnob.A(i); for (let k = 0; k < 3; k++) plate.set(Math.round(c + Math.sin(a) * (16 - k)), Math.round(c - Math.cos(a) * (16 - k)), R.bone[4]); text3s(plate, String(i + 1), Math.round(c + Math.sin(a) * 12.5 - 1), Math.round(c - Math.cos(a) * 12.5 - 2), R.bone[3]); }
    this.root.add(decal(plate, { flat: 0.6, spec: 0 }));
    this.root.children[0].position.z = 0.3;
    // stop lamps round the rim
    for (let i = 0; i < 5; i++) {
      const a = ModeKnob.A(i), lm = mat({ tint: R.glowAmber[1], flat: 0.6 });
      this.root.add(mesh(cyl(1.3, 1.3, 1.4, 6).rotateX(Math.PI / 2), lm, Math.sin(a) * 21.5, Math.cos(a) * 21.5, 0.6));
      this.lamps.push(lm);
    }
    // the knob: a fluted Bakelite skirt, a cap, a cream pointer line along its fin
    const km = M('bake', { spec: 1 });
    this.knob.add(mesh(cyl(9.5, 10.5, 3, 12).rotateX(Math.PI / 2), km, 0, 0, 1.6));
    this.knob.add(mesh(cyl(7, 8, 4, 10).rotateX(Math.PI / 2), km, 0, 0, 5));
    this.knob.add(mesh(box(3, 15, 4), km, 0, 1, 6.5));
    this.knob.add(mesh(box(1, 7, 0.6), mat({ tint: R.bone[5], flat: 0.5 }), 0, 4.5, 8.7));
    this.root.add(this.knob);
    this.win = new LiveDecal(42, 11);
    this.win.mesh.position.set(0, 30, 0.4);
    this.root.add(this.win.mesh);
    this.root.add(mesh(box(46, 15, 2), M('steel'), 0, 30, -0.8));
  }
  show(i: number, name: string, t: number) {
    for (let k = 0; k < 5; k++) { const on = k === i; this.lamps[k].uniforms.uEmit.value = on ? 0.9 + Math.sin(t * 4) * 0.1 : 0; (this.lamps[k].uniforms.uTint.value as THREE.Color).setHex(on ? R.glowAmber[3] : R.steel[2]); }
    const key = name; if (this.win.key === key) return; this.win.key = key;
    this.win.clear(R.ink[1]);
    const w = textW5(name); text5(this.win.p, name, Math.round((42 - w) / 2), 2, R.glowAmber[3], R.glowAmber[0]);
    this.win.flush();
  }
  update(dt: number, i: number) { this.knob.rotation.z = -this.sp.step(ModeKnob.A(i), dt); }
  kick() { this.sp.kick(4); }
}

// ------------------------------------------------------------------ levers and lamps
/** a lever on a quadrant: thrown by a click; `on` holds it over */
export class Lever {
  readonly root = new THREE.Group();
  readonly arm = new THREE.Group();
  readonly knob: DeskMat;
  private sp = new Spring(0, 120, 9);
  on = false; private pulse = 0;
  constructor(knobCol: number = R.stampRed[3], len = 14) {
    this.root.add(mesh(box(8, 5, 8), M('steel'), 0, 0, 0));
    this.root.add(mesh(cyl(2, 2, 10, 8).rotateZ(Math.PI / 2), M('steel', { spec: 1 }), 0, 2, 0));
    this.knob = mat({ tint: knobCol, spec: 1 });
    this.arm.add(mesh(cyl(0.9, 1.2, len, 6), M('steel', { spec: 1 }), 0, len / 2, 0), mesh(facet(new THREE.IcosahedronGeometry(2.8, 1)), this.knob, 0, len + 1.5, 0));
    this.arm.position.y = 2;
    this.root.add(this.arm);
  }
  throw() { this.pulse = 1; this.sp.kick(9); }
  update(dt: number) {
    this.pulse = Math.max(0, this.pulse - dt * 3);
    const a = this.sp.step((this.on ? 1 : -1) * 0.55 + this.pulse * (this.on ? -0.9 : 0.9), dt);
    this.arm.rotation.x = a;
  }
}
/** a rotating alarm beacon: a ribbed glass dome, a reflector turning inside; dark until the unit is attacked */
export class Beacon {
  readonly root = new THREE.Group();
  private refl = new THREE.Group(); private dome: DeskMat; private rm: DeskMat; private t = 0;
  on = 0;
  constructor(col: number) {
    this.root.add(mesh(cyl(4.4, 5, 2.4, 10), M('steel', { spec: 1 }), 0, 1.2, 0));
    this.rm = mat({ tint: col, emit: 0, flat: 0.4 });
    this.refl.add(mesh(box(5, 3, 0.8), this.rm, 0, 0, 1), mesh(cyl(0.8, 0.8, 4, 6), M('steel'), 0, 0, 0));
    this.refl.position.y = 4.6;
    this.root.add(this.refl);
    const pts: [number, number][] = [[3.8, 2.4], [3.8, 6.5], [3, 8], [1.6, 8.8], [0.2, 9]];
    this.dome = mat({ tint: col, glass: 0.5, flat: 0.5 });
    this.root.add(mesh(lathe(pts, 10), this.dome));
    this.root.add(mesh(cyl(1, 1, 1.2, 6), M('steel'), 0, 9.4, 0));
  }
  update(dt: number) {
    this.t += dt * (this.on > 0 ? 9 : 0.8);
    this.refl.rotation.y = this.t;
    const face = Math.max(0, Math.cos(this.t));
    this.rm.uniforms.uEmit.value = this.on > 0 ? 0.3 + face * 1.2 : 0;
    this.dome.uniforms.uEmit.value = this.on > 0 ? face * 1.4 : 0;
    this.dome.uniforms.uAlpha.value = this.on > 0 ? 0.45 + face * 0.4 : 0.4;
  }
}
/** a small indicator lamp in a steel bezel */
export class Lamp {
  readonly root = new THREE.Group(); readonly m: DeskMat; private t = 0;
  state: 'off' | 'on' | 'blink' | 'fast' = 'off';
  constructor(public col: number = R.glowAmber[3], s = 2) {
    this.root.add(mesh(cyl(s + 1, s + 1, 1, 8).rotateX(Math.PI / 2), M('steel'), 0, 0, 0.3));
    this.m = mat({ tint: R.steel[2], flat: 0.5 });
    this.root.add(mesh(facet(new THREE.IcosahedronGeometry(s, 0)), this.m, 0, 0, 1));
  }
  update(dt: number) {
    this.t += dt;
    const on = this.state === 'on' || (this.state === 'blink' && Math.floor(this.t * 2.5) % 2 === 0) || (this.state === 'fast' && Math.floor(this.t * 8) % 2 === 0);
    (this.m.uniforms.uTint.value as THREE.Color).setHex(on ? this.col : R.steel[2]);
    this.m.uniforms.uEmit.value = on ? 0.8 : 0;
  }
}
/** a static label decal helper for panels */
export function stencil(s: string, x: number, y: number, big = false, col: number = R.bone[4]) { const d = decal(label(s, col, big)); d.position.set(x, y, 0.35); return d; }
export { D, Pix, text5, textW5, text3s, textW3s };
