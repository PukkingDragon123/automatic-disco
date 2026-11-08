// A pixel globe: regions as Voronoi cells on the sphere, coloured by biome with a voxel-like texel grid, seas,
// ink borders, ice caps, an atmosphere rim; Veyr-held regions overgrown in teal moss with pulsing veins, rival
// regions in creep. Writes the G-buffer so the post pass outlines it like everything else.
import * as THREE from 'three';
import { GN_DECL } from '../gfx/gbuf';
import { type Planet, BIOME_COL } from '../world/planet';
import { VEYR, RIVALS } from '../world/palette';

const MAXR = 16;
export interface Globe { group: THREE.Group; mesh: THREE.Mesh; mat: THREE.ShaderMaterial; atmo: THREE.Mesh; refresh(): void; setHover(i: number): void; pick(ray: THREE.Ray): number }

export function makeGlobe(p: Planet, radius = 1, opts: { ascended?: boolean } = {}): Globe {
  const C = Array.from({ length: MAXR }, (_, i) => new THREE.Vector3(...(p.regions[i]?.c ?? [0, 1, 0])));
  const COL = Array.from({ length: MAXR }, (_, i) => new THREE.Color(p.regions[i] ? BIOME_COL[p.regions[i].biome] : 0x000000));
  const ST = new Array(MAXR).fill(0);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uC: { value: C }, uCol: { value: COL }, uSt: { value: ST }, uN: { value: p.regions.length }, uHover: { value: -1 }, uT: { value: 0 },
      uSun: { value: new THREE.Vector3(-0.6, 0.5, 0.65).normalize() }, uMoss: { value: new THREE.Color(VEYR.moss) }, uVein: { value: new THREE.Color(VEYR.vein) },
      uCreep: { value: new THREE.Color(RIVALS[p.seed % RIVALS.length].creep) }, uSea: { value: new THREE.Color(0x1e4256) }, uAsc: { value: opts.ascended ? 1 : 0 },
    },
    vertexShader: 'varying vec3 vP; varying vec3 vNw; void main(){ vP = position; vNw = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: GN_DECL + `
