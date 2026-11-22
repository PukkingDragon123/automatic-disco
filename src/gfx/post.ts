// Post: G-buffer outlines (silhouettes from the sign of the 1/z Laplacian, creases from normals), team-colour
// selection rims, dual-filter bloom, lift/gamma/gain grade, vignette, sRGB out.
// For a scene lit by a Sun (scene.userData.sun) it also lays the atmosphere over the image from the depth buffer
// (lights.ts Env): blue aerial haze in the distance and a warm near field, low mist pooling over water and in hollows
// in drifting patches, light shafts through the canopy (the view ray marched through the sun's shadow map), wet
// ground after rain (darker, richer, puddles reflecting the sky with raindrop rings), dew glints on leaves in the
// morning, heat shimmer over hot ground. Water marks itself in the G-buffer with flag bit 16.
// Sunlit ground also splits warm where the sun lands from the cool sky fill in the shade (the sun's shadow map, by
// daylight; LIMBOPHOBIA's outdoor look) under a gentle film S-curve.
//
// For an interior (scene.userData.interior, an InteriorLight from lights.ts) it shades the soft ceiling panels on
// area-lit materials (gbuf.areaLit), lays glowing haze under the panels and round the practicals (subtle volumetric
// beams), deepens the contact shadows, and grades like a film: eye adaptation that ignores the void outside, a soft
// shoulder that keeps the lamps' colour, an S-curve with cool shadows and warm light (LIMBOPHOBIA's look).
// Contact shadows (SSAO) everywhere take the surface's own colour as they deepen (multi-bounce), not grey.
//
// MOTION BLUR (MotionBlur, exported for any pipeline): every pixel's motion from the depth buffer reprojected with
// the last frame's view-projection (camera blur), plus the real motion of fast objects (thrown things, drones,
// creatures, debris: any mesh, skinned mesh or small instanced mesh that moved this frame gets its own velocity in a
// side pass), tile-max / neighbour-max velocity and a depth-aware reconstruction gather (McGuire 2012, with half
// the taps along the pixel's own motion), in linear HDR before the tone map so lamps streak. Strength: settings
// motionBlur (motionBlurK()); off on low quality and under prefers-reduced-motion. On for scenes lit by a Sun or
// an InteriorLight; any other scene opts in with scene.userData.motionBlur = true (or a 0..1 strength) and a mesh
// opts out with mesh.userData.noBlur = true. The DOM UI is never touched.
import * as THREE from 'three';
import type { Sun, InteriorLight } from './lights';
import { settings, qualityProfile, motionBlurK } from '../settings';
import { RAMPS } from '../art/palette';
import { AREA_U, AREA_MAX } from './gbuf';

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/** the end of every frame: tone map, grade, vignette, fade, sRGB, film curve (the composite's, or the motion blur's) */
const FINISH = /* glsl */`
uniform sampler2D tExpo;
uniform float uTone, uSat, uVig, uFade, uContrast, uExpK, uFilm;
uniform vec3 uLift, uGamma, uGain, uFadeCol, uSplitLo, uSplitHi;
// FOCUS (post.focus; the pod interior): outside a soft screen ellipse the image dims and greys (uFocusK 0 = off)
uniform vec4 uFocus; uniform float uFocusK;
vec3 srgb(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 finish(vec3 col, vec2 uv) {
  if (uTone > 0.5 && uTone < 1.5) {
    // filmic tone mapping (ACES fit) after the eye's adaptation to the scene's light
    vec3 x = max(col, 0.0) * texture2D(tExpo, vec2(0.5)).r * 0.8;
    col = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  } else if (uTone > 1.5) {
    // interiors: exposure, then a soft shoulder on luminance only (lamps and screens roll off, every colour keeps
    // its saturation); a channel past white burns toward a creamy white instead of clipping to a flat primary
    vec3 c = max(col, 0.0) * texture2D(tExpo, vec2(0.5)).r * uExpK;
    float L = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float Lt = L < 0.6 ? L : 0.6 + (L - 0.6) / (1.0 + (L - 0.6) / 0.4);
    c *= Lt / max(L, 1e-5);
    float m = max(c.r, max(c.g, c.b));
    if (m > 1.0) c = Lt + (c - Lt) * ((1.0 - Lt) / max(m - Lt, 1e-4));
    col = mix(col, c, uFilm);
  }
  col = max(col, 0.0);
  col = col * uGain + uLift * (1.0 - col);
  col = pow(max(col, 0.0), 1.0 / uGamma);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSat);
  if (uFocusK > 0.0) {
    float fo = smoothstep(1.0, 1.45, length((uv - uFocus.xy) / uFocus.zw)) * uFocusK;
    col = mix(col, vec3(dot(col, vec3(0.299, 0.587, 0.114))) * vec3(0.4, 0.42, 0.5), fo);
  }
  vec2 q = uv - 0.5;
  col *= 1.0 - uVig * dot(q, q) * 1.6;
  col = mix(col, uFadeCol, uFade);
  vec3 s = srgb(col);
  if (uContrast > 0.0) {
    // film: a light S-curve in display space over cool shadows and warm light
    vec3 sc = clamp(s, 0.0, 1.0);
    s = mix(s, sc * sc * (3.0 - 2.0 * sc), uContrast);
    s *= mix(uSplitLo, uSplitHi, smoothstep(0.04, 0.85, dot(s, vec3(0.299, 0.587, 0.114))));
  }
  return s;
}
`;

const COMPOSITE = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor, tNormal, tDepth, tBloom, tFx;
uniform vec2 uRes;
uniform float uNear, uFar, uBloom, uCrease, uTime, uFxOn, uDebug, uAO, uAORad, uProj;
uniform int uAOTaps;
uniform vec3 uOutline, uSelCol, uHoverCol, uEnemyCol;
// interiors: haze glowing under the ceiling panels (cones) and round the practicals
#define GLOW_MAX 16
uniform float uIntr, uBeam, uCeilY, uFloorY, uRealism;
uniform mat4 uViewProj;
uniform int uGlowN;
uniform vec4 uGlowP[GLOW_MAX];
uniform vec4 uGlowC[GLOW_MAX];
${FINISH}
// atmosphere
uniform highp sampler2DShadow tShadow;
uniform float uEnv, uHaze, uMist, uMistY, uMistH, uPatch, uRays, uWet, uRain, uDew, uHeat, uShadowOn, uSplit;
uniform int uRaySteps;
uniform mat4 uInvProj, uCamWorld, uShadowM;
uniform vec3 uCamPos, uSunDir, uSunCol, uSkyCol, uHazeCol, uMistCol;
uniform vec2 uWind;
// climate and the sky
uniform float uSnow, uFrost, uIce, uDry, uAutumn, uDust, uAsh, uRed, uEclipse, uFlash, uCloudK, uAurora, uNight, uDay;
uniform vec3 uSkyZen, uSkyHor, uSunSky, uMoonSky, uSunDisk;
uniform vec3 uSnw[4];
uniform vec3 uAut[9];
uniform vec3 uIceC[3];

float linZ(float d) { float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vn2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float bay4(vec2 p) { vec2 f = mod(floor(p), 4.0); return mod(f.x * 4.0 + f.y * 7.0 + f.x * f.y * 3.0, 16.0) / 16.0; }
vec3 worldAt(vec2 uv, float d) { vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); v /= v.w; return (uCamWorld * v).xyz; }

/** haze, mist and light shafts between the eye and P (dist along rd) */
vec3 atmosphere(vec3 col, vec3 P, vec3 rd, float dist, bool bg) {
  float D = bg ? 700.0 : dist;
  // light shafts: the air above the hit point marched through the shadow map (lit air glows, shaded air does not)
  float lit = 1.0;
  if (uRays > 0.0 && uShadowOn > 0.5 && !bg && dist < 110.0) {
    float span = min(dist - 0.3, 7.5 / max(0.22, -rd.y));
    vec3 S = P - rd * span;
    float stp = span / float(uRaySteps), j = bay4(gl_FragCoord.xy);
    float acc = 0.0, ws = 0.0;
    for (int i = 0; i < 16; i++) {
      if (i >= uRaySteps) break;
      vec3 Q = S + rd * (float(i) + j) * stp;
      vec4 sc = uShadowM * vec4(Q, 1.0);
      float l = 1.0;
      if (sc.x > 0.001 && sc.x < 0.999 && sc.y > 0.001 && sc.y < 0.999 && sc.z < 1.0) l = texture(tShadow, vec3(sc.xy, sc.z - 0.002));
      float w = exp(-max(0.0, Q.y - P.y) * 0.25);
      acc += l * w; ws += w;
    }
    lit = acc / max(ws, 1e-3);
    // a forward lobe toward the sun, a broad floor so the beams read from above too
    float cosT = dot(rd, uSunDir);
    float phase = 0.6 + 1.6 * pow(max(0.0, cosT * 0.5 + 0.5), 6.0);
    // lit air glows, shaded air stays clear: the beams read against the shade without veiling the sunlit ground
    float a = (1.0 - exp(-uRays * span * 0.025)) * phase;
    col = col * (1.0 - a * 0.05) + uSunCol * (a * lit * lit * 0.055);
  }
  // low mist: exponential height fog integrated along the ray, thickened in drifting patches near the ground
  if (uMist > 0.0) {
    float b = 1.0 / uMistH;
    float yc = max(uCamPos.y - uMistY, -1.0), yp = max(P.y - uMistY, -1.0), dy = yp - yc;
    float integ = abs(dy) > 1e-3 ? D * (exp(-b * yc) - exp(-b * yp)) / (b * dy) : D * exp(-b * yc);
    vec2 w = uWind * uTime;
    float n = 0.0;
    for (int k = 0; k < 3; k++) {
      vec3 Q = P - rd * float(k) * 1.7;
      n += vn2(Q.xz * 0.085 - w * 0.085) * 0.6 + vn2(Q.xz * 0.21 - w * 0.16 + 9.1) * 0.4;
    }
    n /= 3.0;
    float pt = mix(1.0, smoothstep(0.28, 0.78, n) * 2.0, uPatch);
    // (the play area near the eye stays clear: mist gathers further off)
    float m = (1.0 - exp(-uMist * integ * pt)) * smoothstep(14.0, 48.0, D);
    col = mix(col, uMistCol * mix(0.62, 1.0, lit), clamp(m, 0.0, 0.42));
  }
  // aerial perspective: blue with distance (warmer toward the sun), a touch warm up close
  // aerial perspective only far out: it fades in past ~60 m and never fully swallows the scene
  float hz = (1.0 - exp(-max(0.0, D - 60.0) * uHaze * 0.8)) * (bg ? 0.25 : 0.7);
  vec3 hc = mix(uHazeCol, uHazeCol * 0.55 + uSunCol * 0.3, pow(max(0.0, dot(rd, uSunDir)), 5.0));
  col *= mix(vec3(1.03, 1.0, 0.965), vec3(1.0), smoothstep(3.0, 36.0, D));
  return mix(col, hc, hz);
}
// flags: outline + 2 sel + 4 hover + 8 enemy + 32 emit
void flags(float a, out float outl, out float sel, out float hov, out float en) {
  a -= 32.0 * step(31.5, a);
  a = mod(a, 16.0);
  en = step(7.5, a); a -= 8.0 * en;
  hov = step(3.5, a); a -= 4.0 * hov;
  sel = step(1.5, a); a -= 2.0 * sel;
  outl = clamp(a, 0.0, 1.0);
}
/** the in-scatter of the interior's lights along the view ray (closed form: a 1 / d^2 scatter integrates to an
 *  arctangent of the ray's closest approach), over the ray's stretch inside the room air */
