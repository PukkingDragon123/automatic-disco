// LIVING 3D VIGNETTES for the planner and the node map: small live scenes drawn into rectangles of the page (a
// building idling or running on its card, the detail view of a machine at work, the table-top diorama of the
// colony). One shared WebGL canvas is laid over whichever panel is open, at half resolution and shown at 2x with
// nearest-neighbour filtering, so the models read as pixel art like the lowpix textures they wear. Stages are
// DOM elements: each frame every visible stage's scene is drawn into its rectangle (scissored to a clip element
// when it sits in a scrolling list). Live models come from the user's lowpix tool where one exists
// (public/models/logistics/<kind>.glb, built from src/logistics/lowpix/*.json), else from the factory's own models.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FDEFS, isBelt, type FKind } from '../../factory/defs';
import { modelFor, beltGeo, type Part } from '../../factory/models';
import { machineMaterial } from '../../factory/tex';
import { gbuf } from '../../gfx/gbuf';
import { shapeOf } from '../../logistics/catalog';
import { ContainerModel } from '../../inv/models';
import { Container } from '../../inv/container';
import { CONTAINER_KINDS, type ContainerKind } from '../../inv/kinds';

export interface Stage {
  el: HTMLElement;
  scene: THREE.Scene;
  cam: THREE.PerspectiveCamera;
  /** a scrolling ancestor the stage is clipped to */
  clip?: HTMLElement | null;
  /** clear colour behind the scene (null: transparent) */
  bg?: number | null;
  tick?: (dt: number, t: number) => void;
}

// ------------------------------------------------------------------ the shared layer
let R: THREE.WebGLRenderer | null = null;
let failed = false;
const stages = new Set<Stage>();
let host: HTMLElement | null = null;
/** the art scale: screen px per rendered px */
export const VSC = 2;
function renderer(): THREE.WebGLRenderer | null {
  if (R || failed) return R;
  try {
    const cv = document.createElement('canvas');
    cv.className = 'vg-layer';
    Object.assign(cv.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none', imageRendering: 'pixelated', zIndex: '5' });
    R = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: false, powerPreference: 'low-power' });
    R.setPixelRatio(1 / VSC);
    R.outputColorSpace = THREE.SRGBColorSpace;
    R.shadowMap.enabled = true; R.shadowMap.type = THREE.BasicShadowMap;
  } catch { failed = true; R = null; }
  return R;
}
/** put the layer into a panel (it covers the panel's box; stages draw where their elements are) */
export function attachLayer(el: HTMLElement, z = 5) {
  const r = renderer(); if (!r) return;
  if (host !== el) { el.appendChild(r.domElement); host = el; }
  r.domElement.style.zIndex = String(z);
}
export function addStage(s: Stage) { stages.add(s); return () => stages.delete(s); }
export function removeStage(s: Stage) { stages.delete(s); }
/** draw every visible stage inside the current host */
export function drawStages(dt: number, t: number) {
  const r = R; if (!r || !host || !host.isConnected) return;
  const hb = host.getBoundingClientRect();
  if (hb.width < 4 || hb.height < 4 || getComputedStyle(host).display === 'none') return;
  const W = Math.round(hb.width), H = Math.round(hb.height);
  const cv = r.domElement;
  if (cv.style.width !== W + 'px' || cv.style.height !== H + 'px') r.setSize(W, H);
  r.setScissorTest(false); r.setClearColor(0x000000, 0); r.clear(true, true, true);
  r.setScissorTest(true);
  for (const s of stages) {
    if (!s.el.isConnected || !host.contains(s.el)) continue;
    let b = s.el.getBoundingClientRect();
    if (b.width < 2 || b.height < 2) continue;
    let x0 = b.left, y0 = b.top, x1 = b.right, y1 = b.bottom;
    if (s.clip) { const c = s.clip.getBoundingClientRect(); x0 = Math.max(x0, c.left); y0 = Math.max(y0, c.top); x1 = Math.min(x1, c.right); y1 = Math.min(y1, c.bottom); }
    x0 = Math.max(x0, hb.left); y0 = Math.max(y0, hb.top); x1 = Math.min(x1, hb.right); y1 = Math.min(y1, hb.bottom);
    if (x1 - x0 < 2 || y1 - y0 < 2) continue;
    // the viewport is the whole stage (the camera frames it); the scissor is the visible part
    r.setViewport(b.left - hb.left, H - (b.bottom - hb.top), b.width, b.height);
    r.setScissor(x0 - hb.left, H - (y1 - hb.top), x1 - x0, y1 - y0);
    if (s.bg !== undefined && s.bg !== null) { r.setClearColor(s.bg, 1); r.clear(true, true, false); } else r.clearDepth();
    s.cam.aspect = b.width / b.height; s.cam.updateProjectionMatrix();
    s.tick?.(dt, t);
    r.render(s.scene, s.cam);
    void (b = b);
  }
  r.setScissorTest(false);
}
/** project a point of a stage's scene to page px (callouts point at it) */
export function project(s: Stage, p: THREE.Vector3): [number, number] {
  const b = s.el.getBoundingClientRect(), v = p.clone().project(s.cam);
  return [b.left + (v.x * 0.5 + 0.5) * b.width, b.top + (-v.y * 0.5 + 0.5) * b.height];
}

