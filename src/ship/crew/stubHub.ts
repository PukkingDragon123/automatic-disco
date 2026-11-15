// For QA: the real ship hub (src/ship/hub) when it loads, otherwise a plain stand-in built from the hub's static deck
// plan (layout.ts: the same rooms, bounds, spots and cameras), so the crew and the intro can be tested on their own.
import * as THREE from 'three';
import type { Engine } from '../../app/engine';
import { gbuf } from '../../gfx/gbuf';
import { ROOMS, ROOM_IDS, roomCam, overviewCam, WALL_H, type RoomId } from '../hub/layout';
import type { HubLike, HubRoomLike } from './life';

export interface TestHub extends HubLike {
  focus(id: RoomId, o?: { instant?: boolean }): Promise<void>;
  shot?(c: { pos: THREE.Vector3; look: THREE.Vector3; fov?: number }, dur?: number): Promise<void>;
  release?(): void; lockInput?(on: boolean): void; showChrome?(on: boolean): void;
  breach?(): { pos: THREE.Vector3; normal: THREE.Vector3; patch(k: number): void; done(): void };
  alarm?(on: boolean): void; podBuild?(k: number): void; pod?: THREE.Object3D;
  stub?: boolean;
}

export async function hubForTest(engine: Engine, P: URLSearchParams): Promise<TestHub> {
  const room = (P.get('room') || '') as RoomId;
  if (!P.has('stub')) {
    try {
      const m = await import('../hub/hub');
      const hub = new m.ShipHub(engine, { inside: true, isNewGame: P.has('new') });
      engine.setScreen(hub); engine.start();
      if (room && (ROOM_IDS as string[]).includes(room)) await hub.focus(room, { instant: true }); else await hub.overview({ instant: true });
      return hub as unknown as TestHub;
    } catch (e) { console.warn('[crew] ship hub unavailable, using the stand-in', e); }
  }
  const hub = new StubHub(engine);
  engine.setScreen(hub); engine.start();
  if (room && (ROOM_IDS as string[]).includes(room)) await hub.focus(room, { instant: true });
  return hub;
}

const mat = (c: number) => gbuf(new THREE.MeshLambertMaterial({ color: c }), 1);
export class StubHub implements TestHub {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 400);
  readonly stub = true;
  focused: RoomId | null = null; mode = 'overview';
  private rooms = {} as Record<RoomId, HubRoomLike>;
  private fns = new Set<(dt: number, t: number) => void>();
  private t = 0;
  constructor(readonly engine: Engine) {
    const s = this.scene; s.background = new THREE.Color(0x0c1016);
    s.add(new THREE.HemisphereLight(0xc8d4e0, 0x3a3430, 1.1));
    const key = new THREE.DirectionalLight(0xfff0e0, 1.6); key.position.set(-12, 30, -8); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera as THREE.OrthographicCamera; sc.left = -36; sc.right = 36; sc.top = 36; sc.bottom = -36; sc.far = 100; s.add(key, key.target);
    const floorM = mat(0x5a6068), wallM = mat(0x7a8088), cutM = mat(0x4a5058), furn = mat(0x8a7a64), steel = mat(0x6a7480);
    for (const id of ROOM_IDS) {
      const r = ROOMS[id], root = new THREE.Group(); root.name = 'room:' + id; s.add(root);
      const w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      const fl = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.1, d - 0.1), floorM); fl.position.set(cx, -0.05, cz); fl.receiveShadow = true; root.add(fl);
      const wx = new THREE.Mesh(new THREE.BoxGeometry(0.12, WALL_H, d), wallM); wx.position.set(r.x1, WALL_H / 2, cz); root.add(wx);
      const wz = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, 0.12), wallM); wz.position.set(cx, WALL_H / 2, r.z1); root.add(wz);
      const lx = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.05, d), cutM); lx.position.set(r.x0, 0.52, cz); root.add(lx);
      const lz = new THREE.Mesh(new THREE.BoxGeometry(w, 1.05, 0.12), cutM); lz.position.set(cx, 0.52, r.z0); root.add(lz);
      const L = new THREE.PointLight(r.light, 14 * r.lightK, 14, 1.4); L.position.set(cx, 3.0, cz); root.add(L);
      const spots: HubRoomLike['spots'] = {};
      for (const [n, sp] of Object.entries(r.spots)) {
        spots[n] = { pos: new THREE.Vector3(...sp.p), facing: sp.f };
        // a block of furniture where a spot implies one (a seat, a bunk, a console)
        const fx = Math.sin(sp.f), fz = Math.cos(sp.f);
        if (n.startsWith('seat') || n === 'chair' || n === 'captain') { const b = new THREE.Mesh(new THREE.BoxGeometry(0.45, sp.p[1] - 0.02, 0.45), furn); b.position.set(sp.p[0], (sp.p[1] - 0.02) / 2, sp.p[2]); root.add(b); }
        else if (n.startsWith('bunk')) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 2.0), furn); b.position.set(sp.p[0], sp.p[1] - 0.06, sp.p[2] + fz * 0.95); root.add(b); }
        else if (['bench', 'terminal', 'scope', 'tank', 'comms', 'helm', 'nav', 'galley', 'counter', 'coffee', 'console', 'workbench', 'valves', 'shelves', 'doctor', 'cabinet', 'scanner', 'toolwall', 'welder', 'racks'].includes(n)) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.95, 0.6), steel); b.position.set(sp.p[0] + fx * 0.65, 0.475, sp.p[2] + fz * 0.65); b.rotation.y = sp.f; b.castShadow = true; root.add(b);
        }
      }
      if (id === 'mess') { const t = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.75, 3.2), furn); t.position.set(5.2, 0.375, 1.5); root.add(t); }
      const bounds = new THREE.Box3(new THREE.Vector3(r.x0, 0, r.z0), new THREE.Vector3(r.x1, WALL_H, r.z1));
      this.rooms[id] = { id, root, bounds, spots };
    }
    const cor = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 44), floorM); cor.position.set(0, -0.05, -5); s.add(cor);
    const o = overviewCam(); this.camera.position.copy(o.pos); this.camera.lookAt(o.look); this.camera.fov = o.fov; this.camera.updateProjectionMatrix();
  }
  room(id: RoomId) { return this.rooms[id]; }
  onUpdate(fn: (dt: number, t: number) => void) { this.fns.add(fn); return () => { this.fns.delete(fn); }; }
  async focus(id: RoomId, o: { instant?: boolean } = {}) { void o; this.focused = id; const c = roomCam(id); this.camera.position.copy(c.pos); this.camera.lookAt(c.look); this.camera.fov = c.fov; this.camera.updateProjectionMatrix(); this.mode = 'room'; }
  async shot(c: { pos: THREE.Vector3; look: THREE.Vector3; fov?: number }) { this.mode = 'shot'; this.camera.position.copy(c.pos); this.camera.lookAt(c.look); if (c.fov) { this.camera.fov = c.fov; this.camera.updateProjectionMatrix(); } }
  release() { this.mode = 'room'; }
  lockInput() {} showChrome() {}
  alarm(on: boolean) { void on; }
  podBuild(k: number) { void k; }
  update(dt: number, t: number) { this.t += dt; for (const f of this.fns) f(dt, t); }
  render(post: import('../../gfx/post').Post, t: number) { post.render(this.scene, this.camera, undefined, t); }
  resize(w: number, h: number) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
}
