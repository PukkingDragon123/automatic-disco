// Standalone plants: a real flora plant (the same hero models, textures and wind) as a THREE.Object3D that can be
// parented anywhere, e.g. a grove growing on a titan's back. Built from the live world's flora when there is one (its
// species, atlas and already-built meshes: nothing new to paint), else from a small kit grown for a biome.
//
//   buildPlantObject(species, seed, lod?, opts?) -> THREE.Object3D
//     species: index into floraSpeciesFor()'s list, an archetype ('broadleaf', 'palm', 'fungus', ...), a species name, or a
//     PlantSpecies; seed picks the variant and the yaw; lod 'full' (hero mesh) or 'light' (mid-range mesh).
//     The object sways in the world wind, opens its flowers by day, follows the seasons; it casts shadows.
//     object.userData.plant = { species, height } (metres, before any scaling you apply).
//   floraSpeciesFor(biome, opts?) -> PlantSpecies[]   the species that grow there (trees first)
import * as THREE from 'three';
import { Rand, hash01 } from '../core/rand';
import { planetPalette, type Palette } from './palette';
import type { BiomeKey } from './region';
import { makeFlora, type PlantSpecies } from './plantArt';
import { GROW } from './plantStyle';
import { FloraTex } from './floraTex';
import { meshPlant, meshBarrel, meshCrystal, type PlantGeo } from './floraMesh';
import { HERO } from './floraHero';
import { plant3dMaterial } from './floraGL';
import { daylight } from '../game/daylight';

/** the live world flora registers itself here (flora.ts), so objects share its species, atlas and meshes */
interface LiveFlora { species: PlantSpecies[]; U: Record<string, THREE.IUniform>; tex: FloraTex; plantGeo(si: number, v: number, lod: number): PlantGeo | null; region: { biome: { key: string }; pal: Palette; seed: number } }
let live: LiveFlora | null = null;
export function registerLiveFlora(f: LiveFlora | null) { live = f; geoCache.clear(); matCache.clear(); }

interface Kit { key: string; species: PlantSpecies[]; tex: FloraTex; pal: Palette; U: Record<string, THREE.IUniform>; live: boolean }
const kits = new Map<string, Kit>();
const geoCache = new Map<string, PlantGeo>();
const matCache = new Map<string, { mat: THREE.Material; depth: THREE.Material }>();

const one = (r: number, g: number, b: number, a: number) => { const t = new THREE.DataTexture(new Uint8Array([r, g, b, a]), 1, 1); t.needsUpdate = true; return t; };
/** uniforms that make a plant independent of the world's maps: fully visible, no moss, no push field, never culled */
function ownUniforms(base: Record<string, THREE.IUniform>): Record<string, THREE.IUniform> {
  return {
    ...base,
    uN: { value: 1 }, uMoss: { value: one(0, 0, 0, 255) }, uVis: { value: one(255, 255, 255, 255) }, uField: { value: one(128, 128, 0, 255) },
    uCamPos: { value: new THREE.Vector3(1e7, 1e7, 1e7) }, uCut: { value: new THREE.Vector4(0, 1, 1, 0) }, uFocus: { value: new THREE.Vector3() },
    uState: base.uState ?? { value: one(255, 0, 0, 255) },
  };
}
function kitFor(biome?: BiomeKey, planetSeed?: number): Kit {
  if (live && (!biome || biome === live.region.biome.key) && (planetSeed === undefined || planetSeed === live.region.seed)) {
    const key = 'live';
    let k = kits.get(key);
    if (!k || k.species !== live.species) { k = { key, species: live.species, tex: live.tex, pal: live.region.pal, U: ownUniforms(live.U), live: true }; kits.set(key, k); }
    return k;
  }
  const b = biome ?? 'jungle', s = planetSeed ?? 1, key = `${b}:${s}`;
  let k = kits.get(key);
  if (k) return k;
  const pal = planetPalette(s), species = makeFlora(pal, b, s), tex = new FloraTex(s);
  // the kit's own clock, wind and daylight (driven from onBeforeRender), seasons left neutral
  const U: Record<string, THREE.IUniform> = ownUniforms({
    uTime: { value: 0 }, uDay: { value: 1 }, uWind: { value: 1 }, uWindDir: { value: new THREE.Vector2(0.8, 0.6) }, uBark: { value: tex.bark },
    uDark: { value: new THREE.Color(0x07080c) }, uGraftCol: { value: [0, 1, 2, 3].map(() => new THREE.Color(0x6affd8)) },
    uBloom: { value: Array.from({ length: 8 }, (_, i) => new THREE.Color(pal.bloom[i % pal.bloom.length]).convertSRGBToLinear()) },
    uSeasonA: { value: new THREE.Vector4(0, 0, 0, 0) }, uSeasonB: { value: new THREE.Vector4(0, 0, 0, 0) },
    uAutumn: { value: [0xc36530, 0xd8ac5b, 0xbf6346, 0x833b4e].map((c) => new THREE.Color(c)) },
    uLean: { value: 0 }, uHComp: { value: 1 }, uCamRight: { value: new THREE.Vector3(1, 0, 0) }, uCamBack: { value: new THREE.Vector3(0, 0, 1) },
    // a standalone plant is seen up close: its crown keeps the leaf-card fringe
    uFringe: { value: 1 },
  });
  k = { key, species, tex, pal, U, live: false };
  kits.set(key, k);
  return k;
}

