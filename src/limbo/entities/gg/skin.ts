// The low-poly people's mesh + paint behind a HumanRig: builds the rigid-skinned body from a spec, paints its
// atlas (garments, skin, hair, condition) into the rig's texture page, paints the face block and animates it
// (expressions, blinks, eye darts, talking mouths), repainting only the rectangle that changed and uploading
// only those rows.
import * as THREE from 'three';
import type { GGSpec, Props, BoneKey } from './types';
import type { Dims } from '../humanModel';
import type { Appearance, RigCondition } from '../humanRig';
import { ggProps, planBody, type BodyPlan } from './body';
import { buildMesh, type Face, type Block } from './mesh';
import { makePainters, type Ctx, type Painter } from './paint';
import { FacePainter, exprParams, EXPRESSIONS, type Expr } from './face';

const ALIAS: Record<string, string> = { wow: 'surprised', love: 'happy', annoyed: 'angry', mad: 'angry', joy: 'happy', shock: 'surprised', tired: 'sleepy', scared: 'fear', hurt: 'pain' };

// face repaints are rationed across all rigs: a handful per frame
let frameId = -1, budget = 0;
function takeBudget(cost: number): boolean {
  const f = Math.floor(performance.now() / 12);
  if (f !== frameId) { frameId = f; budget = 8; }
  if (budget <= 0) return false;
  budget -= cost;
  return true;
}

export class GGSkin {
  readonly k: number; readonly S: number;
  data: Uint8Array; tex: THREE.DataTexture;
  faces: Face[] = []; block: Block | null = null; P: Props | null = null; spec: GGSpec | null = null; plan: BodyPlan | null = null;
  tris = 0;
  private base: Uint8Array;
  private baseKey = ''; private faceKey = '';
  private face: FacePainter | null = null;
  private paint: (Record<string, Painter> & { overlay: Painter }) | null = null;
  private hasOverlay = false;
  /** a full upload of the page is pending (partial row updates are only safe once it is on the GPU) */
  fullPending = true;
  // ---- face animation
  expr = 'neutral'; private exprPrev = 'neutral'; private exprK = 1; private exprHold = 0;
  private condExpr = '';
  private talkHold = 0; private mouthT = 0; private mouth = [0, 0, 1];
  talking = false;
  /** 0 open .. 1 closed (from the pose) */
  blink = 0;
  /** eye direction (face px units, -2..2) */
  look = [0, 0];
  private sacc = [0, 0]; private saccT = 1;
  private Ea = exprParams('neutral'); private Eb = exprParams('neutral'); private Ef = exprParams('neutral');
  private keyExpr = ''; private keyEye = -1; private keyMouth = -1;
  /** faces animate (expressions, blinks, talking); off for far / crowd rigs */
  animateFace = true;

  constructor(k: number, page: { tex: THREE.DataTexture; data: Uint8Array }) {
    this.k = k; this.S = 256 * k;
    this.data = page.data; this.tex = page.tex;
    this.base = new Uint8Array(this.S * this.S * 4);
  }

  /** rebuild the geometry for a spec */
  build(spec: GGSpec, dims: Dims, severed: Set<string>, lod: number, boneIndex: (b: BoneKey) => number): THREE.BufferGeometry {
    const P = ggProps(spec, dims);
    const plan = planBody(spec, P, { severed, lod });
    if (lod > 0) plan.segs = plan.segs.filter((s) => s.part !== 'thumb' && s.part !== 'ear' && s.part !== 'clip' && s.part !== 'hose' && s.part !== 'packPocket');
    const m = buildMesh(plan.segs, P, this.k, boneIndex);
    this.faces = m.faces; this.block = m.block; this.P = P; this.plan = plan; this.tris = m.tris;
    this.baseKey = ''; this.faceKey = '';
    return m.geometry;
  }

