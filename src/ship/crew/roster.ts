// The crew of the UNAA research vessel MERIDIAN (RV-07): eight people of the United Nations of Antarctica and the Americas
// colonisation research program, each with a job, a body, a face, a voice and a day. Pure data (no three.js): the
// model builder (model.ts) reads `app`, `outfit`, `ov` and `gear`; the ship life (life.ts) reads `routine` and the
// lines; the intro (src/ship/intro) casts Dr. Solano and Patch Kowalczyk; the planet takes the two `TEAMMATES`.
import type { Appearance, Outfit } from '../../limbo/entities/humanRig';
import type { SpecOverrides } from '../../limbo/entities/gg/spec';

export const SHIP_NAME = 'UNAA MERIDIAN';
export const PROGRAM = 'UNAA COLONISATION RESEARCH PROGRAM';

export type CrewId = 'solano' | 'quintero' | 'kowalczyk' | 'castellanos' | 'baptiste' | 'mamani' | 'araujo' | 'kristiansen';
export const CREW_IDS: CrewId[] = ['solano', 'quintero', 'kowalczyk', 'castellanos', 'baptiste', 'mamani', 'araujo', 'kristiansen'];
/** the two who ride the pod down with UNIT 07 (the story's scripted deaths take them) */
export const TEAMMATES: CrewId[] = ['mamani', 'kristiansen'];

/** what a crew member does in a block of the ship's day */
export type Act = 'work' | 'eat' | 'sleep' | 'chat' | 'repair' | 'exercise' | 'read' | 'tend' | 'cook' | 'patrol' | 'treat' | 'pilot' | 'coffee' | 'inventory' | 'study';
/** room ids as the ship hub names them (life.ts resolves aliases: mess = main room, quarters = living quarters, ...) */
export type RoomKey = 'bridge' | 'lab' | 'mess' | 'quarters' | 'medbay' | 'hydro' | 'engineering' | 'hangar' | 'cargo' | 'gym';
export interface Block { from: number; to: number; room: RoomKey; act: Act; with?: CrewId }

/** gear pieces built in 3D on the bones (model.ts) */
export type Gear =
  | 'patchL' | 'patchR' | 'nameTape' | 'lanyard' | 'tablet' | 'stylus' | 'earpiece' | 'rankBoards' | 'capBadge' | 'chrono' | 'mug'
  | 'toolBelt' | 'goggles' | 'kneePads' | 'earDefenders' | 'wrench' | 'flightPatches' | 'aviators' | 'headsetNeck'
  | 'stethoscope' | 'medScanner' | 'penlights' | 'wristComp' | 'fieldVest' | 'seedPouch' | 'specimenJar' | 'sprig'
  | 'apron' | 'towel' | 'readers' | 'ladle' | 'tacVest' | 'holster' | 'shoulderRadio' | 'braidTie' | 'pencilEar' | 'clipboard';

export interface Voice { pitch: number; rate: number; /** Web Speech voice name hints, tried in order */ hint: string[]; female: boolean }
export interface CrewDef {
  id: CrewId; name: string; short: string; callsign?: string;
  role: string; /** a one- or two-word job title for tags */ job: string; dept: string; rank: string; age: number; origin: string;
  /** height in metres and the body in a few words (the sheet prints both) */
  heightM: number; body: string;
  look: string; outfitNote: string; personality: string;
  voice: Voice;
  app: Appearance; outfit: Outfit; ov: SpecOverrides; gear: Gear[];
  /** extra root scale on top of app.height (which the rig clamps to 0.9..1.1) */
  scale: number;
  /** badge colour band (department) */
  dept_col: [number, number, number];
  home: RoomKey;
  routine: Block[];
  lines: {
    /** said to nobody in particular while working or idle */
    idle: string[];
    /** when the player clicks them */
    click: string[];
    /** after a crewmate died */
    grief: string[];
    /** a short reaction to an alarm or a breach */
    alarm: string[];
  };
  /** gesture after a click line */
  clickGesture: 'wave' | 'nod' | 'point' | 'shrug' | 'think' | 'talk' | 'present' | 'salute';
}

