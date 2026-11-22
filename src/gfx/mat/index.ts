// THE MATERIAL LIBRARY (V7.md "MATERIAL LIBRARY"). Limbophobia's whole texture library (same author), ported: its pixel
// toolkit (pixel.ts), the atlas and the close-up HD atlas (atlas.ts, textures/hd.ts), the core surfaces (textures/*)
// and every surface painter its modules register (lib/<Limbophobia path>: walls, floors, carpet, tile, wood, metal,
// fabric, concrete, glass, doors, decals, debris, furniture finishes, ...), plus a sci-fi and industrial set painted the
// same way (scifi.ts). ALL AGENTS USE matTex / matMaterial; NO NEW HAND-ROLLED TEXTURE PAINTERS (add a painter here
// with addTextureModule + atlas().add if a material is missing, in Limbophobia's method).
//
//   matTex(name, { hd })        a nearest-filtered, repeating THREE.Texture; one repeat = w/32 x h/32 metres (32 px/m),
//                               hd 2 | 4 = the close-up version (Scale2x + re-dithered fields + the material's fine layer)
//   matMaterial(name, opts)     a ready lit material (Lambert, gbuf'd) that maps the texture at 32 px/m on ANY geometry:
//                               uv 'box' (default: object space, scale-aware, faces pick their axis), 'world' (world
//                               space, so walls line up across meshes; `origin` sets where v = 0 meets the floor),
//                               'uv' (the geometry's own uvs x `repeat`, for decals and cards)
//   MAT_NAMES, MAT_FAMILIES     every registered name; curated families of the surface materials (catalog: ?test=mats)
//   matInfo(name)               { w, h, mw, mh } texels and metres per repeat
//   matPixels(name, hd) / matCanvas(name, { hd, scale })   the painted pixels, for 2D UI
import * as THREE from 'three';
import { atlas, PX_PER_M } from './atlas';
import { registerAllTextures, addTextureModule } from './textures/index';
import { paintHd } from './textures/hd';
import { PixelCanvas } from './pixel';
import { Rng, hashStr } from './rng';
import { gbuf } from '../gbuf';
import './lib/index';
import { SCIFI_MATS } from './scifi';

export { atlas, PX_PER_M, addTextureModule, paintHd, PixelCanvas, SCIFI_MATS };
export { makeRamp, mixHex, scaleHex, ph, toRGB, toHex } from './pixel';
export { Rng, hashStr, tileFbm, tileNoise2 } from './rng';
export { nz, q, scuff, flecks, blob, over, grooveH, grooveV } from './lib/content/textures/kit';

/** close-up density: 1 = the base 32 px/m (distant world), 2 or 4 = the HD version (anything seen up close) */
export type MatHd = 1 | 2 | 4;

/** every registered material name (the atlas' internal ones left out) */
export const MAT_NAMES: string[] = [];
function ensure() {
  registerAllTextures();
  if (MAT_NAMES.length !== atlas().names().length) {
    MAT_NAMES.length = 0;
    for (const n of atlas().names()) if (n !== 'white' && n !== 'missing') MAT_NAMES.push(n);
  }
}
ensure();

