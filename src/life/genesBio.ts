// Functional genes: the production engine (PILLARS.md, pillar 0). Every gene here gives a design a FUNCTION it
// performs in the field when it belongs to the Veyr: diggers and terraformers, producers (ore gizzards, silica crops,
// silk and oil glands, crystal coral, milk), ecosystem changers, labour and war, and control genes that keep
// engineered life obedient and contained. Plant genes go onto sown prefabs (resin farms, metal-root fields, biofuel
// ponds, orchards).
//
// Each gene names:
//   part     the anatomy hook a body builder can render (the fauna agent reads `part`; `bio.anat` says where and how)
//   bio.fn   what it does: the job it enables, the item it makes and its base rate per minute at gene level 1
//   bio.src  where it comes from: wild species carrying any of the `marker` genes also carry this one (the runtime
//            seeds their genomes), so absorbing them sequences it; plant genes come from saving plant prefabs
// The GENE table merges these in with one import in genes.ts; the lab files them under the WORKS tab.
import type { GeneDef, GeneCat, Lineage, Stats } from './genes';

/** what a function does in the field */
export type FnKind =
  | 'dig' | 'tunnel' | 'mound' | 'spring'
  | 'ore' | 'silica' | 'silk' | 'oil' | 'crystal' | 'milk' | 'fleece'
  | 'resin' | 'metalroot' | 'algae' | 'fruit' | 'nitro' | 'greener'
  | 'wetland' | 'binder' | 'pollinate' | 'decompose' | 'pest'
  | 'haul' | 'operate' | 'guard' | 'soldier'
  | 'docile' | 'lock' | 'sterile' | 'growth';
/** the job board column a function belongs to */
export type FnGroup = 'dig' | 'produce' | 'eco' | 'labour' | 'war' | 'control';
/** how the work looks: the runtime picks the animation and the drawn effects from it */
export type WorkLook = 'paw' | 'snout' | 'cement' | 'sniff' | 'chew' | 'peck' | 'spin' | 'still' | 'graze' | 'weep' | 'root' | 'bloom' | 'wade' | 'flit' | 'rend' | 'carry' | 'tend' | 'watch' | 'none';
/** the items a function makes (factory item ids: src/factory/items.ts draws them) */
export type BioItemId = 'iron_pellet' | 'glass_bead' | 'silk' | 'bio_oil' | 'resin' | 'crystal' | 'protein' | 'algae_fuel' | 'fruit' | 'ore' | 'soil' | 'water' | 'carbon';

export interface BioFn {
  kind: FnKind; group: FnGroup;
  /** base output per minute at gene level 1 for a 100 kg body (items, or m3 of ground for terraformers) */
  rate: number;
  item?: BioItemId;
  /** what it works on: the runtime walks to the nearest one of these */
  needs?: 'rock' | 'sand' | 'water' | 'corpse' | 'plants' | 'pests' | 'ground' | 'machine';
  /** the unit shown with the rate ('m3' for ground moved) */
  unit: string;
  /** verb for the record sheet: "DIGS 2.4 M3/MIN" */
  verb: string;
  look: WorkLook;
  /** extra upkeep (food per minute) the organ costs */
  cost: number;
}
export interface Anatomy {
  /** the body area it grows on */
  at: 'forelimbs' | 'snout' | 'jaw' | 'head' | 'back' | 'belly' | 'gut' | 'flank' | 'tail' | 'hide' | 'glands' | 'skull' | 'feet' | 'bark' | 'roots' | 'fronds' | 'flowers';
  /** a short description of the visible part, for whoever models it */
  part: string;
}
export interface BioInfo {
  fn: BioFn; anat: Anatomy;
  src: { marker: string[]; note: string };
  /** a plant gene: goes onto sown prefabs, never onto creatures */
  plant?: true;
  /** existing combat genes this one works with (the lab suggests them together) */
  links?: string[];
  /** a technology grants it as well (skills.ts id) */
  skill?: string;
}
export interface BioGeneDef extends GeneDef { bio: BioInfo }

type Opt = { id: string; name: string; cat: GeneCat; lineage: Lineage; tier: 1 | 2 | 3; desc: string; part: string; fx?: Partial<Stats> } & BioInfo;
const B = (o: Opt): BioGeneDef => {
  const { fn, anat, src, plant, links, skill, ...g } = o;
  return { ...g, bio: { fn, anat, src, plant, links, skill } };
};
const F = (kind: FnKind, group: FnGroup, rate: number, unit: string, verb: string, look: WorkLook, cost: number, x: Partial<BioFn> = {}): BioFn => ({ kind, group, rate, unit, verb, look, cost, ...x });