vec3 beams(vec3 rd, float dist, bool bg) {
  float ta = 0.0, tb = bg ? 400.0 : dist;
  if (rd.y < -1e-4) { ta = max(ta, (uCamPos.y - uCeilY) / -rd.y); tb = min(tb, (uCamPos.y - uFloorY) / -rd.y); }
  else if (uCamPos.y > uCeilY) return vec3(0.0);
  else if (rd.y > 1e-4) tb = min(tb, (uCeilY - uCamPos.y) / rd.y);
  if (tb <= ta) return vec3(0.0);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < GLOW_MAX; i++) {
    if (i >= uGlowN) break;
    vec4 lp = uGlowP[i];
    vec3 w = lp.xyz - uCamPos;
    float s0 = dot(w, rd);
    float h = sqrt(max(dot(w, w) - s0 * s0, 0.0) + 0.03);
    if (h > lp.w) continue;
    float I = (atan((tb - s0) / h) - atan((ta - s0) / h)) / h;
    float fall = 1.0 - h / lp.w; fall *= fall;
    // ceiling panels throw their light down: the glow hangs as a soft cone toward the floor, not a ball
    vec3 C = uCamPos + rd * clamp(s0, ta, tb);
    float lobe = uGlowC[i].w > 0.5 ? smoothstep(-0.1, 0.85, (lp.y - C.y) / h) : 1.0;
    acc += uGlowC[i].rgb * (I * fall * lobe);
  }
  return acc * uBeam;
}

/** the sky where nothing was drawn: Rayleigh blue overhead, a warm Mie aureole round the sun, the sun (or the
 *  eclipse's black disc and corona), stars and two moons at night (the second red in the bloodtide), auroras, and the
 *  glow of wildfires on the horizon in the ember season */
vec3 skyAt(vec3 rd) {
  float up = rd.y;
  vec3 c = up > 0.0 ? mix(uSkyHor, uSkyZen, pow(up, 0.55)) : uSkyHor * (1.0 - min(1.0, -up * 3.0) * 0.4);
  float cs = dot(rd, uSunSky), sd = acos(clamp(cs, -1.0, 1.0));
  c += uSunDisk * (pow(max(cs, 0.0), 6.0) * 0.16 + pow(max(cs, 0.0), 90.0) * 0.55) * (1.0 - uEclipse);
  if (uEclipse > 0.02) {
    vec3 ax = normalize(cross(uSunSky, vec3(0.0, 1.0, 0.0))), ay = cross(ax, uSunSky);
    float a = atan(dot(rd, ay), dot(rd, ax));
    float ray = 0.55 + 0.45 * h21(vec2(floor(a * 7.6), 3.0));
    c += vec3(1.0, 0.94, 0.82) * smoothstep(0.075 * ray, 0.017, sd) * 2.4 * uEclipse;
    if (sd < 0.017) c = mix(uSunDisk * 8.0, vec3(0.004, 0.005, 0.01), uEclipse);
  } else if (sd < 0.012) c = uSunDisk * 8.0;
  if (uNight > 0.01 && up > 0.0) {
    vec2 sg = floor(vec2(atan(rd.z, rd.x) * 150.0, up * 300.0));
    float h = h21(sg);
    if (h > 0.9965) c += vec3(0.8, 0.85, 1.0) * uNight * (0.55 + 0.45 * sin(uTime * 2.3 + h * 60.0)) * 1.3;
  }
  float m1 = acos(clamp(dot(rd, uMoonSky), -1.0, 1.0));
  if (m1 < 0.028) c = mix(c, vec3(0.72, 0.75, 0.84) * (dot(rd - uMoonSky, normalize(uSunSky - uMoonSky)) > -0.006 ? 1.3 : 0.45), max(uNight, 0.25));
  vec3 md2 = normalize(uMoonSky + vec3(0.3, 0.1, -0.22));
  float m2 = acos(clamp(dot(rd, md2), -1.0, 1.0));
  if (m2 < 0.016 + uRed * 0.006) c = mix(c, mix(vec3(0.62, 0.62, 0.7), vec3(1.6, 0.22, 0.12), uRed), max(max(uNight, uRed), 0.2));
  if (uAurora > 0.01 && up > 0.04) {
    float a = atan(rd.z, rd.x), n = vn2(vec2(a * 5.0 + uTime * 0.04, up * 3.0 + sin(a * 3.0 + uTime * 0.1)));
    float band = step(0.6, n) * smoothstep(0.04, 0.2, up) * (1.0 - smoothstep(0.4, 0.75, up));
    c += mix(vec3(0.15, 0.95, 0.55), vec3(0.65, 0.3, 1.0), step(0.75, n)) * band * uAurora * 0.7;
  }
  if (uAsh > 0.01) c += vec3(1.0, 0.36, 0.1) * uAsh * step(abs(up), 0.06) * (0.4 + 0.6 * vn2(vec2(atan(rd.z, rd.x) * 9.0, uTime * 0.4))) * 0.9;
  return c;
}
/** a palette step by brightness: three tones of a ramp, scaled so the light and shade of the scene survive */
vec3 rampBy(vec3 col, vec3 a, vec3 b, vec3 c) {
  float l = dot(col, vec3(0.3, 0.59, 0.11));
  vec3 s = l < 0.07 ? a : l < 0.2 ? b : c;
  float ls = max(1e-3, dot(s, vec3(0.3, 0.59, 0.11)));
  return s * clamp(l / ls, 0.55, 1.5);
}
/** the season on the ground: snow lying on whatever faces up, hoar frost, dry and autumn foliage, cloud shadows */
vec3 seasonal(vec3 col, vec3 P, vec3 N, float emit, float obj) {
  vec2 wp = (floor(P.xz * 32.0) + 0.5) / 32.0;
  // foliage (green pixels) turns: straw in the drought, rust and ochre leaves in the ember season, cell by cell
  // (the terrain paints its own snow, rime and drought; grass cards share its G-buffer flag, so snow and the dry turn
  // reach everything, and only the rime is kept to drawn objects)
  if (uDry + uAutumn > 0.01 && col.g > col.r * 1.04 && col.g > col.b * 1.1) {
    vec2 cell = floor(P.xz * 1.6 + P.y * 0.7);
    float hc = h21(cell);
    if (hc < uAutumn * 0.85) col = hc < uAutumn * 0.4 ? rampBy(col, uAut[0], uAut[1], uAut[2]) : rampBy(col, uAut[3], uAut[4], uAut[5]);
    else if (hc < uAutumn * 0.85 + uDry * 0.75) col = rampBy(col, uAut[6], uAut[7], uAut[8]);
  }
  // snow: on up-facing surfaces, in clean patches that grow with the cover (planar tones of the snow ramp)
  if (uSnow > 0.01 && emit < 0.5) {
    float n = vn2(wp * 0.8 + 11.0) * 0.6 + vn2(wp * 2.6) * 0.4;
    if (N.y > 0.4 && n < uSnow * 1.3 - (1.0 - N.y) * 1.2) {
      float l = dot(col, vec3(0.3, 0.59, 0.11));
      col = (l < 0.05 ? uSnw[0] : l < 0.12 ? uSnw[1] : l < 0.3 ? uSnw[2] : uSnw[3]) * (0.25 + 0.75 * uDay);
    }
  }
  // hoar frost: a cold silver on everything that faces the sky
  if (obj > 0.5 && uFrost > 0.01 && emit < 0.5) {
    float l = dot(col, vec3(0.3, 0.59, 0.11));
    col = mix(col, vec3(l) * vec3(0.9, 1.0, 1.12) * 1.15, uFrost * 0.45 * smoothstep(0.2, 0.8, N.y));
  }
  // clouds sweeping over: their shadows run with the wind, in two hard steps
  if (uCloudK > 0.05 && uDay > 0.05) {
    float n = vn2((P.xz + uWind * uTime * 2.5) * 0.022) * 0.7 + vn2((P.xz + uWind * uTime * 2.5) * 0.06) * 0.3;
    float th = 1.0 - uCloudK * 0.75;
    col *= 1.0 - (step(th, n) * 0.22 + step(th + 0.05, n) * 0.12) * uDay;
  }
  return col;
}

