// Atlas painter for everything except the face block (ported and extended from the Gacha Garage people,
// src/people/paint.js). Every texel knows its rest-pose surface point (x, y, z), face normal and part, so
// clothing is described in body space: hems, seams, plackets, buttons, collars, pockets, belts, folds and
// patterns line up across faces. A soft baked occlusion / roundness pass gives the boxes volume. On top: the
// Limbo Phobia layers (shirt < sweater < jacket), the Remittance hazmat suit, tattoos and scars by body spot,
// knuckle letters, nails, and the visible condition (blood, bandages, splints, wet, dirt, pallor, corruption).
import { clamp01, sstep, mixc, G, h2, vnoise, vnoise3, shadeInto, over, hairPx, scaleO, glyphAt, lum3, type O4, type C3 } from './lib';
import type { GGSpec, Props, Garm } from './types';
import type { Face } from './mesh';
import type { Appearance, RigCondition } from '../humanRig';
import { TATTOOS, TATTOO_SPOTS, TEXT_TATTOOS, SCAR_SPOTS, KNUCKLES, NAILS } from '../humanLooks';

const WHITE = [244, 242, 236], INK = [28, 22, 22], GOLD = [214, 170, 70], SILVER = [190, 190, 196], BLOOD = [96, 10, 12], BLOOD_D = [52, 6, 8];

export interface Ctx {
  x: number; y: number; z: number; i: number; j: number; f: Face; part: string; mat: string; bone: string;
  nx: number; ny: number; nz: number; px: number; kind: string; e: number; rb: number; rt: number; rh: number; side: number;
}
export type Painter = (c: Ctx, o: O4) => void;

/** item body-part key of a texel (for blood, bandages, splints) */
export function partOf(c: Ctx, P: Props): string {
  const b = c.bone, sd = b.endsWith('R') ? '_r' : '_l';
  if (b === 'head' || b === 'hair') return 'head';
  if (b === 'neck') return 'neck';
  if (b.startsWith('uarm')) return 'uarm' + sd;
  if (b.startsWith('farm')) return 'farm' + sd;
  if (b.startsWith('hand') || b.startsWith('fing') || b.startsWith('thumb')) return 'hand' + sd;
  if (b.startsWith('thigh')) return 'thigh' + sd;
  if (b.startsWith('shin')) return 'shin' + sd;
  if (b.startsWith('foot')) return 'foot' + sd;
  if (b === 'coat') return c.y > P.crotchY ? 'groin' : (c.x >= 0 ? 'thigh_l' : 'thigh_r');
  if (c.y > P.waistY + 0.02 * P.H) return 'torso_u';
  if (c.y > P.crotchY + 0.06 * P.H || Math.abs(c.x) > P.hipX * 0.9) return 'torso_l';
  return 'groin';
}

/**
 * Build the per-material painters for a spec. Returns { mat: painter } (body, skin, hand, shoe, head, ear,
 * nose, hair, hat, hat2, acc) plus `overlay(c, o)`, the condition / body-mark pass.
 */
