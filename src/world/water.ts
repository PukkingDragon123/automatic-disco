// Water: the sea and the river ribbons.
// RIVERS (unchanged look): the bed is painted from the ground's own block texture, rippled and laced with caustic
// light, swallowed by the turquoise-to-deep-teal body as depth grows; a current of flow-aligned streaks and ripples
// scrolls downstream, white water runs along the banks, behind stones and through the rapids.
// THE SEA (src/ocean drives it): a Gerstner swell (ocean/waves.ts, heights from the wind and storms) on a tessellated
// surface that runs out to the horizon. The sea is drawn after every other opaque thing and reads a copy of the frame
// (ocean/grab.ts), so it refracts the real sea floor, reefs, kelp and fish beneath it; light is absorbed red-first along
// each view ray, so clear turquoise shallows over sand fall away to a deep teal-blue abyss. On the bed: caustics and
// sand ripples. On the surface: the sky and its clouds reflected (Fresnel), sun glitter (moon glitter at night) off
// pixel-jittered facets, subsurface light through backlit crests, whitecaps where crests fold, breakers rolling in along
// the coast's distance field (ocean/shore.ts) with foam lines and lace, red tide in bloodtide, bioluminescent foam and
// wakes in the dark. Seen from below: Snell's window, total internal reflection outside it. Shading is stepped
// (transmittance and light in bands, features on a world texel grid) so it sits with the pixel-art ground.
// Interactive water (fed by game/details.ts through WATER_FX): rings spreading from every entry, splash, footfall and
// drip, V-shaped Kelvin wakes with a foam lip round whatever wades or skims, raindrop rings while it rains. Water
// marks itself in the G-buffer with flag bit 16 (+32 where it glows) so the post pass can tell it from wet ground.
import * as THREE from 'three';
import type { Region } from './region';
import { GN_DECL } from '../gfx/gbuf';
import { SHADER_NOISE, FOW_FN } from './glsl';
import { VEYR } from './palette';
import { RAMPS, type RampName } from '../art/palette';
import { TS, TILE_M } from './blockTex';
import { Swell, GERSTNER_GLSL } from '../ocean/waves';
import { ShoreField, SHORE_GLSL } from '../ocean/shore';
import { SceneGrab } from '../ocean/grab';

/** the water's own pixel grid (texels per metre) as a GLSL literal: the ground's (blockTex.TS) up to 64 per metre, so
 *  shore lines, rings and foam stay a readable width at play zoom */
const TSF = Math.min(TS, 64).toFixed(1);
/** the open sea's feature grid (texels per metre): foam, glitter and ripples are drawn on it */
const SPF = '32.0';

const RIP_N = 24, WAKE_N = 6;
/** uniforms, rings and wakes, the bed: shared by the rivers and the sea */
const WATER_COMMON = /* glsl */`
uniform highp sampler2DArray uBlocks;
uniform sampler2D uHeight, uMat, uVis, uMoss, uFoamMap;
uniform float uN, uTime, uWater, uStage, uOutBed;
uniform float uLay[32];
uniform vec3 uShallow, uDeep, uFoam, uDark, uSky, uMossC;
uniform vec4 uRip[${RIP_N}];
uniform vec4 uWake[${WAKE_N}];
uniform float uWakeR[${WAKE_N}];
uniform float uRainW;
${SHADER_NOISE}
${FOW_FN}
/** a hand-drawn ring's "radius": an octagon, never a circle */
float octR(vec2 v) { v = abs(v); return max(max(v.x, v.y), (v.x + v.y) * 0.7071); }
/** rings break into arcs: a few legs of the octagon are left out (which ones depends on the ring) */
float legOn(vec2 v, float seed) { float a = atan(v.y, v.x) / 6.2832 + 0.5; return step(0.24, fract(sin(floor(a * 8.0 + 0.5) * 12.9898 + seed * 78.233) * 43758.5453)); }
/** rings and wakes at p: a height-like signal (crest > 0, trough < 0) and a foam amount */
vec2 interact(vec2 p, float t) {
  float h = 0.0, fm = 0.0;
  for (int i = 0; i < ${RIP_N}; i++) {
    vec4 r = uRip[i];
    if (r.w <= 0.0) continue;
    float age = r.z, d = octR(p - r.xy);
    // a short wave train behind a leading crest; it spreads, slows and flattens
    float x = d - (0.04 + age * (0.5 + r.w * 0.3));
    if (abs(x + 0.22) > 0.75) continue;
    float lam = 0.26 + age * 0.07;
    float a = r.w * exp(-age * 0.9) / (1.0 + d * 0.6);
    a *= legOn(p - r.xy, float(i) + floor(r.x * 7.0));
    h += cos(x * 6.2832 / lam) * exp(-pow((x + 0.2) / 0.3, 2.0)) * a;
    fm = max(fm, (1.0 - smoothstep(0.0, 0.05, abs(x))) * a * step(age, 0.35) * 2.0);
  }
  for (int i = 0; i < ${WAKE_N}; i++) {
    vec4 w = uWake[i];
    float sp = length(w.zw);
    if (sp < 0.04) continue;
    vec2 dir = -w.zw / sp, q = p - w.xy;
    float al = dot(q, dir), ac = dot(q, vec2(-dir.y, dir.x)), rad = uWakeR[i];
    float L = rad * 2.5 + sp * 1.8, k = min(1.0, sp / 1.1);
    if (al < -rad * 1.6 || al > L || abs(ac) > L * 0.5 + rad) continue;
    // the two arms of the V (~19.5 degrees), a crest with a trough just outside it
    float arm = abs(ac) - (al + rad * 0.7) * 0.36;
    float wd = 0.035 + max(0.0, al) * 0.04, fall = (1.0 - al / L) * step(-rad * 0.3, al);
    h += ((1.0 - smoothstep(0.0, wd, abs(arm))) - 0.6 * (1.0 - smoothstep(0.0, wd, abs(arm - wd * 2.0)))) * fall * k * 1.3;
    // churned water straight behind, and a foam lip hugging the body
    float trail = (1.0 - smoothstep(rad * 0.3, rad * 0.9, abs(ac))) * (1.0 - smoothstep(0.0, L * 0.45, al)) * step(0.0, al);
    float lip = (1.0 - smoothstep(0.0, 0.06, abs(octR(q) - rad * 1.05))) * legOn(q, float(i));
    fm = max(fm, max(trail * vn(vec2(ac * 9.0, (al + t * sp) * 5.0)) * 1.4, lip * (0.5 + 0.5 * k)) * k);
  }
  return vec2(h, fm);
}
float hAt(vec2 p) { if (p.x < 0.0 || p.y < 0.0 || p.x >= uN || p.y >= uN) return uOutBed; return texture2D(uHeight, (floor(p) + 0.5) / uN).r; }
float bedH(vec2 p) {
  vec2 q = p - 0.5; vec2 i = floor(q), f = q - i;
  return mix(mix(hAt(i), hAt(i + vec2(1.0, 0.0)), f.x), mix(hAt(i + vec2(0.0, 1.0)), hAt(i + vec2(1.0, 1.0)), f.x), f.y);
}
float caustic(vec2 p, float t) {
  float a = vn(p * 1.6 + vec2(t * 0.21, t * 0.13)), b = vn(p * 1.9 + vec2(-t * 0.17, t * 0.19) + 4.7);
  return smoothstep(0.86, 0.97, 1.0 - abs(a - b));
}
`;