// UNAA research colours: slate navy, ice white, a single safety-amber accent; departments by band colour
const NAVY = 0x2c3a4c, NAVY_D = 0x222c3a, SLATE = 0x3f5362, ICE = 0xd8dcd6, CHAR = 0x34383c, BOOT = 0x262320;
const DEPT = {
  science: [70, 128, 168] as [number, number, number],
  command: [196, 160, 72] as [number, number, number],
  eng: [204, 112, 48] as [number, number, number],
  flight: [96, 140, 104] as [number, number, number],
  med: [176, 72, 64] as [number, number, number],
  supply: [150, 128, 96] as [number, number, number],
  sec: [120, 120, 136] as [number, number, number],
};

const A = (a: Record<string, unknown>) => a as unknown as Appearance;

export const ROSTER: Record<CrewId, CrewDef> = {
  // ------------------------------------------------------------------ the lead scientist: she made UNIT 07
  solano: {
    id: 'solano', name: 'Dr. Mira Solano', short: 'Solano', role: 'Lead Scientist', job: 'Lead Scientist', dept: 'AI and Robotics', rank: 'Program Lead',
    age: 41, origin: 'Punta Arenas, Chile', heightM: 1.68, body: 'Average height, slim, quick hands',
    look: 'Dark brown hair in a messy bun with a stylus stuck through it and an early grey streak; rectangular glasses; olive skin; tired, bright eyes.',
    outfitNote: 'UNAA lab coat over a slate knit turtleneck, charcoal slacks, soft lab shoes; a tablet that never leaves her hand, an earpiece, her lanyard.',
    personality: 'Brilliant, warm, impatient with procedure. Talks to UNIT 07 like a proud parent and a strict teacher at once. Laughs at her own mistakes; never at anyone else\'s.',
    voice: { pitch: 1.12, rate: 1.05, hint: ['Samantha', 'Google US English', 'Microsoft Aria', 'Microsoft Zira', 'female'], female: true },
    app: A({ skin: 0xd6a37a, hair: 0x2e2018, hairStyle: 'bun', face: 4, build: 'slim', height: 0.985, bodyShape: 0.9, eyeColor: 0x4a3420, facialHair: 'none', freckles: 0.05, scars: 0, age: 0.42, jaw: 4, eyeShape: 2, brows: 2, nose: 1, mouth: 1, ears: 0 }),
    outfit: {
      torso: { tex: 'c_sweater', color: SLATE, sleeve: 'long' }, torsoOuter: { tex: 'c_labcoat', color: 0xe2e4de, sleeve: 'long' },
      legs: { tex: 'c_slacks', color: CHAR }, legsKind: 'pants', feet: { tex: 'c_shoes_sneaker', color: 0x4a5058 },
    },
    ov: { glasses: { kind: 'rect', col: [40, 34, 32], thick: 1 }, makeup: { lash: 0.25 }, hairVolume: 1.1 },
    gear: ['patchL', 'nameTape', 'lanyard', 'tablet', 'stylus', 'earpiece', 'penlights'],
    scale: 1, dept_col: DEPT.science, home: 'lab',
    routine: [
      { from: 0, to: 6, room: 'quarters', act: 'sleep' }, { from: 6, to: 7, room: 'mess', act: 'coffee' },
      { from: 7, to: 12, room: 'lab', act: 'work' }, { from: 12, to: 13, room: 'mess', act: 'eat', with: 'baptiste' },
      { from: 13, to: 17, room: 'lab', act: 'study' }, { from: 17, to: 18, room: 'bridge', act: 'chat', with: 'quintero' },
      { from: 18, to: 19, room: 'mess', act: 'eat' }, { from: 19, to: 23, room: 'lab', act: 'work' }, { from: 23, to: 24, room: 'quarters', act: 'read' },
    ],
    lines: {
      idle: ['Gradient descent, my old friend...', 'Who keeps moving my soldering iron?', 'Three more simulations and I sleep. Four.', 'If the model holds, we land in a week.', 'Coffee. Then science.', 'Note to self: UNIT 07 likes being talked to.'],
      click: ['There you are! Systems all green?', 'Don\'t hover over my shoulder. Kidding. Hover away.', 'You learn faster than I did, you know.', 'Go say hello to the crew. They\'re family now.', 'Careful with the gravity field near my samples.', 'I wrote your first line of code at three in the morning.'],
      grief: ['I should have kept them on the ship.', 'I keep checking the comm log for them.', 'We keep going. They would want the data.'],
      alarm: ['Seal the lab! Now!', 'UNIT 07, with me!'],
    },
    clickGesture: 'present',
  },
  // ------------------------------------------------------------------ the captain
  quintero: {
    id: 'quintero', name: 'Capt. Rafael Quintero', short: 'Quintero', role: 'Captain', job: 'Captain', dept: 'Command', rank: 'Captain',
    age: 58, origin: 'Ushuaia, Argentina', heightM: 1.92, body: 'Tall, broad-shouldered, a little stooped',
    look: 'Silver hair cut short, a trimmed grey beard, a long weathered face from thirty winters of Antarctic supply runs; pale grey eyes.',
    outfitNote: 'Navy command jacket over the uniform shirt, rank boards, the UNAA crest on his cap, an old mechanical chronometer, always a mug of mate.',
    personality: 'Calm, dry, slow to speak and never wrong twice. Protective of the youngest crew. Hums tangos on the night watch.',
    voice: { pitch: 0.74, rate: 0.9, hint: ['Daniel', 'Google UK English Male', 'Microsoft Guy', 'Microsoft David', 'male'], female: false },
    app: A({ skin: 0xd8a882, hair: 0xb8b4ac, hairStyle: 'short', face: 3, build: 'broad', height: 1.1, bodyShape: 0, eyeColor: 0x6a8090, facialHair: 'beard', freckles: 0, scars: 1, age: 0.82, jaw: 3, eyeShape: 3, brows: 1, nose: 3, mouth: 2, ears: 2 }),
    outfit: {
      torso: { tex: 'c_shirt_button', color: 0xc8ccc6, sleeve: 'long' }, torsoOuter: { tex: 'c_jacket', color: NAVY_D, sleeve: 'long' },
      legs: { tex: 'c_slacks', color: NAVY }, legsKind: 'pants', feet: { tex: 'c_shoes_dress', color: 0x1e1c1c, item: 'dress_shoes' },
      head: { tex: 'c_hat_cap', color: NAVY_D, hat: 'cap' }, wrist: { tex: 'c_watch', color: 0x8a7a50 },
    },
    ov: {},
    gear: ['patchL', 'nameTape', 'rankBoards', 'capBadge', 'chrono', 'mug'],
    scale: 1.015, dept_col: DEPT.command, home: 'bridge',
    routine: [
      { from: 0, to: 2, room: 'bridge', act: 'work' }, { from: 2, to: 8, room: 'quarters', act: 'sleep' },
      { from: 8, to: 9, room: 'mess', act: 'coffee', with: 'araujo' }, { from: 9, to: 12, room: 'bridge', act: 'work' },
      { from: 12, to: 13, room: 'mess', act: 'eat' }, { from: 13, to: 15, room: 'bridge', act: 'pilot' }, { from: 15, to: 16, room: 'engineering', act: 'patrol' },
      { from: 16, to: 17, room: 'hangar', act: 'patrol' }, { from: 17, to: 18, room: 'bridge', act: 'chat', with: 'solano' },
      { from: 18, to: 19, room: 'mess', act: 'eat', with: 'kristiansen' }, { from: 19, to: 22, room: 'bridge', act: 'work' }, { from: 22, to: 24, room: 'quarters', act: 'read' },
    ],
    lines: {
      idle: ['Steady as she goes.', 'Mm. Another quiet watch. Good.', 'Somebody log that course correction.', 'In my day the ships had windows that opened. Joke.', 'Mate\'s gone cold again.'],
      click: ['Unit. Carry on.', 'Doctor Solano speaks highly of you. Don\'t make her a liar.', 'The ship is yours to learn. Not to break.', 'At ease, little one.', 'We bring everyone home. That is the only order.'],
      grief: ['I signed their manifest. I will sign the letters too.', 'A captain counts his crew every morning. I keep counting eight.', 'Flag at half on the bridge display.'],
      alarm: ['All hands, hull breach! Seal and report!', 'Kowalczyk, get on it!'],
    },
    clickGesture: 'salute',
  },
  // ------------------------------------------------------------------ the mechanic who patches the hull
  kowalczyk: {
    id: 'kowalczyk', name: 'Ruth "Patch" Kowalczyk', short: 'Patch', callsign: 'PATCH', role: 'Hull Mechanic', job: 'Mechanic', dept: 'Engineering', rank: 'Chief Petty Officer',
    age: 34, origin: 'Winnipeg, Canada', heightM: 1.55, body: 'Short, stocky, strong as a winch',
    look: 'Copper-red hair in a short undercut, freckles everywhere, a burn scar on one hand, welding goggles pushed up on her forehead.',
    outfitNote: 'Safety-orange coveralls, a loaded tool belt (wrench, driver, sealant gun, pouches), knee pads, ear defenders round her neck, heavy boots and gloves.',
    personality: 'Fast, loud, practical and very funny. Swears in three languages under her breath. Pretends to hate UNIT 07 after the apple; slips it spare bolts.',
    voice: { pitch: 1.28, rate: 1.18, hint: ['Karen', 'Moira', 'Google UK English Female', 'Microsoft Hazel', 'female'], female: true },
    app: A({ skin: 0xf0cdb2, hair: 0x9a4a22, hairStyle: 'undercut', face: 2, build: 'stocky', height: 0.9, bodyShape: 0.72, eyeColor: 0x5a7a4a, facialHair: 'none', freckles: 0.95, scars: 1, age: 0.24, jaw: 2, eyeShape: 0, brows: 0, nose: 4, mouth: 3, ears: 1 }),
    outfit: {
      torso: { tex: 'c_uniform', item: 'coverall', color: 0xc8662e, sleeve: 'long' }, legs: { tex: 'c_uniform', item: 'coverall', color: 0xc8662e }, legsKind: 'pants',
      feet: { tex: 'c_shoes_boot', color: BOOT }, hands: { tex: 'c_gloves', color: 0x6a5a40 },
    },
    ov: { hairVolume: 1.05 },
    gear: ['patchL', 'nameTape', 'toolBelt', 'goggles', 'kneePads', 'earDefenders', 'pencilEar'],
    scale: 0.985, dept_col: DEPT.eng, home: 'engineering',
    routine: [
      { from: 0, to: 6, room: 'quarters', act: 'sleep' }, { from: 6, to: 7, room: 'gym', act: 'exercise' },
      { from: 7, to: 8, room: 'mess', act: 'eat', with: 'castellanos' }, { from: 8, to: 12, room: 'engineering', act: 'repair' },
      { from: 12, to: 13, room: 'mess', act: 'eat' }, { from: 13, to: 15, room: 'hangar', act: 'repair' }, { from: 15, to: 18, room: 'engineering', act: 'repair' },
      { from: 18, to: 19, room: 'mess', act: 'eat', with: 'araujo' }, { from: 19, to: 21, room: 'mess', act: 'chat', with: 'castellanos' }, { from: 21, to: 24, room: 'quarters', act: 'read' },
    ],
    lines: {
      idle: ['Torque spec says forty. I say forty-five.', 'Who used my sealant gun and didn\'t cap it?!', 'Hull\'s singing tonight. Good singing.', 'One more weld and I\'m a free woman.', 'If it rattles, it\'s mine.'],
      click: ['Oh look, it\'s the apple cannon.', 'Keep your gravity mitts off my rivets.', 'Need a bolt? I got bolts. Don\'t tell anybody.', 'Fine. You were a decent hand with that plate.', 'Out of my light, bubble.', 'You put a hole in my ship. I put a patch in it. We\'re even.'],
      grief: ['I keep fixing things that don\'t need fixing.', 'They borrowed my good driver. Never gave it back.', 'Quiet in here without them.'],
      alarm: ['I\'m on it! Move!', 'Breach kit, breach kit, breach kit!'],
    },
    clickGesture: 'point',
  },
  // ------------------------------------------------------------------ the pilot
  castellanos: {
    id: 'castellanos', name: 'Lt. Dev Castellanos', short: 'Sparrow', callsign: 'SPARROW', role: 'Pilot', job: 'Pilot', dept: 'Flight', rank: 'Lieutenant',
    age: 27, origin: 'Tucson, Arizona', heightM: 1.78, body: 'Wiry and lean, all elbows and nerve',
    look: 'Black hair spiked up off an undercut, two days of stubble, a crooked grin, aviators pushed up on his head.',
    outfitNote: 'Sage flight suit under a worn brown bomber jacket covered in mission patches, a flight headset round his neck, scuffed boots.',
    personality: 'Cocky, restless, a natural. Jokes when he is scared. Bets on everything. Would fly into a star for any of them.',
    voice: { pitch: 1.02, rate: 1.15, hint: ['Alex', 'Fred', 'Google US English', 'Microsoft Mark', 'male'], female: false },
    app: A({ skin: 0xc08a5e, hair: 0x18120e, hairStyle: 'spiky', face: 1, build: 'wiry', height: 1.02, bodyShape: 0.05, eyeColor: 0x3a2414, facialHair: 'stubble', freckles: 0.08, scars: 0, age: 0.12, jaw: 7, eyeShape: 1, brows: 3, nose: 2, mouth: 0, ears: 0 }),
    outfit: {
      torso: { tex: 'c_uniform', item: 'coverall', color: 0x5e6a4e, sleeve: 'long' }, torsoOuter: { tex: 'c_jacket_leather', color: 0x6a4428, sleeve: 'long' },
      legs: { tex: 'c_uniform', item: 'coverall', color: 0x5e6a4e }, legsKind: 'pants', feet: { tex: 'c_shoes_boot', color: 0x3a2a1e },
    },
    ov: {},
    gear: ['patchL', 'patchR', 'flightPatches', 'aviators', 'headsetNeck', 'nameTape'],
    scale: 1, dept_col: DEPT.flight, home: 'bridge',
    routine: [
      { from: 0, to: 7, room: 'quarters', act: 'sleep' }, { from: 7, to: 8, room: 'mess', act: 'eat', with: 'kowalczyk' },
      { from: 8, to: 12, room: 'bridge', act: 'pilot' }, { from: 12, to: 13, room: 'mess', act: 'eat' }, { from: 13, to: 15, room: 'hangar', act: 'repair' },
      { from: 15, to: 16, room: 'gym', act: 'exercise', with: 'kristiansen' }, { from: 16, to: 19, room: 'bridge', act: 'pilot' },
      { from: 19, to: 21, room: 'mess', act: 'chat', with: 'kowalczyk' }, { from: 21, to: 24, room: 'quarters', act: 'read' },
    ],
    lines: {
      idle: ['Autopilot\'s good. I\'m better.', 'Five credits says we see an aurora on that rock.', 'Who needs sleep when you have orbital mechanics?', 'Sparrow to Meridian: still the best-looking pilot aboard.', 'Ugh, another nav sync.'],
      click: ['Hey, little buddy! Wanna race a lap of the ship?', 'You and me, the pod and a planet. Gonna be epic.', 'Don\'t tell the Captain, but I named the ship\'s computer Gary.', 'Thrusters looking clean. Nice.', 'Up top! ...right. No hands.'],
      grief: ['I flew them down. I should have flown them back.', 'Can\'t joke about it yet. Give me a minute.', 'Next landing, I go with you.'],
      alarm: ['Bridge! Venting starboard, compensating!', 'Hold on to something!'],
    },
    clickGesture: 'wave',
  },
  // ------------------------------------------------------------------ the medic
  baptiste: {
    id: 'baptiste', name: 'Dr. Nia Baptiste', short: 'Baptiste', role: 'Chief Medical Officer', job: 'Medic', dept: 'Medical', rank: 'Doctor',
    age: 47, origin: 'Montreal, Quebec (born Jacmel, Haiti)', heightM: 1.66, body: 'Heavy-set, solid, unhurried',
    look: 'Deep brown skin, a full natural afro going silver at the temples, reading glasses, laugh lines; a gold stud in one ear.',
    outfitNote: 'Teal surgical scrubs with the UNAA caduceus, a stethoscope worn like a necklace, a med scanner and penlights clipped on, white clogs, a wrist computer.',
    personality: 'Unflappable, motherly, ruthless about sleep schedules. Gallows humour. Sings Creole lullabies while she sutures.',
    voice: { pitch: 0.92, rate: 0.95, hint: ['Tessa', 'Victoria', 'Microsoft Jenny', 'Google UK English Female', 'female'], female: true },
    app: A({ skin: 0x5a3622, hair: 0x1c1612, hairStyle: 'afro', face: 2, build: 'heavy', height: 0.98, bodyShape: 0.95, eyeColor: 0x2e1c10, facialHair: 'none', freckles: 0, scars: 0, age: 0.52, jaw: 2, eyeShape: 4, brows: 0, nose: 5, mouth: 3, ears: 0 }),
    outfit: {
      torso: { tex: 'c_scrubs', color: 0x3e7a78, sleeve: 'short' }, legs: { tex: 'c_scrubs', color: 0x3e7a78 }, legsKind: 'pants',
      feet: { tex: 'c_shoes_sneaker', color: 0xdedcd4 }, eyes: { tex: 'c_glasses', color: 0x5a3a2a, item: 'glasses' },
    },
    ov: { glasses: { kind: 'round', col: [70, 44, 30], thick: 1 }, hairVolume: 1.15 },
    gear: ['patchL', 'nameTape', 'stethoscope', 'medScanner', 'penlights', 'wristComp'],
    scale: 1, dept_col: DEPT.med, home: 'medbay',
    routine: [
      { from: 0, to: 6, room: 'quarters', act: 'sleep' }, { from: 6, to: 7, room: 'gym', act: 'exercise' }, { from: 7, to: 12, room: 'medbay', act: 'treat' },
      { from: 12, to: 13, room: 'mess', act: 'eat', with: 'solano' }, { from: 13, to: 16, room: 'medbay', act: 'study' }, { from: 16, to: 17, room: 'hydro', act: 'chat', with: 'mamani' },
      { from: 17, to: 18, room: 'medbay', act: 'treat' }, { from: 18, to: 20, room: 'mess', act: 'eat', with: 'araujo' }, { from: 20, to: 24, room: 'quarters', act: 'read' },
    ],
    lines: {
      idle: ['Hydrate, people. I\'m not asking.', 'Who\'s been skipping their bone-density scans? I can see the logs.', 'Mm-mm. That rash is not from Earth.', 'Seven hours of sleep. Minimum. Captain included.', 'Pass the suture kit, chérie.'],
      click: ['Hello, sweetheart. Any aches in your gyroscope?', 'Diagnostic says you\'re healthier than the pilot.', 'Don\'t you dare go breaking anything down there.', 'I patch people. Patch patches ships. You keep both of us busy.', 'Come here, let me look at that lens.'],
      grief: ['I wrote the time of death myself. I always do.', 'Talk to me if you need to. Even you.', 'Grief is a wound. It closes slowly.'],
      alarm: ['Everyone to medbay if you can\'t breathe!', 'Masks! Masks on!'],
    },
    clickGesture: 'nod',
  },
  // ------------------------------------------------------------------ the botanist / xenobiologist
  mamani: {
    id: 'mamani', name: 'Tupaq Mamani', short: 'Tupaq', role: 'Xenobiologist', job: 'Xenobiologist', dept: 'Botany and Xenobiology', rank: 'Research Fellow',
    age: 24, origin: 'El Alto, Bolivia', heightM: 1.63, body: 'Young, slight, short, light on his feet',
    look: 'Long straight black hair in a low ponytail, round wire glasses, a round friendly face, an awwayu-pattern woven band on his wrist.',
    outfitNote: 'Khaki field shirt under a sage field vest crowded with sample pockets, cargo trousers, hiking boots, a seed pouch, a sprig of something growing from his pocket.',
    personality: 'The youngest aboard. Endlessly curious, earnest, talks to his plants and apologises to them. Hero-worships Dr. Solano and the Captain in equal parts.',
    voice: { pitch: 1.18, rate: 1.1, hint: ['Juan', 'Diego', 'Google español', 'Microsoft Pablo', 'male'], female: false },
    app: A({ skin: 0xa8714a, hair: 0x14100c, hairStyle: 'ponytail', face: 0, build: 'slim', height: 0.94, bodyShape: 0.15, eyeColor: 0x2a1a10, facialHair: 'none', freckles: 0, scars: 0, age: 0.02, jaw: 2, eyeShape: 1, brows: 0, nose: 2, mouth: 0, ears: 1 }),
    outfit: {
      torso: { tex: 'c_shirt_button', color: 0xa8a07a, sleeve: 'long' }, torsoOuter: { tex: 'c_vest_hiviz', color: 0x5e7050, sleeve: 'none' },
      legs: { tex: 'c_slacks', color: 0x6a6448 }, legsKind: 'pants', feet: { tex: 'c_shoes_boot', color: 0x4a3626 },
      eyes: { tex: 'c_glasses', color: 0x8a8070, item: 'glasses' },
    },
    ov: { glasses: { kind: 'round', col: [120, 110, 90], thick: 1 }, hairVolume: 1.0 },
    gear: ['patchL', 'nameTape', 'fieldVest', 'seedPouch', 'sprig', 'specimenJar'],
    scale: 0.985, dept_col: DEPT.science, home: 'hydro',
    routine: [
      { from: 0, to: 6, room: 'quarters', act: 'sleep' }, { from: 6, to: 9, room: 'hydro', act: 'tend' }, { from: 9, to: 10, room: 'mess', act: 'eat' },
      { from: 10, to: 12, room: 'lab', act: 'study', with: 'solano' }, { from: 12, to: 13, room: 'mess', act: 'eat' }, { from: 13, to: 16, room: 'hydro', act: 'tend' },
      { from: 16, to: 17, room: 'hydro', act: 'chat', with: 'baptiste' }, { from: 17, to: 19, room: 'hydro', act: 'tend' }, { from: 19, to: 20, room: 'mess', act: 'eat' },
      { from: 20, to: 22, room: 'lab', act: 'read' }, { from: 22, to: 24, room: 'quarters', act: 'sleep' },
    ],
    lines: {
      idle: ['Good morning, little lettuces.', 'Sorry, sorry. Just a small cutting.', 'The soybeans are flowering early. Interesting.', 'If there\'s chlorophyll down there, I\'ll find it.', 'Humidity sixty-two percent. Perfect.'],
      click: ['Hi UNIT 07! Want to see the sprouts? They grew four millimetres!', 'When we land, can you scan every plant? Every single one?', 'Dr. Solano says you were born curious. Me too.', 'Careful, those are seedlings.', 'I\'ve packed three hundred seed varieties for the pod!'],
      grief: ['I water their plants too now.', 'The cuttings they took are still growing.', 'We should name something after them. Something that lives.'],
      alarm: ['The plants! Seal the hydro bay!', 'Oh no, oh no, oh no.'],
    },
    clickGesture: 'wave',
  },
  // ------------------------------------------------------------------ the quartermaster
  araujo: {
    id: 'araujo', name: 'Benedito "Bené" Araújo', short: 'Bené', role: 'Quartermaster and Cook', job: 'Quartermaster', dept: 'Supply', rank: 'Warrant Officer',
    age: 63, origin: 'Belém, Brazil', heightM: 1.72, body: 'Older, heavy, a big round belly, strong forearms',
    look: 'Bald on top with close grey sides, a huge grey moustache, half-moon readers on his head, rolled sleeves over tattooed forearms.',
    outfitNote: 'Cream work shirt with rolled sleeves, a long canvas apron, a towel over the shoulder, brown trousers; a ladle or the inventory slate in hand.',
    personality: 'Jovial, generous, nosy. Knows every bolt in the hold and every secret aboard. Feeds people when they are sad. Strict about the stores ledger.',
    voice: { pitch: 0.8, rate: 0.95, hint: ['Luciana', 'Joana', 'Google português do Brasil', 'Microsoft Daniel', 'male'], female: false },
    app: A({ skin: 0x9a6240, hair: 0x9a948a, hairStyle: 'receding', face: 2, build: 'heavy', height: 1.0, bodyShape: 0, eyeColor: 0x3a2414, facialHair: 'moustache', freckles: 0.1, scars: 0, age: 0.9, jaw: 6, eyeShape: 4, brows: 1, nose: 6, mouth: 2, ears: 2, tattoos: { farm_l: 'anchor', farm_r: 'heart' } }),
    outfit: {
      torso: { tex: 'c_shirt_button', color: 0xd8ccb0, sleeve: 'short' }, legs: { tex: 'c_slacks', color: 0x5a4a38 }, legsKind: 'pants',
      feet: { tex: 'c_shoes', color: 0x3a2e24 },
    },
    ov: {},
    gear: ['patchL', 'nameTape', 'apron', 'towel', 'readers', 'ladle'],
    scale: 1, dept_col: DEPT.supply, home: 'mess',
    routine: [
      { from: 0, to: 5, room: 'quarters', act: 'sleep' }, { from: 5, to: 8, room: 'mess', act: 'cook' }, { from: 8, to: 9, room: 'mess', act: 'coffee', with: 'quintero' },
      { from: 9, to: 11, room: 'cargo', act: 'inventory' }, { from: 11, to: 14, room: 'mess', act: 'cook' }, { from: 14, to: 16, room: 'cargo', act: 'inventory' },
      { from: 16, to: 18, room: 'mess', act: 'cook' }, { from: 18, to: 20, room: 'mess', act: 'chat', with: 'baptiste' }, { from: 20, to: 21, room: 'hydro', act: 'patrol' },
      { from: 21, to: 24, room: 'quarters', act: 'sleep' },
    ],
    lines: {
      idle: ['Feijoada on Friday, if the beans behave.', 'Who took six ration bars and logged two? I know.', 'Ah, the smell of real garlic. Last bulb. Shh.', 'Inventory never lies. People do.', 'Eat, eat. Space is cold.'],
      click: ['UNIT! You don\'t eat, but sit with me anyway.', 'You want something from stores? Fill out the form. Then we talk.', 'In Belém we say: the river always brings something back.', 'Tell the pilot his tab is very long.', 'The apple you threw? I had counted that apple.'],
      grief: ['I set their place at the table by habit.', 'I made their favourite. Nobody ate much.', 'Saudade. You don\'t have a word for it. Good.'],
      alarm: ['Stores are sealed, go go go!', 'Not my galley!'],
    },
    clickGesture: 'shrug',
  },
  // ------------------------------------------------------------------ security
  kristiansen: {
    id: 'kristiansen', name: 'Sgt. Ivalu Kristiansen', short: 'Ivalu', role: 'Security Chief', job: 'Security', dept: 'Security', rank: 'Sergeant',
    age: 38, origin: 'Nuuk, Greenland', heightM: 1.84, body: 'Tall, athletic, broad through the shoulders',
    look: 'Black hair in one long tight braid, a broad calm face with high cheekbones, dark watchful eyes, a thin scar along the jaw.',
    outfitNote: 'Slate field uniform under a dark tactical vest with plates and pouches, a holstered stun pistol, a shoulder radio, gloves and boots.',
    personality: 'Quiet, deadpan, unshakeable. Sees everything first. Reads poetry on the night watch and denies it. The pilot\'s favourite sparring partner.',
    voice: { pitch: 0.86, rate: 0.92, hint: ['Nora', 'Sara', 'Google UK English Female', 'Microsoft Libby', 'female'], female: true },
    app: A({ skin: 0xc29068, hair: 0x120e0c, hairStyle: 'ponytail', face: 1, build: 'broad', height: 1.05, bodyShape: 0.62, eyeColor: 0x24180e, facialHair: 'none', freckles: 0.02, scars: 1, age: 0.36, jaw: 6, eyeShape: 1, brows: 0, nose: 2, mouth: 1, ears: 0 }),
    outfit: {
      torso: { tex: 'c_uniform', color: SLATE, sleeve: 'long' }, legs: { tex: 'c_slacks', color: 0x2e3a44 }, legsKind: 'pants',
      feet: { tex: 'c_shoes_boot', color: 0x1e1c1a }, hands: { tex: 'c_gloves', color: 0x2a2826 },
    },
    ov: { hairVolume: 0.95 },
    gear: ['patchL', 'nameTape', 'tacVest', 'holster', 'shoulderRadio', 'braidTie'],
    scale: 1.01, dept_col: DEPT.sec, home: 'bridge',
    routine: [
      { from: 0, to: 4, room: 'bridge', act: 'patrol' }, { from: 4, to: 10, room: 'quarters', act: 'sleep' }, { from: 10, to: 11, room: 'mess', act: 'eat' },
      { from: 11, to: 13, room: 'hangar', act: 'patrol' }, { from: 13, to: 15, room: 'cargo', act: 'patrol' }, { from: 15, to: 16, room: 'gym', act: 'exercise', with: 'castellanos' },
      { from: 16, to: 18, room: 'engineering', act: 'patrol' }, { from: 18, to: 19, room: 'mess', act: 'eat', with: 'quintero' }, { from: 19, to: 21, room: 'quarters', act: 'read' },
      { from: 21, to: 24, room: 'bridge', act: 'patrol' },
    ],
    lines: {
      idle: ['All clear.', 'Hatch seven seal is soft. Logging it.', '...', 'Quiet ship. I like a quiet ship.', 'The pilot owes me twenty push-ups.'],
      click: ['Unit.', 'You move quietly for a ball. Good.', 'Stay behind me on the surface. Always.', 'I read your threat assessment code. Not bad.', 'No.'],
      grief: ['I was supposed to be the one who comes back hurt.', 'Watch rotation is wrong now. I keep fixing it.', 'I am fine. Ask me later.'],
      alarm: ['Clear the corridor!', 'Breach, starboard lab. Moving.'],
    },
    clickGesture: 'nod',
  },
};
export const member = (id: CrewId) => ROSTER[id];