/** the species that grow in a biome (the live world's when it matches), trees first */
export function floraSpeciesFor(biome?: BiomeKey, opts: { planetSeed?: number } = {}): PlantSpecies[] { return sorted(kitFor(biome, opts.planetSeed)); }
const sorted = (k: Kit) => [...k.species].sort((a, b) => +b.tree - +a.tree || b.hmax - a.hmax || a.id - b.id);

function resolve(k: Kit, sp: number | string | PlantSpecies): PlantSpecies {
  if (typeof sp === 'object') return k.species.find((s) => s.id === sp.id && s.arch === sp.arch) ?? sp;
  if (typeof sp === 'number') { const l = sorted(k); return l[((sp % l.length) + l.length) % l.length]; }
  return k.species.find((s) => s.arch === sp || s.name === sp) ?? k.species.find((s) => s.tree) ?? k.species[0];
}

/** a standalone plant; see the file header */
export function buildPlantObject(species: number | string | PlantSpecies, seed: number, lod: 'full' | 'light' = 'full', opts: { biome?: BiomeKey; planetSeed?: number; shadows?: boolean } = {}): THREE.Object3D {
  const k = kitFor(opts.biome, opts.planetSeed), sp = resolve(k, species), si = k.species.indexOf(sp), v = ((seed % 4) + 4) % 4, L = lod === 'full' ? 0 : 1;
  const gkey = `${k.key}|${si}|${v}|${L}`;
  let pg = geoCache.get(gkey) ?? null;
  if (!pg && k.live && live) pg = live.plantGeo(si, v, L);
  if (!pg) {
    // grown and meshed here (the kit's own atlas fills as needed)
    const h = sp.hmin + (sp.hmax - sp.hmin) * (v / 3), r = new Rand(sp.id * 7919 + v * 104729 + 3), mseed = sp.id * 17 + v;
    const grow = GROW[sp.arch];
    if (grow) pg = meshPlant(grow(sp, h, r, k.pal).normalize(), sp, k.tex, mseed, undefined, L);
    else if (HERO[sp.arch]) pg = HERO[sp.arch](sp, h, k.tex, mseed, L);
    else pg = sp.arch === 'barrel' ? meshBarrel(sp, h, k.tex, mseed) : meshCrystal(sp, h, k.tex, mseed, k.pal);
    if (!k.live) k.tex.finish();
  }
  geoCache.set(gkey, pg);
  pg.geo.computeBoundingSphere();
  let m = matCache.get(gkey);
  if (!m) {
    const flexK: Record<string, number> = { tuft: 0.5, reed: 0.4, fern: 0.26, shrub: 0.12, palm: 0.06, bloom: 0.3, spike: 0.3, bulb: 0.3, lure: 0.2 };
    const decid = sp.arch === 'broadleaf' || sp.arch === 'umbrella' || sp.arch === 'shrub' || sp.arch === 'weeper' || sp.arch === 'bloom';
    m = plant3dMaterial(k.U, k.tex.tex, { uH: pg.H, uFlex: flexK[sp.arch] ?? 0.04, uPushK: 0, lod: { value: new THREE.Vector4(-2, -1, 1e9, 1e9 + 1) }, decid, fungus: sp.arch === 'fungus', small: !sp.tree && sp.hmax < 1.55 });
    matCache.set(gkey, m);
  }
  // one instance at the object's own origin: the instance record is the object's, the geometry the species'
  const g = new THREE.InstancedBufferGeometry();
  g.index = pg.geo.index;
  for (const [name, a] of Object.entries(pg.geo.attributes)) g.setAttribute(name, a);
  g.setAttribute('iA', new THREE.InstancedBufferAttribute(new Float32Array([0, 0, 0, hash01(seed, 5, 41) * Math.PI * 2]), 4));
  g.setAttribute('iB', new THREE.InstancedBufferAttribute(new Float32Array([1, -1, hash01(seed, 7, 1), 1]), 4));
  g.instanceCount = 1;
  g.boundingSphere = pg.geo.boundingSphere?.clone() ?? null;
  const mesh = new THREE.Mesh(g, m.mat);
  mesh.customDepthMaterial = m.depth as THREE.MeshDepthMaterial;
  mesh.castShadow = opts.shadows ?? sp.hmax > 0.8; mesh.receiveShadow = true;
  mesh.name = `plant:${sp.arch}:${v}`;
  if (!k.live) {
    // a kit has no world flora driving its clock: the plant keeps its own time and follows the daylight
    mesh.onBeforeRender = () => { k.U.uTime.value = performance.now() / 1000; k.U.uDay.value = daylight.k; };
  }
  mesh.userData.plant = { species: sp, height: pg.H };
  return mesh;
}
