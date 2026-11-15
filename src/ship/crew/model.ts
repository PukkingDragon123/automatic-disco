// A crew member as a model: LIMBOPHOBIA's researcher rig (the low-poly people with painted faces, secondary
// motion, gestures, a talking mouth and a ragdoll) built from the roster's appearance and outfit, with the job's
// gear made by hand in 3D on the bones: the UNAA crest on the left sleeve, a name tape over the right breast, tool
// belts with real tools, goggles, knee pads, ear defenders, a stethoscope, a tablet, a field vest with sample
// pockets, an apron and towel, a tactical vest with plates and pouches, a holster, a shoulder radio. The gear is
// placed on the body's real surfaces (the people builder's own proportions, so a heavy body's belt sits on its
// belly and a wiry one's on his hips) and drawn from two pages: the kit's UNAA livery hardware and the crew page.
//
//   const m = buildCrewModel('kowalczyk');  scene.add(m.root);  m.update(dt, { speed: 0 });
//   m.rig.gesture('wave'); m.rig.say(2, 'smile'); m.die('decompression', fromPoint)
import * as THREE from 'three';
import { Researcher } from '../../limbo/entities/researcher';
import type { AnimInput } from '../../limbo/entities/humanAnim';
import { worldMaterial } from '../../limbo/gfx/materials';
import { registerAllTextures } from '../../limbo/gfx/textures/index';
import { specOf } from '../../limbo/entities/gg/spec';
import { ggProps } from '../../limbo/entities/gg/body';
import type { Props } from '../../limbo/entities/gg/types';
import { Kit, type V3 } from '../../robots/kit';
import { crewMats } from './paint';
import { ROSTER, type CrewId, type CrewDef, type Gear } from './roster';

let texReady = false;
function ready() { if (!texReady) { registerAllTextures(); texReady = true; } }
const wm = () => worldMaterial({ noVis: true, noFog: true, noGrid: true });
const PI = Math.PI;

export interface CrewModel {
  id: CrewId; def: CrewDef; rig: Researcher; root: THREE.Object3D; P: Props;
  /** hand props by name (tablet, mug, wrench, ladle, jar): shown with showProp */
  props: Record<string, THREE.Object3D>;
  dead: boolean;
  /** self-driven animation (idle, gestures, talking); pass AnimInput to walk / act */
  update(dt: number, inp?: Partial<AnimInput>): void;
  showProp(name: string | null, side?: 'R' | 'L'): void;
  /** fall as a ragdoll (from: where the blow came from, world) */
  die(how?: string, from?: THREE.Vector3, k?: number): void;
  dispose(): void;
}

// ------------------------------------------------------------------ body surfaces (body space, metres)
interface Surf { P: Props; co: number; front(y: number): number; side(y: number): number; arm: number; outer: boolean }
function surfaces(P: Props, d: CrewDef): Surf {
  const outer = !!d.outfit.torsoOuter;
  const okind = d.outfit.torsoOuter?.tex ?? '';
  const co = 0.008 + (okind === 'c_labcoat' ? 0.02 : okind === 'c_jacket_leather' ? 0.018 : okind === 'c_jacket' ? 0.016 : okind === 'c_vest_hiviz' ? 0.01 : 0);
  const lerpY = (y: number, pts: [number, number][]) => {
    if (y >= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (y >= pts[i][0]) { const [y0, v0] = pts[i - 1], [y1, v1] = pts[i]; const t = (y - y0) / (y1 - y0); return v0 + (v1 - v0) * t; }
    return pts[pts.length - 1][1];
  };
  const fz: [number, number][] = [[P.neckBase, P.chestZ * 0.55], [P.bustY + 0.04 * P.s, P.chestZ + P.bust * 0.6], [P.bustY, P.chestZ + P.bust], [P.waistY, P.waistZ + P.belly], [P.pelvisY, P.hipsZ + P.belly * 0.55], [P.crotchY, P.hipsZ * 0.85]];
  const sx: [number, number][] = [[P.shoulderY, P.chestTopX * 1.05], [P.bustY, P.bustX], [P.waistY, P.waistX], [P.pelvisY, P.hipsX], [P.crotchY, P.hipsX * 0.95]];
  return { P, co, outer, front: (y) => lerpY(y, fz) + co, side: (y) => lerpY(y, sx) + co * 0.8, arm: P.armX * 1.12 + 0.006 + (outer ? co * 0.6 : 0) };
}

// ------------------------------------------------------------------ the gear builder
class GearKit {
  /** 32 px per metre (a 64 px atlas tile spans 2 m): the gear reads as stylised flat colour */
  readonly k = new Kit(0.5);
  private piv = new Map<THREE.Object3D, THREE.Vector3>();
  readonly props: Record<string, THREE.Object3D> = {};
  constructor(readonly rig: Researcher, readonly S: Surf) {
    rig.root.updateMatrixWorld(true);
  }
  bone(n: string): THREE.Object3D { return (this.rig.bones as Record<string, THREE.Object3D>)[n] ?? (this.rig as unknown as { sec: Record<string, THREE.Object3D> }).sec?.[n] ?? this.rig.j.chest; }
  pivot(o: THREE.Object3D) {
    let p = this.piv.get(o);
    if (!p) { p = o.getWorldPosition(new THREE.Vector3()); this.rig.body.worldToLocal(p); this.piv.set(o, p); }
    return p;
  }
  /** start building on a bone in BODY space (metres, the rig's bind pose); mat 0 hardware page, 1 crew page */
  at(bone: string | THREE.Object3D, mat = 0) {
    const o = typeof bone === 'string' ? this.bone(bone) : bone;
    this.k.on(o, mat);
    const p = this.pivot(o); this.k.push(-p.x, -p.y, -p.z);
    return this.k;
  }
  /** an elliptical band round the body at height y (radii rx, rz), h tall */
  band(y: number, rx: number, rz: number, h: number, reg: string, seg = 22, a0 = 0, a1 = PI * 2) {
    const k = this.k;
    let u = 0;
    for (let i = 0; i < seg; i++) {
      const a = a0 + ((a1 - a0) * i) / seg, b = a0 + ((a1 - a0) * (i + 1)) / seg;
      const p0: V3 = [Math.sin(a) * rx, y - h / 2, Math.cos(a) * rz], p1: V3 = [Math.sin(b) * rx, y - h / 2, Math.cos(b) * rz];
      const p2: V3 = [p1[0], y + h / 2, p1[2]], p3: V3 = [p0[0], y + h / 2, p0[2]];
      const L = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) * k.dens;
      k.quad(p0, p1, p2, p3, reg, [u, h * k.dens, u + L, h * k.dens, u + L, 0, u, 0]);
      u += L;
    }
    return this;
  }
  /** a thin sheet along a polyline of [x, y, z] rows (each row: left and right points), tiled */
  sheet(rows: [V3, V3][], reg: string, both = true) {
    const k = this.k;
    let v = 0;
    for (let i = 0; i < rows.length - 1; i++) {
      const [a, b] = rows[i], [c, d] = rows[i + 1];
      const L = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]) * k.dens, W = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * k.dens;
      k.quad(a, b, d, c, reg, [0, v, W, v, W, v + L, 0, v + L]);
      if (both) k.quad(a, c, d, b, reg, [0, v, 0, v + L, W, v + L, W, v]);
      v += L;
    }
    return this;
  }
  finish() { return this.k.finish(crewMats()); }
}

