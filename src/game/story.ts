// Dr. Calder. The researcher from LIMBOPHOBIA (his rig, outfit, gestures and face are that project's
// Researcher) is the last of a xenobiology survey. He finds you, names you, teaches you, studies you, and is
// killed by the region's apex predator one night, leaving his camp behind.
import * as THREE from 'three';
import { Researcher, researcherOutfit, createResearcher, type ResearcherGesture } from '../limbo/entities/researcher';
import type { Appearance } from '../limbo/entities/humanRig';
import { worldMaterial } from '../limbo/gfx/materials';
import { registerAllTextures } from '../limbo/gfx/textures/index';
import { objDef, objectGeometry } from '../limbo/world/objects';
import '../limbo/content/textures/materials';
import '../limbo/content/furniture/b_survival';
import '../limbo/content/furniture/zw_annex';
import '../limbo/content/furniture/b_industrial';
import '../limbo/content/furniture/b_lab';
import type { Game } from './game';
import type { Creature } from './creature';
import { Dialog, type Line } from '../ui/dialog';
import { el, toast, iconImg } from '../ui/kit';
import { sfx } from '../audio/audio';
import { clamp, dampA, Rand } from '../core/rand';
import { GENE } from '../life/genes';
import { VEYR } from '../world/palette';
import { gbuf } from '../gfx/gbuf';

/** LIMBOPHOBIA's researcher is Dr. Ines Varga / Calder, a woman. The brief calls him "him": same rig, outfit,
 * gestures and face system, a man's appearance. Set true to use her original look instead. */
export const USE_ORIGINAL_LOOK = false;
const CALDER_APP = {
  skin: 0xd9a47c, hair: 0x3a2618, hairStyle: 'short', face: 2, build: 'average', height: 1.03, bodyShape: 0.1, eyeColor: 0x4a6a8a,
  facialHair: 'stubble', freckles: 0.04, scars: 1, age: 0.38, jaw: 2, eyeShape: 1, brows: 1, nose: 2, mouth: 1, ears: 1,
} as unknown as Appearance;

let texReady = false;
export function calderRig(): Researcher {
  if (!texReady) { registerAllTextures(); texReady = true; }
  if (USE_ORIGINAL_LOOK) return createResearcher({ glasses: true, name: 'Dr. Calder' });
  const r = new Researcher(CALDER_APP, worldMaterial({ noVis: true, noFog: true, noGrid: true }));
  (r as any).ggOverrides = { badge: { col: [52, 104, 150], name: 'Dr. Calder' }, glasses: { kind: 'rect', col: [58, 42, 38], thick: 1 } };
  r.setOutfit(researcherOutfit({ glasses: true, slacks: true, blouse: 0x9ab0c0 }));
  r.skin.castShadow = true;
  r.setExpression('smile');
  return r;
}

