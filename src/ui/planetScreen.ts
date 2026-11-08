// The planet seen from orbit: drag to turn it, hover a region for its biome and danger, pick one and fall on it.
// The landing is a cinematic: the globe turns the region to face you, the camera dives, a burning seed streaks in
// and the screen whites out on impact.
import * as THREE from 'three';
import type { Screen } from '../app/engine';
import { type Post, resetGrade } from '../gfx/post';
import { el, panel, ui, Btn, Tip } from './kit';
import { sfx } from '../audio/audio';
import { makeGlobe, stars, type Globe } from './globe';
import { type Planet, type PRegion, owned } from '../world/planet';
import { BIOMES } from '../world/region';
import { gbuf } from '../gfx/gbuf';
import { VEYR } from '../world/palette';
import { clamp } from '../core/rand';

export interface PlanetOpts { onLand: (r: PRegion) => void; onBack: () => void; canLand: (r: PRegion) => string | null; note?: string }

export class PlanetScreen implements Screen {
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
  private globe: Globe;
  private root: HTMLDivElement; private info: HTMLDivElement;
  private q = new THREE.Quaternion(); private spin = new THREE.Vector2(0.002, 0);
  private drag: { x: number; y: number; moved: boolean } | null = null;
  private hover = -1; private sel: PRegion | null = null;
  private cine: { r: PRegion; t: number; from: THREE.Quaternion; to: THREE.Quaternion } | null = null;
  private meteor: THREE.Mesh; private trail: THREE.Mesh[] = [];
  private flash: HTMLDivElement;
  private t = 0;

