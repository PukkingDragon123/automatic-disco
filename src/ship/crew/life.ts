// Life aboard: the eight crew live in the hub's rooms on their own days. A ship clock runs (one ship hour = 40 s);
// each crew member follows their roster routine block by block: walks out of the room by its door, along the
// spine corridor, into the next room, to a free spot that suits the act (a bunk to sleep, a mess seat to eat, the
// helm to pilot, the galley to cook, the reactor valves to repair) and does it there with the body (sitting, lying,
// typing, hammering, cooking, jumping jacks, reading, drinking). Partners face each other and talk. Now and then
// someone says a line in a paper speech balloon over their head. Click a crew member: they stop, turn to UNIT 07
// and answer with a line, a voice and a gesture. UNIT 07 floats about the room the camera is on. After a death, the
// crew grieves (slower, sadder lines, a memorial plaque in the mess, a moment of silence).
import * as THREE from 'three';
import { Actor } from '../../ui/cineCast';
import { SpeechBubble } from '../../ui/cineBubble';
import { cspeak } from '../../ui/cineAudio';
import { buildCrewModel, type CrewModel } from './model';
import { Unit07 } from './unit07';
import { ROSTER, CREW_IDS, type CrewId, type Act, type RoomKey, type Block } from './roster';
import { crewState, onCrew, isAway } from './state';
import { memorial } from './memorial';
import { Ink, INK, idBadge } from './doodle';
import type { RoomId } from '../hub/layout';

/** the slice of the ship hub (src/ship/hub/hub.ts ShipHub) the crew needs */
export interface HubSpot { pos: THREE.Vector3; facing: number }
export interface HubRoomLike { id: RoomId; root: THREE.Object3D; bounds: THREE.Box3; spots: Record<string, HubSpot> }
export interface HubLike {
  scene: THREE.Scene; camera: THREE.PerspectiveCamera;
  room(id: RoomId): HubRoomLike | undefined;
  onUpdate(fn: (dt: number, t: number) => void): () => void;
  mode?: string; focused?: RoomId | null;
}

/** ship seconds per ship hour */
export const SHIP_HOUR = 40;
const ROOM_OF: Record<RoomKey, RoomId> = { bridge: 'bridge', lab: 'lab', mess: 'mess', quarters: 'quarters', medbay: 'medbay', hydro: 'lab', engineering: 'engineering', hangar: 'workshop', cargo: 'cargo', gym: 'cargo' };
/** where in a room each act wants to be (spot names, tried in order; '*' = a free patch of floor) */
const WANT: Partial<Record<RoomId, Partial<Record<Act, string[]>>>> = {
  bridge: { work: ['comms', 'nav', 'helm'], pilot: ['helm', 'nav'], chat: ['monitor', 'center', '*'], patrol: ['*', 'monitor', 'comms', 'door'], study: ['nav'] },
  lab: { work: ['bench', 'terminal', 'scope'], study: ['scope', 'terminal', 'bench'], tend: ['tank', 'bench'], read: ['terminal', '*'], chat: ['center', '*'], patrol: ['*'] },
  mess: { eat: ['seat1', 'seat2', 'seat3', 'seat4', 'seat5', 'seat6'], coffee: ['coffee', 'counter'], cook: ['galley', 'counter'], chat: ['seat2', 'seat5', 'seat3', 'seat6', 'seat1', 'seat4'], inventory: ['counter'], patrol: ['*'] },
  quarters: { sleep: ['bunk1', 'bunk2', 'bunk3', 'bunk4', 'bunk5', 'bunk6', 'bunk7', 'bunk8'], read: ['chair', 'table', '*'], exercise: ['center', '*'], chat: ['table', '*'] },
  medbay: { treat: ['doctor', 'scanner', 'cabinet'], study: ['cabinet', 'scanner'], chat: ['center', '*'], patrol: ['*'] },
  engineering: { repair: ['valves', 'console', 'catwalk'], patrol: ['catwalk', 'console', '*'], work: ['console'] },
  workshop: { repair: ['welder', 'workbench', 'toolwall'], patrol: ['workbench', '*'], work: ['workbench'] },
  cargo: { inventory: ['shelves', 'crates'], exercise: ['center', 'loader', '*'], patrol: ['crates', 'shelves', '*'] },
  core: { work: ['console'], patrol: ['racks', '*'] },
};
/** the action loop each act plays (one picked every few seconds) */
const ACTIONS: Partial<Record<Act, string[]>> = {
  work: ['type', 'type', 'read'], pilot: ['type'], study: ['read', 'scanner', ''], repair: ['hammer', 'craft', 'push', 'saw'], exercise: ['emote:jumping_jacks', 'emote:flex', 'emote:jumping_jacks'],
  tend: ['pour', 'craft', 'scanner'], cook: ['cook', 'mix', 'cook'], treat: ['scanner', 'bandage', 'stitch'], inventory: ['read', 'pickup', 'read'], eat: ['eat', 'eat', 'drink'],
  coffee: ['drink', 'drink', ''], read: ['read'], chat: [''], patrol: [''], sleep: [''],
};
const PROP_FOR: Partial<Record<Act, string>> = { coffee: 'mug', cook: 'ladle', repair: 'wrench', tend: 'jar' };

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const h1 = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };

