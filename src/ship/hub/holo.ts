// The bridge's main function as a HOLOGRAM over the holo table: the long-range scan sweeps a holographic galaxy, which
// folds down into the target system (a star and five worlds on their orbits, the easiest marked); pick a world and it
// swells into a realistic globe (its real surface, under a projected shell of scanlines and a fresnel rim), with
// three landing sites beaconed on it, the safest first; pick a site and the bridge console's DEPLOY key lights.
// Volumetric light rises from the emitter, motes shimmer in it. Few, big choices.
import * as THREE from 'three';
import { makeGlobe, type Globe } from '../../ui/globe';
import type { PRegion } from '../../world/planet';
import { gbuf, F_EMIT, GN_DECL } from '../../gfx/gbuf';
import { csfx } from '../../ui/cineAudio';
import type { World } from './monitor';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const P = Math.PI;
const CYAN = new THREE.Color(0.45, 1.25, 1.45);

/** additive hologram shader: fresnel rim, moving scanlines, a flicker (for shells, rings, beams) */
function holoMat(col = CYAN, k = 1, rim = 1.6) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uC: { value: col.clone() }, uK: { value: k }, uRim: { value: rim } },
    vertexShader: /* glsl */`varying vec3 vN; varying vec3 vV; varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: GN_DECL + /* glsl */`uniform float uT; uniform vec3 uC; uniform float uK; uniform float uRim; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){ float f = pow(1. - abs(dot(normalize(vN), vV)), 2.2) * uRim; float s = 0.55 + 0.45 * step(0.5, fract(vW.y * 90. - uT * 1.5)); float fl = 0.92 + 0.08 * sin(uT * 37.) * sin(uT * 13.);
        float a = clamp((0.08 + f) * s * fl * uK, 0., 1.); gl_FragColor = vec4(uC * a, a); gNormal = vec4(0.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  return m;
}
const lineMat = (c = CYAN, o = 0.6) => { const m = new THREE.LineBasicMaterial({ color: c.clone().multiplyScalar(o), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }); return gbuf(m, 0) as THREE.LineBasicMaterial; };
const ptsMat = (size: number) => { const m = new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }); return gbuf(m, 0) as THREE.PointsMaterial; };

type Phase = 'off' | 'galaxy' | 'system' | 'world';
export interface HoloInfo { phase: Phase; world: string; diff: number; site: string; danger: number; canDeploy: boolean }

