import * as THREE from 'three';
import { U } from './materials';
import { FxQuality, ZoneFx } from './fxconfig';

/**
 * Realism passes for the pixel renderer. All of them run at (or below) the
 * low internal resolution and are composited before the grade and the
 * ordered-dither quantise, so they come out as chunky pixel art:
 *  - SSAO + soft contact (blob) shadows from the depth / normal MRT buffers
 *  - bloom on bright emissive pixels and light sources (+ lens dirt)
 *  - volumetric light: haze lit by the zone light grid (columns under
 *    fixtures, skylight shafts), the flashlight cone and sun shafts, both
 *    tested against their shadow maps on high quality
 *  - screen-space reflections on wet / glossy floors (gNormal alpha packs
 *    the wet level written by the floor material)
 *  - an exponential ground-mist layer, dust motes in beams, film grain
 */

export const FS_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/** camera basis shared by every pass (updated once per frame by the renderer) */
export const CAMU = {
  uCamPos: { value: new THREE.Vector3() },
  uCamR: { value: new THREE.Vector3(1, 0, 0) },
  uCamU: { value: new THREE.Vector3(0, 1, 0) },
  uCamF: { value: new THREE.Vector3(0, 0, -1) },
  uHalf: { value: new THREE.Vector2(10, 10) },
  uNear: { value: 0.1 },
  uFar: { value: 160 },
  /** metres per low-res pixel */
  uPxM: { value: 1 / 32 },
  uSinPitch: { value: Math.sin(THREE.MathUtils.degToRad(36)) },
  /** floor height under the camera focus (player) */
  uFloorY: { value: 0 },
  /** 1 = the world pass went through a perspective camera (first-person eye, src/fp/eye.ts): uHalf then holds
   * the tangents of the half field of view, depth is hyperbolic, and a pixel's footprint grows with distance */
  uPersp: { value: 0 },
  /** perspective: metres per low-res pixel per metre of distance (2 tan(fovY / 2) / target height) */
  uPxPersp: { value: 0.003 },
};

/** fixtures glowing in the haze (src/gfx/scenefx.ts fills them from the light grid each frame) */
export const GLOW_MAX = 12;
export const GLOWU = {
  /** xyz position, w radius (m) */
  uGlowPos: { value: Array.from({ length: GLOW_MAX }, () => new THREE.Vector4()) },
  /** rgb x intensity x current level (flicker), w 1 for fluorescent tubes */
  uGlowCol: { value: Array.from({ length: GLOW_MAX }, () => new THREE.Vector4()) },
  uGlowN: { value: 0 },
};

/**
 * Eye adaptation: the picture's centre-weighted log-average luminance (before exposure), eased over time in a
 * 1x1 target, so a dim room with dying tubes opens up and a blazing corridor settles (never murky, never
 * blown). The composite turns it into an exposure factor within a narrow band.
 */
export const ADAPTU = {
  tAdapt: { value: null as THREE.Texture | null },
  uAdaptOn: { value: 0 },
  /** the luminance a scene is exposed for (zone exposure applies on top) */
  uAdaptKey: { value: 0.26 },
};

/** flashlight cone shared by the haze march and the motes */
export const SPOTU = {
  uSpotOn: { value: 0 },
  uSpotPos: { value: new THREE.Vector3() },
  uSpotDir: { value: new THREE.Vector3(1, 0, 0) },
  uSpotCos: { value: new THREE.Vector2(0.88, 0.95) },
  uSpotRange: { value: 18 },
  uSpotCol: { value: new THREE.Color(0xffffff) },
  uSpotMat: { value: new THREE.Matrix4() },
  tSpotShadow: { value: null as THREE.Texture | null },
  uSpotShadowOn: { value: 0 },
  uSunOn: { value: 0 },
  uSunCol: { value: new THREE.Color(0xffffff) },
  uSunMat: { value: new THREE.Matrix4() },
  tSunShadow: { value: null as THREE.Texture | null },
};

const COMMON = /* glsl */`
precision highp float;
uniform vec3 uCamPos;
uniform vec3 uCamR;
uniform vec3 uCamU;
uniform vec3 uCamF;
uniform vec2 uHalf;
uniform float uNear;
uniform float uFar;
uniform float uPxM;
uniform float uSinPitch;
uniform float uFloorY;
uniform float uPersp;
uniform float uPxPersp;
varying vec2 vUv;
/** view depth (metres along the camera forward) from the depth buffer */
float lin(float d) { return uPersp > 0.5 ? uNear * uFar / (uFar - d * (uFar - uNear)) : uNear + d * (uFar - uNear); }
/** the view ray through uv: orthographic rays are parallel, perspective ones fan out from the eye */
vec3 rayDir(vec2 uv) { return uCamF + uCamR * ((uv.x * 2.0 - 1.0) * uHalf.x) + uCamU * ((uv.y * 2.0 - 1.0) * uHalf.y); }
vec3 wpos(vec2 uv, float ld) {
  if (uPersp > 0.5) return uCamPos + rayDir(uv) * ld;
  return uCamPos + uCamR * ((uv.x * 2.0 - 1.0) * uHalf.x) + uCamU * ((uv.y * 2.0 - 1.0) * uHalf.y) + uCamF * ld;
}
vec2 toUv(vec3 p, out float ld) {
  vec3 r = p - uCamPos; ld = dot(r, uCamF);
  if (uPersp > 0.5) { float z = max(ld, 1e-3); return vec2(dot(r, uCamR) / (uHalf.x * z), dot(r, uCamU) / (uHalf.y * z)) * 0.5 + 0.5; }
  return vec2(dot(r, uCamR) / uHalf.x, dot(r, uCamU) / uHalf.y) * 0.5 + 0.5;
}
/** where the view ray through uv meets the horizontal plane y (perspective rays that never reach it end far away) */
vec3 onPlane(vec2 uv, float y) {
  if (uPersp > 0.5) {
    vec3 dir = rayDir(uv);
    float t = (y - uCamPos.y) / (abs(dir.y) < 1e-4 ? -1e-4 : dir.y);
    return uCamPos + dir * (t > 0.0 ? min(t, uFar) : uFar);
  }
  vec3 b = wpos(uv, 0.0); return b + uCamF * ((y - b.y) / uCamF.y);
}
/** metres covered by one low-res pixel at view depth ld */
float pxm(float ld) { return uPersp > 0.5 ? max(ld, uNear) * uPxPersp : uPxM; }
// 4x4 ordered dither by bit interleave (a local int array is slow on mobile GPUs and software GL)
float bayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  vec2 lo = mod(q, 2.0), hi = floor(q * 0.5);
  float a = 2.0 * abs(lo.x - lo.y) + lo.y, b = 2.0 * abs(hi.x - hi.y) + hi.y;
  return (4.0 * a + b + 0.5) / 16.0;
}
float h12(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
/** gNormal alpha: outline flag + 2 x wet level + 16 x water + 32 x emitter */
float emitterOf(float a) { return step(31.9, a); }
vec3 unpackFlags(float a) {
  a += 0.01;
  a -= 32.0 * step(32.0, a);
  float water = step(16.0, a); a -= 16.0 * water;
  float wq = floor(a * 0.5);
  return vec3(a - 0.01 - 2.0 * wq, wq / 7.0, water);
}
`;

