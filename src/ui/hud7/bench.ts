// HUD v7 · THE FABRICATION BAY (custom tools; from the arsenal's BENCH, or B in it). The user asked for a full facility
// here (the one exception to "no full 3D scenes"): an iris from the HUD, then the camera swoops into a detailed 3D bay
// drawn in the kit's pixel style (art resolution, black ink contours, banded light, MATERIAL LIBRARY textures at HD 2,
// lamps that really light it): a heavy workbench with the clamping JIG at its centre, a PARTS RACK WALL with every part
// hanging on hooks in four lit rows, an overhead GANTRY crane with a telescoping claw, a WELDING ROBOT and its gas cart,
// cable runs, tool chests, stock crates, pendant lamps with haze cones.
// The 2D layer stays slim: a category strip (HEAD CORE GRIP MOD) at the top, small stat chips beside the jig, the bill
// of parts as item icons at the bottom, one FORGE key, a BACK icon.
// Click (or drag) a part on the rack: the gantry runs over, the claw drops, grips it, carries it to the jig, the jaws
// open, the part goes on, the jaws lock with sparks and a clunk. FORGE: the robot welds the tool (sparks, a hot light),
// it cools (steam, a hiss), then the jaws open and the finished tool rises and spins with its working parts animating.
import * as THREE from 'three';
import type { Game } from '../../game/game';
import { matTex, matInfo } from '../../gfx/mat';
import { toon, snapshot, LAMPS } from '../kit/model3d';
import { mJig, animJig, mountTool } from '../kit/hardware';
import { mCustomTool, animCustom, mCrate, type PartSlot } from '../kit/models';
import { tex, dialTex } from '../kit/tex3d';
import { Px, P, INK, cellBar } from '../kit/px';
import { plate, skin, pxCanvas } from '../kit/mat';
import { uiSfx } from '../kit/sound';
import { tween, ease, onFrame, burst, placeDust, shake, pop, floatUp, wait } from '../kit/juice';
import { transition } from '../kit/transitions';
import { floatIcon } from '../kit/floatIcon';
import { installKitStyle } from '../kit/style';
import { itemIcon, ITEMS } from '../../factory/items';
import { PARTS, PART_SLOTS, partOf, statsOf, costOf, addCustomTool, customTools, type Stats } from './tools';
import type { ToolWidget } from './toolWidget';

type G = Game & Record<string, any>;
const PI = Math.PI;
const SLOT_NAME: Record<PartSlot, string> = { head: 'HEAD', core: 'CORE', grip: 'GRIP', mod: 'MOD' };
const ROW_Y: Record<PartSlot, number> = { head: 2.72, core: 2.12, grip: 1.52, mod: 0.92 };
const STATS: { k: keyof Stats; name: string; max: number; ramp: readonly number[] }[] = [
  { k: 'power', name: 'PWR', max: 8, ramp: P.glowAmber }, { k: 'reach', name: 'RCH', max: 14, ramp: P.glowTeal }, { k: 'speed', name: 'SPD', max: 5, ramp: P.malachite },
  { k: 'draw', name: 'KW', max: 10, ramp: P.ruby }, { k: 'mass', name: 'KG', max: 8, ramp: P.stone },
];

// ------------------------------------------------------------------ library materials, box-mapped at HD 2, lamp-lit
const libCache = new Map<string, THREE.ShaderMaterial>();
function L(name: string, o: { color?: number; metal?: number; gloss?: number; emissive?: number; emissiveK?: number } = {}): THREE.ShaderMaterial {
  const key = name + JSON.stringify(o); let m = libCache.get(key);
  if (m) return m;
  let map: THREE.Texture | null = null, tri = 1;
  try {
    const t0 = matTex(name, { hd: 2 }), t = t0.clone();
    t.colorSpace = THREE.NoColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true;
    map = t; tri = 1 / (matInfo(name)?.mw ?? 1);
  } catch (e) { console.warn('bay material', name, e); }
  m = toon({ map, tri, lamps: true, light: 0.72, ...o });
  libCache.set(key, m);
  return m;
}
const K = (name: string, rep: [number, number] = [1, 1], o: Parameters<typeof toon>[0] = {}) => toon({ map: tex(name, rep), lamps: true, light: 0.72, ...o });
type V3 = [number, number, number];
function M(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], name = '') { const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.rotation.set(...r); if (name) m.name = name; parent.add(m); return m; }
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (a: number, b: number, h: number, n = 14) => new THREE.CylinderGeometry(a, b, h, n);
const glowM = (c: number, k = 1) => toon({ color: c, emissive: c, emissiveK: 0.6 * k, light: 0.3 });
const tube = (pts: V3[], r: number) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 40, r, 6);
/** fit any model to a size (its longest side), centred on its own middle */
function fitted(o: THREE.Object3D, size: number): THREE.Group {
  const b = new THREE.Box3().setFromObject(o), s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
  const g = new THREE.Group(), w = new THREE.Group(); w.add(o); o.position.sub(c); w.scale.setScalar(size / Math.max(0.001, s.x, s.y, s.z)); g.add(w); return g;
}

