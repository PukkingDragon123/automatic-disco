// The skill tree, as it happens in Operations Room 7. You stand at the light table with the assembly drawing U7-ASSY
// under your hands; the Colonel, Dr. Calder, the radio operator and the gantry technician work the room. Point at
// an item on the drawing and its requisition card types itself out on the clipboard; click a lit item and Calder
// rings it in red pencil (queued); the eraser takes the last one back; press the APPROVED stamp and it thumps down on
// every queued item while the ink draws itself into each part. Then the view swings to the armoured window: the
// technician pulls the lever, the gantry arms move in and the part bolts onto Unit 07 in a shower of sparks.
// Mechanics: Skills.why / Skills.buy, game.emit('skill', { id }), live resources and core cells, K / Esc to close.
import * as THREE from 'three';
import type { Engine, Screen } from '../app/engine';
import type { Post } from '../gfx/post';
import { Run } from '../game/run';
import { SKILLS, SKILL, RES, Skills, type Res } from '../game/skills';
import { el, ui, Tip } from './kit';
import { sfx, voice } from '../audio/audio';
import { SpeechBubble } from './cineBubble';
import { Blueprint, cardLines, paintCard, revLetter, type NState, type SheetData, type CardLine } from './skillBlueprint';
import { NODES, SW, SH } from './skillSheet';
import { OpsRoom, TOP } from './skillRoom';
import './skillTree.css';

const RES_NAME: Record<Res, string> = { ore: 'ORE', carbon: 'CARBON', water: 'WATER', soil: 'SOIL' };
const ease = (k: number) => (k < 0 ? 0 : k > 1 ? 1 : k * k * (3 - 2 * k));
const LINES = {
  stage: [[1, 'Ring that one.'], [1, 'Good choice.'], [0, 'Noted.'], [1, 'We can afford it.']],
  deny: [[0, 'Not on this budget, son.'], [1, "We're short on material."], [0, 'Negative.']],
  undo: [[1, 'Scratch that.'], [1, 'Never mind that one.']],
  approve: [[2, 'Requisition approved!'], [2, 'Approved. Logging it.']],
  install: [[3, 'Gantry arms engaged!'], [3, 'Bolting it on now!']],
  done: [[1, 'Beautiful.'], [0, 'Outstanding.'], [1, 'Look at that.']],
  phone: [[0, "That'll be Washington."], [0, 'Not now, General.']],
} as Record<string, [number, string][]>;
const PITCH = [0.72, 0.92, 1.08, 0.98];

/** anything that owns a run and an event bus (the Game does) */
export interface SkillHost { run: Run; emit(ev: string, d?: any): void }
type Tween = { t: number; dur: number; f: (k: number) => void; done: () => void };
interface OvItem { draw: (bp: Blueprint) => void; until: number }

export class SkillTree implements Screen {
  static current: SkillTree | null = null;
  private room: OpsRoom; private bp: Blueprint;
  private root: HTMLDivElement; private hint: HTMLDivElement; private drawer: HTMLDivElement | null = null; private bar: HTMLDivElement | null = null;
  private cardCv: HTMLCanvasElement;
  private staged: string[] = [];
  private inking = new Set<string>();
  /** bought but not yet bolted on in the hangar */
  private uninstalled = new Set<string>();
  private hover: string | null = null; private sel: string | null = null; private hoverProp = '';
  private busy = false; private closed = false; private compact = false;
  private sig = ''; private lastRes: Record<Res, number>; private lastPts: number;
  private t = 0; private tweens: Tween[] = []; private ov: OvItem[] = []; private ovDirty = false;
  private revLog: string[] = [];
  private bubbles: SpeechBubble[] = [];
  // camera: an orbit over the table, or a pose (the hangar window, the opening crane)
  private cam = { yaw: 0, pitch: 0.98, dist: 2.15, tx: 0.05, ty: TOP, tz: 0.08 };
  private camGoal = { yaw: 0, pitch: 0.98, dist: 2.15, tx: 0.05, ty: TOP, tz: 0.08 };
  private pose: { from: THREE.Vector3; to: THREE.Vector3; look0: THREE.Vector3; look1: THREE.Vector3; k: number; dir: number } | null = null;
  private drag: { x: number; y: number; moved: boolean; id: number; b: number } | null = null;
  private touches = new Map<number, { x: number; y: number }>(); private pinch = 0;
  private ray = new THREE.Raycaster(); private ndc = new THREE.Vector2();
  // card typing
  private card: { lines: CardLine[]; n: number; total: number; key: string; drawn: number } = { lines: [], n: 0, total: 0, key: '', drawn: -1 };
  private cardLift = 0;

