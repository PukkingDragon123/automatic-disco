// Appearance + Outfit (+ condition) -> the spec the low-poly people builders read: proportions, skin, hair,
// face features (the creator's options), and every worn garment resolved to a painter kind.
import type { Appearance, Outfit, LookPart, RigCondition } from '../humanRig';
import type { Dims } from '../humanModel';
import { shapeOf, eyeShapeOf, browsOf, noseOf, mouthOf, suitNumber } from '../humanLooks';
import { COSMETIC } from '../../game/cosmetics';
import { hex, hairColour, mixc, h2 } from './lib';
import type { GGSpec, Garm, Dress, FaceSpec } from './types';

export const HAZMAT_YELLOW = 0xe8c228;

const TOP: Record<string, string> = {
  c_shirt: 'tee', c_shirt_party: 'tee', c_shirt_stripe: 'stripe', c_shirt_button: 'shirt', c_sweater: 'knit', c_hoodie: 'hoodie', c_scrubs: 'scrubs', c_uniform: 'uniform',
  c_guard: 'guard', c_pajama: 'pajama', c_underwear: 'under', c_jumpsuit: 'jumpsuit', c_jsuit_stripe: 'jumpsuit', c_jsuit_hazard: 'jumpsuit', c_jsuit_circuit: 'jumpsuit',
  c_hazmat: 'hazmat', c_bandeau: 'bandeau', c_bare: 'bare', c_blouse: 'blouse',
};
const OUTER: Record<string, string> = { c_jacket: 'jacket', c_jacket_leather: 'leather', c_coat: 'coat', c_labcoat: 'labcoat', c_vest_hiviz: 'vest' };
const LEGS: Record<string, string> = {
  c_jeans: 'jeans', c_slacks: 'slacks', c_sweatpants: 'sweats', c_shorts: 'shorts', c_skirt: 'skirt', c_underwear: 'brief', c_pajama: 'pajama', c_uniform: 'uniform',
  c_scrubs: 'scrubs', c_jumpsuit: 'jumpsuit', c_jsuit_stripe: 'jumpsuit', c_jsuit_hazard: 'jumpsuit', c_jsuit_circuit: 'jumpsuit', c_guard: 'guard', c_hazmat: 'hazmat',
};
const SLEEVE: Record<string, Garm['sleeve']> = { tee: 'short', stripe: 'short', scrubs: 'short', under: 'none', bandeau: 'none', bare: 'none', vest: 'none' };

