// Garments: what each clothing look (LookPart.tex) does to the body silhouette
// (sleeves, hems, thickness, collars, coat tails, shoes, hats, masks) and how
// it is hand-painted onto a survivor's texture page. Every look texture used
// by items has a painter here; unknown looks fall back to the atlas texture.
import { makeRamp, mixHex, scaleHex, bayer, ph } from '../gfx/pixel';
import { atlas } from '../gfx/atlas';
import type { Outfit, LookPart } from './humanRig';
import type { Surf } from './humanPaint';

// ------------------------------------------------------------------ silhouette
export interface OutfitShape {
  top: boolean; topThick: number; topHem: number;
  outer: boolean; outerThick: number; outerHem: number;
  tails: number; tailsOpen: boolean;
  tuck: boolean; waist: number;
  sleeve: 'none' | 'cap' | 'short' | 'long'; armThick: number;
  collar: '' | 'crew' | 'shirt' | 'coat' | 'hood'; collarFrom: 'top' | 'outer';
  legKind: 'none' | 'pants' | 'shorts' | 'skirt' | 'brief'; legThick: number; legLen: number; legFlare: number; tuckPants: boolean;
  feet: 'bare' | 'sock' | 'sneaker' | 'boot' | 'dress' | 'slipper'; sole: number;
  gloves: boolean;
  hat: '' | 'cap' | 'beanie' | 'hardhat' | 'helmet' | 'flat';
  eyes: '' | 'glasses' | 'sunglasses' | 'goggles';
  face: '' | 'mask' | 'gasmask' | 'scarf';
  back: number; backKind: '' | 'pack' | 'hiking' | 'field';
  /** modelled details on the garment shells: pockets, zips, plackets, belts, tapes (see SHELLS) */
  feats?: ShellFeat[];
}

// ------------------------------------------------------------------ modelled shell details
/**
 * A detail that stands proud of a garment: a patch pocket (with a flap), a zip
 * or button placket, a belt or waistband, a strip of tape. Placed exactly
 * where the garment's painter draws it (angle in degrees, 0 = front, +90 =
 * the character's left / a limb's outer side; y = top edge in reference
 * metres; w / h in region pixels, as rectAt / pocket take them), so the paint
 * lands on the raised panel.
 */
export interface ShellFeat {
  part: 'torso' | 'arm' | 'leg';
  kind: 'patch' | 'zip' | 'band' | 'flap' | 'box';
  deg: number; y: number; w: number; h: number;
  /** zips and plackets: where they end (reference metres) */
  y1?: number;
  /** how far it stands off the cloth (m) */
  t?: number;
  /** the layer it belongs to: inner tops hide under a jacket, waistband details under an untucked hem */
  layer?: 'top' | 'outer' | 'legs';
}
type ShellFn = (lp: LookPart, sh: OutfitShape) => ShellFeat[];
const SHELLS: Record<string, ShellFn> = {};
/** register the modelled details of a look (content modules may add their own) */
export function defShell(tex: string, fn: ShellFn) { SHELLS[tex] = fn; }
const pk = (part: ShellFeat['part'], deg: number, y: number, w: number, h: number, flap = false, t = 0.0045): ShellFeat[] =>
  flap ? [{ part, kind: 'patch', deg, y, w, h, t }, { part, kind: 'flap', deg, y: y + 0.004, w: w + 1, h: Math.max(2, Math.round(h * 0.38)), t: t * 1.7 }] : [{ part, kind: 'patch', deg, y, w, h, t }];
const zip = (part: ShellFeat['part'], deg: number, y0: number, y1: number, w = 2, t = 0.003): ShellFeat => ({ part, kind: 'zip', deg, y: y0, y1, w, h: 0, t });
const band = (part: ShellFeat['part'], y: number, h: number, t = 0.005): ShellFeat => ({ part, kind: 'band', deg: 0, y, w: 0, h, t });
const box = (part: ShellFeat['part'], deg: number, y: number, w: number, h: number, t = 0.012): ShellFeat => ({ part, kind: 'box', deg, y, w, h, t });
const placket = (_sh: OutfitShape, hem: number) => zip('torso', 0, 1.45, hem, 2, 0.0025);
defShell('c_shirt_button', (_l, sh) => [placket(sh, sh.topHem), ...pk('torso', -32, 1.33, 5, 5)]);
defShell('c_pajama', (_l, sh) => [placket(sh, sh.topHem), ...pk('torso', -32, 1.33, 5, 5)]);
defShell('c_scrubs', () => pk('torso', -30, 1.33, 5, 5));
defShell('c_uniform', (l, sh) => (l.item || '').includes('janitor') || (sh.legKind === 'pants' && !sh.tuck)
  ? [zip('torso', 0, 1.46, 0.86), ...pk('torso', 34, 1.33, 6, 6, true), { part: 'torso', kind: 'patch', deg: -34, y: 1.33, w: 7, h: 3, t: 0.0015 }]
  : [placket(sh, sh.topHem), ...pk('torso', -34, 1.35, 6, 6, true), ...pk('torso', 34, 1.35, 6, 6, true), { part: 'arm', kind: 'patch', deg: 90, y: -0.04, w: 4, h: 4, t: 0.002 }, ...pk('leg', 80, -0.2, 6, 7, true)]);
defShell('c_hoodie', () => [{ part: 'torso', kind: 'patch', deg: 0, y: 1.13, w: 14, h: 10, t: 0.005 }]);
defShell('c_jacket', (_l, sh) => [...pk('torso', 34, 1.36, 7, 6, true), ...pk('torso', -34, 1.36, 7, 6, true), band('torso', sh.outerHem + 0.03, 3, 0.004)]);
defShell('c_jacket_leather', (_l, sh) => [zip('torso', -14, 1.44, sh.outerHem, 2, 0.003), { part: 'torso', kind: 'patch', deg: 40, y: 1.12, w: 6, h: 2, t: 0.003 }, { part: 'torso', kind: 'patch', deg: -40, y: 1.12, w: 6, h: 2, t: 0.003 }, band('torso', sh.outerHem + 0.024, 2, 0.004)]);
defShell('c_coat', (_l, sh) => [...pk('torso', 40, 1.02, 7, 3, true), ...pk('torso', -40, 1.02, 7, 3, true), zip('torso', 4, 1.46, sh.outerHem, 3, 0.003)]);
defShell('c_labcoat', () => [...pk('torso', -34, 1.32, 6, 6), ...pk('torso', 48, 1.05, 7, 6), ...pk('torso', -48, 1.05, 7, 6)]);
defShell('c_vest_hiviz', (_l, sh) => [band('torso', 1.2, 2, 0.002), band('torso', 1.08, 2, 0.002), band('torso', sh.outerHem + 0.012, 1, 0.003)]);
const beltFeats = (sh: OutfitShape, jeans: boolean): ShellFeat[] => [band('torso', sh.waist + 0.004, 3, 0.006), box('torso', 0, sh.waist + 0.006, 3, 3, 0.009),
  ...(jeans ? [...pk('torso', -148, 0.955, 6, 5, false, 0.003), ...pk('torso', 148, 0.955, 6, 5, false, 0.003)] : [])].map((f) => ({ ...f, layer: 'legs' as const }));
defShell('c_jeans', (_l, sh) => beltFeats(sh, true));
defShell('c_slacks', (_l, sh) => [...beltFeats(sh, false), ...pk('torso', -148, 0.955, 6, 5, false, 0.002).map((f) => ({ ...f, layer: 'legs' as const })), ...pk('torso', 148, 0.955, 6, 5, false, 0.002).map((f) => ({ ...f, layer: 'legs' as const }))]);
defShell('c_shorts', (l, sh) => [...beltFeats(sh, false), ...(ph(hashLp(l), 1, 1) < 0.5 ? pk('leg', 80, -0.06, 6, 5, true) : [])]);
defShell('c_sweatpants', (_l, sh) => [{ ...band('torso', sh.waist + 0.004, 3, 0.005), layer: 'legs' }]);
// the Remittance jumpsuit (painted in src/content/items/prisoner.ts): zip, number tape, breast pocket, seat pockets, the waist cinch, reflective arm stripes
defShell('c_jumpsuit', () => [zip('torso', 0, 1.47, 0.86, 2, 0.003), { part: 'torso', kind: 'patch', deg: -30, y: 1.36, w: 15, h: 7, t: 0.0018 }, ...pk('torso', 32, 1.3, 7, 6),
  ...pk('torso', -150, 0.93, 6, 5, false, 0.003), ...pk('torso', 150, 0.93, 6, 5, false, 0.003), band('torso', 0.966, 1, 0.003), { part: 'arm', kind: 'patch', deg: 90, y: -0.05, w: 9, h: 2, t: 0.0015 }]);