// ------------------------------------------------------------------ the post pass: ink contours from linear depth, quantised colour
const POST_FRAG = /* glsl */`
uniform sampler2D tSrc; uniform sampler2D tDepth; uniform vec2 uRes; uniform float uNear; uniform float uFar;
varying vec2 vUv;
float h1(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f); return mix(mix(h1(i), h1(i + vec2(1.0, 0.0)), u.x), mix(h1(i + vec2(0.0, 1.0)), h1(i + vec2(1.0, 1.0)), u.x), u.y); }
float lin(vec2 uv) { float z = texture2D(tDepth, uv).x * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
void main() {
  vec2 px = 1.0 / uRes, uv = vUv;
  vec3 col = texture2D(tSrc, uv).rgb;
  float d0 = lin(uv), dl = lin(uv - vec2(px.x, 0.0)), dr = lin(uv + vec2(px.x, 0.0)), dd = lin(uv - vec2(0.0, px.y)), du = lin(uv + vec2(0.0, px.y));
  float near = d0 - min(min(dl, dr), min(dd, du));
  float lap = max(abs(dl + dr - 2.0 * d0), abs(dd + du - 2.0 * d0));
  if (near > 0.012 * d0 + 0.012 && lap > 0.008 * d0) { gl_FragColor = vec4(mix(vec3(0.027, 0.03, 0.04), col, 0.1), 1.0); return; }
  // a pixel-stepped vignette and a clustered quantise
  vec2 q = uv - 0.5; float vg = 1.0 - smoothstep(0.42, 0.78, length(q * vec2(1.0, 0.8)));
  col *= 0.72 + 0.28 * floor(vg * 6.0 + 0.5) / 6.0;
  vec2 a = floor(gl_FragCoord.xy);
  float t = clamp(0.5 + (vn(a / 3.0) - 0.5) * 1.7 + (h1(floor(a / 2.0)) - 0.5) * 0.22, 0.02, 0.98) - 0.5;
  col = floor(clamp(col, 0.0, 1.0) * 30.0 + 0.5 + t * 0.85) / 30.0;
  gl_FragColor = vec4(col, 1.0);
}`;

