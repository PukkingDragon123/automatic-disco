// A pixel-art planet seen from orbit. The surface is a texel grid on the sphere (about 3 screen pixels a texel at
// the survey distance) displaced into real relief: continents rise around the regions, mountain ridges catch the
// light, seas sink into deep water with pale shelves and foam at the coasts. Each biome is painted in the world's
// own palette with its detail at texel scale: tree clusters in forests and jungle, dune ripples in deserts, pools in
// the mire, snow on high peaks, ice caps at the poles, rivers threading down to the sea. A separate cloud shell
// drifts over it and casts its shadows on the ground; the limb scatters blue on the day side and amber at the
// terminator; the night side glows with bioluminescent forests and, where the Veyr or a rival holds ground, with
// their veins. Region borders are glowing pixel lines. In orbit: the U.S.P.C. survey satellite and a small moon.
// Every material writes the G-buffer (outlined silhouette only; emitters flag bloom).
import * as THREE from 'three';
import { GN_DECL } from '../gfx/gbuf';
import { type Planet, BIOME_COL } from '../world/planet';
import { VEYR, RIVALS, PALETTES } from '../world/palette';
import type { BiomeKey } from '../world/region';

const MAXR = 16;
const BIOMES: BiomeKey[] = ['meadow', 'jungle', 'savanna', 'marsh', 'highland', 'tundra', 'desert', 'crystal', 'ashland', 'coast'];
export interface Globe { group: THREE.Group; mesh: THREE.Mesh; mat: THREE.ShaderMaterial; atmo: THREE.Mesh; refresh(): void; setHover(i: number): void; pick(ray: THREE.Ray): number }

// ------------------------------------------------------------------------------------------------ shared GLSL
const NOISE3 = /* glsl */`
float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i), h3(i+vec3(1,0,0)), f.x), mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y), mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x), mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
float ridged(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { float v = 1.0 - abs(vn(p) * 2.0 - 1.0); s += a * v * v; p = p * 2.13 + 9.7; a *= 0.5; } return s; }
float bayer4(vec2 p) { vec2 q = mod(floor(p), 4.0); float i = q.x + q.y * 4.0;
  return (i == 0.0 ? 0.0 : i == 1.0 ? 8.0 : i == 2.0 ? 2.0 : i == 3.0 ? 10.0 : i == 4.0 ? 12.0 : i == 5.0 ? 4.0 : i == 6.0 ? 14.0 : i == 7.0 ? 6.0 :
          i == 8.0 ? 3.0 : i == 9.0 ? 11.0 : i == 10.0 ? 1.0 : i == 11.0 ? 9.0 : i == 12.0 ? 15.0 : i == 13.0 ? 7.0 : i == 14.0 ? 13.0 : 5.0) / 16.0 + 1.0 / 32.0; }
`;
/** regions (warped Voronoi), biome traits, and the elevation of the ground (0 = sea level) */
const WORLD = /* glsl */`
uniform vec3 uC[${MAXR}]; uniform float uBi[${MAXR}]; uniform int uN; uniform vec3 uSeed;
uniform vec3 uBR[10];
void regionAt(vec3 n, out int k, out float d1, out float d2) {
  vec3 w = n + (vec3(vn(n * 9.0 + uSeed), vn(n * 9.0 + uSeed + 31.7), vn(n * 9.0 + uSeed + 63.1)) - 0.5) * 0.09;
  d1 = 9.0; d2 = 9.0; k = 0;
  for (int i = 0; i < ${MAXR}; i++) { if (i >= uN) break; float d = distance(w, uC[i]); if (d < d1) { d2 = d1; d1 = d; k = i; } else if (d < d2) d2 = d; }
}
/** relief traits of region k's biome: (land bias, mountains, forest) */
vec3 traits(int k) { return uBR[int(uBi[k] + 0.5)]; }
/** base relief (no region terms) */
float relief(vec3 n, float mtn) {
  float c = fbm(n * 1.7 + uSeed) - 0.5;
  float r = ridged(n * 4.2 + uSeed * 1.3);
  return c * 1.9 + max(0.0, r - 0.42) * 1.6 * mtn + (vn(n * 22.0 + uSeed) - 0.5) * 0.06;
}
float elevation(vec3 n, out int k, out float d1, out float d2) {
  regionAt(n, k, d1, d2);
  vec3 tr = traits(k);
  // land gathers round every region's heart; seas fill the gaps and the borders between some of them
  float e = relief(n, tr.y) + tr.x + 0.42 * smoothstep(0.42, 0.05, d1) - 0.18 * smoothstep(0.06, 0.0, d2 - d1);
  // the poles are flat ice
  e = mix(e, 0.12, smoothstep(0.86, 0.95, abs(n.y)));
  return e;
}
`;

