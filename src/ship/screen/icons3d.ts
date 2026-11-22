// Icons for the SHIP and LAB screens, RENDERED from small detailed 3D models (never hand-pixeled): each model is built
// in the UI kit's toon materials and drawn through the tool models' icon method (src/tools/models/icon.ts renderIcon:
// a 3/4 view at 4x, reduced, ink contours where parts overlap, a warm lip and a cool rim light, the palette snap, a
// bold outline). Cached per key and size.
//   icon3d('padlock' | 'medkit' | 'meal' | 'film' | 'crate' | 'pod' | 'flask' | 'scroll' | 'badge', size) -> canvas
//   partIcon(id, size) -> Promise<canvas>      a cyborg part's own lowpix model, redrawn in the kit look
import * as THREE from 'three';
import { toon } from '../../ui/kit/model3d';
import { mCrate, toonify } from '../../ui/kit/models';
import { renderIcon } from '../../tools/models/icon';
import { loadPart } from '../../ui/labBay';

const B = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0, p?: THREE.Object3D) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p?.add(o); return o; };
const C = (r0: number, r1: number, h: number, seg: number, m: THREE.Material, x = 0, y = 0, z = 0, p?: THREE.Object3D) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m); o.position.set(x, y, z); p?.add(o); return o; };

export function mPadlock(): THREE.Group {
  const g = new THREE.Group(), brass = toon({ color: 0xd8a848, metal: 0.8, gloss: 0.6 }), steel = toon({ color: 0xc8ccd0, metal: 0.9, gloss: 0.7 }), dark = toon({ color: 0x1a1612 });
  B(0.9, 0.72, 0.36, brass, 0, 0.36, 0, g);
  B(0.96, 0.08, 0.4, toon({ color: 0xb08030, metal: 0.8 }), 0, 0.7, 0, g);
  const sh = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.075, 8, 18, Math.PI), steel); sh.position.set(0, 0.74, 0); g.add(sh);
  C(0.075, 0.075, 0.22, 8, steel, -0.3, 0.74, 0, g); C(0.075, 0.075, 0.22, 8, steel, 0.3, 0.74, 0, g);
  C(0.07, 0.07, 0.05, 10, dark, 0, 0.42, 0.18, g).rotation.x = Math.PI / 2; B(0.05, 0.16, 0.05, dark, 0, 0.32, 0.18, g);
  for (const x of [-0.36, 0.36]) C(0.035, 0.035, 0.04, 6, steel, x, 0.12, 0.18, g).rotation.x = Math.PI / 2;
  return g;
}
export function mMedkit(): THREE.Group {
  const g = new THREE.Group();
  B(1, 0.62, 0.5, toon({ color: 0xe8e4d8, gloss: 0.4 }), 0, 0.31, 0, g);
  B(1.04, 0.1, 0.54, toon({ color: 0xc8c4b8, gloss: 0.4 }), 0, 0.6, 0, g);
  const red = toon({ color: 0xd03a2a, gloss: 0.5 });
  B(0.36, 0.1, 0.02, red, 0, 0.32, 0.26, g); B(0.1, 0.36, 0.02, red, 0, 0.32, 0.26, g);
  const h = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 12, Math.PI), toon({ color: 0x40444a, metal: 0.6 })); h.position.y = 0.66; g.add(h);
  for (const x of [-0.42, 0.42]) B(0.08, 0.14, 0.06, toon({ color: 0x9aa0a6, metal: 0.8 }), x, 0.5, 0.27, g);
  return g;
}
export function mMeal(): THREE.Group {
  const g = new THREE.Group(), tray = toon({ color: 0x9aa4a8, metal: 0.7, gloss: 0.5 });
  B(1.2, 0.06, 0.8, tray, 0, 0.03, 0, g); B(1.2, 0.08, 0.04, tray, 0, 0.08, 0.38, g); B(1.2, 0.08, 0.04, tray, 0, 0.08, -0.38, g);
  C(0.24, 0.17, 0.16, 14, toon({ color: 0xe8e0d0, gloss: 0.5 }), -0.28, 0.14, 0, g);
  C(0.2, 0.2, 0.03, 14, toon({ color: 0xc87a30 }), -0.28, 0.21, 0, g);
  C(0.11, 0.1, 0.24, 10, toon({ color: 0xb84a2a, gloss: 0.4 }), 0.34, 0.18, -0.16, g);
  const bread = B(0.3, 0.12, 0.18, toon({ color: 0xd8a060 }), 0.26, 0.12, 0.18, g); bread.rotation.y = 0.4;
  return g;
}
export function mFilm(): THREE.Group {
  const g = new THREE.Group(), al = toon({ color: 0xb8bec4, metal: 0.9, gloss: 0.7 }), film = toon({ color: 0x2a2420, gloss: 0.3 });
  for (const z of [-0.08, 0.08]) { const d = C(0.5, 0.5, 0.04, 20, al, 0, 0.55, z, g); d.rotation.x = Math.PI / 2; }
  const core = C(0.32, 0.32, 0.14, 18, film, 0, 0.55, 0, g); core.rotation.x = Math.PI / 2;
  const hub = C(0.09, 0.09, 0.2, 10, toon({ color: 0x40444a, metal: 0.6 }), 0, 0.55, 0, g); hub.rotation.x = Math.PI / 2;
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2, h = C(0.08, 0.08, 0.2, 8, toon({ color: 0x14181c }), Math.cos(a) * 0.3, 0.55 + Math.sin(a) * 0.3, 0, g); h.rotation.x = Math.PI / 2; }
  const strip = B(0.12, 0.02, 0.5, film, 0.42, 0.06, 0.22, g); strip.rotation.y = -0.4;
  return g;
}
export function mFlask(): THREE.Group {
  const g = new THREE.Group();
  const prof = [[0, 0], [0.38, 0], [0.4, 0.06], [0.24, 0.5], [0.12, 0.66], [0.12, 0.9], [0.15, 0.94], [0, 0.94]].map(([r, y]) => new THREE.Vector2(r, y));
  g.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 14), toon({ color: 0xbfe0e8, gloss: 0.9, opacity: 0.85 })));
  const liq = new THREE.Mesh(new THREE.LatheGeometry([[0, 0.02], [0.36, 0.02], [0.37, 0.07], [0.27, 0.36], [0, 0.36]].map(([r, y]) => new THREE.Vector2(r, y)), 14), toon({ color: 0x58d890, emissive: 0x104a28 })); g.add(liq);
  C(0.13, 0.13, 0.08, 10, toon({ color: 0x8a5a30 }), 0, 0.96, 0, g);
  return g;
}
export function mScroll(): THREE.Group {
  const g = new THREE.Group(), paper = toon({ color: 0xe8dcb8 }), wood = toon({ color: 0x7a4a24, gloss: 0.3 });
  B(0.8, 0.02, 0.6, paper, 0, 0.12, 0, g);
  for (const z of [-0.3, 0.3]) { const r = C(0.09, 0.09, 0.86, 12, paper, 0, 0.16, z, g); r.rotation.z = Math.PI / 2; for (const x of [-0.46, 0.46]) { const k = C(0.05, 0.05, 0.08, 8, wood, x, 0.16, z, g); k.rotation.z = Math.PI / 2; } }
  B(0.5, 0.025, 0.04, toon({ color: 0x8a6a40 }), 0, 0.14, -0.08, g); B(0.4, 0.025, 0.04, toon({ color: 0x8a6a40 }), -0.05, 0.14, 0.06, g);
  const seal = C(0.08, 0.08, 0.04, 12, toon({ color: 0xb02a22, gloss: 0.5 }), 0.2, 0.15, 0.16, g); void seal;
  return g;
}
export function mBadge(): THREE.Group {
  const g = new THREE.Group();
  const shield = new THREE.Shape(); shield.moveTo(0, 0.5); shield.lineTo(0.4, 0.38); shield.lineTo(0.36, -0.1); shield.lineTo(0, -0.45); shield.lineTo(-0.36, -0.1); shield.lineTo(-0.4, 0.38); shield.closePath();
  const geo = new THREE.ExtrudeGeometry(shield, { depth: 0.1, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 });
  const m = new THREE.Mesh(geo, toon({ color: 0xd8a848, metal: 0.8, gloss: 0.6 })); m.position.y = 0.5; g.add(m);
  const heart = B(0.22, 0.22, 0.06, toon({ color: 0xc83a2a, gloss: 0.5 }), 0, 0.52, 0.14, g); heart.rotation.z = Math.PI / 4;
  return g;
}
export function mPod(): THREE.Group {
  const g = new THREE.Group();
  C(0.55, 0.75, 1.1, 12, toon({ color: 0xe8e4d8, gloss: 0.3 }), 0, 0.75, 0, g);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), toon({ color: 0xd8d4c8, gloss: 0.3 })); cap.position.y = 1.3; g.add(cap);
  C(0.77, 0.77, 0.14, 12, toon({ color: 0xd06a2a, gloss: 0.4 }), 0, 0.32, 0, g);
  B(0.34, 0.2, 0.05, toon({ color: 0x3a6070, gloss: 0.9, emissive: 0x0a1a20 }), 0, 1.0, 0.6, g);
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2, leg = B(0.1, 0.5, 0.1, toon({ color: 0x60666c, metal: 0.7 }), Math.cos(a) * 0.7, 0.2, Math.sin(a) * 0.7, g); leg.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35); }
  return g;
}
const BUILD: Record<string, () => THREE.Object3D> = { padlock: mPadlock, medkit: mMedkit, meal: mMeal, film: mFilm, crate: mCrate, pod: mPod, flask: mFlask, scroll: mScroll, badge: mBadge };
const cache = new Map<string, HTMLCanvasElement>();
/** an icon rendered from its model (cached); a fresh copy each call so it can sit in the DOM in many places */
export function icon3d(key: keyof typeof BUILD | string, size = 32): HTMLCanvasElement {
  const k = key + '|' + size;
  let c = cache.get(k);
  if (!c) { const b = BUILD[key] ?? mPadlock; c = renderIcon(b(), size, { yaw: 0.6, pitch: 0.42 }); cache.set(k, c); }
  return copy(c);
}
const copy = (c: HTMLCanvasElement) => { const d = document.createElement('canvas'); d.width = c.width; d.height = c.height; const x = d.getContext('2d')!; x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0); d.style.imageRendering = 'pixelated'; return d; };
const parts = new Map<string, Promise<HTMLCanvasElement>>();
/** a cyborg part's icon, rendered from its own model */
export function partIcon(id: string, size = 40): Promise<HTMLCanvasElement> {
  const k = id + '|' + size;
  let p = parts.get(k);
  if (!p) {
    p = loadPart(id).then((m) => { const g = m ? toonify(m.clone(true)) : mCrate(); return renderIcon(g, size, { yaw: 0.7, pitch: 0.4 }); }).catch(() => renderIcon(mCrate(), size));
    parts.set(k, p);
  }
  return p.then(copy);
}