// ------------------------------------------------------------------ the man himself
class Calder {
  readonly rig: Researcher;
  x: number; z: number; y = 0; yaw = 0;
  path: number[] | null = null; pi = 0;
  speed = 0; run = false;
  dead = false;
  sit = false;
  look: THREE.Vector3 | null = null;
  constructor(readonly g: Game, x: number, z: number) {
    this.rig = calderRig();
    this.x = x; this.z = z;
    this.y = g.world.surfaceY(x, z);
    this.rig.ragWorld = { ground: (px, pz) => g.world.surfaceY(clamp(px, 0, g.region.N - 0.01), clamp(pz, 0, g.region.N - 0.01)) };
    g.world.scene.add(this.rig.root);
  }
  walkTo(tx: number, tz: number, run = false) {
    this.path = this.g.world.pather.find(this.x, this.z, tx, tz, { step: 0.95, swim: false, fly: false }, 8000) ?? [tx, tz];
    this.pi = 0; this.run = run; this.sit = false;
  }
  get moving() { return !!this.path; }
  update(dt: number, visible: boolean) {
    if (this.dead) { this.rig.update(dt, { speed: 0, ground: this.rig.ragWorld!.ground } as any); return; }
    let want = 0;
    if (this.path) {
      const px = this.path[this.pi], pz = this.path[this.pi + 1];
      const dx = px - this.x, dz = pz - this.z, d = Math.hypot(dx, dz);
      if (d < 0.35) { this.pi += 2; if (this.pi >= this.path.length) { this.path = null; } }
      else { want = this.run ? 3.6 : 1.35; this.yaw = dampA(this.yaw, Math.atan2(dx, dz), 8, dt); const s = Math.min(d, want * dt); this.x += (dx / d) * s; this.z += (dz / d) * s; }
    } else if (this.look) this.yaw = dampA(this.yaw, Math.atan2(this.look.x - this.x, this.look.z - this.z), 3, dt);
    this.speed += (want - this.speed) * Math.min(1, dt * 6);
    this.y += (this.g.world.surfaceY(this.x, this.z) - this.y) * Math.min(1, dt * 10);
    const r = this.rig;
    r.root.position.set(this.x, this.y, this.z);
    r.root.rotation.y = this.yaw;
    r.root.visible = visible;
    r.lookAt(this.look);
    r.update(dt, { speed: this.speed, stance: 'stand', full: this.sit ? 'sit' : 'none', fidget: this.speed < 0.1, wx: this.x, wy: this.y, wz: this.z, wyaw: this.yaw, ground: r.ragWorld!.ground, panic: this.run ? 0.8 : 0 } as any);
  }
  gesture(g: ResearcherGesture, hold = false) { if (!this.dead) this.rig.gesture(g, { hold }); }
  die(from: THREE.Vector3) {
    this.dead = true; this.path = null;
    const imp = new THREE.Vector3(this.x - from.x, 0.6, this.z - from.z).normalize().multiplyScalar(5);
    this.rig.startRagdoll(new THREE.Vector3(imp.x * 0.6, 1.5, imp.z * 0.6), imp, 'torso_u');
    this.rig.setExpression('pain', 99);
  }
}

// ------------------------------------------------------------------ objectives
interface Obj { id: string; text: string; done: boolean; opt?: boolean }

export class Story {
  calder: Calder | null = null;
  readonly dialog: Dialog;
  private portraitRig: Researcher;
  camp: { x: number; z: number; meshes: THREE.Object3D[]; fire: THREE.PointLight | null } = { x: 0, z: 0, meshes: [], fire: null };
  step = 'arrive';
  private t = 0; private stepT = 0;
  objectives: Obj[] = [];
  friendship = 0;
  private seen = new Set<string>();
  private beast: Creature | null = null;
  private campTaken = false; private bodyTaken = false;
  private ambientT = 40;
  private r = new Rand(7);
  constructor(readonly g: Game) {
    this.portraitRig = calderRig();
    const self = this;
    this.dialog = new Dialog(g.hud.dialog, g.engine.renderer, {
      root: this.portraitRig.root,
      update(dt) { self.portraitRig.update(dt, { speed: 0, stance: 'stand', fidget: true } as any); },
      say(sec, expr) { self.portraitRig.say(sec, expr); if (sec > 2) self.portraitRig.gesture('talk', { dur: Math.min(3, sec) }); },
      head(out) { const h = self.portraitRig.bones?.head ?? (self.portraitRig as any).j?.head; if (h) return h.getWorldPosition(out); return out.set(0, 1.65, 0); },
    });
    this.dialog.onLine = (l) => { if (this.calder && !this.calder.dead && l.who !== 'journal' && l.who !== 'radio') { this.calder.rig.say(3, l.expr); } };
    this.placeCamp();
    this.calder = new Calder(g, this.camp.x + 1.2, this.camp.z + 1.6);
    this.calder.sit = true;
    this.calder.look = new THREE.Vector3(g.veyr.core!.x, g.veyr.core!.y + 1, g.veyr.core!.z);
    // events
    g.on('harvest', (d: any) => this.onHarvest(d.sp.name, d.chosen));
    g.on('design', (sp: any) => this.react('design', [`A ${sp.name}. You built that out of what you ate.`, 'Each one a little less like what you swallowed. More like you.', 'You named it. Or I did, in my head. Same thing.']));
    g.on('built', (b: any) => { if (b.def.kind === 'tap') this.complete('tap'); if (b.def.kind === 'brood') this.complete('brood'); this.react('built:' + b.def.kind, BUILT[b.def.kind] ?? ['Something else grew today.']); });
    g.on('birth', (c: any) => { if (c.faction === 'veyr') { this.complete('spawn'); this.react('birth', ['It just... stepped out of the sac. Wet and walking.', 'Another one. They look at me the way you do.']); } });
    g.on('ability', (d: any) => { if (d.a === 'pulse' && d.ok) this.complete('pulse'); });
    g.on('em', (lv: number) => this.react('em' + lv, [`My compass is pointing at you now. All of them. Every needle in camp.`, 'The air hums. My teeth ache when I stand near the core.', 'I can feel your field on my skin from the camp.']));
  }