/** the rivers' (and the sea's fallback) shading: the bed painted from the block texture */
const WATER_FN = /* glsl */`
/** wp: world xz; surf: surface height; flowK 0 (still) .. 1 (river); fuv: (across, along) metres; sp: flow speed */
vec3 waterShade(vec2 wp, float surf, float flowK, vec2 fuv, float sp) {
  vec2 px = floor(wp * ${TSF});
  vec2 p = (px + 0.5) / ${TSF};
  float t = uTime;
  float depth = max(0.0, surf - bedH(p));
  vec2 ia = interact(p, t);
  // ripples bend the view of the bed a little
  vec2 rip = vec2(vn(p * 2.3 + t * 0.4), vn(p * 2.3 - t * 0.35 + 9.0)) - 0.5 + ia.x * 0.35;
  if (flowK > 0.0) rip += vec2(0.0, vn(vec2(fuv.x * 3.0, (fuv.y - t * sp) * 1.4)) - 0.5) * flowK * 0.6;
  vec2 bp = p + rip * 0.12 * min(1.0, depth * 2.0);
  // the bed's material, looked up with the same wavy, grainy jitter the terrain uses (no square cell borders)
  vec2 mw = vec2(vn(bp * 0.55 + 3.1), vn(bp * 0.55 + 17.7)) - 0.5, mg = vec2(h2(px), h2(px + 31.0)) - 0.5;
  vec2 mp = bp + mw * 1.5 + mg * 0.55;
  float mid = floor(texture2D(uMat, (floor(clamp(mp, vec2(0.0), vec2(uN - 0.01))) + 0.5) / uN).r * 255.0 + 0.5);
  vec3 bed = texture(uBlocks, vec3(bp / ${TILE_M.toFixed(1)}, uLay[int(mid) * 2]), -0.35).rgb;
  // the bed under water: wet (darker), lit by a little caustic light
  bed *= 0.7 + caustic(bp, t) * 0.32 * exp(-depth * 0.9);
  // the bed seen through the water: red goes first, so a thin sheet only tints it and depth turns it to the body
  // colour (the water ramp's mid step in the shallows, its dark step deep down); never brighter than the bed
  vec3 T = exp(-(depth + 0.1) * vec3(3.2, 1.5, 1.2));
  vec3 body = mix(uShallow, uDeep, smoothstep(0.1, 2.4, depth));
  vec3 c = bed * T * 0.9 + body * (1.0 - T);
  // slow mottling and a faint sky reflection (more of it where the water is deep and dark)
  c *= 0.94 + (vn(p * 0.8 + vec2(t * 0.05, t * 0.03)) * 0.6 + vn(p * 2.1 - t * 0.07) * 0.4) * 0.1;
  c = mix(c, uSky, 0.05 + 0.07 * (1.0 - T.g));
  // the current
  float foam = 0.0;
  if (flowK > 0.0) {
    // streaks: long thin lines drawn out along the current, bright on their crests with a darker trough behind
    vec2 q = vec2(fuv.x * 2.6, (fuv.y - t * sp) * 0.42);
    float s = vn(q + vec2(vn(q * 0.6 + 3.0) * 1.8, 0.0));
    float streak = smoothstep(0.58, 0.63, s) * (1.0 - smoothstep(0.66, 0.72, s));
    float trough = smoothstep(0.4, 0.46, s) * (1.0 - smoothstep(0.5, 0.56, s));
    c = mix(c, mix(uShallow * 1.15, uFoam, 0.6), streak * 0.6 * flowK);
    c *= 1.0 - trough * 0.12 * flowK;
    // chop: short ripples riding the current
    float ch = vn(vec2(fuv.x * 6.0, (fuv.y - t * sp * 1.25) * 2.6));
    c *= 1.0 + (ch - 0.5) * 0.22 * flowK;
    if (ch > 0.8) c = mix(c, uShallow * 1.35 + 0.06, 0.3 * flowK);
    float edge = 1.0 - smoothstep(0.0, 0.07 + sp * 0.03, depth);
    float wake = texture2D(uFoamMap, p / uN).r;
    float rapid = smoothstep(1.2, 2.3, sp) * smoothstep(0.52, 0.72, vn(vec2(fuv.x * 3.5, (fuv.y - t * sp * 1.4) * 1.1)));
    float fn = vn(vec2(fuv.x * 7.0, (fuv.y - t * sp * 1.6) * 2.6));
    foam = max(max(edge * 0.75, wake), rapid) * (0.55 + fn * 0.9) * flowK;
  }
  // the rings and wakes: crisp light crests, darker troughs, white water where they break
  // (a darker trough line keeps them readable on pale shallows too)
  c *= 1.0 + clamp(ia.x, -1.0, 1.0) * 0.12;
  if (ia.x > 0.2) c = mix(c, uFoam, 0.45);
  else if (ia.x < -0.2) c = mix(c, uDeep, 0.4);
  foam = max(foam, ia.y);
  // rain: little rings popping all over the surface
  if (uRainW > 0.01) {
    vec2 q = p * 1.6, ci = floor(q), f = fract(q) - 0.5 - (vec2(h2(ci), h2(ci + 5.3)) - 0.5) * 0.5;
    float tc = t * 1.4 + h2(ci + 2.7), ph = fract(tc);
    float ring = (1.0 - step(0.035, abs(octR(f) - ph * 0.36))) * step(h2(ci + floor(tc) * 1.3), uRainW) * step(ph, 0.85) * legOn(f, h2(ci));
    c = mix(c, ph < 0.45 ? uFoam : uDeep, ring * 0.6);
    c *= 1.0 - uRainW * 0.1;
  }
  // shoreline: a one-texel broken line where the water's depth crosses a lapping contour (never a wash over thin water)
  float lap = 0.5 + 0.5 * sin(t * 1.3 + vn(p * 0.7) * 6.0), thr = 0.012 + lap * 0.03;
  float dR = surf - bedH(p + vec2(1.0 / ${TSF}, 0.0)), dD = surf - bedH(p + vec2(0.0, 1.0 / ${TSF}));
  float shoreL = depth >= thr && (dR < thr || dD < thr) || depth < thr && (dR >= thr || dD >= thr) ? 1.0 : 0.0;
  float rim = shoreL * step(0.28, h2(floor(p * 4.0)));
  foam = max(foam, rim * 0.8);
  if (foam > 0.5) c = mix(c, uFoam, foam > 0.75 ? 0.7 : 0.4);
  // glints: sparse twinkles, rarer bright sun sparkles on open water
  float g1 = h2(px + floor(t * 2.2 + h2(px) * 9.0) * 3.7);
  float g2 = h2(floor(px / 2.0) * 1.7 + floor(t * 1.4 + h2(floor(px / 2.0)) * 5.0));
  float gk = 1.0 - smoothstep(0.6, 2.5, depth) * 0.9;
  gk *= 1.0 - flowK * 0.55;
  if (g1 > 1.0 - 0.01 * gk) c = mix(c, uFoam, 0.35);
  else if (g1 > 1.0 - 0.035 * gk) c = mix(c, uShallow, 0.3);
  if (g2 > 0.995 && depth > 0.25) c = mix(c, uFoam * 1.4, 0.7);
  // Veyr moss / rival creep reaching the water: floating mats along the margins
  vec4 cov = texture2D(uMoss, p / uN);
  if (cov.r > 0.55 + h2(px) * 0.25 && depth < 0.6) c = mix(c, uMossC, 0.45);
  return applyFow(c, vec3(wp.x, 0.0, wp.y));
}
`;