for (const t of ['c_jsuit_stripe', 'c_jsuit_hazard', 'c_jsuit_circuit']) SHELLS[t] = SHELLS.c_jumpsuit;
// the Custody Officer uniform: placket, flap pockets, the duty belt with its pouches, epaulettes, cargo pockets
defShell('c_guard', (_l, sh) => [placket(sh, sh.topHem), ...pk('torso', -34, 1.35, 7, 6, true), ...pk('torso', 34, 1.35, 7, 6, true),
  { part: 'torso', kind: 'patch', deg: 70, y: 1.475, w: 5, h: 2, t: 0.004 }, { part: 'torso', kind: 'patch', deg: -70, y: 1.475, w: 5, h: 2, t: 0.004 },
  { ...band('torso', sh.waist, 3, 0.008), layer: 'legs' }, ...[-60, 60, -120, 120].map((d) => ({ ...box('torso', d, sh.waist - 0.004, 4, 4, 0.016), layer: 'legs' as const })),
  { part: 'arm', kind: 'patch', deg: 90, y: -0.035, w: 5, h: 5, t: 0.002 }, ...pk('leg', 80, -0.2, 6, 7, true)]);
const hashLp = (l: LookPart) => { let h = 7; for (const c of l.tex + (l.item || '')) h = (h * 31 + c.charCodeAt(0)) | 0; return h; };

/** the modelled details of the outfit's visible layers (an inner top's details hide under a jacket) */
function shellFeats(o: Outfit, sh: OutfitShape): ShellFeat[] {
  const out: ShellFeat[] = [];
  const add = (lp: LookPart | undefined, layer: 'top' | 'outer' | 'legs') => {
    const fn = lp && SHELLS[lp.tex];
    if (!fn) return;
    for (const f of fn(lp!, sh)) {
      const L = f.layer ?? layer;
      if (f.part === 'torso' && L === 'top' && sh.outer) continue;
      if (f.part === 'arm' && L === 'top' && sh.outer && sh.sleeve !== 'none' && o.torsoOuter?.sleeve !== 'none') continue;
      // waistband details hide under an untucked top
      if (f.part === 'torso' && L === 'legs' && !sh.tuck && (sh.top || sh.outer) && f.y > Math.min(sh.topHem, sh.outerHem) - 0.004 && f.y < 1.2) continue;
      out.push({ ...f, layer: L });
    }
  };
  add(o.torso, 'top');
  add(o.torsoOuter, 'outer');
  if (o.legs && o.legs.tex !== o.torso?.tex) add(o.legs, 'legs');
  return out;
}

interface TopInfo { sleeve: OutfitShape['sleeve']; thick: number; hem: number; collar: OutfitShape['collar']; tuck?: boolean; tails?: number; open?: boolean }
const TOPS: Record<string, TopInfo> = {
  c_shirt: { sleeve: 'short', thick: 0.004, hem: 0.965, collar: 'crew' },
  c_shirt_stripe: { sleeve: 'short', thick: 0.004, hem: 0.965, collar: 'crew' },
  c_shirt_button: { sleeve: 'long', thick: 0.005, hem: 0.93, collar: 'shirt', tuck: true },
  c_sweater: { sleeve: 'long', thick: 0.01, hem: 0.95, collar: 'crew' },
  c_hoodie: { sleeve: 'long', thick: 0.012, hem: 0.945, collar: 'hood' },
  c_scrubs: { sleeve: 'short', thick: 0.005, hem: 0.95, collar: 'crew' },
  c_uniform: { sleeve: 'long', thick: 0.006, hem: 0.93, collar: 'shirt', tuck: true },
  c_pajama: { sleeve: 'long', thick: 0.007, hem: 0.95, collar: 'shirt' },
  c_underwear: { sleeve: 'none', thick: 0.002, hem: 0.985, collar: '' },
  c_jacket: { sleeve: 'long', thick: 0.013, hem: 0.975, collar: 'coat', open: true },
  c_jacket_leather: { sleeve: 'long', thick: 0.014, hem: 0.98, collar: 'coat', open: true },
  c_coat: { sleeve: 'long', thick: 0.02, hem: 0.88, collar: 'coat', tails: 0.6 },
  c_vest_hiviz: { sleeve: 'none', thick: 0.006, hem: 0.975, collar: '', open: true },
  c_labcoat: { sleeve: 'long', thick: 0.008, hem: 0.88, collar: 'coat', tails: 0.56, open: true },
};
const LEGS: Record<string, { kind: OutfitShape['legKind']; thick: number; flare: number; len?: number }> = {
  c_jeans: { kind: 'pants', thick: 0.007, flare: 0.004 },
  c_slacks: { kind: 'pants', thick: 0.006, flare: 0.008 },
  c_sweatpants: { kind: 'pants', thick: 0.009, flare: -0.006 },
  c_shorts: { kind: 'shorts', thick: 0.008, flare: 0 },
  c_skirt: { kind: 'skirt', thick: 0.004, flare: 0 },
  c_underwear: { kind: 'brief', thick: 0.003, flare: 0 },
  c_pajama: { kind: 'pants', thick: 0.008, flare: 0.006 },
  c_uniform: { kind: 'pants', thick: 0.008, flare: 0.006 },
  c_scrubs: { kind: 'pants', thick: 0.008, flare: 0.008 },
};

