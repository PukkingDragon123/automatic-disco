// The things lying on Unit 07's desk. The station tools are real objects you click instead of switches (a blueprint
// tube for the skill tree, a microscope for the lab, a hard hat for the works catalogue, a clipboard, a radio handset,
// a specimen jar, an ammo crate, binoculars, a magnifier, a family-tree scroll, a paint tin), and a few toys that only
// react: a bobblehead of Dr. Calder, a coffee mug, a lucky die, a desk fan, the calendar, and a guarded self-destruct
// button that refuses. All stand on y = 0 facing +z, sized in art pixels, with a small spring for jostling.
import * as THREE from 'three';
import { mat, tex, box, cyl, lathe, quad, mesh, facet, planarUV, type DeskMat } from './gfx';
import { M, LiveDecal, Spring, DEG } from './kit';
import { R, Pix, text5, textW5, text3s, textW3s, label } from './paint';
import { decal } from './kit';

/** every prop: a root to place, a body that lifts on hover, a spring for jostles */
export class Prop {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly jig = new Spring(0, 140, 8);
  t = 0;
  constructor() { this.root.add(this.body); }
  jostle(k: number) { this.jig.kick((Math.random() - 0.5) * k * 2); }
  update(dt: number) { this.t += dt; const j = this.jig.step(0, dt); this.body.rotation.z = j * 0.08; this.body.position.x = j * 0.4; }
}
const tilted = (g: THREE.BufferGeometry, rx = 0, ry = 0, rz = 0) => { g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); return g; };

