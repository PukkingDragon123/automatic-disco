// An apple floating in space by the carrier, a joke for whoever finds it. Modelled by hand, not a sphere: a lathe
// profile with a dimple top and bottom, five low lobes round the base, cut in facets (flat shaded) and painted
// with a small pixel texture from the master palette (red streaks drawn down the skin, a straw blush round the
// stem, a few lenticels); a bent stem and a folded leaf. Kick it (click or tap) and it tumbles away spinning,
// bounces off the ship and the floating words, then drifts slowly home. Kick it enough and someone takes a bite.
import * as THREE from 'three';
import { RAMPS } from '../art/palette';
import { gbuf } from '../gfx/gbuf';

const CO = RAMPS.coral, RD = RAMPS.stampRed, OC = RAMPS.ochre, ST = RAMPS.straw, FU = RAMPS.fur, MO = RAMPS.moss, BN = RAMPS.bone;
const h1 = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

/** the skin, 32 around x 32 from the bottom dimple (v 0) to the top one (v 1) */
function skinTex() {
  const W = 32, H = 32, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const px = (x: number, y: number, n: number) => { g.fillStyle = hex(n); g.fillRect(((x % W) + W) % W, H - 1 - y, 1, 1); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(x, y, y < 3 ? CO[2] : y > 27 ? OC[2] : y > 24 ? OC[3] : CO[3]);
  // streaks: drawn down the skin from the shoulder, each its own length, darker and lighter
  for (let x = 0; x < W; x++) {
    const len = 6 + Math.floor(h1(x, 1) * 14), top = 24 - Math.floor(h1(x, 2) * 3), dark = h1(x, 3) < 0.55;
    if (h1(x, 4) < 0.3) continue;
    for (let y = top; y > top - len && y > 2; y--) px(x, y, dark ? RD[2] : CO[4]);
  }
  // the blush toward the stem: a ragged straw band
  for (let x = 0; x < W; x++) { const d = 1 + Math.floor(h1(x, 5) * 3); for (let k = 0; k < d; k++) px(x, 24 + k, k === d - 1 ? ST[2] : OC[3]); }
  // lenticels: a few pale dots, placed
  for (const [x, y] of [[3, 14], [9, 19], [14, 9], [20, 16], [25, 12], [29, 20], [6, 7], [17, 22], [23, 6]]) px(x, y, ST[4]);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** the apple's body: a lathe profile (unit size) with lobes, faceted */
function bodyGeo() {
  const prof: [number, number][] = [[0.02, -0.8], [0.2, -0.86], [0.4, -0.84], [0.62, -0.7], [0.83, -0.44], [0.95, -0.1], [0.97, 0.22], [0.9, 0.5], [0.74, 0.72], [0.52, 0.84], [0.3, 0.84], [0.14, 0.74], [0.02, 0.66]];
  const geo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 14);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
    const lobe = 1 + 0.06 * Math.cos(a * 5) * Math.max(0, -y) + 0.03 * Math.cos(a + 0.7) * (y + 1) * 0.5; // five lobes round the base, a fuller cheek
    p.setXYZ(i, x * lobe, y + 0.04 * Math.cos(a * 2) * Math.max(0, y), z * lobe * 0.97);
  }
  geo.computeVertexNormals();
  return geo;
}

