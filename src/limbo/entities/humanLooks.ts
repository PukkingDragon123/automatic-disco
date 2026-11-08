// Extra appearance detail for the intake creator: face features chosen one by
// one (face shape, eyes, brows, nose, mouth, ears), more hair styles and
// facial hair, tattoos and scars by body spot, knuckle tattoos, nails, and
// the details of the Remittance jumpsuit (rolled sleeves, wear, stains, how
// the number patch was done). Every field is optional: an Appearance without
// them looks exactly as before (the features fall back to the `face` variant).
// humanModel.ts reads the shape fields, humanPaint.ts paints the rest.
import type { Appearance, Outfit } from './humanRig';
import type { OutfitShape } from './humanClothes';

declare module './humanRig' {
  interface Appearance {
    /** face shape (FACE_SHAPES index); default follows `face` */
    jaw?: number;
    /** EYE_SHAPES index */
    eyeShape?: number;
    /** BROWS index */
    brows?: number;
    /** NOSES index */
    nose?: number;
    /** MOUTHS index */
    mouth?: number;
    /** EARS index */
    ears?: number;
    /** body spot (TATTOO_SPOTS key) -> design (TATTOOS key) */
    tattoos?: Record<string, string>;
    /** body spot (SCAR_SPOTS key) -> scar kind (BODY_SCARS key) */
    bodyScars?: Record<string, string>;
    /** knuckle tattoo (KNUCKLES key) */
    knuckles?: string;
    /** NAILS key */
    nails?: string;
    /** jumpsuit details (only shown on the Remittance jumpsuit) */
    suit?: SuitLooks;
    /** issued footwear (FEET_KIT key), applied by whoever dresses the prisoner */
    feetKit?: string;
    /** worn cosmetics (src/game/cosmetics.ts keys, one per slot) */
    cos?: string[];
  }
}

export interface SuitLooks {
  /** 'down' | 'rolled' */
  sleeves?: string;
  /** 0 fresh .. 3 shredded */
  wear?: number;
  /** STAINS key */
  stains?: string;
  /** PATCHES key: how the number patch was done */
  patch?: string;
}

export interface Opt { key: string; name: string; note?: string }
const o = (key: string, name: string, note?: string): Opt => ({ key, name, note });

// ------------------------------------------------------------------ face
export const FACE_SHAPES: Opt[] = [o('0', 'Oval'), o('1', 'Square'), o('2', 'Round'), o('3', 'Long'), o('4', 'Heart'), o('5', 'Gaunt'), o('6', 'Broad'), o('7', 'Pointed')];
/** jaw width, chin, cheekbones, overall width, lower-face length, cheek hollow */
export interface ShapeK { jaw: number; chin: number; cheek: number; wide: number; long: number; hollow: number }
const SHAPES: ShapeK[] = [
  { jaw: 1, chin: 1, cheek: 1, wide: 1, long: 1, hollow: 0 },
  { jaw: 1.09, chin: 1.04, cheek: 1, wide: 1.02, long: 1, hollow: 0 },
  { jaw: 1.05, chin: 0.94, cheek: 1.04, wide: 1.06, long: 0.94, hollow: 0 },
  { jaw: 0.96, chin: 1.03, cheek: 0.98, wide: 0.95, long: 1.12, hollow: 0 },
  { jaw: 0.9, chin: 0.92, cheek: 1.05, wide: 1.0, long: 1.02, hollow: 0 },
  { jaw: 0.97, chin: 1.0, cheek: 1.05, wide: 0.95, long: 1.06, hollow: 1 },
  { jaw: 1.12, chin: 1.06, cheek: 1.04, wide: 1.09, long: 0.98, hollow: 0 },
  { jaw: 0.88, chin: 1.07, cheek: 1.0, wide: 0.97, long: 1.06, hollow: 0 },
];
/** face-shape parameters, falling back to the old face variants */
export function shapeOf(a: Appearance): ShapeK {
  if (a.jaw != null) return SHAPES[((a.jaw | 0) % SHAPES.length + SHAPES.length) % SHAPES.length];
  const f = a.face ?? 0;
  return { jaw: 1 + (f === 4 ? 0.05 : 0) - (f === 2 ? 0.03 : 0), chin: 1 + (f === 5 ? 0.04 : 0), cheek: 1 + (f === 3 ? 0.03 : 0), wide: 1, long: 1, hollow: 0 };
}

