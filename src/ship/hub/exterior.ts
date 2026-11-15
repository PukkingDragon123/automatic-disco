// The MERIDIAN from outside: a UNAA research vessel about 70 m long, built around the deck plan (layout.ts) so the
// cutaway and the hero shot are the same ship. A chamfered white hull in plate courses with seams and rivet lines,
// the orange program band, stencils and the UNAA roundel; a glazed bridge canopy at the bow; lit windows where the
// rooms are; the hangar door on the port side; dorsal sensor arrays (a mast of dishes and whips, a phased-array
// plate), radiator fins aft, RCS quads at the corners, docking and running lights, and the engine block with three
// main bells and their idling glow. The roof comes off in plates (setCut) for the dollhouse view.
import * as THREE from 'three';
import { Mats, Bin, Batch, box, cyl, lathe, quad, V3 } from './kit';
import { WALL_H, CUT_H, SHIP_NAME } from './layout';
import { canvas, toTex, cached, rgb, rgba, shade, screw, stencilText, grain, chips, streak, hazardStripes, labelTex, hazardTex } from './tex';
import { Rand } from '../../core/rand';
import { pixHull } from './pix';
import { gbuf, F_EMIT } from '../../gfx/gbuf';
import type { CamPreset } from './layout';

export interface Exterior {
  root: THREE.Group;
  setCut(k: number): void;
  heroCam(): CamPreset;
  update(dt: number, t: number, cam: THREE.Camera): void;
  dispose(): void;
}

// ------------------------------------------------------------------ the hull's paint
/** hull plating, 8 m x 8 m per tile (128 texels / m): u around the section, v along the ship */
function hullTex(key: string, base: number) {
  return cached('hull|' + key, () => {
    const W = 1024, [c, g] = canvas(W, W), r = new Rand(key.length * 77 + base);
    const pxm = W / 8;
    g.fillStyle = rgb(base); g.fillRect(0, 0, W, W);
    grain(g, W, W, 3, 0.03);
    // courses: 2 m bands around the hull (canvas x), plates of 1.5 to 3 m along it (canvas y), each its own tone
    for (let cx = 0; cx < 4; cx++) {
      let y = Math.floor(r.next() * 2) * pxm * 0.75;
      y -= pxm * 3;
      while (y < W) {
        const len = pxm * (1.5 + Math.floor(r.next() * 4) * 0.5);
        const tone = shade(base, 0.95 + r.next() * 0.07);
        const x0 = cx * pxm * 2;
        g.fillStyle = rgb(tone); g.fillRect(x0 + 2, y + 2, pxm * 2 - 4, len - 4);
        // a darker panel insert on some plates
        if (r.next() < 0.07) { g.fillStyle = rgb(shade(base, 0.82)); g.fillRect(x0 + pxm * 0.3, y + pxm * 0.3, pxm * 1.4, len - pxm * 0.6); g.fillStyle = rgb(shade(base, 0.85)); g.fillRect(x0 + pxm * 0.3, y + pxm * 0.3, pxm * 1.4, 2); }
        // seams: the groove and the lit lip
        g.fillStyle = rgb(shade(base, 0.45)); g.fillRect(x0, y, pxm * 2, 2); g.fillStyle = rgb(shade(base, 1.18)); g.fillRect(x0, y + 2, pxm * 2, 1);
        // rivet lines along the plate edges
        for (let k = 8; k < len - 6; k += 14) { g.fillStyle = rgb(shade(tone, 0.7)); g.fillRect(x0 + 6, y + k, 3, 3); g.fillRect(x0 + pxm * 2 - 9, y + k, 3, 3); g.fillStyle = rgb(shade(tone, 1.2)); g.fillRect(x0 + 6, y + k, 2, 1); g.fillRect(x0 + pxm * 2 - 9, y + k, 2, 1); }
        // wear: chips at the corners, a streak below a fixing
        chips(g, x0 + 4, y + 4, x0 + pxm * 2 - 4, y + 6, shade(base, 1.25), r, 6, 2);
        if (r.next() < 0.3) streak(g, x0 + pxm * (0.4 + r.next() * 1.2), y + 10, len * 0.6, r, 0.08);
        // a stencil or an access hatch here and there
        const k = r.next();
        if (k < 0.08) stencilText(g, ['NO STEP', 'RCS', 'O2 FILL', 'GND', 'VENT', 'HATCH 4', 'DOCK A'][Math.floor(r.next() * 7)], x0 + pxm, y + len / 2, 20, shade(base, 0.45), { align: 'center', font: "'Jersey', monospace" });
        else if (k < 0.16) { const hx = x0 + pxm * 0.5, hy = y + len / 2 - 30; g.strokeStyle = rgb(shade(base, 0.5)); g.lineWidth = 2; g.strokeRect(hx, hy, pxm, 60); for (const [a, b] of [[hx + 6, hy + 6], [hx + pxm - 6, hy + 6], [hx + 6, hy + 54], [hx + pxm - 6, hy + 54]]) screw(g, a, b, 3, tone); }
        y += len;
      }
      g.fillStyle = rgb(shade(base, 0.5)); g.fillRect(cx * pxm * 2, 0, 2, W); g.fillStyle = rgb(shade(base, 1.15)); g.fillRect(cx * pxm * 2 + 2, 0, 1, W);
    }
    const t = toTex(c); t.anisotropy = 8; return t;
  });
}
/** the engine block's sooted dark plate */
function engineTex() {
  return cached('engtex', () => {
    const W = 512, [c, g] = canvas(W, W), r = new Rand(9);
    g.fillStyle = '#2c2f31'; g.fillRect(0, 0, W, W); grain(g, W, W, 5, 0.06);
    for (let y = 0; y < W; y += 64) { g.fillStyle = '#16181a'; g.fillRect(0, y, W, 3); for (let x = 10; x < W; x += 18) { g.fillStyle = '#4a4e50'; g.fillRect(x, y + 8, 3, 3); } }
    for (let i = 0; i < 30; i++) streak(g, r.next() * W, r.next() * W, 80 + r.next() * 120, r, 0.15);
    return toTex(c);
  });
}