// ---------------------------------------------------------------- SSAO + blob contact shadows
const AO_FRAG = COMMON + /* glsl */`
uniform sampler2D tDepth;
uniform sampler2D tNormal;
uniform float uRadius;
uniform float uStrength;
uniform vec4 uBlobs[16];
uniform int uBlobN;
uniform float uBlobStr;
uniform float uBlobH[16];
// per body: the three fixtures that light it most (xyz, radius * 10 + intensity / 4)
uniform vec4 uBlobL[48];
uniform float uActSh;
uniform sampler2D uLightTex;
uniform float uGridScale;
#if SS_N > 0
uniform sampler2D uDomTex;
uniform vec4 uLightInfo;
uniform float uSSStr;
// Soft shadows from the key fixture: march the depth buffer from the surface toward the fixture that
// dominates the light here (src/world/lighting.ts domTex). Anything standing in the way (a body, a chair,
// a desk) casts a shadow away from the tube, contact-dark at its foot and fading out with height (a
// troffer is a big soft source); the blur after the pass softens it further.
float keyShadow(vec3 P, vec3 N, float ld) {
  vec2 luv = (P.xz + N.xz * 0.12 - uLightInfo.xy) * uLightInfo.zw;
  if (luv.x <= 0.0 || luv.y <= 0.0 || luv.x >= 1.0 || luv.y >= 1.0) return 1.0;
  vec4 dm = texture2D(uDomTex, luv);
  if (dm.a < 0.05) return 1.0;
  float nT = float(textureSize(uDomTex, 0).x);
  vec2 tc = (floor(luv * nT) + 0.5) / nT / uLightInfo.zw + uLightInfo.xy;
  vec3 V = vec3(tc.x + (dm.r - 0.5) * 32.0, dm.b * 8.0, tc.y + (dm.g - 0.5) * 32.0) - P;
  float dist = length(V);
  vec3 dir = V / max(dist, 1e-3);
  if (dot(N, dir) < 0.05) return 1.0;
  float pm = pxm(ld);
  float maxT = min(dist - 0.3, SS_LEN);
  if (maxT < 0.12) return 1.0;
  vec3 O = P + N * (pm * 1.5 + 0.02);
  float j = bayer4(gl_FragCoord.xy + vec2(2.0, 1.0));
  float occ = 0.0;
  for (int i = 0; i < SS_N; i++) {
    float f = (float(i) + j) / float(SS_N);
    float t = maxT * f * f + pm;
    float sd;
    vec2 su = toUv(O + dir * t, sd);
    if (su.x < 0.0 || su.x > 1.0 || su.y < 0.0 || su.y > 1.0) break;
    float diff = sd - lin(texture2D(tDepth, su).r);
    if (diff > pm * 1.2 + 0.02 && diff < 0.3 + t * 0.35) occ = max(occ, 1.0 - smoothstep(0.0, maxT * 1.15, t) * 0.45);
  }
  return 1.0 - occ * smoothstep(0.05, 0.45, dm.a) * uSSStr;
}
#endif
void main() {
  float dr = texture2D(tDepth, vUv).r;
  if (dr >= 0.99999) { gl_FragColor = vec4(1.0); return; }
  float ld = lin(dr);
  vec3 P = wpos(vUv, ld);
  vec3 N = texture2D(tNormal, vUv).xyz * 2.0 - 1.0;
  float nl = length(N);
  if (nl < 0.5) { gl_FragColor = vec4(1.0); return; }
  N /= nl;
  float ao = 1.0;
#if AO_N > 0
  vec3 T = normalize(cross(N, abs(N.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 B = cross(N, T);
  float ang = bayer4(gl_FragCoord.xy) * 6.2831853;
  float ca = cos(ang), sa = sin(ang);
  float occ = 0.0;
  for (int i = 0; i < AO_N; i++) {
    float fi = (float(i) + 0.5) / float(AO_N);
    float r = sqrt(fi);
    float ph = float(i) * 2.399963;
    vec2 k = vec2(cos(ph), sin(ph)) * r;
    k = vec2(k.x * ca - k.y * sa, k.x * sa + k.y * ca);
    float kz = sqrt(max(0.0, 1.0 - r * r)) + 0.12;
    float sc = uRadius * mix(0.25, 1.0, fi * fi);
    vec3 S = P + (T * k.x + B * k.y + N * kz) * sc;
    float sd;
    vec2 su = toUv(S, sd);
    float bd = lin(texture2D(tDepth, su).r);
    float diff = sd - bd;
    occ += step(0.02, diff) * (1.0 - smoothstep(uRadius * 0.8, uRadius * 2.0, diff));
  }
  ao = 1.0 - clamp(occ / float(AO_N) * uStrength * 1.5, 0.0, 0.85);
#endif
  // soft contact shadows pooled under bodies
  if (N.y > 0.55 && uBlobN > 0) {
    for (int i = 0; i < 16; i++) {
      if (i >= uBlobN) break;
      vec4 b = uBlobs[i];
      float above = b.y - P.y;
      if (above < -0.3 || above > 3.0) continue;
      float rr = b.w * (1.0 + max(above, 0.0) * 0.4);
      float s = 1.0 - smoothstep(rr * 0.3, rr * 1.2, length(P.xz - b.xz));
      s *= 1.0 - clamp(above / 3.0, 0.0, 1.0) * 0.8;
      ao *= 1.0 - s * uBlobStr;
    }
  }
  float ks = 1.0;
#if SS_N > 0
  ks = keyShadow(P, N, ld);
#endif
  // Bodies cast real shadows from each of the (up to three) fixtures lighting them: the ray from this
  // point to the light against the body (an upright capsule), soft in proportion to how far up the body it
  // passes (a long tube is a big source), as dark as that light's share of the light here. Between tubes
  // a survivor stands in two or three faint shadows fanning away, under one in a short dark pool.
  if (uActSh > 0.0 && uBlobN > 0) {
    vec2 luv = (P.xz + N.xz * 0.15 - uLightInfo.xy) * uLightInfo.zw;
    vec3 gq = texture2D(uLightTex, luv).rgb;
    float gl = dot(gq * gq * uGridScale, vec3(0.3, 0.5, 0.2)) + 0.04;
    float as = 1.0;
    for (int i = 0; i < 16; i++) {
      if (i >= uBlobN) break;
      vec4 b = uBlobs[i];
      vec2 rel = P.xz - b.xz;
      float d2 = dot(rel, rel);
      if (d2 > 30.0) continue;
      float bw = b.w * 0.72;
      if (d2 < bw * bw * 2.2 && P.y > b.y + 0.04) continue;
      float bh = uBlobH[i] * 0.92;
      for (int k = 0; k < 3; k++) {
        vec4 L = uBlobL[i * 3 + k];
        if (L.w <= 0.0) continue;
        vec3 toL = L.xyz - P;
        if (toL.y <= 0.1) continue;
        float s0 = clamp((b.y + 0.04 - P.y) / toL.y, 0.0, 1.0), s1 = clamp((b.y + bh - P.y) / toL.y, 0.0, 1.0);
        if (s1 <= s0) continue;
        vec2 a = P.xz + toL.xz * s0, ab = toL.xz * (s1 - s0);
        float t = clamp(dot(b.xz - a, ab) / max(dot(ab, ab), 1e-5), 0.0, 1.0);
        float dm = length(a + ab * t - b.xz);
        float up = mix(s0, s1, t) * length(toL);
        float pen = 0.05 + up * 0.16;
        float occ = 1.0 - smoothstep(bw - pen, bw + pen * 1.6, dm);
        if (occ <= 0.0) continue;
        // this light's share of the light here (the grid's own footprint weight)
        float R = floor(L.w) * 0.1, I = fract(L.w) * 4.0;
        float hy = max(0.6, L.y - 1.0);
        vec2 dl = L.xz - P.xz;
        float tt = clamp(1.0 - sqrt(dot(dl, dl) + hy * hy * 0.35) / R, 0.0, 1.0);
        float share = clamp(tt * tt * (3.0 - 2.0 * tt) * I * 0.93 / gl, 0.0, 1.0);
        as *= 1.0 - occ * min(pow(share, 0.7) * 1.15, 0.88) * uActSh;
      }
    }
    ks = min(ks, as);
  }
  gl_FragColor = vec4(ao, ks, 0.0, 1.0);
}
`;

