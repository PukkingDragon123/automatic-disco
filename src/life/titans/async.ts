// Titans build off the main thread. buildSpeciesModel gets a placeholder at once (the same cages at cage level, a
// flat stone-grey silhouette, the same rig), while a Web Worker builds the full model; the result is cached in
// IndexedDB by species, seed and version, so a return visit is instant. When it lands, the real geometry, page and
// rig patches are swapped into every live instance in place (the mesh, skeleton and Animator keep their identity).
// Dev sheets (zoo.html, check.html) and environments without workers build synchronously.
import * as THREE from 'three';
import type { Design } from '../design';
import type { Rig } from '../morph';
import type { V3 } from '../kit';
import { Body } from '../anatomy/core';
import { sculptTitan } from './builders';
import { packTitan, unpackGeo, unpackTex, patchRig, type TitanPayload } from './pack';

const VERSION = 'titan-2';
export const TITAN_BUILD = { mode: (typeof location !== 'undefined' && /(zoo|check)\.html/.test(location.pathname)) || typeof Worker === 'undefined' ? 'sync' : 'async' as 'sync' | 'async' };
/** a model the async build can upgrade: its live instances, and the hook that grows anything they carry */
export interface Upgradable {
  rig: Rig; geo: THREE.BufferGeometry; tex: THREE.DataTexture; inverses: THREE.Matrix4[]; depthMat: THREE.MeshDepthMaterial; restWorld: V3[];
  live?: Set<{ mesh: THREE.SkinnedMesh; bones: THREE.Bone[]; grow: () => void }>; ready?: boolean;
}

const keyOf = (d: Design) => `${VERSION}:${d.beast}:${d.seed}:${[d.size, d.len, d.girth, d.legLen, d.legThick, d.neck, d.head, d.tail].map((v) => v.toFixed(4)).join(',')}`;
let dbP: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (dbP) return dbP;
  return (dbP = new Promise((res) => {
    try {
      if (typeof indexedDB === 'undefined') return res(null);
      const q = indexedDB.open('oddworld-models', 1);
      q.onupgradeneeded = () => q.result.createObjectStore('titans');
      q.onsuccess = () => res(q.result); q.onerror = () => res(null);
    } catch { res(null); }
  }));
}
async function cacheGet(key: string): Promise<TitanPayload | null> {
  const d = await db(); if (!d) return null;
  return new Promise((res) => { try { const q = d.transaction('titans').objectStore('titans').get(key); q.onsuccess = () => res((q.result as TitanPayload) ?? null); q.onerror = () => res(null); } catch { res(null); } });
}
async function cachePut(key: string, p: TitanPayload) {
  const d = await db(); if (!d) return;
  try { d.transaction('titans', 'readwrite').objectStore('titans').put(p, key); } catch { /* quota: the next visit rebuilds */ }
}
let worker: Worker | null = null, seq = 1;
const waiting = new Map<number, (p: TitanPayload | null) => void>();
function viaWorker(d: Design): Promise<TitanPayload | null> {
  try {
    if (!worker) {
      worker = new Worker(new URL('./build.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<{ id: number; payload?: TitanPayload; error?: string }>) => { const f = waiting.get(e.data.id); waiting.delete(e.data.id); if (e.data.error) console.warn('titan worker:', e.data.error); f?.(e.data.payload ?? null); };
      worker.onerror = (e) => { console.warn('titan worker failed', e.message); for (const f of waiting.values()) f(null); waiting.clear(); worker = null; };
    }
    const id = seq++;
    return new Promise((res) => { waiting.set(id, res); worker!.postMessage({ id, d: JSON.parse(JSON.stringify(d)) }); });
  } catch { return Promise.resolve(null); }
}
/** on the main thread, a frame later (no worker available) */
const onMain = (d: Design, rig: Rig) => new Promise<TitanPayload>((res) => setTimeout(() => {
  const r2 = structuredClone(rig) as Rig, rest = restOf(r2), out = sculptTitan(d, r2, rest);
  res(packTitan(out.geo, out.tex, r2));
}, 0));
const restOf = (rig: Rig): V3[] => { const rest: V3[] = rig.bones.map(() => [0, 0, 0]); rig.bones.forEach((bn, i) => { const p = bn.parent >= 0 ? rest[bn.parent] : [0, 0, 0]; rest[i] = [p[0] + bn.pos[0], p[1] + bn.pos[1], p[2] + bn.pos[2]]; }); return rest; };

/** the sculpt for buildSpeciesModel: the full model now (sync mode), or a placeholder now and an upgrade later */
export function titanModel(d: Design, rig: Rig, rest: V3[], upgrade: () => Upgradable): { geo: THREE.BufferGeometry; tex: THREE.DataTexture } {
  if (TITAN_BUILD.mode === 'sync') { const o = sculptTitan(d, rig, rest); return { geo: o.geo, tex: o.tex }; }
  const rig0 = structuredClone(rig) as Rig; // the untouched rig, for a main-thread fallback build
  Body.quick = true;
  let ph: ReturnType<typeof sculptTitan>;
  try { ph = sculptTitan(d, rig, rest); } finally { Body.quick = false; }
  delete ph.geo.userData.grove;
  const key = keyOf(d);
  (async () => {
    let p = await cacheGet(key);
    if (!p) { p = (await viaWorker(d)) ?? (await onMain(d, rig0)); if (p) void cachePut(key, p); }
    if (p) applyTitan(upgrade(), p);
  })();
  return { geo: ph.geo, tex: ph.tex };
}
/** swap the full model into a placeholder model and every live instance of it */
export function applyTitan(m: Upgradable, p: TitanPayload) {
  patchRig(m.rig, p);
  const rest = restOf(m.rig);
  rest.forEach((r, i) => { m.restWorld[i] = r; m.inverses[i].makeTranslation(-r[0], -r[1], -r[2]); });
  const old = m.geo, oldTex = m.tex;
  m.geo = unpackGeo(p); m.tex = unpackTex(p);
  m.depthMat.map = m.tex; m.depthMat.needsUpdate = true;
  for (const inst of m.live ?? []) {
    inst.mesh.geometry = m.geo;
    const mat = inst.mesh.material as THREE.MeshLambertMaterial; mat.map = m.tex; mat.needsUpdate = true;
    m.rig.bones.forEach((b, i) => inst.bones[i].position.set(b.pos[0], b.pos[1], b.pos[2]));
    inst.grow();
  }
  m.live = undefined; m.ready = true;
  old.dispose(); oldTex.dispose();
}