export const EYE_SHAPES: Opt[] = [o('0', 'Level'), o('1', 'Narrow'), o('2', 'Wide'), o('3', 'Hooded'), o('4', 'Tired'), o('5', 'Deep-set'), o('6', 'Lopsided'), o('7', 'Glass eye')];
export const eyeShapeOf = (a: Appearance) => a.eyeShape ?? ((a.face ?? 0) === 2 ? 1 : (a.face ?? 0) === 4 ? 2 : 0);

export const BROWS: Opt[] = [o('0', 'Straight'), o('1', 'Heavy'), o('2', 'Arched'), o('3', 'Thin'), o('4', 'Unibrow'), o('5', 'Split', 'an old cut through the left brow'), o('6', 'Shaved')];
export const browsOf = (a: Appearance) => a.brows ?? ((a.bodyShape ?? 0.3) > 0.5 ? 2 : (a.face === 5 || a.face === 1) ? 1 : 0);

export const NOSES: Opt[] = [o('0', 'Straight'), o('1', 'Button'), o('2', 'Broad'), o('3', 'Long'), o('4', 'Broken', 'set crooked, never fixed'), o('5', 'Hooked'), o('6', 'Flattened')];
export const noseOf = (a: Appearance) => a.nose ?? ((a.face ?? 0) === 4 ? 2 : (a.face ?? 0) === 2 ? 1 : (a.face ?? 0) === 5 ? 3 : 0);
/** nose width, length, crooked x offset, bridge bump, flatness */
export function noseK(n: number): { w: number; len: number; crook: number; bump: number; flat: number } {
  switch (n) {
    case 1: return { w: 0.9, len: 0.78, crook: 0, bump: 0, flat: 0 };
    case 2: return { w: 1.25, len: 0.95, crook: 0, bump: 0, flat: 0.2 };
    case 3: return { w: 0.95, len: 1.2, crook: 0, bump: 0, flat: 0 };
    case 4: return { w: 1.08, len: 1.0, crook: 0.006, bump: 0.003, flat: 0.1 };
    case 5: return { w: 1.0, len: 1.15, crook: 0, bump: 0.006, flat: 0 };
    case 6: return { w: 1.3, len: 0.7, crook: 0.002, bump: 0, flat: 0.55 };
    default: return { w: 1, len: 1, crook: 0, bump: 0, flat: 0 };
  }
}

export const MOUTHS: Opt[] = [o('0', 'Neutral'), o('1', 'Smirk'), o('2', 'Thin'), o('3', 'Full'), o('4', 'Downturned'), o('5', 'Gap tooth'), o('6', 'Split lip'), o('7', 'Gold tooth')];
export const mouthOf = (a: Appearance) => a.mouth ?? ((a.face ?? 0) === 1 ? 1 : (a.face ?? 0) === 5 ? 2 : 0);

export const EARS: Opt[] = [o('0', 'Average'), o('1', 'Small'), o('2', 'Big'), o('3', 'Cauliflower', 'one too many fights'), o('4', 'Notched', 'a bite out of the left one'), o('5', 'Ringed'), o('6', 'Gauged')];
/** ear scale out, size, lump */
export function earK(n: number): { out: number; size: number; lump: number } {
  switch (n) {
    case 1: return { out: 0.7, size: 0.82, lump: 0 };
    case 2: return { out: 1.6, size: 1.18, lump: 0 };
    case 3: return { out: 1.1, size: 1.05, lump: 1 };
    case 6: return { out: 1.05, size: 1.05, lump: 0 };
    default: return { out: 1, size: 1, lump: 0 };
  }
}