const AO_BLUR_FRAG = COMMON + /* glsl */`
uniform sampler2D tAO;
uniform sampler2D tDepth;
uniform vec2 uTexel;
void main() {
  float c = lin(texture2D(tDepth, vUv).r);
  vec2 s = vec2(0.0);
  float w = 0.0;
  for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
    vec2 o = (vec2(float(x), float(y)) - 1.5) * uTexel;
    vec2 a = texture2D(tAO, vUv + o).rg;
    float dd = lin(texture2D(tDepth, vUv + o).r);
    float ww = 1.0 / (1.0 + abs(dd - c) * 6.0);
    s += a * ww; w += ww;
  }
  gl_FragColor = vec4(s / w, 0.0, 1.0);
}
`;

// ---------------------------------------------------------------- bloom (dual filter)
const BRIGHT_FRAG = COMMON + /* glsl */`
uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform vec2 uSrcTexel;
uniform float uTh;
uniform float uLitBloom;
void main() {
  // only real emitters bloom (tubes, screens, lamps, embers: flagged by their material); lit surfaces
  // join in only where they blow far past white (a torch hot spot), never a sunny yellow wall
  vec3 c = vec3(0.0);
  for (int y = 0; y < 2; y++) for (int x = 0; x < 2; x++) {
    vec2 o = (vec2(float(x), float(y)) - 0.5) * uSrcTexel;
    vec3 t = texture2D(tColor, vUv + o).rgb;
    float em = emitterOf(texture2D(tNormal, vUv + o).a);
    c += em > 0.5 ? t : max(t - vec3(uTh * 1.6), 0.0) * uLitBloom;
  }
  c *= 0.25;
  float br = max(c.r, max(c.g, c.b));
  float knee = uTh * 0.5;
  float soft = clamp(br - uTh + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float k = max(soft, br - uTh) / max(br, 1e-4);
  gl_FragColor = vec4(min(c * k, vec3(6.0)), 1.0);
}
`;

// eye adaptation (see ADAPTU): 64 centre-weighted taps of the lit scene, log-averaged, eased toward it over time
const ADAPT_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tPrev;
uniform float uK;
varying vec2 vUv;
void main() {
  float s = 0.0, w = 0.0;
  for (int y = 0; y < 8; y++) for (int x = 0; x < 8; x++) {
    vec2 uv = 0.5 + ((vec2(float(x), float(y)) + 0.5) / 8.0 - 0.5) * 0.92;
    // the background (void, sky) is not something the eye adapts to
    if (texture2D(tDepth, uv).r >= 0.99999) continue;
    vec2 d = uv - 0.5;
    float cw = exp(-dot(d, d) * 7.0);
    float l = dot(texture2D(tColor, uv).rgb, vec3(0.2126, 0.7152, 0.0722));
    s += log(min(l, 4.0) + 0.03) * cw; w += cw;
  }
  float prev = texture2D(tPrev, vec2(0.5)).r;
  float cur = w > 0.01 ? exp(s / w) - 0.03 : prev;
  gl_FragColor = vec4(prev <= 0.0 ? cur : mix(prev, cur, uK), 0.0, 0.0, 1.0);
}
`;

const DOWN_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  gl_FragColor = vec4(c / 8.0, 1.0);
}
`;