/** the surface families (regex over the names; first match wins), in catalog order */
const FAMILY_RULES: [string, RegExp][] = [
  ['metal', /metal|steel|iron|chrome|brass|copper|alu|grate|rust|zinc|tin_|galvan|machined|anodis|_pipe|vent|radiator|locker|duct/],
  ['wall', /^wall_|drywall|wallpaper|plaster|_wall/],
  ['floor', /floor|carpet|linoleum|terrazzo|checker|rug|deck/],
  ['tile', /tile|porcelain|marble|enamel|ceramic|glaze/],
  ['wood', /wood|plank|bark|crate|pallet|cardboard|timber|veneer|kennel|board/],
  ['fabric', /fabric|cloth|curtain|upholst|leather|towel|mattress|pillow|foam|felt|canvas|tent|quilt|blanket|weave|denim|cushion/],
  ['stone', /concrete|cinder|brick|stone|asphalt|sidewalk|gravel|sand|dirt|soil|mud|rock|granite|clay|plaster/],
  ['ground', /grass|leaves|moss|hedge|turf|water/],
  ['glass', /glass|window|mirror|lens/],
  ['plastic', /plastic|rubber|pvc|vinyl|carbon|composite|foil/],
  ['paper', /paper|book|poster|card|label|doc/],
  ['debris', /dbr_|debris|rubble|dmg_|decal|stain|ash|soot|crust|burn|blood|gore/],
];
/** curated families for picking and the catalog: opaque, tiling surface materials only (signs, screens, faces left out) */
export const MAT_FAMILIES: Record<string, string[]> = { scifi: [...SCIFI_MATS] };
const SURFACE_SKIP = /sign|screen|label|logo|_text|poster|face|eye|mouth|tooth|led|digit|_icon|photo|portrait|clock|crt|_menu|font|button|dial|arrow|number|plate_no|ao$|^detail_/;
function families() {
  for (const k of Object.keys(MAT_FAMILIES)) if (k !== 'scifi') delete MAT_FAMILIES[k];
  for (const [k] of FAMILY_RULES) MAT_FAMILIES[k] = [];
  for (const n of MAT_NAMES) {
    if (SCIFI_MATS.includes(n) || SURFACE_SKIP.test(n)) continue;
    const d = atlas().def(n);
    if (!d || d.w < 8 || d.h < 8) continue;
    for (const [k, re] of FAMILY_RULES) if (re.test(n)) { MAT_FAMILIES[k].push(n); break; }
  }
}
families();

/** texels and metres per repeat of a material */
export function matInfo(name: string): { w: number; h: number; mw: number; mh: number } | null {
  ensure();
  const d = atlas().def(name);
  return d ? { w: d.w, h: d.h, mw: d.mw ?? d.w / PX_PER_M, mh: d.mh ?? d.h / PX_PER_M } : null;
}

const pixCache = new Map<string, { w: number; h: number; data: Uint8ClampedArray | Uint8Array; alpha: boolean }>();
/** a material's painted RGBA (row 0 at the top); hd 2 | 4 gives the close-up version */
export function matPixels(name: string, hd: MatHd = 1): { w: number; h: number; data: Uint8ClampedArray | Uint8Array; alpha: boolean } {
  ensure();
  const key = name + '|' + hd;
  let p = pixCache.get(key);
  if (p) return p;
  if (hd === 1) {
    let d = atlas().def(name);
    if (!d) { console.warn('matTex: no material', name); atlas().get(name); d = atlas().def(name)!; }
    const pc = new PixelCanvas(d.w, d.h);
    d.draw(pc, new Rng(hashStr(name)));
    let alpha = false;
    for (let i = 3; i < pc.data.length; i += 4) if (pc.data[i] < 250) { alpha = true; break; }
    p = { w: d.w, h: d.h, data: pc.data, alpha };
  } else {
    const b = matPixels(name, 1);
    const data = paintHd(b.data, b.w, b.h, name, hd), W = b.w * hd;
    // cut-outs keep their alpha (nearest from the base texel)
    if (b.alpha) for (let y = 0; y < b.h * hd; y++) for (let x = 0; x < W; x++) data[(y * W + x) * 4 + 3] = b.data[((Math.floor(y / hd)) * b.w + Math.floor(x / hd)) * 4 + 3];
    p = { w: W, h: b.h * hd, data, alpha: b.alpha };
  }
  pixCache.set(key, p);
  return p;
}

const texCache = new Map<string, THREE.DataTexture>();
/**
 * A material as a nearest-filtered, repeating texture. One repeat covers matInfo(name).mw x mh metres (32 px/m at hd 1;
 * the HD versions cover the same metres with 2x / 4x the texels). Row 0 of the painting is the top of the texture (v = 1),
 * so a wall's skirting sits at v = 0. Shared and cached: do not dispose.
 */