  constructor(readonly planet: Planet, readonly opts: PlanetOpts) {
    this.scene.background = new THREE.Color(0x03060a);
    this.scene.add(stars());
    this.globe = makeGlobe(planet, 1);
    this.scene.add(this.globe.group);
    this.q.setFromEuler(new THREE.Euler(0.35, -0.6, 0));
    const rm = new THREE.MeshLambertMaterial({ color: 0x2a2436, emissive: new THREE.Color(VEYR.vein), emissiveIntensity: 0.8, flatShading: true }); gbuf(rm, 1);
    this.meteor = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 0), rm); this.meteor.visible = false; this.scene.add(this.meteor);
    const tm = new THREE.MeshBasicMaterial({ color: new THREE.Color(VEYR.vein).multiplyScalar(2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }); gbuf(tm, 0);
    for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.022 * (1 - i / 16), 0), tm); m.visible = false; this.trail.push(m); this.scene.add(m); }
    this.root = el('div', 'planet', ui());
    const top = panel('pl-top', this.root, 'dark');
    el('div', 'small pl-kick', top, 'U.S.P.C. ORBITAL SURVEY &middot; TARGET WORLD');
    el('div', 'hdr pl-title', top, planet.name.toUpperCase());
    el('div', 'small pl-sub', top, opts.note ?? `${owned(planet)} / ${planet.goal} REGIONS ARE YOURS · HOLD ${planet.goal} AND THE WORLD BECOMES YOU`);
    this.info = panel('pl-info', this.root);
    this.info.innerHTML = '<div class="small">DRAG TO TURN THE WORLD. CHOOSE A DROP ZONE FOR UNIT 07.</div>';
    const bot = el('div', 'pl-bot', this.root);
    new Btn(bot, { icon: 'stop', label: 'BACK', size: 'wide', tip: () => 'Return to the void.' }, () => this.close(() => opts.onBack()));
    this.flash = el('div', 'pl-flash', this.root);
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) this.drag = { x: e.clientX, y: e.clientY, moved: false }; });
    addEventListener('pointermove', this.onMove); addEventListener('pointerup', this.onUp);
    sfx('open');
  }
  private ray(x: number, y: number) { const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), this.cam); return rc.ray; }
  private onMove = (e: PointerEvent) => {
    if (this.cine) return;
    if (this.drag) {
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.drag.moved = true;
      this.q.premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(dy * 0.006, dx * 0.006, 0)));
      this.spin.set(dx * 0.0004, dy * 0.0004);
      this.drag.x = e.clientX; this.drag.y = e.clientY;
      return;
    }
    if ((e.target as HTMLElement) !== this.root) { this.globe.setHover(this.sel?.id ?? -1); return; }
    const i = this.globe.pick(this.ray(e.clientX, e.clientY));
    if (i !== this.hover) { this.hover = i; if (i >= 0) sfx('hover', 1.2, 0.3); }
    this.globe.setHover(i >= 0 ? i : this.sel?.id ?? -1);
    this.root.style.cursor = i >= 0 ? 'pointer' : 'grab';
  };
  private onUp = (e: PointerEvent) => {
    const d = this.drag; this.drag = null;
    if (!d || d.moved || this.cine) return;
    const i = this.globe.pick(this.ray(e.clientX, e.clientY));
    if (i >= 0) this.select(this.planet.regions[i]);
  };
  private select(r: PRegion) {
    this.sel = r; sfx('click');
    const b = BIOMES[r.biome], why = this.opts.canLand(r);
    const st = r.state === 'veyr' ? '<span style="color:#7affe0">YOURS</span>' : r.state === 'rival' ? '<span style="color:#ff8ab0">HELD BY A RIVAL</span>' : r.state === 'lost' ? '<span style="color:#888">BURNT OUT</span>' : 'UNCLAIMED';
    this.info.innerHTML = '';
    el('div', 'hdr pl-rname', this.info, r.name.toUpperCase());
    el('div', 'small', this.info, `${b.name.toUpperCase()} · ${st}`);
    el('div', 'small', this.info, `DANGER ${'◆'.repeat(r.danger)}${'◇'.repeat(3 - r.danger)}`);
    el('div', 'tiny pl-desc', this.info, `Warmth ${Math.round(b.temp * 100)}% · moisture ${Math.round(b.moist * 100)}% · relief ${Math.round(b.rough * 100)}% · life ${b.fauna >= 1.1 ? 'teeming' : b.fauna >= 0.9 ? 'plentiful' : 'sparse'}`);
    if (why) el('div', 'tip-warn', this.info, '▲ ' + why);
    else new Btn(this.info, { icon: 'planet', label: 'FALL HERE', size: 'big', tip: () => 'Become a burning seed and strike this region.' }, () => this.land(r));
  }
  private land(r: PRegion) {
    if (this.cine) return;
    Tip.hide();
    const c = new THREE.Vector3(...r.c);
    const to = new THREE.Quaternion().setFromUnitVectors(c, new THREE.Vector3(0.0, 0.18, 1).normalize());
    this.cine = { r, t: 0, from: this.q.clone(), to };
    this.info.style.display = 'none';
    sfx('pulse', 0.4, 0.9);
  }
  update(dt: number) {
    this.t += dt;
    let dist = 4.3;
    if (this.cine) {
      const C = this.cine; C.t += dt;
      const k = clamp(C.t / 1.4, 0, 1), e = k * k * (3 - 2 * k);
      this.q.slerpQuaternions(C.from, C.to, e);
      dist = 4.3 - clamp((C.t - 0.8) / 1.8, 0, 1) * 2.4;
      // the burning seed
      const ft = clamp((C.t - 1.0) / 1.5, 0, 1);
      const target = new THREE.Vector3(...C.r.c).applyQuaternion(this.q).multiplyScalar(1.0);
      const from = new THREE.Vector3(2.6, 2.2, 2.8);
      this.meteor.visible = ft > 0 && ft < 1;
      this.meteor.position.lerpVectors(from, target, ft * ft);
      this.meteor.rotation.x += dt * 9; this.meteor.rotation.y += dt * 7;
      this.trail.forEach((m, i) => { m.visible = this.meteor.visible; m.position.lerpVectors(from, target, Math.max(0, ft - i * 0.012) ** 2); });
      if (ft > 0 && Math.random() < 0.3) sfx('hover', 0.4, 0.2);
      if (ft >= 1 && !this.flash.classList.contains('on')) { this.flash.classList.add('on'); sfx('crack', 3, 1); sfx('pulse', 0.4, 1); }
      if (C.t > 3.3) { const r = C.r; this.close(() => this.opts.onLand(r)); return; }
    } else if (!this.drag) this.q.premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(this.spin.y, this.spin.x, 0)));
    if (!this.drag && !this.cine) { this.spin.x += (0.0018 - this.spin.x) * Math.min(1, dt * 0.8); this.spin.y *= 0.96; }
    this.globe.group.quaternion.copy(this.q);
    this.globe.mat.uniforms.uT.value = this.t;
    this.cam.position.set(0, 0, dist); this.cam.lookAt(0, 0, 0); this.cam.updateMatrixWorld();
  }
  render(post: Post, t: number) { resetGrade(post.grade); post.render(this.scene, this.cam, undefined, t); }
  resize(w: number, h: number) { this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
  private closed = false;
  private close(then: () => void) {
    if (this.closed) return; this.closed = true;
    removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp);
    this.root.remove(); Tip.hide();
    then();
  }
  dispose() { if (!this.closed) { this.closed = true; removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp); this.root.remove(); } }
}