export function outfitShape(o: Outfit): OutfitShape {
  const sh: OutfitShape = {
    top: false, topThick: 0, topHem: 2, outer: false, outerThick: 0, outerHem: 2, tails: 0, tailsOpen: false, tuck: false, waist: 0.985,
    sleeve: 'none', armThick: 0, collar: '', collarFrom: 'top', legKind: 'none', legThick: 0, legLen: 0, legFlare: 0, tuckPants: false,
    feet: 'bare', sole: 0, gloves: false, hat: '', eyes: '', face: '', back: 0, backKind: '',
  };
  const order = { none: 0, cap: 1, short: 2, long: 3 } as const;
  if (o.torso) {
    const t = TOPS[o.torso.tex] || TOPS.c_shirt;
    sh.top = true; sh.topThick = t.thick; sh.topHem = t.hem; sh.collar = t.collar; sh.tuck = !!t.tuck;
    sh.sleeve = (o.torso.sleeve as OutfitShape['sleeve']) || t.sleeve; sh.armThick = t.thick;
    if (t.tails) { sh.tails = t.tails; }
  }
  if (o.torsoOuter) {
    const t = TOPS[o.torsoOuter.tex] || TOPS.c_jacket;
    sh.outer = true; sh.outerThick = t.thick; sh.outerHem = t.hem;
    const sl = (o.torsoOuter.sleeve as OutfitShape['sleeve']) || t.sleeve;
    if (order[sl] >= order[sh.sleeve]) sh.sleeve = sl;
    if (sl !== 'none') sh.armThick += t.thick; else sh.armThick = Math.max(sh.armThick, 0);
    if (t.collar) { sh.collar = t.collar; sh.collarFrom = 'outer'; }
    if (t.tails) { sh.tails = t.tails; sh.tailsOpen = !!t.open; }
  }
  if (!sh.top && !sh.outer) { sh.topHem = 2; }
  if (o.legs) {
    const l = LEGS[o.legs.tex] || (o.legsKind === 'shorts' ? LEGS.c_shorts : o.legsKind === 'skirt' ? LEGS.c_skirt : LEGS.c_jeans);
    sh.legKind = o.legsKind === 'skirt' ? 'skirt' : o.legsKind === 'shorts' ? 'shorts' : l.kind; sh.legThick = l.thick; sh.legFlare = l.flare; sh.legLen = l.len ?? 0;
  }
  if (sh.tuck && sh.legKind !== 'pants' && sh.legKind !== 'shorts') sh.tuck = false;
  if (o.feet) {
    const t = o.feet.tex, it = o.feet.item || '';
    sh.feet = it.includes('slipper') || (t === 'c_shoes_sneaker' && isPinkish(o.feet.color)) ? 'slipper' : t === 'c_shoes_boot' ? 'boot' : t === 'c_shoes_dress' ? 'dress' : t === 'c_shoes_sneaker' ? 'sneaker' : t.startsWith('c_shoes') ? 'sneaker' : 'sock';
  }
  sh.sole = sh.feet === 'sneaker' ? 0.024 : sh.feet === 'boot' ? 0.03 : sh.feet === 'dress' ? 0.016 : sh.feet === 'slipper' ? 0.016 : sh.feet === 'sock' ? 0.004 : 0.003;
  if (sh.feet === 'boot' && sh.legKind === 'pants') sh.tuckPants = false;
  sh.gloves = !!o.hands;
  if (o.head) sh.hat = (o.head.hat as OutfitShape['hat']) || 'cap';
  else if ((o as { hatFlat?: boolean }).hatFlat) sh.hat = 'flat'; // a cosmetic hat (cosmetics3d): hair pressed flat, no painted hat
  if (o.eyes) {
    const it = o.eyes.item || '';
    sh.eyes = it.includes('goggle') ? 'goggles' : it.includes('sun') ? 'sunglasses' : it ? 'glasses'
      : o.eyes.color === 0x4aa0d8 ? 'goggles' : lum(o.eyes.color) < 0.12 ? 'sunglasses' : 'glasses';
  }
  if (o.face) {
    const it = o.face.item || '';
    sh.face = it.includes('gas') ? 'gasmask' : it.includes('scarf') ? 'scarf' : it ? 'mask'
      : o.face.color === 0x3a3a3a ? 'gasmask' : o.face.color === 0xa83a3a ? 'scarf' : 'mask';
  }
  if (o.back) { sh.back = o.back.size ?? 1; const it = o.back.item || ''; sh.backKind = it.includes('hiking') ? 'hiking' : it === 'iron_cube' ? 'field' : 'pack'; }
  const feats = shellFeats(o, sh);
  if (feats.length) sh.feats = feats;
  return sh;
}
const lum = (c: number) => (((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11) / 255;
const isPinkish = (c: number) => ((c >> 16) & 255) > 180 && ((c >> 8) & 255) < 190 && (c & 255) > 140;

// ------------------------------------------------------------------ painting context
export interface Paint { lp: LookPart; color: number; R: number[]; /** finer ramp for large fills (same range as R) */ F?: number[]; outer: boolean; sh: OutfitShape; seed: number }
type Fn = (S: Surf, P: Paint) => void;
export interface Garment { torso?: Fn; pelvis?: Fn; arm?: Fn; leg?: Fn; foot?: Fn; hand?: Fn; skirt?: Fn; collar?: Fn; hood?: Fn; hat?: Fn; mask?: Fn; pack?: Fn }

type Weave = 'cotton' | 'knit' | 'denim' | 'leather' | 'nylon' | 'wool' | 'canvas' | 'rubber' | 'fleece' | 'jersey';
function weave(S: Surf, k: Weave, x: number, y: number): number {
  switch (k) {
    case 'knit': return (x % 2 === 0 ? 0.32 : -0.22) + ((y + (x >> 1)) % 2 ? 0.12 : -0.12) + (S.fbm(x, y, 3, 2, 3) - 0.5) * 0.5;
    case 'denim': return ((x + y) % 3 === 0 ? 0.28 : 0) + (S.fbm(x, y, 3, 2, 4) - 0.5) * 0.8 + (ph(x, y >> 1, 4) - 0.5) * 0.15;
    case 'leather': return (S.fbm(x, y, 5, 2, 5) - 0.5) * 1.5 + (ph(x, y, 5) < 0.03 ? 1.2 : 0);
    case 'nylon': return Math.sin((x + y * 0.3) * 0.7) * 0.18 + (S.fbm(x, y, 2, 2, 6) - 0.5) * 0.6;
    case 'wool': return (S.fbm(x, y, 6, 2, 7) - 0.5) * 0.9 + (ph(x, y, 7) - 0.5) * 0.4;
    case 'canvas': return ((x + y) % 2 ? 0.15 : -0.1) + (S.fbm(x, y, 3, 2, 8) - 0.5) * 0.7;
    case 'rubber': return (S.fbm(x, y, 2, 2, 9) - 0.5) * 0.3;
    case 'fleece': return (ph(x >> 1, y >> 1, 10) - 0.5) * 0.7 + (ph(x, y, 11) - 0.5) * 0.3;
    case 'jersey': return (S.fbm(x, y, 3, 2, 12) - 0.5) * 0.5;
    default: return (S.fbm(x, y, 3, 2, 13) - 0.5) * 0.55 + (ph(x >> 1, y >> 1, 13) - 0.5) * 0.12;
  }
}
const BASE = 3.6;
/** fill a vertical span (reference metres, top..bottom) with a fabric */
function cloth(S: Surf, P: Paint, k: Weave, top: number, bot: number, mask?: (x: number, y: number) => boolean, base = BASE) {
  const F = P.F || P.R, f = (F.length - 1) / (P.R.length - 1);
  S.fill(F, (x, y) => (base + weave(S, k, x, y)) * f, S.Y(top), S.Y(bot) + 0.5, mask);
}
/** darker line + highlight above: hems, cuffs, waistbands */
function hem(S: Surf, P: Paint, y: number, w = 1) {
  const r = Math.round(S.Y(y) - 0.5);
  for (let x = 0; x < S.w; x++) { for (let i = 0; i < w; i++) S.pc.set(x, r - i, P.R[2]); S.pc.blend(x, r - w, P.R[6], 0.5); }
}
function ribbed(S: Surf, P: Paint, top: number, bot: number) {
  for (let y = Math.round(S.Y(top)); y <= Math.round(S.Y(bot) - 0.5); y++) for (let x = 0; x < S.w; x++) S.pc.set(x, y, P.R[x % 2 ? 3 : 4]);
}
function vline(S: Surf, deg: number, top: number, bot: number, c: number, t = 1) {
  const x = Math.round(S.X(deg) - 0.5);
  for (let y = Math.round(S.Y(top)); y <= Math.round(S.Y(bot) - 0.5); y++) S.pc.blend(x, y, c, t);
}
function stitch(S: Surf, deg: number, top: number, bot: number, c: number) {
  const x = Math.round(S.X(deg) - 0.5);
  for (let y = Math.round(S.Y(top)); y <= Math.round(S.Y(bot) - 0.5); y++) if (y % 2 === 0) S.pc.set(x, y, c);
}
function rectAt(S: Surf, deg: number, y: number, w: number, h: number, c: number, t = 1) {
  const x0 = Math.round(S.X(deg) - w / 2), y0 = Math.round(S.Y(y));
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) S.pc.blend(x0 + i, y0 + j, c, t);
}
function pocket(S: Surf, P: Paint, deg: number, y: number, w: number, h: number, flap = false) {
  const x0 = Math.round(S.X(deg) - w / 2), y0 = Math.round(S.Y(y));
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const edge = i === 0 || i === w - 1 || j === h - 1;
    if (edge) S.pc.set(x0 + i, y0 + j, P.R[2]);
    else if (j === 0) S.pc.set(x0 + i, y0 + j, P.R[flap ? 5 : 2]);
  }
  if (flap) for (let i = 0; i < w; i++) { S.pc.set(x0 + i, y0 + 1, P.R[5]); S.pc.set(x0 + i, y0 + 2, P.R[2]); }
}
function button(S: Surf, x: number, y: number, c = 0xe8e4d8) { S.pc.set(Math.round(x), Math.round(y), c); S.pc.blend(Math.round(x), Math.round(y) + 1, 0x101010, 0.35); }
function wrinkles(S: Surf, P: Paint, degs: number[], y0: number, y1: number, n: number, seed: number) {
  for (let i = 0; i < n; i++) {
    const d = degs[0] + (degs[1] - degs[0]) * ph(i, seed, 1);
    const yy = y0 + (y1 - y0) * ph(i, seed, 2);
    const x = Math.round(S.X(d)), y = Math.round(S.Y(yy)), L = 2 + Math.floor(ph(i, seed, 3) * 3);
    const dir = ph(i, seed, 4) < 0.5 ? 1 : -1;
    for (let t = 0; t < L; t++) { S.pc.blend(x + t, y + (t >> 1) * dir, P.R[2], 0.35); S.pc.blend(x + t, y + (t >> 1) * dir - 1, P.R[5], 0.25); }
  }
}
/** wear: frayed holes and scuffs at low condition */
function wear(S: Surf, P: Paint, top: number, bot: number) {
  const w = P.lp.wear ?? 0;
  if (w < 0.45) return;
  const n = Math.round((w - 0.4) * 6);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(ph(i, P.seed, 21) * S.w), y = Math.round(S.Y(top) + ph(i, P.seed, 22) * (S.Y(bot) - S.Y(top)));
    S.pc.set(x, y, P.R[0]); S.pc.blend(x + 1, y, P.R[1], 0.5); S.pc.blend(x, y - 1, P.R[6], 0.5);
    if (w > 0.7) { S.pc.set(x + 1, y, P.R[0]); S.pc.blend(x, y + 1, P.R[1], 0.4); }
  }
}

// tiny 3x5 pixel font for prints and patches (original text only)
const FONT: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
  G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101',
  S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111', '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
  '4': '101101111001001', '5': '111100110001110', '6': '011100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001110', ' ': '000000000000000', '-': '000000111000000',
};
export function text(S: Surf, s: string, cx: number, y: number, c: number) {
  const w = s.length * 4 - 1;
  let x = Math.round(cx - w / 2);
  for (const ch of s.toUpperCase()) {
    const g = FONT[ch] || FONT[' '];
    for (let i = 0; i < 15; i++) if (g[i] === '1') S.pc.set(x + (i % 3), Math.round(y) + Math.floor(i / 3), c);
    x += 4;
  }
}

// neckline: top of the covered area by angle (deg) -> y
type Neck = 'crew' | 'v' | 'scoop' | 'collar' | 'open' | 'tank' | 'high';
function neckTop(kind: Neck, deg: number): number {
  const a = Math.abs(deg) * Math.PI / 180, front = Math.max(0, Math.cos(a));
  switch (kind) {
    case 'v': return 1.49 - front ** 4 * 0.11 - front * 0.01;
    case 'scoop': return 1.49 - front ** 2 * 0.07;
    case 'tank': return 1.49 - front ** 2 * 0.08 - (Math.abs(Math.sin(a)) > 0.75 ? 0.1 : 0);
    case 'open': return 1.49 - (Math.abs(deg) < 14 ? 0.5 : front ** 6 * 0.07);
    case 'high': return 1.5;
    case 'collar': return 1.49 - front ** 6 * 0.035;
    default: return 1.49 - front ** 3 * 0.03;
  }
}
const covered = (S: Surf, kind: Neck, hemY: number) => (x: number, y: number) => { const yy = S.yAt(y); return yy <= neckTop(kind, S.deg(x)) && yy >= hemY; };