  constructor(readonly host: SkillHost, readonly opts: { close: () => void }) {
    SkillTree.current = this;
    this.compact = innerWidth < 760 || innerHeight < 460;
    // the room is built once and kept: opening the drawing again is instant
    if (!CACHE) { const bp = new Blueprint(this.compact ? 1.3 : 1.6, 1), cv = document.createElement('canvas'); cv.width = 768; cv.height = 480; CACHE = { bp, cv, room: new OpsRoom(bp.cv, bp.ov, cv) }; }
    this.bp = CACHE.bp; this.cardCv = CACHE.cv; this.room = CACHE.room;
    this.room.reset();
    this.lastRes = { ...host.run.res }; this.lastPts = host.run.skills.points;
    // DOM: a transparent layer for the pointer, a typed hint line, the close tag, bubbles, and on phones a drawer
    this.root = el('div', 'sk3', ui());
    this.hint = el('div', 'sk3-hint', this.root, 'DRAG &nbsp;LOOK AROUND &nbsp;·&nbsp; WHEEL &nbsp;LEAN IN &nbsp;·&nbsp; CLICK A LIT ITEM TO QUEUE IT &nbsp;·&nbsp; <b>STAMP</b> &nbsp;APPROVE &nbsp;·&nbsp; <b>ERASER</b> &nbsp;UNDO &nbsp;·&nbsp; K &nbsp;CLOSE');
    const x = el('div', 'sk3-close', this.root, 'CLOSE DRAWING &nbsp;[K]');
    x.addEventListener('pointerdown', (e) => e.stopPropagation());
    x.addEventListener('click', (e) => { e.stopPropagation(); this.close(); });
    if (this.compact) {
      this.root.classList.add('compact');
      this.hint.innerHTML = 'DRAG \u00B7 PINCH \u00B7 TAP AN ITEM';
      this.cam.dist = this.camGoal.dist = innerWidth < innerHeight ? 3.0 : 2.4;
      this.drawer = el('div', 'sk3-card', this.root);
      this.bar = el('div', 'sk3-bar', this.root);
      const b = (label: string, cls: string, f: () => void) => { const e = el('div', 'sk3-btn ' + cls, this.bar!, label); e.addEventListener('pointerdown', (ev) => ev.stopPropagation()); e.addEventListener('click', (ev) => { ev.stopPropagation(); f(); }); return e; };
      b('ERASE', 'er', () => this.undo()); b('APPROVE', 'ap', () => this.confirm());
    }
    for (let i = 0; i < 4; i++) this.bubbles.push(new SpeechBubble(this.root));
    this.root.addEventListener('pointerdown', this.onDown);
    addEventListener('pointermove', this.onMove); addEventListener('pointerup', this.onUp); addEventListener('pointercancel', this.onUp);
    this.root.addEventListener('wheel', this.onWheel, { passive: false });
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', this.onKey);
    this.refresh(true);
    this.setCard(null);
    this.intro();
  }

  // ---------------------------------------------------------------- state (the same rules as ever)
  private simulate() {
    const sk = this.host.run.skills, res = { ...this.host.run.res } as Record<Res, number>;
    const sim = new Skills(); sim.owned = new Set(sk.owned); sim.points = sk.points;
    const ok: string[] = [];
    for (const id of this.staged) { if (sim.why(id, res) !== null) break; sim.buy(id, res); ok.push(id); }
    if (ok.length !== this.staged.length) this.staged = ok;
    return { sim, res };
  }
  private stateOf(id: string, sim: Skills, res: Record<Res, number>): NState {
    if (this.host.run.skills.has(id) && !this.inking.has(id)) return 'owned';
    if (this.staged.includes(id) || this.inking.has(id)) return 'staged';
    if (SKILL[id].req.some((r) => !sim.has(r))) return 'locked';
    return sim.why(id, res) === null ? 'can' : 'avail';
  }
  private data(): SheetData {
    const { sim, res } = this.simulate(), states: Record<string, NState> = {};
    for (const id of Object.keys(NODES)) states[id] = this.stateOf(id, sim, res);
    const sk = this.host.run.skills, owned = [...sk.owned].filter((i) => i !== 'head' && !this.inking.has(i)).length;
    return { states, queue: this.staged, res: this.host.run.res, after: res, cells: sk.points, cellsAfter: sim.points, rev: owned, revLog: this.revLog, inking: new Set() };
  }
  /** redraw the sheet and everything that follows from the state */
  private refresh(first = false) {
    const d = this.data();
    this.bp.render(d);
    this.room.sheetTex.needsUpdate = true;
    this.room.setPulses(Object.entries(d.states).filter(([, s]) => s === 'can').map(([id]) => [NODES[id].bx, NODES[id].by] as [number, number]).slice(0, 48), 15);
    this.room.golem.setParts([...this.host.run.skills.owned].filter((i) => !this.inking.has(i) && !this.uninstalled.has(i)), !first);
    this.updateCard(true);
    if (this.bar) { const ap = this.bar.querySelector('.ap') as HTMLElement; ap.textContent = this.staged.length ? `APPROVE ${this.staged.length}` : 'APPROVE'; ap.classList.toggle('on', this.staged.length > 0); (this.bar.querySelector('.er') as HTMLElement).classList.toggle('on', this.staged.length > 0); }
    this.lastSig = this.sigOf();
  }
  private lastSig = '';
  private sigOf() { const sk = this.host.run.skills, res = this.host.run.res; return RES.map((r) => Math.floor(res[r] ?? 0)).join(',') + '|' + sk.points + '|' + sk.owned.size; }

