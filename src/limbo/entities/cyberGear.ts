// Low-poly models for cyberware (retro-industrial: riveted steel, cream enamel,
// bakelite, brass, cloth-wrapped cables, valves and pilot lamps), shared by the survivor rig (humanRig.ts hangs
// them on the bones so they swing, bend and curl with the animation), the
// boxed parts as items (src/content/items/cyber.ts) and the operating table
// (src/ui/surgery). One builder per style and bone role; every piece is built
// in its bone's local space (limbs hang along -y from the joint, the thumb
// side is +z, side k = +1 left / -1 right). Textures are the 'i_cy_*' item
// textures registered by the cyber content file.
import * as THREE from 'three';
import { ModelBuilder } from '../gfx/modelBuilder';
import type { BoneName, Dims } from './humanModel';
import { CyberSlot, CyberStyle, SLOT_KIND, cyberDef, CYBER_SLOTS } from '../survival/cyberParts';

export const CT = {
  rust: 'i_cy_rust', paint: 'i_cy_paint', hazard: 'i_cy_hazard', pipe: 'i_cy_pipe', chrome: 'i_cy_chrome', shell: 'i_cy_shell',
  black: 'i_cy_black', hose: 'i_cy_hose', glow: 'i_cy_glow', teeth: 'i_cy_teeth', lens: 'i_cy_lens', wires: 'i_cy_wires', steel: 'i_cy_steel',
  brass: 'i_cy_brass', mint: 'i_cy_mint', valve: 'i_cy_valve', gauge: 'i_cy_gauge',
};
type MB = ModelBuilder;
export type Role = 'uarm' | 'farm' | 'hand' | 'f1' | 'f2' | 'th' | 'thigh' | 'shin' | 'foot' | 'head' | 'chest' | 'spine' | 'hips';