/** the standard top: fabric + neckline + hem + side seams + folds; returns its mask */
function topBase(S: Surf, P: Paint, k: Weave, neck: Neck, hemY = P.outer ? P.sh.outerHem : P.sh.topHem) {
  const m = covered(S, neck, hemY);
  cloth(S, P, k, 1.5, hemY, m);
  // neckline trim
  for (let x = 0; x < S.w; x++) {
    const t = neckTop(neck, S.deg(x));
    if (t > 1.0) { const r = Math.round(S.Y(t)); S.pc.set(x, r, P.R[2]); S.pc.blend(x, r + 1, P.R[5], 0.5); }
  }
  hem(S, P, hemY + 0.006);
  // side seams + shoulder seams
  for (const d of [90, -90]) vline(S, d, 1.36, hemY, P.R[2], 0.5);
  wrinkles(S, P, [50, 120], hemY + 0.02, 1.12, 4, P.seed);
  wrinkles(S, P, [-120, -50], hemY + 0.02, 1.12, 4, P.seed + 1);
  wrinkles(S, P, [20, 60], 1.25, 1.36, 2, P.seed + 2);
  wrinkles(S, P, [-60, -20], 1.25, 1.36, 2, P.seed + 3);
  wear(S, P, 1.4, hemY);
  return m;
}
/** sleeve on an arm region down to the shape's sleeve end */
function sleeveBase(S: Surf, P: Paint, k: Weave, sleeve: string, cuff: 'hem' | 'rib' | 'button' = 'hem') {
  if (sleeve === 'none') return;
  const end = sleeve === 'long' ? -0.515 : sleeve === 'short' ? -0.15 : -0.03;
  cloth(S, P, k, 0.075, end);
  if (cuff === 'rib' && sleeve === 'long') ribbed(S, P, end + 0.035, end);
  else hem(S, P, end + 0.006, cuff === 'button' ? 2 : 1);
  if (cuff === 'button' && sleeve === 'long') button(S, S.X(-150), S.Y(end + 0.02));
  // seam along the underside, folds at the inner elbow and wrist
  vline(S, -90, 0.0, end, P.R[2], 0.45);
  if (sleeve === 'long') { wrinkles(S, P, [-80, 40], -0.27, -0.33, 4, P.seed + 7); wrinkles(S, P, [-120, 120], end + 0.05, end + 0.015, 3, P.seed + 8); }
  else wrinkles(S, P, [-60, 60], end + 0.06, end + 0.02, 2, P.seed + 9);
  wear(S, P, 0.0, end);
}

// prints for plain tees (original designs)
function teePrint(S: Surf, P: Paint) {
  const which = Math.floor(ph(P.seed, 3, 7) * 7);
  const cx = S.X(0), cy = S.Y(1.31);
  const ink = lum(P.color) > 0.55 ? mixHex(P.R[1], 0x203048, 0.5) : mixHex(P.R[7], 0xf0e8d0, 0.6);
  const acc = [0xd8603a, 0x3a8ac8, 0xe8c040, 0x58a858][Math.floor(ph(P.seed, 4, 7) * 4)];
  switch (which) {
    case 0: { // sun over waves
      S.pc.ditherBlob(cx, cy - 1, 2.6, 2.6, acc, 1);
      for (let i = -4; i <= 4; i++) { S.pc.set(Math.round(cx + i), Math.round(cy + 3 + (i % 2 ? 0 : 1)), ink); }
      break;
    }
    case 1: { // mountain
      for (let i = 0; i < 5; i++) for (let j = -i; j <= i; j++) S.pc.set(Math.round(cx + j), Math.round(cy - 2 + i), i < 2 ? 0xf0f0f0 : ink);
      break;
    }
    case 2: text(S, 'LVL0', cx, cy - 2, ink); break;
    case 3: { // band across the chest
      for (let x = Math.round(S.X(-70)); x <= S.X(70); x++) { S.pc.set(x, Math.round(cy), acc); S.pc.set(x, Math.round(cy) + 1, ink); }
      break;
    }
    case 4: { // smiley
      S.pc.ditherBlob(cx, cy, 3, 3, acc, 1);
      S.pc.set(Math.round(cx - 1), Math.round(cy - 1), ink); S.pc.set(Math.round(cx + 1), Math.round(cy - 1), ink);
      S.pc.set(Math.round(cx - 1), Math.round(cy + 1), ink); S.pc.set(Math.round(cx), Math.round(cy + 2), ink); S.pc.set(Math.round(cx + 1), Math.round(cy + 1), ink);
      break;
    }
    case 5: text(S, 'FUN RUN', cx, cy - 2, ink); break;
    default: break; // plain
  }
}

// ------------------------------------------------------------------ registry
const G: Record<string, Garment> = {};
export function garment(tex: string): Garment | undefined { return G[tex]; }

// ---- tees
G.c_shirt = {
  torso: (S, P) => { topBase(S, P, 'jersey', 'crew'); teePrint(S, P); },
  arm: (S, P) => sleeveBase(S, P, 'jersey', P.sh.sleeve === 'long' && !P.outer ? 'long' : P.lp.sleeve || 'short'),
  foot: (S, P) => sockFoot(S, P),
  leg: (S, P) => sockLeg(S, P),
  collar: (S, P) => collarPaint(S, P, 'jersey'),
};
G.c_shirt_stripe = {
  torso: (S, P) => {
    const m = topBase(S, P, 'jersey', 'crew');
    const light = mixHex(P.color, 0xf2eee4, 0.82);
    for (let y = 0; y < S.h; y++) if (Math.floor(S.yAt(y) * 60) % 3 === 0) for (let x = 0; x < S.w; x++) if (m(x, y)) S.pc.set(x, y, mixHex(light, S.pc.get(x, y), 0.25));
  },
  arm: (S, P) => {
    sleeveBase(S, P, 'jersey', P.lp.sleeve || 'short');
    const end = (P.lp.sleeve || 'short') === 'long' ? -0.515 : -0.15;
    const light = mixHex(P.color, 0xf2eee4, 0.82);
    for (let y = Math.round(S.Y(0.07)); y < S.Y(end) - 1; y++) if (Math.floor(S.yAt(y) * 60) % 3 === 0) for (let x = 0; x < S.w; x++) S.pc.set(x, y, mixHex(light, S.pc.get(x, y), 0.25));
  },
};
// ---- button shirt / uniform / pajama
function buttonFront(S: Surf, P: Paint, top: number, bot: number, bc = 0xece8dc, step = 0.06) {
  const x = Math.round(S.X(0) - 0.5);
  for (let y = Math.round(S.Y(top)); y <= S.Y(bot); y++) { S.pc.blend(x - 1, y, P.R[2], 0.6); S.pc.blend(x + 1, y, P.R[5], 0.4); }
  for (let yy = top - 0.03; yy > bot; yy -= step) button(S, x, S.Y(yy), bc);
}
G.c_shirt_button = {
  torso: (S, P) => {
    topBase(S, P, 'cotton', 'collar');
    buttonFront(S, P, 1.45, P.sh.topHem);
    pocket(S, P, -32, 1.33, 5, 5);
    for (let x = 0; x < S.w; x++) if (Math.abs(S.deg(x) - 180) < 60 || Math.abs(S.deg(x) + 180) < 60) S.pc.blend(x, Math.round(S.Y(1.4)), P.R[2], 0.4); // yoke seam
  },
  arm: (S, P) => sleeveBase(S, P, 'cotton', P.lp.sleeve || 'long', 'button'),
  collar: (S, P) => collarPaint(S, P, 'cotton'),
};
G.c_uniform = {
  torso: (S, P) => {
    topBase(S, P, 'canvas', 'collar');
    const suit = (P.lp.item || '').includes('janitor') || P.sh.legKind === 'pants' && !P.sh.tuck;
    if (suit) {
      // coveralls: zip front + name patch
      const x = Math.round(S.X(0) - 0.5);
      for (let y = Math.round(S.Y(1.46)); y < S.Y(0.86); y++) { S.pc.set(x, y, y % 2 ? 0xa8acb0 : 0x6a6e74); }
      rectAt(S, -34, 1.33, 7, 3, 0xf2f2ee); for (let i = 0; i < 5; i++) S.pc.set(Math.round(S.X(-34) - 2 + i), Math.round(S.Y(1.33)) + 1, 0x3a5a8a);
      pocket(S, P, 34, 1.33, 6, 6, true);
    } else {
      buttonFront(S, P, 1.45, P.sh.topHem, 0xc8b060);
      pocket(S, P, -34, 1.35, 6, 6, true); pocket(S, P, 34, 1.35, 6, 6, true);
      // tin badge + shoulder patch
      const bx = Math.round(S.X(-34)), by = Math.round(S.Y(1.4));
      S.pc.set(bx, by, 0xe8c860); S.pc.set(bx - 1, by + 1, 0xd8b050); S.pc.set(bx + 1, by + 1, 0xd8b050); S.pc.set(bx, by + 2, 0xb89040);
      text(S, 'SECURITY', S.X(180), S.Y(1.4), mixHex(P.R[6], 0xe8e8e0, 0.6));
    }
  },
  arm: (S, P) => {
    sleeveBase(S, P, 'canvas', P.lp.sleeve || 'long', 'button');
    rectAt(S, 90, -0.04, 4, 4, mixHex(P.R[5], 0xd8b050, 0.4)); // shoulder patch
  },
  leg: (S, P) => pantsLeg(S, P, 'canvas', { cargo: true }),
  collar: (S, P) => collarPaint(S, P, 'canvas'),
};
G.c_pajama = {
  torso: (S, P) => {
    const m = topBase(S, P, 'cotton', 'collar');
    dotPattern(S, P, m);
    buttonFront(S, P, 1.45, P.sh.topHem, 0xf2f2f0, 0.07);
    pocket(S, P, -32, 1.33, 5, 5);
  },
  arm: (S, P) => { sleeveBase(S, P, 'cotton', P.lp.sleeve || 'long'); dotPattern(S, P, (x, y) => S.yAt(y) > -0.5); piping(S, P, -0.505); },
  leg: (S, P) => { pantsLeg(S, P, 'cotton', {}); dotPattern(S, P, (x, y) => S.yAt(y) > -0.84); },
  collar: (S, P) => { collarPaint(S, P, 'cotton'); for (let x = 0; x < S.w; x++) S.pc.set(x, 0, 0xf2f2ee); },
};
function dotPattern(S: Surf, P: Paint, m: (x: number, y: number) => boolean) {
  const c = mixHex(P.color, 0xffffff, 0.6);
  for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) if ((x + (y >> 2) * 2) % 4 === 0 && y % 4 === 0 && m(x, y)) S.pc.set(x, y, c);
}
function piping(S: Surf, P: Paint, y: number) { const r = Math.round(S.Y(y)); for (let x = 0; x < S.w; x++) S.pc.set(x, r, mixHex(P.color, 0xffffff, 0.75)); }

