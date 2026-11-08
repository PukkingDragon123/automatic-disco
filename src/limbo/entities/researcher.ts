// The Meridian researcher who guides the debtor through the menus: a HumanRig (the low-poly people model) of an
// adult woman scientist in a lab coat over a blouse and a knee-length skirt, an ID badge on a lanyard, styled hair,
// optional glasses, with natural secondary motion (hair, coat hem, lanyard and a subtle soft bounce, all on spring
// bones driven by HumanRig) and a few expressive gestures layered over the idle animation, plus the painted face's
// expressions and talking mouth.
//
//   const r = createResearcher({ glasses: true });   scene.add(r.root);
//   r.update(dt);                                     // every frame (idle, blinks, gestures, springs)
//   r.gesture('wave'); r.gesture('point', { at: worldPos }); r.gesture('clipboard', { hold: true }); r.gesture('nod');
//   r.say(2.5, 'smile'); r.setExpression('surprised', 1.5); r.lookAt(camera.position);
// Light it like createPreviewRig (any three.js lights; it ignores the zone light grid and fog).
import * as THREE from 'three';
import { HumanRig, type Appearance, type Outfit, type Pose } from './humanRig';
import type { AnimInput } from './humanAnim';
import { worldMaterial } from '../gfx/materials';
import { ModelBuilder } from '../gfx/modelBuilder';

export type ResearcherGesture = 'wave' | 'point' | 'clipboard' | 'nod' | 'talk' | 'present' | 'think' | 'shrug';
export const RESEARCHER_GESTURES: ResearcherGesture[] = ['wave', 'point', 'clipboard', 'nod', 'talk', 'present', 'think', 'shrug'];
const DUR: Record<ResearcherGesture, number> = { wave: 2.4, point: 2.6, clipboard: 4, nod: 1.3, talk: 2.6, present: 2.4, think: 3.2, shrug: 1.7 };
const EXPR: Partial<Record<ResearcherGesture, string>> = { wave: 'smile', nod: 'smile', present: 'smile', think: 'think', shrug: 'surprised', point: 'smile' };

export interface ResearcherOpts {
  /** thin reading glasses */
  glasses?: boolean;
  /** 'ponytail' (default), 'bun', 'long', 'bob' */
  hair?: string;
  hairColor?: number; skin?: number; eyeColor?: number;
  /** blouse / skirt colours, slacks instead of the skirt */
  blouse?: number; skirt?: number; slacks?: boolean;
  /** her name on the badge (painted as lines; kept for callers) */
  name?: string;
  /** black silhouette hull for scenes without their own outline pass (default false) */
  outline?: number | false;
}

interface G { name: ResearcherGesture; t: number; dur: number; w: number; v: number; out: boolean; dir?: number[]; at?: THREE.Vector3 | null }
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3();
const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3();
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

let clipGeo: THREE.BufferGeometry | null = null;
/** a clipboard: hardboard with a steel clip and a sheet of notes (faceted, chamfered) */
function clipboardGeo(): THREE.BufferGeometry {
  if (clipGeo) return clipGeo;
  const mb = new ModelBuilder();
  mb.box(0, -0.15, 0, 0.012, 0.3, 0.22, 'wood_light', { color: 0x8a6a48 });
  mb.box(0.007, -0.14, 0, 0.004, 0.27, 0.2, 'paper', { color: 0xf2eee2 });
  mb.box(0.006, -0.03, 0, 0.016, 0.03, 0.08, 'metal_grey', { color: 0xb8bcc0 });
  clipGeo = mb.build();
  return clipGeo;
}

/** The researcher: a HumanRig with gestures, look-at and talking on top of the idle animation. */
export class Researcher extends HumanRig {
  private gs: G[] = [];
  private look: THREE.Vector3 | null = null;
  private lk = [0, 0]; private lkV = [0, 0];
  private clip: THREE.Mesh;
  private clipW = 0;
  private tt = 0;