export const FACIAL_HAIR_ALL: Opt[] = [o('none', 'Clean'), o('stubble', 'Stubble'), o('moustache', 'Moustache'), o('handlebar', 'Handlebar'), o('goatee', 'Goatee'), o('soul_patch', 'Soul patch'), o('chin_strap', 'Chin strap'), o('chops', 'Mutton chops'), o('beard', 'Full beard')];

export const HAIR_STYLES_ALL: Opt[] = [
  o('short', 'Short'), o('buzz', 'Buzz'), o('shaved', 'Shaved'), o('bald', 'Bald'), o('receding', 'Receding'), o('undercut', 'Undercut'), o('spiky', 'Spiked'),
  o('mohawk', 'Mohawk'), o('cornrows', 'Cornrows'), o('curly', 'Curly'), o('afro', 'Big curls'), o('mullet', 'Mullet'), o('bob', 'Bob'),
  o('long', 'Long'), o('ponytail', 'Ponytail'), o('topknot', 'Top knot'),
];
/** extra hair colours beyond the rig's (dyes and greys) */
export const HAIR_DYES = [0x1c1612, 0x3b2a1e, 0x6a4628, 0x9c7a46, 0xd8c08a, 0xa8a49e, 0x8a3a1c, 0xe8e2d6, 0x5a5c60, 0xb8402a, 0x2e4a7a, 0x3e7a4a, 0xc85a9a, 0xe0d84a];

// ------------------------------------------------------------------ body marks
/** where a tattoo can go: surface region, angle (deg, 0 = front; limbs +90 = outer side), height (reference metres), scale */
export interface Spot { name: string; reg: 'TORSO' | 'ARM_L' | 'ARM_R' | 'NECK' | 'HEAD'; deg: number; y: number; big?: boolean }
export const TATTOO_SPOTS: Record<string, Spot> = {
  chest: { name: 'Chest', reg: 'TORSO', deg: 30, y: 1.3 },
  back: { name: 'Back', reg: 'TORSO', deg: 180, y: 1.25, big: true },
  belly: { name: 'Belly', reg: 'TORSO', deg: -14, y: 1.06 },
  neck: { name: 'Neck', reg: 'NECK', deg: 70, y: 1.52 },
  face: { name: 'Face', reg: 'HEAD', deg: -24, y: 0.075 },
  uarm_l: { name: 'Left upper arm', reg: 'ARM_L', deg: 70, y: -0.13 },
  farm_l: { name: 'Left forearm', reg: 'ARM_L', deg: 20, y: -0.4 },
  uarm_r: { name: 'Right upper arm', reg: 'ARM_R', deg: 70, y: -0.13 },
  farm_r: { name: 'Right forearm', reg: 'ARM_R', deg: 20, y: -0.4 },
};
/** pixel sprites ('#' ink, 'r' red, 'g' green, 'y' yellow, 'o' faded ink) — original designs */
export const TATTOOS: Record<string, { name: string; art: string[] }> = {
  anchor: { name: 'Anchor', art: ['..#..', '.#.#.', '..#..', '#####', '..#..', '#.#.#', '.###.'] },
  skull: { name: 'Skull', art: ['.###.', '#####', '#.#.#', '#####', '.#.#.'] },
  heart: { name: 'Heart', art: ['.r.r.', 'rrrrr', 'rrrrr', '.rrr.', '..r..'] },
  dagger: { name: 'Dagger', art: ['..#..', '..#..', '..#..', '..#..', '#####', '..#..', '..#..'] },
  rose: { name: 'Rose', art: ['.rrr.', 'rr#rr', '.rrr.', '..g..', 'gg#..', '..#..'] },
  web: { name: 'Web', art: ['#.#.#', '.###.', '##.##', '.###.', '#.#.#'] },
  star: { name: 'Star', art: ['..#..', '.###.', '#####', '.#.#.', '#...#'] },
  swallow: { name: 'Swallow', art: ['#....#', '##..##', '.####.', '..##..', '..#...'] },
  eye: { name: 'Eye', art: ['.###.', '#.#.#', '##.##', '.###.'] },
  snake: { name: 'Snake', art: ['...##', '..#..', '.##..', '#....', '.##..', '...#.'] },
  clock: { name: 'Clock (no hands)', art: ['.###.', '#...#', '#...#', '#...#', '.###.'] },
  barcode: { name: 'Barcode', art: ['#.##.#.##', '#.##.#.##', '#.##.#.##', 'o.o.o.oo.'] },
  tally: { name: 'Tally marks', art: ['#.#.#.#', '#.#####', '###.#.#', '#.#.#.#'] },
  teardrop: { name: 'Teardrop', art: ['#', '#'] },
  dots: { name: 'Three dots', art: ['#.#', '...', '.#.'] },
  owed: { name: '"OWED"', art: [] },
  paid: { name: '"PAID"', art: [] },
  mom: { name: '"MOM"', art: [] },
};
/** which designs fit which spots (the face only takes small ones) */
export function tattoosFor(spot: string): string[] {
  if (spot === 'face') return ['teardrop', 'dots', 'tally', 'star'];
  if (spot === 'neck') return ['barcode', 'star', 'web', 'swallow', 'dots', 'tally', 'owed', 'paid'];
  return Object.keys(TATTOOS).filter((k) => k !== 'teardrop');
}
export const TEXT_TATTOOS: Record<string, string> = { owed: 'OWED', paid: 'PAID', mom: 'MOM' };