// ---- knitwear
G.c_sweater = {
  torso: (S, P) => {
    const m = topBase(S, P, 'knit', 'crew');
    ribbed(S, P, P.sh.topHem + 0.045, P.sh.topHem);
    for (let x = 0; x < S.w; x++) { const r = Math.round(S.Y(neckTop('crew', S.deg(x)))); for (let i = 0; i < 2; i++) S.pc.set(x, r + i, P.R[x % 2 ? 3 : 4]); }
    // patterned chest band on some sweaters
    if (ph(P.seed, 5, 5) < 0.5) {
      const y0 = Math.round(S.Y(1.33));
      const acc = mixHex(P.color, 0xf0ece0, 0.7);
      for (let x = 0; x < S.w; x++) { if (m(x, y0)) { S.pc.set(x, y0, acc); S.pc.set(x, y0 + 4, acc); if ((x % 4) === 1) { S.pc.set(x, y0 + 2, acc); S.pc.set(x - 1, y0 + 1, acc); S.pc.set(x + 1, y0 + 3, acc); } } }
    }
  },
  arm: (S, P) => sleeveBase(S, P, 'knit', P.lp.sleeve || 'long', 'rib'),
};
G.c_hoodie = {
  torso: (S, P) => {
    topBase(S, P, 'fleece', 'crew');
    ribbed(S, P, P.sh.topHem + 0.04, P.sh.topHem);
    // kangaroo pouch
    const y0 = 1.13, y1 = 1.0;
    for (let y = Math.round(S.Y(y0)); y <= S.Y(y1); y++) {
      const t = (S.yAt(y) - y1) / (y0 - y1);
      const half = 34 - t * 8;
      for (const k of [-1, 1]) { const x = Math.round(S.X(k * half) - 0.5); S.pc.set(x, y, P.R[2]); S.pc.blend(x - k, y, P.R[5], 0.4); }
    }
    for (let x = Math.round(S.X(-26)); x <= S.X(26); x++) { S.pc.set(x, Math.round(S.Y(y0)), P.R[2]); S.pc.blend(x, Math.round(S.Y(y0)) + 1, P.R[5], 0.5); }
    // drawstrings
    for (const d of [-6, 6]) for (let i = 0; i < 5; i++) S.pc.set(Math.round(S.X(d) - 0.5), Math.round(S.Y(1.45)) + i, 0xe8e4d8);
    if (ph(P.seed, 2, 2) < 0.5) text(S, 'LIMBO', S.X(0), S.Y(1.33), mixHex(P.R[7], 0xffffff, 0.5));
  },
  arm: (S, P) => sleeveBase(S, P, 'fleece', P.lp.sleeve || 'long', 'rib'),
  hood: (S, P) => {
    S.fill(P.R, (x, y) => BASE - 0.3 + weave(S, 'fleece', x, y) - (y / S.h) * 0.6);
    for (let x = 0; x < S.w; x++) { S.pc.set(x, 0, P.R[2]); S.pc.set(x, 1, P.R[5]); }
  },
};
G.c_scrubs = {
  torso: (S, P) => { topBase(S, P, 'cotton', 'v'); pocket(S, P, -30, 1.33, 5, 5); S.pc.set(Math.round(S.X(-31)), Math.round(S.Y(1.35)), 0x2a3aa8); },
  arm: (S, P) => sleeveBase(S, P, 'cotton', P.lp.sleeve || 'short'),
  pelvis: (S, P) => pantsTorso(S, P, 'cotton', { drawstring: true }),
  leg: (S, P) => pantsLeg(S, P, 'cotton', { drawstring: true }),
};
G.c_underwear = {
  torso: (S, P) => {
    const m = covered(S, 'tank', P.sh.topHem);
    cloth(S, P, 'knit', 1.5, P.sh.topHem, m, BASE + 0.4);
    hem(S, P, P.sh.topHem + 0.006);
  },
  pelvis: (S, P) => {
    cloth(S, P, 'knit', 0.99, 0.8, undefined, BASE + 0.3);
    for (let x = 0; x < S.w; x++) { S.pc.set(x, Math.round(S.Y(0.99)), P.R[2]); S.pc.set(x, Math.round(S.Y(0.985)), P.R[5]); }
  },
  leg: (S, P) => { cloth(S, P, 'knit', 0.06, 0.0, undefined, BASE + 0.3); hem(S, P, 0.006); },
};

// ---- outerwear
function openFront(S: Surf, P: Paint, inner: number) {
  // the open front shows the layer underneath as a strip down the middle
  void inner;
  for (const k of [-1, 1]) vline(S, k * 11, 1.46, P.sh.outerHem, P.R[2], 0.55);
}
G.c_jacket = {
  torso: (S, P) => {
    const m = topBase(S, P, 'denim', 'open');
    openFront(S, P, 0);
    for (const k of [-1, 1]) {
      pocket(S, P, k * 34, 1.36, 7, 6, true);
      button(S, S.X(k * 34), S.Y(1.345), 0xb07838);
      stitch(S, k * 16, 1.44, P.sh.outerHem, 0xc8803a);
    }
    ribbed(S, P, P.sh.outerHem + 0.03, P.sh.outerHem);
    for (let yy = 1.42; yy > P.sh.outerHem + 0.04; yy -= 0.07) button(S, S.X(-12), S.Y(yy), 0xb07838);
    void m;
  },
  arm: (S, P) => { sleeveBase(S, P, 'denim', P.lp.sleeve || 'long', 'button'); stitch(S, 150, 0.05, -0.5, 0xc8803a); },
  collar: (S, P) => collarPaint(S, P, 'denim'),
};
G.c_jacket_leather = {
  torso: (S, P) => {
    topBase(S, P, 'leather', 'open');
    openFront(S, P, 0);
    // asymmetric zip + quilted shoulders + belt tabs
    for (let y = Math.round(S.Y(1.44)); y < S.Y(P.sh.outerHem); y++) S.pc.set(Math.round(S.X(-14)), y, y % 2 ? 0xc8ccd0 : 0x8a8e94);
    for (const k of [-1, 1]) { pocket(S, P, k * 40, 1.12, 6, 2); for (let i = 0; i < 4; i++) S.pc.blend(Math.round(S.X(k * (60 + i * 8))), Math.round(S.Y(1.42)), P.R[6], 0.6); }
    for (let x = 0; x < S.w; x++) if (ph(x, 3, P.seed) < 0.3) S.pc.blend(x, Math.round(S.Y(1.3)), P.R[6], 0.4);
    hem(S, P, P.sh.outerHem + 0.012, 2);
  },
  arm: (S, P) => { sleeveBase(S, P, 'leather', P.lp.sleeve || 'long'); for (let y = Math.round(S.Y(-0.43)); y < S.Y(-0.5); y++) S.pc.set(Math.round(S.X(-120)), y, 0xb8bcc0); },
  collar: (S, P) => collarPaint(S, P, 'leather'),
};
G.c_coat = {
  torso: (S, P) => {
    topBase(S, P, P.color === 0xf0c419 || lum(P.color) > 0.6 ? 'nylon' : 'wool', 'high');
    // double-breasted buttons + belt line
    for (let yy = 1.38; yy > P.sh.outerHem + 0.04; yy -= 0.09) for (const d of [-14, 14]) button(S, S.X(d), S.Y(yy), 0x2a2420);
    vline(S, 4, 1.46, P.sh.outerHem, P.R[2], 0.8);
    for (const k of [-1, 1]) pocket(S, P, k * 40, 1.02, 7, 3, true);
  },
  arm: (S, P) => sleeveBase(S, P, 'wool', P.lp.sleeve || 'long', 'button'),
  skirt: (S, P) => {
    cloth(S, P, P.color === 0xf0c419 ? 'nylon' : 'wool', 1.02, 0.5);
    vline(S, 4, 1.02, 0.5, P.R[2], 0.8);
    for (const k of [-1, 1]) pocket(S, P, k * 40, 0.86, 7, 3, true);
    hem(S, P, 0.5 + 0.012, 1);
    for (let yy = 0.9; yy > 0.6; yy -= 0.09) for (const d of [-14, 14]) button(S, S.X(d), S.Y(yy), 0x2a2420);
  },
  collar: (S, P) => collarPaint(S, P, 'wool'),
};
G.c_labcoat = {
  torso: (S, P) => {
    topBase(S, P, 'cotton', 'open');
    openFront(S, P, 0);
    // lapels
    for (const k of [-1, 1]) for (let i = 0; i < 9; i++) S.pc.set(Math.round(S.X(k * (12 + i * 1.6))), Math.round(S.Y(1.45)) + i, P.R[2]);
    pocket(S, P, -34, 1.32, 6, 6);
    S.pc.set(Math.round(S.X(-36)), Math.round(S.Y(1.33)), 0x2a5aa8); S.pc.set(Math.round(S.X(-36)), Math.round(S.Y(1.33)) - 1, 0x1a3a7a); // pen
    rectAt(S, 34, 1.36, 5, 3, 0xd8dce0); S.pc.set(Math.round(S.X(34)), Math.round(S.Y(1.36)) + 1, 0x3a4a6a); // badge
    for (const k of [-1, 1]) pocket(S, P, k * 48, 1.05, 7, 6);
  },
  arm: (S, P) => sleeveBase(S, P, 'cotton', P.lp.sleeve || 'long'),
  skirt: (S, P) => {
    cloth(S, P, 'cotton', 1.02, 0.5);
    for (const k of [-1, 1]) { vline(S, k * 9, 1.02, 0.5, P.R[1], 0.9); pocket(S, P, k * 48, 0.94, 7, 6); }
    vline(S, 180, 0.9, 0.62, P.R[2], 0.6); // back vent
    hem(S, P, 0.5 + 0.012);
  },
  collar: (S, P) => collarPaint(S, P, 'cotton'),
};
G.c_vest_hiviz = {
  torso: (S, P) => {
    const m = (x: number, y: number) => { const yy = S.yAt(y), d = Math.abs(S.deg(x)); return yy >= P.sh.outerHem && yy <= neckTop('v', S.deg(x)) && !(d > 62 && d < 118 && yy > 1.3) && d > 8; };
    cloth(S, P, 'nylon', 1.5, P.sh.outerHem, m, BASE + 0.6);
    const refl = (x: number, y: number) => { if (m(x, y)) S.pc.set(x, y, (x + y) % 5 === 0 ? 0xf8f8f8 : 0xc8ccd0); };
    for (const yy of [1.2, 1.08]) for (let y = Math.round(S.Y(yy)); y < S.Y(yy) + 2; y++) for (let x = 0; x < S.w; x++) refl(x, y);
    for (const d of [-30, 30, -150, 150]) for (let y = Math.round(S.Y(1.46)); y < S.Y(1.2); y++) for (let i = 0; i < 2; i++) refl(Math.round(S.X(d)) + i, y);
    text(S, 'SAFETY', S.X(180), S.Y(1.33), mixHex(P.R[1], 0x202020, 0.4));
    hem(S, P, P.sh.outerHem + 0.006);
  },
};