const all = (t: string) => ({ sides: t, top: t, bottom: t });
type PO = { color?: number; emissive?: number; rTop?: number; segs?: number };
/** a round rod hanging from y0 down to y1 (y1 < y0), optionally tapered */
function rod(mb: MB, x: number, y0: number, y1: number, z: number, r: number, t: string, o: PO = {}) {
  mb.cylinder(x, y1, z, r, y0 - y1, o.segs ?? 8, all(t), { fit: true, color: o.color, emissive: o.emissive, rTop: o.rTop });
}
/** a bevelled housing: an octagonal prism w x d (x, z), from y0 down to y1, tapering to `taper` at the bottom */
function hull(mb: MB, x: number, y0: number, y1: number, z: number, w: number, d: number, t: string, o: { color?: number; emissive?: number; taper?: number } = {}) {
  mb.push().translate(x, y1, z).scale(w / 2, 1, d / 2).rotateY(Math.PI / 8);
  mb.cylinder(0, 0, 0, (o.taper ?? 1) * 1.08, y0 - y1, 8, all(t), { fit: true, color: o.color, emissive: o.emissive, rTop: 1.08 });
  mb.pop();
}
/** a rounded lump (joints, knuckles, domed plates): a sphere scaled to sx, sy, sz radii */
function lump(mb: MB, x: number, y: number, z: number, sx: number, sy: number, sz: number, t: string, o: { color?: number; emissive?: number } = {}) {
  mb.push().translate(x, y, z).scale(sx, sy, sz);
  mb.sphere(0, 0, 0, 1, 10, 7, t, { color: o.color, emissive: o.emissive });
  mb.pop();
}
/** a slab with rounded vertical corners (radius r): x, z centre, y bottom */
function rbox(mb: MB, x: number, y: number, z: number, w: number, h: number, d: number, r: number, t: string, o: { color?: number; emissive?: number } = {}) {
  r = Math.min(r, w / 2 - 0.001, d / 2 - 0.001);
  mb.box(x, y, z, w - 2 * r, h, d, t, { fit: true, color: o.color, emissive: o.emissive });
  for (const k of [-1, 1]) mb.box(x + k * (w / 2 - r / 2), y, z, r, h, d - 2 * r, t, { fit: true, color: o.color, emissive: o.emissive });
  for (const kx of [-1, 1]) for (const kz of [-1, 1]) mb.cylinder(x + kx * (w / 2 - r), y, z + kz * (d / 2 - r), r, h, 8, all(t), { fit: true, color: o.color, emissive: o.emissive });
}
/** a capsule from y0 down to y1 (finger segments, struts) */
function capsule(mb: MB, x: number, y0: number, y1: number, z: number, r: number, t: string, o: { color?: number } = {}) {
  rod(mb, x, y0, y1, z, r, t, { color: o.color, segs: 8 });
  lump(mb, x, y0, z, r, r, r, t, o); lump(mb, x, y1, z, r, r, r, t, o);
}
function bolt(mb: MB, x: number, y: number, z: number, axis: 'x' | 'z' = 'x', r = 0.008) {
  if (axis === 'x') mb.cylinderX(x, y, z, r, 0.012, 8, all(CT.chrome), { fit: true });
  else mb.cylinderZ(x, y, z, r, 0.012, 8, all(CT.chrome), { fit: true });
}
/** where a part shows it is alive: a short row of brass-ringed pilot lamps along the strip's long side */
function glowStrip(mb: MB, x: number, y: number, z: number, w: number, h: number, d: number, col: number) {
  const L = Math.max(w, h, d), n = Math.max(1, Math.min(3, Math.round(L / 0.05)));
  const ax = h >= w && h >= d ? 1 : w >= d ? 0 : 2;
  for (let i = 0; i < n; i++) {
    const o = (i - (n - 1) / 2) * Math.min(0.03, L / n);
    const px = x + (ax === 0 ? o : 0), py = y - h / 2 + (ax === 1 ? o : 0), pz = z + (ax === 2 ? o : 0);
    lump(mb, px, py, pz, 0.011, 0.011, 0.011, CT.brass);
    lump(mb, px, py, pz, 0.008, 0.008, 0.008, CT.glow, { color: col, emissive: 1.7 });
  }
}
/** a vacuum valve standing in a brass socket, its filament glowing through the glass */
function valve(mb: MB, x: number, y: number, z: number, col: number, len = 0.04) {
  mb.cylinder(x, y, z, 0.012, 0.01, 8, all(CT.brass), { fit: true });
  mb.cylinder(x, y + 0.01, z, 0.009, len, 8, { sides: CT.valve, top: CT.valve, bottom: CT.brass }, { fit: true, color: col, emissive: 1.1, rTop: 0.007 });
  lump(mb, x, y + 0.01 + len, z, 0.007, 0.005, 0.007, CT.valve, { color: col, emissive: 0.8 });
}
/** a hinge across the joint (axis x) with domed caps */
function hinge(mb: MB, r: number, len: number, t = CT.steel) {
  mb.cylinderX(0, 0, 0, r, len, 10, all(t), { fit: true });
  for (const k of [-1, 1]) lump(mb, k * len / 2, 0, 0, r * 0.25, r * 0.8, r * 0.8, CT.chrome);
}
/** articulated fingers on the finger bones: capsule segments, round knuckles */
function fingers(mb: MB, seg: number, r: number, t: string, n = 4, spread = 0.016, z0 = 0.024) {
  for (let i = 0; i < n; i++) {
    const z = z0 - i * spread;
    capsule(mb, 0, -0.004, -seg + (i === 0 || i === n - 1 ? 0.008 : 0), z, r, t);
  }
}

/** shared rounded primitives (the operating theatre's machines use them too) */
export const shapes = { rod, hull, lump, capsule, rbox, bolt, hinge };

