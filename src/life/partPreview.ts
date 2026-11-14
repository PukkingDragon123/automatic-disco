// Body regions and part previews. Every vertex of a sculpted creature is sorted into a body region (torso, back,
// head, eyes, horns, mouth, feelers, legs, forelimbs, tail, wings) from the bone that carries it and the rig box
// it sits on; the gene lab highlights regions under the cursor and the part icons are cut out of a creature along
// the same lines (one leg, the head, the tail, a wing...). Genes that grow no visible part (organs, brood) get a
// small modelled symbol instead: a heart, a coiled gut, an egg clutch.
import * as THREE from 'three';
import type { SpeciesModel } from './creatureMesh';
import type { Rig } from './morph';
import { gbuf } from '../gfx/gbuf';
import { makeRamp, mixHex } from '../limbo/gfx/pixel';
import { hash01 } from '../core/rand';

// region ids (kept in step with REG in ui/labRules.ts)
const TORSO = 1, BACK = 2, HEAD = 3, EYES = 4, CROWN = 5, JAW = 6, FEELERS = 7, LEGS = 8, ARMS = 9, TAIL = 10, WINGS = 11;

/** the default region of every bone */
export function boneRegions(rig: Rig): Int8Array {
  const R = new Int8Array(rig.bones.length).fill(TORSO);
  const set = (i: number, r: number) => { if (i >= 0) R[i] = r; };
  for (const n of rig.neck) set(n, HEAD);
  set(rig.head, HEAD); set(rig.jaw, JAW); set(rig.tongue, JAW); set(rig.throat, JAW);
  const arthro = rig.plan === 'hexapod' || rig.plan === 'octopod';
  if (rig.plan === 'gastropod') for (const t of rig.tail) set(t, BACK);
  else if (!arthro) for (const t of rig.tail) set(t, TAIL);
  for (const a of rig.antennae) set(a, FEELERS);
  for (const s of rig.stalks) set(s, EYES);
  for (const l of rig.lids ?? []) set(l.bone, EYES);
  for (const e of rig.ears ?? []) set(e, FEELERS);
  for (const e of rig.eyes ?? []) { set(e.bone, EYES); set(e.pupil, EYES); }
  for (const lg of rig.legs) if (lg.flex !== undefined && lg.flex >= 0) set(lg.flex, LEGS);
  for (const w of rig.wings) set(w, WINGS);
  for (const lg of rig.legs) {
    for (const b of lg.bones) set(b, LEGS);
    const p = rig.bones[lg.bones[0]].parent;
    if (p >= 0 && /^leg\d/.test(rig.bones[p].name)) set(p, LEGS); // an insect's coxa
  }
  for (const m of rig.mandibles) set(m, rig.bones[m].name.startsWith('mand') ? JAW : ARMS);
  // children of arm / wing / leg bones follow them (feet, forearms)
  for (let i = 0; i < rig.bones.length; i++) {
    const p = rig.bones[i].parent;
    if (p >= 0 && (R[p] === ARMS || R[p] === WINGS || R[p] === LEGS || R[p] === FEELERS || R[p] === EYES) && R[i] === TORSO) R[i] = R[p];
  }
  // tail stinger and abdomen: arthropod tails are part of the body
  if (rig.plan === 'serpent') set(rig.head, HEAD);
  return R;
}

const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _v = new THREE.Vector3();

