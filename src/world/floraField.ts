// The growth's physical memory: a spring field over the region (2 cells per metre) that every grass blade, flower
// and plant samples in its vertex shader. Things moving through push the growth aside (a stiff spring toward a
// bend pointing away from them), heavy ones trample it (it lies over in the direction it was pushed, stays down a
// while, then slowly rises), and impulses (explosions, rock impacts) kick it outward so it whips back and forth
// with damping. Only active cells are simulated; touched rows are uploaded.
//
// Texture: R,G = bend (tip offset per metre of height, encoded 0.5 + b/4), B = trampled 0..1.
import * as THREE from 'three';

const K = 30;      // spring stiffness (1/s^2): ~0.9 Hz sway back
const C = 3.4;     // damping: a couple of visible overshoots
const RISE = 1 / 13; // trampled growth rises over ~13 s (after holding flat while flat > 1)
const MAXB = 1.85;

export class FloraField {
  readonly G: number;
  readonly res = 2;
  readonly tex: THREE.DataTexture;
  private data: Uint8Array;
  private dx: Float32Array; private dz: Float32Array; private vx: Float32Array; private vz: Float32Array;
  private flat: Float32Array; private lx: Float32Array; private lz: Float32Array;
  private on: Uint8Array; private list: number[] = [];
  private pushes: number[] = [];
  private row0 = 1e9; private row1 = -1;