export class BridgeHolo {
  readonly root = new THREE.Group();
  phase: Phase = 'off';
  private T = 0; private t = 0;
  private own: { dispose(): void }[] = [];
  private galaxy: THREE.Points; private ring: THREE.Mesh; private sys = new THREE.Group(); private star: THREE.Mesh;
  private globes: Globe[] = []; private shells: THREE.Mesh[] = []; private orbits: THREE.LineLoop[] = []; private marks: THREE.Mesh[] = [];
  private sel = -1; private site = -1; private sites: { r: PRegion; beacon: THREE.Group }[] = [];
  private beam: THREE.Mesh; private motes: THREE.Points;
  private mats: THREE.ShaderMaterial[] = [];
  private ray = new THREE.Raycaster();
  private best: number;
  onChange: () => void = () => {};
  constructor(readonly worlds: World[], readonly center = V(0, 1.42, 15.5)) {
    this.root.position.copy(center); this.root.visible = false;
    this.best = worlds.reduce((b, w, k) => (w.diff < worlds[b].diff ? k : b), 0);
    // ---- the emitter's light: a cone of light rising from the table, motes drifting in it
    const bm = holoMat(CYAN, 0.35, 0.4); this.mats.push(bm);
    const cone = new THREE.CylinderGeometry(0.62, 0.32, 0.5, 32, 1, true); this.beam = new THREE.Mesh(cone, bm); this.beam.position.y = -0.24; this.root.add(this.beam); this.own.push(cone);
    const N = 220, mp = new Float32Array(N * 3), mc = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const a = Math.random() * P * 2, r = Math.sqrt(Math.random()) * 0.6; mp.set([Math.cos(a) * r, -0.45 + Math.random() * 0.9, Math.sin(a) * r], i * 3); mc.set([0.3, 0.9, 1.0].map((v) => v * (0.3 + Math.random() * 0.7)), i * 3); }
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(mp, 3)); mg.setAttribute('color', new THREE.BufferAttribute(mc, 3));
    this.motes = new THREE.Points(mg, ptsMat(0.012)); this.root.add(this.motes); this.own.push(mg);
    // ---- the galaxy: two arms of stars in a disc 1.2 m across, a sweep ring
    const G = 9000, gp = new Float32Array(G * 3), gc = new Float32Array(G * 3);
    for (let i = 0; i < G; i++) {
      const bulge = i < G * 0.2; let x: number, y: number, z: number;
      const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
      if (bulge) { const r = Math.abs(gauss()) * 0.09, a = Math.random() * P * 2; x = Math.cos(a) * r; z = Math.sin(a) * r; y = gauss() * 0.03; }
      else { const r = 0.06 + Math.pow(Math.random(), 0.8) * 0.54, th = (i % 2) * P + Math.log(r / 0.05) * 2.2 + gauss() * 0.25; x = Math.cos(th) * r; z = Math.sin(th) * r; y = gauss() * 0.012; }
      gp.set([x, y, z], i * 3); const w = bulge ? 1 : 0.5 + Math.random() * 0.5; gc.set([0.5 * w + (bulge ? 0.5 : 0), 0.9 * w + (bulge ? 0.3 : 0), 1.0 * w], i * 3);
    }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(gp, 3)); gg.setAttribute('color', new THREE.BufferAttribute(gc, 3));
    this.galaxy = new THREE.Points(gg, ptsMat(0.008)); this.root.add(this.galaxy); this.own.push(gg);
    const rm = holoMat(CYAN, 1.2, 0); this.mats.push(rm);
    const rg = new THREE.RingGeometry(0.98, 1, 64); rg.rotateX(-P / 2); this.ring = new THREE.Mesh(rg, rm); this.root.add(this.ring); this.own.push(rg);
    // ---- the system: a star, five worlds on their orbits (the real planets, small), a marker on the easiest
    this.root.add(this.sys);
    const sm = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.9, 1.2) }); gbuf(sm, F_EMIT);
    const sg = new THREE.SphereGeometry(0.035, 20, 14); this.star = new THREE.Mesh(sg, sm); this.sys.add(this.star); this.own.push(sg, sm);
    const shellG = new THREE.SphereGeometry(1, 32, 20); this.own.push(shellG);
    worlds.forEach((w, i) => {
      const R = 0.16 + i * 0.1;
      const pts: THREE.Vector3[] = []; for (let k = 0; k <= 96; k++) { const a = (k / 96) * P * 2; pts.push(V(Math.cos(a) * R, 0, Math.sin(a) * R)); }
      const og = new THREE.BufferGeometry().setFromPoints(pts); const ol = new THREE.LineLoop(og, lineMat(CYAN, i === this.best ? 0.9 : 0.4)); this.sys.add(ol); this.orbits.push(ol); this.own.push(og);
      const gl = makeGlobe(w.planet, 0.035 + w.size * 0.004); gl.group.userData.orbit = R; this.sys.add(gl.group); this.globes.push(gl);
      const sh = new THREE.Mesh(shellG, holoMat(i === this.best ? new THREE.Color(1.6, 1.2, 0.5) : CYAN, 0.9, 2.2)); this.mats.push(sh.material as THREE.ShaderMaterial); sh.scale.setScalar(0.05); gl.group.add(sh); this.shells.push(sh);
      // the easiest world wears a ring of light
      if (i === this.best) { const mg2 = new THREE.RingGeometry(0.07, 0.078, 40); const mk = new THREE.Mesh(mg2, holoMat(new THREE.Color(1.8, 1.3, 0.5), 1.4, 0)); this.mats.push(mk.material as THREE.ShaderMaterial); gl.group.add(mk); this.marks.push(mk); this.own.push(mg2); }
    });
  }
  /** run the scan: the galaxy sweeps, then folds into the system */
  start() { this.root.visible = true; this.phase = 'galaxy'; this.T = 0; this.sel = -1; this.site = -1; this.clearSites(); csfx('cardFeed', 0.5); csfx('swell', 0.4); this.onChange(); }
  stop() { this.phase = 'off'; this.root.visible = false; this.clearSites(); this.onChange(); }
  /** back from a world to the system */
  back() { if (this.phase !== 'world') return false; this.phase = 'system'; this.T = 0; this.sel = -1; this.site = -1; this.clearSites(); csfx('tick', 0.6); this.onChange(); return true; }
  info(): HoloInfo {
    const w = this.sel >= 0 ? this.worlds[this.sel] : null, s = this.site >= 0 ? this.sites[this.site]?.r : null;
    return { phase: this.phase, world: w ? w.planet.name.toUpperCase() : this.phase === 'system' ? `${this.worlds.length} WORLDS` : 'SCANNING', diff: w?.diff ?? 0, site: s ? s.name.toUpperCase() : '--', danger: s?.danger ?? 0, canDeploy: !!(w && s) };
  }
  /** the chosen world's seed and landing region (for DEPLOY) */
  choice(): { seed: number; r: PRegion } | null { if (this.sel < 0 || this.site < 0) return null; return { seed: this.worlds[this.sel].seed, r: this.sites[this.site].r }; }
  private clearSites() { for (const s of this.sites) s.beacon.removeFromParent(); this.sites = []; }
  private pickWorld(i: number) {
    this.sel = i; this.site = -1; this.phase = 'world'; this.T = 0; csfx('button', 0.6); csfx('swell', 0.5);
    // three sites, safest first, beaconed on the globe
    const w = this.worlds[i], landable = w.planet.regions.filter((r) => r.state !== 'veyr' && r.state !== 'lost').sort((a, b) => a.danger - b.danger).slice(0, 3);
    const gl = this.globes[i];
    this.clearSites();
    landable.forEach((r, k) => {
      const b = new THREE.Group(); const n = V(...r.c).normalize(); b.position.copy(n); b.quaternion.setFromUnitVectors(V(0, 1, 0), n);
      const col = k === 0 ? new THREE.Color(1.8, 1.4, 0.5) : CYAN;
      const cg = new THREE.CylinderGeometry(0.004, 0.012, 0.32, 8, 1, true); cg.translate(0, 0.16, 0); const pm = holoMat(col, 1.6, 0.6); this.mats.push(pm);
      b.add(new THREE.Mesh(cg, pm));
      const hg = new THREE.TorusGeometry(0.05, 0.008, 6, 20); hg.rotateX(P / 2); const hm = holoMat(col, 1.8, 0); this.mats.push(hm); const h = new THREE.Mesh(hg, hm); h.position.y = 0.01; b.add(h);
      this.own.push(cg, hg);
      b.scale.setScalar(1 / (0.035 + w.size * 0.004) * 0.06);
      gl.group.add(b); this.sites.push({ r, beacon: b });
    });
    this.onChange();
  }
  private pickSite(k: number) { this.site = k; csfx('clamp', 0.6); csfx('beepHi', 0.4); this.onChange(); }
  /** a click on the hologram: a world in the system, a site on the world */
  pick(ray: THREE.Ray) {
    if (!this.root.visible) return false;
    const hit = this.hitTest(ray);
    if (hit?.kind === 'world') { this.pickWorld(hit.i); return true; }
    if (hit?.kind === 'site') { this.pickSite(hit.i); return true; }
    return false;
  }
  hover(ray: THREE.Ray) { return !!this.hitTest(ray); }
  private hitTest(ray: THREE.Ray): { kind: 'world' | 'site'; i: number } | null {
    const p = new THREE.Vector3();
    if (this.phase === 'system') {
      let best = -1, bd = 1e9;
      this.globes.forEach((g, i) => { g.group.getWorldPosition(p); const d = ray.distanceToPoint(p); const r = 0.07; if (d < r && ray.origin.distanceTo(p) < bd) { bd = ray.origin.distanceTo(p); best = i; } });
      return best >= 0 ? { kind: 'world', i: best } : null;
    }
    if (this.phase === 'world') {
      let best = -1, bd = 0.06;
      this.sites.forEach((s, i) => { s.beacon.getWorldPosition(p); const d = ray.distanceToPoint(p); if (d < bd) { bd = d; best = i; } });
      if (best >= 0) return { kind: 'site', i: best };
      // or the region under the pointer on the globe, if it is one of the sites
      const gl = this.globes[this.sel]; const ri = gl.pick(ray); const k = this.sites.findIndex((s) => s.r.id === ri);
      return k >= 0 ? { kind: 'site', i: k } : null;
    }
    return null;
  }
  update(dt: number, t: number) {
    if (!this.root.visible) return;
    this.T += dt; this.t = t;
    for (const m of this.mats) m.uniforms.uT.value = t;
    this.motes.rotation.y += dt * 0.15;
    const pos = this.motes.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) { let y = pos.getY(i) + dt * 0.05; if (y > 0.5) y = -0.45; pos.setY(i, y); } pos.needsUpdate = true;
    const ease = (k: number) => k * k * (3 - 2 * k);
    if (this.phase === 'galaxy') {
      // the sweep: a ring expanding over a spinning galaxy, then the galaxy folds into the system
      const k = Math.min(1, this.T / 2.6);
      this.galaxy.visible = true; this.galaxy.rotation.y += dt * 0.25; this.galaxy.scale.setScalar(1);
      this.ring.visible = true; this.ring.scale.setScalar(0.05 + k * 0.6); (this.ring.material as THREE.ShaderMaterial).uniforms.uK.value = 1.4 * (1 - k * 0.6);
      this.sys.visible = this.T > 2.2; this.sys.scale.setScalar(ease(Math.max(0, Math.min(1, (this.T - 2.2) / 1.2))));
      if (this.T > 2.6) { const f = Math.max(0, 1 - (this.T - 2.6) / 0.8); this.galaxy.scale.setScalar(Math.max(0.001, f)); }
      if (this.T > 3.4) { this.phase = 'system'; this.T = 0; this.galaxy.visible = false; this.ring.visible = false; csfx('relay', 0.5); this.onChange(); }
    } else {
      this.galaxy.visible = false; this.ring.visible = false; this.sys.visible = true;
      this.sys.scale.setScalar(1);
    }
    // the worlds orbit; the chosen one swells to centre
    this.globes.forEach((g, i) => {
      const R = g.group.userData.orbit as number, a = t * (0.35 / (1 + i * 0.6)) + i * 1.7;
      const home = V(Math.cos(a) * R, 0, Math.sin(a) * R);
      const chosen = this.phase === 'world' && i === this.sel, k = chosen ? ease(Math.min(1, this.T / 1.0)) : 0;
      const s = chosen ? 1 + k * 7 : this.phase === 'world' ? Math.max(0.001, 1 - Math.min(1, this.T / 0.5)) : 1;
      g.group.position.lerpVectors(home, V(0, 0.05, 0), k); g.group.scale.setScalar(s);
      g.group.rotation.y += dt * (chosen ? 0.12 : 0.4);
      this.orbits[i].visible = this.phase !== 'world';
      const sh = this.shells[i]; sh.scale.setScalar((0.035 + this.worlds[i].size * 0.004) * 1.08);
    });
    for (const m of this.marks) m.lookAt(m.getWorldPosition(new THREE.Vector3()).add(V(0, 1, 0)));
    this.star.visible = this.phase !== 'world';
    this.sites.forEach((s, i) => { const on = i === this.site; s.beacon.children[1].scale.setScalar(on ? 1.4 + Math.sin(t * 6) * 0.15 : 1 + Math.sin(t * 3 + i) * 0.08); });
  }
  dispose() { this.root.removeFromParent(); for (const o of this.own) o.dispose(); for (const m of this.mats) m.dispose(); }
}
