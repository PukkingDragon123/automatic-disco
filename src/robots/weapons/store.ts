// The drawings on file and where they are issued: weapon designs (kept in localStorage), which are tooled up (paid
// for once in factory items: the line can then make them), what the golem carries in its hand and on its mount, and
// which design each kind of Corps robot is issued. installWeapons(game) runs once per game (tickRobots calls it):
// new Corps robots get their issued weapon, and the golem's equipped weapons pick their own
// targets near where the player aims and fire (heat, ammunition from the factory's AMMO when it has any). [F2] or the
// console's ARMS toggle opens the workbench.
import * as THREE from 'three';
import type { Game } from '../../game/game';
import type { Creature } from '../../game/creature';
import { STOCK, toWeapon, weaponCost, weaponStats, refuse, type WeaponDesign, type Cost } from './parts';
import { buildWeaponMesh } from './model';
import { robotHooks, fireWeapon, nearestHostile, type RobotUnit, type Shooter, type Weapon } from '../unit';
import { liveryFor } from '../atlas';
import { RAMPS } from '../../art/palette';
import { TRIGGER } from './trigger';

const KEY = 'oddworld.weapons.v1';
export interface WeaponStore {
  designs: WeaponDesign[]; tooled: string[]; golem: { hand: string | null; mount: string | null }; issue: Record<string, string>;
  /** the golem's mounts pick their own targets (off: they fire only on the trigger) */ auto?: boolean;
  /** creature designs (by species name) and the weapon design bolted on their backs */ beasts?: Record<string, string>;
}
let S: WeaponStore | null = null;
export function store(): WeaponStore {
  if (S) return S;
  try { const t = localStorage.getItem(KEY); if (t) S = JSON.parse(t) as WeaponStore; } catch { /* private mode */ }
  if (!S || !Array.isArray(S.designs)) S = { designs: STOCK.map((d) => ({ ...d })), tooled: [], golem: { hand: null, mount: null }, issue: {} };
  S.tooled ??= []; S.golem ??= { hand: null, mount: null }; S.issue ??= {}; S.beasts ??= {};
  return S;
}
export function saveStore() { try { localStorage.setItem(KEY, JSON.stringify(store())); } catch { /* ignore */ } }
export const designById = (id: string | null | undefined) => (id ? store().designs.find((d) => d.id === id) ?? null : null);

interface Fac { count(id: string): number; take(id: string, n: number): boolean }
const factoryOf = (g: Game | null): Fac | null => { const f = (g as unknown as { factory?: Partial<Fac> } | null)?.factory; return f && typeof f.count === 'function' && typeof f.take === 'function' ? f as Fac : null; };
/** which absorbed genes the run owns (biological payloads need them); everything is allowed without a game */
export function genesOf(g: Game | null): (id: string) => boolean {
  const run = (g as unknown as { run?: { has?(id: string): boolean } } | null)?.run;
  return run && typeof run.has === 'function' ? (id) => !!run.has!(id) : () => true;
}
/** what is still missing to tool up a design (null: it can be built) */
export function lack(g: Game | null, d: WeaponDesign): string | null {
  const f = factoryOf(g); if (!f) return null;
  for (const [k, n] of Object.entries(weaponCost(d))) if ((n ?? 0) > 0 && f.count(k) < (n ?? 0)) return `NEEDS ${n} ${k.replace(/_/g, ' ').toUpperCase()} (${f.count(k)} IN STORE)`;
  return null;
}
export const isTooled = (d: WeaponDesign) => store().tooled.includes(d.id) || d.id.startsWith('stock-m1');
/** pay for the tooling and put it on the line; returns an error or null */
export function toolUp(g: Game | null, d: WeaponDesign): string | null {
  const why = refuse(d, genesOf(g)) ?? lack(g, d); if (why) return why;
  const f = factoryOf(g), c: Cost = weaponCost(d);
  if (f) for (const [k, n] of Object.entries(c)) if (n) f.take(k, n);
  if (!store().tooled.includes(d.id)) store().tooled.push(d.id);
  saveStore();
  return null;
}

