// Low-poly models for limb loss, shared by the items (src/content/items/limbs.ts)
// and the survivor rig (humanRig.ts): severed limbs lying on the floor,
// stump caps (raw, cauterised, stitched, bandaged, healed, with or without a
// tourniquet), elbow crutches, peg legs, hooks and proper prosthetics.
// Textures are the 'i_' item textures registered by the limbs content file
// (plus gore_bone and the gauze from the medical items).
import { ModelBuilder, TexSpec } from '../gfx/modelBuilder';
import type { StumpLook } from '../survival/limbs';
import '../gore/goreTextures';

export const LT = {
  skin: 'i_limb_skin', cut: 'i_limb_cut', cutRot: 'i_limb_cut_rot', blood: 'i_limb_blood', nail: 'i_limb_nail',
  strap: 'i_tq_strap', tqRod: 'i_tq_rod', belt: 'i_belt', alu: 'i_alu', foam: 'i_foam_grip', wood: 'i_peg_wood',
  shell: 'i_prost_shell', carbon: 'i_carbon', char: 'i_char', scar: 'i_stump_skin', raw: 'i_stump_raw',
  gauze: 'i_gauze', gauzeDirty: 'i_gauze_dirty', steel: 'i_steel', rubber: 'i_rubber', leather: 'i_leather', bone: 'gore_bone',
};
/** dead skin goes grey; rot turns it green-brown */
const DEAD = 0xffffff, ROT = 0x9aa27a;

// ------------------------------------------------------------------ severed limbs (items, lying along +x on the floor)
export type LimbItemKind = 'hand' | 'forearm' | 'arm' | 'foot' | 'shin' | 'leg';

/** tapered rod along +x from x0 (radius r0) to x1 (radius r1), axis at height r0 so it rests on the floor */
function rod(mb: ModelBuilder, x0: number, x1: number, y: number, r0: number, r1: number, tex: TexSpec, color: number, segs = 7) {
  mb.push().translate(x0, y, 0).rotateZ(-Math.PI / 2);
  mb.cylinder(0, 0, 0, r0, x1 - x0, segs, tex, { rTop: r1, fit: true, color });
  mb.pop();
}
/** the cut end: meat, fat and bone facing -x at x, plus a smear of blood just behind it */
function cutEnd(mb: ModelBuilder, x: number, y: number, r: number, rot: boolean, color: number) {
  rod(mb, x - 0.004, x + 0.03, y, r * 1.02, r * 1.0, { sides: LT.blood, bottom: rot ? LT.cutRot : LT.cut, top: LT.blood }, rot ? 0xb0a080 : 0xffffff);
  // bone stub poking out of the meat
  rod(mb, x - 0.022, x, y + r * 0.05, r * 0.28, r * 0.3, { sides: LT.bone, bottom: LT.bone, top: LT.bone }, rot ? 0xc8c0a0 : 0xffffff, 5);
  // ragged flaps of skin
  mb.push().translate(x + 0.004, y + r * 0.7, r * 0.3).rotateZ(0.5).rotateY(0.3);
  mb.box(0, 0, 0, 0.018, 0.006, r * 0.9, LT.skin, { color, fit: true });
  mb.pop();
  mb.push().translate(x + 0.002, y - r * 0.4, -r * 0.6).rotateZ(-0.4);
  mb.box(0, 0, 0, 0.014, 0.005, r * 0.7, LT.blood, { fit: true });
  mb.pop();
}
function handShape(mb: ModelBuilder, x: number, y: number, color: number, rot: boolean, open = 0.15) {
  // palm (flat, lying palm down), fingers curled a little, thumb to the side
  mb.box(x + 0.045, y - 0.012, 0, 0.09, 0.024, 0.08, { all: LT.skin }, { color, fit: true });
  const fz = [0.028, 0.009, -0.01, -0.028], fl = [0.06, 0.068, 0.064, 0.05];
  for (let i = 0; i < 4; i++) {
    mb.push().translate(x + 0.088, y - 0.006, fz[i]).rotateZ(-open - i * 0.05);
    mb.box(fl[i] / 2, -0.008, 0, fl[i], 0.016, 0.016, { all: LT.skin, east: LT.nail }, { color, fit: true });
    mb.pop();
  }
  mb.push().translate(x + 0.03, y - 0.008, 0.045).rotateY(-0.7);
  mb.box(0.024, -0.008, 0, 0.05, 0.017, 0.018, { all: LT.skin, east: LT.nail }, { color, fit: true });
  mb.pop();
  void rot;
}
function footShape(mb: ModelBuilder, x: number, y: number, color: number) {
  // a bare foot lying on its side: heel at x, toes toward +x
  mb.box(x + 0.1, y - 0.03, 0, 0.2, 0.06, 0.085, { all: LT.skin }, { color, fit: true });
  mb.box(x + 0.21, y - 0.026, 0, 0.04, 0.035, 0.08, { all: LT.skin, east: LT.nail }, { color, fit: true });
  mb.box(x + 0.02, y - 0.035, 0, 0.05, 0.07, 0.07, LT.skin, { color, fit: true });
}

