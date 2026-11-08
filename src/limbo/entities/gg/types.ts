// Types for the low-poly people port (Gacha Garage people -> Limbo Phobia HumanRig).
import type { BoneName, RegKey } from '../humanModel';
import type { LookPart } from '../humanRig';

/** secondary bones (rigs built with { secondary: true }); without them the parts ride the fallback bone */
export const SEC_BONES = ['pack', 'hair', 'coat', 'badge', 'bust'] as const;
export type SecBone = typeof SEC_BONES[number];
export const SEC_PARENT: Record<SecBone, BoneName> = { pack: 'chest', hair: 'head', coat: 'hips', badge: 'chest', bust: 'chest' };
export type BoneKey = BoneName | SecBone;

/**
 * A segment: a prism between two horizontal cross-sections (rectangles with chamfered corners).
 * b / t: [cx, cz, hx, hz] at y0 / y1. ch: chamfer (fraction of the smaller half-size).
 * mat: painter key; part: anatomical name the painters use; caps: which end caps to build.
 */
export interface Seg {
  part: string; bone: BoneKey; mat: string; reg: RegKey;
  y0: number; y1: number; b: number[]; t: number[];
  ch: number; caps: 'both' | 'top' | 'bot' | 'none'; dens: number;
  block?: 'face';
  rot?: { p: number[]; e: number[] };
  /** hair edge cut (paint) */
  cut?: string;
  /** also emit the inside (reversed winding, painted as lining) */
  inner?: boolean;
  /** drop side faces whose normal z is above this (an open front: coats, the hazmat hood's face opening) */
  open?: number;
  /** skin the bottom / top ring half onto this bone too (no crack where a torso segment was split at a joint) */
  blendBot?: BoneKey; blendTop?: BoneKey;
  /** side of the body for mirrored limbs: 1 left, -1 right, 0 centre */
  side: number;
  /** garment layer this shell belongs to (paint) */
  layer?: string;
}

/** a resolved garment: what the painters need from an Outfit LookPart */
export interface Garm {
  kind: string; tex: string; item: string;
  col: number[]; col2?: number[]; col3?: number[];
  blood: number; wear: number;
  sleeve?: 'none' | 'cap' | 'short' | 'long';
  lp?: LookPart;
}

export interface Dress {
  top?: Garm; outer?: Garm; bottom?: Garm; legsKind: 'none' | 'pants' | 'shorts' | 'skirt' | 'brief';
  feet?: Garm; hands?: Garm; hat?: Garm; eyes?: Garm; mask?: Garm; back?: Garm & { size: number }; wrist?: Garm;
  /** visible sleeve of the outermost torso layer */
  sleeve: 'none' | 'cap' | 'short' | 'long';
  /** the top's hem is tucked into the trousers */
  tuck: boolean;
  /** hair pressed flat by a cosmetic hat */
  hatFlat: boolean;
  /** one-piece suit (jumpsuit, coveralls, hazmat): no waistband */
  suit: '' | 'jumpsuit' | 'coverall' | 'hazmat' | 'guard';
  /** hazmat suit details */
  hazmat?: { col: number[]; num: string; pattern: string; wear: number; stains: string; patch: string };
  /** researcher extras */
  badge?: { col: number[]; name: string };
  clipboard?: boolean;
}

export interface FaceSpec {
  iris: number[]; eyeW: number; eyeH: number; tilt: number; lid: 'double' | 'mono' | 'hooded';
  eyeShape: number; brows: number; browW: number; browArch: number; nose: number; mouth: number; ears: number;
  lipFull: number; lipstick?: number[]; blush: number;
  makeup?: { liner?: number; lash?: number; shadow?: number[] | null; blush?: number[]; highlight?: number; lower?: boolean };
  stubble: number; facial: string; freckles: number; scars: number; age: number;
  glasses?: { kind: 'rect' | 'round' | 'sun' | 'goggles'; col: number[]; thick: number };
  /** jaw width, chin, cheekbones, overall width, lower-face length, cheek hollow (humanLooks ShapeK) */
  shape: { jaw: number; chin: number; cheek: number; wide: number; long: number; hollow: number };
  tattoo?: string;
  /** baked expression for the condition ('' | 'pain' | 'fear') */
  expr: string;
}

export interface HairSpec { style: string; col: number[]; hi: number[]; grey: boolean; part: number; volume: number }

export interface GGSpec {
  seed: number;
  fem: number; w: number; mass: number; belly: number; bust: number; age: number;
  skin: number[];
  hair: HairSpec;
  face: FaceSpec;
  dress: Dress;
  sole: number;
}

/** proportions: landmark heights / widths in metres (rest pose, feet on y = 0, facing +z, +x = the character's left) */
export interface Props {
  H: number; hu: number; fem: number; w: number; s: number;
  crown: number; chin: number; neckBase: number; shoulderY: number; bustY: number; waistY: number; pelvisY: number;
  hipY: number; crotchY: number; kneeY: number; ankleY: number; elbowY: number; wristY: number; tipY: number; knuckY: number; fing2Y: number;
  shX: number; armZ: number; hipX: number;
  chestTopX: number; bustX: number; waistX: number; hipsX: number; hipsZ: number; chestZ: number; waistZ: number;
  bust: number; belly: number; thighX: number; armX: number; footL: number; footX: number;
  hw: number; hd: number; hcz: number; zf: number;
  eyeY: number; browY: number; noseY: number; mouthY: number; hairY: number; earTop: number; earBot: number; napeY: number;
  /** joint heights of the rig's torso bones */
  spineJ: number; chestJ: number; neckJ: number; headJ: number;
  sole: number;
}