  // ---------------------------------------------------------------- the card
  private setCard(id: string | null) {
    const { sim, res } = this.simulate();
    const st = id ? this.stateOf(id, sim, res) : null;
    const lines = cardLines(id, st, res, sim.points, id ? sim.why(id, res) : null, id ? this.staged.indexOf(id) + 1 : 0);
    const key = JSON.stringify(lines);
    if (key === this.card.key) return;
    const same = (this.card.lines[1]?.t ?? '') === (lines[1]?.t ?? '');
    this.card = { lines, key, n: same ? this.card.n : 0, total: lines.reduce((a, l) => a + l.t.length + 1, 0), drawn: -1 };
    if (same) this.card.n = Math.min(this.card.n, this.card.total);
    if (this.drawer) this.drawer.style.display = id ? 'block' : 'none';
  }
  private updateCard(force = false) { this.setCard(this.hover ?? this.sel); if (force) this.card.drawn = -1; }
  private typeCard(dt: number) {
    const c = this.card;
    if (c.n < c.total) {
      const before = Math.floor(c.n); c.n = Math.min(c.total, c.n + dt * 90);
      if (Math.floor(c.n / 3) !== Math.floor(before / 3)) sfx('crack', 0.16, 0.13);
      if (c.n >= c.total) setTimeout(() => sfx('hover', 1, 0.5), 60);
    }
    const n = Math.floor(c.n);
    if (n !== c.drawn) {
      c.drawn = n;
      paintCard(this.cardCv, c.lines, n);
      this.room.cardTex.needsUpdate = true;
      if (this.drawer) this.drawer.innerHTML = c.lines.map((l) => `<div class="${l.red ? 'red' : l.dim ? 'dim' : l.big ? 'big' : ''}">${l.t.replace(/ /g, '&nbsp;')}</div>`).join('');
    }
  }

  // ---------------------------------------------------------------- tweens, overlay, voices
  private tween(dur: number, f: (k: number) => void) { return new Promise<void>((res) => this.tweens.push({ t: 0, dur, f, done: res })); }
  private wait(s: number) { return this.tween(s, () => {}); }
  private overlay(dur: number, draw: (bp: Blueprint) => void) { this.ov.push({ draw, until: this.t + dur }); this.ovDirty = true; }
  private say(kind: string) {
    const opts = LINES[kind]; if (!opts) return;
    const [who, line] = opts[Math.floor(Math.random() * opts.length)];
    const op = this.room.ops[who]; if (!op) return;
    this.bubbles[who].show(line, op.name);
    voice(line, PITCH[who]); op.rig.say(1.6);
    setTimeout(() => this.bubbles[who]?.hide(), 2600);
  }

