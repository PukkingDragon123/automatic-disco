// The other live vignettes behind the paper:
//   ScannerVignette   RESEARCH: the latest specimen on a turntable under a glass dome, a scan ring sweeping it
//   BenchVignette     UPGRADER: the Upgrader (lowpix model) beside the pod (the colony's lowpix model), the part
//                     being built hanging from the gantry, the pod's install slots marked for callouts
//   ShipVignette      MISSION: the UNAA Meridian (the ship agent's exterior) in orbit over the planet, stars behind
import * as THREE from 'three';
import { Vignette, lam, glowM, mesh } from './stage3d';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { gbuf } from '../../gfx/gbuf';

const V = THREE.Vector3;
const glbCache = new Map<string, Promise<THREE.Group | null>>();
/** a lowpix glb (public/models/<dir>/<name>.glb) restyled into the game's lighting, sized to `width` metres */
export async function lowpixGlb(dir: string, name: string, width: number): Promise<THREE.Group | null> {
  let p = glbCache.get(dir + '/' + name);
  if (!p) { p = new Promise((res) => new GLTFLoader().load(`${import.meta.env.BASE_URL ?? '/'}models/${dir}/${name}.glb`, (g) => res(g.scene as THREE.Group), undefined, () => res(null))); glbCache.set(dir + '/' + name, p); }
  const src = await p; if (!src) return null;
  const root = src.clone(true);
  root.traverse((n) => {
    const m = n as THREE.Mesh; if (!m.isMesh) return;
    const old = m.material as THREE.MeshStandardMaterial, map = old.map;
    if (map) { map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestMipmapNearestFilter; map.colorSpace = THREE.SRGBColorSpace; map.needsUpdate = true; }
    m.material = gbuf(new THREE.MeshLambertMaterial({ map, side: old.side, alphaTest: 0.5 }), 1); m.castShadow = true; m.receiveShadow = true;
  });
  const box = new THREE.Box3().setFromObject(root), size = box.getSize(new V()), c = box.getCenter(new V()), k = width / Math.max(size.x, size.z);
  const holder = new THREE.Group(); holder.add(root); root.scale.setScalar(k); root.position.set(-c.x * k, -box.min.y * k, -c.z * k);
  return holder;
}