// ------------------------------------------------------------------------------------------------ issuing
/** bolt a design onto a robot */
export function equipUnit(u: RobotUnit, d: WeaponDesign | null) {
  if (!d) { u.equip(null); u.design = null; return; }
  const wm = buildWeaponMesh(d, liveryFor(u.faction));
  const sc = u.human ? 1 : Math.min(1.4, Math.max(0.45, u.height * 0.55));
  wm.root.scale.setScalar(sc);
  if (u.human) {
    // held like a rifle: the weapon's +z along the hand
    const wrap = new THREE.Group(); wrap.name = 'equipped'; wm.root.rotation.set(0, Math.PI / 2, 0); wrap.add(wm.root); wrap.scale.setScalar(u.human.rig.s * 0.9);
    u.human.rig.hold('R', wrap, 'along'); u.human.gun = wrap; u.human.muzzle = wm.muzzle;
    u.weapon = toWeapon(d);
  } else u.equip(toWeapon(d), wm.root);
  u.design = d;
}
export function issueTo(g: Game | null, kind: string, id: string | null) {
  const s = store();
  if (id) s.issue[kind] = id; else delete s.issue[kind];
  saveStore();
  const d = designById(id);
  for (const u of (g as unknown as { robots?: RobotUnit[] } | null)?.robots ?? []) if (!u.dead && u.faction === 'veyr' && u.kind === kind) equipUnit(u, d);
}
// ------------------------------------------------------------------------------------------------ engineered creatures
/** the smallest body (metres, nose to tail) that can carry a back mount */
export const BEAST_MIN_LEN = 1.2;
interface BeastGun { id: string; w: Weapon; cd: number; ammo: number; ammoPer: number; mount: THREE.Group; pivot: THREE.Group; muzzle: THREE.Object3D }
const BEASTS = new WeakMap<Creature, BeastGun>();
/** can this species carry a weapon on its back? (null: yes, else why not) */
export function beastRefuse(sp: { pheno: { length: number }; model: { rig: { spine: number[] } } }): string | null {
  if (sp.pheno.length < BEAST_MIN_LEN) return 'TOO SMALL FOR A BACK MOUNT';
  if (!sp.model.rig.spine.length) return 'NO SPINE TO BOLT TO';
  return null;
}
/** issue a weapon design to every animal of a creature design (null takes it back off) */
export function issueToBeast(g: Game | null, name: string, id: string | null) {
  const s = store(); s.beasts ??= {};
  if (id) s.beasts[name] = id; else delete s.beasts[name];
  saveStore();
  if (!g) return;
  for (const c of g.world.creatures) if (!c.dead && c.faction === 'veyr' && c.sp.name === name) equipBeast(c, designById(id));
}
/** bolt a design onto a creature's back: a pivoting cradle on the spine bone (rides the body's motion) */
export function equipBeast(c: Creature, d: WeaponDesign | null) {
  const old = BEASTS.get(c);
  if (old) { old.mount.removeFromParent(); old.mount.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); BEASTS.delete(c); }
  if (!d || beastRefuse(c.sp)) return;
  const rig = c.sp.model.rig, bi = rig.spine[rig.spine.length > 2 ? Math.floor(rig.spine.length / 2) : 0];
  const bone = (c.anim as unknown as { bones: THREE.Bone[] }).bones?.[bi]; if (!bone) return;
  // the top of the back over that bone: the highest body box on it
  let top = 0, zc = 0, n = 0;
  for (const b of rig.boxes) if (b.bone === bi && (b.mat === 'body' || b.mat === 'limb')) { top = Math.max(top, b.c[1] + b.s[1] / 2); zc += b.c[2]; n++; }
  const wm = buildWeaponMesh(d, 'uspc');
  const mount = new THREE.Group(), pivot = new THREE.Group();
  mount.name = 'beast-mount'; mount.position.set(0, top + 0.03, n ? zc / n : 0);
  // a saddle plate under the cradle, in the weapon's own finish
  const sc = Math.min(1.5, Math.max(0.35, (rig.length * 0.5) / Math.max(0.2, wm.length)));
  wm.root.scale.setScalar(sc); wm.root.position.set(0, 0.04 * sc, -wm.length * sc * 0.3);
  pivot.add(wm.root); mount.add(pivot); bone.add(mount);
  const st = weaponStats(d);
  BEASTS.set(c, { id: d.id, w: toWeapon(d), cd: Math.random(), ammo: 0, ammoPer: st.ammo, mount, pivot, muzzle: wm.muzzle });
}
const _bm = new THREE.Vector3();
let beastScanT = 0;
/** creatures of an issued design get their weapon; armed ones turn it on the nearest enemy in range and fire */
function tickBeastGuns(g: Game, dt: number) {
  if (dt <= 0) return;
  const s = store(), issued = s.beasts ?? {};
  if ((beastScanT -= dt) <= 0) {
    beastScanT = 0.7;
    if (Object.keys(issued).length) for (const c of g.world.creatures) {
      if (c.dead || c.faction !== 'veyr') continue;
      const want = issued[c.sp.name] ?? null, has = BEASTS.get(c);
      if ((has?.id ?? null) !== want) equipBeast(c, designById(want));
    }
  }
  for (const c of g.world.creatures) {
    const G = BEASTS.get(c); if (!G) continue;
    if (c.dead || c.faction !== 'veyr') { equipBeast(c, null); continue; }
    G.cd -= dt;
    const t = nearestHostile(g, 'veyr', c.x, c.z, G.w.range);
    // the cradle swings toward the target (or back to the front)
    const want = t ? Math.atan2(t.p.x - c.x, t.p.z - c.z) - c.yaw : 0;
    const da = Math.atan2(Math.sin(want - G.pivot.rotation.y), Math.cos(want - G.pivot.rotation.y));
    G.pivot.rotation.y += da * Math.min(1, dt * 6);
    if (!t || G.cd > 0 || Math.abs(da) > 0.35 || !c.mesh.visible && Math.random() < 0.5) continue;
    G.muzzle.updateWorldMatrix(true, false);
    const mz = G.muzzle.getWorldPosition(_bm);
    fireWeapon(g, { faction: 'veyr', x: c.x, z: c.z } as Shooter, mz, t.p, G.w);
    G.cd = G.w.cd * (0.9 + Math.random() * 0.25);
    G.ammo += G.ammoPer; if (G.ammo >= 10) { G.ammo -= 10; factoryOf(g)?.take('ammo', 1); }
  }
}