  // ---------------------------------------------------------------- actions
  private stage(id: string) {
    this.staged.push(id);
    const num = this.staged.length;
    for (let i = 0; i < 6; i++) setTimeout(() => sfx('crack', 0.12 + Math.random() * 0.06, 0.18), i * 40);
    const t0 = this.t;
    this.overlay(0.42, (bp) => bp.circleOn(id, Math.min(1, (this.t - t0) / 0.38), num));
    setTimeout(() => { if (!this.closed) this.refresh(); }, 420);
    this.room.react('stage'); if (Math.random() < 0.45) this.say('stage');
    this.updateCard(true);
  }
  private unstage(id: string) {
    const i = this.staged.indexOf(id); if (i < 0) return;
    const out = new Set([id]);
    for (const s of this.staged.slice(i + 1)) if (SKILL[s].req.some((r) => out.has(r))) out.add(s);
    this.staged = this.staged.filter((s) => !out.has(s));
    void this.erase([...out]);
  }
  private undo() { if (this.busy) return; const id = this.staged[this.staged.length - 1]; if (!id) { sfx('deny'); return; } this.unstage(id); }
  /** the eraser travels to each item and rubs its red ring away */
  private async erase(ids: string[]) {
    const E = this.room.eraser, home = this.room.eraserHome.clone();
    this.room.react('undo'); if (Math.random() < 0.6) this.say('undo');
    for (const id of ids) {
      const n = NODES[id], b = n.sk.bbox(), at = this.room.sheetToWorld(b.x + b.w / 2, b.y + b.h / 2), from = E.position.clone();
      await this.tween(0.28, (k) => { E.position.lerpVectors(from, at, ease(k)); E.position.y = TOP + 0.004 + Math.sin(k * Math.PI) * 0.12; });
      const t0 = this.t;
      this.refresh();
      this.overlay(0.62, (bp) => { const a = 1 - (this.t - t0) / 0.6; if (a > 0) { bp.ov.getContext('2d')!.globalAlpha = Math.max(0, a); bp.circleOn(id, 1, 0); bp.ov.getContext('2d')!.globalAlpha = 1; } });
      for (let i = 0; i < 5; i++) setTimeout(() => sfx('grow', 0.4, 0.22), i * 110);
      await this.tween(0.6, (k) => { E.position.x = at.x + Math.sin(k * Math.PI * 10) * 0.035; E.position.z = at.z + Math.cos(k * Math.PI * 10) * 0.012; E.rotation.y = 0.3 + Math.sin(k * Math.PI * 10) * 0.15; });
    }
    const from = E.position.clone();
    await this.tween(0.32, (k) => { E.position.lerpVectors(from, home, ease(k)); E.position.y = TOP + Math.sin(k * Math.PI) * 0.1; });
    E.rotation.y = 0.3;
  }
  private toggle(id: string) {
    if (this.busy) return;
    const { sim, res } = this.simulate(), st = this.stateOf(id, sim, res);
    if (st === 'staged') { this.unstage(id); return; }
    if (st === 'can') { this.stage(id); return; }
    if (st === 'owned') { sfx('click', 1, 0.5); return; }
    sfx('deny'); this.room.react('deny'); if (Math.random() < 0.6) this.say('deny');
  }
  private confirm() {
    if (this.busy) return;
    if (!this.staged.length) { sfx('deny'); this.press(); return; }
    void this.approve();
  }
  /** a press with nothing queued: the stamp thumps the pad */
  private async press() {
    const S = this.room.stamp, y0 = S.position.y;
    await this.tween(0.12, (k) => { S.position.y = y0 + Math.sin(k * Math.PI) * 0.03; });
  }
  /** the big moment */
  private async approve() {
    this.busy = true;
    const sk = this.host.run.skills, res = this.host.run.res, list = [...this.staged], done: string[] = [];
    for (const id of list) { if (!sk.buy(id, res)) break; done.push(id); this.inking.add(id); this.uninstalled.add(id); this.host.emit('skill', { id }); }
    this.staged = [];
    this.lastRes = { ...res }; this.lastPts = sk.points;
    this.refresh();
    this.say('approve'); this.room.react('confirm');
    const S = this.room.stamp, H = this.room.stampHead;
    for (const id of done) {
      const [sx, sy] = this.bp.stampAt(id), at = this.room.sheetToWorld(sx, sy), from = S.position.clone();
      // lift off the pad and carry it over the item
      await this.tween(0.34, (k) => { S.position.lerpVectors(from, at, ease(k)); S.position.y = TOP + 0.045 + Math.sin(k * Math.PI) * 0.22 + ease(k) * 0.14; S.rotation.z = Math.sin(k * Math.PI) * 0.15; });
      // the ink runs along the part while the stamp hovers
      const t0 = this.t, dur = 0.85;
      sfx('build', 1, 0.45);
      this.overlay(dur + 0.05, (bp) => { bp.inkOn(id, Math.min(1, (this.t - t0) / dur)); });
      for (let i = 0; i < 8; i++) setTimeout(() => sfx('crack', 0.1, 0.12), i * 95);
      await this.tween(dur, (k) => { S.position.y = TOP + 0.185 + Math.sin(k * 9) * 0.006; });
      // THUMP
      await this.tween(0.09, (k) => { S.position.y = TOP + 0.185 - ease(k) * 0.172; });
      sfx('hit', 1.5, 0.95); sfx('crack', 0.9, 0.6);
      this.inking.delete(id);
      this.refresh();
      const t1 = this.t;
      this.overlay(0.32, (bp) => { const k = (this.t - t1) / 0.3; bp.stampOn(id, 1 + Math.max(0, 0.15 - k * 0.4), 0.9); });
      this.shake = 0.18;
      await this.tween(0.11, (k) => { H.scale.set(1 + Math.sin(k * Math.PI) * 0.08, 1 - Math.sin(k * Math.PI) * 0.16, 1 + Math.sin(k * Math.PI) * 0.08); });
      H.scale.set(1, 1, 1);
      this.revLog.push(`REV ${revLetter([...sk.owned].filter((i) => i !== 'head').length)}: ${SKILL[id].name.toUpperCase()}`.slice(0, 22));
      this.room.print(`REQ U7-${String(done.indexOf(id) + 1).padStart(2, '0')} ${SKILL[id].name.toUpperCase()} APPROVED`);
      for (let i = 0; i < 6; i++) setTimeout(() => sfx('crack', 0.2, 0.15), 200 + i * 45);
      await this.tween(0.12, (k) => { S.position.y = TOP + 0.013 + ease(k) * 0.15; });
    }
    const from = S.position.clone();
    await this.tween(0.4, (k) => { S.position.lerpVectors(from, this.room.stampHome, ease(k)); S.position.y = this.room.stampHome.y + Math.sin(k * Math.PI) * 0.12; S.rotation.z = 0; });
    this.refresh();
    await this.install(done);
    this.busy = false;
  }
  /** the view swings to the window: lever, gantry arms, sparks, the part bolts on */
  private async install(ids: string[]) {
    if (!ids.length || this.closed) return;
    const R = this.room, look = R.golemAt.clone().add(new THREE.Vector3(0, 2.4, 0));
    await this.camTo(new THREE.Vector3(0.35, 2.05, -2.15), look, 1.1);
    this.say('install'); R.react('install'); sfx('crack', 1.4, 0.5);
    await this.wait(0.35);
    for (const a of R.arms) a.goal = 1;
    sfx('pulse', 1, 0.35);
    await this.wait(0.7);
    for (const id of ids) this.uninstalled.delete(id);
    R.golem.setParts([...this.host.run.skills.owned], true);
    const chassis = ids.filter((i) => SKILL[i].branch === 'chassis');
    if (!chassis.length) R.golem.cast(look.clone().add(new THREE.Vector3(0, 0, 4)));
    R.wild = 1;
    for (let i = 0; i < 9; i++) setTimeout(() => {
      const arm = R.arms[i % 2], p = new THREE.Vector3(); arm.tip.getWorldPosition(p);
      R.fx.burst(p.x, p.y, p.z, 26, 0xffd8a0, { speed: 3.4, up: 2.2, size: 3, life: 0.8 });
      sfx('zap', 1, 0.3); if (i % 3 === 0) sfx('hit', 1.2, 0.5);
    }, i * 170);
    await this.wait(2.1);
    for (const a of R.arms) a.goal = 0;
    this.say('done'); R.ops[0].rig.gesture('nod');
    sfx(ids.some((i) => SKILL[i].pts >= 3) ? 'absorb' : 'done', 1, 0.6);
    await this.wait(1.0);
    await this.camBack(1.0);
  }

