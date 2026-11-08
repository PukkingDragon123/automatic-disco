// Fog of war for one faction: what its growth, structures and creatures can see right now, and what it has seen.
import type { World } from './world';
import type { Hive } from './hive';

export class Vision {
  readonly vis: Uint8Array; readonly seen: Uint8Array;
  private dist: Float32Array;
  private t = 0;
  revealAll = false;
  constructor(readonly w: World, readonly hive: Hive) {
    const n = w.region.N * w.region.N;
    this.vis = new Uint8Array(n); this.seen = new Uint8Array(n); this.dist = new Float32Array(n);
  }
  visibleAt(x: number, z: number) { const N = this.w.region.N; const X = Math.floor(x), Z = Math.floor(z); return X >= 0 && Z >= 0 && X < N && Z < N && this.vis[Z * N + X] > 0; }
  update(dt: number, force = false) {
    this.t -= dt;
    if (this.t > 0 && !force) return;
    this.t = 0.25;
    const w = this.w, N = w.region.N, vis = this.vis, cov = this.hive.cov, D = this.dist;
    vis.fill(0);
    if (this.revealAll) vis.fill(1);
    else {
      // growth sees 3 m around itself (two-pass chamfer distance)
      for (let i = 0; i < N * N; i++) D[i] = cov[i] > 0.45 ? 0 : 99;
      for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) { const i = z * N + x; if (x) D[i] = Math.min(D[i], D[i - 1] + 1); if (z) D[i] = Math.min(D[i], D[i - N] + 1); if (x && z) D[i] = Math.min(D[i], D[i - N - 1] + 1.41); if (z && x < N - 1) D[i] = Math.min(D[i], D[i - N + 1] + 1.41); }
      for (let z = N - 1; z >= 0; z--) for (let x = N - 1; x >= 0; x--) { const i = z * N + x; if (x < N - 1) D[i] = Math.min(D[i], D[i + 1] + 1); if (z < N - 1) D[i] = Math.min(D[i], D[i + N] + 1); if (x < N - 1 && z < N - 1) D[i] = Math.min(D[i], D[i + N + 1] + 1.41); if (z < N - 1 && x) D[i] = Math.min(D[i], D[i + N - 1] + 1.41); }
      for (let i = 0; i < N * N; i++) if (D[i] <= 3.2) vis[i] = 1;
      const stamp = (x: number, z: number, r: number) => {
        const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(N - 1, Math.ceil(x + r)), z0 = Math.max(0, Math.floor(z - r)), z1 = Math.min(N - 1, Math.ceil(z + r));
        for (let Z = z0; Z <= z1; Z++) for (let X = x0; X <= x1; X++) if ((X + 0.5 - x) ** 2 + (Z + 0.5 - z) ** 2 <= r * r) vis[Z * N + X] = 1;
      };
      for (const b of this.hive.buildings) stamp(b.x, b.z, b.done ? b.def.sight : 4);
      for (const c of w.creatures) if (!c.dead && c.faction === this.hive.faction) stamp(c.x, c.z, Math.min(14, c.st.sight));
      for (const s of this.extra) stamp(s[0], s[1], s[2]);
    }
    const tex = w.terrain.visData();
    for (let i = 0; i < N * N; i++) {
      if (vis[i]) this.seen[i] = 1;
      tex[i * 4] = vis[i] ? 255 : 0; tex[i * 4 + 1] = this.seen[i] ? 255 : 0;
    }
    w.terrain.visFlush();
    for (const c of w.creatures) c.visibleNow = c.faction === this.hive.faction || this.visibleAt(c.x, c.z);
    for (const h of w.hives) if (h !== this.hive) for (const b of h.buildings) b.visibleNow = this.seen[Math.floor(b.z) * N + Math.floor(b.x)] > 0;
  }
  /** temporary vision sources (reveals, story beats): [x, z, r] */
  extra: [number, number, number][] = [];
}