const UP_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tSrc;
uniform sampler2D tAdd;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 h = uTexel * 0.5;
  vec3 c = texture2D(tSrc, vUv + vec2(-2.0, 0.0) * h).rgb;
  c += texture2D(tSrc, vUv + vec2(-1.0, 1.0) * h).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(0.0, 2.0) * h).rgb;
  c += texture2D(tSrc, vUv + vec2(1.0, 1.0) * h).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(2.0, 0.0) * h).rgb;
  c += texture2D(tSrc, vUv + vec2(1.0, -1.0) * h).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(0.0, -2.0) * h).rgb;
  c += texture2D(tSrc, vUv + vec2(-1.0, -1.0) * h).rgb * 2.0;
  gl_FragColor = vec4(c / 12.0 + texture2D(tAdd, vUv).rgb, 1.0);
}
`;

// ---------------------------------------------------------------- volumetric light (half res)
const LIGHT_PARS = /* glsl */`
uniform sampler2D uLightTex;
uniform vec4 uLightInfo;
uniform float uGridScale;
uniform sampler2D uVisTex;
uniform vec4 uVisInfo;
uniform float uVisOn;
uniform vec3 uPlayerPos;
uniform float uFogNear;
uniform float uFogFar;
uniform float uSpotOn;
uniform vec3 uSpotPos;
uniform vec3 uSpotDir;
uniform vec2 uSpotCos;
uniform float uSpotRange;
uniform vec3 uSpotCol;
vec3 gridAt(vec2 xz) { vec3 g = texture2D(uLightTex, (xz - uLightInfo.xy) * uLightInfo.zw).rgb; return g * g * uGridScale; }
float spotCone(vec3 p) {
  vec3 v = p - uSpotPos;
  float dist = length(v);
  float ca = dot(v, uSpotDir) / max(dist, 1e-3);
  float a = smoothstep(uSpotCos.x, uSpotCos.y, ca);
  float f = clamp(1.0 - dist / uSpotRange, 0.0, 1.0);
  return a * f * f * smoothstep(0.15, 0.6, dist);
}
float visAt(vec2 xz) {
  if (uVisOn < 0.5) return 1.0;
  vec2 v = texture2D(uVisTex, (xz - uVisInfo.xy) * uVisInfo.zw).rg;
  return mix(0.12 + 0.18 * v.g, 1.0, v.r);
}
`;

const VOL_FRAG = COMMON + LIGHT_PARS + /* glsl */`
uniform sampler2D tDepth;
uniform float uDens;
uniform float uFall;
uniform float uTop;
uniform float uGridMul;
uniform float uSpotMul;
uniform vec3 uHaze;
uniform float uSunOn;
uniform vec3 uSunCol;
uniform float uSunMul;
#if GLOW_N > 0
uniform vec4 uGlowPos[GLOW_N];
uniform vec4 uGlowCol[GLOW_N];
uniform int uGlowN;
uniform float uGlowStr;
#endif
#ifdef VOL_SHADOWS
uniform sampler2DShadow tSpotShadow;
uniform mat4 uSpotMat;
uniform float uSpotShadowOn;
uniform sampler2DShadow tSunShadow;
uniform mat4 uSunMat;
float spotShadow(vec3 p) {
  if (uSpotShadowOn < 0.5) return 1.0;
  vec4 sc = uSpotMat * vec4(p, 1.0);
  sc.xyz /= sc.w;
  if (sc.w <= 0.0 || sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0;
  return texture(tSpotShadow, vec3(sc.xy, sc.z - 0.002));
}
float sunShadow(vec3 p) {
  vec4 sc = uSunMat * vec4(p, 1.0);
  if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0;
  return texture(tSunShadow, vec3(sc.xy, sc.z - 0.003));
}
#endif
void main() {
  float dr = texture2D(tDepth, vUv).r;
  vec3 P0, D;
  float tmax;
  if (uPersp > 0.5) {
    // first person: march from the surface back to the eye (the eye stands inside the haze)
    P0 = dr >= 0.99999 ? wpos(vUv, 16.0) : wpos(vUv, lin(dr));
    vec3 tc = uCamPos - P0;
    float L = length(tc);
    D = tc / max(L, 1e-3);
    tmax = min(L, 16.0);
  } else {
    P0 = dr >= 0.99999 ? onPlane(vUv, uFloorY) : wpos(vUv, lin(dr));
    D = -uCamF;
    float top = uFloorY + uTop;
    tmax = (top - P0.y) / max(D.y, 0.05);
    if (tmax <= 0.0) { gl_FragColor = vec4(0.0); return; }
    tmax = min(tmax, 16.0);
  }
  float stepL = tmax / float(VOL_N);
  float j = bayer4(gl_FragCoord.xy);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < VOL_N; i++) {
    float t = (float(i) + j) * stepL;
    vec3 P = P0 + D * t;
    float h = max(P.y - uFloorY, 0.0);
    float dens = uDens * exp(-h * uFall);
    vec3 gl = gridAt(P.xz);
    vec3 L = gl * min(gl * 0.8, vec3(1.6)) * uGridMul * uHaze;
    if (uSpotOn > 0.5) {
      float cone = spotCone(P);
      if (cone > 0.002) {
#ifdef VOL_SHADOWS
        cone *= spotShadow(P);
#endif
        // a torch beam reads much denser than the room haze (dust kicked up close to you)
        L += uSpotCol * cone * uSpotMul * 6.5;
      }
    }
#ifdef VOL_SHADOWS
    if (uSunOn > 0.0) L += uSunCol * (sunShadow(P) * uSunOn * uSunMul * 0.2);
#endif
    acc += L * dens * stepL;
  }
#if GLOW_N > 0
  // the tubes themselves hanging in the dusty air: every near fixture's in-scatter along this ray in closed
  // form (1 / d^2 scatter integrates to an arctangent of the ray's closest approach), so each light reads as a
  // soft glowing body under the ceiling that flickers with its tube. A surface in front of the fixture ends
  // the ray before it gets there, which is all the occlusion the glow needs.
  if (uGlowStr > 0.0) {
    vec3 gacc = vec3(0.0);
    for (int i = 0; i < GLOW_N; i++) {
      if (i >= uGlowN) break;
      vec4 lp = uGlowPos[i];
      vec3 w = lp.xyz - P0;
      float s0 = dot(w, D);
      float tl = uPersp > 0.5 ? tmax : min((lp.y + 0.12 - P0.y) / max(D.y, 0.05), 18.0);
      if (tl <= 0.0) continue;
      float h = sqrt(max(dot(w, w) - s0 * s0, 0.0) + 0.05);
      float I = (atan((tl - s0) / h) - atan(-s0 / h)) / h;
      float fall = clamp(1.0 - h / (lp.w * 0.8), 0.0, 1.0);
      // ceiling fixtures throw their light down: the ray's closest approach above the tube gets none of
      // it, below it all, so each glow hangs as a soft cone toward the floor instead of a ball
      vec3 C = P0 + D * clamp(s0, 0.0, tl);
      float lobe = lp.y > 1.9 ? smoothstep(-0.2, 0.7, (lp.y - C.y) / h) : 1.0;
      gacc += uGlowCol[i].rgb * (I * fall * fall * lobe * mix(0.6, 1.0, uGlowCol[i].w)) * visAt(lp.xz);
    }
    acc += gacc * (uDens * uGlowStr * (uPersp > 0.5 ? 0.45 : 1.0));
  }
#endif
  float fogF = smoothstep(uFogNear, uFogFar, length(P0.xz - uPlayerPos.xz));
  vec3 Pm = P0 + D * (tmax * 0.5);
  float vis = max(visAt(P0.xz + vec2(0.001)), visAt(Pm.xz));
  gl_FragColor = vec4(acc * (1.0 - fogF) * vis * (dr >= 0.99999 ? 0.35 : 1.0), 1.0);
}
`;

// ---------------------------------------------------------------- composite (outline, AO, SSR, haze, mist, bloom, grade, dither)
export const POST_FRAG = COMMON + LIGHT_PARS + /* glsl */`
uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform sampler2D tAO;
uniform sampler2D tVol;
uniform sampler2D tBloom;
uniform sampler2D tBloomWide;
uniform sampler2D tDirt;
uniform vec2 uRes;
uniform float uTime;
uniform float uOutline;
uniform float uEdgeLight;
uniform vec3 uHighlight;
uniform vec3 uLift;
uniform vec3 uGain;
uniform float uGamma;
uniform float uSat;
uniform vec3 uTint;
uniform float uVignette;
uniform float uLevels;
uniform float uGrain;
uniform float uGlitch;
uniform float uPanic;
uniform float uHurt;
uniform float uDesat;
uniform float uWobble;
uniform float uHeat;
uniform float uBlink;
uniform float uCorruptFlash;
uniform float uDream;
uniform float uAOStr;
uniform float uBloomStr;
uniform float uDirtStr;
uniform float uReflect;
uniform vec3 uMistCol;
uniform float uMistDens;
uniform float uMistFall;
uniform float uMistLit;
uniform float uMistMax;
uniform float uMotes;
uniform float uSick;
uniform float uFlicker;
uniform float uFilm;
uniform vec3 uVoid;
uniform float uSunOn;
uniform vec3 uSunCol;
uniform vec2 uSunDir2;
uniform float uSunGlow;
uniform float uExposure;
uniform sampler2D tAdapt;
uniform float uAdaptOn;
uniform float uAdaptKey;
uniform float uKeyShadow;
uniform float uContrast;
uniform vec3 uSplitLo;
uniform vec3 uSplitHi;
#ifdef ACTOR_RIM
uniform vec4 uBlobs[16];
uniform float uBlobH[16];
uniform int uBlobN;
uniform float uRim;
uniform vec3 uRimTint;
#endif
#ifdef SUN_SPLIT
uniform sampler2DShadow tSunShadow;
uniform mat4 uSunMat;
uniform vec3 uSunDir3;
#endif