// ---- trousers
interface PantsOpt { cargo?: boolean; drawstring?: boolean; crease?: boolean; jeans?: boolean; shorts?: boolean; elastic?: boolean }
function pantsTorso(S: Surf, P: Paint, k: Weave, o: PantsOpt) {
  const w = P.sh.waist;
  cloth(S, P, k, w, 0.8);
  // waistband + belt or drawstring
  const r0 = Math.round(S.Y(w));
  for (let x = 0; x < S.w; x++) { S.pc.set(x, r0, P.R[5]); S.pc.set(x, r0 + 1, P.R[3]); S.pc.set(x, r0 + 2, P.R[2]); }
  if (o.drawstring || o.elastic) {
    for (let x = 0; x < S.w; x++) S.pc.set(x, r0 + 1, P.R[x % 2 ? 3 : 4]);
    if (o.drawstring) for (const d of [-4, 4]) for (let i = 0; i < 4; i++) S.pc.set(Math.round(S.X(d)), r0 + 2 + i, 0xe8e4d8);
  } else {
    const belt = o.jeans ? 0x4a3020 : 0x1e1a18;
    for (let x = 0; x < S.w; x++) { S.pc.set(x, r0 + 1, belt); S.pc.blend(x, r0 + 1, 0xffffff, ph(x, 1, 3) < 0.1 ? 0.2 : 0); }
    const bx = Math.round(S.X(0) - 1.5);
    for (let i = 0; i < 3; i++) { S.pc.set(bx + i, r0, 0xc8c8c0); S.pc.set(bx + i, r0 + 2, 0xa8a8a0); } S.pc.set(bx, r0 + 1, 0xc8c8c0); S.pc.set(bx + 2, r0 + 1, 0xc8c8c0);
    for (const d of [-60, 60, -150, 150]) { S.pc.set(Math.round(S.X(d)), r0, P.R[2]); S.pc.set(Math.round(S.X(d)), r0 + 2, P.R[2]); } // belt loops
    // fly
    for (let y = r0 + 3; y < S.Y(0.875); y++) S.pc.blend(Math.round(S.X(4)), y, P.R[2], 0.75);
  }
  // front pockets (curved openings), back pockets, crotch folds
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) S.pc.set(Math.round(S.X(s * (38 + i * 2.5))), r0 + 3 + i, P.R[2]);
    if (!o.drawstring) {
      const bx = s * 148;
      for (let i = 0; i < 6; i++) { S.pc.set(Math.round(S.X(bx - 2.5 + i)), Math.round(S.Y(0.955)), P.R[2]); }
      for (let j = 0; j < 5; j++) { S.pc.set(Math.round(S.X(bx - 2.5)), Math.round(S.Y(0.955)) + j, P.R[2]); S.pc.set(Math.round(S.X(bx + 3)), Math.round(S.Y(0.955)) + j, P.R[2]); }
      if (o.jeans) stitch(S, bx, 0.955, 0.9, 0xc8803a);
    }
  }
  if (o.jeans) for (let i = 0; i < 4; i++) { const y = Math.round(S.Y(0.875)) - i; S.pc.blend(Math.round(S.X(-12 - i * 4)), y, P.R[6], 0.6); S.pc.blend(Math.round(S.X(12 + i * 4)), y, P.R[6], 0.6); } // whiskers
  wear(S, P, w, 0.82);
}
function pantsLeg(S: Surf, P: Paint, k: Weave, o: PantsOpt) {
  const hemY = P.sh.legKind === 'shorts' ? -0.2 : -0.835;
  cloth(S, P, k, 0.06, hemY);
  // outer + inner seams, knee wear, creases behind the knee, cuffs
  vline(S, 90, 0.06, hemY, P.R[2], 0.6);
  vline(S, -90, -0.02, hemY, P.R[2], 0.4);
  if (o.jeans) { stitch(S, 96, 0.0, hemY, mixHex(P.R[3], 0xc8803a, 0.45)); for (let y = Math.round(S.Y(-0.38)); y < S.Y(-0.5); y++) for (let x = Math.round(S.X(-25)); x < S.X(25); x++) if (ph(x, y, 9) < 0.45) S.pc.blend(x, y, P.R[6], 0.45); }
  if (o.crease) vline(S, 0, -0.02, hemY, P.R[6], 0.5);
  if (o.cargo) pocket(S, P, 80, P.sh.legKind === 'shorts' ? -0.06 : -0.2, 6, P.sh.legKind === 'shorts' ? 5 : 7, true);
  if (hemY < -0.5) {
    wrinkles(S, P, [140, 220], -0.4, -0.5, 4, P.seed + 3);
    wrinkles(S, P, [-40, 40], -0.74, -0.82, 3, P.seed + 4);
    if (o.elastic) ribbed(S, P, hemY + 0.035, hemY);
    else hem(S, P, hemY + 0.008, 1);
  } else hem(S, P, hemY + 0.006);
  wrinkles(S, P, [-80, 0], -0.0, -0.08, 3, P.seed + 5);
  wear(S, P, -0.05, hemY);
}
G.c_jeans = { pelvis: (S, P) => pantsTorso(S, P, 'denim', { jeans: true }), leg: (S, P) => pantsLeg(S, P, 'denim', { jeans: true }) };
G.c_slacks = { pelvis: (S, P) => pantsTorso(S, P, 'wool', {}), leg: (S, P) => pantsLeg(S, P, 'wool', { crease: true }) };
G.c_sweatpants = { pelvis: (S, P) => pantsTorso(S, P, 'fleece', { drawstring: true }), leg: (S, P) => { pantsLeg(S, P, 'fleece', { elastic: true }); vline(S, 90, 0.04, -0.8, mixHex(P.color, 0xffffff, 0.5), 0.8); } };
G.c_shorts = { pelvis: (S, P) => pantsTorso(S, P, 'canvas', {}), leg: (S, P) => pantsLeg(S, P, 'canvas', { shorts: true, cargo: ph(P.seed, 1, 1) < 0.5 }) };
G.c_skirt = {
  pelvis: (S, P) => {
    cloth(S, P, 'cotton', P.sh.waist, 0.8);
    for (let x = 0; x < S.w; x++) { S.pc.set(x, Math.round(S.Y(P.sh.waist)), P.R[5]); S.pc.set(x, Math.round(S.Y(P.sh.waist)) + 1, P.R[2]); }
  },
  skirt: (S, P) => {
    cloth(S, P, 'cotton', 1.02, 0.5);
    for (let x = 0; x < S.w; x += 4) for (let y = Math.round(S.Y(0.97)); y < S.h; y++) { S.pc.blend(x, y, P.R[2], 0.55); S.pc.blend(x + 1, y, P.R[6], 0.35); }
    hem(S, P, 0.66 + 0.012);
  },
};
G.c_pajama.pelvis = (S, P) => pantsTorso(S, P, 'cotton', { elastic: true });
G.c_uniform.pelvis = (S, P) => {
  if (!(P.lp.item || '').includes('janitor')) { pantsTorso(S, P, 'canvas', {}); return; }
  // coveralls: one piece down to the crotch, zip continues
  cloth(S, P, 'canvas', 1.0, 0.8);
  const x = Math.round(S.X(0) - 0.5);
  for (let y = Math.round(S.Y(1.0)); y < S.Y(0.87); y++) S.pc.set(x, y, y % 2 ? 0xa8acb0 : 0x6a6e74);
  for (const d of [-150, 150]) pocket(S, P, d, 0.95, 6, 5);
};

