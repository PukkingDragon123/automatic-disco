// The bestiary: hand-designed species of this world, each built around one signature idea and sculpted from
// written-out data (trunk cross-sections, skull profile, limb profiles, the parts it grows and where), so nothing on
// it is assembled at random. The generator only varies an individual a little (size, a ramp step of colour, a few
// percent of proportion). Colours are master-palette ramp steps: two or three tones and one accent.
import { RAMPS, type RampName } from '../art/palette';
import type { Design, Pattern, Cover } from './design';
import type { Plan, Lineage } from './genes';
import { Rand, clamp } from '../core/rand';

const T = (n: RampName, i: number) => { const R = RAMPS[n] as readonly number[]; return R[Math.max(0, Math.min(R.length - 1, i))]; };

/** a part the sculptor grows on a bestiary species, placed by hand along the spine (t: 0 nape .. 1 tail tip) */
export type BeastPart =
  | { k: 'carapace'; t0: number; t1: number; bands: number; spread: number; lift: number; ramp: RampName; moss?: boolean }
  | { k: 'plates'; t0: number; t1: number; rows: number; spread: number; size: number; ramp: RampName }
  | { k: 'wool'; t0: number; t1: number; puff: number; hang: number }
  | { k: 'horn'; len: number; rise: number; base: number; ramp: RampName }
  | { k: 'crest'; len: number; height: number; ramp: RampName }
  | { k: 'tailFan'; size: number; ramp: RampName }
  | { k: 'headFans'; size: number; ramp: RampName }
  | { k: 'finCrest'; height: number }
  | { k: 'mane' } | { k: 'shag' } | { k: 'brow'; size: number };

export interface BeastForm {
  /** trunk cross-sections at chest, barrel, waist and hips: [width, height above, depth below] (x body W / H) */
  trunk: [number, number, number][];
  /** neck radius (x head width), neck pitch (rad, 0 level), neck length (x body length), head size (x default) */
  neckR: number; nAng: number; neckK: number; headK: number; snoutK: number;
  /** body height to width, fore and hind leg length and thickness multipliers, a raise of the chest (x leg length) */
  hK: number; foreK: number; hindK: number; foreT: number; hindT: number; slope: number; tailK: number;
  /** skull profile at the eight head stations and the eye seat: z (x hl), socket angle, yaw, radius (x hw) */
  skull: { rx: number[]; ry: number[]; hy: number[]; eye: number[]; cap: number };
  /** eyes: a single pair, or rows of small slit eyes along each side; pupil shape */
  eyes: { rows?: number; pupil: 'v' | 'h' | 'round' | 'w' | 'crescent' | 'pinhole' | 'multi'; sclera?: boolean };
  /** leg profiles (x leg thickness) at the top, hip, knee, hock, foot */
  fore: number[]; hind: number[];
  /** bare skin on the legs (fur stops at the elbow and knee), a scaled tail, lateral spiracles, sensory pits */
  limbSkin?: boolean; tailScales?: boolean; spiracles?: number; pits?: boolean;
  parts: BeastPart[];
}
export interface Beast {
  id: string; name: string; latin: string; role: 'mite' | 'grazer' | 'tank' | 'stalker' | 'apex' | 'snail' | 'scavenger';
  /** the written concept: niche, signature, size */
  concept: string;
  plan: Plan; lineage: Lineage; cover: Cover; genes: string[];
  sliders: { size: number; len: number; girth: number; legLen: number; legThick: number; neck: number; head: number; tail: number };
  colors: { base: [RampName, number]; belly: [RampName, number]; pattern: [RampName, number]; accent: [RampName, number]; eye: [RampName, number] };
  pattern: Pattern; patScale: number;
  form: BeastForm;
}

const DEF_SKULL = { rx: [0.32, 0.48, 0.53, 0.47, 0.38, 0.31, 0.25, 0.17], ry: [0.34, 0.48, 0.52, 0.45, 0.36, 0.29, 0.24, 0.17], hy: [0.04, 0.14, 0.18, 0.13, 0.04, -0.02, -0.04, -0.05], eye: [0.3, 1.1, 0.9, 0.1], cap: 0.3 };