interface Agent {
  id: CrewId; m: CrewModel; actor: Actor;
  room: RoomId; block: Block | null; act: Act;
  path: THREE.Vector3[]; spot: string; spotP: THREE.Vector3; facing: number;
  posture: '' | 'sit' | 'lie'; floorY: number;
  actT: number; actName: string; actDur: number;
  lineT: number; bubble: SpeechBubble | null; bubT: number;
  hold: number; holdLook: THREE.Vector3 | null;
  proxy: THREE.Mesh; travelT: number;
}

export class CrewLife {
  readonly agents = new Map<CrewId, Agent>();
  readonly unit: Unit07;
  /** ship clock (hours 0..24) */
  hour = 9.2;
  private t = 0; private lineGap = 0;
  private taken = new Map<string, CrewId>();
  private off: (() => void)[] = [];
  private ray = new THREE.Raycaster(); private ptr = new THREE.Vector2();
  private bubbleRoot: HTMLElement;
  /** paused (the intro drives the crew itself): routines stop, bubbles too */
  scripted = false;
  /** a moment of silence pending (after a death): everyone gathers at the plaque once */
  private silence = 0;
  /** the ID card of the last crew member clicked (name, job, mood), on a leader line beside them */
  private tag: { c: HTMLCanvasElement; id: CrewId; t: number; boil: number } | null = null;

  constructor(readonly hub: HubLike, o: { hour?: number; bubbles?: HTMLElement; noUnit?: boolean; only?: CrewId[] } = {}) {
    this.hour = o.hour ?? (9 + (Date.now() / 1000 / SHIP_HOUR) % 12);
    this.bubbleRoot = o.bubbles ?? document.body;
    const st = crewState();
    for (const id of o.only ?? CREW_IDS) {
      if (st.dead[id] || isAway(id)) continue;
      this.spawn(id);
    }
    this.unit = new Unit07();
    if (!o.noUnit) { hub.scene.add(this.unit.root, this.unit.fx); const lc = hub.room('lab')?.spots.center?.pos; this.unit.place(lc ? V(lc.x, 1.45, lc.z) : V(0, 1.45, 0)); }
    this.off.push(hub.onUpdate((dt) => this.update(dt)));
    const cv = document.querySelector('canvas#view') as HTMLCanvasElement | null;
    const down = (e: PointerEvent) => this.click(e);
    const move = (e: PointerEvent) => this.hover(e);
    (cv ?? window).addEventListener('pointerdown', down as EventListener, true);
    (cv ?? window).addEventListener('pointermove', move as EventListener, true);
    this.off.push(() => { (cv ?? window).removeEventListener('pointerdown', down as EventListener, true); (cv ?? window).removeEventListener('pointermove', move as EventListener, true); });
    this.off.push(onCrew('death', (id) => this.onDeath(id as CrewId)));
    // the memorial plaque, if anyone has fallen
    const mess = hub.room('mess');
    if (mess) { const mem = memorial(mess); if (mem) this.off.push(() => mem.removeFromParent()); }
    if (st.silence) this.silence = 1;
  }

