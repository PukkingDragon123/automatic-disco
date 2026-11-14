// The drawings on file and where they are issued: weapon designs (kept in localStorage), which are tooled up (paid
// for once in factory items: the line can then make them), what the golem carries in its hand and on its mount, and
// which design each kind of Corps robot is issued. installWeapons(game) runs once per game (tickRobots calls it):
// new Corps robots get their issued weapon, and the golem's equipped weapons pick their own
// targets near where the player aims and fire (heat, ammunition from the factory's AMMO when it has any). [F2] or the
// ORDNANCE tab opens the workbench.
import * as THREE from 'three';
import type { Game } from '../../game/game';
import { STOCK, toWeapon, weaponCost, weaponStats, refuse, type WeaponDesign, type Cost } from './parts';
import { buildWeaponMesh } from './model';
import { robotHooks, fireWeapon, nearestHostile, type RobotUnit, type Shooter, type Weapon } from '../unit';
import { liveryFor } from '../atlas';
import { RAMPS } from '../../art/palette';

const KEY = 'oddworld.weapons.v1';
export interface WeaponStore { designs: WeaponDesign[]; tooled: string[]; golem: { hand: string | null; mount: string | null }; issue: Record<string, string> }
let S: WeaponStore | null = null;
export function store(): WeaponStore {
  if (S) return S;
  try { const t = localStorage.getItem(KEY); if (t) S = JSON.parse(t) as WeaponStore; } catch { /* private mode */ }
  if (!S || !Array.isArray(S.designs)) S = { designs: STOCK.map((d) => ({ ...d })), tooled: [], golem: { hand: null, mount: null }, issue: {} };
  S.tooled ??= []; S.golem ??= { hand: null, mount: null }; S.issue ??= {};
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
  if (!P || !P.started || !P.alive || dt <= 0) { child.fireAim = null; return; }
  let aim: THREE.Vector3 | null = null;
  for (const slot of ['hand', 'mount'] as const) {
    const G = guns[slot]; if (!G) continue;
    G.cd -= dt; G.heat = Math.max(0, G.heat - dt * 2.2);
    if (G.hot && G.heat < 3) G.hot = false;
    const t = nearestHostile(g, 'veyr', P.x, P.z, G.w.range, child.aim ?? undefined);
    if (!t) continue;
    aim = t.p;
    if (G.cd > 0 || G.hot) continue;
    const mz = child.weaponMuzzle(slot, _m); if (!mz) continue;
    fireWeapon(g, { faction: 'veyr', x: P.x, z: P.z } as Shooter, mz, t.p, G.w);
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
  // [F2] or the ORDNANCE tab on the right edge opens the workbench (every letter key is taken)
  const open = () => { if (g.engine.screen === g) import('./bench').then((m) => m.openBench(g.engine, g)); };
  g.input.onKey((e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.key !== 'F2') return;
    const t = (e.target as HTMLElement | null)?.tagName; if (t === 'INPUT' || t === 'TEXTAREA') return;
    e.preventDefault(); open();
  });
  const tab = document.createElement('button');
  tab.textContent = 'ORDNANCE [F2]';
  tab.style.cssText = `position:fixed;right:0;top:300px;writing-mode:vertical-rl;font:12px 'Jersey',monospace;letter-spacing:1px;padding:8px 4px;background:#${RAMPS.paper[3].toString(16)};color:#${RAMPS.ink[1].toString(16)};border:none;border-left:3px solid #${RAMPS.olive[1].toString(16)};box-shadow:-2px 2px 0 #14161b88;cursor:pointer;z-index:30`;
  tab.onclick = open;
  document.body.appendChild(tab);
  g.update$.push(() => { const on = g.engine.screen === g; if ((tab.style.display !== 'none') !== on) tab.style.display = on ? '' : 'none'; });
  const dis = g.dispose.bind(g); g.dispose = () => { tab.remove(); dis(); };
}
