// The intro's own props, built with the machine kit on the crew page and the UNAA hardware page: the loose things
// the breach sucks out (papers, a mug, sample tubes, a clipboard, a pen), the hull patch plate with its weld lugs,
// the three pieces of the shorted lab terminal (a cover plate, a circuit card, a cable loom), the four stencilled
// part crates for the pod and their parts, the torn hole on the outside of the hull, and a particle pool (sparks,
// vented air and ice, nanite build motes).
import * as THREE from 'three';
import { Kit } from '../../robots/kit';
import { gbuf } from '../../gfx/gbuf';
import { crewMats } from '../crew/paint';
import { placeModel } from '../hub/models';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ particles: one pool of additive billboards
let softT: THREE.Texture | null = null;
function soft() {
  if (softT) return softT;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); softT = new THREE.CanvasTexture(c); return softT;
}
interface Pt { p: THREE.Vector3; v: THREE.Vector3; life: number; age: number; size: number; grav: number; drag: number; col: THREE.Color }
export class Motes {
  readonly points: THREE.Points;
  private pts: Pt[] = [];
  private geo = new THREE.BufferGeometry();
  private pos: Float32Array; private col: Float32Array; private siz: Float32Array;
  constructor(readonly max = 600) {
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.siz = new Float32Array(max);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3)); this.geo.setAttribute('size', new THREE.BufferAttribute(this.siz, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { map: { value: soft() } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      vertexShader: 'attribute float size; varying vec3 vC; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * 900.0 / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'layout(location = 1) out highp vec4 gNormal;\nuniform sampler2D map; varying vec3 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC * t.a, t.a); gNormal = vec4(0.0); }',
    });
    this.points = new THREE.Points(this.geo, m); this.points.frustumCulled = false; this.points.renderOrder = 5;
  }
  emit(at: THREE.Vector3, n: number, col: number, o: { dir?: THREE.Vector3; speed?: number; cone?: number; life?: number; size?: number; grav?: number; drag?: number; spread?: number } = {}) {
    const c = new THREE.Color(col);
    for (let i = 0; i < n && this.pts.length < this.max; i++) {
      const d = (o.dir ?? V(0, 1, 0)).clone().normalize();
      const r = V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2 * (o.cone ?? 0.6));
      const v = d.add(r).normalize().multiplyScalar((o.speed ?? 2) * (0.5 + Math.random()));
      const p = at.clone(); if (o.spread) p.add(V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(o.spread));
      this.pts.push({ p, v, life: (o.life ?? 0.8) * (0.6 + Math.random() * 0.8), age: 0, size: (o.size ?? 0.04) * (0.6 + Math.random() * 0.8), grav: o.grav ?? 0, drag: o.drag ?? 0.5, col: c.clone() });
    }
  }
  update(dt: number) {
    for (let i = this.pts.length - 1; i >= 0; i--) {
      const q = this.pts[i]; q.age += dt;
      if (q.age >= q.life) { this.pts.splice(i, 1); continue; }
      q.v.y -= q.grav * dt; q.v.multiplyScalar(Math.exp(-q.drag * dt)); q.p.addScaledVector(q.v, dt);
    }
    const n = this.pts.length;
    for (let i = 0; i < n; i++) {
      const q = this.pts[i], k = 1 - q.age / q.life;
      this.pos[i * 3] = q.p.x; this.pos[i * 3 + 1] = q.p.y; this.pos[i * 3 + 2] = q.p.z;
      this.col[i * 3] = q.col.r * k * 1.6; this.col[i * 3 + 1] = q.col.g * k * 1.6; this.col[i * 3 + 2] = q.col.b * k * 1.6; this.siz[i] = q.size;
    }
    this.geo.setDrawRange(0, n);
    for (const a of ['position', 'color', 'size']) (this.geo.getAttribute(a) as THREE.BufferAttribute).needsUpdate = true;
  }
  dispose() { this.points.removeFromParent(); this.geo.dispose(); }
}

