// Sea life for the ocean (src/ocean/*): light, instancing-friendly models. Each kind is modelled from a lofted body,
// rayed fins and wet eyes, painted on its own small page in the master palette (counter-shaded back and belly, a
// lateral line, the kind's own marks, wet glints; the post pass draws the outline), and swims by a vertex wave in the
// shader, no bones: side-to-side for fish, up-and-down for the whale-kind, rippling wings for the ray, a pulsing bell
// for the jelly. With an InstancedMesh each instance's position shifts the wave's phase, so a school never moves in step.
//   const m = buildFish('baitfish', seed);  new THREE.InstancedMesh(m.geo, m.mat, 200) or new THREE.Mesh(m.geo, m.mat)
//   each frame: m.uniforms.uTime.value = t; m.uniforms.uSwim.value = 0..1 effort.  Fish face +z; m.length in metres.
import * as THREE from 'three';
import { RAMPS, snapRGBA, type RampName } from '../art/palette';
import { Page, SkinB, sac, blade, ball, sheet, pageTexture, oct, hash, type Region, type V3, type Wt } from './kit';
import { gbuf, gbufNone } from '../gfx/gbuf';

export type FishKind = 'baitfish' | 'reeffish' | 'shark' | 'ray' | 'jelly' | 'eel' | 'armourfish' | 'leviathan';
export const FISH_KINDS: FishKind[] = ['baitfish', 'reeffish', 'shark', 'ray', 'jelly', 'eel', 'armourfish', 'leviathan'];
export interface FishModel { kind: FishKind; geo: THREE.BufferGeometry; mat: THREE.Material; length: number; uniforms: { uTime: { value: number }; uSwim: { value: number } } }

interface Spec {
  L: number; /** body stations tail -> head: [half width, half height] x L */ prof: [number, number][];
  back: [RampName, number]; belly: [RampName, number]; accent: RampName;
  tail: 'fork' | 'fluke' | 'round' | 'whip'; dorsal: number; eyes: number; wave: 'side' | 'vert' | 'wing' | 'eel';
}
const SPECS: Record<Exclude<FishKind, 'jelly'>, Spec> = {
  baitfish: { L: 0.18, prof: [[0.02, 0.04], [0.05, 0.1], [0.08, 0.15], [0.09, 0.17], [0.08, 0.15], [0.06, 0.11], [0.03, 0.06]], back: ['teal', 3], belly: ['snow', 4], accent: ['ink', 1][0] as RampName, tail: 'fork', dorsal: 0.1, eyes: 2, wave: 'side' },
  reeffish: { L: 0.35, prof: [[0.03, 0.06], [0.06, 0.2], [0.09, 0.3], [0.1, 0.33], [0.09, 0.3], [0.07, 0.2], [0.04, 0.1]], back: ['coral', 4], belly: ['bone', 4], accent: 'teal', tail: 'round', dorsal: 0.22, eyes: 2, wave: 'side' },
  shark: { L: 3.2, prof: [[0.02, 0.04], [0.05, 0.07], [0.09, 0.1], [0.11, 0.12], [0.1, 0.11], [0.08, 0.08], [0.04, 0.04]], back: ['slate', 2], belly: ['snow', 3], accent: 'stampRed', tail: 'fork', dorsal: 0.16, eyes: 4, wave: 'side' },
  ray: { L: 1.6, prof: [[0.02, 0.02], [0.1, 0.04], [0.42, 0.06], [0.5, 0.07], [0.42, 0.06], [0.2, 0.05], [0.06, 0.03]], back: ['sand', 3], belly: ['bone', 5], accent: 'ochre', tail: 'whip', dorsal: 0, eyes: 2, wave: 'wing' },
  eel: { L: 1.4, prof: [[0.006, 0.01], [0.02, 0.03], [0.026, 0.035], [0.028, 0.036], [0.028, 0.036], [0.026, 0.034], [0.02, 0.026]], back: ['olive', 2], belly: ['straw', 3], accent: 'brass', tail: 'round', dorsal: 0.03, eyes: 2, wave: 'eel' },
  armourfish: { L: 0.6, prof: [[0.03, 0.03], [0.08, 0.06], [0.14, 0.09], [0.16, 0.1], [0.16, 0.09], [0.14, 0.07], [0.1, 0.05]], back: ['rust', 2], belly: ['sand', 4], accent: 'brass', tail: 'round', dorsal: 0.06, eyes: 2, wave: 'side' },
  leviathan: { L: 32, prof: [[0.02, 0.015], [0.05, 0.04], [0.09, 0.08], [0.11, 0.1], [0.11, 0.1], [0.1, 0.09], [0.07, 0.06]], back: ['slate', 2], belly: ['stone', 4], accent: 'bone', tail: 'fluke', dorsal: 0.02, eyes: 2, wave: 'vert' },
};
const R7 = (n: RampName, i: number) => { const R = RAMPS[n] as readonly number[]; return Array.from({ length: 7 }, (_, k) => R[Math.max(0, Math.min(R.length - 1, k - 3 + i))]); };