// ------------------------------------------------------------------ station tools
export class BlueprintTube extends Prop {
  constructor() {
    super();
    const b = this.body;
    b.add(mesh(tilted(cyl(3.6, 3.6, 24, 10), 0, 0, Math.PI / 2), M('blue', { spec: 0 }), 0, 3.6, 0));
    for (const s of [-1, 1]) b.add(mesh(tilted(cyl(4.1, 4.1, 2.2, 10), 0, 0, Math.PI / 2), M('brass', { spec: 1 }), s * 12.2, 3.6, 0));
    // the drawing rolled up inside, its edge sticking out of one end
    b.add(mesh(tilted(cyl(2.6, 2.6, 5, 10), 0, 0, Math.PI / 2), M('paper'), 15.5, 3.6, 0));
    b.add(mesh(box(4, 0.6, 5), M('paper'), 17, 1.2, 2));
    const l = decal(label('SKILLS', R.bone[5])); l.position.set(-1, 3.6, 3.7); b.add(l);
  }
}
export class Microscope extends Prop {
  constructor() {
    super();
    const b = this.body, ol = M('olive', { spec: 1 }), bk = M('rubber'), br = M('brass', { spec: 1 });
    b.add(mesh(box(13, 2.4, 10), ol, 0, 1.2, 0));
    b.add(mesh(tilted(box(3.4, 14, 3.4), 0.35, 0, 0), ol, 0, 8, -3));
    b.add(mesh(box(9, 1.2, 7), bk, 0, 6, 1.5));
    const tube = new THREE.Group();
    tube.add(mesh(cyl(2.2, 2.2, 12, 8), bk, 0, 0, 0), mesh(cyl(2.6, 2.6, 2.4, 8), br, 0, 6.6, 0), mesh(cyl(1.3, 1.6, 3, 8), br, 0, -7, 0));
    tube.position.set(0, 13, 1.6); tube.rotation.x = -0.32;
    b.add(tube);
    b.add(mesh(tilted(cyl(2.4, 2.4, 6, 8), 0, 0, Math.PI / 2), br, 0, 9, -2.5));
  }
}
export class HardHat extends Prop {
  constructor() {
    super();
    const b = this.body, am = M('amber', { spec: 1 });
    const pts: [number, number][] = []; for (let i = 0; i <= 5; i++) { const a = (i / 5) * Math.PI / 2; pts.push([Math.cos(a) * 7.5, 1.6 + Math.sin(a) * 7.5]); }
    b.add(mesh(lathe(pts, 10), am));
    b.add(mesh(cyl(10, 10, 1.4, 12), am, 0, 0.9, 0));
    b.add(mesh(box(2.2, 2, 15), am, 0, 8.4, 0));
    const l = decal(label('USPC', R.ink[1], false, -1)); l.position.set(0, 4.6, 7.3); l.rotation.x = -0.2; b.add(l);
  }
}
export class Clipboard extends Prop {
  readonly paper: LiveDecal;
  constructor() {
    super();
    const b = this.body;
    const board = new THREE.Group();
    board.add(mesh(box(16, 21, 1.2), M('wood'), 0, 0, 0));
    this.paper = new LiveDecal(14, 17, { flat: 0.6 });
    const p = this.paper.p; p.rect(0, 0, 14, 17, R.paper[5]);
    for (let y = 4; y < 17; y += 3) p.hl(1, 12, y, R.sky[3]);
    // a production chart pencilled on it
    let yy = 14; for (let x = 1; x < 13; x++) { yy = Math.max(5, Math.min(15, yy + ((x * 7) % 3) - 1 - (x > 6 ? 1 : 0))); p.set(x, yy, R.ink[2]); }
    text3s(p, 'OUT', 1, 0, R.ink[2]);
    this.paper.flush();
    this.paper.mesh.position.set(0, -1.5, 0.7); board.add(this.paper.mesh);
    board.add(mesh(box(8, 3, 2.4), M('steel', { spec: 1 }), 0, 9.6, 0.8));
    board.rotation.x = -1.1; board.position.set(0, 2, 0);
    b.add(board);
  }
}
export class Handset extends Prop {
  constructor() {
    super();
    const b = this.body, bk = M('bake', { spec: 1 });
    b.add(mesh(box(16, 4, 9), bk, 0, 2, 0));
    b.add(mesh(box(2, 3, 3), bk, -6, 5, 0), mesh(box(2, 3, 3), bk, 6, 5, 0));
    const h = new THREE.Group();
    h.add(mesh(box(13, 2.6, 3), bk, 0, 0, 0));
    for (const s of [-1, 1]) h.add(mesh(cyl(2.8, 2.4, 3, 8), bk, s * 7, -1.2, 0));
    h.position.set(0, 7.4, 0);
    b.add(h);
    // the dial on the base
    const d = new Pix(7, 7); for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) { const r = Math.hypot(x - 3, y - 3); if (r < 3.6) d.set(x, y, r < 1.3 ? R.bone[4] : (x + y) % 2 ? R.steel[4] : R.steel[2]); }
    const dl = decal(d); dl.position.set(0, 2, 4.6); b.add(dl);
  }
}
export class SpecimenJar extends Prop {
  private thing: THREE.Mesh; private liq: DeskMat;
  constructor() {
    super();
    const b = this.body;
    this.liq = mat({ tint: R.malachite[4], emit: 0.35, flat: 0.4 });
    b.add(mesh(cyl(5.4, 5.4, 1.4, 10), M('brass', { spec: 1 }), 0, 0.7, 0));
    b.add(mesh(cyl(4.5, 4.5, 11, 10), this.liq, 0, 6.8, 0));
    this.thing = mesh(facet(new THREE.IcosahedronGeometry(2.6, 0)), mat({ tint: R.flesh[4], spec: 1 }), 0, 7, 0);
    this.thing.scale.set(1, 0.7, 1.3);
    b.add(this.thing);
    b.add(mesh(cyl(5.2, 5.2, 13, 10, 64, false), mat({ tint: R.sky[5], glass: 0.3, flat: 0.5, side: THREE.DoubleSide }), 0, 7.7, 0));
    b.add(mesh(cyl(5.6, 5.6, 2, 10), M('brass', { spec: 1 }), 0, 15, 0));
    const l = decal(label('BW', R.ink[1], false, -1)); l.position.set(0, 4, 5.5); b.add(l);
  }
  update(dt: number) { super.update(dt); this.thing.rotation.y += dt * 0.5; this.thing.position.y = 7 + Math.sin(this.t * 1.6) * 0.8; this.liq.uniforms.uEmit.value = 0.3 + Math.sin(this.t * 2) * 0.08; }
}
export class AmmoCrate extends Prop {
  constructor() {
    super();
    const b = this.body, wd = M('wood');
    b.add(mesh(box(18, 10, 11), wd, 0, 5, 0));
    const lid = mesh(box(19, 1.6, 11.5), wd, 0, 11, -2); lid.rotation.x = -0.35; b.add(lid);
    for (let i = 0; i < 3; i++) { b.add(mesh(cyl(1.3, 1.3, 6, 8), M('brass', { spec: 1 }), -4 + i * 3.6, 11, 2)); b.add(mesh(cyl(0.6, 1.3, 2, 8), M('copper', { spec: 1 }), -4 + i * 3.6, 15, 2)); }
    b.add(mesh(box(19, 1.4, 11.6), M('steel'), 0, 2, 0), mesh(box(19, 1.4, 11.6), M('steel'), 0, 8, 0));
    const l = decal(label('ORD', R.bone[4])); l.position.set(-2, 5, 5.9); b.add(l);
  }
}
export class Binoculars extends Prop {
  constructor() {
    super();
    const b = this.body, rb = M('rubber'), st = M('steel', { spec: 1 });
    for (const s of [-1, 1]) {
      b.add(mesh(tilted(cyl(2.9, 2.9, 9, 8), Math.PI / 2), rb, s * 3.4, 3.2, 0));
      b.add(mesh(tilted(cyl(3.3, 3.3, 1.6, 8), Math.PI / 2), st, s * 3.4, 3.2, 4.4));
      const g = mesh(new THREE.CircleGeometry(2.4, 8), mat({ tint: R.sapphire[4], spec: 1, flat: 0.2 }), s * 3.4, 3.2, 5.3); b.add(g);
    }
    b.add(mesh(box(4, 2, 5), st, 0, 3.6, -1));
    b.position.y = 0.2;
  }
}
export class Magnifier extends Prop {
  constructor() {
    super();
    const b = this.body;
    const ring = new THREE.Group();
    ring.add(mesh(lathe([[6.4, -0.8], [7.4, -0.8], [7.4, 0.8], [6.4, 0.8]], 14).rotateX(Math.PI / 2), M('brass', { spec: 1 })));
    ring.add(mesh(new THREE.CircleGeometry(6.4, 14), mat({ tint: R.glowTeal[3], glass: 0.4, flat: 0.6 })));
    ring.rotation.x = -1.2; ring.position.set(-3, 2.5, 0);
    b.add(ring);
    b.add(mesh(tilted(cyl(1.4, 1.2, 10, 8), 0, 0, Math.PI / 2 - 0.3), M('bake', { spec: 1 }), 8, 2, 2));
  }
}
export class Scroll extends Prop {
  constructor() {
    super();
    const b = this.body;
    b.add(mesh(tilted(cyl(3, 3, 20, 10), 0, 0, Math.PI / 2), M('paper'), 0, 3, -3));
    for (const s of [-1, 1]) b.add(mesh(tilted(cyl(1.2, 1.2, 3, 6), 0, 0, Math.PI / 2), M('wood'), s * 11.4, 3, -3));
    // the unrolled sheet with the family tree inked on it
    const p = new Pix(18, 10); p.rect(0, 0, 18, 10, R.paper[4]);
    const ink = R.ink[2];
    p.vl(9, 1, 3, ink); p.hl(4, 14, 3, ink); for (const x of [4, 9, 14]) p.vl(x, 3, 5, ink); p.hl(2, 6, 6, ink); p.vl(2, 6, 8, ink); p.vl(6, 6, 8, ink); p.hl(12, 16, 6, ink); p.vl(12, 6, 8, ink); p.vl(16, 6, 8, ink);
    for (const [x, y] of [[9, 1], [4, 5], [9, 5], [14, 5], [2, 8], [6, 8], [12, 8], [16, 8]]) p.set(x, y, R.stampRed[3]);
    const sheet = new THREE.Mesh(quad(18, 10), mat({ map: tex(p), flat: 0.5 }));
    sheet.rotation.x = -Math.PI / 2 + 0.15; sheet.position.set(0, 0.6, 3);
    b.add(sheet);
  }
}
export class PaintTin extends Prop {
  constructor() {
    super();
    const b = this.body;
    b.add(mesh(cyl(5, 5, 9, 10), M('steel', { spec: 1 }), 0, 4.5, 0));
    b.add(mesh(cyl(5.15, 5.15, 4, 10, 64, false), M('olive'), 0, 4.5, 0));
    b.add(mesh(cyl(4.6, 4.6, 0.6, 10), mat({ tint: R.olive[3] }), 0, 9.1, 0));
    const br = new THREE.Group();
    br.add(mesh(box(2.6, 1.2, 9), M('wood'), 0, 0, 0), mesh(box(3, 1.6, 3), M('steel', { spec: 1 }), 0, 0, 5.4), mesh(box(2.8, 1.4, 2.4), mat({ tint: R.olive[4] }), 0, 0, 7.8));
    br.position.set(0, 10, 0); br.rotation.y = 0.5;
    b.add(br);
  }
}
export class Horn extends Prop {
  constructor() {
    super();
    const b = this.body, br = M('brass', { spec: 1 });
    b.add(mesh(lathe([[0.9, 0], [1, 6], [1.6, 10], [3.2, 13], [5.2, 14.6]], 10).rotateZ(-Math.PI / 2), br, -7, 4, 0));
    b.add(mesh(box(3, 3, 3), M('bake'), -8, 2, 0), mesh(box(2, 3, 4), M('steel'), 0, 1.5, 0));
  }
}

