// THE SHIP MINIATURE: the MERIDIAN's own cutaway (the hub's deck: src/ship/hub/interior.ts, every room furnished
// and cluttered) rebuilt once as a kit 3D ELEMENT: every material redrawn with the UI kit's toon shader and drawn
// through the kit's renderer, so the whole deck reads as an outlined pixel-art model sitting in a 2D frame. Rooms
// are hotspots: the deck point under the pointer names the room; a room's look follows its state (a locked room is a
// cold, dim ghost of itself, a hovered room lifts its light, the open room stays lit). Drag to turn it (a limited
// arc round the cutaway's own view, so the full-height far walls never face the camera), wheel to lean in.
//   const m = await shipMini()          (built once, cached for the session)
//   m.attach(canvas) / m.draw(view)      render into a canvas at art resolution
//   m.project(x, y, z, view) -> [px, py] where a deck point lands in the canvas
//   m.roomAt(px, py, view) -> RoomId     the room under a canvas point
//   m.setLook(id, 'locked' | 'idle' | 'hot' | 'open')
import * as THREE from 'three';
import { Bin, Mats } from '../hub/kit';
import { buildInterior } from '../hub/interior';
import { ROOMS, ROOM_IDS, roomAt, type RoomId } from '../hub/layout';
import { toon, renderModel, fitRoot } from '../../ui/kit/model3d';

export type RoomLook = 'locked' | 'idle' | 'hot' | 'open';
export interface MiniView { w: number; h: number; yaw: number; pitch: number; zoom: number }
const LOOK: Record<RoomLook, { bright: number; tint: number }> = {
  locked: { bright: 0.8, tint: 0x8494b0 },
  idle: { bright: 1.12, tint: 0xffffff },
  hot: { bright: 1.34, tint: 0xfff2dc },
  open: { bright: 1.26, tint: 0xfff6e8 },
};
/** the cutaway's own view direction (port-aft-above), as a turntable yaw for the kit camera */
export const MINI_YAW0 = 1.9, MINI_PITCH0 = 0.8;