export function makePainters(sp: GGSpec, P: Props, app: Appearance, cond: RigCondition) {
  const H = P.H, hu = P.hu, D = sp.dress, skin = sp.skin, hair = sp.hair;
  const top = D.top, outer = D.outer, bot = D.bottom;
  const hz = D.suit === 'hazmat';
  const pale = cond.pale ?? 0;
  const skinC = pale ? mixc(skin, [176, 178, 186], 0.12 * pale) : skin;
  const yN = P.neckBase, yB = P.bustY;
  const waist = P.pelvisY + 0.004 * H; // trousers waistband top
  const suitBody = D.suit !== '' && D.suit !== 'guard';
  const HEM: Record<string, number> = {
    tee: P.hipY + 0.022 * H, stripe: P.hipY + 0.022 * H, shirt: waist, blouse: P.hipY + 0.03 * H, knit: P.hipY + 0.012 * H, hoodie: P.hipY + 0.008 * H, scrubs: P.hipY + 0.012 * H,
    uniform: waist, guard: waist, pajama: P.hipY + 0.015 * H, under: P.hipY + 0.04 * H, jumpsuit: P.crotchY - 0.02 * H, coverall: P.crotchY - 0.02 * H, hazmat: P.crotchY - 0.03 * H,
    bandeau: P.bustY - 0.03 * H, bare: 99,
  };
  const OHEM: Record<string, number> = { jacket: P.hipY + 0.01 * H, leather: P.hipY + 0.015 * H, coat: P.hipY - 0.004 * H, labcoat: P.hipY - 0.004 * H, vest: P.hipY + 0.02 * H };
  const tk = top?.kind ?? '', ok = outer?.kind ?? '';
  const topHem = top ? (HEM[tk] ?? P.hipY + 0.02 * H) : 99;
  const outerHem = outer ? (OHEM[ok] ?? P.hipY) : 99;
  const tuck = D.tuck;
  const cuffOf = (sl: string | undefined) => sl === 'short' ? P.elbowY + 0.065 * H : sl === 'cap' ? P.shoulderY - 0.03 * H : sl === 'long' ? P.wristY + 0.008 * H : 99;
  const topCuff = cuffOf(top?.sleeve), outCuff = cuffOf(outer?.sleeve);
  const skirt = D.legsKind === 'skirt';
  const botHem = !bot ? 99 : D.legsKind === 'shorts' ? P.kneeY + 0.05 * H : D.legsKind === 'brief' ? P.crotchY - 0.01 * H : skirt ? 99 : P.ankleY + 0.01 * H;
  const fk = D.feet?.kind ?? 'bare';
  const socks = fk === 'sock' || fk === 'sneaker' || fk === 'dress' || fk === 'boot';
  const sockTop = fk === 'sock' ? P.ankleY + 0.06 * H : fk === 'sneaker' ? P.ankleY + 0.035 * H : fk === 'dress' ? P.ankleY + 0.05 * H : 0;
  const hzB = fk === 'hazmat';
  const bootTop = hzB ? P.kneeY - 0.075 * H : fk === 'boot' ? P.ankleY + 0.07 * H : 0;
  const LIMB: Record<string, 1> = { uarm: 1, farm: 1, thigh: 1, calf: 1, shin: 1 };
  const TORSO: Record<string, 1> = { spine: 1, chestLo: 1, chestHi: 1, traps: 1, hipsUp: 1, hipsLo: 1, bust: 1 };
  const seedK = sp.seed;

  // ---------------------------------------------------------------- shared shading
  /** Baked occlusion + roundness for body surfaces. */
  function bodyK(c: Ctx) {
    let k = 0.9 + 0.12 * clamp01(c.y / H * 1.25);
    if (c.kind === 'side') k *= 1 - 0.07 * c.e * c.e;
    else if (c.kind === 'bot') k *= 0.7;
    const ax = Math.abs(c.x), sx = Math.sign(c.x) || 1;
    if (LIMB[c.part]) {
      const inward = -sx * c.nx;
      if (inward > 0.3) k *= 1 - 0.13 * inward;
      if (c.part === 'thigh' && inward > 0.2) k *= 1 - 0.18 * sstep(P.crotchY - 0.08 * H, P.crotchY, c.y);
      if (c.part === 'uarm' && inward > 0.2) k *= 1 - 0.12 * sstep(P.bustY, P.shoulderY, c.y);
    } else if (TORSO[c.part]) {
      if (Math.abs(c.nx) > 0.55) k *= 1 - 0.1 - 0.12 * sstep(P.bustY - 0.04 * H, P.shoulderY, c.y);
      if (c.part === 'hipsLo' && c.y < P.crotchY + 0.03 * H && ax < P.hipX * 0.8) k *= 0.8;
      if (c.part === 'traps' && c.kind === 'top') k *= 1.04;
      if (c.part === 'bust' && c.kind === 'bot') k *= 0.92;
    }
    k *= 1 + 0.03 * Math.sin(c.x * 37 + c.z * 23 + Math.sin(c.y * 13) * 2) * Math.sin(c.y * 29 + c.x * 11);
    return k;
  }
  const front = (c: Ctx) => c.nz > 0.45, back = (c: Ctx) => c.nz < -0.45;
  /** Folds: soft dark creases that wander a little. */
  function fold(amp: number, freq: number, phase: number, along: number) {
    const v = Math.sin(along * freq + phase + Math.sin(along * 37 + phase * 3) * 1.3);
    return 1 - amp * Math.max(0, v) ** 3;
  }
  function fabricK(c: Ctx, kind: string) {
    const n = h2(c.i, c.j, 11) - 0.5;
    switch (kind) {
      case 'knit': return (c.i % 2 ? 0.93 : 1.04) * (1 + n * 0.06) * (c.j % 3 === 0 ? 0.98 : 1);
      case 'wool': return 1 + n * 0.06 + (((c.i + c.j) % 4) === 0 ? 0.025 : 0);
      case 'denim': return 1 + n * 0.08 + (((c.i + c.j * 2) % 3) === 0 ? -0.06 : 0.02);
      case 'nylon': return 1 + n * 0.03;
      case 'leather': return 1 + n * 0.04 + (h2(c.i >> 1, c.j >> 1, 5) > 0.93 ? 0.06 : 0);
      case 'rubber': return 1 + n * 0.02;
      case 'canvas': return 1 + n * 0.05 + (((c.i + c.j) & 1) ? 0.02 : -0.02);
      case 'fleece': return 1 + (h2(c.i >> 1, c.j >> 1, 9) - 0.5) * 0.08;
      default: return 1 + n * 0.05;
    }
  }
  const around = (c: Ctx) => (Math.abs(c.nz) > 0.6 ? c.x * Math.sign(c.nz) : c.z * -Math.sign(c.nx || 1) + 0.3);
  function button(c: Ctx, o: O4, bx: number, by: number, r: number, col: C3) {
    const dx = c.x - bx, dy = c.y - by, d = Math.sqrt(dx * dx + dy * dy);
    if (d > r + c.px * 0.6) return false;
    if (d > r - c.px * 0.4) over(o, mixc(col, INK, 0.6), 0.9);
    else { o[0] = col[0]; o[1] = col[1]; o[2] = col[2]; if (dx < 0 && dy > 0) over(o, [255, 255, 255], 0.35); }
    return true;
  }
  const line = (c: Ctx, d: number, w = 0.6) => Math.abs(d) < c.px * w;
  /** text in the 3x5 font centred at (cx, cy) in body metres across `around`; cell = metres per font pixel */
  function textAt(c: Ctx, s: string, u: number, v: number, cell: number): boolean {
    const wpx = s.length * 4 - 1;
    const gx = Math.floor(u / cell + wpx / 2), gy = Math.floor(-v / cell + 2.5);
    return glyphAt(s, gx, gy);
  }

  // ---------------------------------------------------------------- skin
  function skinPx(c: Ctx, o: O4, k = 1) {
    let kk = k * bodyK(c) * (1 + (h2(c.i, c.j, 21) - 0.5) * 0.035);
    shadeInto(o, skinC, kk, 0.25);
    if (c.part === 'thigh' || c.part === 'calf') {
      const dk = c.y - P.kneeY;
      if (front(c)) { kk = 1 + 0.06 * G(dk - 0.015 * H, 0, 0.012 * H, 1) - 0.07 * G(dk + 0.012 * H, 0, 0.006 * H, 1); o[0] *= kk; o[1] *= kk; o[2] *= kk; }
      if (back(c) && Math.abs(dk) < 0.012 * H) { o[0] *= 0.9; o[1] *= 0.88; o[2] *= 0.88; }
    }
    if (c.part === 'farm' && back(c) && Math.abs(c.y - P.elbowY) < 0.01 * H) { o[0] *= 0.93; o[1] *= 0.9; o[2] *= 0.9; }
    // bare torso: pecs / navel / collarbones, a little softness
    if (TORSO[c.part] && front(c)) {
      const ax = Math.abs(c.x);
      if (Math.abs(c.y - (P.neckBase - 0.02 * H)) < 0.004 * H && ax > 0.02 * H && ax < 0.07 * H) scaleO(o, 0.93);
      if (P.fem < 0.5 && Math.abs(c.y - (P.bustY - 0.012 * H)) < 0.004 * H && ax > 0.012 * H && ax < 0.07 * H) scaleO(o, 0.9);
      if (Math.abs(c.y - (P.waistY - 0.035 * H)) < 0.004 * H && ax < 0.005 * H) scaleO(o, 0.78);
      if (P.fem < 0.5 && ax < 0.003 * H && c.y > P.waistY && c.y < P.bustY) scaleO(o, 0.96);
    }
    over(o, [210, 120, 110], 0.05 * clamp01(1 - Math.abs(c.e)));
  }

  function neckPx(c: Ctx, o: O4) {
    skinPx(c, o);
    const t = sstep(P.chin - 0.02 * hu, P.chin + 0.12 * hu, c.y);
    o[0] *= 1 - 0.32 * t; o[1] *= 1 - 0.36 * t; o[2] *= 1 - 0.34 * t;
    if (P.fem < 0.5 && front(c) && Math.abs(c.x) < 0.01 && Math.abs(c.y - (P.chin - 0.06 * hu)) < 0.012) { o[0] *= 1.05; o[1] *= 1.05; o[2] *= 1.05; }
    if (sp.face.stubble && c.y > P.chin - 0.1 * hu && front(c)) over(o, [70, 72, 84], sp.face.stubble * 0.25 * h2(c.i, c.j, 77));
    collarPx(c, o);
  }

  /** Collars that wrap the neck. */
  function collarPx(c: Ctx, o: O4) {
    if (hz) { torsoPx(c, o); return; }
    const L = outer && (ok === 'coat' || ok === 'jacket' || ok === 'leather' || ok === 'labcoat') ? outer : top;
    if (!L) return;
    const k = L.kind;
    let topY = yN, tight = false;
    if (k === 'shirt' || k === 'uniform' || k === 'guard' || k === 'pajama' || k === 'blouse') topY = yN + 0.026 * H;
    else if (k === 'coat' || k === 'jacket' || k === 'leather') topY = yN + 0.03 * H;
    else if (k === 'labcoat') topY = yN + 0.022 * H;
    else if (k === 'jumpsuit' || k === 'coverall') topY = yN + 0.022 * H;
    else if (k === 'knit' || k === 'tee' || k === 'stripe' || k === 'hoodie') { topY = yN + 0.008 * H; tight = true; }
    else return;
    if (c.y > topY) return;
    // open V at the throat for collared shirts without a tie
    if (!tight && front(c) && Math.abs(c.x) < (c.y - yN) * 0.9 + 0.004 && k !== 'jumpsuit' && k !== 'coverall') return;
    const kk = bodyK(c) * fabricK(c, k === 'knit' ? 'knit' : k === 'leather' ? 'leather' : 'cotton') * 1.02;
    shadeInto(o, garmCol(L, c), kk);
    if (Math.abs(c.y - topY) < c.px * 1.2) over(o, INK, 0.35);
    if (tight && c.y > topY - 0.01 * H) scaleO(o, c.i % 2 ? 0.9 : 1.02);
  }

  function garmCol(g: Garm, c: Ctx): number[] {
    if (g.tex === 'c_shirt_party') return partyCol(g, c);
    if (g.kind === 'stripe') return Math.floor(c.y / 0.022) % 2 ? g.col : mixc(g.col, [242, 238, 228], 0.8);
    if (g.kind === 'pajama') return (Math.floor((around(c) + 1) / 0.018) % 2) ? g.col : mixc(g.col, [250, 248, 244], 0.45);
    return g.col;
  }

  /** 'c_shirt_party': a loud all-over kids' print (polka dots, confetti, zigzags or checks, picked by the shirt colour) */
  function partyCol(g: Garm, c: Ctx): number[] {
    const kind = (g.col[0] * 3 + g.col[1] * 5 + g.col[2] * 7) % 4, u = around(c), v = c.y;
    const ACC: C3[] = [[255, 226, 64], [255, 92, 150], [64, 168, 255], [96, 212, 96], [250, 248, 240], [255, 140, 40]];
    const pick = (a: number, b: number) => ACC[Math.floor(h2(a, b, 41) * ACC.length)];
    if (kind === 0) { const cx = Math.round(u / 0.03), cy = Math.round(v / 0.03 + (cx & 1) * 0.5); const dx = u - cx * 0.03, dy = v - (cy - (cx & 1) * 0.5) * 0.03; return dx * dx + dy * dy < 0.0085 * 0.0085 ? pick(cx, cy) : g.col; }
    if (kind === 1) { const cx = Math.floor(u / 0.022), cy = Math.floor(v / 0.022); return h2(cx, cy, 43) < 0.32 && Math.abs((u / 0.022) % 1) < 0.55 && Math.abs((v / 0.022) % 1) < 0.35 ? pick(cx, cy) : g.col; }
    if (kind === 2) { const z = Math.abs(((u / 0.03) % 1 + 1) % 1 - 0.5) * 0.03; const band = Math.floor((v + z) / 0.026); return band % 3 === 0 ? pick(band, 7) : g.col; }
    return (Math.floor(u / 0.028) + Math.floor(v / 0.028)) % 2 ? g.col : mixc(g.col, [252, 248, 236], 0.55);
  }

  function handPx(c: Ctx, o: O4) {
    if (D.hands && c.part !== 'cuff') { glovePx(c, o); return; }
    if (c.part === 'cuff') { glovePx(c, o); return; }
    skinPx(c, o, 0.94);
    const sx = Math.sign(c.x) || 1;
    const palmIn = -sx * c.nx > 0.5;
    if (palmIn) over(o, [236, 170, 160], 0.18);
    if (c.part === 'fingers') {
      if (c.kind === 'side' && Math.abs(c.nx) < 0.5) { const q = (c.e + 1) * 2; if (Math.abs(q - Math.round(q)) < 0.18 && q > 0.5 && q < 3.5) { o[0] *= 0.82; o[1] *= 0.78; o[2] *= 0.78; } }
      const tip = c.bone.startsWith('fing2') && c.kind === 'side' && !palmIn && c.rb < c.px * 2.4;
      if (tip) { const nc = NAILS[app.nails || 'clean']?.color; over(o, nc ? hexc(nc) : [246, 214, 206], nc ? 0.85 : 0.45); }
      if (c.kind === 'side' && c.rt < c.px * 1.2) { o[0] *= 0.88; o[1] *= 0.86; o[2] *= 0.86; }
      // knuckle letters on the backs of the first finger bones
      const kn = KNUCKLES[app.knuckles || 'none'];
      if (kn && kn.l && c.bone.startsWith('fing1') && sx * c.nx > 0.5) {
        const word = sx > 0 ? kn.l : kn.r;
        const q = (c.e + 1) / 2 * 4, fi = Math.min(3, Math.floor(q)), fu = q - fi;
        const gx = Math.floor(fu * 3.4), gy = Math.floor((1 - c.rb / c.rh) * 5.4);
        if (gx < 3 && glyphAt(word[sx > 0 ? 3 - fi : fi] || ' ', gx, gy)) over(o, [40, 50, 70], 0.75);
      }
    }
    if (c.part === 'palm' && !palmIn && c.kind === 'side' && c.rb < c.px * 1.5) { o[0] *= 0.92; o[1] *= 0.9; o[2] *= 0.9; }
    if (c.part === 'thumb' && c.rb < c.px * 1.8 && c.kind === 'side') over(o, [246, 214, 206], 0.35);
  }
  function glovePx(c: Ctx, o: O4) {
    const g = D.hands!;
    const rub = g.kind === 'rubber' || g.kind === 'hazmat';
    let kk = bodyK(c) * fabricK(c, rub ? 'rubber' : 'leather') * (c.kind === 'bot' ? 0.8 : 1);
    if (c.part === 'fingers' && c.kind === 'side' && Math.abs(c.nx) < 0.5) { const q = (c.e + 1) * 2; if (Math.abs(q - Math.round(q)) < 0.16 && q > 0.5 && q < 3.5) kk *= 0.82; }
    shadeInto(o, g.col, kk);
    if (rub) over(o, [255, 255, 255], 0.22 * G(c.e + 0.3, (c.rb / Math.max(c.rh, 1e-4)) - 0.6, 0.25, 0.3) * (c.kind === 'side' ? 1 : 0.4));
    if (c.part === 'cuff') {
      if (g.kind === 'hazmat' && c.rt < 0.012 * H) { shadeInto(o, [150, 152, 150], bodyK(c) * (0.92 + 0.12 * h2(c.i, c.j, 3))); if (line(c, c.rt - 0.012 * H, 0.8)) over(o, INK, 0.4); }
      if (c.rt < c.px * 1.2) over(o, INK, 0.35);
    }
    if (!rub && c.part === 'palm' && c.kind === 'side' && Math.abs(c.e) < 0.1) over(o, INK, 0.2);
  }

  // ---------------------------------------------------------------- torso layers
  /** neckline of a top: the highest covered y at this texel */
  function neckTop(g: Garm, c: Ctx): number {
    const ax = Math.abs(c.x), fr = front(c);
    switch (g.kind) {
      case 'scrubs': return fr && c.y > yN - 0.085 * H && ax < (c.y - (yN - 0.085 * H)) * 0.75 + 0.002 ? -1 : yN + 0.006 * H;
      case 'under': {
        // a singlet: straps over the shoulders, a scoop front and back
        const strap = Math.abs(ax - P.chestTopX * 0.55) < 0.016 * H;
        if (c.y > P.bustY + 0.02 * H && !strap) return -1;
        return yN;
      }
      case 'bandeau': return P.bustY + 0.025 * H;
      case 'bare': return -1;
      case 'blouse': return fr && c.y > yN - 0.05 * H && ax < (c.y - (yN - 0.05 * H)) * 0.5 + 0.003 ? -1 : yN + 0.006 * H;
      default: return yN + 0.006 * H;
    }
  }
  /** what covers this torso texel */
  function torsoLayer(c: Ctx): Garm | null {
    const ax = Math.abs(c.x), fr = front(c);
    if (outer && c.y > outerHem) {
      // open fronts show what is under them
      const open = ok === 'jacket' || ok === 'leather' || ok === 'labcoat' || ok === 'vest';
      let gap = -1;
      if (open && fr) {
        const vb = ok === 'labcoat' ? yB - 0.05 * H : yB - 0.02 * H;
        gap = ok === 'vest' ? 0.03 * H : ok === 'labcoat' ? 0.012 * H : 0.016 * H;
        if (c.y > vb) gap += (c.y - vb) / (yN - vb) * (ok === 'labcoat' ? 0.05 : 0.035) * H;
      }
      if (!(fr && ax < gap)) {
        if (ok !== 'vest' || c.y < yN - 0.01 * H) return outer;
      }
    }
    if (top && c.y > topHem && c.y <= neckTop(top, c)) return top;
    if (bot && !skirt && (c.y <= waist || (suitBody && bot.kind === top?.kind))) return bot;
    return null;
  }
  function torsoPx(c: Ctx, o: O4) {
    const L = torsoLayer(c);
    if (!L) {
      skinPx(c, o);
      if (D.legsKind === 'none' && c.y < P.crotchY + 0.04 * H) { shadeInto(o, [216, 212, 200], bodyK(c)); if (line(c, c.y - (P.crotchY + 0.04 * H), 0.8)) over(o, INK, 0.3); }
      return;
    }
    if (L === bot) { bottomPx(c, o, L); return; }
    topPx(c, o, L, L === outer);
  }

  /** the painted face of a top or outer garment on the torso / arms */
  function topPx(c: Ctx, o: O4, g: Garm, isOuter: boolean) {
    const k = g.kind, ax = Math.abs(c.x), fr = front(c), bk = back(c);
    const arm = c.part === 'uarm' || c.part === 'farm';
    if (k === 'hazmat') { hazmatPx(c, o); return; }
    const fab = k === 'knit' ? 'knit' : k === 'hoodie' ? 'fleece' : k === 'jacket' ? 'denim' : k === 'leather' ? 'leather' : k === 'coat' || k === 'vest' ? 'nylon' : k === 'guard' || k === 'uniform' || k === 'jumpsuit' || k === 'coverall' ? 'canvas' : 'cotton';
    const col = garmCol(g, c);
    let kk = bodyK(c) * fabricK(c, fab);
    const cuff = isOuter ? outCuff : topCuff;
    const hem = isOuter ? outerHem : topHem;
    if (arm) {
      if (fr) kk *= fold(0.16, 300, 1.3, c.y);
      if (fr && Math.abs(c.y - P.elbowY) < 0.03 * H) kk *= 0.94 + 0.06 * Math.sin(c.y * 900 + c.x * 300);
      if (g.sleeve === 'long' && c.y < P.wristY + 0.03 * H) kk *= 0.96 + 0.04 * Math.sin(c.y * 1200);
    } else {
      if (c.y < waist + 0.04 * H && c.y > waist - 0.01 * H && tuck && !isOuter) kk *= 0.92 + 0.08 * Math.sin(c.x * 260 + c.z * 200 + Math.sin(c.y * 300) * 2);
      if (Math.abs(c.nx) > 0.5 && c.y > P.bustY) kk *= fold(0.12, 160, 0.5, c.y + c.z * 0.8);
      if (bk) kk *= fold(0.08, 120, 2.1, c.x * 1.4 + c.y * 0.2);
      if (fr && c.y < P.waistY && c.y > hem) kk *= fold(0.07, 140, seedK * 0.1, c.x * 1.7 + c.y * 0.6);
    }
    if (k === 'leather') kk *= 0.96 + 0.1 * G(c.e + 0.35, 0, 0.3, 1);
    shadeInto(o, col, kk);
    // hem shadow / line
    if (!arm && Math.abs(c.y - hem) < c.px * 1.5) over(o, INK, 0.28);
    if (!arm && c.y < hem + 0.025 * H && (k === 'knit' || k === 'hoodie')) scaleO(o, c.i % 2 ? 0.88 : 1.02);
    // sleeve ends
    if (arm) {
      if (g.sleeve === 'short' && c.y - cuff < 0.012 * H && Math.abs(c.y - cuff - 0.012 * H) < c.px * 0.6) over(o, INK, 0.25);
      if (g.sleeve === 'long' && c.y - cuff < 0.025 * H && (k === 'knit' || k === 'hoodie' || k === 'coat' || k === 'jacket')) { scaleO(o, c.i % 2 ? 0.88 : 1); if (Math.abs(c.y - cuff - 0.025 * H) < c.px * 0.6) over(o, INK, 0.3); }
      if (g.sleeve === 'long' && (k === 'shirt' || k === 'guard' || k === 'uniform' || k === 'blouse' || k === 'labcoat') && Math.abs(c.y - cuff - 0.022 * H) < c.px * 0.6) over(o, INK, 0.35);
      if (Math.abs(c.y - cuff) < c.px) over(o, INK, 0.35);
      if (c.part === 'uarm' && Math.abs(c.y - (P.shoulderY - 0.004 * H)) < c.px * 0.6) over(o, INK, 0.2);
      // shoulder flashes / stripes
      const sx = Math.sign(c.x) || 1, outSide = sx * c.nx > 0.5;
      if (k === 'guard' && c.part === 'uarm' && outSide && c.y > P.shoulderY - 0.07 * H && c.y < P.shoulderY - 0.03 * H && Math.abs(c.e) < 0.6) { shadeInto(o, [28, 28, 30], 0.95); if (Math.abs(c.e) < 0.35 && c.y > P.shoulderY - 0.055 * H) shadeInto(o, [200, 144, 48], 1); }
      if (k === 'jumpsuit' && c.part === 'uarm' && Math.abs(c.y - (P.shoulderY - 0.06 * H)) < 0.006 * H) shadeInto(o, [222, 222, 210], 1.05);
      if (k === 'coverall' && c.part === 'uarm' && outSide && Math.abs(c.y - (P.shoulderY - 0.05 * H)) < 0.012 * H && Math.abs(c.e) < 0.5) shadeInto(o, [60, 80, 120], 0.9);
      wearPx(c, o, g);
      return;
    }
    // side seams
    if (Math.abs(c.nx) > 0.9 && Math.abs(c.e) < 0.08) over(o, INK, 0.16);
    if (c.part === 'traps' && Math.abs(c.y - (P.shoulderY + 0.002 * H)) < c.px * 0.6 && Math.abs(c.nx) < 0.4) over(o, INK, 0.12);
    // ---- per garment fronts
    if (k === 'labcoat' || k === 'jacket' || k === 'leather' || k === 'vest') {
      // the open edge (lapels for the lab coat), pockets
      const vb = k === 'labcoat' ? yB - 0.05 * H : yB - 0.02 * H;
      const gap = (k === 'vest' ? 0.03 * H : k === 'labcoat' ? 0.012 * H : 0.016 * H) + (c.y > vb ? (c.y - vb) / (yN - vb) * (k === 'labcoat' ? 0.05 : 0.035) * H : 0);
      if (fr && ax < gap + c.px * 1.4) over(o, INK, 0.5);
      if (k === 'labcoat' && fr) {
        // lapel fold line and notch
        const lx = ax - gap;
        if (c.y > vb && lx < 0.035 * H) { scaleO(o, 1.04); if (line(c, lx - (0.03 * H - (c.y - vb) * 0.15), 0.7) && c.y < yN - 0.012 * H) over(o, INK, 0.3); }
        if (line(c, c.y - (yN - 0.04 * H)) && lx < 0.034 * H && lx > 0) over(o, INK, 0.3);
        // breast pocket on the left with pens, hip pockets
        if (c.x > 0.03 * H && c.x < 0.068 * H && c.y < yB + 0.02 * H && c.y > yB - 0.03 * H) {
          if (line(c, c.y - (yB + 0.02 * H), 0.7) || line(c, c.x - 0.03 * H) || line(c, c.x - 0.068 * H) || line(c, c.y - (yB - 0.03 * H))) over(o, INK, 0.25);
          if (c.y > yB + 0.006 * H) { const pi = Math.floor((c.x - 0.036 * H) / (0.008 * H)); if (pi >= 0 && pi < 3 && ((c.x - 0.036 * H) % (0.008 * H)) < 0.004 * H) shadeInto(o, [[30, 50, 120], [180, 30, 30], [30, 30, 30]][pi], 0.95); }
        }
        const py = P.pelvisY - 0.01 * H;
        if (ax > 0.04 * H && ax < 0.085 * H && c.y < py && c.y > py - 0.05 * H && (line(c, c.y - py, 0.7) || line(c, ax - 0.04 * H) || line(c, ax - 0.085 * H))) over(o, INK, 0.25);
        // buttons on the open edges
        for (let b = 0; b < 3; b++) if (button(c, o, Math.sign(c.x) * (gap + 0.008 * H), vb - 0.03 * H - b * 0.07 * H, 0.0045 * H, [236, 234, 228])) break;
      }
      if (k === 'jacket' && fr) {
        for (const sx of [1, -1]) { const px0 = sx * 0.05 * H, py0 = yB + 0.035 * H; if (Math.abs(c.x - px0) < 0.022 * H && c.y < py0 && c.y > py0 - 0.045 * H) { if (line(c, Math.abs(c.x - px0) - 0.022 * H) || line(c, c.y - (py0 - 0.045 * H))) over(o, [200, 140, 70], 0.6); if (c.y > py0 - 0.014 * H) { scaleO(o, 1.04); if (line(c, c.y - (py0 - 0.014 * H))) over(o, INK, 0.35); } } }
        if (Math.abs(c.y - (outerHem + 0.025 * H)) < c.px * 0.7) over(o, [200, 140, 70], 0.5);
      }
      if (k === 'leather' && fr) { if (Math.abs(ax - gap - 0.004 * H) < c.px * 0.7) over(o, SILVER, 0.6); if (ax > 0.05 * H && ax < 0.075 * H && Math.abs(c.y - (P.waistY - 0.01 * H) - (ax - 0.05 * H) * 1.5) < c.px * 0.8) over(o, INK, 0.5); }
      if (k === 'vest') { for (const yy of [P.bustY - 0.02 * H, P.waistY]) if (Math.abs(c.y - yy) < 0.01 * H) { shadeInto(o, [216, 220, 220], 1.05 + 0.1 * h2(c.i, c.j, 4)); if (Math.abs(Math.abs(c.y - yy) - 0.01 * H) < c.px) over(o, INK, 0.25); } }
      wearPx(c, o, g);
      return;
    }
    if (k === 'coat') {
      // a closed zip front with a storm flap, flap pockets low, a belt line
      if (fr && Math.abs(c.x - 0.006 * H) < 0.012 * H) { scaleO(o, 1.04); if (line(c, c.x - 0.018 * H, 0.7)) over(o, INK, 0.4); }
      if (fr && Math.abs(c.x - 0.006 * H) < c.px * 0.6) over(o, INK, 0.5);
      if (fr && ax > 0.03 * H && ax < 0.08 * H && Math.abs(c.y - (P.pelvisY + 0.01 * H)) < 0.012 * H) { scaleO(o, 1.05); if (line(c, c.y - (P.pelvisY + 0.022 * H), 0.7)) over(o, INK, 0.4); }
      if (Math.abs(c.y - P.waistY) < 0.008 * H) { scaleO(o, 0.94); if (Math.abs(Math.abs(c.y - P.waistY) - 0.008 * H) < c.px * 0.6) over(o, INK, 0.25); }
      if (lum3(g.col) > 0.55 && fr && ax < 0.02 * H && Math.abs(((c.y / (0.06 * H)) % 1) - 0.5) < 0.1) shadeInto(o, [50, 50, 50], 0.9);
      wearPx(c, o, g);
      return;
    }
    if (k === 'shirt' || k === 'blouse' || k === 'uniform' || k === 'guard' || k === 'pajama') {
      const placketTo = topHem;
      if (fr && ax < 0.008 * H && c.y > placketTo && c.y < yN) {
        if (Math.abs(ax - 0.008 * H) < c.px * 0.8) over(o, INK, 0.3);
        for (let b = 0; b < 8; b++) { const by = yN - 0.03 * H - b * 0.062 * H; if (by < placketTo) break; if (button(c, o, 0, by, 0.0042 * H, mixc(g.col, WHITE, 0.6))) break; }
      }
      const pockets = k === 'guard' ? [1, -1] : k === 'shirt' && P.fem < 0.5 ? [1] : k === 'uniform' ? [1] : [];
      for (const sx of pockets) {
        const px0 = sx * 0.05 * H, py0 = yB + 0.035 * H;
        if (fr && Math.abs(c.x - px0) < 0.022 * H && c.y < py0 && c.y > py0 - 0.05 * H) {
          if (Math.abs(Math.abs(c.x - px0) - 0.022 * H) < c.px || Math.abs(c.y - (py0 - 0.05 * H)) < c.px) over(o, INK, 0.3);
          if (k === 'guard' && c.y > py0 - 0.014 * H) { scaleO(o, 1.05); if (Math.abs(c.y - (py0 - 0.014 * H)) < c.px) over(o, INK, 0.35); }
        }
      }
      if (k === 'guard') {
        // badge, name tape, epaulettes, CUSTODY across the back
        if (fr && Math.abs(c.x - 0.05 * H) < 0.011 * H && Math.abs(c.y - (yB + 0.06 * H)) < 0.012 * H) { const q = Math.abs(c.x - 0.05 * H) / (0.011 * H) + Math.max(0, (yB + 0.06 * H - c.y)) / (0.012 * H) * 0.6; if (q < 1) { shadeInto(o, [196, 200, 204], 0.9 + 0.2 * (1 - q)); if (q > 0.82) over(o, INK, 0.4); } }
        if (fr && c.x < -0.03 * H && c.x > -0.07 * H && Math.abs(c.y - (yB + 0.052 * H)) < 0.005 * H) shadeInto(o, [30, 32, 34], 1);
        if (c.part === 'traps' && c.kind === 'top' && Math.abs(Math.abs(c.x) - P.chestTopX * 0.75) < 0.02 * H) { scaleO(o, 0.86); if (Math.abs(Math.abs(c.x) - P.chestTopX * 0.75) > 0.017 * H) over(o, INK, 0.3); }
        if (bk && c.y > yB && c.y < yB + 0.05 * H && textAt(c, 'CUSTODY', -c.x, c.y - (yB + 0.025 * H), 0.0065 * H)) shadeInto(o, [26, 28, 30], 1);
      }
      if (k === 'uniform' && fr && c.x < -0.03 * H && c.x > -0.075 * H && Math.abs(c.y - (yB + 0.045 * H)) < 0.008 * H) { shadeInto(o, [240, 240, 236], 1); if (Math.abs(c.y - (yB + 0.045 * H)) < 0.002 * H && Math.abs(c.x + 0.052 * H) < 0.018 * H) shadeInto(o, [58, 90, 138], 1); }
      if (k === 'pajama' && fr && Math.abs(ax - 0.008 * H) < c.px * 1.2) shadeInto(o, mixc(g.col, WHITE, 0.6), 1);
      wearPx(c, o, g);
      return;
    }
    if (k === 'jumpsuit' || k === 'coverall') {
      // zip front, number tape (jumpsuit) or name patch (coveralls), breast pocket, waist cinch
      if (fr && ax < c.px * 0.8 && c.y < yN && c.y > P.crotchY) shadeInto(o, (c.j % 2) ? [154, 148, 136] : [90, 86, 78], 1);
      if (fr && ax < 0.006 * H && ax > c.px && c.y < yN) scaleO(o, 0.94);
      if (k === 'jumpsuit' && fr && c.x < -0.022 * H && c.x > -0.085 * H && Math.abs(c.y - (yB + 0.05 * H)) < 0.016 * H) {
        shadeInto(o, [232, 228, 214], 0.98);
        if (textAt(c, D.hazmat?.num?.slice(2) || '4471', -c.x - 0.054 * H, c.y - (yB + 0.05 * H), 0.0042 * H)) shadeInto(o, [28, 26, 24], 1);
      }
      if (k === 'coverall' && fr && c.x < -0.03 * H && c.x > -0.075 * H && Math.abs(c.y - (yB + 0.045 * H)) < 0.008 * H) shadeInto(o, [240, 240, 236], 1);
      if (fr && c.x > 0.03 * H && c.x < 0.075 * H && c.y < yB + 0.04 * H && c.y > yB - 0.02 * H && (line(c, c.x - 0.03 * H) || line(c, c.x - 0.075 * H) || line(c, c.y - (yB - 0.02 * H)) || line(c, c.y - (yB + 0.04 * H)))) over(o, INK, 0.3);
      if (Math.abs(c.y - P.waistY) < 0.005 * H) { scaleO(o, 0.9); }
      if (k === 'jumpsuit' && bk && c.y > yB - 0.02 * H && c.y < yB + 0.06 * H && textAt(c, D.hazmat?.num || 'D-4471', -c.x, c.y - (yB + 0.02 * H), 0.009 * H)) shadeInto(o, [30, 28, 26], 0.95);
      wearPx(c, o, g);
      return;
    }
    if (k === 'hoodie') {
      // kangaroo pocket, drawstrings
      if (fr && ax < 0.07 * H && c.y > topHem + 0.02 * H && c.y < topHem + 0.1 * H) {
        const edge = Math.abs(ax - 0.07 * H + (c.y - topHem - 0.02 * H) * 0.25);
        if (edge < c.px || line(c, c.y - (topHem + 0.1 * H))) over(o, INK, 0.35);
        else if (ax < 0.07 * H - (c.y - topHem - 0.02 * H) * 0.25) scaleO(o, 0.96);
      }
      if (fr && Math.abs(ax - 0.02 * H) < c.px * 0.8 && c.y > yB - 0.02 * H && c.y < yN) shadeInto(o, [232, 230, 222], 1);
    }
    if (k === 'tee' || k === 'knit' || k === 'stripe' || k === 'hoodie') {
      if (c.y > yN - 0.012 * H && (c.part === 'traps' || c.part === 'chestHi')) scaleO(o, c.i % 2 ? 0.88 : 1);
      if (k === 'tee' && fr) teePrint(c, o, g);
    }
    if (k === 'scrubs' && fr && c.x > 0.03 * H && c.x < 0.07 * H && c.y < yB + 0.03 * H && c.y > yB - 0.02 * H && (line(c, c.x - 0.03 * H) || line(c, c.x - 0.07 * H) || line(c, c.y - (yB - 0.02 * H)))) over(o, INK, 0.3);
    if (k === 'bandeau' && Math.abs(c.y - (P.bustY + 0.025 * H)) < c.px * 1.2) over(o, INK, 0.3);
    wearPx(c, o, g);
  }
  function teePrint(c: Ctx, o: O4, g: Garm) {
    const which = Math.floor(h2(seedK, 3, 7) * 6);
    const cy = yB + 0.012 * H, dx = c.x, dy = c.y - cy, r = 0.04 * H;
    const ink = lum3(g.col) > 0.55 ? [40, 52, 80] : [236, 228, 208];
    const acc = [[216, 96, 58], [58, 138, 200], [232, 192, 64], [88, 168, 88]][Math.floor(h2(seedK, 4, 7) * 4)];
    let m = false, col = ink;
    if (which === 0) { m = Math.hypot(dx, dy) < r && Math.hypot(dx, dy) > r * 0.55; col = acc; }
    else if (which === 1) { const a = Math.atan2(dy, dx), rr = r * (0.55 + 0.45 * Math.abs(Math.cos(a * 2.5))); m = Math.hypot(dx, dy) < rr; col = acc; }
    else if (which === 2) m = textAt(c, 'LVL0', dx, dy, 0.006 * H);
    else if (which === 3) { m = Math.abs(dy) < 0.006 * H && Math.abs(dx) < 0.07 * H; col = acc; }
    else if (which === 4) m = textAt(c, 'FUN RUN', dx, dy, 0.005 * H);
    if (m) shadeInto(o, col, bodyK(c) * 0.98);
  }
  /** wear: frays, scuffs, holes at low condition; old blood soaked into the garment */
  function wearPx(c: Ctx, o: O4, g: Garm) {
    if (g.wear > 0.4) {
      const n = vnoise(c.i * 0.35, c.j * 0.35, 13 + g.tex.length);
      if (n > 1.02 - g.wear * 0.25) { over(o, mixc(g.col, [255, 255, 255], 0.3), 0.3); }
      if (h2(c.i, c.j, 17) < (g.wear - 0.4) * 0.03) shadeInto(o, INK, 0.5);
    }
    if (g.blood > 0.05) {
      const n = vnoise3(c.x * 30, c.y * 30, c.z * 30, 31);
      if (n < g.blood * 0.55) over(o, n < g.blood * 0.3 ? BLOOD_D : BLOOD, 0.7);
    }
  }

  // ---------------------------------------------------------------- the hazmat suit
  const HZ = D.hazmat;
  const hzCol = HZ?.col ?? [232, 196, 40];
  const TAPE = [176, 178, 172];
  function rubber(c: Ctx, o: O4, col: C3, kk: number) {
    shadeInto(o, col, kk);
    // rubber sheen: soft highlights on the rounded faces, a sharper glint on folds
    const sh = 0.16 * G(c.e + 0.25, 0, 0.32, 1) * (c.kind === 'side' ? 1 : 0.5) + 0.12 * Math.max(0, Math.sin(c.y * 260 + c.x * 90 + c.z * 70)) ** 8;
    over(o, [255, 252, 236], sh);
  }
  function hazmatPx(c: Ctx, o: O4) {
    const ax = Math.abs(c.x), fr = front(c), bk = back(c);
    const arm = c.part === 'uarm' || c.part === 'farm', leg = c.part === 'thigh' || c.part === 'calf' || c.part === 'shin';
    let col: C3 = hzCol;
    const pat = HZ?.pattern || '';
    if (pat === 'stripe' && Math.floor(c.y / 0.03) % 2) col = mixc(hzCol, [24, 22, 20], 0.82);
    if (pat === 'hazard' && (leg || arm || c.y < P.waistY) && Math.floor((around(c) * 0.8 + c.y) / 0.035) % 2) col = mixc(hzCol, [24, 22, 20], 0.85);
    let kk = bodyK(c) * fabricK(c, 'rubber');
    // baggy folds: diagonal pulls at the crotch / armpits, rings round the knees and elbows
    if (arm) kk *= fold(0.2, 200, 1.3, c.y + c.z * 0.4) * (Math.abs(c.y - P.elbowY) < 0.04 * H ? fold(0.18, 600, 0.7, c.y) : 1);
    else if (leg) kk *= fold(0.18, 170, 0.4, c.y - c.x * 0.3) * (Math.abs(c.y - P.kneeY) < 0.05 * H ? fold(0.2, 500, 2.1, c.y) : 1);
    else { kk *= fold(0.1, 110, 2.2, c.y + c.x * 1.2); if (bk) kk *= fold(0.1, 90, 0.4, c.x * 2 + c.y * 0.3); }
    rubber(c, o, col, kk);
    if (pat === 'circuit' && (h2(Math.floor(c.x * 90), Math.floor(c.y * 90), 3) > 0.92 && ((c.i % 5) === 0 || (c.j % 5) === 0))) shadeInto(o, [58, 232, 240], 1);
    const tape = (d: number, w: number) => { if (Math.abs(d) < w) { shadeInto(o, TAPE, bodyK(c) * (0.95 + 0.12 * h2(c.i >> 1, c.j, 41) - (Math.abs(d) > w - c.px ? 0.2 : 0))); if (h2(c.i, c.j, 43) > 0.96) over(o, [255, 255, 255], 0.3); return true; } return false; };
    // taped seams: shoulders, sides, waist, cuffs, ankles, the front zip flap
    if (arm) {
      if (tape(c.y - (P.shoulderY - 0.008 * H), 0.009 * H)) return;
      if (tape(c.y - (P.wristY + 0.075 * H), 0.012 * H)) return;
      const sx = Math.sign(c.x) || 1;
      if (sx * c.nx > 0.6 && Math.abs(c.y - (P.shoulderY - 0.06 * H)) < 0.008 * H) { shadeInto(o, [214, 218, 214], 1.08); return; } // reflective band
      if (-sx * c.nx > 0.8 && Math.abs(c.e) < 0.18) over(o, INK, 0.18);
      hazWear(c, o);
      return;
    }
    if (leg) {
      if (bootTop && tape(c.y - (bootTop + 0.004 * H), 0.012 * H)) return;
      const sx = Math.sign(c.x) || 1;
      if (sx * c.nx > 0.9 && Math.abs(c.e) < 0.12) over(o, INK, 0.2);
      if (Math.abs(c.y - (P.kneeY + 0.02 * H)) < 0.008 * H && (fr || sx * c.nx > 0.5)) { shadeInto(o, [214, 218, 214], 1.08); return; }
      hazWear(c, o);
      return;
    }
    // torso: zip flap, waist tape, side seams, the Meridian patch, the number tapes, the back stencil
    if (fr && ax < 0.014 * H && c.y > P.crotchY && c.y < yN) {
      if (tape(c.x - 0.003 * H, 0.011 * H)) { if (Math.abs(c.x - 0.003 * H) < c.px * 0.6) over(o, INK, 0.3); return; }
    }
    if (tape(c.y - P.waistY, 0.008 * H)) return;
    if (Math.abs(c.nx) > 0.9 && Math.abs(c.e) < 0.1) over(o, INK, 0.2);
    if (c.part === 'traps' && tape(Math.abs(c.nx) < 0.5 ? (c.y - (P.shoulderY + 0.004 * H)) : 1, 0.006 * H)) return;
    // the Meridian patch on the left breast: a stitched shield with the meridian ring and its letter
    if (fr) {
      const mx = 0.052 * H, my = yB + 0.045 * H, dx = c.x - mx, dy = c.y - my;
      const w = 0.026 * H, hh = 0.03 * H;
      const shield = Math.abs(dx) < w - Math.max(0, -dy - hh * 0.3) * 0.7 && dy < hh && dy > -hh;
      if (shield) {
        const edge = Math.abs(dx) > w - Math.max(0, -dy - hh * 0.3) * 0.7 - c.px * 1.6 || dy > hh - c.px * 1.6 || dy < -hh + c.px * 1.6;
        shadeInto(o, edge ? [40, 46, 52] : [32, 52, 66], bodyK(c) * 1.02);
        const rr = Math.hypot(dx, dy - 0.004 * H);
        if (Math.abs(rr - 0.015 * H) < c.px * 0.9 || (Math.abs(dx) < c.px * 0.7 && rr < 0.017 * H)) shadeInto(o, [222, 196, 96], 1.05);
        if (Math.abs(dy - 0.004 * H) < c.px * 0.6 && rr < 0.017 * H) shadeInto(o, [222, 196, 96], 0.9);
        if (dy < -hh * 0.55 && textAt(c, 'MI', dx, dy + hh * 0.75, 0.0035 * H)) shadeInto(o, [236, 232, 220], 1);
        if (edge && h2(c.i, c.j, 5) > 0.5) over(o, [200, 200, 190], 0.35);
        return;
      }
      // MERIDIAN on a strip under the patch
      if (c.x > mx - 0.032 * H && c.x < mx + 0.032 * H && Math.abs(c.y - (my - 0.042 * H)) < 0.0055 * H) {
        shadeInto(o, [36, 40, 44], bodyK(c));
        if (textAt(c, 'MERIDIAN', c.x - mx, c.y - (my - 0.042 * H), 0.0021 * H)) shadeInto(o, [226, 222, 210], 1);
        return;
      }
      // debtor number tape on the right breast
      const nx0 = -0.055 * H, ny0 = yB + 0.045 * H;
      if (Math.abs(c.x - nx0) < 0.034 * H && Math.abs(c.y - ny0) < 0.012 * H) {
        const patch = HZ?.patch || 'stitched';
        if (patch === 'torn' && c.x > nx0 + 0.008 * H && h2(c.i >> 1, c.j >> 1, 9) > 0.4) { over(o, mixc(hzCol, INK, 0.3), 0.3); }
        else {
          shadeInto(o, [236, 234, 224], bodyK(c) * (0.96 + 0.06 * h2(c.i, c.j, 77)));
          const inkC = patch === 'marker' ? [30, 40, 110] : patch === 'stencil' ? [24, 22, 20] : [26, 24, 22];
          if (textAt(c, (HZ?.num || 'D-4471').slice(2), -(c.x - nx0), c.y - ny0, 0.0042 * H)) shadeInto(o, inkC, patch === 'stencil' && h2(c.i, c.j, 3) > 0.8 ? 0.6 : 1);
          if (patch === 'stitched' && (Math.abs(Math.abs(c.y - ny0) - 0.0115 * H) < c.px * 0.6) && (c.i % 2 === 0)) over(o, INK, 0.6);
        }
        return;
      }
    }
    // stencilled number across the back, a hazard warning band
    if (bk && c.y > yB - 0.035 * H && c.y < yB + 0.07 * H) {
      if (textAt(c, HZ?.num || 'D-4471', -c.x, c.y - (yB + 0.018 * H), 0.0066 * H)) { shadeInto(o, [26, 24, 22], (h2(c.i, c.j, 8) > 0.88 ? 0.75 : 1)); return; }
    }
    if (bk && Math.abs(c.y - (P.waistY + 0.05 * H)) < 0.009 * H) { shadeInto(o, Math.floor((c.x + c.y) / (0.012 * H)) % 2 ? [24, 22, 20] : hzCol, bodyK(c)); return; }
    hazWear(c, o);
  }
  function hazWear(c: Ctx, o: O4) {
    const w = (HZ?.wear ?? 0) / 3;
    const n = vnoise3(c.x * 14, c.y * 14, c.z * 14, 5);
    if (n > 0.8 - w * 0.25) over(o, [120, 110, 80], (n - 0.8 + w * 0.25) * 1.6);   // scuffed and grimy
    if (w > 0.3 && h2(c.i, c.j, 19) < w * 0.012) shadeInto(o, INK, 0.6);           // nicks
    const st = HZ?.stains || 'none';
    if (st !== 'none') {
      const m = vnoise3(c.x * 9 + 3, c.y * 9, c.z * 9, 23);
      const col = st === 'oil' ? [30, 26, 22] : st === 'blood' ? [90, 26, 20] : st === 'coffee' ? [110, 70, 36] : st === 'bleach' ? [250, 246, 220] : [190, 160, 70];
      if (m < 0.22) over(o, col, (0.22 - m) * 3);
    }
  }

  // ---------------------------------------------------------------- bottoms
  function bottomPx(c: Ctx, o: O4, Bt: Garm) {
    const k = Bt.kind, ax = Math.abs(c.x), fr = front(c), bk = back(c);
    const leg = c.part === 'thigh' || c.part === 'calf' || c.part === 'shin';
    if (k === 'hazmat') { hazmatPx(c, o); return; }
    let col = garmCol(Bt, c);
    const fab = k === 'jeans' ? 'denim' : k === 'slacks' ? 'wool' : k === 'sweats' ? 'fleece' : k === 'guard' || k === 'uniform' || k === 'jumpsuit' || k === 'coverall' ? 'canvas' : 'cotton';
    let kk = bodyK(c) * fabricK(c, fab);
    if (leg) {
      const sx = Math.sign(c.x) || 1;
      if (bk && Math.abs(c.y - P.kneeY) < 0.03 * H) kk *= fold(0.22, 700, 0.4, c.y + c.z * 0.3);
      if (fr && c.part === 'thigh' && c.y > P.crotchY - 0.06 * H && -sx * c.nx > -0.2) kk *= fold(0.14, 380, 1.1, c.y - (c.x - P.hipX * sx) * sx * 1.5);
      if (c.y < botHem + 0.06 * H && D.legsKind !== 'shorts') kk *= fold(0.16, 520, 2.2, c.y + c.z * 0.4);
      if (fr && Math.abs(c.y - P.kneeY - 0.015 * H) < 0.03 * H) kk *= 1.03;
    }
    if (k === 'jeans') {
      const wear = fr ? 0.16 * G(0, c.y - (P.kneeY + 0.08 * H), 1, 0.09 * H) * (0.6 + 0.4 * vnoise(c.x * 60, c.y * 30, 4)) : 0;
      col = mixc(col, [150, 170, 200], wear);
    }
    shadeInto(o, col, kk);
    // waistband / belt
    const band = !suitBody && c.y > waist - 0.02 * H && c.y <= waist + 0.002 * H && !(c.y > topHem && !tuck);
    if (band) {
      if (k === 'guard') { shadeInto(o, [26, 26, 28], 0.95 * fabricK(c, 'nylon')); if (Math.abs(c.y - waist + 0.01 * H) < 0.003 * H) scaleO(o, 1.2); if ((ax > 0.04 * H && ax < 0.06 * H) || (ax > 0.09 * H)) { shadeInto(o, [34, 34, 36], 1.05); } }
      else if ((k === 'jeans' || k === 'slacks') && tuck) {
        shadeInto(o, [42, 30, 24], bodyK(c) * fabricK(c, 'leather') * (Math.abs(c.y - waist + 0.01 * H) < 0.004 * H ? 1.12 : 1));
        if (fr && ax < 0.016 * H) { shadeInto(o, SILVER, 0.9 + 0.2 * h2(c.i, c.j, 5)); if (Math.abs(ax - 0.016 * H) < c.px) over(o, INK, 0.5); }
      } else if (k === 'sweats' || k === 'pajama' || k === 'scrubs') { scaleO(o, c.i % 2 ? 0.9 : 1); if (fr && Math.abs(ax - 0.012 * H) < c.px && c.y < waist - 0.005 * H) shadeInto(o, [236, 234, 228], 1); }
      if (Math.abs(c.y - (waist - 0.02 * H)) < c.px * 0.7) over(o, INK, 0.35);
      if (Math.abs(c.y - waist) < c.px * 0.6) over(o, INK, 0.3);
    }
    if (leg) {
      const sx = Math.sign(c.x) || 1;
      if (sx * c.nx > 0.9 && Math.abs(c.e) < 0.1) over(o, k === 'jeans' ? [200, 140, 70] : INK, k === 'jeans' ? 0.5 : 0.2);
      if (k === 'slacks' && fr && Math.abs(c.e) < 0.07) scaleO(o, 1.1);
      if (k === 'sweats' && sx * c.nx > 0.8 && Math.abs(c.e) < 0.25) shadeInto(o, mixc(Bt.col, WHITE, 0.55), bodyK(c));
      if ((k === 'guard' || k === 'uniform' || k === 'coverall') && sx * c.nx > 0.5 && c.part === 'thigh' && c.y < P.hipY - 0.07 * H && c.y > P.kneeY + 0.06 * H) {
        const t0 = P.hipY - 0.07 * H, fy = t0 - 0.022 * H;
        if (c.y > fy) { scaleO(o, 1.06); if (Math.abs(c.y - fy) < c.px) over(o, INK, 0.4); }
        if (Math.abs(c.y - t0) < c.px || Math.abs(c.y - (P.kneeY + 0.06 * H)) < c.px || Math.abs(c.e) > 0.85) over(o, INK, 0.35);
      }
      if (c.y < botHem + 0.012 * H && Math.abs(c.y - botHem - 0.012 * H) < c.px * 0.7) over(o, INK, 0.3);
      if (k === 'sweats' && c.y < botHem + 0.03 * H) scaleO(o, c.i % 2 ? 0.88 : 1);
      wearPx(c, o, Bt);
      return;
    }
    // hips: fly, pockets
    if (!suitBody) {
      if (fr && c.y < waist - 0.02 * H && c.y > P.crotchY + 0.02 * H && Math.abs(c.x - 0.008 * H) < c.px * 0.6 && (k === 'jeans' || k === 'slacks' || k === 'guard')) over(o, k === 'jeans' ? [200, 140, 70] : INK, 0.35);
      if (fr && c.y < waist - 0.02 * H && (k === 'jeans' || k === 'slacks' || k === 'shorts')) {
        const pxl = P.hipsX * 0.62 + (waist - c.y) * 0.45;
        if (Math.abs(ax - pxl) < c.px * 0.8 && c.y > waist - 0.075 * H) over(o, INK, 0.4);
      }
      if (bk && k === 'jeans' && c.y < waist - 0.03 * H && c.y > waist - 0.1 * H && ax > 0.015 * H && ax < 0.07 * H && (Math.abs(c.y - (waist - 0.03 * H)) < c.px || Math.abs(ax - 0.015 * H) < c.px || Math.abs(ax - 0.07 * H) < c.px)) over(o, [200, 140, 70], 0.5);
    }
    wearPx(c, o, Bt);
  }

  // ---------------------------------------------------------------- legs below the hem, shoes
  function legwearPx(c: Ctx, o: O4) {
    if (bootTop && c.y < bootTop && c.part === 'shin') { shoeUpper(c, o); return; }
    if (sockTop && c.y < sockTop && socks) {
      const sc = fk === 'dress' ? [34, 32, 34] : [236, 234, 226];
      shadeInto(o, sc, bodyK(c) * (c.i % 2 ? 0.93 : 1.02));
      if (sockTop - c.y < 0.012 * H) scaleO(o, c.i % 2 ? 0.88 : 1);
      return;
    }
    skinPx(c, o);
  }
  function shoeUpper(c: Ctx, o: O4) {
    if (hzB) { rubber(c, o, [30, 32, 30], bodyK(c) * fabricK(c, 'rubber')); if (Math.abs(c.y - bootTop) < c.px * 1.2) over(o, INK, 0.5); return; }
    const S = D.feet!;
    shadeInto(o, S.col, bodyK(c) * fabricK(c, 'leather'));
    if (front(c) && Math.abs(c.e) < 0.3 && Math.round(c.y / (0.01 * H)) % 2 === 0) over(o, [200, 180, 140], 0.6);
    if (Math.abs(c.y - bootTop) < c.px * 1.2) over(o, INK, 0.4);
  }
  function shoePx(c: Ctx, o: O4) {
    const toe = c.part === 'toe';
    if (hzB) {
      if (c.kind === 'bot') { shadeInto(o, [20, 20, 20], 0.7); return; }
      rubber(c, o, c.y < 0.012 * H ? [56, 52, 44] : [30, 32, 30], bodyK(c) * fabricK(c, 'rubber'));
      if (Math.abs(c.y - 0.012 * H) < c.px * 0.7) over(o, INK, 0.4);
      if (c.y < 0.012 * H && c.kind === 'side' && (c.i % 3) === 0) scaleO(o, 0.8);
      return;
    }
    if (fk === 'bare' || fk === 'sock') {
      if (fk === 'sock') { shadeInto(o, [236, 234, 226], (c.kind === 'bot' ? 0.6 : bodyK(c)) * (c.i % 2 ? 0.94 : 1.02)); return; }
      skinPx(c, o, c.kind === 'bot' ? 0.7 : 0.95);
      if (toe && c.kind === 'top' && c.z > P.footL * 0.45 && Math.abs(((c.x - P.hipX * Math.sign(c.x)) / (0.008 * H)) % 1) < 0.15) scaleO(o, 0.85);
      return;
    }
    const S = D.feet!;
    const k = fk === 'slipper' ? 'slipper' : fk;
    const sole = k === 'sneaker' ? 0.014 * H : k === 'boot' ? 0.016 * H : k === 'slipper' ? 0.01 * H : 0.008 * H;
    const soleCol = k === 'sneaker' ? (S.item.includes('canvas') ? [214, 206, 188] : [238, 236, 230]) : k === 'slipper' ? mixc(S.col, WHITE, 0.4) : [40, 30, 26];
    if (c.kind === 'bot') { shadeInto(o, mixc(soleCol, INK, 0.4), 0.7); return; }
    if (c.y < sole - P.sole) {
      shadeInto(o, soleCol, 0.95 * fabricK(c, 'cotton'));
      if (k === 'boot' && c.kind === 'side' && (c.i % 3) === 0) scaleO(o, 0.8);
      if (Math.abs(c.y - (sole - P.sole)) < c.px * 0.6) over(o, INK, 0.3);
      return;
    }
    const leather = k === 'dress' || k === 'boot';
    const kk = bodyK(c) * 1.05 * fabricK(c, leather ? 'leather' : 'cotton');
    shadeInto(o, S.col, kk);
    if (leather) {
      const hi = (toe ? 0.35 : 0.12) * G(c.e, c.rb / Math.max(c.rh, 1e-4) - 0.6, 0.4, 0.25) * (c.kind === 'top' ? 1.2 : 0.8);
      over(o, [255, 248, 238], hi);
      if (Math.abs(c.y - sole + P.sole - c.px) < c.px * 0.6) over(o, INK, 0.4);
    }
    if (k === 'sneaker') {
      if (toe && c.kind === 'top') shadeInto(o, mixc(S.col, WHITE, 0.25), kk);
      const sx = Math.sign(c.x) || 1;
      if (!S.item.includes('canvas') && sx * c.nx > 0.7 && !toe && Math.abs(c.y - sole - 0.012 * H + c.e * 0.006 * H) < 0.004 * H) shadeInto(o, [40, 44, 60], 0.95);
    }
    if (!toe && c.kind === 'top' && (k === 'dress' || k === 'sneaker' || k === 'boot') && !S.item.includes('canvas')) {
      if (c.z > -0.01 && Math.abs(c.x - P.hipX * Math.sign(c.x)) < 0.012 * H) { const q = (c.z * 260) % 1; shadeInto(o, k === 'sneaker' ? [246, 246, 242] : mixc(S.col, INK, 0.5), q < 0.45 ? 1 : 0.7); }
    }
    if (k === 'slipper' && c.kind === 'top') scaleO(o, (c.i + c.j) % 2 ? 0.94 : 1.04);
  }

  // ---------------------------------------------------------------- body dispatcher
  function bodyPx(c: Ctx, o: O4) {
    const p = c.part, y = c.y;
    if (p === 'uarm' || p === 'farm') {
      const g = outer && outer.sleeve !== 'none' && y > outCuff ? outer : top && top.sleeve !== 'none' && y > topCuff ? top : null;
      if (g) topPx(c, o, g, g === outer); else skinPx(c, o);
      if (D.hands && p === 'farm' && y < P.wristY + (D.hands.kind === 'hazmat' ? 0.07 : 0.03) * H) glovePx(c, o);
      return;
    }
    if (p === 'thigh' || p === 'calf' || p === 'shin') {
      if (bot && !skirt && y >= botHem) bottomPx(c, o, bot); else legwearPx(c, o);
      if (bootTop && y < bootTop && p === 'shin') shoeUpper(c, o);
      return;
    }
    torsoPx(c, o);
    straps(c, o);
  }
  function straps(c: Ctx, o: O4) {
    const ax = Math.abs(c.x);
    if (D.back && (c.part === 'traps' || c.part === 'chestHi' || c.part === 'chestLo')) {
      const sx = P.chestTopX * 0.62;
      if (Math.abs(ax - sx) < 0.014 * H && (c.kind === 'top' || front(c) || (back(c) && c.y > P.shoulderY - 0.02 * H))) {
        shadeInto(o, mixc(D.back.col, INK, 0.25), bodyK(c) * 0.95);
        if (Math.abs(Math.abs(ax - sx) - 0.014 * H) < c.px * 0.7) over(o, INK, 0.45);
        if (front(c) && Math.abs(c.y - P.bustY) < 0.006 * H) shadeInto(o, SILVER, 0.7);
      }
    }
    // the researcher's lanyard
    if (D.badge && (c.part === 'traps' || c.part === 'chestHi' || c.part === 'chestLo' || c.part === 'bust') && !back(c)) {
      const w = P.hw * 0.75 - (P.neckBase - c.y) * 0.4;
      if (c.y > P.waistY + 0.05 * H && Math.abs(ax - Math.max(0.004 * H, w)) < 0.003 * H) shadeInto(o, D.badge.col, 0.95);
    }
    if (hz && c.part !== 'traps' && front(c) && c.x < -0.012 * H && c.x > -0.042 * H && c.y > P.bustY - 0.025 * H && c.y < P.bustY - 0.015 * H) shadeInto(o, [40, 40, 42], 0.9); // hose clip
  }

  // ---------------------------------------------------------------- head (sides / back / top / jaw), ears, nose
  const hairStyle = hair.style;
  const shell = hairStyle;
  function headHair(c: Ctx) {
    if (hz) return false;
    if (shell === 'none') return false;
    const y = c.y;
    if (shell === 'bald') return y > P.earBot && y < P.earTop + 0.12 * hu && c.z < P.zf - 0.25 * hu;
    if (shell === 'shaved') return false;
    if (c.kind === 'top') return true;
    if (c.nz < -0.4) return y > P.napeY - 0.02 * hu;
    if (Math.abs(c.nx) > 0.4) {
      if (y > P.earTop + 0.02 * hu) return c.z < P.zf - 0.14 * hu || y > P.hairY - 0.05 * hu;
      if (c.z < P.hcz - 0.18 * hu) return y > P.napeY;
      return y > P.earBot + 0.12 * hu && c.z < P.hcz + 0.05 * hu && P.fem < 0.5;
    }
    return y > P.hairY;
  }
  function headPx(c: Ctx, o: O4) {
    let k = (c.part === 'scalp' ? 0.86 - 0.08 * Math.abs(c.nx) - 0.08 * Math.max(0, -c.nz) : 0.86) * (c.kind === 'bot' ? 0.62 : 1) * (1 + (h2(c.i, c.j, 21) - 0.5) * 0.035);
    if (c.kind === 'side' && Math.abs(c.nx) > 0.4) k *= 0.96 - 0.06 * clamp01((P.zf - c.z) / (2 * P.hd));
    shadeInto(o, skinC, k, 0.25);
    if (c.kind === 'bot') { if (sp.face.stubble) over(o, [70, 72, 84], sp.face.stubble * 0.3 * h2(c.i, c.j, 77)); return; }
    if (sp.face.stubble && c.part === 'jaw' && c.y < P.mouthY + 0.05 * hu) over(o, [70, 72, 84], sp.face.stubble * (0.15 + 0.2 * h2(c.i, c.j, 77)));
    if (sp.face.facial === 'chops' && c.part === 'jaw' && Math.abs(c.nx) > 0.4 && c.y > P.mouthY - 0.05 * hu) hairPx(o, hair, c.i, c.j, 0.85, 0.1);
    if (Math.abs(c.nx) > 0.5 && c.y > P.earBot - 0.03 * hu && c.y < P.earTop + 0.02 * hu && Math.abs(c.z - (P.hcz - 0.11 * hu)) < 0.1 * hu) { o[0] *= 0.88; o[1] *= 0.86; o[2] *= 0.86; }
    if (c.part === 'scalp') {
      over(o, [255, 240, 225], c.kind === 'top' ? 0.18 * G(c.x, c.z - P.hcz - 0.01, 0.03, 0.035) : 0.1 * G(c.e, c.rb / c.rh - 0.6, 0.5, 0.3) * Math.max(0, c.nz));
      if (sp.age > 0.5 && h2(c.i >> 1, c.j >> 1, 93) > 0.97) over(o, [150, 100, 70], 0.3);
    }
    if (headHair(c)) {
      const t = c.kind === 'top' ? Math.atan2(c.x, c.z - P.hcz + 0.06 * hu) * 26 : c.i;
      hairPx(o, hair, t, c.j, 0.9, c.kind === 'top' ? 0.12 : 0.18 * G(0, c.y - (P.crown - 0.25 * hu), 1, 0.05 * hu));
    } else if (shell === 'shaved' && c.y > P.earTop - 0.02 * hu) over(o, mixc(hair.col, skinC, 0.5), 0.35 + 0.2 * h2(c.i, c.j, 71));
    const gl = sp.face.glasses;
    if (gl && Math.abs(c.nx) > 0.5 && Math.abs(c.y - (P.eyeY + 0.02 * hu)) < c.px * (gl.kind === 'goggles' ? 2.5 : 0.8) && c.z > P.hcz - (gl.kind === 'goggles' ? 0.6 : 0.12) * hu) over(o, gl.col, 0.95);
    if (D.mask && (D.mask.kind === 'mask') && c.y < P.noseY + 0.02 * hu && c.y > P.chin - 0.04 * hu) maskPx(c, o);
    if (D.mask && D.mask.kind === 'mask' && Math.abs(c.nx) > 0.5 && Math.abs(c.y - (P.noseY + 0.0 * hu)) < c.px * 0.8) over(o, [240, 240, 236], 0.9);
  }
  function maskPx(c: Ctx, o: O4) {
    const m = D.mask!;
    shadeInto(o, m.col, bodyK(c) * fabricK(c, 'cotton') * (0.9 + 0.1 * Math.cos(c.y * 400)));
    if (Math.abs(c.y - (P.noseY + 0.02 * hu)) < c.px * 1.2 || Math.abs(c.y - (P.chin - 0.04 * hu)) < c.px * 1.2) over(o, INK, 0.3);
  }
  function earPx(c: Ctx, o: O4) {
    const outward = c.nx * (Math.sign(c.x) || 1) > 0.5;
    let k = 0.86;
    if (!outward) k *= c.kind === 'side' && Math.abs(c.nz) > 0.5 ? 0.82 : 0.75;
    shadeInto(o, skinC, k, 0.3);
    over(o, [220, 120, 110], 0.12);
    if (outward) {
      const ex = c.e, ey = (c.rb / c.rh) * 2 - 1;
      const rim = Math.max(Math.abs(ex), Math.abs(ey) * 0.9);
      if (rim > 0.68) over(o, [255, 230, 215], 0.12);
      else if (rim > 0.45 && ey > -0.5) { o[0] *= 0.82; o[1] *= 0.76; o[2] *= 0.76; }
      if (Math.abs(ex + 0.1) < 0.22 && Math.abs(ey + 0.05) < 0.3) { o[0] *= 0.72; o[1] *= 0.64; o[2] *= 0.64; }
      if (ey < -0.62) over(o, [230, 150, 140], 0.15);
      const ears = sp.face.ears;
      if (ears === 5 && ey < -0.5 && Math.abs(ex) < 0.3) shadeInto(o, GOLD, 1.05);                         // ringed
      if (ears === 6 && Math.hypot(ex, ey + 0.6) < 0.32) shadeInto(o, Math.hypot(ex, ey + 0.6) < 0.2 ? [20, 18, 18] : [60, 56, 56], 1); // gauged
      if (ears === 4 && c.x > 0 && ey > 0.4 && ex > 0.2) shadeInto(o, mixc(skinC, [150, 60, 60], 0.4), 0.7);    // notched
      if (ears === 3) { o[0] *= 0.94 - 0.06 * Math.abs(Math.sin(ex * 9 + ey * 7)); }                         // cauliflower
    }
    const gl = sp.face.glasses;
    if (gl && gl.kind !== 'goggles' && Math.abs(c.y - (P.eyeY + 0.02 * hu)) < c.px * 0.8 && c.nz > 0.3) over(o, gl.col, 0.9);
  }
  function nosePx(c: Ctx, o: O4) {
    if (c.kind === 'bot') {
      shadeInto(o, skinC, 0.62, 0.35);
      const nx = Math.abs(c.x) - 0.035 * hu, nz = c.z - (P.zf + 0.06 * hu);
      if (nx * nx / (0.022 * hu) ** 2 + nz * nz / (0.03 * hu) ** 2 < 1 && Math.abs(c.x) > 0.008 * hu) shadeInto(o, [70, 36, 34], 1);
      return;
    }
    shadeInto(o, skinC, 0.86 + 0.08 * (c.rb / c.rh), 0.3);
    if (c.rb / c.rh < 0.3) { o[0] *= 0.92; o[1] *= 0.88; o[2] *= 0.88; }
    over(o, [215, 115, 105], 0.06);
  }

  // ---------------------------------------------------------------- hair shells
  function hairShellPx(c: Ctx, o: O4) {
    const part = c.part, side = c.kind === 'side';
    const sideways = side && Math.abs(c.nx) > 0.4;
    const curly = shell === 'curly' || shell === 'afro';
    const u = c.kind === 'top' ? Math.atan2(c.x - (hair.part || 0) * P.hw * 0.3, c.z - P.hcz + 0.04 * hu) * 34 : c.i + (sideways ? Math.round(c.rt / c.px * 0.3) : 0);
    let sheen: number;
    if (c.kind === 'top') sheen = 0.3 * G(0, Math.hypot(c.x, c.z - P.hcz) - P.hw * 0.58, 1, 0.03 * hu);
    else if (part === 'tail' || part === 'hairLong') sheen = 0.5 * G(0, c.rt - 0.035, 1, 0.022);
    else if (part === 'bangs') sheen = 0.5 * G(0, c.rt / c.rh - 0.3, 1, 0.14);
    else if (part === 'beard') sheen = 0.08;
    else {
      const yb = P.crown - 0.2 * hu - 0.05 * hu * c.e * c.e + Math.sin(c.i * 0.9) * 0.008 * hu;
      sheen = 0.45 * G(0, c.y - yb, 1, 0.03 * hu) * (0.55 + 0.45 * Math.sin(c.i * 0.37 + c.j * 0.05));
    }
    if (c.kind === 'bot' && (part === 'bangs' || part === 'fringe')) { o[3] = 0; return; }
    let k = 1;
    if (c.kind === 'bot') k = 0.5;
    else if (side) k = 0.9 + 0.12 * (1 - c.e * c.e) - 0.18 * clamp01(1 - c.rb / (0.05 * hu));
    if (part === 'hairSide' && c.nx * Math.sign(c.x || 1) < -0.5) k *= 0.55;
    if (curly || part === 'beard') {
      const q = vnoise(c.i * 0.6, c.j * 0.6, 8), q2 = vnoise(c.i * 0.6 + 7, c.j * 0.6 - 3, 9);
      k *= 0.7 + 0.45 * Math.abs(Math.sin(q * 9)) + 0.12 * (q2 - 0.5);
      hairPx(o, hair, c.i * 0.25, c.j * 0.25, k, sheen * 0.35 + (Math.sin(q * 9) > 0.8 ? 0.25 : 0));
    } else hairPx(o, hair, u, c.j, k, sheen);
    if (hair.grey && !curly && h2(c.i, c.j, 44) > 0.72) over(o, [252, 252, 250], 0.22);
    if (shell === 'cornrows' && c.kind !== 'bot') { const q = (c.kind === 'top' ? c.x : around(c)) / (0.012 * H); if (Math.abs(q - Math.round(q)) < 0.12) scaleO(o, 0.55); }
    if (c.kind === 'top' && hair.part && ['short', 'long', 'bob', 'receding'].includes(shell) && Math.abs(c.x - hair.part * P.hw * 0.3) < c.px * 0.6 && c.z > P.hcz - 0.05 * hu) shadeInto(o, skinC, 0.75);
    if (side) {
      const cut = c.f.seg.cut;
      let edge = c.rb / c.px;
      if (cut === 'side') edge = (c.rb - (c.e * Math.sign(hair.part || 1) + 1) * 0.025 * hu) / c.px;
      else if (cut === 'swept') edge = (c.rb - (1 - c.e * (hair.part || 1)) * 0.035 * hu) / c.px;
      else if (cut === 'curly') edge = (c.rb - Math.abs(Math.sin(c.e * 7)) * 0.025 * hu) / c.px;
      if (part === 'hairSide' && sideways && (shell === 'short' || shell === 'buzz' || shell === 'ponytail' || shell === 'topknot' || shell === 'bun')) edge = (c.rb - clamp01(-c.e) * 0.08 * hu) / c.px;
      const depth = cut === 'messy' ? 5 : cut === 'beard' ? 3 : part === 'tail' ? 7 : part === 'hairCap' ? 3.5 : part === 'bangs' ? 4 : 2.8;
      const colI = Math.floor(c.i / (cut === 'messy' ? 2 : 1));
      const tip = h2(colI, 3, 17) * depth + (part === 'tail' ? Math.abs(c.e) * 5 : 0) + (part === 'bangs' && h2(colI >> 2, 5, 18) > 0.7 ? 2 : 0);
      if (edge < tip) o[3] = 0;
      else if (edge < depth + 1.5) { o[0] *= 0.8; o[1] *= 0.8; o[2] *= 0.8; }
    }
  }

  // ---------------------------------------------------------------- hats and the hazmat hood
  function hatPx(c: Ctx, o: O4) {
    if (hz) { hoodPx(c, o); return; }
    const Hh = D.hat!, k = Hh.kind;
    let kk = 0.95 * (c.kind === 'bot' ? 0.5 : 1) * fabricK(c, k === 'hardhat' || k === 'helmet' || k === 'riot' ? 'rubber' : k === 'beanie' ? 'knit' : 'cotton');
    if (c.kind === 'side') kk *= 0.94 + 0.06 * (1 - c.e * c.e);
    shadeInto(o, Hh.col, kk);
    if (k === 'hardhat' || k === 'helmet' || k === 'riot') over(o, [255, 255, 255], 0.25 * G(c.e, c.rb / c.rh - 0.6, 0.35, 0.25));
    if (k === 'hardhat' && c.kind === 'top' && Math.abs(c.x) < 0.01 * hu * 2) scaleO(o, 1.12);
    if (k === 'cap' && c.kind === 'side' && c.nz > 0.9 && Math.abs(c.e) < 0.35 && c.rb / c.rh > 0.3 && c.rb / c.rh < 0.75) shadeInto(o, WHITE, 0.95);
    if (k === 'cap' && c.kind === 'top' && Math.hypot(c.x, c.z - P.hcz) < 0.008) shadeInto(o, mixc(Hh.col, INK, 0.3), 1);
    if (k === 'beanie' && c.part === 'hatBand') scaleO(o, c.i % 2 ? 0.86 : 1.02);
    if (k === 'riot' && c.kind === 'side' && c.nz < -0.6 && textAt(c, '07', -c.x, c.y - (P.crown - 0.25 * hu), 0.012 * hu * 2)) shadeInto(o, [216, 216, 208], 1);
    if (c.kind === 'side' && c.rb < c.px * 1.2) over(o, INK, 0.25);
  }
  function hat2Px(c: Ctx, o: O4) {
    if (c.part === 'visorShield') { shadeInto(o, [22, 26, 32], 0.95); over(o, [120, 140, 170], 0.3 * G(c.e + 0.4, c.rb / c.rh - 0.7, 0.2, 0.15)); return; }
    const Hh = D.hat!;
    const kk = c.kind === 'bot' ? 0.55 : c.kind === 'top' ? 1 : 0.85;
    shadeInto(o, Hh.col, kk * fabricK(c, 'cotton'));
    if (c.kind === 'side') over(o, INK, 0.2);
  }
  function hoodPx(c: Ctx, o: O4) {
    let kk = (c.kind === 'bot' ? 0.6 : 1) * fabricK(c, 'rubber') * (c.kind === 'side' ? 0.92 + 0.08 * (1 - c.e * c.e) : 1.02);
    kk *= fold(0.12, 260, 1.7, c.y + c.x * 0.6);
    if (c.part === 'hoodNeck') kk *= fold(0.22, 700, 0.3, c.y);
    rubber(c, o, hzCol, kk);
    // taped seam over the crown, a drawcord round the face opening
    if ((c.part === 'hood' || c.part === 'hoodTop') && Math.abs(c.x) < 0.012 * hu * 1.5 && (c.kind === 'top' || c.nz < 0.3)) shadeInto(o, TAPE, 0.95 + 0.1 * h2(c.i, c.j, 3));
    if (c.part === 'hood' && c.kind === 'side' && c.nz > 0.2 && Math.abs(c.e) > 0.8) scaleO(o, 0.8);
    hazWear(c, o);
  }

  // ---------------------------------------------------------------- accessories
  function accPx(c: Ctx, o: O4) {
    const p = c.part;
    const edge = (w = 1) => c.kind === 'side' && (Math.abs(c.e) > 1 - c.px * 2.4 * w / Math.max(0.01, c.f.s1 - c.f.s0) || c.rb < c.px * w || c.rt < c.px * w);
    if (p === 'skirt' || p === 'skirtUp') {
      const Bt = D.bottom!;
      let kk = (c.kind === 'bot' ? 0.45 : 0.9 + 0.1 * (c.y - P.kneeY) / H * 2) * fabricK(c, 'wool');
      const a2 = Math.atan2(c.x, c.z) * 10 / Math.PI, q = a2 - Math.floor(a2); kk *= q < 0.5 ? 1.03 : 0.92;
      if (c.kind === 'side') kk *= 1 - 0.06 * c.e * c.e;
      shadeInto(o, Bt.col, kk);
      if (p === 'skirtUp' && c.rt < 0.018 * H && c.kind === 'side') { scaleO(o, 0.92); if (Math.abs(c.rt - 0.018 * H) < c.px) over(o, INK, 0.4); }
      if (c.kind === 'side' && c.rb < c.px * 1.2 && p === 'skirt') over(o, INK, 0.3);
      return;
    }
    if (p === 'coatTail') {
      const g = outer!;
      if (g.kind === 'labcoat' && c.f.seg.inner && c.kind === 'side') { /* lining shares the paint */ }
      let kk = (0.9 + 0.1 * (c.y - P.kneeY) / H * 2) * fabricK(c, g.kind === 'coat' ? 'nylon' : 'cotton') * fold(0.14, 120, 1.1, c.x * 2.2 + c.z);
      if (c.kind === 'side') kk *= 1 - 0.06 * c.e * c.e;
      shadeInto(o, g.col, kk * 0.97);
      if (c.rb < c.px * 1.4) over(o, INK, 0.35);
      if (g.kind === 'labcoat' && front(c) === false && c.nz > 0.3 && Math.abs(c.e) > 0.85) over(o, INK, 0.3);
      if (back(c) && Math.abs(c.x) < c.px * 0.7 && c.y < P.crotchY) over(o, INK, 0.4); // the vent
      if (g.kind === 'labcoat' && Math.abs(c.nx) > 0.6 && c.y > P.crotchY - 0.03 * H && c.y < P.crotchY + 0.03 * H && (line(c, c.y - (P.crotchY + 0.03 * H)) || line(c, c.e - 0.6, 3))) over(o, INK, 0.25);
      wearPx(c, o, g);
      return;
    }
    if (p === 'hood') { const g = top!; shadeInto(o, g.col, (c.kind === 'side' ? 0.9 : 0.7) * fabricK(c, 'fleece') * fold(0.2, 200, 0.5, c.x + c.y)); if (c.kind === 'top' && Math.abs(c.x) < P.chestTopX * 0.5) scaleO(o, 0.7); return; }
    if (p === 'collar') { const g = outer!; shadeInto(o, g.col, (c.kind === 'side' ? 0.95 : 0.7) * fabricK(c, g.kind === 'leather' ? 'leather' : g.kind === 'jacket' ? 'denim' : 'nylon')); if (c.rt < c.px * 1.2) over(o, INK, 0.3); return; }
    if (p === 'scarf') { const g = D.mask!; shadeInto(o, g.col, (c.kind === 'side' ? 0.92 : 0.7) * fabricK(c, 'knit') * fold(0.15, 300, 0.2, c.y + c.x)); if (Math.floor((c.y - P.neckBase) / 0.012) % 3 === 0) scaleO(o, 0.86); return; }
    if (p === 'backpack' || p === 'packPocket' || p === 'bedroll' || p === 'filterPack') {
      const col = p === 'filterPack' ? [44, 46, 44] : p === 'bedroll' ? [70, 84, 60] : D.back?.col ?? [70, 80, 90];
      shadeInto(o, col, fabricK(c, 'nylon') * (c.kind === 'top' ? 1.02 : c.kind === 'bot' ? 0.6 : 0.88 + 0.1 * (1 - c.e * c.e)));
      if (edge(1)) over(o, INK, 0.3);
      if (p === 'backpack' && back(c) && c.rt < 0.012 && c.rt > 0.006) shadeInto(o, SILVER, 0.8);
      if (p === 'bedroll' && c.kind === 'side' && Math.abs(c.e) > 0.55 && Math.abs(c.e) < 0.65) shadeInto(o, [40, 30, 24], 1);
      if (c.kind === 'side' && Math.abs(c.nx) > 0.5 && Math.abs(c.e) < 0.08) over(o, INK, 0.25);
      return;
    }
    if (p === 'watch') {
      const w = D.wrist!;
      shadeInto(o, w.col, 0.9 * fabricK(c, 'leather'));
      const out = c.nx * (Math.sign(c.x) || 1) > 0.5 || c.nz > 0.5;
      if (out && c.kind === 'side' && Math.abs(c.e) < 0.55 && c.rb > c.px && c.rt > c.px) { shadeInto(o, [150, 170, 120], 1); if (Math.abs(c.e) < 0.12) shadeInto(o, [40, 60, 40], 1); }
      if (edge(1)) over(o, INK, 0.4);
      return;
    }
    if (p === 'maskFace' || p === 'canister') {
      shadeInto(o, [40, 42, 40], fabricK(c, 'rubber') * (c.kind === 'side' ? 0.9 : 0.75));
      over(o, [255, 255, 255], 0.12 * G(c.e + 0.3, c.rb / Math.max(c.rh, 1e-4) - 0.6, 0.3, 0.3));
      if (p === 'canister' && (c.kind === 'top' || c.kind === 'bot')) { shadeInto(o, [90, 92, 90], 1); if (((c.i + c.j) % 3) === 0) scaleO(o, 0.6); }
      return;
    }
    if (p === 'visorFrame' || p === 'visorSide' || p === 'respirator' || p === 'cartridge' || p === 'hose') {
      const filt = p === 'cartridge' && (c.kind === 'top' || c.kind === 'bot');
      const col = filt ? [178, 170, 120] : p === 'hose' ? [34, 36, 34] : [28, 30, 30];
      shadeInto(o, col, fabricK(c, 'rubber') * (c.kind === 'side' ? 0.92 + 0.08 * (1 - c.e * c.e) : 0.8));
      over(o, [255, 255, 255], 0.14 * G(c.e + 0.3, c.rb / Math.max(c.rh, 1e-4) - 0.6, 0.3, 0.3));
      if (filt) { const r = Math.hypot(c.e, (c.rb / Math.max(c.rh, 1e-4)) * 2 - 1); if (((c.i + c.j) & 1) && r < 0.7) scaleO(o, 0.7); if (r > 0.82) shadeInto(o, [40, 40, 40], 0.9); }
      if (p === 'respirator' && front(c) && Math.abs(c.e) < 0.35 && c.rb / c.rh > 0.25 && c.rb / c.rh < 0.75 && ((c.i + (c.j >> 1)) % 2 === 0)) shadeInto(o, [12, 12, 12], 1);
      if (p === 'hose' && (Math.floor(c.y / 0.006) % 2)) scaleO(o, 0.75);
      if (edge(0.8) && p !== 'hose') over(o, INK, 0.3);
      return;
    }
    if (p === 'badge' || p === 'clip') {
      if (p === 'clip') { shadeInto(o, SILVER, 0.9 + 0.2 * h2(c.i, c.j, 2)); return; }
      shadeInto(o, [244, 244, 240], 0.98);
      if (c.kind === 'side' && c.nz > 0.5) {
        const v = c.rb / Math.max(c.rh, 1e-4), u = c.e;
        if (v > 0.78) shadeInto(o, D.badge?.col ?? [40, 90, 140], 0.95);                      // colour band with the Meridian mark
        else if (v > 0.38 && Math.abs(u + 0.45) < 0.38) shadeInto(o, v > 0.5 ? [196, 160, 140] : [60, 52, 50], 1); // photo
        else if (v > 0.42 && u > 0.05 && ((Math.floor(v * 14) % 2) === 0)) shadeInto(o, [60, 60, 64], 0.9);         // name lines
        else if (v < 0.24 && ((c.i % 2) === 0) && Math.abs(u) < 0.8) shadeInto(o, [20, 20, 20], 1);               // barcode
      }
      if (edge(0.8)) over(o, INK, 0.4);
      return;
    }
    shadeInto(o, [200, 0, 200], 1);
  }

  // ---------------------------------------------------------------- body marks and condition (second pass)
  const tattoos = app.tattoos || {}, scars = app.bodyScars || {};
  const bl = cond.blood || {}, band = cond.bandage || {}, splint = new Set(cond.splint || []);
  const wet = cond.wet ?? 0, dirt = cond.dirt ?? 0, corrupt = cond.corrupt ?? 0;
  /** angle round the torso / a limb (deg, 0 = front, +90 = left / outer) and the local radius */
  function spotAngle(c: Ctx, limb: boolean): [number, number] {
    if (!limb) return [Math.atan2(c.x, c.z) * 180 / Math.PI, Math.hypot(c.x, c.z)];
    const cx = c.bone.startsWith('uarm') || c.bone.startsWith('farm') ? Math.sign(c.x) * P.shX : Math.sign(c.x) * P.hipX, cz = c.bone.startsWith('uarm') || c.bone.startsWith('farm') ? P.armZ : 0;
    const dx = (c.x - cx) * (Math.sign(c.x) || 1), dz = c.z - cz;
    return [Math.atan2(dx, dz) * 180 / Math.PI, Math.hypot(dx, dz)];
  }
  function markAt(c: Ctx, reg: string, deg: number, y: number, art: string[], text: string, cell: number): number[] | null {
    const s = P.s;
    let yy: number, limb = false;
    if (reg === 'TORSO' || reg === 'NECK') { if (!(c.part in TORSO) && c.part !== 'neck') return null; yy = y * s; }
    else if (reg === 'ARM_L' || reg === 'ARM_R') {
      const want = reg === 'ARM_L' ? 1 : -1;
      if (!((c.part === 'uarm' || c.part === 'farm') && Math.sign(c.x) === want)) return null;
      limb = true; yy = P.shoulderY + y * s;
    } else return null;
    const [a, r] = spotAngle(c, limb);
    let da = a - deg; if (da > 180) da -= 360; if (da < -180) da += 360;
    const u = da * Math.PI / 180 * Math.max(0.03, r), v = c.y - yy;
    if (text) return textAt(c, text, u, v, cell * 0.8) ? [28, 30, 50] : null;
    const h = art.length, w = art[0]?.length ?? 0;
    const gx = Math.floor(u / cell + w / 2), gy = Math.floor(-v / cell + h / 2);
    if (gx < 0 || gy < 0 || gx >= w || gy >= h) return null;
    const ch = art[gy][gx];
    return ch === '#' ? [34, 40, 58] : ch === 'r' ? [150, 40, 40] : ch === 'g' ? [50, 100, 60] : ch === 'y' ? [190, 160, 50] : ch === 'o' ? [80, 86, 100] : null;
  }
  function overlay(c: Ctx, o: O4) {
    const skinNow = c.mat === 'skin' || c.mat === 'hand' || c.mat === 'body' && isSkin(o);
    // tattoos and scars (only where skin shows)
    if (skinNow && c.mat !== 'hand') {
      for (const [spot, design] of Object.entries(tattoos)) {
        const S = TATTOO_SPOTS[spot]; const T = TATTOOS[design]; if (!S || !T) continue;
        const col = markAt(c, S.reg, S.deg, S.y, T.art, TEXT_TATTOOS[design] || '', (S.big ? 0.016 : 0.011) * P.s);
        if (col) over(o, col, 0.78);
      }
      for (const [spot, kind] of Object.entries(scars)) {
        const S = SCAR_SPOTS[spot]; if (!S || S.reg === 'HEAD') continue;
        const art = SCAR_ART[kind] || SCAR_ART.slash;
        const col = markAt(c, S.reg, S.deg, S.y, art, '', 0.008 * P.s);
        if (col) over(o, col[0] < 60 ? [120, 60, 60] : mixc(skinC, [240, 200, 190], 0.5), 0.65);
      }
    }
    if (corrupt && skinNow) {
      const n = vnoise3(c.x * 40, c.y * 40, c.z * 40, 61);
      if (Math.abs(n - 0.5) < 0.025 * corrupt) over(o, [70, 20, 90], 0.55);
    }
    if (dirt) { const n = vnoise3(c.x * 20, c.y * 20, c.z * 20, 71); const low = 1 - clamp01(c.y / (H * 0.6)); if (n < 0.25 + dirt * 0.1 + low * 0.2) over(o, [76, 62, 44], 0.12 * dirt + low * 0.1); }
    if (wet) { scaleO(o, 1 - wet * 0.07); if (h2(c.i, c.j >> 2, 81) > 0.97 - wet * 0.01) over(o, [255, 255, 255], 0.2); }
    const part = partOf(c, P);
    // bandages: gauze wraps round the middle of the part
    const bd = band[part];
    if (bd && bandageHere(c, part)) {
      shadeInto(o, [236, 232, 220], 0.92 + 0.1 * h2(c.i >> 1, c.j, 91) - ((c.j % 3) === 0 ? 0.06 : 0));
      if (bd > 1.2) { const n = vnoise3(c.x * 60, c.y * 60, c.z * 60, 93); if (n < (bd - 1) * 0.6) over(o, n < 0.15 ? BLOOD_D : BLOOD, 0.65); }
      return;
    }
    if (splint.has(part) && (c.part === 'farm' || c.part === 'shin' || c.part === 'calf' || c.part === 'uarm' || c.part === 'thigh')) {
      const sx = Math.sign(c.x) || 1, side = Math.abs(c.nx) > 0.6 && Math.abs(c.e) < 0.4;
      if (side) { shadeInto(o, sx * c.nx > 0 ? [168, 130, 84] : [150, 116, 76], 0.95 + 0.1 * h2(c.i, c.j >> 2, 3)); if (Math.abs(c.e) > 0.32) over(o, INK, 0.3); }
      const mid = c.part === 'farm' ? (P.elbowY + P.wristY) / 2 : c.part === 'uarm' ? (P.shoulderY + P.elbowY) / 2 : c.part === 'thigh' ? (P.hipY + P.kneeY) / 2 : (P.kneeY + P.ankleY) / 2;
      for (const d of [-0.05, 0.05]) if (Math.abs(c.y - mid - d * H) < 0.006 * H) shadeInto(o, [60, 56, 52], 0.95);
    }
    const lv = bl[part];
    if (lv) {
      const n = vnoise3(c.x * 45, c.y * 45, c.z * 45, 97 + part.length);
      const m = vnoise3(c.x * 12, c.y * 12, c.z * 12, 101);
      const amt = lv / 3;
      if (n * 0.6 + m * 0.4 < amt * 0.62) over(o, n < amt * 0.3 ? BLOOD_D : BLOOD, 0.75 + 0.2 * amt);
      else if (h2(c.i, c.j, 103) < amt * 0.05) over(o, BLOOD, 0.7);
      // drips run down
      if (c.kind === 'side' && h2(c.i, 7, 105) < amt * 0.25 && n < amt * 0.9) over(o, BLOOD, 0.5);
    }
  }
  function isSkin(o: O4) {
    const d = Math.abs(o[0] / (skinC[0] + 1) - o[1] / (skinC[1] + 1)) + Math.abs(o[1] / (skinC[1] + 1) - o[2] / (skinC[2] + 1));
    return d < 0.08;
  }
  function bandageHere(c: Ctx, part: string) {
    const mids: Record<string, [number, number]> = {
      uarm: [(P.shoulderY + P.elbowY) / 2, 0.045], farm: [(P.elbowY + P.wristY) / 2 - 0.02 * H, 0.05], hand: [P.wristY - 0.03 * H, 0.03], thigh: [(P.hipY + P.kneeY) / 2, 0.06],
      shin: [(P.kneeY + P.ankleY) / 2 + 0.03 * H, 0.06], foot: [P.ankleY, 0.03], torso_u: [P.bustY - 0.03 * H, 0.04], torso_l: [P.waistY - 0.02 * H, 0.035], groin: [P.crotchY + 0.03 * H, 0.03],
      neck: [P.neckBase + 0.02 * H, 0.03], head: [P.browY + 0.1 * hu, 0.012],
    };
    const key = part.replace(/_[lr]$/, '');
    const m = mids[key]; if (!m) return false;
    if (key === 'head' && c.mat !== 'head' && c.mat !== 'hair') return false;
    return Math.abs(c.y - m[0] - Math.sin(around(c) * 40) * 0.004 * H) < m[1] * H * (key === 'head' ? 3 : 1);
  }

  return {
    body: bodyPx, skin: neckPx, hand: handPx, shoe: shoePx, head: headPx, ear: earPx, nose: nosePx, hair: hairShellPx, hat: hatPx, hat2: hat2Px, acc: accPx,
    overlay,
  } as Record<string, Painter> & { overlay: Painter };
}

const SCAR_ART: Record<string, string[]> = {
  slash: ['#.....', '.#....', '..#...', '...#..', '....#.', '.....#'],
  stitches: ['.#.#.#.', '#######', '.#.#.#.'],
  burn: ['.###.', '#####', '##.##', '.###.'],
  bullet: ['.#.', '###', '.#.'],
  surgery: ['#', '#', '#', '#', '#', '#', '#', '#'],
  bite: ['#.#.#', '.....', '#.#.#'],
  lashes: ['#....#', '.#..#.', '#....#', '.#..#.'],
};
const hexc = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