export const BEASTS: Record<string, Beast> = {
  mossback: {
    id: 'mossback', name: 'Mossback', latin: 'Testudocervus muscosus', role: 'tank', plan: 'quadruped', lineage: 'vertebrate', cover: 'fur',
    concept: 'A five-metre browser that carries its ribs outside: a domed back-shield of overlapping bone bands, grown over with moss, over a shaggy body. Slow, near-blind, unbothered. Its small head hangs low under the shield rim.',
    genes: ['vert_quadruped', 'leg_pillar', 'eye_camera', 'molars', 'osteoderms', 'shaggy', 'fat_stores', 'endotherm', 'live_birth'],
    sliders: { size: 0.82, len: 0.55, girth: 0.92, legLen: 0.3, legThick: 0.85, neck: 0.25, head: 0.4, tail: 0.15 },
    colors: { base: ['fur', 2], belly: ['fur', 3], pattern: ['fur', 1], accent: ['moss', 4], eye: ['fur', 1] }, pattern: 'plain', patScale: 1,
    form: {
      trunk: [[0.44, 0.5, 0.72], [0.52, 0.56, 0.7], [0.5, 0.5, 0.6], [0.47, 0.5, 0.5]], neckR: 0.5, nAng: 0.05, neckK: 0.8, headK: 0.75, snoutK: 0.8,
      hK: 1.1, foreK: 1, hindK: 1, foreT: 1.1, hindT: 1.15, slope: 0.05, tailK: 0.6,
      skull: { rx: [0.4, 0.54, 0.58, 0.5, 0.42, 0.36, 0.33, 0.3], ry: [0.4, 0.52, 0.54, 0.46, 0.38, 0.33, 0.3, 0.27], hy: [0.08, 0.16, 0.18, 0.12, 0.04, -0.02, -0.05, -0.08], eye: [0.24, 1.25, 1.1, 0.07], cap: 0.2 },
      eyes: { pupil: 'h' }, fore: [0.62, 0.78, 0.66, 0.6, 0.66], hind: [0.66, 0.8, 0.66, 0.6, 0.66], limbSkin: true,
      parts: [{ k: 'carapace', t0: 0.08, t1: 0.82, bands: 6, spread: 1.75, lift: 1.18, ramp: 'stone', moss: true }, { k: 'brow', size: 1 }],
    },
  },
  stiltwool: {
    id: 'stiltwool', name: 'Stiltwool', latin: 'Lanigrallator altus', role: 'grazer', plan: 'quadruped', lineage: 'vertebrate', cover: 'fur',
    concept: 'A woolly hay-bale of a body held three metres up on bare black stilts, so the high-meadow wind passes under it. The small head on a drooping neck grazes the tops of the grass; the fleece traps warmth at night.',
    genes: ['vert_quadruped', 'leg_hooved', 'eye_camera', 'ears', 'molars', 'shaggy', 'endotherm', 'fat_stores', 'live_birth'],
    sliders: { size: 0.5, len: 0.4, girth: 0.95, legLen: 0.95, legThick: 0.3, neck: 0.55, head: 0.3, tail: 0.05 },
    colors: { base: ['bone', 3], belly: ['bone', 4], pattern: ['sand', 2], accent: ['rust', 3], eye: ['fur', 1] }, pattern: 'plain', patScale: 1,
    form: {
      trunk: [[0.48, 0.55, 0.6], [0.55, 0.62, 0.66], [0.55, 0.6, 0.62], [0.5, 0.56, 0.52]], neckR: 0.42, nAng: 0.15, neckK: 1.1, headK: 0.55, snoutK: 0.9,
      hK: 1.15, foreK: 1.05, hindK: 1, foreT: 0.75, hindT: 0.8, slope: 0.02, tailK: 0.4,
      skull: { rx: [0.3, 0.44, 0.48, 0.4, 0.3, 0.24, 0.21, 0.19], ry: [0.34, 0.46, 0.48, 0.4, 0.32, 0.28, 0.26, 0.22], hy: [0.08, 0.17, 0.18, 0.12, 0.04, -0.02, -0.05, -0.08], eye: [0.2, 1.1, 1.15, 0.12], cap: 0.28 },
      eyes: { pupil: 'h' }, fore: [0.7, 0.62, 0.3, 0.2, 0.19], hind: [0.74, 0.68, 0.32, 0.2, 0.19], limbSkin: true,
      parts: [{ k: 'wool', t0: -0.02, t1: 0.86, puff: 1.32, hang: 0.5 }],
    },
  },
  lancehorn: {
    id: 'lancehorn', name: 'Lancehorn', latin: 'Ensirostrum noctivagus', role: 'tank', plan: 'quadruped', lineage: 'vertebrate', cover: 'fur',
    concept: 'A low, shaggy night-grubber the size of a bull, with one great keratin lance swept forward off the nose: it ploughs termite mounds open with it and spars with it in the rut. It walks on the knuckles of its huge clawed forearms.',
    genes: ['vert_quadruped', 'leg_plantigrade', 'eye_camera', 'molars', 'shaggy', 'fur', 'endotherm', 'live_birth'],
    sliders: { size: 0.55, len: 0.9, girth: 0.7, legLen: 0.3, legThick: 0.7, neck: 0.2, head: 0.55, tail: 0.5 },
    colors: { base: ['basalt', 2], belly: ['bone', 4], pattern: ['bone', 4], accent: ['violet', 3], eye: ['ochre', 4] }, pattern: 'saddle', patScale: 1,
    form: {
      trunk: [[0.46, 0.5, 0.66], [0.5, 0.48, 0.62], [0.47, 0.44, 0.56], [0.46, 0.48, 0.5]], neckR: 0.5, nAng: 0.0, neckK: 0.7, headK: 0.9, snoutK: 1.25,
      hK: 0.95, foreK: 1.15, hindK: 0.95, foreT: 1.35, hindT: 1, slope: 0.08, tailK: 1.2,
      skull: { rx: [0.36, 0.5, 0.52, 0.44, 0.34, 0.27, 0.23, 0.2], ry: [0.38, 0.5, 0.5, 0.42, 0.34, 0.29, 0.26, 0.22], hy: [0.06, 0.15, 0.16, 0.1, 0.02, -0.03, -0.05, -0.07], eye: [0.26, 1.15, 0.95, 0.075], cap: 0.25 },
      eyes: { pupil: 'round' }, fore: [0.66, 0.78, 0.56, 0.46, 0.48], hind: [0.62, 0.72, 0.48, 0.4, 0.42],
      parts: [{ k: 'horn', len: 1.6, rise: 0.55, base: 0.2, ramp: 'violet' }, { k: 'shag' }],
    },
  },
  scaleback: {
    id: 'scaleback', name: 'Scaleback', latin: 'Squamipellis fossor', role: 'grazer', plan: 'quadruped', lineage: 'vertebrate', cover: 'skin',
    concept: 'A hunched digger shingled nose to tail in overlapping horn plates that lie back like a pine cone and flare when it curls. It tears open root-stores with hooked fore-claws and licks out the grubs with a long narrow snout.',
    genes: ['vert_quadruped', 'leg_plantigrade', 'eye_camera', 'molars', 'osteoderms', 'tail_balance', 'ectotherm', 'live_birth'],
    sliders: { size: 0.3, len: 0.7, girth: 0.6, legLen: 0.25, legThick: 0.6, neck: 0.2, head: 0.4, tail: 0.85 },
    colors: { base: ['hide', 3], belly: ['hide', 4], pattern: ['rust', 2], accent: ['rust', 4], eye: ['ink', 1] }, pattern: 'plain', patScale: 1,
    form: {
      trunk: [[0.42, 0.56, 0.5], [0.48, 0.66, 0.5], [0.46, 0.62, 0.46], [0.44, 0.54, 0.44]], neckR: 0.48, nAng: -0.05, neckK: 0.6, headK: 0.7, snoutK: 1.6,
      hK: 1.05, foreK: 0.95, hindK: 1.05, foreT: 1.1, hindT: 1.05, slope: -0.04, tailK: 1.1,
      skull: { rx: [0.34, 0.46, 0.48, 0.4, 0.3, 0.22, 0.17, 0.12], ry: [0.36, 0.46, 0.46, 0.38, 0.28, 0.22, 0.17, 0.12], hy: [0.06, 0.13, 0.14, 0.08, 0.0, -0.04, -0.06, -0.08], eye: [0.26, 1.25, 1.0, 0.07], cap: 0.4 },
      eyes: { pupil: 'round' }, fore: [0.6, 0.7, 0.5, 0.42, 0.44], hind: [0.62, 0.72, 0.5, 0.42, 0.44],
      parts: [{ k: 'plates', t0: -0.02, t1: 0.97, rows: 22, spread: 2.0, size: 0.34, ramp: 'rust' }],
    },
  },
  gallowneck: {
    id: 'gallowneck', name: 'Gallowneck', latin: 'Patibulicollis maculatus', role: 'stalker', plan: 'quadruped', lineage: 'vertebrate', cover: 'fur',
    concept: 'A spotted stilt-hunter four and a half metres tall that stands over the reed beds like a gallows, neck raised, then drops its narrow crested head like a pickaxe onto anything that moves below.',
    genes: ['vert_quadruped', 'leg_cursorial', 'eye_binocular', 'ears', 'carnassials', 'fur', 'endotherm', 'live_birth'],
    sliders: { size: 0.48, len: 0.35, girth: 0.4, legLen: 0.95, legThick: 0.3, neck: 1, head: 0.45, tail: 0.3 },
    colors: { base: ['ochre', 4], belly: ['straw', 4], pattern: ['fur', 1], accent: ['basalt', 2], eye: ['brass', 4] }, pattern: 'spots', patScale: 0.7,
    form: {
      trunk: [[0.42, 0.52, 0.66], [0.46, 0.5, 0.6], [0.4, 0.46, 0.42], [0.42, 0.46, 0.44]], neckR: 0.36, nAng: 1.15, neckK: 1.55, headK: 0.7, snoutK: 1.3,
      hK: 1.1, foreK: 1.12, hindK: 1, foreT: 0.85, hindT: 0.85, slope: 0.12, tailK: 0.6,
      skull: { rx: [0.3, 0.42, 0.44, 0.38, 0.3, 0.23, 0.18, 0.12], ry: [0.32, 0.44, 0.44, 0.38, 0.3, 0.24, 0.19, 0.12], hy: [0.08, 0.16, 0.16, 0.1, 0.02, -0.04, -0.06, -0.08], eye: [0.28, 0.95, 0.65, 0.095], cap: 0.35 },
      eyes: { pupil: 'v' }, fore: [0.6, 0.62, 0.32, 0.2, 0.2], hind: [0.66, 0.7, 0.34, 0.2, 0.2],
      parts: [{ k: 'crest', len: 1.1, height: 0.5, ramp: 'basalt' }],
    },
  },
  shellhunter: {
    id: 'shellhunter', name: 'Shellhunter', latin: 'Venatorcarapax pallidus', role: 'apex', plan: 'quadruped', lineage: 'vertebrate', cover: 'fur',
    concept: 'The plains apex: six metres of pale muscle under a slate-blue helm and back-shield, a ruff of white fur at the throat, three slit eyes down each side of the helm, and a long whip tail ending in a red signal fan it flicks before it charges.',
    genes: ['vert_quadruped', 'leg_padded', 'eye_binocular', 'carnassials', 'osteoderms', 'fur', 'tail_balance', 'endotherm', 'live_birth'],
    sliders: { size: 0.85, len: 0.7, girth: 0.62, legLen: 0.5, legThick: 0.75, neck: 0.2, head: 0.6, tail: 0.95 },
    colors: { base: ['snow', 3], belly: ['snow', 4], pattern: ['slate', 3], accent: ['stampRed', 3], eye: ['teal', 4] }, pattern: 'plain', patScale: 1,
    form: {
      trunk: [[0.46, 0.5, 0.72], [0.5, 0.48, 0.64], [0.42, 0.44, 0.46], [0.46, 0.5, 0.48]], neckR: 0.55, nAng: 0.1, neckK: 0.6, headK: 1, snoutK: 1,
      hK: 1, foreK: 1.06, hindK: 1, foreT: 1.25, hindT: 1.1, slope: 0.06, tailK: 1.25,
      skull: { rx: [0.42, 0.56, 0.6, 0.54, 0.46, 0.38, 0.32, 0.24], ry: [0.4, 0.52, 0.54, 0.46, 0.38, 0.32, 0.27, 0.2], hy: [0.08, 0.18, 0.2, 0.14, 0.05, -0.01, -0.04, -0.06], eye: [0.3, 1.0, 0.8, 0.05], cap: 0.2 },
      eyes: { rows: 3, pupil: 'v' }, fore: [0.66, 0.76, 0.42, 0.3, 0.28], hind: [0.7, 0.78, 0.42, 0.28, 0.26], limbSkin: true, tailScales: true,
      parts: [{ k: 'carapace', t0: -0.04, t1: 0.42, bands: 4, spread: 1.4, lift: 1.12, ramp: 'slate' }, { k: 'tailFan', size: 0.55, ramp: 'stampRed' }, { k: 'mane' }],
    },
  },
  fanfin: {
    id: 'fanfin', name: 'Fanfin Wader', latin: 'Flabellipinna vadans', role: 'grazer', plan: 'quadruped', lineage: 'vertebrate', cover: 'skin',
    concept: 'A tall wader descended from the lungfish-lizards: smooth wet skin, a fan of rayed frills behind the jaw that it spreads to cool its blood and to court, and a second fan at the tail tip. It sieves the shallows with a long soft snout.',
    genes: ['vert_quadruped', 'leg_hooved', 'eye_camera', 'molars', 'sail', 'ectotherm', 'brood_care'],
    sliders: { size: 0.45, len: 0.45, girth: 0.42, legLen: 0.85, legThick: 0.35, neck: 0.9, head: 0.4, tail: 0.6 },
    colors: { base: ['coral', 4], belly: ['bone', 4], pattern: ['coral', 2], accent: ['teal', 4], eye: ['ink', 1] }, pattern: 'spots', patScale: 0.5,
    form: {
      trunk: [[0.42, 0.5, 0.6], [0.46, 0.48, 0.56], [0.4, 0.44, 0.44], [0.42, 0.46, 0.44]], neckR: 0.38, nAng: 0.95, neckK: 1.35, headK: 0.75, snoutK: 1.25,
      hK: 1.05, foreK: 1.08, hindK: 1, foreT: 0.85, hindT: 0.9, slope: 0.08, tailK: 0.9,
      skull: { rx: [0.32, 0.44, 0.46, 0.4, 0.32, 0.25, 0.2, 0.17], ry: [0.34, 0.44, 0.46, 0.38, 0.3, 0.25, 0.21, 0.17], hy: [0.06, 0.15, 0.16, 0.1, 0.02, -0.03, -0.06, -0.08], eye: [0.24, 1.15, 1.1, 0.1], cap: 0.32 },
      eyes: { pupil: 'w' }, fore: [0.6, 0.62, 0.32, 0.21, 0.2], hind: [0.66, 0.7, 0.34, 0.21, 0.2],
      parts: [{ k: 'headFans', size: 1.1, ramp: 'teal' }, { k: 'tailFan', size: 0.5, ramp: 'teal' }, { k: 'finCrest', height: 0.18 }],
    },
  },
  gillnewt: {
    id: 'gillnewt', name: 'Gill-Eel', latin: 'Branchioserpens lentus', role: 'stalker', plan: 'quadruped', lineage: 'vertebrate', cover: 'slime',
    concept: 'A two-and-a-half-metre ambusher of the flooded grass: an eel-long body on four short paddling limbs, frilled external gills fanning behind the head, a crest fin from nape to tail. It lies in the mud with only the gills moving.',
    genes: ['vert_quadruped', 'leg_sprawl', 'eye_camera', 'tongue', 'amphib_skin', 'tail_fin', 'carnassials', 'brood_care'],
    sliders: { size: 0.32, len: 1, girth: 0.3, legLen: 0.4, legThick: 0.45, neck: 0.2, head: 0.5, tail: 1 },
    colors: { base: ['slate', 3], belly: ['teal', 4], pattern: ['ink', 1], accent: ['coral', 4], eye: ['brass', 4] }, pattern: 'spots', patScale: 0.6,
    form: {
      trunk: [[0.42, 0.44, 0.48], [0.44, 0.44, 0.48], [0.42, 0.42, 0.44], [0.42, 0.42, 0.42]], neckR: 0.5, nAng: 0.05, neckK: 0.8, headK: 0.85, snoutK: 0.9,
      hK: 0.8, foreK: 1, hindK: 1, foreT: 0.9, hindT: 1, slope: 0, tailK: 1.3,
      skull: { rx: [0.42, 0.52, 0.53, 0.5, 0.45, 0.38, 0.3, 0.2], ry: [0.3, 0.36, 0.38, 0.34, 0.28, 0.23, 0.18, 0.12], hy: [0.0, 0.06, 0.08, 0.06, 0.02, -0.01, -0.03, -0.05], eye: [0.22, 0.75, 0.9, 0.08], cap: 0.4 },
      eyes: { pupil: 'crescent' }, fore: [0.5, 0.62, 0.42, 0.32, 0.28], hind: [0.52, 0.64, 0.42, 0.32, 0.28],
      parts: [{ k: 'headFans', size: 0.8, ramp: 'coral' }],
    },
  },
  woolpuff: {
    id: 'woolpuff', name: 'Woolpuff', latin: 'Floccus auritus', role: 'mite', plan: 'quadruped', lineage: 'vertebrate', cover: 'fur',
    concept: 'A shin-high ball of fleece that lives in the screes, all ears: two broad round ear-fans that catch the footfall of hunters a field away. It browses lichen and freezes into a stone-coloured lump when the ears turn.',
    genes: ['vert_quadruped', 'leg_padded', 'eye_camera', 'ears_round', 'molars', 'shaggy', 'endotherm', 'live_birth'],
    sliders: { size: 0.0, len: 0.2, girth: 1, legLen: 0.2, legThick: 0.6, neck: 0.1, head: 0.6, tail: 0.0 },
    colors: { base: ['bone', 3], belly: ['bone', 2], pattern: ['stone', 3], accent: ['ochre', 4], eye: ['ink', 1] }, pattern: 'plain', patScale: 1,
    form: {
      trunk: [[0.5, 0.58, 0.58], [0.56, 0.64, 0.6], [0.56, 0.62, 0.58], [0.5, 0.56, 0.52]], neckR: 0.6, nAng: 0.2, neckK: 0.5, headK: 0.9, snoutK: 0.6,
      hK: 1.1, foreK: 1, hindK: 1, foreT: 1, hindT: 1, slope: 0, tailK: 0.3,
      skull: { rx: [0.4, 0.52, 0.56, 0.52, 0.44, 0.36, 0.3, 0.24], ry: [0.4, 0.52, 0.54, 0.46, 0.38, 0.32, 0.27, 0.21], hy: [0.06, 0.16, 0.18, 0.13, 0.05, 0.0, -0.03, -0.05], eye: [0.3, 1.0, 0.85, 0.11], cap: 0.25 },
      eyes: { pupil: 'round' }, fore: [0.6, 0.66, 0.5, 0.42, 0.44], hind: [0.62, 0.7, 0.5, 0.42, 0.44],
      parts: [{ k: 'wool', t0: -0.06, t1: 0.95, puff: 1.4, hang: 0.25 }],
    },
  },
  spiracle: {
    id: 'spiracle', name: 'Spiracle Strider', latin: 'Hexapodus quadroculus', role: 'tank', plan: 'hexapodV', lineage: 'vertebrate', cover: 'skin',
    concept: "A six-limbed grazer of this world's own vertebrate line: four eyes in two rows, a row of breathing spiracles down each flank feeding air sacs along the ribs, and a back shingled in olive plates. It plods in an unbreakable six-footed gait.",
    genes: ['vert_hexapod', 'leg_hooved', 'eye_camera', 'molars', 'osteoderms', 'ectotherm', 'fat_stores', 'live_birth'],
    sliders: { size: 0.6, len: 0.7, girth: 0.7, legLen: 0.45, legThick: 0.6, neck: 0.35, head: 0.5, tail: 0.4 },
    colors: { base: ['olive', 3], belly: ['straw', 3], pattern: ['olive', 1], accent: ['brass', 4], eye: ['ink', 1] }, pattern: 'bands', patScale: 1.4,
    form: {
      trunk: [[0.46, 0.52, 0.62], [0.5, 0.54, 0.6], [0.48, 0.52, 0.54], [0.46, 0.5, 0.5]], neckR: 0.48, nAng: 0.4, neckK: 0.9, headK: 0.85, snoutK: 1,
      hK: 1, foreK: 1, hindK: 1, foreT: 1, hindT: 1.05, slope: 0.03, tailK: 0.8,
      skull: { rx: [0.36, 0.48, 0.52, 0.46, 0.36, 0.28, 0.24, 0.2], ry: [0.36, 0.46, 0.5, 0.42, 0.34, 0.28, 0.25, 0.21], hy: [0.06, 0.15, 0.17, 0.11, 0.03, -0.03, -0.05, -0.08], eye: [0.24, 1.0, 1.0, 0.06], cap: 0.28 },
      eyes: { rows: 2, pupil: 'h' }, fore: [0.6, 0.68, 0.4, 0.28, 0.26], hind: [0.64, 0.72, 0.4, 0.28, 0.26], spiracles: 7, pits: true,
      parts: [{ k: 'plates', t0: 0.2, t1: 0.86, rows: 12, spread: 1.2, size: 0.3, ramp: 'olive' }],
    },
  },
};
void DEF_SKULL;

