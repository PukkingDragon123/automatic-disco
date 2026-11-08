// Cosmetics: wearables issued at intake. Every piece is free: there is no
// research-point price, no purchase and no research node for any of them
// (the watch's research tree no longer lists cosmetics). The catalogue lives
// here (names, slots, colours) without three.js; the models are in
// src/entities/cosmetics3d.ts. What a debtor wears is part of their
// Appearance (`app.cos`, a list of keys, one per slot), which saves,
// replicates in co-op and dresses the in-game rig like any other looks.

import { isUnlocked } from './profile';

export type CosSlot = 'suit' | 'hat' | 'eyes' | 'face' | 'neck' | 'back';
export interface CosmeticDef {
  key: string; slot: CosSlot; name: string; desc: string;
  /** always 0: every piece is free (kept so older callers still compile) */
  cost: number;
  /** main colour (thumbnails, suit tint) */
  color: number;
  /** earned, not issued: an achievement unlocks it (profile 'cos:<key>', src/game/achievements.ts) */
  locked?: boolean;
}

export const COS_SLOTS: [CosSlot, string][] = [['suit', 'JUMPSUITS'], ['hat', 'HEADWEAR'], ['eyes', 'EYEWEAR'], ['face', 'FACE'], ['neck', 'NECK'], ['back', 'BACK']];

// the old price column stays in the table below for reference; every piece is issued free
const C = (key: string, slot: CosSlot, name: string, _oldCost: number, color: number, desc: string): CosmeticDef => ({ key, slot, name, cost: 0, color, desc });
export const COSMETICS: CosmeticDef[] = [
  // the jumpsuit itself (re-dyed or re-woven Remittance issue)
  C('suit_std', 'suit', 'Standard Issue', 0, 0xeeb415, 'Programme yellow. Visible from every tower.'),
  C('suit_orange', 'suit', 'Transfer Orange', 0, 0xe0682a, 'Issued for transport between wings.'),
  C('suit_grey', 'suit', 'Night Shift', 40, 0x5a5e62, 'Charcoal twill. The cameras like it less.'),
  C('suit_red', 'suit', 'Solitary Red', 90, 0xa82a22, 'Worn by the ones they keep apart.'),
  C('suit_white', 'suit', 'Infirmary White', 60, 0xe4e2d8, 'Shows every stain. That is the point.'),
  C('suit_stripe', 'suit', 'Old Stripes', 120, 0xd8d4c4, 'Black and white bars, from before the Institute.'),
  C('suit_hazard', 'suit', 'Hazard Detail', 150, 0xe8b52a, 'Chevrons on the limbs, for crews that work near the presses.'),
  C('suit_circuit', 'suit', 'Circuit Weave', 260, 0x1c2a30, 'Conductive thread in dead black. Glows where it touches skin.'),
  // commendation dyes (achievements): earned, never issued
  { ...C('suit_mint', 'suit', 'Probation Mint', 0, 0x7ae8b8, 'For staff who did not make it past the first minute.'), locked: true },
  { ...C('suit_sole', 'suit', 'Shoe Leather', 0, 0x8a5a32, 'The colour of the thing you fed to the press.'), locked: true },
  { ...C('suit_formalin', 'suit', 'Formalin Amber', 0, 0xc8842e, 'The colour of things kept in jars.'), locked: true },
  { ...C('suit_glass', 'suit', 'Cell Glass', 0, 0x6ac8e8, 'Cracked-pane blue. Do not tap.'), locked: true },
  { ...C('suit_red_ink', 'suit', 'In The Red', 0, 0xe02a3a, 'Ledger red. You owe it.'), locked: true },
  { ...C('suit_loyal', 'suit', 'Loyalty Purple', 0, 0x8a4ae8, 'For repeat customers of the same monster.'), locked: true },
  { ...C('suit_flat', 'suit', 'Pressed Grey', 0, 0xa8acb0, 'Very flat. Very grey.'), locked: true },
  { ...C('suit_field', 'suit', 'Field Green', 0, 0x5ad04a, 'Survey green, for ten specimens catalogued.'), locked: true },
  { ...C('suit_gold', 'suit', 'Tenure Gold', 0, 0xffc83a, 'For the permanently employed.'), locked: true },
  { ...C('suit_hivis', 'suit', 'Hi-Vis Lime', 0, 0xd8ff2a, 'So the cleanup crew can find you faster.'), locked: true },
  // codex milestones (src/game/codex.ts): earned at the research lab
  { ...C('suit_lab', 'suit', 'Lab White', 0, 0xeef0ea, 'Ten codex entries filed. Spotless, for now.'), locked: true },
  { ...C('suit_codex', 'suit', 'Codex Teal', 0, 0x2ab8a0, 'Half of everything catalogued. The ink never quite washes out.'), locked: true },
  { ...C('suit_curator', 'suit', 'Curator Gold', 0, 0xe8b830, 'The whole codex. The Institute has nothing left to teach you.'), locked: true },
  // headwear
  C('hat_watch', 'hat', 'Watch Cap', 0, 0x3a4a3a, 'Knitted from unravelled blankets.'),
  C('hat_bucket', 'hat', 'Bucket Hat', 50, 0x8a7a52, 'Canvas, a little mouldy.'),
  C('hat_crown', 'hat', 'Paper Crown', 80, 0xe8c84a, 'Folded from a final demand.'),
  C('hat_cone', 'hat', 'Traffic Cone', 120, 0xe85a1a, 'Found in a parking level that does not end.'),
  C('hat_tophat', 'hat', 'Debtor\'s Top Hat', 180, 0x1a1816, 'For the debtor who owes it in style.'),
  C('hat_antlers', 'hat', 'Wire Antlers', 220, 0x9a9488, 'Coat hangers, bent while nobody watched.'),
  C('hat_halo', 'hat', 'Neon Halo', 300, 0x7ff6ff, 'A ring of light that follows you. Nobody installed it.'),
  // eyewear
  C('eyes_shades', 'eyes', 'Visor Shades', 60, 0x141414, 'Wraparound. Hides where you are looking.'),
  C('eyes_cinema', 'eyes', 'Cinema Glasses', 70, 0xd83a3a, 'Red and cyan. The rooms look deeper.'),
  C('eyes_goggles', 'eyes', 'Welding Goggles', 90, 0x3a4a3a, 'Smoked glass, leather strap.'),
  C('eyes_monocle', 'eyes', 'Cracked Monocle', 110, 0xc8a04a, 'One lens, one crack, one opinion.'),
  C('eyes_led', 'eyes', 'LED Visor', 240, 0xff3a4a, 'A scrolling red bar where your eyes should be.'),
  // face
  C('face_bandana', 'face', 'Bandana', 50, 0x8a2a2a, 'For dust. Mostly for dust.'),
  C('face_resp', 'face', 'Respirator', 130, 0x3a3e40, 'Twin filters, rated for the pool levels.'),
  C('face_muzzle', 'face', 'Bite Muzzle', 160, 0x6a6460, 'A steel cage. Somebody thought you needed it.'),
  C('face_goalie', 'face', 'Goalie Mask', 200, 0xe8e4d8, 'White, drilled, unsettling.'),
  C('face_smile', 'face', 'Smile Plate', 280, 0xb8bcc0, 'A polished plate with a smile painted on.'),
  // neck
  C('neck_tags', 'neck', 'Dog Tags', 40, 0xb8bcc0, 'Somebody else\'s name, somebody else\'s blood type.'),
  C('neck_scarf', 'neck', 'Wool Scarf', 70, 0x4a6a8a, 'Long enough to catch in a press. Careful.'),
  C('neck_collar', 'neck', 'Shock Collar', 100, 0x2a2a2a, 'Disconnected. Probably.'),
  // back
  C('back_cable', 'back', 'Umbilical', 180, 0x2a2e30, 'A severed cable still plugged into your spine.'),
  C('back_tank', 'back', 'Coolant Tank', 220, 0x5a8a9a, 'Sloshes. Keeps something cold.'),
  C('back_wings', 'back', 'Tin Wings', 350, 0xb8bcc0, 'Riveted sheet metal. They do not work. Yet.'),
];
export const COSMETIC = new Map(COSMETICS.map((c) => [c.key, c]));
const SLOT_DEFAULT: Partial<Record<CosSlot, string>> = { suit: 'suit_std' };