void main() {
  vec2 px = 1.0 / uRes;
  vec4 nC = texture2D(tNormal, vUv);
  float dC = texture2D(tDepth, vUv).r;
  float oC, sC, hC, eC; flags(nC.a, oC, sC, hC, eC);
  float zC = linZ(dC), wC = 1.0 / zC;
  bool bgC = dC >= 0.99999;
  bool env = uEnv > 0.5;
  // heat shimmer: the colour (not the ink) wavers by whole pixels over hot ground further off
  vec2 uvC = vUv;
  if (env && uHeat > 0.0 && !bgC) {
    float amp = uHeat * smoothstep(9.0, 40.0, zC) * 2.2;
    float wv = sin(gl_FragCoord.y * 0.23 + uTime * 6.0 + sin(gl_FragCoord.x * 0.045 + uTime * 1.3) * 2.5);
    uvC += floor(vec2(wv, sin(gl_FragCoord.x * 0.13 + uTime * 4.0) * 0.35) * amp + 0.5) * px;
  }
  vec3 col = texture2D(tColor, uvC).rgb;
  float water = step(15.5, mod(nC.a, 32.0));
  vec3 P = worldAt(vUv, bgC ? 0.9999 : dC), toP = P - uCamPos;
  float dist = length(toP);
  vec3 rd = toP / max(dist, 1e-4);
  vec3 N0 = nC.xyz * 2.0 - 1.0;
  float emitF = step(31.5, nC.a);
  if (env && !bgC && water > 0.5) {
    // still water freezes; the bloodtide turns it red; the sun glitters on it
    vec3 rr = reflect(rd, vec3(0.0, 1.0, 0.0));
    float sg = pow(max(0.0, dot(rr, uSunDir)), 260.0) * (1.0 - uCloudK * 0.8) * uDay;
    col += uSunCol * sg * 3.0;
    float gl = h31(floor(P * 32.0) + floor(uTime * 5.0));
    if (gl > 0.993 && dot(rr, uSunDir) > 0.86) col += uSunCol * 1.6 * uDay;
    // the night sky's stars caught in the water
    if (uNight > 0.05 && rr.y > 0.0) {
      float hs = h21(floor(vec2(atan(rr.z, rr.x) * 150.0, rr.y * 300.0)));
      if (hs > 0.995) col += vec3(0.75, 0.8, 1.0) * uNight * (0.5 + 0.5 * sin(uTime * 2.3 + hs * 60.0)) * 0.9;
    }
    if (uRed > 0.01) col = mix(col, rampBy(col, uAut[0], uAut[1], uAut[2]) * vec3(1.25, 0.55, 0.5), uRed * 0.75);
    if (uIce > 0.01) {
      vec2 wp = (floor(P.xz * 32.0) + 0.5) / 32.0;
      vec3 ice = rampBy(col * 1.8, uIceC[0], uIceC[1], uIceC[2]) * (0.3 + 0.7 * uDay);
      float crack = step(abs(vn2(wp * 1.3) - 0.5), 0.012) + step(abs(vn2(wp * 3.1 + 7.0) - 0.5), 0.01);
      col = mix(col, ice * (1.0 - min(1.0, crack) * 0.3), smoothstep(0.1, 0.6, uIce) * 0.9);
    }
  }
  if (env && !bgC && water < 0.5) col = seasonal(col, P, N0, emitF, oC);
  // outdoors: warm where the sun lands, the cool sky fill in the shade (the sun's own shadow map), by daylight
  if (env && !bgC && uSplit > 0.0 && uShadowOn > 0.5 && emitF < 0.5) {
    vec4 sc = uShadowM * vec4(P + N0 * 0.08, 1.0);
    float lit = 1.0;
    if (sc.x > 0.001 && sc.x < 0.999 && sc.y > 0.001 && sc.y < 0.999 && sc.z < 1.0) lit = texture(tShadow, vec3(sc.xy, sc.z - 0.002));
    lit *= smoothstep(0.0, 0.3, dot(N0, uSunDir));
    col *= mix(vec3(1.0), mix(vec3(0.86, 0.93, 1.1), vec3(1.07, 1.0, 0.88), lit), uSplit * (1.0 - smoothstep(60.0, 140.0, dist)));
  }
  if (env && !bgC) {
    // in the eclipse glowing life is the light
    col *= 1.0 + emitF * uEclipse * 2.6;
    col += vec3(0.5, 0.56, 0.72) * uFlash * 0.3;
    // aurora light rippling over the ground: slow bands of green and violet, hard-edged, drifting
    if (uAurora > 0.01) {
      vec2 ap = P.xz * 0.045 + vec2(uTime * 0.03, uTime * 0.011);
      float n = vn2(ap + vec2(vn2(ap * 0.7 + uTime * 0.02) * 2.0, 0.0));
      float b1 = step(0.58, n) * (1.0 - step(0.68, n)), b2 = step(0.72, n) * (1.0 - step(0.77, n));
      col += (b2 > 0.5 ? vec3(0.5, 0.22, 0.85) : vec3(0.12, 0.8, 0.48)) * max(b1, b2) * uAurora * (0.05 + uNight * 0.09) * max(0.35, N0.y);
    }
  }
  if (env && bgC) col = skyAt(rd);
  if (env && !bgC && water < 0.5) {
    // wet ground: darker and richer, puddles in the flat open hollows mirror the sky, the sun glints off the wet
    if (uWet > 0.002) {
      float up = smoothstep(0.35, 0.85, N0.y), wk = uWet * (0.45 + 0.55 * up);
      float lum = dot(col, vec3(0.3, 0.59, 0.11));
      col = mix(vec3(lum), col, 1.0 + 0.3 * wk) * (1.0 - 0.36 * wk);
      vec2 wp = (floor(P.xz * 32.0) + 0.5) / 32.0;
      float pn = vn2(wp * 0.42 + 3.7) * 0.62 + vn2(wp * 1.25 - 1.9) * 0.38, thr = 1.0 - uWet * 0.3;
      vec3 rr = reflect(rd, vec3(0.0, 1.0, 0.0));
      if (N0.y > 0.985 && pn > thr) {
        vec3 sky = mix(uHazeCol, uSkyCol, smoothstep(0.0, 0.7, rr.y));
        float fres = 0.3 + 0.7 * pow(1.0 - max(0.0, -rd.y), 3.0);
        vec3 pc = mix(col * 0.42, sky * 0.75, 0.38 * fres + 0.12) + uSunCol * pow(max(0.0, dot(rr, uSunDir)), 160.0) * 2.5;
        if (uRain > 0.01) {
          vec2 q = wp * 2.3, ci = floor(q), f = fract(q) - 0.5 - (vec2(h21(ci), h21(ci + 5.3)) - 0.5) * 0.45;
          float tc = uTime * 1.15 + h21(ci + 2.7), ph = fract(tc);
          vec2 af = abs(f);
          float oc = max(max(af.x, af.y), (af.x + af.y) * 0.7071);
          float leg = step(0.25, h21(ci + floor((atan(f.y, f.x) / 6.2832 + 0.5) * 8.0 + 0.5) * 3.1));
          float ring = (1.0 - step(0.05, abs(oc - ph * 0.42))) * step(ph, 0.7) * leg * step(h21(ci + floor(tc)), uRain);
          pc = mix(pc, uSkyCol, ring * 0.7);
        }
        col = pn < thr + 0.03 ? mix(col, pc, 0.45) : pc;
      }
      col += uSunCol * pow(max(0.0, dot(reflect(rd, N0), uSunDir)), 48.0) * wk * 0.3;
    }
    // dew: single world-texel glints twinkling on leaves and grass in the morning
    if (uDew > 0.002 && col.g > col.r * 1.04 && col.g > col.b && N0.y > 0.15) {
      float hs = h31(floor(P * 32.0));
      if (hs > 1.0 - 0.014 * uDew) {
        float tw = fract(hs * 91.7 + uTime * (0.35 + fract(hs * 13.0) * 0.5));
        col += vec3(1.25, 1.4, 1.6) * smoothstep(0.28, 0.0, tw);
      }
    }
  }

  // ---- silhouettes: near side of a depth discontinuity (negative Laplacian of 1/z)
  float wL = 1.0 / linZ(texture2D(tDepth, vUv - vec2(px.x, 0.0)).r);
  float wR = 1.0 / linZ(texture2D(tDepth, vUv + vec2(px.x, 0.0)).r);
  float wD = 1.0 / linZ(texture2D(tDepth, vUv - vec2(0.0, px.y)).r);
  float wU = 1.0 / linZ(texture2D(tDepth, vUv + vec2(0.0, px.y)).r);
  float lx = (wL + wR - 2.0 * wC) / wC, ly = (wD + wU - 2.0 * wC) / wC;
  float sil = bgC ? 0.0 : max(step(lx, -0.012), step(ly, -0.012)) * oC;

  // ---- creases: normal change towards right / up neighbours (1 px lines), both sides outlined
  vec4 nR = texture2D(tNormal, vUv + vec2(px.x, 0.0)), nU = texture2D(tNormal, vUv + vec2(0.0, px.y));
  float oR, sR, hR, eR, oU, sU, hU, eU; flags(nR.a, oR, sR, hR, eR); flags(nU.a, oU, sU, hU, eU);
  vec3 NC = nC.xyz * 2.0 - 1.0;
  float cr = 0.0;
  if (!bgC) {
    float zR = 1.0 / wR, zU = 1.0 / wU;
    // only on the same surface layer (a depth jump is the silhouette test's job)
    float kR = step(abs(zR - zC), 0.02 * zC + 0.05) * min(oC, oR) * step(dot(NC, nR.xyz * 2.0 - 1.0), 0.75);
    float kU = step(abs(zU - zC), 0.02 * zC + 0.05) * min(oC, oU) * step(dot(NC, nU.xyz * 2.0 - 1.0), 0.75);
    cr = max(kR, kU) * uCrease;
  }
  float fade = 1.0 - smoothstep(110.0, 220.0, zC);

  // ---- ambient occlusion (screen space, against the local tangent plane so open ground stays clean):
  // contact shadow under canopies and creatures, between stones, at the foot of every wall. Bayer-rotated taps.
  float occ = 0.0;
  if (!bgC && uAO > 0.0 && uIntr > 0.5) {
    // interiors: a normal-oriented hemisphere of world-space probes, each tested against the depth it lands on, so
    // every corner, skirting and the floor under every table and stool darkens (LIMBOPHOBIA's contact shadows)
    vec3 N = normalize(N0);
    vec3 T = normalize(cross(N, abs(N.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), B = cross(N, T);
    vec2 fc = mod(floor(gl_FragCoord.xy), 4.0);
    float ang = mod(fc.x * 4.0 + fc.y * 7.0 + fc.x * fc.y * 3.0, 16.0) / 16.0 * 6.2831853, ca = cos(ang), sa = sin(ang);
    for (int i = 0; i < 12; i++) {
      if (i >= uAOTaps) break;
      float fi = (float(i) + 0.5) / float(uAOTaps), r = sqrt(fi), ph = float(i) * 2.399963;
      vec2 k = vec2(cos(ph), sin(ph)) * r;
      k = vec2(k.x * ca - k.y * sa, k.x * sa + k.y * ca);
      vec3 S = P + (T * k.x + B * k.y + N * (sqrt(max(0.0, 1.0 - r * r)) + 0.12)) * (uAORad * mix(0.25, 1.0, fi * fi));
      vec4 cs = uViewProj * vec4(S, 1.0);
      vec2 su = cs.xy / cs.w * 0.5 + 0.5;
      float diff = cs.w - linZ(texture2D(tDepth, su).r);
      occ += step(0.02, diff) * (1.0 - smoothstep(uAORad * 0.8, uAORad * 2.0, diff));
    }
    occ = min(occ / float(max(uAOTaps, 1)) * 1.5, 0.85 / max(uAO, 0.01));
  } else if (!bgC && uAO > 0.0) {
    float zL = 1.0 / wL, zR2 = 1.0 / wR, zD = 1.0 / wD, zU2 = 1.0 / wU;
    float gx = abs(zR2 - zC) < abs(zC - zL) ? zR2 - zC : zC - zL;
    float gy = abs(zU2 - zC) < abs(zC - zD) ? zU2 - zC : zC - zD;
    float rp = clamp(uAORad * uProj / zC, 3.0, 56.0);
    vec2 fc = mod(floor(gl_FragCoord.xy), 4.0);
    float bay = mod(fc.x * 4.0 + fc.y * 7.0 + fc.x * fc.y * 3.0, 16.0) / 16.0;
    for (int i = 0; i < 12; i++) {
      if (i >= uAOTaps) break;
      float fi = float(i);
      float a = fi * 2.39996 + bay * 6.2831;
      float rr = rp * (0.2 + 0.8 * fract(fi * 0.618 + bay * 0.37));
      vec2 op = vec2(cos(a), sin(a)) * rr;
      float zs = linZ(texture2D(tDepth, vUv + op * px).r);
      float d = (zC + gx * op.x + gy * op.y) - zs;
      occ += smoothstep(0.03 + zC * 0.0015, 0.12 + zC * 0.004, d) * (1.0 - smoothstep(uAORad, uAORad * 3.0, d));
    }
    occ /= float(max(uAOTaps, 1));
  }
  // contact shadows: deeper in the corners, the surface's own colour bouncing in the occlusion (multi-bounce, after
  // Jimenez's GTAO fit, with the lit colour's chroma standing in for the albedo), losing the warm key first
  if (occ > 0.0 && uRealism < 0.5) col *= 1.0 - uAO * occ * fade * (1.0 - step(31.5, nC.a) * 0.6) * vec3(1.0, 0.96, 0.88);
  else if (occ > 0.0) {
    float vis = clamp(1.0 - uAO * occ * fade * (1.0 - step(31.5, nC.a) * 0.6), 0.0, 1.0);
    vec3 alb = clamp(col / max(max(col.r, max(col.g, col.b)), 1e-4), 0.0, 1.0) * 0.7;
    vec3 ma = 2.0404 * alb - 0.3324, mb = -4.7951 * alb + 0.6417, mc = 2.7552 * alb + 0.6903;
    vec3 mvis = max(vec3(vis), ((vis * ma + mb) * vis + mc) * vis);
    col *= mvis * mix(vec3(1.0, 0.96, 0.88), vec3(1.0), vis);
  }
  float edge = max(sil, cr) * fade;

  // ---- selection / hover rims: outside pixels within 2 px of a nearer flagged pixel
  vec3 rim = vec3(0.0); float rimA = 0.0;
  if (sC < 0.5 || hC < 0.5 || eC < 0.5) {
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 0.5235988;
      float r = (i % 2 == 0) ? 2.0 : 1.0;
      vec2 o = vec2(cos(a), sin(a)) * r * px;
      vec4 n = texture2D(tNormal, vUv + o);
      float on, sn, hn, en; flags(n.a, on, sn, hn, en);
      float zn = linZ(texture2D(tDepth, vUv + o).r);
      float nearer = bgC ? 1.0 : step(zn + 0.05, zC);
      if (sn > 0.5 && sC < 0.5 && nearer > 0.5) { rim = uSelCol; rimA = 1.0; }
      else if (en > 0.5 && eC < 0.5 && nearer > 0.5 && rimA < 1.0) { rim = uEnemyCol; rimA = 1.0; }
      else if (hn > 0.5 && hC < 0.5 && nearer > 0.5 && rimA < 0.5) { rim = uHoverCol; rimA = 0.85; }
    }
  }
  if (uDebug > 0.5) {
    if (uDebug < 1.5) { gl_FragColor = vec4(nC.rgb, 1.0); return; }
    if (uDebug < 2.5) { gl_FragColor = vec4(oC, sC, fract(nC.a / 32.0), 1.0); return; }
    if (uDebug < 3.5) { gl_FragColor = vec4(vec3(1.0 - edge), 1.0); return; }
    // 4: contact shadows
    gl_FragColor = vec4(vec3(clamp(1.0 - uAO * occ * fade, 0.0, 1.0)), 1.0); return;
  }
  vec3 lineCol = uOutline;
  if (sC > 0.5) lineCol = mix(uOutline, uSelCol * 0.55, 0.7);
  col = mix(col, lineCol, edge);
  if (env) col = atmosphere(col, P, rd, dist, bgC);
  if (uIntr > 0.5 && uGlowN > 0) col += beams(rd, dist, bgC);
  // transparent fx layer (particles, fields) composited over the outlined opaque image
  if (uFxOn > 0.5) { vec4 fx = texture2D(tFx, vUv); col = col * (1.0 - fx.a) + fx.rgb; }
  col = mix(col, rim, rimA);
  // bloom
  col += texture2D(tBloom, vUv).rgb * uBloom;
#ifdef HDR_OUT
  // (the motion blur gathers this linear image, then finishes it)
  gl_FragColor = vec4(max(col, 0.0), 1.0);
#else
  gl_FragColor = vec4(finish(col, vUv), 1.0);
#endif
}
`;

const EXPO = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor, tPrev, tDepth; uniform float uRate, uKey, uMode;
void main() {
  float target;
  if (uMode < 0.5) {
    // the eye adapts to the log-average light of the middle of the view (the console covers the edges)
    float s = 0.0;
    for (int y = 0; y < 8; y++) for (int x = 0; x < 12; x++) {
      vec2 uv = 0.15 + (vec2(float(x), float(y)) + 0.5) / vec2(12.0, 8.0) * 0.7;
      s += log(max(dot(texture2D(tColor, uv).rgb, vec3(0.2126, 0.7152, 0.0722)), 1e-4));
    }
    target = clamp(uKey / max(exp(s / 96.0), 1e-4), 0.5, 1.15);
  } else {
    // interiors: centre weighted, the void outside the hull is nothing the eye adapts to; a narrow band, so a dim
    // room opens up and a blazing one settles, never murky, never blown
    float s = 0.0, w = 0.0;
    for (int y = 0; y < 8; y++) for (int x = 0; x < 8; x++) {
      vec2 uv = 0.5 + ((vec2(float(x), float(y)) + 0.5) / 8.0 - 0.5) * 0.92;
      if (texture2D(tDepth, uv).r >= 0.99999) continue;
      vec2 d = uv - 0.5;
      float cw = exp(-dot(d, d) * 7.0);
      s += log(min(dot(texture2D(tColor, uv).rgb, vec3(0.2126, 0.7152, 0.0722)), 4.0) + 0.03) * cw; w += cw;
    }
    float avg = w > 0.01 ? exp(s / w) - 0.03 : uKey;
    target = clamp(pow(uKey / max(avg, 1e-3), 0.5), 0.82, 1.45);
  }
  float prev = texture2D(tPrev, vec2(0.5)).r;
  gl_FragColor = vec4(prev <= 0.0 ? target : mix(prev, target, uRate), 0.0, 0.0, 1.0);
}`;
const BRIGHT = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor, tNormal, tFx; uniform vec2 uTexel; uniform float uThresh, uFxOn;
void main() {
  vec3 c = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec2 o = vec2(i % 2 == 0 ? -0.5 : 0.5, i < 2 ? -0.5 : 0.5) * uTexel;
    vec3 s = texture2D(tColor, vUv + o).rgb;
    // glowing effects (sparks, motes, glints) bloom too
    if (uFxOn > 0.5) { vec4 f = texture2D(tFx, vUv + o); s = s * (1.0 - f.a) + f.rgb; }
    float a = texture2D(tNormal, vUv + o).a;
    float emit = step(31.5, a);
    float l = max(s.r, max(s.g, s.b));
    c += s * max(smoothstep(uThresh, uThresh + 0.6, l), emit * 0.35);
  }
  gl_FragColor = vec4(c * 0.25, 1.0);
}
`;
const DOWN = /* glsl */`
precision highp float;
varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
  c += texture2D(tSrc, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
  c += texture2D(tSrc, vUv + vec2(1.0, -1.0) * uTexel).rgb;
  c += texture2D(tSrc, vUv + vec2(-1.0, 1.0) * uTexel).rgb;
  c += texture2D(tSrc, vUv + vec2(1.0, 1.0) * uTexel).rgb;
  gl_FragColor = vec4(c / 8.0, 1.0);
}
`;
const UP = /* glsl */`
precision highp float;
varying vec2 vUv; uniform sampler2D tSrc, tPrev; uniform vec2 uTexel;
void main() {
  vec3 c = vec3(0.0);
  c += texture2D(tSrc, vUv + vec2(-2.0, 0.0) * uTexel).rgb;
  c += texture2D(tSrc, vUv + vec2(2.0, 0.0) * uTexel).rgb;
  c += texture2D(tSrc, vUv + vec2(0.0, -2.0) * uTexel).rgb;
  c += texture2D(tSrc, vUv + vec2(0.0, 2.0) * uTexel).rgb;
  c += texture2D(tSrc, vUv + vec2(-1.0, 1.0) * uTexel).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(1.0, 1.0) * uTexel).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(-1.0, -1.0) * uTexel).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(1.0, -1.0) * uTexel).rgb * 2.0;
  gl_FragColor = vec4(c / 12.0 + texture2D(tPrev, vUv).rgb, 1.0);
}
`;

// ================================================================ motion blur
/** what every motion pass knows: the pixel's world point from depth, last frame's view-projection, the object
 *  velocity layer; velAt() gives the blur's half extent in pixels (clamped) */
const MB_COMMON = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tDepth, tVel;
uniform vec2 uRes;
uniform float uNear, uFar, uMBK, uMBMax, uObjOn;
// this frame's clip space -> last frame's, in one matrix (last view-projection x camera x inverse projection: the
// homogeneous divide makes the in-between scale irrelevant); the sky's version drops the camera's travel
uniform mat4 uReproj, uReprojSky;
float linZ(float d) { float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
vec2 velAt(vec2 uv, float d) {
  bool sky = d >= 0.99999;
  vec4 pc = (sky ? uReprojSky : uReproj) * vec4(uv * 2.0 - 1.0, sky ? 1.0 : d * 2.0 - 1.0, 1.0);
  vec2 vel = pc.w > 1e-4 ? uv - (pc.xy / pc.w * 0.5 + 0.5) : vec2(0.0);
  if (uObjOn > 0.5) { vec4 o = texture2D(tVel, uv); if (o.a > 0.5) vel = o.xy; }
  vel *= uRes * uMBK;
  float l = length(vel);
  return l > uMBMax ? vel * (uMBMax / l) : vel;
}
`;
/** the strongest motion in each tile (6 x 6 probes per tile) */
const MB_TILE = MB_COMMON + /* glsl */`
uniform float uTileN;
void main() {
  vec2 base = floor(gl_FragCoord.xy) * uTileN;
  vec2 best = vec2(0.0); float bl = 0.0;
  for (int y = 0; y < 6; y++) for (int x = 0; x < 6; x++) {
    vec2 uv = min((base + (vec2(float(x), float(y)) + 0.5) * (uTileN / 6.0)) / uRes, vec2(0.9999));
    vec2 v = velAt(uv, texture2D(tDepth, uv).r);
    float l = dot(v, v);
    if (l > bl) { bl = l; best = v; }
  }
  gl_FragColor = vec4(best, 0.0, 1.0);
}
`;
/** ... and over its 3 x 3 neighbourhood, so a fast thing's streak reaches past its own tile */
const MB_NEIGH = /* glsl */`
precision highp float;
uniform sampler2D tTile;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy), mx = textureSize(tTile, 0) - 1;
  vec2 best = vec2(0.0); float bl = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 v = texelFetch(tTile, clamp(c + ivec2(x, y), ivec2(0), mx), 0).xy;
    float l = dot(v, v);
    if (l > bl) { bl = l; best = v; }
  }
  gl_FragColor = vec4(best, 0.0, 1.0);
}
`;
/** the reconstruction gather (McGuire et al. 2012): each tap counts if it is in front and its own blur reaches
 *  here, or behind and this pixel's blur reaches it, or both are blurred; half the taps follow this pixel's own
 *  motion (Jimenez 2014) so a turning view blurs along each pixel's own arc. Foreground edges keep their shape. */