// ------------------------------------------------------------------ RESEARCH
export type SpecimenKind = 'species' | 'plant' | 'ore' | 'crystal' | 'vent' | 'ruin' | 'none';
export class ScannerVignette extends Vignette {
  private table = new THREE.Group(); private ring!: THREE.Mesh; private spec = new THREE.Group();
  readonly anchors: Record<string, THREE.Object3D> = {};
  constructor() {
    super({ bg: 0x9aa6a8, top: 0x3a3e42 });
    this.target.set(0, 1.4, 0); this.dist = 7.4; this.pitch = 0.2;
    const brass = lam(0xb08a4a), gun = lam(0x3a3d40), glass = lam(0xcfe4e8, { transparent: true, opacity: 0.18, side: THREE.DoubleSide });
    mesh(new THREE.CylinderGeometry(1.25, 1.35, 0.3, 24), gun, [0, 0.75, 0], this.root);
    mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.05, 24), brass, [0, 0.92, 0], this.root);
    this.table.position.y = 0.95; this.root.add(this.table);
    mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.06, 24), lam(0x2b2e31), [0, 0.03, 0], this.table);
    this.table.add(this.spec);
    const dome = mesh(new THREE.SphereGeometry(1.15, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass, [0, 0.95, 0], this.root); dome.castShadow = false;
    mesh(new THREE.TorusGeometry(1.15, 0.04, 6, 32), brass, [0, 0.96, 0], this.root).rotation.x = Math.PI / 2;
    // the scan arm and its sweeping ring of light
    mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), gun, [1.55, 1.9, -0.3], this.root);
    mesh(new THREE.BoxGeometry(0.9, 0.1, 0.12), gun, [1.15, 3.15, -0.3], this.root);
    mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.25, 8), brass, [0.72, 3.0, -0.3], this.root);
    this.ring = mesh(new THREE.TorusGeometry(1.0, 0.02, 4, 40), glowM(0x9fe0d0, 0.9), [0, 1.2, 0], this.root); this.ring.rotation.x = Math.PI / 2; this.ring.castShadow = false;
    const a = new THREE.Object3D(); a.position.set(0, 1.9, 0); this.root.add(a); this.anchors.spec = a;
    const b = new THREE.Object3D(); b.position.set(0.72, 3.0, -0.3); this.root.add(b); this.anchors.head = b;
  }
  /** put a specimen on the table: a creature from the run's registry, a plant, an ore body, a ruin stone */
  async show(kind: SpecimenKind, name: string, sp?: { design?: unknown } | null) {
    this.spec.clear();
    const add = (o: THREE.Object3D) => this.spec.add(o);
    if (kind === 'species' && sp?.design) {
      try {
        const [{ buildSpeciesModel, makeInstance }, { Animator }] = await Promise.all([import('../../life/creatureMesh'), import('../../life/anim')]);
        const m = buildSpeciesModel(sp.design as never), { mesh: cm, bones } = makeInstance(m);
        const box = new THREE.Box3().setFromObject(cm), s = box.getSize(new V()); cm.scale.setScalar(1.3 / Math.max(s.x, s.y, s.z)); add(cm);
        const an = new Animator(m.rig, bones, cm); this.tick = (dt, t) => an.update(dt, { speed: 0, turn: 0, state: 'idle', act: (t * 0.5) % 1, lookYaw: Math.sin(t * 0.6) * 0.5, lookPitch: 0, ground: () => 0, air: 1 } as never);
        return;
      } catch { /* fall through to a stand-in */ }
    }
    this.tick = null;
    if (kind === 'plant' || kind === 'species') {
      const stem = lam(0x5a6a2e), leaf = lam(0x6f9e45, { side: THREE.DoubleSide });
      mesh(new THREE.CylinderGeometry(0.03, 0.05, 1.0, 6), stem, [0, 0.5, 0], this.spec);
      for (let k = 0; k < 7; k++) { const l = mesh(new THREE.PlaneGeometry(0.22, 0.5), leaf, [Math.cos(k * 2.4) * 0.12, 0.3 + k * 0.1, Math.sin(k * 2.4) * 0.12], this.spec); l.rotation.set(-0.6, k * 2.4, 0.4); }
      mesh(new THREE.SphereGeometry(0.1, 8, 6), lam(0xe0a040), [0, 1.05, 0], this.spec);
    } else if (kind === 'ore' || kind === 'crystal' || kind === 'vent' || kind === 'none') {
      const rock = mesh(new THREE.DodecahedronGeometry(0.45, 0), lam(kind === 'vent' ? 0x6a5a4a : 0x6a625a), [0, 0.38, 0], this.spec); rock.scale.set(1.2, 0.8, 1);
      const xc = kind === 'crystal' ? 0x9a7ad0 : kind === 'vent' ? 0xe08a3a : 0xc8873a;
      for (let k = 0; k < 6; k++) { const c = mesh(new THREE.CylinderGeometry(0, 0.08, 0.4 + (k % 3) * 0.12, 5), lam(xc, { emissive: kind === 'crystal' ? 0x2a1a40 : 0 }), [Math.cos(k * 1.1) * 0.25, 0.6, Math.sin(k * 1.1) * 0.22], this.spec); c.rotation.set(Math.sin(k) * 0.5, 0, Math.cos(k * 1.7) * 0.5); }
    } else {
      // a ruin stone with its glyph strip
      mesh(new THREE.BoxGeometry(0.45, 1.3, 0.35), lam(0x3b3a40), [0, 0.65, 0], this.spec);
      for (let k = 0; k < 4; k++) mesh(new THREE.BoxGeometry(0.2 + (k % 2) * 0.1, 0.05, 0.02), glowM(0x6fd0b8), [0, 0.3 + k * 0.25, 0.18], this.spec);
    }
    void name;
  }
  private tick: ((dt: number, t: number) => void) | null = null;
  override update(dt: number) {
    super.update(dt);
    this.table.rotation.y += dt * 0.35;
    const u = (Math.sin(this.t * 1.3) * 0.5 + 0.5); this.ring.position.y = 1.0 + u * 1.0; this.ring.scale.setScalar(1 - u * 0.35);
    this.tick?.(dt, this.t);
  }
}