// ------------------------------------------------------------------ lights and a studio set
/** a small set: key, fill and rim lights, a soft ground for shadows */
export function studioScene(opts: { ground?: number | null; shadow?: boolean } = {}): THREE.Scene {
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xf3ead8, 0x6b5a44, 1.7));
  const key = new THREE.DirectionalLight(0xfff0d8, 2.6); key.position.set(-4, 7, 5);
  if (opts.shadow) { key.castShadow = true; key.shadow.mapSize.set(512, 512); Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 20 }); key.shadow.bias = -0.002; }
  sc.add(key);
  const rim = new THREE.DirectionalLight(0xd8e8f0, 1.0); rim.position.set(3, 4, -6); sc.add(rim);
  if (opts.ground !== null && opts.ground !== undefined) {
    const g = new THREE.Mesh(new THREE.CircleGeometry(3.2, 6), gbuf(new THREE.MeshLambertMaterial({ color: opts.ground })));
    g.rotation.x = -Math.PI / 2; g.receiveShadow = true; sc.add(g);
  }
  return sc;
}

// ------------------------------------------------------------------ live models
import { LOWPIX_KINDS as LOWPIX } from '../../logistics/catalog';
/** the parts of a lowpix model that move while it runs: name, axis, speed (rad/s) */
const LP_PARTS: Record<string, [string, 'x' | 'y' | 'z', number][]> = {
  sawbench: [['blade', 'z', 14]], crusher: [['wheel', 'z', 5], ['axle', 'z', 5]], feedvat: [['shaft', 'z', 4], ['motor', 'y', 0]],
};
const glb = new Map<string, THREE.Group | null>();
const waiting = new Map<string, (() => void)[]>();
let loader: GLTFLoader | null = null;
/** a lowpix model for a building kind (null when there is none; loads once, then calls back) */
export function lowpixModel(kind: string, onLoad?: () => void): THREE.Group | null {
  if (!LOWPIX.has(kind)) return null;
  const hit = glb.get(kind);
  if (hit !== undefined) return hit;
  if (onLoad) (waiting.get(kind) ?? waiting.set(kind, []).get(kind)!).push(onLoad);
  if (!waiting.has(kind + ':req')) {
    waiting.set(kind + ':req', []);
    loader ??= new GLTFLoader();
    loader.load(`${import.meta.env.BASE_URL ?? '/'}models/logistics/${kind}.glb`, (g) => {
      const root = g.scene;
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = true; m.receiveShadow = true;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mt of mats) { const tx = (mt as THREE.MeshBasicMaterial).map; if (tx) { tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.generateMipmaps = false; tx.needsUpdate = true; } gbuf(mt, 1); }
      });
      root.scale.setScalar(1 / 16);
      glb.set(kind, root);
      for (const f of waiting.get(kind) ?? []) f();
    }, undefined, () => glb.set(kind, null));
  }
  return null;
}
let mat: THREE.Material | null = null;
export interface Live { root: THREE.Group; tick(dt: number, running: boolean): void; size: THREE.Vector3; center: THREE.Vector3; lowpix: boolean }
const _box = new THREE.Box3();
/** a building as a live model: its moving parts turn, press and rock while it runs; a container is the inventory
 *  agent's own model, showing its real load when the container is given */