// ------------------------------------------------------------------ every piece of gear
type Builder = (g: GearKit, d: CrewDef) => void;
const GEAR: Partial<Record<Gear, Builder>> = {
  patchL: (g) => { const { P, arm } = g.S; const p = g.pivot(g.bone('uarmL')); g.at('uarmL', 1).push(p.x + arm, p.y - 0.085 * P.s, p.z + 0.004, 0, PI / 2, 0).decal(0, 0, 0, 0.078 * P.s, 0.078 * P.s, 'cw:unaa').pop(); },
  patchR: (g) => { const { P, arm } = g.S; const p = g.pivot(g.bone('uarmR')); g.at('uarmR', 1).push(p.x - arm, p.y - 0.085 * P.s, p.z + 0.004, 0, -PI / 2, 0).decal(0, 0, 0, 0.076 * P.s, 0.076 * P.s, 'cw:austral').pop(); },
  nameTape: (g, d) => {
    // over the painted name patch of the coverall / uniform (x -0.03H .. -0.075H, y bust + 0.045H)
    const { P } = g.S, y = P.bustY + 0.045 * P.H, x = -0.0525 * P.H, z = g.S.front(y) * 0.985 + (g.S.outer ? 0.004 : 0);
    g.at('chest', 1).push(x, y, z, -0.1, -0.36, 0).decal(0, 0, 0.002, 0.052 * P.H, 0.0105 * P.H, 'cw:name:' + d.id).pop();
  },
  rankBoards: (g) => {
    const { P } = g.S;
    for (const sd of [1, -1]) {
      const x = sd * P.shX * 0.62, y = P.shoulderY + 0.045 * P.s;
      const k = g.at('chest', 0).push(x, y, -0.005, 0, 0, sd * -0.32);
      k.box(0, 0, 0, 0.11 * P.s, 0.008, 0.05 * P.s, 'dk', { ch: 0.002 });
      k.bolt(sd * -0.045 * P.s, 0.006, 0, 0.006, 'y', 'br');
      g.at('chest', 1).push(x, y + 0.0045, -0.005, -PI / 2, 0, sd * -0.32).decal(0, 0, 0, 0.1 * P.s, 0.042 * P.s, 'cw:rank').pop();
    }
  },
  capBadge: (g) => {
    const { P } = g.S, hp = g.pivot(g.bone('head'));
    g.at('head', 1).push(0, P.hairY + 0.035 * P.s, P.zf + 0.026 * P.s, -0.3, 0, 0).decal(0, 0, 0, 0.042 * P.s, 0.042 * P.s, 'cw:capb').pop();
    void hp;
  },
  mug: (g) => {
    const m = new THREE.Group(), k = g.k; k.on(m, 1);
    k.cyl(0, 0, 0, 0.038, 0.036, 0.095, 14, 'cw:ceramic', { caps: 'bot' }); k.cyl(0, 0.04, 0, 0.033, 0.033, 0.004, 14, 'cw:navy', { caps: true });
    k.push(0, 0.005, 0.0385).decal(0, 0, 0, 0.04, 0.04, 'cw:capb').pop();
    k.on(m, 0); k.torus(-0.047, 0.0, 0, 0.022, 0.006, 10, 4, 'pb2', 'z');
    g.props.mug = m;
  },
  stylus: (g) => {
    const { P } = g.S;
    g.at('head', 0).push(0.01, P.crown - 0.045 * P.s, P.hcz - P.hd * 0.85, 0.5, 0, 0.9).cyl(0, 0, 0, 0.004, 0.004, 0.16, 6, 'br').cyl(0, 0.082, 0, 0.0045, 0.0015, 0.012, 6, 'dk').pop();
  },
  earpiece: (g) => {
    const { P } = g.S, y = (P.earTop + P.earBot) / 2;
    const k = g.at('head', 0).push(-P.hw - 0.004, y, P.hcz + 0.004);
    k.box(0, 0, 0, 0.014, 0.024, 0.018, 'dk', { ch: 0.004 }); k.cyl(-0.007, 0.006, 0, 0.003, 0.003, 0.003, 6, 'lamp', { axis: 'x' });
    k.tube([[0, -0.012, 0.004], [0.004, -0.03, 0.03], [0.012, -0.04, 0.06]], 0.0018, 4, 'dk'); k.pop();
  },
  penlights: (g) => {
    const { P } = g.S, y = P.bustY + 0.03 * P.s;
    for (const [i, reg] of [[0, 'st0'], [1, 'pb0']] as [number, string][]) {
      const x = 0.06 * P.s + i * 0.016, z = g.S.front(y) - 0.002;
      g.at('chest', 0).push(x, y, z, -0.1, 0, 0.05).cyl(0, 0, 0, 0.0045, 0.0045, 0.11, 6, reg).box(0.0, 0.03, 0.005, 0.003, 0.03, 0.003, 'st1').pop();
    }
  },
  tablet: (g) => {
    const m = new THREE.Group(), k = g.k; k.on(m, 0);
    // built like the researcher's clipboard: thin in x, long down -y, wide in z; the screen faces +x
    k.box(0, -0.12, 0, 0.011, 0.24, 0.17, 'dk', { ch: 0.004 });
    k.box(0.0045, -0.12, 0, 0.004, 0.226, 0.156, 'st1');
    k.on(m, 1); k.push(0.0068, -0.12, 0, 0, PI / 2, 0).decal(0, 0, 0, 0.15, 0.218, 'cw:tablet').pop();
    g.props.tablet = m;
  },
  toolBelt: (g) => {
    const { P } = g.S, y = (P.waistY * 0.35 + P.pelvisY * 0.65), rx = g.S.side(y) + 0.008, rz = g.S.front(y) + 0.004;
    const k = g.at('hips', 1); g.band(y, rx, rz * 0.98, 0.05 * P.s, 'cw:leather', 24);
    // buckle, pouches, a hammer, a big wrench, a driver, a sealant gun, a tape measure
    k.on(g.bone('hips'), 0); const hp = g.pivot(g.bone('hips')); k.push(-hp.x, -hp.y, -hp.z);
    k.box(0, y, rz + 0.006, 0.05 * P.s, 0.04 * P.s, 0.01, 'br', { ch: 0.003 });
    const around = (a: number, out = 0.012) => [Math.sin(a) * (rx + out), y, Math.cos(a) * (rz + out)] as V3;
    for (const [a, w, h, reg] of [[0.9, 0.07, 0.085, 'cw:leather'], [1.55, 0.06, 0.07, 'cw:nylon'], [-1.0, 0.075, 0.09, 'cw:leather'], [-1.7, 0.05, 0.065, 'cw:nylon'], [2.6, 0.08, 0.06, 'cw:canvas']] as [number, number, number, string][]) {
      const p = around(a, 0.018);
      k.on(g.bone('hips'), 1); k.push(-hp.x, -hp.y, -hp.z).push(p[0], p[1] - h * 0.35, p[2], 0, a, 0).box(0, 0, 0, w * P.s, h * P.s, 0.035, reg, { ch: 0.006 }).box(0, h * 0.42 * P.s, 0.004, w * 1.04 * P.s, 0.02, 0.04, reg, { ch: 0.004 }).pop();
      k.on(g.bone('hips'), 0); k.push(-hp.x, -hp.y, -hp.z).push(p[0], p[1] - h * 0.35, p[2], 0, a, 0).bolt(0, h * 0.36 * P.s, 0.024, 0.004, 'z', 'br').pop();
    }
    { const p = around(-0.55, 0.03); k.push(p[0], p[1] - 0.06, p[2], 0, -0.55, 0.12).cyl(0, 0, 0, 0.011, 0.011, 0.2, 6, 'pb1').box(0, -0.105, 0, 0.09, 0.028, 0.028, 'st0', { ch: 0.004 }).pop(); }
    { const p = around(0.45, 0.03); k.push(p[0], p[1] - 0.09, p[2], 0, 0.45, -0.08).box(0, 0, 0, 0.022, 0.2, 0.008, 'st0', { ch: 0.002 }).cyl(0, -0.105, 0, 0.026, 0.026, 0.009, 8, 'st0', { axis: 'z' }).cyl(0, 0.105, 0, 0.02, 0.02, 0.009, 8, 'st0', { axis: 'z' }).pop(); }
    { const p = around(1.25, 0.06); k.push(p[0], p[1] - 0.05, p[2], 0, 1.25, 0).cyl(0, 0.0, 0, 0.022, 0.022, 0.12, 10, 'pb0').cyl(0, 0.02, 0, 0.0225, 0.0225, 0.03, 10, 'hzB').box(0, 0.07, 0.02, 0.02, 0.05, 0.03, 'dk').cyl(0, -0.08, 0, 0.006, 0.01, 0.06, 6, 'st1').pop(); }
    { const p = around(-1.35, 0.03); k.push(p[0], p[1] + 0.0, p[2], 0, -1.35, 0).cyl(0, 0, 0, 0.026, 0.026, 0.024, 10, 'hz', { axis: 'z' }).pop(); }
    { const p = around(2.2, 0.025); k.push(p[0], p[1] - 0.06, p[2], 0, 2.2, 0.05).cyl(0, 0, 0, 0.008, 0.008, 0.08, 6, 'hzB').cyl(0, -0.07, 0, 0.002, 0.002, 0.07, 4, 'st0').pop(); }
  },
  goggles: (g) => {
    const { P } = g.S, y = P.browY + 0.052 * P.s, rx = P.hw * 1.12, rz = P.hd * 1.1;
    const k = g.at('head', 0); k.push(0, 0, P.hcz); g.band(y, rx, rz, 0.02 * P.s, 'rb', 18); k.pop();
    for (const sd of [1, -1]) {
      k.push(sd * 0.034 * P.s, y + 0.004, P.zf + 0.008, 0.25, sd * 0.18, 0);
      k.cyl(0, 0, 0, 0.022 * P.s, 0.025 * P.s, 0.022, 10, 'rb', { axis: 'z' }); k.cyl(0, 0, 0.012, 0.02 * P.s, 0.02 * P.s, 0.004, 10, 'lensB', { axis: 'z', capReg: 'lensB' });
      k.lathe(0, 0, 0.012, [[0.018 * P.s, 0], [0.024 * P.s, 0], [0.024 * P.s, 0.005], [0.019 * P.s, 0.005]], 10, 'st0', { axis: 'z' });
      k.pop();
    }
    k.box(0, y + 0.004, P.zf + 0.012, 0.016, 0.01, 0.012, 'rb');
  },
  kneePads: (g) => {
    for (const sd of ['L', 'R']) {
      const sh = g.bone('shin' + sd), p = g.pivot(sh), { P } = g.S, r = P.thighX * 0.82 + 0.012;
      const k = g.at(sh, 0).push(p.x, p.y + 0.01, p.z + r, 0.08, 0, 0);
      k.box(0, 0, 0.004, 0.085 * P.s, 0.11 * P.s, 0.025, 'rb', { ch: 0.01 }); k.box(0, 0.0, 0.017, 0.06 * P.s, 0.07 * P.s, 0.01, 'dk', { ch: 0.006 });
      k.pop(); k.push(p.x, p.y - 0.025, p.z); g.band(0, r + 0.006, r + 0.004, 0.022, 'rb', 12); k.pop();
    }
  },
  earDefenders: (g) => {
    const { P } = g.S, y = P.neckBase - 0.025 * P.s;
    const k = g.at('chest', 0);
    const yy = P.neckBase + 0.004;
    k.tube([[0.07, yy, 0.035], [0.062, yy + 0.03, -0.04], [0, yy + 0.04, -0.075], [-0.062, yy + 0.03, -0.04], [-0.07, yy, 0.035]], 0.0065, 6, 'dk');
    for (const sd of [1, -1]) k.push(sd * 0.072, yy - 0.012, 0.05, 1.1, sd * 0.55, 0).cyl(0, 0, 0, 0.03, 0.027, 0.026, 14, 'pb1', { axis: 'z' }).cyl(0, 0, -0.016, 0.027, 0.027, 0.008, 14, 'rb', { axis: 'z' }).cyl(0, 0, 0.0135, 0.016, 0.016, 0.002, 10, 'hz', { axis: 'z', capReg: 'hz' }).pop();
    void y;
  },
  pencilEar: (g) => {
    const { P } = g.S, y = P.earTop - 0.004;
    g.at('head', 0).push(-P.hw - 0.004, y, P.hcz - 0.005, -0.35, 0, PI / 2 - 0.15).cyl(0, 0, 0, 0.004, 0.004, 0.085, 6, 'hz').cyl(0, 0.048, 0, 0.004, 0.0005, 0.011, 6, 'pb2').pop();
  },
  wrench: (g) => {
    const m = new THREE.Group(), k = g.k; k.on(m, 0);
    k.box(0, 0, 0, 0.26, 0.026, 0.01, 'st0', { ch: 0.003 }); k.cyl(0.14, 0, 0, 0.032, 0.032, 0.012, 10, 'st0', { axis: 'z' }); k.box(0.165, 0, 0, 0.03, 0.022, 0.014, 'dk');
    k.cyl(-0.14, 0, 0, 0.022, 0.022, 0.012, 10, 'st0', { axis: 'z' }); k.box(-0.03, 0, 0, 0.12, 0.03, 0.014, 'red', { ch: 0.004 });
    g.props.wrench = m;
  },
  flightPatches: (g) => {
    const { P } = g.S, y = P.bustY + 0.045 * P.s;
    g.at('chest', 1).push(0.07 * P.s, y, g.S.front(y) * 0.97, -0.1, 0.32, 0).decal(0, 0, 0.002, 0.08 * P.s, 0.08 * P.s, 'cw:wings').pop();
    g.at('chest', 1).push(0.075 * P.s, y - 0.1 * P.s, g.S.front(y - 0.1) * 0.98, 0, 0.3, 0).decal(0, 0, 0.002, 0.06 * P.s, 0.06 * P.s, 'cw:fl3').pop();
    const yb = P.bustY + 0.02 * P.s;
    g.at('chest', 1).push(0, yb, -g.S.front(yb) * 0.98 - 0.004, 0, PI, 0).decal(0, 0, 0, 0.17 * P.s, 0.17 * P.s, 'cw:sparrow').pop();
  },
  aviators: (g) => {
    const { P } = g.S, y = P.hairY + 0.03 * P.s, z = P.hcz + P.hd * 0.62;
    const k = g.at('head', 0).push(0, y, z, -0.55, 0, 0);
    for (const sd of [1, -1]) { k.push(sd * 0.032, 0, 0, 0, 0, sd * -0.15).cyl(0, 0, 0, 0.024, 0.021, 0.004, 12, 'off', { axis: 'z', capReg: 'off' }).lathe(0, 0, -0.002, [[0.022, 0], [0.026, 0], [0.026, 0.004], [0.022, 0.004]], 12, 'br', { axis: 'z' }).pop(); }
    k.box(0, 0.01, 0, 0.022, 0.003, 0.003, 'br');
    for (const sd of [1, -1]) k.tube([[sd * 0.056, 0.004, -0.002], [sd * P.hw * 1.02, -0.004, -0.04], [sd * P.hw * 1.0, -0.012, -0.09]], 0.002, 4, 'br');
    k.pop();
  },
  headsetNeck: (g) => {
    const { P } = g.S, y = P.neckBase + 0.005;
    const k = g.at('chest', 0);
    k.tube([[0.075, y, 0.02], [0.065, y + 0.025, -0.05], [0, y + 0.035, -0.08], [-0.065, y + 0.025, -0.05], [-0.075, y, 0.02]], 0.0075, 6, 'dk');
    for (const sd of [1, -1]) k.push(sd * 0.082, y - 0.012, 0.035, 0.9, sd * 0.3, 0).cyl(0, 0, 0, 0.034, 0.03, 0.032, 12, 'pb1', { axis: 'z' }).cyl(0, 0, -0.018, 0.03, 0.03, 0.008, 12, 'rb', { axis: 'z' }).pop();
    k.tube([[-0.082, y - 0.02, 0.06], [-0.05, y - 0.05, 0.1], [-0.01, y - 0.06, 0.11]], 0.003, 4, 'dk');
  },
  stethoscope: (g) => {
    const { P } = g.S, y = P.neckBase - 0.01 * P.s, yb = P.bustY + 0.0;
    const zf = g.S.front(yb) + 0.008, zt = g.S.front(P.bustY + 0.08 * P.s) + 0.008;
    const k = g.at('chest', 0);
    k.tube([[0.06, yb - 0.02, zf], [0.07, P.bustY + 0.06 * P.s, zt], [0.07, y, 0.04], [0.05, y + 0.025, -0.05], [0, y + 0.035, -0.075], [-0.05, y + 0.025, -0.05], [-0.07, y, 0.04], [-0.07, P.bustY + 0.06 * P.s, zt], [-0.055, yb - 0.04, zf]], 0.0055, 6, 'rb');
    k.push(-0.055, yb - 0.055, zf + 0.004, 0.1, 0, 0).cyl(0, 0, 0, 0.022, 0.024, 0.012, 14, 'st0', { axis: 'z' }).cyl(0, 0, 0.007, 0.018, 0.018, 0.003, 14, 'st1', { axis: 'z' }).pop();
    k.push(0.06, yb - 0.03, zf + 0.004).cyl(0, 0, 0, 0.008, 0.008, 0.03, 8, 'st0').cyl(0, 0.02, 0, 0.007, 0.004, 0.012, 8, 'dk').pop();
  },
  medScanner: (g) => {
    const { P } = g.S, y = (P.waistY + P.pelvisY) / 2, a = -1.45, rx = g.S.side(y) + 0.03, rz = g.S.front(y) + 0.01;
    const k = g.at('hips', 0).push(Math.sin(a) * rx, y - 0.02, Math.cos(a) * rz, 0, a, 0);
    k.box(0, 0, 0, 0.07, 0.11, 0.035, 'pb0', { ch: 0.008 }); k.box(0, 0.06, 0.01, 0.03, 0.04, 0.02, 'dk', { ch: 0.004 });
    k.pop(); g.at('hips', 1).push(Math.sin(a) * (rx + 0.0185), y - 0.01, Math.cos(a) * (rz + 0.0185), 0, a, 0).decal(0, 0, 0, 0.055, 0.03, 'cw:scan').pop();
  },
  wristComp: (g) => {
    const fa = g.bone('farmL'), p = g.pivot(fa), { P } = g.S, r = P.armX * 0.92 + 0.008;
    const k = g.at(fa, 0).push(p.x + r * 0.6, p.y - 0.17 * P.s, p.z + r * 0.6, 0, PI / 4, 0);
    k.box(0, 0, 0, 0.05, 0.075, 0.014, 'dk', { ch: 0.004 }); k.pop();
    g.at(fa, 1).push(p.x + r * 0.6 + 0.005, p.y - 0.17 * P.s, p.z + r * 0.6 + 0.005, 0, PI / 4, 0).decal(0, 0, 0.0005, 0.04, 0.055, 'cw:wrist').pop();
    g.at(fa, 0).push(p.x, p.y - 0.17 * P.s, p.z); g.band(0, r + 0.002, r + 0.002, 0.03, 'rb', 10); g.k.pop();
  },
  fieldVest: (g) => {
    const { P } = g.S;
    for (const sd of [1, -1]) for (const [dy, w, h] of [[0.045, 0.07, 0.07], [-0.06, 0.075, 0.08], [-0.15, 0.08, 0.07]] as [number, number, number][]) {
      const y = P.bustY + dy * P.s, x = sd * 0.068 * P.s, z = g.S.front(y) + 0.008;
      const k = g.at(dy < -0.1 ? 'spine' : 'chest', 1).push(x, y, z, 0, sd * 0.3, 0);
      k.box(0, 0, 0, w * P.s, h * P.s, 0.022, 'cw:sage', { ch: 0.004 }); k.box(0, h * 0.42 * P.s, 0.004, w * 1.06 * P.s, 0.022, 0.028, 'cw:sage', { ch: 0.003 });
      k.on(g.bone(dy < -0.1 ? 'spine' : 'chest'), 0); const pv = g.pivot(g.bone(dy < -0.1 ? 'spine' : 'chest')); k.push(-pv.x, -pv.y, -pv.z).push(x, y, z, 0, sd * 0.3, 0).bolt(0, h * 0.38 * P.s, 0.02, 0.004, 'z', 'br').pop();
    }
    const y = P.bustY + 0.1 * P.s;
    g.at('chest', 0).push(0.1 * P.s, y, g.S.front(y)).torus(0, 0, 0.004, 0.012, 0.003, 8, 4, 'st0', 'z').pop();
  },
  seedPouch: (g) => {
    const { P } = g.S, y = P.pelvisY, a = 1.35, rx = g.S.side(y) + 0.03, rz = g.S.front(y) + 0.01;
    g.at('hips', 1).push(Math.sin(a) * rx, y - 0.04, Math.cos(a) * rz, 0, a, 0).box(0, 0, 0, 0.1, 0.12, 0.05, 'cw:canvas', { ch: 0.012 }).box(0, 0.065, 0.004, 0.105, 0.03, 0.058, 'cw:canvas', { ch: 0.006 }).pop();
    g.at('hips', 1).push(Math.sin(a) * (rx + 0.026), y - 0.045, Math.cos(a) * (rz + 0.026), 0, a, 0).decal(0, 0, 0, 0.08, 0.02, 'cw:label').pop();
  },
  sprig: (g) => {
    const { P } = g.S, y = P.bustY + 0.08 * P.s, x = 0.075 * P.s, z = g.S.front(y) + 0.02;
    const k = g.at('chest', 1).push(x, y, z);
    k.cyl(0, 0.03, 0, 0.002, 0.003, 0.07, 4, 'cw:leaf');
    for (const [a, h, l] of [[0.6, 0.05, 0.04], [-0.8, 0.065, 0.035], [2.4, 0.04, 0.03], [-2.2, 0.075, 0.03]] as [number, number, number][]) {
      k.push(0, h, 0, 0, a, 0.9); k.tri([0, 0, 0], [0.012, l * 0.5, 0], [0, l, 0], 'cw:leaf', [0, 0, 1, 0.5, 0, 1]); k.tri([0, 0, 0], [0, l, 0], [-0.012, l * 0.5, 0], 'cw:leaf', [0, 0, 0, 1, 1, 0.5]); k.tri([0, 0, 0], [0, l, 0], [0.012, l * 0.5, 0], 'cw:leaf', [0, 0, 0, 1, 1, 0.5]); k.tri([0, 0, 0], [-0.012, l * 0.5, 0], [0, l, 0], 'cw:leaf', [0, 0, 1, 0.5, 0, 1]); k.pop();
    }
    k.pop();
  },
  specimenJar: (g) => {
    const m = new THREE.Group(), k = g.k; k.on(m, 1);
    k.cyl(0, 0, 0, 0.034, 0.034, 0.11, 12, 'cw:jar', { caps: 'bot' });
    k.on(m, 0); k.cyl(0, 0.062, 0, 0.036, 0.036, 0.016, 12, 'st0'); k.cyl(0, 0.072, 0, 0.012, 0.012, 0.008, 8, 'br');
    g.props.jar = m;
  },
  apron: (g) => {
    const { P } = g.S;
    // the bib, following the chest down to the waist
    const yt = P.bustY + 0.1 * P.s, wt = 0.1 * P.s;
    const rows: [V3, V3][] = [];
    for (const y of [yt, P.bustY + 0.03 * P.s, P.bustY - 0.05 * P.s, P.waistY]) { const z = g.S.front(y) + 0.006, w = y > P.bustY ? wt : wt + (P.bustY - y) * 0.9; rows.push([[-w, y, z - w * w * 0.8], [w, y, z - w * w * 0.8]]); }
    g.at('chest', 1); g.sheet(rows, 'cw:apron');
    // the neck strap
    g.at('chest', 0).tube([[-wt, yt, g.S.front(yt)], [-0.06, P.neckBase + 0.02, -0.02], [0, P.neckBase + 0.035, -0.07], [0.06, P.neckBase + 0.02, -0.02], [wt, yt, g.S.front(yt)]], 0.006, 5, 'cv');
    // the skirt, from the waist to the knee, wrapping round the front half; it rides the coat-tail bone
    const coat = g.bone('coat');
    g.at(coat, 1);
    const yw = P.waistY - 0.01, yk = P.kneeY + 0.06 * P.s;
    const cols = 9, rowsY = [yw, (yw + yk) / 2, yk];
    const k = g.k;
    for (let r = 0; r < rowsY.length - 1; r++) for (let c = 0; c < cols; c++) {
      const a0 = -1.25 + (2.5 * c) / cols, a1 = -1.25 + (2.5 * (c + 1)) / cols;
      const pt = (a: number, y: number): V3 => { const f = 1 + (yw - y) * 0.35; const rx = (g.S.side(Math.max(y, P.crotchY)) + 0.012) * f, rz = (g.S.front(Math.max(y, P.pelvisY)) + 0.014) * f; return [Math.sin(a) * rx, y, Math.cos(a) * rz]; };
      const A = pt(a0, rowsY[r]), B = pt(a1, rowsY[r]), C = pt(a1, rowsY[r + 1]), D = pt(a0, rowsY[r + 1]);
      const u0 = c / cols * 3, u1 = (c + 1) / cols * 3, v0 = r * 1.5, v1 = (r + 1) * 1.5;
      k.quad(A, D, C, B, 'cw:apron', [u0, v0, u0, v1, u1, v1, u1, v0]); k.quad(A, B, C, D, 'cw:apron', [u0, v0, u1, v0, u1, v1, u0, v1]);
    }
    // the waist ties
    g.at('hips', 0); g.band(P.waistY - 0.012, g.S.side(P.waistY) + 0.01, g.S.front(P.waistY) + 0.008, 0.02, 'cv', 20, PI * 0.55, PI * 1.45);
  },
  towel: (g) => {
    const { P } = g.S, x = P.shX * 0.55, yt = P.shoulderY + 0.05 * P.s;
    const zf = (y: number) => g.S.front(y) + 0.01;
    const rows: [V3, V3][] = [
      [[x - 0.05, P.bustY - 0.02, zf(P.bustY) - 0.01], [x + 0.04, P.bustY - 0.04, zf(P.bustY) - 0.02]],
      [[x - 0.05, P.bustY + 0.08 * P.s, zf(P.bustY + 0.08) - 0.005], [x + 0.045, P.bustY + 0.07 * P.s, zf(P.bustY + 0.07) - 0.015]],
      [[x - 0.045, yt, 0.05], [x + 0.05, yt - 0.01, 0.04]],
      [[x - 0.045, yt + 0.004, -0.02], [x + 0.05, yt - 0.006, -0.02]],
      [[x - 0.045, P.bustY + 0.06 * P.s, -zf(P.bustY) + 0.01], [x + 0.05, P.bustY + 0.05 * P.s, -zf(P.bustY) + 0.015]],
    ];
    g.at('chest', 1); g.sheet(rows, 'cw:towel');
  },
  readers: (g) => {
    const { P } = g.S, y = P.crown - 0.025 * P.s, z = P.hcz + P.hd * 0.45;
    const k = g.at('head', 0).push(0, y, z, -1.1, 0, 0);
    for (const sd of [1, -1]) k.push(sd * 0.03, 0, 0).cyl(0, 0, 0, 0.017, 0.017, 0.003, 10, 'glass', { axis: 'z', capReg: 'glass' }).lathe(0, 0, -0.001, [[0.016, 0], [0.02, 0], [0.02, 0.003], [0.016, 0.003]], 10, 'pb2', { axis: 'z' }).pop();
    k.box(0, 0.006, 0, 0.022, 0.003, 0.003, 'pb2');
    k.pop();
  },
  ladle: (g) => {
    const m = new THREE.Group(), k = g.k; k.on(m, 0);
    k.box(0, 0, 0, 0.3, 0.014, 0.008, 'st1', { ch: 0.002 }); k.box(-0.11, 0, 0, 0.09, 0.022, 0.016, 'pb1', { ch: 0.004 });
    k.push(0.16, -0.025, 0).lathe(0, 0, 0, [[0.001, -0.03], [0.03, -0.024], [0.042, -0.006], [0.044, 0.0], [0.04, 0.0], [0.038, -0.006], [0.028, -0.02], [0.001, -0.025]], 12, 'st0').pop();
    g.props.ladle = m;
  },
  tacVest: (g) => {
    const { P } = g.S;
    const yT = P.bustY + 0.09 * P.s, yB = P.waistY - 0.02 * P.s, yc = (yT + yB) / 2, h = yT - yB;
    for (const fb of [1, -1]) {
      const z = g.S.front(yc) + 0.016;
      const k = g.at('chest', 1).push(0, yc, fb * z, 0, fb > 0 ? 0 : PI, 0);
      k.box(0, 0, 0, P.bustX * 2.0, h, 0.03, 'cw:nylon', { ch: 0.012 });
      k.box(0, 0.01, 0.018, P.bustX * 1.5, h * 0.8, 0.014, 'cw:web', { ch: 0.008 });
      if (fb > 0) {
        for (const x of [-0.07, 0, 0.07]) k.push(x * P.s, -h * 0.28, 0.034).box(0, 0, 0, 0.055 * P.s, 0.085 * P.s, 0.03, 'cw:nylon', { ch: 0.006 }).box(0, 0.044 * P.s, 0.004, 0.06 * P.s, 0.02, 0.036, 'cw:web', { ch: 0.004 }).pop();
        k.push(0.07 * P.s, h * 0.2, 0.027).decal(0, 0, 0, 0.065 * P.s, 0.065 * P.s, 'cw:sec').pop();
      }
      k.pop();
    }
    // shoulder straps and the cummerbund
    for (const sd of [1, -1]) g.at('chest', 1).tube([[sd * 0.1 * P.s, yT, g.S.front(yT) + 0.01], [sd * 0.11 * P.s, P.shoulderY + 0.04 * P.s, 0.0], [sd * 0.1 * P.s, yT, -g.S.front(yT) - 0.01]], 0.012, 4, 'cw:web');
    g.at('spine', 1); g.band(yB + 0.02, g.S.side(yB) + 0.02, g.S.front(yB) + 0.02, 0.07 * P.s, 'cw:nylon', 20);
  },
  holster: (g) => {
    const th = g.bone('thighR'), p = g.pivot(th), { P } = g.S, r = P.thighX + 0.02;
    const k = g.at(th, 1).push(p.x - r, p.y - 0.12 * P.s, p.z + 0.01, 0, -PI / 2, 0);
    k.box(0, 0, 0, 0.09, 0.17, 0.04, 'cw:nylon', { ch: 0.01 });
    k.on(th, 0); const pv = g.pivot(th); k.push(-pv.x, -pv.y, -pv.z).push(p.x - r, p.y - 0.12 * P.s, p.z + 0.01, 0, -PI / 2, 0);
    k.box(0.0, 0.11, 0.002, 0.034, 0.06, 0.03, 'dk', { ch: 0.006 }); k.box(0.02, 0.085, 0.0, 0.06, 0.025, 0.028, 'pb0', { ch: 0.004 }); k.cyl(0.05, 0.085, 0, 0.009, 0.009, 0.01, 8, 'lensB', { axis: 'x', capReg: 'lensB' });
    k.pop(); g.at(th, 0).push(p.x, p.y - 0.04, p.z); g.band(0, r + 0.004, r, 0.03, 'rb', 12); g.k.pop();
    g.at(th, 0).push(p.x, p.y - 0.2, p.z); g.band(0, r - 0.004, r - 0.008, 0.03, 'rb', 12); g.k.pop();
  },
  shoulderRadio: (g) => {
    const { P } = g.S, y = P.bustY + 0.1 * P.s, x = 0.095 * P.s, z = g.S.front(y) + 0.03;
    const k = g.at('chest', 0).push(x, y, z, -0.15, 0.3, 0);
    k.box(0, 0, 0, 0.05, 0.075, 0.025, 'pb0', { ch: 0.006 }); k.cyl(0.016, 0.07, 0, 0.004, 0.003, 0.08, 6, 'dk'); k.cyl(-0.012, 0.042, 0, 0.007, 0.007, 0.012, 8, 'knurl');
    k.vent(0, -0.02, 0.013, 0.036, 0.02, 0.004);
    k.pop(); g.at('chest', 1).push(x, y, z, -0.15, 0.3, 0).decal(0, 0.012, 0.0132, 0.04, 0.02, 'cw:radio').pop();
  },
};

