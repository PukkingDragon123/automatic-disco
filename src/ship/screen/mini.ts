// THE SHIP MODEL: the whole MERIDIAN, built once from the hub's own parts (src/ship/hub: the hull exterior with its
// roof plates lifted away, exterior.ts, around the furnished, cluttered deck cutaway, interior.ts) and redrawn as a kit
// 3D ELEMENT: every material through the UI kit's toon shader, drawn by the kit's renderer with a black ink outline.
// It is seen from the hub overview's own angle (port-aft-above). The camera is a TARGET and a ZOOM: zoom 1 frames the
// whole ship; zooming in moves toward any point (the wheel zooms about the cursor, a click flies into a room). Rooms
// are hotspots; a locked room is a cold, dim ghost of itself, a hovered room lifts its light, the open room stays lit.
//   const m = await shipMini()                    built once, kept for the session
//   m.draw(ctx, view)                             view = { w, h, zoom, tx, ty, tz } (target in deck metres)
//   m.project(x, y, z, view) / m.deckAt(px, py, view, h) / m.roomAt(px, py, view)
//   m.roomZoom(id, view) -> the zoom that frames a room     m.setLook(id, 'locked' | 'idle' | 'hot' | 'open')
import * as THREE from 'three';
import { Bin, Mats } from '../hub/kit';
import { buildInterior } from '../hub/interior';
import { buildExterior } from '../hub/exterior';
import { ROOMS, ROOM_IDS, roomAt, VIEW, type RoomId } from '../hub/layout';
import { toon, renderModel, fitRoot } from '../../ui/kit/model3d';

export type RoomLook = 'locked' | 'idle' | 'hot' | 'open';
export interface MiniView { w: number; h: number; zoom: number; tx: number; ty: number; tz: number }
const LOOK: Record<RoomLook, { bright: number; tint: number }> = {
  locked: { bright: 0.8, tint: 0x8494b0 },
  idle: { bright: 1.12, tint: 0xffffff },
  hot: { bright: 1.34, tint: 0xfff2dc },
  open: { bright: 1.26, tint: 0xfff6e8 },
};
/** the hub overview's angle as the kit camera's turntable yaw and pitch */
export const MINI_YAW0 = 1.9, MINI_PITCH0 = VIEW.el;
/** the whole ship's box (deck metres), hull, mast and engine bells */
const SHIP = new THREE.Box3(new THREE.Vector3(-8.6, -3.2, -25), new THREE.Vector3(8.6, 4.6, 22.5));
/** where zoom 1 looks (re-centred on the model by fitShip) */
export const SHIP_CENTRE = SHIP.getCenter(new THREE.Vector3());