export function buildFish(kind: FishKind, seed = 1): FishModel {
  const page = new Page(256, 256), B = new SkinB(256, 256), w: Wt = [0, 1];
  let g = 1;
  if (kind === 'jelly') return jelly(page, B, seed);
  const sp = SPECS[kind], L = sp.L, N = sp.prof.length;
  const BODY = page.reg('BODY', 96, 64), FIN = page.reg('FIN', 32, 32), EYE = page.reg('EYE', 12, 12);
  // the body: tail (-z) to snout (+z)
  const pts: V3[] = sp.prof.map((_, i) => [0, kind === 'ray' ? 0 : (i - N / 2) * L * 0.004, -L / 2 + (L * i) / (N - 1)]);
  sac(B, BODY, g++, pts, sp.prof.map(([a, b]) => [a * L, b * L] as [number, number]), pts.map(() => w), { n: kind === 'ray' ? 16 : 14, sq: kind === 'armourfish' ? 2.6 : 2, cap: kind === 'ray' ? 0.3 : 0.6 });
  // fins: a rayed tail, a dorsal, a pair of pectorals
  const tz = -L / 2, th = sp.prof[0][1] * L;
  if (sp.tail === 'fork') { blade(B, FIN, [[0, 0, tz], [0, L * 0.12, tz - L * 0.14], [0, L * 0.2, tz - L * 0.2]], [L * 0.03, L * 0.04, L * 0.01], [0, 0, -1], [w, w, w], { offset: -0.5 }); blade(B, FIN, [[0, 0, tz], [0, -L * 0.1, tz - L * 0.14], [0, -L * 0.17, tz - L * 0.19]], [L * 0.03, L * 0.04, L * 0.01], [0, 0, -1], [w, w, w], { offset: -0.5 }); }
  else if (sp.tail === 'fluke') sheet(B, FIN, g++, [[[-L * 0.02, 0, tz], [0, 0, tz + L * 0.01], [L * 0.02, 0, tz]], [[-L * 0.14, 0, tz - L * 0.06], [0, 0, tz - L * 0.02], [L * 0.14, 0, tz - L * 0.06]], [[-L * 0.2, 0.002, tz - L * 0.1], [0, 0, tz - L * 0.04], [L * 0.2, 0.002, tz - L * 0.1]]], () => w);
  else if (sp.tail === 'whip') sac(B, BODY, g++, [[0, 0, tz], [0, 0, tz - L * 0.4], [0, 0, tz - L * 0.8]], [[L * 0.015, L * 0.015], [L * 0.008, L * 0.008], [0.001, 0.001]], [w, w, w], { n: 5 });
  else blade(B, FIN, [[0, 0, tz + L * 0.02], [0, 0, tz - L * 0.08], [0, 0, tz - L * 0.14]], [th * 1.4, th * 2.2, th * 1.8], [0, 1, 0], [w, w, w], { offset: -0.5 });
  if (sp.dorsal > 0) { const top = sp.prof[3][1] * L; blade(B, FIN, [[0, top * 0.9, -L * 0.15], [0, top * 0.9, 0], [0, top * 0.9, L * 0.12]], [L * sp.dorsal * 0.4, L * sp.dorsal, L * sp.dorsal * 0.3], [0, 1, -0.3], [w, w, w], { offset: -0.1 }); }
  if (kind !== 'ray' && kind !== 'eel') for (const s of [-1, 1]) { const x = sp.prof[4][0] * L; blade(B, FIN, [[s * x * 0.9, -L * 0.03, L * 0.12], [s * (x + L * 0.08), -L * 0.06, L * 0.06], [s * (x + L * 0.12), -L * 0.08, L * 0.0]], [L * 0.03, L * 0.04, L * 0.01], [0, 0, 1], [w, w, w], { offset: -0.5 }); }
  // eyes: high on the head; the shark-kind carries four
  for (let e = 0; e < sp.eyes; e++) {
    const s = e % 2 ? 1 : -1, row = e >> 1, i5 = sp.prof[5], ex = i5[0] * L * (kind === 'ray' ? 0.3 : 0.92), ey = i5[1] * L * (kind === 'ray' ? 1.1 : 0.35) - row * L * 0.025, ez = L * (0.3 - row * 0.05);
    ball(B, EYE, g++, [s * ex, ey, ez], [s, kind === 'ray' ? 1 : 0.2, 0.3], [L * 0.022, L * 0.022, L * 0.016], w, { n: 8, rings: 4, sq: 2 });
  }
  page.pack(2);
  paintBody(BODY, sp, kind, seed); paintFin(FIN, sp); paintEye(EYE);
  return finish(page, B, kind, L, sp.wave);
}

