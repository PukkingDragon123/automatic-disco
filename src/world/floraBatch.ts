// Chunked instance batches. Every flora draw (one per species variant and LOD in 3D, the far-LOD cards, each
// ground-cover form) keeps its instances sorted by map chunk (4 m). Each frame the flora picks the chunks that are in view and
// within the batch's LOD range; when that set changes, the batch copies those chunks' contiguous instance runs into
// its dynamic draw buffer. Plants added during play go to a per-chunk overflow list.
import * as THREE from 'three';

export const CH = 4;

export class Batch {
  readonly mesh: THREE.Mesh;
  readonly stride: number;
  /** all instances, sorted by chunk; start[c]..start[c+1] are chunk c's */
  data: Float32Array;
  readonly start: Int32Array;
  private extra: Map<number, number[]> = new Map();
  private buf: THREE.InstancedInterleavedBuffer;
  private geo: THREE.InstancedBufferGeometry;
  private cap: number;
  dirty = true;
  /** the chunk-list signature it was last built for */
  sig = -1;
  count = 0;

  /** perChunk[c]: chunk c's instances, flat (stride floats each) */
  constructor(readonly name: string, base: THREE.BufferGeometry, mat: THREE.Material, depth: THREE.Material | null, stride: number, attrs: [string, number, number][], perChunk: number[][], nChunks: number, spare = 0) {
    this.stride = stride;
    let n = 0; for (const l of perChunk) n += l ? l.length / stride : 0;
    this.data = new Float32Array(Math.max(1, n) * stride);
    this.start = new Int32Array(nChunks + 1);
    let o = 0;
    for (let c = 0; c < nChunks; c++) {
      this.start[c] = o;
      const l = perChunk[c];
      if (l) { this.data.set(l, o * stride); o += l.length / stride; }
    }
    this.start[nChunks] = o;
    this.cap = Math.max(1, n + spare);
    const g = (this.geo = new THREE.InstancedBufferGeometry());
    g.index = base.index;
    for (const k of Object.keys(base.attributes)) g.setAttribute(k, base.attributes[k]);
    this.buf = new THREE.InstancedInterleavedBuffer(new Float32Array(this.cap * stride), stride, 1);
    this.buf.setUsage(THREE.DynamicDrawUsage);
    for (const [name, size, off] of attrs) g.setAttribute(name, new THREE.InterleavedBufferAttribute(this.buf, size, off));
    g.instanceCount = 0;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.name = name;
    if (depth) { this.mesh.customDepthMaterial = depth; this.mesh.castShadow = true; }
    this.mesh.receiveShadow = true;
    this.mesh.visible = false;
  }
  get total() { return this.start[this.start.length - 1]; }

  /** add an instance at runtime (to a chunk's overflow); returns a handle for edits */
  add(chunk: number, rec: number[]) {
    let l = this.extra.get(chunk); if (!l) this.extra.set(chunk, (l = []));
    l.push(...rec);
    this.dirty = true;
  }
  /** visit every stored instance record of the chunks touching a box: fn(array, offset) */
  forEach(c0x: number, c0z: number, c1x: number, c1z: number, nc: number, fn: (a: Float32Array | number[], o: number) => void) {
    for (let cz = Math.max(0, c0z); cz <= Math.min(nc - 1, c1z); cz++) for (let cx = Math.max(0, c0x); cx <= Math.min(nc - 1, c1x); cx++) {
      const c = cz * nc + cx;
      for (let i = this.start[c]; i < this.start[c + 1]; i++) fn(this.data, i * this.stride);
      const e = this.extra.get(c);
      if (e) for (let o = 0; o < e.length; o += this.stride) fn(e, o);
    }
  }

  /** copy the listed chunks' instances into the draw buffer (keep > 1: only every keep-th instance, thinning) */
  rebuild(chunks: ArrayLike<number>, n: number, sig: number, keep = 1) {
    sig = (sig ^ (keep * 0x45d9f3b)) >>> 0;
    if (!this.dirty && sig === this.sig) return;
    this.sig = sig; this.dirty = false;
    const S = this.stride;
    let need = 0;
    for (let k = 0; k < n; k++) { const c = chunks[k]; need += this.start[c + 1] - this.start[c] + (this.extra.get(c)?.length ?? 0) / S; }
    if (need > this.cap) {
      this.cap = Math.ceil(need * 1.25);
      const nb = new THREE.InstancedInterleavedBuffer(new Float32Array(this.cap * S), S, 1);
      nb.setUsage(THREE.DynamicDrawUsage);
      for (const k of Object.keys(this.geo.attributes)) {
        const a = this.geo.attributes[k] as THREE.InterleavedBufferAttribute;
        if ((a as any).isInterleavedBufferAttribute && a.data === this.buf) this.geo.setAttribute(k, new THREE.InterleavedBufferAttribute(nb, a.itemSize, a.offset));
      }
      this.buf = nb;
    }
    const dst = this.buf.array as Float32Array;
    let o = 0;
    for (let k = 0; k < n; k++) {
      const c = chunks[k], a = this.start[c], b = this.start[c + 1];
      if (keep > 1) { for (let i = a; i < b; i += keep) { dst.set(this.data.subarray(i * S, (i + 1) * S), o * S); o++; } }
      else if (b > a) { dst.set(this.data.subarray(a * S, b * S), o * S); o += b - a; }
      const e = this.extra.get(c);
      if (e && e.length) { dst.set(e, o * S); o += e.length / S; }
    }
    this.count = o;
    this.geo.instanceCount = o;
    this.mesh.visible = o > 0;
    if (o > 0) { this.buf.clearUpdateRanges(); this.buf.addUpdateRange(0, o * S); this.buf.needsUpdate = true; }
  }
}