/** the open sea */
const SEA_UNI = /* glsl */`
${GERSTNER_GLSL}
${SHORE_GLSL}
uniform sampler2D uGrab, uGrabD;
uniform float uGrabOn, uNear, uFar;
uniform vec2 uRes;
uniform mat4 uInvProj, uCamWorld;
uniform vec3 uSunDir, uSunCol, uSkyTop, uSkyHor, uCloudCol, uSssC, uBodyS, uBodyM, uBodyD, uFoamHi, uFoamLo, uGlowC, uRedS, uRedD;
uniform vec2 uWindV;
uniform float uCloud, uWindK, uBio, uRed, uTurb, uSunK, uOcean;
float linZ(float d) { float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
/** the colour the water itself scatters, by how much of it the light crosses: turquoise, teal, deep teal-blue (banded) */
vec3 bodyAt(float path) { float b = floor(clamp(path / 11.0, 0.0, 1.0) * 6.0 + 0.5) / 6.0; return mix(mix(uBodyS, uBodyM, smoothstep(0.0, 0.45, b)), uBodyD, smoothstep(0.45, 1.0, b)); }
vec3 worldAt(vec2 uv, float d) { vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); v /= v.w; return (uCamWorld * v).xyz; }
/** the sky in a direction: a banded gradient, drifting clouds, the sun's halo */
vec3 skyCol(vec3 d) {
  float h = clamp(d.y, 0.0, 1.0);
  float hb = floor(pow(h, 0.55) * 6.0 + 0.5) / 6.0;
  vec3 c = mix(uSkyHor, uSkyTop, hb);
  vec2 cp = d.xz / (d.y + 0.14) * 0.55 + uWindV * uTime * 0.0035;
  float cl = vn(cp * 1.4) * 0.62 + vn(cp * 3.3 + 7.1) * 0.38;
  float cov = smoothstep(0.78 - uCloud * 0.5, 0.86 - uCloud * 0.5, cl) * smoothstep(0.0, 0.08, d.y);
  c = mix(c, uCloudCol * (0.8 + 0.25 * step(0.5, vn(cp * 2.0 + 3.0))), cov * 0.85);
  float sd = max(dot(d, uSunDir), 0.0);
  c += uSunCol * (pow(sd, 6.0) * 0.12 + step(0.9975, sd) * 1.6) * (1.0 - cov * 0.7);
  return c;
}
`;