vec3 toSRGB(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
// exposure with a soft shoulder on luminance only: the picture brightens, lamps and screens roll off
// instead of clipping flat, and every colour keeps its full saturation (the cartoony punch stays)
vec3 toneMap(vec3 c) {
  float L = dot(c, vec3(0.2126, 0.7152, 0.0722));
  const float k = 0.62;
  float Lt = L < k ? L : k + (L - k) / (1.0 + (L - k) / (1.0 - k));
  c *= Lt / max(L, 1e-5);
  // a channel past white burns toward a creamy white at the same luminance instead of clipping to a flat
  // primary (a lit yellow wall stays a gradient under the tube, not a slab of pure yellow); everything
  // inside the gamut keeps its full colour
  float m = max(c.r, max(c.g, c.b));
  if (m > 1.0) c = Lt + (c - Lt) * ((1.0 - Lt) / max(m - Lt, 1e-4));
  return c;
}

#if SSR_N > 0
vec4 traceReflection(vec2 uv, float ld, vec3 N) {
  vec3 R = reflect(uCamF, N);
  vec2 duv = vec2(dot(R, uCamR) / uHalf.x, dot(R, uCamU) / uHalf.y) * 0.5;
  float dld = dot(R, uCamF);
  float t = 0.0;
  float j = bayer4(gl_FragCoord.xy) * 0.06;
  for (int i = 0; i < SSR_N; i++) {
    t += 0.06 + t * 0.14 + j;
    vec2 su = uv + duv * t;
    if (su.x < 0.0 || su.x > 1.0 || su.y < 0.0 || su.y > 1.0) break;
    float rd = ld + dld * t;
    float bd = lin(texture2D(tDepth, su).r);
    float dz = rd - bd;
    if (dz > 0.02 && dz < 0.3 + t * 0.12) {
      vec2 e = min(su, 1.0 - su);
      float fade = smoothstep(0.0, 0.08, min(e.x, e.y)) * (1.0 - float(i) / float(SSR_N));
      return vec4(texture2D(tColor, su).rgb, fade);
    }
  }
  return vec4(0.0);
}
#endif

void main() {
  vec2 px = 1.0 / uRes;
  vec2 uv = vUv;
  // --- mental state wobble / dream warp ---
  if (uWobble > 0.001) {
    uv.x += sin(uv.y * 18.0 + uTime * 1.3) * 0.004 * uWobble;
    uv.y += cos(uv.x * 14.0 + uTime * 1.1) * 0.003 * uWobble;
  }
  // --- heat shimmer (the Ledge): fine ripples rising up the picture, strongest low on the screen ---
  if (uHeat > 0.001) {
    float hr = (1.0 - uv.y) * 0.6 + 0.4;
    uv.x += (sin(uv.y * 92.0 - uTime * 5.3) * 0.6 + sin(uv.y * 41.0 - uTime * 3.1 + uv.x * 9.0) * 0.4) * 0.0016 * uHeat * hr;
    uv.y += sin(uv.x * 63.0 + uTime * 2.2) * 0.0009 * uHeat * hr;
  }
  // --- glitch: tearing bands ---
  if (uGlitch > 0.001) {
    float band = floor(uv.y * uRes.y / 3.0);
    float t = floor(uTime * 12.0);
    float r = h12(vec2(band, t));
    if (r < uGlitch * 0.12) uv.x += (h12(vec2(t, band)) - 0.5) * 0.08 * uGlitch;
    float blk = h12(floor(uv * uRes / 8.0) + t);
    if (blk < uGlitch * 0.015) uv = floor(uv * uRes / 8.0) * 8.0 / uRes + vec2(h12(vec2(t)) * 0.02, 0.0);
  }
  uv = (floor(uv * uRes) + 0.5) / uRes;

  vec3 c = texture2D(tColor, uv).rgb;
  vec4 nA = texture2D(tNormal, uv);
  vec3 fl = unpackFlags(nA.a);
  vec3 n = nA.xyz * 2.0 - 1.0;
  float dRaw = texture2D(tDepth, uv).r;
  float d = lin(dRaw);
  bool isVoid = dRaw >= 0.99999;
  vec3 P = isVoid ? onPlane(uv, uFloorY) : wpos(uv, d);

  // --- reflections on wet and polished floors ---
#if SSR_N > 0
  if (uPersp < 0.5 && fl.y > 0.01 && n.y > 0.7 && !isVoid) {
    vec3 N = vec3(0.0, 1.0, 0.0);
    if (fl.z > 0.5) N = normalize(vec3(sin(P.x * 3.1 + uTime * 1.7) * 0.05 + sin(P.z * 5.3 - uTime * 2.3) * 0.03, 1.0, cos(P.z * 2.7 + uTime * 1.3) * 0.05 + sin(P.x * 4.7 + uTime * 2.1) * 0.03));
    vec4 rf = traceReflection(uv, d, N);
    float k = fl.y * uReflect * (fl.z > 0.5 ? 0.55 : 0.4) * rf.a;
    c = c * (1.0 - k * 0.7) + rf.rgb * k * 0.85;
#ifdef DEBUG_VIEW
    if (DEBUG_VIEW == 6) { gl_FragColor = vec4(rf.rgb * rf.a + vec3(0.0, 0.0, 0.15), 1.0); return; }
#endif
  }
#endif

  // --- ambient occlusion + contact shadows ---
#ifdef AO_ON
  bool hlPx = abs(fl.x - 0.5) < 0.1;
  if (!hlPx) {
    vec2 aos = texture2D(tAO, uv).rg;
    // only light sources (and a torch's blown-out hot spot) escape contact shadow: a brightly lit wall still
    // darkens into its corners and skirting, which is most of what makes a lit room read as real
    float bright = emitterOf(nA.a) > 0.5 ? 1.0 : clamp(max(c.r, max(c.g, c.b)) - 3.0, 0.0, 1.0);
    c *= mix(1.0, aos.r, uAOStr * (1.0 - bright));
    // the key fixture's shadow takes away its direct light; the bounce and ambient stay
    if (uKeyShadow > 0.0 && aos.g < 0.999) {
      float gl = dot(gridAt(P.xz + n.xz * 0.2), vec3(0.3, 0.5, 0.2));
      c *= mix(1.0, aos.g, (gl / (gl + 0.14)) * (1.0 - bright) * uKeyShadow);
    }
  }
#endif

  // --- outlines: one low-res pixel, like hand-drawn sprites ---
  // silhouettes: the pixel just OUTSIDE anything outlineable that stands clearly in front of it turns
  // near-black, so the object keeps every pixel of its own detail; creases: a concave fold (wall meets
  // floor, a drawer in its carcass) gets a dark line on its far side, a convex top edge a 1px light lip.
  // Everything keys off depth + gNormal at the snapped low-res grid, so it is stable while the camera pans.
  vec2 offs[4] = vec2[4](vec2(0.0, px.y), vec2(0.0, -px.y), vec2(px.x, 0.0), vec2(-px.x, 0.0));
  float sil = 0.0, crease = 0.0, lip = 0.0, hlEdge = 0.0;
  bool isHl = abs(fl.x - 0.5) < 0.1;
  float outlineable = step(0.25, fl.x);
  float pm = pxm(d);
  float thr = 0.06 + pm * 2.6 + d * 0.0015;
  if (uPersp > 0.5) {
    // perspective: a surface seen edge-on steps a long way in depth between neighbouring pixels
    float c = abs(dot(n, normalize(P - uCamPos)));
    thr = 0.05 + d * 0.025 + pm * 2.2 / max(c, 0.12);
  }
  for (int i = 0; i < 4; i++) {
    vec2 o = uv + offs[i];
    float dnr = texture2D(tDepth, o).r;
    float dn = lin(dnr);
    vec4 nb = texture2D(tNormal, o);
    float nbFlag = unpackFlags(nb.a).x;
    float dd = d - dn;                        // > 0: the neighbour is nearer the camera
    bool nbLine = nbFlag > 0.25 && dnr < 0.99999;
    // a clear step in depth, or the edge where an object stands on (or hangs over) un-inked ground
    if (nbLine && (dd > thr || (outlineable < 0.5 && !isVoid && dd > -thr))) sil = 1.0;
    if (!isVoid && outlineable > 0.5 && nbLine && abs(dd) < thr) {
      vec3 nn = nb.xyz * 2.0 - 1.0;
      float bend = 1.0 - dot(n, nn);
      if (bend > 0.22) {
        float side = dot(wpos(o, dn) - P, n);
        float k = smoothstep(0.22, 0.6, bend);
        if (side > pm * 0.12) { if (dd >= 0.0) crease = max(crease, k); }
        else if (side < -pm * 0.12 && n.y > 0.45) lip = max(lip, k);
      }
    }
    bool nbHl = abs(nbFlag - 0.5) < 0.1;
    if (nbHl && !isHl) hlEdge = 1.0;
  }
  c *= 1.0 - crease * 0.42 * uOutline;
  c *= 1.0 + lip * uEdgeLight;
  // the silhouette itself is inked after the grade (below) so haze, bloom and lift never wash it out
  float silK = sil * uOutline * (1.0 - smoothstep(uFogNear, uFogFar, length(P.xz - uPlayerPos.xz)) * 0.85);
  if (isHl) c = c * 1.18 + uHighlight * 0.06;
  if (hlEdge > 0.5) c = mix(c, uHighlight, 0.85);

  // --- survivors and creatures: a soft top / rim light so they read against busy floors ---
#ifdef ACTOR_RIM
  if (uRim > 0.0 && !isVoid && outlineable > 0.5 && sil < 0.5) {
    float act = 0.0;
    for (int i = 0; i < 16; i++) {
      if (i >= uBlobN) break;
      vec4 b = uBlobs[i];
      float h = P.y - b.y;
      if (h < 0.04 || h > uBlobH[i]) continue;
      act = max(act, 1.0 - smoothstep(b.w * 1.1, b.w * 1.6, length(P.xz - b.xz)));
    }
    if (act > 0.0) {
      float fres = 1.0 - clamp(abs(dot(n, uCamF)), 0.0, 1.0);
      float top = clamp(n.y, 0.0, 1.0);
      vec3 lit = min(gridAt(P.xz), vec3(1.5));
      c += (lit * 0.6 + uRimTint) * (fres * fres * 0.55 + top * 0.22 + 0.04) * act * uRim;
    }
  }
#endif

  // --- outdoors: warm where the sun lands, cool sky-fill in the shade ---
#ifdef SUN_SPLIT
  if (uSunOn > 0.0 && uSunGlow > 0.0 && !isVoid) {
    vec4 sc = uSunMat * vec4(P + n * 0.06, 1.0);
    float lit = 1.0;
    if (sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0 && sc.z < 1.0) lit = texture(tSunShadow, vec3(sc.xy, sc.z - 0.003));
    lit *= smoothstep(0.0, 0.25, dot(n, uSunDir3));
    float k = clamp(uSunGlow, 0.0, 1.2) * 0.5;
    c *= mix(vec3(1.0), mix(vec3(0.84, 0.9, 1.1), vec3(1.08, 1.0, 0.86), lit), k);
  }
#endif

  // --- ground mist, lit by what's around it ---
#ifdef MIST_ON
  if (!isVoid && uMistDens > 0.0) {
    float h0 = max(P.y - uFloorY, 0.0);
    float od = uPersp > 0.5
      ? uMistDens * min(length(P - uCamPos), 30.0) * exp(-h0 * uMistFall) * 0.6
      : uMistDens * exp(-h0 * uMistFall) / (uMistFall * uSinPitch);
    float m = min(1.0 - exp(-od), uMistMax);
    vec3 lg = gridAt(P.xz);
    vec3 mc = uMistCol * (0.07 + uMistLit * min(lg, vec3(2.5)) * 0.55);
    float fogF = smoothstep(uFogNear, uFogFar, length(P.xz - uPlayerPos.xz));
    m *= visAt(P.xz) * (1.0 - fogF * 0.6);
    c = mix(c, mc, m);
    silK *= 1.0 - m * 0.8;
  }
#endif

  // --- volumetric light (haze, cones, shafts) ---
#ifdef VOL_ON
  // the march is jittered per pixel at half resolution: a 4-tap box over one jitter period
  // gives smooth haze instead of a screen-door pattern on flat walls
  {
    vec2 hv = px * 1.0;
    vec3 vol = texture2D(tVol, vUv + vec2(-hv.x, -hv.y)).rgb + texture2D(tVol, vUv + vec2(hv.x, -hv.y)).rgb
             + texture2D(tVol, vUv + vec2(-hv.x, hv.y)).rgb + texture2D(tVol, vUv + vec2(hv.x, hv.y)).rgb;
    c += vol * 0.25;
  }
#endif

  // --- dust motes drifting in the beams ---
#ifdef MOTES_ON
  // motes only show in strong light: one look at the light halfway up the ray first, so the dark
  // (most of the frame) skips the three layers entirely
  bool moteLight = uSpotOn > 0.5 || uSunOn > 0.0 || uPersp > 0.5;
  if (!moteLight && uMotes > 0.0) moteLight = dot(gridAt(onPlane(uv, uFloorY + 1.15).xz), vec3(0.3, 0.5, 0.2)) > 0.3;
  if (uMotes > 0.0 && moteLight) {
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      float hy = uFloorY + 0.45 + fk * 0.7;
      vec3 Q = onPlane(uv, hy);
      float tq = dot(Q - uCamPos, uCamF);
      if (!isVoid && tq > d) continue;
      vec2 g = Q.xz * 2.1 + vec2(uTime * 0.05, uTime * 0.035) * (1.0 + fk * 0.5) + fk * 17.3;
      vec2 id = floor(g);
      float hs = h12(id + fk * 31.0);
      if (hs < 0.88) continue;
      vec2 mp = vec2(h12(id + 3.1), h12(id + 7.7)) * 0.8 + 0.1 + vec2(sin(uTime * 0.8 + hs * 40.0), cos(uTime * 0.6 + hs * 30.0)) * 0.07;
      vec2 dl = (fract(g) - mp) / 2.1;
      vec3 d3 = vec3(dl.x, 0.0, dl.y);
      float dpx = length(vec2(dot(d3, uCamR), dot(d3, uCamU))) / pxm(max(tq, 0.05));
      if (dpx > 0.75) continue;
      vec3 L = gridAt(Q.xz);
      if (uSpotOn > 0.5) L += uSpotCol * spotCone(Q) * 2.5;
      if (uSunOn > 0.0) L += uSunCol * 0.45;
      float lum = dot(L, vec3(0.3, 0.5, 0.2));
      float tw = 0.55 + 0.45 * sin(uTime * 2.3 + hs * 60.0);
      c += L * smoothstep(0.6, 2.2, lum) * uMotes * tw * 0.22 * visAt(Q.xz);
    }
  }
#endif

  // --- low sun: warm scattering toward the sun's side of the frame ---
  if (uSunGlow > 0.0 && uSunOn > 0.0) {
    float sg = clamp(dot(vUv - 0.5, uSunDir2) * 1.1 + 0.45, 0.0, 1.0);
    c += uSunCol * (sg * sg * uSunGlow * 0.05) * visAt(P.xz);
  }

  // --- bloom + lens dirt ---
#ifdef BLOOM_ON
  // a tight glow, stepped into a few bands so it reads as pixel-art halo rings instead of a smear
  vec3 bl = texture2D(tBloom, uv).rgb * uBloomStr;
  float blm = max(bl.r, max(bl.g, bl.b));
  c += bl * (floor(blm * 10.0 + 0.35) / 10.0) / max(blm, 1e-4);
#ifdef DIRT_ON
  c += texture2D(tDirt, vUv).rgb * texture2D(tBloomWide, vUv).rgb * uDirtStr;
#endif
#endif

#ifdef DEBUG_VIEW
  // dev: 1 AO, 2 wet / water / outline flags, 3 haze, 4 bloom, 5 normals
  if (DEBUG_VIEW == 1) c = vec3(texture2D(tAO, uv).r);
  if (DEBUG_VIEW == 2) c = vec3(fl.y, fl.z, fl.x * 0.5);
  if (DEBUG_VIEW == 3) c = texture2D(tVol, vUv).rgb * 4.0;
  if (DEBUG_VIEW == 4) c = texture2D(tBloom, vUv).rgb;
  if (DEBUG_VIEW == 5) c = n * 0.5 + 0.5;
  if (DEBUG_VIEW == 7) c = vec3(texture2D(tAO, uv).g);
  gl_FragColor = vec4(c, 1.0);
  return;
#endif
  // --- exposure + filmic tonemap, then grading (in display space) ---
  float adK = 1.0;
  if (uAdaptOn > 0.5) adK = clamp(pow(uAdaptKey / max(texture2D(tAdapt, vec2(0.5)).r, 1e-3), 0.5), 0.82, 1.45);
  c = toSRGB(toneMap(c * uExposure * adK));
  c = max(c * uGain + uLift, 0.0);
  c = pow(c, vec3(1.0 / uGamma));
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSat * (1.0 - uDesat));
  c *= uTint;
  // fluorescent sickness: olive shadows and the faint flutter of old tubes
  if (uSick > 0.001) {
    c = mix(c, c * vec3(0.95, 1.04, 0.82), uSick * 0.45 * (1.0 - clamp(l * 1.4, 0.0, 1.0)));
    float fl2 = step(0.972, h12(vec2(floor(uTime * 16.0), 3.7))) * 0.04 + sin(uTime * 113.0) * 0.004;
    c *= 1.0 - fl2 * uSick * uFlicker;
  }
  // dream haze: lifted pastel bloom
  if (uDream > 0.001) c = mix(c, c * 0.8 + vec3(0.18, 0.16, 0.22), uDream * 0.35);

  // --- vignette / panic / hurt ---
  vec2 q = vUv - 0.5;
  float vig = dot(q, q) * 2.0;
  c *= 1.0 - vig * uVignette;
  float beat = pow(0.5 + 0.5 * sin(uTime * (5.0 + uPanic * 5.0)), 6.0);
  c = mix(c, vec3(0.35, 0.0, 0.02), clamp(vig * uPanic * (0.5 + 0.5 * beat), 0.0, 0.7));
  c = mix(c, vec3(0.55, 0.0, 0.0), clamp(uHurt * (0.25 + vig), 0.0, 0.8));
  if (uCorruptFlash > 0.001) {
    float ch = mod(floor(vUv.x * uRes.x / 6.0) + floor(vUv.y * uRes.y / 6.0), 2.0);
    c = mix(c, mix(vec3(1.0, 0.0, 1.0), vec3(0.0), ch), uCorruptFlash * step(h12(floor(vUv * uRes / 6.0) + floor(uTime * 20.0)), 0.25));
  }
  // blink (exhaustion): eyelids close from top & bottom
  if (uBlink > 0.001) {
    float lid = abs(vUv.y - 0.5) * 2.0;
    c *= smoothstep(1.0 - uBlink * 1.1, 1.0 - uBlink * 1.1 + 0.15, 1.0 - lid);
  }
  // --- dark-art contrast: a light S-curve over a lifted floor (shadows sit near 10% grey, not black),
  // barely-cool shadows and barely-warm light (no colour wash over the frame) ---
  // per zone: a split tone like the intake cinematic (cold fluorescent shadows, amber spill in the light)
  {
    vec3 sc = clamp(c, 0.0, 1.0);
    c = mix(c, sc * sc * (3.0 - 2.0 * sc), uContrast);
    c = c * 0.965 + 0.022;
    float ly = dot(c, vec3(0.299, 0.587, 0.114));
    c *= mix(uSplitLo, uSplitHi, smoothstep(0.04, 0.85, ly));
  }
  // --- ink: the silhouette outline (computed above), true near-black after the grade ---
  c = mix(c, uLift * 0.35, clamp(silK, 0.0, 1.0) * 0.95);
  // --- posterise to a clean palette: round to the nearest level, no ordered dither (no screen-door
  // pattern on flat walls); a whisper of grain below one level step so it never flickers band edges ---
  c = floor(max(c, 0.0) * uLevels + 0.5) / uLevels;
  float gl2 = dot(c, vec3(0.299, 0.587, 0.114));
  c += (h12(floor(vUv * uRes) + floor(uTime * 12.0) * 7.31) - 0.5) * min(uGrain * uFilm, 0.35 / uLevels) * (0.4 + gl2);
  gl_FragColor = vec4(c, 1.0);
}
`;

/** procedural lens dirt: soft smudges, a few fingerprints' worth of arcs, fine specks */
function makeDirt(): THREE.DataTexture {
  const W = 192, H = 108;
  const d = new Uint8Array(W * H * 4);
  let s = 0x9e3779b9;
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
  const f = new Float32Array(W * H);
  const blob = (cx: number, cy: number, r: number, a: number) => {
    for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(H, Math.ceil(cy + r)); y++) for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(W, Math.ceil(cx + r)); x++) {
      const k = 1 - Math.hypot(x - cx, (y - cy) * 1.1) / r;
      if (k > 0) f[y * W + x] += a * k * k;
    }
  };
  for (let i = 0; i < 26; i++) blob(rnd() * W, rnd() * H, 8 + rnd() * 26, 0.12 + rnd() * 0.25);
  for (let i = 0; i < 4; i++) {
    const cx = rnd() * W, cy = rnd() * H, r = 10 + rnd() * 14;
    for (let a = 0; a < 6.28; a += 0.04) blob(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8, 1.6, 0.1);
  }
  for (let i = 0; i < 160; i++) blob(rnd() * W, rnd() * H, 0.8 + rnd() * 1.8, 0.4 + rnd() * 0.6);
  for (let i = 0; i < W * H; i++) {
    const x = i % W, y = (i / W) | 0;
    // dirt reads more toward the frame edges
    const e = Math.min(1, 0.45 + Math.hypot(x / W - 0.5, y / H - 0.5) * 1.4);
    const v = Math.min(1, f[i] * e);
    d[i * 4] = v * 255; d[i * 4 + 1] = v * 240; d[i * 4 + 2] = v * 215; d[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

const rtOpts = (linear: boolean, half: boolean): THREE.RenderTargetOptions => ({
  minFilter: linear ? THREE.LinearFilter : THREE.NearestFilter,
  magFilter: linear ? THREE.LinearFilter : THREE.NearestFilter,
  depthBuffer: false,
  type: half ? THREE.HalfFloatType : THREE.UnsignedByteType,
  generateMipmaps: false,
});

export interface FxInputs {
  color: THREE.Texture;
  normal: THREE.Texture;
  depth: THREE.Texture;
}

/**
 * Owns the extra low-res targets and materials. The renderer calls run()
 * between the scene pass and the composite, then binds composite uniforms.
 */
export class PostFX {
  q!: FxQuality;
  zone!: ZoneFx;
  /** bodies for contact shadows: x, base y, z, radius */
  blobs: THREE.Vector4[] = Array.from({ length: 16 }, () => new THREE.Vector4());
  /** body heights (m) for the actor rim light and their cast shadows */
  blobH = new Float32Array(16);
  /** per body the three fixtures lighting it most (src/world/lighting.ts lightsFor) */
  blobL: THREE.Vector4[] = Array.from({ length: 48 }, () => new THREE.Vector4());
  blobN = 0;
  /** photo mode / debug: skip all realism passes */
  bypass = false;
  readonly dirt = makeDirt();

  private W = 0; private H = 0;
  private rtAO: THREE.WebGLRenderTarget | null = null;
  private rtAO2: THREE.WebGLRenderTarget | null = null;
  private rtB: THREE.WebGLRenderTarget[] = [];
  private rtU: THREE.WebGLRenderTarget[] = [];
  private rtVol: THREE.WebGLRenderTarget | null = null;
  private rtAd: THREE.WebGLRenderTarget[] = [];
  private adCur = 0;
  private adT = 0;
  private adaptMat: THREE.ShaderMaterial;
  private aoMat: THREE.ShaderMaterial;
  private aoBlurMat: THREE.ShaderMaterial;
  private brightMat: THREE.ShaderMaterial;
  private downMat: THREE.ShaderMaterial;
  private upMat: THREE.ShaderMaterial;
  private volMat: THREE.ShaderMaterial;
  private black: THREE.DataTexture;

  constructor() {
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.black.needsUpdate = true;
    const lightU = {
      uLightTex: U.uLightTex, uLightInfo: U.uLightInfo, uGridScale: U.uGridScale, uVisTex: U.uVisTex, uVisInfo: U.uVisInfo, uVisOn: U.uVisOn,
      uPlayerPos: U.uPlayerPos, uFogNear: U.uFogNear, uFogFar: U.uFogFar,
    };
    const mk = (frag: string, uniforms: Record<string, any>, defines: Record<string, any> = {}) => new THREE.ShaderMaterial({
      vertexShader: FS_VERT, fragmentShader: frag, depthTest: false, depthWrite: false, uniforms, defines,
    });
    this.aoMat = mk(AO_FRAG, {
      ...CAMU, tDepth: { value: null }, tNormal: { value: null }, uRadius: { value: 0.55 }, uStrength: { value: 1 },
      uBlobs: { value: this.blobs }, uBlobN: { value: 0 }, uBlobStr: { value: 0.45 },
      uDomTex: U.uDomTex, uLightInfo: U.uLightInfo, uSSStr: { value: 0.6 },
      uBlobH: { value: this.blobH }, uBlobL: { value: this.blobL }, uActSh: { value: 0.8 }, uLightTex: U.uLightTex, uGridScale: U.uGridScale,
    }, { AO_N: 8, SS_N: 0, SS_LEN: '2.4' });
    this.aoBlurMat = mk(AO_BLUR_FRAG, { ...CAMU, tAO: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.brightMat = mk(BRIGHT_FRAG, { ...CAMU, tColor: { value: null }, tNormal: { value: null }, uSrcTexel: { value: new THREE.Vector2() }, uTh: { value: 1 }, uLitBloom: { value: 0.35 } });
    this.downMat = mk(DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.adaptMat = mk(ADAPT_FRAG, { tColor: { value: null }, tDepth: { value: null }, tPrev: { value: null }, uK: { value: 1 } });
    this.rtAd = [0, 1].map(() => new THREE.WebGLRenderTarget(1, 1, rtOpts(false, true)));
    this.upMat = mk(UP_FRAG, { tSrc: { value: null }, tAdd: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.volMat = mk(VOL_FRAG, {
      ...CAMU, ...lightU, ...SPOTU, tDepth: { value: null },
      uDens: { value: 0.015 }, uFall: { value: 0.2 }, uTop: { value: 2.8 }, uGridMul: { value: 1 }, uSpotMul: { value: 1 }, uSunMul: { value: 0 }, uHaze: { value: new THREE.Vector3(1, 1, 1) },
      ...GLOWU, uGlowStr: { value: 1 },
    }, { VOL_N: 12, GLOW_N: 0 });
  }

  /** composite material defines for the current quality */
  /** dev: composite shows one buffer (1 AO, 2 flags, 3 haze, 4 bloom, 5 normals, 6 reflections, 7 key-light shadow) */
  debugView = 0;

  compositeDefines(): Record<string, any> {
    const q = this.q, on = !this.bypass;
    const d: Record<string, any> = { SSR_N: on ? q.ssr : 0 };
    if (this.debugView) d.DEBUG_VIEW = this.debugView;
    if (on && (q.ao > 0 || q.blobs > 0)) d.AO_ON = 1;
    // lens dirt is a smear over the whole frame: never in the crisp pixel look
    if (on && q.bloom > 0) d.BLOOM_ON = 1;
    if (on && q.vol > 0) d.VOL_ON = 1;
    if (on && q.motes) d.MOTES_ON = 1;
    if (on && q.split) d.SUN_SPLIT = 1;
    if (on) d.ACTOR_RIM = 1;
    if (q.mist) d.MIST_ON = 1;
    return d;
  }

  setQuality(q: FxQuality) {
    this.q = q;
    this.aoMat.defines.AO_N = this.bypass ? 0 : q.ao;
    this.aoMat.defines.SS_N = this.bypass ? 0 : q.ss;
    this.aoMat.needsUpdate = true;
    this.volMat.defines.VOL_N = Math.max(1, q.vol);
    this.volMat.defines.GLOW_N = Math.min(GLOW_MAX, q.glow);
    if (q.volShadows) this.volMat.defines.VOL_SHADOWS = 1; else delete this.volMat.defines.VOL_SHADOWS;
    this.volMat.needsUpdate = true;
    if (this.W) this.setSize(this.W, this.H, true);
  }

  setSize(W: number, H: number, force = false) {
    if (!force && W === this.W && H === this.H) return;
    this.W = W; this.H = H;
    this.rtAO?.dispose(); this.rtAO2?.dispose(); this.rtVol?.dispose();
    for (const r of this.rtB) r.dispose();
    for (const r of this.rtU) r.dispose();
    this.rtB = []; this.rtU = [];
    this.rtAO = this.rtAO2 = this.rtVol = null;
    const q = this.q;
    if (q.ao > 0 || q.blobs > 0) {
      const aw = q.aoHalf ? Math.ceil(W / 2) : W, ah = q.aoHalf ? Math.ceil(H / 2) : H;
      this.rtAO = new THREE.WebGLRenderTarget(aw, ah, rtOpts(false, false));
      this.rtAO2 = new THREE.WebGLRenderTarget(aw, ah, rtOpts(true, false));
    }
    if (q.bloom > 0) {
      let w = W, h = H;
      for (let i = 0; i < q.bloom; i++) { w = Math.max(2, Math.ceil(w / 2)); h = Math.max(2, Math.ceil(h / 2)); this.rtB.push(new THREE.WebGLRenderTarget(w, h, rtOpts(true, true))); }
      for (let i = 0; i < q.bloom - 1; i++) this.rtU.push(new THREE.WebGLRenderTarget(this.rtB[i].width, this.rtB[i].height, rtOpts(true, true)));
    }
    if (q.vol > 0) this.rtVol = new THREE.WebGLRenderTarget(Math.ceil(W / 2), Math.ceil(H / 2), rtOpts(true, true));
  }

  dispose() {
    this.rtAO?.dispose(); this.rtAO2?.dispose(); this.rtVol?.dispose();
    for (const r of this.rtB) r.dispose();
    for (const r of this.rtU) r.dispose();
  }

  /** run the passes; returns the textures the composite needs */
  run(pass: (m: THREE.ShaderMaterial, rt: THREE.WebGLRenderTarget) => void, inp: FxInputs, z: ZoneFx) {
    const q = this.q;
    const out = { ao: this.black as THREE.Texture, vol: this.black as THREE.Texture, bloom: this.black as THREE.Texture, wide: this.black as THREE.Texture };
    const on = !this.bypass;
    if (this.rtAO && this.rtAO2 && on && (q.ao > 0 || q.blobs > 0)) {
      const u = this.aoMat.uniforms;
      u.tDepth.value = inp.depth; u.tNormal.value = inp.normal;
      u.uStrength.value = z.ao; u.uBlobN.value = Math.min(this.blobN, q.blobs); u.uBlobStr.value = z.blob;
      u.uSSStr.value = z.keyShadow;
      u.uActSh.value = z.actorShadow;
      pass(this.aoMat, this.rtAO);
      const b = this.aoBlurMat.uniforms;
      b.tAO.value = this.rtAO.texture; b.tDepth.value = inp.depth; b.uTexel.value.set(1 / this.rtAO.width, 1 / this.rtAO.height);
      pass(this.aoBlurMat, this.rtAO2);
      out.ao = this.rtAO2.texture;
    }
    if (on && this.rtB.length) {
      const bu = this.brightMat.uniforms;
      bu.tColor.value = inp.color; bu.tNormal.value = inp.normal; bu.uSrcTexel.value.set(1 / this.W, 1 / this.H); bu.uTh.value = z.bloomTh;
      pass(this.brightMat, this.rtB[0]);
      const du = this.downMat.uniforms;
      for (let i = 1; i < this.rtB.length; i++) {
        du.tSrc.value = this.rtB[i - 1].texture; du.uTexel.value.set(1 / this.rtB[i - 1].width, 1 / this.rtB[i - 1].height);
        pass(this.downMat, this.rtB[i]);
      }
      const uu = this.upMat.uniforms;
      let src = this.rtB[this.rtB.length - 1];
      for (let i = this.rtB.length - 2; i >= 0; i--) {
        uu.tSrc.value = src.texture; uu.tAdd.value = this.rtB[i].texture; uu.uTexel.value.set(1 / src.width, 1 / src.height);
        pass(this.upMat, this.rtU[i]);
        src = this.rtU[i];
      }
      out.bloom = src.texture;
      out.wide = this.rtB[this.rtB.length - 1].texture;
    }
    // eye adaptation: ~1.2 s to settle, a level change (zone, eye view) restarts from the new picture
    if (on) {
      const now = performance.now(), dt = this.adT ? Math.min(0.25, (now - this.adT) / 1000) : 1;
      this.adT = now;
      const a = this.adaptMat.uniforms, src = this.rtAd[this.adCur], dst = this.rtAd[1 - this.adCur];
      a.tColor.value = inp.color; a.tDepth.value = inp.depth; a.tPrev.value = src.texture;
      a.uK.value = 1 - Math.exp(-dt * 1.8);
      pass(this.adaptMat, dst);
      this.adCur = 1 - this.adCur;
      ADAPTU.tAdapt.value = dst.texture;
    }
    ADAPTU.uAdaptOn.value = on ? 1 : 0;
    if (on && this.rtVol) {
      const v = this.volMat.uniforms;
      v.tDepth.value = inp.depth;
      v.uDens.value = z.hazeDens; v.uFall.value = z.hazeFall; v.uTop.value = z.volTop; v.uGridMul.value = z.gridMul; v.uSpotMul.value = z.spotMul;
      v.uSunMul.value = z.sunShafts; v.uHaze.value.set(z.haze[0], z.haze[1], z.haze[2]);
      v.uGlowStr.value = z.glow;
      pass(this.volMat, this.rtVol);
      out.vol = this.rtVol.texture;
    }
    return out;
  }
}