export function liveModel(kind: FKind, onReady?: () => void, box?: unknown): Live {
  const def = FDEFS[kind], root = new THREE.Group();
  const lp = lowpixModel(kind, onReady);
  const spin: { o: THREE.Object3D; ax: 'x' | 'y' | 'z'; sp: number }[] = [];
  const parts: { o: THREE.Object3D; p: Part; base: THREE.Vector3 }[] = [];
  let cm: ContainerModel | null = null;
  if ((CONTAINER_KINDS as string[]).includes(kind)) {
    try { cm = new ContainerModel((box as Container) ?? demoBox(kind as ContainerKind), { shadow: true }); root.add(cm.root); } catch { cm = null; }
  }
  if (cm) { /* the container model is the whole thing */ }
  else if (lp) {
    const c = lp.clone(true);
    root.add(c);
    for (const [name, ax, sp] of LP_PARTS[kind] ?? []) { const o = c.getObjectByName(name); if (o && sp) spin.push({ o, ax, sp }); }
  } else if (def) {
    mat ??= machineMaterial(1);
    if (isBelt(kind)) { for (let i = -1; i <= 1; i++) { const m = new THREE.Mesh(beltGeo('straight', kind === 'pipe'), mat); m.position.z = i; root.add(m); } }
    else {
      const sh = shapeOf(kind), md = modelFor(sh.key, def.model, sh.hook);
      const base = new THREE.Mesh(md.base, mat); base.castShadow = true; base.receiveShadow = true; root.add(base);
      for (const p of md.parts) { const m = new THREE.Mesh(p.geo, mat); m.position.set(...p.pivot); m.castShadow = true; root.add(m); parts.push({ o: m, p, base: m.position.clone() }); }
    }
  }
  root.updateMatrixWorld(true);
  _box.setFromObject(root);
  const size = _box.getSize(new THREE.Vector3()), center = _box.getCenter(new THREE.Vector3());
  let ph = 0;
  return {
    root, size, center, lowpix: !!lp,
    tick(dt, running) {
      ph += dt * (running ? 1 : 0.15);
      if (cm && Math.floor(ph * 2) !== Math.floor((ph - dt) * 2)) cm.update();
      for (const s of spin) s.o.rotation[s.ax] += dt * s.sp * (running ? 1 : 0.08);
      for (const { o, p, base } of parts) {
        o.position.copy(base); o.rotation.set(0, 0, 0);
        switch (p.mode) {
          case 'spin': o.rotation[p.axis] = ph * p.speed; break;
          case 'rock': o.rotation[p.axis] = Math.sin(ph * p.speed * Math.PI) * (p.amp ?? 0.3); break;
          case 'yaw': o.rotation.y = Math.sin(ph * p.speed) * (p.amp ?? 0.5); break;
          case 'bob': o.position.y += Math.sin(ph * p.speed * 6) * (p.amp ?? 0.1); break;
          case 'press': { if (p.axis === 'x') { o.position.x += Math.sin(ph * p.speed * 2) * (p.amp ?? 0.5); break; } const c = (ph * p.speed) % 1; o.position.y -= (c < 0.3 ? c / 0.3 : c < 0.5 ? 1 : 1 - (c - 0.5) / 0.5) * (p.amp ?? 0.3); break; }
        }
      }
    },
  };
}
/** a believable load for a container shown in the planner */
const demo = new Map<string, Container>();
function demoBox(kind: ContainerKind): Container {
  let c = demo.get(kind); if (c) return c;
  c = new Container(kind, 1);
  const loads: Partial<Record<ContainerKind, [string, number][]>> = { crate: [['wood', 12], ['plank', 20]], st_bin: [['ore', 60], ['gravel', 40]], st_pit: [['soil', 120], ['clay', 30]], st_bunker: [['ore', 120], ['coal', 60]], st_tank: [['water', 160]], st_freezer: [['meat', 6], ['fruit', 20]], silo: [['seed_grass', 120]], st_cabinet: [['tissue', 8]], st_vault: [['seed_tree', 20]] };
  for (const [id, n] of loads[kind] ?? []) { try { c.insert(id, n); } catch { /* not in this catalogue */ } }
  demo.set(kind, c);
  return c;
}
/** frame a camera on a model: three-quarter view, the model filling `fill` of the frame */
export function frameCam(cam: THREE.PerspectiveCamera, live: Live, yaw = 0.62, pitch = 0.5, fill = 1) {
  const r = Math.max(live.size.x, live.size.z, live.size.y * 1.1) * 0.62 / fill + 0.15;
  const d = r / Math.tan((cam.fov * Math.PI) / 360);
  const c = live.center;
  cam.position.set(c.x + Math.sin(yaw) * Math.cos(pitch) * d, c.y + Math.sin(pitch) * d, c.z + Math.cos(yaw) * Math.cos(pitch) * d);
  cam.lookAt(c.x, c.y - live.size.y * 0.05, c.z);
}