const mbGather = (finish: string) => MB_COMMON + finish + /* glsl */`
uniform sampler2D tHdr, tNeigh;
uniform float uTileN, uMBDebug;
uniform int uTaps;
float cone(float d, float l) { return clamp(1.0 - d / l, 0.0, 1.0); }
float cyl(float d, float l) { return 1.0 - smoothstep(0.95 * l, 1.05 * l, d); }
float softZ(float za, float zb, float s) { return clamp(1.0 - (za - zb) / s, 0.0, 1.0); }
void main() {
  vec2 px = 1.0 / uRes;
  vec3 c0 = texture2D(tHdr, vUv).rgb;
  vec2 vn = texelFetch(tNeigh, ivec2(gl_FragCoord.xy / uTileN), 0).xy;
  float ln = length(vn);
  if (uMBDebug > 0.5) { float dc = texture2D(tDepth, vUv).r; vec2 v = velAt(vUv, dc); gl_FragColor = vec4(0.5 + v / max(uMBMax, 1.0) * 0.5, texture2D(tVel, vUv).a, 1.0); return; }
  if (ln < 0.6) { gl_FragColor = vec4(FINISH_FN(c0, vUv), 1.0); return; }
  float dc = texture2D(tDepth, vUv).r, zc = linZ(dc);
  vec2 vc = velAt(vUv, dc);
  float lc = max(length(vc), 0.5);
  float S = 0.05 + zc * 0.012;
  float wsum = 1.0 / lc;
  vec3 sum = c0 * wsum;
  float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;
  bool own = lc > 1.5;
  for (int i = 0; i < 16; i++) {
    if (i >= uTaps) break;
    float t = mix(-1.0, 1.0, (float(i) + j + 1.0) / (float(uTaps) + 1.0));
    vec2 off = ((own && (i % 2 == 1)) ? vc : vn) * t;
    vec2 uv = clamp(vUv + off * px, px * 0.5, 1.0 - px * 0.5);
    float dy = texture2D(tDepth, uv).r, zy = linZ(dy);
    float dist = length(off), ly = max(length(velAt(uv, dy)), 0.5);
    float a = softZ(zy, zc, S) * cone(dist, ly) + softZ(zc, zy, S) * cone(dist, lc) + cyl(dist, ly) * cyl(dist, lc) * 2.0;
    sum += texture2D(tHdr, uv).rgb * a; wsum += a;
  }
  gl_FragColor = vec4(FINISH_FN(sum / wsum, vUv), 1.0);
}
`;
/** a moving object's own velocity (its last frame's world matrix, and last frame's instance matrices for instanced
 *  meshes), kept only where it is the visible surface (tested against the scene's depth) */