// ------------------------------------------------------------------ lofting
type Sec = { z: number; hw: number; top: number; bot: number; ct: number; cb: number };
const SECS: Sec[] = [
  { z: -28.6, hw: 9.2, top: 3.4, bot: -2.2, ct: 1.6, cb: 2.0 },
  { z: -27.4, hw: 10.4, top: 4.1, bot: -3.0, ct: 1.1, cb: 2.2 },
  { z: -26.0, hw: 10.75, top: 4.3, bot: -3.2, ct: 0.9, cb: 2.3 },
  { z: 16.5, hw: 10.75, top: 4.3, bot: -3.2, ct: 0.9, cb: 2.3 },
  { z: 21.0, hw: 9.6, top: 4.2, bot: -3.0, ct: 1.0, cb: 2.2 },
  { z: 25.0, hw: 7.8, top: 4.0, bot: -2.6, ct: 1.1, cb: 2.0 },
  { z: 28.0, hw: 5.9, top: 3.7, bot: -2.0, ct: 1.2, cb: 1.7 },
  { z: 30.6, hw: 3.6, top: 2.6, bot: -1.0, ct: 1.0, cb: 1.1 },
  { z: 31.6, hw: 1.6, top: 1.4, bot: -0.2, ct: 0.6, cb: 0.6 },
];
/** a section's three arcs (x, y), each ordered around from starboard over the top / under the keel */
function arcs(s: Sec) {
  const cut = Math.min(CUT_H, s.top - s.ct - 0.05), sup = Math.min(WALL_H, s.top - s.ct);
  const stbd: [number, number][] = [[s.hw, cut], [s.hw, sup]];
  const roof: [number, number][] = [[s.hw, sup], [s.hw, s.top - s.ct], [s.hw - s.ct, s.top], [-s.hw + s.ct, s.top], [-s.hw, s.top - s.ct], [-s.hw, cut]];
  const low: [number, number][] = [[-s.hw, cut], [-s.hw, s.bot + s.cb], [-s.hw + s.cb, s.bot], [s.hw - s.cb, s.bot], [s.hw, s.bot + s.cb], [s.hw, cut]];
  // drop zero-length steps
  const clean = (a: [number, number][]) => a.filter((p, i) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1e-3);
  return { stbd: clean(stbd), roof: clean(roof), low: clean(low) };
}
/** loft one arc through the sections between z0 and z1 (flat-shaded quads), uv in metres / tile */
function loftArc(which: 'stbd' | 'roof' | 'low', z0: number, z1: number, tile = 8) {
  const secs: Sec[] = [];
  const lerpSec = (a: Sec, b: Sec, z: number): Sec => { const t = (z - a.z) / (b.z - a.z); const L = (p: number, q: number) => p + (q - p) * t; return { z, hw: L(a.hw, b.hw), top: L(a.top, b.top), bot: L(a.bot, b.bot), ct: L(a.ct, b.ct), cb: L(a.cb, b.cb) }; };
  for (let i = 0; i < SECS.length - 1; i++) {
    const a = SECS[i], b = SECS[i + 1];
    if (b.z <= z0 || a.z >= z1) continue;
    if (!secs.length) secs.push(lerpSec(a, b, Math.max(z0, a.z)));
    secs.push(lerpSec(a, b, Math.min(z1, b.z)));
  }
  const P: number[] = [], N: number[] = [], U: number[] = [];
  const pa = new V3(), pb = new V3(), pc = new V3(), pd = new V3(), n = new V3(), e1 = new V3(), e2 = new V3();
  for (let i = 0; i < secs.length - 1; i++) {
    const A = arcs(secs[i])[which], Bs = arcs(secs[i + 1])[which];
    if (A.length !== Bs.length) continue;
    let ua = 0;
    for (let k = 0; k < A.length - 1; k++) {
      pa.set(A[k][0], A[k][1], secs[i].z); pb.set(A[k + 1][0], A[k + 1][1], secs[i].z);
      pc.set(Bs[k + 1][0], Bs[k + 1][1], secs[i + 1].z); pd.set(Bs[k][0], Bs[k][1], secs[i + 1].z);
      const du = pa.distanceTo(pb);
      e1.subVectors(pb, pa); e2.subVectors(pd, pa); n.crossVectors(e1, e2).normalize();
      // outward: away from the hull axis
      const mid = pa.clone().add(pc).multiplyScalar(0.5); if (n.dot(new V3(mid.x, mid.y - 0.5, 0)) < 0) n.negate();
      const tri = (p: THREE.Vector3[], uv: [number, number][]) => {
        // wind so the face points along n
        const fn = new V3().crossVectors(new V3().subVectors(p[1], p[0]), new V3().subVectors(p[2], p[0]));
        if (fn.dot(n) < 0) { p = [p[0], p[2], p[1]]; uv = [uv[0], uv[2], uv[1]]; }
        for (let j = 0; j < 3; j++) { P.push(p[j].x, p[j].y, p[j].z); N.push(n.x, n.y, n.z); U.push(uv[j][0] / tile, uv[j][1] / tile); }
      };
      tri([pa.clone(), pb.clone(), pc.clone()], [[ua, secs[i].z], [ua + du, secs[i].z], [ua + du, secs[i + 1].z]]);
      tri([pa.clone(), pc.clone(), pd.clone()], [[ua, secs[i].z], [ua + du, secs[i + 1].z], [ua, secs[i + 1].z]]);
      ua += du;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  return g;
}
/** the section outline at z (for end caps) */
export function hullAt(z: number) {
  for (let i = 0; i < SECS.length - 1; i++) { const a = SECS[i], b = SECS[i + 1]; if (z >= a.z && z <= b.z) { const t = (z - a.z) / (b.z - a.z); const L = (p: number, q: number) => p + (q - p) * t; return { z, hw: L(a.hw, b.hw), top: L(a.top, b.top), bot: L(a.bot, b.bot), ct: L(a.ct, b.ct), cb: L(a.cb, b.cb) }; } }
  return SECS[SECS.length - 1];
}

// ------------------------------------------------------------------ the ship
const ROOF_CUTS = [-28.6, -20, -12, -4, 4, 12, 16.5, 31.6];

export function buildExterior(bin: Bin, M: Mats, _renderer: THREE.WebGLRenderer): Exterior {
  const root = new THREE.Group(); root.name = 'exterior';
  const white = M.get('hull.white', { map: pixHull('w', 0xc6c8c0) });
  const grey = M.get('hull.grey', { map: pixHull('g', 0x6c7276) });
  const dark = M.get('hull.dark', { map: pixHull('e', 0x383c3e) });
  const gun = M.get('ext.gun', { color: 0x4a4f53, rough: 0.45, metal: 0.6 });
  const steel = M.get('ext.steel', { color: 0x9aa0a0, rough: 0.3, metal: 0.8 });
  const orange = M.get('ext.orange', { color: 0xd0662a, rough: 0.5 });
  const black = M.get('ext.black', { color: 0x141618, rough: 0.5 });
  const glassM = M.get('ext.glass', { color: 0x1a2a34, rough: 0.05, metal: 0.6, env: 1.6 });
  const haz = M.get('ext.haz', { map: hazardTex(), rough: 0.6 });
  // ---- the hull: lower (always), starboard upper (always), roof plates (lift away)
  const low = new THREE.Mesh(bin.g(loftArc('low', -28.6, 31.6)), white); low.castShadow = true; low.receiveShadow = true; root.add(low);
  const stb = new THREE.Mesh(bin.g(loftArc('stbd', -28.6, 16.5)), white); stb.castShadow = true; stb.receiveShadow = true; root.add(stb);
  const plates: { g: THREE.Group; i: number }[] = [];
  for (let i = 0; i < ROOF_CUTS.length - 1; i++) {
    const g = new THREE.Group(); g.name = 'roof' + i; root.add(g);
    const m = new THREE.Mesh(bin.g(loftArc('roof', ROOF_CUTS[i], ROOF_CUTS[i + 1])), white); m.castShadow = true; m.receiveShadow = true; g.add(m);
    if (ROOF_CUTS[i + 1] > 16.5) { const z0 = Math.max(16.5, ROOF_CUTS[i]); const sm = new THREE.Mesh(bin.g(loftArc('stbd', z0, ROOF_CUTS[i + 1])), white); sm.castShadow = true; sm.receiveShadow = true; g.add(sm); }
    plates.push({ g, i });
  }
  // the deck caps where the cut runs (between the skin and the interior walls)
  const capM = M.get('ext.cap', { color: 0x2a2e30, rough: 0.6, metal: 0.4 });
  const capB = new Batch(bin);
  capB.add(box(0.75, 0.06, 43.4), capM, { x: -10.38, y: CUT_H + 0.03, z: -5.3 });
  capB.add(box(0.75, 0.06, 43.4), capM, { x: 10.38, y: WALL_H + 0.03, z: -5.3 });
  capB.add(box(20.8, 0.06, 1.4), capM, { x: 0, y: CUT_H + 0.03, z: -27.6 });
  // a bright edge line along the cut (the section's lit lip)
  capB.add(box(0.04, 0.07, 43.4), M.glow('cutline', 0xd9a43a, 1.1), { x: -10.74, y: CUT_H + 0.035, z: -5.3 });
  // the stern plate up to the cut, the engine block, the bells
  const B = new Batch(bin);
  const st = hullAt(-28.6);
  {
    const sh = new THREE.Shape();
    const pts = [...arcs(st).low, ...arcs(st).stbd.slice(1)];
    pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
    const g = new THREE.ShapeGeometry(sh); g.rotateY(Math.PI); B.add(g, dark, { z: -28.6 });
  }
  // the engine section: a low housing under the deck line (it never hides the rooms), side nacelles, the thrust
  // frame and three main bells with two smaller ones on the nacelles; pipes and tanks on top
  B.add(box(12.6, 3.2, 6.0, 0.35), dark, { x: 0, y: -1.5, z: -31.6 });
  B.add(box(13.0, 0.3, 6.2, 0.1), gun, { x: 0, y: 0.25, z: -31.6 });
  for (let k = 0; k < 5; k++) B.add(box(10.6, 0.08, 0.3), black, { x: 0, y: 0.42, z: -33.8 + k * 1.1 });
  for (const [x, col] of [[-3.2, 'pipeR'], [-2.6, 'pipeB'], [2.6, 'pipeB'], [3.2, 'pipeR']] as [number, string][]) B.add(cyl(0.16, 0.16, 6.4, 10), M.get('ext.' + col, { color: col === 'pipeR' ? 0x9a3a2e : 0x3a5a86, rough: 0.45, metal: 0.4 }), { x, y: 0.62, z: -31.6, rx: Math.PI / 2 });
  for (const s of [-1, 1]) {
    B.add(new THREE.SphereGeometry(1.1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.get('ext.tank', { color: 0xd8d4c4, rough: 0.5, metal: 0.2 }), { x: s * 5.0, y: 0.35, z: -30.2 });
    B.add(cyl(1.3, 1.3, 9.0, 20), grey, { x: s * 8.7, y: -1.8, z: -31.4, rx: Math.PI / 2 });
    B.add(cyl(1.42, 1.42, 0.5, 20), haz, { x: s * 8.7, y: -1.8, z: -27.4, rx: Math.PI / 2 });
    B.add(lathe([[0, 0], [1.3, 0], [1.1, 1.2], [0.4, 1.8], [0, 1.9]], 20), grey, { x: s * 8.7, y: -1.8, z: -26.9, rx: Math.PI / 2 });
    B.add(box(2.8, 0.5, 4.0, 0.1), gun, { x: s * 7.2, y: -1.2, z: -30.0 });
  }
  const bells: THREE.Vector3[] = [];
  const bellG = lathe([[1.0, 0], [1.25, -0.4], [1.75, -1.6], [2.1, -2.9], [2.0, -2.9], [1.6, -1.7], [1.1, -0.5], [0.85, -0.05]], 32);
  const bellM = M.get('bell', { color: 0x4a4440, rough: 0.3, metal: 0.85, env: 1.0 });
  for (const [x, y, z, s] of [[-4.0, -1.5, -34.6, 0.78], [0, -1.5, -34.6, 0.9], [4.0, -1.5, -34.6, 0.78], [-8.7, -1.8, -35.9, 0.5], [8.7, -1.8, -35.9, 0.5]] as [number, number, number, number][]) {
    B.add(bellG.clone(), bellM, { x, y, z, rx: Math.PI / 2, s });
    B.add(cyl(1.05 * s, 1.15 * s, 0.6, 24), gun, { x, y, z: z + 0.1, rx: Math.PI / 2 });
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; B.add(box(0.12, 0.12, 1.2), gun, { x: x + Math.cos(a) * 1.2 * s, y: y + Math.sin(a) * 1.2 * s, z: z + 0.5 }); }
    bells.push(new V3(x, y, z - 0.35 * s));
  }
  bellG.dispose();
  // the throats glow (emitters)
  const throatM = M.live(0xffa860, 2.6);
  for (const b of bells) { const d = new THREE.Mesh(bin.g(new THREE.CircleGeometry(0.8, 24)), throatM); d.position.copy(b); d.rotation.y = Math.PI; root.add(d); }
  // ---- the bridge canopy (part of the bow roof plate): framed glazing, lit from inside
  const bow = plates[plates.length - 1].g;
  {
    const cb = new Batch(bin);
    const lit = M.glow('canopy', 0x9fc6d8, 0.55);
    for (let k = 0; k < 7; k++) {
      const a0 = -0.95 + k * 0.27;
      const zc = 26.0 + Math.cos(a0) * 2.6, xc = Math.sin(a0) * 6.0;
      cb.add(quad(1.7, 1.15), lit, { x: xc, y: 3.55, z: zc, ry: a0, rx: -0.75 });
      cb.add(box(0.12, 1.25, 0.1), gun, { x: Math.sin(a0 - 0.135) * 6.05, y: 3.55, z: 26.0 + Math.cos(a0 - 0.135) * 2.65, ry: a0, rx: -0.75 });
    }
    cb.add(box(13.0, 0.2, 0.3), gun, { x: 0, y: 4.05, z: 26.6, rx: -0.75 });
    cb.flush(bow, 'canopy');
  }
  // ---- windows where the rooms are (warm in the quarters and mess, cool in the lab and medbay)
  const winTex = cached('winrow', () => { const [c, g] = canvas(256, 64); g.fillStyle = '#1a1c1e'; g.fillRect(0, 0, 256, 64); for (let i = 0; i < 4; i++) { g.fillStyle = '#d8e0d8'; g.fillRect(8 + i * 62, 10, 50, 44); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(8 + i * 62, 10, 50, 6); g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(12 + i * 62, 40, 20, 3); } return toTex(c, { repeat: false }); });
  const windows: [number, number, number, number][] = [[-1, 12.5, 6, 0xe8f4f4], [-1, 5.0, 5, 0x9fe0b0], [-1, -5.5, 8, 0xffd8a0], [1, 12.0, 6, 0xd8f0e0], [1, 1.5, 7, 0xffd8a0], [1, -9.5, 6, 0xe8e0c8], [1, -21.0, 6, 0xffb070]];
  for (const [s, z, w, col] of windows) {
    const m = M.glow('win' + col, col, 1.25, winTex);
    const target = s < 0 ? plates[ROOF_CUTS.findIndex((c, i) => z >= c && z < ROOF_CUTS[i + 1])].g : root;
    const g = new THREE.Mesh(bin.g(quad(w, 0.62)), m); g.position.set(s * 10.77, 2.15, z); g.rotation.y = s * Math.PI / 2; target.add(g);
    const fr = new THREE.Mesh(bin.g(box(0.12, 0.8, w + 0.2, 0.03)), gun); fr.position.set(s * 10.74, 2.15, z); target.add(fr);
  }
  // ---- the hangar door on the port side (upper leaf on the roof plate, the sill below the cut)
  {
    const hz = -19.8, hw = 9.4;
    const dm = M.get('hangar.door', { map: pixHull('d', 0x8a9094) });
    const p = plates[ROOF_CUTS.findIndex((c, i) => hz >= c && hz < ROOF_CUTS[i + 1])].g;
    const d = new THREE.Mesh(bin.g(box(0.25, WALL_H - CUT_H, hw, 0.05)), dm); d.position.set(-10.86, (WALL_H + CUT_H) / 2, hz); p.add(d);
    for (const s of [-1, 1]) { const h = new THREE.Mesh(bin.g(box(0.3, WALL_H - CUT_H + 0.3, 0.4)), haz); h.position.set(-10.9, (WALL_H + CUT_H) / 2, hz + s * (hw / 2 + 0.2)); p.add(h); }
    capB.add(box(0.3, CUT_H + 2.0, hw + 1.2, 0.05), haz, { x: -10.88, y: CUT_H / 2 - 1.0, z: hz });
    const lab = labelTex('HANGAR 1', { size: 64, fg: 0x1c1b18 });
    const lm = M.get('hangar.lbl', { map: lab, transparent: true, polyOffset: 2, rough: 0.6, flag: 0 });
    const ql = new THREE.Mesh(bin.g(quad(3.2, 0.6)), lm); ql.position.set(-11.0, 2.9, hz); ql.rotation.y = -Math.PI / 2; p.add(ql);
  }
  // ---- markings: the program band, the name, the roundel, the registration
  const band = M.get('ext.band', { color: 0xd0662a, rough: 0.5, polyOffset: 1 });
  for (const s of [-1, 1]) {
    const tgt = s > 0 ? root : null;
    const strip = (z0: number, z1: number) => { const g = new THREE.Mesh(bin.g(quad(z1 - z0, 0.45)), band); g.position.set(s * 10.78, 0.35, (z0 + z1) / 2); g.rotation.y = s * Math.PI / 2; (tgt ?? root).add(g); };
    strip(-26, 16.5);
  }
  const nameT = labelTex(SHIP_NAME, { size: 96, fg: 0x2a2e32 });
  const nameM = M.get('ext.name', { map: nameT, transparent: true, polyOffset: 2, rough: 0.6, flag: 0 });
  const nm = new THREE.Mesh(bin.g(quad(10.5, 1.5)), nameM); nm.position.set(10.79, -0.95, 4); nm.rotation.y = Math.PI / 2; root.add(nm);
  const regT = labelTex('UNAA   RV-07', { size: 64, fg: 0x2a2e32 });
  const regM = M.get('ext.reg', { map: regT, transparent: true, polyOffset: 2, rough: 0.6, flag: 0 });
  const rg = new THREE.Mesh(bin.g(quad(5.0, 0.8)), regM); rg.position.set(10.79, -1.95, 4); rg.rotation.y = Math.PI / 2; root.add(rg);
  const rgP = new THREE.Mesh(bin.g(quad(5.0, 0.8)), regM); rgP.position.set(-10.79, -0.95, 4); rgP.rotation.y = -Math.PI / 2; root.add(rgP);
  const roundel = cached('roundel', () => { const [c, g] = canvas(256, 256); g.fillStyle = '#e8e4d4'; g.beginPath(); g.arc(128, 128, 124, 0, 7); g.fill(); g.fillStyle = '#1d3b5a'; g.beginPath(); g.arc(128, 128, 112, 0, 7); g.fill(); g.strokeStyle = '#e8e4d4'; g.lineWidth = 6; for (const k of [0.35, 0.7, 1]) { g.beginPath(); g.ellipse(128, 128, 112 * k, 112, 0, 0, 7); g.stroke(); } for (const y of [-56, 0, 56]) { const w = Math.sqrt(112 * 112 - y * y); g.beginPath(); g.moveTo(128 - w, 128 + y); g.lineTo(128 + w, 128 + y); g.stroke(); } g.fillStyle = '#d9a43a'; g.beginPath(); g.moveTo(128, 40); g.lineTo(150, 128); g.lineTo(128, 216); g.lineTo(106, 128); g.fill(); const t = toTex(c, { repeat: false }); return t; });
  const rm = M.get('ext.roundel', { map: roundel, transparent: true, alphaTest: 0.5, polyOffset: 2, rough: 0.5, flag: 0 });
  for (const [x, z, ry] of [[10.79, -14, Math.PI / 2]] as [number, number, number][]) { const q = new THREE.Mesh(bin.g(new THREE.CircleGeometry(1.4, 32)), rm); q.position.set(x, 1.1, z); q.rotation.y = ry; root.add(q); }
  { const q = new THREE.Mesh(bin.g(new THREE.CircleGeometry(2.2, 32)), rm); q.position.set(0, 4.32, -8); q.rotation.x = -Math.PI / 2; plates[3].g.add(q); }
  // ---- dorsal details (on the roof plates, so they lift away with them)
  const dorsal = (i: number, f: (b: Batch) => void) => { const b = new Batch(bin); f(b); b.flush(plates[i].g, 'dorsal' + i); };
  // the sensor mast amidships: a lattice tower, a dish, whips, a phased-array plate
  dorsal(4, (b) => {
    b.add(box(2.4, 0.6, 3.2, 0.1), grey, { x: 2.5, y: 4.6, z: 7.0 });
    for (const [x, z] of [[1.6, 6.0], [3.4, 6.0], [1.6, 8.0], [3.4, 8.0]]) b.add(box(0.14, 4.0, 0.14), steel, { x, y: 6.8, z });
    for (let y = 5.2; y < 8.6; y += 0.7) { b.add(box(1.9, 0.08, 0.08), steel, { x: 2.5, y, z: 6.0 }); b.add(box(1.9, 0.08, 0.08), steel, { x: 2.5, y, z: 8.0 }); b.add(box(0.08, 0.08, 2.1), steel, { x: 1.6, y, z: 7 }); b.add(box(0.08, 0.08, 2.1), steel, { x: 3.4, y, z: 7 }); }
    b.add(box(2.4, 0.2, 2.4), grey, { x: 2.5, y: 8.9, z: 7.0 });
    b.add(cyl(0.025, 0.012, 3.0, 5), steel, { x: 1.7, y: 10.4, z: 6.2 }); b.add(cyl(0.025, 0.012, 2.2, 5), steel, { x: 3.3, y: 10.0, z: 7.8 });
    b.add(box(3.6, 2.2, 0.16, 0.05), M.get('array', { map: cached('arr', () => { const [c, g] = canvas(128, 64); g.fillStyle = '#2a3036'; g.fillRect(0, 0, 128, 64); for (let y = 2; y < 64; y += 8) for (let x = 2; x < 128; x += 8) { g.fillStyle = '#4a5560'; g.fillRect(x, y, 6, 6); g.fillStyle = '#6a7884'; g.fillRect(x, y, 6, 1); } return toTex(c); }), rough: 0.4, metal: 0.5 }), { x: -4.0, y: 5.6, z: 2.0, rx: -0.5 });
    b.add(box(0.3, 1.2, 0.3), gun, { x: -4.0, y: 4.8, z: 2.6 });
  });
  // the main dish on its turret (turns)
  const dishG = new THREE.Group(); dishG.position.set(2.5, 9.1, 7.0); plates[4].g.add(dishG);
  {
    const db = new Batch(bin);
    db.add(cyl(0.5, 0.6, 0.6, 16), gun, { y: 0.3 });
    db.add(lathe([[0.05, 0], [0.9, 0.12], [1.6, 0.42], [1.65, 0.46], [0.05, 0.08]], 28), M.get('dish', { color: 0xd8d8d0, rough: 0.4, metal: 0.2, side: THREE.DoubleSide }), { y: 1.1, rx: -0.9 });
    db.add(cyl(0.03, 0.03, 1.2, 6), steel, { y: 1.5, z: 0.5, rx: -0.9 });
    db.flush(dishG, 'dish');
  }
  // radiator fins aft (on both shoulders), vent stacks, a docking collar on the starboard side
  dorsal(1, (b) => {
    for (const s of [-1, 1]) for (let k = 0; k < 6; k++) b.add(box(3.2, 0.06, 1.0), M.get('rad', { color: 0x3a4044, rough: 0.35, metal: 0.7 }), { x: s * 7.6, y: 4.35 + k * 0.0, z: -18 + k * 1.2, rz: s * 0.15 });
    for (const [x, z] of [[-3, -16], [3, -16], [-3, -13], [3, -13]]) { b.add(box(1.0, 0.8, 1.0, 0.1), grey, { x, y: 4.7, z }); b.add(box(0.8, 0.05, 0.8), black, { x, y: 5.11, z }); }
  });
  dorsal(2, (b) => {
    b.add(box(4.0, 0.5, 6.0, 0.15), grey, { x: -3.5, y: 4.55, z: -8 });
    for (let k = 0; k < 5; k++) b.add(box(3.6, 0.12, 0.3), black, { x: -3.5, y: 4.83, z: -10.4 + k * 1.2 });
  });
  dorsal(5, (b) => { b.add(box(2.6, 0.7, 4.0, 0.2), grey, { x: -4.6, y: 4.6, z: 15 }); b.add(cyl(0.6, 0.6, 0.5, 16), gun, { x: -4.6, y: 5.2, z: 15.6 }); });
  // RCS quads at the four shoulders, on plates
  const rcs = (b: Batch, x: number, y: number, z: number, s: number) => {
    b.add(box(0.7, 0.7, 0.7, 0.08), gun, { x, y, z });
    for (const [dx, dy, dz, rx, rz] of [[s * 0.42, 0, 0, 0, s * Math.PI / 2], [0, 0.42, 0, 0, 0], [0, 0, 0.42, Math.PI / 2, 0], [0, 0, -0.42, -Math.PI / 2, 0]] as [number, number, number, number, number][]) b.add(cyl(0.09, 0.16, 0.24, 10), steel, { x: x + dx, y: y + dy, z: z + dz, rx, rz });
  };
  dorsal(0, (b) => { rcs(b, -9.4, 3.9, -26.6, -1); rcs(b, 9.4, 3.9, -26.6, 1); });
  dorsal(6, (b) => { rcs(b, -6.5, 3.6, 25.2, -1); rcs(b, 6.5, 3.6, 25.2, 1); });
  // keel: sensor blister, landing pads, hatch outlines, the drop bay doors under the workshop
  B.add(lathe([[0, 0], [1.4, 0], [1.6, -0.5], [1.2, -1.0], [0, -1.15]], 20), grey, { x: 2.0, y: -3.2, z: 8 });
  B.add(box(3.4, 0.12, 3.4), haz, { x: -6.0, y: -3.22, z: -19.8 });
  for (const [x, z] of [[-7.5, -22], [7.5, -22], [-7.5, 12], [7.5, 12]]) { B.add(box(1.6, 0.3, 1.6, 0.08), gun, { x, y: -3.3, z }); }
  // the docking collar (starboard, amidships)
  B.add(cyl(1.3, 1.4, 0.8, 20), gun, { x: 11.1, y: 1.0, z: -2.6, rz: Math.PI / 2 });
  B.add(new THREE.TorusGeometry(1.15, 0.12, 8, 24), haz, { x: 11.55, y: 1.0, z: -2.6, ry: Math.PI / 2 });
  // antenna whips along the starboard shoulder
  for (const z of [-10, 0, 10]) B.add(cyl(0.02, 0.01, 2.2, 5), steel, { x: 10.6, y: 4.9, z, rz: -0.3 });
  B.flush(root, 'ext');
  capB.flush(root, 'caps');
  // ---- lights: running lights, strobes, docking lights (small emitters with a bloom halo)
  type L = { m: THREE.MeshBasicMaterial; col: number; mode: number; ph: number };
  const lamps: L[] = [];
  const lampG = bin.g(new THREE.SphereGeometry(0.16, 10, 8));
  const addLamp = (parent: THREE.Object3D, x: number, y: number, z: number, col: number, mode: number, ph = 0) => {
    const m = new THREE.MeshBasicMaterial({ color: col }); gbuf(m, F_EMIT); bin.m(m);
    const me = new THREE.Mesh(lampG, m); me.position.set(x, y, z); parent.add(me); lamps.push({ m, col, mode, ph });
  };
  addLamp(root, -10.9, 0.6, 16, 0xff3020, 0); addLamp(root, 10.9, 0.6, 16, 0x30ff60, 0);
  addLamp(root, -10.9, 0.6, -26, 0xff3020, 0); addLamp(root, 10.9, 0.6, -26, 0x30ff60, 0);
  addLamp(plates[6].g, 0, 3.9, 30.2, 0xfff4e0, 1, 0.0); addLamp(root, 0, -3.4, -14, 0xfff4e0, 1, 0.5);
  addLamp(plates[4].g, 2.5, 9.0, 8.3, 0xff3020, 2, 0.2);
  for (let k = 0; k < 6; k++) addLamp(root, 0, -3.35, 22 - k * 7, 0xffb040, 3, k / 6);
  for (const z of [-26, -16, -6, 4, 14]) addLamp(root, 10.86, -1.6, z, 0xd8f0ff, 4, z * 0.01);
  // ---- the cut: roof plates lift and swing away in sequence (bow first)
  let cutK = 0;
  const setCut = (k: number) => {
    cutK = k;
    for (const p of plates) {
      const n = plates.length, d = (n - 1 - p.i) / n;
      const u = Math.max(0, Math.min(1, (k - d * 0.45) / 0.55));
      const e = u * u * (3 - 2 * u);
      p.g.position.set(-e * 6, e * 22, 0); p.g.rotation.set(0, 0, e * 0.5);
      p.g.visible = u < 0.999;
    }
  };
  setCut(0);
  return {
    root, setCut,
    heroCam() { return { pos: new V3(50, 15, 72), look: new V3(-13, -2.5, 6), fov: 34 }; },
    update(dt, t) {
      dishG.rotation.y = t * 0.15;
      throatM.color.setHex(0xffa860).multiplyScalar(2.2 + Math.sin(t * 23) * 0.15 + Math.sin(t * 7) * 0.1);
      for (const l of lamps) {
        let k = 1;
        if (l.mode === 0) k = 2.4;
        else if (l.mode === 1) { const f = (t * 0.8 + l.ph) % 1; k = f < 0.05 ? 6 : f > 0.12 && f < 0.15 ? 4 : 0.1; }
        else if (l.mode === 2) k = Math.sin(t * 2 + l.ph) > 0 ? 3 : 0.15;
        else if (l.mode === 3) { const f = (t * 0.6 - l.ph + 10) % 1; k = f < 0.08 ? 4 : 0.2; }
        else k = 1.6;
        l.m.color.setHex(l.col).multiplyScalar(k);
      }
      void cutK; void dt;
    },
    dispose() { /* everything is in the hub's bin */ },
  };
}
// unused helpers kept for the decal pass
void rgba; void hazardStripes;