  // ------------------------------------------------------------------ camp
  private placeCamp() {
    const g = this.g, R = g.region, L = R.landing, r = new Rand(g.region.seed ^ 0xca1);
    let best: [number, number] = [L.x + 24, L.z], bs = -1e9;
    for (let t = 0; t < 300; t++) {
      const a = r.range(0, Math.PI * 2), d = r.range(23, 30);
      const x = L.x + Math.cos(a) * d, z = L.z + Math.sin(a) * d;
      if (x < 8 || z < 8 || x > R.N - 8 || z > R.N - 8) continue;
      let lo = 1e9, hi = -1e9, wet = 0;
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) { const h = R.heightAt(x + dx, z + dz); lo = Math.min(lo, h); hi = Math.max(hi, h); if (h < R.water + 0.4) wet++; }
      const s = -(hi - lo) * 4 - wet * 3;
      if (s > bs) { bs = s; best = [x, z]; }
    }
    // flatten the camp ground a little
    const [cx, cz] = best;
    const h0 = Math.round(R.heightAt(cx, cz) * 2) / 2;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const X = Math.floor(cx) + dx, Z = Math.floor(cz) + dz; if (!R.inside(X, Z)) continue;
      const i = Z * R.N + X; if (Math.abs(R.h[i] - h0) <= 1) { R.h[i] = h0; R.dirty.add(i); }
    }
    g.world.terrain.flushDirty();
    this.camp.x = cx + 0.5; this.camp.z = cz + 0.5;
    const toCore = Math.atan2(L.x - this.camp.x, L.z - this.camp.z);
    const place = (key: string, ox: number, oz: number, rot: number) => {
      const d = objDef(key); if (!d) return;
      const geo = objectGeometry(d, { uid: 0, key, x: 0, y: 0, rot: 0, state: {} } as any); if (!geo) return;
      const m = new THREE.Mesh(geo, worldMaterial({ noVis: true, noFog: true, noGrid: true }));
      const c = Math.cos(toCore), s = Math.sin(toCore);
      const x = this.camp.x + ox * c + oz * s, z = this.camp.z - ox * s + oz * c;
      m.position.set(x, g.world.surfaceY(x, z), z);
      m.rotation.y = toCore + rot;
      m.castShadow = true; m.receiveShadow = true;
      g.world.scene.add(m); this.camp.meshes.push(m);
    };
    place('campfire_unlit', 0, 0, 0);
    place('tent', -2.6, -1.8, 0.4);
    place('zw_field_table', 2.4, -1.2, -0.3);
    place('zw_hard_case', 1.6, 1.2, 0.8);
    place('zw_hard_case', 2.6, 0.6, -0.4);
    place('zw_floodlight', -1.4, 2.0, Math.PI);
    place('zw_camcorder', 0.6, 2.6, 0);
    place('zw_cot', -3.4, 1.0, 1.2);
    place('crate_built', 3.4, -0.2, 0.2);
    place('bedroll', -1.8, -3.6, 0.1);
    const fire = new THREE.PointLight(0xffa050, 3, 9, 1.6);
    fire.position.set(this.camp.x, g.world.surfaceY(this.camp.x, this.camp.z) + 0.6, this.camp.z);
    g.world.scene.add(fire); this.camp.fire = fire;
  }
  private campVisible() { return this.g.vision.visibleAt(this.camp.x, this.camp.z); }

  // ------------------------------------------------------------------ objectives
  private obj(id: string, text: string, opt = false) { if (!this.objectives.some((o) => o.id === id)) { this.objectives.push({ id, text, done: false, opt }); this.renderObjectives(); sfx('open', 1, 0.5); } }
  complete(id: string) { const o = this.objectives.find((x) => x.id === id && !x.done); if (o) { o.done = true; this.renderObjectives(); sfx('done'); } }
  private renderObjectives() {
    const box = this.g.hud.objectives;
    box.style.display = this.objectives.length ? '' : 'none';
    box.innerHTML = '';
    el('h4', '', box, 'FIELD NOTES');
    for (const o of this.objectives.slice(-6)) {
      const r = el('div', 'ob' + (o.done ? ' done' : ''), box);
      iconImg(o.done ? 'helix' : o.opt ? 'skull' : 'move', 'oi', r).style.cssText = 'width:14px;height:14px;flex:none';
      el('span', '', r, o.text);
    }
  }
  private isDone(id: string) { return !!this.objectives.find((o) => o.id === id)?.done; }
  say(lines: (string | Line)[]) { this.dialog.say(lines.map((l) => (typeof l === 'string' ? { text: l } : l))); }
  private react(key: string, pool: string[]) {
    if (this.seen.has(key) || !this.calder || this.calder.dead) return;
    this.seen.add(key);
    this.friendship++;
    this.say([this.r.pick(pool)]);
  }
  private onHarvest(name: string, chosen: string[]) {
    this.complete('absorb');
    if (!this.calder || this.calder.dead) return;
    if (!this.seen.has('first-harvest')) {
      this.seen.add('first-harvest');
      const g = chosen[0] ? GENE[chosen[0]] : null;
      this.say([{ text: `It took the ${name} apart. Not eating. Reading.`, expr: 'surprised' }, g ? `You kept the ${g.name.toLowerCase()}. Interesting choice.` : 'You let it all go. Picky.']);
      return;
    }
    if (chosen.some((c) => GENE[c]?.cat === 'body')) this.react('body:' + chosen.find((c) => GENE[c]?.cat === 'body'), [`A whole new body plan. You could build anything with that.`, 'That one changes everything about what you can make.']);
  }

  // ------------------------------------------------------------------ the arc
  update(dt: number, real: number) {
    const g = this.g, c = this.calder;
    this.t += dt; this.stepT += dt;
    this.dialog.update(real);
    if (this.camp.fire) {
      this.camp.fire.intensity = (g.world.day > 0.7 || g.world.day < 0.25 ? 4 : 1.5) * (0.85 + Math.sin(this.t * 13) * 0.08 + Math.sin(this.t * 7) * 0.07);
      // flames: rising embers and tongues of light over the pit
      if (g.vision.visibleAt(this.camp.x, this.camp.z) && Math.random() < real * 30) {
        const fy = this.camp.fire.position.y - 0.45;
        const hot = Math.random() < 0.6;
        g.fx.glow.emit(this.camp.x + (Math.random() - 0.5) * 0.3, fy, this.camp.z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 0.9 + Math.random() * 0.8, (Math.random() - 0.5) * 0.3,
          new THREE.Color(hot ? 0xffa030 : 0xff5a20).multiplyScalar(2.4), 1, hot ? 3 : 2, 0.5 + Math.random() * 0.4, -0.4, 1.2);
      }
    }
    if (c) {
      const vis = g.vision.visibleAt(c.x, c.z) || (c.dead && g.vision.seen[Math.floor(c.z) * g.region.N + Math.floor(c.x)] > 0);
      c.update(dt, vis || this.step === 'arrive');
      // the Veyr senses him: he reveals a little around himself
      g.vision.extra = c.dead ? [] : [[c.x, c.z, 5]];
    }
    for (const m of this.camp.meshes) m.visible = g.vision.seen[Math.floor(this.camp.z) * g.region.N + Math.floor(this.camp.x)] > 0 || this.stepT < 0;
    if (!c) return;
    const core = g.veyr.core!;
    switch (this.step) {
      case 'arrive':
        if (this.t > 10) {
          const a = Math.atan2(c.x - core.x, c.z - core.z);
          c.walkTo(core.x + Math.sin(a) * 9, core.z + Math.cos(a) * 9);
          this.go('approach');
        }
        break;
      case 'approach':
        if (!c.moving) {
          c.look = new THREE.Vector3(core.x, core.y + 1.5, core.z);
          c.gesture('think');
          this.say([
            { text: 'Easy. Easy now. I\'m not going to hurt you.', expr: 'surprised' },
            'I watched you come down three nights ago. You burned green the whole way.',
            'Dr. Calder. Xenobiology survey, Station Four. The last one left, apparently.',
            { text: 'And you... you hatched. Look at you. You\'re so... round.', expr: 'surprised' },
            { text: 'Are you floating? You\'re floating. Your own field is holding you up.', expr: 'surprised' },
            { text: 'Silicon, not carbon, if my scanner\'s right. Hello, little one.', expr: 'smile' },
            { text: 'I\'m going to call you Veyr. It\'s what my grandmother called the green fire on the marsh.', expr: 'smile', onShow: () => c.gesture('present') },
          ]);
          this.go('t-spread');
        }
        break;
      case 't-spread':
        if (!this.dialog.busy) {
          this.say([{ text: 'Your moss is spreading. It wants the grass. Push it outward. [G] lets you direct it.', onShow: () => c.gesture('point') }]);
          this.obj('spread', 'Spread your moss (paint growth with G)');
          this.go('w-spread');
        }
        break;
      case 'w-spread':
        if (g.veyr.cells > 420) { this.complete('spread'); this.go('t-snare'); }
        break;
      case 't-snare':
        this.say([{ text: 'Those little crawlers keep stumbling onto your patch.', onShow: () => c.gesture('point') }, 'I wonder. Can you catch one? [1], then the creature. Time it.']);
        this.obj('snare', 'Seize a creature on your moss (1)');
        this.obj('absorb', 'Digest it and absorb its DNA');
        this.go('w-snare');
        break;
      case 'w-snare':
        if (g.run.absorbed > 0) { this.complete('snare'); this.complete('absorb'); this.go('t-tap'); }
        break;
      case 't-tap':
        if (this.dialog.busy) break;
        this.say([{ text: 'My compass spins near those dark seams. Iron. Your field is pulling at it.', onShow: () => c.gesture('clipboard') }, 'If you could reach into it... [B], then a Root Tap on the seam.']);
        this.obj('tap', 'Grow a Root Tap on a ferrite seam');
        this.go('w-tap');
        break;
      case 'w-tap':
        if (this.isDone('tap')) this.go('t-design');
        if (this.stepT > 30 && !this.seen.has('gift')) this.gift();
        break;
      case 't-design': {
        const has = (cat: string) => [...g.run.genes.keys()].some((k) => GENE[k]?.cat === cat);
        if (this.dialog.busy) break;
        if (has('body') && has('feed') && has('repro')) {
          this.say([{ text: 'You have enough of a blueprint now. Could you... make one? [C] opens it.', expr: 'surprised' }, 'Then a womb to grow it in. [B].']);
          this.obj('design', 'Design a species in the Gene Forge (C)');
          this.obj('brood', 'Grow a Brood Womb');
          this.obj('spawn', 'Gestate your first creature');
          this.go('w-design');
        } else if (this.stepT > 4 && !this.seen.has('need-genes')) {
          this.seen.add('need-genes');
          this.say(['To build a body you\'ll need more than legs. Something to eat with, a way to breed. Keep feeding.']);
          this.obj('genes', 'Absorb feeding and reproduction genes');
        }
        if (has('body') && has('feed') && has('repro')) this.complete('genes');
        break;
      }
      case 'w-design':
        if (g.run.reg.list.some((s) => s.owner === 'veyr')) this.complete('design');
        if (this.isDone('spawn')) this.go('t-pulse');
        if (this.stepT > 50 && !this.seen.has('gift')) this.gift();
        break;
      case 't-pulse':
        this.say([{ text: 'The needle won\'t settle anymore. Your field is strong enough to push with.', onShow: () => c.gesture('present') }, 'Try it on something that bothers you. [2].']);
        this.obj('pulse', 'Discharge an EM pulse (2)');
        this.go('w-pulse');
        break;
      case 'w-pulse':
        if (this.isDone('pulse') || this.stepT > 70) this.go('bond');
        break;
      case 'bond':
        if (this.dialog.busy) break;
        this.say([{ text: 'Day nine. It knows me now. The moss parts where I walk.', who: 'journal' }, { text: 'I set the camera up facing you. For the record. In case nobody ever believes me.', expr: 'smile' }]);
        this.obj('dominion', 'Take the region: 60% dominion');
        this.go('w-night');
        break;
      case 'w-night': {
        const night = g.world.day > 0.78 || g.world.day < 0.18;
        if (this.stepT > 70 && night && this.findBeast()) this.go('beast');
        else if (this.stepT > 70 && !night) g.world.day = Math.min(0.99, g.world.day + dt * 0.004);
        break;
      }
      case 'beast': this.beastBeat(dt); break;
      case 'after': this.afterBeat(); break;
    }
    // ambient companionship
    if (!c.dead && !this.dialog.busy && ['w-spread', 'w-snare', 'w-tap', 'w-design', 'w-pulse', 'w-night'].includes(this.step)) {
      this.ambientT -= dt;
      if (this.ambientT <= 0) { this.ambientT = 55 + this.r.range(0, 40); this.ambient(); }
    }
  }
  private go(s: string) { this.step = s; this.stepT = 0; }

  private ambient() {
    const c = this.calder!, g = this.g;
    const night = g.world.day > 0.75 || g.world.day < 0.2;
    const k = this.r.int(0, 3);
    if (night && k < 2) {
      c.walkTo(this.camp.x + 1.2, this.camp.z + 1.6); c.sit = false;
      setTimeout(() => { if (!c.dead) c.sit = true; }, 9000);
      this.say([{ text: this.r.pick(JOURNAL), who: 'journal' }]);
      return;
    }
    // wander to the moss edge and take notes
    const core = g.veyr.core!;
    const a = this.r.range(0, Math.PI * 2), d = 10 + g.veyr.emLevel * 3;
    c.walkTo(clamp(core.x + Math.cos(a) * d, 4, g.region.N - 4), clamp(core.z + Math.sin(a) * d, 4, g.region.N - 4));
    c.look = new THREE.Vector3(core.x, core.y + 1, core.z);
    setTimeout(() => { if (!c.dead) c.gesture('clipboard'); }, 7000);
    this.say([this.r.pick(MUSINGS)]);
  }

  /** he drags a dead animal to the edge of your moss */
  private gift() {
    this.seen.add('gift');
    const g = this.g, c = this.calder!;
    const small = g.world.creatures.filter((x) => !x.dead && x.faction === 'wild' && x.mass < 25 && x.mass > 1);
    const pick = small[Math.floor(Math.random() * small.length)];
    if (!pick) return;
    const ng = g.veyr.nearestGrowth(c.x, c.z, 30); if (!ng) return;
    pick.x = ng[0] + 0.5; pick.z = ng[1] + 0.5; pick.y = g.world.surfaceY(pick.x, pick.z);
    g.world.kill(pick, null);
    c.walkTo(ng[0] + 1.5, ng[1] + 1);
    this.say([{ text: 'Found this one by the stream. Already dead, I promise. Thought you might want it.', expr: 'smile' }]);
    this.friendship += 2;
  }

  // ------------------------------------------------------------------ the beast
  private findBeast(): Creature | null {
    const g = this.g;
    this.beast = g.world.creatures.filter((x) => !x.dead && x.faction === 'wild' && x.boss)[0] ?? g.world.creatures.filter((x) => !x.dead && x.faction === 'wild' && x.diet === 'carn').sort((a, b) => b.mass - a.mass)[0] ?? null;
    return this.beast;
  }
  private beastPhase = 0;
  private beastBeat(dt: number) {
    const g = this.g, c = this.calder!, b = this.beast;
    if (!b || b.dead) { this.go('w-night'); return; }
    if (this.beastPhase === 0) {
      // he is at camp; the beast comes out of the dark on the far side
      c.walkTo(this.camp.x + 1.2, this.camp.z + 1.6); c.sit = false;
      const away = Math.atan2(this.camp.x - g.veyr.core!.x, this.camp.z - g.veyr.core!.z);
      b.x = clamp(this.camp.x + Math.sin(away) * 20, 3, g.region.N - 3); b.z = clamp(this.camp.z + Math.cos(away) * 20, 3, g.region.N - 3);
      b.y = g.world.surfaceY(b.x, b.z);
      b.order = { kind: 'move', x: this.camp.x, z: this.camp.z }; b.mind = 'order'; b.path = null;
      this.say([{ text: '...Do you hear that?', expr: 'surprised' }, { text: 'Something big. Out past the reeds.', expr: 'surprised' }]);
      sfx('roar', 1, 0.6);
      this.beastPhase = 1; this.stepT = 0;
      g.vision.extra.push([this.camp.x, this.camp.z, 12]);
      g.cam.lookAt(this.camp.x, this.camp.z); g.cam.distGoal = 26;
      toast('Something is hunting near Calder\'s camp', 'warn', 5000);
      return;
    }
    // fury: the beast shrugs off almost everything until it has him
    b.hp = Math.max(b.hp, b.maxHp * 0.7); b.stunT = 0;
    const d = Math.hypot(b.x - c.x, b.z - c.z);
    if (this.beastPhase === 1 && (d < 13 || this.stepT > 9)) {
      this.beastPhase = 2;
      const core = g.veyr.core!;
      const ng = g.veyr.nearestGrowth(c.x, c.z, 40) ?? [core.x, core.z];
      c.walkTo(ng[0], ng[1], true);
      this.say([{ text: 'Oh no. No no no—', expr: 'surprised' }, { text: 'Veyr! VEYR!', expr: 'surprised' }]);
      sfx('roar');
    }
    if (this.beastPhase >= 2) {
      b.order = { kind: 'move', x: c.x, z: c.z }; b.mind = 'order';
      if (this.beastPhase === 2 && d < 1.6 + b.radius) {
        this.beastPhase = 3;
        b.atkAnim = 0; b.atkT = 2;
        c.die(new THREE.Vector3(b.x, b.y, b.z));
        g.cam.shake(0.8, 0.6); sfx('roar', 1, 1); sfx('death', 1.2, 1);
        g.fx.burst(c.x, c.y + 1.1, c.z, 30, 0xa82a2a, { speed: 3, up: 3, size: 3, life: 1 });
        this.dialog.clear();
        this.say([{ text: '...Veyr...', expr: 'pain' }, { text: 'Station Four, this is Calder, do you copy— ...', who: 'radio' }]);
        this.stepT = 0;
      }
    }
    if (this.beastPhase === 3 && this.stepT > 5) {
      b.order = null; b.mind = 'wander'; b.goalX = clamp(b.x + 18, 3, g.region.N - 3); b.goalZ = b.z;
      for (const o of this.objectives) if (!o.done && o.id !== 'dominion') o.done = true;
      this.obj('avenge', 'Kill the beast that killed him', true);
      this.obj('camp', 'Grow your moss over his camp', true);
      this.renderObjectives();
      g.vision.extra = [];
      this.go('after');
    }
    void dt;
  }
  private afterBeat() {
    const g = this.g, c = this.calder!;
    if (this.beast?.dead) this.complete('avenge');
    if (!this.campTaken && g.veyr.covAt(this.camp.x, this.camp.z) > 0.6) {
      this.campTaken = true; this.complete('camp');
      g.run.flags.calderNotes = 1;
      g.veyr.absorbCap += 1;
      this.say([
        { text: 'Final entry. If anyone finds this: it isn\'t a monster. It\'s a child. It learns. It chose to let me live.', who: 'journal' },
        { text: 'Take care of it. Or let it take care of itself. It will anyway.', who: 'journal' },
      ]);
      toast('Calder\'s notes absorbed: you can take one more gene from every genome', 'story', 7000);
      g.vision.revealAll = false;
    }
    if (!this.bodyTaken && c.dead && g.veyr.covAt(c.x, c.z) > 0.6) {
      this.bodyTaken = true;
      g.chooseCalder?.((absorb: boolean) => {
        if (absorb) { for (const id of ['hominid_frame', 'hands', 'hominid_eyes', 'omni_teeth']) g.run.add(id, 'Dr. Calder', g.world.time); toast('You take what he was. Upright. Curious. Yours.', 'story', 6000); }
        else { g.run.flags.memorial = 1; g.veyr.res.helix += 8; toast('The moss grows a pale flower where he lies. It never closes.', 'story', 6000); }
        c.rig.root.visible = !absorb;
        if (absorb) g.fx.burst(c.x, c.y + 0.5, c.z, 40, VEYR.vein, { glow: true, up: 3, speed: 2, size: 3, life: 1.2 });
        else this.memorial(c.x, c.z);
      });
    }
  }
  private memorial(x: number, z: number) {
    const g = this.g;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 0.3), gbuf(new THREE.MeshLambertMaterial({ color: 0xf4f0e8, emissive: 0x4a6a60 }), 1 + 32));
    m.position.set(x, g.world.surfaceY(x, z) + 0.45, z);
    g.world.scene.add(m);
  }
}