/** a pointed leaf folded along its midrib: two planes, so the light gives it a lit half and a shaded half */
function leafGeo() {
  const L = 0.9, pts: number[] = [], idx: number[] = [];
  const prof = [[0, 0.04], [0.2, 0.2], [0.45, 0.25], [0.7, 0.18], [0.9, 0.07], [1, 0]];
  pts.push(0, 0, 0);
  prof.forEach(([t, w], i) => { pts.push(-w * 1.15, 0.06 * Math.sin(t * Math.PI), t * L, w * 0.8, 0.06 * Math.sin(t * Math.PI), t * L, 0, 0.1 * Math.sin(t * Math.PI) - 0.02, t * L); void i; });
  // vertices: 0 base; for each station k: left 1+3k, right 2+3k, rib 3+3k (the rib is raised: the fold)
  for (let k = 0; k < prof.length - 1; k++) {
    const l0 = 1 + 3 * k, r0 = 2 + 3 * k, m0 = 3 + 3 * k, l1 = l0 + 3, r1 = r0 + 3, m1 = m0 + 3;
    idx.push(l0, m0, m1, l0, m1, l1, m0, r0, r1, m0, r1, m1);
  }
  idx.push(0, 3, 1, 0, 2, 3);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export class Apple {
  readonly group = new THREE.Group(); readonly body: THREE.Mesh;
  readonly pos = new THREE.Vector3(); readonly vel = new THREE.Vector3(); readonly spin = new THREE.Vector3();
  readonly home = new THREE.Vector3();
  kicks = 0; bitten = false;
  /** seconds of free flight left after a kick, before it starts to drift home */
  private free = 0;
  private geo: THREE.BufferGeometry; private skin: THREE.Texture; private mats: THREE.Material[] = []; private geos: THREE.BufferGeometry[] = [];
  private q = new THREE.Quaternion(); private tmp = new THREE.Vector3();
  constructor(readonly R = 6) {
    this.skin = skinTex();
    this.geo = bodyGeo(); this.geos.push(this.geo);
    const m = gbuf(new THREE.MeshLambertMaterial({ map: this.skin, flatShading: true }), 1); this.mats.push(m);
    this.body = new THREE.Mesh(this.geo, m); this.body.castShadow = true; this.body.receiveShadow = true;
    this.body.scale.setScalar(R); this.group.add(this.body);
    // the stem: two bent segments; the leaf off its side
    const sm = gbuf(new THREE.MeshLambertMaterial({ color: FU[2], flatShading: true }), 1); this.mats.push(sm);
    const s1 = new THREE.CylinderGeometry(0.035, 0.05, 0.3, 5), s2 = new THREE.CylinderGeometry(0.025, 0.035, 0.22, 5); this.geos.push(s1, s2);
    const a = new THREE.Mesh(s1, sm); a.position.set(0, 0.78, 0); a.rotation.z = -0.15; this.body.add(a);
    const b = new THREE.Mesh(s2, sm); b.position.set(0.05, 0.98, 0); b.rotation.z = -0.55; this.body.add(b);
    const lm = gbuf(new THREE.MeshLambertMaterial({ color: MO[4], flatShading: true, side: THREE.DoubleSide }), 1); this.mats.push(lm);
    const lg = leafGeo(); this.geos.push(lg);
    const leaf = new THREE.Mesh(lg, lm); leaf.position.set(0.04, 0.86, 0.02); leaf.rotation.set(-0.9, 0.6, 0.35); leaf.castShadow = true; this.body.add(leaf);
    this.group.rotation.set(0.25, 0.4, -0.18);
  }
  place(at: THREE.Vector3) { this.home.copy(at); this.pos.copy(at); this.group.position.copy(at); }
  /** a kick along dir (unit, world) */
  kick(dir: THREE.Vector3, k = 1) {
    this.vel.addScaledVector(dir, 70 * k).add(this.tmp.set(0, 12 * k, 0));
    this.spin.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2).normalize().multiplyScalar(6 + Math.random() * 6);
    this.free = 2.6; this.kicks++;
  }
  /** a bite out of the cheek: the facets there pushed flat, the flesh showing, tooth marks round the edge */
  bite() {
    if (this.bitten) return; this.bitten = true;
    const p = this.geo.attributes.position as THREE.BufferAttribute, B = new THREE.Vector3(0.62, 0.18, 0.68).normalize(), plane = 0.7, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); const d = v.dot(B);
      if (d > plane) { v.addScaledVector(B, plane - d - (h1(i, 3) - 0.5) * 0.02); p.setXYZ(i, v.x, v.y, v.z); }
    }
    p.needsUpdate = true; this.geo.computeVertexNormals();
    // the flesh: a scalloped plate (each scallop a tooth) in bone, set into the flat
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2, r = 0.62 * (i % 2 ? 0.88 : 1) * (0.95 + h1(i, 9) * 0.08); pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r * 0.82)); }
    const fg = new THREE.ShapeGeometry(new THREE.Shape(pts)); this.geos.push(fg);
    const fm = gbuf(new THREE.MeshLambertMaterial({ color: BN[4], flatShading: true }), 1); this.mats.push(fm);
    const flesh = new THREE.Mesh(fg, fm);
    flesh.position.copy(B).multiplyScalar(plane + 0.005); flesh.lookAt(B.clone().multiplyScalar(2)); this.body.add(flesh);
    const cm = gbuf(new THREE.MeshLambertMaterial({ color: FU[1] }), 1); this.mats.push(cm);
    const pip = new THREE.BoxGeometry(0.05, 0.1, 0.02); this.geos.push(pip);
    for (const [x, y] of [[-0.08, 0.04], [0.09, -0.02]]) { const s = new THREE.Mesh(pip, cm); s.position.set(x, y, 0.01); s.rotation.z = x * 4; flesh.add(s); }
  }
  /** obstacles: boxes in their own frames (half sizes, frame matrices) */
  update(dt: number, t: number, boxes: { half: THREE.Vector3; m: THREE.Matrix4; inv: THREE.Matrix4; hit?: () => void }[], onBounce?: (speed: number) => void) {
    dt = Math.min(dt, 1 / 20);
    if (this.free > 0) { this.free -= dt; this.vel.multiplyScalar(Math.exp(-dt * 0.25)); }
    else {
      // drift home: a soft critically damped spring, and a lazy bob once there
      const goal = this.tmp.copy(this.home); goal.y += Math.sin(t * 0.6) * 1.2;
      const k = 0.5, c = 2 * Math.sqrt(k);
      this.vel.addScaledVector(goal.sub(this.pos), k * dt).multiplyScalar(1 - Math.min(0.9, c * dt));
      const s = this.vel.length(); if (s > 18) this.vel.multiplyScalar(18 / s);
    }
    this.pos.addScaledVector(this.vel, dt);
    // bounce off boxes (the hull, the words): push out along the shallowest axis, reflect, lose some speed, gain spin
    const lp = new THREE.Vector3(), lv = new THREE.Vector3();
    for (const b of boxes) {
      lp.copy(this.pos).applyMatrix4(b.inv);
      const R = this.R * 0.9, h = b.half;
      const px = h.x + R - Math.abs(lp.x), py = h.y + R - Math.abs(lp.y), pz = h.z + R - Math.abs(lp.z);
      if (px <= 0 || py <= 0 || pz <= 0) continue;
      lv.copy(this.vel).transformDirection(b.inv).multiplyScalar(this.vel.length());
      const ax = px < py && px < pz ? 0 : py < pz ? 1 : 2, sg = Math.sign([lp.x, lp.y, lp.z][ax]) || 1;
      const into = [lv.x, lv.y, lv.z][ax] * sg;
      if (ax === 0) lp.x += sg * px; else if (ax === 1) lp.y += sg * py; else lp.z += sg * pz;
      if (into < 0) {
        if (ax === 0) lv.x = -lv.x * 0.55; else if (ax === 1) lv.y = -lv.y * 0.55; else lv.z = -lv.z * 0.55;
        lv.multiplyScalar(0.85);
        this.vel.copy(lv).transformDirection(b.m).multiplyScalar(lv.length());
        this.spin.multiplyScalar(-0.7).add(this.tmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(6));
        onBounce?.(-into); b.hit?.();
        this.free = Math.max(this.free, 0.8);
      }
      this.pos.copy(lp.applyMatrix4(b.m));
    }
    this.group.position.copy(this.pos);
    // tumble; a slow idle turn when calm
    const sp = this.spin.length();
    if (sp > 1e-3) { this.q.setFromAxisAngle(this.tmp.copy(this.spin).divideScalar(sp), sp * dt); this.group.quaternion.premultiply(this.q); }
    this.spin.multiplyScalar(Math.exp(-dt * 0.5));
    if (sp < 0.35) this.spin.y += (0.35 - sp) * dt;
  }
  dispose() { this.group.removeFromParent(); this.geos.forEach((g) => g.dispose()); this.mats.forEach((m) => m.dispose()); this.skin.dispose(); }
}