// ------------------------------------------------------------------------------------------------ surface
const SURF_VERT = /* glsl */`
${NOISE3}
${WORLD}
uniform float uR, uRelief;
varying vec3 vP; varying vec3 vNw; varying vec3 vWp;
void main(){
  vec3 n = normalize(position);
  int k; float d1, d2;
  float e = elevation(n, k, d1, d2);
  float h = clamp(e, 0.0, 1.25) * uRelief;
  vec3 p = n * uR * (1.0 + h);
  vP = n;
  vNw = normalize(mat3(modelMatrix) * n);
  vec4 wp = modelMatrix * vec4(p, 1.0); vWp = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const SURF_FRAG = /* glsl */`
${GN_DECL}
${NOISE3}
${WORLD}
uniform vec3 uBA[10]; uniform vec3 uBB[10];
uniform float uSt[${MAXR}]; uniform int uHover; uniform float uT, uAsc, uG, uRelief;
uniform vec3 uSun, uMoss, uVein, uCreep, uCreepVein, uSea, uSeaDeep, uShelf, uSnow, uRock, uSand, uAir;
uniform mat4 modelMatrix;
varying vec3 vP; varying vec3 vNw; varying vec3 vWp;
float cloudAt(vec3 n) {
  vec3 q = n * 3.1 + vec3(uT * 0.011, 0.0, uT * 0.006);
  float c = fbm(q) * 0.75 + vn(n * 9.0 - vec3(uT * 0.02, 0.0, 0.0)) * 0.25;
  return smoothstep(0.52, 0.66, c) * (0.55 + 0.45 * smoothstep(0.2, 0.7, abs(n.y)));
}
void main(){
  vec3 n0 = normalize(vP);
  vec3 tid = floor(n0 * uG);
  vec3 n = normalize(tid / uG + 0.5 / uG);
  float g = h3(tid), g2 = h3(tid + 7.3);
  int k; float d1, d2;
  float e = elevation(n, k, d1, d2);
  int bi = int(uBi[k] + 0.5);
  vec3 tr = uBR[bi];
  // relief normal (pixel terraces): finite differences across the texel grid
  vec3 t1 = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), t2 = cross(n, t1);
  float eps = 1.6 / uG;
  float ea = relief(normalize(n + t1 * eps), tr.y), eb = relief(normalize(n + t2 * eps), tr.y), ec = relief(n, tr.y);
  float bump = uRelief * 26.0;
  vec3 Nl = normalize(n - (t1 * (ea - ec) + t2 * (eb - ec)) / eps * bump * step(0.0, e));
  vec3 N = normalize(mat3(modelMatrix) * Nl);
  vec3 Ns = normalize(vNw);
  bool sea = e < 0.0;
  float lat = abs(n.y);
  float ice = smoothstep(0.83, 0.86, lat + (vn(n * 7.0 + uSeed) - 0.5) * 0.1);
  vec3 col;
  if (sea) {
    // ocean: pale shelves, deep water, foam on the coast, a scatter of sun glints
    float dep = smoothstep(0.0, -0.55, e);
    col = mix(uShelf, uSea, smoothstep(0.0, 0.12, -e));
    col = mix(col, uSeaDeep, dep);
    col *= 0.92 + g * 0.1;
    if (e > -0.035) col = mix(col, vec3(0.86, 0.94, 0.92), 0.55);
    if (ice > 0.5) col = mix(uSnow * vec3(0.86, 0.94, 1.0), col, 0.25);
  } else {
    vec3 a = uBA[bi], b = uBB[bi];
    float hN = e / 0.9;
    float pat = vn(n * 40.0 + uSeed) * 0.6 + vn(n * 95.0) * 0.4;
    col = a * (0.86 + g * 0.18 + (pat - 0.5) * 0.25);
    // tree clusters: a dark crown pixel with a lit pixel above-left, in clumps
    float forest = tr.z * smoothstep(0.35, 0.65, vn(n * 18.0 + uSeed + 5.0));
    if (g < forest * 0.85) col = b * (0.62 + g2 * 0.25);
    else if (h3(tid + vec3(1.0, 1.0, 0.0)) < forest * 0.85) col = mix(col, b * 1.25, 0.6);
    if (bi == 6) {
      // dune ripples
      float s = sin(dot(n, normalize(vec3(0.8, 0.3, 0.5))) * 260.0 + vn(n * 12.0 + uSeed) * 9.0);
      col *= s > 0.55 ? 1.12 : s < -0.6 ? 0.82 : 1.0;
    } else if (bi == 3) {
      // the mire: standing pools
      if (vn(n * 55.0 + uSeed) > 0.68) col = mix(uSea, uShelf, 0.5) * (0.9 + g * 0.1);
    } else if (bi == 7) {
      // crystal flats: shards that glint
      if (g > 0.93) col = mix(b, vec3(1.0), 0.45);
    } else if (bi == 8) {
      // ash barrens: dark crust split by glowing seams
      if (abs(vn(n * 30.0 + uSeed) - 0.5) < 0.025) col = vec3(0.35, 0.08, 0.03);
    }
    // beaches, bare rock up high, snow on the peaks
    if (e < 0.05 && bi != 3) col = mix(col, uSand, 0.75);
    col = mix(col, uRock * (0.85 + g * 0.2), smoothstep(0.55, 0.8, hN) * 0.8);
    if (hN > 0.82 + (g - 0.5) * 0.12 || bi == 5 && g > 0.55 + hN * -0.4) col = uSnow * (0.9 + g * 0.1);
    // rivers thread down from the uplands to the sea
    float rv = abs(fbm(n * 5.5 + uSeed * 2.0) - 0.5);
    if (rv < 0.011 && e > 0.02 && hN < 0.6 && bi != 6) col = mix(uShelf, uSea, 0.4) * 1.05;
    if (ice > 0.5) col = uSnow * mix(vec3(0.82, 0.9, 1.0), vec3(1.0), g);
  }
  // territory: the Veyr's moss with veins pulsing, a rival's creep, scorched lost ground
  float st = uSt[k];
  vec3 emit = vec3(0.0);
  bool mine = (st > 0.5 && st < 1.5) || uAsc > 0.5;
  if (mine && !sea) { col = mix(uMoss * (0.8 + g * 0.4), col, 0.22); float vein = abs(sin(dot(n, vec3(13.0, 7.0, 11.0)) * 2.0 + vn(n * 5.0) * 9.0 + uT * 1.2)); if (vein > 0.992 && vn(n * 11.0) > 0.45) { col = uVein; emit += uVein * 0.9; } }
  if (st > 1.5 && st < 2.5 && !sea) col = mix(uCreep * (0.8 + g * 0.4), col, 0.25);
  if (st > 2.5) col *= 0.45;
  // borders: glowing pixel lines (owner's colour), neutral ones in ink with a faint light
  bool border = d2 - d1 < 0.018;
  if (border && uAsc < 0.5) {
    if (mine) { col = mix(col, uVein, 0.7); emit += uVein * 0.8; }
    else if (st > 1.5 && st < 2.5) { col = mix(col, uCreepVein, 0.7); emit += uCreepVein * 0.7; }
    else { col = mix(col * 0.38, vec3(0.9, 0.86, 0.7), 0.18 + 0.12 * step(0.5, g)); emit += vec3(0.25, 0.22, 0.16) * 0.25; }
  }
  if (k == uHover) { col = mix(col, vec3(1.0, 0.95, 0.7), border ? 0.85 : 0.2); if (border) emit += vec3(1.0, 0.85, 0.5) * 0.8; }
  // sun, clouds and their shadows
  float ndl = dot(N, uSun);
  float l = max(0.0, ndl) * 1.08 + 0.1;
  vec3 sunL = (inverse(mat3(modelMatrix)) * uSun);
  float shadow = cloudAt(normalize(n + sunL * 0.03));
  l *= 1.0 - shadow * 0.42;
  l = floor(l * 6.0) / 6.0 + 0.08;
  // the night side: bioluminescent forests, glowing rivers and coasts, held ground shining in its owner's colour
  float night = smoothstep(0.08, -0.18, dot(Ns, uSun));
  if (night > 0.0 && !sea && st < 2.5) {
    float pop = tr.z * 0.6 + 0.12;
    float dots = step(1.0 - pop * 0.32, h3(tid + 3.1)) * (0.6 + 0.4 * sin(uT * 2.0 + g * 40.0));
    vec3 bio = mix(vec3(0.25, 0.95, 0.8), vec3(0.75, 0.55, 1.0), step(0.6, g2));
    if (mine) bio = uVein; else if (st > 1.5) bio = uCreepVein;
    emit += bio * dots * night * 0.9;
    if (e < 0.06) emit += vec3(0.95, 0.7, 0.35) * step(0.78, g) * night * 0.5;
  }
  // a glint on open water
  if (sea && ice < 0.5) col += vec3(0.55, 0.6, 0.55) * pow(max(0.0, dot(reflect(-uSun, N), normalize(cameraPosition - vWp))), 40.0) * (1.0 - night);
  vec3 c = col * l;
  // atmospheric haze toward the limb, warm along the terminator
  float fres = pow(1.0 - max(0.0, dot(Ns, normalize(cameraPosition - vWp))), 3.0);
  float term = smoothstep(-0.25, 0.1, dot(Ns, uSun)) * (1.0 - smoothstep(0.1, 0.45, dot(Ns, uSun)));
  c = mix(c, mix(uAir, vec3(1.0, 0.55, 0.3), term * 0.7) * max(0.15, dot(Ns, uSun) + 0.3), fres * 0.55 * (1.0 - night * 0.7));
  gl_FragColor = vec4(c + emit, 1.0);
  gNormal = vec4(Ns * 0.5 + 0.5, 1.0 + (dot(emit, emit) > 0.08 ? 32.0 : 0.0));
}`;

// ------------------------------------------------------------------------------------------------ clouds
const CLOUD_FRAG = /* glsl */`
${GN_DECL}
${NOISE3}
uniform float uT, uG, uAsc; uniform vec3 uSun;
varying vec3 vP; varying vec3 vNw;
float cloudAt(vec3 n) {
  vec3 q = n * 3.1 + vec3(uT * 0.011, 0.0, uT * 0.006);
  float c = fbm(q) * 0.75 + vn(n * 9.0 - vec3(uT * 0.02, 0.0, 0.0)) * 0.25;
  return smoothstep(0.52, 0.66, c) * (0.55 + 0.45 * smoothstep(0.2, 0.7, abs(n.y)));
}
void main(){
  vec3 n0 = normalize(vP);
  vec3 tid = floor(n0 * uG);
  vec3 n = normalize(tid / uG + 0.5 / uG);
  float c = cloudAt(n) * (uAsc > 0.5 ? 0.5 : 1.0);
  if (c < 0.05 || bayer4(gl_FragCoord.xy) > c * 1.15) discard;
  vec3 N = normalize(vNw);
  float l = max(0.0, dot(N, uSun));
  float lit = floor((0.18 + l * 0.95) * 5.0) / 5.0;
  // thick cores shade grey underneath; the night side keeps a faint moonlit blue
  vec3 col = mix(vec3(0.62, 0.66, 0.74), vec3(0.97, 0.97, 0.95), smoothstep(0.4, 0.95, c) * 0.5 + 0.5) * lit + vec3(0.03, 0.04, 0.07);
  gl_FragColor = vec4(col, 1.0);
  gNormal = vec4(N * 0.5 + 0.5, 0.0);
}`;
const SHELL_VERT = /* glsl */`
varying vec3 vP; varying vec3 vNw;
void main(){ vP = normalize(position); vNw = normalize(mat3(modelMatrix) * vP); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// ------------------------------------------------------------------------------------------------ atmosphere
const ATMO_FRAG = /* glsl */`
${GN_DECL}
uniform vec3 uCol, uSun; uniform float uR;
varying vec3 vNw; varying vec3 vWp; varying vec3 vC;
void main(){
  // Rayleigh-ish limb: thickest just outside the surface, blue on the day side, amber at the terminator
  vec3 V = normalize(cameraPosition - vWp);
  vec3 toC = vC - cameraPosition;
  float b = dot(toC, -V);
  float d = length(toC + V * b) / uR;
  if (d < 0.985) discard;
  float h = (d - 1.0) / 0.11;
  float dens = exp(-max(0.0, h) * 3.2) * smoothstep(0.985, 1.005, d);
  vec3 P = normalize(cameraPosition + (-V) * b - vC);
  float sd = dot(P, uSun);
  float day = smoothstep(-0.35, 0.25, sd);
  float term = smoothstep(-0.35, -0.05, sd) * (1.0 - smoothstep(-0.05, 0.35, sd));
  vec3 col = mix(uCol * 0.18, uCol, day) + vec3(1.0, 0.5, 0.25) * term * 0.9;
  float q = floor(dens * 7.0) / 7.0;
  gl_FragColor = vec4(col * q * 1.25, 1.0);
  gNormal = vec4(0.0);
}`;
const ATMO_VERT = /* glsl */`
varying vec3 vNw; varying vec3 vWp; varying vec3 vC;
void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWp = wp.xyz; vC = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; vNw = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`;

// ------------------------------------------------------------------------------------------------ moon
const MOON_FRAG = /* glsl */`
${GN_DECL}
${NOISE3}
uniform vec3 uSun;
varying vec3 vP; varying vec3 vNw;
void main(){
  vec3 n0 = normalize(vP), tid = floor(n0 * 40.0), n = normalize(tid / 40.0 + 0.5 / 40.0);
  float g = h3(tid);
  // maria and craters: rims lit toward the sun, floors in shade
  float mar = smoothstep(0.45, 0.6, fbm(n * 2.3 + 4.0));
  vec3 col = mix(vec3(0.66, 0.64, 0.62), vec3(0.42, 0.42, 0.46), mar) * (0.9 + g * 0.12);
  vec3 N = normalize(vNw);
  float cr = 0.0;
  for (int i = 0; i < 3; i++) {
    float s = 5.0 + float(i) * 6.0;
    vec3 c = floor(n * s) + 0.5; vec3 o = (vec3(h3(c), h3(c + 1.3), h3(c + 2.7)) - 0.5) * 0.8;
    float d = length(n * s - c - o);
    float r = 0.18 + h3(c + 9.0) * 0.22;
    if (h3(c + 5.0) > 0.55 && d < r) cr = d / r;
  }
  if (cr > 0.0) col *= cr > 0.8 ? 1.18 : 0.72;
  float l = floor((max(0.0, dot(N, uSun)) * 1.1 + 0.06) * 6.0) / 6.0 + 0.04;
  gl_FragColor = vec4(col * l, 1.0);
  gNormal = vec4(N * 0.5 + 0.5, 1.0);
}`;

// ------------------------------------------------------------------------------------------------ build
const linC = (hex: number) => new THREE.Color(hex);
const mix = (a: number, b: number, t: number) => linC(a).lerp(linC(b), t);

export function makeGlobe(p: Planet, radius = 1, opts: { ascended?: boolean; orbit?: boolean } = {}): Globe {
  const pal = PALETTES.find((x) => x.key === p.palKey) ?? PALETTES[0];
  const C = Array.from({ length: MAXR }, (_, i) => new THREE.Vector3(...(p.regions[i]?.c ?? [0, 1, 0])));
  const BI = Array.from({ length: MAXR }, (_, i) => Math.max(0, BIOMES.indexOf(p.regions[i]?.biome ?? 'meadow')));
  const ST = new Array(MAXR).fill(0);
  const seed = new THREE.Vector3(((p.seed * 0.137) % 50) + 3, ((p.seed * 0.311) % 50) + 7, ((p.seed * 0.071) % 50) + 11);
  // biome ground / detail colours, drawn from the world's palette so the planet matches the regions on it
  const f = pal.foliage;
  const BA = [
    mix(pal.grass, BIOME_COL.meadow, 0.3), mix(f[1] ?? pal.grass, 0x1e3a22, 0.45), mix(pal.grassDry, BIOME_COL.savanna, 0.35), mix(pal.grass, pal.mud, 0.45), mix(pal.grass, pal.rock, 0.45),
    mix(pal.snow, pal.rock, 0.35), mix(pal.sand, BIOME_COL.desert, 0.3), mix(pal.crystal, pal.rock, 0.55), mix(pal.basalt, 0x4a4240, 0.4), mix(pal.grass, BIOME_COL.coast, 0.4),
  ];
  const BB = [
    mix(f[0] ?? pal.grass, 0x1a3a1c, 0.35), mix(f[2] ?? f[0], 0x163020, 0.25), mix(f[3] ?? f[0], pal.grassDry, 0.4), mix(f[4] ?? f[0], 0x223a2a, 0.4), mix(f[5] ?? f[0], 0x2a3a2a, 0.45),
    mix(pal.rock, 0x3a4448, 0.4), mix(pal.sand, 0xa07040, 0.4), linC(pal.crystal), mix(pal.basalt, 0x1a1414, 0.5), mix(f[6] ?? f[0], 0x1e3a2a, 0.35),
  ];
  // land bias, mountains, forest cover per biome
  const BR = [[0.12, 0.6, 0.45], [0.16, 0.5, 0.95], [0.12, 0.4, 0.18], [-0.02, 0.15, 0.4], [0.2, 1.3, 0.3], [0.1, 0.8, 0.05], [0.12, 0.5, 0.0], [0.14, 1.0, 0.05], [0.12, 1.1, 0.02], [0.0, 0.4, 0.35]].map((v) => new THREE.Vector3(...v));
  const rival = RIVALS[p.seed % RIVALS.length];
  const G = radius < 0.5 ? 70 : 180;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uC: { value: C }, uBi: { value: BI }, uSt: { value: ST }, uN: { value: p.regions.length }, uHover: { value: -1 }, uT: { value: 0 }, uSeed: { value: seed },
      uBA: { value: BA }, uBB: { value: BB }, uBR: { value: BR }, uR: { value: radius }, uRelief: { value: 0.03 }, uG: { value: G },
      uSun: { value: new THREE.Vector3(-0.78, 0.38, 0.5).normalize() }, uMoss: { value: new THREE.Color(VEYR.moss) }, uVein: { value: new THREE.Color(VEYR.vein) },
      uCreep: { value: new THREE.Color(rival.creep) }, uCreepVein: { value: new THREE.Color(rival.vein) },
      uSea: { value: linC(pal.water).lerp(linC(0x1e4256), 0.35) }, uSeaDeep: { value: linC(pal.waterDeep).lerp(linC(0x081a2c), 0.5) }, uShelf: { value: linC(pal.water).lerp(linC(0x9ae0d0), 0.35) },
      uSnow: { value: linC(pal.snow) }, uRock: { value: linC(pal.rock) }, uSand: { value: linC(pal.sand) }, uAir: { value: linC(0x8ab8e0) },
      uAsc: { value: opts.ascended ? 1 : 0 },
    },
    vertexShader: SURF_VERT,
    fragmentShader: SURF_FRAG,
  });
  (mat as any).__gb = true;
  const detail = radius < 0.5 ? 18 : 72;
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, detail), mat);
  mesh.name = 'globe';
  // clouds: a dithered pixel shell drifting above the relief
  const cloudMat = new THREE.ShaderMaterial({ uniforms: { uT: mat.uniforms.uT, uG: { value: G * 0.75 }, uAsc: mat.uniforms.uAsc, uSun: mat.uniforms.uSun }, vertexShader: SHELL_VERT, fragmentShader: CLOUD_FRAG });
  (cloudMat as any).__gb = true;
  const clouds = new THREE.Mesh(new THREE.IcosahedronGeometry(radius * 1.045, radius < 0.5 ? 10 : 36), cloudMat);
  clouds.name = 'globe-clouds';
  // the limb
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.12, 64, 40), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    uniforms: { uCol: { value: new THREE.Color(opts.ascended ? VEYR.vein : 0x8ab0d0) }, uSun: mat.uniforms.uSun, uR: { value: radius } },
    vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG,
  }));
  atmo.name = 'globe-atmo';
  const group = new THREE.Group(); group.add(mesh, clouds, atmo);
  if (opts.orbit) addOrbiters(group, radius, mat, mesh);
  const g: Globe = {
    group, mesh, mat, atmo,
    refresh() { p.regions.forEach((r, i) => { ST[i] = r.state === 'veyr' ? 1 : r.state === 'rival' ? 2 : r.state === 'lost' ? 3 : 0; }); },
    setHover(i) { mat.uniforms.uHover.value = i; },
    pick(ray) {
      const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
      const lr = ray.clone().applyMatrix4(inv);
      const hit = lr.intersectSphere(new THREE.Sphere(new THREE.Vector3(), radius * 1.01), new THREE.Vector3());
      if (!hit) return -1;
      return regionOf(hit.normalize(), C, p.regions.length, seed);
    },
  };
  g.refresh();
  return g;
}