// ------------------------------------------------------------------ build
const PROP_SIDE: Record<string, 'R' | 'L'> = { tablet: 'L', mug: 'R', wrench: 'R', ladle: 'R', jar: 'R' };
export function buildCrewModel(id: CrewId, o: { scale?: number; material?: THREE.Material; noGear?: boolean } = {}): CrewModel {
  ready();
  const d = ROSTER[id];
  const rig = new Researcher(d.app, o.material ?? wm());
  (rig as unknown as { ggOverrides: unknown }).ggOverrides = { ...d.ov, badge: d.gear.includes('lanyard') ? { col: d.dept_col, name: d.name } : undefined };
  rig.setOutfit(d.outfit);
  rig.skin.castShadow = true;
  rig.setExpression('neutral');
  const P = ggProps(specOf(rig.app, d.outfit, rig.dims, 0, {}, (rig as unknown as { ggOverrides: never }).ggOverrides), rig.dims);
  const S = surfaces(P, d);
  const gk = new GearKit(rig, S);
  if (!o.noGear) for (const gname of d.gear) { try { GEAR[gname]?.(gk, d); } catch (e) { console.warn('crew gear', id, gname, e); } }
  gk.finish();
  // the researcher's clipboard gives way to the tablet
  if (gk.props.tablet) { const clip = (rig as unknown as { clip?: THREE.Mesh }).clip; if (clip) clip.visible = false, clip.scale.setScalar(0.0001); }
  rig.root.scale.setScalar(d.scale * (o.scale ?? 1));
  rig.root.traverse((m) => { if ((m as THREE.Mesh).isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  rig.root.userData.crewId = id;
  const props = gk.props;
  let shown: Record<'R' | 'L', string | null> = { R: null, L: null };
  const M: CrewModel = {
    id, def: d, rig, root: rig.root, P, props, dead: false,
    update(dt, inp) {
      if (M.dead) { rig.update(dt, { speed: 0 } as never); return; }
      rig.update(dt, (inp ?? {}) as never);
    },
    showProp(name, side) {
      const sd = side ?? (name ? PROP_SIDE[name] ?? 'R' : 'R');
      if (shown[sd] === name) return;
      shown = { ...shown, [sd]: name };
      const p = name ? props[name] : null;
      if (!p) { rig.hold(sd, null); return; }
      if (name === 'tablet') { p.position.set(0, 0.13 * rig.s, 0.03 * rig.s); p.rotation.set(0.35, -PI / 2, 0, 'YXZ'); rig.hold(sd, p, 'raw'); }
      else if (name === 'mug' || name === 'jar') { p.position.set(0.0, -0.06 * rig.s, 0.035); p.rotation.set(0, 0, 0); rig.hold(sd, p, 'raw'); }
      else rig.hold(sd, p, 'perp');
    },
    die(how = '', from, k = 4) {
      if (M.dead) return;
      M.dead = true;
      const r = rig.root, f = from ?? new THREE.Vector3(r.position.x, r.position.y, r.position.z - 1);
      const imp = new THREE.Vector3(r.position.x - f.x, 0.5, r.position.z - f.z).normalize().multiplyScalar(k);
      rig.startRagdoll(new THREE.Vector3(imp.x * 0.5, how === 'fall' ? -1 : 1.2, imp.z * 0.5), imp, 'torso_u');
      rig.setExpression(how === 'creature' ? 'pain' : 'dead', 999);
    },
    dispose() { rig.root.removeFromParent(); (rig as unknown as { dispose?: () => void }).dispose?.(); },
  };
  // the default props in hand
  if (props.tablet) M.showProp('tablet');
  return M;
}