// ---------------------------------------------------------------------------------------------- vertex shaders
// the seasonal water stage (eco.level): the sea rises half as far as the rivers do
const VERT_SEA = /* glsl */`
uniform float uStage, uWater, uN, uOutBed, uTime;
uniform sampler2D uHeight;
attribute float aCell;
${GERSTNER_GLSL}
varying vec3 vWp; varying vec2 vRest; varying float vWave; varying float vDepth;
float hAtV(vec2 p) { if (p.x < 0.0 || p.y < 0.0 || p.x >= uN || p.y >= uN) return uOutBed; return texture2D(uHeight, (floor(p) + 0.5) / uN).r; }
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  w.y = uWater + uStage * 0.5;
  vec2 rest = w.xz;
  float depth = max(0.0, w.y - hAtV(rest));
  vec3 N; float crest;
  // waves too short for this cell of the grid are left to the fragment shader's normals
  vec3 d = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    vec4 a = uWv[i], b = uWq[i];
    float A = a.w * shoalK(depth, b.w) * smoothstep(aCell * 2.5, aCell * 5.0, b.w);
    if (A < 1e-5) continue;
    float th = a.z * dot(a.xy, rest) - b.x * uTime + b.y;
    d.xz += b.z * A * a.xy * cos(th); d.y += A * sin(th);
  }
  w.xyz += d;
  vWp = w.xyz; vRest = rest; vWave = d.y; vDepth = depth;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG_SEA = /* glsl */`