export function matTex(name: string, o: { hd?: MatHd } = {}): THREE.DataTexture {
  const hd = o.hd ?? 1, key = name + '|' + hd;
  let t = texCache.get(key);
  if (t) return t;
  const p = matPixels(name, hd), info = matInfo(name)!;
  const flipped = new Uint8Array(p.w * p.h * 4);
  for (let y = 0; y < p.h; y++) flipped.set(p.data.subarray((p.h - 1 - y) * p.w * 4, (p.h - y) * p.w * 4), y * p.w * 4);
  t = new THREE.DataTexture(flipped, p.w, p.h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter; t.generateMipmaps = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  t.name = 'mat:' + name + (hd > 1 ? '@' + hd : '');
  t.userData = { mat: name, hd, mw: info.mw, mh: info.mh, alpha: p.alpha };
  t.needsUpdate = true;
  texCache.set(key, t);
  return t;
}

/** a material's pixels on a canvas (2D UI): `scale` whole-pixel upscale */
export function matCanvas(name: string, o: { hd?: MatHd; scale?: number } = {}): HTMLCanvasElement {
  const p = matPixels(name, o.hd ?? 1), s = Math.max(1, Math.round(o.scale ?? 1));
  const c = document.createElement('canvas'); c.width = p.w; c.height = p.h;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.w, p.h), 0, 0);
  if (s === 1) return c;
  const c2 = document.createElement('canvas'); c2.width = p.w * s; c2.height = p.h * s;
  const g = c2.getContext('2d')!; g.imageSmoothingEnabled = false; g.drawImage(c, 0, 0, c2.width, c2.height);
  return c2;
}

export interface MatOpts {
  /** 1 (default) = 32 px/m; 2 | 4 = the close-up HD version (interiors, UI 3D elements, anything within a few metres) */
  hd?: MatHd;
  /** 'box' (default): object space, scale-aware; 'world': world space from `origin`; 'uv': the geometry's uvs x `repeat` */
  uv?: 'box' | 'world' | 'uv';
  /** texel density multiplier on the metres per repeat (1 = the painted 32 px/m; 0.5 = twice as fine) */
  scale?: number;
  /** shift in metres (u, v) */
  offset?: [number, number];
  /** 'world' mode: the world point where u = v = 0 (a wall's skirting meets the floor at origin.y) */
  origin?: THREE.Vector3;
  /** 'uv' mode: repeats across the geometry's 0..1 uvs */
  repeat?: [number, number];
  /** a quarter turn (planks / grain the other way) */
  rot?: boolean;
  color?: number | THREE.Color;
  side?: THREE.Side;
  transparent?: boolean; opacity?: number; alphaTest?: number; depthWrite?: boolean;
  /** G-buffer flag (outline etc., src/gfx/gbuf.ts): default 1, 0 for transparent */
  flag?: number;
  emissive?: number; emissiveIntensity?: number;
  /** area-light gloss 0..1 (src/gfx/gbuf.ts areaLit) */
  gloss?: number;
  /** a Phong material (a specular glint from the scene's point / directional lights) instead of Lambert */
  phong?: boolean; shininess?: number; specular?: number;
}