/** per-vertex region ids (Float32 for the shader attribute) */
export function vertexRegions(m: SpeciesModel): Float32Array {
  const g = m.geo, rig = m.rig, rest = m.restWorld;
  const P = g.attributes.position as THREE.BufferAttribute, N = g.attributes.normal as THREE.BufferAttribute;
  const SI = g.attributes.skinIndex as THREE.BufferAttribute, SW = g.attributes.skinWeight as THREE.BufferAttribute;
  const BR = boneRegions(rig);
  const out = new Float32Array(P.count);
  // head-mounted boxes: eyes, horns, teeth, ears, pores
  interface HB { c: THREE.Vector3; h: THREE.Vector3; q: THREE.Quaternion; reg: number; vol: number }
  const headBones = new Set([rig.head, rig.jaw].filter((x) => x >= 0));
  const hb: HB[] = [];
  for (const b of rig.boxes) {
    if (!headBones.has(b.bone)) continue;
    const c = new THREE.Vector3(rest[b.bone][0] + b.c[0], rest[b.bone][1] + b.c[1], rest[b.bone][2] + b.c[2]);
    const h = new THREE.Vector3(b.s[0] / 2, b.s[1] / 2, b.s[2] / 2);
    const q = new THREE.Quaternion().setFromEuler(_e.set(b.rx ?? 0, b.ry ?? 0, b.rz ?? 0)).invert();
    let reg = b.bone === rig.jaw ? JAW : HEAD;
    if (b.mat === 'eye' || b.mat === 'compound') reg = EYES;
    else if (b.mat === 'horn' && b.bone === rig.head && b.c[1] > 0) reg = CROWN;
    else if (b.mat === 'teeth' || b.mat === 'mouth' || (b.mat === 'claw' && b.bone === rig.head)) reg = JAW;
    else if (b.mat === 'lantern') reg = FEELERS;
    else if (b.mat === 'head' && b.bone === rig.head && (b.rz || b.ry) && Math.abs(b.c[0]) > 0.001 && b.c[1] > 0) reg = FEELERS; // ears
    hb.push({ c, h, q, reg, vol: h.x * h.y * h.z });
  }
  const rootY = rest[rig.root]?.[1] ?? 0;
  for (let i = 0; i < P.count; i++) {
    let bi = SI.getX(i), bw = SW.getX(i);
    for (let k = 1; k < 4; k++) { const w = SW.getComponent(i, k); if (w > bw) { bw = w; bi = SI.getComponent(i, k); } }
    let r = BR[bi] ?? TORSO;
    if ((r === HEAD || r === JAW) && hb.length) {
      let best: HB | null = null, bd = Infinity;
      for (const b of hb) {
        _v.set(P.getX(i), P.getY(i), P.getZ(i)).sub(b.c).applyQuaternion(b.q);
        const dx = Math.max(0, Math.abs(_v.x) - b.h.x), dy = Math.max(0, Math.abs(_v.y) - b.h.y), dz = Math.max(0, Math.abs(_v.z) - b.h.z);
        const d = Math.hypot(dx, dy, dz) / (Math.max(b.h.x, b.h.y, b.h.z) + 0.004);
        if (d < bd - 1e-4 || (Math.abs(d - bd) < 1e-4 && best && b.vol < best.vol)) { bd = d; best = b; }
      }
      if (best && best.reg !== HEAD && best.reg !== JAW && bd < 0.7) r = best.reg;
      else if (best && bd < 0.35) r = best.reg === JAW ? JAW : r;
    }
    if (r === TORSO && N.getY(i) > 0.55 && P.getY(i) > rootY) r = BACK;
    out[i] = r;
  }
  return out;
}

/** add (once) the region attribute the lab's shaders read */
export function attachRegions(m: SpeciesModel): Float32Array {
  const a = m.geo.getAttribute('aReg') as THREE.BufferAttribute | undefined;
  if (a) return a.array as Float32Array;
  const r = vertexRegions(m);
  m.geo.setAttribute('aReg', new THREE.BufferAttribute(r, 1));
  return r;
}

/** which bones to cut out for a part view: one leg, one arm, one wing side, or every bone in some regions */
export interface PartCut { regions: number[]; oneSide?: boolean; whole?: boolean }

/**
 * A static, centred, unit-radius copy of part of a creature (rest pose), skinned weights dropped. The page texture
 * is shared with the model. Returns null if nothing of the part exists.
 */
