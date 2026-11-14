// The machines as geometry: boxes, prisms and frusta in the texture-array material (tex.ts), one tile per world
// unit so plates, bricks and planks read at the same scale everywhere. Each model is a static body plus a few moving
// parts (drill shafts, press heads, flywheels, pump beams, turret heads) that are instanced separately and animated
// around a pivot. Local frame: origin at the footprint centre on the ground, +z forward (the output face).
import * as THREE from 'three';
import { L, labelLayer } from './tex';
import type { FKind } from './defs';

type V3 = [number, number, number];
interface BoxO { rx?: number; ry?: number; rz?: number; glow?: number; uv?: number; label?: boolean }
export class MG {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; lay: number[] = []; glw: number[] = [];
  private q = new THREE.Quaternion(); private e = new THREE.Euler(); private v = new THREE.Vector3(); private n = new THREE.Vector3();
  private push(p: THREE.Vector3, n: THREE.Vector3, u: number, v: number, layer: number, glow: number) {
    this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.uv.push(u, v); this.lay.push(layer); this.glw.push(glow);
  }
  /** a quad from four corners (counter-clockwise seen from outside) with uv extents */
  quad(c: V3, a: V3[], u0: number, v0: number, u1: number, v1: number, layer: number, glow = 0) {
    const p = a.map((x) => new THREE.Vector3(x[0] + c[0], x[1] + c[1], x[2] + c[2]));
    const n = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[2], p[0])).normalize();
    const uvs = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    for (const i of [0, 1, 2, 0, 2, 3]) this.push(p[i], n, uvs[i][0], uvs[i][1], layer, glow);
  }
  box(c: V3, s: V3, layer: number, o: BoxO = {}) {
    this.e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0); this.q.setFromEuler(this.e);
    const hs = [s[0] / 2, s[1] / 2, s[2] / 2], k = o.uv ?? 1;
    // faces: normal, u axis, v axis
    const F: [V3, V3, V3][] = [[[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]], [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]]];
    for (const [n, u, w] of F) {
      const su = Math.abs(u[0]) * s[0] + Math.abs(u[1]) * s[1] + Math.abs(u[2]) * s[2], sv = Math.abs(w[0]) * s[0] + Math.abs(w[1]) * s[1] + Math.abs(w[2]) * s[2];
      const corner = (a: number, b: number) => this.v.set((n[0] + u[0] * a + w[0] * b) * hs[0], (n[1] + u[1] * a + w[1] * b) * hs[1], (n[2] + u[2] * a + w[2] * b) * hs[2]).applyQuaternion(this.q).add(new THREE.Vector3(...c)).clone();
      const P = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
      const N = this.n.set(n[0], n[1], n[2]).applyQuaternion(this.q).clone();
      const lab = o.label && n[2] === 1;
      const lay = lab ? layer : o.label ? L.OLIVE : layer;
      const U1 = lab ? 1 : su * k, V1 = lab ? 1 : sv * k;
      const uvs = [[0, 0], [U1, 0], [U1, V1], [0, V1]];
      for (const i of [0, 1, 2, 0, 2, 3]) this.push(P[i], N, uvs[i][0], uvs[i][1], lay, o.glow ?? 0);
    }
  }
  /** an n-sided prism / frustum along an axis (radius r0 at the bottom, r1 at the top), capped */
  cyl(c: V3, r0: number, h: number, layer: number, o: { r1?: number; n?: number; axis?: 'x' | 'y' | 'z'; cap?: number; glow?: number; rot?: number; open?: boolean } = {}) {
    const n = o.n ?? 8, r1 = o.r1 ?? r0, ax = o.axis ?? 'y', rot = o.rot ?? Math.PI / n;
    const map = (x: number, y: number, z: number): THREE.Vector3 => ax === 'y' ? new THREE.Vector3(x, y, z) : ax === 'x' ? new THREE.Vector3(y, -x, z) : new THREE.Vector3(x, z, y);
    const C = new THREE.Vector3(...c);
    const per = 2 * Math.PI * Math.max(r0, r1);
    for (let i = 0; i < n; i++) {
      const a0 = rot + (i / n) * Math.PI * 2, a1 = rot + ((i + 1) / n) * Math.PI * 2;
      const p = [map(Math.cos(a0) * r0, -h / 2, Math.sin(a0) * r0), map(Math.cos(a1) * r0, -h / 2, Math.sin(a1) * r0), map(Math.cos(a1) * r1, h / 2, Math.sin(a1) * r1), map(Math.cos(a0) * r1, h / 2, Math.sin(a0) * r1)].map((v) => v.add(C));
      const am = (a0 + a1) / 2, nn = map(Math.cos(am), (r0 - r1) / h, Math.sin(am)).normalize();
      const u0 = (i / n) * per, u1 = ((i + 1) / n) * per;
      const uvs = [[u0, 0], [u1, 0], [u1, h], [u0, h]];
      for (const k of [0, 2, 1, 0, 3, 2]) this.push(p[k], nn, uvs[k][0], uvs[k][1], layer, o.glow ?? 0);
      if (!o.open) for (const [yy, rr, sgn] of [[h / 2, r1, 1], [-h / 2, r0, -1]] as const) {
        if (rr <= 0.001) continue;
        const q0 = map(Math.cos(a0) * rr, yy, Math.sin(a0) * rr).add(C), q1 = map(Math.cos(a1) * rr, yy, Math.sin(a1) * rr).add(C), cc = map(0, yy, 0).add(C);
        const cn = map(0, sgn, 0);
        const tri = sgn > 0 ? [cc, q1, q0] : [cc, q0, q1];
        for (const t of tri) { const l = t.clone().sub(C); this.push(t, cn, ax === 'y' ? l.x : l.z, ax === 'y' ? l.z : l.y, o.cap ?? layer, o.glow ?? 0); }
      }
    }
  }
  /** a sloped hopper: square frustum */
  hopper(c: V3, s0: number, s1: number, h: number, layer: number) { this.cyl(c, s0 * 0.7071, h, layer, { r1: s1 * 0.7071, n: 4, rot: Math.PI / 4 }); }
  /** a ladder up a face */
  ladder(x: number, z: number, y0: number, y1: number, ry = 0) {
    const s = Math.sin(ry), c = Math.cos(ry);
    for (const o of [-0.13, 0.13]) this.box([x + c * o, (y0 + y1) / 2, z - s * o], [0.04, y1 - y0, 0.04], L.STEEL, { ry });
    for (let y = y0 + 0.2; y < y1; y += 0.25) this.box([x, y, z], [0.26, 0.03, 0.03], L.STEEL, { ry });
  }
  /** a bolted label plate facing +z (or rotated) */
  label(c: V3, w: number, h: number, name: string, ry = 0) { this.box(c, [w, h, 0.04], labelLayer(name), { ry, label: true }); }
  /** the status lamp: a small cage with a lens that takes the instance's status colour */
  lamp(c: V3) {
    this.box([c[0], c[1] - 0.09, c[2]], [0.1, 0.06, 0.1], L.GUN);
    this.box([c[0], c[1], c[2]], [0.13, 0.13, 0.13], L.LAMP, { glow: 2 });
    this.box([c[0], c[1] + 0.09, c[2]], [0.16, 0.04, 0.16], L.GUN);
  }
  geo(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aLayer', new THREE.Float32BufferAttribute(this.lay, 1));
    g.setAttribute('aGlow', new THREE.Float32BufferAttribute(this.glw, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

export interface Part { geo: THREE.BufferGeometry; pivot: V3; mode: 'spin' | 'bob' | 'rock' | 'yaw' | 'press'; axis: 'x' | 'y' | 'z'; speed: number; amp?: number }
export interface Model { base: THREE.BufferGeometry; parts: Part[]; lamp: V3; smoke?: V3[]; carry?: V3 }

function part(build: (m: MG) => void, pivot: V3, mode: Part['mode'], axis: Part['axis'], speed: number, amp?: number): Part {
  const m = new MG(); build(m);
  const g = m.geo(); g.translate(-pivot[0], -pivot[1], -pivot[2]);
  return { geo: g, pivot, mode, axis, speed, amp };
}
/** a concrete pad under every machine (it sits on its foundation) */
function pad(m: MG, w: number, d: number, h = 0.18) {
  m.box([0, h / 2 - 0.06, 0], [w - 0.04, h + 0.12, d - 0.04], L.CONCRETE);
  // hazard-painted kerb along the output face
  m.box([0, h + 0.005, d / 2 - 0.1], [w - 0.2, 0.012, 0.14], L.HAZARD);
}
/** an output chute on the front face */
function chute(m: MG, x: number, y: number, d: number) {
  m.box([x, y, d / 2 - 0.12], [0.42, 0.06, 0.34], L.STEEL, { rx: 0.35 });
  m.box([x - 0.22, y + 0.06, d / 2 - 0.12], [0.03, 0.14, 0.34], L.GUN, { rx: 0.35 });
  m.box([x + 0.22, y + 0.06, d / 2 - 0.12], [0.03, 0.14, 0.34], L.GUN, { rx: 0.35 });
}
/** an intake hopper on the back face */
function intake(m: MG, x: number, y: number, d: number) {
  m.hopper([x, y, -d / 2 + 0.22], 0.34, 0.5, 0.3, L.GUN);
  m.box([x, y + 0.16, -d / 2 + 0.22], [0.52, 0.03, 0.52], L.HAZARD);
}

const MODELS: Partial<Record<string, (tier: number) => Model>> = {
  depot: () => {
    const m = new MG(); pad(m, 2, 2);
    m.box([0, 0.55, 0], [1.5, 0.7, 1.5], L.OLIVE);
    m.box([0, 0.93, 0], [1.6, 0.06, 1.6], L.STEEL);
    m.hopper([0, 1.15, 0], 1.0, 1.5, 0.4, L.GUN);
    m.box([0, 1.36, 0], [1.52, 0.04, 1.52], L.HAZARD);
    for (const [x, z, r] of [[0, 0.78, 0], [0, -0.78, Math.PI], [0.78, 0, Math.PI / 2], [-0.78, 0, -Math.PI / 2]] as const) m.box([x, 0.35, z], [0.5, 0.25, 0.12], L.HAZARD, { ry: r });
    m.label([0, 0.55, 0.76], 0.8, 0.5, 'CORE UPLINK');
    m.cyl([0.62, 1.7, -0.62], 0.04, 1.6, L.COPPER, { n: 6 });
    for (let k = 0; k < 3; k++) m.box([0.62, 1.4 + k * 0.4, -0.62], [0.28 - k * 0.06, 0.03, 0.03], L.COPPER);
    m.lamp([0.62, 2.56, -0.62]);
    return { base: m.geo(), parts: [], lamp: [0.62, 2.56, -0.62] };
  },
  miner: (tier) => {
    const m = new MG(); pad(m, 2, 2);
    const H = 2.1 + tier * 0.3, body = tier === 3 ? L.CREAM : tier === 2 ? L.RED : L.OLIVE;
    m.box([0, 0.33, 0], [1.8, 0.3, 1.8], L.TREAD);
    m.box([0, 0.33, 0], [0.5, 0.31, 0.5], L.INK);
    for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) m.box([x, 0.5 + (H - 0.5) / 2, z], [0.12, H - 0.5, 0.12], L.GUN, { rx: z * -0.08, rz: x * 0.08 });
    for (const y of [1.1, H - 0.4]) { m.box([0, y, -0.66], [1.4, 0.07, 0.07], L.GUN); m.box([0, y, 0.66], [1.4, 0.07, 0.07], L.GUN); m.box([-0.66, y, 0], [0.07, 0.07, 1.4], L.GUN); m.box([0.66, y, 0], [0.07, 0.07, 1.4], L.GUN); }
    m.box([0, 0.8, -0.66], [1.3, 0.05, 0.05], L.GUN, { rz: 0.55 }); m.box([0, 0.8, 0.66], [1.3, 0.05, 0.05], L.GUN, { rz: -0.55 });
    m.box([0, H, 0], [1.0, 0.6, 1.0], body);
    m.box([0, H + 0.33, 0], [1.08, 0.06, 1.08], L.STEEL);
    m.box([0.52, H, 0], [0.02, 0.36, 0.6], L.GRILLE);
    m.label([0, H, 0.51], 0.5, 0.36, 'MINER');
    if (tier >= 2) { m.cyl([-0.35, H + 0.6, -0.25], 0.16, 0.5, L.CREAM, { n: 8 }); m.cyl([0.3, H + 0.55, -0.3], 0.08, 0.4, L.COPPER, { n: 6 }); }
    if (tier >= 3) m.box([0, H - 0.36, 0], [1.1, 0.1, 1.1], L.HAZARD);
    chute(m, 0.45, 0.7, 2);
    m.box([0.45, 0.55, 0.5], [0.3, 0.3, 0.3], L.GUN);
    m.lamp([-0.42, H + 0.45, 0.42]);
    const drill = part((p) => {
      p.cyl([0, H / 2 + 0.1, 0], 0.08, H - 0.2, L.STEEL, { n: 6 });
      for (let y = 0.4; y < H - 0.4; y += 0.22) p.box([0, y, 0], [0.26, 0.04, 0.06], L.STEEL, { ry: y * 3.1 });
      p.cyl([0, 0.15, 0], 0.18, 0.3, L.RUST, { r1: 0.04, n: 6 });
    }, [0, 0, 0], 'spin', 'y', 6 + tier * 3);
    return { base: m.geo(), parts: [drill], lamp: [-0.42, H + 0.45, 0.42], smoke: tier === 3 ? [[-0.35, H + 0.9, -0.25]] : undefined };
  },
  pump: () => {
    const m = new MG(); pad(m, 2, 2, 0.12);
    m.box([0, 0.35, -0.5], [1.2, 0.5, 0.8], L.OLIVE);
    m.cyl([0.55, 0.62, 0.35], 0.32, 0.9, L.CREAM, { n: 8 });
    m.cyl([0.55, 1.12, 0.35], 0.32, 0.12, L.STEEL, { r1: 0.2, n: 8 });
    m.box([-0.2, 0.95, 0], [0.12, 1.2, 0.12], L.GUN, { rz: 0.25 }); m.box([0.2, 0.95, 0], [0.12, 1.2, 0.12], L.GUN, { rz: -0.25 });
    m.box([0, 1.58, 0], [0.5, 0.1, 0.2], L.STEEL);
    m.cyl([-0.4, 0.3, 0.55], 0.1, 0.5, L.COPPER, { n: 6 });
    m.label([0, 0.4, -0.09], 0.5, 0.32, 'WATER PUMP');
    chute(m, -0.4, 0.5, 2);
    m.lamp([-0.5, 0.75, -0.5]);
    const beam = part((p) => {
      p.box([0, 1.7, 0], [0.12, 0.14, 1.9], L.RED);
      p.box([0, 1.6, 0.95], [0.16, 0.5, 0.18], L.GUN, { rx: 0.2 });
      p.box([0, 1.6, -0.9], [0.3, 0.3, 0.3], L.RUST);
      p.box([0, 1.0, 0.95], [0.04, 1.1, 0.04], L.STEEL);
    }, [0, 1.65, 0], 'rock', 'x', 1.6, 0.28);
    return { base: m.geo(), parts: [beam], lamp: [-0.5, 0.75, -0.5] };
  },
  excavator: () => {
    const m = new MG(); pad(m, 2, 2, 0.12);
    m.box([0, 0.5, -0.35], [1.3, 0.7, 1.0], L.OLIVE);
    m.box([0, 0.9, -0.35], [1.36, 0.06, 1.06], L.STEEL);
    m.box([0.69, 0.5, -0.35], [0.02, 0.4, 0.7], L.GRILLE);
    m.box([0, 1.05, -0.6], [0.5, 0.3, 0.4], L.CREAM);
    m.box([0, 1.12, -0.38], [0.44, 0.18, 0.04], L.GLASS);
    m.box([-0.55, 0.75, 0.35], [0.1, 0.9, 0.12], L.GUN, { rx: -0.4 }); m.box([0.55, 0.75, 0.35], [0.1, 0.9, 0.12], L.GUN, { rx: -0.4 });
    m.label([0, 0.55, 0.16], 0.5, 0.32, 'EXCAVATOR');
    chute(m, 0.6, 0.45, 2);
    m.lamp([0.5, 1.1, -0.75]);
    const wheel = part((p) => {
      p.cyl([0, 1.0, 0.62], 0.62, 0.16, L.RUST, { axis: 'x', n: 8 });
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; p.box([0, 1.0 + Math.sin(a) * 0.62, 0.62 + Math.cos(a) * 0.62], [0.36, 0.18, 0.18], L.STEEL, { rx: -a }); }
      p.cyl([0, 1.0, 0.62], 0.1, 0.5, L.GUN, { axis: 'x', n: 6 });
    }, [0, 1.0, 0.62], 'spin', 'x', 2.4);
    return { base: m.geo(), parts: [wheel], lamp: [0.5, 1.1, -0.75] };
  },
  belt: () => {
    const m = new MG();
    beltBody(m, 'straight');
    return { base: m.geo(), parts: [], lamp: [0, -9, 0] };
  },
  smelter: () => {
    const m = new MG(); pad(m, 2, 2);
    m.box([0, 0.75, -0.05], [1.6, 1.2, 1.5], L.BRICK);
    m.box([0, 1.4, -0.05], [1.7, 0.1, 1.6], L.STEEL);
    for (const y of [0.45, 1.05]) m.box([0, y, -0.05], [1.64, 0.06, 1.54], L.RUST);
    m.box([0, 1.6, -0.05], [1.3, 0.3, 1.2], L.BRICK);
    m.cyl([-0.5, 2.25, -0.45], 0.2, 1.4, L.BRICK, { n: 6, r1: 0.16 });
    m.cyl([-0.5, 2.98, -0.45], 0.2, 0.08, L.RUST, { n: 6 });
    m.box([0.25, 0.75, 0.71], [0.6, 0.45, 0.04], L.GLASS, { glow: 1 });
    m.box([0.25, 0.75, 0.70], [0.74, 0.58, 0.02], L.GUN);
    m.label([-0.48, 0.95, 0.71], 0.42, 0.3, 'SMELTER');
    intake(m, 0, 1.75, 2);
    chute(m, 0.25, 0.4, 2);
    m.lamp([0.6, 1.62, 0.5]);
    return { base: m.geo(), parts: [], lamp: [0.6, 1.62, 0.5], smoke: [[-0.5, 3.05, -0.45]] };
  },
  foundry: () => {
    const m = new MG(); pad(m, 3, 3);
    for (const x of [-0.75, 0.75]) {
      m.box([x, 0.9, -0.2], [1.25, 1.5, 1.8], L.BRICK);
      m.box([x, 1.7, -0.2], [1.3, 0.1, 1.85], L.STEEL);
      m.cyl([x, 2.6, -0.8], 0.24, 1.8, L.BRICK, { n: 6, r1: 0.18 });
      m.box([x, 0.8, 0.71], [0.5, 0.45, 0.04], L.GLASS, { glow: 1 });
    }
    m.box([0, 0.6, 1.0], [2.2, 0.5, 0.7], L.OLIVE);
    m.label([0, 0.6, 1.36], 0.7, 0.4, 'FOUNDRY');
    m.box([0, 2.1, 0.2], [2.6, 0.1, 0.1], L.GUN); m.box([-1.3, 1.1, 0.2], [0.1, 2.0, 0.1], L.GUN); m.box([1.3, 1.1, 0.2], [0.1, 2.0, 0.1], L.GUN);
    intake(m, -0.75, 1.9, 3); intake(m, 0.75, 1.9, 3);
    chute(m, 0, 0.85, 3);
    m.lamp([1.1, 1.0, 1.2]);
    const ladle = part((p) => { p.box([0, 1.85, 0.2], [0.12, 0.4, 0.12], L.STEEL); p.cyl([0, 1.5, 0.2], 0.28, 0.35, L.RUST, { r1: 0.34, n: 8 }); p.box([0, 1.66, 0.2], [0.5, 0.02, 0.5], L.GLASS, { glow: 1 }); }, [0, 2.05, 0.2], 'press', 'x', 0.5, 0.9);
    return { base: m.geo(), parts: [ladle], lamp: [1.1, 1.0, 1.2], smoke: [[-0.75, 3.55, -0.8], [0.75, 3.55, -0.8]] };
  },
  constructor: () => {
    const m = new MG(); pad(m, 2, 2);
    m.box([0, 0.45, 0], [1.6, 0.6, 1.6], L.OLIVE);
    m.box([0, 0.78, 0.15], [0.9, 0.06, 1.2], L.TREAD);
    for (const x of [-0.6, 0.6]) m.box([x, 1.3, 0.15], [0.16, 1.1, 0.3], L.OLIVE);
    m.box([0, 1.92, 0.15], [1.4, 0.3, 0.4], L.OLIVE);
    m.box([0, 2.1, 0.15], [1.44, 0.06, 0.44], L.HAZARD);
    m.box([0, 1.1, -0.55], [1.1, 0.7, 0.4], L.CREAM);
    m.box([0.3, 1.15, -0.34], [0.22, 0.22, 0.03], L.GLASS);
    m.label([-0.3, 1.15, -0.34], 0.36, 0.28, 'CONSTRUCTOR');
    m.box([0.81, 0.45, 0], [0.02, 0.3, 1.0], L.GRILLE);
    intake(m, 0, 0.85, 2);
    chute(m, 0, 0.6, 2);
    m.lamp([-0.55, 1.6, -0.55]);
    const press = part((p) => { p.box([0, 1.5, 0.15], [0.5, 0.3, 0.5], L.STEEL); p.box([0, 1.32, 0.15], [0.56, 0.06, 0.56], L.RUST); p.cyl([0, 1.75, 0.15], 0.07, 0.4, L.STEEL, { n: 6 }); }, [0, 1.5, 0.15], 'press', 'y', 2.2, 0.38);
    return { base: m.geo(), parts: [press], lamp: [-0.55, 1.6, -0.55] };
  },
  assembler: () => {
    const m = new MG(); pad(m, 3, 3);
    m.box([0, 0.4, 0], [2.6, 0.5, 2.6], L.OLIVE);
    m.box([0, 0.68, 0], [1.2, 0.06, 2.4], L.BELT);
    for (const x of [-0.65, 0.65]) m.box([x, 0.7, 0], [0.08, 0.1, 2.4], L.GUN);
    m.box([0, 1.2, -1.05], [2.4, 1.1, 0.5], L.OLIVE);
    m.box([0, 1.8, -1.05], [2.5, 0.08, 0.6], L.STEEL);
    m.box([-0.6, 1.25, -0.79], [0.6, 0.5, 0.03], L.GLASS);
    m.label([0.5, 1.25, -0.79], 0.6, 0.45, 'ASSEMBLER');
    for (const x of [-1.2, 1.2]) m.box([x, 1.4, 0.4], [0.16, 1.5, 0.16], L.GUN);
    m.box([0, 2.15, 0.4], [2.56, 0.14, 0.18], L.HAZARD);
    intake(m, -0.8, 0.75, 3); intake(m, 0.8, 0.75, 3);
    chute(m, 0, 0.6, 3);
    m.lamp([1.05, 1.95, -1.05]);
    const arm = (x: number, sp: number) => part((p) => {
      p.cyl([x, 2.0, 0.4], 0.14, 0.2, L.STEEL, { n: 6 });
      p.box([x, 1.7, 0.4], [0.1, 0.6, 0.1], L.RED);
      p.box([x + 0.25 * Math.sign(-x), 1.42, 0.4], [0.6, 0.08, 0.08], L.RED);
      p.box([x + 0.5 * Math.sign(-x), 1.18, 0.4], [0.06, 0.4, 0.06], L.STEEL);
      p.box([x + 0.5 * Math.sign(-x), 0.98, 0.4], [0.2, 0.06, 0.12], L.GUN);
    }, [x, 2.0, 0.4], 'yaw', 'y', sp, 0.9);
    return { base: m.geo(), parts: [arm(-1.2, 1.7), arm(1.2, -2.1)], lamp: [1.05, 1.95, -1.05] };
  },
  manufacturer: () => {
    const m = new MG(); pad(m, 4, 4);
    m.box([0, 1.25, -0.2], [3.6, 2.2, 3.2], L.CREAM);
    m.box([0, 0.35, -0.2], [3.64, 0.4, 3.24], L.OLIVE);
    m.box([0, 2.42, -0.2], [3.7, 0.12, 3.3], L.STEEL);
    m.box([0, 2.75, -0.2], [1.4, 0.55, 3.0], L.CREAM);
    for (let k = -1; k <= 1; k++) m.box([0.71, 2.75, -0.2 + k * 0.9], [0.02, 0.36, 0.6], L.GLASS);
    for (let k = -1; k <= 1; k++) m.box([-0.71, 2.75, -0.2 + k * 0.9], [0.02, 0.36, 0.6], L.GLASS);
    m.box([0, 1.0, 1.41], [1.6, 1.3, 0.04], L.HAZARD);
    m.box([0, 1.1, 1.42], [1.4, 1.1, 0.04], L.GUN);
    for (let y = 0.6; y < 1.6; y += 0.12) m.box([0, y, 1.45], [1.38, 0.02, 0.02], L.STEEL);
    m.label([-1.3, 1.6, 1.41], 0.7, 0.5, 'MANUFACTURER');
    m.box([1.81, 1.5, -0.2], [0.02, 0.8, 2.0], L.GRILLE);
    m.ladder(1.85, 0.9, 0.3, 2.5, Math.PI / 2);
    for (const x of [-1.2, -0.4, 0.4, 1.2]) intake(m, x, 0.75, 4);
    chute(m, 0, 0.5, 4);
    m.lamp([1.4, 2.65, 1.2]);
    const fan = part((p) => { p.cyl([-1.0, 2.6, -1.0], 0.06, 0.1, L.GUN, { n: 6 }); for (let k = 0; k < 4; k++) p.box([-1.0, 2.62, -1.0], [0.9, 0.02, 0.16], L.STEEL, { ry: k * Math.PI / 4 }); }, [-1.0, 2.6, -1.0], 'spin', 'y', 5);
    m.box([-1.0, 2.55, -1.0], [1.0, 0.12, 1.0], L.GRILLE);
    return { base: m.geo(), parts: [fan], lamp: [1.4, 2.65, 1.2], smoke: [[1.0, 3.2, -1.2]] };
  },
  refinery: () => {
    const m = new MG(); pad(m, 3, 3);
    m.cyl([-0.75, 1.05, -0.6], 0.6, 1.8, L.CREAM, { n: 10 });
    m.cyl([-0.75, 2.02, -0.6], 0.6, 0.16, L.STEEL, { r1: 0.3, n: 10 });
    m.cyl([0.75, 1.75, -0.7], 0.32, 3.2, L.STEEL, { n: 8 });
    for (let y = 0.6; y < 3.2; y += 0.55) m.cyl([0.75, y, -0.7], 0.36, 0.06, L.RED, { n: 8 });
    m.ladder(0.75, -0.3, 0.2, 3.2);
    m.cyl([-0.6, 0.55, 0.65], 0.42, 0.9, L.CREAM, { n: 8, axis: 'x' });
    for (const x of [-0.95, -0.25]) m.box([x, 0.25, 0.65], [0.1, 0.4, 0.6], L.GUN);
    m.cyl([0.1, 1.2, -0.6], 0.07, 1.3, L.COPPER, { n: 6, axis: 'x' });
    m.cyl([0.75, 0.4, 0.2], 0.07, 0.9, L.COPPER, { n: 6, axis: 'z' });
    m.box([0.75, 0.6, 0.8], [0.9, 0.9, 0.7], L.OLIVE);
    m.label([0.75, 0.65, 1.16], 0.6, 0.4, 'REFINERY');
    intake(m, -0.8, 0.25, 3); intake(m, 0.8, 0.25, 3);
    chute(m, 0, 0.45, 3);
    m.lamp([0.3, 1.2, 0.8]);
    return { base: m.geo(), parts: [], lamp: [0.3, 1.2, 0.8], smoke: [[0.75, 3.45, -0.7]] };
  },
  shed: () => {
    const m = new MG(); pad(m, 3, 3, 0.12);
    m.box([0, 0.3, 0], [2.6, 0.3, 2.6], L.BRICK);
    m.box([0, 0.47, 0], [2.4, 0.06, 2.4], L.MOSS);
    for (const x of [-1.3, 1.3]) for (const z of [-1.3, 0, 1.3]) m.box([x, 0.95, z], [0.06, 1.0, 0.06], L.STEEL);
    m.box([-0.68, 1.62, 0], [1.5, 0.04, 2.66], L.GLASS, { rz: 0.5 }); m.box([0.68, 1.62, 0], [1.5, 0.04, 2.66], L.GLASS, { rz: -0.5 });
    m.box([0, 1.98, 0], [0.08, 0.08, 2.7], L.STEEL);
    for (const z of [-1.3, 1.3]) m.box([0, 0.95, z], [2.6, 0.9, 0.02], L.GLASS);
    for (let k = 0; k < 6; k++) { const x = -0.9 + (k % 3) * 0.9, z = -0.6 + Math.floor(k / 3) * 1.2; m.cyl([x, 0.75, z], 0.12, 0.5, L.MOSS, { n: 5, r1: 0.3 }); m.box([x + 0.1, 0.95, z], [0.08, 0.08, 0.08], L.RED); }
    m.label([1.0, 0.3, 1.31], 0.5, 0.26, 'GROW SHED');
    intake(m, 0, 0.2, 3);
    chute(m, -0.6, 0.35, 3);
    m.lamp([1.2, 0.6, 1.2]);
    return { base: m.geo(), parts: [], lamp: [1.2, 0.6, 1.2] };
  },
  crate: () => {
    const m = new MG();
    m.box([0, 0.06, 0], [0.92, 0.12, 0.92], L.CONCRETE);
    m.box([0, 0.5, 0], [0.82, 0.76, 0.82], L.WOOD);
    for (const [x, z] of [[-0.41, -0.41], [0.41, -0.41], [-0.41, 0.41], [0.41, 0.41]]) m.box([x, 0.5, z], [0.07, 0.78, 0.07], L.STEEL);
    m.box([0, 0.89, 0], [0.86, 0.04, 0.86], L.STEEL);
    m.label([0, 0.5, 0.42], 0.44, 0.3, 'STORAGE');
    m.lamp([0.3, 0.98, -0.3]);
    return { base: m.geo(), parts: [], lamp: [0.3, 0.98, -0.3] };
  },
  silo: () => {
    const m = new MG(); pad(m, 2, 2);
    for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) m.box([x, 0.55, z], [0.12, 0.8, 0.12], L.GUN);
    m.cyl([0, 2.3, 0], 0.85, 2.9, L.CREAM, { n: 12 });
    m.cyl([0, 0.75, 0], 0.15, 0.6, L.CREAM, { r1: 0.85, n: 12 });
    m.cyl([0, 3.95, 0], 0.85, 0.4, L.STEEL, { r1: 0.15, n: 12 });
    for (const y of [1.3, 2.3, 3.3]) m.cyl([0, y, 0], 0.88, 0.06, L.RUST, { n: 12 });
    m.ladder(0.0, 0.9, 0.3, 3.8);
    m.label([0.55, 2.6, 0.66], 0.5, 0.4, 'SILO', 0.7);
    m.lamp([0, 4.25, 0]);
    chute(m, 0, 0.35, 2);
    return { base: m.geo(), parts: [], lamp: [0, 4.25, 0] };
  },
  boiler: () => {
    const m = new MG(); pad(m, 2, 2);
    m.box([0, 0.45, 0], [1.5, 0.6, 1.7], L.BRICK);
    m.cyl([0, 1.15, 0], 0.62, 1.7, L.OLIVE, { n: 10, axis: 'z' });
    for (const z of [-0.6, 0, 0.6]) m.cyl([0, 1.15, z], 0.65, 0.06, L.RUST, { n: 10, axis: 'z' });
    m.cyl([0.35, 2.2, -0.55], 0.14, 1.4, L.RUST, { n: 6 });
    m.cyl([-0.3, 1.85, 0.3], 0.1, 0.3, L.BRASS, { n: 6 });
    m.box([0, 0.5, 0.86], [0.5, 0.36, 0.04], L.GLASS, { glow: 1 });
    m.label([-0.48, 1.15, 0.86], 0.4, 0.3, 'BOILER');
    intake(m, -0.4, 0.85, 2);
    m.cyl([0, 1.15, 0.95], 0.18, 0.2, L.COPPER, { n: 6, axis: 'z' });
    m.lamp([0.55, 1.9, 0.4]);
    return { base: m.geo(), parts: [], lamp: [0.55, 1.9, 0.4], smoke: [[0.35, 2.95, -0.55]] };
  },
  steamgen: () => {
    const m = new MG(); pad(m, 2, 3);
    m.cyl([0, 0.8, -0.65], 0.55, 1.4, L.GUN, { n: 10, axis: 'z', r1: 0.42 });
    m.box([0, 0.75, 0.55], [1.1, 0.9, 1.1], L.OLIVE);
    m.box([0, 1.23, 0.55], [1.15, 0.06, 1.15], L.STEEL);
    for (let k = 0; k < 4; k++) m.cyl([0.57, 0.6 + k * 0.12, 0.55], 0.05, 0.9, L.COPPER, { n: 5, axis: 'z' });
    m.cyl([0, 0.8, -1.4], 0.2, 0.3, L.COPPER, { n: 6, axis: 'z' });
    m.label([-0.56, 0.75, 0.55], 0.5, 0.4, 'STEAM GEN.', -Math.PI / 2);
    m.lamp([0.4, 1.4, 0.9]);
    const fly = part((p) => { p.cyl([0, 0.8, 0.0], 0.6, 0.12, L.RED, { n: 10, axis: 'z' }); for (let k = 0; k < 3; k++) p.box([0, 0.8, 0.0], [1.1, 0.08, 0.04], L.STEEL, { rz: k * Math.PI / 3 }); }, [0, 0.8, 0.0], 'spin', 'z', 9);
    return { base: m.geo(), parts: [fly], lamp: [0.4, 1.4, 0.9] };
  },
  reactor: () => {
    const m = new MG(); pad(m, 3, 3);
    m.cyl([0, 1.6, 0], 1.3, 3.0, L.CONCRETE, { n: 10, r1: 0.95 });
    m.cyl([0, 3.2, 0], 0.95, 0.2, L.STEEL, { n: 10 });
    m.cyl([0, 3.5, 0], 0.7, 0.5, L.CONCRETE, { n: 10, r1: 0.8 });
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 + 0.3; m.box([Math.sin(a) * 1.12, 1.4, Math.cos(a) * 1.12], [0.3, 0.6, 0.06], L.TEAL, { ry: a, glow: 1 }); }
    m.cyl([0, 0.9, 0], 1.33, 0.18, L.HAZARD, { n: 10 });
    m.box([0, 0.55, 1.35], [0.9, 0.9, 0.3], L.OLIVE);
    m.label([0, 0.6, 1.51], 0.6, 0.4, 'ATOMIC PILE');
    intake(m, -0.8, 0.2, 3);
    m.lamp([0.9, 1.2, 1.2]);
    return { base: m.geo(), parts: [], lamp: [0.9, 1.2, 1.2], smoke: [[0, 3.9, 0]] };
  },
  pole: () => {
    const m = new MG();
    m.box([0, 0.08, 0], [0.4, 0.16, 0.4], L.CONCRETE);
    m.cyl([0, 1.55, 0], 0.09, 2.9, L.WOOD, { n: 6, r1: 0.07 });
    m.box([0, 2.8, 0], [0.9, 0.08, 0.1], L.WOOD);
    for (const x of [-0.36, 0, 0.36]) m.cyl([x, 2.9, 0], 0.05, 0.12, L.GLASS, { n: 5 });
    m.box([0, 2.4, 0.08], [0.2, 0.26, 0.12], L.OLIVE);
    return { base: m.geo(), parts: [], lamp: [0, -9, 0] };
  },
  lab: () => {
    const m = new MG(); pad(m, 2, 2);
    m.box([0, 0.75, 0], [1.7, 1.2, 1.6], L.CREAM);
    m.box([0, 1.4, 0], [1.8, 0.1, 1.7], L.STEEL);
    for (const x of [-0.45, 0.45]) m.box([x, 0.85, 0.81], [0.5, 0.36, 0.03], L.GLASS);
    m.box([0, 0.5, 0.81], [1.2, 0.08, 0.03], L.RED);
    m.label([0.0, 0.45, 0.84], 0.5, 0.28, 'RESEARCH');
    m.cyl([0.5, 1.75, -0.4], 0.05, 0.6, L.STEEL, { n: 6 });
    m.box([-0.5, 1.6, -0.4], [0.5, 0.3, 0.5], L.OLIVE);
    intake(m, 0, 0.3, 2);
    m.lamp([-0.5, 1.85, -0.4]);
    const dish = part((p) => { p.cyl([0.5, 2.15, -0.4], 0.45, 0.16, L.STEEL, { r1: 0.1, n: 8, rot: 0 }); p.box([0.5, 2.25, -0.4], [0.03, 0.4, 0.03], L.STEEL); }, [0.5, 2.05, -0.4], 'yaw', 'y', 0.6, 3.14);
    return { base: m.geo(), parts: [dish], lamp: [-0.5, 1.85, -0.4] };
  },
  robotfab: () => {
    const m = new MG(); pad(m, 4, 4);
    m.box([0, 1.5, -0.2], [3.6, 2.7, 3.2], L.OLIVE);
    m.box([0, 2.95, -0.2], [3.7, 0.2, 3.3], L.STEEL);
    m.box([0, 1.25, 1.41], [2.2, 2.0, 0.04], L.HAZARD);
    m.box([0, 1.2, 1.43], [2.0, 1.8, 0.04], L.GUN);
    for (let y = 0.4; y < 2.1; y += 0.15) m.box([0, y, 1.46], [1.98, 0.03, 0.02], L.STEEL);
    m.label([-1.35, 2.3, 1.41], 0.7, 0.55, 'ROBOT WORKS');
    m.box([1.81, 1.6, -0.6], [0.02, 1.2, 1.6], L.GRILLE);
    m.cyl([-1.2, 3.4, -1.2], 0.18, 0.9, L.RUST, { n: 6 });
    m.ladder(-1.85, -0.2, 0.3, 2.9, -Math.PI / 2);
    for (const x of [-1.2, -0.4, 0.4, 1.2]) intake(m, x, 0.4, 4);
    m.lamp([1.4, 2.6, 1.45]);
    const crane = part((p) => { p.box([0, 3.15, -0.2], [0.3, 0.2, 3.4], L.HAZARD); p.box([0, 2.95, 0.3], [0.2, 0.3, 0.3], L.GUN); p.box([0, 2.5, 0.3], [0.04, 0.8, 0.04], L.STEEL); }, [0, 3.15, -0.2], 'press', 'x', 0.4, 0.0);
    return { base: m.geo(), parts: [crane], lamp: [1.4, 2.6, 1.45], smoke: [[-1.2, 3.9, -1.2]] };
  },
  barracks: () => {
    const m = new MG(); pad(m, 3, 3, 0.1);
    for (let k = 0; k < 8; k++) { const t = k / 8, ang = t * Math.PI * 2; const x = Math.round(Math.cos(ang) * 1.3 * 10) / 10, z = Math.round(Math.sin(ang) * 1.3 * 10) / 10; m.box([Math.max(-1.35, Math.min(1.35, x * 1.2)), 0.5, Math.max(-1.35, Math.min(1.35, z * 1.2))], [0.1, 0.9, 0.1], L.WOOD); }
    for (const s of [-1, 1]) { m.box([1.35 * s, 0.55, 0], [0.05, 0.08, 2.7], L.WOOD); m.box([1.35 * s, 0.8, 0], [0.05, 0.08, 2.7], L.WOOD); m.box([0, 0.55, 1.35 * s], [2.7, 0.08, 0.05], L.WOOD); }
    m.box([0, 0.8, -1.35], [2.7, 0.08, 0.05], L.WOOD);
    m.box([-0.5, 0.95, -0.8], [1.6, 0.06, 1.0], L.RUST, { rx: -0.25 });
    for (const x of [-1.2, 0.2]) m.box([x, 0.55, -0.4], [0.06, 0.9, 0.06], L.WOOD);
    m.box([0.6, 0.3, 0.5], [1.0, 0.25, 0.4], L.WOOD);
    m.box([0.6, 0.4, 0.5], [0.9, 0.04, 0.3], L.MOSS);
    m.label([0.6, 0.3, 0.71], 0.4, 0.22, 'BARRACKS');
    m.lamp([-1.3, 1.05, 1.3]);
    return { base: m.geo(), parts: [], lamp: [-1.3, 1.05, 1.3] };
  },
  turret: () => {
    const m = new MG(); pad(m, 2, 2, 0.12);
    m.cyl([0, 0.45, 0], 0.9, 0.6, L.CONCRETE, { n: 8, r1: 0.75 });
    m.cyl([0, 0.78, 0], 0.66, 0.08, L.HAZARD, { n: 8 });
    m.box([0.65, 0.5, -0.55], [0.4, 0.3, 0.3], L.OLIVE);
    m.label([0, 0.45, 0.82], 0.36, 0.24, 'TURRET', 0);
    m.lamp([-0.6, 0.95, -0.55]);
    const head = part((p) => {
      p.cyl([0, 1.05, 0], 0.5, 0.45, L.OLIVE, { n: 8, r1: 0.4 });
      p.box([0, 1.1, 0.35], [0.7, 0.32, 0.2], L.OLIVE);
      for (const x of [-0.16, 0.16]) { p.cyl([x, 1.12, 0.85], 0.05, 0.9, L.GUN, { n: 6, axis: 'z' }); p.cyl([x, 1.12, 1.28], 0.07, 0.1, L.STEEL, { n: 6, axis: 'z' }); }
      p.box([0, 1.32, -0.1], [0.3, 0.1, 0.3], L.GLASS);
    }, [0, 1.0, 0], 'yaw', 'y', 0, 0);
    return { base: m.geo(), parts: [head], lamp: [-0.6, 0.95, -0.55] };
  },
  wall: () => {
    const m = new MG();
    m.box([0, 0.08, 0], [1.0, 0.16, 1.0], L.CONCRETE);
    m.box([0, 0.75, 0], [1.0, 1.3, 0.6], L.CONCRETE);
    m.box([0, 1.42, 0], [1.02, 0.06, 0.66], L.HAZARD);
    m.box([0, 0.35, 0.32], [0.98, 0.3, 0.06], L.CONCRETE);
    return { base: m.geo(), parts: [], lamp: [0, -9, 0] };
  },
  found: () => {
    const m = new MG();
    m.box([0, -0.2, 0], [2, 0.7, 2], L.CONCRETE);
    m.box([0, 0.152, 0], [1.96, 0.01, 1.96], L.TREAD);
    for (const [x, z] of [[-0.97, 0], [0.97, 0]]) m.box([x, 0.155, z], [0.04, 0.01, 1.96], L.HAZARD);
    return { base: m.geo(), parts: [], lamp: [0, -9, 0] };
  },
  splitter: () => {
    const m = new MG();
    beltBody(m, 'straight');
    m.box([0, 0.5, 0], [0.8, 0.5, 0.7], L.OLIVE);
    m.box([0, 0.78, 0], [0.86, 0.05, 0.76], L.HAZARD);
    for (const [x, z, r] of [[0, 0.36, 0], [0.4, 0, Math.PI / 2], [-0.4, 0, -Math.PI / 2]] as const) m.box([x, 0.42, z], [0.42, 0.26, 0.04], L.INK, { ry: r });
    m.label([0, 0.55, -0.36], 0.4, 0.24, 'SPLITTER', Math.PI);
    return { base: m.geo(), parts: [], lamp: [0, -9, 0] };
  },
  merger: () => {
    const m = new MG();
    beltBody(m, 'straight');
    m.box([0, 0.5, 0], [0.8, 0.5, 0.7], L.GUN);
    m.box([0, 0.78, 0], [0.86, 0.05, 0.76], L.HAZARD);
    for (const [x, z, r] of [[0, -0.36, 0], [0.4, 0, Math.PI / 2], [-0.4, 0, -Math.PI / 2], [0, 0.36, 0]] as const) m.box([x, 0.42, z], [0.42, 0.26, 0.04], L.INK, { ry: r });
    m.label([0, 0.55, 0.36], 0.4, 0.24, 'MERGER');
    return { base: m.geo(), parts: [], lamp: [0, -9, 0] };
  },
  dam: () => {
    const m = new MG();
    m.box([0, 0.1, 0], [1.0, 0.2, 1.1], L.CONCRETE);
    m.box([0, 0.95, 0], [1.0, 1.7, 0.7], L.CONCRETE);
    m.box([0, 0.55, -0.42], [1.0, 0.9, 0.2], L.CONCRETE, { rx: 0.35 });
    m.box([0, 1.82, 0], [1.02, 0.08, 0.76], L.STEEL);
    m.box([0, 1.4, 0.36], [1.0, 0.06, 0.02], L.HAZARD);
    return { base: m.geo(), parts: [], lamp: [0, -9, 0] };
  },
  sluice: () => {
    const m = new MG();
    m.box([0, 0.1, 0], [1.0, 0.2, 1.1], L.CONCRETE);
    for (const x of [-0.42, 0.42]) m.box([x, 1.0, 0], [0.16, 1.9, 0.7], L.CONCRETE);
    m.box([0, 2.0, 0], [1.02, 0.14, 0.5], L.OLIVE);
    m.cyl([0, 2.2, 0.1], 0.18, 0.06, L.RED, { n: 8, axis: 'z' });
    m.cyl([0, 2.2, 0.1], 0.05, 0.3, L.STEEL, { n: 6, axis: 'z' });
    m.lamp([0.4, 2.25, -0.2]);
    const gate = part((p) => { p.box([0, 0.9, 0], [0.7, 1.4, 0.12], L.RUST); for (let y = 0.4; y < 1.6; y += 0.3) p.box([0, y, 0.07], [0.7, 0.05, 0.03], L.STEEL); }, [0, 0.9, 0], 'press', 'y', 0, 0);
    return { base: m.geo(), parts: [gate], lamp: [0.4, 2.25, -0.2] };
  },
  sprinkler: () => {
    const m = new MG();
    m.box([0, 0.06, 0], [0.5, 0.12, 0.5], L.CONCRETE);
    m.cyl([0, 0.6, 0], 0.06, 1.0, L.COPPER, { n: 6 });
    m.cyl([0, 0.15, 0], 0.16, 0.18, L.OLIVE, { n: 6 });
    m.lamp([0.18, 0.4, 0.0]);
    const head = part((p) => { p.cyl([0, 1.15, 0], 0.08, 0.12, L.BRASS, { n: 6 }); for (const sgn of [-1, 1]) { p.box([sgn * 0.25, 1.18, 0], [0.5, 0.04, 0.04], L.COPPER); p.box([sgn * 0.5, 1.2, 0], [0.06, 0.08, 0.06], L.BRASS); } }, [0, 1.15, 0], 'spin', 'y', 4);
    return { base: m.geo(), parts: [head], lamp: [0.18, 0.4, 0.0] };
  },
  spreader: () => {
    const m = new MG(); pad(m, 2, 2, 0.12);
    m.hopper([0, 1.1, -0.2], 0.4, 1.3, 0.8, L.OLIVE);
    m.box([0, 1.52, -0.2], [1.3, 0.04, 1.3], L.HAZARD);
    for (const [x, z] of [[-0.5, -0.7], [0.5, -0.7], [-0.5, 0.3], [0.5, 0.3]]) m.box([x, 0.45, z], [0.08, 0.7, 0.08], L.GUN);
    m.box([0, 0.35, 0.65], [0.5, 0.4, 0.4], L.CREAM);
    m.lamp([0.6, 0.7, 0.65]);
    const disc = part((p) => { p.cyl([0, 0.55, -0.2], 0.4, 0.05, L.STEEL, { n: 8 }); for (let k = 0; k < 4; k++) p.box([0, 0.6, -0.2], [0.7, 0.05, 0.04], L.RUST, { ry: k * 0.785 }); }, [0, 0.55, -0.2], 'spin', 'y', 6);
    return { base: m.geo(), parts: [disc], lamp: [0.6, 0.7, 0.65] };
  },
  sprayer: () => {
    const m = new MG();
    m.box([0, 0.06, 0], [0.8, 0.12, 0.8], L.CONCRETE);
    m.cyl([0.15, 0.4, 0.15], 0.25, 0.6, L.OLIVE, { n: 8 });
    m.box([0.15, 0.55, 0.15], [0.3, 0.12, 0.52], L.HAZARD);
    m.box([-0.25, 0.9, -0.25], [0.08, 1.7, 0.08], L.GUN);
    m.lamp([0.4, 0.85, 0.15]);
    const boom = part((p) => { p.box([-0.25, 1.72, -0.25], [1.4, 0.05, 0.05], L.GUN); for (let k = -2; k <= 2; k++) p.box([-0.25 + k * 0.3, 1.66, -0.25], [0.05, 0.08, 0.05], L.BRASS); }, [-0.25, 1.72, -0.25], 'spin', 'y', 0.8);
    return { base: m.geo(), parts: [boom], lamp: [0.4, 0.85, 0.15] };
  },
  planter: () => {
    const m = new MG(); pad(m, 2, 2, 0.1);
    m.box([0, 0.55, -0.3], [1.5, 0.7, 0.9], L.RED);
    m.box([0, 0.93, -0.3], [1.56, 0.06, 0.96], L.STEEL);
    for (const x of [-0.45, 0, 0.45]) m.hopper([x, 1.15, -0.3], 0.2, 0.42, 0.36, L.CREAM);
    m.box([0, 0.3, 0.55], [1.6, 0.12, 0.14], L.GUN);
    for (const x of [-0.6, -0.2, 0.2, 0.6]) m.box([x, 0.2, 0.62], [0.05, 0.25, 0.08], L.STEEL, { rx: 0.4 });
    m.label([0, 0.55, 0.16], 0.5, 0.3, 'GROW SHED');
    m.lamp([0.65, 1.0, -0.65]);
    return { base: m.geo(), parts: [], lamp: [0.65, 1.0, -0.65] };
  },
  trough: () => {
    const m = new MG();
    m.box([0, 0.06, 0], [1.9, 0.12, 0.9], L.CONCRETE);
    m.box([0, 0.35, 0], [1.7, 0.45, 0.6], L.WOOD);
    m.box([0, 0.55, 0], [1.6, 0.06, 0.5], L.MOSS);
    for (const x of [-0.8, 0.8]) m.box([x, 0.2, 0], [0.1, 0.4, 0.75], L.WOOD);
    m.box([0.6, 0.62, 0.1], [0.2, 0.12, 0.2], L.RED); m.box([-0.4, 0.62, -0.1], [0.18, 0.1, 0.18], L.RED);
    return { base: m.geo(), parts: [], lamp: [0, -9, 0] };
  },
  pen: () => {
    const m = new MG();
    for (const s of [-1, 1]) for (let k = -1; k <= 1; k++) {
      m.box([s * 1.4, 0.7, k * 0.95], [0.1, 1.4, 0.1], L.WOOD); if (k !== 0 || s < 0) m.box([k * 0.95, 0.7, s * 1.4], [0.1, 1.4, 0.1], L.WOOD);
    }
    for (const y of [0.45, 0.95]) { for (const s of [-1, 1]) m.box([s * 1.4, y, 0], [0.05, 0.08, 2.8], L.WOOD); m.box([0, y, -1.4], [2.8, 0.08, 0.05], L.WOOD); m.box([-0.95, y, 1.4], [0.95, 0.08, 0.05], L.WOOD); m.box([0.95, y, 1.4], [0.95, 0.08, 0.05], L.WOOD); }
    m.box([0, 1.5, 1.4], [1.2, 0.1, 0.12], L.GUN); for (const x of [-0.55, 0.55]) m.box([x, 0.8, 1.4], [0.1, 1.6, 0.12], L.GUN);
    m.box([0, 0.15, 0], [1.0, 0.2, 0.5], L.WOOD); m.box([0, 0.26, 0], [0.9, 0.04, 0.4], L.MOSS);
    m.lamp([0.55, 1.65, 1.4]);
    const gate = part((p) => { p.box([0, 0.9, 1.4], [1.0, 1.1, 0.06], L.WOOD); p.box([0, 0.9, 1.43], [1.0, 0.08, 0.02], L.HAZARD); }, [0, 1.45, 1.4], 'press', 'y', 0, 0);
    return { base: m.geo(), parts: [gate], lamp: [0.55, 1.65, 1.4] };
  },
  breeder: () => {
    const m = new MG();
    for (const s of [-1, 1]) for (let k = -1; k <= 1; k++) { m.box([s * 1.4, 0.6, k * 1.35], [0.1, 1.2, 0.1], L.WOOD); m.box([k * 1.35, 0.6, s * 1.4], [0.1, 1.2, 0.1], L.WOOD); }
    for (const y of [0.4, 0.85]) for (const s of [-1, 1]) { m.box([s * 1.4, y, 0], [0.05, 0.08, 2.8], L.WOOD); m.box([0, y, s * 1.4], [2.8, 0.08, 0.05], L.WOOD); }
    m.box([-0.7, 1.15, -0.8], [1.4, 0.06, 1.2], L.RUST, { rx: -0.2 });
    for (const x of [-1.3, -0.1]) m.box([x, 0.6, -0.3], [0.06, 1.0, 0.06], L.WOOD);
    m.box([0, 0.08, -0.8], [1.4, 0.1, 1.0], L.MOSS);
    m.box([0.8, 0.3, 0.8], [0.8, 0.3, 0.4], L.WOOD); m.box([0.8, 0.42, 0.8], [0.7, 0.04, 0.3], L.MOSS);
    m.cyl([0.9, 0.3, -0.9], 0.2, 0.5, L.CREAM, { n: 8 });
    m.label([0.8, 0.3, 1.01], 0.36, 0.2, 'BARRACKS');
    m.lamp([1.35, 1.25, 1.35]);
    return { base: m.geo(), parts: [], lamp: [1.35, 1.25, 1.35] };
  },
  lift: () => {
    const m = new MG();
    m.box([0, 0.08, 0], [0.9, 0.16, 0.9], L.CONCRETE);
    for (const x of [-0.36, 0.36]) for (const z of [-0.36, 0.36]) m.box([x, 0.95, z], [0.08, 1.7, 0.08], L.GUN);
    for (const y of [0.6, 1.2]) m.box([0, y, 0], [0.8, 0.06, 0.8], L.GUN);
    m.box([0, 1.8, 0], [0.86, 0.12, 0.86], L.HAZARD);
    m.box([0, 0.95, 0], [0.5, 1.6, 0.5], L.BELT, { uv: 1 });
    m.box([0, 0.35, 0], [0.6, 0.5, 0.6], L.OLIVE);
    m.label([0, 0.35, 0.31], 0.36, 0.22, 'LIFT');
    return { base: m.geo(), parts: [], lamp: [0, -9, 0] };
  },
};
/** a belt cell: rails, legs and the running belt; 'left' / 'right' curve in from that side */
export function beltBody(m: MG, shape: 'straight' | 'left' | 'right') {
  const W = 0.62, y = 0.3;
  if (shape === 'straight') {
    m.box([0, y, 0], [W, 0.04, 1.0], L.BELT);
    for (const s of [-1, 1]) { m.box([s * (W / 2 + 0.04), y + 0.02, 0], [0.07, 0.12, 1.0], L.GUN); m.box([s * (W / 2 + 0.04), y / 2 - 0.02, 0.3], [0.05, y, 0.05], L.STEEL); }
    m.box([0, y - 0.06, 0], [W, 0.06, 0.94], L.INK);
    return;
  }
  // a quarter turn: from the side (local x = -/+0.5) to the front (z = +0.5), in 6 straight pieces along the arc
  const sx = shape === 'left' ? -1 : 1, cx = sx * 0.5, cz = 0.5, n = 6;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI / 2, a1 = ((i + 1) / n) * Math.PI / 2, am = (a0 + a1) / 2;
    const ry = Math.atan2(-sx * Math.cos(am), Math.sin(am));
    for (const [r, w, layer, yy, hh] of [[0.5, W, L.BELT, y, 0.04], [0.5 - W / 2 - 0.04, 0.07, L.GUN, y + 0.02, 0.12], [0.5 + W / 2 + 0.04, 0.07, L.GUN, y + 0.02, 0.12]] as const) {
      const px = cx - sx * Math.sin(am) * r, pz = cz - Math.cos(am) * r;
      m.box([px, yy, pz], [w, hh, r * (a1 - a0) + 0.03], layer, { ry });
    }
  }
  m.box([cx - sx * 0.35, y / 2 - 0.02, 0.15], [0.05, y, 0.05], L.STEEL);
  m.box([cx - sx * 0.5 * 0.7, y - 0.06, cz - 0.5 * 0.7], [0.5, 0.06, 0.5], L.INK, { ry: Math.PI / 4 });
}
/** a point and heading along a belt cell's centre line, t 0..1, in local coordinates */
export function beltPath(shape: 'straight' | 'left' | 'right', t: number): [number, number, number, number] {
  if (shape === 'straight') return [0, t - 0.5, 0, 1];
  const sx = shape === 'left' ? -1 : 1, a = t * Math.PI / 2;
  return [sx * 0.5 - sx * Math.sin(a) * 0.5, 0.5 - Math.cos(a) * 0.5, -sx * Math.cos(a), Math.sin(a)];
}
/** a pipe cell: copper run on a trestle; curves turn in from the side through an elbow */
export function pipeBody(m: MG, shape: 'straight' | 'left' | 'right') {
  const y = 0.42;
  m.box([0, y / 2 - 0.05, 0], [0.5, 0.06, 0.1], L.GUN); m.box([0, y / 2 - 0.1, 0], [0.06, y - 0.1, 0.06], L.GUN);
  if (shape === 'straight') { m.cyl([0, y, 0], 0.13, 1.0, L.COPPER, { n: 6, axis: 'z', open: true }); m.cyl([0, y, 0.45], 0.17, 0.08, L.BRASS, { n: 6, axis: 'z' }); return; }
  const sx = shape === 'left' ? -1 : 1;
  m.cyl([sx * 0.25, y, 0], 0.13, 0.5, L.COPPER, { n: 6, axis: 'x', open: true });
  m.cyl([0, y, 0.25], 0.13, 0.5, L.COPPER, { n: 6, axis: 'z', open: true });
  m.box([0, y, 0], [0.3, 0.3, 0.3], L.BRASS);
}
const CACHE = new Map<string, Model>();
export function modelFor(kind: FKind | string, model: string, hook?: (m: MG) => void): Model {
  const tier = kind === 'miner2' ? 2 : kind === 'miner3' ? 3 : 1;
  const key = (hook ? 'hook:' + kind : model) + tier;
  let m = CACHE.get(key);
  if (!m) {
    if (hook) { const g = new MG(); hook(g); m = { base: g.geo(), parts: [], lamp: [0, -9, 0] }; }
    else m = (MODELS[model] ?? MODELS.crate!)(tier);
    CACHE.set(key, m);
  }
  return m;
}
export function beltGeo(shape: 'straight' | 'left' | 'right', pipe = false): THREE.BufferGeometry {
  const key = (pipe ? 'pipe-' : 'belt-') + shape;
  let m = CACHE.get(key);
  if (!m) { const g = new MG(); if (pipe) pipeBody(g, shape); else beltBody(g, shape); m = { base: g.geo(), parts: [], lamp: [0, -9, 0] }; CACHE.set(key, m); }
  return m.base;
}
/** an outcrop over a coal or copper seam */
export function seamGeo(kind: 'coal' | 'copper', seed: number): THREE.BufferGeometry {
  const m = new MG(), layer = kind === 'coal' ? L.COAL : L.CUORE;
  let s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return (s % 1000) / 1000; };
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2, d = 0.3 + r() * 1.4, h = 0.25 + r() * 0.6;
    m.cyl([Math.cos(a) * d, h / 2 - 0.1, Math.sin(a) * d], 0.25 + r() * 0.35, h, layer, { n: 5, r1: 0.08 + r() * 0.2, rot: r() * 3 });
  }
  return m.geo();
}
