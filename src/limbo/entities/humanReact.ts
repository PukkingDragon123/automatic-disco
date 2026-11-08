import type { Pose, JointName } from './humanRig';

/**
 * Procedural reactions layered on top of a survivor's pose (allocation-free):
 *  - hit reactions: damped springs kicked by a blow's direction, strength and
 *    the body part it landed on (head snaps, doubling over, an arm thrown
 *    back, a knee buckling, a shove of the pelvis the feet step to follow,
 *    a spin from a heavy side blow);
 *  - secondary motion: a backpack that bounces and swings, hair that lags
 *    the head, driven by the body's accelerations.
 */

const enum C { TP, TR, TY, HP, HR, HY, AL, AR, ALO, ARO, HX, HZ, SPIN, DIP, KL, KR, N }

const add = (p: Pose, j: JointName, x: number, y = 0, z = 0) => { const v = p[j]; if (v) { v[0] += x; v[1] += y; v[2] += z; } else p[j] = [x, y, z]; };
const cl = (v: number, a: number) => (v > a ? a : v < -a ? -a : v);

/** body part groups for reactions */
export function partGroup(part: string): 'head' | 'chest' | 'belly' | 'armL' | 'armR' | 'legL' | 'legR' {
  if (part === 'head' || part === 'neck') return 'head';
  if (part === 'torso_l' || part === 'groin') return 'belly';
  if (/_l$/.test(part)) return /^(uarm|farm|hand)/.test(part) ? 'armL' : 'legL';
  if (/_r$/.test(part)) return /^(uarm|farm|hand)/.test(part) ? 'armR' : 'legR';
  return 'chest';
}

export class Reactions {
  private x = new Float32Array(C.N);
  private v = new Float32Array(C.N);
  /** time since the last hit (for flinch blinks etc.) */
  since = 99;
  /** 0..1 how shaken the body is right now */
  get shaken() { return Math.min(1, Math.abs(this.x[C.TP]) + Math.abs(this.x[C.HP]) + Math.abs(this.x[C.HX]) + Math.abs(this.x[C.HZ])); }

  /**
   * A blow lands. (fx, fz): direction the force pushes the body in ROOT space
   * (+z = the body's front: a hit from in front pushes towards -z).
   */
  hit(fx: number, fz: number, part: string, strength: number) {
    const s = Math.max(0, Math.min(1.6, strength));
    const v = this.v;
    const L = Math.hypot(fx, fz) || 1; fx /= L; fz /= L;
    const g = partGroup(part);
    const r = Math.random() < 0.5 ? -1 : 1;
    this.since = 0;
    // every blow: the pelvis is shoved (the feet step to catch it), a flinch through the trunk, the knees give a little,
    // the arms fly up on the far side to catch the balance
    v[C.HX] += fx * 2.9 * s; v[C.HZ] += fz * 2.9 * s;
    v[C.TP] += -fz * 2.6 * s; v[C.TR] += -fx * 2.6 * s;
    v[C.AL] += 2.8 * s; v[C.AR] += 2.8 * s;
    v[C.ALO] += Math.max(0, -fx) * 4.5 * s + 1.2 * s; v[C.ARO] += Math.max(0, fx) * 4.5 * s + 1.2 * s;
    v[C.DIP] += -0.35 * s;
    switch (g) {
      case 'head':
        // the head snaps away and twists, the shoulders follow it round
        v[C.HP] += (-fz * 13 - 2.5) * s; v[C.HR] += -fx * 13 * s; v[C.HY] += (fx * 11 + r * 4) * s;
        v[C.TP] += -fz * 2.6 * s; v[C.TY] += (fx * 3 + r * 1.5) * s; v[C.TR] += -fx * 1.5 * s;
        break;
      case 'chest':
        v[C.TP] += -fz * 6.5 * s; v[C.TR] += -fx * 5 * s; v[C.TY] += r * 3.5 * s;
        v[C.HP] += -fz * 5 * s; v[C.HR] += -fx * 3 * s;
        v[C.ALO] += 3 * s; v[C.ARO] += 3 * s;
        break;
      case 'belly':
        // doubles over whichever way it came from
        v[C.TP] += 7.5 * s; v[C.HP] += 4 * s; v[C.DIP] += -0.9 * s;
        v[C.AL] += 3 * s; v[C.AR] += 3 * s;
        break;
      case 'armL': case 'armR': {
        const k = g === 'armL' ? 1 : -1;
        v[g === 'armL' ? C.AL : C.AR] += (-fz * 7 - 3) * s;
        v[g === 'armL' ? C.ALO : C.ARO] += 4 * s;
        v[C.TY] += k * 4 * s; v[C.TR] += k * 1.5 * s;
        break;
      }
      case 'legL': case 'legR': {
        const k = g === 'legL' ? 1 : -1;
        v[g === 'legL' ? C.KL : C.KR] += 8 * s;
        v[C.DIP] += -1.1 * s; v[C.TR] += k * 3 * s; v[C.TP] += 2 * s;
        break;
      }
    }
    // a heavy blow from the side spins the body
    if (s > 0.75 && Math.abs(fx) > 0.55) v[C.SPIN] += Math.sign(fx) * (s - 0.6) * 9;
  }