/** the same warped Voronoi as the shader, so a click lands on the region drawn under the cursor */
function regionOf(n: THREE.Vector3, C: THREE.Vector3[], count: number, seed: THREE.Vector3) {
  const w = new THREE.Vector3(vnJs(n.x * 9 + seed.x, n.y * 9 + seed.y, n.z * 9 + seed.z), vnJs(n.x * 9 + seed.x + 31.7, n.y * 9 + seed.y + 31.7, n.z * 9 + seed.z + 31.7), vnJs(n.x * 9 + seed.x + 63.1, n.y * 9 + seed.y + 63.1, n.z * 9 + seed.z + 63.1));
  w.subScalar(0.5).multiplyScalar(0.09).add(n);
  let best = -1, bd = 9;
  for (let i = 0; i < count; i++) { const d = w.distanceTo(C[i]); if (d < bd) { bd = d; best = i; } }
  return best;
}
const fr = (v: number) => v - Math.floor(v);
function h3Js(x: number, y: number, z: number) {
  x = fr(x * 0.3183099 + 0.1) * 17; y = fr(y * 0.3183099 + 0.1) * 17; z = fr(z * 0.3183099 + 0.1) * 17;
  return fr(x * y * z * (x + y + z));
}
function vnJs(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const L = (a: number, b: number, t: number) => a + (b - a) * t;
  return L(L(L(h3Js(ix, iy, iz), h3Js(ix + 1, iy, iz), fx), L(h3Js(ix, iy + 1, iz), h3Js(ix + 1, iy + 1, iz), fx), fy),
    L(L(h3Js(ix, iy, iz + 1), h3Js(ix + 1, iy, iz + 1), fx), L(h3Js(ix, iy + 1, iz + 1), h3Js(ix + 1, iy + 1, iz + 1), fx), fy), fz);
}