  constructor(readonly N: number) {
    const G = (this.G = N * this.res), n = G * G;
    this.dx = new Float32Array(n); this.dz = new Float32Array(n); this.vx = new Float32Array(n); this.vz = new Float32Array(n);
    this.flat = new Float32Array(n); this.lx = new Float32Array(n); this.lz = new Float32Array(n); this.on = new Uint8Array(n);
    this.data = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) { this.data[i * 4] = 128; this.data[i * 4 + 1] = 128; this.data[i * 4 + 3] = 255; }
    const t = (this.tex = new THREE.DataTexture(this.data, G, G, THREE.RGBAFormat, THREE.UnsignedByteType));
    t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.flipY = false;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
    // row updates only once the full texture is on the GPU
    t.onUpdate = () => { this.uploaded = true; };
  }
  private uploaded = false;

  /** hold growth aside this frame: radius r (m), strength s (0.3 brush past .. 1 heavy, tramples above ~0.45) */
  push(x: number, z: number, r: number, s: number) { if (r > 0 && s > 0) this.pushes.push(x, z, r, s); }

  /** a one-off outward kick (explosion, impact): s ~0.5 gust .. 3 blast; strong ones flatten */
  impulse(x: number, z: number, r: number, s: number) {
    this.cells(x, z, r, (i, ddx, ddz, d) => {
      const w = 1 - d / r, k = s * 6 * w * (0.4 + 0.6 * w);
      const ux = d > 1e-3 ? ddx / d : 1, uz = d > 1e-3 ? ddz / d : 0;
      this.vx[i] += ux * k; this.vz[i] += uz * k;
      if (s > 0.8) { const f = (s - 0.6) * 0.75 * w; if (f > 0) { this.lie(i, ux, uz, f); } }
      this.wake(i);
    });
  }

  /** trampled amount 0..1 at a point */
  trampled(x: number, z: number) { const i = this.idx(x, z); return i < 0 ? 0 : Math.min(1, this.flat[i]); }
  /** current bend vector at a point */
  bend(x: number, z: number): [number, number] { const i = this.idx(x, z); return i < 0 ? [0, 0] : [this.dx[i], this.dz[i]]; }

  private idx(x: number, z: number) {
    const X = Math.floor(x * this.res), Z = Math.floor(z * this.res);
    return X < 0 || Z < 0 || X >= this.G || Z >= this.G ? -1 : Z * this.G + X;
  }
  private cells(x: number, z: number, r: number, fn: (i: number, dx: number, dz: number, d: number) => void) {
    const G = this.G, s = this.res, X0 = Math.max(0, Math.floor((x - r) * s)), X1 = Math.min(G - 1, Math.floor((x + r) * s));
    const Z0 = Math.max(0, Math.floor((z - r) * s)), Z1 = Math.min(G - 1, Math.floor((z + r) * s));
    for (let Z = Z0; Z <= Z1; Z++) for (let X = X0; X <= X1; X++) {
      const cx = (X + 0.5) / s - x, cz = (Z + 0.5) / s - z, d = Math.sqrt(cx * cx + cz * cz);
      if (d < r) fn(Z * G + X, cx, cz, d);
    }
  }
  private lie(i: number, ux: number, uz: number, f: number) {
    const old = Math.min(1, this.flat[i]), nf = Math.min(1.9, this.flat[i] + f);
    // the lying direction follows whatever pressed it down last, weighted by how hard
    const k = f / Math.max(1e-3, old + f);
    this.lx[i] += (ux - this.lx[i]) * k; this.lz[i] += (uz - this.lz[i]) * k;
    const l = Math.hypot(this.lx[i], this.lz[i]) || 1; this.lx[i] /= l; this.lz[i] /= l;
    this.flat[i] = nf;
  }
  private wake(i: number) { if (!this.on[i]) { this.on[i] = 1; this.list.push(i); } }

  step(dt: number) {
    dt = Math.min(dt, 1 / 20);
    const P = this.pushes;
    for (let p = 0; p < P.length; p += 4) {
      const x = P[p], z = P[p + 1], r = P[p + 2], s = P[p + 3];
      this.cells(x, z, r, (i, ddx, ddz, d) => {
        const w = 1 - d / r, ux = d > 1e-3 ? ddx / d : 1, uz = d > 1e-3 ? ddz / d : 0;
        const tgt = Math.min(1.5, s * 1.3 * Math.sqrt(w) + 0.15);
        const tx = ux * tgt, tz = uz * tgt, k = 60 * w;
        this.vx[i] += ((tx - this.dx[i]) * k - this.vx[i] * 6 * w) * dt;
        this.vz[i] += ((tz - this.dz[i]) * k - this.vz[i] * 6 * w) * dt;
        if (s > 0.45) this.lie(i, ux, uz, dt * 1.7 * (s - 0.4) * w);
        this.wake(i);
      });
    }
    P.length = 0;
    const L = this.list, G = this.G, d = this.data;
    let w = 0;
    for (let k = 0; k < L.length; k++) {
      const i = L[k];
      let vx = this.vx[i], vz = this.vz[i], dx = this.dx[i], dz = this.dz[i];
      vx += (-K * dx - C * vx) * dt; vz += (-K * dz - C * vz) * dt;
      dx += vx * dt; dz += vz * dt;
      const bl = Math.hypot(dx, dz); if (bl > MAXB) { dx *= MAXB / bl; dz *= MAXB / bl; }
      let f = this.flat[i];
      if (f > 0) f = Math.max(0, f - dt * RISE);
      this.vx[i] = vx; this.vz[i] = vz; this.dx[i] = dx; this.dz[i] = dz; this.flat[i] = f;
      // encode: the spring bend plus the lie of trampled growth
      const fl = Math.min(1, f) * 1.4, bx = dx + this.lx[i] * fl, bz = dz + this.lz[i] * fl;
      d[i * 4] = Math.max(0, Math.min(255, Math.round((0.5 + bx / 4) * 255)));
      d[i * 4 + 1] = Math.max(0, Math.min(255, Math.round((0.5 + bz / 4) * 255)));
      d[i * 4 + 2] = Math.round(Math.min(1, f) * 255);
      const row = (i / G) | 0; if (row < this.row0) this.row0 = row; if (row > this.row1) this.row1 = row;
      if (Math.abs(dx) + Math.abs(dz) < 0.002 && Math.abs(vx) + Math.abs(vz) < 0.004 && f <= 0) {
        this.on[i] = 0; this.dx[i] = this.dz[i] = this.vx[i] = this.vz[i] = 0;
        d[i * 4] = 128; d[i * 4 + 1] = 128; d[i * 4 + 2] = 0;
      } else L[w++] = i;
    }
    L.length = w;
    if (this.row1 >= this.row0) {
      const t = this.tex;
      if (!this.uploaded || this.row1 - this.row0 > G / 3) t.clearUpdateRanges();
      else for (let r = this.row0; r <= this.row1; r++) t.addUpdateRange(r * G * 4, G * 4);
      t.needsUpdate = true;
      this.row0 = 1e9; this.row1 = -1;
    }
  }
}