// ================================================================== the bay
interface Rig {
  scene: THREE.Scene; cam: THREE.PerspectiveCamera;
  parts: THREE.Object3D[]; rows: Record<PartSlot, THREE.Mesh>;
  jig: THREE.Group; jigHold: THREE.Object3D;
  bridge: THREE.Group; trolley: THREE.Group; inner: THREE.Group; fingers: THREE.Object3D[]; grip: THREE.Group;
  robot: { yaw: THREE.Group; sh: THREE.Group; el: THREE.Group; tip: THREE.Object3D; flame: THREE.Object3D };
  lamps: { p: THREE.Vector3; c: THREE.Vector3; r: number }[];
}
function buildBay(): Rig {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0a0c10);
  const cam = new THREE.PerspectiveCamera(36, 16 / 9, 0.4, 40);
  // the room: a deck-plate floor, an anodised back wall, insulation quilt on the left, pipes and vents
  M(box(13, 0.1, 9.5), L('deck_plate'), scene, [0, -0.05, -0.2]);
  M(box(13, 4.8, 0.2), L('panel_anodised_grey'), scene, [0, 2.4, -3.7]);
  M(box(0.2, 4.8, 9.5), L('quilt_insulation_grey'), scene, [-6, 2.4, -0.2]);
  for (const [y, r] of [[4.05, 0.09], [4.3, 0.06]] as [number, number][]) M(cyl(r, r, 12.6, 10), L('steel_galvanised'), scene, [0, y, -3.5], [0, 0, PI / 2]);
  for (const x of [-4.8, 2.6, 4.8]) { M(box(0.9, 0.55, 0.08), L('metal_machined'), scene, [x, 3.6, -3.58]); for (let i = 0; i < 4; i++) M(box(0.8, 0.05, 0.1), toon({ color: 0x101318, lamps: true }), scene, [x, 3.42 + i * 0.12, -3.54]); }
  M(box(12.8, 0.12, 0.06), K('hazard', [24, 0.3]), scene, [0, 0.06, -3.55]);
  // floor markings round the bench
  for (const [x, z, w, d] of [[0, 1.05, 3.6, 0.1], [0, -1.05, 3.6, 0.1], [-1.75, 0, 0.1, 2.1], [1.75, 0, 0.1, 2.1]] as [number, number, number, number][]) M(box(w, 0.012, d), K('hazard', [Math.max(1, Math.round(w * 4)), 1]), scene, [x, 0.006, z]);
  // ---------------------------------------------------------- the parts rack wall
  const rack = new THREE.Group(); rack.position.set(-1.0, 0, -3.48); scene.add(rack);
  M(box(6.4, 2.7, 0.08), L('panel_anodised_blue'), rack, [0, 1.85, 0]);
  for (const x of [-3.2, 3.2]) M(box(0.14, 3.2, 0.2), L('metal_anodised_grey'), rack, [x, 1.6, 0.06]);
  M(box(6.6, 0.16, 0.24), L('metal_anodised_grey'), rack, [0, 3.25, 0.06]);
  const parts: THREE.Object3D[] = [], rows = {} as Record<PartSlot, THREE.Mesh>;
  for (const slot of PART_SLOTS) {
    const y = ROW_Y[slot];
    M(box(6.3, 0.07, 0.16), L('metal_machined'), rack, [0, y + 0.3, 0.08]);
    const led = M(box(6.2, 0.025, 0.02), glowM(P.glowTeal[2], 0.6), rack, [0, y + 0.255, 0.16]); led.material = (led.material as THREE.ShaderMaterial).clone(); rows[slot] = led;
    PARTS[slot].forEach((pd, j) => {
      if (pd.id === 'none') return;
      const x = -2.4 + j * 1.45;
      M(cyl(0.02, 0.02, 0.16, 6), L('metal_brushed'), rack, [x, y + 0.24, 0.12], [PI / 2, 0, 0]);
      M(box(0.04, 0.1, 0.04), L('metal_brass'), rack, [x, y + 0.18, 0.2]);
      const part = fitted(mCustomTool({ [slot]: pd.id } as Record<PartSlot, string>, slot), 0.6);
      part.position.set(x, y - 0.06, 0.28); part.rotation.set(0.15, -0.35, 0);
      part.userData.pick = { slot, id: pd.id, name: pd.name, home: part.position.clone() };
      part.traverse((o) => { o.userData.pickRoot = part; });
      rack.add(part); parts.push(part);
    });
  }
  // ---------------------------------------------------------- the workbench and the jig
  const bench = new THREE.Group(); scene.add(bench);
  M(box(3.0, 0.14, 1.2), L('steel_galvanised'), bench, [0, 0.94, 0]);
  M(box(3.04, 0.06, 1.24), L('metal_anodised_grey'), bench, [0, 0.85, 0]);
  for (const x of [-1.4, 1.4]) for (const z of [-0.5, 0.5]) M(box(0.12, 0.84, 0.12), L('metal_anodised_grey'), bench, [x, 0.42, z]);
  M(box(2.9, 0.08, 1.0), L('metal_anodised_grey'), bench, [0, 0.22, 0]);
  { const dr = new THREE.Group(); dr.position.set(-0.85, 0.52, 0); bench.add(dr); M(box(0.95, 0.58, 1.05), L('enamel_red'), dr); for (let i = 0; i < 3; i++) { M(box(0.9, 0.02, 0.02), toon({ color: 0x14090a, lamps: true }), dr, [0, 0.2 - i * 0.19, 0.53]); M(box(0.3, 0.03, 0.04), L('metal_brushed'), dr, [0, 0.12 - i * 0.19, 0.55]); } }
  // a vice on the right end and loose things on the top
  M(box(0.36, 0.2, 0.3), L('metal_anodised_blue'), bench, [1.18, 1.11, 0.2]); M(box(0.16, 0.18, 0.32), L('metal_machined'), bench, [1.18, 1.27, 0.2]); M(cyl(0.02, 0.02, 0.5, 6), L('metal_brushed'), bench, [1.18, 1.14, 0.45], [PI / 2, 0, 0]);
  M(box(0.4, 0.03, 0.06), L('metal_brushed'), bench, [-1.0, 1.03, 0.38], [0, 0.4, 0]); for (let i = 0; i < 4; i++) M(cyl(0.025, 0.025, 0.05, 6), L('metal_brass'), bench, [-0.75 + i * 0.07, 1.04, -0.35]);
  const jig = mJig(null); jig.scale.setScalar(0.62); jig.position.set(0, 1.01, 0); bench.add(jig);
  const jigHold = jig.getObjectByName('tool')!;
  // ---------------------------------------------------------- the overhead gantry crane
  const GANT = L('enamel_white', { color: 0xffa648 });
  for (const x of [-4.3, 3.9]) { M(box(0.22, 0.28, 7.2), GANT, scene, [x, 3.82, -0.3]); for (const z of [-3.4, 2.8]) M(box(0.26, 3.82, 0.26), L('metal_anodised_grey'), scene, [x, 1.91, z]); }
  const bridge = new THREE.Group(); bridge.position.set(0, 3.62, -1.6); scene.add(bridge);
  M(box(8.4, 0.3, 0.38), GANT, bridge, [-0.2, 0, 0]); M(box(8.4, 0.04, 0.4), K('hazard', [30, 0.3]), bridge, [-0.2, -0.17, 0]);
  const trolley = new THREE.Group(); trolley.position.set(2.2, -0.3, 0); bridge.add(trolley);
  M(box(0.62, 0.32, 0.62), L('metal_anodised_grey'), trolley); M(cyl(0.16, 0.16, 0.14, 12), L('metal_machined'), trolley, [0, -0.2, 0]);
  M(cyl(0.11, 0.11, 0.95, 12), L('metal_brushed'), trolley, [0, -0.7, 0]);
  const inner = new THREE.Group(); inner.position.y = -0.7; trolley.add(inner);
  M(cyl(0.075, 0.075, 1.3, 10), L('metal_machined'), inner, [0, -0.6, 0]);
  const claw = new THREE.Group(); claw.position.y = -1.3; inner.add(claw);
  M(cyl(0.17, 0.13, 0.12, 10), L('metal_anodised_grey'), claw); M(cyl(0.03, 0.03, 0.04, 6), glowM(P.malachite[5]), claw, [0.14, 0, 0.08]);
  const fingers: THREE.Object3D[] = [];
  for (let i = 0; i < 3; i++) { const f = new THREE.Group(); f.rotation.y = (i / 3) * PI * 2; claw.add(f); const h = new THREE.Group(); h.position.set(0.12, -0.04, 0); f.add(h); M(box(0.04, 0.24, 0.05), GANT, h, [0, -0.12, 0]); fingers.push(h); }
  const grip = new THREE.Group(); grip.position.y = -0.24; claw.add(grip);
  // ---------------------------------------------------------- the welding robot on its pedestal, its gas cart and cable
  const rb = new THREE.Group(); rb.position.set(1.45, 0, -0.85); scene.add(rb);
  M(cyl(0.3, 0.36, 0.5, 8), L('metal_anodised_grey'), rb, [0, 0.25, 0]);
  const yaw = new THREE.Group(); yaw.position.y = 0.5; rb.add(yaw); M(cyl(0.24, 0.26, 0.2, 12), GANT, yaw, [0, 0.1, 0]);
  const sh = new THREE.Group(); sh.position.y = 0.26; yaw.add(sh); M(cyl(0.12, 0.12, 0.32, 10), L('metal_machined'), sh, [0, 0, 0], [0, 0, PI / 2]); M(box(0.18, 0.9, 0.18), GANT, sh, [0, 0.45, 0]);
  const el = new THREE.Group(); el.position.y = 0.9; sh.add(el); M(cyl(0.1, 0.1, 0.26, 10), L('metal_machined'), el, [0, 0, 0], [0, 0, PI / 2]); M(box(0.13, 0.7, 0.13), GANT, el, [0, 0.35, 0]);
  const tip = new THREE.Group(); tip.position.y = 0.72; el.add(tip); M(cyl(0.05, 0.03, 0.22, 8), L('metal_brass'), tip, [0, 0.08, 0]); M(cyl(0.028, 0.018, 0.12, 8), L('q_pipe_copper'), tip, [0, 0.24, 0]);
  const flame = M(new THREE.ConeGeometry(0.05, 0.2, 8), glowM(0xbfe4ff, 1.6), tip, [0, 0.4, 0]); flame.visible = false;
  const cart = new THREE.Group(); cart.position.set(3.7, 0, -1.6); scene.add(cart);
  M(box(0.9, 0.7, 0.6), L('metal_anodised_teal'), cart, [0, 0.45, 0]); M(box(0.92, 0.04, 0.62), L('metal_machined'), cart, [0, 0.82, 0]);
  for (const [x, c] of [[-0.25, 'enamel_red'], [0.25, 'enamel_green']] as [number, string][]) { M(cyl(0.15, 0.15, 1.3, 14), L(c), cart, [x, 1.5, -0.12]); M(cyl(0.06, 0.08, 0.12, 10), L('metal_brass'), cart, [x, 2.2, -0.12]); }
  M(cyl(0.09, 0.09, 0.02, 14), toon({ map: dialTex(), lamps: true }), cart, [0.2, 0.55, 0.31], [PI / 2, 0, 0]);
  M(tube([[3.5, 0.05, -1.3], [2.9, 0.03, -1.1], [2.2, 0.03, -0.9], [1.65, 0.3, -0.85]], 0.04), L('rubber_seal'), scene);
  M(tube([[-4.3, 3.7, -3.4], [-4.5, 2.4, -3.5], [-4.6, 0.6, -3.5], [-3.6, 0.04, -2.6], [-1.4, 0.04, -1.2]], 0.045), L('rubber_seal'), scene);
  // ---------------------------------------------------------- tool chests, stock crates, an extinguisher
  for (const [x, z, n] of [[-5.1, -2.2, 5], [-5.1, -0.9, 3]] as V3[]) { const ch = new THREE.Group(); ch.position.set(x, 0, z); scene.add(ch); M(box(0.9, n * 0.24 + 0.1, 0.7), L('enamel_red'), ch, [0, (n * 0.24 + 0.1) / 2 + 0.08, 0]); for (let i = 0; i < n; i++) { M(box(0.86, 0.02, 0.02), toon({ color: 0x14090a, lamps: true }), ch, [0, 0.2 + i * 0.24, 0.36]); M(box(0.5, 0.03, 0.04), L('metal_brushed'), ch, [0, 0.14 + i * 0.24, 0.37]); } for (const dx of [-0.35, 0.35]) M(cyl(0.05, 0.05, 0.06, 8), L('rubber_seal'), ch, [dx, 0.03, 0.25], [0, 0, PI / 2]); }
  for (const [x, z, s] of [[4.8, -2.6, 1.2], [5.0, -1.2, 0.9], [-4.4, 1.2, 1.1]] as V3[]) { const c = fitted(mCrate(), s); c.position.set(x, s * 0.36, z); c.rotation.y = x * 0.3; scene.add(c); }
  M(cyl(0.11, 0.11, 0.55, 12), L('enamel_red'), scene, [-5.6, 0.3, -2.95]); M(cyl(0.04, 0.05, 0.1, 8), toon({ color: 0x111111 }), scene, [-5.6, 0.62, -2.95]);
  // ---------------------------------------------------------- pendant lamps with haze cones (and the light they give)
  const lamps: Rig['lamps'] = [];
  for (const [x, z, k] of [[-1.2, -0.3, 1.25], [1.4, -0.1, 1.05], [-2.6, -2.6, 0.9]] as V3[]) {
    const lp = new THREE.Group(); lp.position.set(x, 3.1, z); scene.add(lp);
    M(cyl(0.012, 0.012, 1.5, 4), toon({ color: 0x111111 }), lp, [0, 0.8, 0]);
    M(new THREE.ConeGeometry(0.34, 0.26, 14, 1, true), L('enamel_green'), lp, [0, 0.13, 0]);
    M(new THREE.SphereGeometry(0.09, 10, 8), glowM(0xffe2a8, 2), lp, [0, -0.01, 0]);
    const haze = M(new THREE.ConeGeometry(1.5, 3.0, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.055, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), lp, [0, -1.55, 0]);
    haze.renderOrder = 5;
    lamps.push({ p: new THREE.Vector3(x, 2.9, z), c: new THREE.Vector3(1.0, 0.82, 0.58).multiplyScalar(k), r: 5.4 });
  }
  lamps.push({ p: new THREE.Vector3(0, 1.6, 0.2), c: new THREE.Vector3(0, 0, 0), r: 2.4 }); // the forge's hot light
  return { scene, cam, parts, rows, jig, jigHold, bridge, trolley, inner, fingers, grip, robot: { yaw, sh, el, tip, flame }, lamps };
}