// ------------------------------------------------------------------ real props: Poly Haven models through the lowpix converter
const fits: { g: THREE.Group; h: number; done: boolean }[] = [];
/** a lowpix-converted Poly Haven prop (the hub's model set), scaled to a height in metres once it has loaded */
export function lp(id: string, height: number): THREE.Group {
  const g = new THREE.Group(); g.name = 'lp:' + id;
  placeModel(g, id, { x: 0, z: 0 });
  fits.push({ g, h: height, done: false });
  return g;
}
/** call every frame: fit the props that have arrived */
export function tickFits() {
  for (const f of fits) {
    if (f.done) continue;
    const inner = f.g.children[0]; if (!inner || !inner.children.length) continue;
    // measure in the holder's own frame (it may already be placed and turned)
    f.g.updateWorldMatrix(true, true);
    const inv = f.g.matrixWorld.clone().invert();
    const bb = new THREE.Box3().setFromObject(inner).applyMatrix4(inv), h = bb.max.y - bb.min.y;
    if (!(h > 1e-4)) continue;
    const k = f.h / h, c = bb.getCenter(new THREE.Vector3());
    inner.scale.multiplyScalar(k);
    inner.position.set((inner.position.x - c.x) * k, (inner.position.y - bb.min.y) * k, (inner.position.z - c.z) * k);
    f.done = true;
  }
}

