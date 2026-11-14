// The carrier's atlas materials. One hand-painted atlas (RGBA, sRGB) plus an R8 emission mask of the same layout;
// every vertex carries a tile-space uv and the atlas rect to tile it in. The fragment wraps the uv into the rect
// and samples with the unwrapped derivatives (no mip seams at the wrap), so one texture serves the whole ship and
// each material group is one draw call. Lit windows glow in their own painted colour (emission = albedo x mask).
// Every material goes through gbuf() (ink outlines; flag 1, or 0 for small flush detail).
import * as THREE from 'three';
import { gbuf } from '../../gfx/gbuf';
import type { Bin } from '../deployKit';

export interface AtlasTex { map: THREE.DataTexture; emis: THREE.DataTexture }

export function atlasTextures(bin: Bin, rgba: Uint8Array, em: Uint8Array, W: number, H: number): AtlasTex {
  const map = new THREE.DataTexture(rgba, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  map.colorSpace = THREE.SRGBColorSpace; map.magFilter = THREE.NearestFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true; map.anisotropy = 4; map.flipY = false; map.needsUpdate = true;
  const emis = new THREE.DataTexture(em, W, H, THREE.RedFormat, THREE.UnsignedByteType);
  emis.magFilter = THREE.NearestFilter; emis.minFilter = THREE.LinearMipmapLinearFilter; emis.generateMipmaps = true; emis.flipY = false; emis.needsUpdate = true;
  bin.t(map); bin.t(emis);
  return { map, emis };
}

export interface AtlasMatOpts { phong?: boolean; shininess?: number; decal?: boolean; flag?: number; emisK?: { value: number }; side?: THREE.Side; tint?: number }

/** a lit atlas material (Lambert, or Phong for glossy parts), flat-shaded, through gbuf */
export function atlasMat(bin: Bin, T: AtlasTex, o: AtlasMatOpts = {}) {
  const base = { color: o.tint ?? 0xffffff, map: T.map, emissiveMap: T.emis, emissive: new THREE.Color(0xffffff), flatShading: true, side: o.side ?? THREE.FrontSide };
  const m = o.phong ? new THREE.MeshPhongMaterial({ ...base, shininess: o.shininess ?? 40, specular: new THREE.Color(0x3a3c3a) }) : new THREE.MeshLambertMaterial(base);
  const emisK = o.emisK ?? { value: 1.6 };
  const decal = !!o.decal;
  if (decal) { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -4; }
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uEmisK = emisK;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aRect;\nvarying vec4 vRect;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n  vRect = aRect;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vRect;\nuniform float uEmisK;')
      .replace('#include <map_fragment>', `
  vec2 aUv = vRect.xy + fract(vMapUv) * vRect.zw;
  vec2 aDx = dFdx(vMapUv) * vRect.zw, aDy = dFdy(vMapUv) * vRect.zw;
  vec4 aTex = textureGrad(map, aUv, aDx, aDy);
  ${decal ? 'if (aTex.a < 0.5) discard;' : ''}
  diffuseColor.rgb *= aTex.rgb;`)
      .replace('#include <emissivemap_fragment>', `
  totalEmissiveRadiance = aTex.rgb * textureGrad(emissiveMap, aUv, aDx, aDy).r * uEmisK;`);
  };
  const key = `carrier-atlas|${o.phong ? 'p' : 'l'}|${decal ? 'd' : 'o'}`;
  m.customProgramCacheKey = () => key;
  gbuf(m, o.flag ?? 1);
  return bin.m(m);
}