export function partGeometry(m: SpeciesModel, cut: PartCut): THREE.BufferGeometry | null {
  const g = m.geo, rig = m.rig;
  const regs = attachRegions(m);
  const P = g.attributes.position as THREE.BufferAttribute, UV = g.attributes.uv as THREE.BufferAttribute;
  const SI = g.attributes.skinIndex as THREE.BufferAttribute, SW = g.attributes.skinWeight as THREE.BufferAttribute;
  const idx = g.index!;
  const want = new Set(cut.regions);
  // one leg / arm / wing: keep the bones of a single limb on the camera side (+x)
  let bones: Set<number> | null = null;
  if (cut.oneSide && !cut.whole) {
    const sideOf = (b: number) => (m.restWorld[b][0] > 1e-4 ? 1 : m.restWorld[b][0] < -1e-4 ? -1 : 0);
    if (want.has(LEGS) && rig.legs.length) {
      // the hind pair shows the foot best on vertebrates, the middle pair on insects
      const pick = rig.legs.filter((l) => l.side > 0);
      const lg = rig.plan === 'hexapod' || rig.plan === 'octopod' ? pick[Math.floor(pick.length / 2)] ?? rig.legs[0] : pick.find((l) => l.kind === 'hind') ?? pick[pick.length - 1] ?? rig.legs[0];
      bones = new Set(lg.bones);
      const p = rig.bones[lg.bones[0]].parent; if (p >= 0 && /^leg\d/.test(rig.bones[p].name)) bones.add(p);
    } else {
      bones = new Set();
      const br = boneRegions(rig);
      for (let i = 0; i < rig.bones.length; i++) if (want.has(br[i]) && sideOf(i) > 0) bones.add(i);
    }
  }
  const dom = (i: number) => { let bi = SI.getX(i), bw = SW.getX(i); for (let k = 1; k < 4; k++) { const w = SW.getComponent(i, k); if (w > bw) { bw = w; bi = SI.getComponent(i, k); } } return bi; };
  const keepV = (i: number) => cut.whole || (bones ? bones.has(dom(i)) : want.has(regs[i]));
  const map = new Int32Array(P.count).fill(-1);
  const pos: number[] = [], uv: number[] = [], rg: number[] = [], ind: number[] = [];
  const vert = (i: number) => {
    if (map[i] < 0) { map[i] = pos.length / 3; pos.push(P.getX(i), P.getY(i), P.getZ(i)); uv.push(UV.getX(i), UV.getY(i)); rg.push(regs[i]); }
    return map[i];
  };
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
    const k = (keepV(a) ? 1 : 0) + (keepV(b) ? 1 : 0) + (keepV(c) ? 1 : 0);
    if (k < 2) continue;
    ind.push(vert(a), vert(b), vert(c));
  }
  if (ind.length < 9) return null;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setAttribute('aReg', new THREE.Float32BufferAttribute(rg, 1));
  out.setIndex(ind);
  out.computeVertexNormals();
  normalize(out);
  return out;
}