interface Part { mesh: THREE.Mesh; src: THREE.Material[]; room: RoomId | null }
export class ShipMini {
  readonly root: THREE.Group;
  private parts: Part[] = [];
  private looks = new Map<RoomId, RoomLook>();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private R0: number; private H0: number;
  /** the deck inside root's child (fitRoot offset) */
  private inner: THREE.Object3D;
  private texes = new Map<string, THREE.Texture>();
  constructor(readonly bin: Bin, readonly interior: ReturnType<typeof buildInterior>) {
    const deck = interior.root;
    deck.updateMatrixWorld(true);
    // what does not belong in a still model: lights, pick boxes, particles, lines, shader effects
    const drop: THREE.Object3D[] = [];
    deck.traverse((o) => {
      if ((o as THREE.Light).isLight) { drop.push(o); return; }
      if ((o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite) { drop.push(o); return; }
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      if (o.userData.room || mats.some((x) => !x || (x as THREE.ShaderMaterial).isShaderMaterial || x.visible === false || x.blending === THREE.AdditiveBlending) || (m as THREE.InstancedMesh).isInstancedMesh) { drop.push(o); return; }
    });
    for (const o of drop) o.removeFromParent();
    // every mesh to the kit's toon material, keeping its own map (its UV transform baked into the geometry)
    deck.traverse((o) => {
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      let room: RoomId | null = null;
      for (let p: THREE.Object3D | null = o; p; p = p.parent) { const k = /^room:(\w+)/.exec(p.name); if (k) { room = k[1] as RoomId; break; } }
      const src = (Array.isArray(m.material) ? m.material : [m.material]).slice();
      this.bakeUV(m, src[0]);
      this.parts.push({ mesh: m, src, room });
    });
    for (const id of ROOM_IDS) this.looks.set(id, 'idle');
    this.restyle();
    this.root = fitRoot(deck);
    this.inner = deck;
    this.R0 = this.root.userData.fitR as number; this.H0 = this.root.userData.fitH as number;
  }
  /** the map's offset / repeat into the geometry's own uvs (the toon shader samples raw uvs) */
  private bakeUV(m: THREE.Mesh, mt: THREE.Material) {
    const map = (mt as THREE.MeshLambertMaterial).map; const g = m.geometry as THREE.BufferGeometry;
    if (!map || !g.attributes.uv || g.userData.uvBaked) return;
    map.updateMatrix();
    const e = map.matrix.elements, uv = g.attributes.uv as THREE.BufferAttribute;
    if (e[0] === 1 && e[4] === 1 && !e[6] && !e[7] && !e[1] && !e[3]) { g.userData.uvBaked = true; return; }
    for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, e[0] * u + e[3] * v + e[6], e[1] * u + e[4] * v + e[7]); }
    uv.needsUpdate = true; g.userData.uvBaked = true;
  }
  /** a raw-colour copy of a hub texture (the kit renderer draws in raw colour), nearest when magnified */
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
    const s = mt as THREE.MeshLambertMaterial & { metalness?: number; roughness?: number };
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
  look(id: RoomId) { return this.looks.get(id) ?? 'idle'; }

  // ---------------------------------------------------------------- the camera (the kit renderer's own framing)
  /** set this.cam exactly as renderModel frames the model (orthographic, pitched, the turntable yaw on the root) */
  private frame(v: MiniView) {
    const R0 = this.R0, zoom = v.zoom, half = R0 / zoom, asp = v.w / v.h, dist = R0 * 4, cam = this.cam;
    cam.left = -half * Math.max(1, asp); cam.right = half * Math.max(1, asp); cam.top = half / Math.min(1, asp); cam.bottom = -half / Math.min(1, asp);
    cam.near = dist - R0 * 1.6; cam.far = dist + R0 * 1.6;
    cam.position.set(0, Math.sin(v.pitch) * dist, Math.cos(v.pitch) * dist); cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  }
  /** ship-local (deck metres) -> the kit pivot's world space */
  private toWorld(p: THREE.Vector3, yaw: number) {
    const q = p.clone().add(this.inner.position); // fitRoot moved the deck inside the root
    q.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    q.y -= this.H0 / 2;
    return q;
  }
  private fromWorld(q: THREE.Vector3, yaw: number) {
    const p = q.clone(); p.y += this.H0 / 2;
    p.applyAxisAngle(new THREE.Vector3(0, 1, 0), -yaw);
    return p.sub(this.inner.position);
  }
  /** where a deck point lands in the canvas (art px) */
  project(x: number, y: number, z: number, v: MiniView): [number, number] {
    this.frame(v);
    const q = this.toWorld(new THREE.Vector3(x, y, z), v.yaw).project(this.cam);
    return [(q.x * 0.5 + 0.5) * v.w, (1 - (q.y * 0.5 + 0.5)) * v.h];
  }
  /** the deck point under a canvas point (on the plane y = h) */
  deckAt(px: number, py: number, v: MiniView, h = 0): THREE.Vector3 | null {
    this.frame(v);
    const nx = (px / v.w) * 2 - 1, ny = 1 - (py / v.h) * 2;
    const o = new THREE.Vector3(nx, ny, -1).unproject(this.cam), e = new THREE.Vector3(nx, ny, 1).unproject(this.cam);
    const a = this.fromWorld(o, v.yaw), b = this.fromWorld(e, v.yaw);
    if (Math.abs(b.y - a.y) < 1e-6) return null;
    const t = (h - a.y) / (b.y - a.y);
    return a.lerp(b, t);
  }
  /** the room under a canvas point: the room whose floor or mid-height box the sight line meets first */
  roomAt(px: number, py: number, v: MiniView): RoomId | null {
    for (const h of [1.2, 0.6, 0]) { const p = this.deckAt(px, py, v, h); if (!p) continue; const id = roomAt(p.x, p.z); if (id) return id; }
    return null;
  }
  /** the zoom that frames the whole deck for this view (a margin of 4%) */
  fitZoom(v: Omit<MiniView, 'zoom'>): number {
    const pts: THREE.Vector3[] = [];
    for (const x of [-7.2, 7.2]) for (const z of [-14, 18.5]) for (const y of [0, 3.4]) pts.push(new THREE.Vector3(x, y, z));
    let mx = 0, my = 0;
    const tv = { ...v, zoom: 1 };
    this.frame(tv);
    for (const p of pts) { const q = this.toWorld(p, v.yaw).project(this.cam); mx = Math.max(mx, Math.abs(q.x)); my = Math.max(my, Math.abs(q.y)); }
    return 0.96 / Math.max(mx, my, 0.05);
  }
  /** a room's floor outline in the canvas (the four corners at height y) */
  outline(id: RoomId, v: MiniView, y = 0): [number, number][] {
    if (id === 'bridge') return ([[-6, 12], [6, 12], [6, 15], [3.6, 18.5], [-3.6, 18.5], [-6, 15]] as [number, number][]).map(([x, z]) => this.project(x, y, z, v));
    const r = ROOMS[id];
    return ([[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]] as [number, number][]).map(([x, z]) => this.project(x, y, z, v));
  }
  centre(id: RoomId): THREE.Vector3 { const r = ROOMS[id]; return new THREE.Vector3((r.x0 + r.x1) / 2, 1.2, id === 'bridge' ? 15.2 : (r.z0 + r.z1) / 2); }
  draw(ctx: CanvasRenderingContext2D, v: MiniView) {
    return renderModel(this.root, ctx, v.w, v.h, { yaw: v.yaw, pitch: v.pitch, zoom: v.zoom, ink: 2, edge: 0.018, shadow: [3, 4, 0.5], rimK: 0.8 });
  }
}

let built: Promise<ShipMini> | null = null;
/** the miniature, built on first use and kept for the session (the deck takes a moment to furnish) */
export function shipMini(): Promise<ShipMini> {
  if (built) return built;
  built = new Promise((res, rej) => {
    // a frame first, so the cover transition has drawn before the deck is furnished
    requestAnimationFrame(() => setTimeout(() => {
      try {
        const bin = new Bin(), M = new Mats(bin);
        const t0 = performance.now();
        const inter = buildInterior(bin, M);
        const m = new ShipMini(bin, inter);
        (window as unknown as { __mini?: ShipMini }).__mini = m;
        console.info(`ship miniature built in ${Math.round(performance.now() - t0)} ms`);
        res(m);
      } catch (e) { built = null; rej(e); }
    }, 0));
  });
  return built;
}
