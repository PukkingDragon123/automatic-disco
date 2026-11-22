// The colony HUD's hardware as real 3D objects (V6 "UI = DETAILED 3D, REAL TECH"). A lit overlay scene is drawn over
// the game frame through a long-lens camera whose z = 0 plane maps 1:1 onto CSS pixels, so the DOM above it (clicks,
// the few words) lines up exactly while anything standing proud of the plates shows real depth. It holds:
//   - PLATES: every HUD panel is a bevelled 3D slab with its painted face (pxPanel's plates, 2 px per texel) and real
//     screw heads in the corners;
//   - the INSTRUMENT CLUSTER (top centre): one riveted steel panel carrying a spinning turbine with battery lamps, an
//     oxygen bottle with a sight glass, four enamel dials with needles under domed reflective glass, and a stamped
//     reading plate under each with alarm lamps;
//   - the TIME KEYS (top right): kit3d physical keys with raised legends that press and latch, the active one lit, and
//     the sol clock on a kit3d glass screen;
//   - the TOOL DRUM (bottom right): a toothed drum bored with eight sockets (the slot's tool picture at the bottom of
//     each bore, a brass collar and bolts as the slot is upgraded, a padlocked cap while closed) turning on a sprung
//     detent; it drives two side cogs and a piston, an amber lens marks the chosen slot, the brass hub shows its level.
// Materials are lit standard PBR with a studio environment for the reflections; textures are kit3d's 32 px/m tiles.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { gbuf } from '../gfx/gbuf';
import type { Colony } from '../colony/colony';
import type { VitalId, Level } from '../colony/vitals';
import { TOOLS } from '../colony/tools';
import { gaugeFace } from './desk/paint';
import { Pix, R, fontText, platePix, textWidth, fontsReady } from './desk/pxPanel';
import { lowpixIcon } from './desk/hudArt';
import { tex32, K3, type TexKind } from './kit3d/tex';
import { physicalKey, type PhysicalKey } from './kit3d/physicalKey';
import { glassScreen, SCR, type GlassScreen } from './kit3d/glassScreen';

const TAU = Math.PI * 2, FOV = 22, PXM = 250 /* CSS px per metre for kit3d parts */, TEXEL = 2 /* CSS px per texel */;
type Std = THREE.MeshStandardMaterial;
function std(color: number, kind: TexKind | null, o: THREE.MeshStandardMaterialParameters = {}): Std {
  const m = new THREE.MeshStandardMaterial({ color: kind ? 0xffffff : color, map: kind ? tex32(color, kind) : null, metalness: 0.2, roughness: 0.5, ...o });
  gbuf(m, o.transparent ? 0 : 1); return m;
}
/** planar UVs by each vertex's dominant normal axis, one texel per TEXEL CSS px (kit3d's tiles are 64 texels) */
function uvPx<T extends THREE.BufferGeometry>(g: T, scale = 1 / (64 * TEXEL)): T {
  const p = g.getAttribute('position'); if (!g.getAttribute('normal')) g.computeVertexNormals();
  const nn = g.getAttribute('normal'), uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(nn.getX(i)), ay = Math.abs(nn.getY(i)), az = Math.abs(nn.getZ(i));
    let u: number, v: number;
    if (az >= ax && az >= ay) { u = p.getX(i); v = p.getY(i); } else if (ay >= ax) { u = p.getX(i); v = p.getZ(i); } else { u = p.getZ(i); v = p.getY(i); }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}
