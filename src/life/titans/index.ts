// The titans: hero creatures built whole from the anatomy library (src/life/anatomy), skinned to the rig that
// morph.ts gives every bestiary quadruped or hexapod, so the shared Animator, its gaits and the titans' stomp work
// unchanged. sculpt.ts hands a titan's design here.
import * as THREE from 'three';
import { buildPlantObject, floraSpeciesFor } from '../../world/floraObject';
import type { BiomeKey } from '../../world/region';
export { TITANS, isTitan, sculptTitan, isAnatomy, sculptAnatomy, type TitanSculpt } from './builders';
export { titanModel, anatomyModel, quickModel, TITAN_BUILD } from './async';

/** where a titan carries growth (the Grovebacker's grove): a bone, the seat's offset from that bone's rest position,
 *  the ground's up direction, the plant's intended height (m) and its age class. Read from geo.userData.grove. */
export interface GroveSeat { bone: number; off: [number, number, number]; up: [number, number, number]; size: number; kind: 'tree' | 'young' | 'sapling' | 'fern' }
export const groveSeats = (geo: import('three').BufferGeometry): GroveSeat[] => (geo.userData.grove as GroveSeat[] | undefined) ?? [];
/** parent plants to a titan instance's bones at its grove seats, so they ride (and sway with) the gait: `make`
 *  returns the region's own flora mesh for a seat (a species suited to the biome, sized by seat.size), or null */
export function attachGrove(bones: import('three').Bone[], seats: GroveSeat[], make: (seat: GroveSeat, i: number) => import('three').Object3D | null): import('three').Object3D[] {
  const out: import('three').Object3D[] = [];
  seats.forEach((s, i) => {
    const o = make(s, i); if (!o) return;
    o.position.set(s.off[0], s.off[1], s.off[2]);
    // stand the plant on the seat's ground, turned to a random heading
    const up = s.up, ax = [up[2], 0, -up[0]], al = Math.hypot(ax[0], ax[2]) || 1, ang = Math.acos(Math.max(-1, Math.min(1, up[1])));
    o.quaternion.setFromAxisAngle({ x: ax[0] / al, y: 0, z: ax[2] / al } as import('three').Vector3, ang);
    o.rotateY((i * 2.399) % (Math.PI * 2));
    bones[s.bone].add(o); out.push(o);
  });
  return out;
}

/** grow the region's own flora on a titan instance: mature trees in the big pockets on the crown, young trees and
 *  saplings in the smaller ones, ferns and shrubs as undergrowth round every trunk. The plants ride the spine bones,
 *  so they sway with the gait; their own material sways them in the wind and follows the seasons. */
export function growGrove(bones: THREE.Bone[], geo: THREE.BufferGeometry, o: { biome?: BiomeKey; seed?: number } = {}): THREE.Object3D[] {
  const seats = groveSeats(geo); if (!seats.length) return [];
  const sp = floraSpeciesFor(o.biome), seed = o.seed ?? 1;
  const trees = sp.filter((s) => s.tree), under = sp.filter((s) => !s.tree && ['fern', 'shrub', 'tuft', 'fungus', 'bloom', 'rosette', 'fiddle'].includes(s.arch));
  const pickT = (i: number) => trees[(i * 7 + seed) % Math.max(1, trees.length)] ?? sp[0], pickU = (i: number) => under[(i * 5 + seed) % Math.max(1, under.length)] ?? sp[sp.length - 1];
  const place = (s: THREE.Object3D, h: number) => { const ph = (s.userData.plant?.height as number) || 1; s.scale.setScalar(h / ph); return s; };
  return attachGrove(bones, seats, (s, i) => {
    const g = new THREE.Group();
    const main = s.kind === 'fern' ? pickU(i) : pickT(i);
    g.add(place(buildPlantObject(main, seed * 31 + i, s.kind === 'tree' ? 'full' : 'light', { biome: o.biome, shadows: s.kind === 'tree' || s.kind === 'young' }), s.size));
    // undergrowth round the foot
    const n = s.kind === 'tree' ? 3 : s.kind === 'young' ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const u = buildPlantObject(pickU(i + k + 1), seed * 17 + i * 5 + k, 'light', { biome: o.biome, shadows: false }), a = k * 2.3 + i, r = 0.5 + s.size * 0.12;
      place(u, 0.5 + ((i + k) % 3) * 0.25); u.position.set(Math.cos(a) * r, -0.05, Math.sin(a) * r); g.add(u);
    }
    return g;
  });
}