/** the FORGE key: a big red mushroom button in a hazard-striped collar on a steel plinth */
function mForgeKey(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(cyl(0.5, 0.56, 0.18, 8), toon({ map: tex('darkSteel', [3, 1]), metal: 0.5 })));
  const col = new THREE.Mesh(cyl(0.42, 0.44, 0.12, 24), toon({ map: tex('hazard', [6, 0.5]) })); col.position.y = 0.15; g.add(col);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 10, 0, PI * 2, 0, PI / 2), toon({ color: P.ruby[5], emissive: P.ruby[3], emissiveK: 0.4, gloss: 0.9 })); cap.position.y = 0.2; cap.scale.y = 0.65; g.add(cap);
  return g;
}

// ================================================================== the bench (controller + the slim 2D layer)
export class Bench {
  readonly el: HTMLDivElement; isOpen = false;
  private parts: Record<PartSlot, string> = { head: 'lens', core: 'cell', grip: 'pistol', mod: 'none' };
  private rig: Rig | null = null; private R: THREE.WebGLRenderer | null = null; private cv: HTMLCanvasElement;
  private rt: THREE.WebGLRenderTarget | null = null; private post: { scene: THREE.Scene; cam: THREE.Camera; mat: THREE.ShaderMaterial } | null = null;
  private busy = false; private t = 0; private hover: THREE.Object3D | null = null; private slot: PartSlot = 'head';
  private camGoal = { pos: new THREE.Vector3(2.9, 3.2, 6.4), look: new THREE.Vector3(-0.4, 1.3, -1.0) }; private camLook = new THREE.Vector3();
  private strip: HTMLDivElement; private stats: HTMLDivElement; private bill: HTMLDivElement; private tip: HTMLDivElement; private chips = new Map<PartSlot, HTMLButtonElement>();
  private forgeKey: ReturnType<typeof floatIcon>; private jigClamp = 1; private reveal = 0; private heat = 0; private down: THREE.Object3D | null = null;
  private key = (e: KeyboardEvent) => { if (!this.isOpen) return; if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.open(false); } };
  constructor(readonly g: G, readonly w: ToolWidget) {
    installKitStyle(); injectBayCSS();
    const el = this.el = document.createElement('div'); el.className = 'h7-bay';
    this.cv = document.createElement('canvas'); this.cv.className = 'h7-bay-cv';
    // the category strip
    this.strip = document.createElement('div'); this.strip.className = 'h7-bay-strip';
    for (const s of PART_SLOTS) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'h7-bay-cat';
      const n = document.createElement('span'); n.className = 'k7-name k7-t16'; n.textContent = SLOT_NAME[s];
      b.append(n);
      b.addEventListener('pointerenter', () => uiSfx('hover', 0.35));
      b.addEventListener('click', (e) => { e.stopPropagation(); this.pickSlot(s); });
      this.strip.append(b); this.chips.set(s, b);
    }
    this.stats = document.createElement('div'); this.stats.className = 'h7-bay-stats';
    this.bill = document.createElement('div'); this.bill.className = 'h7-bay-bill';
    this.tip = document.createElement('div'); this.tip.className = 'k7-tip k7-t16';
    this.forgeKey = floatIcon({ build: mForgeKey, name: 'FORGE', size: [48, 36], nameSize: 32, sound: '', view: { pitch: 0.7, spin: 0, rock: 0.2 }, onClick: () => void this.forge() });
    this.forgeKey.el.classList.add('h7-bay-forge');
    const back = floatIcon({ build: () => mCustomTool({ head: 'lens', core: 'cell', grip: 'pistol' }), name: 'BACK', size: [40, 32], nameSize: 16, sound: 'back', view: { pitch: 0.4 }, onClick: () => { this.open(false); } });
    back.el.classList.add('h7-bay-back');
    el.append(this.cv, this.strip, this.stats, this.bill, this.forgeKey.el, back.el, this.tip);
    this.wire();
  }
  // ---------------------------------------------------------------- open / close: an iris, then the camera swoops in
  open(on: boolean) {
    if (on === this.isOpen) return;
    const r = this.w.el.getBoundingClientRect(), at = { x: r.left + r.width / 2, y: r.top + r.height / 3 };
    if (on) {
      this.isOpen = true;
      void transition('iris', () => {
        if (!this.el.isConnected) document.body.append(this.el);
        this.ensure(); this.el.classList.add('on');
        const c = this.rig!.cam; c.position.set(7.5, 7.2, 11.5); this.camLook.set(0, 1.2, 0); c.lookAt(this.camLook);
        this.home(1300);
        this.syncUI(); this.pickSlot(this.slot, true);
        addEventListener('keydown', this.key, true);
        uiSfx('swishIn', 0.6, 0.8); uiSfx('creak', 0.35);
        onFrame((dt) => { if (!this.isOpen) return false; this.frame(dt); return true; });
      }, { ...at, ms: 320 });
    } else {
      removeEventListener('keydown', this.key, true);
      void transition('iris', () => { this.isOpen = false; this.el.classList.remove('on'); this.tip.classList.remove('on'); uiSfx('close', 0.5); }, { ...at, ms: 300 });
    }
  }
  private ensure() {
    if (this.R) return;
    this.R = new THREE.WebGLRenderer({ canvas: this.cv, antialias: false, alpha: false });
    this.R.setPixelRatio(1); this.R.outputColorSpace = THREE.LinearSRGBColorSpace;
    const mat = new THREE.ShaderMaterial({ vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: POST_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tSrc: { value: null }, tDepth: { value: null }, uRes: { value: new THREE.Vector2() }, uNear: { value: 0.4 }, uFar: { value: 40 } } });
    const ps = new THREE.Scene(), q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); q.frustumCulled = false; ps.add(q);
    this.post = { scene: ps, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), mat };
    this.rig = buildBay();
    this.mountAssembly();
  }
  private size() { return { W: Math.max(320, Math.round(innerWidth / 2)), H: Math.max(180, Math.round(innerHeight / 2)) }; }
  private render() {
    const R = this.R!, rig = this.rig!, { W, H } = this.size();
    if (this.cv.width !== W || this.cv.height !== H) R.setSize(W, H, false);
    if (!this.rt || this.rt.width !== W || this.rt.height !== H) {
      this.rt?.dispose(); const dt = new THREE.DepthTexture(W, H); dt.minFilter = dt.magFilter = THREE.NearestFilter;
      this.rt = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, depthTexture: dt });
    }
    rig.cam.aspect = W / H; rig.cam.updateProjectionMatrix(); rig.cam.updateMatrixWorld();
    // the practical lamps into view space for every lamp-lit material
    rig.lamps.forEach((l, i) => { if (i > 3) return; LAMPS.p.value[i].copy(l.p).applyMatrix4(rig.cam.matrixWorldInverse); LAMPS.c.value[i].copy(l.c); LAMPS.r.value[i] = l.r; });
    R.setRenderTarget(this.rt); R.setClearColor(0x0a0c10, 1); R.clear(); R.render(rig.scene, rig.cam);
    R.setRenderTarget(null);
    const u = this.post!.mat.uniforms; u.tSrc.value = this.rt.texture; u.tDepth.value = this.rt.depthTexture; u.uRes.value.set(W, H); u.uNear.value = rig.cam.near; u.uFar.value = rig.cam.far;
    R.render(this.post!.scene, this.post!.cam);
  }
  private frame(dt: number) {
    const rig = this.rig; if (!rig) return;
    this.t += dt;
    // the camera eases to its goal
    const c = rig.cam, k = 1 - Math.exp(-dt * 3.2);
    c.position.lerp(this.camGoal.pos, k); this.camLook.lerp(this.camGoal.look, k); c.lookAt(this.camLook);
    // the jig: clamps, turntable, the reveal lift and spin, the tool's working parts
    const js = rig.jig.userData.state as { clamp: number; spin: number; flash: number };
    js.clamp = this.jigClamp;
    animJig(rig.jig, this.t, false);
    rig.jigHold.position.y = 0.58 + this.reveal * 0.55; rig.jigHold.rotation.y += dt * this.reveal * 4.5;
    animCustom(rig.jigHold, this.t, 0.4 + this.reveal);
    // the forge's hot light, the robot's idle sway, the claw's carried part turning a little
    const hot = rig.lamps[3]; hot.c.set(1.6, 0.55, 0.15).multiplyScalar(this.heat * (0.8 + Math.random() * 0.4));
    if (!this.busy) { rig.robot.yaw.rotation.y = 2.5 + Math.sin(this.t * 0.5) * 0.06; rig.robot.sh.rotation.x = -0.25; rig.robot.el.rotation.x = -0.55; }
    rig.grip.rotation.y += dt * 0.6;
    // rack rows: the picked category glows
    for (const s of PART_SLOTS) { const u = (rig.rows[s].material as THREE.ShaderMaterial).uniforms.uEmissive.value as THREE.Vector3, on = s === this.slot, kk = on ? 0.55 + Math.sin(this.t * 4) * 0.15 : 0.12, cc = new THREE.Color(P.glowTeal[3]); u.set(cc.r * kk, cc.g * kk, cc.b * kk); }
    // the hovered part lifts off its hook a little
    for (const p of rig.parts) { const h = (p.userData.pick.home as THREE.Vector3), lift = p === this.hover && !this.busy ? 0.12 : 0; p.position.z += (h.z + lift - p.position.z) * Math.min(1, dt * 10); p.rotation.y += ((p === this.hover ? 0.2 : -0.35) - p.rotation.y) * Math.min(1, dt * 6); }
    this.render();
    this.placeStats();
  }
  // ---------------------------------------------------------------- input: hover, click or drag a rack part
  private pickAt(e: PointerEvent): THREE.Object3D | null {
    const rig = this.rig; if (!rig) return null;
    const r = this.cv.getBoundingClientRect(), ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, rig.cam);
    const hit = rc.intersectObjects(rig.parts, true)[0];
    return (hit?.object.userData.pickRoot as THREE.Object3D | undefined) ?? null;
  }
  private wire() {
    this.cv.addEventListener('pointermove', (e) => {
      if (this.busy) return;
      const p = this.pickAt(e);
      if (p !== this.hover) { this.hover = p; if (p) uiSfx('hover', 0.4); this.cv.style.cursor = p ? 'pointer' : 'default'; }
      if (p) { this.tip.textContent = `${SLOT_NAME[p.userData.pick.slot as PartSlot]} · ${p.userData.pick.name}`; this.tip.style.left = e.clientX + 'px'; this.tip.style.top = (e.clientY - 18) + 'px'; this.tip.classList.add('on'); }
      else this.tip.classList.remove('on');
    });
    this.cv.addEventListener('pointerdown', (e) => { if (e.button !== 0 || this.busy) return; this.down = this.pickAt(e); if (this.down) { uiSfx('tick', 0.5, 0.8); this.cv.setPointerCapture(e.pointerId); } });
    this.cv.addEventListener('pointerup', () => { const p = this.down; this.down = null; if (p && !this.busy) { const pk = p.userData.pick as { slot: PartSlot; id: string }; void this.fit(pk.slot, pk.id, p); } });
    this.cv.addEventListener('pointerleave', () => { this.tip.classList.remove('on'); });
  }
  private pickSlot(s: PartSlot, quiet = false) {
    this.slot = s;
    for (const [k, b] of this.chips) b.classList.toggle('on', k === s);
    if (!quiet) uiSfx('tab', 0.5);
    // the camera leans toward that row of the rack, then back
    if (!this.busy && !quiet) { const y = ROW_Y[s]; this.camGoal.pos.set(1.6, y + 1.5, 4.4); this.camGoal.look.set(-1.0, y - 0.1, -2.6); setTimeout(() => { if (!this.busy) this.home(); }, 1600); }
  }
  private home(_ms = 900) { this.camGoal.pos.set(2.9, 3.2, 6.4); this.camGoal.look.set(-0.4, 1.3, -1.0); }
  // ---------------------------------------------------------------- the gantry carries a part to the jig
  private async gantryTo(x: number, z: number, ms = 700) {
    const rig = this.rig!, b0 = rig.bridge.position.z, t0 = rig.trolley.position.x;
    uiSfx('winch', 0.4, 1.1);
    await tween(ms, (k) => { rig.bridge.position.z = b0 + (z - b0) * k; rig.trolley.position.x = t0 + (x - t0) * k; }, ease.inOutCubic);
  }
  private async armTo(y: number, ms = 450) { const rig = this.rig!, i0 = rig.inner.position.y; await tween(ms, (k) => { rig.inner.position.y = i0 + (y - i0) * k; }, ease.inOutCubic); }
  private async claw(open: boolean) { const rig = this.rig!, f0 = rig.fingers[0].rotation.z, g = open ? 0.55 : 0; uiSfx(open ? 'switch' : 'clunk', 0.5); await tween(180, (k) => { for (const f of rig.fingers) f.rotation.z = f0 + (g - f0) * k; }); }
  /** the claw's tip in world y is the trolley's height (3.32) + inner (y) - 1.54: solve inner for a target height */
  private innerFor(worldY: number) { return worldY - 3.32 + 1.54; }
  private async fit(slot: PartSlot, id: string, from: THREE.Object3D) {
    if (this.busy) return;
    if (this.parts[slot] === id) { shake(this.chips.get(slot)!, 4); uiSfx('error', 0.4); return; }
    this.busy = true; this.tip.classList.remove('on'); this.pickSlot(slot, true);
    const rig = this.rig!;
    try {
      const wp = from.getWorldPosition(new THREE.Vector3());
      this.camGoal.pos.set(1.6, 2.4, 4.6); this.camGoal.look.set(-0.9, 2.2, -2.2);
      await Promise.all([this.armTo(this.innerFor(3.0)), this.claw(true)]);
      await this.gantryTo(wp.x, wp.z + 0.05, 750);
      await this.armTo(this.innerFor(wp.y + 0.3), 420);
      // grip: a copy of the part goes into the claw
      await this.claw(false);
      const carried = fitted(mCustomTool({ [slot]: id } as Record<PartSlot, string>, slot), 0.5); carried.position.y = -0.18; rig.grip.add(carried);
      uiSfx('metal', 0.4, 1.3);
      await this.armTo(this.innerFor(2.9), 380);
      this.camGoal.pos.set(1.9, 2.5, 4.0); this.camGoal.look.set(-0.2, 1.7, -0.6);
      await this.gantryTo(0, 0, 850);
      this.jigClamp = 0; uiSfx('winch', 0.4, 1.4);
      await this.armTo(this.innerFor(1.72), 450);
      // the part goes on, the jaws lock with sparks and a knock
      rig.grip.remove(carried);
      this.parts[slot] = id; this.mountAssembly();
      await this.claw(true);
      this.jigClamp = 1;
      const sp = this.screenOf(new THREE.Vector3(0, 1.3, 0));
      burst(sp.x, sp.y, { n: 26, ramp: P.glowAmber, speed: 300, life: 0.55 }); burst(sp.x, sp.y, { n: 10, ramp: P.sky, speed: 200, life: 0.4 });
      placeDust(sp.x, sp.y + 30, 0.35, { layer: 'ui', ground: 'metal' });
      uiSfx('clunk', 0.7); uiSfx('metal', 0.5, 0.9);
      this.syncUI();
      await this.armTo(this.innerFor(3.0), 380);
      await this.gantryTo(2.2, -1.6, 700);
      this.home();
    } finally { this.busy = false; }
  }
  private mountAssembly() {
    const rig = this.rig; if (!rig) return;
    rig.jigHold.clear();
    mountTool(rig.jigHold, () => mCustomTool(this.parts), 0.95);
  }
  private screenOf(v: THREE.Vector3) { const rig = this.rig!, p = v.clone().project(rig.cam), r = this.cv.getBoundingClientRect(); return { x: r.left + (p.x * 0.5 + 0.5) * r.width, y: r.top + (-p.y * 0.5 + 0.5) * r.height }; }
  // ---------------------------------------------------------------- FORGE: weld, cool, reveal
  private async forge() {
    if (this.busy || !this.rig) return;
    const cost = costOf(this.parts), st = this.g.storage;
    const short = Object.entries(cost).filter(([it, n]) => (st?.count?.(it) ?? 0) < n);
    if (short.length && !this.g.__freeParts) { shake(this.forgeKey.el, 6); uiSfx('error', 0.6); this.bill.querySelectorAll('.short').forEach((e) => pop(e as HTMLElement, 0.5)); return; }
    this.busy = true; this.forgeKey.view?.press(1.4); uiSfx('clunk', 0.7); uiSfx('bong', 0.5);
    const rig = this.rig, rb = rig.robot;
    try {
      this.camGoal.pos.set(-1.4, 2.2, 2.8); this.camGoal.look.set(0.3, 1.2, -0.2);
      // the robot swings its torch over the jig
      const y0 = rb.yaw.rotation.y, s0 = rb.sh.rotation.x, e0 = rb.el.rotation.x;
      await tween(650, (k) => { rb.yaw.rotation.y = y0 + (2.05 - y0) * k; rb.sh.rotation.x = s0 + (-0.79 - s0) * k; rb.el.rotation.x = e0 + (-0.93 - e0) * k; }, ease.inOutCubic);
      // weld: sparks, a hot flickering light, the hiss of the torch
      rb.flame.visible = true;
      const tEnd = performance.now() + 1700;
      while (performance.now() < tEnd) {
        this.heat = Math.min(1, this.heat + 0.18);
        const p = this.screenOf(rb.tip.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, -0.05, 0)));
        burst(p.x, p.y, { n: 8, ramp: Math.random() < 0.5 ? P.glowAmber : P.sky, speed: 260, life: 0.45, gravity: 900 });
        if (Math.random() < 0.5) uiSfx(Math.random() < 0.5 ? 'scratch' : 'metal', 0.35, 1.3 + Math.random() * 0.4);
        rb.el.rotation.x = -0.93 + Math.sin(performance.now() / 90) * 0.04;
        await wait(70);
      }
      rb.flame.visible = false;
      // cool: the glow fades, steam puffs off, a hiss
      uiSfx('swishOut', 0.6, 0.7);
      const jp = this.screenOf(new THREE.Vector3(0, 1.4, 0));
      for (let i = 0; i < 3; i++) setTimeout(() => placeDust(jp.x + (i - 1) * 30, jp.y, 0.3, { layer: 'ui', ground: 'snow', sound: false }), i * 180);
      await Promise.all([tween(900, (k) => { this.heat = 1 - k; }), tween(650, (k) => { rb.yaw.rotation.y = 2.05 + (2.5 - 2.05) * k; rb.sh.rotation.x = -0.79 + (0.54) * k; rb.el.rotation.x = -0.93 + 0.38 * k; }, ease.inOutCubic)]);
      // reveal: the jaws open, the finished tool rises and spins with its parts working
      this.jigClamp = 0; uiSfx('winch', 0.4, 1.5);
      this.camGoal.pos.set(-0.9, 1.75, 2.2); this.camGoal.look.set(0, 1.45, 0);
      (rig.jig.userData.state as { flash: number }).flash = performance.now() / 1000 + 2.2;
      await tween(500, (k) => { this.reveal = k; }, ease.outBack);
      if (st && !this.g.__freeParts) for (const [it, n] of Object.entries(cost)) st.take(it, n);
      const head = partOf('head', this.parts.head), n = customTools(this.g).length + 1, name = `${head.name.split(' ').pop()} MK-${n}`;
      addCustomTool(this.g, { id: 'custom_' + Date.now().toString(36), name, parts: { ...this.parts }, base: head.base ?? 'scanner', stats: statsOf(this.parts) });
      const np = this.screenOf(new THREE.Vector3(0, 2.0, 0));
      floatUp(np.x, np.y, name, { size: 32, color: '#ffe39a' });
      burst(np.x, np.y + 40, { n: 30, ramp: P.glowTeal, speed: 320, life: 0.7 });
      uiSfx('confirm', 0.8); uiSfx('slam', 0.4);
      await wait(1900);
      await tween(450, (k) => { this.reveal = 1 - k; }, ease.inOutCubic);
      this.jigClamp = 1; uiSfx('clunk', 0.5);
      this.home(); this.syncUI();
    } finally { this.busy = false; this.heat = 0; }
  }
  // ---------------------------------------------------------------- the slim 2D layer
  private syncUI() {
    // category chips: the part fitted in each slot, as a tiny render
    for (const [s, b] of this.chips) {
      b.querySelector('canvas')?.remove();
      const id = this.parts[s];
      const cv = id === 'none' ? null : snapshot(`part|${s}|${id}`, () => mCustomTool({ [s]: id } as Record<PartSlot, string>, s), 36, 30, { yaw: s === 'head' ? 1.1 : 0.6, pitch: 0.4, zoom: 1.1 });
      if (cv) { const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height; c2.getContext('2d')!.drawImage(cv, 0, 0); c2.style.cssText = `width:${cv.width * 2}px;height:${cv.height * 2}px;image-rendering:pixelated;display:block`; b.prepend(c2); }
      else { const c2 = document.createElement('canvas'); c2.width = 36; c2.height = 30; c2.style.cssText = 'width:72px;height:60px;display:block'; b.prepend(c2); }
    }
    // stat chips beside the jig
    const st = statsOf(this.parts);
    this.stats.innerHTML = '';
    for (const s of STATS) {
      const chip = document.createElement('div'); chip.className = 'h7-bay-chip';
      skin(chip, (W, H) => plate(W, H, { mat: 'gun', seed: 7 + s.k.length, chamfer: 2, wear: 0.4, lip: 1, grime: 0 }));
      const nm = document.createElement('span'); nm.className = 'k7-t16'; nm.textContent = s.name;
      const bar = new Px(34, 8); cellBar(bar, 1, 1, 32, 6, Math.max(0, st[s.k]) / s.max, s.ramp);
      const v = document.createElement('span'); v.className = 'k7-t16'; v.textContent = String(st[s.k]);
      chip.append(nm, pxCanvas(bar, 2), v); this.stats.append(chip);
    }
    // the bill of parts
    this.bill.innerHTML = '';
    for (const [it, n] of Object.entries(costOf(this.parts))) {
      const have = this.g.storage?.count?.(it) ?? 0;
      const e = document.createElement('div'); e.className = 'h7-bay-item' + (have >= n ? '' : ' short');
      const ic = document.createElement('img'); ic.src = itemIcon(it, 64); ic.alt = ITEMS[it]?.name ?? it;
      const t = document.createElement('span'); t.className = 'k7-t32'; t.textContent = String(n);
      e.title = ITEMS[it]?.name ?? it; e.append(ic, t); this.bill.append(e);
    }
  }
  private placeStats() {
    if (!this.rig) return;
    const p = this.screenOf(new THREE.Vector3(0.75, 1.75, 0.2));
    this.stats.style.left = Math.round(Math.min(innerWidth - 260, p.x + 20)) + 'px'; this.stats.style.top = Math.round(Math.max(90, p.y - 40)) + 'px';
  }
}