const VERT_DECL = /* glsl */`
varying vec3 vMatP;
varying vec3 vMatN;
uniform vec3 uMatOrigin;
`;
const VERT_MAIN = /* glsl */`
#if MAT_MODE == 1
  vec4 mW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    mW = instanceMatrix * mW;
  #endif
  mW = modelMatrix * mW;
  vMatP = mW.xyz - uMatOrigin;
  vMatN = mat3(modelMatrix) * objectNormal;
#elif MAT_MODE == 0
  vec3 mS = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
  vMatP = transformed * mS;
  vMatN = objectNormal / max(mS, vec3(1e-4));
#endif
`;
const FRAG_DECL = /* glsl */`
varying vec3 vMatP;
varying vec3 vMatN;
uniform vec2 uMatRep;
uniform vec2 uMatOff;
uniform vec2 uMatUV;
// the face's projection: top / bottom faces take xz, the others whichever side axis they face
vec2 matProj(vec3 p, int ax, vec3 n) {
  if (ax == 1) return vec2(p.x, n.y < 0.0 ? p.z : -p.z);
  if (ax == 0) return vec2(n.x < 0.0 ? p.z : -p.z, p.y);
  return vec2(n.z < 0.0 ? -p.x : p.x, p.y);
}
`;
const FRAG_MAP = /* glsl */`
#ifdef USE_MAP
  #if MAT_MODE == 2
    vec4 sampledDiffuseColor = texture2D(map, vMapUv * uMatUV);
  #else
    vec3 mA = abs(vMatN);
    int mAx = (mA.y >= mA.x && mA.y >= mA.z) ? 1 : (mA.x >= mA.z ? 0 : 2);
    vec2 mUV = (matProj(vMatP, mAx, vMatN) + uMatOff) / uMatRep;
    vec2 mGX = matProj(dFdx(vMatP), mAx, vMatN) / uMatRep, mGY = matProj(dFdy(vMatP), mAx, vMatN) / uMatRep;
    #ifdef MAT_ROT
      mUV = mUV.yx; mGX = mGX.yx; mGY = mGY.yx;
    #endif
    vec4 sampledDiffuseColor = textureGrad(map, mUV, mGX, mGY);
  #endif
  diffuseColor *= sampledDiffuseColor;
#endif
`;

/**
 * A ready lit material for a library texture at 32 px per metre on any geometry (see MatOpts), through gbuf (so it joins
 * the G-buffer: outlines, area lights). Not cached: each call makes its own material (the texture is shared).
 */
export function matMaterial(name: string, o: MatOpts = {}): THREE.MeshLambertMaterial | THREE.MeshPhongMaterial {
  const map = matTex(name, { hd: o.hd ?? 1 });
  const info = matInfo(name)!;
  // painted alpha (decals, frost, soot) blends by default; pass transparent: false for a cut-out (alpha-tested at 0.5)
  const alpha = !!map.userData.alpha, transparent = o.transparent ?? alpha;
  const base = {
    map, color: o.color ?? 0xffffff, side: o.side ?? THREE.FrontSide,
    transparent, opacity: o.opacity ?? 1, alphaTest: o.alphaTest ?? (alpha ? (transparent ? 0.02 : 0.5) : 0),
    depthWrite: o.depthWrite ?? !transparent,
    emissive: o.emissive ?? 0x000000, emissiveIntensity: o.emissiveIntensity ?? 1,
  };
  const m = o.phong ? new THREE.MeshPhongMaterial({ ...base, shininess: o.shininess ?? 24, specular: o.specular ?? 0x2a2a2a }) : new THREE.MeshLambertMaterial(base);
  const mode = o.uv === 'world' ? 1 : o.uv === 'uv' ? 2 : 0;
  const k = o.scale ?? 1;
  const U = {
    uMatRep: { value: new THREE.Vector2(info.mw * k, info.mh * k) },
    uMatOff: { value: new THREE.Vector2(...(o.offset ?? [0, 0])) },
    uMatUV: { value: new THREE.Vector2(...(o.repeat ?? [1, 1])) },
    uMatOrigin: { value: (o.origin ?? new THREE.Vector3()).clone() },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.defines = { ...(sh.defines || {}), MAT_MODE: mode, ...(o.rot ? { MAT_ROT: 1 } : {}) };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_DECL)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_MAIN);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_DECL)
      .replace('#include <map_fragment>', FRAG_MAP);
  };
  m.customProgramCacheKey = () => 'mat|' + mode + (o.rot ? 'r' : '');
  m.userData.mat = name; m.userData.matU = U;
  if (o.gloss !== undefined) m.userData.gloss = o.gloss;
  m.name = 'mat:' + name;
  return gbuf(m, o.flag ?? (transparent ? 0 : 1));
}

/** move a 'world' material's origin (e.g. a room built at a new place) */
export function matOrigin(m: THREE.Material, origin: THREE.Vector3) { const U = m.userData.matU; if (U) U.uMatOrigin.value.copy(origin); }