function paintBody(r: Region, sp: Spec, kind: FishKind, seed: number) {
  const BK = R7(...sp.back), BL = R7(...sp.belly), AC = R7(sp.accent, 3);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const t = (y + 0.5) / r.h, th = r.th(x), ath = Math.abs(th);
    // counter-shading: a dark back, a pale belly, the line between them drawn with a gentle wave
    const edge = 1.75 + 0.08 * Math.sin(t * 23 + seed);
    let R = ath < edge ? BK : BL, k = ath < 0.9 ? 3 : ath < edge ? 4 : ath > 2.6 ? 4 : 3;
    if (Math.abs(ath - 1.55) < 0.05 && (y >> 1) % 3 !== 0) k -= 1; // the lateral line
    if (kind === 'reeffish' && ath < edge + 0.3 && Math.abs(((t * 4.5) % 1) - 0.5) < 0.1) { R = AC; k = 3; } // bars
    if (kind === 'baitfish' && t > 0.62 && t < 0.7 && Math.abs(ath - 1.3) < 0.18) { R = R7('ink', 1); k = 1; } // the shoulder spot
    if (kind === 'ray' && ath < edge && oct((t * 9) % 1 - 0.5, ((th * 2) % 1) - 0.5) < 0.18 && hash(Math.floor(t * 9), Math.floor(th * 2) + 9) < 0.6) { R = R7('soil', 2); k = 2; }
    if (kind === 'eel' && ath < edge && Math.abs(((t * 14 + ath * 0.3) % 1) - 0.5) < 0.14) k -= 1; // bands
    if (kind === 'armourfish' && (y % 6 === 0 || (x + (Math.floor(y / 6) & 1) * 4) % 8 === 0)) k -= 1.5; // plate seams
    if (kind === 'shark' && t > 0.6 && t < 0.72 && Math.abs(ath - 1.35) < 0.05) { R = R7('ink', 1); k = 0; } // spiracle slits
    r.put(x, y, R, k);
    if (ath < 0.5 && (x + y * 3) % 23 === 0) r.set(x, y, RAMPS.snow[5]); // wet glints along the back
  }
  // the leviathan's hide: barnacle crusts and old scars
  if (kind === 'leviathan') for (let i = 0; i < 40; i++) { const cx = hash(i, 3) * r.w, cy = hash(i, 5) * r.h; if (Math.abs(r.th(cx)) > 1.4) continue; r.blob(cx, cy, 2, 2, RAMPS.bone[3]); r.set(cx - 1, cy - 1, RAMPS.bone[5]); r.set(cx + 1, cy + 1, RAMPS.stone[1]); }
  if (kind === 'leviathan' || kind === 'shark') for (let i = 0; i < 4; i++) r.crack(hash(i, 8) * r.w, hash(i, 9) * r.h, 14, 20 + i * 40, RAMPS.bone[4], i + 7, 1, 0);
}
function paintFin(r: Region, sp: Spec) {
  const R = R7(sp.back[0], sp.back[1] + 1);
  r.fill(R, (x, y) => (x % 4 === 0 ? 2 : 4) - (y > r.h * 0.85 ? 2 : 0) - (x === 0 || x === r.w - 1 ? 1 : 0));
}
function paintEye(r: Region) {
  r.fill(R7('ink', 1), (x, y) => (y > r.h * 0.6 ? 0 : 2) + (Math.cos(r.th(x)) > 0.5 ? 1 : 0));
  r.set(r.X(0), Math.floor(r.h * 0.8), RAMPS.snow[5]);
}

