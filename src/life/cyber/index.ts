// CYBORG WORKERS: engineered creatures fitted with robotic parts. API (recorded in src/game/V6.md):
//   CYBER_PARTS, CYBER[id], partsFor(slot, plan), slotsFor(plan), fitPart(fit, id), unfitPart, fitCost(fit)  catalog.ts
//   workerProfile(design) -> { role, skills, carry, speed, armour, sight, control, needs, parts, tags, line }  roles.ts
//   Design.fit: the fitted part ids; every body builder sculpts them on (mount.ts growCyber)
//   cyberPartModel(design, id): a centred preview mesh of one part fitted to that body                    preview.ts
export * from './catalog';
export * from './roles';
export { cyberPartModel } from './preview';
