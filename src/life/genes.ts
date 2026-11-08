// The gene catalog. A gene belongs to a lineage (what it can be grafted onto) and a category; it grows a body
// part and/or shifts stats. Wild species carry genomes made of these; the Veyr absorbs them from corpses.
export type Lineage = 'arthropod' | 'vertebrate' | 'annelid' | 'mollusc' | 'hominid';
export type GeneCat = 'body' | 'limb' | 'sense' | 'feed' | 'defense' | 'meta' | 'repro';
export type Plan = 'hexapod' | 'octopod' | 'quadruped' | 'biped' | 'hexapodV' | 'serpent' | 'gastropod' | 'hominid';
export type Diet = 'herb' | 'carn' | 'omni' | 'scav';

export interface Stats {
  mass: number; hp: number; armor: number; speed: number; attack: number; attackRate: number; reach: number;
  sight: number; smell: number; stealth: number; upkeep: number; regen: number; stamina: number;
  poison: number; reflect: number; litter: number; gestation: number; maturity: number; lifespan: number;
  cold: number; heat: number; jump: number; fly: number; swim: number; climb: number; glow: number;
}
export const ZERO_STATS = (): Stats => ({
  mass: 0, hp: 0, armor: 0, speed: 0, attack: 0, attackRate: 0, reach: 0, sight: 0, smell: 0, stealth: 0, upkeep: 0, regen: 0, stamina: 0,
  poison: 0, reflect: 0, litter: 0, gestation: 0, maturity: 0, lifespan: 0, cold: 0, heat: 0, jump: 0, fly: 0, swim: 0, climb: 0, glow: 0,
});

export interface GeneDef {
  id: string; name: string; cat: GeneCat; lineage: Lineage;
  desc: string;
  /** body genes: the plan they unlock */
  plan?: Plan;
  /** the part this gene grows (morph reads it) */
  part?: string;
  /** additive stat effects, scaled by part size where it makes sense */
  fx?: Partial<Stats>;
  diet?: Diet;
  /** speciation rarity 1 common .. 3 rare */
  tier: 1 | 2 | 3;
}

