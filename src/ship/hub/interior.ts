// The MERIDIAN's deck as a dollhouse: every room's floor and walls, cut low on the near sides and standing full
// height on the far sides (see layout.ts), the wall sections capped where the cut goes through them (the hull
// shows its layers: outer plate, frames, insulation, inner panel), door frames with their control panels, the
// spine corridor with its light strip and conduits, and each room's light. Furniture comes from rooms.ts.
import * as THREE from 'three';
import { Batch, Mats, Bin, box, quad, V3 } from './kit';
import { ROOMS, ROOM_IDS, WALL_H, CUT_H, CORRIDOR, HULL_X, type RoomId } from './layout';
import { THEMES, wallTex, floorTex, capTex, hazardTex, poolTex, type Theme } from './tex';
import { Screens } from './screens';
import { mat, glow, wallLamp, sign, type Ctx, type Anim } from './props';
import { furnish } from './rooms';
import { gbuf } from '../../gfx/gbuf';

export interface RoomBuild {
  id: RoomId; root: THREE.Group; ctx: Ctx; bounds: THREE.Box3;
  /** an invisible box for picking */
  pick: THREE.Mesh;
  light: THREE.PointLight; baseK: number;
  /** the floor highlight shown on hover / focus (fx layer) */
  glow: THREE.Mesh;
}
export interface Interior { root: THREE.Group; rooms: Record<RoomId, RoomBuild>; anims: Anim[]; screens: Screens; corridor: THREE.Group; fx: THREE.Group }

const T_IN = 0.16, T_HULL = 0.5;
type Side = 'nx' | 'px' | 'nz' | 'pz';
interface Door { at: number; w: number }

/** height of the wall line a room side sits on */
function sideH(id: RoomId, s: Side) {
  if (id === 'bridge') return s === 'nz' ? WALL_H : s === 'nx' ? CUT_H : WALL_H;
  const r = ROOMS[id], port = r.x1 <= 0;
  if (s === 'pz') return WALL_H;
  if (s === 'nz') return r.z0 <= CORRIDOR.z0 + 0.1 ? CUT_H : WALL_H;
  if (port) return s === 'px' ? WALL_H : CUT_H;
  return s === 'px' ? WALL_H : CUT_H;
}
function doorOf(id: RoomId): { side: Side; door: Door } {
  const r = ROOMS[id], d = r.spots.door.p;
  if (id === 'bridge') return { side: 'nz', door: { at: 0, w: 1.5 } };
  return { side: r.x1 <= 0 ? 'px' : 'nx', door: { at: d[2], w: 1.3 } };
}

/** one inner wall face: a quad facing into the room, from a to b (horizontal), h tall, with door gaps */
function wallFace(c: Ctx, th: Theme, a: THREE.Vector2, b: THREE.Vector2, h: number, inward: THREE.Vector2, doors: Door[], variant: number) {
  const L = a.distanceTo(b), dir = b.clone().sub(a).normalize();
  const m = c.M.get(`wall|${th.key}|${variant}`, { map: wallTex(th, variant), rough: 0.78, metal: 0.05 });
  const ry = Math.atan2(inward.x, inward.y);
  // the quad's local +x must run along the wall as seen from inside: right = inward rotated -90deg
  const right = new THREE.Vector2(inward.y, -inward.x);
  const flip = right.dot(dir) < 0;
  const pieces: [number, number, number, number][] = []; // s0, s1 along a->b, y0, y1
  const cuts = doors.map((d) => [d.at - d.w / 2, d.at + d.w / 2]).sort((p, q) => p[0] - q[0]);
  let s = 0;
  for (const [d0, d1] of cuts) { if (d0 > s) pieces.push([s, d0, 0, h]); if (h > 2.3) pieces.push([d0, d1, 2.3, h]); s = d1; }
  if (s < L) pieces.push([s, L, 0, h]);
  for (const [s0, s1, y0, y1] of pieces) {
    const w = s1 - s0; if (w < 0.01) continue;
    const g = quad(w, y1 - y0);
    // uv: u along the wall (2 m per tile), v from the floor (WALL_H per tile)
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const base = flip ? L - s1 : s0;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (base + uv.getX(i) * w) / 2, (y0 + uv.getY(i) * (y1 - y0)) / WALL_H);
    const mid = a.clone().addScaledVector(dir, (s0 + s1) / 2);
    c.B.add(g, m, { x: mid.x, y: (y0 + y1) / 2, z: mid.y, ry });
  }
}