export function limbItemModel(mb: ModelBuilder, kind: LimbItemKind, rot = false) {
  const c = rot ? ROT : DEAD;
  switch (kind) {
    case 'hand': {
      cutEnd(mb, 0, 0.026, 0.026, rot, c);
      rod(mb, 0.03, 0.05, 0.026, 0.026, 0.025, LT.skin, c);
      handShape(mb, 0.045, 0.03, c, rot);
      break;
    }
    case 'forearm': {
      cutEnd(mb, 0, 0.036, 0.036, rot, c);
      rod(mb, 0.03, 0.25, 0.036, 0.036, 0.026, LT.skin, c);
      handShape(mb, 0.24, 0.03, c, rot, 0.4);
      break;
    }
    case 'arm': {
      cutEnd(mb, 0, 0.046, 0.046, rot, c);
      rod(mb, 0.03, 0.29, 0.046, 0.046, 0.038, LT.skin, c);
      // the elbow bends; forearm angled across the floor
      mb.push().translate(0.29, 0, 0).rotateY(0.55);
      rod(mb, 0, 0.25, 0.038, 0.038, 0.026, LT.skin, c);
      handShape(mb, 0.24, 0.03, c, rot, 0.5);
      mb.pop();
      break;
    }
    case 'foot': {
      cutEnd(mb, 0, 0.034, 0.034, rot, c);
      rod(mb, 0.03, 0.06, 0.034, 0.034, 0.034, LT.skin, c);
      mb.push().translate(0.06, 0, 0).rotateY(Math.PI / 2);
      footShape(mb, -0.04, 0.07, c);
      mb.pop();
      break;
    }
    case 'shin': {
      cutEnd(mb, 0, 0.05, 0.05, rot, c);
      rod(mb, 0.03, 0.4, 0.05, 0.05, 0.034, LT.skin, c);
      mb.push().translate(0.4, 0, 0).rotateY(Math.PI / 2);
      footShape(mb, -0.04, 0.07, c);
      mb.pop();
      break;
    }
    case 'leg': {
      cutEnd(mb, 0, 0.075, 0.075, rot, c);
      rod(mb, 0.03, 0.42, 0.075, 0.075, 0.052, LT.skin, c);
      rod(mb, 0.42, 0.82, 0.052, 0.052, 0.034, LT.skin, c);
      mb.push().translate(0.82, 0, 0).rotateY(Math.PI / 2);
      footShape(mb, -0.04, 0.07, c);
      mb.pop();
      break;
    }
  }
}

// ------------------------------------------------------------------ stump caps (bone-local: the limb ends at y = 0 and pointed along -y)
/**
 * A stump end, built around the origin with the cut facing -y.
 * r: limb radius at the cut. tint: the survivor's skin colour (for skin caps).
 */