// ------------------------------------------------------------------ UPGRADER
export class BenchVignette extends Vignette {
  readonly anchors: Record<string, THREE.Object3D> = {};
  private part = new THREE.Group(); private hoist = new THREE.Group();
  progress = -1;
  constructor() {
    super({ bg: 0xa8a090, top: 0x4a4038, plinth: false });
    this.target.set(0.5, 1.3, 0); this.dist = 15; this.pitch = 0.3; this.sway = 0.3;
    // a poured pad under both
    mesh(new THREE.BoxGeometry(7.4, 0.2, 4.4), lam(0x8a8478), [0.6, 0.1, 0], this.root);
    void lowpixGlb('progression', 'upgrader', 3).then((u) => { if (u) { u.position.set(-1.4, 0.2, 0); this.root.add(u); } else mesh(new THREE.BoxGeometry(2.8, 2.6, 2.8), lam(0x9f4621), [-1.4, 1.5, 0], this.root); });
    void lowpixGlb('colony', 'pod', 2.8).then((p) => { if (p) { p.position.set(2.4, 0.2, 0); p.rotation.y = -0.6; this.root.add(p); } else mesh(new THREE.DodecahedronGeometry(1.2, 1), lam(0xd6d2c4), [2.4, 1.4, 0], this.root); });
    this.hoist.position.set(-1.4, 2.2, 0.2); this.root.add(this.hoist);
    this.hoist.add(this.part);
    for (const [k, at] of Object.entries({ core: [2.4, 2.6, 0.3], arm: [3.5, 1.5, 0.2], tool: [2.0, 1.4, 1.2], drone: [2.0, 0.6, -0.9], gantry: [-1.4, 3.1, 0] } as Record<string, [number, number, number]>)) { const a = new THREE.Object3D(); a.position.set(...at); this.root.add(a); this.anchors[k] = a; }
  }
  /** the part on the hoist: a blueprint's silhouette in its material, ghosted until it is being built */
  setPart(icon: string, building: boolean) {
    this.part.clear();
    const m = building ? lam(0xd9a43a) : lam(0xd8e0e8, { transparent: true, opacity: 0.45 });
    const shapes: Record<string, () => void> = {
      shield: () => { mesh(new THREE.BoxGeometry(0.9, 0.6, 0.06), m, [0, 0, 0], this.part); },
      drone: () => { mesh(new THREE.BoxGeometry(0.5, 0.15, 0.4), m, [0, 0, 0], this.part); for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.4, 0.02, 0.06), m, [s * 0.4, 0.08, 0], this.part); },
      claw: () => { mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.2, 8), m, [0, 0.1, 0], this.part); for (let k = 0; k < 3; k++) mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), m, [Math.cos(k * 2.1) * 0.1, -0.12, Math.sin(k * 2.1) * 0.1], this.part); },
    };
    (shapes[icon] ?? (() => { mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.4, 8), m, [0, 0, 0], this.part); mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), m, [0, 0.24, 0], this.part); }))();
  }
  override update(dt: number) {
    super.update(dt);
    this.part.rotation.y += dt * 0.5;
    this.hoist.position.y = this.progress >= 0 ? 2.2 - Math.min(1, this.progress) * 0.9 : 2.2 + Math.sin(this.t) * 0.04;
  }
}

// ------------------------------------------------------------------ MISSION
export class ShipVignette extends Vignette {
  readonly anchors: Record<string, THREE.Object3D> = {};
  private ship = new THREE.Group(); ext: { update(dt: number, t: number, cam: THREE.Camera): void; dispose(): void } | null = null;
  constructor(renderer: THREE.WebGLRenderer) {
    super({ bg: 0x10141e, plinth: false });
    this.scene.fog = null;
    this.target.set(0, 0, 0); this.dist = 14; this.pitch = 0.18; this.auto = 0.05; this.sway = 0.25;
    // stars
    const sg = new THREE.BufferGeometry(), pts: number[] = [];
    for (let k = 0; k < 900; k++) { const v = new V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(80); pts.push(v.x, v.y, v.z); }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xe8e4d8, size: 2, sizeAttenuation: false })));
    // the planet below, its terminator turned toward the camera
    const pl = mesh(new THREE.SphereGeometry(30, 48, 24), lam(0x4f7a6a), [0, -36, -10], this.scene); pl.receiveShadow = false;
    mesh(new THREE.SphereGeometry(30.6, 48, 24), glowM(0x9fd0e8, 0.12), [0, -36, -10], this.scene).castShadow = false;
    this.scene.children.filter((c) => (c as THREE.Mesh).geometry instanceof THREE.CircleGeometry).forEach((c) => (c.visible = false));
    this.root.add(this.ship);
    void (async () => {
      try {
        const [{ buildExterior }, { Bin, Mats }] = await Promise.all([import('../../ship/hub/exterior'), import('../../ship/hub/kit')]);
        const bin = new Bin(), M = new Mats(bin), ex = buildExterior(bin, M, renderer);
        const box = new THREE.Box3().setFromObject(ex.root), s = box.getSize(new V()), k = 9 / Math.max(s.x, s.y, s.z), c = box.getCenter(new V());
        ex.root.scale.setScalar(k); ex.root.position.set(-c.x * k, -c.y * k, -c.z * k);
        this.ship.add(ex.root); this.ext = ex; this.ship.rotation.y = 0.9;
        this.disposers.push(() => bin.dispose());
      } catch (e) {
        console.warn('mission vignette ship', e);
        mesh(new THREE.CapsuleGeometry(0.9, 6, 4, 10), lam(0xe8e6dc), [0, 0, 0], this.ship).rotation.z = Math.PI / 2;
        mesh(new THREE.BoxGeometry(1.6, 0.3, 1.9), lam(0xc36530), [0, 0, 0], this.ship);
      }
    })();
    for (const [k, at] of Object.entries({ ship: [0, 1.2, 0], planet: [0, -5.5, -2] } as Record<string, [number, number, number]>)) { const a = new THREE.Object3D(); a.position.set(...at); this.root.add(a); this.anchors[k] = a; }
  }
  private disposers: (() => void)[] = [];
  override update(dt: number) { super.update(dt); this.ship.position.y = Math.sin(this.t * 0.4) * 0.15; this.ship.rotation.z = Math.sin(this.t * 0.3) * 0.03; try { this.ext?.update(dt, this.t, this.cam); } catch { /* ship fx */ } }
  override dispose() { super.dispose(); for (const f of this.disposers) f(); }
}

