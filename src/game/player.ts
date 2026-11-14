// Unit 07 under direct control. WASD / arrows / the touch stick fly the golem over the ground (it hovers, follows
// the terrain, carries momentum, is stopped by rock, cliffs and deep water); the camera trails it in the 3/4 view.
// It punches (piston arms, or a headbutt while it is only a head), picks up and throws stones and boulders, dashes
// (a plow with the skill), works whatever is in front of it with [E] (drill, scrape, siphon, excavate, intake,
// graft, press seed, convert), takes hits, breaks apart and reboots at the core. Its body follows the skill tree.
import * as THREE from 'three';
import type { Game } from './game';
import { type Creature, GOLEM_REF, type GolemTarget } from './creature';
import { Gore, type Intake } from './gore';
import { Stones, Loot, Knocks, strike, bindSkills, powerOwned, RES_COL, BLOW, vfx2d, type Stone } from './combat';
import { CHASSIS, type Work } from './child';
import { floatText, floatLayer } from '../ui/floatText';
import { TouchControls, isTouchDevice, type TouchHost } from '../ui/touch';
import { SKILL, type Res } from './skills';
import type { Ability } from './hive';
import { sfx } from '../audio/audio';
import { toast } from '../ui/kit';
import { clamp, damp, dampA } from '../core/rand';
import { GENE } from '../life/genes';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _c = new THREE.Color();
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const SCALE = 0.45;
const PART_NAME: Record<string, string> = { head: 'SURVEY HEAD ONLINE', torso: 'CORE HOUSING ONLINE', armR: 'RIGHT ARM ONLINE', armL: 'LEFT ARM ONLINE', coil: 'GRAVITY COIL ONLINE', plating1: 'PLATE STEEL BOLTED ON', plating2: 'HEAVY PLATE BOLTED ON' };
const RES_NAME: Record<Res, string> = { ore: 'ORE', carbon: 'CARBON', water: 'WATER', soil: 'SOIL' };

type CtxKind = 'drop' | 'grab' | 'drill' | 'grit' | 'intake' | 'gibs' | 'plantC' | 'convert' | 'plant' | 'siphon' | 'dig' | 'none';
interface Ctx {
  kind: CtxKind; label: string; ok: boolean; at: THREE.Vector3;
  stone?: Stone; c?: Creature; dep?: number; rock?: number; plant?: number; res?: Res; rate?: number;
}
interface Pending { t: number; fn: () => void }

export class Player implements GolemTarget, TouchHost {
  x: number; z: number; y: number;
  vx = 0; vz = 0; yaw = 0;
  alive = true; hull = 30; hullMax = 30;
  readonly gore: Gore; readonly stones: Stones; readonly loot: Loot; readonly knocks: Knocks;
  held: Stone | null = null;
  ctx: Ctx | null = null;
  /** the golem is under control (hatched, not in a cutscene) */
  started = false;
  touch: TouchControls | null = null;
  private lastHurt = -99; private rebootT = 0; private invuln = 0; private deathAt = new THREE.Vector3();
  private punchCd = 0; private comboN = 0; private comboT = 0; private lmb = false; private nextArm: 'armR' | 'armL' = 'armR';
  private dashT = 0; private dashCd = 0; private plowHit = new Set<Creature>();
  private moveGoal: { x: number; z: number } | null = null;
  private aim = new THREE.Vector3(); private aimOn = false; private mouseT = -99; private lastMx = -1; private lastMy = -1;
  private use = { down: false, t: 0, shift: false, fired: false };
  private channel: { kind: CtxKind; t: number; acc: number; tick: number; ctx: Ctx; intake?: Intake; prog?: number; dug?: number } | null = null;
  private pending: Pending[] = [];
  private gathered: Record<Res, number> = { ore: 0, carbon: 0, water: 0, soil: 0 };
  private gatherT = 0; private fullT = 0;
  private stopUntil = 0; private prevScale = 1;
  private orbit: { x: number } | null = null;
  private grafted = new Set<number>();
  private touchAim: { x: number; y: number } | null = null;
  private dug = new Map<number, number>();
  private camInit = false;
  private mouth = () => (this.alive ? this.g.child.mouthPos(new THREE.Vector3()) : null);
  private follow = () => _v2.set(this.x + this.vx * 0.22, 0, this.z + this.vz * 0.22);

  constructor(readonly g: Game) {
    const core = g.veyr.core;
    this.x = core ? core.x : g.region.landing.x; this.z = core ? core.z + 1.8 : g.region.landing.z; this.y = g.world.surfaceY(this.x, this.z);
    this.gore = new Gore(g);
    this.stones = new Stones(g);
    this.loot = new Loot(g);
    this.knocks = new Knocks(g, this.gore);
    bindSkills(g.run.skills);
    this.stones.near = () => _v.set(this.x, 0, this.z);
    this.stones.onHit = (s, c, sp) => this.stoneHit(s, c, sp);
    this.loot.onCollect = (res, amt, p) => this.credit(res, amt, p);
    // the body as the skill tree has it; parts bought later fly in and click into place
    g.child.setScale(SCALE);
    g.child.attachGhost(g.world.fxScene);
    g.child.setParts(this.chassis(), false);
    this.recalcHull(true);
    g.child.onAssembled = (part, at) => this.assembled(part, at);
    // the world's deaths: gore, kill attribution
    const prev = g.world.hooks.onDeath;
    g.world.hooks.onDeath = (c, by) => { prev?.(c, by); this.onDeath(c, by); };
    // skills and core cells: the events, with a per-frame check behind them for anything bought or granted quietly
    this.known = new Set(g.run.skills.owned); this.lastPts = g.run.skills.points;
    g.on('skill', (d: { id: string }) => { if (d?.id && !this.known.has(d.id)) { this.known.add(d.id); this.onSkill(d.id); } });
    g.on('points', (d: { n: number; why?: string }) => { if (d && d.n > 0) { this.cells(d.n); this.evPts += d.n; this.evT = 2; } });
    g.on('gather', (d: { res: Res }) => { if (d?.res) g.child.flash(RES_COL[d.res], 0.35); });
    // touch controls on touch screens (and the moment one is touched)
    if (isTouchDevice()) this.touch = new TouchControls(this);
    addEventListener('touchstart', this.onFirstTouch, { passive: true });
    // keep the overlays in step with the screen stack
    const sus = g.suspend.bind(g), res = g.resume.bind(g), dis = g.dispose.bind(g);
    g.suspend = () => { sus(); this.setVisible(false); this.unstop(); };
    g.resume = () => { res(); this.setVisible(true); };
    g.dispose = () => { this.dispose(); dis(); };
    g.update$.push((dt) => { try { this.update(dt); } catch (e) { if (this.errs++ < 5) console.error('player', e); } });
  }
  private known: Set<string>; private lastPts: number; private errs = 0; private evPts = 0; private evT = 0;
  private cells(n: number) {
    floatText(this.g, this.x, this.y + this.height + 0.2, this.z, `+${n} CORE CELL${n > 1 ? 'S' : ''}`, 'point', { big: 1, life: 2.2 });
    this.g.child.wiggle(); this.g.child.flash(0x7ae088, 1.2); sfx('done', 1, 0.7);
    this.g.fx.burst(this.x, this.y + this.height * 0.6, this.z, 20, 0x7ae088, { glow: true, speed: 1.2, up: 2.4, size: 2, life: 0.9, grav: -0.8 });
  }
  private onFirstTouch = () => { if (!this.touch) this.touch = new TouchControls(this); };
  private setVisible(v: boolean) { floatLayer(this.g).visible = v; this.touch?.setVisible(v); }

  // ------------------------------------------------------------------ the body
  get skills() { return this.g.run.skills; }
  has(id: string) { return this.skills.has(id); }
  private chassis() { return CHASSIS.filter((p) => this.has(p)); }
  get radius() { return this.has('torso') ? 0.24 : 0.14; }
  get height() { return this.has('torso') ? 0.62 : 0.32; }
  get mass() { return 2 + (this.has('torso') ? 4 : 0) + (this.has('armR') ? 1.5 : 0) + (this.has('armL') ? 1.5 : 0) + (this.has('coil') ? 1 : 0) + (this.has('plating1') ? 1.5 : 0) + (this.has('plating2') ? 2.5 : 0); }
  private get armor() { return this.has('plating2') ? 0.32 : this.has('plating1') ? 0.16 : 0; }
  private calcHullMax() { return 24 + (this.has('torso') ? 26 : 0) + (this.has('armR') ? 8 : 0) + (this.has('armL') ? 8 : 0) + (this.has('coil') ? 6 : 0) + (this.has('plating1') ? 40 : 0) + (this.has('plating2') ? 70 : 0) + (this.has('reactor') ? 10 : 0); }
  private recalcHull(fill = false) { const m = this.calcHullMax(); if (fill) this.hull = m; else this.hull = Math.min(m, this.hull + Math.max(0, m - this.hullMax)); this.hullMax = m; }
  private get speedMax() { return this.has('coil') ? 4.8 : this.has('torso') ? 3.5 : 3.1; }
  private canGrab(s: Stone) { return s.big ? this.has('boulder') && this.g.child.arms.length >= 2 : this.has('rock') && this.g.child.arms.length >= 1; }