// ------------------------------------------------------------------------------------------------ the golem
interface Gun { id: string; w: Weapon; cd: number; heat: number; hot: boolean; ammo: number; heatPer: number; ammoPer: number }
const GUNS = new WeakMap<object, Record<'hand' | 'mount', Gun | null>>();
export function equipGolem(g: Game | null, slot: 'hand' | 'mount', id: string | null) {
  const s = store(); s.golem[slot] = id; saveStore();
  if (!g) return;
  const d = designById(id), child = (g as unknown as { child?: { equipWeapon(s: 'hand' | 'mount', o: THREE.Object3D | null): void } }).child;
  child?.equipWeapon(slot, d ? buildWeaponMesh(d, 'uspc').root : null);
  const guns = GUNS.get(g) ?? { hand: null, mount: null };
  if (d) { const st = weaponStats(d); guns[slot] = { id: d.id, w: toWeapon(d), cd: 0, heat: 0, hot: false, ammo: 0, heatPer: st.heat, ammoPer: st.ammo }; } else guns[slot] = null;
  GUNS.set(g, guns);
}
const _m = new THREE.Vector3();
function tickGolemGuns(g: Game, dt: number) {
  const guns = GUNS.get(g); if (!guns) return;
  const P = (g as unknown as { player?: { x: number; y: number; z: number; alive: boolean; started: boolean } }).player;
  const child = g.child as unknown as { aim: THREE.Vector3 | null; look: THREE.Vector3; fireAim: THREE.Vector3 | null; weaponMuzzle(s: 'hand' | 'mount', o?: THREE.Vector3): THREE.Vector3 | null; recoil(k?: number): void };
  TRIGGER.armed = !!(guns.hand || guns.mount);
  if (!P || !P.started || !P.alive || dt <= 0) { child.fireAim = null; return; }
  // the trigger (right mouse, a side button, touch FIRE) fires where the golem aims, snapping to an enemy close to
  // that point; with AUTO-TARGET on, the mounts pick the nearest enemy themselves while the trigger is up
  const manual = TRIGGER.mouse || TRIGGER.touch, auto = !!store().auto;
  const aimPt = child.aim ?? child.look;
  let aim: THREE.Vector3 | null = null;
  for (const slot of ['hand', 'mount'] as const) {
    const G = guns[slot]; if (!G) continue;
    G.cd -= dt; G.heat = Math.max(0, G.heat - dt * 2.2);
    if (G.hot && G.heat < 3) G.hot = false;
    let tp: THREE.Vector3 | null = null;
    if (manual) {
      const near = TRIGGER.touch && !TRIGGER.mouse ? nearestHostile(g, 'veyr', P.x, P.z, G.w.range, aimPt) : nearestHostile(g, 'veyr', aimPt.x, aimPt.z, 1.6);
      tp = near ? near.p : new THREE.Vector3(aimPt.x, Math.max(aimPt.y, g.world.surfaceY(aimPt.x, aimPt.z)) + 0.35, aimPt.z);
    } else if (auto) tp = nearestHostile(g, 'veyr', P.x, P.z, G.w.range, aimPt)?.p ?? null;
    if (!tp) continue;
    aim = tp;
    if (G.cd > 0 || G.hot) continue;
    const mz = child.weaponMuzzle(slot, _m); if (!mz) continue;
    fireWeapon(g, { faction: 'veyr', x: P.x, z: P.z } as Shooter, mz, tp, G.w);
    G.cd = G.w.cd * (0.9 + Math.random() * 0.2);
    G.heat += G.heatPer; if (G.heat > 10) { G.hot = true; g.fx.burst(mz.x, mz.y, mz.z, 8, RAMPS.snow[4], { speed: 0.6, up: 1.4, size: 3, life: 1, grav: -0.8 }); }
    G.ammo += G.ammoPer; if (G.ammo >= 10) { G.ammo -= 10; factoryOf(g)?.take('ammo', 1); }
    child.recoil(G.w.shot === 'shell' ? 1 : 0.4);
  }
  child.fireAim = aim;
}