  // ------------------------------------------------------------------ spawning and placing
  private spawn(id: CrewId) {
    const m = buildCrewModel(id);
    const blk = this.blockAt(id, this.hour);
    const room = ROOM_OF[blk.room];
    const r = this.hub.room(room) ?? this.hub.room('mess')!;
    let ag: Agent | null = null;
    const actor = new Actor(m.rig, () => ag?.floorY ?? 0, r.root);
    const proxy = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.85, 8), new THREE.MeshBasicMaterial({ visible: false }));
    proxy.position.y = 0.92; proxy.userData.crewId = id; m.rig.root.add(proxy);
    ag = {
      id, m, actor, room: r.id, block: null, act: blk.act, path: [], spot: '', spotP: V(), facing: 0, posture: '', floorY: 0,
      actT: 0, actName: '', actDur: 4, lineT: 8 + h1(CREW_IDS.indexOf(id), 3) * 25, bubble: null, bubT: 0, hold: 0, holdLook: null, proxy, travelT: 0,
    };
    this.agents.set(id, ag);
    this.enter(ag, blk, true);
  }
  /** the block of a member's routine at an hour */
  blockAt(id: CrewId, hour: number): Block {
    const R = ROSTER[id].routine, h = ((hour % 24) + 24) % 24;
    return R.find((b) => h >= b.from && h < b.to) ?? R[0];
  }
  private room(id: RoomId) { return this.hub.room(id)!; }
  /** pick a free spot for an act in a room */
  private pick(ag: Agent, room: RoomId, act: Act): { name: string; p: THREE.Vector3; facing: number } {
    const R = this.room(room);
    const want = WANT[room]?.[act] ?? (act === 'sleep' ? ['*'] : ['*']);
    // the captain's chair and the bunk by roster order are personal
    if (act === 'sleep' && room === 'quarters') { const b = 'bunk' + (CREW_IDS.indexOf(ag.id) + 1); if (R.spots[b]) return this.claim(ag, room, b); }
    if (ag.id === 'quintero' && room === 'bridge' && (act === 'work' || act === 'pilot') && R.spots.captain) return this.claim(ag, room, 'captain');
    for (const n of want) {
      if (n === '*') break;
      const k = room + ':' + n; const who = this.taken.get(k);
      if (R.spots[n] && (!who || who === ag.id)) return this.claim(ag, room, n);
    }
    // a free patch of floor: round the room's centre, clear of the others
    const b = R.bounds, c = R.spots.center?.pos ?? b.getCenter(V()).setY(0);
    for (let i = 0; i < 12; i++) {
      const a = h1(CREW_IDS.indexOf(ag.id) * 13 + i, this.t) * Math.PI * 2, r = 0.8 + h1(i, 7) * 2.2;
      const p = V(c.x + Math.cos(a) * r, 0, c.z + Math.sin(a) * r);
      p.x = Math.max(b.min.x + 0.7, Math.min(b.max.x - 0.7, p.x)); p.z = Math.max(b.min.z + 0.7, Math.min(b.max.z - 0.7, p.z));
      let ok = true; for (const o of this.agents.values()) if (o !== ag && o.spotP.distanceTo(p) < 0.9) ok = false;
      if (ok) { this.release(ag); return { name: '*', p, facing: a + Math.PI }; }
    }
    this.release(ag);
    return { name: '*', p: c.clone(), facing: 0 };
  }
  private claim(ag: Agent, room: RoomId, n: string) {
    this.release(ag); this.taken.set(room + ':' + n, ag.id);
    const s = this.room(room).spots[n];
    return { name: n, p: s.pos.clone(), facing: s.facing };
  }
  private release(ag: Agent) { for (const [k, v] of this.taken) if (v === ag.id) this.taken.delete(k); }

  /** go into a block: plan the walk (or appear there at once) */
  /** go into a block (QA may call it to jump the clock) */
  enter(ag: Agent, blk: Block, instant = false) {
    ag.block = blk; ag.act = blk.act;
    const to = ROOM_OF[blk.room];
    const tgt = this.pick(ag, to, blk.act);
    ag.spot = tgt.name; ag.spotP.copy(tgt.p); ag.facing = tgt.facing;
    this.stand(ag);
    if (instant || ag.room === to && ag.actor.x === 0 && ag.actor.z === 0) {
      if (ag.room !== to) this.reparent(ag, to);
      this.arrive(ag, true);
      return;
    }
    // the route: out by this room's door, along the corridor, in by the other door
    const path: THREE.Vector3[] = [];
    if (ag.room !== to) {
      const d0 = this.room(ag.room).spots.door?.pos, d1 = this.room(to).spots.door?.pos;
      if (d0) { path.push(d0.clone()); path.push(V(0, 0, d0.z)); }
      if (d1) { path.push(V(0, 0, d1.z)); path.push(d1.clone()); }
    }
    path.push(tgt.p.clone().setY(0));
    ag.path = path; ag.travelT = 0;
    this.nextLeg(ag);
  }
  private stand(ag: Agent) {
    if (ag.posture) { ag.posture = ''; ag.actor.full = ''; ag.floorY = 0; ag.actor.y = 0; }
    ag.actor.action = ''; ag.actName = '';
  }
  private nextLeg(ag: Agent) {
    const p = ag.path.shift();
    if (!p) { this.arrive(ag); return; }
    const sad = crewState().mood < 0.55 ? 0.82 : 1;
    const v = (ag.act === 'patrol' ? 1.05 : 1.3) * sad * (ag.id === 'araujo' ? 0.85 : ag.id === 'castellanos' ? 1.12 : 1);
    ag.actor.walkTo(p.x, p.z, v);
  }
  /** an actor's root lives under its room's root: move it (keeping its world position) when it changes rooms */
  private reparent(ag: Agent, room: RoomId) {
    const r = this.room(room);
    r.root.add(ag.m.rig.root);
    ag.room = room;
  }
  private arrive(ag: Agent, instant = false) {
    const a = ag.actor, p = ag.spotP;
    if (instant) a.place(p.x, p.z, ag.facing);
    else { a.arrive(); a.faceNow(p.x + Math.sin(ag.facing), p.z + Math.cos(ag.facing)); }
    a.yaw = ag.facing;
    // seats and bunks
    if (ag.act === 'sleep' && ag.spot.startsWith('bunk')) {
      // pos = the head on the mattress, facing = toward the feet; the lying body extends from its root (the feet) along -z
      const L = 1.62 * ag.m.def.scale * ag.m.rig.s;
      a.place(p.x + Math.sin(ag.facing) * L, p.z + Math.cos(ag.facing) * L, ag.facing);
      ag.floorY = p.y - 0.13; a.y = ag.floorY; ag.posture = 'lie'; a.full = 'lie';
    } else if (/seat|chair|captain/.test(ag.spot) && p.y > 0.25 && p.y < 0.85) {
      ag.floorY = p.y - 0.45 * ag.m.def.scale * ag.m.rig.s; a.y = ag.floorY; ag.posture = 'sit'; a.full = 'sit';
    } else { ag.floorY = p.y > 0.05 && p.y < 0.5 ? p.y : 0; a.y = ag.floorY; ag.posture = ''; a.full = ''; }
    const prop = PROP_FOR[ag.act];
    ag.m.showProp(prop && ag.m.props[prop] ? prop : null, prop === 'mug' ? 'R' : undefined);
    if (ag.m.props.tablet && !prop) ag.m.showProp('tablet', 'L');
    ag.actT = 0; ag.actDur = 0;
  }

  // ------------------------------------------------------------------ per frame
  update(dt: number) {
    this.t += dt;
    if (!this.scripted) this.hour = (this.hour + dt / SHIP_HOUR) % 24;
    const cam = this.hub.camera;
    this.lineGap = Math.max(0, this.lineGap - dt);
    for (const ag of this.agents.values()) {
      if (ag.m.dead) { ag.actor.update(dt); continue; }
      if (!this.scripted) this.live(ag, dt);
      ag.actor.update(dt);
      // a room change happens at the corridor: the actor's root moves to the room it is now in
      if (!this.scripted) { const r = roomOfPoint(this.hub, ag.actor.x, ag.actor.z); if (r && r !== ag.room) this.reparent(ag, r); }
      this.bubbleTick(ag, dt, cam);
    }
    this.tagTick(dt, cam);
    // UNIT 07: drifts to the room the camera is on, looks at whoever spoke last
    if (!this.scripted) this.unitTick(dt);
    this.unit.camQ.copy(cam.quaternion);
    this.unit.update(dt);
  }
  private live(ag: Agent, dt: number) {
    const a = ag.actor;
    if (ag.hold > 0) {
      ag.hold -= dt;
      if (ag.holdLook) { a.face(ag.holdLook.x, ag.holdLook.z); a.look = ag.holdLook; }
      if (ag.hold <= 0) { ag.holdLook = null; a.look = null; if (ag.spotP && !a.moving && !ag.path.length) a.yaw = ag.facing; }
      return;
    }
    // the moment of silence after a death: everyone at the plaque in the mess
    if (this.silence > 0) { this.silenceTick(ag, dt); return; }
    const blk = this.blockAt(ag.id, this.hour);
    if (blk !== ag.block) { this.enter(ag, blk); return; }
    if (a.moving) return;
    if (ag.path.length) { this.nextLeg(ag); return; }
    // the act: pick an action every few seconds
    ag.actT += dt;
    if (ag.actT >= ag.actDur) {
      ag.actT = 0;
      const list = ACTIONS[ag.act] ?? [''];
      const pick = list[Math.floor(h1(this.t * 3.7, CREW_IDS.indexOf(ag.id)) * list.length)] ?? '';
      ag.actName = pick; ag.actDur = 3 + h1(this.t, CREW_IDS.indexOf(ag.id) + 5) * 5;
      a.action = ag.posture === 'lie' ? '' : pick;
      if (ag.act === 'patrol' && !ag.posture) {
        const nxt = this.pick(ag, ag.room, 'patrol'); ag.spot = nxt.name; ag.spotP.copy(nxt.p); ag.facing = nxt.facing;
        a.walkTo(nxt.p.x, nxt.p.z, 0.9);
      }
      if (ag.act === 'chat') this.chatTick(ag);
      if (ag.act === 'study' && !ag.posture && h1(this.t, 9) < 0.35) ag.m.rig.gesture('think');
      if (ag.act === 'sleep') { ag.m.rig.setExpression('sleepy', 99); }
    }
  }
  private chatTick(ag: Agent) {
    const pid = ag.block?.with, p = pid ? this.agents.get(pid) : null;
    if (p && p.room === ag.room && !p.m.dead) {
      if (!ag.posture) ag.actor.face(p.actor.x, p.actor.z);
      ag.actor.look = V(p.actor.x, p.actor.y + 1.55, p.actor.z);
      if (h1(this.t, CREW_IDS.indexOf(ag.id)) < 0.6) { ag.m.rig.gesture('talk', { dur: 2.2 }); ag.m.rig.say(2.2, h1(this.t, 2) < 0.5 ? 'smile' : undefined); }
    }
  }
  private silenceTick(ag: Agent, dt: number) {
    const a = ag.actor;
    const mess = this.room('mess');
    if (ag.room !== 'mess' && !ag.path.length && !a.moving) { this.enter(ag, { from: 0, to: 24, room: 'mess', act: 'patrol' }); return; }
    if (a.moving) return;
    if (ag.path.length) { this.nextLeg(ag); return; }
    const plaque = memorialSpot(mess);
    const i = CREW_IDS.indexOf(ag.id);
    const p = V(plaque.x - Math.sin(plaque.f) * (1.2 + (i % 2) * 0.6) + Math.cos(plaque.f) * ((i % 4) - 1.5) * 0.7, 0, plaque.z - Math.cos(plaque.f) * (1.2 + (i % 2) * 0.6) - Math.sin(plaque.f) * ((i % 4) - 1.5) * 0.7);
    if (Math.hypot(a.x - p.x, a.z - p.z) > 0.3) { this.stand(ag); a.walkTo(p.x, p.z, 0.8); return; }
    a.face(plaque.x, plaque.z); a.look = V(plaque.x, 1.5, plaque.z); a.action = '';
    ag.m.rig.setExpression('sad', 2);
    this.silence += dt / (CREW_IDS.length * 40);
    if (this.silence > 1.9) { this.silence = 0; const st = crewState(); st.silence = false; st.save(); }
  }
  private unitTick(dt: number) {
    void dt;
    const f = this.hub.focused ?? null;
    const r = f ? this.hub.room(f) : this.hub.room('lab');
    if (!r) return;
    const c = (r.spots.center?.pos ?? r.bounds.getCenter(V())).clone();
    const want = V(c.x - 0.6, 1.55 + Math.sin(this.t * 0.4) * 0.15, c.z + 0.8);
    if (this.unit.pos.distanceTo(want) > 1.5 && !this.unit.moving) this.unit.moveTo(want, 3.2);
    let near: Agent | null = null;
    for (const ag of this.agents.values()) if (ag.bubT > 0 && ag.room === r.id) near = ag;
    this.unit.lookAt(near ? V(near.actor.x, near.actor.y + 1.5, near.actor.z) : null);
  }

  // ------------------------------------------------------------------ lines and bubbles
  private bubbleTick(ag: Agent, dt: number, cam: THREE.PerspectiveCamera) {
    ag.lineT -= dt;
    const visible = this.onScreen(ag, cam);
    if (ag.lineT <= 0 && !this.scripted) {
      ag.lineT = 18 + h1(this.t, CREW_IDS.indexOf(ag.id) + 11) * 30;
      const focusedHere = this.hub.focused ? this.hub.focused === ag.room : true;
      if (visible && focusedHere && this.lineGap <= 0 && ag.posture !== 'lie') {
        const st = crewState();
        const pool = st.mood < 0.6 && h1(this.t, 4) < 0.6 && Object.keys(st.dead).length ? ag.m.def.lines.grief : ag.m.def.lines.idle;
        this.say(ag.id, pool[Math.floor(h1(this.t, CREW_IDS.indexOf(ag.id) + 2) * pool.length)], { voice: false });
        this.lineGap = 7;
      }
    }
    if (ag.bubble) {
      ag.bubT = Math.max(0, ag.bubT - dt);
      if (ag.bubT <= 0) ag.bubble.hide();
      const hp = ag.m.rig.j.head.getWorldPosition(V()); hp.y += 0.32;
      const v = hp.clone().project(cam);
      const on = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      ag.bubble.update(dt, ((v.x + 1) / 2) * innerWidth, ((1 - v.y) / 2) * innerHeight, on);
    }
  }
  private onScreen(ag: Agent, cam: THREE.PerspectiveCamera) { const v = V(ag.actor.x, ag.actor.y + 1.5, ag.actor.z).project(cam); return v.z < 1 && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95; }
  /** a crew member says a line: a balloon over the head, the mouth moves, optionally a voice */
  say(id: CrewId, text: string, o: { voice?: boolean; dur?: number } = {}) {
    const ag = this.agents.get(id); if (!ag || ag.m.dead) return 0;
    if (!ag.bubble) ag.bubble = new SpeechBubble(this.bubbleRoot);
    ag.bubble.el.classList.toggle('keep', this.scripted);
    ag.bubble.show(text, ag.m.def.short);
    const d = ag.m.def;
    const sec = o.voice === false ? 0 : cspeak(text, d.voice, true);
    const dur = o.dur ?? Math.max(2.6, sec + 0.8, text.length * 0.06 + 1.4);
    ag.bubT = dur; ag.m.rig.say(Math.min(dur, Math.max(1.2, sec || text.length * 0.05)));
    return dur;
  }

  // ------------------------------------------------------------------ clicks
  private pickAt(e: PointerEvent): Agent | null {
    const cam = this.hub.camera, el = e.target as HTMLElement;
    if (!(el instanceof HTMLCanvasElement)) return null;
    const r = el.getBoundingClientRect();
    this.ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ptr, cam);
    const ps = [...this.agents.values()].filter((a) => !a.m.dead && a.m.rig.root.visible).map((a) => a.proxy);
    const hit = this.ray.intersectObjects(ps, false)[0];
    return hit ? this.agents.get(hit.object.userData.crewId as CrewId) ?? null : null;
  }
  private hover(e: PointerEvent) {
    if (this.scripted || document.body.classList.contains('cine-on')) return;
    const ag = this.pickAt(e);
    (e.target as HTMLElement).style.cursor = ag ? 'pointer' : '';
  }
  private click(e: PointerEvent) {
    if (this.scripted || e.button !== 0 || document.body.classList.contains('cine-on')) return;
    const ag = this.pickAt(e); if (!ag) return;
    e.stopImmediatePropagation(); e.preventDefault();
    this.react(ag.id);
  }
  /** the reaction to a click: stop, turn to UNIT 07, a line and a gesture */
  react(id: CrewId) {
    const ag = this.agents.get(id); if (!ag || ag.m.dead) return;
    const d = ag.m.def, st = crewState();
    const grief = Object.keys(st.dead).length > 0 && st.mood < 0.6 && h1(this.t, 1) < 0.5;
    const pool = grief ? d.lines.grief : d.lines.click;
    const line = pool[(ag.m.rig as unknown as { __ci?: number }).__ci = (((ag.m.rig as unknown as { __ci?: number }).__ci ?? Math.floor(h1(this.t) * pool.length)) + 1) % pool.length];
    const u = this.unit.pos.clone();
    if (u.distanceTo(V(ag.actor.x, 1.5, ag.actor.z)) > 7) u.copy(this.hub.camera.position);
    ag.hold = this.say(id, line) + 0.6; ag.holdLook = u.clone().setY(ag.actor.y + 1.5);
    if (ag.posture !== 'lie') {
      if (d.clickGesture === 'salute') ag.m.rig.playEmote('salute'); else ag.m.rig.gesture(d.clickGesture as never, d.clickGesture === 'point' ? { at: u } : {});
    }
    ag.m.rig.setExpression(grief ? 'sad' : d.id === 'kristiansen' ? 'neutral' : 'smile', 3);
    this.tag?.c.remove();
    const c = document.createElement('canvas'); c.style.cssText = 'position:fixed;z-index:4;pointer-events:none;image-rendering:pixelated'; this.bubbleRoot.appendChild(c);
    this.tag = { c, id, t: 0, boil: -1 };
    this.unit.lookAt(V(ag.actor.x, ag.actor.y + 1.55, ag.actor.z));
    if (this.unit.pos.distanceTo(V(ag.actor.x, 1.5, ag.actor.z)) > 3) this.unit.moveTo(V(ag.actor.x + 0.9, 1.55, ag.actor.z + 0.9), 3);
  }

  /** draw (and keep re-drawing a few times a second: the pen line boils) the clicked member's tag */
  private tagTick(dt: number, cam: THREE.PerspectiveCamera) {
    const T = this.tag; if (!T) return;
    T.t += dt;
    const ag = this.agents.get(T.id);
    if (!ag || T.t > 4.5 || this.scripted) { T.c.remove(); this.tag = null; return; }
    const hp = ag.m.rig.j.chest.getWorldPosition(V()).project(cam);
    const x = Math.round(((hp.x + 1) / 2) * innerWidth), y = Math.round(((1 - hp.y) / 2) * innerHeight);
    const boil = Math.floor(T.t * 4);
    if (T.boil < 0) {
      T.boil = 0;
      // the ID badge on a pen leader line that ends on the person
      const badge = idBadge(ag.m.def, crewState().mood);
      // beside the person at chest height (the speech callout keeps the space over the head)
      const bw = parseInt(badge.style.width), bh = parseInt(badge.style.height), W = bw + 120, H = bh + 24;
      const I = new Ink(W, H); I.seed = 2;
      I.leader([122, 24 + bh / 2], [10, 12], INK.light);
      I.g.save(); I.g.setTransform(1, 0, 0, 1, 0, 0); I.g.drawImage(badge, 118 * I.k, 24 * I.k); I.g.restore();
      T.c.width = I.c.width; T.c.height = I.c.height; T.c.style.width = W + 'px'; T.c.style.height = H + 'px';
      T.c.getContext('2d')!.drawImage(I.c, 0, 0);
    }
    void boil;
    T.c.style.left = (x - 10) + 'px'; T.c.style.top = (y - 12) + 'px';
  }

  // ------------------------------------------------------------------ deaths
  private onDeath(id: CrewId) {
    const ag = this.agents.get(id);
    if (ag) { ag.bubble?.dispose(); ag.m.dispose(); this.agents.delete(id); this.release(ag); }
    this.silence = 1;
    const mess = this.hub.room('mess'); if (mess) memorial(mess);
  }
  /** a crew member's live actor (the intro and the story drive them directly) */
  actor(id: CrewId) { return this.agents.get(id)?.actor ?? null; }
  model(id: CrewId) { return this.agents.get(id)?.m ?? null; }
  /** take a crew member out of the routine for a while (seconds; Infinity until resume) */
  hold(id: CrewId, sec = Infinity) { const ag = this.agents.get(id); if (ag) { ag.hold = sec; ag.path = []; } }
  resume(id?: CrewId) { for (const ag of this.agents.values()) if (!id || ag.id === id) { ag.hold = 0; ag.block = null; } }
  /** move an actor to a room at once (keeps routines off until resume) */
  put(id: CrewId, room: RoomId, x: number, z: number, yaw = 0, y = 0) {
    const ag = this.agents.get(id); if (!ag) return null;
    this.stand(ag); this.reparent(ag, room); ag.floorY = y; ag.actor.place(x, z, yaw); ag.path = [];
    return ag.actor;
  }
  dispose() {
    for (const f of this.off) f(); this.off = [];
    for (const ag of this.agents.values()) { ag.bubble?.dispose(); ag.m.dispose(); }
    this.agents.clear(); this.unit.dispose();
  }
}

