# Contract: factory, factions and robots (v3)

Three systems are built in parallel against this file. Keep these names stable; extend, don't rename.

## Premise
1957. Unit 07 (U.S. Planetary Corps) lands as a small, cute survey drone and slowly builds itself into a huge,
very detailed war machine, and builds a robot army and an automated industrial base to hold the planet. It is a race:
Soviet and Chinese (PRC) robot programmes have landed their own machines, and other human expeditions arrive by
lander. Factions are drawn as era hardware (red star / five-star livery, Cyrillic or Chinese stencil serials), never
as caricatures of people.

## Factions
`Faction` (src/game/species.ts) becomes:
`'wild' | 'veyr' | 'rival' | 'soviet' | 'prc' | 'expedition'`. 'veyr' is the player (U.S.P.C.); 'rival' stays for old
code paths. Hostility: everyone fights everyone except their own; 'wild' fights when provoked.

## Robots (src/robots/*, owned by the robots agent)
- `RobotKind`: player ('scout', 'worker', 'trooper', 'heavy', 'artillery', 'walker') and enemy kinds per faction
  ('sov_*', 'prc_*') plus human 'expedition_*' units (which may reuse LIMBOPHOBIA humans).
- `class RobotUnit { readonly kind; faction: Faction; x; y; z; hp; maxHp; dead; mesh: THREE.Object3D;
  constructor(game: Game, kind: RobotKind, faction: Faction, x: number, z: number);
  order(o: { k: 'move' | 'attack' | 'guard' | 'patrol' | 'work'; x?: number; z?: number; target?: any }): void;
  update(dt: number): void; damage(n: number, from?: any): void; dispose(): void }`
- `spawnRobot(game, kind, faction, x, z): RobotUnit` registers it in `game.robots: RobotUnit[]`.
- Golem stages (child.ts): stage 0 "drone" (cute, small), then frame, hauler, war machine and colossus, driven by
  chassis skills. `child.stage` is 0..4.

## Factory (src/factory/*, owned by the factory agent)
- Items: `ItemId` strings in src/factory/items.ts (raw: ore, carbon, water, soil; refined: iron_plate, copper_wire,
  glass, plastic, circuit, gear, servo, frame, reactor_core, ammo, ...).
- Buildings on a grid: miners, conveyors, splitters, smelters, assemblers, storage, power, research and the
  ROBOT FOUNDRY (consumes parts and calls `spawnRobot(game, kind, 'veyr', x, z)`).
- Workers: tamed creatures are assigned jobs (`haul`, `operate`, `mine`); they walk between buildings carrying items.
- Events: 'built' {kind, x, z}, 'produced' {item, n}, 'destroyed' {kind, x, z, by}.
- `game.factory.buildings` is the list enemies target: each has { x, z, hp, faction, kind, damage(n) }.

## Factions AI (src/game/factions/*, owned by the factions agent)
- Each faction has a base (lander plus structures), an economy tick, production of RobotUnits, and attack waves that
  target `game.factory.buildings`, `game.robots` and the golem. Expeditions arrive mid-game by lander.
- `game.factions` (src/game/factions/index.ts, a `Factions`):
  - `structures: FStructure[]`: every faction structure, a target like a factory building:
    { x, z, y, hp, maxHp, radius, height, faction, kind, dead, damage(n, from?) }. Kinds: lander (the HQ: destroying
    it eliminates the faction), miner, factory, bunker, artillery, tower, mast, depot, tent. **Player robots and turrets
    should include these in their target scan.**
  - `units`: every unit the factions fielded (RobotUnits from `spawnRobot`; a StubUnit only if spawnRobot refuses).
  - `hostile(a, b)`: like robots' `hostile`, but a paid-off expedition is at peace with 'veyr' (`truce`). Robots
    should prefer `game.factions?.hostile(a, b) ?? hostile(a, b)` so truces hold.
  - `nearestHostile(x, z, r, faction)`, `eachHostileIn(x, z, r, faction, fn)`, `hit(ref, n, from)`: shared targeting.
  - `cleared()`: the region win also needs every faction eliminated or driven off (game.checkEnd uses it).
- `factionsForRegion(region, planet?)` / `planFactions(seed, danger)` (factions/plan.ts, pure, no three.js): the
  1-2 factions on a region, `[{ faction, x, z, strength, arrive, name }]`, exactly what the region screen spawns
  (bases settle within ~12 m of x, z). `factionSummary(region)` is a one-line label for planet UI.
- Expedition units capture: engineers channel next to a factory building (sets `building.faction = 'expedition'`, or
  calls `building.capture('expedition')` if it exists) or a 'veyr' creature (its faction changes). Expedition humans
  should not shoot buildings (they want them whole).
- Events on game: 'faction-wave' {faction, n, x, z, vsOther}, 'faction-eliminated' {faction, name, left?},
  'captured' {target, by, x, z}.