const BUILT: Record<string, string[]> = {
  tap: ['It\'s drinking the iron straight out of the ground.'], brood: ['A womb. You grew a womb.'], spire: ['A nerve, standing up out of the moss. The hum follows it.'],
  maw: ['That pit has teeth. I\'ll walk around it.'], vault: ['A spiral of bone. It looks like the diagrams in my old textbooks.'], thorn: ['Note to self: do not touch the thorny one.'],
  coil: ['Lightning rod or weapon. Both.'], lure: ['It smells like honey and something dead.'], spore: ['Is that... for leaving? You want to go further?'],
};
const MUSINGS = [
  'You don\'t eat the plants so much as fold them into yourself.', 'The insects avoid your edge now. They\'re learning faster than I am.',
  'Every cell of that moss is the same organism. Every one. A single body the size of a village.', 'I\'ve stopped writing "it". I\'ve started writing "you".',
  'Your veins pulse toward the core. Like blood going home.', 'There are bigger things in the hills. I hear them at night. Be careful.',
];
const JOURNAL = [
  'Day six. Rations low. Radio silent. I talk to the rock now. It listens better than Station Four.', 'It glows brighter at night. I think it\'s dreaming.',
  'I dreamed I was moss. I wasn\'t afraid.', 'Something circles the camp after dark. Big. Patient.',
];