/** every issued piece is owned; commendation dyes once their achievement is earned */
export function ownsCosmetic(key: string): boolean { const d = COSMETIC.get(key); return !!d && (!d.locked || isUnlocked('cos:' + key)); }
/** nothing costs anything */
export function canAffordCosmetic(key: string): boolean { return COSMETIC.has(key); }
/** nothing to buy: true for any catalogued piece, no points are spent */
export function buyCosmetic(key: string): boolean { return COSMETIC.has(key); }

type WithCos = { cos?: string[] };
/** the key worn in a slot (or null) */
export function wornIn(app: WithCos, slot: CosSlot): string | null {
  const k = (app.cos || []).find((x) => COSMETIC.get(x)?.slot === slot);
  return k ?? SLOT_DEFAULT[slot] ?? null;
}
/** put a cosmetic on (replacing the one in its slot), or clear the slot with key = null */
export function setWorn(app: WithCos, slot: CosSlot, key: string | null) {
  const rest = (app.cos || []).filter((x) => COSMETIC.get(x)?.slot !== slot);
  app.cos = key ? [...rest, key] : rest;
}
/** drop unknown keys (pieces no longer in the catalogue) and return what was dropped */
export function stripUnowned(app: WithCos): string[] {
  const out = (app.cos || []).filter((k) => !ownsCosmetic(k));
  if (out.length) app.cos = (app.cos || []).filter((k) => ownsCosmetic(k));
  return out;
}
