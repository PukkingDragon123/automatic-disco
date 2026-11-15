// Anatomy-built models (the titans and every species with a builder recipe) build off the main thread.
// buildSpeciesModel gets a placeholder at once (the same pieces as cages on a palette page of hard-stepped flat
// colours, the same rig), while a Web Worker (a small pool) builds the full model; the result is cached in IndexedDB
// by what the model depends on and a version, so a return visit is instant. When it lands, the real geometry, page
// and rig patches are swapped into every live instance in place (the mesh, skeleton and Animator keep their
// identity), and the placeholder stays on as the far level of detail. Dev sheets (zoo.html, check.html) and
// environments without workers build synchronously.
import * as THREE from 'three';
import type { Design } from '../design';
import type { Rig } from '../morph';
import type { V3 } from '../kit';
import { Body } from '../anatomy/core';
import { sculptAnatomy, isTitan } from './builders';
import { packTitan, unpackGeo, unpackTex, patchRig, type TitanPayload } from './pack';

const VERSION = 'anat-5';
export const TITAN_BUILD = { mode: (typeof location !== 'undefined' && /(zoo|check)\.html/.test(location.pathname)) || typeof Worker === 'undefined' ? 'sync' : 'async' as 'sync' | 'async' };
/** a model the async build can upgrade: its live instances, and the hook that grows anything they carry */
export interface Upgradable {
  rig: Rig; geo: THREE.BufferGeometry; tex: THREE.DataTexture; inverses: THREE.Matrix4[]; depthMat: THREE.MeshDepthMaterial; restWorld: V3[];
  live?: Set<{ mesh: THREE.SkinnedMesh; bones: THREE.Bone[]; grow: () => void }>; ready?: boolean;
  /** the far level of detail (the quick build), with its own shadow material */
  far?: { geo: THREE.BufferGeometry; tex: THREE.DataTexture; depthMat: THREE.MeshDepthMaterial };
}

