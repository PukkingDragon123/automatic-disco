// Post: G-buffer outlines (silhouettes from the sign of the 1/z Laplacian, creases from normals), team-colour
// selection rims, dual-filter bloom, lift/gamma/gain grade, vignette, sRGB out.
// For a scene lit by a Sun (scene.userData.sun) it also lays the atmosphere over the image from the depth buffer
// (lights.ts Env): blue aerial haze in the distance and a warm near field, low mist pooling over water and in hollows
// in drifting patches, light shafts through the canopy (the view ray marched through the sun's shadow map), wet
// ground after rain (darker, richer, puddles reflecting the sky with raindrop rings), dew glints on leaves in the
// morning, heat shimmer over hot ground. Water marks itself in the G-buffer with flag bit 16.
import * as THREE from 'three';
import type { Sun } from './lights';
import { settings, qualityProfile } from '../settings';

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const COMPOSITE = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor, tNormal, tDepth, tBloom, tFx;
uniform vec2 uRes;
uniform float uNear, uFar, uBloom, uSat, uVig, uFade, uCrease, uTime, uFxOn, uDebug, uAO, uAORad, uProj;
uniform vec3 uLift, uGamma, uGain, uOutline, uSelCol, uHoverCol, uEnemyCol, uFadeCol;
// atmosphere
uniform highp sampler2DShadow tShadow;
uniform float uEnv, uHaze, uMist, uMistY, uMistH, uPatch, uRays, uWet, uRain, uDew, uHeat, uShadowOn;
uniform int uRaySteps;
uniform mat4 uInvProj, uCamWorld, uShadowM;
uniform vec3 uCamPos, uSunDir, uSunCol, uSkyCol, uHazeCol, uMistCol;
uniform vec2 uWind;

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
    float a = (1.0 - exp(-uRays * span * 0.03)) * phase;
    col = col * (1.0 - a * 0.35) + uSunCol * (a * lit * 0.22);
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
    float m = 1.0 - exp(-uMist * integ * pt);
    col = mix(col, uMistCol * mix(0.62, 1.0, lit), clamp(m, 0.0, 0.92));
  }
  // aerial perspective: blue with distance (warmer toward the sun), a touch warm up close
  float hz = (1.0 - exp(-D * uHaze)) * (bg ? 0.75 : 1.0);
  vec3 hc = mix(uHazeCol, uHazeCol * 0.55 + uSunCol * 0.3, pow(max(0.0, dot(rd, uSunDir)), 5.0));
  col *= mix(vec3(1.035, 1.0, 0.955), vec3(1.0), smoothstep(3.0, 36.0, D));
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
vec3 srgb(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }

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
  if (env && !bgC && water < 0.5) {
    // wet ground: darker and richer, puddles in the flat open hollows mirror the sky, the sun glints off the wet
    if (uWet > 0.002) {
      float up = smoothstep(0.35, 0.85, N0.y), wk = uWet * (0.45 + 0.55 * up);
      float lum = dot(col, vec3(0.3, 0.59, 0.11));
      col = mix(vec3(lum), col, 1.0 + 0.3 * wk) * (1.0 - 0.36 * wk);
      vec2 wp = (floor(P.xz * 32.0) + 0.5) / 32.0;
      float pn = vn2(wp * 0.42 + 3.7) * 0.62 + vn2(wp * 1.25 - 1.9) * 0.38, thr = 1.0 - uWet * 0.4;
      vec3 rr = reflect(rd, vec3(0.0, 1.0, 0.0));
      if (N0.y > 0.985 && pn > thr) {
        vec3 sky = mix(uHazeCol, uSkyCol, smoothstep(0.0, 0.7, rr.y));
        float fres = 0.3 + 0.7 * pow(1.0 - max(0.0, -rd.y), 3.0);
        vec3 pc = mix(col * 0.5, sky, 0.45 * fres + 0.2) + uSunCol * pow(max(0.0, dot(rr, uSunDir)), 160.0) * 2.5;
        if (uRain > 0.01) {
          vec2 q = wp * 2.3, ci = floor(q), f = fract(q) - 0.5 - (vec2(h21(ci), h21(ci + 5.3)) - 0.5) * 0.45;
          float tc = uTime * 1.15 + h21(ci + 2.7), ph = fract(tc);
          float ring = (1.0 - step(0.05, abs(length(f) - ph * 0.42))) * (1.0 - ph) * step(h21(ci + floor(tc)), uRain);
          pc += vec3(0.32, 0.36, 0.42) * ring;
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
  if (!bgC && uAO > 0.0) {
    float zL = 1.0 / wL, zR2 = 1.0 / wR, zD = 1.0 / wD, zU2 = 1.0 / wU;
    float gx = abs(zR2 - zC) < abs(zC - zL) ? zR2 - zC : zC - zL;
    float gy = abs(zU2 - zC) < abs(zC - zD) ? zU2 - zC : zC - zD;
    float rp = clamp(uAORad * uProj / zC, 3.0, 56.0);
    vec2 fc = mod(floor(gl_FragCoord.xy), 4.0);
    float bay = mod(fc.x * 4.0 + fc.y * 7.0 + fc.x * fc.y * 3.0, 16.0) / 16.0;
    for (int i = 0; i < 12; i++) {
      float fi = float(i);
      float a = fi * 2.39996 + bay * 6.2831;
      float rr = rp * (0.2 + 0.8 * fract(fi * 0.618 + bay * 0.37));
      vec2 op = vec2(cos(a), sin(a)) * rr;
      float zs = linZ(texture2D(tDepth, vUv + op * px).r);
      float d = (zC + gx * op.x + gy * op.y) - zs;
      occ += smoothstep(0.03 + zC * 0.0015, 0.12 + zC * 0.004, d) * (1.0 - smoothstep(uAORad, uAORad * 3.0, d));
    }
    occ /= 12.0;
  }
  // contact shadows lose the warm key first: a faintly cool occlusion
  col *= 1.0 - uAO * occ * fade * (1.0 - step(31.5, nC.a) * 0.6) * vec3(1.0, 0.96, 0.88);
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
    gl_FragColor = vec4(vec3(1.0 - edge), 1.0); return;
  }
  vec3 lineCol = uOutline;
  if (sC > 0.5) lineCol = mix(uOutline, uSelCol * 0.55, 0.7);
  col = mix(col, lineCol, edge);
  if (env) col = atmosphere(col, P, rd, dist, bgC);
  // transparent fx layer (particles, fields) composited over the outlined opaque image
  if (uFxOn > 0.5) { vec4 fx = texture2D(tFx, vUv); col = col * (1.0 - fx.a) + fx.rgb; }
  col = mix(col, rim, rimA);
  // bloom
  col += texture2D(tBloom, vUv).rgb * uBloom;
  // grade
  col = max(col, 0.0);
  col = col * uGain + uLift * (1.0 - col);
  col = pow(max(col, 0.0), 1.0 / uGamma);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSat);
  vec2 q = vUv - 0.5;
  col *= 1.0 - uVig * dot(q, q) * 1.6;
  col = mix(col, uFadeCol, uFade);
  gl_FragColor = vec4(srgb(col), 1.0);
}
`;

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

export interface Grade { lift: THREE.Color; gamma: THREE.Color; gain: THREE.Color; sat: number; vig: number; bloom: number }
/**
 * A restrained, slightly filmic look: below-neutral saturation, a faint cool lift in the shadows against a
 * warm tint in the highlights (split tone), soft vignette, gentle bloom.
 */
export function resetGrade(g: Grade) { const d = defaultGrade(); g.lift.copy(d.lift); g.gamma.copy(d.gamma); g.gain.copy(d.gain); g.sat = d.sat; g.vig = d.vig; g.bloom = d.bloom; }
export const defaultGrade = (): Grade => ({ lift: new THREE.Color(0.0035, 0.004, 0.007), gamma: new THREE.Color(1.06, 1.06, 1.07), gain: new THREE.Color(1.12, 1.09, 1.03), sat: 1.14, vig: 0.34, bloom: 0.34 });

const _w = new THREE.Color(1, 1, 1);
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
  /** a cleared 1x1 depth texture with a compare function: what the shadow sampler reads when there are no shafts */
  private noShadow: THREE.WebGLRenderTarget;
  readonly grade: Grade = defaultGrade();
  readonly U: Record<string, THREE.IUniform>;
  w = 1; h = 1;

  constructor(private renderer: THREE.WebGLRenderer) {
    const depth = new THREE.DepthTexture(4, 4, THREE.FloatType);
    this.main = new THREE.WebGLRenderTarget(4, 4, { count: 2, type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, depthTexture: depth });
    this.fx = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, depthTexture: depth });
    this.black = rt(1, 1);
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
      uCrease: { value: 0.62 }, uAO: { value: 0.82 }, uAORad: { value: 1.15 }, uProj: { value: 600 }, uDebug: { value: Number(new URLSearchParams(location.search).get('dbg') ?? 0) },
      uLift: { value: gr.lift }, uGamma: { value: gr.gamma }, uGain: { value: gr.gain },
      uOutline: { value: new THREE.Color(0x07060c) }, uSelCol: { value: new THREE.Color(0x9dff6a) },
      uHoverCol: { value: new THREE.Color(0xf4f0d8) }, uEnemyCol: { value: new THREE.Color(0xff5a48) },
      tShadow: { value: this.noShadow.depthTexture }, uShadowOn: { value: 0 }, uShadowM: { value: new THREE.Matrix4() }, uRaySteps: { value: 12 },
      uEnv: { value: 0 }, uHaze: { value: 0 }, uMist: { value: 0 }, uMistY: { value: 0 }, uMistH: { value: 1.4 }, uPatch: { value: 0.6 },
      uRays: { value: 0 }, uWet: { value: 0 }, uRain: { value: 0 }, uDew: { value: 0 }, uHeat: { value: 0 }, uWind: { value: new THREE.Vector2() },
      uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uSkyCol: { value: new THREE.Color() },
      uHazeCol: { value: new THREE.Color() }, uMistCol: { value: new THREE.Color() },
    };
    this.mComp = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: COMPOSITE, uniforms: this.U, depthTest: false, depthWrite: false });
    this.mBright = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: BRIGHT, uniforms: { tColor: this.U.tColor, tNormal: this.U.tNormal, tFx: this.U.tFx, uFxOn: this.U.uFxOn, uTexel: { value: new THREE.Vector2() }, uThresh: { value: 1.0 } }, depthTest: false, depthWrite: false });
    this.mDown = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: DOWN, uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false });
    this.mUp = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: UP, uniforms: { tSrc: { value: null }, tPrev: { value: null }, uTexel: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false });
  }

  setSize(w: number, h: number) {
    w = Math.max(1, Math.floor(w)); h = Math.max(1, Math.floor(h));
    this.w = w; this.h = h;
    this.main.setSize(w, h);
    this.fx.setSize(w, h);
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

  /** opaque scene -> main MRT; optional transparent scene -> fx layer; then composite to screen */
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, fxScene?: THREE.Scene, time = 0) {
    const r = this.renderer;
    const ac = r.autoClear;
    r.setRenderTarget(this.main);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    r.render(scene, camera);
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
    const qp = qualityProfile();
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
    this.U.uBloom.value = qp.bloom ? gr.bloom : 0; this.U.uSat.value = gr.sat; this.U.uVig.value = gr.vig;
    this.U.uNear.value = camera.near; this.U.uFar.value = camera.far; this.U.uTime.value = time;
    this.U.uProj.value = this.h / (2 * Math.tan((camera.fov * Math.PI) / 360));
    this.U.uAO.value = qp.ssao ? this.ao : 0;
    this.atmosphere(scene, camera);
    this.pass(this.mComp, null);
  }
  /** contact-shadow strength (SSAO) when the quality tier has it on */
  ao = 0.82;

  private atmosphere(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    const U = this.U, sun = scene.userData.sun as Sun | undefined;
    if (!sun || sun.light.parent !== scene) { U.uEnv.value = 0; U.uShadowOn.value = 0; U.tShadow.value = this.noShadow.depthTexture; return; }
    const e = sun.env, q = settings.quality, lo = q === 'low';
    U.uEnv.value = 1;
    (U.uInvProj.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
    (U.uCamWorld.value as THREE.Matrix4).copy(camera.matrixWorld);
    (U.uCamPos.value as THREE.Vector3).setFromMatrixPosition(camera.matrixWorld);
    (U.uSunDir.value as THREE.Vector3).copy(sun.dir).normalize();
    // daylight from the key's strength; the sun's colour as it stands after the day/night grading in the game
    const k = Math.min(1, sun.light.intensity / 3.3), sc = U.uSunCol.value as THREE.Color;
    sc.copy(sun.light.color).multiplyScalar(0.35 + sun.light.intensity * 0.32);
    const sky = U.uSkyCol.value as THREE.Color, hz = U.uHazeCol.value as THREE.Color, mc = U.uMistCol.value as THREE.Color;
    sky.copy(e.sky).multiplyScalar(0.25 + 0.75 * k);
    hz.copy(e.sky).lerp(sun.hemi.color, 0.35).multiplyScalar((0.2 + 0.8 * k) * 0.95);
    mc.copy(e.sky).lerp(_w, 0.5).lerp(sun.hemi.color, 0.2).multiplyScalar(0.16 + 0.74 * k);
    U.uHaze.value = e.haze; U.uMist.value = e.mist * (lo ? 0.35 : 1); U.uMistY.value = e.mistY; U.uMistH.value = e.mistH; U.uPatch.value = e.patch;
    U.uWet.value = e.wet; U.uRain.value = e.rain; U.uDew.value = e.dew; U.uHeat.value = lo ? 0 : e.heat;
    (U.uWind.value as THREE.Vector2).copy(e.wind);
    // shafts need the sun's shadow map (it exists after the first shadowed frame)
    const map = sun.light.castShadow ? sun.light.shadow.map : null, dt = map?.depthTexture ?? null;
    const rays = lo || !dt || !dt.compareFunction ? 0 : e.rays;
    U.uRays.value = rays; U.uShadowOn.value = rays > 0 ? 1 : 0; U.uRaySteps.value = q === 'high' ? 12 : 7;
    U.tShadow.value = rays > 0 ? dt : this.noShadow.depthTexture;
    if (rays > 0) (U.uShadowM.value as THREE.Matrix4).copy(sun.light.shadow.matrix);
  }
}