  constructor(app: Appearance, material?: THREE.Material) {
    super(app, material, { secondary: true, hd: true });
    this.clip = new THREE.Mesh(clipboardGeo(), material ?? worldMaterial({ noVis: true, noFog: true, noGrid: true }));
    this.clip.castShadow = true; this.clip.name = 'cosmetic:clipboard';
    this.clip.visible = false;
    this.heldL.add(this.clip);
    // lying along the forearm, face up toward her (the hand's z points up when the forearm is level)
    this.clip.position.set(0, 0.13 * this.s, 0.03 * this.s);
    this.clip.rotation.set(0.35, -Math.PI / 2, 0, 'YXZ');
  }

  /** Start a gesture. opts: dur (s), hold (until clearGesture), dir (rig-local [x, y, z] for point / present), at (a world point to point at). */
  gesture(name: ResearcherGesture, opts: { dur?: number; hold?: boolean; dir?: number[]; at?: THREE.Vector3 } = {}) {
    if (!DUR[name]) return;
    for (const g of this.gs) g.out = true;
    const dur = opts.hold ? Infinity : opts.dur ?? DUR[name];
    this.gs.push({ name, t: 0, dur, w: 0, v: 0, out: false, dir: opts.dir, at: opts.at ?? null });
    const ex = EXPR[name];
    if (ex) this.setExpression(ex, Math.min(dur, 2.5));
  }
  /** fade out the current gesture */
  clearGesture() { for (const g of this.gs) g.out = true; }
  /** the gesture playing (null when idle) */
  get currentGesture(): ResearcherGesture | null { const g = this.gs.find((x) => !x.out); return g ? g.name : null; }
  /** talk for sec seconds, optionally with an expression; a few hand movements come with longer lines */
  say(sec: number, expr?: string) {
    this.talk(sec);
    if (expr) this.setExpression(expr, sec);
    if (sec > 1.6 && !this.currentGesture) this.gesture('talk', { dur: Math.min(sec, 3.5) });
  }
  /** head and eyes follow a world point (null: look ahead, glancing about) */
  lookAt(p: THREE.Vector3 | null) { this.look = p ? p.clone() : null; }

  update(dt: number, input?: Partial<AnimInput> | Pose) {
    const pose = super.update(dt, input ?? { fidget: true } as Partial<AnimInput>);
    this.tt += dt;
    this.layer(dt);
    return pose;
  }

  /** gestures and look-at over the animated pose */
  private layer(dt: number) {
    const j = this.j;
    // ---- look-at: yaw / pitch of the target from the chest, shared by neck and head
    let ly = Math.sin(this.tt * 0.37) * 0.12, lp = Math.sin(this.tt * 0.23) * 0.04;
    if (this.look) {
      this.root.updateMatrixWorld(true);
      _v.copy(this.look); this.root.worldToLocal(_v);
      const hy = this.dims.rest.head[1];
      ly = clamp(Math.atan2(_v.x, _v.z), -1.1, 1.1); lp = clamp(Math.atan2(_v.y - hy, Math.hypot(_v.x, _v.z)), -0.5, 0.4);
    }
    for (let i = 0; i < 2; i++) { this.lkV[i] += (((i ? lp : ly) - this.lk[i]) * 40 - this.lkV[i] * 11) * dt; this.lk[i] += this.lkV[i] * dt; }
    addQ(j.neck, [-this.lk[1] * 0.35, this.lk[0] * 0.35, 0], 1);
    addQ(j.head, [-this.lk[1] * 0.6, this.lk[0] * 0.55, 0], 1);
    this.lookEyes(clamp((ly - this.lk[0]) * 4, -2, 2), clamp(-(lp - this.lk[1]) * 3, -1, 1.5));
    // ---- gestures (spring weights; finished ones fade out)
    let clip = 0;
    for (let i = this.gs.length - 1; i >= 0; i--) {
      const g = this.gs[i];
      g.t += dt;
      if (g.t > g.dur) g.out = true;
      g.v += (((g.out ? 0 : 1) - g.w) * 90 - g.v * 19) * dt; g.w = clamp(g.w + g.v * dt, 0, 1);
      if (g.out && g.w < 0.01 && g.v <= 0.05) { this.gs.splice(i, 1); continue; }
      const w = smooth(g.w);
      if (g.name === 'clipboard') clip = Math.max(clip, w);
      this.pose1(g, w);
    }
    this.clipW = clip;
    this.clip.visible = clip > 0.35;
  }