// ------------------------------------------------------------------ kit-built props
function build(fn: (k: Kit, g: THREE.Group) => void, dens = 10): THREE.Group {
  const g = new THREE.Group(); const k = new Kit(dens);
  fn(k, g); k.finish(crewMats());
  g.traverse((m) => { if ((m as THREE.Mesh).isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return g;
}
/** the things that go out of the hole */
export function looseThings(): THREE.Group[] {
  const out: THREE.Group[] = [lp('clipboard', 0.03), lp('office_notepads', 0.05), lp('binder_notebook', 0.06), lp('magnifying_glass_01', 0.04), lp('screwdriver', 0.03), lp('alarm_clock_01', 0.1)];
  for (let i = 0; i < 7; i++) out.push(build((k, g) => { k.on(g, 1); k.box(0, 0, 0, 0.21, 0.002, 0.29, 'cw:ceramic'); k.push(0, 0.0012, 0, -Math.PI / 2, 0, 0).decal(0, 0, 0, 0.19, 0.27, i % 3 === 0 ? 'cw:memo' : i % 3 === 1 ? 'cw:id' : 'cw:ceramic').pop(); }));
  out.push(build((k, g) => { k.on(g, 1); k.cyl(0, 0, 0, 0.038, 0.036, 0.095, 12, 'cw:ceramic', { caps: 'bot' }); k.push(0, 0, 0.0375).decal(0, 0, 0, 0.04, 0.04, 'cw:capb').pop(); k.on(g, 0); k.torus(-0.047, 0, 0, 0.022, 0.006, 10, 4, 'pb2', 'z'); }));
  for (let i = 0; i < 3; i++) out.push(build((k, g) => { k.on(g, 1); k.cyl(0, 0, 0, 0.011, 0.011, 0.12, 8, 'cw:glassG', { caps: 'bot' }); k.on(g, 0); k.cyl(0, 0.065, 0, 0.013, 0.013, 0.02, 8, i === 1 ? 'hzB' : 'pb0'); }));
  out.push(build((k, g) => { k.on(g, 0); k.box(0, 0, 0, 0.22, 0.012, 0.3, 'pb1', { ch: 0.003 }); k.box(0, 0.01, -0.13, 0.08, 0.014, 0.03, 'st0'); k.on(g, 1); k.push(0, 0.0065, 0.01, -Math.PI / 2, 0, 0).decal(0, 0, 0, 0.19, 0.24, 'cw:memo').pop(); }));
  out.push(build((k, g) => { k.on(g, 0); k.cyl(0, 0, 0, 0.005, 0.005, 0.14, 6, 'br', { axis: 'x' }); k.cyl(0.075, 0, 0, 0.005, 0.001, 0.012, 6, 'dk', { axis: 'x' }); }));
  return out;
}
/** the hull patch plate (0.66 m square, rivet holes, four weld lugs, the stencil) */
export function patchPlate(): THREE.Group {
  return build((k, g) => {
    k.on(g, 0);
    k.box(0, 0, 0, 0.66, 0.66, 0.025, 'pb0', { ch: 0.006 });
    for (const [x, y] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) k.box(x, y, -0.016, 0.07, 0.07, 0.01, 'st0', { ch: 0.002 });
    k.rivets([-0.29, 0.31, 0.014], [0.29, 0.31, 0.014], 7, 0.006, 'z', 'st1'); k.rivets([-0.29, -0.31, 0.014], [0.29, -0.31, 0.014], 7, 0.006, 'z', 'st1');
    k.box(0.0, 0.0, 0.014, 0.5, 0.06, 0.004, 'hz');
    k.box(0, -0.22, 0.014, 0.12, 0.05, 0.02, 'st1', { ch: 0.006 });
  });
}
/** the shorted terminal's three pieces: a cover plate, a circuit card, a cable loom */
export function consoleParts(): THREE.Group[] {
  return [
    build((k, g) => { k.on(g, 0); k.box(0, 0, 0, 0.42, 0.012, 0.28, 'pb0', { ch: 0.004 }); k.vent(0.08, 0.008, 0, 0.18, 0.004, 0.16); k.rivets([-0.19, 0.008, -0.12], [-0.19, 0.008, 0.12], 3, 0.005, 'y'); }),
    build((k, g) => { k.on(g, 0); k.box(0, 0, 0, 0.26, 0.006, 0.16, 'pc0', { ch: 0.002 }); for (let i = 0; i < 5; i++) k.box(-0.09 + i * 0.045, 0.008, 0.02, 0.03, 0.01, 0.03, 'dk'); k.box(0.0, 0.006, -0.06, 0.2, 0.006, 0.012, 'br'); k.cyl(0.1, 0.012, 0.05, 0.008, 0.008, 0.01, 8, 'lamp'); }),
    build((k, g) => { k.on(g, 0); for (const [z, reg] of [[-0.02, 'hzB'], [0, 'cab'], [0.02, 'hose']] as [number, string][]) k.tube([[-0.16, 0, z], [-0.05, 0.03, z * 2], [0.06, -0.01, z], [0.16, 0.02, z * 1.5]], 0.009, 6, reg); k.box(-0.17, 0.0, 0, 0.04, 0.03, 0.07, 'dk'); k.box(0.17, 0.02, 0, 0.04, 0.03, 0.07, 'dk'); }),
  ];
}
/** a stencilled part crate (index 0..3) with its lid */
export function partCrate(i: number): THREE.Group {
  const g = new THREE.Group();
  g.add(lp(i % 2 ? 'plastic_crate_01' : 'metal_tool_chest', 0.55));
  // the stencilled part plate on a stand in front of it
  g.add(build((k, gg) => {
    k.on(gg, 0); k.box(0, 0.3, 0.42, 0.56, 0.2, 0.02, 'pb0', { ch: 0.004 }); k.box(0, 0.1, 0.42, 0.04, 0.2, 0.04, 'st0');
    k.on(gg, 1); k.push(0, 0.3, 0.431).decal(0, 0, 0, 0.52, 0.156, 'cw:part' + i).pop();
  }));
  return g;
}
/** the torn hole on the outer skin: a black ragged disc and petals bent outward */
export function outerHole(): THREE.Group {
  const g = new THREE.Group();
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = 0.17 * (0.7 + ((i * 53) % 9) / 18); pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r)); }
  const hole = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts)), gbuf(new THREE.MeshBasicMaterial({ color: 0x050608 }), 32)); hole.position.z = 0.01; g.add(hole);
  const burn = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.34, 24), gbuf(new THREE.MeshBasicMaterial({ color: 0x1a1612, transparent: true, opacity: 0.55, depthWrite: false }), 0)); burn.position.z = 0.006; g.add(burn);
  const pm = gbuf(new THREE.MeshStandardMaterial({ color: 0xc8c8c0, roughness: 0.45, metalness: 0.55, side: THREE.DoubleSide }), 1);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2, p = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 3), pm);
    p.position.set(Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0.05); p.rotation.set(0, 0, a - Math.PI / 2); p.rotateX(-0.9); g.add(p);
  }
  return g;
}
/** a translucent hologram of a pod part flying to the cradle (a ring of plates, a dome, a leg) */
export function partGhost(i: number): THREE.Group {
  const g = new THREE.Group();
  const m = gbuf(new THREE.MeshBasicMaterial({ color: 0x9a8cff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: i !== 2 }), 0);
  const geo = i === 0 ? new THREE.CylinderGeometry(0.9, 1.0, 1.2, 10, 3, true) : i === 1 ? new THREE.SphereGeometry(0.95, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6) : i === 2 ? new THREE.SphereGeometry(0.45, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2) : new THREE.CylinderGeometry(0.08, 0.12, 1.1, 6);
  g.add(new THREE.Mesh(geo, m));
  return g;
}