  // ---------------------------------------------------------------- camera
  private shake = 0;
  private camTo(pos: THREE.Vector3, look: THREE.Vector3, dur: number) {
    const from = this.room.cam.position.clone(), l0 = this.lookNow.clone();
    this.pose = { from, to: pos, look0: l0, look1: look, k: 0, dir: 1 };
    return this.tween(dur, (k) => { if (this.pose) this.pose.k = ease(k); });
  }
  private async camBack(dur: number) {
    if (!this.pose) return;
    const orbit = this.orbitPose();
    const from = this.room.cam.position.clone(), l0 = this.lookNow.clone();
    this.pose = { from, to: orbit.pos, look0: l0, look1: orbit.look, k: 0, dir: 1 };
    await this.tween(dur, (k) => { if (this.pose) this.pose.k = ease(k); });
    this.pose = null;
  }
  private lookNow = new THREE.Vector3();
  private orbitPose() {
    const c = this.cam, look = new THREE.Vector3(c.tx, c.ty, c.tz);
    const pos = new THREE.Vector3(c.tx + Math.sin(c.yaw) * Math.cos(c.pitch) * c.dist, c.ty + Math.sin(c.pitch) * c.dist, c.tz + Math.cos(c.yaw) * Math.cos(c.pitch) * c.dist);
    return { pos, look };
  }
  private async intro() {
    // the sheet slides onto the table while the camera cranes down and the lamps warm up
    const S = this.room.sheet, O = this.room.ov, z0 = S.position.z;
    this.busy = true;
    sfx('grow', 0.8, 0.5); setTimeout(() => sfx('crack', 0.5, 0.25), 420);
    const orbit = this.orbitPose();
    this.pose = { from: new THREE.Vector3(0.6, 3.1, 2.6), to: orbit.pos, look0: new THREE.Vector3(0, 1.4, -2), look1: orbit.look, k: 0, dir: 1 };
    await this.tween(1.25, (k) => {
      if (this.pose) this.pose.k = ease(k);
      const s = ease(Math.min(1, k * 1.4)); S.position.z = z0 + (1 - s) * 0.9; S.rotation.z = (1 - s) * 0.12; O.position.z = S.position.z;
      this.room.lampWarm(k);
    });
    S.position.z = z0; S.rotation.z = 0; O.position.z = z0; this.room.lampWarm(1);
    this.pose = null; this.busy = false;
  }