export const BIO_GENES: BioGeneDef[] = [
  // ------------------------------------------------------------------------------------------ dig and terraform
  B({
    id: 'dig_claws', name: 'Burrower Claws', cat: 'limb', lineage: 'vertebrate', tier: 1, part: 'digclaws',
    desc: 'Spade-broad forepaws with five long, flattened claws and a bony keel down each palm. It tears the ground open and throws it back between its legs: pits, trenches and channels.',
    fx: { attack: 2, speed: -0.3 },
    fn: F('dig', 'dig', 2.4, 'M3', 'DIGS', 'paw', 0.25, { item: 'soil', needs: 'ground' }),
    anat: { at: 'forelimbs', part: 'Shortened forearms, oversized spatulate claws (5), keeled palm pads; soil packed in the fur of the wrists.' },
    src: { marker: ['leg_plantigrade', 'hump'], note: 'Bears and other diggers carry it.' },
  }),
  B({
    id: 'tunnel_snout', name: 'Tunnelling Snout', cat: 'sense', lineage: 'vertebrate', tier: 2, part: 'drillsnout',
    desc: 'A hardened, ridged snout plate with a ring of fleshy feelers. It bores narrow tunnels and drains: slower than claws, but it moves through clay and roots.',
    fx: { smell: 6, armor: 0.02 },
    fn: F('tunnel', 'dig', 1.4, 'M3', 'TUNNELS', 'snout', 0.15, { item: 'soil', needs: 'ground' }),
    anat: { at: 'snout', part: 'A keratin boring plate over the nose, ribbed in rings, fringed with 11 short tactile feelers; tiny eyes.' },
    src: { marker: ['tusks', 'whiskers'], note: 'Rooting boars and whiskered burrowers.' },
  }),
  B({
    id: 'mound_glands', name: 'Mound-Builder Glands', cat: 'meta', lineage: 'arthropod', tier: 2, part: 'cementglands',
    desc: 'Salivary glands that turn chewed soil into a quick-setting cement. A colony raises ground: walls, ramps, dams and spires that walkers must go round.',
    fx: { upkeep: 0.01 },
    fn: F('mound', 'dig', 1.2, 'M3', 'RAISES', 'cement', 0.2, { needs: 'ground' }),
    anat: { at: 'jaw', part: 'Swollen pale throat sacs under the mandibles, glistening; mud-caked mouthparts.' },
    src: { marker: ['mandibles'], note: 'Social chewing insects (mites, beetles).' },
  }),
  B({
    id: 'water_finder', name: 'Dowsing Organ', cat: 'sense', lineage: 'vertebrate', tier: 2, part: 'dowsepits',
    desc: 'A row of pressure pits along the jaw that hear water moving under the ground. It noses out the groundwater, digs down to it and opens a spring that keeps running.',
    fx: { smell: 4, sight: 1 },
    fn: F('spring', 'dig', 0.5, 'SPRING', 'OPENS', 'sniff', 0.1, { item: 'water', needs: 'ground' }),
    anat: { at: 'head', part: 'Seven paired gel-filled pits along the lower jaw and a wet, ridged nose leather.' },
    src: { marker: ['electro', 'gills', 'eye_bulging'], note: 'Electric-sensing and water-dwelling animals.' },
  }),

  // ------------------------------------------------------------------------------------------ producers
  B({
    id: 'ore_gizzard', name: 'Ore Gizzard', cat: 'meta', lineage: 'arthropod', tier: 2, part: 'oregizzard',
    desc: 'A muscular grinding crop lined with chitin teeth, and a bacterial smelting gut behind it. It eats rock and ore and passes refined iron as hard, dark pellets.',
    fx: { hp: 10, upkeep: 0.02 },
    fn: F('ore', 'produce', 4, 'PELLETS', 'PASSES', 'chew', 0.3, { item: 'iron_pellet', needs: 'rock' }),
    anat: { at: 'belly', part: 'A swollen, ribbed gizzard bulge low on the belly, rust-stained; heavy grinding mouthparts flecked with grit.' },
    src: { marker: ['carapace_crab', 'osteoderms', 'shell_scute'], note: 'Crabs and armoured grazers grind grit to build their plates.' },
  }),
  B({
    id: 'silica_crop', name: 'Silica Crop', cat: 'meta', lineage: 'vertebrate', tier: 2, part: 'silicacrop',
    desc: 'A heated crop that swallows sand, melts the silica in a slurry of enzymes and coughs up clear glass beads. Desert and shore are its pasture.',
    fx: { heat: 0.3, upkeep: 0.01 },
    fn: F('silica', 'produce', 3, 'BEADS', 'COUGHS UP', 'peck', 0.25, { item: 'glass_bead', needs: 'sand' }),
    anat: { at: 'flank', part: 'A translucent throat pouch with a glassy sheen and visible beads inside; scorched-looking chin.' },
    src: { marker: ['beak', 'leg_sprawl'], note: 'Beaked animals swallow grit; lizards bask on sand.' },
  }),
  B({
    id: 'silk_glands', name: 'Silk Glands', cat: 'meta', lineage: 'arthropod', tier: 1, part: 'spinnerets',
    desc: 'Paired silk glands and a fan of spinnerets. It sits and draws fibre: cordage, sacking, filters and the glazing bars of a habitat dome.',
    fx: { upkeep: 0.01, stealth: 0.05 },
    fn: F('silk', 'produce', 3.5, 'SPOOLS', 'SPINS', 'spin', 0.2, { item: 'silk' }),
    anat: { at: 'tail', part: 'Three pairs of finger-like spinnerets at the rear, white silk trailing; a pale, striped abdomen.' },
    src: { marker: ['wing_scaled', 'exo_octopod'], note: 'Moths and spiders.' },
  }),
  B({
    id: 'oil_glands', name: 'Tallow Glands', cat: 'meta', lineage: 'vertebrate', tier: 1, part: 'oilglands',
    desc: 'Rendering glands under a greasy pelt that sweat out a clear fuel oil. Boilers and the bio-reactor burn it.',
    fx: { cold: 0.2, upkeep: 0.02 },
    fn: F('oil', 'produce', 2.5, 'L OIL', 'SWEATS', 'still', 0.35, { item: 'bio_oil' }),
    anat: { at: 'back', part: 'Rows of waxy gland pores along the spine, an oily sheen on the coat, drips at the flanks.' },
    src: { marker: ['fat_stores', 'sail'], note: 'Fat-storing grazers.' },
  }),
  B({
    id: 'crystal_coral', name: 'Crystal Coral', cat: 'defense', lineage: 'mollusc', tier: 3, part: 'crystalcoral',
    desc: 'A colony of polyps on the shell that lay down quartz instead of lime. The crystals are snapped off when ripe; more grow in their place.',
    fx: { armor: 0.08, speed: -0.2 },
    fn: F('crystal', 'produce', 1.2, 'CRYSTALS', 'GROWS', 'still', 0.2, { item: 'crystal' }),
    anat: { at: 'back', part: 'Clusters of six-sided clear quartz points growing out of a pitted coral crust over the back or shell.' },
    src: { marker: ['shell', 'chloro_skin'], note: 'Shelled molluscs.' },
  }),
  B({
    id: 'milk_glands', name: 'Milk Glands', cat: 'meta', lineage: 'vertebrate', tier: 1, part: 'udder',
    desc: 'Heavy milk glands that keep yielding whether or not there is a calf. Herds kept on pasture fill the pails every cycle: protein for workers and growth medium for the vats.',
    fx: { upkeep: 0.02, hp: 5 },
    fn: F('milk', 'produce', 3, 'PAILS', 'YIELDS', 'graze', 0.35, { item: 'protein', needs: 'plants' }),
    anat: { at: 'belly', part: 'A full udder between the hind legs with four teats; veins visible under thin belly skin.' },
    src: { marker: ['ferment_gut', 'live_birth'], note: 'Ruminant grazers.' },
  }),
  B({
    id: 'fleece', name: 'Fibre Fleece', cat: 'defense', lineage: 'vertebrate', tier: 1, part: 'fleece',
    desc: 'A coat that grows without moulting. Shorn every cycle, it gives fibre as good as silk, and the herd stays warm.',
    fx: { cold: 0.4, armor: 0.03 },
    fn: F('fleece', 'produce', 2, 'SPOOLS', 'GROWS', 'graze', 0.15, { item: 'silk', needs: 'plants' }),
    anat: { at: 'hide', part: 'A deep crimped fleece in locks over the whole body, shorn lines visible on the flanks.' },
    src: { marker: ['shaggy', 'fur'], note: 'Shaggy-coated animals.' },
  }),

  // ------------------------------------------------------------------------------------------ plant producers
  B({
    id: 'resin_bark', name: 'Resin Bark', cat: 'meta', lineage: 'mollusc', tier: 1, part: 'resinbark', plant: true,
    desc: 'Grafted bark with resin ducts that never seal. A stand of these trees weeps amber resin into the cups every cycle: varnish, insulators, sealant.',
    fn: F('resin', 'produce', 2, 'CUPS', 'WEEPS', 'weep', 0, { item: 'resin' }),
    anat: { at: 'bark', part: 'Bark scored in chevrons with amber beads running from each cut into a tin cup.' },
    src: { marker: [], note: 'Save a tree as a plant prefab.' },
  }),
  B({
    id: 'metal_root', name: 'Hyperaccumulator Root', cat: 'meta', lineage: 'mollusc', tier: 2, part: 'metalroot', plant: true,
    desc: 'Roots that pull iron out of the soil and store it in the leaves until they rust. Fields of them mine the ground slowly, faster over a seam.',
    fn: F('metalroot', 'produce', 1.5, 'ORE', 'PULLS', 'root', 0, { item: 'ore' }),
    anat: { at: 'roots', part: 'Rust-veined leaves with metallic grey margins; swollen, blackened root collars showing at the soil.' },
    src: { marker: [], note: 'Save a plant that grows near a seam.' },
  }),
  B({
    id: 'algae_bloom', name: 'Biofuel Algae', cat: 'meta', lineage: 'mollusc', tier: 2, part: 'algaemat', plant: true,
    desc: 'An oily green mat that doubles on still water. Skimmed every cycle, it presses out biofuel: a pond is a fuel tank.',
    fn: F('algae', 'produce', 3, 'L FUEL', 'BLOOMS', 'bloom', 0, { item: 'algae_fuel', needs: 'water' }),
    anat: { at: 'fronds', part: 'A floating raft of bright felted algae with oil bubbles trapped under it.' },
    src: { marker: [], note: 'Save a water plant as a prefab.' },
  }),
  B({
    id: 'fruit_set', name: 'Heavy Fruiting', cat: 'meta', lineage: 'mollusc', tier: 1, part: 'fruitload', plant: true,
    desc: 'A graft that sets fruit all year. An orchard of them feeds the workers; pollinators double the crop.',
    fn: F('fruit', 'produce', 2, 'FRUIT', 'BEARS', 'bloom', 0, { item: 'fruit' }),
    anat: { at: 'flowers', part: 'Branches bowed with clustered fruit at every node, blossom and ripe fruit together.' },
    src: { marker: [], note: 'Save any fruiting shrub.' },
  }),
  B({
    id: 'nitro_nodules', name: 'Nitrogen Nodules', cat: 'meta', lineage: 'mollusc', tier: 1, part: 'nodules', plant: true,
    desc: 'Root nodules full of fixing bacteria. The ground around grows rich: everything nearby grows faster and the soil holds more.',
    fn: F('nitro', 'eco', 0.6, 'FERT', 'ENRICHES', 'root', 0),
    anat: { at: 'roots', part: 'Pink bead-like nodules clustered on the upper roots; dark, rich soil around the stem.' },
    src: { marker: [], note: 'Save a low ground plant.' },
  }),
  B({
    id: 'desert_greener', name: 'Desert Greener', cat: 'meta', lineage: 'mollusc', tier: 2, part: 'dewleaf', plant: true,
    desc: 'Waxy leaves that comb dew out of the night air and drip it on the roots. It spreads across dry ground and wets it as it goes.',
    fn: F('greener', 'eco', 0.5, 'WET', 'GREENS', 'bloom', 0),
    anat: { at: 'fronds', part: 'Fleshy grey-green leaves fringed with fine hairs, beaded with dew at dawn.' },
    src: { marker: [], note: 'Save a plant from dry ground.' },
  }),

  // ------------------------------------------------------------------------------------------ ecosystem changers
  B({
    id: 'wetland_maker', name: 'Dam Instinct', cat: 'limb', lineage: 'vertebrate', tier: 2, part: 'damtail',
    desc: 'A broad flat tail and an urge to stop running water. It packs mud and sticks across low ground and floods it into marsh: fish, frogs and wet soil follow.',
    fx: { swim: 0.6 },
    fn: F('wetland', 'eco', 0.8, 'WET', 'FLOODS', 'wade', 0.15, { needs: 'ground' }),
    anat: { at: 'tail', part: 'A wide, scaly paddle tail, mud on the forepaws, big orange incisors.' },
    src: { marker: ['tail_fin', 'gills', 'amphib_skin'], note: 'Water-dwellers.' },
  }),
  B({
    id: 'soil_binder', name: 'Binding Mucus', cat: 'defense', lineage: 'annelid', tier: 1, part: 'bindslime',
    desc: 'It casts a gummy slime through loose ground that binds sand into soil and stops it blowing. Barren ground behind it turns fertile.',
    fx: { regen: 0.1 },
    fn: F('binder', 'eco', 0.7, 'SOIL', 'BINDS', 'wade', 0.1, { needs: 'sand' }),
    anat: { at: 'hide', part: 'A thick shining mucus coat, castings left in neat coils behind it.' },
    src: { marker: ['setae', 'mucus'], note: 'Earthworms.' },
  }),
  B({
    id: 'pollinator', name: 'Pollen Brush', cat: 'sense', lineage: 'arthropod', tier: 1, part: 'pollenbrush',
    desc: 'Branched hairs that load with pollen and a taste for nectar. It works the flowers around it: plants grow faster and orchards set double.',
    fx: { upkeep: -0.01 },
    fn: F('pollinate', 'eco', 1, 'PLANTS', 'POLLINATES', 'flit', 0.05, { needs: 'plants' }),
    anat: { at: 'feet', part: 'Pollen baskets on the hind legs packed with yellow-orange pollen; a fuzzy thorax.' },
    src: { marker: ['proboscis'], note: 'Nectar feeders.' },
  }),
  B({
    id: 'decomposer', name: 'Decomposer Gut', cat: 'meta', lineage: 'annelid', tier: 1, part: 'rotgut',
    desc: 'A gut that finishes anything. It eats carcasses and leaves soil and carbon where they lay, and the ground there turns rich.',
    fx: { regen: 0.2 },
    fn: F('decompose', 'eco', 3, 'CARBON', 'RENDERS', 'rend', 0, { item: 'carbon', needs: 'corpse' }),
    anat: { at: 'gut', part: 'A long coiled hindgut visible as dark bands under the skin; a wide, round mouth.' },
    src: { marker: ['scav_gut', 'ring_maw'], note: 'Scavengers.' },
  }),
  B({
    id: 'pest_eater', name: 'Pest Hunter', cat: 'sense', lineage: 'vertebrate', tier: 2, part: 'pestnose',
    desc: 'A twitching nose for small things. It patrols the fields and picks off the mites and crawlers that eat the crop.',
    fx: { smell: 8, attack: 1 },
    fn: F('pest', 'eco', 2, 'PESTS', 'CULLS', 'rend', 0.1, { needs: 'pests' }),
    anat: { at: 'snout', part: 'A long, flexible pointed nose and big forward ears.' },
    src: { marker: ['tongue', 'leg_raptorial'], note: 'Insect-eaters.' },
  }),

  // ------------------------------------------------------------------------------------------ labour and war
  B({
    id: 'hauler_back', name: 'Hauler Back', cat: 'limb', lineage: 'vertebrate', tier: 1, part: 'pannierback',
    desc: 'A broad saddle of muscle over a reinforced spine. It carries the piles from distant producers back to the stores.',
    fx: { hp: 15, stamina: 20, speed: -0.2 },
    fn: F('haul', 'labour', 30, 'LOADS', 'CARRIES', 'carry', 0.1),
    anat: { at: 'back', part: 'A flat, raised saddle hump with a callused pad; slung panniers when working.' },
    src: { marker: ['leg_pillar', 'leg_hooved'], note: 'Heavy pack animals.' },
  }),
  B({
    id: 'operator_hands', name: 'Operator Hands', cat: 'limb', lineage: 'hominid', tier: 3, part: 'finehands',
    desc: 'Long-fingered hands with opposable thumbs and fine control. It works the levers of a machine or a vat and the machine runs half again as fast.',
    fx: { reach: 0.2 },
    fn: F('operate', 'labour', 1, 'MACHINE', 'OPERATES', 'tend', 0.1, { needs: 'machine' }),
    anat: { at: 'forelimbs', part: 'Slender five-fingered hands with knuckle pads; held up and busy.' },
    src: { marker: ['hands', 'tentacles'], note: 'Hands, or tentacles.' },
  }),
  B({
    id: 'guard_instinct', name: 'Guard Instinct', cat: 'meta', lineage: 'vertebrate', tier: 1, part: 'hackles',
    desc: 'It holds a post, watches further than it should and raises the alarm. It fights anything that comes near what it guards.',
    fx: { sight: 4, attack: 1 },
    fn: F('guard', 'war', 1, 'POST', 'GUARDS', 'watch', 0.05),
    anat: { at: 'back', part: 'Raised hackles along the neck and shoulders, ears forward, a stiff stance.' },
    src: { marker: ['horns', 'antlers', 'horns_ram'], note: 'Horned herd-guardians.' },
    links: ['horns', 'horns_ram', 'antlers'],
  }),
  B({
    id: 'soldier_caste', name: 'Soldier Caste', cat: 'meta', lineage: 'arthropod', tier: 2, part: 'soldierhead',
    desc: 'The soldier switch: a swollen armoured head, a short temper and a body that grows into its weapons. It takes troop orders like a robot squad.',
    fx: { attack: 4, hp: 20, armor: 0.06, upkeep: 0.03 },
    fn: F('soldier', 'war', 1, 'SQUAD', 'FIGHTS', 'watch', 0.2),
    anat: { at: 'skull', part: 'An enlarged, dark armoured head capsule with heavy jaw muscles and scars.' },
    src: { marker: ['stinger', 'carnassials', 'venom_fangs'], note: 'Stinging and shearing hunters.' },
    links: ['osteoderms', 'carapace_crab', 'venom_fangs', 'stinger', 'horns', 'horn_beetle', 'quills', 'chela', 'carnassials'],
  }),

  // ------------------------------------------------------------------------------------------ control
  B({
    id: 'docility', name: 'Docility Gene', cat: 'meta', lineage: 'vertebrate', tier: 1, part: 'docile',
    desc: 'Tameness written in: calm, biddable, never wanders off the job. Workers carrying it work a quarter harder and take no breaks.',
    fx: { attack: -1, stealth: -0.05 },
    fn: F('docile', 'control', 0.25, '%', 'OBEYS', 'none', 0),
    anat: { at: 'head', part: 'Softer, rounder face, drooping ears, a white blaze on the forehead (domestication marks).' },
    src: { marker: ['brood_care', 'molars'], note: 'Herd animals that care for their young.' },
  }),
  B({
    id: 'gene_lock', name: 'Gene-Lock', cat: 'meta', lineage: 'annelid', tier: 3, part: 'genelock',
    desc: 'A kill switch on the germ line. It breeds only inside an engineered habitat and never crosses with wild stock: nothing of it escapes into the world.',
    fn: F('lock', 'control', 1, '', 'LOCKED', 'none', 0),
    anat: { at: 'hide', part: 'A tattoo-like band of pale pigment cells round the neck: the lock marker.' },
    src: { marker: ['budding'], note: 'Clonal worms never hybridise. Or research the Gene-Lock.' },
    skill: 'bt_lock',
  }),
  B({
    id: 'sterile', name: 'Sterility Switch', cat: 'meta', lineage: 'arthropod', tier: 1, part: 'sterile',
    desc: 'The worker caste: it cannot breed at all and spends what it would have spent on young on the work. Grown in vats only.',
    fx: { upkeep: -0.01 },
    fn: F('sterile', 'control', 0.2, '%', 'STERILE', 'none', 0),
    anat: { at: 'belly', part: 'A small, unpigmented abdomen; no brood pouch or display colours.' },
    src: { marker: ['antennae'], note: 'Social insects with worker castes.' },
  }),
  B({
    id: 'growth_accel', name: 'Growth Accelerator', cat: 'meta', lineage: 'arthropod', tier: 2, part: 'growthgland',
    desc: 'An overactive growth gland: young mature in a fraction of the time and vats finish early, at the price of a bigger appetite.',
    fx: { maturity: -30, upkeep: 0.03, regen: 0.2 },
    fn: F('growth', 'control', 0.6, '%', 'GROWS FAST', 'none', 0.15),
    anat: { at: 'glands', part: 'A swollen, pulsing gland at the base of the skull; fast-growing, slightly oversized limbs.' },
    src: { marker: ['rapid_molt', 'egg_clutch', 'spawn'], note: 'Fast-molting and fast-hatching species.' },
  }),
];

export const BIO: Record<string, BioInfo & { id: string }> = Object.fromEntries(BIO_GENES.map((g) => [g.id, { id: g.id, ...g.bio }]));
export const isBio = (id: string) => id in BIO;
export const isPlantGene = (id: string) => !!BIO[id]?.plant;
export const FN_GROUP_NAME: Record<FnGroup, string> = { dig: 'DIG & TERRAFORM', produce: 'PRODUCE', eco: 'ECOSYSTEM', labour: 'LABOUR', war: 'WAR', control: 'CONTROL' };