// ------------------------------------------------------------------ arms
function armScrap(mb: MB, role: Role, k: number, glow: number) {
  switch (role) {
    case 'uarm':
      // a dented hubcap for a shoulder over a ball joint, a painted plate, two pipes and a jack piston to the elbow
      lump(mb, k * 0.012, -0.03, 0, 0.055, 0.05, 0.055, CT.steel);
      mb.push().translate(k * 0.042, -0.03, 0).rotateZ(k * Math.PI / 2);
      mb.cylinder(0, -0.016, 0, 0.066, 0.03, 12, { sides: CT.rust, top: CT.paint, bottom: CT.rust }, { fit: true, rTop: 0.05 });
      mb.pop();
      hull(mb, 0, -0.06, -0.15, 0.002, 0.074, 0.08, CT.paint, { taper: 0.85 });
      rod(mb, 0.016, -0.06, -0.27, 0.02, 0.013, CT.pipe);
      rod(mb, -0.017, -0.06, -0.27, -0.014, 0.013, CT.pipe, { color: 0xc8b8a0 });
      rod(mb, 0.0, -0.13, -0.25, -0.03, 0.019, CT.black);
      rod(mb, 0.0, -0.2, -0.29, -0.03, 0.009, CT.chrome);
      rod(mb, -0.03, -0.04, -0.26, 0.03, 0.007, CT.hose, { segs: 6 });
      for (const y of [-0.17, -0.24]) mb.cylinder(0, y, 0.003, 0.034, 0.012, 10, all(CT.steel), { fit: true });
      bolt(mb, k * 0.038, -0.08, 0.02); bolt(mb, k * 0.038, -0.13, -0.02);
      break;
    case 'farm':
      hinge(mb, 0.03, 0.078, CT.rust);
      lump(mb, 0, 0, 0, 0.034, 0.034, 0.034, CT.steel);
      bolt(mb, k * 0.042, 0, 0);
      hull(mb, 0, -0.03, -0.235, 0, 0.058, 0.062, CT.rust, { taper: 0.82 });
      mb.push().translate(k * 0.029, -0.19, 0).rotateZ(k * 0.04);
      mb.box(0, 0, 0, 0.004, 0.1, 0.044, CT.hazard, { fit: true });
      mb.pop();
      rod(mb, 0, -0.04, -0.21, 0.035, 0.008, CT.wires, { segs: 6 });
      glowStrip(mb, -k * 0.03, -0.1, 0.016, 0.004, 0.02, 0.004, glow);
      for (const y of [-0.08, -0.16]) mb.cylinder(0, y, 0, 0.036, 0.014, 10, all(CT.hose), { fit: true });
      mb.cylinder(0, -0.262, 0, 0.03, 0.03, 10, all(CT.steel), { fit: true, rTop: 0.034 });
      break;
    case 'hand':
      // the vice: a rounded cast body, the lead screw across it
      hull(mb, 0, -0.03, -0.11, 0, 0.046, 0.062, CT.paint, { taper: 0.9 });
      mb.cylinderZ(0, -0.04, 0.0, 0.012, 0.09, 8, all(CT.chrome), { fit: true });
      lump(mb, 0, -0.04, 0.047, 0.016, 0.016, 0.006, CT.steel);
      break;
    case 'f1': hull(mb, 0, 0.0, -0.06, -0.004, 0.04, 0.046, CT.steel, { taper: 0.9 }); lump(mb, 0, -0.06, -0.004, 0.02, 0.008, 0.023, CT.steel); break;
    case 'f2': hull(mb, 0, 0.0, -0.04, -0.004, 0.036, 0.042, CT.rust, { taper: 0.8 }); for (let i = 0; i < 4; i++) mb.cylinder(-0.012 + i * 0.008, -0.048, 0.016, 0.003, 0.008, 4, all(CT.teeth), { rTop: 0 }); break;
    case 'th': hull(mb, 0, 0.0, -0.065, 0.004, 0.034, 0.02, CT.steel, { taper: 0.85 }); lump(mb, 0, -0.065, 0.004, 0.017, 0.007, 0.01, CT.steel); break;
  }
}
function armServo(mb: MB, role: Role, k: number, glow: number) {
  switch (role) {
    case 'uarm':
      lump(mb, k * 0.02, -0.03, 0, 0.062, 0.062, 0.062, CT.shell);
      rod(mb, 0, -0.06, -0.26, 0, 0.042, CT.shell, { rTop: 0.05, segs: 12 });
      for (const y of [-0.07, -0.25]) mb.cylinder(0, y, 0, 0.047, 0.012, 12, all(CT.brass), { fit: true });
      rod(mb, -k * 0.035, -0.08, -0.24, -0.02, 0.007, CT.hose, { segs: 6 });
      rod(mb, 0, -0.25, -0.285, 0, 0.034, CT.black, { segs: 12 });
      break;
    case 'farm':
      hinge(mb, 0.032, 0.07, CT.brass);
      lump(mb, 0, 0, 0, 0.036, 0.036, 0.036, CT.black);
      rod(mb, 0, -0.02, -0.235, 0, 0.032, CT.shell, { rTop: 0.042, segs: 12 });
      // the amplifier: a valve on a bakelite saddle on the back of the forearm
      lump(mb, -k * 0.034, -0.16, 0, 0.012, 0.04, 0.022, CT.black);
      valve(mb, -k * 0.046, -0.17, 0, glow, 0.045);
      glowStrip(mb, 0, -0.06, 0.04, 0.004, 0.02, 0.004, glow);
      mb.cylinder(0, -0.235, 0, 0.034, 0.012, 12, all(CT.brass), { fit: true });
      rod(mb, 0, -0.235, -0.255, 0, 0.026, CT.black, { segs: 12 });
      break;
    case 'hand': lump(mb, 0, -0.05, 0, 0.016, 0.05, 0.036, CT.shell); lump(mb, 0, -0.012, 0, 0.022, 0.016, 0.026, CT.black); glowStrip(mb, k * 0.016, -0.05, 0, 0.003, 0.02, 0.003, glow); break;
    case 'f1': fingers(mb, 0.045, 0.0075, CT.shell); break;
    case 'f2': fingers(mb, 0.032, 0.0068, CT.shell); break;
    case 'th': capsule(mb, 0, -0.004, -0.05, 0, 0.008, CT.shell); break;
  }
}
function armPiston(mb: MB, role: Role, k: number, glow: number) {
  switch (role) {
    case 'uarm':
      lump(mb, k * 0.012, -0.05, 0, 0.065, 0.06, 0.065, CT.steel);
      hull(mb, k * 0.008, -0.07, -0.19, 0, 0.1, 0.1, CT.steel, { taper: 0.8 });
      mb.push().translate(k * 0.055, -0.13, 0).rotateZ(-k * 0.08);
      mb.box(0, -0.04, 0, 0.006, 0.08, 0.07, CT.hazard, { fit: true });
      mb.pop();
      rod(mb, 0, -0.18, -0.27, 0, 0.034, CT.black, { segs: 10 });
      break;
    case 'farm':
      hinge(mb, 0.042, 0.1, CT.steel);
      hull(mb, 0, -0.03, -0.24, 0, 0.074, 0.074, CT.black, { taper: 0.9 });
      for (const z of [0.046, -0.046]) { rod(mb, 0, -0.01, -0.12, z, 0.016, CT.black, { segs: 10 }); rod(mb, 0, -0.1, -0.24, z, 0.008, CT.chrome); }
      glowStrip(mb, k * 0.04, -0.12, 0, 0.004, 0.06, 0.02, glow);
      break;
    case 'hand': hull(mb, 0, -0.02, -0.15, 0, 0.078, 0.096, CT.steel, { taper: 1.1 }); lump(mb, 0, -0.15, 0, 0.04, 0.02, 0.05, CT.steel); break;
    case 'f1': lump(mb, 0, -0.02, -0.004, 0.036, 0.022, 0.046, CT.black); break;
    case 'f2': break;
    case 'th': lump(mb, 0, -0.02, 0, 0.016, 0.024, 0.016, CT.steel); break;
  }
}
// ------------------------------------------------------------------ hands only (hand slot)
function handVise(mb: MB, role: Role, k: number, glow: number) {
  if (role === 'farm') { mb.cylinder(0, -0.27, 0, 0.034, 0.03, 12, all(CT.steel), { fit: true, rTop: 0.038 }); glowStrip(mb, -k * 0.032, -0.245, 0, 0.004, 0.01, 0.004, glow); return; }
  if (role === 'hand') { hull(mb, 0, -0.02, -0.11, 0, 0.048, 0.064, CT.paint, { color: 0xffe080, taper: 0.9 }); mb.cylinderZ(0, -0.04, 0, 0.012, 0.09, 8, all(CT.chrome), { fit: true }); return; }
  armScrap(mb, role, k, glow);
}
function handTool(mb: MB, role: Role, k: number, glow: number) {
  switch (role) {
    case 'farm': mb.cylinder(0, -0.27, 0, 0.032, 0.03, 12, all(CT.black), { fit: true, rTop: 0.036 }); break;
    case 'hand': lump(mb, 0, -0.05, 0, 0.018, 0.048, 0.034, CT.black); glowStrip(mb, k * 0.018, -0.05, 0, 0.003, 0.02, 0.003, glow); break;
    case 'f1':
      rod(mb, 0, 0, -0.06, 0.022, 0.006, CT.chrome, { rTop: 0.002 }); rod(mb, 0, 0, -0.05, 0.006, 0.005, CT.steel);
      mb.push().translate(0, -0.035, -0.012); mb.scale(0.4, 1, 1); lump(mb, 0, 0, 0, 0.01, 0.035, 0.008, CT.chrome); mb.pop();
      rod(mb, 0, 0, -0.045, -0.027, 0.006, CT.chrome, { rTop: 0.003 });
      break;
    case 'f2': lump(mb, 0, -0.02, 0.022, 0.006, 0.006, 0.006, CT.glow, { color: glow, emissive: 1.5 }); break;
    case 'th': rod(mb, 0, 0, -0.05, 0, 0.007, CT.chrome, { rTop: 0.003 }); break;
  }
}
// ------------------------------------------------------------------ legs
function legScrap(mb: MB, role: Role, k: number, glow: number) {
  switch (role) {
    case 'thigh':
      lump(mb, k * 0.01, -0.05, 0, 0.06, 0.05, 0.058, CT.steel);
      hull(mb, k * 0.01, -0.06, -0.14, 0, 0.1, 0.1, CT.paint, { taper: 0.8 });
      rod(mb, 0, -0.06, -0.41, 0, 0.026, CT.pipe, { segs: 10 });
      rod(mb, 0.02, -0.1, -0.38, -0.03, 0.008, CT.hose, { segs: 6 });
      for (const y of [-0.2, -0.32]) mb.cylinder(0, y, 0, 0.036, 0.014, 10, all(CT.steel), { fit: true });
      bolt(mb, k * 0.054, -0.08, 0);
      glowStrip(mb, -k * 0.03, -0.25, 0.024, 0.008, 0.02, 0.008, glow);
      break;
    case 'shin':
      hinge(mb, 0.042, 0.095, CT.rust); bolt(mb, k * 0.05, 0, 0, 'x', 0.012);
      lump(mb, 0, 0, 0.02, 0.03, 0.03, 0.02, CT.rust);
      // a van shock absorber: spring coils round a chrome rod
      rod(mb, 0, -0.03, -0.38, 0, 0.012, CT.chrome);
      for (let i = 0; i < 7; i++) mb.cylinder(0, -0.07 - i * 0.042, 0, 0.034, 0.012, 10, all(CT.rust), { fit: true });
      rod(mb, 0, -0.03, -0.1, 0, 0.032, CT.black, { segs: 10 });
      mb.cylinder(0, -0.43, 0, 0.03, 0.05, 10, all(CT.rust), { fit: true, rTop: 0.026 });
      break;
    case 'foot':
      // a steel-toe boot welded on: a rounded upper, a domed toe cap, a cleated rubber sole
      hull(mb, 0, -0.01, -0.07, 0.0, 0.08, 0.09, CT.rust, { taper: 1.1 });
      lump(mb, 0, -0.07, 0.07, 0.045, 0.035, 0.09, CT.rust);
      lump(mb, 0, -0.075, 0.13, 0.044, 0.03, 0.04, CT.steel);
      mb.push().translate(0, -0.11, 0.05).scale(0.048, 1, 0.13);
      mb.cylinder(0, 0, 0, 1, 0.018, 12, all(CT.hose), { fit: true });
      mb.pop();
      break;
  }
}
function legCoil(mb: MB, role: Role, k: number, glow: number) {
  switch (role) {
    case 'thigh':
      lump(mb, 0, -0.04, 0, 0.065, 0.05, 0.065, CT.shell);
      rod(mb, 0, -0.03, -0.41, 0, 0.05, CT.shell, { rTop: 0.07, segs: 12 });
      for (const y of [-0.1, -0.38]) mb.cylinder(0, y, 0, 0.058, 0.014, 12, all(CT.brass), { fit: true });
      glowStrip(mb, k * 0.05, -0.2, 0.03, 0.004, 0.08, 0.012, glow);
      break;
    case 'shin': {
      // a clockwork knee (a brass gear on the hinge) and a sprung steel leaf
      hinge(mb, 0.044, 0.1, CT.chrome);
      mb.cylinderX(k * 0.056, 0, 0, 0.05, 0.012, 14, all(CT.brass), { fit: true });
      for (let i = 0; i < 9; i++) {
        const a = (i / 8) * 1.9, y = -0.04 - i * 0.045, z = -Math.sin(a) * 0.07;
        mb.push().translate(0, y, z).rotateX(-Math.cos(a) * 0.5);
        hull(mb, 0, 0.0, -0.05, 0, 0.05, 0.016, i % 3 === 1 ? CT.brass : CT.steel);
        mb.pop();
      }
      glowStrip(mb, 0, -0.2, 0.018, 0.012, 0.1, 0.003, glow);
      break;
    }
    case 'foot': mb.push().translate(0, -0.085, 0.07).scale(0.026, 1, 0.09); mb.cylinder(0, 0, 0, 1, 0.016, 12, all(CT.hose), { fit: true }); mb.pop(); lump(mb, 0, -0.07, 0.03, 0.024, 0.012, 0.05, CT.steel); break;
  }
}
// ------------------------------------------------------------------ head, spine, skin
function eyesLamp(mb: MB, d: Dims, glow: number) {
  const s = d.s * d.headS, y = 0.104 * s, z = 0.088 * s;
  for (const x of [-0.033, 0.033]) {
    mb.cylinderZ(x * s, y, z, 0.017 * s, 0.014, 12, { sides: CT.steel, top: CT.steel, bottom: CT.steel }, { fit: true });
    lump(mb, x * s, y, z + 0.008, 0.012 * s, 0.012 * s, 0.006, CT.lens, { color: glow, emissive: 1.8 });
  }
  mb.cylinderX(0, y - 0.004, z - 0.004, 0.006, 0.03 * s, 8, all(CT.steel), { fit: true });
}
function eyesLedger(mb: MB, d: Dims, glow: number) {
  const s = d.s * d.headS, y = 0.104 * s, z = 0.088 * s;
  mb.cylinderZ(-0.033 * s, y, z + 0.004, 0.022 * s, 0.022, 12, all(CT.black), { fit: true });
  lump(mb, -0.033 * s, y, z + 0.016, 0.016 * s, 0.016 * s, 0.006, CT.lens, { color: glow, emissive: 1.8 });
  mb.cylinderZ(-0.072 * s, y - 0.004, z - 0.05, 0.006, 0.09, 8, all(CT.black), { fit: true });
  rod(mb, -0.078 * s, y + 0.08, y, z - 0.07, 0.003, CT.chrome);
  lump(mb, -0.078 * s, y + 0.08, z - 0.07, 0.006, 0.006, 0.006, CT.glow, { color: glow, emissive: 1.8 });
}
function jawTrap(mb: MB, d: Dims, glow: number) {
  const s = d.s * d.headS, y = 0.02 * s, z = 0.06 * s;
  lump(mb, 0, y + 0.006, z, 0.056 * s, 0.022, 0.03 * s, CT.steel);
  for (let i = 0; i < 7; i++) mb.cylinder((-0.045 + i * 0.015) * s, y + 0.02, z + 0.022 * s, 0.004, 0.012, 4, all(CT.teeth), { rTop: 0 });
  for (const x of [-0.058, 0.058]) mb.cylinderX(x * s, y + 0.03, z - 0.02, 0.012, 0.02, 10, all(CT.rust), { fit: true });
  lump(mb, 0.04 * s, y + 0.006, z + 0.03 * s, 0.005, 0.004, 0.003, CT.glow, { color: glow, emissive: 1.6 });
}
function spineGantry(mb: MB, role: Role, d: Dims, glow: number) {
  const s = d.s, back = -0.105 * s * (0.85 + 0.15 * d.mass);
  if (role === 'chest') {
    // cast vertebrae: discs on a steel spine bar
    for (let i = 0; i < 6; i++) { mb.cylinderZ(0, 0.017 + i * 0.045 * s, back - 0.012, 0.024, 0.026, 10, all(i % 2 ? CT.steel : CT.paint), { fit: true }); lump(mb, 0, 0.017 + i * 0.045 * s, back - 0.028, 0.01, 0.014, 0.008, CT.steel); }
    for (const k of [-1, 1]) { mb.push().translate(k * 0.06 * s, 0.22 * s, back - 0.005).rotateZ(k * 1.1); rod(mb, 0, 0, -0.12, 0, 0.007, CT.hose, { segs: 6 }); mb.pop(); }
    glowStrip(mb, 0, 0.1 * s, back - 0.03, 0.01, 0.12, 0.004, glow);
  } else if (role === 'spine') {
    for (let i = 0; i < 3; i++) mb.cylinderZ(0, 0.005 + i * 0.07 * s, back + 0.008, 0.026, 0.028, 10, all(i % 2 ? CT.paint : CT.steel), { fit: true });
  } else if (role === 'hips') {
    lump(mb, 0, 0.02, back + 0.016, 0.07 * s, 0.026, 0.014, CT.steel);
  }
}
function skinPlates(mb: MB, role: Role, d: Dims, glow: number, k = 1) {
  const s = d.s, fr = 0.1 * s * (0.85 + 0.15 * d.mass), bw = d.bw;
  if (role === 'chest') {
    // overlapping domed plates, riveted
    for (const x of [-0.055, 0.055]) for (let r = 0; r < 3; r++) {
      const px = x * s * bw, py = 0.07 * s + r * 0.06 * s;
      lump(mb, px, py, fr - 0.004, 0.048 * s, 0.032 * s, 0.014, r === 1 ? CT.black : CT.shell, { color: 0xd8d4e8 });
      for (const rx of [-0.03, 0.03]) lump(mb, px + rx * s, py, fr + 0.008, 0.003, 0.003, 0.003, CT.brass);
    }
    glowStrip(mb, 0, 0.13 * s, fr + 0.014, 0.008, 0.06 * s, 0.004, glow);
  } else if (role === 'uarm') {
    lump(mb, k * 0.018, -0.03, 0, 0.05, 0.05, 0.056, CT.shell, { color: 0xd8d4e8 });
  } else if (role === 'thigh') {
    lump(mb, 0, -0.18, 0.05, 0.056, 0.07, 0.016, CT.shell, { color: 0xd8d4e8 });
  }
}