/** which room a floor point is in (null in the corridor) */
export function roomOfPoint(hub: HubLike, x: number, z: number): RoomId | null {
  for (const id of ['bridge', 'lab', 'workshop', 'quarters', 'mess', 'medbay', 'engineering', 'cargo', 'core'] as RoomId[]) {
    const r = hub.room(id); if (!r) continue;
    const b = r.bounds; if (x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z) return id;
  }
  return null;
}
/** where the plaque hangs in the mess (on its full-height bow-side wall) */
export function memorialSpot(mess: HubRoomLike) { const b = mess.bounds; return { x: b.max.x - 1.6, y: 1.55, z: b.max.z - 0.07, f: Math.PI }; }

export async function testLife(engine: import('../../app/engine').Engine, P: URLSearchParams) {
  const { hubForTest } = await import('./stubHub');
  const { crew } = await import('./index');
  const hub = await hubForTest(engine, P);
  // the hub plugin brings the crew aboard on the real hub; the stand-in needs its own
  let life = crew.life(hub);
  for (let i = 0; i < 40 && !life && !hub.stub; i++) { await new Promise((r) => setTimeout(r, 250)); life = crew.life(hub); }
  if (!life) { life = new CrewLife(hub); crew._setLife(hub, life); }
  const h = Number(P.get('hour') ?? 12.3);
  life.hour = h; life.resume();
  for (const id of CREW_IDS) { const ag = life.agents.get(id); if (ag) { life.enter(ag, life.blockAt(id, h), true); } }
  (window as unknown as { __life: CrewLife }).__life = life;
}