  private onSkill(id?: string) {
    if (!id) return;
    if ((CHASSIS as readonly string[]).includes(id)) { this.syncParts(true); return; }
    const s = SKILL[id];
    const power = (['lift', 'slam', 'repulse', 'well', 'shape', 'storm'] as string[]).includes(id);
    floatText(this.g, this.x, this.y + this.height + 0.25, this.z, power ? `${s?.name ?? id} LOADED` : `${s?.name ?? id} INSTALLED`, 'skill', { big: 1 });
    this.g.child.wiggle(); this.g.child.flash(0xfff0a0, 1.5);
    this.g.fx.burst(this.x, this.y + this.height * 0.6, this.z, 24, this.g.child.lookData.glow, { glow: true, speed: 1.6, up: 2, size: 2, life: 0.8, grav: -0.5 });
    sfx('done', 1, 0.8);
    if (id === 'reactor') this.recalcHull();
  }
  private syncParts(animate: boolean) {
    const added = this.g.child.setParts(this.chassis(), animate);
    if (added.length) {
      this.recalcHull();
      sfx('build', 1.3, 0.6); sfx('zap', 1.2, 0.3);
      if (this.held && !this.canGrab(this.held)) this.drop();
    }
  }
  private assembled(part: string, at: THREE.Vector3) {
    floatText(this.g, this.x, this.y + this.height + 0.3, this.z, PART_NAME[part] ?? part.toUpperCase(), 'skill', { big: 1, life: 2.8 });
    this.g.fx.burst(at.x, at.y, at.z, 26, 0xffe0a0, { glow: true, speed: 2.2, up: 2, size: 2, life: 0.45, grav: 6 });
    sfx('crack', 1.8, 0.6); sfx('hit', 1.6, 0.35); this.g.cam.shake(0.06, 0.15);
    this.g.child.wiggle();
  }

  // ------------------------------------------------------------------ desktop mouse (called by game.ts)
  get driving() { return this.started && this.alive; }
  get captureView() { const g = this.g; return this.started && g.mode.k === 'normal' && !g.harvest.blocking && !g.storyBlock; }
  /** left button on the canvas in normal mode: punch or throw. False lets the old box-select run (Shift / Ctrl) */
  leftDown(e: PointerEvent): boolean {
    if (!this.started || e.shiftKey || e.ctrlKey || e.metaKey || e.pointerType === 'touch') return false;
    if (!this.alive) return true;
    this.lmb = true;
    if (this.held) this.throwAt(this.aimPoint());
    else this.tryPunch();
    return true;
  }
  /** right click on open ground with nothing selected: fly there */
  moveTo(mx: number, my: number) {
    if (!this.driving) return;
    const g = this.g.groundAt(mx, my); if (!g) return;
    this.moveGoal = { x: g.x, z: g.z };
    this.g.fx.burst(g.x, g.y + 0.05, g.z, 8, this.g.child.lookData.glow, { glow: true, up: 0.6, speed: 0.8, size: 1.6, life: 0.4 });
  }
  /** may the wheel / keys arm this field power? */
  canPower(a: Ability) { return powerOwned(a); }

  // ------------------------------------------------------------------ touch host
  stick(x: number, y: number, on: boolean) { const s = this.g.input.stick; s.x = x; s.y = y; s.on = on; }
  useDown() { this.pressUse(false); }
  useUp() { this.releaseUse(); }
  punch(on: boolean) { if (on && this.driving) { this.lmb = true; if (this.held) this.throwAt(this.autoAim(5)); else this.tryPunch(); } else this.lmb = false; }
  throwPress() {
    if (!this.driving) return;
    if (!this.held) { const s = this.stones.nearest(this.x, this.z, 1.1, (s) => this.canGrab(s)); if (s) this.grab(s); else { floatText(this.g, this.x, this.y + this.height + 0.2, this.z, this.has('rock') ? 'NO STONE IN REACH' : 'NEEDS ROCK THROW', 'warn'); sfx('deny'); } }
  }
  throwAim(dx: number, dy: number) { this.touchAim = { x: dx, y: dy }; }
  throwRelease() {
    if (!this.held || !this.driving) { this.touchAim = null; return; }
    let target: THREE.Vector3;
    if (this.touchAim && Math.hypot(this.touchAim.x, this.touchAim.y) > 0.25) {
      const w = this.screenToWorldDir(this.touchAim.x, this.touchAim.y), d = 3 + Math.min(1, Math.hypot(this.touchAim.x, this.touchAim.y)) * 5;
      target = new THREE.Vector3(this.x + w.x * d, 0, this.z + w.z * d); target.y = this.g.world.surfaceY(target.x, target.z);
    } else target = this.autoAim(7);
    this.touchAim = null;
    this.throwAt(target);
  }
  powerPress() { /* aim with a drag, release to cast */ }
  powerRelease(dx: number, dy: number) {
    if (!this.driving) return;
    const wheel = this.g.hud?.wheel as unknown as { current?: Ability } | undefined;
    const a = wheel?.current;
    if (!a || !powerOwned(a)) { floatText(this.g, this.x, this.y + this.height + 0.2, this.z, 'NO FIELD POWER', 'warn'); sfx('deny'); return; }
    let p: THREE.Vector3;
    if (Math.hypot(dx, dy) > 0.25) { const w = this.screenToWorldDir(dx, dy), d = 2 + Math.min(1, Math.hypot(dx, dy)) * 5; p = new THREE.Vector3(this.x + w.x * d, 0, this.z + w.z * d); p.y = this.g.world.surfaceY(p.x, p.z); }
    else p = this.autoAim(8, true);
    const [sx, sy, ok] = this.g.screenOf(p.x, p.y + 0.2, p.z);
    if (!ok) return;
    (this.g as unknown as { cast(a: Ability, x: number, y: number): Promise<void> }).cast(a, sx, sy);
  }
  turnWheel() { const w = this.g.hud?.wheel as unknown as { turn?(n: number): void } | undefined; w?.turn?.(1); sfx('click', 1, 0.5); }
  zoom(f: number) { const c = this.g.cam; c.distGoal = clamp(c.distGoal * f, c.minDist, 45); }
  rotate(da: number) { this.g.cam.yawGoal += da; }
  labels() {
    const c = this.ctx, w = this.g.hud?.wheel as unknown as { current?: Ability } | undefined;
    return { use: c && c.kind !== 'none' ? c.label : '', useOk: !!c && c.ok, holding: !!this.held, canThrow: this.has('rock'), power: w?.current && powerOwned(w.current) ? w.current : '', punch: this.has('punch') && this.g.child.arms.length > 0 };
  }

  // ------------------------------------------------------------------ per frame
  update(dt: number) {
    const g = this.g;
    this.unstopCheck();
    if (!this.started) {
      // take over once the hatching is done (the game's own camera runs till then)
      if ((g as unknown as { hatchT: number }).hatchT >= 9 && g.child.hatch >= 1) this.start();
      else return;
    }
    const blocked = g.harvest.blocking || g.storyBlock;
    const cam = g.cam;
    if (!blocked) { cam.followFn(this.follow); cam.minDist = 3; }
    g.fx.sizeK = clamp(cam.dist / 22, 0.28, 1);
    this.cameraControls(dt);
    // skills bought and cells granted without an event
    const sk = this.skills;
    if (sk.owned.size !== this.known.size || [...sk.owned].some((id) => !this.known.has(id))) {
      for (const id of sk.owned) if (!this.known.has(id)) { this.known.add(id); this.onSkill(id); }
      for (const id of [...this.known]) if (!sk.owned.has(id)) this.known.delete(id);
    }
    // (cells already announced by a 'points' event are not shown twice, whichever comes first)
    const gain = sk.points - this.lastPts;
    if (gain > 0) { const extra = gain - this.evPts; if (extra > 0) this.cells(extra); this.evPts = Math.max(0, this.evPts - gain); }
    this.lastPts = sk.points;
    if ((this.evT -= dt) <= 0) this.evPts = 0;
    // the parts as the skill tree has them (a loaded save)
    const want = this.chassis();
    const cur = g.child.parts;
    if (cur && (want.length + (want.includes('head') ? 0 : 1) !== cur.size || want.some((p) => !cur.has(p)))) this.syncParts(true);
    if (dt <= 0) { this.place(); this.overlay(); return; }
    // timers
    for (let i = this.pending.length - 1; i >= 0; i--) { const p = this.pending[i]; p.t -= dt; if (p.t <= 0) { this.pending.splice(i, 1); p.fn(); } }
    this.punchCd -= dt; this.comboT -= dt; this.dashCd -= dt; this.invuln -= dt;
    if (!this.alive) { this.dead(dt); this.place(); this.common(dt); this.overlay(); return; }
    this.input(dt);
    this.move(dt);
    this.combat(dt);
    this.work(dt);
    // hull: slow self-repair once out of a fight, fast beside the core
    const core = g.veyr.core;
    if (g.world.time - this.lastHurt > 5 && this.hull < this.hullMax) {
      const nearCore = core && Math.hypot(core.x - this.x, core.z - this.z) < 4;
      this.hull = Math.min(this.hullMax, this.hull + (nearCore ? 6 : 1.2) * dt);
    }
    g.child.damage = clamp(1 - this.hull / this.hullMax, 0, 1);
    this.soak(dt);
    this.place();
    this.common(dt);
    this.overlay();
  }
  private start() {
    const g = this.g;
    this.started = true;
    const r = g.child.root.position;
    this.x = r.x; this.z = r.z; this.y = r.y;
    // hop down off the core to the ground in front of it
    const core = g.veyr.core;
    if (core) this.moveGoal = { x: core.x + Math.sin(g.cam.yaw) * 1.9, z: core.z + Math.cos(g.cam.yaw) * 1.9 };
    this.yaw = g.cam.yaw;
    GOLEM_REF.g = this;
    if (!this.camInit) {
      this.camInit = true; g.cam.distGoal = 6.5;
      // a steeper 3/4 view than the strategic camera: it looks down past the canopy at something knee-high
      const cam = g.cam;
      cam.pitch = (d = cam.dist) => 0.95 + clamp((d - 3) / 40, 0, 1) * 0.25;
    }
    g.child.aim = this.aim;
    if (!Player.hinted) {
      Player.hinted = true;
      toast(this.touch?.active
        ? 'Stick: fly · <b>USE</b>: work what is in front · <b>PUNCH</b> · <b>THROW</b>: lift a stone, drag to aim · <b>POWER</b>: the armed field power · one finger turns the view, pinch to zoom'
        : '<b>WASD</b> fly · <b>E</b> work what is in front (hold) · <b>Left click</b> punch / throw · <b>Space</b> dash · <b>Q</b>/<b>R</b> turn the view · wheel zoom · <b>Shift</b>-drag to select allies', 'info', 9000);
    }
  }
  static hinted = false;
  private common(dt: number) {
    this.stones.update(dt);
    this.loot.update(dt, this.alive ? this.g.child.mouthPos(_v) : null, this.has('magnet') ? 4.5 : 1.3);
    this.knocks.update(dt);
    this.gore.update(dt);
    // gathered amounts pop as one line every so often
    this.gatherT -= dt; this.fullT -= dt;
    if (this.gatherT <= 0) {
      this.gatherT = 0.45;
      let k = 0;
      for (const r of ['ore', 'carbon', 'water', 'soil'] as Res[]) {
        const n = Math.floor(this.gathered[r] + 1e-6);
        if (n >= 1) { floatText(this.g, this.x, this.y + this.height + 0.12, this.z, `+${n} ${RES_NAME[r]}`, r, { delay: k * 0.12 }); this.gathered[r] -= n; k++; }
      }
    }
    // the golem's field parts the grass as it passes (it hovers: a brush, never a trample)
    if (this.alive && this.started) flora(this.g).push?.(this.x, this.z, this.radius * 2 + 0.3, Math.min(0.42, 0.25 + Math.hypot(this.vx, this.vz) * 0.04));
  }