const G = (g: GeneDef) => g;
export const GENES: GeneDef[] = [
  // ------------------------------------------------------------ body plans
  G({ id: 'exo_hexapod', name: 'Hexapod Exoskeleton', cat: 'body', lineage: 'arthropod', plan: 'hexapod', tier: 1, desc: 'Three body sections in a jointed chitin shell, six legs in alternating tripods. Light and quick; the shell caps how large it can grow.', fx: { armor: 0.08 } }),
  G({ id: 'exo_octopod', name: 'Arachnid Frame', cat: 'body', lineage: 'arthropod', plan: 'octopod', tier: 2, desc: 'A fused cephalothorax and soft abdomen on eight legs. Patient, stable, a natural ambusher.', fx: { stealth: 0.1, climb: 1 } }),
  G({ id: 'vert_quadruped', name: 'Quadruped Spine', cat: 'body', lineage: 'vertebrate', plan: 'quadruped', tier: 1, desc: 'An internal skeleton slung between four legs. Scales up well: bone grows with the body that carries it.', fx: { hp: 10 } }),
  G({ id: 'vert_biped', name: 'Cursorial Biped', cat: 'body', lineage: 'vertebrate', plan: 'biped', tier: 2, desc: 'Two strong legs and a counterweight tail. Built for sprints and lunges.', fx: { speed: 0.6 } }),
  G({ id: 'vert_hexapod', name: 'Six-Limbed Spine', cat: 'body', lineage: 'vertebrate', plan: 'hexapodV', tier: 3, desc: 'A vertebrate that kept a third pair of limbs: slow to turn, impossible to knock over.', fx: { hp: 20, stamina: 10 } }),
  G({ id: 'annelid_serpent', name: 'Segmented Body', cat: 'body', lineage: 'annelid', plan: 'serpent', tier: 1, desc: 'A hydrostatic chain of muscular rings. Moves by waves; slips through anything.', fx: { stealth: 0.15, swim: 1 } }),
  G({ id: 'mollusc_gastropod', name: 'Gastropod Body', cat: 'body', lineage: 'mollusc', plan: 'gastropod', tier: 1, desc: 'A soft body on one gliding foot. Slow, but nothing is as hard to kill once it withdraws.', fx: { hp: 15, regen: 0.4 } }),
  G({ id: 'hominid_frame', name: 'Upright Primate Frame', cat: 'body', lineage: 'hominid', plan: 'hominid', tier: 3, desc: 'His frame. Upright, long-legged, made for walking very far and carrying things.', fx: { stamina: 30, sight: 4 } }),

  // ------------------------------------------------------------ limbs
  G({ id: 'leg_jointed', name: 'Jointed Legs', cat: 'limb', lineage: 'arthropod', part: 'legs', tier: 1, desc: 'Slender segmented legs with hooked tarsi.', fx: { speed: 2.2, climb: 0.5 } }),
  G({ id: 'leg_saltatorial', name: 'Leaping Hind Legs', cat: 'limb', lineage: 'arthropod', part: 'jumplegs', tier: 2, desc: 'A swollen hind pair that stores energy like a spring: pounces cross gaps in one bound.', fx: { speed: 1.6, jump: 1 } }),
  G({ id: 'leg_raptorial', name: 'Raptorial Forelegs', cat: 'limb', lineage: 'arthropod', part: 'scythes', tier: 2, desc: 'Folded spined forelegs that strike faster than an eye can follow.', fx: { attack: 6, attackRate: 0.4 } }),
  G({ id: 'chela', name: 'Crushing Chelae', cat: 'limb', lineage: 'arthropod', part: 'pincers', tier: 2, desc: 'A pair of heavy claws. They hold and they crush.', fx: { attack: 5, armor: 0.05 } }),
  G({ id: 'wing_gossamer', name: 'Gossamer Wings', cat: 'limb', lineage: 'arthropod', part: 'bugwings', tier: 2, desc: 'Two pairs of veined membranes. Only light bodies get off the ground.', fx: { fly: 1, upkeep: 0.04 } }),
  G({ id: 'leg_padded', name: 'Padded Paws', cat: 'limb', lineage: 'vertebrate', part: 'paws', tier: 1, desc: 'Soft-soled plantigrade feet: quiet, sure-footed, adequate at everything.', fx: { speed: 3.2, stealth: 0.1 } }),
  G({ id: 'leg_cursorial', name: 'Running Legs', cat: 'limb', lineage: 'vertebrate', part: 'runlegs', tier: 2, desc: 'Long digitigrade legs that walk on their toes. Fast, fragile.', fx: { speed: 5, stamina: 10 } }),
  G({ id: 'leg_hooved', name: 'Keratin Hooves', cat: 'limb', lineage: 'vertebrate', part: 'hooves', tier: 2, desc: 'Single-toed hooves and long cannon bones: endurance runners.', fx: { speed: 4.4, stamina: 30 } }),
  G({ id: 'leg_pillar', name: 'Pillar Legs', cat: 'limb', lineage: 'vertebrate', part: 'pillars', tier: 2, desc: 'Columnar graviportal legs that carry great weight and refuse to hurry.', fx: { speed: 1.9, hp: 40 } }),
  G({ id: 'wing_scaled', name: 'Dusted Wings', cat: 'limb', lineage: 'arthropod', part: 'mothwings', tier: 2, desc: 'Broad wings shingled with powdery scales, painted with eyespots that stare back at predators.', fx: { fly: 1, stealth: 0.15, upkeep: 0.03 } }),
  G({ id: 'wing_patagium', name: 'Membrane Wings', cat: 'limb', lineage: 'vertebrate', part: 'batwings', tier: 3, desc: 'Skin stretched over elongated fingers. Flight, if the body stays light.', fx: { fly: 1, upkeep: 0.06 } }),
  G({ id: 'tail_balance', name: 'Counterweight Tail', cat: 'limb', lineage: 'vertebrate', part: 'tail', tier: 1, desc: 'A long tail that balances turns and lunges.', fx: { speed: 0.5, jump: 0.3 } }),
  G({ id: 'tail_club', name: 'Club Tail', cat: 'limb', lineage: 'vertebrate', part: 'clubtail', tier: 3, desc: 'Fused tail vertebrae ending in a bone mace.', fx: { attack: 8, armor: 0.04 } }),
  G({ id: 'leg_plantigrade', name: 'Plantigrade Paws', cat: 'limb', lineage: 'vertebrate', part: 'bearpaws', tier: 2, desc: 'Thick limbs on broad flat-footed paws, five long digging claws each. A rolling, heavy walk; a swipe that breaks bone.', fx: { speed: 2.8, attack: 3, hp: 25 } }),
  G({ id: 'leg_leaping', name: 'Leaping Legs', cat: 'limb', lineage: 'vertebrate', part: 'froglegs', tier: 2, desc: 'Long folded hind legs on webbed feet. It moves in bounds, and swims with frog kicks.', fx: { speed: 3.0, jump: 1.2, swim: 0.6 } }),
  G({ id: 'leg_sprawl', name: 'Sprawling Limbs', cat: 'limb', lineage: 'vertebrate', part: 'sprawl', tier: 1, desc: 'Short legs splayed out to the sides; the whole body swings in S-curves as it walks. Low, stable, quick in bursts.', fx: { speed: 2.5, climb: 0.6, stealth: 0.1 } }),
  G({ id: 'hump', name: 'Shoulder Hump', cat: 'limb', lineage: 'vertebrate', part: 'hump', tier: 2, desc: 'A mound of digging muscle over the shoulders that drives the forelimbs: it tears up roots, logs and burrows.', fx: { attack: 2, hp: 25, upkeep: 0.02 } }),
  G({ id: 'tail_fin', name: 'Paddle Tail', cat: 'limb', lineage: 'vertebrate', part: 'fintail', tier: 1, desc: 'A flattened tail with a fin crest above and below: a sculling oar.', fx: { swim: 1, speed: 0.3 } }),
  G({ id: 'tail_brush', name: 'Brush Tail', cat: 'limb', lineage: 'vertebrate', part: 'brushtail', tier: 1, desc: 'A great bushy tail: a blanket in the cold and a flag for the herd.', fx: { cold: 0.2, stealth: 0.05, speed: 0.2 } }),
  G({ id: 'setae', name: 'Bristle Grip', cat: 'limb', lineage: 'annelid', part: 'setae', tier: 1, desc: 'Rows of chitin bristles that grip soil and bark.', fx: { speed: 1.2, climb: 1 } }),
  G({ id: 'muscular_foot', name: 'Muscular Foot', cat: 'limb', lineage: 'mollusc', part: 'foot', tier: 1, desc: 'A single gliding sole riding on a film of slime.', fx: { speed: 0.8, regen: 0.2 } }),
  G({ id: 'tentacles', name: 'Grasping Tentacles', cat: 'limb', lineage: 'mollusc', part: 'tentacles', tier: 2, desc: 'Prehensile arms around the mouth.', fx: { attack: 3, reach: 0.6 } }),
  G({ id: 'hands', name: 'Opposable Hands', cat: 'limb', lineage: 'hominid', part: 'hands', tier: 3, desc: 'Hands that hold tools. Yours now.', fx: { attack: 4, reach: 0.3 } }),

  // ------------------------------------------------------------ senses
  G({ id: 'eye_compound', name: 'Compound Eyes', cat: 'sense', lineage: 'arthropod', part: 'compound', tier: 1, desc: 'Thousands of facets: poor detail, superb motion and a near-total field of view.', fx: { sight: 9 } }),
  G({ id: 'antennae', name: 'Chemoreceptive Antennae', cat: 'sense', lineage: 'arthropod', part: 'antennae', tier: 1, desc: 'They smell death from far away, and food, and you.', fx: { smell: 18 } }),
  G({ id: 'eye_camera', name: 'Camera Eyes', cat: 'sense', lineage: 'vertebrate', part: 'eyes', tier: 1, desc: 'A lens and a retina: long, sharp sight.', fx: { sight: 13 } }),
  G({ id: 'eye_binocular', name: 'Binocular Eyes', cat: 'sense', lineage: 'vertebrate', part: 'foreeyes', tier: 2, desc: 'Forward-facing eyes judge distance: a hunter\'s face.', fx: { sight: 11, attack: 2 } }),
  G({ id: 'ears', name: 'Great Pinnae', cat: 'sense', lineage: 'vertebrate', part: 'ears', tier: 1, desc: 'Big swivelling ears. Hidden things are heard.', fx: { smell: 6, sight: 3 } }),
  G({ id: 'electro', name: 'Electroreceptors', cat: 'sense', lineage: 'vertebrate', part: 'ampullae', tier: 3, desc: 'Gel pores that read electric fields. Your field, too: they resonate with it.', fx: { sight: 6, smell: 6 } }),
  G({ id: 'eye_bulging', name: 'Bulging Eyes', cat: 'sense', lineage: 'vertebrate', part: 'bugeyes', tier: 1, desc: 'Domed eyes high on the head: it watches the bank from just under the surface.', fx: { sight: 10, stealth: 0.05 } }),
  G({ id: 'whiskers', name: 'Vibrissae', cat: 'sense', lineage: 'vertebrate', part: 'whiskers', tier: 1, desc: 'Long tactile whiskers that read air currents and the shape of the dark.', fx: { smell: 6, stealth: 0.05 } }),
  G({ id: 'ears_round', name: 'Rounded Ears', cat: 'sense', lineage: 'vertebrate', part: 'roundears', tier: 1, desc: 'Small furred ears close to the skull. They lose no heat and miss little.', fx: { smell: 5, sight: 2, cold: 0.1 } }),
  G({ id: 'eye_spots', name: 'Eyespots', cat: 'sense', lineage: 'annelid', part: 'eyespots', tier: 1, desc: 'Light and dark, nothing more.', fx: { sight: 5, smell: 8 } }),
  G({ id: 'eye_stalks', name: 'Eye Stalks', cat: 'sense', lineage: 'mollusc', part: 'stalks', tier: 1, desc: 'Retractable stalked eyes.', fx: { sight: 8 } }),
  G({ id: 'hominid_eyes', name: 'Primate Eyes', cat: 'sense', lineage: 'hominid', part: 'eyes', tier: 3, desc: 'Colour vision and a mind behind it.', fx: { sight: 15 } }),

  // ------------------------------------------------------------ feeding
  G({ id: 'mandibles', name: 'Mandibles', cat: 'feed', lineage: 'arthropod', part: 'mandibles', diet: 'omni', tier: 1, desc: 'Sideways-closing jaws that chew leaf and flesh alike.', fx: { attack: 3, attackRate: 0.3 } }),
  G({ id: 'venom_fangs', name: 'Venom Chelicerae', cat: 'feed', lineage: 'arthropod', part: 'fangs', diet: 'carn', tier: 2, desc: 'Hollow fangs. The bite is small; what follows is not.', fx: { attack: 2, poison: 3 } }),
  G({ id: 'proboscis', name: 'Piercing Proboscis', cat: 'feed', lineage: 'arthropod', part: 'proboscis', diet: 'herb', tier: 1, desc: 'A coiled tube for sap and nectar.', fx: { upkeep: -0.02 } }),
  G({ id: 'carnassials', name: 'Shearing Teeth', cat: 'feed', lineage: 'vertebrate', part: 'fangsV', diet: 'carn', tier: 1, desc: 'Blade-like teeth that slice meat.', fx: { attack: 7, attackRate: 0.2 } }),
  G({ id: 'molars', name: 'Grinding Molars', cat: 'feed', lineage: 'vertebrate', part: 'snout', diet: 'herb', tier: 1, desc: 'Flat teeth and a deep jaw for tough plants.', fx: { upkeep: -0.03, hp: 10 } }),
  G({ id: 'beak', name: 'Crushing Beak', cat: 'feed', lineage: 'vertebrate', part: 'beak', diet: 'omni', tier: 2, desc: 'A keratin beak that cracks shells and seeds.', fx: { attack: 5 } }),
  G({ id: 'tusks', name: 'Tusks', cat: 'feed', lineage: 'vertebrate', part: 'tusks', diet: 'omni', tier: 2, desc: 'Overgrown incisors for digging and goring.', fx: { attack: 6, armor: 0.02 } }),
  G({ id: 'tongue', name: 'Sticky Tongue', cat: 'feed', lineage: 'vertebrate', part: 'tongue', diet: 'carn', tier: 2, desc: 'A folded tongue that flicks out and snaps back with whatever it touched.', fx: { reach: 0.9, attack: 3, attackRate: 0.35 } }),
  G({ id: 'ring_maw', name: 'Ring Maw', cat: 'feed', lineage: 'annelid', part: 'maw', diet: 'scav', tier: 1, desc: 'A circle of inward teeth. Swallows what it can, rasps what it cannot.', fx: { attack: 4, regen: 0.2 } }),
  G({ id: 'radula', name: 'Rasping Radula', cat: 'feed', lineage: 'mollusc', part: 'radula', diet: 'herb', tier: 1, desc: 'A ribbon of tiny teeth that files plants away.', fx: { upkeep: -0.02 } }),
  G({ id: 'omni_teeth', name: 'Omnivore Teeth', cat: 'feed', lineage: 'hominid', part: 'mouth', diet: 'omni', tier: 3, desc: 'Teeth for everything.', fx: { attack: 2 } }),

  // ------------------------------------------------------------ defense
  G({ id: 'elytra', name: 'Elytra Shell', cat: 'defense', lineage: 'arthropod', part: 'elytra', tier: 1, desc: 'Hardened forewings closed over the back like a shield.', fx: { armor: 0.18, speed: -0.3 } }),
  G({ id: 'stinger', name: 'Stinger', cat: 'defense', lineage: 'arthropod', part: 'stinger', tier: 2, desc: 'A barbed abdominal sting full of venom.', fx: { poison: 4, attack: 2 } }),
  G({ id: 'chitin_spines', name: 'Chitin Spines', cat: 'defense', lineage: 'arthropod', part: 'spines', tier: 1, desc: 'Thorny outgrowths. Biting this hurts.', fx: { reflect: 0.2 } }),
  G({ id: 'aposematic', name: 'Warning Colours', cat: 'defense', lineage: 'arthropod', part: 'warning', tier: 1, desc: 'Loud colours that predators learn to leave alone.', fx: { stealth: -0.3, reflect: 0.1 } }),
  G({ id: 'osteoderms', name: 'Bony Plates', cat: 'defense', lineage: 'vertebrate', part: 'plates', tier: 2, desc: 'Bone grown into the skin: a domed armoured carapace.', fx: { armor: 0.32, speed: -1.2, hp: 30 } }),
  G({ id: 'quills', name: 'Quills', cat: 'defense', lineage: 'vertebrate', part: 'quills', tier: 2, desc: 'Barbed hollow spines that come out in the attacker.', fx: { reflect: 0.35, armor: 0.05 } }),
  G({ id: 'horns', name: 'Horns', cat: 'defense', lineage: 'vertebrate', part: 'horns', tier: 1, desc: 'Bone cores sheathed in keratin. For fighting rivals and the things that eat you.', fx: { attack: 4, armor: 0.04 } }),
  G({ id: 'antlers', name: 'Branching Antlers', cat: 'defense', lineage: 'vertebrate', part: 'antlers', tier: 2, desc: 'Shed and regrown every season; a crown for duels.', fx: { attack: 5, sight: 1 } }),
  G({ id: 'fur', name: 'Dense Fur', cat: 'defense', lineage: 'vertebrate', part: 'fur', tier: 1, desc: 'An insulating coat: warmth, and a little padding.', fx: { cold: 0.5, armor: 0.04, upkeep: 0.01 } }),
  G({ id: 'cryptic', name: 'Cryptic Pelt', cat: 'defense', lineage: 'vertebrate', part: 'camo', tier: 2, desc: 'A coat patterned to vanish into the ground cover.', fx: { stealth: 0.4 } }),
  G({ id: 'shaggy', name: 'Shaggy Coat', cat: 'defense', lineage: 'vertebrate', part: 'shag', tier: 2, desc: 'Long layered guard hair over dense underfur: heavy on the shoulders and belly, short on the face.', fx: { cold: 0.8, armor: 0.07, upkeep: 0.01 } }),
  G({ id: 'mane', name: 'Great Mane', cat: 'defense', lineage: 'vertebrate', part: 'mane', tier: 2, desc: 'A thick ruff of long hair framing the head and throat. It turns bites and makes the wearer look twice its size.', fx: { armor: 0.05, attack: 1, stealth: -0.1 } }),
  G({ id: 'crest', name: 'Dorsal Crest', cat: 'defense', lineage: 'vertebrate', part: 'crest', tier: 1, desc: 'A ridge down the spine: a bristle crest on a furred back, a wavy skin crest on a wet one, a row of spiked scales on a dry one.', fx: { reflect: 0.1, stealth: -0.05 } }),
  G({ id: 'wattle', name: 'Throat Wattle', cat: 'defense', lineage: 'vertebrate', part: 'wattle', tier: 1, desc: 'A flap of skin under the throat, flushed with colour: a bell of hair on a moose, a bright fan on a lizard.', fx: { stealth: -0.1, reflect: 0.05, heat: 0.2 } }),
  G({ id: 'frill', name: 'Neck Frill', cat: 'defense', lineage: 'vertebrate', part: 'frill', tier: 2, desc: 'A flared collar of skin on bony struts that snaps open in a threat display.', fx: { reflect: 0.15, armor: 0.04 } }),
  G({ id: 'shell_scute', name: 'Scute Shell', cat: 'defense', lineage: 'vertebrate', part: 'scutes', tier: 2, desc: 'A domed bony box under horn scutes. Slow, and very nearly unkillable.', fx: { armor: 0.45, speed: -1.0, hp: 40 } }),
  G({ id: 'horns_ram', name: 'Spiral Horns', cat: 'defense', lineage: 'vertebrate', part: 'ramhorns', tier: 2, desc: 'Heavy ridged horns that curl back around the ears: built for head-on collisions.', fx: { attack: 6, armor: 0.05 } }),
  G({ id: 'antlers_palm', name: 'Palmate Antlers', cat: 'defense', lineage: 'vertebrate', part: 'palmate', tier: 3, desc: 'Huge flattened antler shovels fringed with tines: the heaviest crown there is.', fx: { attack: 7, sight: 1, upkeep: 0.02 } }),
  G({ id: 'carapace_crab', name: 'Crab Carapace', cat: 'defense', lineage: 'arthropod', part: 'carapace', tier: 2, desc: 'A broad, flat, toothed shell over the whole body, with eyes on stalks at its rim.', fx: { armor: 0.3, speed: -0.4, hp: 15 } }),
  G({ id: 'horn_beetle', name: 'Rhinoceros Horn', cat: 'defense', lineage: 'arthropod', part: 'bhorn', tier: 2, desc: 'A curved horn on the head and a second on the thorax: pincers for prying rivals off branches.', fx: { attack: 5, armor: 0.05 } }),
  G({ id: 'shell', name: 'Spiral Shell', cat: 'defense', lineage: 'mollusc', part: 'shell', tier: 1, desc: 'A coiled calcite house to withdraw into.', fx: { armor: 0.4, speed: -0.3 } }),
  G({ id: 'mucus', name: 'Mucus Coat', cat: 'defense', lineage: 'annelid', part: 'slime', tier: 1, desc: 'Slippery and foul-tasting.', fx: { reflect: 0.1, regen: 0.3 } }),

  // ------------------------------------------------------------ metabolism (lineage-agnostic in effect, but carried by lineages)
  G({ id: 'ectotherm', name: 'Cold Blood', cat: 'meta', lineage: 'arthropod', tier: 1, desc: 'Runs on the sun: cheap to keep, sluggish in cold and dark.', fx: { upkeep: -0.05, heat: 0.3, cold: -0.3 } }),
  G({ id: 'endotherm', name: 'Warm Blood', cat: 'meta', lineage: 'vertebrate', tier: 1, desc: 'An inner furnace: fast recovery, constant hunger.', fx: { upkeep: 0.06, regen: 0.6, stamina: 20, cold: 0.3 } }),
  G({ id: 'fat_stores', name: 'Fat Stores', cat: 'meta', lineage: 'vertebrate', tier: 1, desc: 'Reserves for lean seasons.', fx: { hp: 15, upkeep: -0.02, cold: 0.2 } }),
  G({ id: 'amphib_skin', name: 'Glandular Skin', cat: 'meta', lineage: 'vertebrate', part: 'wetskin', tier: 1, desc: 'Thin wet skin that breathes, studded with warts that ooze a bitter toxin.', fx: { poison: 2, swim: 0.8, regen: 0.3, heat: -0.3 } }),
  G({ id: 'gills', name: 'External Gills', cat: 'meta', lineage: 'vertebrate', part: 'gills', tier: 2, desc: 'Feathery red gill tufts behind the head: it breathes water as easily as air.', fx: { swim: 1.5, regen: 0.2 } }),
  G({ id: 'sail', name: 'Dorsal Sail', cat: 'meta', lineage: 'vertebrate', part: 'sail', tier: 3, desc: 'A tall fan of skin on long spines: it soaks up the morning sun and dumps heat at noon.', fx: { heat: 0.5, cold: 0.3, regen: 0.2, stamina: 10 } }),
  G({ id: 'chloro_skin', name: 'Chloroplast Skin', cat: 'meta', lineage: 'mollusc', tier: 3, desc: 'Stolen plastids under the skin: it eats light.', fx: { upkeep: -0.08, regen: 0.4 } }),
  G({ id: 'scav_gut', name: 'Scavenger Gut', cat: 'meta', lineage: 'annelid', tier: 1, desc: 'Digests rot that would kill anything else.', fx: { regen: 0.3 } }),
  G({ id: 'ferment_gut', name: 'Fermenting Gut', cat: 'meta', lineage: 'vertebrate', tier: 2, desc: 'Chambers of microbes that unlock cellulose.', fx: { upkeep: -0.04, hp: 10 } }),
  G({ id: 'biolum', name: 'Bioluminescence', cat: 'meta', lineage: 'arthropod', part: 'lantern', tier: 2, desc: 'Cold light in the body: signals mates, lures prey, lights the dark.', fx: { glow: 1, sight: 3 } }),
  G({ id: 'tracheal', name: 'Bellows Tracheae', cat: 'meta', lineage: 'arthropod', tier: 3, desc: 'Pumped air sacs that let an exoskeleton grow far larger than it should.', fx: { stamina: 15 } }),

  // ------------------------------------------------------------ reproduction
  G({ id: 'egg_clutch', name: 'Egg Clutches', cat: 'repro', lineage: 'arthropod', tier: 1, desc: 'Many small eggs. Most are eaten. Enough are not.', fx: { litter: 4, gestation: 30, maturity: 40 } }),
  G({ id: 'live_birth', name: 'Live Birth', cat: 'repro', lineage: 'vertebrate', tier: 1, desc: 'Few young, carried long and born strong.', fx: { litter: 1, gestation: 70, maturity: 70, hp: 10 } }),
  G({ id: 'budding', name: 'Budding', cat: 'repro', lineage: 'annelid', tier: 1, desc: 'Splits off copies of itself. Fast, and every copy is the same.', fx: { litter: 2, gestation: 25, maturity: 30 } }),
  G({ id: 'brood_care', name: 'Brood Care', cat: 'repro', lineage: 'vertebrate', tier: 2, desc: 'Parents guard and feed their young.', fx: { litter: 1, maturity: -25, hp: 5 } }),
  G({ id: 'egg_capsule', name: 'Egg Capsules', cat: 'repro', lineage: 'mollusc', tier: 1, desc: 'Gel-wrapped eggs laid in damp places.', fx: { litter: 3, gestation: 40, maturity: 50 } }),
  G({ id: 'spawn', name: 'Frogspawn', cat: 'repro', lineage: 'vertebrate', tier: 1, desc: 'Clouds of jelly-wrapped eggs laid in still water. The tadpoles do the rest.', fx: { litter: 4, gestation: 26, maturity: 35 } }),
  G({ id: 'rapid_molt', name: 'Rapid Molting', cat: 'repro', lineage: 'arthropod', tier: 2, desc: 'Young shed and grow in a fraction of the time.', fx: { maturity: -20 } }),
];
export const GENE: Record<string, GeneDef> = Object.fromEntries(GENES.map((g) => [g.id, g]));
export const CAT_NAMES: Record<GeneCat, string> = { body: 'Body Plan', limb: 'Limbs', sense: 'Senses', feed: 'Feeding', defense: 'Defense', meta: 'Metabolism', repro: 'Reproduction' };
export const LINEAGE_NAMES: Record<Lineage, string> = { arthropod: 'Arthropod', vertebrate: 'Vertebrate', annelid: 'Annelid', mollusc: 'Mollusc', hominid: 'Hominid' };
export const PLAN_LINEAGE: Record<Plan, Lineage> = { hexapod: 'arthropod', octopod: 'arthropod', quadruped: 'vertebrate', biped: 'vertebrate', hexapodV: 'vertebrate', serpent: 'annelid', gastropod: 'mollusc', hominid: 'hominid' };
/** which limb genes can serve as a plan's walking legs */
export const PLAN_LEGS: Record<Plan, string[]> = {
  hexapod: ['leg_jointed', 'leg_saltatorial'], octopod: ['leg_jointed'], quadruped: ['leg_padded', 'leg_cursorial', 'leg_hooved', 'leg_pillar', 'leg_plantigrade', 'leg_leaping', 'leg_sprawl'],
  biped: ['leg_cursorial', 'leg_padded', 'leg_hooved'], hexapodV: ['leg_padded', 'leg_hooved', 'leg_pillar', 'leg_plantigrade', 'leg_sprawl'], serpent: ['setae'], gastropod: ['muscular_foot'], hominid: ['leg_padded'],
};

/**
 * Can a gene be used on a creature of this lineage? Same lineage always; foreign genes need the Veyr's splicing
 * level (absorbing 3+ lineages teaches the field to bridge them), and never body plans.
 */
export function compatible(g: GeneDef, lineage: Lineage, splice: number): boolean {
  if (g.lineage === lineage) return true;
  if (g.cat === 'body') return false;
  if (g.cat === 'meta' || g.cat === 'repro') return splice >= 1;
  return splice >= 2;
}