let css = false;
function injectBayCSS() {
  if (css) return; css = true;
  const s = document.createElement('style');
  s.textContent = `
.h7-bay { position: fixed; inset: 0; z-index: 8900; display: none; }
.h7-bay.on { display: block; }
.h7-bay-cv { position: absolute; inset: 0; width: 100vw; height: 100vh; image-rendering: pixelated; touch-action: none; }
.h7-bay-strip { position: absolute; left: 50%; top: 10px; transform: translateX(-50%); display: flex; gap: 22px; align-items: flex-end; pointer-events: auto; }
.h7-bay-cat { position: relative; display: flex; flex-direction: column; align-items: center; border: 0; background: none; padding: 0; cursor: pointer; filter: drop-shadow(3px 4px 0 rgba(5,6,8,.55)); transition: transform .2s cubic-bezier(.2,.9,.3,1.6), filter .15s; }
.h7-bay-cat .k7-name { margin-top: -4px; color: #b9c8c4; }
.h7-bay-cat:hover { transform: translateY(-4px); }
.h7-bay-cat.on { filter: drop-shadow(0 0 8px rgba(120,230,210,.7)) drop-shadow(3px 4px 0 rgba(5,6,8,.5)); }
.h7-bay-cat.on .k7-name { color: #c8fff0; }
.h7-bay-stats { position: absolute; display: flex; flex-direction: column; gap: 4px; pointer-events: none; }
.h7-bay-chip { position: relative; display: grid; grid-template-columns: 44px 68px 30px; align-items: center; gap: 4px; padding: 4px 8px; }
.h7-bay-chip > * { position: relative; z-index: 1; }
.h7-bay-chip canvas { display: block; }
.h7-bay-bill { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); display: flex; gap: 18px; pointer-events: none; }
.h7-bay-item { display: flex; align-items: center; gap: 2px; }
.h7-bay-item img { width: 64px; height: 64px; image-rendering: pixelated; filter: drop-shadow(3px 3px 0 rgba(5,6,8,.6)); }
.h7-bay-item.short .k7-t32 { color: var(--k7-red); }
.h7-bay-forge { position: absolute !important; right: 30px; bottom: 16px; --glow: #ff8a6a; }
.h7-bay-back { position: absolute !important; left: 22px; top: 12px; }
`;
  document.head.append(s);
}