  // ------------------------------------------------------------------ input
  private input(dt: number) {
    const inp = this.g.input;
    // mouse aim: the ground under the cursor while the mouse is in use
    if (inp.mx !== this.lastMx || inp.my !== this.lastMy) { this.lastMx = inp.mx; this.lastMy = inp.my; if (inp.overCanvas) this.mouseT = this.g.world.time; }
    this.aimOn = !this.touch?.active && inp.overCanvas && this.g.world.time - this.mouseT < 4;
    if (this.aimOn) { const p = this.g.groundAt(inp.mx, inp.my); if (p) this.aim.copy(p).setY(p.y + 0.25); else this.aimOn = false; }
    if (!this.aimOn) {
      const t = this.ctx && this.ctx.kind !== 'none' ? this.ctx.at : null;
      if (t) this.aim.copy(t);
      else this.aim.set(this.x + Math.sin(this.yaw) * 3, this.y + 0.3, this.z + Math.cos(this.yaw) * 3);
    }
    if (!inp.buttons.has(0) && !this.touch?.punchHeld) this.lmb = false;
    // keys
    if (inp.hit(' ') && this.dashCd <= 0) this.dash();
    const e = inp.down('e');
    if (e && !this.use.down && !inp.down('Control')) this.pressUse(inp.down('Shift'));
    else if (!e && this.use.down && !this.touch?.useHeld) this.releaseUse();
    if (this.use.down) this.use.t += dt;
    void dt;
  }
  private cameraControls(dt: number) {
    const inp = this.g.input, cam = this.g.cam;
    if (this.g.harvest.blocking) return;
    if (inp.wheel) cam.distGoal = clamp(cam.distGoal * Math.pow(1.13, inp.wheel), cam.minDist, 45);
    if (inp.down('q')) cam.yawGoal += 1.8 * dt;
    if (inp.down('r')) cam.yawGoal -= 1.8 * dt;
    // middle drag (or Alt + drag) orbits
    const mid = inp.buttons.has(1) || (inp.down('Alt') && inp.buttons.has(0));
    if (mid && !this.orbit) this.orbit = { x: inp.mx };
    if (!mid) this.orbit = null;
    if (this.orbit) { cam.yawGoal -= (inp.mx - this.orbit.x) * 0.008; this.orbit.x = inp.mx; }
  }
  /** a screen-space direction (x right, y down) in world xz, for the current camera yaw */
  private screenToWorldDir(mx: number, mz: number) {
    const s = Math.sin(this.g.cam.yaw), c = Math.cos(this.g.cam.yaw);
    const x = mx * c + mz * s, z = -mx * s + mz * c, l = Math.hypot(x, z) || 1;
    return { x: x / l, z: z / l };
  }

