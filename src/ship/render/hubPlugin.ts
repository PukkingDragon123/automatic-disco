// RENDER agent: the hub's interior light, loaded by the hub like every src/ship/*/hubPlugin.ts. Soft area panels on
// every room's ceiling (and down the corridor) shade the deck through gbuf.areaLit; each room's point light stays
// as a dimmer, coloured fill; the practicals (desk lamps, screens, the reactor, the AI core: every other point
// light in the ship) glow in the air; the panels hang soft cones of haze. The panels follow the hub's own room light
// every frame (power, alarms, hover and focus), so nothing in the hub changes how it drives its lights.
// Post (src/gfx/post.ts) does the rest for any scene with an InteriorLight: strong contact shadows, the film
// grade, eye adaptation, and the camera and object motion blur.
import * as THREE from 'three';
import type { ShipHub } from '../hub/hub';
import { ROOMS, ROOM_IDS, WALL_H, CORRIDOR, type RoomId } from '../hub/layout';
import { InteriorLight, type AreaLight, type Glow } from '../../gfx/lights';
import { areaLit } from '../../gfx/gbuf';

/** panel radiance per unit of the room's light strength, and how much of the old point light stays as fill */
const PANEL_K = 15, FILL_K = 0.5;
const WHITE = new THREE.Color(0xfff2e2);

export default function hubLight(hub: ShipHub) {
  const il = new InteriorLight(hub.scene);
  il.ceilY = WALL_H; il.floorY = 0;
  const rooms: { id: RoomId; panels: AreaLight[]; base: number }[] = [];
  for (const id of ROOM_IDS) {
    const r = ROOMS[id], w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    // two troffers a quarter of the way in from each end of the long axis, tinted by the room's mood
    const col = new THREE.Color(r.light).lerp(WHITE, 0.45), long = d >= w, range = Math.max(w, d) * 1.15 + 2;
    const panels = [-1, 1].map((s) => il.panel(long ? cx : cx + s * w * 0.24, WALL_H - 0.1, long ? cz + s * d * 0.24 : cz,
      long ? Math.min(0.9, w * 0.16) : Math.min(2.6, w * 0.3), long ? Math.min(2.6, d * 0.3) : Math.min(0.9, d * 0.16), col, 0, range));
    rooms.push({ id, panels, base: PANEL_K * r.lightK });
  }
  // the corridor: small cool panels every 6 m
  for (let z = CORRIDOR.z0 + 3; z < CORRIDOR.z1 - 1; z += 6) il.panel((CORRIDOR.x0 + CORRIDOR.x1) / 2, WALL_H - 0.1, z, 0.5, 1.4, 0xd8ecf4, 9, 7, { beam: 0.6 });
  // practicals: every point light that is not a room's main light glows in the haze with its own colour
  const roomLights = new Set<THREE.Object3D>(ROOM_IDS.map((id) => hub.interior.rooms[id].light));
  const prac: { L: THREE.PointLight; g: Glow }[] = [];
  hub.interior.root.traverse((o) => {
    const L = o as THREE.PointLight;
    if (!L.isPointLight || roomLights.has(L)) return;
    prac.push({ L, g: il.glow(new THREE.Vector3(), L.color, 0, Math.min(4, (L.distance || 6) * 0.6)) });
  });
  areaLit(hub.interior.root);
  let relit = 0;
  const wp = new THREE.Vector3();
  const off = hub.onUpdate((dt) => {
    // runs after the hub has set its lights for this frame (QA: deleting scene.userData.interior switches it all off)
    if (hub.scene.userData.interior !== il) return;
    for (const r of rooms) {
      const b = hub.interior.rooms[r.id], k = b.baseK > 0 ? b.light.intensity / b.baseK : 0;
      for (const p of r.panels) { p.intensity = r.base * k; p.color.copy(b.light.color).lerp(WHITE, 0.45); }
      b.light.intensity *= FILL_K;
    }
    for (const { L, g } of prac) { g.on = L.visible && L.intensity > 0; g.intensity = L.intensity * 0.6; g.color.copy(L.color); g.pos.copy(L.getWorldPosition(wp)); }
    // actors and props added later (crew, intro props) join the panels too
    if ((relit += dt) > 2) { relit = 0; areaLit(hub.interior.root); }
  });
  hub.onDispose(() => { off(); il.dispose(); });
}