export function stumpModel(mb: ModelBuilder, r: number, look: StumpLook, tq: boolean, tint: number) {
  const R = r * 1.04;
  switch (look) {
    case 'raw': {
      // ragged meat, torn skin curling back, bone poking out, strings of tissue hanging, blood soaked up the limb
      mb.cylinder(0, 0.0, 0, R * 1.08, 0.055, 7, { sides: LT.blood, bottom: LT.blood, top: LT.blood }, { fit: true, rTop: R * 1.03 });
      mb.cylinder(0, -0.016, 0, R * 1.0, 0.018, 7, { sides: LT.blood, bottom: LT.raw, top: LT.raw }, { fit: true });
      mb.cylinder(0, -0.042, 0, r * 0.32, 0.03, 5, { sides: LT.bone, bottom: LT.bone, top: LT.bone }, { fit: true, rTop: r * 0.36 });
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26 + 0.3, len = 0.025 + (i % 3) * 0.014;
        mb.push().translate(Math.cos(a) * R * 0.78, -0.014, Math.sin(a) * R * 0.78).rotateY(-a).rotateZ(0.35 + (i % 2) * 0.35);
        mb.box(0, -len, 0, 0.007, len, R * (i % 2 ? 0.4 : 0.7), i % 2 ? LT.blood : LT.scar, { color: i % 2 ? 0xffffff : tint, fit: true });
        mb.pop();
      }
      // a tendon and a strip of muscle dangling
      mb.box(R * 0.3, -0.07, R * 0.15, 0.008, 0.055, 0.008, LT.raw, { fit: true, color: 0xe0c0b0 });
      mb.box(-R * 0.35, -0.06, -R * 0.2, 0.012, 0.045, 0.01, LT.blood, { fit: true });
      break;
    }
    case 'caut':
      // seared shut: a blackened, blistered crust
      mb.cylinder(0, -0.01, 0, R, 0.012, 7, { sides: LT.char, bottom: LT.char, top: LT.char }, { fit: true, rTop: R });
      mb.cylinder(0, -0.018, 0, R * 0.7, 0.008, 7, LT.char, { fit: true, color: 0xb08070 });
      break;
    case 'stitch':
      mb.cylinder(0, -0.016, 0, R * 0.82, 0.016, 7, { sides: LT.scar, bottom: LT.scar, top: LT.scar }, { fit: true, rTop: R, color: tint });
      break;
    case 'band': case 'bandb': {
      // gauze wound thick around the end and up the limb, a stain coming through
      const g = look === 'bandb' ? LT.gauzeDirty : LT.gauze;
      mb.cylinder(0, -0.024, 0, R * 1.12, 0.13, 7, { sides: g, bottom: g, top: g }, { fit: true, rTop: R * 1.16 });
      mb.cylinder(0, -0.04, 0, R * 0.8, 0.017, 7, { sides: g, bottom: g, top: g }, { fit: true, rTop: R * 1.12 });
      mb.cylinder(0, 0.07, 0, R * 1.2, 0.014, 7, { sides: g, bottom: g, top: g }, { fit: true, color: 0xd8d4c8 });
      if (look === 'bandb') mb.cylinder(0, -0.042, 0, R * 0.55, 0.004, 6, LT.blood, { fit: true });
      break;
    }
    case 'healed': case 'clean':
    default:
      mb.cylinder(0, -0.02, 0, R * 0.7, 0.02, 7, { sides: LT.scar, bottom: LT.scar, top: LT.scar }, { fit: true, rTop: R, color: tint });
  }
  if (tq) {
    // tourniquet: strap cinched a hand-width above the cut, windlass rod sticking out
    mb.cylinder(0, 0.07, 0, R * 1.28, 0.034, 7, { sides: LT.strap, bottom: LT.strap, top: LT.strap }, { fit: true });
    mb.push().translate(0, 0.087, R * 1.28).rotateY(0.4);
    mb.box(0, -0.009, 0.01, 0.09, 0.018, 0.018, LT.tqRod, { fit: true });
    mb.pop();
    mb.box(R * 1.0, 0.064, 0, 0.014, 0.046, 0.034, LT.tqRod, { fit: true, color: 0xd0d0d0 });
  }
}