/** a jelly: a translucent bell with a frilled skirt, oral arms and long trailing tentacles; it swims by pulsing */
function jelly(page: Page, B: SkinB, seed: number): FishModel {
  const BELL = page.reg('BELL', 64, 32), TEN = page.reg('TEN', 16, 48), w: Wt = [0, 1], L = 0.5;
  const pts: V3[] = [[0, L * 0.3, 0], [0, L * 0.22, 0], [0, L * 0.08, 0], [0, -L * 0.02, 0]];
  sac(B, BELL, 1, pts, [[L * 0.06, L * 0.06], [L * 0.24, L * 0.24], [L * 0.3, L * 0.3], [L * 0.33, L * 0.33]], pts.map(() => w), { n: 18, sq: 2, up: [0, 0, 1], start: true, end: false, bump: (a, t) => (t > 0.9 ? 0.06 * Math.sin(a * 12) : 0) });
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, x = Math.cos(a) * L * 0.3, z = Math.sin(a) * L * 0.3, len = L * (1.4 + hash(i, seed) * 0.8); blade(B, TEN, [[x, 0, z], [x * 1.05, -len * 0.5, z * 1.05], [x * 0.9, -len, z * 0.9]], [L * 0.012, L * 0.01, L * 0.004], [-Math.sin(a), 0, Math.cos(a)], [w, w, w], { offset: -0.5 }); }
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; blade(B, TEN, [[0, 0, 0], [Math.cos(a) * L * 0.05, -L * 0.35, Math.sin(a) * L * 0.05], [Math.cos(a) * L * 0.08, -L * 0.7, Math.sin(a) * L * 0.08]], [L * 0.05, L * 0.06, L * 0.02], [-Math.sin(a), 0, Math.cos(a)], [w, w, w], { offset: -0.5 }); }
  page.pack(2);
  const V = R7('violet', 4), G = R7('glowTeal', 2);
  BELL.fill(V, (x, y) => (y < BELL.h * 0.3 ? 5 : 4) + ((x % 8 === 0 || y % 6 === 0) ? -1 : 0));
  for (let x = 0; x < BELL.w; x += 3) BELL.set(x, BELL.h - 1, G[5]);
  TEN.fill(V, (x, y) => 3 + (y % 5 === 0 ? 1 : 0));
  return finish(page, B, 'jelly', L, 'side');
}

function finish(page: Page, B: SkinB, kind: FishKind, L: number, wave: Spec['wave']): FishModel {
  snapRGBA(page.pc.data); page.finish();
  const geo = B.build(); geo.deleteAttribute('skinIndex'); geo.deleteAttribute('skinWeight');
  const tex = pageTexture(page), jelly = kind === 'jelly';
  const uniforms = { uTime: { value: 0 }, uSwim: { value: 0.5 } };
  const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, transparent: jelly, opacity: jelly ? 0.62 : 1, depthWrite: !jelly });
  const amp = wave === 'eel' ? 0.12 : wave === 'vert' ? 0.06 : wave === 'wing' ? 0.08 : 0.07;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime; sh.uniforms.uSwim = uniforms.uSwim;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime, uSwim;').replace('#include <begin_vertex>', `#include <begin_vertex>
float ph = 0.0;
#ifdef USE_INSTANCING
ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 0.9;
#endif
float L = ${L.toFixed(4)}, zf = clamp((L * 0.5 - position.z) / L, 0.0, 1.0), sp = 3.0 + uSwim * 7.0;
${jelly ? `float pulse = 0.5 + 0.5 * sin(uTime * 2.4 + ph); transformed.xz *= 1.0 + pulse * 0.12 * smoothstep(-0.1, 0.15, position.y); transformed.x += sin(position.y * 9.0 - uTime * 2.4 + ph) * 0.03 * smoothstep(0.0, -0.4, position.y);`
    : wave === 'vert' ? `transformed.y += sin(position.z / L * 6.0 - uTime * sp * 0.4 + ph) * ${amp} * L * zf * zf;`
    : wave === 'wing' ? `transformed.y += sin(position.z / L * 7.0 - uTime * sp * 0.6 + ph) * ${amp} * L * abs(position.x) / L * 2.0;`
    : `transformed.x += sin(position.z / L * ${wave === 'eel' ? '14.0' : '7.0'} - uTime * sp + ph) * ${amp} * L * (${wave === 'eel' ? 'zf + 0.2' : 'zf * zf'});`}`);
  };
  mat.customProgramCacheKey = () => 'oddworld-fish-' + kind;
  if (jelly) gbufNone(mat); else gbuf(mat, 1);
  return { kind, geo, mat, length: L, uniforms };
}
