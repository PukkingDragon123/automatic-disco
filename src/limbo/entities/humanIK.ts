import * as THREE from 'three';

/**
 * Small analytic IK toolkit for the survivor rig (allocation-free: every
 * call works on module scratch objects and writes into caller arrays).
 *
 * Rig conventions (see humanModel.ts): every limb bone hangs along its local
 * -y at rest, +z is the body's front, +x the body's LEFT. Joints are posed
 * with XYZ Euler angles. A knee bends with +x (shin swings back), an elbow
 * with -x (forearm swings forward).
 */

export type V3a = [number, number, number];

const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _mi = new THREE.Matrix4();
const _d = new THREE.Vector3();
const _n = new THREE.Vector3();
const _t = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _v = new THREE.Vector3();

/** rotation matrix of an XYZ Euler (three.js default order) */
export function eulerMat(out: THREE.Matrix4, x: number, y: number, z: number): THREE.Matrix4 {
  _e.set(x, y, z, 'XYZ');
  return out.makeRotationFromEuler(_e);
}

/** out = parent^T * child, then XYZ Euler angles into `res` (rotation-only matrices) */
export function localEuler(parent: THREE.Matrix4, child: THREE.Matrix4, res: V3a) {
  _mi.copy(parent).transpose();
  _m.multiplyMatrices(_mi, child);
  _e.setFromRotationMatrix(_m, 'XYZ');
  res[0] = _e.x; res[1] = _e.y; res[2] = _e.z;
}

export interface TwoBoneOut {
  /** root-space rotation of the upper bone */
  upper: THREE.Matrix4;
  /** root-space rotation of the lower bone */
  lower: THREE.Matrix4;
  /** interior bend (0 straight .. PI folded) */
  bend: number;
  /** how far the target was out of reach (0 when reachable) */
  short: number;
}

/**
 * Two-bone solve in root space.
 * @param parentRot root-space rotation of the chain's parent bone
 * @param base      root-space position of the upper joint (hip / shoulder)
 * @param target    where the end joint (ankle / wrist) should be
 * @param pole      direction the middle joint (knee / elbow) should point
 * @param kneeLike  true: the joint bends with +x (knee); false: with -x (elbow)
 * @param upperE / lowerE receive the local Euler angles
 * @param stiff     treat the chain as one rigid bone (peg leg): aim it, no bend
 */
export function solveTwoBone(parentRot: THREE.Matrix4, base: THREE.Vector3, target: THREE.Vector3, pole: THREE.Vector3,
  L1: number, L2: number, kneeLike: boolean, upperE: V3a, lowerE: V3a, out: TwoBoneOut, stiff = false, maxBend = 2.6) {
  _d.subVectors(target, base);
  let dist = _d.length();
  if (dist < 1e-5) { _d.set(0, -1, 0); dist = 1e-5; } else _d.multiplyScalar(1 / dist);
  const reach = (L1 + L2) * 0.9995;
  out.short = Math.max(0, dist - reach);
  const minD = Math.max(Math.abs(L1 - L2) + 1e-3, Math.sqrt(L1 * L1 + L2 * L2 - 2 * L1 * L2 * Math.cos(Math.PI - maxBend)));
  dist = stiff ? reach : Math.min(reach, Math.max(minD, dist));
  // pole projected onto the plane perpendicular to the base->target line
  _n.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_n.lengthSq() < 1e-8) { _n.set(0, 0, 1).addScaledVector(_d, -_d.z); if (_n.lengthSq() < 1e-8) _n.set(1, 0, 0); }
  _n.normalize();
  let ca = stiff ? 1 : (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist);
  ca = ca > 1 ? 1 : ca < -1 ? -1 : ca;
  const sa = Math.sqrt(1 - ca * ca);
  // upper bone direction and its in-plane perpendicular (towards the pole)
  _t.copy(_d).multiplyScalar(ca).addScaledVector(_n, sa);
  _z.copy(_n).multiplyScalar(ca).addScaledVector(_d, -sa);
  if (!kneeLike) _z.negate();
  _y.copy(_t).negate();
  _x.crossVectors(_y, _z).normalize();
  _z.crossVectors(_x, _y).normalize();
  out.upper.makeBasis(_x, _y, _z);
  let ck = stiff ? -1 : (L1 * L1 + L2 * L2 - dist * dist) / (2 * L1 * L2);
  ck = ck > 1 ? 1 : ck < -1 ? -1 : ck;
  const bend = Math.PI - Math.acos(ck);
  out.bend = bend;
  localEuler(parentRot, out.upper, upperE);
  lowerE[0] = kneeLike ? bend : -bend; lowerE[1] = 0; lowerE[2] = 0;
  eulerMat(_mi, lowerE[0], 0, 0);
  out.lower.multiplyMatrices(out.upper, _mi);
}

export function newTwoBoneOut(): TwoBoneOut { return { upper: new THREE.Matrix4(), lower: new THREE.Matrix4(), bend: 0, short: 0 }; }

/** local Euler for an end bone (foot / hand) given its parent's root-space rotation and a wanted root-space yaw / pitch / roll */
export function endEuler(parentRot: THREE.Matrix4, yaw: number, pitch: number, roll: number, res: V3a) {
  _e.set(0, yaw, 0, 'XYZ');
  _m.makeRotationFromEuler(_e);
  _e.set(pitch, 0, roll, 'XYZ');
  _mi.makeRotationFromEuler(_e);
  _m.multiply(_mi);
  _mi.copy(parentRot).transpose();
  _mi.multiply(_m);
  _e.setFromRotationMatrix(_mi, 'XYZ');
  res[0] = _e.x; res[1] = _e.y; res[2] = _e.z;
}

/** transform a local offset by a rotation and add a base: out = base + R * (x, y, z) */
export function offsetBy(R: THREE.Matrix4, base: THREE.Vector3, x: number, y: number, z: number, out: THREE.Vector3) {
  _v.set(x, y, z).applyMatrix4(R);
  return out.copy(base).add(_v);
}

/** critically damped spring towards `target` (value, velocity) — returns the new value; vel stored in v[i] */
export function spring(x: number, v: Float32Array | number[], i: number, target: number, omega: number, dt: number, zeta = 1): number {
  const k = omega * omega, c = 2 * zeta * omega;
  let vel = v[i];
  // semi-implicit Euler with a sub-step for stability on long frames
  const n = dt > 0.034 ? 2 : 1, h = dt / n;
  for (let s = 0; s < n; s++) { vel += (-(x - target) * k - vel * c) * h; x += vel * h; }
  v[i] = vel;
  return x;
}

export const wrapPi = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