export const SCAR_SPOTS: Record<string, Spot> = {
  brow: { name: 'Face', reg: 'HEAD', deg: 14, y: 0.12 },
  chest: { name: 'Chest', reg: 'TORSO', deg: 0, y: 1.3 },
  belly: { name: 'Belly', reg: 'TORSO', deg: 30, y: 1.05 },
  back: { name: 'Back', reg: 'TORSO', deg: 160, y: 1.2 },
  uarm_l: { name: 'Left arm', reg: 'ARM_L', deg: 60, y: -0.15 },
  farm_l: { name: 'Left forearm', reg: 'ARM_L', deg: 0, y: -0.4 },
  uarm_r: { name: 'Right arm', reg: 'ARM_R', deg: 60, y: -0.15 },
  farm_r: { name: 'Right forearm', reg: 'ARM_R', deg: 0, y: -0.4 },
};
export const BODY_SCARS: Record<string, string> = {
  slash: 'Knife slash', stitches: 'Stitched gash', burn: 'Burn', bullet: 'Bullet hole', surgery: 'Surgery scar', bite: 'Bite marks', lashes: 'Whip lashes',
};

export const KNUCKLES: Record<string, { name: string; l: string; r: string }> = {
  none: { name: 'Bare', l: '', r: '' },
  love_hate: { name: 'LOVE / HATE', l: 'LOVE', r: 'HATE' },
  hold_fast: { name: 'HOLD / FAST', l: 'HOLD', r: 'FAST' },
  paid_debt: { name: 'PAID / DEBT', l: 'PAID', r: 'DEBT' },
  lost_soul: { name: 'LOST / SOUL', l: 'LOST', r: 'SOUL' },
  dots: { name: 'Dots', l: '....', r: '....' },
  crosses: { name: 'Crosses', l: '++++', r: '++++' },
};
export const NAILS: Record<string, { name: string; color: number }> = {
  clean: { name: 'Clean', color: 0 },
  bitten: { name: 'Bitten to the quick', color: 0xc06058 },
  grimy: { name: 'Grimy', color: 0x3a2e20 },
  black: { name: 'Painted black', color: 0x15151a },
  red: { name: 'Painted red', color: 0xb0202a },
  chipped: { name: 'Chipped polish', color: 0x7a3a8a },
};

// ------------------------------------------------------------------ jumpsuit
export const SUIT_SLEEVES: Opt[] = [o('down', 'Sleeves down'), o('rolled', 'Sleeves rolled')];
export const SUIT_WEAR: Opt[] = [o('0', 'Fresh issue'), o('1', 'Worn'), o('2', 'Ragged'), o('3', 'Shredded')];
export const STAINS: Opt[] = [o('none', 'None'), o('sweat', 'Sweat rings'), o('coffee', 'Coffee'), o('oil', 'Machine oil'), o('blood', 'Old blood'), o('bleach', 'Bleach spots')];
export const PATCHES: Opt[] = [o('stitched', 'Stitched tape'), o('marker', 'Marker on tape'), o('stencil', 'Spray stencil'), o('torn', 'Half torn off')];
export const FEET_KIT: Opt[] = [o('slipons', 'Canvas slip-ons'), o('boots', 'Work boots'), o('socks', 'Socks only'), o('bare', 'Barefoot')];

