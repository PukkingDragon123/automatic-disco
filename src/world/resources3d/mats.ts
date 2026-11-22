// The resource models' world materials: the painted tiles at 32 px/m (nearest-filtered), Lambert-lit with flat
// facets, every one through the G-buffer so the post pipeline draws the black outline round it. A solid key
// `s:ramp:step:flags` is that single palette colour; metal, gloss and glass take a Phong sheen; glowing codes emit
// (and flag the G-buffer as an emitter, so they bloom).
import * as THREE from 'three';
import { gbuf, type GFlag } from '../../gfx/gbuf';
import { RAMPS, type RampName } from '../../art/palette';
import { colorTex, emitTex, matBase, hasMat } from './paint';
import { colorOf, cFlags, code, F_EMIT, F_GLOSS, F_METAL, F_GLASS, type Code } from './codes';

export const WORLD_PPM = 32;
/** a material key's code (solids) or base code (painted tiles) */
export function keyCode(k: string): Code {
  if (k.startsWith('s:')) { const [, r, i, f] = k.split(':'); return code(r as RampName, Number(i), Number(f) || 0); }
  return matBase(k);
}
export const isSolid = (k: string) => k.startsWith('s:');
const DEF: GFlag = { value: 1 };
const DEF_E: GFlag = { value: 33 };
const cache = new WeakMap<GFlag, Map<string, THREE.Material>>();
/** the world material for a key; `flag` is the G-buffer flag object (selection / hover lighting per owner) */
export function worldMat(k: string, flag: GFlag = DEF): THREE.Material {
  let m0 = cache.get(flag); if (!m0) { m0 = new Map(); cache.set(flag, m0); }
  let m = m0.get(k);
  if (m) return m;
  const c = keyCode(k), fl = cFlags(c);
  const emits = isSolid(k) ? !!(fl & F_EMIT) : !!emitTex(k, WORLD_PPM);
  const shiny = !!(fl & (F_GLOSS | F_METAL | F_GLASS));
  const P: THREE.MeshPhongMaterialParameters & THREE.MeshLambertMaterialParameters = { flatShading: true };
  if (isSolid(k)) P.color = new THREE.Color(colorOf(c));
  else if (hasMat(k)) P.map = colorTex(k, WORLD_PPM);
  if (emits) {
    if (isSolid(k)) { P.emissive = new THREE.Color(colorOf(c)); P.emissiveIntensity = 1.3; }
    else { P.emissive = new THREE.Color(0xffffff); P.emissiveMap = emitTex(k, WORLD_PPM)!; P.emissiveIntensity = 1.2; }
  }
  if (shiny) {
    const metal = !!(fl & F_METAL);
    m = new THREE.MeshPhongMaterial({ ...P, shininess: fl & F_GLASS ? 70 : metal ? 38 : 24, specular: new THREE.Color(metal ? colorOf(c) : 0x8a8f8a).multiplyScalar(metal ? 0.55 : 0.35) });
  } else m = new THREE.MeshLambertMaterial(P);
  const f = emits ? (flag === DEF ? DEF_E : flag) : flag;
  gbuf(m, f);
  m0.set(k, m);
  return m;
}
/** meshes for built parts, under one group */
export function meshesOf(parts: { mat: string; geo: THREE.BufferGeometry }[], flag?: GFlag, shadow = true): THREE.Group {
  const g = new THREE.Group();
  for (const p of parts) { const m = new THREE.Mesh(p.geo, worldMat(p.mat, flag)); m.castShadow = shadow; m.receiveShadow = true; g.add(m); }
  return g;
}
void RAMPS;