  // ---------------------------------------------------------------- input
  private pick(cx: number, cy: number): { prop: string; node: string | null } {
    this.ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.room.cam);
    const R = this.room;
    const hits = this.ray.intersectObjects([R.sheet, R.stamp, R.eraser, R.card, R.phone], true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o) {
        if (o === R.stamp) return { prop: 'stamp', node: null };
        if (o === R.eraser) return { prop: 'eraser', node: null };
        if (o === R.phone) return { prop: 'phone', node: null };
        if (o === R.card) return { prop: 'card', node: null };
        if (o === R.sheet && h.uv) return { prop: 'sheet', node: this.nodeAt(h.uv.x * SW, (1 - h.uv.y) * SH) };
        o = o.parent;
      }
    }
    return { prop: '', node: null };
  }
  private nodeAt(x: number, y: number): string | null {
    let best: string | null = null, area = Infinity;
    for (const n of Object.values(NODES)) {
      if (Math.hypot(x - n.bx, y - n.by) < 14) return n.id;
      const b = n.hit;
      if (x >= b.x - 4 && x <= b.x + b.w + 4 && y >= b.y - 4 && y <= b.y + b.h + 4 && b.w * b.h < area) { area = b.w * b.h; best = n.id; }
    }
    return best;
  }
  private onDown = (e: PointerEvent) => {
    this.root.setPointerCapture?.(e.pointerId);
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.touches.size === 2) { const [a, b] = [...this.touches.values()]; this.pinch = Math.hypot(a.x - b.x, a.y - b.y); this.drag = null; return; }
    this.drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId, b: e.button };
  };
  private onMove = (e: PointerEvent) => {
    if (this.closed) return;
    const tp = this.touches.get(e.pointerId);
    if (tp) { tp.x = e.clientX; tp.y = e.clientY; }
    if (this.touches.size === 2) {
      const [a, b] = [...this.touches.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinch > 0) this.zoom(this.pinch / d, (a.x + b.x) / 2, (a.y + b.y) / 2);
      this.pinch = d; return;
    }
    const d = this.drag;
    if (d && e.pointerId === d.id) {
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.moved && Math.abs(dx) + Math.abs(dy) > (e.pointerType === 'mouse' ? 3 : 8)) d.moved = true;
      if (d.moved) {
        if (d.b === 2 || e.shiftKey) { this.camGoal.tx -= dx * 0.0016 * this.cam.dist; this.camGoal.tz -= dy * 0.0016 * this.cam.dist; }
        else { this.camGoal.yaw -= dx * 0.004; this.camGoal.pitch += dy * 0.0035; }
        this.clampCam(); d.x = e.clientX; d.y = e.clientY;
      }
      return;
    }
    if (e.pointerType === 'mouse' && !this.pose) this.hoverAt(e.clientX, e.clientY);
  };
  private onUp = (e: PointerEvent) => {
    this.touches.delete(e.pointerId); if (this.touches.size < 2) this.pinch = 0;
    const d = this.drag; if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    if (d.moved || this.closed || this.pose) return;
    const p = this.pick(e.clientX, e.clientY);
    if (p.prop === 'stamp') { this.confirm(); return; }
    if (p.prop === 'eraser') { this.undo(); return; }
    if (p.prop === 'phone') { this.room.ringing = 1.2; sfx('spawn-alarm', 1, 0.25); this.room.react('phone'); this.say('phone'); return; }
    if (p.node) { this.sel = p.node; this.hover = e.pointerType === 'mouse' ? p.node : null; this.toggle(p.node); this.updateCard(); return; }
    if (p.prop === '' || p.prop === 'sheet') { this.sel = null; this.updateCard(); }
  };
  private hoverAt(x: number, y: number) {
    const p = this.pick(x, y);
    const node = p.node;
    if (node !== this.hover) { this.hover = node; if (node) sfx('hover', 1, 0.25); this.updateCard(); }
    if (p.prop !== this.hoverProp) { this.hoverProp = p.prop; Tip.hide(); }
    this.root.style.cursor = node || p.prop === 'stamp' || p.prop === 'eraser' || p.prop === 'phone' ? 'pointer' : 'grab';
    this.cardLift = p.prop === 'card' || !!node ? 1 : 0;
  }
  private onWheel = (e: WheelEvent) => { e.preventDefault(); this.zoom(Math.exp((e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY) * 0.0012), e.clientX, e.clientY); };
  /** zoom toward the point under the pointer */
  private zoom(f: number, x: number, y: number) {
    if (this.pose) return;
    const c = this.camGoal, nd = Math.max(0.6, Math.min(3.1, c.dist * f)), k = 1 - nd / c.dist;
    this.ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); this.ray.setFromCamera(this.ndc, this.room.cam);
    const hit = new THREE.Vector3();
    if (this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -TOP), hit)) { c.tx += (hit.x - c.tx) * k; c.tz += (hit.z - c.tz) * k; }
    c.dist = nd; this.clampCam();
  }
  private clampCam() { const c = this.camGoal; c.yaw = Math.max(-0.75, Math.min(0.75, c.yaw)); c.pitch = Math.max(0.42, Math.min(1.4, c.pitch)); c.tx = Math.max(-1.1, Math.min(1.1, c.tx)); c.tz = Math.max(-0.7, Math.min(0.75, c.tz)); }
  private onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    const k = e.key;
    if (k === 'Escape' || k === 'k' || k === 'K') { e.preventDefault(); this.close(); return; }
    if (k === 'Enter') { this.confirm(); return; }
    if (k === 'Backspace' || k === 'z' || k === 'Z' || k === 'u' || k === 'U') { e.preventDefault(); this.undo(); return; }
    if (k === 'ArrowLeft') this.camGoal.yaw += 0.12; if (k === 'ArrowRight') this.camGoal.yaw -= 0.12;
    if (k === 'ArrowUp') this.camGoal.pitch += 0.1; if (k === 'ArrowDown') this.camGoal.pitch -= 0.1;
    this.clampCam();
  };

  // ---------------------------------------------------------------- frame
  update(dt: number) {
    this.t += dt;
    for (const tw of [...this.tweens]) { tw.t += dt; const k = Math.min(1, tw.t / tw.dur); tw.f(k); if (k >= 1) { this.tweens.splice(this.tweens.indexOf(tw), 1); tw.done(); } }
    // live: resources and core cells can change under us
    const sig = this.sigOf();
    if (sig !== this.lastSig && !this.busy) {
      const sk = this.host.run.skills;
      if (sk.points > this.lastPts) { sfx('qte-good', 1, 0.6); this.room.print(`+${sk.points - this.lastPts} CORE CELL ISSUED`); }
      this.lastRes = { ...this.host.run.res }; this.lastPts = sk.points;
      this.refresh();
    }
    // overlay animations
    if (this.ov.length || this.ovDirty) {
      this.bp.clearOverlay();
      this.ov = this.ov.filter((o) => o.until > this.t);
      for (const o of this.ov) o.draw(this.bp);
      this.room.ov.visible = this.ov.length > 0; this.room.ovTex.needsUpdate = true; this.ovDirty = this.ov.length > 0;
    }
    this.typeCard(dt);
    // the clipboard leans toward you while you read
    const C = this.room.card; this.cardLiftK += (this.cardLift - this.cardLiftK) * Math.min(1, dt * 6);
    C.position.copy(this.room.cardHome).add(new THREE.Vector3(-0.04 * this.cardLiftK, 0.06 * this.cardLiftK, 0.05 * this.cardLiftK)); C.rotation.x = 0.62 + this.cardLiftK * 0.22;
    // camera
    const c = this.cam, g = this.camGoal, kk = Math.min(1, dt * 7);
    c.yaw += (g.yaw - c.yaw) * kk; c.pitch += (g.pitch - c.pitch) * kk; c.dist += (g.dist - c.dist) * kk; c.tx += (g.tx - c.tx) * kk; c.tz += (g.tz - c.tz) * kk;
    const cam = this.room.cam, orbit = this.orbitPose();
    if (this.pose) { cam.position.lerpVectors(this.pose.from, this.pose.to, this.pose.k); this.lookNow.lerpVectors(this.pose.look0, this.pose.look1, this.pose.k); }
    else { cam.position.copy(orbit.pos); this.lookNow.copy(orbit.look); }
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt); cam.position.y += Math.sin(this.t * 90) * this.shake * 0.02; }
    cam.lookAt(this.lookNow);
    this.room.update(dt);
    // people look at what is happening: the drawing, or the window during installs
    const focus = this.pose ? this.lookNow : new THREE.Vector3(c.tx, TOP, c.tz);
    this.room.ops.forEach((o, i) => { o.look = i === 3 && !this.pose ? null : focus; });
    // bubbles over heads
    const v = new THREE.Vector3();
    this.bubbles.forEach((b, i) => { this.room.headOf(i, v); v.project(cam); b.update(dt, (v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight, v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1); });
  }
  private cardLiftK = 0;
  render(post: Post, t: number) { post.render(this.room.scene, this.room.cam, this.room.fxs, t); }
  resize(w: number, h: number) { this.room.cam.aspect = w / h; this.room.cam.updateProjectionMatrix(); }
  suspend() { this.root.style.display = 'none'; }
  resume() { this.root.style.display = ''; }
  close() {
    if (this.closed) return;
    this.closed = true;
    sfx('close'); sfx('grow', 0.6, 0.3);
    this.opts.close();
  }
  dispose() {
    this.closed = true;
    if (SkillTree.current === this) SkillTree.current = null;
    removeEventListener('keydown', this.onKey);
    removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp); removeEventListener('pointercancel', this.onUp);
    for (const b of this.bubbles) b.dispose();
    this.root.remove(); Tip.hide();
    this.room.reset();
  }
}
let CACHE: { bp: Blueprint; cv: HTMLCanvasElement; room: OpsRoom } | null = null;

