// The five mastery dioramas: each path is a living thing on a plinth that grows as it is mastered, and its twelve
// perks are PARTS of that thing (a node blooms, lights, assembles or fills when unlocked):
//   PLANT     a 3D plant: three branches (the sub-specialties) climb from the trunk; each perk is a bud on its branch
//             that swells when it can be taken and opens into a flower when installed; leaves fill in with level.
//   ENERGY    a grid of conduits fanning out from a generator: each perk is a junction box; installed ones glow and
//             send pulses of charge down the lines.
//   INDUSTRY  a machine assembling itself: each perk is a part on the machine (gears, pistons, hoppers, a stack);
//             installed parts are solid and running, the rest hang as wireframe ghosts.
//   BIO       a creature in its habitat (the game's own creature builder): each perk is a gene vial on a tendril;
//             installed vials glow full.
//   ROBOTICS  a robot being built on a scaffold (the game's robot models): each perk is a part on the scaffold.
import * as THREE from 'three';
import { Vignette, lam, glowM, ghostM, mesh } from './stage3d';
import { PERKS, SUBS, TIER_LV, type PathId, type Perk, type Mastery } from '../mastery';

export type NodeState = 'owned' | 'ready' | 'short' | 'locked' | 'barred';
const V = THREE.Vector3;
export interface DNode { id: string; anchor: THREE.Object3D; set(st: NodeState): void; tick(dt: number, t: number): void }

/** where perk (sub i, tier k) sits: three fans across the front, climbing and spreading with the tier */
export function nodePos(i: number, k: number, path: PathId) {
  const a = (i - 1) * 0.95, r = 0.45 + k * 0.42, y = 0.75 + k * 0.62 + (path === 'energy' ? -0.3 : 0);
  return new V(Math.sin(a) * r, y, Math.cos(a) * r * 0.5 + 0.1);
}
const BG: Record<PathId, number> = { plant: 0xa7b89a, bio: 0x93aeae, energy: 0x8794a8, industry: 0xb0a088, robotics: 0x99a4ae };
const TOP: Record<PathId, number> = { plant: 0x4a3626, bio: 0x3c4a44, energy: 0x2e3238, industry: 0x4a4038, robotics: 0x3a3e42 };

export class Diorama extends Vignette {
  nodes: DNode[] = [];
  private anim: ((dt: number, t: number) => void)[] = [];
  constructor(readonly path: PathId, readonly M: Mastery) {
    super({ bg: BG[path], top: TOP[path] });
    this.target.set(0, 1.9, 0); this.dist = 8.6; this.pitch = 0.16;
    const lv = M.level(path), perks = PERKS.filter((p) => p.path === path), subs = SUBS.filter((s) => s.path === path);
    const pos = (p: Perk) => nodePos(subs.findIndex((s) => s.id === p.sub), p.tier, path);
    if (path === 'plant') this.plant(perks, pos, lv);
    else if (path === 'energy') this.energy(perks, pos);
    else if (path === 'industry') this.industry(perks, pos);
    else if (path === 'bio') this.bio(perks, pos, lv);
    else this.robotics(perks, pos, lv);
  }
  override update(dt: number) { super.update(dt); for (const f of this.anim) f(dt, this.t); for (const n of this.nodes) n.tick(dt, this.t); }
  setStates(f: (id: string) => NodeState) { for (const n of this.nodes) n.set(f(n.id)); }