// ------------------------------------------------------------------ dispatch
function buildRole(mb: MB, style: CyberStyle, role: Role, k: number, glow: number, d: Dims) {
  switch (style) {
    case 'scrap': if (role === 'thigh' || role === 'shin' || role === 'foot') legScrap(mb, role, k, glow); else armScrap(mb, role, k, glow); break;
    case 'servo': armServo(mb, role, k, glow); break;
    case 'piston': armPiston(mb, role, k, glow); break;
    case 'vise': handVise(mb, role, k, glow); break;
    case 'tool': handTool(mb, role, k, glow); break;
    case 'coil': legCoil(mb, role, k, glow); break;
    case 'lamp': eyesLamp(mb, d, glow); break;
    case 'ledger': eyesLedger(mb, d, glow); break;
    case 'trap': jawTrap(mb, d, glow); break;
    case 'gantry': spineGantry(mb, role, d, glow); break;
    case 'plate': skinPlates(mb, role, d, glow, k); break;
  }
}

/** bones (and roles) a slot's hardware hangs on */
export function slotBones(slot: CyberSlot): [BoneName, Role][] {
  const S = slot.endsWith('_l') ? 'L' : 'R';
  switch (SLOT_KIND[slot]) {
    case 'arm': return [[`uarm${S}`, 'uarm'], [`farm${S}`, 'farm'], [`hand${S}`, 'hand'], [`fing1${S}`, 'f1'], [`fing2${S}`, 'f2'], [`thumb${S}`, 'th']] as [BoneName, Role][];
    case 'hand': return [[`farm${S}`, 'farm'], [`hand${S}`, 'hand'], [`fing1${S}`, 'f1'], [`fing2${S}`, 'f2'], [`thumb${S}`, 'th']] as [BoneName, Role][];
    case 'leg': return [[`thigh${S}`, 'thigh'], [`shin${S}`, 'shin'], [`foot${S}`, 'foot']] as [BoneName, Role][];
    case 'eyes': case 'jaw': return [['head', 'head']];
    case 'spine': return [['chest', 'chest'], ['spine', 'spine'], ['hips', 'hips']];
    case 'skin': return [['chest', 'chest'], ['uarmL', 'uarm'], ['uarmR', 'uarm'], ['thighL', 'thigh'], ['thighR', 'thigh']];
  }
  return [];
}