  // ------------------------------------------------------------------ flight
  private move(dt: number) {
    const g = this.g, inp = g.input, R = g.region;
    let mx = 0, mz = 0;
    if (inp.down('w') || inp.down('ArrowUp')) mz -= 1;
    if (inp.down('s') || inp.down('ArrowDown')) mz += 1;
    if (inp.down('a') || inp.down('ArrowLeft')) mx -= 1;
    if (inp.down('d') || inp.down('ArrowRight')) mx += 1;
    const st = inp.stick;
    let mag = 1;
    if (st.on && Math.hypot(st.x, st.y) > 0.12) { mx = st.x; mz = st.y; mag = Math.min(1, Math.hypot(st.x, st.y)); }
    // working holds it in place (a nudge on the stick still steers it)
    const working = this.channel && this.channel.kind !== 'none';
    let wx = 0, wz = 0;
    if (mx || mz) {
      this.moveGoal = null;
      const d = this.screenToWorldDir(mx, mz); wx = d.x * mag; wz = d.z * mag;
    } else if (this.moveGoal) {
      const dx = this.moveGoal.x - this.x, dz = this.moveGoal.z - this.z, d = Math.hypot(dx, dz);
      if (d < 0.15) this.moveGoal = null; else { wx = dx / d * Math.min(1, d * 1.5); wz = dz / d * Math.min(1, d * 1.5); }
    }
    let sp = this.speedMax * (working ? 0.25 : 1) * (this.held?.big ? 0.65 : this.held ? 0.9 : 1);
    if (this.dashT > 0) { this.dashT -= dt; sp = 0; }
    const acc = this.dashT > 0 ? 0 : this.has('coil') ? 11 : 8;
    const k = 1 - Math.exp(-acc * dt);
    if (this.dashT <= 0) { this.vx += (wx * sp - this.vx) * k; this.vz += (wz * sp - this.vz) * k; }
    else { const f = Math.exp(-dt * 2); this.vx *= f; this.vz *= f; }
    // integrate with collisions: rock, map edge, cliffs, deep water (without the coil); slide along what blocks
    const nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    if (!this.blocked(nx, nz)) { this.x = nx; this.z = nz; }
    else if (!this.blocked(nx, this.z)) { this.x = nx; this.vz *= 0.5; }
    else if (!this.blocked(this.x, nz)) { this.z = nz; this.vx *= 0.5; }
    else { this.vx *= -0.2; this.vz *= -0.2; if (this.dashT > 0) { this.dashT = 0; this.g.cam.shake(0.12, 0.2); sfx('hit', 1.4, 0.4); } }
    // buildings and big bodies push it out
    for (const h of g.world.hives) for (const b of h.buildings) {
      const dx = this.x - b.x, dz = this.z - b.z, d = Math.hypot(dx, dz), r = b.def.radius * 0.85 + this.radius;
      if (d < r && d > 1e-3) { this.x = b.x + (dx / d) * r; this.z = b.z + (dz / d) * r; }
    }
    g.world.near(this.x, this.z, this.radius + 3, (c) => {
      if (c.dead || c.air > 0.6) return;
      const dx = this.x - c.x, dz = this.z - c.z, d = Math.hypot(dx, dz), r = c.radius * 0.8 + this.radius;
      if (d >= r || d < 1e-3) return;
      if (this.dashT > 0 && this.has('plow') && c.faction !== 'veyr') { this.plowInto(c); return; }
      if (c.mass > this.mass * 0.5) { this.x = c.x + (dx / d) * r; this.z = c.z + (dz / d) * r; }
      else { c.x -= (dx / d) * (r - d) * 0.6; c.z -= (dz / d) * (r - d) * 0.6; }
    });
    this.x = clamp(this.x, 1.2, R.N - 1.2); this.z = clamp(this.z, 1.2, R.N - 1.2);
    // face the aim (mouse), else the way it flies
    let face = this.yaw;
    const spd = Math.hypot(this.vx, this.vz);
    if (this.aimOn) face = Math.atan2(this.aim.x - this.x, this.aim.z - this.z);
    else if (this.channel && this.channel.ctx) face = Math.atan2(this.channel.ctx.at.x - this.x, this.channel.ctx.at.z - this.z);
    else if (spd > 0.4) face = Math.atan2(this.vx, this.vz);
    this.yaw = dampA(this.yaw, face, this.dashT > 0 ? 3 : 12, dt);
    // lean into the motion: forward speed tips it, sideways rolls it
    const fs = Math.sin(this.yaw), fc = Math.cos(this.yaw);
    const fwd = this.vx * fs + this.vz * fc, side = this.vx * fc - this.vz * fs;
    g.child.lean.x = damp(g.child.lean.x, clamp(fwd * 0.07, -0.3, 0.35) + (this.dashT > 0 ? 0.35 : 0), 8, dt);
    g.child.lean.y = damp(g.child.lean.y, clamp(-side * 0.06, -0.3, 0.3), 8, dt);
    // hover over the ground (and the water's surface)
    const gy = g.world.surfaceY(this.x, this.z);
    this.y = damp(this.y, gy + 0.02, this.y > gy + 0.6 ? 4 : 12, dt);
    // dust and grit off the ground at speed; spray over water
    if (spd > 1.6 && Math.random() < dt * spd * 3) {
      const wet = R.isWater(this.x, this.z);
      g.fx.burst(this.x - this.vx * 0.06, gy + 0.03, this.z - this.vz * 0.06, 2, wet ? 0xd8f0ff : 0x9a8a6a, { speed: 0.6, up: wet ? 1.2 : 0.5, size: 2, life: 0.4, grav: 3 });
    }
  }
  private blocked(x: number, z: number) {
    const R = this.g.region;
    if (x < 1.2 || z < 1.2 || x > R.N - 1.2 || z > R.N - 1.2) return true;
    const r = this.radius * 0.8;
    for (const [ox, oz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) if (R.isSolid(x + ox, z + oz)) return true;
    const g0 = R.heightAt(this.x, this.z), g1 = R.heightAt(x, z), d = Math.hypot(x - this.x, z - this.z);
    if (d > 1e-4 && (g1 - g0) / d > 1.5 && g1 > R.water) return true;
    if (!this.has('coil') && g1 < R.water - 0.45 && g1 < g0) return true;
    return false;
  }
  private place() {
    const ch = this.g.child;
    if (!this.started) return;
    ch.root.position.set(this.x, this.y, this.z);
    ch.root.rotation.y = this.yaw;
    if (this.started) ch.look.copy(this.aim);
    ch.syncGhost(this.alive);
  }

  // ------------------------------------------------------------------ fighting
  private combat(dt: number) {
    const ch = this.g.child;
    if (this.lmb && !this.held && this.punchCd <= 0 && this.g.mode.k === 'normal') this.tryPunch();
    // a carried stone rides the hold point
    if (this.held) {
      const s = this.held, at = ch.holdPos(s.big, _v);
      at.y += s.r * 0.7;
      s.p.lerp(at, 1 - Math.exp(-dt * 22));
      s.v.set(0, 0, 0);
      ch.hold = 1; ch.holdBig = s.big;
      if (Math.random() < dt * 6) this.g.fx.glow.emit(s.p.x + rnd(-1, 1) * s.r, s.p.y - s.r, s.p.z + rnd(-1, 1) * s.r, 0, -0.4, 0, new THREE.Color(ch.lookData.glow).multiplyScalar(1.8), 1, 1.6, 0.4, 0, 0);
    } else ch.hold = 0;
    if (this.dashT > 0 && Math.random() < dt * 40) this.g.fx.burst(this.x, this.y + this.height * 0.4, this.z, 2, ch.lookData.glow, { glow: true, speed: 0.4, up: 0.2, size: 2, life: 0.3, grav: 0 });
  }
  private dash() {
    if (!this.driving) return;
    const dirx = Math.hypot(this.vx, this.vz) > 0.5 ? this.vx : Math.sin(this.yaw), dirz = Math.hypot(this.vx, this.vz) > 0.5 ? this.vz : Math.cos(this.yaw);
    const l = Math.hypot(dirx, dirz) || 1, sp = this.has('plow') ? 10 : 8;
    this.vx = (dirx / l) * sp; this.vz = (dirz / l) * sp;
    this.dashT = 0.24; this.dashCd = this.has('plow') ? 0.8 : 1.0; this.plowHit.clear();
    this.yaw = Math.atan2(dirx, dirz);
    this.channelStop();
    this.g.fx.burst(this.x, this.y + 0.1, this.z, 10, 0x9a8a6a, { speed: 1.2, up: 0.6, size: 2.2, life: 0.4 });
    flora(this.g).impulse?.(this.x, this.z, 1.2, 0.6);
    vfx2d(this.g, 'dust', this.x, this.y, this.z, { dir: [-this.vx, -this.vz], size: 0.8 });
    sfx('pulse', 2.4, 0.25); sfx('zap', 1.6, 0.2);
  }
  /** the Ground Plow: a dash straight through creatures throws them */
  private plowInto(c: Creature) {
    if (this.plowHit.has(c)) return;
    this.plowHit.add(c);
    const sp = Math.hypot(this.vx, this.vz);
    strike(this.g, this.gore, this.knocks, c, 6 + sp * 1.2, _v2.set(this.vx, 0, this.vz), 'plow', { knock: 9 + sp, up: 6, stun: 1.2 });
    this.hitStop(0.05); this.g.cam.shake(0.18, 0.2); sfx('hit', 0.8, 0.8);
  }
  private tryPunch() {
    if (!this.driving || this.punchCd > 0 || this.held) return;
    const ch = this.g.child;
    const arms = ch.arms;
    if (!this.has('punch') || !arms.length) {
      // a bare head can only butt things
      this.punchCd = 0.55;
      ch.headbutt();
      this.channelStop();
      this.pending.push({ t: 0.12, fn: () => this.resolveHit(2.5, 0.32, 1.4, false, false) });
      return;
    }
    const frenzy = this.has('frenzy') && arms.length > 1;
    this.comboN = this.comboT > 0 ? this.comboN + 1 : 1; this.comboT = frenzy ? 0.4 : 0.7;
    const heavy = this.comboN % (frenzy ? 5 : 3) === 0;
    this.punchCd = frenzy ? 0.12 : arms.length > 1 ? 0.27 : 0.34;
    if (heavy) this.punchCd += 0.12;
    const arm = arms.includes(this.nextArm) ? this.nextArm : arms[0];
    ch.punch(arm);
    if (arms.length > 1) this.nextArm = arm === 'armR' ? 'armL' : 'armR';
    this.channelStop();
    // the fist lands as the pistons reach full stroke
    this.pending.push({ t: 0.085, fn: () => this.resolveHit(heavy ? 15 : frenzy ? 6.5 : 8.5, 0.5, heavy ? 7 : 3.4, heavy, true, arm) });
    sfx('zap', 2.2, 0.12);
  }
  /** what the blow connects with: the nearest creature (all of them in front for a heavy blow), else a stone */
  private resolveHit(dmg: number, reach: number, knock: number, heavy: boolean, arm: boolean, side?: 'armR' | 'armL') {
    if (!this.alive) return;
    const g = this.g, fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const hits: { c: Creature; d: number }[] = [];
    g.world.near(this.x, this.z, reach + 3, (c) => {
      if (c.faction === 'veyr' || c.digest > 0) return;
      const dx = c.x - this.x, dz = c.z - this.z, dl = Math.hypot(dx, dz) || 1e-3, d = dl - c.radius;
      if (d > reach) return;
      if ((dx * fx + dz * fz) / dl < 0.3 && d > 0.1) return;
      hits.push({ c, d });
    });
    hits.sort((a, b) => a.d - b.d);
    const targets = heavy ? hits.slice(0, 3) : hits.slice(0, 1);
    const at = arm && side ? g.child.handPos(side, new THREE.Vector3()) : g.child.headPos(new THREE.Vector3());
    if (!targets.length) {
      // a loose stone in front gets punched away like a ball
      const s = this.stones.nearest(this.x + fx * 0.35, this.z + fz * 0.35, reach * 0.9);
      if (s && arm && !s.big) {
        this.stones.launch(s, s.p.clone().setY(s.p.y + 0.05), new THREE.Vector3(this.x + fx * 8, g.world.surfaceY(this.x + fx * 8, this.z + fz * 8) + 0.3, this.z + fz * 8), { maxH: 12, burst: false });
        g.fx.burst(s.p.x, s.p.y, s.p.z, 6, 0xffd080, { glow: true, speed: 2, up: 1, size: 1.8, life: 0.25 });
        sfx('crack', 1.2, 0.5); g.cam.shake(0.05, 0.1);
      }
      return;
    }
    let killed = false, crit = false;
    for (const { c } of targets) {
      const cr = Math.random() < (heavy ? 0.3 : 0.12);
      crit = crit || cr;
      if (c.dead) { // beat a corpse: it bleeds and slides
        this.gore.hit(c, _v.set(c.x - this.x, 0, c.z - this.z), dmg * 1.5);
        this.knocks.add(c, fx * knock * 0.3, fz * knock * 0.3, 1.2);
        continue;
      }
      strike(g, this.gore, this.knocks, c, dmg * (cr ? 2 : 1), _v.set(c.x - this.x + fx * 0.5, 0, c.z - this.z + fz * 0.5), 'punch', { knock: knock * (cr ? 1.5 : 1), up: heavy ? 4.5 : 2.2, crit: cr, stun: heavy ? 0.9 : 0.35, sever: heavy && cr });
      if (c.dead) killed = true;
    }
    // impact: sparks off the knuckles, hit-stop, shake
    g.fx.spray(at.x, at.y, at.z, fx, 0.3, fz, heavy ? 16 : 8, 0xffd080, { glow: true, speed: 2.5, cone: 0.8, size: 1.8, life: 0.25, grav: 4 });
    this.hitStop(killed || crit ? 0.09 : heavy ? 0.07 : 0.045);
    g.cam.shake(killed ? 0.28 : crit ? 0.2 : heavy ? 0.16 : 0.08, 0.2);
    sfx('hit', heavy ? 0.7 : 1.1, 0.8); sfx('crack', heavy ? 0.9 : 1.6, 0.4);
    g.child.flash(0xffffff, 0.4);
    if (heavy) { floatText(g, this.x, this.y + this.height + 0.3, this.z, crit ? 'PISTON HAYMAKER!' : 'HAYMAKER!', 'crit'); vfx2d(g, 'slash', at.x, at.y, at.z, { dir: [fx, fz], size: 1.2 }); }
  }
  private grab(s: Stone) {
    s.state = 'held'; s.thrown = false; this.held = s;
    this.g.child.hold = 1; this.g.child.holdBig = s.big;
    this.channelStop();
    this.g.fx.burst(s.p.x, s.p.y, s.p.z, 8, this.g.child.lookData.glow, { glow: true, speed: 0.8, up: 1.2, size: 1.8, life: 0.4, grav: -1 });
    this.g.fx.burst(s.p.x, s.p.y - s.r * 0.5, s.p.z, 5, 0x9a8a6a, { speed: 0.6, up: 0.6, size: 2, life: 0.4 });
    sfx('zap', s.big ? 0.7 : 1.4, 0.35); sfx('crack', 2, 0.25);
  }
  private drop() {
    const s = this.held; if (!s) return;
    s.state = 'fly'; s.thrown = false; s.v.set(Math.sin(this.yaw) * 1.2, 0.5, Math.cos(this.yaw) * 1.2);
    this.held = null; this.g.child.hold = 0;
  }
  private aimPoint() {
    if (this.aimOn) return this.aim.clone().setY(this.aim.y - 0.1);
    return this.autoAim(6);
  }
  /** the best target in front (touch: auto-aim), else a point ahead */
  private autoAim(range: number, ground = false) {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    let best: Creature | null = null, bs = -1e9;
    this.g.world.near(this.x, this.z, range, (c) => {
      if (c.dead || c.faction === 'veyr') return;
      const dx = c.x - this.x, dz = c.z - this.z, d = Math.hypot(dx, dz) || 1, dot = (dx * fx + dz * fz) / d;
      if (dot < 0.2) return;
      const s = dot * 3 - d * 0.4 + (c.target === -999999999 ? 1.5 : 0);
      if (s > bs) { bs = s; best = c; }
    });
    const b = best as Creature | null;
    if (b) return new THREE.Vector3(b.x, b.y + (ground ? 0 : b.sp.pheno.height * b.growth * 0.4), b.z);
    const x = this.x + fx * range * 0.6, z = this.z + fz * range * 0.6;
    return new THREE.Vector3(x, this.g.world.surfaceY(x, z), z);
  }
  private throwAt(target: THREE.Vector3) {
    const s = this.held; if (!s || !this.driving) return;
    const ch = this.g.child;
    ch.throwSwing(); this.punchCd = 0.35;
    this.yaw = Math.atan2(target.x - this.x, target.z - this.z);
    this.pending.push({
      t: 0.12, fn: () => {
        if (this.held !== s) return;
        this.held = null; ch.hold = 0;
        const from = ch.holdPos(s.big, new THREE.Vector3());
        this.stones.launch(s, from, target, { maxH: s.big ? 9 : 14, burst: this.has('shrapnel') });
        this.g.emit('throw', { x: this.x, z: this.z });
        vfx2d(this.g, 'smear', from.x, from.y, from.z, { dir: [target.x - from.x, target.z - from.z], size: s.big ? 1.4 : 0.8 });
        this.g.fx.burst(from.x, from.y, from.z, 8, ch.lookData.glow, { glow: true, speed: 1.5, up: 0.5, size: 1.8, life: 0.3 });
        sfx('pulse', 2.8, 0.25); sfx('zap', s.big ? 0.8 : 1.6, 0.25);
        if (s.big) this.g.cam.shake(0.1, 0.15);
      },
    });
  }
  private stoneHit(s: Stone, c: Creature, sp: number) {
    const dmg = Math.min(180, s.m * sp * (s.big ? 1 : 1.15));
    const crit = sp > 11 && Math.random() < 0.2;
    strike(this.g, this.gore, this.knocks, c, dmg * (crit ? 1.6 : 1), _v.copy(s.v), 'rock', { knock: Math.sqrt(s.m) * sp * 0.4, up: s.big ? 5 : 2.5, crit, stun: s.big ? 1.4 : 0.4, sever: s.big });
    this.hitStop(s.big ? 0.1 : 0.035);
    this.g.cam.shake(s.big ? 0.3 : 0.07, 0.2);
    sfx('hit', s.big ? 0.6 : 1.2, 0.8 * this.g.audible(c.x, c.z));
  }

  // ------------------------------------------------------------------ taking damage
  hurt(amt: number, from: Creature) {
    if (!this.alive || this.invuln > 0 || !this.started) return;
    const g = this.g, d = amt * (1 - this.armor);
    this.hull -= d; this.lastHurt = g.world.time;
    from.aggro = Math.max(from.aggro, 10);
    const dx = this.x - from.x, dz = this.z - from.z, dl = Math.hypot(dx, dz) || 1;
    this.vx += (dx / dl) * Math.min(5, 1 + d * 0.25); this.vz += (dz / dl) * Math.min(5, 1 + d * 0.25);
    g.child.hurt(Math.min(2, 0.5 + d / 8));
    const hy = this.y + this.height * 0.6;
    g.fx.spray(this.x - dx / dl * 0.1, hy, this.z - dz / dl * 0.1, dx / dl, 0.6, dz / dl, 10 + Math.round(d), 0xffc060, { glow: true, speed: 2.6, cone: 0.7, size: 1.8, life: 0.35, grav: 7 });
    g.fx.spray(this.x, hy, this.z, dx / dl, 0.8, dz / dl, 6, g.child.lookData.rock, { speed: 1.8, cone: 0.8, size: 2.4, life: 0.5, grav: 9 });
    if (d > 4) this.gore.gib(this.x, hy, this.z, 'rock', g.child.lookData.rock, rnd(0.03, 0.05), { v: new THREE.Vector3(dx / dl * 2 + rnd(-1, 1), 3, dz / dl * 2 + rnd(-1, 1)), bleed: 0, life: 20 });
    floatText(g, this.x, this.y + this.height + 0.1, this.z, `-${Math.max(1, Math.round(d))} HULL`, 'hurt');
    g.emit('hurt', { amt: d });
    g.cam.shake(Math.min(0.4, 0.12 + d * 0.015), 0.25);
    sfx('hit', 0.9, 0.8); sfx('crack', 2.2, 0.4);
    this.hitStop(0.035);
    this.channelStop();
    if (this.hull <= 0) this.die();
  }
  private die() {
    const g = this.g;
    this.alive = false; this.hull = 0; this.rebootT = 7; this.deathAt.set(this.x, this.y, this.z);
    this.drop(); this.channelStop();
    const look = g.child.lookData;
    for (const p of g.child.shatter()) this.gore.gib(p.p.x, p.p.y, p.p.z, p.metal ? 'metal' : 'rock', p.metal ? look.metal : look.rock, Math.max(0.03, p.size), { v: new THREE.Vector3(rnd(-4, 4), rnd(3, 7), rnd(-4, 4)), bleed: 0, life: 18 });
    const hy = this.y + 0.3;
    g.fx.burst(this.x, hy, this.z, 70, look.glow, { glow: true, speed: 4, up: 3, size: 2.6, life: 0.9, grav: 2 });
    g.fx.burst(this.x, hy, this.z, 40, 0xffc060, { glow: true, speed: 5, up: 4, size: 1.8, life: 0.5, grav: 8 });
    g.fx.burst(this.x, hy, this.z, 30, 0x2a2624, { speed: 1, up: 1.4, size: 4, life: 1.8, grav: -0.6 });
    g.cam.shake(0.7, 0.7); sfx('crack', 0.6, 1); sfx('pulse', 0.8, 0.9); sfx('death', 0.6, 0.7);
    flora(g).impulse?.(this.x, this.z, 3, 1.6);
    this.hitStop(0.16);
    // it drops part of what it carried; the pieces lie there to be picked up again
    const lost: string[] = [];
    for (const r of ['ore', 'carbon', 'water', 'soil'] as Res[]) {
      const have = g.run.res[r] ?? 0, n = Math.floor(have * 0.25);
      if (n <= 0) continue;
      g.run.res[r] = have - n; lost.push(`${n} ${r}`);
      const chunks = Math.min(8, n), per = n / chunks;
      for (let i = 0; i < chunks; i++) this.loot.drop(r, per, new THREE.Vector3(this.x, this.y + 0.3, this.z), false, new THREE.Vector3(rnd(-3, 3), rnd(3, 5), rnd(-3, 3)));
    }
    floatText(g, this.x, this.y + 0.6, this.z, 'UNIT 07 DESTROYED', 'hurt', { big: 1, life: 3 });
    toast(`Unit 07 is down. Rebooting at the core${lost.length ? `; it dropped ${lost.join(', ')}` : ''}.`, 'warn', 4000);
  }
  private dead(dt: number) {
    const g = this.g;
    this.rebootT -= dt;
    const core = g.veyr.core;
    if (!core || core.dead) return;
    // the camera drifts back to the core while the golem pulls itself together
    if (this.rebootT < 4.5) { this.x = damp(this.x, core.x + Math.sin(g.cam.yaw) * 1.9, 2, dt); this.z = damp(this.z, core.z + Math.cos(g.cam.yaw) * 1.9, 2, dt); this.y = g.world.surfaceY(this.x, this.z); }
    if (this.rebootT < 1.6 && Math.random() < dt * 30) g.fx.mote(core.x + rnd(-2, 2), core.y + 0.5, core.z + rnd(-2, 2), this.x, this.y + 0.3, this.z, g.child.lookData.glow, 4);
    if (this.rebootT <= 0) {
      this.x = core.x + Math.sin(g.cam.yaw) * 1.9; this.z = core.z + Math.cos(g.cam.yaw) * 1.9; this.y = g.world.surfaceY(this.x, this.z);
      this.vx = this.vz = 0;
      this.alive = true; this.hull = this.hullMax; this.invuln = 2.5; this.lastHurt = g.world.time;
      this.place(); g.child.root.updateMatrixWorld(true);
      g.child.reassemble();
      floatText(g, this.x, this.y + this.height + 0.3, this.z, 'REBOOT COMPLETE', 'good', { big: 1, life: 2.4 });
      g.fx.burst(this.x, this.y + 0.3, this.z, 40, g.child.lookData.glow, { glow: true, speed: 2, up: 2, size: 2, life: 0.8 });
      sfx('build', 1.2, 0.8); sfx('done', 1, 0.6);
    }
  }
  /** a death in the world: gore, and whose kill it was */
  private onDeath(c: Creature, by: Creature | null) {
    const g = this.g;
    const blow = BLOW.c === c;
    const violent = blow || !!by || (c.fx.flash.value > 0.25 && c.energy > 0.02);
    if (violent) this.gore.die(c, blow ? BLOW.dir : by ? _v.set(c.x - by.x, 0, c.z - by.z) : null, blow ? BLOW.over + (BLOW.sever ? 0.3 : 0) : 0);
    else this.gore.wound(c, 6, 1);
    let killer: 'punch' | 'rock' | 'ability' | 'ally' | null = null;
    if (g.world.time - c.golemHit < 0.35) killer = c.golemBy === 'rock' ? 'rock' : c.golemBy === 'ability' ? 'ability' : 'punch';
    else if (by && by.faction === 'veyr') killer = 'ally';
    else if (!by && (c.mind === 'held' || c.stunT > 0) && c.faction !== 'veyr') killer = 'ability';
    if (killer) {
      g.emit('kill', { species: c.sp.name, by: killer });
      if (killer === 'punch' || killer === 'rock') {
        const h = c.sp.pheno.height * c.growth;
        floatText(g, c.x, c.y + h + 0.45, c.z, 'KILL', 'kill', { delay: 0.15 });
      }
    }
  }

  // ------------------------------------------------------------------ [E]: work what's in front
  private pressUse(shift: boolean) {
    this.use.down = true; this.use.t = 0; this.use.shift = shift; this.use.fired = false;
    if (!this.driving) return;
    const c = this.ctx;
    if (!c || c.kind === 'none') { sfx('deny', 1, 0.4); return; }
    if (!c.ok) { floatText(this.g, c.at.x, c.at.y + 0.1, c.at.z, c.label, 'warn'); sfx('deny', 1, 0.6); return; }
    if (c.kind === 'drop') { this.use.fired = true; this.drop(); return; }
    if (c.kind === 'grab' && c.stone) { this.use.fired = true; this.grab(c.stone); return; }
    if (c.kind === 'plant' && shift && this.has('sow')) { this.use.fired = true; this.startChannel(c, 'sow'); return; }
    if (c.kind === 'plant') return; // decided on release (tap: graft) or after a long press (press seed)
    this.startChannel(c);
  }
  private releaseUse() {
    const c = this.ctx;
    if (this.use.down && !this.use.fired && c && c.kind === 'plant' && c.ok && this.driving) {
      this.use.fired = true;
      if (this.has('graft') && c.plant !== undefined && !this.grafted.has(c.plant)) this.startChannel(c, 'graft');
      else if (this.has('sow')) this.startChannel(c, 'sow');
      else if (this.has('intake')) { /* plain intake on a plant is a hold: handled by plantC */ }
    }
    this.use.down = false;
    // hold-to-work jobs stop when released; quick jobs finish on their own
    if (this.channel && !this.channel.ctx.label.startsWith('#')) {
      const k = this.channel.kind;
      if (k !== 'convert' && k !== 'plant') this.channelStop();
    }
  }
  private startChannel(c: Ctx, sub?: 'graft' | 'sow') {
    this.channelStop();
    this.channel = { kind: c.kind, t: 0, acc: 0, tick: 0, ctx: { ...c, label: sub ? '#' + sub : c.label }, prog: 0 };
    if (c.kind === 'intake' && c.c) { const it = this.gore.intake(c.c); if (!it) { this.channel = null; return; } this.channel.intake = it; c.c.digest = 1e-4; }
    this.moveGoal = null;
  }
  private channelStop() {
    const ch = this.channel;
    if (!ch) return;
    if (ch.intake && !ch.intake.done) ch.intake.c.digest = 0;
    this.channel = null;
    this.g.child.work = null;
  }
  /** what's in front of the golem and what [E] would do with it */
  private sense(): Ctx | null {
    const g = this.g, R = g.region, fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const px = this.x + fx * (this.radius + 0.32), pz = this.z + fz * (this.radius + 0.32);
    const gy = (x: number, z: number) => g.world.surfaceY(x, z);
    const mk = (kind: CtxKind, label: string, ok: boolean, at: THREE.Vector3, o: Partial<Ctx> = {}): Ctx => ({ kind, label, ok, at, ...o });
    if (this.held) return mk('drop', this.held.big ? 'SET BOULDER DOWN' : 'DROP STONE', true, new THREE.Vector3(this.x, this.y + this.height + 0.35, this.z));
    // a corpse
    let corpse: Creature | null = null, cd = 1e9;
    g.world.near(this.x, this.z, 3, (c) => {
      if (!c.dead || c.bio <= 0.3 || c.digest > 0 || c.fx.dissolve.value >= 0.99) return;
      const d = Math.hypot(c.x - this.x, c.z - this.z) - c.radius;
      if (d < 0.7 && d < cd) { cd = d; corpse = c; }
    });
    const cc = corpse as Creature | null;
    if (cc) {
      const h = cc.sp.pheno.height * cc.growth;
      return mk('intake', this.has('intake') ? 'DEVOUR CARCASS' : 'NEEDS CARBON INTAKE', this.has('intake'), new THREE.Vector3(cc.x, cc.y + h + 0.2, cc.z), { c: cc });
    }
    if (this.has('intake')) {
      const gibs = this.gore.looseNear(this.x + fx * 0.3, this.z + fz * 0.3, 0.9);
      if (gibs.length) { const b = gibs[0]; return mk('gibs', 'DEVOUR REMAINS', true, new THREE.Vector3(b.p.x, b.p.y + 0.3, b.p.z)); }
    }
    // a beaten creature to rewire
    if (this.has('convert')) {
      let beat: Creature | null = null;
      g.world.near(this.x, this.z, 3, (c) => {
        if (c.dead || c.faction === 'veyr' || c.boss) return;
        const d = Math.hypot(c.x - this.x, c.z - this.z) - c.radius;
        if (d < 0.8 && (c.stunT > 0.15 || c.hp < c.maxHp * 0.35)) beat = c;
      });
      const b = beat as Creature | null;
      if (b) return mk('convert', 'NEURAL GRAFT', true, new THREE.Vector3(b.x, b.y + b.sp.pheno.height * b.growth + 0.25, b.z), { c: b });
    }
    // a loose stone
    const s = this.stones.nearest(px, pz, 0.6) ?? this.stones.nearest(this.x, this.z, this.radius + 0.25);
    if (s) {
      const at = new THREE.Vector3(s.p.x, s.p.y + s.r + 0.3, s.p.z);
      if (this.canGrab(s)) return mk('grab', s.big ? 'HEAVE BOULDER' : 'LIFT STONE', true, at, { stone: s });
      if (this.has('drill')) return mk('drill', 'DRILL STONE', true, at, { stone: s, res: 'ore', rate: 2.2 });
      return mk('grit', s.big && this.has('rock') ? 'SCRAPE (NEEDS BOULDER HEAVE)' : 'SCRAPE GRIT', true, at, { stone: s, res: 'ore', rate: 0.7 });
    }
    // an ore seam
    const dep = R.deposits.findIndex((d) => d.amount > 0 && Math.hypot(d.x - px, d.z - pz) < d.r + 0.5);
    if (dep >= 0) {
      const at = new THREE.Vector3(px, gy(px, pz) + 0.45, pz), cr = R.deposits[dep].kind === 'crystal';
      return this.has('drill') ? mk('drill', cr ? 'DRILL CRYSTAL SEAM' : 'DRILL ORE SEAM', true, at, { dep, res: 'ore', rate: cr ? 3.2 : 2.6 }) : mk('grit', 'SCRAPE ORE', true, at, { dep, res: 'ore', rate: 0.85 });
    }
    // a rock formation
    let rock = -1, rd = 1e9;
    for (let i = 0; i < R.rocks.length; i++) {
      const p = R.rocks[i];
      if (p.kind === 'pebble' || p.kind === 'river' || p.kind === 'log' || p.kind === 'stump') continue;
      const d = Math.hypot(p.x - px, p.z - pz) - Math.max(p.sx, p.sz) * 0.9;
      if (d < 0.35 && d < rd) { rd = d; rock = i; }
    }
    if (rock >= 0) {
      const at = new THREE.Vector3(px, gy(px, pz) + 0.5, pz);
      return this.has('drill') ? mk('drill', 'DRILL ROCK', true, at, { rock, res: 'ore', rate: 1.3 }) : mk('grit', 'SCRAPE GRIT', true, at, { rock, res: 'ore', rate: 0.6 });
    }
    // a plant
    let plant = -1, pd = 1e9;
    g.world.flora.near(px, pz, 0.75, (i, d2) => { if (g.world.flora.bio[i] > 0.2 && d2 < pd) { pd = d2; plant = i; } });
    if (plant >= 0 && (this.has('graft') || this.has('sow') || this.has('intake'))) {
      const fl = g.world.flora, at = new THREE.Vector3(fl.x[plant], gy(fl.x[plant], fl.z[plant]) + 0.6, fl.z[plant]);
      if (this.has('graft') && !this.grafted.has(plant)) return mk('plant', this.has('sow') ? 'GRAFT (HOLD: PRESS SEED)' : 'GRAFT PLANT', true, at, { plant });
      if (this.has('sow')) return mk('plant', 'PRESS SEED', true, at, { plant });
      return mk('plantC', 'DRAW CARBON', true, at, { plant, res: 'carbon', rate: 1.6 });
    }
    // water
    const wet = R.isWater(px, pz) || R.isWater(this.x, this.z);
    if (wet) {
      const at = new THREE.Vector3(px, gy(px, pz) + 0.35, pz);
      return this.has('siphon') ? mk('siphon', 'SIPHON WATER', true, at, { res: 'water', rate: 3 }) : mk('siphon', 'NEEDS WATER SIPHON', false, at);
    }
    // bare ground
    const at = new THREE.Vector3(px, gy(px, pz) + 0.35, pz);
    if (R.isSolid(px, pz)) return null;
    return this.has('excavate') ? mk('dig', 'EXCAVATE SOIL', true, at, { res: 'soil', rate: 3 }) : mk('grit', 'SCRAPE SOIL', true, at, { res: 'soil', rate: 0.8 });
  }
  private work(dt: number) {
    const g = this.g, ch = this.g.child;
    if (!this.channel) this.ctx = this.sense();
    // a long press on a plant presses its seed
    if (this.use.down && !this.use.fired && this.ctx?.kind === 'plant' && this.use.t > 0.75 && this.has('sow')) { this.use.fired = true; this.startChannel(this.ctx, 'sow'); }
    // plain hold-to-gather on a plant (intake only)
    if (this.use.down && !this.channel && this.ctx?.kind === 'plantC') this.startChannel(this.ctx);
    const C = this.channel;
    if (!C) { ch.work = null; return; }
    const c = C.ctx;
    C.t += dt;
    const sub = c.label === '#graft' ? 'graft' : c.label === '#sow' ? 'sow' : null;
    // too far from the job: stop
    const far = Math.hypot(c.at.x - this.x, c.at.z - this.z) > 2.2 + (c.c ? c.c.radius : 0);
    if (far) { this.channelStop(); return; }
    const workOf: Record<string, Work> = { drill: 'drill', grit: 'grit', intake: 'intake', gibs: 'intake', plantC: 'intake', convert: 'convert', plant: 'graft', siphon: 'siphon', dig: ch.arms.length ? 'dig' : 'grit' };
    ch.work = c.kind === 'drill' && !ch.arms.length ? 'drill' : workOf[c.kind] ?? null;
    const mouth = ch.mouthPos(new THREE.Vector3());
    const tool = ch.arms.length && (c.kind === 'drill' || c.kind === 'dig' || c.kind === 'plant' || c.kind === 'convert') ? ch.handPos(ch.arms.includes('armR') ? 'armR' : 'armL', new THREE.Vector3()) : ch.headPos(new THREE.Vector3());
    const ground = new THREE.Vector3(c.at.x, g.world.surfaceY(c.at.x, c.at.z) + 0.05, c.at.z);
    C.tick -= dt;
    switch (c.kind) {
      case 'drill': case 'grit': {
        const contact = c.stone ? c.stone.p.clone() : ground.clone().setY(ground.y + (c.rock !== undefined ? 0.3 : 0.05));
        const drill = c.kind === 'drill';
        if (Math.random() < dt * (drill ? 40 : 14)) g.fx.spray(contact.x, contact.y, contact.z, this.x - contact.x, 1, this.z - contact.z, drill ? 3 : 1, 0xffc060, { glow: true, speed: drill ? 2.6 : 1.4, cone: 0.9, size: 1.6, life: 0.25, grav: 7 });
        if (Math.random() < dt * 20) g.fx.spray(contact.x, contact.y, contact.z, 0, 1, 0, 2, c.res === 'soil' ? 0x8a6a4a : 0x8a8478, { speed: 1.4, cone: 0.9, size: 2.2, life: 0.4, grav: 8 });
        if (!drill || !ch.arms.length) { if (Math.random() < dt * 12) g.fx.arc(ch.headPos(new THREE.Vector3()), contact, 0.06, ch.lookData.glow, 0.25); g.fx.stream(() => contact, this.mouth, Math.ceil(dt * 30), c.res === 'soil' ? 0x8a6a4a : 0x9a9488, { dur: 0.4, rad: 0.12, arc: 0.05, size: 1.6 }); }
        if (C.tick <= 0) { C.tick = drill ? 0.12 : 0.3; sfx('crack', rnd(1.6, 2.6), drill ? 0.22 : 0.1); if (drill) g.cam.shake(0.02, 0.1); }
        this.yield(C, dt, contact);
        // stones wear away, seams run dry, drilled rock sheds loose stones
        if (c.stone) { c.stone.r -= dt * (drill ? 0.022 : 0.008); if (c.stone.r < 0.045) { const i = this.stones.list.indexOf(c.stone); if (i >= 0) this.stones.list.splice(i, 1); g.fx.burst(contact.x, contact.y, contact.z, 14, 0x9a9488, { speed: 1.4, up: 1.4, size: 2.2, life: 0.5 }); this.channelStop(); } }
        if (c.dep !== undefined && R(g).deposits[c.dep].amount <= 0) { floatText(g, contact.x, contact.y + 0.3, contact.z, 'SEAM EXHAUSTED', 'info'); this.channelStop(); }
        if (c.rock !== undefined && drill && Math.random() < dt * 0.3) { const p = R(g).rocks[c.rock], a = Math.atan2(this.x - p.x, this.z - p.z) + rnd(-0.8, 0.8); const st = this.stones.make(contact.x, contact.y + 0.1, contact.z, rnd(0.07, 0.11), false); if (st) st.v.set(Math.sin(a) * 2, 3, Math.cos(a) * 2); sfx('crack', 0.9, 0.5); }
        break;
      }
      case 'siphon': {
        // water spirals up into the jaw
        const src = () => new THREE.Vector3(c.at.x + rnd(-0.3, 0.3), g.world.surfaceY(c.at.x, c.at.z) + 0.02, c.at.z + rnd(-0.3, 0.3));
        const from = src();
        g.fx.stream(() => from, this.mouth, Math.ceil(dt * 90), Math.random() < 0.6 ? 0x5ac8ff : 0xd8f4ff, { dur: 0.6, rad: 0.18, arc: 0.12, size: 2 });
        if (Math.random() < dt * 10) g.fx.burst(from.x, from.y, from.z, 3, 0xd8f0ff, { speed: 0.6, up: 1, size: 2, life: 0.4 });
        if (C.tick <= 0) { C.tick = 0.35; sfx('grow', 1.8, 0.25); }
        this.yield(C, dt, from);
        break;
      }
      case 'dig': {
        if (C.tick <= 0) {
          C.tick = 0.4;
          const N = R(g).N, i = Math.floor(ground.z) * N + Math.floor(ground.x), dug = this.dug.get(i) ?? 0;
          if (dug < 0.7 && R(g).heightAt(ground.x, ground.z) > R(g).water + 0.35) {
            R(g).shape(ground.x, ground.z, 0.85, -0.035); this.dug.set(i, dug + 0.035);
            g.world.terrain.flushDirty(); g.world.flora.reseat(ground.x, ground.z, 1.4);
          }
          // clods fly up into the golem
          for (let k = 0; k < 2; k++) { const b = this.gore.gib(ground.x + rnd(-0.2, 0.2), ground.y + 0.05, ground.z + rnd(-0.2, 0.2), 'rock', Math.random() < 0.5 ? g.region.pal.soil : g.region.pal.clay, rnd(0.025, 0.045), { bleed: 0, v: new THREE.Vector3(rnd(-1, 1), 3, rnd(-1, 1)) }); this.gore.suck(b, this.mouth, rnd(0.5, 0.8)); }
          sfx('squelch', 1.8, 0.2);
        }
        if (Math.random() < dt * 14) g.fx.burst(ground.x, ground.y, ground.z, 2, g.region.pal.soil, { speed: 1, up: 1.6, size: 2.4, life: 0.5 });
        this.yield(C, dt, ground);
        break;
      }
      case 'intake': {
        const it = C.intake;
        if (!it) { this.channelStop(); break; }
        const done = it.tick(dt, this.mouth, (amt, x, y, z) => this.credit('carbon', amt, new THREE.Vector3(x, y, z)));
        C.prog = it.p;
        if (done) {
          const cc = it.c, sp = cc.sp;
          this.channelStop();
          if (g.world.creatures.includes(cc)) g.world.remove(cc);
          const genes = sp.design.genes.filter((id) => GENE[id]);
          floatText(g, this.x, this.y + this.height + 0.3, this.z, 'GENOME ABSORBED', 'good', { big: 1, life: 2.2 });
          g.child.wiggle();
          g.emit('absorb', { species: sp.name, genes });
          g.veyr.harvest?.(cc, sp);
        }
        break;
      }
      case 'gibs': {
        if (C.tick <= 0) {
          C.tick = 0.12;
          const list = this.gore.looseNear(this.x, this.z, 1.6);
          if (!list.length) { this.channelStop(); break; }
          const b = list[0], amt = b.carbon;
          b.carbon = 0;
          this.gore.suck(b, this.mouth, 0.5, () => this.credit('carbon', amt, b.p));
          sfx('squelch', 1.4, 0.25);
        }
        break;
      }
      case 'plantC': {
        if (c.plant === undefined) { this.channelStop(); break; }
        const fl = g.world.flora, got = fl.eat(c.plant, dt * 0.3);
        if (got <= 0 || fl.bio[c.plant] < 0.05) { this.channelStop(); break; }
        g.fx.stream(() => ground, this.mouth, Math.ceil(dt * 50), Math.random() < 0.5 ? 0x6ab04a : 0x9aff6a, { dur: 0.55, rad: 0.2, size: 1.8 });
        C.acc += got * 6;
        while (C.acc >= 1) { C.acc -= 1; this.loot.drop('carbon', 1, ground, true); }
        break;
      }
      case 'plant': {
        // graft: the arm's field rewrites the plant; press seed: the plant is drawn in whole
        const dur = sub === 'sow' ? 1.1 : 0.7;
        C.prog = C.t / dur;
        const pi = c.plant!;
        if (Math.random() < dt * 30) g.fx.arc(tool, ground.clone().setY(ground.y + rnd(0.1, 0.5)), 0.08, sub === 'sow' ? 0x9aff6a : ch.lookData.glow, 0.3);
        if (sub === 'sow') g.fx.stream(() => ground, this.mouth, Math.ceil(dt * 60), Math.random() < 0.5 ? 0x6ab04a : 0xd8ff9a, { dur: 0.5, rad: 0.25, size: 2 });
        if (C.t >= dur) {
          this.channelStop();
          if (sub === 'sow') {
            const pf = g.veyr.absorbPlant(pi);
            if (pf) { floatText(g, ground.x, ground.y + 0.5, ground.z, `PREFAB: ${pf.name}`, 'good', { big: 1 }); sfx('absorb', 1.2, 0.7); g.child.wiggle(); }
            else { floatText(g, ground.x, ground.y + 0.5, ground.z, 'SEED PRESS FAILED', 'warn'); sfx('deny'); }
          } else {
            const ok = g.veyr.graftPlant(pi);
            if (ok) { this.grafted.add(pi); floatText(g, ground.x, ground.y + 0.5, ground.z, 'GRAFTED', 'good'); g.fx.burst(ground.x, ground.y + 0.2, ground.z, 24, ch.lookData.glow, { glow: true, speed: 1.2, up: 2, size: 2, life: 0.8, grav: -0.5 }); sfx('grow', 1, 0.7); }
            else { this.grafted.add(pi); floatText(g, ground.x, ground.y + 0.5, ground.z, 'GRAFT REJECTED', 'warn'); sfx('deny'); }
          }
        }
        break;
      }
      case 'convert': {
        const cc = c.c!;
        const dur = 1.3;
        C.prog = C.t / dur;
        if (cc.dead) { this.channelStop(); break; }
        cc.stunT = Math.max(cc.stunT, 0.3);
        if (Math.random() < dt * 25) g.fx.arc(ch.headPos(new THREE.Vector3()), new THREE.Vector3(cc.x + rnd(-0.2, 0.2), cc.y + cc.sp.pheno.height * cc.growth * 0.7, cc.z + rnd(-0.2, 0.2)), 0.1, 0x9aff6a, 0.3);
        if (C.t >= dur) {
          this.channelStop();
          const ok = g.veyr.convert(cc);
          const h = cc.sp.pheno.height * cc.growth;
          if (ok) { floatText(g, cc.x, cc.y + h + 0.4, cc.z, 'REWIRED', 'good', { big: 1 }); cc.aggro = 0; if (cc.target === -999999999) { cc.target = 0; cc.mind = 'idle'; } sfx('absorb', 1.5, 0.7); g.child.wiggle(); }
          else { floatText(g, cc.x, cc.y + h + 0.4, cc.z, 'GRAFT REJECTED', 'warn'); sfx('deny'); }
        }
        break;
      }
    }
  }
  /** water: skimming a river or the sea soaks it (it dips its rubble in, ripples spread), siphoning splashes it; it
   *  dries off over half a minute, faster by the core. The details layer may read child.wet / player.wet */
  wet = 0; private rippleT = 0; private wasOver = false;
  private soak(dt: number) {
    const g = this.g, R = g.region, over = R.isWater(this.x, this.z);
    const sp = Math.hypot(this.vx, this.vz);
    if (over) {
      this.wet = Math.min(1, this.wet + dt * 1.6);
      const y = g.world.surfaceY(this.x, this.z) + 0.02;
      if (!this.wasOver) { g.fx.burst(this.x, y, this.z, 14, 0xd8f0ff, { speed: 1.2, up: 1.8, size: 2, life: 0.5 }); vfx2d(g, 'splash', this.x, y, this.z, { size: 0.6 }); sfx('squelch', 1.9, 0.25); }
      this.rippleT -= dt * (1 + sp * 0.8);
      if (this.rippleT <= 0) {
        this.rippleT = 0.45;
        for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; g.fx.matter.emit(this.x + Math.cos(a) * 0.08, y, this.z + Math.sin(a) * 0.08, Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55, _c.set(0xd8f0ff), 0.8, 1.6, 0.6, 0, 1.4); }
      }
    } else {
      const core = g.veyr.core, near = core && Math.hypot(core.x - this.x, core.z - this.z) < 4;
      this.wet = Math.max(0, this.wet - dt / (near ? 8 : 28));
    }
    if (this.channel?.ctx.kind === 'siphon') this.wet = Math.min(1, this.wet + dt * 0.25);
    this.wasOver = over;
    g.child.wet = this.wet;
  }
  /** a gathering job produces nuggets that fly into the intake (credited when they arrive) */
  private yield(C: NonNullable<Player['channel']>, dt: number, at: THREE.Vector3) {
    const c = C.ctx; if (!c.res || !c.rate) return;
    let rate = c.rate;
    if (c.dep !== undefined) { const d = R(this.g).deposits[c.dep]; if (d.amount <= 0) return; }
    C.acc += rate * dt;
    while (C.acc >= 1) {
      C.acc -= 1;
      if (c.dep !== undefined) R(this.g).deposits[c.dep].amount -= 1;
      this.loot.drop(c.res, 1, at.clone().setY(at.y + 0.08), true, new THREE.Vector3(rnd(-1, 1), rnd(1.5, 3), rnd(-1, 1)));
    }
    rate = 0; void rate;
  }
  /** credit a resource through the economy; the numbers pop over the golem */
  private creditAcc: Record<Res, number> = { ore: 0, carbon: 0, water: 0, soil: 0 };
  private credit(res: Res, amt: number, p: THREE.Vector3) {
    // whole units only: fractions (a chunk of flesh, a share of a carcass) wait for the rest
    this.creditAcc[res] += amt;
    const n = Math.floor(this.creditAcc[res] + 1e-6);
    if (n < 1) return;
    this.creditAcc[res] -= n;
    // quiet: the nugget already flew into the golem, the economy needn't send its own motes
    const got = (this.g.veyr.gather as (r: Res, a: number, x: number, y: number, z: number, quiet?: boolean) => number).call(this.g.veyr, res, n, p.x, p.y, p.z, true);
    if (got > 0) { this.gathered[res] += got; sfx('qte-tick', 1, 0.35); }
    else if (this.fullT <= 0) { this.fullT = 3; floatText(this.g, this.x, this.y + this.height + 0.15, this.z, `${RES_NAME[res]} TANKS FULL`, 'info'); }
  }