  /** paint the atlas: base layers (cached by baseKey), condition overlay, the face */
  paintAll(spec: GGSpec, app: Appearance, cond: RigCondition, baseKey: string) {
    if (!this.P || !this.block) return;
    const P = this.P;
    this.spec = spec;
    this.paint = makePainters(spec, P, app, cond);
    if (baseKey !== this.baseKey) {
      this.baseKey = baseKey;
      this.base.fill(0);
      this.walk(this.base, (c, o) => { const fn = this.paint![c.mat] || this.paint!.body; fn(c, o); }, false);
    }
    this.data.set(this.base);
    // the overlay only visits the faces of parts that carry something (everything when wet / dirty / corrupted)
    const parts = new Set<string>([...Object.keys(cond.blood || {}), ...Object.keys(cond.bandage || {}), ...(cond.splint || [])]);
    const marks = !!((app.tattoos && Object.keys(app.tattoos).length) || (app.bodyScars && Object.keys(app.bodyScars).length));
    const all = !!(cond.wet || cond.dirt || cond.corrupt);
    this.hasOverlay = all || marks || parts.size > 0;
    if (this.hasOverlay) {
      const want = (f: Face) => {
        if (all) return true;
        const fp = faceParts(f.seg.bone, f.seg.side);
        if (marks && (fp.includes('torso_u') || fp.includes('neck') || f.seg.part === 'uarm' || f.seg.part === 'farm')) return true;
        for (const p of fp) if (parts.has(p)) return true;
        return false;
      };
      this.walk(this.data, this.paint.overlay, true, want);
    }
    // the face block (its bake depends on the spec, not on the condition)
    const fk = JSON.stringify([spec.face, spec.hair, spec.skin, spec.dress.suit, spec.dress.mask?.kind, spec.dress.mask?.col, spec.dress.hazmat?.col, this.block]);
    if (fk !== this.faceKey || !this.face) { this.faceKey = fk; this.face = new FacePainter(spec, P, this.block, { d: this.data, w: this.S }); }
    this.condExpr = spec.face.expr;
    this.faceNow(true);
    this.tex.clearUpdateRanges();
    this.tex.needsUpdate = true;
    this.fullPending = true;
  }

  /** run a painter over every texel of every (non-face-block) face */
  private walk(out: Uint8Array, fn: Painter, read: boolean, want?: (f: Face) => boolean) {
    const S = this.S, o = new Float32Array(4);
    const c: Ctx = { x: 0, y: 0, z: 0, i: 0, j: 0, f: null as unknown as Face, part: '', mat: '', bone: '', nx: 0, ny: 0, nz: 0, px: 0, kind: '', e: 0, rb: 0, rt: 0, rh: 0, side: 0 };
    for (const f of this.faces) {
      if (want && !want(f)) continue;
      c.f = f; c.part = f.seg.part; c.mat = f.seg.mat; c.bone = f.seg.bone; c.nx = f.N[0]; c.ny = f.N[1]; c.nz = f.N[2]; c.px = 1 / f.dens;
      c.kind = f.kind; c.side = f.seg.side;
      const R = f.rect, sw = f.s1 - f.s0, rh = f.r1 - f.r0;
      for (let j = 0; j < R.h; j++) {
        const r = f.r1 - (j - 0.5) / f.dens;
        for (let i = 0; i < R.w; i++) {
          const s = f.s0 + (i - 0.5) / f.dens;
          c.x = f.o[0] + f.U[0] * s + f.V[0] * r; c.y = f.o[1] + f.U[1] * s + f.V[1] * r; c.z = f.o[2] + f.U[2] * s + f.V[2] * r;
          c.i = R.x + i; c.j = R.y + j;
          c.e = sw > 0 ? ((s - f.s0) / sw) * 2 - 1 : 0;
          c.rb = r - f.r0; c.rt = f.r1 - r; c.rh = rh;
          const p = (c.j * S + c.i) * 4;
          if (read) { o[0] = out[p]; o[1] = out[p + 1]; o[2] = out[p + 2]; o[3] = out[p + 3]; if (o[3] === 0) continue; }
          else o[3] = 255;
          fn(c, o);
          out[p] = o[0] < 0 ? 0 : o[0] > 255 ? 255 : o[0]; out[p + 1] = o[1] < 0 ? 0 : o[1] > 255 ? 255 : o[1]; out[p + 2] = o[2] < 0 ? 0 : o[2] > 255 ? 255 : o[2]; out[p + 3] = o[3];
        }
      }
    }
  }