/**
 * Smooth shading for low-poly hardware: vertices that share a position average
 * their normals when the faces meet at less than `maxDeg` (rounded rods, lumps
 * and hulls go smooth, caps and plate edges stay crisp). Works on the
 * ModelBuilder's per-face vertices, which never share indices across faces.
 */
export function smoothNormals(g: THREE.BufferGeometry, maxDeg = 50): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute, nor = g.attributes.normal as THREE.BufferAttribute;
  if (!pos || !nor) return g;
  const n = pos.count, lim = Math.cos((maxDeg * Math.PI) / 180);
  const groups = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(pos.getX(i) * 2000)},${Math.round(pos.getY(i) * 2000)},${Math.round(pos.getZ(i) * 2000)}`;
    let a = groups.get(key); if (!a) groups.set(key, (a = [])); a.push(i);
  }
  const src = Float32Array.from(nor.array as ArrayLike<number>), out = new Float32Array(n * 3);
  for (const ids of groups.values()) {
    for (const i of ids) {
      let x = 0, y = 0, z = 0;
      const ix = src[i * 3], iy = src[i * 3 + 1], iz = src[i * 3 + 2];
      for (const j of ids) {
        const jx = src[j * 3], jy = src[j * 3 + 1], jz = src[j * 3 + 2];
        if (ix * jx + iy * jy + iz * jz >= lim) { x += jx; y += jy; z += jz; }
      }
      const l = Math.hypot(x, y, z) || 1;
      out[i * 3] = x / l; out[i * 3 + 1] = y / l; out[i * 3 + 2] = z / l;
    }
  }
  g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  return g;
}

const GEO = new Map<string, THREE.BufferGeometry>();
const qz = (v: number) => Math.round(v * 50) / 50;
/** one piece's geometry (cached by style, role, side and size) */
export function pieceGeo(key: string, slot: CyberSlot, role: Role, bone: BoneName, d: Dims): THREE.BufferGeometry | null {
  const def = cyberDef(key);
  if (!def) return null;
  const k = bone.endsWith('L') ? 1 : bone.endsWith('R') ? -1 : 1;
  const ck = `${def.style}:${role}:${k}:${qz(d.s)}:${qz(d.mass)}:${qz(d.headS)}:${qz(d.bw)}`;
  let g = GEO.get(ck);
  if (g === undefined) {
    const mb = new ModelBuilder();
    // limb pieces are authored at height 1 and scaled with the body
    const limb = role !== 'head' && role !== 'chest' && role !== 'spine' && role !== 'hips' && !(def.style === 'plate');
    if (limb) mb.push().scale(d.s, d.s, d.s);
    buildRole(mb, def.style, role, k, def.glow, d);
    if (limb) mb.pop();
    g = mb.isEmpty ? (null as any) : smoothNormals(mb.build());
    GEO.set(ck, g as THREE.BufferGeometry);
  }
  void slot;
  return g ?? null;
}

export interface GearPiece { geo: THREE.BufferGeometry; bone: BoneName }
/** everything a loadout hangs on a rig */
export function cyberPieces(load: Partial<Record<string, string>> | undefined, d: Dims): GearPiece[] {
  const out: GearPiece[] = [];
  if (!load) return out;
  for (const slot of CYBER_SLOTS) {
    const key = load[slot];
    if (!key) continue;
    for (const [bone, role] of slotBones(slot)) {
      const g = pieceGeo(key, slot, role, bone, d);
      if (g) out.push({ geo: g, bone });
    }
  }
  return out;
}

/**
 * A loose part in its rest pose (bones laid out straight) as one builder pass:
 * for item models and the surgery table. Origin at the slot's root joint.
 */
export function buildLoosePart(mb: MB, key: string, slot: CyberSlot, d: Dims) {
  const def = cyberDef(key);
  if (!def) return;
  const S = slot.endsWith('_l') ? 'L' : 'R', k = S === 'L' ? 1 : -1, s = d.s;
  const off = (b: string) => d.off[b as BoneName];
  const at = (bone: string, role: Role, base: [number, number, number]) => {
    mb.push().translate(base[0], base[1], base[2]).scale(s, s, s);
    buildRole(mb, def.style, role, k, def.glow, d);
    mb.pop();
  };
  const kind = SLOT_KIND[slot];
  if (kind === 'arm' || kind === 'hand') {
    // an arm hangs from the shoulder; a hand from the wrist (its wrist ring rides the end of the forearm)
    const farmY = kind === 'arm' ? off('farm' + S)[1] : -off('hand' + S)[1];
    const handY = kind === 'arm' ? farmY + off('hand' + S)[1] : 0;
    const f1 = off('fing1' + S), f2 = off('fing2' + S), th = off('thumb' + S);
    if (kind === 'arm') at('uarm', 'uarm', [0, 0, 0]);
    at('farm', 'farm', [0, farmY, 0]);
    at('hand', 'hand', [0, handY, 0]);
    at('f1', 'f1', [0, handY + f1[1], 0]);
    at('f2', 'f2', [0, handY + f1[1] + f2[1], 0]);
    at('th', 'th', [th[0], handY + th[1], th[2]]);
  } else if (kind === 'leg') {
    const sh = off('shin' + S)[1], ft = sh + off('foot' + S)[1];
    at('thigh', 'thigh', [0, 0, 0]); at('shin', 'shin', [0, sh, 0]); at('foot', 'foot', [0, ft, 0]);
  } else {
    // head / torso hardware is authored in body space already
    buildRole(mb, def.style, kind === 'spine' || kind === 'skin' ? 'chest' : 'head', k, def.glow, d);
  }
}
const LOOSE = new Map<string, THREE.BufferGeometry>();
export function loosePartGeo(key: string, slot: CyberSlot, d: Dims): THREE.BufferGeometry {
  const ck = `${key}:${slot}:${qz(d.s)}:${qz(d.mass)}`;
  let g = LOOSE.get(ck);
  if (!g) { const mb = new ModelBuilder(); buildLoosePart(mb, key, slot, d); g = smoothNormals(mb.build()); LOOSE.set(ck, g); }
  return g;
}
