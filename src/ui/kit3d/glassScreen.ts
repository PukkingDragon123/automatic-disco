// kit3d glass screen: a machined monitor with real depth. A painted housing, a brushed steel bezel with screws, the
// display recessed behind a sheet of glass (a soft diagonal reflection and a top sheen), the display slightly curved.
// The display is a canvas you draw into (low resolution, shown nearest-filtered, flagged to bloom). Layering, front
// to back: glass (z +0.002), display (z -0.012, its curved edges to -0.024), the bezel's deep bars forming the recess
// walls (z +0.016 .. -0.046), the housing's front face (z -0.045).
//   const s = glassScreen({ w: 0.6, h: 0.36 }); anchor.add(s.group);
//   s.draw((g, W, H) => { ... }) redraws the canvas; s.hit is the mesh to ray-pick.
import * as THREE from 'three';
import { gbuf, F_EMIT } from '../../gfx/gbuf';
import { mat32, solid, worldUV, canvasTex, K3 } from './tex';

export interface GlassScreen { group: THREE.Group; cv: HTMLCanvasElement; g: CanvasRenderingContext2D; tex: THREE.CanvasTexture; W: number; H: number; hit: THREE.Mesh; draw(fn: (g: CanvasRenderingContext2D, W: number, H: number) => void): void }

function bent(w: number, h: number, curve: number, seg = 16) {
  const g = new THREE.PlaneGeometry(w, h, seg, 1), p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) / (w / 2); p.setZ(i, -curve * x * x); }
  g.computeVertexNormals(); return g;
}
let glare: THREE.CanvasTexture | null = null;
function glareTex() {
  if (glare) return glare;
  const { cv, g, tex } = canvasTex(64, 64);
  const gr = g.createLinearGradient(0, 0, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0.0)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.0)'); gr.addColorStop(0.36, 'rgba(255,255,255,0.55)');
  gr.addColorStop(0.44, 'rgba(255,255,255,0.12)'); gr.addColorStop(0.52, 'rgba(255,255,255,0.0)'); gr.addColorStop(0.58, 'rgba(255,255,255,0.25)'); gr.addColorStop(0.62, 'rgba(255,255,255,0.0)'); gr.addColorStop(1, 'rgba(255,255,255,0.0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const top = g.createLinearGradient(0, 0, 0, 10); top.addColorStop(0, 'rgba(255,255,255,0.35)'); top.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = top; g.fillRect(0, 0, 64, 10);
  void cv; tex.magFilter = THREE.LinearFilter; glare = tex; return tex;
}

export function glassScreen(o: { w?: number; h?: number; res?: number; depth?: number; curve?: number; stand?: number } = {}): GlassScreen {
  const w = o.w ?? 0.6, h = o.h ?? 0.36, res = o.res ?? 420, depth = o.depth ?? 0.07, bz = 0.035, curve = o.curve ?? 0.012, stand = o.stand ?? 0.06;
  const W = Math.round(w * res), H = Math.round(h * res);
  const group = new THREE.Group();
  const body = mat32(K3.gun, 'painted'), steel = mat32(K3.steel, 'brushed');
  const cy = stand + h / 2 + bz;
  // the stand and the housing
  const st = new THREE.Mesh(worldUV(new THREE.BoxGeometry(w * 0.3, stand + 0.02, depth * 0.8)), body); st.position.set(0, stand / 2, -depth * 0.2); st.castShadow = true; group.add(st);
  const hs = new THREE.Mesh(worldUV(new THREE.BoxGeometry(w + bz * 2, h + bz * 2, depth)), body); hs.position.set(0, cy, -depth / 2 - 0.045); hs.castShadow = hs.receiveShadow = true; group.add(hs);
  // the bezel: four brushed bars standing proud of the housing, screws in the corners
  for (const [x, y, bw, bh] of [[0, h / 2 + bz / 2, w + bz * 2, bz], [0, -h / 2 - bz / 2, w + bz * 2, bz], [-w / 2 - bz / 2, 0, bz, h], [w / 2 + bz / 2, 0, bz, h]]) {
    const b = new THREE.Mesh(worldUV(new THREE.BoxGeometry(bw, bh, 0.062)), steel); b.position.set(x, cy + y, -0.015); b.castShadow = true; group.add(b);
  }
  for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 6), solid(0xc8d0d4)); s.rotation.x = Math.PI / 2; s.position.set(x * (w / 2 + bz / 2), cy + y * (h / 2 + bz / 2), 0.018); group.add(s);
  }
  // the display, recessed, and the glass in front of it
  const { cv, g, tex } = canvasTex(W, H);
  const disp = new THREE.Mesh(bent(w, h, curve), gbuf(new THREE.MeshBasicMaterial({ map: tex }), F_EMIT));
  disp.position.set(0, cy, -0.012); group.add(disp);
  const gl = new THREE.Mesh(bent(w, h, curve * 0.6), gbuf(new THREE.MeshBasicMaterial({ map: glareTex(), transparent: true, opacity: 0.09, depthWrite: false, blending: THREE.AdditiveBlending }), 0));
  gl.position.set(0, cy, 0.002); gl.renderOrder = 2; group.add(gl);
  const scr: GlassScreen = {
    group, cv, g, tex, W, H, hit: disp,
    draw(fn) { g.save(); g.imageSmoothingEnabled = false; fn(g, W, H); g.restore(); tex.needsUpdate = true; },
  };
  scr.draw((c) => { c.fillStyle = '#0b1a20'; c.fillRect(0, 0, W, H); });
  return scr;
}

/** screen drawing helpers: the pixel fonts at their native sizes, bars, a panel frame */
export const SCR = {
  bg: '#0b171c', grid: '#12262d', ink: '#bff6ff', dim: '#5f8f99', amber: '#ffcc66', red: '#ff6a5a', green: '#8dffb0',
  clear(g: CanvasRenderingContext2D, W: number, H: number) {
    g.fillStyle = SCR.bg; g.fillRect(0, 0, W, H);
    g.fillStyle = SCR.grid; for (let x = 0; x < W; x += 16) g.fillRect(x, 0, 1, H); for (let y = 0; y < H; y += 16) g.fillRect(0, y, W, 1);
  },
  text(g: CanvasRenderingContext2D, s: string, x: number, y: number, o: { size?: 11 | 22 | 24 | 32 | 44 | 48 | 64; col?: string; align?: CanvasTextAlign } = {}) {
    const size = o.size ?? 11, fam = size === 24 || size === 48 ? 'Title' : size === 32 || size === 64 ? 'TitleL' : 'Body';
    g.font = `${size}px '${fam}', monospace`; g.textBaseline = 'top'; g.textAlign = o.align ?? 'left'; g.fillStyle = o.col ?? SCR.ink; g.fillText(s, Math.round(x), Math.round(y));
  },
  bar(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k: number, col = SCR.ink) {
    g.fillStyle = SCR.dim; g.fillRect(x, y, w, 1); g.fillRect(x, y + h - 1, w, 1); g.fillRect(x, y, 1, h); g.fillRect(x + w - 1, y, 1, h);
    g.fillStyle = col; const fw = Math.round((w - 4) * Math.max(0, Math.min(1, k))); for (let i = 0; i < fw; i += 3) g.fillRect(x + 2 + i, y + 2, Math.min(2, fw - i), h - 4);
  },
};