  /** the condition overlay over a rect of the face block (head blood, a bandage round the forehead) */
  private faceOverlay(r: number[]) {
    if (!this.hasOverlay || !this.paint || !this.block || !this.P) return;
    const B = this.block, S = this.S, d = this.data, P = this.P, o = new Float32Array(4);
    const c: Ctx = { x: 0, y: 0, z: P.zf, i: 0, j: 0, f: { seg: { cut: '' } } as unknown as Face, part: 'cranium', mat: 'head', bone: 'head', nx: 0, ny: 0, nz: 1, px: 1 / B.dens, kind: 'side', e: 0, rb: 0, rt: 0, rh: 1, side: 0 };
    for (let y = Math.max(B.y, r[1]); y < Math.min(B.y + B.h, r[1] + r[3]); y++) for (let x = Math.max(B.x, r[0]); x < Math.min(B.x + B.w, r[0] + r[2]); x++) {
      c.i = x; c.j = y; c.x = B.x0 + (x - B.x + 0.5) / B.dens; c.y = B.y1 - (y - B.y + 0.5) / B.dens;
      const p = (y * S + x) * 4;
      o[0] = d[p]; o[1] = d[p + 1]; o[2] = d[p + 2]; o[3] = 255;
      this.paint.overlay(c, o);
      d[p] = o[0]; d[p + 1] = o[1]; d[p + 2] = o[2];
    }
  }

  // ---------------------------------------------------------------- expressions
  /** Show an expression (see EXPRESSIONS; aliases wow / mad / scared / hurt...). hold 0 = until changed. 'blink' / 'talk' trigger those. */
  setExpression(name: string, hold = 0) {
    if (name === 'talk') { this.talkHold = Math.max(this.talkHold, hold || 1.5); return; }
    name = ALIAS[name] || name;
    if (!EXPRESSIONS[name]) name = 'neutral';
    if (name !== this.expr) { this.exprPrev = this.expr; this.expr = name; this.exprK = 0; }
    this.exprHold = hold;
  }
  /** talk for the next `sec` seconds (mouth shapes; 0 stops) */
  talk(sec: number) { this.talkHold = sec; }

  /** advance the face (call every frame) */
  update(dt: number) {
    if (!this.face || !this.animateFace) return;
    if (this.exprHold > 0) { this.exprHold -= dt; if (this.exprHold <= 0) { this.exprPrev = this.expr; this.expr = 'neutral'; this.exprK = 0; } }
    this.exprK = Math.min(1, this.exprK + dt / 0.16);
    this.talkHold = Math.max(0, this.talkHold - dt);
    this.saccT -= dt;
    if (this.saccT < 0) { this.saccT = 0.7 + Math.random() * 2.4; this.sacc[0] = Math.random() < 0.55 ? 0 : Math.random() < 0.5 ? -1 : 1; this.sacc[1] = Math.random() < 0.85 ? 0 : 0.5; }
    const talking = this.talking || this.talkHold > 0;
    if (talking) {
      this.mouthT -= dt;
      if (this.mouthT < 0) {
        this.mouthT = 0.065 + Math.random() * 0.07;
        const r = Math.random();
        this.mouth = r < 0.16 ? [0, 0, 1] : r < 0.42 ? [1.3, 0, 1] : r < 0.68 ? [2.5, 0.1, 1.04] : r < 0.84 ? [2.1, 0.9, 0.8] : [3.1, 0.3, 1];
        if (Math.random() < 0.07) { this.mouth = [0, 0, 1]; this.mouthT += 0.22; }
      }
    }
    this.faceNow(false, talking);
  }