function garm(lp: LookPart, kind: string): Garm {
  return { kind, tex: lp.tex, item: lp.item || '', col: hex(lp.color ?? 0x888888), blood: lp.blood ?? 0, wear: lp.wear ?? 0, lp, sleeve: (lp.sleeve as Garm['sleeve']) || SLEEVE[kind] || 'long' };
}
const lum = (c: number) => (((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11) / 255;

/** resolve the outfit's looks into painter garments */
export function dressOf(o: Outfit, app: Appearance, seed: number): Dress {
  const D: Dress = { legsKind: 'none', sleeve: 'none', tuck: false, hatFlat: !!(o as { hatFlat?: boolean }).hatFlat, suit: '' };
  if (o.torso) {
    let k = TOP[o.torso.tex] ?? 'tee';
    if (k === 'uniform' && ((o.torso.item || '').includes('janitor') || o.legs?.tex === 'c_uniform' && o.legs.item === o.torso.item)) k = 'coverall';
    D.top = garm(o.torso, k);
  }
  if (o.torsoOuter) { const k = OUTER[o.torsoOuter.tex] ?? 'jacket'; D.outer = garm(o.torsoOuter, k); if (k === 'vest') D.outer.sleeve = 'none'; }
  if (o.legs) {
    let k = LEGS[o.legs.tex] ?? (o.legsKind === 'shorts' ? 'shorts' : o.legsKind === 'skirt' ? 'skirt' : 'slacks');
    if (k === 'uniform' && D.top?.kind === 'coverall') k = 'coverall';
    D.bottom = garm(o.legs, k);
    D.legsKind = k === 'skirt' || o.legsKind === 'skirt' ? 'skirt' : k === 'shorts' || o.legsKind === 'shorts' ? 'shorts' : k === 'brief' ? 'brief' : 'pants';
  }
  const tk = D.top?.kind;
  if (tk === 'hazmat') D.suit = 'hazmat';
  else if (tk === 'jumpsuit') D.suit = 'jumpsuit';
  else if (tk === 'coverall') D.suit = 'coverall';
  else if (tk === 'guard') D.suit = 'guard';
  D.tuck = tk === 'shirt' || tk === 'uniform' || tk === 'guard' || tk === 'blouse' ? D.legsKind === 'pants' || D.legsKind === 'shorts' || D.legsKind === 'skirt' : false;
  const order = { none: 0, cap: 1, short: 2, long: 3 } as const;
  const sl = (g?: Garm) => (g ? g.sleeve ?? 'none' : 'none');
  D.sleeve = order[sl(D.outer)] >= order[sl(D.top)] ? sl(D.outer) : sl(D.top);
  if (o.feet) {
    const t = o.feet.tex, it = o.feet.item || '';
    const pink = ((o.feet.color >> 16) & 255) > 180 && ((o.feet.color >> 8) & 255) < 190 && (o.feet.color & 255) > 140;
    const k = t === 'c_hazmat' ? 'hazmat' : it.includes('slipper') || (t === 'c_shoes_sneaker' && pink) ? 'slipper' : t === 'c_shoes_boot' ? 'boot' : t === 'c_shoes_dress' ? 'dress' : t.startsWith('c_shoes') ? 'sneaker' : 'sock';
    D.feet = garm(o.feet, k);
  }
  if (o.hands) { const it = o.hands.item || ''; D.hands = garm(o.hands, o.hands.tex === 'c_hazmat' ? 'hazmat' : it.includes('rubber') ? 'rubber' : 'work'); }
  if (o.head) { const hk = o.head.tex === 'c_riot_helmet' ? 'riot' : o.head.hat || 'cap'; D.hat = garm(o.head, hk); }
  if (o.eyes) { const it = o.eyes.item || ''; D.eyes = garm(o.eyes, it.includes('goggle') || (!it && o.eyes.color === 0x4aa0d8) ? 'goggles' : it.includes('sun') || (!it && lum(o.eyes.color) < 0.12) ? 'sun' : 'glasses'); }
  if (o.face) { const it = o.face.item || ''; D.mask = garm(o.face, it.includes('gas') || (!it && o.face.color === 0x3a3a3a) ? 'gasmask' : it.includes('scarf') || (!it && o.face.color === 0xa83a3a) ? 'scarf' : 'mask'); }
  if (o.back) { const it = o.back.item || ''; D.back = { ...garm(o.back, it.includes('hiking') ? 'hiking' : 'pack'), size: o.back.size ?? 1 }; }
  if (o.wrist) D.wrist = garm(o.wrist, 'watch');
  if (D.suit === 'hazmat') {
    // the suit brings its own gloves, boots and hood: nothing else shows on the head
    D.hat = undefined; D.eyes = undefined; if (D.mask?.kind !== 'scarf') D.mask = undefined;
    const suit = app.suit || {};
    let col = D.top!.col, pattern = '';
    for (const k of app.cos || []) {
      const def = COSMETIC.get(k);
      if (def?.slot !== 'suit' || k === 'suit_std') continue;
      col = mixc(hex(def.color), col, 0.15);
      pattern = k === 'suit_stripe' ? 'stripe' : k === 'suit_hazard' ? 'hazard' : k === 'suit_circuit' ? 'circuit' : '';
    }
    D.hazmat = { col, num: suitNumber(seed), pattern, wear: Math.max(suit.wear ?? 0, Math.round((D.top!.wear || 0) * 3)), stains: suit.stains || 'none', patch: suit.patch || 'stitched' };
    if (!D.hands) D.hands = { kind: 'hazmat', tex: 'c_hazmat', item: 'hazmat_suit', col: [34, 36, 34], blood: 0, wear: 0 };
    if (!D.feet || D.feet.kind !== 'hazmat') D.feet = { kind: 'hazmat', tex: 'c_hazmat', item: 'hazmat_suit', col: [30, 32, 30], blood: 0, wear: 0 };
    D.hands.col = [34, 36, 34];
  }
  if (D.suit === 'jumpsuit') D.hazmat = { col: D.top!.col, num: suitNumber(seed), pattern: '', wear: app.suit?.wear ?? 0, stains: app.suit?.stains || 'none', patch: app.suit?.patch || 'stitched' };
  return D;
}

export interface SpecOverrides { bust?: number; makeup?: FaceSpec['makeup']; lipstick?: number; glasses?: FaceSpec['glasses']; hairStyle?: string; hairVolume?: number; badge?: { col: number[]; name: string }; blush?: number; eyeH?: number; eyeW?: number; /** 0..1 balloon the cranium out (applied to the built mesh by HumanRig; Timmy) */ inflate?: number }

/** the full spec for a rig */
export function specOf(app: Appearance, o: Outfit, d: Dims, seed: number, cond: RigCondition, ov: SpecOverrides = {}): GGSpec {
  const fem = app.bodyShape ?? 0.3;
  const b = String(app.build);
  const w = 1 + (d.bw - 1) * 0.8;
  const belly = b === 'heavy' ? 0.7 : b === 'stocky' ? 0.35 : b === 'broad' ? 0.12 : 0;
  const dress = dressOf(o, app, seed);
  if (ov.badge) dress.badge = ov.badge;
  const fh = String(app.facialHair || (app.beard ? 'beard' : 'none'));
  const es = eyeShapeOf(app), bs = browsOf(app);
  const gl = dress.eyes ? { kind: (dress.eyes.kind === 'goggles' ? 'goggles' : dress.eyes.kind === 'sun' ? 'sun' : h2(seed, 5, 1) < 0.4 ? 'round' : 'rect') as 'rect' | 'round' | 'sun' | 'goggles', col: dress.eyes.kind === 'goggles' ? [40, 44, 48] : mixc(dress.eyes.col, [30, 26, 26], 0.4), thick: 1 } : undefined;
  const face: FaceSpec = {
    iris: hex(app.eyeColor ?? [0x5a3a22, 0x3a2414, 0x6a7a3a, 0x3a6a9a, 0x6a8aa8, 0x8a6a3a, 0x4a5a5a][Math.floor(h2(seed, 1, 2) * 7)]),
    eyeW: (es === 2 ? 1.12 : es === 1 ? 1.04 : 1) * (ov.eyeW ?? 1), eyeH: (es === 1 ? 0.72 : es === 2 ? 1.22 : es === 3 ? 0.9 : 1) * (ov.eyeH ?? 1), tilt: 0.4 + h2(seed, 2, 3) * 0.5 + (es === 4 ? -0.6 : 0),
    lid: es === 3 ? 'hooded' : h2(seed, 3, 4) < 0.3 ? 'mono' : 'double', eyeShape: es,
    brows: bs, browW: bs === 1 ? 1.45 : bs === 3 ? 0.6 : bs === 4 ? 1.2 : 1, browArch: bs === 2 ? 2 : bs === 0 ? 0.5 : bs === 1 ? 0.6 : fem > 0.5 ? 1.5 : 0.9,
    nose: noseOf(app), mouth: mouthOf(app), ears: app.ears ?? 0,
    lipFull: (mouthOf(app) === 2 ? 0.65 : mouthOf(app) === 3 ? 1.35 : 1) * (0.9 + fem * 0.2),
    lipstick: ov.lipstick != null ? hex(ov.lipstick) : undefined, blush: ov.blush ?? 0.22 + fem * 0.12,
    makeup: ov.makeup ?? (fem > 0.65 ? { lash: 0.3 } : undefined),
    stubble: fh === 'stubble' ? 0.75 : fh === 'beard' || fh === 'goatee' || fh === 'moustache' || fh === 'handlebar' || fh === 'chops' || fh === 'chin_strap' ? 0.35 : fh === 'soul_patch' ? 0.2 : Math.max(0, 0.5 - fem) * 0.3,
    facial: fh, freckles: app.freckles ?? 0, scars: app.scars ?? 0, age: app.age ?? 0,
    glasses: ov.glasses ?? gl,
    shape: shapeOf(app), tattoo: app.tattoos?.face, expr: cond.expr || '',
  };
  const hc = hairColour(app.hair);
  const st = ov.hairStyle ?? String(app.hairStyle);
  const hairS = { style: st, col: hc.col, hi: hc.hi, grey: hc.grey, part: h2(seed, 9, 1) < 0.5 ? 1 : -1, volume: ov.hairVolume ?? 1 };
  const fk = dress.feet?.kind ?? 'bare';
  const sole = fk === 'hazmat' ? 0.03 : fk === 'boot' ? 0.03 : fk === 'sneaker' ? 0.024 : fk === 'dress' ? 0.016 : fk === 'slipper' ? 0.016 : fk === 'sock' ? 0.004 : 0.003;
  return {
    seed, fem, w, mass: d.mass, belly, bust: ov.bust ?? (fem > 0.45 ? 0.55 + (fem - 0.45) * 1.0 : 0), age: app.age ?? 0,
    skin: hex(app.skin), hair: hairS, face, dress, sole,
  };
}