  // ---------------------------------------------------------------- PLANT
  private plant(perks: Perk[], pos: (p: Perk) => THREE.Vector3, lv: number) {
    const bark = lam(0x6a4a2e), barkG = lam(0x5a6a2e), leafM = lam(0x5f8f3e, { side: THREE.DoubleSide }), leafM2 = lam(0x7aa84a, { side: THREE.DoubleSide });
    const soil = mesh(new THREE.CylinderGeometry(1.1, 1.25, 0.18, 14), lam(0x3a2a1c), [0, 0.68, 0], this.root);
    for (let k = 0; k < 9; k++) { const a = k * 2.4, r = 0.4 + (k % 3) * 0.25; mesh(new THREE.DodecahedronGeometry(0.06 + (k % 2) * 0.03, 0), lam(0x8a8478), [Math.cos(a) * r, 0.79, Math.sin(a) * r], this.root); }
    void soil;
    const top = 0.9 + 0.18 * Math.min(10, lv);
    const trunk = new THREE.CatmullRomCurve3([new V(0, 0.75, 0), new V(0.04, 1.2, 0.02), new V(-0.03, top, 0)]);
    mesh(new THREE.TubeGeometry(trunk, 12, 0.11, 7), bark, undefined, this.root);
    const sway = new THREE.Group(); this.root.add(sway);
    const leaf = new THREE.Shape(); leaf.moveTo(0, 0); leaf.quadraticCurveTo(0.09, 0.08, 0, 0.26); leaf.quadraticCurveTo(-0.09, 0.08, 0, 0);
    const leafG = new THREE.ShapeGeometry(leaf, 3);
    const subsSeen = new Map<string, THREE.Vector3[]>();
    for (const p of perks) { const a = subsSeen.get(p.sub) ?? []; a.push(pos(p)); subsSeen.set(p.sub, a); }
    let li = 0;
    for (const pts of subsSeen.values()) {
      const all = [new V(0, Math.min(top, 1.05), 0), ...pts];
      // the grown part of the branch (up to the highest tier reached) is wood, the rest a faint vine still to come
      const reach = [1, 2, 3, 4].filter((k) => lv >= TIER_LV[k as 1]).length;
      const grown = all.slice(0, Math.max(2, reach + 1)), rest = all.slice(Math.max(1, reach));
      mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(grown), 18, 0.055, 6), barkG, undefined, sway);
      if (rest.length > 1) mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rest), 14, 0.02, 4), lam(0x9aa88a, { transparent: true, opacity: 0.45 }), undefined, sway);
      const cv = new THREE.CatmullRomCurve3(grown);
      const nLeaves = 3 + Math.round(lv * 1.2);
      for (let k = 0; k < nLeaves; k++) {
        const u = 0.12 + (k / nLeaves) * 0.85, at = cv.getPoint(u), tan = cv.getTangent(u);
        const l = mesh(leafG, (li++ % 3) ? leafM : leafM2, [at.x, at.y, at.z], sway);
        l.rotation.set(-0.6 + (k % 2) * 0.3, Math.atan2(tan.x, tan.z) + (k % 2 ? 1.7 : -1.7), (k % 2 ? 0.7 : -0.7));
        l.scale.setScalar(0.9 + (k % 3) * 0.25);
      }
    }
    this.anim.push((_, t) => { sway.rotation.z = Math.sin(t * 0.9) * 0.025; sway.rotation.x = Math.sin(t * 0.7 + 1) * 0.02; });
    // pollen drifting in the light
    const pollen = new THREE.Group(); this.root.add(pollen);
    for (let k = 0; k < 24; k++) mesh(new THREE.BoxGeometry(0.025, 0.025, 0.025), glowM(0xf6e7a8), [(Math.random() - 0.5) * 3, 0.8 + Math.random() * 3, (Math.random() - 0.5) * 2], pollen);
    this.anim.push((dt, t) => { pollen.children.forEach((c, k) => { c.position.y += dt * 0.08; c.position.x += Math.sin(t * 0.6 + k) * dt * 0.05; if (c.position.y > 4.2) c.position.y = 0.8; }); });
    // the perks: buds that swell when ready and open into flowers when installed
    const petalS = new THREE.Shape(); petalS.moveTo(0, 0); petalS.quadraticCurveTo(0.08, 0.1, 0, 0.2); petalS.quadraticCurveTo(-0.08, 0.1, 0, 0);
    const petalG = new THREE.ShapeGeometry(petalS, 3);
    const COLS = [0xe07a6a, 0xe8c050, 0xb87ad0, 0xf0f0e0];
    for (const p of perks) {
      const anchor = new THREE.Group(); anchor.position.copy(pos(p)); sway.add(anchor);
      const bud = mesh(new THREE.ConeGeometry(0.07, 0.2, 6), lam(0x6f9e45), [0, 0.06, 0], anchor);
      const flower = new THREE.Group(); anchor.add(flower);
      const col = COLS[p.tier - 1], petM = lam(col, { side: THREE.DoubleSide });
      for (let k = 0; k < 6; k++) { const pt = mesh(petalG, petM, [0, 0.02, 0], flower); pt.rotation.set(-1.1, (k / 6) * Math.PI * 2, 0); }
      mesh(new THREE.SphereGeometry(0.05, 6, 4), lam(0xf0c040), [0, 0.04, 0], flower);
      const glow = mesh(new THREE.SphereGeometry(0.13, 8, 6), glowM(0xf6f0b0, 0.35), [0, 0.06, 0], anchor);
      let st: NodeState = 'locked';
      this.nodes.push({ id: p.id, anchor, set: (s) => { st = s; bud.visible = s !== 'owned'; flower.visible = s === 'owned'; glow.visible = s === 'ready'; (bud.material as THREE.MeshLambertMaterial).color.setHex(s === 'locked' || s === 'barred' ? 0x7a7a60 : 0x6f9e45); bud.scale.setScalar(s === 'ready' ? 1.35 : s === 'short' ? 1.1 : 0.8); },
        tick: (_, t) => { if (st === 'ready') { const k = 1 + Math.sin(t * 3 + anchor.position.x * 5) * 0.12; glow.scale.setScalar(k); bud.rotation.y = t * 0.6; } if (st === 'owned') flower.rotation.y = Math.sin(t * 0.8 + anchor.position.y) * 0.25; } });
    }
  }

  // ---------------------------------------------------------------- ENERGY
  private energy(perks: Perk[], pos: (p: Perk) => THREE.Vector3) {
    const steel = lam(0x5f6261), dark = lam(0x2b2e31), cop = lam(0xb87a4a);
    // the generator: a stacked core with glowing bands
    mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.5, 10), dark, [0, 0.85, 0], this.root);
    const bands: THREE.Mesh[] = [];
    for (let k = 0; k < 4; k++) bands.push(mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.08, 10), glowM(0x7fd4e0), [0, 1.18 + k * 0.22, 0], this.root));
    for (let k = 0; k < 4; k++) mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.12, 10), cop, [0, 1.07 + k * 0.22, 0], this.root);
    mesh(new THREE.ConeGeometry(0.4, 0.35, 10), steel, [0, 2.1, 0], this.root);
    this.anim.push((_, t) => bands.forEach((b, k) => { b.scale.setScalar(1 + Math.sin(t * 4 - k) * 0.05); }));
    // conduits: down from the core, along the plinth, up a mast to each junction
    const pulses: { path: THREE.Vector3[]; m: THREE.Mesh; u: number; on: () => boolean }[] = [];
    for (const p of perks) {
      const at = pos(p), base = new V(at.x * 0.9, 0.66, at.z);
      const pts = [new V(0, 0.66, 0), base, new V(at.x, at.y - 0.16, at.z)];
      for (let k = 0; k < 2; k++) {
        const a = pts[k], b = pts[k + 1], d = b.clone().sub(a), L = d.length();
        const c = mesh(new THREE.BoxGeometry(0.06, 0.06, L), k ? steel : cop, [(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2], this.root);
        c.lookAt(b);
      }
      const anchor = new THREE.Group(); anchor.position.copy(at); this.root.add(anchor);
      mesh(new THREE.BoxGeometry(0.3, 0.26, 0.2), steel, [0, 0, 0], anchor);
      const lampOn = glowM(0x7fe0f0), lampRdy = glowM(0xf0b040), lampOff = lam(0x2a2e30);
      const lamp = mesh(new THREE.BoxGeometry(0.16, 0.08, 0.04), lampOff, [0, 0.03, 0.11], anchor);
      const ins = mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.16, 6), lam(0xd8d0c0), [0, 0.2, 0], anchor);
      void ins;
      let st: NodeState = 'locked';
      const pm = mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), glowM(0xb0f0ff), [0, 0, 0], this.root); pm.visible = false;
      pulses.push({ path: pts, m: pm, u: Math.random(), on: () => st === 'owned' });
      this.nodes.push({ id: p.id, anchor, set: (s) => { st = s; lamp.material = s === 'owned' ? lampOn : s === 'ready' ? lampRdy : lampOff; },
        tick: (_, t) => { if (st === 'ready') lamp.visible = Math.floor(t * 3) % 2 === 0; else lamp.visible = true; } });
    }
    this.anim.push((dt) => {
      for (const p of pulses) {
        p.m.visible = p.on(); if (!p.m.visible) continue;
        p.u = (p.u + dt * 0.5) % 1;
        const seg = p.u < 0.5 ? 0 : 1, k = (p.u % 0.5) * 2;
        p.m.position.lerpVectors(p.path[seg], p.path[seg + 1], k);
      }
    });
  }

  // ---------------------------------------------------------------- INDUSTRY
  private industry(perks: Perk[], pos: (p: Perk) => THREE.Vector3) {
    const olive = lam(0x5e6148), gun = lam(0x3a3d40), steel = lam(0x8d8f8a), haz = lam(0xc4973a), brick = lam(0x8a4a38);
    mesh(new THREE.BoxGeometry(1.4, 1.1, 1.0), olive, [0, 1.15, -0.3], this.root);
    mesh(new THREE.BoxGeometry(1.5, 0.12, 1.1), haz, [0, 0.66, -0.3], this.root);
    mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.6, 8), brick, [0.45, 2.3, -0.5], this.root);
    const smoke = new THREE.Group(); this.root.add(smoke);
    for (let k = 0; k < 6; k++) mesh(new THREE.DodecahedronGeometry(0.14, 0), lam(0xb8b4aa, { transparent: true, opacity: 0.6 }), [0.45, 3.2 + k * 0.3, -0.5], smoke);
    this.anim.push((dt) => smoke.children.forEach((c, k) => { c.position.y += dt * 0.35; c.position.x += dt * 0.08; c.scale.setScalar(1 + (c.position.y - 3.1) * 0.5); if (c.position.y > 5) { c.position.set(0.45, 3.1 + k * 0.02, -0.5); } }));
    // a conveyor along the front
    mesh(new THREE.BoxGeometry(3.6, 0.1, 0.5), gun, [0, 0.66, 1.3], this.root);
    const boxes = new THREE.Group(); this.root.add(boxes);
    for (let k = 0; k < 5; k++) mesh(new THREE.BoxGeometry(0.22, 0.18, 0.22), lam(0xa07a48), [-1.6 + k * 0.8, 0.82, 1.3], boxes);
    this.anim.push((dt) => boxes.children.forEach((c) => { c.position.x += dt * 0.3; if (c.position.x > 1.7) c.position.x = -1.7; }));
    const shapes = [
      () => { const g = new THREE.Group(); mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 12), steel, [0, 0, 0], g).rotation.x = Math.PI / 2; for (let k = 0; k < 8; k++) { const t = mesh(new THREE.BoxGeometry(0.07, 0.07, 0.08), steel, [Math.cos(k * 0.785) * 0.23, Math.sin(k * 0.785) * 0.23, 0], g); t.rotation.z = k * 0.785; } return g; },
      () => { const g = new THREE.Group(); mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.36, 8), gun, [0, 0.1, 0], g); mesh(new THREE.BoxGeometry(0.2, 0.12, 0.2), haz, [0, -0.12, 0], g); return g; },
      () => { const g = new THREE.Group(); mesh(new THREE.ConeGeometry(0.22, 0.32, 4), olive, [0, 0, 0], g).rotation.x = Math.PI; return g; },
      () => { const g = new THREE.Group(); mesh(new THREE.ConeGeometry(0.1, 0.36, 6), steel, [0, 0, 0], g).rotation.x = Math.PI; mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 8), gun, [0, 0.2, 0], g); return g; },
    ];
    for (const p of perks) {
      const at = pos(p), anchor = new THREE.Group(); anchor.position.copy(at); this.root.add(anchor);
      // an arm from the machine to the part
      const from = new V(Math.sign(at.x) * 0.5, Math.min(1.6, at.y), -0.3), d = at.clone().sub(from), L = d.length();
      const arm = mesh(new THREE.BoxGeometry(0.05, 0.05, L), gun, [(from.x + at.x) / 2, (from.y + at.y) / 2, (from.z + at.z) / 2], this.root); arm.lookAt(at);
      const solid = shapes[(p.tier - 1) % 4](); anchor.add(solid);
      const ghost = shapes[(p.tier - 1) % 4](); ghost.traverse((o) => { if ((o as THREE.Mesh).isMesh) { (o as THREE.Mesh).material = ghostM(0xe8e0c8); (o as THREE.Mesh).castShadow = false; } }); anchor.add(ghost);
      const halo = mesh(new THREE.TorusGeometry(0.3, 0.02, 4, 16), glowM(0xf0c060, 0.8), [0, 0, 0], anchor);
      let st: NodeState = 'locked';
      this.nodes.push({ id: p.id, anchor, set: (s) => { st = s; solid.visible = s === 'owned'; ghost.visible = s !== 'owned'; halo.visible = s === 'ready'; arm.visible = s === 'owned' || s === 'ready'; },
        tick: (_, t) => { if (st === 'owned') { if (p.tier % 4 === 1) solid.rotation.z = t * 1.6; else solid.position.y = Math.sin(t * 3 + at.x) * 0.04; } else ghost.rotation.y = t * 0.3; if (st === 'ready') halo.rotation.x = t; } });
    }
  }

  // ---------------------------------------------------------------- BIO
  private bio(perks: Perk[], pos: (p: Perk) => THREE.Vector3, lv: number) {
    const glass = lam(0xbfd8d8, { transparent: true, opacity: 0.35 }), flesh = lam(0xb07a6a), cap = lam(0x8a6a4a);
    // the habitat: moss and stones, and the creature itself (built async from the life module)
    mesh(new THREE.CylinderGeometry(1.4, 1.5, 0.12, 14), lam(0x4a6a3a), [0, 0.64, 0], this.root);
    const holder = new THREE.Group(); holder.position.set(0, 0.7, -0.2); this.root.add(holder);
    void (async () => {
      try {
        const [{ wildDesign }, { buildSpeciesModel, makeInstance }, { Animator }, { planetPalette }] = await Promise.all([import('../../life/design'), import('../../life/creatureMesh'), import('../../life/anim'), import('../../world/palette')]);
        const roles = ['grazer', 'grazer', 'stalker', 'tank'] as const;
        const d = wildDesign(roles[Math.min(3, Math.floor(lv / 3))] as never, planetPalette(5, 'amber'), 4100 + lv);
        const m = buildSpeciesModel(d), { mesh: cm, bones } = makeInstance(m);
        const box = new THREE.Box3().setFromObject(cm), size = box.getSize(new V());
        cm.scale.setScalar((1.2 + lv * 0.05) / Math.max(size.x, size.y, size.z)); cm.rotation.y = 0.6;
        holder.add(cm);
        const an = new Animator(m.rig, bones, cm);
        this.anim.push((dt, t) => an.update(dt, { speed: 0, turn: 0, state: 'idle', act: (t * 0.5) % 1, lookYaw: Math.sin(t * 0.5) * 0.5, lookPitch: 0, ground: () => 0, air: 1 } as never));
      } catch (e) { console.warn('bio diorama creature', e); mesh(new THREE.DodecahedronGeometry(0.5, 1), flesh, [0, 0.5, 0], holder); }
    })();
    for (const p of perks) {
      const at = pos(p), anchor = new THREE.Group(); anchor.position.copy(at); this.root.add(anchor);
      const tend = new THREE.CatmullRomCurve3([new V(at.x * 0.2, 1.0, -0.1), new V(at.x * 0.6, (1 + at.y) / 2 + 0.2, at.z * 0.5), at.clone().add(new V(0, -0.2, 0))]);
      const tm = mesh(new THREE.TubeGeometry(tend, 10, 0.02, 5), flesh, undefined, this.root);
      mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 10), glass, [0, 0, 0], anchor).castShadow = false;
      mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 10), cap, [0, 0.17, 0], anchor);
      const fill = mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.24, 10), glowM([0x7fd48a, 0x6fc0e0, 0xe08aa0, 0xf0c060][p.tier - 1]), [0, -0.02, 0], anchor);
      const bubble = mesh(new THREE.SphereGeometry(0.02, 5, 4), glowM(0xffffff), [0, 0, 0], anchor);
      let st: NodeState = 'locked';
      this.nodes.push({ id: p.id, anchor, set: (s) => { st = s; fill.visible = s === 'owned' || s === 'ready'; fill.scale.y = s === 'owned' ? 1 : 0.35; fill.position.y = s === 'owned' ? -0.02 : -0.1; tm.visible = s !== 'locked' && s !== 'barred'; bubble.visible = s === 'owned'; },
        tick: (_, t) => { if (st === 'owned') bubble.position.y = -0.1 + ((t * 0.4 + at.x) % 1) * 0.2; if (st === 'ready') fill.scale.y = 0.35 + Math.sin(t * 3) * 0.1; } });
    }
  }

  // ---------------------------------------------------------------- ROBOTICS
  private robotics(perks: Perk[], pos: (p: Perk) => THREE.Vector3, lv: number) {
    const gun = lam(0x3a3d40), haz = lam(0xc4973a), steel = lam(0x8d8f8a);
    // the scaffold
    for (const sx of [-1, 1]) mesh(new THREE.BoxGeometry(0.08, 3.4, 0.08), gun, [sx * 1.2, 2.3, -0.6], this.root);
    mesh(new THREE.BoxGeometry(2.5, 0.1, 0.1), haz, [0, 4.0, -0.6], this.root);
    const holder = new THREE.Group(); holder.position.set(0, 0.62, -0.1); this.root.add(holder);
    void import('../../robots/models').then(({ buildModel }) => {
      try {
        const kind = (lv >= 6 ? 'heavy' : lv >= 3 ? 'trooper' : 'worker') as never;
        const m = buildModel(kind, 'uspc');
        const box = new THREE.Box3().setFromObject(m.root), size = box.getSize(new V());
        m.root.scale.setScalar(1.7 / Math.max(0.01, size.y)); m.root.rotation.y = 0.5;
        holder.add(m.root);
        this.anim.push((_, t) => { m.root.position.y = Math.sin(t * 1.2) * 0.02; });
      } catch (e) { console.warn('robotics diorama robot', e); }
    }).catch(() => { /* scaffold only */ });
    const shapes = [
      () => { const g = new THREE.Group(); mesh(new THREE.BoxGeometry(0.1, 0.34, 0.1), steel, [0, 0, 0], g); mesh(new THREE.BoxGeometry(0.16, 0.08, 0.14), haz, [0, -0.18, 0], g); return g; },
      () => { const g = new THREE.Group(); mesh(new THREE.BoxGeometry(0.3, 0.06, 0.2), gun, [0, 0, 0], g); for (const sx of [-1, 1]) mesh(new THREE.BoxGeometry(0.2, 0.01, 0.03), steel, [sx * 0.18, 0.05, 0], g); return g; },
      () => { const g = new THREE.Group(); mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), steel, [0, 0, 0], g); mesh(new THREE.BoxGeometry(0.1, 0.06, 0.02), glowM(0x7fd4e0), [0, 0.02, 0.12], g); return g; },
      () => { const g = new THREE.Group(); for (let k = 0; k < 3; k++) mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), glowM(0xe0c060), [(k - 1) * 0.12, Math.abs(k - 1) * -0.06, 0], g); mesh(new THREE.BoxGeometry(0.34, 0.03, 0.03), steel, [0, -0.04, 0], g); return g; },
    ];
    for (const p of perks) {
      const at = pos(p), anchor = new THREE.Group(); anchor.position.copy(at); this.root.add(anchor);
      const solid = shapes[['limbs', 'drones', 'logic'].indexOf(p.sub) % 3](); anchor.add(solid);
      const ghost = shapes[['limbs', 'drones', 'logic'].indexOf(p.sub) % 3](); ghost.traverse((o) => { if ((o as THREE.Mesh).isMesh) { (o as THREE.Mesh).material = ghostM(0xd8e4f0); (o as THREE.Mesh).castShadow = false; } }); anchor.add(ghost);
      const hook = mesh(new THREE.BoxGeometry(0.015, 4.0 - at.y, 0.015), gun, [0, (4.0 - at.y) / 2, 0], anchor);
      const halo = mesh(new THREE.TorusGeometry(0.28, 0.02, 4, 16), glowM(0x9fd8f0, 0.8), [0, 0, 0], anchor);
      let st: NodeState = 'locked';
      this.nodes.push({ id: p.id, anchor, set: (s) => { st = s; solid.visible = s === 'owned'; ghost.visible = s !== 'owned'; halo.visible = s === 'ready'; hook.visible = s !== 'locked' && s !== 'barred'; },
        tick: (_, t) => { if (st === 'owned') solid.rotation.y = Math.sin(t + at.x) * 0.4; else ghost.rotation.y = t * 0.4; if (st === 'ready') halo.rotation.y = t * 1.5; } });
    }
  }
}