/** a small cratered moon on a wide orbit, and the U.S.P.C. survey satellite on a low inclined one; both orbit in
 *  the world frame (dragging the globe turns the planet, not the sky) and keep out of the camera's way */
function addOrbiters(group: THREE.Group, R: number, gm: THREE.ShaderMaterial, planet: THREE.Mesh) {
  const uT = gm.uniforms.uT, uSun = gm.uniforms.uSun;
  const moonMat = new THREE.ShaderMaterial({ uniforms: { uSun }, vertexShader: SHELL_VERT, fragmentShader: MOON_FRAG });
  (moonMat as any).__gb = true;
  const moon = new THREE.Mesh(new THREE.IcosahedronGeometry(R * 0.15, 6), moonMat);
  moon.name = 'globe-moon';
  const sat = satellite(R, uSun);
  group.add(moon, sat);
  const wp = new THREE.Vector3(), cpos = new THREE.Vector3(), c = new THREE.Vector3(), ahead = new THREE.Vector3();
  const place = (o: THREE.Object3D, cam: THREE.Camera, D: number, w: number, inc: number, ph: number, avoid: boolean) => {
    const a = (uT.value as number) * w + ph;
    c.setFromMatrixPosition(group.matrixWorld);
    wp.set(Math.cos(a) * D, Math.sin(a) * Math.sin(inc) * D, Math.sin(a) * Math.cos(inc) * D);
    // never between the camera and the planet: the near side of the orbit swings behind
    cam.getWorldPosition(cpos);
    const toCam = cpos.sub(c).normalize(), along = wp.dot(toCam);
    if (avoid && along > D * 0.3) wp.addScaledVector(toCam, -(along - D * 0.3) * 2);
    o.position.copy(group.worldToLocal(wp.add(c)));
    return a;
  };
  planet.onBeforeRender = (_r, _s, cam) => {
    const t = uT.value as number;
    place(moon, cam, R * 3.3, 0.035, 0.42, 2.0, true);
    moon.rotation.y = t * 0.02;
    moon.updateMatrixWorld();
    const a = place(sat, cam, R * 1.42, 0.16, 0.62, 0.7, false);
    // fly nose-first along the orbit
    ahead.set(-Math.sin(a), Math.cos(a) * Math.sin(0.62), Math.cos(a) * Math.cos(0.62));
    sat.updateMatrixWorld();
    sat.lookAt(sat.getWorldPosition(wp).add(ahead));
    sat.updateMatrixWorld(true);
    (sat.userData.blink as THREE.IUniform).value = Math.sin(t * 4.2) > 0.6 ? 1 : 0;
  };
}
/** self-lit flat-shaded parts (the planet scene has no lights): colour, sun, optional glow */
function selfLit(col: number, uSun: THREE.IUniform, glow?: THREE.IUniform, emit = 0) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(col) }, uSun, uGlow: glow ?? { value: 0 }, uEm: { value: new THREE.Color(emit) } },
    vertexShader: 'varying vec3 vWp; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWp = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }',
    fragmentShader: GN_DECL + `uniform vec3 uCol, uSun, uEm; uniform float uGlow; varying vec3 vWp;
void main(){ vec3 N = normalize(cross(dFdx(vWp), dFdy(vWp))); float l = floor((max(0.0, dot(N, uSun)) * 1.1 + 0.22) * 5.0) / 5.0;
  vec3 e = uEm + uCol * uGlow * 3.0;
  gl_FragColor = vec4(uCol * l + e, 1.0); gNormal = vec4(N * 0.5 + 0.5, 1.0 + (dot(e, e) > 0.05 ? 32.0 : 0.0)); }`,
  });
  (m as any).__gb = true;
  return m;
}
function satellite(R: number, uSun: THREE.IUniform) {
  const s = R * 0.022, g = new THREE.Group();
  g.name = 'globe-satellite';
  const hull = selfLit(0xd8d2c4, uSun), gold = selfLit(0xc89a3a, uSun), grey = selfLit(0x9a9a9a, uSun), white = selfLit(0xe8e4dc, uSun);
  const cell = selfLit(0x24345e, uSun, undefined, 0x0a1430);
  g.add(new THREE.Mesh(new THREE.BoxGeometry(s * 1.2, s * 1.0, s * 1.8), hull));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(s * 1.25, s * 0.25, s * 1.85), gold));
  // solar wings: dark blue cells on a pale frame
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(s * 0.9, s * 0.1, s * 0.1), grey); arm.position.x = side * s * 1.0; g.add(arm);
    for (let k = 0; k < 3; k++) { const w = new THREE.Mesh(new THREE.BoxGeometry(s * 1.1, s * 0.05, s * 1.4), cell); w.position.x = side * (s * 1.9 + k * s * 1.2); g.add(w); }
  }
  const dish = new THREE.Mesh(new THREE.ConeGeometry(s * 0.7, s * 0.4, 10, 1, true), white); dish.rotation.x = Math.PI / 2; dish.position.z = -s * 1.2; g.add(dish);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.04, s * 0.04, s * 1.2, 4), grey); ant.position.y = s * 0.9; g.add(ant);
  const blinkU = { value: 0 };
  const blink = new THREE.Mesh(new THREE.SphereGeometry(s * 0.16, 6, 4), selfLit(0xff4030, uSun, blinkU)); blink.position.y = s * 1.5; g.add(blink);
  g.userData.blink = blinkU;
  return g;
}