// ------------------------------------------------------------------ wiring helpers
/** open the skill tree over a game (idempotent: a second call while it is open does nothing) */
export function openSkillTree(engine: Engine, host: SkillHost) {
  if (SkillTree.current) return SkillTree.current;
  const s = new SkillTree(host, { close: () => { if (engine.screen === s) engine.pop(); } });
  engine.push(s);
  return s;
}
let keyOff: (() => void) | null = null;
/** K opens the tree while `screen` is the running screen (the screen itself closes on K / Esc). In the game the HUD
 * already maps K (respecting QTEs and story beats); this is for stand-alone hosts like the test page. */
export function bindSkillKey(engine: Engine, game: Screen, open: () => void) {
  keyOff?.();
  const f = (e: KeyboardEvent) => {
    if (e.key !== 'k' && e.key !== 'K') return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const t = (e.target as HTMLElement)?.tagName; if (t === 'INPUT' || t === 'TEXTAREA') return;
    if (engine.screen !== game || SkillTree.current) return;
    open();
  };
  addEventListener('keydown', f);
  keyOff = () => { removeEventListener('keydown', f); keyOff = null; };
  return keyOff;
}

// ------------------------------------------------------------------ ?test=skills
export function testSkills(engine: Engine, P: URLSearchParams) {
  const run = new Run(7);
  const own = (P.get('own') ?? 'torso,armR,drill,intake,siphon,excavate,punch,lift,magnet').split(',').filter((i) => SKILL[i]);
  for (const id of own) run.skills.owned.add(id);
  run.skills.points = Number(P.get('pts') ?? 3);
  const R = (P.get('res') ?? '140,90,120,160').split(',').map(Number);
  RES.forEach((r, i) => (run.res[r] = R[i] ?? 0));
  const host: SkillHost = { run, emit: (ev, d) => console.log('emit', ev, JSON.stringify(d)) };
  (window as any).__skills = host; (window as any).__SkillTree = SkillTree;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x07090a);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 10);
  const base: Screen = { update() {}, render(post, t) { post.render(scene, cam, undefined, t); } };
  engine.setScreen(base);
  bindSkillKey(engine, base, () => openSkillTree(engine, host));
  if (!P.has('closed')) openSkillTree(engine, host);
  if (P.has('live')) setInterval(() => { const r = RES[Math.floor(Math.random() * 4)]; run.res[r] += 3 + Math.floor(Math.random() * 6); if (Math.random() < 0.08) run.skills.grant(1, 'test'); }, 700);
  void SKILLS; void RES_NAME;
}