// ------------------------------------------------------------------ photographs: real renders of our own scenes for 2D art
/** stylise a render for a card: broad strokes (half resolution), a warm film palette, posterised tones */
export function stylise(src: HTMLCanvasElement, k = 2): HTMLCanvasElement {
  const w = Math.max(8, Math.floor(src.width / k)), h = Math.max(8, Math.floor(src.height / k));
  const small = document.createElement('canvas'); small.width = w; small.height = h;
  const g = small.getContext('2d')!; g.imageSmoothingEnabled = true; g.drawImage(src, 0, 0, w, h);
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    for (let c = 0; c < 3; c++) { let v = d[i + c] * 0.8 + l * 0.2; v = (v - 128) * 1.18 + 128 + (c === 0 ? 8 : c === 2 ? -6 : 0); d[i + c] = Math.round(Math.max(0, Math.min(255, v)) / 28) * 28; }
  }
  g.putImageData(img, 0, 0);
  const out = document.createElement('canvas'); out.width = w * k; out.height = h * k;
  const o = out.getContext('2d')!; o.imageSmoothingEnabled = false; o.drawImage(small, 0, 0, out.width, out.height);
  return out;
}
/** render a vignette once through the engine's own post pipeline and read the frame back (the next frame redraws
 *  the screen as usual); `frame` poses the camera, the crop is the centre `cw` x `ch` of the screen in CSS px */
export function photograph(engine: { post: { render(s: THREE.Scene, c: THREE.Camera, fx?: THREE.Scene, t?: number): void }; canvas: HTMLCanvasElement; time: number }, vig: Vignette, cw: number, ch: number): HTMLCanvasElement | null {
  try {
    const W = innerWidth, H = innerHeight, save = vig.margins;
    vig.margins = [0, 0]; vig.resize(W, H); vig.update(0);
    engine.post.render(vig.scene, vig.cam, undefined, engine.time);
    const src = engine.canvas, sx = src.width / W, sy = src.height / H;
    const cv = document.createElement('canvas'); cv.width = Math.round(cw * sx); cv.height = Math.round(ch * sy);
    cv.getContext('2d')!.drawImage(src, Math.round((W - cw) / 2 * sx), Math.round((H - ch) / 2 * sy), cv.width, cv.height, 0, 0, cv.width, cv.height);
    vig.margins = save; vig.resize(W, H);
    return stylise(cv, 2);
  } catch (e) { console.warn('photograph', e); return null; }
}
/** the Meridian in orbit, rendered once from the ship agent's exterior model (cached) */
let shipPhoto: Promise<string | null> | null = null;
export function australPhoto(engine: Parameters<typeof photograph>[0] & { renderer: THREE.WebGLRenderer }): Promise<string | null> {
  return (shipPhoto ??= (async () => {
    const v = new ShipVignette(engine.renderer); v.auto = 0; v.yaw = 0.6; v.dist = 30; v.pitch = 0.24;
    for (let k = 0; k < 40 && !(v as unknown as { ext: unknown }).ext; k++) await new Promise((r) => setTimeout(r, 100));
    const c = photograph(engine, v, 640, 360); v.dispose();
    return c ? c.toDataURL() : null;
  })());
}