function pixTex(p: Pix) {
  const t = new THREE.CanvasTexture(p.canvas());
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}
/** a gear outline, extruded: teeth round the rim, an optional centre bore, optional round holes */
function gearGeo(r: number, teeth: number, depth: number, tooth: number, bore: number, holes: [number, number, number][] = []) {
  const s = new THREE.Shape(), n = teeth * 4;
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU, k = i % 4, rr = k === 1 || k === 2 ? r + tooth : r; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; if (i === 0) s.moveTo(x, y); else s.lineTo(x, y); }
  s.closePath();
  if (bore > 0) { const h = new THREE.Path(); h.absarc(0, 0, bore, 0, TAU, true); s.holes.push(h); }
  for (const [x, y, hr] of holes) { const h = new THREE.Path(); h.absarc(x, y, hr, 0, TAU, true); s.holes.push(h); }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 1.6, bevelSize: 1.4, bevelSegments: 2, curveSegments: 28 });
  g.translate(0, 0, -depth / 2); g.clearGroups();
  return uvPx(g);
}
const cyl = (r: number, h: number, seg = 24) => { const g = new THREE.CylinderGeometry(r, r, h, seg); g.rotateX(Math.PI / 2); return uvPx(g); };
const hash = (a: number, b: number) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; }
/** a box whose front face carries a whole texture (planar UVs across its x/y extent) */
function facedBox(w: number, h: number, d: number, r: number) {
  const g = new RoundedBoxGeometry(w, h, d, 1, r), P = g.getAttribute('position'), uv = new Float32Array(P.count * 2);
  for (let i = 0; i < P.count; i++) { uv[i * 2] = P.getX(i) / w + 0.5; uv[i * 2 + 1] = P.getY(i) / h + 0.5; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}

/** a stamped reading plate's face (44 x 11 art px): bone enamel, the reading in ink, red when it fails */
function readingPix(s: string, lvl: Level, blink: boolean) {
  const W = 44, H = 11, p = new Pix(W, H);
  p.rect(0, 0, W, H, R.steel[0]); p.rect(1, 1, W - 2, H - 2, R.bone[4]); p.hl(1, W - 2, 1, R.bone[5]); p.hl(1, W - 2, H - 2, R.bone[2]);
  const col = lvl === 'crit' ? (blink ? R.stampRed[1] : R.stampRed[3]) : lvl === 'warn' ? R.ochre[1] : R.ink[1];
  const t = new Pix(W, 22); fontText(t, s, W / 2, 0, col, { align: 'center' });
  let y0 = 99, y1 = -1;
  for (let y = 0; y < t.h; y++) for (let x = 0; x < W; x++) if (t.a(x, y)) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (y1 >= 0) p.blit(t, 0, Math.round((H - (y1 - y0 + 1)) / 2) - y0);
  return p;
}
/** a play triangle pointing right (metres, for a key legend) */
/** each dial's own enamel face, ink, icon colour and icon (9 x 7) */
const DIAL: Record<string, [number, number, number, string[]]> = {
  food: [R.malachite[6], R.malachite[1], R.malachite[2], ['....#....', '.#.###.#.', '..#####..', '...###...', '.#.###.#.', '..#####..', '....#....']],
  integrity: [R.steel[6], R.steel[1], R.steel[2], ['#########', '#.#...#.#', '#.......#', '#.......#', '.#.....#.', '..#...#..', '...###...']],
  health: [R.coral[5], R.coral[0], R.stampRed[1], ['.##...##.', '####.####', '#########', '.#######.', '..#####..', '...###...', '....#....']],
  morale: [R.ochre[6], R.ochre[1], R.ochre[1], ['..#####..', '.#.....#.', '#..#.#..#', '#.......#', '#.#...#.#', '.#.###.#.', '..#####..']],
};
/** an engraved metal plate (1 texel = 1 CSS px): brushed steel or brass with a bevel, the lines cut in (dark, a lit lower lip) */
function engraved(w: number, h: number, lines: { s: string; face: 'Body' | 'Title' }[], metal: 'steel' | 'brass' = 'steel') {
  const p = new Pix(w, h), Rm = metal === 'brass' ? R.brass : R.steel, top = Rm[Rm.length - 1];
  p.rect(0, 0, w, h, Rm[4]);
  for (let y = 1; y < h - 1; y++) { let x = (y * 7) % 13; while (x < w) { const L = 5 + ((x * 13 + y * 7) % 19); if ((x + y * 3) % 4 === 0) p.hl(x, Math.min(w - 2, x + L), y, Rm[5]); x += L + 6 + ((x + y) % 9); } }
  p.hl(0, w - 1, 0, top); p.vl(0, 0, h - 1, Rm[5]); p.hl(1, w - 1, h - 1, Rm[1]); p.vl(w - 1, 1, h - 1, Rm[1]);
  const blocks = lines.map((l) => { const t = new Pix(w, 40); fontText(t, l.s, Math.round(w / 2), 0, R.ink[1], { face: l.face, align: 'center', shadow: top }); let y0 = 99, y1 = -1; for (let y = 0; y < t.h; y++) for (let x = 0; x < w; x++) if (t.a(x, y)) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { t, y0, hh: y1 >= 0 ? y1 - y0 + 1 : 0 }; });
  const total = blocks.reduce((a, b) => a + b.hh, 0) + 4 * (blocks.length - 1); let y = Math.round((h - total) / 2);
  for (const b of blocks) { p.blit(b.t, 0, y - b.y0); y += b.hh + 4; }
  return p;
}
/** a CSS background-image url */
const urlOf = (bg: string) => /url\(["']?(.*?)["']?\)/.exec(bg)?.[1] ?? '';
const tri = () => new THREE.Shape([new THREE.Vector2(-0.022, -0.032), new THREE.Vector2(0.026, 0), new THREE.Vector2(-0.022, 0.032)]);
const bar = () => new THREE.Shape([new THREE.Vector2(-0.01, -0.034), new THREE.Vector2(0.01, -0.034), new THREE.Vector2(0.01, 0.034), new THREE.Vector2(-0.01, 0.034)]);

interface Plate { el: HTMLElement | null; rect: (() => DOMRect | null) | null; paint: (w: number, h: number) => Pix; mesh: THREE.Mesh | null; key: string; metal: number; screws: boolean; seed: number }
interface Inst { id: VitalId; el: HTMLElement; g: THREE.Group; needle: THREE.Object3D | null; val: number; tex: THREE.CanvasTexture; cv: HTMLCanvasElement; text: string; lamps: THREE.Mesh[] }
interface Socket { floor: THREE.Mesh; icon: THREE.Mesh; collar: THREE.Mesh; bolts: THREE.Object3D; cap: THREE.Object3D; tool: string | null; z: number }
interface Dyn { sel: string; clip?: string; paint?: (w: number, h: number, lit: boolean) => Pix; img?: boolean; screws?: boolean; metal?: number; z?: number; lit?: (el: HTMLElement) => boolean; pool: { mesh: THREE.Mesh; key: string }[] }
export interface HwState { paused: boolean; speed: number; drumAng: number; pump: number; hover: number; focus: number }

export class Hud3D {
  readonly scene = new THREE.Scene();
  readonly cam = new THREE.PerspectiveCamera(FOV, 1, 10, 10000);
  private t = 0; private envDone = false; private failed = false;
  private M: Record<string, Std>;
  private plates: Plate[] = []; private dyns: Dyn[] = []; private imgs = new Map<string, THREE.Texture>();
  // the colony nameplate and the SHIP AI LINK guarded switch
  private idTx: HTMLElement | null = null; private idPlate: THREE.Mesh | null = null;
  private link: { el: HTMLElement; g: THREE.Group; guard: THREE.Group; btn: THREE.Mesh; open: number; hot: boolean; press: number } | null = null;
  private heads: THREE.InstancedMesh; private slots: THREE.InstancedMesh;
  // instruments
  private insts: Inst[] = []; private turbine = new THREE.Group(); private batLamps: THREE.Mesh[] = []; private fluid: THREE.Mesh | null = null; private o2 = 0.5;
  // time keys and clock
  private keys: { k: PhysicalKey; el: HTMLElement; legend: THREE.Mesh[]; on: boolean; z: number }[] = []; private clockEl: HTMLElement | null = null; private screen: GlassScreen | null = null; private clockText = '';
  // the drum
  private drumCv: HTMLCanvasElement | null = null; private drum = new THREE.Group(); private drumBody = new THREE.Group(); private cogs: THREE.Mesh[] = []; private plunger!: THREE.Group; private lens!: THREE.Mesh; private nameCv!: HTMLCanvasElement; private nameTex!: THREE.CanvasTexture; private nameText = ''; private cfgKey: PhysicalKey | null = null; private pips: THREE.Mesh[] = []; private sockets: Socket[] = [];

  constructor() {
    this.M = {
      steel: std(0xb9bec2, 'brushed', { metalness: 0.75, roughness: 0.36 }),
      steelDark: std(0x6b7378, 'brushed', { metalness: 0.7, roughness: 0.42 }),
      gun: std(0x3e454b, 'painted', { metalness: 0.35, roughness: 0.5 }),
      brass: std(0xd0a456, 'brushed', { metalness: 0.9, roughness: 0.3 }),
      bone: std(0xe6dcc4, 'painted', { metalness: 0.0, roughness: 0.38 }),
      socket: std(0xa89c82, 'painted', { metalness: 0.0, roughness: 0.45 }),
      rust: std(0xd9783c, 'painted', { metalness: 0.0, roughness: 0.4, emissive: new THREE.Color(0x3a1404) }),
      ochre: std(0xc99a3c, 'painted', { metalness: 0.1, roughness: 0.45 }),
      orange: std(0xd2702e, 'painted', { metalness: 0.15, roughness: 0.45 }),
      bottle: std(0x5f8fb8, 'painted', { metalness: 0.25, roughness: 0.32 }),
      bore: std(0x121416, null, { metalness: 0.2, roughness: 0.85 }),
      red: std(0xc23a2a, null, { metalness: 0.3, roughness: 0.35 }),
      fluid: std(0x6ec8ff, null, { metalness: 0, roughness: 0.2, emissive: new THREE.Color(0x1e6aa0) }),
      lampOff: std(0x23251f, null, { metalness: 0.1, roughness: 0.4 }),
      lampG: std(0x9cf08e, null, { emissive: new THREE.Color(0x52c060), emissiveIntensity: 1.3, roughness: 0.3, metalness: 0 }),
      lampA: std(0xffc46a, null, { emissive: new THREE.Color(0xd08a20), emissiveIntensity: 1.4, roughness: 0.3, metalness: 0 }),
      lampR: std(0xff7060, null, { emissive: new THREE.Color(0xd02a1a), emissiveIntensity: 1.6, roughness: 0.3, metalness: 0 }),
      amber: std(0xffc070, null, { emissive: new THREE.Color(0xd88a28), emissiveIntensity: 1.5, roughness: 0.12, metalness: 0 }),
      pipOn: std(0xe6874a, null, { emissive: new THREE.Color(0x8a3a10), roughness: 0.35, metalness: 0 }),
      legend: std(0xeadfc6, null, { roughness: 0.4, metalness: 0 }),
      linkBlue: std(0x3f78a8, null, { roughness: 0.3, metalness: 0.1, emissive: new THREE.Color(0x0c2c4c) }),
      guard: (() => { const m = new THREE.MeshStandardMaterial({ color: 0xd8482a, metalness: 0, roughness: 0.15, transparent: true, opacity: 0.6, depthWrite: false }); gbuf(m, 0); return m; })(),
      legendOn: std(0x3a1e04, null, { roughness: 0.4, metalness: 0 }),
      // domed glass: a pure reflection layer added over the face
      glass: (() => { const m = new THREE.MeshStandardMaterial({ color: 0x1a2026, metalness: 1, roughness: 0.06, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); gbuf(m, 0); return m; })(),
    };
    const sc = this.scene;
    sc.add(new THREE.HemisphereLight(0xe4e9f2, 0x3a342e, 1.5));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.6); key.position.set(-0.5, 0.75, 1); sc.add(key);
    const rim = new THREE.DirectionalLight(0x9ac8ff, 0.7); rim.position.set(0.8, -0.4, 0.5); sc.add(rim);
    sc.environmentIntensity = 0.75;
    // screw heads for every plate, instanced
    this.heads = new THREE.InstancedMesh(cyl(6, 3, 12), this.M.steel, 96); this.heads.count = 0; this.heads.frustumCulled = false; sc.add(this.heads);
    this.slots = new THREE.InstancedMesh(new THREE.BoxGeometry(8, 1.8, 1.2), this.M.bore, 96); this.slots.count = 0; this.slots.frustumCulled = false; sc.add(this.slots);
    this.buildDrum(); sc.add(this.drum); this.drum.visible = false;
  }
  private ensureEnv(renderer: THREE.WebGLRenderer) {
    if (this.envDone) return; this.envDone = true;
    try { const pm = new THREE.PMREMGenerator(renderer); this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); } catch (e) { console.warn('hud3d env', e); }
  }

  // ------------------------------------------------------------------ plates
  /** build a panel as a 3D slab: `target` is its element (or a rect function); `paint(w, h)` paints its face in art
   *  px (2 CSS px each), its painted screws covered by real ones */
  plate(target: HTMLElement | (() => DOMRect | null), paint: (w: number, h: number) => Pix, o: { metal?: number; screws?: boolean } = {}) {
    const el = target instanceof HTMLElement ? target : null;
    this.plates.push({ el, rect: el ? null : (target as () => DOMRect | null), paint, mesh: null, key: '', metal: o.metal ?? 0.15, screws: o.screws ?? true, seed: this.plates.length * 7 + 3 });
  }
  /** four real screw heads over a painted plate's corner screws */
  private screws4(n: number, x0: number, y0: number, W: number, H: number, seed: number, z = 0) {
    const hm = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3(), zr = new THREE.Vector3(0, 0, 1);
    for (let c = 0; c < 4 && n < 96; c++, n++) {
      const sx = c % 2 ? x0 + W - 11 : x0 + 11, sy = c < 2 ? y0 + 11 : y0 + H - 11;
      pos.set(sx, -sy, z + 1.2); hm.compose(pos, q.identity(), s1); this.heads.setMatrixAt(n, hm);
      pos.z = z + 2.9; q.setFromAxisAngle(zr, hash(seed, c) * Math.PI); hm.compose(pos, q, s1); this.slots.setMatrixAt(n, hm);
    }
    return n;
  }
  private slab(W: number, H: number) { const g = facedBox(W, H, 10, 3); g.translate(0, 0, -5); return g; }
  private syncPlates() {
    let n = 0;
    for (const p of this.plates) {
      const r = p.el ? (p.el.isConnected ? p.el.getBoundingClientRect() : null) : p.rect!();
      if (!r || r.width <= 8 || r.height <= 8) { if (p.mesh) p.mesh.visible = false; continue; }
      const w = Math.max(8, Math.round(r.width / TEXEL)), h = Math.max(8, Math.round(r.height / TEXEL)), k = `${w}x${h}`, W = w * TEXEL, H = h * TEXEL;
      if (k !== p.key) {
        p.key = k;
        const geo = this.slab(W, H), map = pixTex(p.paint(w, h));
        if (!p.mesh) { const m = new THREE.MeshStandardMaterial({ map, metalness: p.metal, roughness: 0.5, alphaTest: 0.5 }); gbuf(m, 1); p.mesh = new THREE.Mesh(geo, m); this.scene.add(p.mesh); }
        else { p.mesh.geometry.dispose(); p.mesh.geometry = geo; const m = p.mesh.material as Std; m.map?.dispose(); m.map = map; m.needsUpdate = true; }
      }
      const m = p.mesh!; m.visible = true;
      const x0 = Math.round(r.left), y0 = Math.round(r.top);
      m.position.set(x0 + W / 2, -(y0 + H / 2), 0);
      if (p.screws && w > 20 && h > 16) n = this.screws4(n, x0, y0, W, H, p.seed);
    }
    n = this.syncDyn(n);
    this.heads.count = n; this.slots.count = n; this.heads.instanceMatrix.needsUpdate = true; this.slots.instanceMatrix.needsUpdate = true;
  }
  /** slabs for every element matching `sel` (looked up each frame, so other modules' HUDs join in): each wears its own
   *  inline background image (`img`) or `paint(w, h, lit)`; `lit` elements sink and glow like a latched key */
  dyn(sel: string, o: Omit<Dyn, 'sel' | 'pool'>) { this.dyns.push({ sel, ...o, pool: [] }); }
  private imgTex(url: string) {
    let t = this.imgs.get(url);
    if (!t) {
      const im = new Image(); t = new THREE.Texture(im); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
      const tt = t; im.onload = () => { tt.needsUpdate = true; }; im.src = url; this.imgs.set(url, t);
      if (this.imgs.size > 80) { const [k0, t0] = this.imgs.entries().next().value as [string, THREE.Texture]; t0.dispose(); this.imgs.delete(k0); }
    }
    const im = t.image as HTMLImageElement; return im.complete && im.naturalWidth ? t : null;
  }
  private syncDyn(n: number) {
    for (const d of this.dyns) {
      const els = document.querySelectorAll<HTMLElement>(d.sel);
      els.forEach((el, i) => {
        let e = d.pool[i];
        if (!e) { const m = new THREE.MeshStandardMaterial({ metalness: d.metal ?? 0.12, roughness: 0.5, alphaTest: 0.5 }); gbuf(m, 1); e = { mesh: new THREE.Mesh(this.slab(8, 8), m), key: '' }; this.scene.add(e.mesh); d.pool.push(e); }
        const r = el.getBoundingClientRect(); let vis = r.width > 8 && r.height > 8;
        if (vis && d.clip) { const cr = el.closest(d.clip)?.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; vis = !!cr && cx > cr.left && cx < cr.right && cy > cr.top && cy < cr.bottom; }
        const mm = e.mesh.material as Std;
        if (!vis) { e.mesh.visible = false; return; }
        const w = Math.max(4, Math.round(r.width / TEXEL)), h = Math.max(4, Math.round(r.height / TEXEL)), W = w * TEXEL, H = h * TEXEL, lit = !!d.lit?.(el);
        const url = d.img ? urlOf(el.style.backgroundImage) : '', key = `${w}x${h}|${lit}|${url}`;
        if (key !== e.key) {
          const tex = d.img ? (url ? this.imgTex(url) : null) : pixTex(d.paint!(w, h, lit));
          if (d.img && !tex) { e.mesh.visible = false; return; }
          if (e.key.split('|')[0] !== `${w}x${h}`) { e.mesh.geometry.dispose(); e.mesh.geometry = this.slab(W, H); }
          if (!d.img) mm.map?.dispose();
          e.key = key; mm.map = tex; mm.emissive.setHex(lit ? 0x3a1a04 : 0); mm.needsUpdate = true;
        }
        e.mesh.visible = true;
        const x0 = Math.round(r.left), y0 = Math.round(r.top), z = (d.z ?? 0) - (lit ? 3 : 0);
        e.mesh.position.set(x0 + W / 2, -(y0 + H / 2), z);
        if (d.screws && w > 20 && h > 16) n = this.screws4(n, x0, y0, W, H, i * 5 + d.sel.length, z);
      });
      for (let i = els.length; i < d.pool.length; i++) d.pool[i].mesh.visible = false;
    }
    return n;
  }

  // ------------------------------------------------------------------ the colony nameplate and the SHIP AI LINK switch
  /** the colony's engraved brass nameplate over `tx`, and the SHIP AI LINK guarded switch over `link` (hover lifts the
   *  guard, a press sinks the button) */
  bindId(tx: HTMLElement, l1: string, l2: string, link: HTMLElement) {
    const m = this.M;
    // painted once the house faces have loaded (the plate is sized to its words)
    void fontsReady.then(() => {
      const w = Math.max(textWidth(l2, 'Title'), textWidth(l1)) + 28 & ~1, h = 48;
      tx.style.width = w + 'px'; tx.style.height = h + 'px'; this.idTx = tx;
      const pm = new THREE.MeshStandardMaterial({ map: pixTex(engraved(w, h, [{ s: l1, face: 'Body' }, { s: l2, face: 'Title' }], 'brass')), metalness: 0.7, roughness: 0.35 }); gbuf(pm, 1);
      this.idPlate = new THREE.Mesh(facedBox(w, h, 5, 2), pm); this.scene.add(this.idPlate);
      for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mesh(cyl(2.4, 2, 8), m.steel, this.idPlate, x * (w / 2 - 6), y * (h / 2 - 6), 3);
      lm.map = pixTex(engraved(72, 36, [{ s: 'SHIP AI', face: 'Body' }, { s: 'LINK', face: 'Body' }])); lm.needsUpdate = true;
    });
    const lm = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.6, roughness: 0.4 }); gbuf(lm, 1);
    const g = new THREE.Group(); this.scene.add(g);
    mesh(uvPx(new RoundedBoxGeometry(150, 56, 8, 2, 4)), m.gun, g, 0, 0, 4);
    for (const x of [-69, 69]) mesh(cyl(2.6, 2, 8), m.steel, g, x, 0, 8.6);
    mesh(cyl(19, 3, 32), m.bore, g, -40, 0, 8.5);
    mesh(new THREE.TorusGeometry(19, 2.6, 8, 32), m.steel, g, -40, 0, 9.5);
    const btn = mesh(cyl(14, 8, 28), m.linkBlue, g, -40, 0, 12);
    const pin = mesh(new THREE.CylinderGeometry(2.6, 2.6, 50, 10), m.steel, g, -40, 23, 18); pin.rotation.z = Math.PI / 2;
    const guard = new THREE.Group(); guard.position.set(-40, 23, 18); g.add(guard);
    const lid = mesh(new RoundedBoxGeometry(44, 46, 3, 1, 1.2), m.guard, guard, 0, -23, 0); lid.renderOrder = 5;
    for (const x of [-21.5, 21.5]) mesh(new THREE.BoxGeometry(3, 44, 10), m.guard, guard, x, -22, -5).renderOrder = 5;
    mesh(new THREE.BoxGeometry(44, 3, 10), m.guard, guard, 0, -45, -5).renderOrder = 5;
    mesh(facedBox(72, 36, 3, 1.5), lm, g, 26, 0, 9.5);
    this.link = { el: link, g, guard, btn, open: 0, hot: false, press: -1 };
    link.addEventListener('pointerenter', () => { if (this.link) this.link.hot = true; });
    link.addEventListener('pointerleave', () => { if (this.link) this.link.hot = false; });
    link.addEventListener('pointerdown', () => { if (this.link) this.link.press = 0; });
  }
  private syncId(dt: number) {
    if (this.idPlate && this.idTx) {
      const r = this.idTx.getBoundingClientRect();
      this.idPlate.visible = r.width > 0; this.idPlate.position.set(Math.round(r.left + r.width / 2), -Math.round(r.top + r.height / 2), 2.5);
    }
    const L = this.link; if (!L) return;
    const r = L.el.getBoundingClientRect(); L.g.visible = r.width > 0;
    L.g.position.set(Math.round(r.left + r.width / 2), -Math.round(r.top + r.height / 2), 0);
    L.open += ((L.hot ? 1 : 0) - L.open) * Math.min(1, dt * 10); L.guard.rotation.x = -1.95 * L.open;
    let dip = 0; if (L.press >= 0) { L.press += dt; const u = L.press / 0.25; dip = u < 0.3 ? u / 0.3 : Math.max(0, 1 - (u - 0.3) / 0.7); if (u >= 1) L.press = -1; }
    L.btn.position.z = 12 - 4 * dip; (L.btn.material as Std).emissiveIntensity = 1 + L.open * 1.5;
  }

  // ------------------------------------------------------------------ the instrument cluster
  /** the six vitals' cells (each 104 x 96): the instruments stand on one riveted steel panel spanning them */
  bindVitals(list: { id: VitalId; el: HTMLElement }[]) {
    const m = this.M;
    for (const { id, el } of list) {
      const g = new THREE.Group(); this.scene.add(g); let needle: THREE.Object3D | null = null;
      if (id === 'power') {
        // the turbine: a steel shroud with its bolts, a dark bore, four pitched blades on a brass spinner; the battery lamps
        mesh(new THREE.TorusGeometry(26, 4.2, 10, 40), m.steel, g, -12, 10, 4);
        mesh(cyl(24, 2, 32), m.bore, g, -12, 10, 1);
        for (const a of [0, 1.05, 2.1, 3.14, 4.19, 5.24]) mesh(cyl(1.6, 3, 6), m.steelDark, g, -12 + Math.cos(a) * 26, 10 + Math.sin(a) * 26, 8.4);
        this.turbine.position.set(-12, 10, 4); g.add(this.turbine);
        for (let k = 0; k < 4; k++) { const arm = new THREE.Group(); arm.rotation.z = (k * TAU) / 4; const b = mesh(uvPx(new THREE.BoxGeometry(9, 19, 1.6)), m.steel, arm, 0, 12, 0); b.rotation.y = 0.55; this.turbine.add(arm); }
        mesh(new THREE.SphereGeometry(6, 16, 10), m.brass, this.turbine, 0, 0, 2);
        mesh(uvPx(new RoundedBoxGeometry(14, 66, 4, 1, 2)), m.gun, g, 31, 9, 2);
        for (let i = 0; i < 5; i++) this.batLamps.push(mesh(new RoundedBoxGeometry(9, 9, 5, 1, 2), m.lampOff, g, 31, -15 + i * 12, 5));
      } else if (id === 'oxygen') {
        // the oxygen bottle on two straps: blue enamel, a white shoulder, a brass valve, a sight glass with the level
        const b = new THREE.Group(); b.position.set(0, 6, 16); g.add(b);
        mesh(uvPx(new THREE.CylinderGeometry(16, 16, 30, 32)), m.bottle, b);
        mesh(new THREE.SphereGeometry(16, 28, 10, 0, TAU, 0, Math.PI / 2), m.bone, b, 0, 15, 0);
        mesh(new THREE.SphereGeometry(16, 28, 10, 0, TAU, Math.PI / 2, Math.PI / 2), m.bottle, b, 0, -15, 0);
        for (const y of [-9, 9]) { const st = mesh(new THREE.TorusGeometry(16.4, 1.9, 6, 32), m.gun, b, 0, y, 0); st.rotation.x = Math.PI / 2; }
        mesh(new THREE.CylinderGeometry(4, 5, 7, 10), m.brass, b, 0, 33, 0);
        mesh(new THREE.BoxGeometry(13, 4, 4), m.brass, b, 0, 36, 0);
        mesh(new RoundedBoxGeometry(11, 26, 3, 1, 1.5), m.gun, b, 0, 0, 16.6);
        this.fluid = mesh(new THREE.BoxGeometry(6, 22, 2), m.fluid, b, 0, 0, 18);
        const gl = mesh(new THREE.BoxGeometry(7, 23, 1), m.glass, b, 0, 0, 19.4); gl.renderOrder = 10;
      } else {
        // an enamel dial with a needle, a steel bezel and a domed glass
        const [fc, ink, ic, art] = DIAL[id] ?? DIAL.integrity;
        const face = gaugeFace(28, { a0: -2.2, a1: 2.2, ticks: 10, red: [0, 0.22], face: fc, ink });
        art.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') face.set(10 + i, 17 + j, ic); });
        const fm = new THREE.MeshStandardMaterial({ map: pixTex(face), color: 0xdcd8d0, metalness: 0, roughness: 0.55 }); gbuf(fm, 1);
        mesh(cyl(33, 6, 40), m.gun, g, 0, 10, 3);
        mesh(new THREE.CircleGeometry(28, 40), fm, g, 0, 10, 6.2);
        mesh(new THREE.TorusGeometry(30.5, 3.4, 10, 44), m.steel, g, 0, 10, 7);
        const nd = new THREE.Group(); nd.position.set(0, 10, 8); g.add(nd); needle = nd;
        mesh(new THREE.BoxGeometry(3.2, 22, 1.6), m.red, nd, 0, 8, 0); mesh(new THREE.BoxGeometry(4.4, 7, 1.6), m.red, nd, 0, -3, 0);
        mesh(cyl(3.6, 3, 14), m.brass, g, 0, 10, 9.6);
        const dome = mesh(new THREE.SphereGeometry(60, 40, 6, 0, TAU, 0, 0.53), m.glass, g, 0, 10, 7 - 60 * Math.cos(0.53)); dome.rotation.x = Math.PI / 2; dome.renderOrder = 10;
      }
      // the stamped reading plate and its two alarm lamps
      const cv = document.createElement('canvas'); cv.width = 44; cv.height = 11;
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
      const pm = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.05, roughness: 0.4 }); gbuf(pm, 1);
      mesh(facedBox(88, 22, 5, 2), pm, g, 0, -35, 2.5);
      const lamps = [-49, 49].map((x) => mesh(new THREE.SphereGeometry(3, 10, 8), m.lampOff, g, x, -35, 3));
      this.insts.push({ id, el, g, needle, val: 0.5, tex, cv, text: '', lamps });
    }
    // one steel panel behind all six
    this.plate(() => {
      let l = 1e9, t = 1e9, r = -1e9, b = -1e9;
      for (const i of this.insts) { const q = i.el.getBoundingClientRect(); if (!q.width) return null; l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom); }
      return new DOMRect(l - 10, t - 4, r - l + 20, b - t + 8);
    }, (w, h) => platePix(w, h, { mat: 'steel', seed: 33, wear: 0.6 }), { metal: 0.5 });
  }
  /** a reading under an instrument */
  reading(id: VitalId, text: string, lvl: Level, blink: boolean) {
    const i = this.insts.find((x) => x.id === id); if (!i) return;
    const k = text + lvl + (lvl === 'crit' && blink ? '*' : '');
    if (k !== i.text) { i.text = k; i.cv.getContext('2d')!.putImageData(readingPix(text, lvl, blink).image(), 0, 0); i.tex.needsUpdate = true; }
    const L = lvl === 'crit' ? (blink ? this.M.lampOff : this.M.lampR) : lvl === 'warn' ? this.M.lampA : this.M.lampOff;
    for (const l of i.lamps) l.material = L;
  }

  // ------------------------------------------------------------------ time keys and clock
  bindTime(btns: HTMLElement[], clock: HTMLElement) {
    const legends: [() => THREE.Shape, number[], number][] = [[bar, [-0.022, 0.022], 1], [tri, [0.004], 1], [tri, [-0.02, 0.02], 0.82], [tri, [-0.036, 0, 0.036], 0.66]];
    btns.forEach((el, i) => {
      const k = physicalKey({ w: 0.2, d: 0.176, h: 0.05, cap: 0x5b636a, label: '', lit: i === 0 ? K3.red : K3.amber });
      k.group.scale.setScalar(PXM); k.group.rotation.x = Math.PI / 2; this.scene.add(k.group);
      el.addEventListener('pointerdown', () => k.press());
      const [shape, xs, s] = legends[i] ?? legends[1];
      this.keys.push({ k, el, legend: xs.map((x) => this.legendMesh(shape(), k.hit, x, s)), on: false, z: 0 });
    });
    this.clockEl = clock;
    this.screen = glassScreen({ w: 0.44, h: 0.168, res: PXM, depth: 0.05, curve: 0.004, stand: 0 });
    this.screen.group.scale.setScalar(PXM); this.scene.add(this.screen.group);
    { const ch = this.screen.group.children; this.screen.hit.position.z = 0.004; ch[ch.length - 1].position.z = 0.009; }
  }
  private legendMesh(shape: THREE.Shape, cap: THREE.Object3D, x: number, s: number) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.scale(s, 1, s);
    const m = new THREE.Mesh(g, this.M.legend); m.position.set(x, 0.025, 0); cap.add(m); return m;
  }
  /** the sol clock's two lines */
  clock(l1: string, l2: string) {
    const k = l1 + '|' + l2; if (k === this.clockText || !this.screen) return; this.clockText = k;
    this.screen.draw((g, W, H) => {
      g.fillStyle = '#0c1210'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#121c18'; for (let y = 1; y < H; y += 2) g.fillRect(0, y, W, 1);
      SCR.text(g, l1, W / 2, 2, { size: 24, col: SCR.amber, align: 'center' });
      SCR.text(g, l2, W / 2, 28, { size: 11, col: '#c99a5c', align: 'center' });
    });
  }

  // ------------------------------------------------------------------ the tool drum
  bindDrum(cv: HTMLCanvasElement, cfg?: HTMLElement) { this.drumCv = cv; cfg?.addEventListener('pointerdown', () => this.cfgKey?.press()); }
  private buildDrum() {
    const m = this.M, D = this.drum, RS = 84, HOLE = 26;
    // the housing ring and its bolts
    mesh(uvPx(new THREE.TorusGeometry(147, 7, 12, 72)), m.steel, D, 0, 0, -12);
    for (const a of [0.8, 2.35, 3.9, 5.5]) mesh(cyl(5.5, 5, 6), m.steelDark, D, Math.cos(a) * 147, Math.sin(a) * 147, -4);
    // two side cogs behind it, meshing with the drum's teeth
    this.cogs.push(mesh(gearGeo(22, 10, 8, 4.4, 4), m.brass, D, 110, 104, -26), mesh(gearGeo(18, 8, 8, 4, 3.5), m.steelDark, D, -116, -100, -26));
    mesh(cyl(6, 12, 12), m.gun, D, 110, 104, -24); mesh(cyl(5, 12, 12), m.gun, D, -116, -100, -24);
    // the detent plunger at the lower right, bolted to the housing: a gunmetal body on a bracket, a brass rod and a roller
    // riding the drum's teeth (it lifts as the teeth pass and snaps back into a gap: the click)
    { const g = new THREE.Group(), a = -0.75; g.position.set(Math.cos(a) * 150, Math.sin(a) * 150, 8); g.rotation.z = a + Math.PI / 2; D.add(g);
      mesh(uvPx(new RoundedBoxGeometry(34, 14, 5, 1, 2)), m.steelDark, g, 0, -2, -4);
      for (const x of [-12, 12]) mesh(cyl(2.6, 3, 6), m.steel, g, x, -2, -0.5);
      mesh(uvPx(new THREE.CylinderGeometry(7, 7, 20, 16)), m.gun, g, 0, -4, 3);
      mesh(new THREE.CylinderGeometry(7.6, 7.6, 3, 16), m.brass, g, 0, -14, 3);
      this.plunger = new THREE.Group(); g.add(this.plunger);
      mesh(new THREE.CylinderGeometry(3, 3, 10, 10), m.brass, this.plunger, 0, 10, 3);
      mesh(cyl(4, 6, 12), m.steel, this.plunger, 0, 16, 3); }
    // the tool's name on an engraved plate on a bracket at the left, the CONFIGURE key under it
    mesh(uvPx(new THREE.BoxGeometry(34, 8, 4)), m.steelDark, D, -158, -64, -6);
    { const cv = document.createElement('canvas'); cv.width = 168; cv.height = 34; this.nameCv = cv;
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; this.nameTex = t;
      const mm = new THREE.MeshStandardMaterial({ map: t, metalness: 0.6, roughness: 0.4 }); gbuf(mm, 1);
      mesh(facedBox(168, 34, 5, 1.5), mm, D, -256, -64, -2);
      for (const x of [-336, -176]) mesh(cyl(2.4, 2, 8), m.steel, D, x, -64, 1.2); }
    { const k = physicalKey({ w: 0.2, d: 0.176, h: 0.05, cap: 0x5b636a, label: '' }); k.group.scale.setScalar(PXM); k.group.rotation.x = Math.PI / 2; k.group.position.set(-236, -118, -8); D.add(k.group); this.cfgKey = k;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.006, 0.07), this.M.legend); bar.rotation.y = 0.785; bar.position.set(-0.006, 0.028, 0.006); k.hit.add(bar);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.005, 6, 12, Math.PI * 1.45), this.M.legend); ring.rotation.set(Math.PI / 2, 0, 1.6); ring.position.set(0.024, 0.028, -0.024); k.hit.add(ring); }
    // the drum: a toothed disc bored with the eight sockets, a dark backing behind the bores, two machined rings
    const holes: [number, number, number][] = [];
    for (let i = 0; i < 8; i++) { const a = Math.PI / 2 - (i * TAU) / 8; holes.push([Math.cos(a) * RS, Math.sin(a) * RS, HOLE]); }
    mesh(gearGeo(128, 48, 24, 6, 0, holes), m.steel, this.drumBody);
    mesh(cyl(126, 2, 64), m.bore, this.drumBody, 0, 0, -13);
    for (const r of [50, 117]) mesh(new THREE.TorusGeometry(r, 1.4, 6, 72), m.steelDark, this.drumBody, 0, 0, 13);
    for (let i = 0; i < 8; i++) {
      const [x, y] = holes[i], g = new THREE.Group(); g.position.set(x, y, 0); this.drumBody.add(g);
      const floor = mesh(cyl(25, 4, 28), m.socket, g, 0, 0, -6);
      const im = new THREE.MeshBasicMaterial({ alphaTest: 0.5 }); gbuf(im, 1);
      const icon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), im); icon.visible = false; g.add(icon);
      const collar = mesh(new THREE.TorusGeometry(29.5, 2.2, 8, 32), m.brass, g, 0, 0, 13);
      const bolts = new THREE.Group(); g.add(bolts);
      for (const b of [0.785, 2.356, 3.927, 5.498]) mesh(cyl(2.6, 3, 6), m.steel, bolts, Math.cos(b) * 29.5, Math.sin(b) * 29.5, 15.5);
      const cap = new THREE.Group(); g.add(cap);
      mesh(cyl(27, 3, 28), m.ochre, cap, 0, 0, 13.5);
      mesh(uvPx(new RoundedBoxGeometry(14, 11, 4, 1, 1.5)), m.brass, cap, 0, -3, 17);
      mesh(new THREE.TorusGeometry(4.6, 1.5, 6, 12, Math.PI), m.steel, cap, 0, 2.5, 16.5);
      this.sockets.push({ floor, icon, collar, bolts, cap, tool: null, z: -6 });
    }
    D.add(this.drumBody);
    // the hub: a brass cap with a wrench struck in it and three level pips
    mesh(cyl(40, 10, 48), m.brass, D, 0, 0, 17);
    mesh(cyl(30, 1, 40), m.steelDark, D, 0, 0, 22.4);
    const wr = mesh(uvPx(new RoundedBoxGeometry(44, 8, 3, 1, 1.5)), m.gun, D, -4, -4, 24); wr.rotation.z = 0.785;
    const jaw = mesh(new THREE.TorusGeometry(7.5, 3, 6, 14, Math.PI * 1.4), m.gun, D, 15, 15, 24); jaw.rotation.z = -1.2;
    for (let k = 0; k < 3; k++) this.pips.push(mesh(new RoundedBoxGeometry(7, 7, 3, 1, 1), m.lampOff, D, -11 + k * 11, -26, 23.5));
    // the lens bracket at the top, the amber lens, the pointer under it
    mesh(uvPx(new RoundedBoxGeometry(46, 26, 12, 2, 4)), m.steel, D, 0, 150, -2);
    mesh(new THREE.TorusGeometry(12.5, 2.4, 8, 24), m.steelDark, D, 0, 146, 5);
    this.lens = mesh(new THREE.SphereGeometry(11, 20, 10, 0, TAU, 0, Math.PI / 2), m.amber, D, 0, 146, 4); this.lens.rotation.x = Math.PI / 2;
    const ptr = mesh(new THREE.ConeGeometry(5, 9, 3), m.rust, D, 0, 129, 10); ptr.rotation.z = Math.PI;
  }

  // ------------------------------------------------------------------ the frame
  /** follow the DOM layout, animate from the colony, draw over the frame */
  render(renderer: THREE.WebGLRenderer, c: Colony, dt: number, st: HwState) {
    if (this.failed) return;
    try { this.frame(renderer, c, dt, st); } catch (e) { this.failed = true; console.error('hud3d', e); }
  }
  private frame(renderer: THREE.WebGLRenderer, c: Colony, dt: number, st: HwState) {
    this.ensureEnv(renderer);
    this.t += dt;
    const W = renderer.domElement.clientWidth || innerWidth, H = renderer.domElement.clientHeight || innerHeight, cam = this.cam;
    const dist = H / 2 / Math.tan((FOV * Math.PI) / 360);
    cam.aspect = W / H; cam.near = dist - 800; cam.far = dist + 800; cam.position.set(W / 2, -H / 2, dist); cam.lookAt(W / 2, -H / 2, 0); cam.updateProjectionMatrix();
    this.syncPlates(); this.syncId(dt);
    const v = c.vitals, k = Math.min(1, dt * 4);
    // instruments
    for (const i of this.insts) {
      const r = i.el.getBoundingClientRect(); i.g.visible = r.width > 0;
      i.g.position.set(Math.round(r.left + r.width / 2), -Math.round(r.top + r.height / 2), 0);
      if (i.needle) { i.val += (Math.max(0, Math.min(1, v.value(i.id))) - i.val) * k; i.needle.rotation.z = -(-2.2 + 4.4 * i.val) + (v.levels[i.id] === 'crit' ? Math.sin(this.t * 40) * 0.03 : 0); }
    }
    this.turbine.rotation.z -= dt * 7 * Math.max(0, (v.gen - v.draw) / 8 + (v.battery > 1 ? 0.5 : 0));
    const bat = v.battery / v.batteryCap, bl = v.levels.power, BL = bl === 'ok' ? this.M.lampG : bl === 'warn' ? this.M.lampA : this.M.lampR;
    this.batLamps.forEach((l, i) => { l.material = bat * 5 > i + 0.3 ? BL : this.M.lampOff; });
    this.o2 += (v.o2 / 100 - this.o2) * k;
    if (this.fluid) { const f = Math.max(0.02, Math.min(1, this.o2)); this.fluid.scale.y = f; this.fluid.position.y = -11 + 11 * f; }
    // keys: lit and latched down while active, a press on click
    this.keys.forEach((e, i) => {
      const r = e.el.getBoundingClientRect(), on = i === 0 ? st.paused : !st.paused && st.speed === i;
      e.k.group.visible = r.width > 0;
      if (on !== e.on) { e.on = on; e.k.setLit(on); for (const l of e.legend) l.material = on ? this.M.legendOn : this.M.legend; }
      e.z += ((on ? -3 : 0) - e.z) * Math.min(1, dt * 12);
      e.k.group.position.set(Math.round(r.left + r.width / 2), -Math.round(r.top + r.height / 2), e.z);
      e.k.update(dt);
    });
    if (this.screen && this.clockEl) {
      const r = this.clockEl.getBoundingClientRect(); this.screen.group.visible = r.width > 0;
      this.screen.group.position.set(Math.round(r.left + r.width / 2), -Math.round(r.top + r.height / 2) - (0.084 + 0.035) * PXM, 0);
    }
    // the drum
    const dr = this.drumCv?.getBoundingClientRect(); this.drum.visible = !!dr && dr.width > 0;
    if (dr && dr.width > 0) {
      const s = dr.width / 320; this.drum.scale.setScalar(s);
      this.drum.position.set(Math.round(dr.left + dr.width / 2), -Math.round(dr.top + dr.height * (164 / 320)), 14 * s);
      const ang = st.drumAng; this.drumBody.rotation.z = -ang;
      this.cogs[0].rotation.z = ang * (48 / 10); this.cogs[1].rotation.z = ang * (48 / 8);
      this.plunger.position.y = -Math.min(5, st.pump * 9);
      this.cfgKey?.update(dt);
      (this.lens.material as Std).emissiveIntensity = c.slots.active >= 0 ? 1.7 + Math.sin(this.t * 4) * 0.3 : 0.35;
      const show = st.hover >= 0 ? st.hover : c.slots.active >= 0 ? c.slots.active : st.focus, lv = c.slots.slots[show]?.level ?? 0;
      this.pips.forEach((p, i) => { p.material = i < lv ? this.M.pipOn : this.M.lampOff; });
      const ss = c.slots.slots[show], nm = !ss ? '' : ss.level <= 0 ? 'LOCKED' : ss.tool ? TOOLS[ss.tool].name.toUpperCase() : 'EMPTY';
      if (nm !== this.nameText) { this.nameText = nm; this.nameCv.getContext('2d')!.putImageData(engraved(168, 34, [{ s: nm, face: 'Title' }]).image(), 0, 0); this.nameTex.needsUpdate = true; }
      this.sockets.forEach((so, i) => {
        const sl = c.slots.slots[i], lock = sl.level <= 0, act = c.slots.active === i;
        so.cap.visible = lock; so.collar.visible = !lock && sl.level >= 2; so.bolts.visible = sl.level >= 3;
        so.floor.material = lock ? this.M.steelDark : act ? this.M.rust : this.M.socket;
        const name = !lock && sl.tool ? TOOLS[sl.tool].icon : null;
        if (name !== so.tool) {
          so.tool = name; so.icon.visible = false;
          const im = name ? lowpixIcon(name, true) : null, mm = so.icon.material as THREE.MeshBasicMaterial;
          if (im) {
            const tx = new THREE.Texture(im); tx.colorSpace = THREE.SRGBColorSpace; tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.generateMipmaps = false;
            const up = () => { if (so.tool !== name) return; tx.needsUpdate = true; so.icon.scale.set(im.naturalWidth, im.naturalHeight, 1); mm.map?.dispose(); mm.map = tx; mm.needsUpdate = true; so.icon.visible = true; };
            if (im.complete && im.naturalWidth) up(); else im.addEventListener('load', up, { once: true });
          }
        }
        const goal = lock ? -6 : act ? 3 : st.hover === i ? -1 : -6; so.z += (goal - so.z) * Math.min(1, dt * 14);
        so.floor.position.z = so.z; so.icon.position.z = so.z + 2.2; so.icon.rotation.z = ang;
        if (so.icon.visible) (so.icon.material as THREE.MeshBasicMaterial).color.setScalar(c.slots.unitOf(i) ? 1 : 0.45);
      });
    }
    // draw over the frame (depth cleared, colour kept)
    const auto = renderer.autoClear; renderer.autoClear = false; renderer.setRenderTarget(null);
    renderer.setScissorTest(false); renderer.setViewport(0, 0, W, H); renderer.clearDepth();
    renderer.render(this.scene, cam);
    renderer.autoClear = auto;
  }
}