// ------------------------------------------------------------------------------------------------ sky
/** a starfield shell with a faint pixel nebula behind it (G-buffer safe) */
export function stars(n = 1400, R = 60) {
  const group = new THREE.Group();
  const p = new Float32Array(n * 3), c = new Float32Array(n * 3), sz = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(R * (0.8 + Math.random() * 0.4));
    p.set([v.x, v.y, v.z], i * 3);
    const k = 0.35 + Math.random() * 0.65, t = Math.random();
    // most stars white, some blue-white, some amber, a few red
    const col = t < 0.15 ? [0.75, 0.85, 1] : t < 0.3 ? [1, 0.85, 0.6] : t < 0.36 ? [1, 0.55, 0.45] : [0.95, 0.95, 0.92];
    c.set([k * col[0], k * col[1], k * col[2]], i * 3);
    sz[i] = Math.random() < 0.06 ? 3 : Math.random() < 0.3 ? 2 : 1;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.setAttribute('size', new THREE.BufferAttribute(sz, 1));
  const uT = { value: 0 };
  const m = new THREE.ShaderMaterial({
    uniforms: { uT },
    vertexShader: 'attribute vec3 color; attribute float size; uniform float uT; varying vec3 vC; void main(){ float tw = 0.75 + 0.25 * sin(uT * (1.5 + fract(position.x * 7.1) * 3.0) + position.y); vC = color * (size > 2.5 ? 1.6 : tw); gl_PointSize = size; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: GN_DECL + 'varying vec3 vC; void main(){ gl_FragColor = vec4(vC, 1.0); gNormal = vec4(0.0); }',
  });
  (m as any).__gb = true;
  const pts = new THREE.Points(g, m);
  pts.onBeforeRender = () => { uT.value = performance.now() / 1000; };
  // the nebula: two drifting colour clouds, banded and dithered into pixels
  const neb = new THREE.Mesh(new THREE.SphereGeometry(R * 1.35, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uA: { value: new THREE.Color(0x3a2a6a) }, uB: { value: new THREE.Color(0x174a5a) }, uS: { value: Math.random() * 40 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: GN_DECL + NOISE3 + `uniform vec3 uA, uB; uniform float uS; varying vec3 vD;
void main(){
  vec3 d = normalize(vD);
  float band = exp(-pow(dot(d, normalize(vec3(0.3, 1.0, 0.2))) * 2.6, 2.0));
  float a = fbm(d * 2.4 + uS) , b = fbm(d * 3.1 - uS * 0.7 + 4.0);
  float k = band * smoothstep(0.42, 0.75, a);
  float k2 = band * smoothstep(0.48, 0.8, b) * 0.8;
  float dust = smoothstep(0.55, 0.7, fbm(d * 6.0 + uS * 1.3)) * band;
  vec3 col = uA * k + uB * k2;
  col *= 1.0 - dust * 0.7;
  float q = floor(length(col) * 18.0 + bayer4(gl_FragCoord.xy) * 0.9) / 18.0;
  gl_FragColor = vec4(normalize(col + 1e-4) * q * 0.55, 1.0);
  gNormal = vec4(0.0);
}`,
  }));
  (neb.material as any).__gb = true;
  neb.renderOrder = -10;
  group.add(neb, pts);
  return group;
}