interface Part { mesh: THREE.Mesh; src: THREE.Material[]; room: RoomId | null }
export class ShipMini {
  readonly root: THREE.Group;
  private parts: Part[] = [];
  private looks = new Map<RoomId, RoomLook>();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private R0: number; private H0: number;
  private inner: THREE.Object3D;
  private texes = new Map<string, THREE.Texture>();
  private fit1 = 1;
  constructor(readonly bin: Bin, interior: ReturnType<typeof buildInterior>, exterior: ReturnType<typeof buildExterior> | null) {
    const ship = new THREE.Group(); ship.name = 'ship';
    ship.add(interior.root);
    if (exterior) { exterior.setCut(1); ship.add(exterior.root); }
    ship.updateMatrixWorld(true);
    // what does not belong in a still model: lights, pick boxes, particles, lines, shader effects, hidden roof plates
    const drop: THREE.Object3D[] = [];
    ship.traverse((o) => {
      if ((o as THREE.Light).isLight) { drop.push(o); return; }
      if ((o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite) { drop.push(o); return; }
      if (!o.visible && o !== ship) { drop.push(o); return; }
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      if (o.userData.room || mats.some((x) => !x || (x as THREE.ShaderMaterial).isShaderMaterial || x.visible === false || x.blending === THREE.AdditiveBlending) || (m as THREE.InstancedMesh).isInstancedMesh) { drop.push(o); return; }
    });
    for (const o of drop) o.removeFromParent();
    ship.traverse((o) => {
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      let room: RoomId | null = null;
      for (let p: THREE.Object3D | null = o; p; p = p.parent) { const k = /^room:(\w+)/.exec(p.name); if (k) { room = k[1] as RoomId; break; } }
      const src = (Array.isArray(m.material) ? m.material : [m.material]).slice();
      this.bakeUV(m, src[0]);
      this.parts.push({ mesh: m, src, room });
    });
    for (const id of ROOM_IDS) this.looks.set(id, 'idle');
    this.restyle();
    this.root = fitRoot(ship);
    this.inner = ship;
    this.R0 = this.root.userData.fitR as number; this.H0 = this.root.userData.fitH as number;
  }
  private bakeUV(m: THREE.Mesh, mt: THREE.Material) {
    const map = (mt as THREE.MeshLambertMaterial).map; const g = m.geometry as THREE.BufferGeometry;
    if (!map || !g.attributes.uv || g.userData.uvBaked) return;
    map.updateMatrix();
    const e = map.matrix.elements, uv = g.attributes.uv as THREE.BufferAttribute;
    if (e[0] === 1 && e[4] === 1 && !e[6] && !e[7] && !e[1] && !e[3]) { g.userData.uvBaked = true; return; }
    for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, e[0] * u + e[3] * v + e[6], e[1] * u + e[4] * v + e[7]); }
    uv.needsUpdate = true; g.userData.uvBaked = true;
  }
  private raw(t: THREE.Texture): THREE.Texture {
    let c = this.texes.get(t.uuid);
    if (!c) {
      c = t.clone(); c.colorSpace = THREE.NoColorSpace; c.magFilter = THREE.NearestFilter; c.repeat.set(1, 1); c.offset.set(0, 0); c.rotation = 0;
      const im = c.image as { width?: number; data?: unknown } | null;
      if (im && (im.data || (im.width ?? 0) > 0)) c.needsUpdate = true;
      this.texes.set(t.uuid, c); this.bin.t(c);
    }
    return c;
  }
  private conv(mt: THREE.Material, look: RoomLook): THREE.Material {
    const s = mt as THREE.MeshLambertMaterial & { metalness?: number };
    const L = LOOK[look], map = s.map ? this.raw(s.map) : null;
    const col = s.color ? s.color.clone().multiply(new THREE.Color(L.tint)).getHex() : L.tint;
    const em = s.emissive && (s.emissive.r + s.emissive.g + s.emissive.b) > 0.02 ? s.emissive.getHex() : undefined;
    const basic = (mt as THREE.MeshBasicMaterial).isMeshBasicMaterial;
    return toon({
      map, color: col, metal: s.metalness ?? (basic ? 0 : 0.1), gloss: 0.15, rim: 0.06,
      emissive: basic && look !== 'locked' ? 0x1a1410 : em, emissiveK: em !== undefined ? 0.5 : 1,
      opacity: s.transparent ? Math.max(0.5, s.opacity) : 1, side: s.side === THREE.BackSide ? THREE.DoubleSide : s.side, bright: L.bright * (basic ? 1.08 : 1),
    });
  }
  private restyle(only?: RoomId) {
    for (const p of this.parts) {
      if (only && p.room !== only) continue;
      const look = p.room ? this.looks.get(p.room) ?? 'idle' : 'idle';
      const m = p.src.map((x) => this.conv(x, look));
      p.mesh.material = m.length === 1 ? m[0] : m;
    }
  }
  setLook(id: RoomId, look: RoomLook) { if (this.looks.get(id) === look) return false; this.looks.set(id, look); this.restyle(id); return true; }

  // ---------------------------------------------------------------- the camera
  /** the camera exactly as the kit's renderModel frames it, for this view's zoom */
  private frame(v: MiniView) {
    const R0 = this.R0, half = R0 / (v.zoom * this.fit1), asp = v.w / v.h, dist = R0 * 4, cam = this.cam;
    cam.left = -half * Math.max(1, asp); cam.right = half * Math.max(1, asp); cam.top = half / Math.min(1, asp); cam.bottom = -half / Math.min(1, asp);
    cam.near = dist - R0 * 1.6; cam.far = dist + R0 * 1.6;
    cam.position.set(0, Math.sin(MINI_PITCH0) * dist, Math.cos(MINI_PITCH0) * dist); cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  }
  private ry = new THREE.Vector3(0, 1, 0);
  /** where the model's root must sit so the target lands in the middle of the frame */
  private offset(v: MiniView) { return new THREE.Vector3(0, this.H0 / 2, 0).sub(new THREE.Vector3(v.tx, v.ty, v.tz).add(this.inner.position).applyAxisAngle(this.ry, MINI_YAW0)); }
  /** the kit pivot's world for a deck point: the root is offset so world = Ry(yaw) (p - target) */
  private toWorld(p: THREE.Vector3, v: MiniView) { return p.clone().sub(new THREE.Vector3(v.tx, v.ty, v.tz)).applyAxisAngle(this.ry, MINI_YAW0); }
  private fromWorld(q: THREE.Vector3, v: MiniView) { return q.clone().applyAxisAngle(this.ry, -MINI_YAW0).add(new THREE.Vector3(v.tx, v.ty, v.tz)); }
  project(x: number, y: number, z: number, v: MiniView): [number, number] {
    this.frame(v);
    const q = this.toWorld(new THREE.Vector3(x, y, z), v).project(this.cam);
    return [(q.x * 0.5 + 0.5) * v.w, (1 - (q.y * 0.5 + 0.5)) * v.h];
  }
  /** the deck point under a canvas point, on the plane y = h */
  deckAt(px: number, py: number, v: MiniView, h = 0): THREE.Vector3 | null {
    this.frame(v);
    const nx = (px / v.w) * 2 - 1, ny = 1 - (py / v.h) * 2;
    const a = this.fromWorld(new THREE.Vector3(nx, ny, -1).unproject(this.cam), v), b = this.fromWorld(new THREE.Vector3(nx, ny, 1).unproject(this.cam), v);
    if (Math.abs(b.y - a.y) < 1e-6) return null;
    return a.lerp(b, (h - a.y) / (b.y - a.y));
  }
  roomAt(px: number, py: number, v: MiniView): RoomId | null {
    for (const h of [1.2, 0.6, 0]) { const p = this.deckAt(px, py, v, h); if (!p) continue; const id = roomAt(p.x, p.z); if (id) return id; }
    return null;
  }
  /** sampled points of the real model (deck metres), for framing */
  private samples: THREE.Vector3[] | null = null;
  private sample(): THREE.Vector3[] {
    if (this.samples) return this.samples;
    const out: THREE.Vector3[] = [], inv = new THREE.Matrix4();
    this.root.position.set(0, 0, 0); this.root.rotation.set(0, 0, 0); this.root.updateMatrixWorld(true);
    inv.copy(this.inner.matrixWorld).invert();
    const v = new THREE.Vector3(), M = new THREE.Matrix4();
    this.inner.traverse((o) => {
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      const P = (m.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute | undefined; if (!P) return;
      M.multiplyMatrices(inv, m.matrixWorld);
      const step = Math.max(1, Math.floor(P.count / 40));
      for (let i = 0; i < P.count; i += step) out.push(v.fromBufferAttribute(P, i).applyMatrix4(M).clone());
    });
    return (this.samples = out);
  }
  /** frame the whole ship at zoom 1 (the model's own points fill ~88% of the canvas) and move SHIP_CENTRE to its middle */
  fitShip(w: number, h: number) {
    this.fit1 = 1;
    const v: MiniView = { w, h, zoom: 1, tx: SHIP_CENTRE.x, ty: SHIP_CENTRE.y, tz: SHIP_CENTRE.z };
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of this.sample()) { const [px, py] = this.project(p.x, p.y, p.z, v); x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
    if (!isFinite(x0)) return;
    // re-centre: the deck point under the model's projected middle becomes the target
    const a = this.deckAt((x0 + x1) / 2, (y0 + y1) / 2, v, SHIP_CENTRE.y), c = this.deckAt(w / 2, h / 2, v, SHIP_CENTRE.y);
    if (a && c) SHIP_CENTRE.add(a.sub(c));
    this.fit1 = 0.88 / Math.max((x1 - x0) / w, (y1 - y0) / h, 0.05);
  }
  /** the zoom (over the whole-ship fit) that frames a room, its walls and a margin */
  roomZoom(id: RoomId, v: MiniView): number {
    const r = ROOMS[id], c = this.centre(id), t = { ...v, zoom: 1, tx: c.x, ty: c.y, tz: c.z };
    let mx = 0, my = 0;
    for (const x of [r.x0, r.x1]) for (const z of [r.z0, r.z1]) for (const y of [0, 3.4]) { const [px, py] = this.project(x, y, z, t); mx = Math.max(mx, Math.abs(px / v.w - 0.5) * 2); my = Math.max(my, Math.abs(py / v.h - 0.5) * 2); }
    return Math.min(6, 0.8 / Math.max(mx, my, 0.05));
  }
  outline(id: RoomId, v: MiniView, y = 0): [number, number][] {
    if (id === 'bridge') return ([[-6, 12], [6, 12], [6, 15], [3.6, 18.5], [-3.6, 18.5], [-6, 15]] as [number, number][]).map(([x, z]) => this.project(x, y, z, v));
    const r = ROOMS[id];
    return ([[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]] as [number, number][]).map(([x, z]) => this.project(x, y, z, v));
  }
  centre(id: RoomId): THREE.Vector3 { const r = ROOMS[id]; return new THREE.Vector3((r.x0 + r.x1) / 2, 1.2, id === 'bridge' ? 15.2 : (r.z0 + r.z1) / 2); }
  draw(ctx: CanvasRenderingContext2D, v: MiniView) {
    this.root.position.copy(this.offset(v));
    const ok = renderModel(this.root, ctx, v.w, v.h, { yaw: MINI_YAW0, pitch: MINI_PITCH0, zoom: v.zoom * this.fit1, ink: 2, edge: 0.018 / Math.sqrt(v.zoom), shadow: [3, 4, 0.5], rimK: 0.8 });
    this.root.position.set(0, 0, 0);
    return ok;
  }
}

let built: Promise<ShipMini> | null = null;
/** the ship model, built on first use and kept for the session */
export function shipMini(): Promise<ShipMini> {
  if (built) return built;
  built = new Promise((res, rej) => {
    requestAnimationFrame(() => setTimeout(() => {
      try {
        const bin = new Bin(), M = new Mats(bin);
        const t0 = performance.now();
        const inter = buildInterior(bin, M);
        let ext: ReturnType<typeof buildExterior> | null = null;
        try { ext = buildExterior(bin, M, null as unknown as THREE.WebGLRenderer); } catch (e) { console.warn('ship exterior', e); }
        const m = new ShipMini(bin, inter, ext);
        (window as unknown as { __mini?: ShipMini }).__mini = m;
        console.info(`ship model built in ${Math.round(performance.now() - t0)} ms`);
        res(m);
      } catch (e) { built = null; rej(e); }
    }, 0));
  });
  return built;
}