// ------------------------------------------------------------------------------------------------ install
export function installWeapons(g: Game) {
  const s = store();
  robotHooks.spawn.push((u, game) => { if (game === g && u.faction === 'veyr' && s.issue[u.kind]) equipUnit(u, designById(s.issue[u.kind])); });
  for (const u of (g as unknown as { robots?: RobotUnit[] }).robots ?? []) if (u.faction === 'veyr' && s.issue[u.kind]) equipUnit(u, designById(s.issue[u.kind]));
  for (const slot of ['hand', 'mount'] as const) if (s.golem[slot]) equipGolem(g, slot, s.golem[slot]);
  g.update$.push((dt) => { try { tickGolemGuns(g, dt); } catch (e) { console.error('golem guns', e); } });
  g.update$.push((dt) => { try { tickBeastGuns(g, dt); } catch (e) { console.error('beast guns', e); } });
  // the trigger: holding the right button (or a side button) over the view fires while a weapon is on the golem;
  // Ctrl + right click keeps the old right click (fly there, order the allies). Side buttons never navigate away.
  const cv = g.engine.canvas;
  const isFire = (e: MouseEvent) => (e.button === 2 && !e.ctrlKey) || e.button === 3 || e.button === 4;
  const driving = () => !!(g as unknown as { player?: { driving?: boolean } }).player?.driving && g.engine.screen === g;
  const down = (e: PointerEvent) => {
    if (e.target !== cv || !isFire(e) || !TRIGGER.armed || !driving()) return;
    e.stopImmediatePropagation(); e.preventDefault(); TRIGGER.mouse = true;
  };
  const up = (e: PointerEvent | MouseEvent) => { if (e.button === 2 || e.button === 3 || e.button === 4) { if (TRIGGER.mouse && e.button !== 2) e.preventDefault(); TRIGGER.mouse = false; } };
  const nav = (e: MouseEvent) => { if ((e.button === 3 || e.button === 4) && TRIGGER.armed) e.preventDefault(); };
  addEventListener('pointerdown', down, true); addEventListener('pointerup', up, true); addEventListener('mouseup', nav, true); addEventListener('blur', () => { TRIGGER.mouse = false; });
  // [F2] or the console's ARMS toggle opens the workbench (every letter key is taken)
  const open = () => { if (g.engine.screen === g) import('./bench').then((m) => m.openBench(g.engine, g)); };
  g.input.onKey((e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.key !== 'F2') return;
    const t = (e.target as HTMLElement | null)?.tagName; if (t === 'INPUT' || t === 'TEXTAREA') return;
    e.preventDefault(); open();
  });
  // (the console's FIELD panel carries the ARMS toggle that opens the bench on touch screens: ui/hud.ts)
  const dis = g.dispose.bind(g); g.dispose = () => { removeEventListener('pointerdown', down, true); removeEventListener('pointerup', up, true); removeEventListener('mouseup', nav, true); TRIGGER.mouse = TRIGGER.touch = TRIGGER.armed = false; dis(); };
}