/** what a model depends on: the species, its seed, its proportions, genes and colours */
const keyOf = (d: Design) => `${VERSION}:${d.beast ?? d.plan}:${d.seed}:${[d.size, d.len, d.girth, d.legLen, d.legThick, d.neck, d.head, d.tail].map((v) => v.toFixed(4)).join(',')}:${[...d.genes].sort().join('+')}:${Object.values(d.colors).join(',')}:${d.pattern}:${d.patScale.toFixed(3)}:${d.cover}`;
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
// a small pool of workers, each taking the next job as it frees up (titans first: they are the slowest to wait for)
interface Job { id: number; d: Design; res: (p: TitanPayload | null) => void; titan: boolean }
const POOL = Math.max(1, Math.min(3, ((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4) - 2));
const workers: { w: Worker; busy: Job | null }[] = [];
const queue: Job[] = [];
let seq = 1, broken = false;
function pump() {
  if (broken) { for (const j of queue.splice(0)) j.res(null); return; }
  while (queue.length) {
    let slot = workers.find((s) => !s.busy);
    if (!slot && workers.length < POOL) {
      try {
        const w = new Worker(new URL('./build.worker.ts', import.meta.url), { type: 'module' }), s = { w, busy: null as Job | null };
        w.onmessage = (e: MessageEvent<{ id: number; payload?: TitanPayload; error?: string }>) => { const j = s.busy; s.busy = null; if (e.data.error) console.warn('model worker:', e.data.error); if (j && j.id === e.data.id) j.res(e.data.payload ?? null); pump(); };
        w.onerror = (e) => { console.warn('model worker failed', e.message); const j = s.busy; s.busy = null; j?.res(null); broken = true; pump(); };
        workers.push(s); slot = s;
      } catch { broken = true; pump(); return; }
    }
    if (!slot) return;
    queue.sort((a, b) => Number(b.titan) - Number(a.titan));
    const j = queue.shift()!;
    slot.busy = j;
    slot.w.postMessage({ id: j.id, d: JSON.parse(JSON.stringify(j.d)) });
  }
}
const viaWorker = (d: Design) => new Promise<TitanPayload | null>((res) => { queue.push({ id: seq++, d, res, titan: isTitan(d) }); pump(); });
/** on the main thread, a frame later (no worker available) */
const onMain = (d: Design, rig: Rig) => new Promise<TitanPayload>((res) => setTimeout(() => {
  const r2 = structuredClone(rig) as Rig, rest = restOf(r2), out = sculptAnatomy(d, r2, rest);
  res(packTitan(out.geo, out.tex, r2));
}, 0));
const restOf = (rig: Rig): V3[] => { const rest: V3[] = rig.bones.map(() => [0, 0, 0]); rig.bones.forEach((bn, i) => { const p = bn.parent >= 0 ? rest[bn.parent] : [0, 0, 0]; rest[i] = [p[0] + bn.pos[0], p[1] + bn.pos[1], p[2] + bn.pos[2]]; }); return rest; };

/** the quick build of a model (placeholder and far LOD): cages on a palette page */
export function quickModel(d: Design, rig: Rig, rest: V3[]) {
  Body.quick = true;
  try { const o = sculptAnatomy(d, rig, rest); delete o.geo.userData.grove; return o; } finally { Body.quick = false; }
}
const farOf = (o: { geo: THREE.BufferGeometry; tex: THREE.DataTexture }) => ({ geo: o.geo, tex: o.tex, depthMat: new THREE.MeshDepthMaterial({ map: o.tex, alphaTest: 0.5, depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide }) });

/** the sculpt for buildSpeciesModel: the full model now (sync mode), or a placeholder now and an upgrade later */
export function anatomyModel(d: Design, rig: Rig, rest: V3[], upgrade: () => Upgradable): { geo: THREE.BufferGeometry; tex: THREE.DataTexture; far?: Upgradable['far'] } {
  if (TITAN_BUILD.mode === 'sync') {
    // the far LOD is built against its own copy of the rig, so its patches never touch the full model's
    const r2 = structuredClone(rig) as Rig, far = quickModel(d, r2, restOf(r2));
    const o = sculptAnatomy(d, rig, rest);
    return { geo: o.geo, tex: o.tex, far: farOf(far) };
  }
  const rig0 = structuredClone(rig) as Rig; // the untouched rig, for a main-thread fallback build
  const ph = quickModel(d, rig, rest);
  const key = keyOf(d);
  (async () => {
    let p = await cacheGet(key);
    if (!p) { p = (await viaWorker(d)) ?? (await onMain(d, rig0)); if (p) void cachePut(key, p); }
    if (p) applyTitan(upgrade(), p);
  })();
  return { geo: ph.geo, tex: ph.tex };
}
/** the titans' name for it */
export const titanModel = anatomyModel;
/** swap the full model into a placeholder model and every live instance of it; the placeholder becomes the far LOD */
export function applyTitan(m: Upgradable, p: TitanPayload) {
  patchRig(m.rig, p);
  const rest = restOf(m.rig);
  rest.forEach((r, i) => { m.restWorld[i] = r; m.inverses[i].makeTranslation(-r[0], -r[1], -r[2]); });
  const old = m.geo, oldTex = m.tex;
  m.geo = unpackGeo(p); m.tex = unpackTex(p);
  m.depthMat.map = m.tex; m.depthMat.needsUpdate = true;
  m.far = farOf({ geo: old, tex: oldTex });
  for (const inst of m.live ?? []) {
    inst.mesh.geometry = m.geo;
    const mat = inst.mesh.material as THREE.MeshLambertMaterial; mat.map = m.tex; mat.needsUpdate = true;
    m.rig.bones.forEach((b, i) => inst.bones[i].position.set(b.pos[0], b.pos[1], b.pos[2]));
    inst.grow();
  }
  m.live = undefined; m.ready = true;
}