/** a wild individual of a bestiary species: the authored animal with a little heritable variation */
export function beastDesign(id: string, seed: number): Design {
  const B = BEASTS[id], r = new Rand(seed ^ 0x5eed);
  const j = (v: number, k = 0.05) => clamp(v + (r.next() - 0.5) * 2 * k, 0, 1);
  const c = (p: [RampName, number]) => T(p[0], p[1] + (r.chance(0.25) ? (r.chance(0.5) ? 1 : -1) : 0));
  const s = B.sliders;
  return {
    name: B.name, latin: B.latin, plan: B.plan, lineage: B.lineage, genes: [...B.genes],
    size: j(s.size, 0.06), len: j(s.len, 0.04), girth: j(s.girth, 0.04), legLen: j(s.legLen, 0.03), legThick: j(s.legThick, 0.03), neck: j(s.neck, 0.03), head: j(s.head, 0.03), tail: j(s.tail, 0.04),
    segs: 3, colors: { base: c(B.colors.base), belly: T(...B.colors.belly), pattern: T(...B.colors.pattern), accent: T(...B.colors.accent), eye: T(...B.colors.eye) },
    pattern: B.pattern, patScale: B.patScale, cover: B.cover, seed, beast: id,
  };
}
/** bestiary species that fill an ecological role */
export const beastsFor = (role: string) => Object.values(BEASTS).filter((b) => b.role === role).map((b) => b.id);