  // ------------------------------------------------------------------ hit-stop (engine time scale, restored by the wall clock)
  private hitStop(sec: number) {
    const e = this.g.engine, now = performance.now();
    if (this.stopUntil <= now) this.prevScale = e.timeScale > 0.2 ? e.timeScale : 1;
    e.timeScale = 0.05;
    this.stopUntil = Math.max(this.stopUntil, now + sec * 1000);
  }
  private unstopCheck() { if (this.stopUntil && performance.now() >= this.stopUntil) this.unstop(); }
  private unstop() { if (!this.stopUntil) return; this.stopUntil = 0; this.g.engine.timeScale = this.prevScale || 1; }

  // ------------------------------------------------------------------ overlay: prompt, hull bar
  private overlay() {
    const L = floatLayer(this.g), ch = this.channel;
    const c = ch ? ch.ctx : this.ctx;
    const touch = !!this.touch?.active;
    if (this.alive && this.started && c && c.kind !== 'none' && !this.g.harvest.blocking) {
      const label = ch ? (c.label === '#graft' ? 'GRAFTING' : c.label === '#sow' ? 'PRESSING SEED' : c.kind === 'intake' ? 'DEVOURING' : c.label) : c.label;
      L.prompt = { x: c.at.x, y: c.at.y, z: c.at.z, key: touch ? '' : c.kind === 'drop' ? 'E' : 'E', text: label, ok: c.ok, prog: ch?.prog };
      if (this.held && !ch) L.prompt.text = touch ? 'THROW / DROP' : 'LMB THROW · E DROP';
    } else L.prompt = null;
    const showBar = this.alive && this.started && (this.hull < this.hullMax - 0.5 || this.g.world.time - this.lastHurt < 3);
    const b = L.bar ?? (L.bar = { x: 0, y: 0, z: 0, frac: 1, alpha: 0, flash: 0 });
    b.x = this.x; b.y = this.y + this.height + 0.12; b.z = this.z; b.frac = this.hull / this.hullMax;
    b.alpha = damp(b.alpha, showBar ? 1 : 0, 6, 1 / 60);
    b.flash = this.g.world.time - this.lastHurt < 0.25 ? 1 : 0;
    this.touch?.update();
  }
  dispose() {
    this.unstop();
    if (GOLEM_REF.g === this) GOLEM_REF.g = null;
    bindSkills(null);
    removeEventListener('touchstart', this.onFirstTouch);
    this.touch?.dispose();
    floatLayer(this.g).dispose();
    this.g.fx.sizeK = 1;
    this.gore.dispose(); this.stones.dispose(); this.loot.dispose();
  }
}
const R = (g: Game) => g.region;
/** the flora's physical push field (optional: older flora builds don't have it) */
export const flora = (g: Game) => g.world.flora as unknown as { push?(x: number, z: number, r: number, s: number): void; impulse?(x: number, z: number, r: number, s: number): void };