// ------------------------------------------------------------------ toys
export class Bobblehead extends Prop {
  readonly head = new THREE.Group(); private hs = new Spring(0, 70, 2.2); private hs2 = new Spring(0, 60, 2);
  constructor() {
    super();
    const b = this.body;
    b.add(mesh(cyl(4.5, 5, 2, 10), M('bake', { spec: 1 }), 0, 1, 0));
    b.add(mesh(lathe([[3.4, 0], [3.6, 4], [3, 7], [1.2, 8.4]], 8), M('cream'), 0, 2, 0)); // the lab coat
    b.add(mesh(box(1.2, 3, 1), mat({ tint: R.stampRed[2] }), 0, 7, 2.8)); // a tie
    // the head: big, on a spring
    const hd = this.head;
    hd.add(mesh(facet(new THREE.IcosahedronGeometry(4.3, 1)), mat({ tint: R.hide[4], spec: 0 }), 0, 4, 0));
    hd.add(mesh(box(7, 2.2, 6), mat({ tint: R.stone[5] }), 0, 7.6, -0.6)); // grey hair
    const face = new Pix(8, 6);
    for (const x of [1, 5]) { face.rect(x, 1, 2, 2, R.ink[1]); face.set(x, 0, R.ink[1]); face.set(x + 1, 0, R.ink[1]); face.set(x, 3, R.ink[1]); face.set(x + 1, 3, R.ink[1]); face.set(x - 1, 1, R.ink[1]); face.set(x + 2, 2, R.ink[1]); }
    face.hl(3, 4, 1, R.ink[1]); face.hl(2, 5, 5, R.stone[4]); face.set(1, 1, R.snow[5]); face.set(5, 1, R.snow[5]);
    const fd = new THREE.Mesh(quad(8, 6), mat({ map: tex(face), flat: 0.6 })); fd.position.set(0, 4, 4.1); hd.add(fd);
    hd.position.set(0, 10.5, 0);
    b.add(hd);
  }
  jostle(k: number) { super.jostle(k * 0.4); this.hs.kick((Math.random() - 0.5) * k * 6); this.hs2.kick((Math.random() - 0.5) * k * 5); }
  bob() { this.hs.kick(5); this.hs2.kick(-3); }
  update(dt: number) { super.update(dt); this.head.rotation.z = this.hs.step(0, dt) * 0.12; this.head.rotation.x = this.hs2.step(0, dt) * 0.1; }
}
export class Mug extends Prop {
  private coffee = new THREE.Group(); private sl = new Spring(0, 50, 2.5); private sl2 = new Spring(0, 45, 2.5);
  private steam: THREE.Mesh[] = [];
  constructor() {
    super();
    const b = this.body, cm = M('cream', { spec: 1 });
    b.add(mesh(lathe([[3.8, 0], [4.2, 0.6], [4.4, 8], [4, 8.6], [3.6, 8.4]], 10), cm));
    b.add(mesh(cyl(4.48, 4.48, 1.4, 10, 64, false), mat({ tint: R.stampRed[3] }), 0, 6.2, 0));
    b.add(mesh(box(1.4, 5, 2), cm, 5, 4.6, 0), mesh(box(2.6, 1.4, 2), cm, 4.4, 7.2, 0), mesh(box(2.6, 1.4, 2), cm, 4.4, 2.2, 0));
    this.coffee.add(mesh(cyl(3.7, 3.7, 0.8, 10), mat({ tint: R.soil[2], spec: 1 })));
    this.coffee.position.y = 7.4;
    b.add(this.coffee);
    const sp = new Pix(3, 6); for (let y = 0; y < 6; y++) sp.set(y % 3 === 1 ? 2 : y % 3 === 2 ? 1 : 0, y, R.snow[4]);
    for (let i = 0; i < 2; i++) { const s = new THREE.Mesh(quad(3, 6), mat({ map: tex(sp), flat: 1, outline: false })); s.position.set(-1.4 + i * 2.6, 11, 0); b.add(s); this.steam.push(s); }
  }
  jostle(k: number) { super.jostle(k * 0.2); this.sl.kick((Math.random() - 0.5) * k * 8); this.sl2.kick((Math.random() - 0.5) * k * 8); }
  update(dt: number) {
    super.update(dt);
    this.coffee.rotation.z = this.sl.step(0, dt) * 0.08; this.coffee.rotation.x = this.sl2.step(0, dt) * 0.08;
    this.steam.forEach((s, i) => { const u = (this.t * 0.5 + i * 0.5) % 1; s.position.y = 10 + u * 7; s.visible = u < 0.8; s.position.x = -1.4 + i * 2.6 + Math.sin(this.t * 2 + i) * 0.8; });
  }
}
/** pips on six faces: 1 opposite 6, 2 opposite 5, 3 opposite 4 */
function dieGeo() {
  const S = 7, p = new Pix(S * 6, S), pip: Record<number, [number, number][]> = { 1: [[3, 3]], 2: [[1, 1], [5, 5]], 3: [[1, 1], [3, 3], [5, 5]], 4: [[1, 1], [5, 1], [1, 5], [5, 5]], 5: [[1, 1], [5, 1], [3, 3], [1, 5], [5, 5]], 6: [[1, 1], [1, 3], [1, 5], [5, 1], [5, 3], [5, 5]] };
  for (let f = 0; f < 6; f++) { p.rect(f * S, 0, S, S, R.bone[5]); p.hl(f * S, f * S + S - 1, S - 1, R.bone[3]); for (const [x, y] of pip[f + 1]) p.set(f * S + x, y, f === 0 ? R.stampRed[3] : R.ink[1]); }
  const g = new THREE.BoxGeometry(5, 5, 5), uv = g.attributes.uv as THREE.BufferAttribute;
  // BoxGeometry faces: +x, -x, +y, -y, +z, -z  ->  1, 6, 2, 5, 3, 4
  const faceVal = [1, 6, 2, 5, 3, 4];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setX(i, (faceVal[f] - 1 + uv.getX(i)) / 6); }
  return { g: facet(g), t: tex(p), faceVal };
}
export class Die extends Prop {
  private cube: THREE.Mesh; private vy = 0; private h = 0; private spin = new THREE.Vector3(); private settle: THREE.Quaternion | null = null;
  rolled = 0;
  constructor() {
    super();
    const d = dieGeo();
    this.cube = new THREE.Mesh(d.g, mat({ map: d.t, spec: 1 }));
    this.cube.position.y = 2.5; this.cube.rotation.set(0.0, 0.5, 0);
    this.body.add(this.cube);
  }
  /** toss it: it spins up, bounces and lands on a random face (returned) */
  roll(): number {
    this.vy = 32 + Math.random() * 10; this.spin.set(Math.random() * 18 - 9, Math.random() * 12 - 6, Math.random() * 18 - 9); this.settle = null;
    this.rolled = 1 + Math.floor(Math.random() * 6);
    return this.rolled;
  }
  jostle(k: number) { if (this.h <= 0.01 && k > 0.5) { this.vy = 6 * k; this.spin.set(Math.random() * 4 - 2, Math.random() * 3, Math.random() * 4 - 2); this.settle = null; this.rolled = 0; } }
  update(dt: number) {
    super.update(dt);
    if (this.vy !== 0 || this.h > 0) {
      this.vy -= 140 * dt; this.h += this.vy * dt;
      this.cube.rotation.x += this.spin.x * dt; this.cube.rotation.y += this.spin.y * dt; this.cube.rotation.z += this.spin.z * dt;
      if (this.h <= 0) { this.h = 0; if (this.vy < -8) { this.vy = -this.vy * 0.35; this.spin.multiplyScalar(0.5); } else { this.vy = 0; this.spin.set(0, 0, 0); this.settle = this.faceUp(this.rolled); } }
    } else if (this.settle) { this.cube.quaternion.slerp(this.settle, Math.min(1, dt * 14)); }
    this.cube.position.y = 2.5 + this.h;
  }
  /** the orientation that shows face n on top (keeping its spin about y) */
  private faceUp(n: number) {
    const up: Record<number, THREE.Euler> = { 1: new THREE.Euler(0, 0, Math.PI / 2), 6: new THREE.Euler(0, 0, -Math.PI / 2), 2: new THREE.Euler(0, 0, 0), 5: new THREE.Euler(Math.PI, 0, 0), 3: new THREE.Euler(-Math.PI / 2, 0, 0), 4: new THREE.Euler(Math.PI / 2, 0, 0) };
    const target = new THREE.Quaternion().setFromEuler(n ? up[n] : new THREE.Euler(0, 0, 0));
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.cube.rotation.y, 0)).multiply(target);
  }
}
export class Fan extends Prop {
  private rotor = new THREE.Group(); private head = new THREE.Group(); private w = 0;
  speed = 1;
  constructor() {
    super();
    const b = this.body, st = M('steel', { spec: 1 }), ol = M('olive', { spec: 1 });
    b.add(mesh(cyl(5, 5.6, 2, 10), ol, 0, 1, 0), mesh(cyl(1, 1, 7, 6), st, 0, 5, 0));
    this.head.add(mesh(tilted(cyl(2.6, 2.6, 4, 8), Math.PI / 2), ol, 0, 0, -2.4));
    for (let i = 0; i < 3; i++) { const bl = mesh(box(2.6, 6, 0.4), mat({ tint: R.steel[4], spec: 1 }), 0, 3, 0); const piv = new THREE.Group(); piv.add(bl); piv.rotation.z = (i / 3) * Math.PI * 2; bl.rotation.y = 0.5; this.rotor.add(piv); }
    this.rotor.position.z = 0.6; this.head.add(this.rotor);
    // the guard: wire rings front and back
    for (const z of [-0.6, 1.8]) this.head.add(mesh(lathe([[7.2, -0.3], [7.6, -0.3], [7.6, 0.3], [7.2, 0.3]], 14).rotateX(Math.PI / 2), st, 0, 0, z));
    this.head.add(mesh(box(0.5, 14.8, 0.4), st, 0, 0, 1.8), mesh(box(14.8, 0.5, 0.4), st, 0, 0, 1.8));
    this.head.position.set(0, 10.5, 0);
    b.add(this.head);
  }
  update(dt: number) {
    super.update(dt);
    this.w += ((this.speed * 22) - this.w) * Math.min(1, dt * 1.5);
    this.rotor.rotation.z += this.w * dt;
    this.head.rotation.y = Math.sin(this.t * 0.6) * 0.5 * Math.min(1, this.speed);
  }
}
const SEASON_ART: Record<string, [number, number, number]> = { // sky, ground, accent
  thaw: [R.sky[4], R.teal[3], R.snow[5]], bloom: [R.sky[5], R.moss[4], R.coral[5]], highsun: [R.straw[5], R.ochre[4], R.gold[6]], monsoon: [R.slate[3], R.teal[2], R.water[5]],
  eclipse: [R.violet[1], R.violet[3], R.snow[5]], ember: [R.rust[3], R.soil[3], R.rust[6]], bloodtide: [R.plum[2], R.coral[2], R.stampRed[3]], frost: [R.snow[2], R.snow[4], R.sky[5]],
};
export class Calendar extends Prop {
  readonly page: LiveDecal; private flip = new Spring(0, 90, 7); private card = new THREE.Group();
  constructor() {
    super();
    const b = this.body;
    this.card.add(mesh(box(19, 25, 0.8), M('cream'), 0, 0, 0));
    this.page = new LiveDecal(17, 23, { flat: 0.55 });
    this.card.add(this.page.mesh);
    this.card.add(mesh(box(19, 2, 1.6), M('steel', { spec: 1 }), 0, 12.4, 0.2));
    this.card.position.set(0, 11.5, 0); this.card.rotation.x = -0.18;
    b.add(this.card, mesh(box(4, 1, 10), M('steel'), 0, 0.5, -3));
  }
  /** a page per season: a little painted pin-up of the season's land, the day in big type */
  show(season: string, name: string, day: number) {
    const key = season + day; if (this.page.key === key) return;
    const was = this.page.key; this.page.key = key;
    const p = this.page.p, [sky, gnd, acc] = SEASON_ART[season] ?? SEASON_ART.bloom;
    this.page.clear(R.paper[5]);
    p.rect(1, 1, 15, 11, sky);
    for (let x = 1; x < 16; x++) { const h = 8 + Math.round(Math.sin(x * 0.7 + season.length) * 1.5); p.vl(x, h, 11, gnd); }
    p.rect(11, 2, 3, 3, acc); p.set(12, 1, acc); p.set(10, 3, acc);
    // a little figure in the land: the pin-up of the month is a Corps survey robot waving
    p.rect(5, 6, 2, 3, R.steel[4]); p.set(5, 5, R.steel[5]); p.set(6, 5, R.glowTeal[3]); p.set(7, 5, R.steel[4]); p.set(4, 6, R.steel[3]);
    const nm = name.toUpperCase().slice(0, 4); text3s(p, nm, Math.round((17 - textW3s(nm)) / 2), 13, R.ink[2]);
    const ds = String(day); text5(p, ds, Math.round((17 - textW5(ds)) / 2), 15 + 0, R.stampRed[3]);
    this.page.flush();
    if (was) this.flip.kick(12);
  }
  jostle(k: number) { super.jostle(k); this.flip.kick(k * 2); }
  update(dt: number) { super.update(dt); this.card.rotation.x = -0.18 - Math.max(-0.4, Math.min(0.8, this.flip.step(0, dt) * 0.05)); }
}
/** the self-destruct: a red button under a hinged guard, on hazard paint. It will not do it. */
export class SelfDestruct extends Prop {
  readonly guard = new THREE.Group(); private gs = new Spring(0, 80, 9); readonly btn: DeskMat; private bs = new Spring(0, 200, 12);
  open = false; private btnG = new THREE.Group(); private refuse = 0;
  constructor() {
    super();
    const b = this.body;
    const hz = new Pix(16, 16); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) hz.set(x, y, ((x + y) >> 2) % 2 ? R.ochre[5] : R.ink[1]);
    b.add(mesh(planarUV(box(16, 2, 13), 16), mat({ map: tex(hz), spec: 0 }), 0, 1, 0));
    this.btn = mat({ tint: R.stampRed[3], spec: 1 });
    this.btnG.add(mesh(cyl(3.8, 4.2, 3, 10), this.btn, 0, 1.5, 0));
    this.btnG.position.set(0, 2, 0);
    b.add(this.btnG, mesh(cyl(5, 5, 1, 10), M('steel', { spec: 1 }), 0, 2.4, 0));
    // the guard: clear plastic box hinged at the back
    const gm = mat({ tint: R.sky[5], glass: 0.35, flat: 0.5, side: THREE.DoubleSide });
    this.guard.add(mesh(box(12, 6, 11), gm, 0, 3, 5.5));
    this.guard.position.set(0, 2.2, -5.5);
    b.add(this.guard, mesh(box(13, 2, 2), M('steel'), 0, 2.6, -5.6));
    const l = decal(label('DESTRUCT', R.stampRed[3], false, R.ink[0])); l.rotation.x = -Math.PI / 2; l.position.set(0, 2.05, 5.4); b.add(l);
  }
  toggleGuard() { this.open = !this.open; this.gs.kick(this.open ? -6 : 6); }
  press() { this.bs.kick(-40); this.refuse = 1.6; }
  update(dt: number) {
    super.update(dt);
    this.guard.rotation.x = this.gs.step(this.open ? -1.9 : 0, dt);
    this.btnG.position.y = 2 + this.bs.step(0, dt) * 0.08;
    this.refuse = Math.max(0, this.refuse - dt);
    (this.btn.uniforms.uGlow.value as THREE.Color).setRGB(this.refuse > 0 && Math.floor(this.refuse * 8) % 2 ? 0.5 : 0, 0, 0);
  }
}
export const _deg = DEG;