  /** the weapon connected: it jars back up the arm into the shoulders */
  recoil(strength: number) {
    const s = Math.max(0, Math.min(1.5, strength)), v = this.v;
    v[C.AR] += -3.2 * s; v[C.AL] += -1.2 * s; v[C.TP] += -1.4 * s; v[C.TY] += -1.6 * s; v[C.HP] += -1.2 * s;
  }

  /** integrate and add onto the pose; returns true while anything is still moving */
  apply(p: Pose, dt: number): boolean {
    this.since += dt;
    const x = this.x, v = this.v;
    const h = Math.min(dt, 0.05);
    let live = false;
    for (let i = 0; i < C.N; i++) {
      // stiffer for the head and arms, softer for the trunk and the pelvis
      const w = i === C.HX || i === C.HZ ? 6 : i === C.DIP ? 7 : i === C.SPIN ? 6 : i <= C.TY ? 7.5 : 10;
      const z = i === C.SPIN ? 0.7 : i === C.HX || i === C.HZ ? 0.8 : 0.42;
      const k = w * w, c = 2 * z * w;
      const n = h > 0.025 ? 2 : 1, hh = h / n;
      for (let s = 0; s < n; s++) { v[i] += (-x[i] * k - v[i] * c) * hh; x[i] += v[i] * hh; }
      x[i] = cl(x[i], i === C.HX || i === C.HZ ? 0.45 : i === C.SPIN ? 1.4 : i === C.DIP ? 0.3 : 1.1);
      if (Math.abs(x[i]) > 1e-3 || Math.abs(v[i]) > 1e-2) live = true;
    }
    if (!live) return false;
    add(p, 'spine', x[C.TP] * 0.55, x[C.TY] * 0.5, x[C.TR] * 0.5);
    add(p, 'chest', x[C.TP] * 0.45, x[C.TY] * 0.5, x[C.TR] * 0.5);
    add(p, 'neck', x[C.HP] * 0.35, x[C.HY] * 0.35, x[C.HR] * 0.35);
    add(p, 'head', x[C.HP] * 0.65, x[C.HY] * 0.65, x[C.HR] * 0.65);
    add(p, 'uarmL', -x[C.AL] * 0.5, 0, x[C.ALO] * 0.5);
    add(p, 'uarmR', -x[C.AR] * 0.5, 0, -x[C.ARO] * 0.5);
    add(p, 'farmL', -Math.abs(x[C.AL]) * 0.6, 0, 0);
    add(p, 'farmR', -Math.abs(x[C.AR]) * 0.6, 0, 0);
    add(p, 'shinL', Math.max(0, x[C.KL]) * 0.8); add(p, 'thighL', -Math.max(0, x[C.KL]) * 0.4);
    add(p, 'shinR', Math.max(0, x[C.KR]) * 0.8); add(p, 'thighR', -Math.max(0, x[C.KR]) * 0.4);
    p.rootX = (p.rootX ?? 0) + x[C.HX];
    p.rootZ = (p.rootZ ?? 0) + x[C.HZ];
    p.rootY = (p.rootY ?? 0) + x[C.DIP] - (Math.max(0, x[C.KL]) + Math.max(0, x[C.KR])) * 0.06;
    p.bodyYaw = (p.bodyYaw ?? 0) + x[C.SPIN];
    if (this.since < 0.12) p.blink = 1;
    return true;
  }