export function buildInterior(bin: Bin, M: Mats, onRoom?: (id: RoomId, c: Ctx) => void): Interior {
  const root = new THREE.Group(); root.name = 'interior';
  const fx = new THREE.Group(); fx.name = 'interior-fx';
  const screens = new Screens();
  const anims: Anim[] = [];
  const rooms = {} as Record<RoomId, RoomBuild>;
  const capM = M.get('cap', { map: capTex(), rough: 0.6, metal: 0.4 });

  for (const id of ROOM_IDS) {
    const r = ROOMS[id], th = THEMES[id];
    const rr = new THREE.Group(); rr.name = 'room:' + id; root.add(rr);
    const B = new Batch(bin);
    const c: Ctx = { B, M, bin, S: screens, th, root: rr, anims, lights: [], refs: {} };
    // ---- floor
    const fm = M.get('floor|' + id, { map: floorTex(th), rough: th.floor === 'tiles' ? 0.35 : th.floor === 'tread' ? 0.5 : 0.8, metal: th.floor === 'tread' || th.floor === 'grate' ? 0.45 : 0.05 });
    const poly = id === 'bridge'
      ? [[-6, 12], [6, 12], [6, 15], [3.6, 18.5], [-3.6, 18.5], [-6, 15]]
      : [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]];
    {
      const sh = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
      const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2);
      const uv = g.attributes.uv as THREE.BufferAttribute, p = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 2, p.getZ(i) / 2);
      B.add(g, fm);
    }
    // ---- walls (inner faces) and their caps
    const dd = doorOf(id);
    interface Seg { s: Side | 'd'; a0: THREE.Vector2; b0: THREE.Vector2; inward: THREE.Vector2; h: number; hull: boolean; doors: Door[] }
    const V2 = (x: number, z: number) => new THREE.Vector2(x, z);
    const segs: Seg[] = [];
    if (id === 'bridge') {
      const dp = V2(3.5, -2.4).normalize(), ds = V2(-3.5, -2.4).normalize();
      segs.push({ s: 'd', a0: V2(-6, 12), b0: V2(-6, 15), inward: V2(1, 0), h: CUT_H, hull: false, doors: [] });
      segs.push({ s: 'd', a0: V2(-6, 15), b0: V2(-3.6, 18.5), inward: dp, h: CUT_H, hull: false, doors: [] });
      segs.push({ s: 'd', a0: V2(6, 12), b0: V2(6, 15), inward: V2(-1, 0), h: WALL_H, hull: false, doors: [] });
      segs.push({ s: 'd', a0: V2(6, 15), b0: V2(3.6, 18.5), inward: ds, h: WALL_H, hull: false, doors: [] });
      segs.push({ s: 'd', a0: V2(-3.6, 18.5), b0: V2(3.6, 18.5), inward: V2(0, -1), h: WALL_H, hull: false, doors: [] });
    } else {
      const rect: [Side, THREE.Vector2, THREE.Vector2, THREE.Vector2][] = [
        ['nx', V2(r.x0, r.z0), V2(r.x0, r.z1), V2(1, 0)], ['px', V2(r.x1, r.z0), V2(r.x1, r.z1), V2(-1, 0)],
        ['nz', V2(r.x0, r.z0), V2(r.x1, r.z0), V2(0, 1)], ['pz', V2(r.x0, r.z1), V2(r.x1, r.z1), V2(0, -1)],
      ];
      for (const [s, a0, b0, inward] of rect) {
        const hull = (s === 'nx' && r.x0 <= -HULL_X + 0.1) || (s === 'px' && r.x1 >= HULL_X - 0.1);
        segs.push({ s, a0, b0, inward, h: sideH(id, s), hull, doors: dd.side === s ? [{ at: (s === 'nx' || s === 'px') ? dd.door.at : dd.door.at, w: dd.door.w }] : [] });
      }
    }
    let variant = 0;
    for (const sg of segs) {
      const { a0, b0, inward, h, hull } = sg;
      const t = (hull ? T_HULL : T_IN) / 2;
      const a = a0.clone().addScaledVector(inward, t), b = b0.clone().addScaledVector(inward, t);
      // shorten along the wall by the neighbours' half thickness so corners meet
      const along = b.clone().sub(a).normalize();
      const endT = sg.s === 'nz' || sg.s === 'pz' ? T_HULL / 2 : T_IN / 2;
      a.addScaledVector(along, endT); b.addScaledVector(along, -endT);
      // door positions are given in world z (x walls) or x (z walls): convert to distance along a->b
      const doors = sg.doors.map((d) => ({ at: Math.abs(along.y) > 0.5 ? (d.at - a.y) * Math.sign(along.y) : (d.at - a.x) * Math.sign(along.x), w: d.w }));
      wallFace(c, th, a, b, h, inward, doors, variant++);
      // the cap along the top: the section on cut walls, a dark top on full ones
      const mid = a0.clone().add(b0).multiplyScalar(0.5), L = a0.distanceTo(b0), T = hull ? T_HULL : T_IN;
      const cg = box(L, 0.04, T);
      B.add(cg, h < WALL_H ? capM : mat(c, 'black'), { x: mid.x, y: h + 0.02, z: mid.y, ry: -Math.atan2(b0.y - a0.y, b0.x - a0.x) });
      // the wall's body between the faces (so a cut shows a solid section from any angle), open at the doors
      {
        const dir = b0.clone().sub(a0).normalize(), ang = -Math.atan2(dir.y, dir.x);
        const cuts = doors.map((d) => [d.at + endT - d.w / 2, d.at + endT + d.w / 2]).sort((p, q) => p[0] - q[0]);
        let s0 = 0;
        const piece = (u0: number, u1: number, y0: number, y1: number) => { if (u1 - u0 < 0.01) return; const p = a0.clone().addScaledVector(dir, (u0 + u1) / 2); B.add(box(u1 - u0, y1 - y0, T * 0.96), mat(c, 'dark'), { x: p.x, y: (y0 + y1) / 2, z: p.y, ry: ang }); };
        for (const [u0, u1] of cuts) { piece(s0, u0, 0, h); if (h > 2.3) piece(u0, u1, 2.3, h); s0 = u1; }
        piece(s0, L, 0, h);
      }
      if (h < WALL_H && hull) {
        // the hull's layers in section: insulation between the plates, frames every metre
        const ins = M.get('insul', { color: 0xc8a854, rough: 0.95 });
        B.add(box(L, 0.044, T * 0.45), ins, { x: mid.x, y: h + 0.023, z: mid.y, ry: -Math.atan2(b0.y - a0.y, b0.x - a0.x) });
        const dir = b0.clone().sub(a0).normalize();
        for (let k = 0.5; k < L; k += 1.0) { const p = a0.clone().addScaledVector(dir, k); B.add(box(0.08, 0.05, T * 0.8), mat(c, 'gun'), { x: p.x, y: h + 0.026, z: p.y, ry: -Math.atan2(dir.y, dir.x) }); }
      }
    }
    // ---- door frame on the room's door
    if (id !== 'bridge') {
      const port = r.x1 <= 0, wx = port ? r.x1 - T_IN / 2 : r.x0 + T_IN / 2, dz = dd.door.at, h = sideH(id, dd.side), into = port ? -1 : 1;
      for (const s of [-1, 1]) {
        B.add(box(T_IN + 0.12, h >= WALL_H ? 2.35 : h + 0.05, 0.12, 0.02), mat(c, 'gun'), { x: wx, y: (h >= WALL_H ? 2.35 : h + 0.05) / 2, z: dz + s * (dd.door.w / 2 + 0.06) });
        B.add(box(0.02, 1.2, 0.08), M.get('haz', { map: hazardTex(), rough: 0.6 }), { x: wx + into * (T_IN / 2 + 0.065), y: 0.6, z: dz + s * (dd.door.w / 2 + 0.06), ry: 0 });
      }
      if (h >= WALL_H) {
        B.add(box(T_IN + 0.12, 0.14, dd.door.w + 0.24, 0.02), mat(c, 'gun'), { x: wx, y: 2.37, z: dz });
        // the sliding leaf, half drawn back into the wall, with its window slot and hazard edge
        B.add(box(0.07, 2.26, dd.door.w * 0.52, 0.015), mat(c, 'grey'), { x: wx, y: 1.13, z: dz + dd.door.w * 0.3 });
        B.add(box(0.075, 0.5, 0.12), mat(c, 'black'), { x: wx, y: 1.55, z: dz + dd.door.w * 0.3 });
        B.add(box(0.08, 2.2, 0.05), M.get('haz', { map: hazardTex(), rough: 0.6 }), { x: wx, y: 1.13, z: dz + dd.door.w * 0.04 });
        // the room sign over the door and the door's lit control panel
        sign(c, r.name, 1.4, { x: wx + into * (T_IN / 2 + 0.07), y: 2.62, z: dz, ry: into * Math.PI / 2 }, { fg: 0xe8e2cc, bg: 0x1d2224, size: 52 });
        B.add(box(0.04, 0.24, 0.14, 0.01), mat(c, 'dark'), { x: wx + into * (T_IN / 2 + 0.02), y: 1.3, z: dz - into * 0 + (dd.door.w / 2 + 0.3) });
        B.add(box(0.01, 0.06, 0.06), glow(c, 0x6ad08a, 2.2), { x: wx + into * (T_IN / 2 + 0.045), y: 1.34, z: dz + (dd.door.w / 2 + 0.3) });
      }
      // threshold plate
      B.add(box(T_IN + 0.3, 0.015, dd.door.w), mat(c, 'steel'), { x: wx, y: 0.008, z: dz });
    }
    // ---- the room light: one point light high in the room, and its pool on the floor
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    const L = new THREE.PointLight(r.light, 0, Math.max(r.x1 - r.x0, r.z1 - r.z0) * 1.8, 1.4);
    L.position.set(cx + 0.4, 3.1, cz); rr.add(L);
    const baseK = 9 * r.lightK;
    L.intensity = baseK;
    // floor pick box and the hover glow
    const bounds = new THREE.Box3(new V3(r.x0, 0, r.z0), new V3(r.x1, WALL_H, r.z1));
    const pick = new THREE.Mesh(new THREE.BoxGeometry(r.x1 - r.x0, WALL_H, r.z1 - r.z0), new THREE.MeshBasicMaterial({ visible: false }));
    bin.g(pick.geometry); bin.m(pick.material as THREE.Material);
    pick.position.set(cx, WALL_H / 2, cz); pick.userData.room = id; rr.add(pick);
    const gm = new THREE.MeshBasicMaterial({ map: poolTex(), color: new THREE.Color(r.light).multiplyScalar(0.0), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    bin.m(gbuf(gm, 0));
    const glowQ = new THREE.Mesh(bin.g(new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0)), gm); glowQ.rotation.x = -Math.PI / 2; glowQ.position.set(cx, 0.03, cz); glowQ.renderOrder = 2;
    fx.add(glowQ);
    rooms[id] = { id, root: rr, ctx: c, bounds, pick, light: L, baseK, glow: glowQ };
    furnish(id, c);
    onRoom?.(id, c);
    B.flush(rr, 'room-static:' + id);
  }

  // ---- the corridor: floor, the visible (port) face of the low starboard wall, a light strip, conduit
  const corridor = new THREE.Group(); corridor.name = 'corridor'; root.add(corridor);
  {
    const th = THEMES.corridor, B = new Batch(bin);
    const c: Ctx = { B, M, bin, S: screens, th, root: corridor, anims, lights: [], refs: {} };
    const C = CORRIDOR, L = C.z1 - C.z0;
    const fg = new THREE.PlaneGeometry(C.x1 - C.x0, L); fg.rotateX(-Math.PI / 2);
    const uv = fg.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (C.x1 - C.x0) / 2, uv.getY(i) * L / 2);
    B.add(fg, M.get('floor|corridor', { map: floorTex(th), rough: 0.7, metal: 0.1 }), { x: 0, z: (C.z0 + C.z1) / 2 });
    // the centre light strip set in the deck
    B.add(box(0.12, 0.01, L - 1), glow(c, 0xbfe8f0, 1.6), { x: 0, y: 0.006, z: (C.z0 + C.z1) / 2 });
    // the low starboard wall's corridor face (doors cut through it)
    const doors = (['lab', 'mess', 'cargo', 'engineering'] as RoomId[]).map((id) => ({ at: ROOMS[id].spots.door.p[2] - C.z0, w: 1.3 }));
    wallFace(c, th, new THREE.Vector2(C.x1 - T_IN / 2, C.z0), new THREE.Vector2(C.x1 - T_IN / 2, C.z1), CUT_H, new THREE.Vector2(-1, 0), doors, 3);
    // the stern bulkhead face, low
    wallFace(c, th, new THREE.Vector2(C.x0, C.z0 + T_IN / 2), new THREE.Vector2(C.x1, C.z0 + T_IN / 2), CUT_H, new THREE.Vector2(0, 1), [], 4);
    // overhead conduits along the tall port wall's corridor side, hangers every 2 m
    for (const [y, col, rad] of [[3.15, 'pipeB', 0.07], [2.95, 'pipeY', 0.05], [3.25, 'cable', 0.04]] as [number, string, number][]) {
      B.add(new THREE.CylinderGeometry(rad, rad, L, 10), mat(c, col), { x: C.x0 + 0.25, y, z: (C.z0 + C.z1) / 2, rx: Math.PI / 2 });
    }
    for (let z = C.z0 + 1; z < C.z1; z += 2) B.add(box(0.5, 0.04, 0.06), mat(c, 'gun'), { x: C.x0 + 0.3, y: 3.33, z });
    for (let z = C.z0 + 2; z < C.z1 - 1; z += 5) wallLamp(c, C.x0 + 0.08, 2.5, z, Math.PI / 2, 0xd8f0ff, 0.5);
    const L2 = new THREE.PointLight(0xbfe0ea, 8, 16, 1.4); L2.position.set(0, 2.8, -1); corridor.add(L2);
    B.flush(corridor, 'corridor');
  }
  return { root, rooms, anims, screens, corridor, fx };
}
