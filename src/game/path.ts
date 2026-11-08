// Grid A* over region columns. A move between neighbours is legal when the height step is within the walker's
// climb and the column is dry land (unless it swims). Diagonals need both orthogonal neighbours open.
import type { Region } from '../world/region';

export interface Walker { step: number; swim: boolean; fly: boolean }

class Heap {
  private a: number[] = []; private f: Float32Array;
  constructor(f: Float32Array) { this.f = f; }
  get size() { return this.a.length; }
  push(i: number) { const a = this.a; a.push(i); let k = a.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (this.f[a[p]] <= this.f[a[k]]) break; [a[p], a[k]] = [a[k], a[p]]; k = p; } }
  pop(): number {
    const a = this.a, top = a[0], last = a.pop()!;
    if (a.length) { a[0] = last; let k = 0; for (;;) { const l = k * 2 + 1, r = l + 1; let m = k; if (l < a.length && this.f[a[l]] < this.f[a[m]]) m = l; if (r < a.length && this.f[a[r]] < this.f[a[m]]) m = r; if (m === k) break; [a[m], a[k]] = [a[k], a[m]]; k = m; } }
    return top;
  }
}

export class Pather {
  private g: Float32Array; private f: Float32Array; private from: Int32Array; private stamp: Uint32Array; private closed: Uint32Array;
  private gen = 1;
  constructor(private R: Region) {
    const n = R.N * R.N;
    this.g = new Float32Array(n); this.f = new Float32Array(n); this.from = new Int32Array(n); this.stamp = new Uint32Array(n); this.closed = new Uint32Array(n);
  }
  passable(i: number, w: Walker) { return w.fly || w.swim || this.R.h[i] >= this.R.water; }
  canStep(a: number, b: number, w: Walker) {
    if (w.fly) return true;
    if (!this.passable(b, w)) return false;
    const R = this.R, ha = Math.max(R.h[a], w.swim ? R.water : -99), hb = Math.max(R.h[b], w.swim ? R.water : -99);
    return Math.abs(hb - ha) <= w.step + 1e-3;
  }

  /** world-space waypoints from (sx,sz) to (tx,tz); null if unreachable (returns the closest reachable point path) */
  find(sx: number, sz: number, tx: number, tz: number, w: Walker, maxNodes = 9000): number[] | null {
    const R = this.R, N = R.N;
    const ci = (x: number, z: number) => Math.max(0, Math.min(N - 1, Math.floor(z))) * N + Math.max(0, Math.min(N - 1, Math.floor(x)));
    const s = ci(sx, sz), t = ci(tx, tz);
    if (s === t) return [tx, tz];
    const gen = ++this.gen;
    const tX = t % N, tZ = (t / N) | 0;
    const H = (i: number) => { const dx = Math.abs((i % N) - tX), dz = Math.abs(((i / N) | 0) - tZ); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    const heap = new Heap(this.f);
    this.g[s] = 0; this.f[s] = H(s); this.from[s] = -1; this.stamp[s] = gen; heap.push(s);
    let best = s, bestH = H(s), n = 0;
    while (heap.size && n++ < maxNodes) {
      const c = heap.pop();
      if (this.closed[c] === gen) continue;
      this.closed[c] = gen;
      if (c === t) { best = t; break; }
      const h = H(c); if (h < bestH) { bestH = h; best = c; }
      const cx = c % N, cz = (c / N) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const ni = nz * N + nx;
        if (this.closed[ni] === gen) continue;
        if (!this.canStep(c, ni, w)) continue;
        if (dx && dz && (!this.canStep(c, cz * N + nx, w) || !this.canStep(c, nz * N + cx, w))) continue;
        const ng = this.g[c] + (dx && dz ? 1.414 : 1) + Math.abs(R.h[ni] - R.h[c]) * 0.6;
        if (this.stamp[ni] !== gen || ng < this.g[ni]) {
          this.stamp[ni] = gen; this.g[ni] = ng; this.f[ni] = ng + H(ni); this.from[ni] = c; heap.push(ni);
        }
      }
    }
    // rebuild
    const cells: number[] = [];
    for (let c = best; c !== -1 && cells.length < 4000; c = this.from[c]) { cells.push(c); if (c === s) break; }
    cells.reverse();
    if (cells.length < 2 && best !== t) return null;
    // line-of-sight smoothing
    const out: number[] = [];
    let anchor = 0;
    for (let i = 1; i < cells.length; i++) {
      if (i === cells.length - 1 || !this.los(cells[anchor], cells[i + 1], w)) {
        const c = cells[i];
        out.push((c % N) + 0.5, ((c / N) | 0) + 0.5);
        anchor = i;
      }
    }
    if (best === t) { out[out.length - 2] = tx; out[out.length - 1] = tz; }
    return out;
  }

  /** straight walk between two cells stays legal */
  los(a: number, b: number, w: Walker): boolean {
    const N = this.R.N;
    let x0 = a % N, z0 = (a / N) | 0; const x1 = b % N, z1 = (b / N) | 0;
    const dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0), sx = x0 < x1 ? 1 : -1, sz = z0 < z1 ? 1 : -1;
    let err = dx - dz, prev = a;
    for (let k = 0; k < 256; k++) {
      if (x0 === x1 && z0 === z1) return true;
      const e2 = err * 2;
      if (e2 > -dz) { err -= dz; x0 += sx; }
      if (e2 < dx) { err += dx; z0 += sz; }
      const c = z0 * N + x0;
      if (!this.canStep(prev, c, w)) return false;
      prev = c;
    }
    return true;
  }
}