// ------------------------------------------------------------------ aids (bone-local, hanging along -y)
/** peg leg: leather cup over the stump, straps up the limb, a tapered post to the floor (len below the cut) */
export function pegModel(mb: ModelBuilder, r: number, len: number) {
  const cup = r * 1.25;
  mb.cylinder(0, -0.05, 0, cup * 0.85, 0.15, 8, { sides: LT.leather, bottom: LT.leather, top: LT.leather }, { fit: true, rTop: cup });
  for (const a of [0.4, Math.PI + 0.4]) {
    mb.push().translate(Math.cos(a) * cup, 0.1, Math.sin(a) * cup).rotateY(-a);
    mb.box(0, 0, 0, 0.006, 0.16, 0.02, LT.leather, { fit: true, color: 0x8a6a4a });
    mb.pop();
  }
  mb.cylinder(0, 0.12, 0, cup * 1.04, 0.022, 8, { sides: LT.leather, bottom: LT.leather, top: LT.leather }, { fit: true, color: 0x6a4a30 });
  mb.cylinder(0, -len + 0.02, 0, r * 0.38, len - 0.07, 7, { sides: LT.wood, bottom: LT.wood, top: LT.wood }, { fit: true, rTop: r * 0.75 });
  mb.cylinder(0, -len, 0, r * 0.45, 0.022, 7, { sides: LT.rubber, bottom: LT.rubber, top: LT.rubber }, { fit: true });
}

/** hook hand: a laced leather cuff on the forearm, a steel stem and the J-hook */
export function hookModel(mb: ModelBuilder, r: number, long = false) {
  const cuff = r * 1.22;
  const L = long ? 0.18 : 0.13;
  mb.cylinder(0, -0.02, 0, cuff * 0.9, L, 8, { sides: LT.leather, bottom: LT.leather, top: LT.leather }, { fit: true, rTop: cuff });
  mb.cylinder(0, L - 0.035, 0, cuff * 1.04, 0.02, 8, LT.leather, { fit: true, color: 0x6a4a30 });
  mb.cylinder(0, -0.03, 0, cuff * 0.75, 0.012, 7, { sides: LT.steel, bottom: LT.steel, top: LT.steel }, { fit: true });
  mb.cylinder(0, -0.09, 0, 0.008, 0.06, 5, LT.steel, { fit: true });
  // the curve of the hook: short segments around a half circle, ending in a point
  const R = 0.032, cx = 0, cy = -0.09 - R;
  for (let i = 0; i < 6; i++) {
    const a0 = Math.PI / 2 + (i / 6) * Math.PI * 1.15;
    const px = cx + Math.cos(a0) * R, py = cy + Math.sin(a0) * R;
    mb.push().translate(0, py, px).rotateX(-a0);
    mb.box(0, -0.007, 0, 0.012, 0.014, 0.022, LT.steel, { fit: true, color: i === 5 ? 0xe0e4e8 : 0xffffff });
    mb.pop();
  }
}

/** prosthetic hand: a plastic shell socket over the stump and a moulded hand */
export function prostHandModel(mb: ModelBuilder, r: number, long = false) {
  const sock = r * 1.18;
  const L = long ? 0.22 : 0.12;
  mb.cylinder(0, -0.03, 0, sock * 0.82, L, 8, { sides: LT.shell, bottom: LT.shell, top: LT.shell }, { fit: true, rTop: sock });
  // wrist, palm, fingers (moulded together), thumb
  mb.cylinder(0, -0.05, 0, sock * 0.7, 0.025, 7, LT.carbon, { fit: true });
  mb.box(0, -0.135, 0.002, 0.026, 0.085, 0.07, LT.shell, { fit: true });
  for (let i = 0; i < 4; i++) mb.box(0.002, -0.2 + (i === 0 || i === 3 ? 0.01 : 0), 0.026 - i * 0.017, 0.018, 0.065, 0.014, LT.shell, { fit: true, color: 0xf0e8e0 });
  mb.push().translate(0.004, -0.11, 0.04).rotateX(0.6);
  mb.box(0, -0.04, 0, 0.018, 0.045, 0.016, LT.shell, { fit: true });
  mb.pop();
}