  /** one gesture's arm targets (chest space, relative to the shoulder) and head / chest accents */
  private pose1(g: G, w: number) {
    const s = this.s, t = g.t, j = this.j;
    const shR = j.uarmR.position, shL = j.uarmL.position;
    const arm = (side: 'L' | 'R', x: number, y: number, z: number, pole: number[], hand: number[]) => {
      const sh = side === 'R' ? shR : shL;
      this.armIK(side, [sh.x + x * s, sh.y + y * s, sh.z + z * s], pole, hand, w);
    };
    switch (g.name) {
      case 'wave': {
        const a = Math.sin(t * 9);
        arm('R', -0.12 - a * 0.04, 0.24, 0.1, [-1, -1.1, -0.4], [0.15, -0.3, -0.25 + a * 0.45]);
        addQ(j.head, [0, -0.1, 0.08], w); addQ(j.chest, [0, 0, 0.05], w);
        this.fingers('R', 0, w);
        break;
      }
      case 'point': case 'present': {
        let d = g.dir ?? (g.name === 'present' ? [-0.75, -0.05, 0.6] : [-0.35, 0.15, 1]);
        if (g.at) { this.root.updateMatrixWorld(true); _v.copy(g.at); j.chest.worldToLocal(_v); _v.sub(shR); d = [_v.x, _v.y, _v.z]; }
        const n = Math.hypot(d[0], d[1], d[2]) || 1, reach = 0.5;
        const k = g.name === 'present' ? 0.82 : 0.97;
        this.armIK('R', [shR.x + d[0] / n * reach * k * s, shR.y + d[1] / n * reach * k * s, shR.z + d[2] / n * reach * k * s], [-0.6, -1, -0.2], g.name === 'present' ? [0, -0.6, -0.5] : [0, -0.3, 0], w);
        addQ(j.chest, [0, Math.atan2(d[0], d[2]) * 0.2, 0], w); addQ(j.head, [0, Math.atan2(d[0], d[2]) * 0.35, 0], w);
        this.fingers('R', 0, w);
        break;
      }
      case 'clipboard': {
        // the board held in the left forearm, the right hand jotting notes on it, head down to read
        const sc = Math.sin(t * 11) * 0.012, sc2 = Math.sin(t * 3.7) * 0.02;
        arm('L', -0.09, -0.2, 0.3, [1, -0.7, -0.4], [0, 0.2, 0]);
        arm('R', 0.13 + sc2, -0.14 + sc, 0.32, [-1, -0.8, -0.4], [-0.3, -0.6, 0]);
        addQ(j.head, [0.32, 0.1, 0], w); addQ(j.neck, [0.1, 0, 0], w);
        this.fingers('L', 0.6, w); this.fingers('R', 0.8, w);
        break;
      }
      case 'nod': {
        const n = Math.sin(Math.min(1, t / g.dur) * Math.PI * 3) * (1 - smooth((t - g.dur * 0.7) / (g.dur * 0.3)));
        addQ(j.head, [0.22 * Math.max(0, n) - 0.04 * Math.max(0, -n), 0, 0], w); addQ(j.neck, [0.06 * n, 0, 0], w);
        break;
      }
      case 'talk': {
        const a = Math.sin(t * 3.1), b = Math.sin(t * 2.3 + 1.5), beat = Math.max(0, Math.sin(t * 6.2)) * 0.3;
        arm('R', 0.06 - 0.04 * a, -0.34 + 0.07 * (a * 0.5 + beat), 0.24, [-1, -0.6, -0.6], [0, -0.9 + a * 0.3, 0.3]);
        arm('L', -0.05 + 0.03 * b, -0.4 + 0.05 * b, 0.19, [1, -0.6, -0.6], [0, 0.9 - b * 0.3, -0.3]);
        addQ(j.head, [0.04 * Math.sin(t * 4.3), 0, 0.05 * a], w);
        this.fingers('R', 0.15, w); this.fingers('L', 0.15, w);
        break;
      }
      case 'think': {
        arm('R', 0.13, -0.17, 0.2, [-1, -1.2, 0.2], [-0.6, 0, 0.4]);
        arm('L', -0.1, -0.42, 0.17, [1, -0.5, -0.4], [0, 0.9, 0]);
        addQ(j.head, [-0.08, 0.12, -0.12], w);
        this.lookEyes(1.5, -1);
        break;
      }
      case 'shrug': {
        const env = t < 0.35 ? smooth(t / 0.35) : t < 1.2 ? 1 : 1 - smooth((t - 1.2) / 0.5);
        arm('R', -0.12, -0.42, 0.17, [-1, -0.8, -0.6], [0, -1.6, 0.2]);
        arm('L', 0.12, -0.42, 0.17, [1, -0.8, -0.6], [0, 1.6, -0.2]);
        j.uarmL.position.y += 0.03 * s * env * w; j.uarmR.position.y += 0.03 * s * env * w;
        addQ(j.head, [-0.05 * env, 0, 0.14 * env], w);
        this.fingers('R', 0, w); this.fingers('L', 0, w);
        break;
      }
    }
  }