/** centre on the bounding box and scale to unit radius */
export function normalize(g: THREE.BufferGeometry) {
  g.computeBoundingBox();
  const b = g.boundingBox!, c = b.getCenter(new THREE.Vector3());
  g.translate(-c.x, -c.y, -c.z);
  g.computeBoundingSphere();
  const r = g.boundingSphere!.radius || 1;
  g.scale(1 / r, 1 / r, 1 / r);
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------------------------------------ highlight material
export interface RegU { uMask: { value: number }; uT: { value: number }; uCol: { value: THREE.Color }; uK: { value: number }; uHolo: { value: number } }
export const regUniforms = (): RegU => ({ uMask: { value: 0 }, uT: { value: 0 }, uCol: { value: new THREE.Color(0x7affe0) }, uK: { value: 1 }, uHolo: { value: 0 } });

/**
 * Patch a creature material (already gbuf'd) so vertices whose region bit is in uMask pulse with a scanning glow,
 * and uHolo adds a cool rim (part icons). Works on the skinned instance material and on plain Lambert copies.
 */
export function regionHighlight<T extends THREE.Material>(mat: T, U: RegU, key: string): T {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.uniforms.uRegMask = U.uMask; sh.uniforms.uRegT = U.uT; sh.uniforms.uRegCol = U.uCol; sh.uniforms.uRegK = U.uK; sh.uniforms.uRegHolo = U.uHolo;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aReg;\nvarying float vReg;\nvarying vec3 vRegP;\nvarying vec3 vRegV;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvReg = aReg;\nvRegP = position;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvRegV = -mvPosition.xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vReg;\nvarying vec3 vRegP;\nvarying vec3 vRegV;\nuniform float uRegMask, uRegT, uRegK, uRegHolo;\nuniform vec3 uRegCol;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  float rid = floor(vReg + 0.5);
  float bit = mod(floor(uRegMask / exp2(rid)), 2.0);
  if (bit > 0.5 && uRegK > 0.0) {
    float scan = step(0.82, fract(vRegP.y * 9.0 - uRegT * 1.4));
    float pulse = 0.55 + 0.45 * sin(uRegT * 6.0);
    totalEmissiveRadiance += uRegCol * uRegK * (0.22 + 0.25 * pulse + scan * 0.65);
  }
  if (uRegHolo > 0.0) {
    float fr = 1.0 - abs(dot(normalize(normal), normalize(vRegV)));
    totalEmissiveRadiance += uRegCol * uRegHolo * floor(pow(fr, 2.0) * 4.0) / 4.0 * 0.6;
  }
}`);
  };
  mat.customProgramCacheKey = () => prevKey + '|reg-' + key;
  return mat;
}

/** a Lambert material for a static part cut from a creature (shares the creature's page texture) */
export function partMaterial(tex: THREE.Texture, U: RegU): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, flatShading: true });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <map_fragment>', '#include <map_fragment>\nfloat glowA = textureLod(map, vMapUv, 0.0).a; vec3 glowC = sampledDiffuseColor.rgb;')
      .replace('#include <alphatest_fragment>', 'if (diffuseColor.a < 0.5) discard;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (glowA > 0.5 && glowA < 0.98) totalEmissiveRadiance += glowC * 1.4;');
  };
  m.customProgramCacheKey = () => 'lab-part';
  gbuf(m, 1);
  return regionHighlight(m, U, 'part');
}

// ------------------------------------------------------------------------------------------------ symbols
/** a small painted organic texture: ramp noise with speckles and veins (alpha < 1 marks glowing texels) */
function organTex(base: number, kind: 'flesh' | 'shell' | 'jelly' | 'glow' | 'leaf', seed: number): THREE.DataTexture {
  const S = 64, d = new Uint8Array(S * S * 4), R = makeRamp(base, 7, { spread: 0.6, hueShift: 0.05 });
  const vein = mixHex(base, 0x200810, 0.55), lite = mixHex(base, 0xffffff, 0.45);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const h = hash01(x, y, seed), n = (Math.sin(x * 0.31 + seed) + Math.sin(y * 0.27 + seed * 2) + Math.sin((x + y) * 0.17)) / 3;
    let k = 3.2 + n * 1.6 + (h - 0.5) * 1.2, c = R[Math.max(0, Math.min(6, Math.round(k)))], a = 255;
    if (kind === 'flesh' && Math.abs(Math.sin(x * 0.4 + Math.sin(y * 0.2) * 3 + seed)) < 0.06) c = vein;
    if (kind === 'shell' && (x % 16 === 0 || (y + (x >> 4) * 5) % 12 === 0)) c = R[1];
    if (kind === 'jelly' && ((x - 32) ** 2 + (y - 32) ** 2) % 97 < 6) c = 0x141018;
    if (kind === 'glow') { a = 200; if (h > 0.9) c = lite; }
    if (kind === 'leaf' && ((x % 8 === 0) || (y % 8 === 0))) c = R[1];
    if (h > 0.985) c = lite;
    const i = (y * S + x) * 4; d[i] = (c >> 16) & 255; d[i + 1] = (c >> 8) & 255; d[i + 2] = c & 255; d[i + 3] = a;
  }
  const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapNearestFilter; t.generateMipmaps = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  return t;
}
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [];
  for (const p of parts) {
    const g = p.index ? p.toNonIndexed() : p;
    const P = g.attributes.position, U = g.attributes.uv;
    for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); uv.push(U ? U.getX(i) * 2 : 0, U ? U.getY(i) * 2 : 0); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aReg', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3), 1));
  g.computeVertexNormals();
  return normalize(g);
}
const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, s = 1, rx = 0, ry = 0, rz = 0) => {
  g.scale(s, s, s); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g;
};

export interface SymbolMesh { geo: THREE.BufferGeometry; tex: THREE.DataTexture }
/** a modelled stand-in for a gene with no visible part */
export function symbolFor(id: string): SymbolMesh {
  const ico = (r: number, d = 1) => new THREE.IcosahedronGeometry(r, d);
  const sph = (r: number) => new THREE.SphereGeometry(r, 9, 7);
  switch (id) {
    case 'egg_clutch': case 'spawn': case 'egg_capsule': {
      const g: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 9; i++) { const a = i * 2.4, rr = 0.25 + (i % 3) * 0.12; const e = sph(0.2); e.scale(1, id === 'egg_capsule' ? 1.5 : 1.2, 1); g.push(at(e, Math.cos(a) * rr, (i % 3) * 0.12 - 0.1, Math.sin(a) * rr)); }
      return { geo: merge(g), tex: organTex(id === 'spawn' ? 0x9ac8b0 : id === 'egg_capsule' ? 0xc8d8a0 : 0xe8d8a8, id === 'spawn' ? 'jelly' : 'shell', 3) };
    }
    case 'live_birth': { const s = sph(0.5); s.scale(1, 1.25, 1); const k = new THREE.TorusGeometry(0.22, 0.1, 6, 12, Math.PI * 1.5); return { geo: merge([s, at(k, 0, 0, 0.1)]), tex: organTex(0xd88a8a, 'flesh', 5) }; }
    case 'brood_care': { const n = new THREE.TorusGeometry(0.5, 0.18, 6, 14); n.rotateX(Math.PI / 2); return { geo: merge([n, at(sph(0.17), 0, 0.05, 0), at(sph(0.17), 0.2, 0.05, 0.1), at(sph(0.17), -0.15, 0.05, 0.15)]), tex: organTex(0x8a6a3a, 'shell', 7) }; }
    case 'budding': return { geo: merge([at(ico(0.45, 2), 0, 0, 0), at(ico(0.3, 2), 0.55, 0.15, 0), at(ico(0.16, 1), 0.85, 0.3, 0)]), tex: organTex(0xb89ad0, 'jelly', 9) };
    case 'rapid_molt': { const s = sph(0.5); s.scale(1.2, 0.6, 1.6); return { geo: merge([s, at(sph(0.3), 0, 0.15, 0.7)]), tex: organTex(0xb89a5a, 'shell', 11) }; }
    case 'endotherm': case 'ectotherm': {
      const L = ico(0.34, 1), R2 = ico(0.34, 1), C = new THREE.ConeGeometry(0.5, 0.7, 8);
      return { geo: merge([at(L, -0.2, 0.15, 0), at(R2, 0.2, 0.15, 0), at(C, 0, -0.25, 0, 1, Math.PI), at(new THREE.CylinderGeometry(0.08, 0.1, 0.4, 6), 0.1, 0.5, 0)]), tex: organTex(id === 'endotherm' ? 0xc83a3a : 0x3a8ad8, id === 'endotherm' ? 'flesh' : 'glow', 13) };
    }
    case 'fat_stores': return { geo: merge([at(ico(0.35, 2), -0.25, 0, 0), at(ico(0.3, 2), 0.25, 0.1, 0.05), at(ico(0.28, 2), 0, -0.2, 0.2), at(ico(0.25, 2), 0.05, 0.25, -0.15)]), tex: organTex(0xe8c860, 'flesh', 15) };
    case 'ferment_gut': case 'scav_gut': return { geo: merge([new THREE.TorusKnotGeometry(0.42, 0.13, 64, 8, 2, 3)]), tex: organTex(id === 'ferment_gut' ? 0xd88a9a : 0x8a8a4a, 'flesh', 17) };
    case 'tracheal': {
      const g: THREE.BufferGeometry[] = [];
      const br = (x: number, y: number, a: number, l: number, d: number) => { if (d > 3) return; const c = new THREE.CylinderGeometry(0.05 / (d + 1) + 0.02, 0.07 / (d + 1) + 0.02, l, 6); g.push(at(c, x + Math.sin(a) * l / 2, y + Math.cos(a) * l / 2, 0, 1, 0, 0, -a)); const ex = x + Math.sin(a) * l, ey = y + Math.cos(a) * l; br(ex, ey, a - 0.5, l * 0.7, d + 1); br(ex, ey, a + 0.5, l * 0.7, d + 1); };
      br(0, -0.6, 0, 0.5, 0);
      return { geo: merge(g), tex: organTex(0xd8c8a0, 'shell', 19) };
    }
    case 'chloro_skin': { const g: THREE.BufferGeometry[] = []; for (let i = 0; i < 7; i++) { const a = i * 1.05; g.push(at(new THREE.CylinderGeometry(0.2, 0.2, 0.18, 6), i ? Math.cos(a) * 0.36 : 0, 0, i ? Math.sin(a) * 0.36 : 0)); } return { geo: merge(g), tex: organTex(0x4ab84a, 'leaf', 21) }; }
    case 'biolum': return { geo: merge([ico(0.5, 2), at(new THREE.CylinderGeometry(0.15, 0.25, 0.3, 8), 0, 0.55, 0)]), tex: organTex(0x8affc8, 'glow', 23) };
    case 'tentacles': {
      const g: THREE.BufferGeometry[] = [];
      for (let k = 0; k < 5; k++) {
        const pts: THREE.Vector3[] = []; const a0 = (k / 5) * Math.PI * 2;
        for (let i = 0; i <= 12; i++) { const t = i / 12, a = a0 + t * 2.2; pts.push(new THREE.Vector3(Math.cos(a) * (0.15 + t * 0.4), 0.4 - t * 0.9, Math.sin(a) * (0.15 + t * 0.4))); }
        g.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.07, 6));
      }
      g.push(at(ico(0.3, 1), 0, 0.45, 0));
      return { geo: merge(g), tex: organTex(0xa85ab8, 'flesh', 25) };
    }
    default: {
      // a strand of the double helix
      const g: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 14; i++) {
        const t = i / 13, a = t * Math.PI * 3, y = (t - 0.5) * 1.6;
        g.push(at(sph(0.09), Math.cos(a) * 0.35, y, Math.sin(a) * 0.35), at(sph(0.09), -Math.cos(a) * 0.35, y, -Math.sin(a) * 0.35));
        const r = new THREE.CylinderGeometry(0.03, 0.03, 0.7, 4); g.push(at(r, 0, y, 0, 1, 0, -a, Math.PI / 2));
      }
      return { geo: merge(g), tex: organTex(0x7affe0, 'glow', 27) };
    }
  }
}
/** a lit material for a symbol */
export function symbolMaterial(tex: THREE.Texture, U: RegU): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ map: tex, flatShading: true });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <map_fragment>', '#include <map_fragment>\nfloat glowA = sampledDiffuseColor.a; vec3 glowC = sampledDiffuseColor.rgb; diffuseColor.a = 1.0;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (glowA < 0.98) totalEmissiveRadiance += glowC * 1.1;');
  };
  m.customProgramCacheKey = () => 'lab-symbol';
  gbuf(m, 1);
  return regionHighlight(m, U, 'sym');
}
/** genes whose part is not worth cutting out of a body (or has no visible part at all) */
export const SYMBOLIC = new Set(['egg_clutch', 'spawn', 'egg_capsule', 'live_birth', 'brood_care', 'budding', 'rapid_molt', 'endotherm', 'ectotherm', 'fat_stores', 'ferment_gut', 'scav_gut', 'tracheal', 'chloro_skin', 'tentacles']);
void _q;