/** prosthetic leg parts: 'socket' (on the stump, carbon socket + pylon to len), 'foot' (moulded foot on the foot bone) */
export function prostLegModel(mb: ModelBuilder, r: number, len: number, withFoot: boolean, footY = 0) {
  const sock = r * 1.2;
  mb.cylinder(0, -0.06, 0, sock * 0.75, 0.18, 8, { sides: LT.carbon, bottom: LT.carbon, top: LT.carbon }, { fit: true, rTop: sock });
  mb.cylinder(0, 0.11, 0, sock * 1.03, 0.016, 8, LT.rubber, { fit: true });
  if (len > 0.08) {
    mb.cylinder(0, -len, 0, 0.016, len - 0.06, 6, { sides: LT.steel, bottom: LT.steel, top: LT.steel }, { fit: true });
    mb.cylinder(0, -0.09, 0, 0.024, 0.03, 6, LT.alu, { fit: true });
  }
  if (withFoot) footShell(mb, footY);
}
export function footShell(mb: ModelBuilder, y: number) {
  mb.cylinder(0, y + 0.02, 0, 0.026, 0.045, 6, LT.alu, { fit: true });
  mb.box(0, y - 0.055, 0.045, 0.082, 0.05, 0.23, LT.shell, { fit: true });
  mb.box(0, y - 0.058, 0.155, 0.074, 0.036, 0.03, LT.shell, { fit: true, color: 0xe8e0d8 });
}

/**
 * Elbow crutch in the fist (held-item space: the grip at the origin, the
 * forearm toward +y, fingers toward -y, front toward +z): the handle runs
 * through the fist, the shaft stands behind it down to the floor and up to a
 * cuff around the forearm.
 */
export function crutchHeldModel(mb: ModelBuilder, wood: boolean, s = 1) {
  const shaft = wood ? LT.wood : LT.alu;
  const sz = -0.045 * s, top = 0.17 * s, down = 0.82 * s;
  mb.cylinder(0, -down, sz, 0.011, down + top, 6, { sides: shaft, bottom: shaft, top: shaft }, { fit: true });
  mb.cylinder(0, -down - 0.012, sz, 0.017, 0.05, 6, { sides: LT.rubber, bottom: LT.rubber, top: LT.rubber }, { fit: true });
  // handle through the fist
  mb.push().translate(0, 0, sz).rotateX(Math.PI / 2);
  mb.cylinder(0, 0, 0, 0.015, 0.1, 6, { sides: LT.foam, bottom: LT.foam, top: LT.foam }, { fit: true });
  mb.pop();
  // cuff: an open ring around the back of the forearm
  for (let i = 0; i < 5; i++) {
    const a = Math.PI + (i - 2) * 0.55;
    mb.push().translate(Math.sin(a) * 0.05, top - 0.02, sz + 0.045 + Math.cos(a) * 0.05).rotateY(a);
    mb.box(0, 0, 0, 0.032, 0.045, 0.006, wood ? LT.leather : LT.foam, { fit: true, color: wood ? 0xffffff : 0x9aa0a8 });
    mb.pop();
  }
}

/** the same crutch lying on the floor (item model, along +x) */
export function crutchItemModel(mb: ModelBuilder, wood: boolean) {
  mb.push().translate(0.33, 0.017, 0).rotateZ(-Math.PI / 2);
  crutchHeldModel(mb, wood);
  mb.pop();
}
