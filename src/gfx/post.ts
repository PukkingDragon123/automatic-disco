// Post: G-buffer outlines (silhouettes from the sign of the 1/z Laplacian, creases from normals), team-colour
// selection rims, dual-filter bloom, lift/gamma/gain grade, vignette, sRGB out.
import * as THREE from 'three';

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

float linZ(float d) { float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
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
  vec3 col = texture2D(tColor, vUv).rgb;
  vec4 nC = texture2D(tNormal, vUv);
  float dC = texture2D(tDepth, vUv).r;
  float oC, sC, hC, eC; flags(nC.a, oC, sC, hC, eC);
  float zC = linZ(dC), wC = 1.0 / zC;
  bool bgC = dC >= 0.99999;

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
  col *= 1.0 - uAO * occ * fade * (1.0 - step(31.5, nC.a) * 0.6);
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
uniform sampler2D tColor, tNormal; uniform vec2 uTexel; uniform float uThresh;
void main() {
  vec3 c = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec2 o = vec2(i % 2 == 0 ? -0.5 : 0.5, i < 2 ? -0.5 : 0.5) * uTexel;
    vec3 s = texture2D(tColor, vUv + o).rgb;
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
  readonly grade: Grade = defaultGrade();
  readonly U: Record<string, THREE.IUniform>;
  w = 1; h = 1;

  constructor(private renderer: THREE.WebGLRenderer) {
    const depth = new THREE.DepthTexture(4, 4, THREE.FloatType);
    this.main = new THREE.WebGLRenderTarget(4, 4, { count: 2, type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, depthTexture: depth });
    this.fx = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, depthTexture: depth });
    this.black = rt(1, 1);
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
      uCrease: { value: 0.62 }, uAO: { value: 0.75 }, uAORad: { value: 1.1 }, uProj: { value: 600 }, uDebug: { value: Number(new URLSearchParams(location.search).get('dbg') ?? 0) },
      uLift: { value: gr.lift }, uGamma: { value: gr.gamma }, uGain: { value: gr.gain },
      uOutline: { value: new THREE.Color(0x07060c) }, uSelCol: { value: new THREE.Color(0x9dff6a) },
      uHoverCol: { value: new THREE.Color(0xf4f0d8) }, uEnemyCol: { value: new THREE.Color(0xff5a48) },
    };
    this.mComp = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: COMPOSITE, uniforms: this.U, depthTest: false, depthWrite: false });
    this.mBright = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: BRIGHT, uniforms: { tColor: this.U.tColor, tNormal: this.U.tNormal, uTexel: { value: new THREE.Vector2() }, uThresh: { value: 1.0 } }, depthTest: false, depthWrite: false });
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
    if (B.length && this.grade.bloom > 0) {
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
    this.U.uBloom.value = gr.bloom; this.U.uSat.value = gr.sat; this.U.uVig.value = gr.vig;
    this.U.uNear.value = camera.near; this.U.uFar.value = camera.far; this.U.uTime.value = time;
    this.U.uProj.value = this.h / (2 * Math.tan((camera.fov * Math.PI) / 360));
    this.pass(this.mComp, null);
  }
}