// ---- socks (feet: c_shirt), shoes
function sockFoot(S: Surf, P: Paint) {
  S.fill(P.R, (x, y) => BASE + 0.4 + weave(S, 'knit', x, y) - (Math.abs(S.deg(x)) > 100 ? 0.8 : 0));
  // reinforced heel + toe
  for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) if (y > S.h * 0.86 || y < S.h * 0.36) S.pc.blend(x, y, P.R[2], 0.35);
}
function sockLeg(S: Surf, P: Paint) {
  cloth(S, P, 'knit', -0.72, -0.87, undefined, BASE + 0.4);
  ribbed(S, P, -0.72, -0.75);
  for (let x = 0; x < S.w; x++) { S.pc.set(x, Math.round(S.Y(-0.735)), 0xc8302a); S.pc.set(x, Math.round(S.Y(-0.75)), 0x2a5aa8); }
}
/** shoe painting: u 0.25..0.75 = upper (0.5 top), outside = sole; v: heel (bottom rows) .. toe (row ~0.28h); top rows = boot shaft */
function shoe(S: Surf, P: Paint, kind: 'sneaker' | 'boot' | 'dress' | 'slipper') {
  const up = P.R, isSn = kind === 'sneaker', isBoot = kind === 'boot';
  const soleR = isSn ? makeRamp(0xece8de, 5, { spread: 0.4 }) : isBoot ? makeRamp(0x2a2622, 5, { spread: 0.5 }) : kind === 'slipper' ? makeRamp(mixHex(P.color, 0xffffff, 0.5), 5) : makeRamp(0x1e1a18, 5, { spread: 0.4 });
  const shoeRow0 = S.h * (1 - 0.72), shoeRow1 = S.h * (1 - 0.0);
  for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
    const deg = S.deg(x), a = Math.abs(deg);
    const v = 1 - (y + 0.5) / S.h;            // 0 heel .. 0.72 toe
    if (y < shoeRow0 - 1) {
      // shaft (boots)
      const lace = Math.abs(deg) < 14;
      S.put(x, y, up, BASE + weave(S, 'leather', x, y) - (a > 120 ? 0.6 : 0) + (lace ? -1.2 : 0));
      if (lace && y % 3 === 0) S.pc.set(x, y, 0xb8a888);
      if (y === 0) S.pc.set(x, y, up[2]);
      continue;
    }
    void shoeRow1;
    if (a > 90) {
      // sole: side band then bottom
      const side = a < 118;
      S.put(x, y, soleR, side ? 3 - (a - 90) / 14 : 1 + (ph(x, y, 3) < 0.2 ? 1 : 0));
      if (isBoot && !side && (y + (x >> 1)) % 3 === 0) S.pc.set(x, y, soleR[0]); // lugs
      continue;
    }
    let val = BASE + weave(S, kind === 'dress' ? 'rubber' : kind === 'slipper' ? 'fleece' : isBoot ? 'leather' : 'canvas', x, y) + Math.cos((deg * Math.PI) / 180) * 0.6 - 0.3;
    if (kind === 'dress') val += Math.exp(-((v - 0.62) ** 2) / 0.003) * Math.exp(-(deg * deg) / 300) * 2.2; // toe shine
    S.put(x, y, up, val);
    // sneaker: white toe box + side stripe + heel tab
    if (isSn) {
      if (v > 0.58) S.put(x, y, soleR, 3.4 + (ph(x, y, 5) - 0.5) * 0.6);
      if (a > 50 && a < 82 && Math.abs(v - 0.2 - (a - 50) / 300) < 0.04) S.pc.set(x, y, mixHex(up[6], 0x3a6ac8, 0.6));
      if (v < 0.08 && a < 30) S.pc.set(x, y, 0xc8302a);
    }
    if (kind === 'boot' && Math.abs(a - 88) < 3) S.pc.set(x, y, 0xc8a050); // welt stitching
    if (kind === 'dress' && v < 0.1 && a < 70) S.pc.set(x, y, up[1]);
  }
  // laces / vamp opening on top (u ~0.5, from instep forward)
  if (kind !== 'slipper') {
    const l0 = isBoot ? 0.2 : 0.22, l1 = kind === 'dress' ? 0.4 : 0.5;
    for (let v = l0; v < l1; v += 1 / S.h) {
      const y = Math.round((1 - v) * S.h - 0.5);
      for (let d = -14; d <= 14; d += 360 / S.w) S.pc.set(Math.round(S.X(d) - 0.5), y, Math.abs(d) < 8 ? (y % 2 ? (isSn ? 0xf4f2ec : 0x2a2420) : up[1]) : up[2]);
    }
    for (let d = -26; d <= 26; d += 360 / S.w) S.pc.set(Math.round(S.X(d) - 0.5), Math.round((1 - 0.06) * S.h), up[1]); // collar rim
  } else {
    for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) if (Math.abs(S.deg(x)) < 90 && ph(x, y, 8) < 0.18) S.pc.set(x, y, mixHex(up[6], 0xffffff, 0.5)); // fuzz
  }
}
G.c_shoes_sneaker = { foot: (S, P) => shoe(S, P, P.sh.feet === 'slipper' ? 'slipper' : 'sneaker'), leg: (S, P) => { if (P.sh.feet !== 'slipper') sockLegShort(S, P); } };
G.c_shoes_boot = { foot: (S, P) => shoe(S, P, 'boot') };
G.c_shoes_dress = { foot: (S, P) => shoe(S, P, 'dress'), leg: (S, P) => sockLegShort(S, P, 0x22201e) };
function sockLegShort(S: Surf, P: Paint, c = 0xeeeae2) {
  void P;
  const R = makeRamp(c, 5, { spread: 0.4 });
  for (let y = Math.round(S.Y(-0.78)); y < S.h; y++) for (let x = 0; x < S.w; x++) S.pc.set(x, y, R[2 + (x % 2)]);
}

// ---- gloves
G.c_gloves = {
  hand: (S, P) => {
    const rubber = lum(P.color) > 0.6 && P.color !== 0xc8a050;
    S.fill(P.R, (x, y) => {
      const palm = S.deg(x) < -20 && S.deg(x) > -160;
      return BASE + (rubber ? weave(S, 'rubber', x, y) + Math.max(0, Math.sin((x + y) * 0.6)) * 0.6 : weave(S, palm ? 'leather' : 'canvas', x, y)) - (palm && !rubber ? 0.9 : 0) - (y > S.h * 0.55 ? 0 : 0.2);
    });
    if (!rubber) for (let x = 0; x < S.w; x++) { S.pc.set(x, Math.round(S.h * 0.5), P.R[2]); }
  },
  arm: (S, P) => {
    const rubber = lum(P.color) > 0.6 && P.color !== 0xc8a050;
    const top = rubber ? -0.42 : -0.485;
    cloth(S, P, rubber ? 'rubber' : 'knit', top, -0.54, undefined, BASE + 0.2);
    hem(S, P, top - 0.004, 1);
  },
};