  /** open (0) .. fist (1) fingers, blended toward the animated grip */
  private fingers(side: 'L' | 'R', g: number, w: number) {
    const k = side === 'L' ? 1 : -1, b = this.bones;
    const f1 = b[('fing1' + side) as 'fing1L'], f2 = b[('fing2' + side) as 'fing2L'], th = b[('thumb' + side) as 'thumbL'];
    _q.setFromEuler(_e.set(0, 0, -k * g * 1.45)); f1.quaternion.slerp(_q, w);
    _q.setFromEuler(_e.set(0, 0, -k * g * 1.6)); f2.quaternion.slerp(_q, w);
    _q.setFromEuler(_e.set(g * 0.5, k * g * 0.6, -k * g * 0.55)); th.quaternion.slerp(_q, w);
  }

  /** two-bone arm IK in chest space: wrist target, elbow pole, hand euler (ported from the people's armIK) */
  private armIK(side: 'L' | 'R', T: number[], pole: number[], hand: number[], w: number) {
    const up = this.j[side === 'L' ? 'uarmL' : 'uarmR'], fore = this.j[side === 'L' ? 'farmL' : 'farmR'], hd = this.j[side === 'L' ? 'handL' : 'handR'];
    const a = Math.abs(this.dims.off[side === 'L' ? 'farmL' : 'farmR'][1]), c = Math.abs(this.dims.off[side === 'L' ? 'handL' : 'handR'][1]);
    _v.set(T[0], T[1], T[2]).sub(up.position);
    const dn = _v2.copy(_v).normalize();
    const l = clamp(_v.length(), (a + c) * 0.25, (a + c) * 0.999);
    const cosA = clamp((a * a + l * l - c * c) / (2 * a * l), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    const pn = _v3.set(pole[0], pole[1], pole[2]);
    pn.addScaledVector(dn, -pn.dot(dn)).normalize();
    const u1 = _v4.copy(dn).multiplyScalar(cosA).addScaledVector(pn, sinA).normalize();
    const u2 = _v.copy(dn).multiplyScalar(l).sub(_v5.copy(u1).multiplyScalar(a)).normalize();
    const fwd = _bz.copy(u2).addScaledVector(u1, -u2.dot(u1));
    if (fwd.lengthSq() < 1e-6) fwd.copy(pn).negate(); else fwd.normalize();
    _by.copy(u1).negate(); _bx.crossVectors(_by, fwd);
    _m.makeBasis(_bx, _by, fwd);
    _q.setFromRotationMatrix(_m);
    up.quaternion.slerp(_q, w);
    _q2.setFromEuler(_e.set(-Math.acos(clamp(u1.dot(u2), -1, 1)), 0, 0, 'YXZ'));
    fore.quaternion.slerp(_q2, w);
    _q2.setFromEuler(_e.set(hand[0], hand[1], hand[2], 'YXZ'));
    hd.quaternion.slerp(_q2, w);
  }
}

function addQ(o: THREE.Object3D, a: number[], w: number) {
  if (!a[0] && !a[1] && !a[2]) return;
  _q.setFromEuler(_e.set(a[0] * w, a[1] * w, a[2] * w, 'YXZ'));
  o.quaternion.multiply(_q);
}

/** her appearance (an attractive adult woman: soft features, arched brows, full lips, a light warm skin) */
export function researcherAppearance(o: ResearcherOpts = {}): Appearance {
  return {
    skin: o.skin ?? 0xf0cdb2, hair: o.hairColor ?? 0x4a2c1c, hairStyle: (o.hair ?? 'ponytail') as Appearance['hairStyle'], face: 4, build: 'slim', height: 0.99,
    bodyShape: 1, eyeColor: o.eyeColor ?? 0x5a7a4a, facialHair: 'none', freckles: 0.12, scars: 0, age: 0.08,
    jaw: 4, eyeShape: 2, brows: 2, nose: 1, mouth: 3, ears: 1,
  } as Appearance;
}
/** her clothes: a blouse under the white lab coat, a knee-length skirt (or slacks), dress shoes */
export function researcherOutfit(o: ResearcherOpts = {}): Outfit {
  return {
    torso: { tex: 'c_blouse', color: o.blouse ?? 0xb8cce0, sleeve: 'long' },
    torsoOuter: { tex: 'c_labcoat', color: 0xf2f2ee, sleeve: 'long', item: 'lab_coat' },
    legs: o.slacks ? { tex: 'c_slacks', color: o.skirt ?? 0x2a2c34 } : { tex: 'c_skirt', color: o.skirt ?? 0x2e3038 },
    legsKind: o.slacks ? 'pants' : 'skirt',
    feet: { tex: 'c_shoes_dress', color: 0x1e1a1a, item: 'dress_shoes' },
    ...(o.glasses ? { eyes: { tex: 'c_glasses', color: 0x3a2a24, item: 'glasses' } } : {}),
  };
}

/**
 * Build the menu guide. Returns a Researcher (a HumanRig: root, skin, bones, j, setOutfit, applyPose, update,
 * setOutline, dispose ... all work) with gesture(), clearGesture(), say(), lookAt(), setExpression(), talk().
 */
export function createResearcher(opts: ResearcherOpts = {}): Researcher {
  const r = new Researcher(researcherAppearance(opts), worldMaterial({ noVis: true, noFog: true, noGrid: true }));
  r.ggOverrides = {
    bust: 0.8, badge: { col: [52, 104, 150], name: opts.name ?? 'Dr. Ines Varga' },
    makeup: { liner: 0.45, lash: 0.85, shadow: [176, 132, 136], blush: [228, 132, 136], highlight: 0.35 },
    lipstick: 0xc0586a, blush: 0.32, hairVolume: 1.12, eyeH: 1.08,
    ...(opts.glasses ? { glasses: { kind: 'rect' as const, col: [70, 46, 40], thick: 1 } } : {}),
  };
  r.setOutfit(researcherOutfit(opts));
  r.skin.castShadow = true;
  if (opts.outline) r.setOutline(opts.outline);
  r.setExpression('smile');
  return r;
}