  /** compose the expression params and repaint what changed (force: everything) */
  private faceNow(force: boolean, talking = false) {
    const f = this.face;
    if (!f) return;
    const base = this.expr === 'neutral' && this.condExpr ? this.condExpr : this.expr;
    exprParams(this.exprPrev === 'neutral' && this.condExpr ? this.condExpr : this.exprPrev, this.Ea); exprParams(base, this.Eb);
    const k = this.exprK < 0.5 ? 0.5 : 1;
    const E = this.Ef;
    for (const key in this.Eb) E[key] = this.Ea[key] + (this.Eb[key] - this.Ea[key]) * k;
    if (talking) { const [mo, mr, mw] = this.mouth; E.open = Math.max(E.open * 0.4, mo); E.round = Math.max(E.round * 0.5, mr); E.mouthW *= mw; E.teeth = mo > 2.2 ? 1 : E.teeth; }
    const bl = this.blink;
    E.blink = bl > 0.7 ? 1 : bl > 0.2 ? 0.55 : 0;
    E.wink = this.expr === 'wink' && k === 1 ? 1 : 0;
    E.lookX = Math.round(Math.max(-2.2, Math.min(2.2, this.look[0] + this.sacc[0])));
    E.lookY = Math.round(Math.max(-1, Math.min(2, this.look[1] + this.sacc[1] + (E.lookY || 0))) * 2) / 2;
    const exprKey = this.exprPrev + '>' + base + k;
    const eyeKey = E.blink * 1000 + E.lookX * 10 + E.lookY + E.wink * 7;
    const mouthKey = E.open * 1e4 + E.round * 100 + E.mouthW + E.teeth * 1e6;
    if (force) { this.keyExpr = exprKey; this.keyEye = eyeKey; this.keyMouth = mouthKey; const r = f.paint(E); this.faceOverlay(r); return; }
    if (exprKey !== this.keyExpr) { if (!takeBudget(3)) return; this.keyExpr = exprKey; this.keyEye = eyeKey; this.keyMouth = mouthKey; this.flush(f.paint(E)); return; }
    if (eyeKey !== this.keyEye) { if (!takeBudget(1)) return; this.keyEye = eyeKey; this.flush(f.paint(E, f.eyeRect())); }
    if (mouthKey !== this.keyMouth) { if (!takeBudget(1)) return; this.keyMouth = mouthKey; this.flush(f.paint(E, f.mouthRect())); }
  }

  /** upload a repainted rect (rows only, once the full page is on the GPU) */
  private flush(r: number[]) {
    this.faceOverlay(r);
    const t = this.tex;
    if (!this.fullPending) {
      const S = this.S, x = Math.max(0, r[0]), w = Math.min(S - x, r[2]);
      for (let y = Math.max(0, r[1]); y < Math.min(S, r[1] + r[3]); y++) t.addUpdateRange((y * S + x) * 4, w * 4);
    }
    t.needsUpdate = true;
  }
}

/** the item body parts a segment's bone can carry (for the condition overlay) */
function faceParts(bone: string, side: number): string[] {
  const sd = bone.endsWith('R') || side < 0 ? '_r' : '_l';
  if (bone === 'head' || bone === 'hair') return ['head'];
  if (bone === 'neck') return ['neck'];
  for (const k of ['uarm', 'farm', 'thigh', 'shin', 'foot']) if (bone.startsWith(k)) return [k + sd];
  if (bone.startsWith('hand') || bone.startsWith('fing') || bone.startsWith('thumb')) return ['hand' + sd];
  return ['torso_u', 'torso_l', 'groin', 'thigh_l', 'thigh_r'];
}