  /** pelvis shift the feet should step under (root space) */
  get hipX() { return this.x[C.HX]; }
  get hipZ() { return this.x[C.HZ]; }
  /** knee buckles (0..1) for leg IK weights */
  get kneeL() { return Math.max(0, this.x[C.KL]); }
  get kneeR() { return Math.max(0, this.x[C.KR]); }

  clear() { this.x.fill(0); this.v.fill(0); }
}

/** backpack and hair as pendulums on the chest / head */
export class Secondary {
  /** pack pitch, roll, bounce; hair pitch, yaw, roll */
  private x = new Float32Array(6);
  private v = new Float32Array(6);
  private pvx = 0; private pvy = 0; private pvz = 0;
  private py = 0; private px = 0; private pz = 0; private init = false;
  private headYaw = 0;
  pack: [number, number, number] = [0, 0, 0];
  packY = 0;
  hair: [number, number, number] = [0, 0, 0];

  /**
   * @param hx/hy/hz  hips position in a world-fixed frame
   * @param yaw       body yaw (root rotation.y): accelerations are felt in body axes
   * @param yawRate   body turn rate (rad/s)
   * @param headYaw   head yaw relative to the body
   */
  update(dt: number, hx: number, hy: number, hz: number, yaw: number, yawRate: number, headYaw: number) {
    if (dt <= 0) return;
    const h = Math.min(dt, 0.05);
    if (!this.init) { this.px = hx; this.py = hy; this.pz = hz; this.headYaw = headYaw; this.init = true; }
    const vx = (hx - this.px) / h, vy = (hy - this.py) / h, vz = (hz - this.pz) / h;
    this.px = hx; this.py = hy; this.pz = hz;
    const wax = cl((vx - this.pvx) / h, 30), ay = cl((vy - this.pvy) / h, 30), waz = cl((vz - this.pvz) / h, 30);
    this.pvx = vx; this.pvy = vy; this.pvz = vz;
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    const ax = c * wax - sn * waz, az = sn * wax + c * waz;
    const hyr = cl((headYaw - this.headYaw) / h, 20); this.headYaw = headYaw;
    const x = this.x, v = this.v;
    // pack pitch: swings away from the back when the body lurches forward or drops
    const step = (i: number, w: number, z: number, force: number, lo: number, hi: number) => {
      const k = w * w, c = 2 * z * w;
      v[i] += (-x[i] * k - v[i] * c + force) * h;
      x[i] += v[i] * h;
      if (x[i] < lo) { x[i] = lo; if (v[i] < 0) v[i] *= -0.3; }
      if (x[i] > hi) { x[i] = hi; if (v[i] > 0) v[i] *= -0.3; }
    };
    step(0, 8, 0.18, az * 1.6 - ay * 0.7, -0.05, 0.4);
    step(1, 8, 0.22, -ax * 1.4 + yawRate * 1.6, -0.28, 0.28);
    step(2, 13, 0.25, -ay * 0.02, -0.025, 0.025);
    // hair lags the head
    step(3, 7, 0.3, az * 0.6 - ay * 0.25, -0.3, 0.35);
    step(4, 7.5, 0.28, -hyr * 6 - yawRate * 2.5, -0.5, 0.5);
    step(5, 7.5, 0.3, -ax * 0.8, -0.35, 0.35);
    this.pack[0] = x[0]; this.pack[1] = 0; this.pack[2] = x[1];
    this.packY = x[2];
    this.hair[0] = x[3]; this.hair[1] = x[4]; this.hair[2] = x[5];
  }
}
