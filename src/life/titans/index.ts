// The titans: hero creatures built whole from the anatomy library (src/life/anatomy), skinned to the rig that
// morph.ts gives every bestiary quadruped or hexapod, so the shared Animator, its gaits and the titans' stomp work
// unchanged. sculpt.ts hands a titan's design here.
import type { Design } from '../design';
import type { Rig } from '../morph';
import type { V3 } from '../kit';
import { grovebacker } from './grovebacker';
import { mirewalker } from './mirewalker';
import { cragstrider } from './cragstrider';

export interface TitanSculpt { geo: import('three').BufferGeometry; tex: import('three').DataTexture; tris: number; den: number; fill: number }
export const TITANS: Record<string, (d: Design, rig: Rig, rest: V3[]) => TitanSculpt> = { grovebacker, mirewalker, cragstrider };
export const isTitan = (d: Design) => !!d.beast && d.beast in TITANS;
export function sculptTitan(d: Design, rig: Rig, rest: V3[]): TitanSculpt { return TITANS[d.beast!](d, rig, rest); }

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