${GN_DECL}
${WATER_COMMON}
${WATER_FN}
${SEA_UNI}
varying vec3 vWp; varying vec2 vRest; varying float vWave; varying float vDepth;
void main() {
  float t = uTime;
  float surf = uWater + uStage * 0.5;
  // features sit on a world texel grid (in the swell's rest frame, so they ride the waves)
  vec2 px = floor(vRest * ${SPF});
  vec2 p = (px + 0.5) / ${SPF};
  float bed = bedH(p), depth = max(0.0, surf - bed);
  // the swell's normal and crest measure at this texel; short waves fade with distance (no shimmering far off)
  float fw = length(fwidth(vRest));
  vec3 N = vec3(0.0, 1.0, 0.0); float crest = 0.0;
  for (int i = 0; i < ${8}; i++) {
    vec4 a = uWv[i], b = uWq[i];
    float A = a.w * shoalK(depth, b.w) * (1.0 - smoothstep(4.0, 9.0, fw * a.z * 6.0));
    if (A < 1e-5) continue;
    float th = a.z * dot(a.xy, p) - b.x * t + b.y, s = sin(th), c = cos(th), kA = a.z * A;
    N.xz -= a.xy * kA * c; N.y -= b.z * kA * s; crest += b.z * kA * s;
  }
  // capillary chop on top: tiny ripples, sharper with the wind, fading with distance
  float near = 1.0 - smoothstep(0.08, 0.5, fw);
  // (three short wave trains crossing near the wind, their fronts bent by a slow warp: the cross-hatch of real ripples)
  vec2 wd = normalize(uWindV + vec2(1e-4, 0.0)), wq = p + (vec2(vn(p * 0.21), vn(p * 0.21 + 5.3)) - 0.5) * 2.4;
  vec2 chop = vec2(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i), an = (fi - 1.0) * 0.62 + 0.15 * sin(fi * 7.1);
    vec2 dd = vec2(wd.x * cos(an) - wd.y * sin(an), wd.x * sin(an) + wd.y * cos(an));
    float kk = 6.2832 / (0.55 + fi * 0.42), ph = dot(wq, dd) * kk - t * sqrt(9.81 * kk) * 0.6 + fi * 2.1;
    chop += dd * cos(ph) * (0.5 + 0.5 * vn(p * 0.5 + fi * 3.0)) / (1.0 + fi * 0.4);
  }
  chop *= (0.16 + uWindK * 0.3) * near;
  N = normalize(N + vec3(chop.x, 0.0, chop.y));
  vec2 ia = interact(p, t);
  vec3 sh = shoreAt(p);
  float sd = (p.x < 0.0 || p.y < 0.0 || p.x > uN || p.y > uN) ? 40.0 : sh.x;
  bool under = !gl_FrontFacing;
  vec3 V = normalize(cameraPosition - vWp), L = normalize(uSunDir);
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 col;
  float glow = 0.0;
  if (!under) {
    // ---------------- seen from above
    float NdV = max(dot(N, V), 0.0);
    float F = 0.04 + 0.96 * pow(1.0 - NdV, 4.0);
    F = floor(min(F, 0.92) * 8.0 + 0.5) / 8.0;
    vec3 R = reflect(-V, N); R.y = abs(R.y);
    vec3 sky = skyCol(R);
    // what lies beneath: the frame so far, bent by the surface; how far the view ray travels through water to it
    vec3 refr;
    float zW = linZ(gl_FragCoord.z);
    vec3 body = bodyAt(depth * 1.3);
    // red tide: drifting red-brown blooms over the body of the water
    float red = uRed * smoothstep(0.42, 0.62, vn(p * 0.045 + vec2(t * 0.004, -t * 0.003)) * 0.7 + vn(p * 0.16 + 3.0) * 0.3);
    body = mix(body, mix(uRedS, uRedD, smoothstep(0.8, 6.0, depth)), red);
    float bedDepth = depth;
    if (uGrabOn > 0.5) {
      float d0 = texture(uGrabD, uv).r;
      float th0 = max(0.0, linZ(d0) - zW);
      vec2 offPx = floor(N.xz * min(th0, 2.5) * 46.0 / max(zW, 1.0) * (uRes.y / 720.0) + 0.5);
      vec2 uv2 = uv + offPx / uRes;
      float d2 = texture(uGrabD, uv2).r;
      if (linZ(d2) < zW) { uv2 = uv; d2 = d0; }
      vec3 Pb = worldAt(uv2, d2);
      bool sky0 = d2 >= 0.99999;
      float path = sky0 ? 300.0 : distance(vWp, Pb);
      bedDepth = sky0 ? 60.0 : max(0.0, surf - Pb.y);
      vec3 bc = texture(uGrab, uv2).rgb;
      // light on the bed: caustics dancing in the shallows, sand ripples along the shore, dimmer and bluer with depth
      if (!sky0) {
        vec2 bq = (floor(Pb.xz * ${SPF}) + 0.5) / ${SPF};
        float ca = caustic(bq * 2.2, t * 1.6) * 0.7 + caustic(bq * 1.3 + 7.0, t * 1.2) * 0.45;
        bc *= 1.0 + floor(ca * 3.0) / 3.0 * 0.75 * exp(-bedDepth * 0.2) * uSunK * smoothstep(0.02, 0.3, bedDepth);
        float mid = floor(texture2D(uMat, (floor(clamp(bq, vec2(0.0), vec2(uN - 0.01))) + 0.5) / uN).r * 255.0 + 0.5);
        if (abs(mid - 4.0) < 0.5 && bedDepth > 0.15) {
          vec3 s2 = shoreAt(bq);
          float rp = dot(bq, s2.yz) * 2.6 + vn(bq * 0.35) * 3.0;
          float rr = fract(rp);
          bc *= rr < 0.18 ? 1.12 : rr < 0.42 ? 0.9 : 1.0;
        }
        bc *= exp(-bedDepth * vec3(0.3, 0.09, 0.06));
      }
      vec3 sig = vec3(0.85, 0.16, 0.09) * uTurb;
      vec3 T = exp(-path * sig);
      T = floor(T * 6.0 + 0.5) / 6.0;
      vec3 bd = mix(bodyAt(path), mix(uRedS, uRedD, smoothstep(0.8, 6.0, path)), red);
      refr = bc * T * vec3(0.8, 1.0, 1.12) + bd * uSunK * (1.0 - T);
    } else {
      refr = waterShade(vWp.xz, surf, 0.0, vec2(0.0), 0.0);
      refr = mix(refr, body * uSunK, smoothstep(2.0, 10.0, depth));
    }
    col = mix(refr, sky, F);
    // subsurface light through the backlit crests, and the lit faces of the waves
    float hk = clamp(vWave / max(0.05, uSwellH * 0.5) * 0.5 + 0.5, 0.0, 1.0);
    float sss = pow(clamp(dot(V, -normalize(L + N * 0.45)), 0.0, 1.0), 3.0) * hk * hk;
    col += uSssC * floor(sss * 4.0 + 0.3) / 4.0 * (0.25 + 0.6 * uSunK) * smoothstep(0.4, 2.5, depth);
    // ---- foam
    float foam = 0.0;
    // whitecaps: crests folding over in the wind, broken into drawn clumps that trail behind the crest
    vec2 fq = p * vec2(1.3, 1.3) + uWindV * t * 0.12;
    float fpat = vn(fq * 2.1) * 0.6 + vn(fq * 5.3 + 2.0) * 0.4;
    float thr = mix(0.97, 0.42, uWindK);
    foam = max(foam, smoothstep(thr, thr + 0.12, crest + (fpat - 0.5) * 0.45) * step(1.2, depth));
    // breakers: lines rolling in along the coast's contours, standing up in the shallows, breaking into foam
    if (sd < 14.0 && sd > -0.5) {
      float jitter = vn(p * vec2(0.09, 0.09) + 11.0) * 1.3;
      float ph = sd / 3.4 + t * 0.21 * (0.8 + uWindK * 0.5) + jitter;
      float band = fract(ph), id = floor(ph);
      float zone = smoothstep(9.0, 2.5, sd) * smoothstep(-0.5, 0.2, sd);
      // the face before the crest steepens (darker), the crest line bright, the foam trailing seaward
      float alongN = vn(vec2(dot(p, vec2(-sh.z, sh.y)) * 0.6, id * 7.3));
      float lineOn = step(0.32, alongN);
      float crestL = (1.0 - smoothstep(0.0, 0.045, band)) * lineOn;
      float trail = smoothstep(0.42, 0.0, band) * lineOn * step(0.5 - band * 0.6, fpat);
      col *= 1.0 - smoothstep(0.86, 0.99, band) * 0.18 * zone;
      foam = max(foam, max(crestL, trail * 0.75) * zone * smoothstep(3.6, 1.2, depth + 0.3) * (0.7 + uWindK * 0.4));
      // lace: the spent foam spreading in a net close in to the beach
      float lace = smoothstep(2.2, 0.2, sd) * step(0.62, vn(p * 3.2 + vec2(t * 0.3, 0.0)) * 0.5 + vn(p * 6.1 - t * 0.2) * 0.5);
      foam = max(foam, lace * 0.7);
    }
    foam = max(foam, ia.y);
    col *= 1.0 + clamp(ia.x, -1.0, 1.0) * 0.14;
    // rain: rings popping all over
    if (uRainW > 0.01) {
      vec2 q = p * 1.6, ci = floor(q), f = fract(q) - 0.5 - (vec2(h2(ci), h2(ci + 5.3)) - 0.5) * 0.5;
      float tc = t * 1.4 + h2(ci + 2.7), ph = fract(tc);
      float ring = (1.0 - step(0.035, abs(octR(f) - ph * 0.36))) * step(h2(ci + floor(tc) * 1.3), uRainW) * step(ph, 0.85) * legOn(f, h2(ci));
      col = mix(col, ph < 0.45 ? uFoamHi * uSunK : uBodyD, ring * 0.5);
    }
    // foam in two tones (lit and shaded by the wave's slope), pink-tinged in a red tide
    if (foam > 0.45) {
      float lit = dot(N, L) * 0.5 + 0.5;
      vec3 fc = (foam > 0.72 && lit > 0.45 ? uFoamHi : uFoamLo) * (0.35 + 0.75 * uSunK);
      fc = mix(fc, uRedS * 1.6 + 0.04, red * 0.5);
      col = mix(col, fc, foam > 0.72 ? 0.92 : 0.62);
      glow = max(glow, uBio * (foam > 0.72 ? 1.0 : 0.6));
    }
    // bioluminescence: in the dark, every disturbance of the water lights up blue-green
    float dist = max(foam, max(ia.y, clamp(ia.x, 0.0, 1.0)));
    if (uBio > 0.01) {
      float spark = step(0.985 - dist * 0.1, h2(px * 0.5 + floor(t * 3.0 + h2(px) * 7.0)));
      float bio = max(dist, spark * smoothstep(0.2, 0.9, crest + 0.4));
      col += uGlowC * floor(bio * 3.0) / 3.0 * uBio * 1.6;
      glow = max(glow, uBio * step(0.3, bio));
    }
    // the sun (or the moon) on the water: a disc in the reflection and a path of glitter from pixel-sized facets
    vec2 gj = vec2(h2(px + floor(t * 6.0 + h2(px) * 11.0) * 1.7), h2(px * 1.3 + 4.1 + floor(t * 6.0 + h2(px + 2.0) * 11.0) * 2.3)) - 0.5;
    vec3 Ng = normalize(N + vec3(gj.x, 0.0, gj.y) * (0.16 + uWindK * 0.14));
    float gl0 = max(dot(reflect(-V, Ng), L), 0.0);
    float glit = step(0.994, gl0) + step(0.9985, max(dot(R, L), 0.0));
    col += uSunCol * min(glit, 1.0) * 2.4 * (1.0 - foam * 0.8);
    // floating mats where the Veyr's moss or a rival's creep reaches the water
    vec4 cov = texture2D(uMoss, p / uN);
    if (cov.r > 0.55 + h2(px) * 0.25 && depth < 0.6) col = mix(col, uMossC, 0.45);
    col = applyFow(col, vec3(vWp.x, 0.0, vWp.z));
  } else {
    // ---------------- seen from below: Snell's window, and the silver ceiling of total internal reflection outside it
    vec3 Nd = -N;
    vec3 I = -V;
    vec3 Tr = refract(I, Nd, 1.333);
    vec3 deep = uBodyD * (0.45 + 0.55 * uSunK);
    if (dot(Tr, Tr) < 0.5) {
      col = deep * (0.75 + 0.35 * vn(p * 0.8 + t * 0.2));
      // the edge of the window glimmers
      float c0 = dot(V, N);
      col += uSssC * smoothstep(0.62, 0.68, -c0) * 0.3 * uSunK;
    } else {
      vec3 s = skyCol(Tr);
      if (uGrabOn > 0.5) {
        vec2 uv2 = uv + floor(N.xz * 22.0 * (uRes.y / 720.0) + 0.5) / uRes;
        float d2 = texture(uGrabD, uv2).r;
        if (d2 < 0.99999 && linZ(d2) > linZ(gl_FragCoord.z) + 0.05) s = texture(uGrab, uv2).rgb;
      }
      col = mix(s, deep, 0.25) + uSunCol * step(0.985, max(dot(Tr, L), 0.0)) * 1.5;
      col += uSssC * smoothstep(0.55, 0.7, max(0.0, crest + 0.4)) * 0.2 * uSunK;
    }
    col += uGlowC * uBio * step(0.5, max(ia.y, 0.0)) * 1.2;
  }
  gl_FragColor = vec4(col, 1.0);
  gNormal = vec4(N * 0.5 + 0.5, glow > 0.25 ? 48.0 : 16.0);
}`;

const VERT_RIVER = /* glsl */`
attribute vec2 aFlow; attribute vec2 aSpeed;
uniform float uStage;
varying vec3 vWp; varying vec2 vFlow; varying vec2 vSpeed;
// rivers take the full stage, easing to the sea's half where the current fades into it at the mouth
void main() { vec4 w = modelMatrix * vec4(position, 1.0); w.y += uStage * mix(0.5, 1.0, aSpeed.y); vWp = w.xyz; vFlow = aFlow; vSpeed = aSpeed; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FRAG_RIVER = /* glsl */`
${GN_DECL}
${WATER_COMMON}
${WATER_FN}
varying vec3 vWp; varying vec2 vFlow; varying vec2 vSpeed;
void main() {
  // flow coordinates at the centre of this world pixel (so the current is pixel-snapped like everything else)
  vec2 wpS = (floor(vWp.xz * ${TSF}) + 0.5) / ${TSF};
  mat2 A = mat2(dFdx(vWp.xz), dFdy(vWp.xz)), Bm = mat2(dFdx(vFlow), dFdy(vFlow));
  vec2 fuv = vFlow;
  if (abs(determinant(A)) > 1e-10) fuv += Bm * inverse(A) * (wpS - vWp.xz);
  gl_FragColor = vec4(waterShade(vWp.xz, vWp.y, vSpeed.y, fuv, vSpeed.x), 1.0);
  gNormal = vec4(0.5, 1.0, 0.5, 16.0);
}`;

/** the interactive-water inputs every water material shares (written each frame by game/details.ts) */
export const WATER_FX = {
  /** rings: (x, z, age seconds, strength; 0 = unused) */
  uRip: { value: Array.from({ length: RIP_N }, () => new THREE.Vector4(0, 0, 0, 0)) },
  /** wakes: (x, z, vx, vz) of whatever moves through the water, and its radius */
  uWake: { value: Array.from({ length: WAKE_N }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uWakeR: { value: new Array(WAKE_N).fill(0.3) as number[] },
  /** raindrop rings 0..1 */
  uRainW: { value: 0 },
};
export const RIPPLES = RIP_N, WAKES = WAKE_N;

/** the planet's water drawn in the master palette: the water-like ramp nearest its own water colour */
function waterRamp(c: number) {
  const ch = (v: number) => [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  const [r0, g0, b0] = ch(c);
  let best: RampName = 'water', bd = Infinity;
  for (const k of ['water', 'teal', 'sage', 'slate', 'violet'] as RampName[]) {
    const r = RAMPS[k], [r1, g1, b1] = ch(r[Math.floor(r.length * 0.6)]), d = (r0 - r1) ** 2 + (g0 - g1) ** 2 + (b0 - b1) ** 2;
    if (d < bd) { bd = d; best = k; }
  }
  const r = RAMPS[best], L = r.length;
  return { shallow: r[L - 3], deep: r[1], foam: r[L - 1] };
}

function uniforms(R: Region, U: Record<string, THREE.IUniform>) {
  const pal = R.pal, wr = waterRamp(pal.water);
  return {
    ...WATER_FX,
    uBlocks: U.uBlocks, uHeight: U.uHeight, uMat: U.uMat, uVis: U.uVis, uMoss: U.uMoss, uN: U.uN, uTime: U.uTime, uWater: U.uWater, uStage: U.uStage, uLay: U.uLay, uDark: U.uDark,
    uShallow: { value: new THREE.Color(wr.shallow) }, uDeep: { value: new THREE.Color(wr.deep) }, uFoam: { value: new THREE.Color(wr.foam) },
    uSky: { value: new THREE.Color(RAMPS.sky[4]) }, uMossC: { value: new THREE.Color(VEYR.moss) },
    uFoamMap: { value: foamMap(R) },
    // the bed outside the map: the open sea runs deep past an ocean region's rim
    uOutBed: { value: R.oceanic ? R.water - 18 : -2 },
  };
}

/** white water behind stones standing in the current */
function foamMap(R: Region) {
  const N = R.N, d = new Uint8Array(N * N);
  for (const p of R.rocks) {
    if (p.kind !== 'river') continue;
    const ry = R.riverAt(p.x, p.z);
    if (ry <= 0 || p.y + p.sy < ry - 0.3) continue;
    const rad = Math.max(p.sx, p.sz) + 0.6;
    for (let z = Math.floor(p.z - rad); z <= Math.ceil(p.z + rad); z++) for (let x = Math.floor(p.x - rad); x <= Math.ceil(p.x + rad); x++) {
      if (!R.inside(x, z)) continue;
      const k = 1 - Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z) / rad;
      if (k > 0) d[z * N + x] = Math.max(d[z * N + x], Math.round(Math.min(1, k * 1.6) * 255));
    }
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}

/** the sea's own state: its swell, the coast field, the frame copy and the light it is shaded with (src/ocean writes
 *  it every frame; with no ocean driver the defaults are a calm day) */
export interface SeaState {
  swell: Swell; shore: ShoreField; grab: SceneGrab;
  U: Record<string, THREE.IUniform>;
}

/** grid lines for the sea surface: 1 m over the map and a margin, widening geometrically out to `far` metres */
function seaLines(N: number, far: number): number[] {
  const xs: number[] = [];
  for (let x = -24; x <= N + 24; x += 1) xs.push(x);
  let s = 1.5, x = -24;
  while (x > -far) { x -= s; s *= 1.22; xs.unshift(Math.max(-far, x)); }
  s = 1.5; x = N + 24;
  while (x < N + far) { x += s; s *= 1.22; xs.push(Math.min(N + far, x)); }
  return xs;
}

export function makeSea(R: Region, U: Record<string, THREE.IUniform>): THREE.Mesh {
  const N = R.N, far = R.oceanic ? 2400 : 220;
  const xs = seaLines(N, far), n = xs.length;
  const pos = new Float32Array(n * n * 3), cell = new Float32Array(n * n), idx: number[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i; pos[k * 3] = xs[i]; pos[k * 3 + 1] = R.water; pos[k * 3 + 2] = xs[j];
    cell[k] = Math.max(xs[Math.min(n - 1, i + 1)] - xs[Math.max(0, i - 1)], xs[Math.min(n - 1, j + 1)] - xs[Math.max(0, j - 1)]) * 0.5;
  }
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aCell', new THREE.BufferAttribute(cell, 1));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(N / 2, R.water, N / 2), far * 1.5);
  const swell = new Swell(R.seed);
  const shore = new ShoreField(R);
  const grab = new SceneGrab();
  const wr = waterRamp(R.pal.water);
  const C = (h: number) => new THREE.Color(h);
  const SU = {
    ...swell.U, ...grab.U,
    uShore: { value: shore.tex },
    uSunDir: { value: new THREE.Vector3(-0.5, 0.82, -0.32).normalize() }, uSunCol: { value: new THREE.Color(1.2, 1.05, 0.85) },
    uSkyTop: { value: C(RAMPS.sky[3]) }, uSkyHor: { value: C(RAMPS.sky[5]) }, uCloudCol: { value: C(RAMPS.snow[4]) },
    uSssC: { value: C(RAMPS.glowTeal[1]) },
    uBodyS: { value: C(R.oceanic ? RAMPS.water[5] : wr.shallow).lerp(C(RAMPS.sapphire[5]), R.oceanic ? 0.55 : 0.2) },
    uBodyM: { value: C(R.oceanic ? RAMPS.water[3] : wr.shallow).lerp(C(R.oceanic ? RAMPS.sapphire[3] : wr.deep), 0.45) },
    uBodyD: { value: C(R.oceanic ? RAMPS.water[1] : wr.deep).lerp(C(RAMPS.sapphire[1]), R.oceanic ? 0.6 : 0.3) },
    uFoamHi: { value: C(RAMPS.snow[5]) }, uFoamLo: { value: C(RAMPS.sky[4]) }, uGlowC: { value: C(RAMPS.glowTeal[3]) },
    uRedS: { value: C(RAMPS.coral[2]) }, uRedD: { value: C(RAMPS.blood[1]) },
    uWindV: { value: new THREE.Vector2(swell.main.x, swell.main.y) },
    uCloud: { value: 0.3 }, uWindK: { value: 0.3 }, uBio: { value: 0 }, uRed: { value: 0 }, uTurb: { value: R.oceanic ? 0.8 : 1.25 }, uSunK: { value: 1 }, uOcean: { value: R.oceanic ? 1 : 0 },
  };
  const m = new THREE.ShaderMaterial({ uniforms: { ...uniforms(R, U), ...SU }, vertexShader: VERT_SEA, fragmentShader: FRAG_SEA, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, m);
  mesh.name = 'water';
  // after every other opaque thing, so the copy it reads holds the sea floor and all that swims over it
  mesh.renderOrder = 50;
  mesh.frustumCulled = false;
  mesh.onBeforeRender = (renderer, _scene, camera) => { grab.grab(renderer, camera); };
  const st: SeaState = { swell, shore, grab, U: m.uniforms };
  mesh.userData.sea = st;
  return mesh;
}
/**
 * The sky the sea reflects, as a dome round the camera (shown when the view looks out toward the horizon: low test
 * cameras, a diving golem looking up; the RTS view never sees it). Drawn at the far plane so the post pass treats it as
 * the background.
 */
export function makeSkyDome(sea: THREE.Mesh): THREE.Mesh {
  const su = (sea.material as THREE.ShaderMaterial).uniforms;
  const m = new THREE.ShaderMaterial({
    uniforms: su, side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vD; void main() { vD = normalize((modelMatrix * vec4(position, 0.0)).xyz); vec4 p = projectionMatrix * viewMatrix * vec4(cameraPosition + vD * 1000.0, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `${GN_DECL}\nuniform float uTime, uN;\n${SHADER_NOISE}\n${SEA_UNI}\nvarying vec3 vD;\nvoid main() { vec3 d = normalize(vD); vec3 c = skyCol(vec3(d.x, max(d.y, 0.0), d.z)); if (d.y < 0.0) c = mix(c, uBodyD * uSunK, smoothstep(0.0, -0.08, d.y)); gl_FragColor = vec4(c, 1.0); gNormal = vec4(0.5, 1.0, 0.5, 0.0); }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), m);
  mesh.frustumCulled = false; mesh.renderOrder = -10; mesh.name = 'sky';
  return mesh;
}
/** the sea's state (swell, coast field, uniforms) from the terrain's sea mesh */
export function seaState(mesh: THREE.Object3D | null | undefined): SeaState | null { return (mesh?.userData.sea as SeaState) ?? null; }

/** ribbons along the river centre lines, at the water surface, reaching under the banks on both sides */
export function makeRivers(R: Region, U: Record<string, THREE.IUniform>): THREE.Mesh | null {
  if (!R.rivers.length) return null;
  const pos: number[] = [], flow: number[] = [], speed: number[] = [], idx: number[] = [];
  for (const all of R.rivers) {
    // only the part over the map: off the rim there is no ground to hold it
    const pts = all.filter((q) => q.x > 0.25 && q.z > 0.25 && q.x < R.N - 0.25 && q.z < R.N - 0.25);
    if (pts.length < 4) continue;
    const step = 2, n = Math.floor((pts.length - 1) / step) + 1, base = pos.length / 3;
    const mouth = pts.find((q) => q.y <= R.water + 0.02)?.s ?? 1e9;
    for (let j = 0; j < n; j++) {
      const k = Math.min(pts.length - 1, j * step), p = pts[k];
      const a = pts[Math.max(0, k - 2)], b = pts[Math.min(pts.length - 1, k + 2)];
      let tx = b.x - a.x, tz = b.z - a.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const half = p.w + 1.4, nx = -tz, nz = tx;
      // fade the current into still water where the river meets the sea, and sink the ribbon under it there
      const fk = Math.min(1, Math.max(0, (mouth - p.s) / 9));
      const y = p.y > R.water + 0.02 ? Math.max(p.y, R.water + 0.035) : R.water - 0.04;
      for (const sg of [-1, 1]) {
        pos.push(p.x + nx * half * sg, y, p.z + nz * half * sg);
        flow.push(half * sg, p.s);
        speed.push(p.v, Math.max(0, fk));
      }
      if (j < n - 1) { const q = base + j * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
  g.setAttribute('aSpeed', new THREE.Float32BufferAttribute(speed, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new THREE.ShaderMaterial({ uniforms: uniforms(R, U), vertexShader: VERT_RIVER, fragmentShader: FRAG_RIVER, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, m);
  mesh.name = 'river';
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  return mesh;
}
