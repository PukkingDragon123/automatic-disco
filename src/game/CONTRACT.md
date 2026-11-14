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