uniform vec3 uC[${MAXR}]; uniform vec3 uCol[${MAXR}]; uniform float uSt[${MAXR}]; uniform int uN; uniform int uHover; uniform float uT; uniform vec3 uSun, uMoss, uVein, uCreep, uSea; uniform float uAsc;
varying vec3 vP; varying vec3 vNw;
float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i), h3(i+vec3(1,0,0)), f.x), mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y), mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x), mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y), f.z); }
void main(){
  vec3 n0 = normalize(vP);
  vec3 n = normalize(floor(n0 * 72.0) / 72.0 + 0.5 / 72.0); // the texel grid
  float d1 = 9.0, d2 = 9.0; int k = 0;
  for (int i = 0; i < ${MAXR}; i++) { if (i >= uN) break; float d = distance(n + (vn(n * 9.0) - 0.5) * 0.07, uC[i]); if (d < d1) { d2 = d1; d1 = d; k = i; } else if (d < d2) d2 = d; }
  vec3 col = uCol[k];
  float g = h3(floor(n0 * 72.0));
  col *= 0.86 + g * 0.22 + (vn(n * 14.0) - 0.5) * 0.25;
  float sea = vn(n * 3.2) * 0.65 + vn(n * 7.0) * 0.35;
  if (sea < 0.36 && abs(n.y) < 0.82) col = mix(uSea, uSea * 1.4, step(0.33, sea)) * (0.9 + g * 0.15);
  if (abs(n.y) > 0.86 + (vn(n * 6.0) - 0.5) * 0.08) col = vec3(0.86, 0.92, 0.96) * (0.9 + g * 0.1);
  float st = uSt[k];
  if (st > 0.5 && st < 1.5 || uAsc > 0.5) { col = mix(uMoss * (0.8 + g * 0.4), col, 0.2); float vein = abs(sin(dot(n, vec3(31.0, 17.0, 23.0)) + uT * 1.5)); if (vein > 0.985) col = uVein * 1.6; }
  if (st > 1.5 && st < 2.5) col = mix(uCreep * (0.8 + g * 0.4), col, 0.25);
  if (st > 2.5) col *= 0.45;
  bool border = d2 - d1 < 0.025;
  if (border && uAsc < 0.5) col *= 0.42;
  if (k == uHover) col = mix(col, vec3(1.0, 0.95, 0.7), border ? 0.8 : 0.22);
  // drifting cloud banks (texel-snapped, thinner over the poles), and a glint on open water
  float cl = vn(n * 4.0 + vec3(uT * 0.015, 0.0, uT * 0.008)) * 0.6 + vn(n * 10.0 - vec3(uT * 0.02, 0.0, 0.0)) * 0.4;
  float cloud = smoothstep(0.6, 0.7, cl) * (uAsc > 0.5 ? 0.5 : 1.0);
  vec3 N = normalize(vNw);
  float l = max(0.0, dot(N, uSun)) * 1.05 + 0.12;
  if (sea < 0.36 && abs(n.y) < 0.82 && st < 0.5) col += vec3(0.5, 0.55, 0.5) * pow(max(0.0, dot(reflect(-uSun, N), vec3(0.0, 0.0, 1.0))), 24.0);
  col = mix(col, vec3(0.88, 0.9, 0.92) * (0.92 + g * 0.08), cloud * 0.82);
  l = floor(l * 5.0) / 5.0 + 0.1;
  gl_FragColor = vec4(col * l, 1.0);
  gNormal = vec4(N * 0.5 + 0.5, 1.0);
}`,
  });
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 24), mat);
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.08, 48, 32), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    uniforms: { uCol: { value: new THREE.Color(opts.ascended ? VEYR.vein : 0x8ab0d0) } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: GN_DECL + 'uniform vec3 uCol; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 3.0); float q = floor(f * 6.0) / 6.0; gl_FragColor = vec4(uCol * q * 1.3, 1.0); gNormal = vec4(0.0); }',
  }));
  const group = new THREE.Group(); group.add(mesh, atmo);
  const g: Globe = {
    group, mesh, mat, atmo,
    refresh() { p.regions.forEach((r, i) => { ST[i] = r.state === 'veyr' ? 1 : r.state === 'rival' ? 2 : r.state === 'lost' ? 3 : 0; }); },
    setHover(i) { mat.uniforms.uHover.value = i; },
    pick(ray) {
      const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
      const lr = ray.clone().applyMatrix4(inv);
      const hit = lr.intersectSphere(new THREE.Sphere(new THREE.Vector3(), radius), new THREE.Vector3());
      if (!hit) return -1;
      const n = hit.normalize();
      let best = -1, bd = 9;
      p.regions.forEach((r, i) => { const d = n.distanceTo(C[i]); if (d < bd) { bd = d; best = i; } });
      return best;
    },
  };
  g.refresh();
  return g;
}

/** a starfield shell (G-buffer safe) */
export function stars(n = 1400, R = 60) {
  const p = new Float32Array(n * 3), c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(R * (0.8 + Math.random() * 0.4));
    p.set([v.x, v.y, v.z], i * 3);
    const k = 0.4 + Math.random() * 0.6, t = Math.random();
    c.set([k * (t < 0.2 ? 1 : 0.8), k * 0.9, k * (t > 0.8 ? 1 : 0.85)], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const m = new THREE.ShaderMaterial({
    vertexShader: 'attribute vec3 color; varying vec3 vC; void main(){ vC = color; gl_PointSize = 2.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: GN_DECL + 'varying vec3 vC; void main(){ gl_FragColor = vec4(vC, 1.0); gNormal = vec4(0.0); }',
  });
  return new THREE.Points(g, m);
}