const MB_VEL_VERT = /* glsl */`
uniform mat4 uPrevVP, uPrevModel;
uniform float uPrevInst;
#ifdef USE_INSTANCING
attribute mat4 aPrevInst;
#endif
#include <common>
#include <skinning_pars_vertex>
#ifdef USE_SKINNING
// last frame's bone matrices (the limbs' own swing), and last frame's model x bind-inverse
uniform highp sampler2D uPrevBones;
uniform float uPrevBonesOn;
uniform mat4 uPrevSkin;
mat4 prevBone(float i) {
  int size = textureSize(uPrevBones, 0).x, j = int(i) * 4, x = j % size, y = j / size;
  return mat4(texelFetch(uPrevBones, ivec2(x, y), 0), texelFetch(uPrevBones, ivec2(x + 1, y), 0), texelFetch(uPrevBones, ivec2(x + 2, y), 0), texelFetch(uPrevBones, ivec2(x + 3, y), 0));
}
#endif
varying vec4 vCur, vPrev;
void main() {
  #include <begin_vertex>
  #include <skinbase_vertex>
  #include <skinning_vertex>
  vec4 lp = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  vec4 wc = modelMatrix * (instanceMatrix * lp);
  vec4 wp = uPrevModel * ((uPrevInst > 0.5 ? aPrevInst : instanceMatrix) * lp);
#else
  vec4 wc = modelMatrix * lp, wp = uPrevModel * lp;
#endif
#ifdef USE_SKINNING
  if (uPrevBonesOn > 0.5) {
    vec4 sv = bindMatrix * vec4(position, 1.0);
    vec4 sk = prevBone(skinIndex.x) * sv * skinWeight.x + prevBone(skinIndex.y) * sv * skinWeight.y
            + prevBone(skinIndex.z) * sv * skinWeight.z + prevBone(skinIndex.w) * sv * skinWeight.w;
    wp = uPrevSkin * vec4(sk.xyz, 1.0);
  }
#endif
  vCur = projectionMatrix * (viewMatrix * wc);
  vPrev = uPrevVP * wp;
  gl_Position = vCur;
}
`;
const MB_VEL_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tDepth;
uniform float uNear, uFar;
varying vec4 vCur, vPrev;
float linZ(float d) { float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
void main() {
  float zs = linZ(texelFetch(tDepth, ivec2(gl_FragCoord.xy), 0).r), zf = linZ(gl_FragCoord.z);
  if (zf > zs * 1.02 + 0.04) discard;
  gl_FragColor = vec4((vCur.xy / vCur.w - vPrev.xy / max(vPrev.w, 1e-4)) * 0.5, 0.0, 1.0);
}
`;

interface Track {
  cur: Float32Array; prev: Float32Array; f: number;
  /** instanced: the instance matrices this frame and last, the attribute's version */
  ic?: Float32Array; ip?: Float32Array; ver?: number; instMoved?: boolean;
  /** skinned: the bone matrices this frame and last (a texture over the last), last frame's bind-inverse */
  bc?: Float32Array; bp?: Float32Array; boneTex?: THREE.DataTexture; bi?: THREE.Matrix4; biPrev?: THREE.Matrix4; bonesOk?: boolean;
  proxy?: THREE.Mesh; geo?: THREE.BufferGeometry; prevAttr?: THREE.InstancedBufferAttribute;
}
const TILE = 18;
const _m4 = new THREE.Matrix4(), _m4b = new THREE.Matrix4(), _v3 = new THREE.Vector3(), _v3b = new THREE.Vector3();

/**
 * Camera + object motion blur as one reusable pass. Any pipeline: after the scene's main pass (depth written,
 * camera matrices current) call prepare(); when it returns true, run apply(hdrColour, target). Post wires it with
 * its own finish (tone map + grade), so the blur costs no extra full-screen pass; standalone it writes linear HDR.
 * Exposure: strength x 25 ms (the high default is a 1/50 s shutter at any frame rate), the blur radius capped at
 * about 2.9% of the screen height (HIGH; 3.2% at MAX). The first frame of a camera, and a cut (a jump of 30 m or 30 degrees), never blur.
 */
export class MotionBlur {
  readonly U: Record<string, THREE.IUniform>;
  private vel: THREE.WebGLRenderTarget; private tile: THREE.WebGLRenderTarget; private neigh: THREE.WebGLRenderTarget;
  private mTile: THREE.ShaderMaterial; private mNeigh: THREE.ShaderMaterial; private mGather: THREE.ShaderMaterial;
  private quad: THREE.Mesh; private ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); private qs = new THREE.Scene();
  private velScene = new THREE.Scene();
  private tracks = new WeakMap<THREE.Object3D, Track>();
  private movers: { o: THREE.Mesh; tr: Track }[] = [];
  private frame = 0; private cam: THREE.Camera | null = null; private camFrame = -9;
  private prevVP = new THREE.Matrix4(); private prevPos = new THREE.Vector3(); private prevFw = new THREE.Vector3(); private prevFov = 0;
  private lastT = 0; private lastNow = 0;
  w = 1; h = 1;
  /** objects that moved this frame got their own velocity (diagnostics) */
  moving = 0;
  constructor(private renderer: THREE.WebGLRenderer, o: { finish?: string; uniforms?: Record<string, THREE.IUniform> } = {}) {
    const opt = { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false };
    this.vel = new THREE.WebGLRenderTarget(4, 4, { ...opt, depthBuffer: true });
    this.tile = new THREE.WebGLRenderTarget(1, 1, opt); this.neigh = new THREE.WebGLRenderTarget(1, 1, opt);
    this.U = {
      tDepth: { value: null }, tVel: { value: this.vel.texture }, tHdr: { value: null }, tTile: { value: this.tile.texture }, tNeigh: { value: this.neigh.texture },
      uRes: { value: new THREE.Vector2(4, 4) }, uNear: { value: 0.5 }, uFar: { value: 1000 }, uMBK: { value: 0 }, uMBMax: { value: 24 }, uObjOn: { value: 0 },
      uReproj: { value: new THREE.Matrix4() }, uReprojSky: { value: new THREE.Matrix4() }, uPrevVP: { value: new THREE.Matrix4() },
      uTileN: { value: TILE }, uTaps: { value: 12 }, uMBDebug: { value: Number(new URLSearchParams(location.search).get('mbdbg') ?? 0) },
    };
    const V = 'varying vec2 vUv;\nvoid main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    const mk = (fs: string, u: Record<string, THREE.IUniform>) => new THREE.ShaderMaterial({ vertexShader: V, fragmentShader: fs, uniforms: u, depthTest: false, depthWrite: false });
    this.mTile = mk(MB_TILE, this.U); this.mNeigh = mk(MB_NEIGH, this.U);
    const fin = o.finish ?? 'vec3 finishLinear(vec3 c, vec2 uv) { return c; }\n';
    this.mGather = mk(mbGather(fin).replace(/FINISH_FN/g, o.finish ? 'finish' : 'finishLinear'), { ...(o.uniforms ?? {}), ...this.U });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new THREE.Mesh(g); this.quad.frustumCulled = false; this.qs.add(this.quad);
    this.velScene.matrixWorldAutoUpdate = false;
  }
  setSize(w: number, h: number) {
    this.w = w; this.h = h; this.vel.setSize(w, h);
    const tw = Math.ceil(w / TILE), th = Math.ceil(h / TILE);
    this.tile.setSize(tw, th); this.neigh.setSize(tw, th);
    (this.U.uRes.value as THREE.Vector2).set(w, h);
  }
  dispose() { this.vel.dispose(); this.tile.dispose(); this.neigh.dispose(); this.mTile.dispose(); this.mNeigh.dispose(); this.mGather.dispose(); }

  /**
   * After the main pass: works out this frame's camera motion and which objects moved, renders their velocity.
   * k: strength 0..1 (0 = off; the camera history is still kept so switching on never flashes). Returns whether
   * apply() should run this frame (false: nothing moves enough to see).
   */
  prepare(scene: THREE.Scene, camera: THREE.PerspectiveCamera, depth: THREE.Texture, time: number, k: number, o: { taps?: number; objects?: boolean } = {}): boolean {
    const F = ++this.frame, U = this.U;
    const now = performance.now();
    let dt = time - this.lastT;
    if (!(dt > 1e-4) || dt > 0.25) dt = (now - this.lastNow) / 1000;
    dt = Math.min(1 / 15, Math.max(1 / 240, dt || 1 / 60));
    this.lastT = time; this.lastNow = now;
    const VP = _m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const pos = _v3.setFromMatrixPosition(camera.matrixWorld), fw = _v3b.set(0, 0, -1).transformDirection(camera.matrixWorld);
    // a cut (another camera, a skipped frame, a jump) starts the history over
    const cont = this.cam === camera && this.camFrame === F - 1 && pos.distanceTo(this.prevPos) < 30 && fw.dot(this.prevFw) > Math.cos(0.52) && Math.abs(camera.fov - this.prevFov) < 8;
    const pvp = (U.uPrevVP.value as THREE.Matrix4).copy(cont ? this.prevVP : VP);
    (U.uReproj.value as THREE.Matrix4).multiplyMatrices(pvp, camera.matrixWorld).multiply(camera.projectionMatrixInverse);
    const rot = _m4b.copy(camera.matrixWorld), re = rot.elements;
    re[12] = re[13] = re[14] = 0; re[3] = re[7] = re[11] = re[15] = 0;
    (U.uReprojSky.value as THREE.Matrix4).multiplyMatrices(pvp, rot).multiply(camera.projectionMatrixInverse);
    U.uNear.value = camera.near; U.uFar.value = camera.far; U.tDepth.value = depth;
    // blur radius per unit of screen travel per frame: half the travel over the exposure
    const expo = k * 0.025, mbk = (expo / dt) * 0.5;
    U.uMBK.value = mbk; U.uMBMax.value = this.h * 0.028 * (0.55 + 0.6 * k); U.uTaps.value = o.taps ?? 12;
    // how far does the view move (probes at 4 m and 40 m in the middle and the corners)?
    let camPx = 0;
    if (cont && k > 0) {
      const ip = camera.projectionMatrixInverse, cw = camera.matrixWorld, pv = this.prevVP;
      for (const [x, y] of [[0, 0], [-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) for (const D of [4, 40]) {
        _p4.set(x, y, 0.5, 1).applyMatrix4(ip); _p3.set(_p4.x / _p4.w, _p4.y / _p4.w, _p4.z / _p4.w).normalize().multiplyScalar(D).applyMatrix4(cw);
        _p4.set(_p3.x, _p3.y, _p3.z, 1).applyMatrix4(pv);
        if (_p4.w <= 1e-4) continue;
        const du = (x * 0.5 + 0.5) - (_p4.x / _p4.w * 0.5 + 0.5), dv = (y * 0.5 + 0.5) - (_p4.y / _p4.w * 0.5 + 0.5);
        camPx = Math.max(camPx, Math.hypot(du * this.w, dv * this.h) * mbk);
      }
    }
    this.prevVP.copy(VP); this.prevPos.copy(pos); this.prevFw.copy(fw); this.prevFov = camera.fov; this.cam = camera; this.camFrame = F;
    // objects: what moved since its last frame (any frame the camera was not cut)
    this.moving = 0; U.uObjOn.value = 0;
    if (o.objects !== false && k > 0) this.trackMovers(scene, camera, F, cont ? mbk : 0);
    if (k <= 0 || !cont) return false;
    if (this.movers.length) this.renderVelocity(camera);
    if (camPx < 0.45 && !this.movers.length) return false;
    // the tile and neighbourhood maxima
    this.pass(this.mTile, this.tile); this.pass(this.mNeigh, this.neigh);
    return true;
  }
  /** blur `color` (linear) into `target` (null = the screen), finishing it on the way when Post wired a finish */
  apply(color: THREE.Texture, target: THREE.WebGLRenderTarget | null) { this.U.tHdr.value = color; this.pass(this.mGather, target); }

  private pass(m: THREE.Material, t: THREE.WebGLRenderTarget | null) { this.quad.material = m; this.renderer.setRenderTarget(t); this.renderer.render(this.qs, this.ortho); }

  private trackMovers(scene: THREE.Scene, camera: THREE.PerspectiveCamera, F: number, mbk: number) {
    this.movers.length = 0;
    const items = this.renderer.renderLists.get(scene, 0).opaque;
    const vi = camera.matrixWorldInverse.elements, proj = this.h / (2 * Math.tan((camera.fov * Math.PI) / 360));
    for (const it of items) {
      const o = it.object as THREE.Mesh;
      if (!o || !o.isMesh || o.userData.noBlur) continue;
      let tr = this.tracks.get(o);
      if (tr && tr.f === F) continue;
      const e = o.matrixWorld.elements;
      const im = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh) : null;
      if (im && im.count > 2048) continue;
      if (!tr) { tr = { cur: new Float32Array(e), prev: new Float32Array(e), f: F }; this.tracks.set(o, tr); }
      const fresh = tr.f === F - 1;
      tr.prev.set(tr.cur); tr.cur.set(e); tr.f = F;
      // instance matrices: copied only when their buffer changed
      let instD = 0;
      if (im) {
        const arr = im.instanceMatrix.array as Float32Array, n = im.count * 16;
        if (!tr.ic || tr.ic.length < arr.length) { tr.ic = new Float32Array(arr); tr.ip = new Float32Array(arr); tr.ver = im.instanceMatrix.version; tr.instMoved = false; continue; }
        tr.instMoved = false;
        if (im.instanceMatrix.version !== tr.ver) {
          tr.ver = im.instanceMatrix.version;
          const ic = tr.ic, ip = tr.ip!;
          ip.set(ic); ic.set(arr);
          for (let i = 0; i < n; i += 16) instD = Math.max(instD, Math.abs(ic[i + 12] - ip[i + 12]) + Math.abs(ic[i + 13] - ip[i + 13]) + Math.abs(ic[i + 14] - ip[i + 14])
            + (Math.abs(ic[i] - ip[i]) + Math.abs(ic[i + 5] - ip[i + 5]) + Math.abs(ic[i + 10] - ip[i + 10]) + Math.abs(ic[i + 2] - ip[i + 2])) * 0.5);
          tr.instMoved = instD > 1e-4;
        }
      }
      // bones: copied every frame for skinned meshes in view (limbs swing without the mesh moving)
      let boneD = 0;
      const sk = (o as THREE.SkinnedMesh).isSkinnedMesh ? (o as THREE.SkinnedMesh).skeleton : null;
      if (sk && sk.boneMatrices) {
        const bm = sk.boneMatrices, smo = o as THREE.SkinnedMesh;
        if (!tr.bc || tr.bc.length !== bm.length) { tr.bc = new Float32Array(bm); tr.bp = new Float32Array(bm); tr.boneTex = undefined; tr.bi = smo.bindMatrixInverse.clone(); tr.biPrev = tr.bi.clone(); tr.bonesOk = false; }
        else {
          const bc = tr.bc, bp = tr.bp!;
          bp.set(bc); bc.set(bm); tr.biPrev!.copy(tr.bi!); tr.bi!.copy(smo.bindMatrixInverse); tr.bonesOk = fresh;
          const nb = sk.bones.length * 16;
          for (let i = 0; i < nb; i += 16) boneD = Math.max(boneD, Math.abs(bc[i + 12] - bp[i + 12]) + Math.abs(bc[i + 13] - bp[i + 13]) + Math.abs(bc[i + 14] - bp[i + 14]));
        }
      }
      if (!fresh || mbk <= 0) continue;
      const p = tr.prev;
      const dT = Math.hypot(e[12] - p[12], e[13] - p[13], e[14] - p[14]);
      let dB = 0;
      for (const c of [0, 4, 8]) dB = Math.max(dB, Math.hypot(e[c] - p[c], e[c + 1] - p[c + 1], e[c + 2] - p[c + 2]));
      if (dT < 1e-6 && dB < 1e-6 && !tr.instMoved && boneD < 1e-5) continue;
      const geo = o.geometry;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      const bs = geo.boundingSphere!, R = bs.radius + bs.center.length();
      const disp = Math.max(dT + dB * R + instD * (im ? Math.max(1, R) : 0), boneD);
      if (disp > 25) continue; // a teleport, not a motion
      const z = -(vi[2] * e[12] + vi[6] * e[13] + vi[10] * e[14] + vi[14]);
      if (disp * proj / Math.max(z, camera.near) * mbk < 0.5) continue;
      this.movers.push({ o, tr });
    }
  }

  private proxy(o: THREE.Mesh, tr: Track): THREE.Mesh {
    if (tr.proxy && tr.geo === o.geometry) return tr.proxy;
    if (tr.proxy) (tr.proxy.material as THREE.Material).dispose();
    const U = this.U;
    const mat = new THREE.ShaderMaterial({ vertexShader: MB_VEL_VERT, fragmentShader: MB_VEL_FRAG,
      uniforms: { tDepth: U.tDepth, uNear: U.uNear, uFar: U.uFar, uPrevVP: U.uPrevVP, uPrevModel: { value: new THREE.Matrix4() }, uPrevInst: { value: 0 },
        uPrevBones: { value: null }, uPrevBonesOn: { value: 0 }, uPrevSkin: { value: new THREE.Matrix4() } } });
    let px: THREE.Mesh;
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
      const sm = new THREE.SkinnedMesh(o.geometry, mat); sm.bindMode = THREE.DetachedBindMode; sm.skeleton = (o as THREE.SkinnedMesh).skeleton; px = sm;
    } else if ((o as THREE.InstancedMesh).isInstancedMesh) {
      const src = o.geometry, g = new THREE.BufferGeometry();
      g.index = src.index; for (const k of Object.keys(src.attributes)) g.setAttribute(k, src.attributes[k]);
      tr.prevAttr = new THREE.InstancedBufferAttribute(tr.ip!, 16); g.setAttribute('aPrevInst', tr.prevAttr);
      g.drawRange = src.drawRange;
      const im = new THREE.InstancedMesh(g, mat, 1); im.instanceMatrix = (o as THREE.InstancedMesh).instanceMatrix; px = im;
    } else px = new THREE.Mesh(o.geometry, mat);
    px.matrixAutoUpdate = false; px.frustumCulled = false;
    tr.proxy = px; tr.geo = o.geometry;
    return px;
  }

  private renderVelocity(camera: THREE.Camera) {
    const r = this.renderer, vs = this.velScene;
    vs.children.length = 0;
    for (const { o, tr } of this.movers) {
      const px = this.proxy(o, tr), mat = px.material as THREE.ShaderMaterial;
      px.matrixWorld.copy(o.matrixWorld);
      (mat.uniforms.uPrevModel.value as THREE.Matrix4).fromArray(tr.prev);
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
        const s = o as THREE.SkinnedMesh, ps = px as THREE.SkinnedMesh;
        ps.skeleton = s.skeleton; ps.bindMatrix.copy(s.bindMatrix); ps.bindMatrixInverse.copy(s.bindMatrixInverse);
        // last frame's limbs: the copied bone matrices as a texture shaped like the skeleton's own
        if (tr.bp && tr.bonesOk) {
          if (!tr.boneTex) { const n = Math.round(Math.sqrt(tr.bp.length / 4)); tr.boneTex = new THREE.DataTexture(tr.bp, n, n, THREE.RGBAFormat, THREE.FloatType); }
          tr.boneTex.needsUpdate = true;
          mat.uniforms.uPrevBones.value = tr.boneTex; mat.uniforms.uPrevBonesOn.value = 1;
          (mat.uniforms.uPrevSkin.value as THREE.Matrix4).fromArray(tr.prev).multiply(tr.biPrev!);
        } else mat.uniforms.uPrevBonesOn.value = 0;
      }
      if ((o as THREE.InstancedMesh).isInstancedMesh) {
        const im = o as THREE.InstancedMesh, pi = px as THREE.InstancedMesh;
        pi.instanceMatrix = im.instanceMatrix; pi.count = im.count;
        if (tr.prevAttr && tr.prevAttr.array !== tr.ip) { tr.prevAttr.array = tr.ip!; }
        if (tr.prevAttr) tr.prevAttr.needsUpdate = true;
        mat.uniforms.uPrevInst.value = tr.instMoved ? 1 : 0;
      }
      vs.children.push(px); (px as unknown as { parent: THREE.Object3D }).parent = vs;
    }
    const ac = r.autoClear;
    r.setRenderTarget(this.vel); r.setClearColor(0x000000, 0); r.clear(true, true, false);
    r.autoClear = false; r.render(vs, camera); r.autoClear = ac;
    vs.children.length = 0;
    this.moving = this.movers.length; this.U.uObjOn.value = 1;
  }
}
const _p4 = new THREE.Vector4(), _p3 = new THREE.Vector3();

export interface Grade { lift: THREE.Color; gamma: THREE.Color; gain: THREE.Color; sat: number; vig: number; bloom: number }
/**
 * A restrained, slightly filmic look: below-neutral saturation, a faint cool lift in the shadows against a
 * warm tint in the highlights (split tone), soft vignette, gentle bloom.
 */
export function resetGrade(g: Grade) { const d = defaultGrade(); g.lift.copy(d.lift); g.gamma.copy(d.gamma); g.gain.copy(d.gain); g.sat = d.sat; g.vig = d.vig; g.bloom = d.bloom; }
export const defaultGrade = (): Grade => ({ lift: new THREE.Color(0.0035, 0.004, 0.007), gamma: new THREE.Color(1.06, 1.06, 1.07), gain: new THREE.Color(1.12, 1.09, 1.03), sat: 1.14, vig: 0.34, bloom: 0.34 });

const _t = new THREE.Color(), _a = new THREE.Vector3(), _n3 = new THREE.Matrix3();
function rt(w: number, h: number, linear = true) {
  return new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: linear ? THREE.LinearFilter : THREE.NearestFilter, magFilter: linear ? THREE.LinearFilter : THREE.NearestFilter, depthBuffer: false });
}

export class Post {
  readonly main: THREE.WebGLRenderTarget;
  /** transparent effects layer (shares the main depth) */
  readonly fx: THREE.WebGLRenderTarget;
  private bloomRts: THREE.WebGLRenderTarget[] = [];
  private upRts: THREE.WebGLRenderTarget[] = [];
  private quad: THREE.Mesh;
  private ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private scene = new THREE.Scene();
  private mComp: THREE.ShaderMaterial; private mBright: THREE.ShaderMaterial; private mDown: THREE.ShaderMaterial; private mUp: THREE.ShaderMaterial;
  private black: THREE.WebGLRenderTarget;
  private expA!: THREE.WebGLRenderTarget; private expB!: THREE.WebGLRenderTarget; private mExpo!: THREE.ShaderMaterial; private lastT = 0;
  private expoScene: THREE.Scene | null = null;
  /** the composite's linear HDR image, when the motion blur gathers it */
  private hdr: THREE.WebGLRenderTarget; private mCompHdr: THREE.ShaderMaterial;
  /** camera + object motion blur (settings motionBlur) */
  readonly blur: MotionBlur;
  /** whether the last frame ran the motion blur (diagnostics) */
  blurred = false;
  /** a cleared 1x1 depth texture with a compare function: what the shadow sampler reads when there are no shafts */
  private noShadow: THREE.WebGLRenderTarget;
  readonly grade: Grade = defaultGrade();
  /** dim and grey the image outside a soft screen ellipse: at = (centre u, v, radius u, radius v) in 0..1, k 0..1 (0 off) */
  readonly focus = { at: new THREE.Vector4(0.5, 0.5, 0.3, 0.3), k: 0 };
  readonly U: Record<string, THREE.IUniform>;
  w = 1; h = 1;

  constructor(private renderer: THREE.WebGLRenderer) {
    const depth = new THREE.DepthTexture(4, 4, THREE.FloatType);
    this.main = new THREE.WebGLRenderTarget(4, 4, { count: 2, type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, depthTexture: depth });
    this.fx = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, depthTexture: depth });
    this.black = rt(1, 1);
    this.hdr = rt(4, 4);
    const nd = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    nd.compareFunction = THREE.LessEqualCompare; nd.minFilter = nd.magFilter = THREE.LinearFilter;
    this.noShadow = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, depthTexture: nd });
    renderer.setRenderTarget(this.noShadow); renderer.clear(true, true, false); renderer.setRenderTarget(null);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new THREE.Mesh(g);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    const gr = this.grade;
    this.U = {
      tColor: { value: this.main.textures[0] }, tNormal: { value: this.main.textures[1] }, tDepth: { value: depth },
      tBloom: { value: null }, tFx: { value: this.fx.texture }, uFxOn: { value: 0 },
      uRes: { value: new THREE.Vector2(4, 4) }, uNear: { value: 0.5 }, uFar: { value: 1000 }, uTime: { value: 0 },
      uBloom: { value: gr.bloom }, uSat: { value: gr.sat }, uVig: { value: gr.vig }, uFade: { value: 0 }, uFadeCol: { value: new THREE.Color(0, 0, 0) },
      uFocus: { value: this.focus.at }, uFocusK: { value: 0 },
      uCrease: { value: 0.62 }, uAO: { value: 0.82 }, uAORad: { value: 1.15 }, uProj: { value: 600 }, uDebug: { value: Number(new URLSearchParams(location.search).get('dbg') ?? 0) },
      uLift: { value: gr.lift }, uGamma: { value: gr.gamma }, uGain: { value: gr.gain },
      uOutline: { value: new THREE.Color(0x07060c) }, uSelCol: { value: new THREE.Color(0x9dff6a) },
      uHoverCol: { value: new THREE.Color(0xf4f0d8) }, uEnemyCol: { value: new THREE.Color(0xff5a48) },
      tShadow: { value: this.noShadow.depthTexture }, uShadowOn: { value: 0 }, uSplit: { value: 0 }, uShadowM: { value: new THREE.Matrix4() }, uRaySteps: { value: 12 },
      uEnv: { value: 0 }, uHaze: { value: 0 }, uMist: { value: 0 }, uMistY: { value: 0 }, uMistH: { value: 1.4 }, uPatch: { value: 0.6 },
      uRays: { value: 0 }, uWet: { value: 0 }, uRain: { value: 0 }, uDew: { value: 0 }, uHeat: { value: 0 }, uWind: { value: new THREE.Vector2() },
      uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uSkyCol: { value: new THREE.Color() },
      uHazeCol: { value: new THREE.Color() }, uMistCol: { value: new THREE.Color() },
      tExpo: { value: null }, uTone: { value: 1 }, uSnow: { value: 0 }, uFrost: { value: 0 }, uIce: { value: 0 }, uDry: { value: 0 }, uAutumn: { value: 0 },
      uDust: { value: 0 }, uAsh: { value: 0 }, uRed: { value: 0 }, uEclipse: { value: 0 }, uFlash: { value: 0 }, uCloudK: { value: 0 }, uAurora: { value: 0 },
      uNight: { value: 0 }, uDay: { value: 1 },
      uSkyZen: { value: new THREE.Color() }, uSkyHor: { value: new THREE.Color() }, uSunSky: { value: new THREE.Vector3(0, 1, 0) }, uMoonSky: { value: new THREE.Vector3(0, 1, 0) }, uSunDisk: { value: new THREE.Color() },
      uSnw: { value: [5, 3, 2, 1].map((i) => new THREE.Color().setHex(RAMPS.snow[RAMPS.snow.length - i])) },
      uAut: { value: [RAMPS.rust[2], RAMPS.rust[4], RAMPS.rust[5], RAMPS.ochre[2], RAMPS.ochre[4], RAMPS.ochre[5], RAMPS.straw[1], RAMPS.straw[3], RAMPS.straw[4]].map((c) => new THREE.Color().setHex(c)) },
      uIceC: { value: [RAMPS.slate[3], RAMPS.snow[1], RAMPS.snow[3]].map((c) => new THREE.Color().setHex(c)) },
      // contact shadows by tier; interiors (beams, film curve)
      uAOTaps: { value: 12 }, uRealism: { value: 1 }, uViewProj: { value: new THREE.Matrix4() }, uIntr: { value: 0 }, uBeam: { value: 0 }, uCeilY: { value: 3.4 }, uFloorY: { value: 0 },
      uGlowN: { value: 0 }, uGlowP: { value: Array.from({ length: 16 }, () => new THREE.Vector4()) }, uGlowC: { value: Array.from({ length: 16 }, () => new THREE.Vector4()) },
      uContrast: { value: 0 }, uExpK: { value: 1 }, uFilm: { value: 1 }, uSplitLo: { value: new THREE.Color(1, 1, 1) }, uSplitHi: { value: new THREE.Color(1, 1, 1) },
    };
    this.mComp = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: COMPOSITE, uniforms: this.U, depthTest: false, depthWrite: false });
    this.mCompHdr = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: COMPOSITE, uniforms: this.U, defines: { HDR_OUT: '' }, depthTest: false, depthWrite: false });
    this.blur = new MotionBlur(renderer, { finish: FINISH, uniforms: this.U });
    this.mBright = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: BRIGHT, uniforms: { tColor: this.U.tColor, tNormal: this.U.tNormal, tFx: this.U.tFx, uFxOn: this.U.uFxOn, uTexel: { value: new THREE.Vector2() }, uThresh: { value: 2.4 } }, depthTest: false, depthWrite: false });
    // the eye's adaptation: two 1x1 targets, ping-ponged
    this.expA = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.expB = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.mExpo = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: EXPO, uniforms: { tColor: this.U.tColor, tDepth: this.U.tDepth, tPrev: { value: this.expA.texture }, uRate: { value: 0.05 }, uKey: { value: 0.13 }, uMode: { value: 0 } }, depthTest: false, depthWrite: false });
    this.U.tExpo.value = this.expA.texture;
    this.mDown = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: DOWN, uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false });
    this.mUp = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: UP, uniforms: { tSrc: { value: null }, tPrev: { value: null }, uTexel: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false });
  }

  setSize(w: number, h: number) {
    w = Math.max(1, Math.floor(w)); h = Math.max(1, Math.floor(h));
    this.w = w; this.h = h;
    this.main.setSize(w, h);
    this.fx.setSize(w, h);
    this.hdr.setSize(w, h);
    this.blur.setSize(w, h);
    (this.U.uRes.value as THREE.Vector2).set(w, h);
    for (const r of [...this.bloomRts, ...this.upRts]) r.dispose();
    this.bloomRts = []; this.upRts = [];
    let bw = w >> 1, bh = h >> 1;
    for (let i = 0; i < 5 && bw > 4 && bh > 4; i++) { this.bloomRts.push(rt(bw, bh)); this.upRts.push(rt(bw, bh)); bw >>= 1; bh >>= 1; }
  }

  private pass(m: THREE.Material, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = m;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.ortho);
  }

  /** opaque scene -> main MRT; optional transparent scene -> fx layer; then composite to screen (through the motion
   *  blur when anything moves) */
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, fxScene?: THREE.Scene, time = 0) {
    const r = this.renderer;
    const ac = r.autoClear;
    const qp = qualityProfile();
    const ia = scene.userData.interior as InteriorLight | undefined;
    // the camera as it will draw (the area lights go to the materials in view space)
    if (camera.parent === null) camera.updateMatrixWorld(); else camera.updateWorldMatrix(true, false);
    this.areaLights(ia, camera, qp.area);
    r.setRenderTarget(this.main);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    r.render(scene, camera);
    // the motion of the view and of what moved in it (reads this pass's draw list: before anything else renders)
    const mbk = this.blurK(scene);
    const blur = this.blur.prepare(scene, camera, this.U.tDepth.value as THREE.Texture, time, mbk, { taps: qp.blurTaps, objects: qp.blurObjects }) && qp.blurTaps > 0;
    if (fxScene && fxScene.children.length) {
      r.autoClear = false;
      r.setRenderTarget(this.fx);
      r.setClearColor(0x000000, 0);
      r.clear(true, false, false);
      r.render(fxScene, camera);
      r.autoClear = ac;
      this.U.uFxOn.value = 1;
    } else this.U.uFxOn.value = 0;
    // bloom chain
    const B = this.bloomRts, Ups = this.upRts;
    if (B.length && this.grade.bloom > 0 && qp.bloom) {
      (this.mBright.uniforms.uTexel.value as THREE.Vector2).set(1 / this.w, 1 / this.h);
      this.pass(this.mBright, B[0]);
      for (let i = 1; i < B.length; i++) {
        this.mDown.uniforms.tSrc.value = B[i - 1].texture;
        (this.mDown.uniforms.uTexel.value as THREE.Vector2).set(1 / B[i - 1].width, 1 / B[i - 1].height);
        this.pass(this.mDown, B[i]);
      }
      let prev = this.black.texture;
      for (let i = B.length - 1; i >= 0; i--) {
        this.mUp.uniforms.tSrc.value = i === B.length - 1 ? B[i].texture : Ups[i + 1].texture;
        this.mUp.uniforms.tPrev.value = i === B.length - 1 ? this.black.texture : B[i].texture;
        (this.mUp.uniforms.uTexel.value as THREE.Vector2).set(1 / B[i].width, 1 / B[i].height);
        this.pass(this.mUp, Ups[i]);
        prev = Ups[i].texture;
      }
      this.U.tBloom.value = prev;
    } else this.U.tBloom.value = this.black.texture;
    const gr = this.grade;
    this.U.uBloom.value = qp.bloom ? gr.bloom : 0; this.U.uSat.value = gr.sat; this.U.uVig.value = gr.vig; this.U.uFocusK.value = this.focus.k;
    this.U.uNear.value = camera.near; this.U.uFar.value = camera.far; this.U.uTime.value = time;
    this.U.uProj.value = this.h / (2 * Math.tan((camera.fov * Math.PI) / 360));
    // every scene: the camera for the depth -> world reconstruction
    (this.U.uInvProj.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
    (this.U.uCamWorld.value as THREE.Matrix4).copy(camera.matrixWorld);
    (this.U.uCamPos.value as THREE.Vector3).setFromMatrixPosition(camera.matrixWorld);
    (this.U.uViewProj.value as THREE.Matrix4).multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.U.uAOTaps.value = qp.ssaoTaps;
    this.U.uAO.value = qp.ssao && qp.ssaoTaps > 0 ? (ia ? ia.ao : this.ao) : 0;
    this.U.uAORad.value = ia ? ia.aoRadius : 1.15;
    this.U.uTone.value = 0; this.U.uContrast.value = 0;
    this.atmosphere(scene);
    this.interior(ia, camera, qp.beams);
    this.U.uRealism.value = this.realism ? 1 : 0;
    if (!this.realism) { this.U.uSplit.value = 0; if (!ia) this.U.uContrast.value = 0; }
    const tone = this.U.uTone.value as number;
    if (tone > 0.5) {
      // the eye's adaptation (snaps on a new scene, then eases)
      if (this.expoScene !== scene) { this.expoScene = scene; r.setRenderTarget(this.expA); r.setClearColor(0x000000, 0); r.clear(true, false, false); }
      const dt = Math.min(0.25, Math.max(0, time - this.lastT)); this.lastT = time;
      this.mExpo.uniforms.tPrev.value = this.expA.texture;
      this.mExpo.uniforms.uRate.value = 1 - Math.exp(-dt * 1.4);
      this.mExpo.uniforms.uMode.value = tone > 1.5 ? 1 : 0;
      this.mExpo.uniforms.uKey.value = tone > 1.5 ? ia!.key : 0.13;
      this.pass(this.mExpo, this.expB);
      const t = this.expA; this.expA = this.expB; this.expB = t;
      this.U.tExpo.value = this.expA.texture;
    }
    this.blurred = blur;
    if (blur) { this.pass(this.mCompHdr, this.hdr); this.blur.apply(this.hdr.texture, null); }
    else this.pass(this.mComp, null);
  }
  /** contact-shadow strength (SSAO) when the quality tier has it on */
  ao = 0.82;
  /** QA: false renders the sunlit look as it was before the realism pass (no coloured multi-bounce occlusion, no warm
   *  sun / cool shade split, no film curve); interiors switch off by deleting scene.userData.interior */
  realism = true;

  /** the motion blur strength for this scene: the setting, for scenes that opt in (sunlit and interiors by default) */
  private blurK(scene: THREE.Scene) {
    const ud = scene.userData, o = ud.motionBlur;
    const on = typeof o === 'number' ? o : typeof o === 'boolean' ? (o ? 1 : 0) : ud.sun || ud.interior ? 1 : 0;
    return on > 0 ? motionBlurK() * Math.min(1, on) : 0;
  }

  /** the interior's area lights nearest the view, into the shared (view space) uniforms of area-lit materials */
  private areaLights(ia: InteriorLight | undefined, camera: THREE.Camera, on: boolean) {
    const A = AREA_U;
    if (!ia || !on) { A.uAreaN.value = 0; return; }
    const list = ia.pick(camera, AREA_MAX), vm = camera.matrixWorldInverse, n3 = _n3.setFromMatrix4(vm);
    let n = 0;
    for (const a of list) {
      _a.copy(a.pos).applyMatrix4(vm); A.uAreaP.value[n].set(_a.x, _a.y, _a.z, a.range);
      _a.copy(a.u).applyMatrix3(n3); A.uAreaU.value[n].set(_a.x, _a.y, _a.z, 0);
      _a.copy(a.v).applyMatrix3(n3); A.uAreaV.value[n].set(_a.x, _a.y, _a.z, 0);
      A.uAreaC.value[n].set(a.color.r * a.intensity, a.color.g * a.intensity, a.color.b * a.intensity, a.spec);
      n++;
    }
    A.uAreaN.value = n;
  }

  /** interiors: the film look, and the haze glowing under the panels nearest the view and round the practicals */
  private interior(ia: InteriorLight | undefined, camera: THREE.Camera, beams: boolean) {
    const U = this.U;
    if (!ia) { U.uIntr.value = 0; U.uGlowN.value = 0; return; }
    U.uIntr.value = 1; U.uTone.value = 2; U.uFilm.value = ia.film; U.uContrast.value = ia.contrast * ia.film; U.uExpK.value = ia.exposure;
    (U.uSplitLo.value as THREE.Color).copy(ia.splitLo); (U.uSplitHi.value as THREE.Color).copy(ia.splitHi);
    U.uCeilY.value = ia.ceilY; U.uFloorY.value = ia.floorY;
    U.uBeam.value = beams ? ia.haze * 0.0035 : 0;
    let n = 0;
    if (beams && ia.haze > 0) {
      const P = U.uGlowP.value as THREE.Vector4[], C = U.uGlowC.value as THREE.Vector4[];
      for (const a of ia.pick(camera, 10)) {
        if (a.beam <= 0) continue;
        const k = a.intensity * a.beam;
        P[n].set(a.pos.x, a.pos.y - 0.04, a.pos.z, Math.min(a.range, 3.2)); C[n].set(a.color.r * k, a.color.g * k, a.color.b * k, 1); n++;
      }
      const cp = _a.setFromMatrixPosition(camera.matrixWorld);
      const gl = ia.glows.filter((g) => g.on && g.intensity > 0).sort((x, y) => x.pos.distanceToSquared(cp) - y.pos.distanceToSquared(cp));
      for (const g of gl) {
        if (n >= 16) break;
        P[n].set(g.pos.x, g.pos.y, g.pos.z, g.range); C[n].set(g.color.r * g.intensity, g.color.g * g.intensity, g.color.b * g.intensity, 0); n++;
      }
    }
    U.uGlowN.value = n;
  }

  private atmosphere(scene: THREE.Scene) {
    const U = this.U, sun = scene.userData.sun as Sun | undefined;
    if (!sun || sun.light.parent !== scene) { U.uEnv.value = 0; U.uShadowOn.value = 0; U.uSplit.value = 0; U.tShadow.value = this.noShadow.depthTexture; return; }
    const e = sun.env, q = settings.quality, lo = q === 'low';
    U.uEnv.value = 1;
    (U.uSunDir.value as THREE.Vector3).copy(sun.dir).normalize();
    // daylight from the key's strength; the sun's colour as it stands after the day/night grading in the game
    const k = Math.min(1, sun.light.intensity / 3.3), sc = U.uSunCol.value as THREE.Color;
    sc.copy(sun.light.color).multiplyScalar(0.35 + sun.light.intensity * 0.32);
    // haze, mist and the sky in puddles are steps of the master palette's sky ramp, indexed by the light
    const sky = U.uSkyCol.value as THREE.Color, hz = U.uHazeCol.value as THREE.Color, mc = U.uMistCol.value as THREE.Color;
    const S = RAMPS.sky, si = Math.max(0, Math.min(S.length - 1, Math.round(k * 4.4 - sun.overcast * 1.2)));
    sky.setHex(S[Math.min(S.length - 1, si + 1)]); hz.setHex(S[si]); mc.setHex(S[Math.max(0, si - 1)]);
    U.uHaze.value = e.haze; U.uMist.value = e.mist * (lo ? 0.35 : 1); U.uMistY.value = e.mistY; U.uMistH.value = e.mistH; U.uPatch.value = e.patch;
    U.uWet.value = e.wet; U.uRain.value = e.rain; U.uDew.value = e.dew; U.uHeat.value = lo ? 0 : e.heat;
    U.uSnow.value = e.snow; U.uFrost.value = e.frost; U.uIce.value = e.ice; U.uDry.value = e.dry; U.uAutumn.value = e.autumn;
    U.uDust.value = e.dust; U.uAsh.value = e.ash; U.uRed.value = e.red; U.uEclipse.value = e.eclipse; U.uFlash.value = e.flash;
    U.uCloudK.value = lo ? 0 : e.cloudK; U.uAurora.value = e.aurora; U.uDay.value = e.day; U.uNight.value = Math.max(Math.max(0, 1 - e.day * 2.2), e.eclipse) * (1 - e.cloudK * 0.8);
    U.uTone.value = q === 'low' ? 0 : 1;
    // the sky: Rayleigh blue overhead from the fill light, the horizon brighter and warmed by a low sun
    (U.uSunSky.value as THREE.Vector3).copy(e.sunSky).normalize(); (U.uMoonSky.value as THREE.Vector3).copy(e.moonSky).normalize();
    const zen = U.uSkyZen.value as THREE.Color, hor = U.uSkyHor.value as THREE.Color, disk = U.uSunDisk.value as THREE.Color;
    const low = Math.max(0, 1 - Math.abs(e.sunSky.y) * 3);
    disk.copy(sun.light.color).multiplyScalar(e.day > 0.05 ? 1.2 : 0);
    zen.copy(sun.hemi.color).multiplyScalar(0.55 + 0.6 * e.day);
    hor.copy(sun.hemi.color).multiplyScalar(0.8 + 0.7 * e.day).lerp(disk, low * 0.55 * Math.min(1, e.day * 3));
    // dust, ash and the bloodtide colour the air itself
    const dc = _t.setHex(RAMPS.sand[4]).multiplyScalar(0.25 + 0.75 * k);
    if (e.dust > 0) { hz.lerp(dc, e.dust * 0.7); mc.lerp(dc, e.dust * 0.7); hor.lerp(dc, e.dust * 0.8); zen.lerp(dc, e.dust * 0.5); }
    if (e.ash > 0) { const ac = _t.setHex(RAMPS.stone[3]).multiplyScalar(0.3 + 0.7 * k); hz.lerp(ac, e.ash * 0.6); mc.lerp(ac, e.ash * 0.6); zen.lerp(ac, e.ash * 0.6); }
    if (e.red > 0) { const rc = _t.setHex(RAMPS.coral[3]).multiplyScalar(0.3 + 0.7 * k); hz.lerp(rc, e.red * 0.55); mc.lerp(rc, e.red * 0.5); hor.lerp(rc, e.red * 0.7); zen.lerp(_t.setHex(RAMPS.plum[2]), e.red * 0.6); }
    // golden hour: pink-orange in the haze and the mist, a burning horizon
    if (e.golden > 0) { const gc = _t.setHex(RAMPS.coral[5]).multiplyScalar(0.5 + 0.5 * k); hz.lerp(gc, e.golden * 0.35); mc.lerp(gc, e.golden * 0.2); hor.lerp(_t.setHex(RAMPS.rust[6]), e.golden * 0.7); }
    if (e.eclipse > 0) { zen.lerp(_t.setRGB(0.004, 0.006, 0.02), e.eclipse); hor.lerp(_t.setRGB(0.02, 0.03, 0.06), e.eclipse); hz.lerp(_t.setRGB(0.02, 0.03, 0.06), e.eclipse * 0.8); mc.lerp(_t.setRGB(0.04, 0.06, 0.1), e.eclipse * 0.8); }
    (U.uWind.value as THREE.Vector2).copy(e.wind);
    // shafts need the sun's shadow map (it exists after the first shadowed frame)
    const map = sun.light.castShadow ? sun.light.shadow.map : null, dt = map?.depthTexture ?? null;
    const rays = lo || !dt || !dt.compareFunction ? 0 : e.rays;
    // (the shadow map also splits warm sun from cool shade, whenever it exists)
    const sh = !lo && !!dt && !!dt.compareFunction;
    U.uRays.value = rays; U.uShadowOn.value = sh ? 1 : 0; U.uRaySteps.value = q === 'high' ? 12 : 7;
    U.tShadow.value = sh ? dt : this.noShadow.depthTexture;
    if (sh) (U.uShadowM.value as THREE.Matrix4).copy(sun.light.shadow.matrix);
    U.uSplit.value = sh ? 0.5 * Math.min(1, e.day * 1.5) * (1 - sun.overcast * 0.7) * (1 - e.eclipse) : 0;
    // a gentle film S-curve, cool in the shadows and warm in the light, by day
    U.uContrast.value = 0.12 * Math.min(1, 0.4 + e.day);
    (U.uSplitLo.value as THREE.Color).setRGB(0.97, 0.99, 1.03); (U.uSplitHi.value as THREE.Color).setRGB(1.02, 1.0, 0.97);
  }
}