// ---- hats (HAT region: dome rows v .3..1, brim/cuff rows v 0..0.3)
G.c_hat_cap = {
  hat: (S, P) => {
    S.fill(P.R, (x, y) => BASE + weave(S, 'canvas', x, y) + (y < S.h * 0.7 ? 0.3 : -1.0) - (y < S.h * 0.15 ? 0.4 : 0));
    for (const d of [-120, -60, 0, 60, 120, 180]) for (let y = 0; y < S.h * 0.7; y++) S.pc.blend(Math.round(S.X(d)), y, P.R[2], 0.6);
    const lx = S.X(0), ly = S.h * 0.42;
    S.pc.ditherBlob(lx, ly, 2.4, 1.8, mixHex(P.color, 0xffffff, 0.75), 1);
    S.pc.set(Math.round(lx), Math.round(ly), P.R[2]);
    for (let x = 0; x < S.w; x++) S.pc.set(x, Math.round(S.h * 0.69), P.R[2]);
  },
};
G.c_beanie = {
  hat: (S, P) => {
    S.fill(P.R, (x, y) => BASE + weave(S, 'knit', x, y) + (x % 2 ? 0.25 : -0.25) - (y > S.h * 0.72 ? 0.5 : 0));
    for (let x = 0; x < S.w; x++) S.pc.set(x, Math.round(S.h * 0.72), P.R[2]);
    for (let y = 0; y < 3; y++) for (let x = 0; x < S.w; x++) if ((x + y) % 3 === 0) S.pc.blend(x, y, P.R[2], 0.5);
  },
};
G.c_hardhat = {
  hat: (S, P) => {
    const helmet = P.sh.hat === 'helmet';
    S.fill(P.R, (x, y) => BASE + 0.5 + weave(S, 'rubber', x, y) + Math.exp(-((S.deg(x) + 30) ** 2) / 600) * Math.exp(-((y - S.h * 0.3) ** 2) / 20) * 2 - (y > S.h * 0.75 ? 0.8 : 0));
    if (helmet) {
      for (const d of [-60, -20, 20, 60, 160, -160]) for (let y = Math.round(S.h * 0.15); y < S.h * 0.5; y++) S.pc.set(Math.round(S.X(d)), y, 0x1a1a1e);
      for (let x = 0; x < S.w; x++) S.pc.set(x, Math.round(S.h * 0.58), 0xe8e8e8);
    } else {
      rectAt(S, 0, 0.4, 5, 3, 0xf0f0f0); S.pc.set(Math.round(S.X(0)), Math.round(S.h * 0.62), 0x3a8a3a);
      for (let x = 0; x < S.w; x++) S.pc.set(x, Math.round(S.h * 0.76), P.R[2]);
    }
  },
};

// ---- masks / scarves (MASK region)
G.c_mask = {
  mask: (S, P) => {
    const it = P.lp.item || '';
    const kind = it.includes('gas') || P.sh.face === 'gasmask' ? 'gas' : it.includes('scarf') || P.sh.face === 'scarf' ? 'scarf' : 'mask';
    if (kind === 'scarf') {
      S.fill(P.R, (x, y) => BASE + weave(S, 'knit', x, y));
      for (let x = 0; x < S.w; x += 6) for (let y = 0; y < S.h; y++) { S.pc.blend(x, y, P.R[1], 0.6); S.pc.blend(x + 1, y, mixHex(P.color, 0xf0e8d8, 0.6), 0.6); }
      for (let x = 0; x < S.w; x++) if (x % 2) S.pc.set(x, S.h - 1, P.R[6]);
    } else if (kind === 'gas') {
      const RR = makeRamp(0x3a3a3c, 6, { spread: 0.5 });
      S.fill(RR, (x, y) => 2.4 + weave(S, 'rubber', x, y) + (y < S.h * 0.5 ? 0.3 : 0));
      for (const u of [0.4, 0.6]) {
        const cx = u * S.w, cy = (1 - 0.84) * S.h;
        for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) { const d = Math.hypot(x - cx, (y - cy) * 1.2); if (d < 2.6) S.pc.set(x, y, d < 1.8 ? (x < cx && y < cy ? 0x8aa0a8 : 0x2a3a40) : 0x6a6a64); }
      }
      for (let x = Math.round(S.w * 0.42); x < S.w * 0.58; x++) for (let y = Math.round(S.h * 0.45); y < S.h * 0.75; y++) if ((x + y) % 2) S.pc.set(x, y, 0x1a1a1c);
    } else {
      S.fill(P.R, (x, y) => BASE + 0.8 + weave(S, 'cotton', x, y) * 0.5);
      for (const v of [0.3, 0.55, 0.78]) for (let x = 2; x < S.w - 2; x++) { const y = Math.round((1 - v) * S.h); S.pc.set(x, y, P.R[3]); S.pc.blend(x, y - 1, P.R[6], 0.6); }
      for (let x = 0; x < S.w; x++) { S.pc.set(x, 0, mixHex(P.color, 0xffffff, 0.5)); S.pc.set(x, S.h - 1, mixHex(P.color, 0xffffff, 0.5)); }
    }
  },
};
G.c_glasses = {};

// ---- backpacks (PACK region: body v .3..1, pocket [0..0.55]x[0..0.28], straps [0.6..1]x[0..0.28])
G.c_backpack = {
  pack: (S, P) => {
    const body0 = S.h * 0.72;
    S.fill(P.R, (x, y) => BASE + weave(S, 'nylon', x, y) - (y > body0 - 3 && y < body0 ? 0.6 : 0) + (Math.abs(S.deg(x)) < 40 ? -0.5 : 0), 0, body0);
    // zip around the top + seams + logo patch on the back face
    for (let x = 0; x < S.w; x++) { S.pc.set(x, Math.round(body0 * 0.18), x % 2 ? 0xa8acb0 : 0x4a4e54); S.pc.set(x, Math.round(body0 * 0.18) + 1, P.R[2]); }
    for (const d of [-90, 90]) for (let y = 0; y < body0; y++) S.pc.blend(Math.round(S.X(d)), y, P.R[2], 0.6);
    rectAt(S, 180, 1, 5, 4, 0xe8e4d8); rectAt(S, 180, 1, 3, 2, P.R[2]);
    void P;
    // pocket
    const PR = makeRamp(scaleHex(P.color, 0.88), 8, { spread: 0.6 });
    for (let y = Math.round(body0); y < S.h; y++) for (let x = 0; x < S.w * 0.55; x++) S.put(x, y, PR, BASE + weave(S, 'nylon', x, y) - (y === Math.round(body0) ? 1.5 : 0));
    for (let x = 0; x < S.w * 0.55; x++) S.pc.set(x, Math.round(body0) + 2, x % 2 ? 0xa8acb0 : 0x4a4e54);
    // straps (webbing)
    for (let y = Math.round(body0); y < S.h; y++) for (let x = Math.round(S.w * 0.6); x < S.w; x++) S.pc.set(x, y, (x + y) % 3 === 0 ? 0x2a2a2e : 0x36363c);
  },
};
G.c_bag = G.c_backpack;

// ---- collars / hoods
function collarPaint(S: Surf, P: Paint, k: Weave) {
  S.fill(P.R, (x, y) => BASE + 0.3 + weave(S, k, x, y) - (y > S.h * 0.7 ? 0.8 : 0));
  for (let x = 0; x < S.w; x++) { S.pc.set(x, 0, P.R[2]); S.pc.blend(x, 1, P.R[6], 0.6); }
}

/** fallback: tile the atlas texture of an unknown look, tinted by its colour */
export function paintFallback(S: Surf, P: Paint, fn: string) {
  const A = atlas();
  if (!A.has(P.lp.tex)) return;
  const r = A.get(P.lp.tex);
  const data = A.data, size = A.size;
  const span: Record<string, [number, number]> = { torso: [1.5, P.outer ? P.sh.outerHem : P.sh.topHem], arm: [0.075, P.sh.sleeve === 'long' ? -0.515 : P.sh.sleeve === 'short' ? -0.15 : 0.07], leg: [0.06, P.sh.legKind === 'shorts' ? -0.2 : -0.835] };
  const sp = span[fn];
  const c = P.color;
  const tr = ((c >> 16) & 255) / 255, tg = ((c >> 8) & 255) / 255, tb = (c & 255) / 255;
  for (let y = 0; y < S.h; y++) {
    if (sp) { const yy = S.yAt(y); if (yy > sp[0] || yy < sp[1]) continue; }
    for (let x = 0; x < S.w; x++) {
      const i = ((r.y + (y % r.h)) * size + r.x + (x % r.w)) * 4;
      S.pc.setRGBA(x, y, data[i] * tr, data[i + 1] * tg, data[i + 2] * tb);
    }
  }
}
void bayer;

// ------------------------------------------------------------------ intake inspection (the jumpsuit top off)
/** nothing on top: tattoos and scars on the chest and back show */
G.c_bare = {};
TOPS.c_bare = { sleeve: 'none', thick: 0, hem: 1.6, collar: '' };
/** a plain band around the chest */
G.c_bandeau = {
  torso: (S, P) => {
    cloth(S, P, 'knit', 1.3, 1.17, undefined, BASE + 0.3);
    for (let x = 0; x < S.w; x++) { S.pc.set(x, Math.round(S.Y(1.3)), P.R[2]); S.pc.set(x, Math.round(S.Y(1.17)), P.R[2]); }
  },
};
TOPS.c_bandeau = { sleeve: 'none', thick: 0.003, hem: 1.17, collar: '' };

// ------------------------------------------------------------------ garments from content modules
/** register a look tex's painter (and silhouette) from a content module (src/content/items/prisoner.ts) */
export function defGarment(tex: string, g: Garment, shape: { top?: TopInfo; leg?: { kind: OutfitShape['legKind']; thick: number; flare: number; len?: number } } = {}) {
  G[tex] = g;
  if (shape.top) TOPS[tex] = shape.top;
  if (shape.leg) LEGS[tex] = shape.leg;
}
/** painting helpers for defGarment painters */
export const garmentKit = { topBase, sleeveBase, pantsTorso, pantsLeg, collarPaint, cloth, hem, pocket, rectAt, vline, stitch, wrinkles, text, BASE };