/** item keys for the issued footwear (whoever dresses the prisoner in game can use this) */
export function feetKitItems(a: Appearance): string[] {
  switch (a.feetKit) {
    case 'boots': return ['socks', 'boots_work'];
    case 'socks': return ['socks'];
    case 'bare': return [];
    default: return ['socks', 'canvas_slipons'];
  }
}

/** a random set of extras for "Someone else" / randomize */
export function randomLooks(rnd: () => number, fem = false): Partial<Appearance> {
  const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const tat: Record<string, string> = {};
  const nT = rnd() < 0.45 ? 0 : 1 + Math.floor(rnd() * 3);
  const spots = Object.keys(TATTOO_SPOTS).filter((s) => s !== 'face' || rnd() < 0.2);
  for (let i = 0; i < nT; i++) { const s = pick(spots); tat[s] = pick(tattoosFor(s)); }
  const sc: Record<string, string> = {};
  if (rnd() < 0.3) sc[pick(Object.keys(SCAR_SPOTS))] = pick(Object.keys(BODY_SCARS));
  const hair = pick(HAIR_STYLES_ALL.map((h) => h.key).filter((k) => fem ? !['receding', 'chops'].includes(k) : true));
  return {
    jaw: Math.floor(rnd() * FACE_SHAPES.length), eyeShape: rnd() < 0.6 ? 0 : Math.floor(rnd() * 7), brows: fem ? pick([2, 3, 0]) : pick([0, 1, 0, 3, 4, 5]),
    nose: Math.floor(rnd() * NOSES.length), mouth: rnd() < 0.5 ? 0 : Math.floor(rnd() * MOUTHS.length), ears: rnd() < 0.6 ? 0 : Math.floor(rnd() * EARS.length),
    hairStyle: hair as any, tattoos: tat, bodyScars: sc,
    knuckles: rnd() < 0.8 ? 'none' : pick(Object.keys(KNUCKLES)), nails: rnd() < 0.6 ? 'clean' : pick(Object.keys(NAILS)),
    suit: { sleeves: rnd() < 0.4 ? 'rolled' : 'down', wear: Math.floor(rnd() * 3), stains: rnd() < 0.5 ? 'none' : pick(STAINS.map((s) => s.key)), patch: pick(PATCHES.map((p) => p.key)) },
    feetKit: rnd() < 0.7 ? 'slipons' : pick(FEET_KIT.map((f) => f.key)),
  };
}

// ------------------------------------------------------------------ jumpsuit overrides (geometry + paint agree)
/** true when the outfit's top is the Remittance jumpsuit */
export const isJumpsuit = (o: Outfit) => o.torso?.tex === 'c_jumpsuit' || o.torso?.item === 'prison_jumpsuit';
/** apply app.suit (rolled sleeves) to the outfit and its silhouette; returns new objects only when something changes */
export function suitLooks(app: Appearance, o: Outfit, sh: OutfitShape): { o: Outfit; sh: OutfitShape } {
  if (app.suit?.sleeves !== 'rolled' || !o.torso || !isJumpsuit(o) || sh.sleeve !== 'long' || o.torsoOuter) return { o, sh };
  return { o: { ...o, torso: { ...o.torso, sleeve: 'short' } }, sh: { ...sh, sleeve: 'short' } };
}

/** the debtor number on the jumpsuit: prisonerNumber() in src/content/items/prisoner.ts (the same hash of the rig seed, kept in sync) */
export const suitNumber = (rigSeed: number) => 'D-' + (1000 + (Math.abs(Math.imul(rigSeed | 0, 2654435761) >>> 0) % 9000));
