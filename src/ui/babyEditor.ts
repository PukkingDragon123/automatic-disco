// The mirror pool: the Veyr child sees itself in still water and chooses how it looks: skin, belly, markings,
// chub, tail, eyes, gills, back, crystal glow, cheeks and a name; the sculpt rebuilds live and it looks back at you.
import * as THREE from 'three';
import type { Screen } from '../app/engine';
import type { Post } from '../gfx/post';
import { el, panel, ui, Btn, Tip } from './kit';
import { sfx } from '../audio/audio';
import { VeyrChild } from '../game/child';
import { Fx } from '../game/fx';
import { gbuf } from '../gfx/gbuf';
import { clamp } from '../core/rand';
import { type BabyLook, SKINS, BELLIES, PATCOLS, EYES, GLOWS, GILLS, EYESTYLES, BACKS, TAILS, PATS, randomLook, saveLook } from '../game/babyLook';

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

export class BabyEditor implements Screen {
  private scene = new THREE.Scene();
  private fxs = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 200);
  private fx: Fx;
  private child: VeyrChild;
  private root: HTMLDivElement;
  private L: BabyLook;
  private dirty = 0; private yaw = 0.25; private pitch = 0.16; private t = 0;
  private drag: { x: number; y: number } | null = null;
  private nameIn!: HTMLInputElement;
  private ring: THREE.Mesh;

  constructor(look: BabyLook, readonly done: (l: BabyLook | null) => void) {
    this.L = { ...look };
    this.scene.background = new THREE.Color(0x0a1418);
    this.scene.fog = new THREE.Fog(0x0a1418, 9, 22);
    this.scene.add(new THREE.HemisphereLight(0xdde8ff, 0x302838, 1.5));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.6); key.position.set(-3, 6, 5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera as THREE.OrthographicCamera; sc.left = sc.bottom = -4; sc.right = sc.top = 4; sc.near = 0.5; sc.far = 20; this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x7affe0, 1.6); rim.position.set(3, 2.5, -4); this.scene.add(rim);
    // a basin of asteroid rock with a still pool around it
    const rock = new THREE.MeshLambertMaterial({ color: 0x3a3048, flatShading: true }); gbuf(rock, 1);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.85, 0.5, 9), rock); ped.position.y = 0; ped.receiveShadow = true; ped.castShadow = true; this.scene.add(ped);
    const pool = new THREE.MeshLambertMaterial({ color: 0x0c3a40, emissive: new THREE.Color(0x0a4a48), emissiveIntensity: 0.5 }); gbuf(pool, 0);
    const water = new THREE.Mesh(new THREE.CircleGeometry(7, 40), pool); water.rotation.x = -Math.PI / 2; water.position.y = -0.2; water.receiveShadow = true; this.scene.add(water);
    const rm = new THREE.MeshLambertMaterial({ color: 0x2a2436, flatShading: true }); gbuf(rm, 1);
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + 0.3, r = 3.2 + (i % 3) * 0.9; const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4 + (i % 4) * 0.18, 0), rm); m.position.set(Math.cos(a) * r, -0.1, Math.sin(a) * r); m.rotation.set(i, i * 2, 0); m.castShadow = true; this.scene.add(m); }
    const gm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7affe0).multiplyScalar(1.6) }); gbuf(gm, 0);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.025, 6, 48), gm); this.ring.rotation.x = Math.PI / 2; this.ring.position.y = 0.26; this.scene.add(this.ring);
    this.fx = new Fx(this.fxs, this.scene);
    this.child = new VeyrChild(this.fx, 1.25, this.L, { grown: true });
    this.child.root.position.y = 0.25; this.child.hatch = 1;
    this.scene.add(this.child.root);
    this.child.wave();
    this.root = this.buildUI();
    addEventListener('pointermove', this.onMove); addEventListener('pointerup', this.onUp); addEventListener('keydown', this.onKey);
    sfx('open');
  }

  // ------------------------------------------------------------------ UI
  private buildUI() {
    const root = el('div', 'forge mirror', ui());
    root.addEventListener('pointerdown', (e) => { if (e.target === root) this.drag = { x: e.clientX, y: e.clientY }; });
    const top = panel('fg-top', root, 'dark');
    el('div', 'hdr fg-title', top, 'MIRROR POOL');
    this.nameIn = el('input', 'fg-name', top) as HTMLInputElement;
    this.nameIn.value = this.L.name; this.nameIn.maxLength = 16;
    this.nameIn.addEventListener('input', () => { this.L.name = this.nameIn.value || 'Veyr'; });
    this.nameIn.addEventListener('keydown', (e) => e.stopPropagation());
    const left = panel('fg-left', root), right = panel('fg-right', root);
    const sw = (p: HTMLElement, label: string, list: number[], k: keyof BabyLook) => {
      el('div', 'hdr fg-h', p, label);
      const row = el('div', 'fg-chips', p);
      for (const c of list) { const ch = el('div', 'chip', row); ch.style.background = hex(c); ch.dataset.k = k; ch.dataset.c = String(c); ch.addEventListener('click', () => { (this.L as any)[k] = c; this.changed(); }); }
    };
    const opt = (p: HTMLElement, label: string, list: string[], k: keyof BabyLook) => {
      el('div', 'hdr fg-h', p, label);
      const row = el('div', 'fg-pats', p);
      for (const o of list) { const b = el('button', 'fg-pat', row, o.toUpperCase()); b.dataset.k = k; b.dataset.v = o; b.addEventListener('click', () => { (this.L as any)[k] = o; this.changed(); }); }
    };
    const step = (p: HTMLElement, label: string, k: 'chub', lo: number, hi: number, d: number) => {
      el('div', 'hdr fg-h', p, label);
      const row = el('div', 'fg-pats', p);
      const v = el('span', 'small mir-val', row);
      const set = (x: number) => { this.L[k] = clamp(Math.round(x * 100) / 100, lo, hi); this.changed(); };
      el('button', 'fg-pat', row, '-').addEventListener('click', () => set(this.L[k] - d));
      el('button', 'fg-pat', row, '+').addEventListener('click', () => set(this.L[k] + d));
      v.dataset.val = k;
    };
    sw(left, 'SKIN', SKINS, 'skin');
    sw(left, 'BELLY', BELLIES, 'belly');
    opt(left, 'MARKINGS', PATS, 'pat');
    sw(left, 'MARKING COLOUR', PATCOLS, 'patCol');
    step(left, 'CHUB', 'chub', 0, 1, 0.25);
    opt(left, 'TAIL', TAILS, 'tail');
    opt(right, 'EYES', EYESTYLES, 'eyes');
    sw(right, 'EYE COLOUR', EYES, 'eye');
    opt(right, 'GILLS', GILLS, 'gills');
    opt(right, 'BACK', BACKS, 'back');
    sw(right, 'CRYSTAL GLOW', GLOWS, 'glow');
    el('div', 'hdr fg-h', right, 'CHEEKS');
    const bl = el('div', 'fg-pats', right);
    const blb = el('button', 'fg-pat', bl, 'BLUSH'); blb.dataset.k = 'blush'; blb.addEventListener('click', () => { this.L.blush = !this.L.blush; this.changed(); });
    const bot = panel('fg-bot', root);
    const act = el('div', 'mir-act', bot);
    new Btn(act, { icon: 'dna', label: 'SURPRISE ME', size: 'wide', tip: () => 'A whole new you.' }, () => { const n = this.L.name; this.L = randomLook(); this.L.name = n; this.changed(); this.child.wave(); });
    new Btn(act, { icon: 'heart', label: 'WAVE', size: 'wide', tip: () => 'Say hi.' }, () => { this.child.wave(); sfx('call', 1.6, 0.5); });
    new Btn(act, { icon: 'core', label: 'BACK', size: 'wide', tip: () => 'Keep the old look. [Esc]' }, () => this.close(null));
    new Btn(act, { icon: 'bio', label: 'THIS IS ME', size: 'wide', tip: () => 'Keep this look (remembered for every world).' }, () => { saveLook(this.L); sfx('build'); this.close(this.L); });
    this.refresh(root);
    return root;
  }
  private refresh(root = this.root) {
    root.querySelectorAll<HTMLElement>('.chip').forEach((c) => c.classList.toggle('on', (this.L as any)[c.dataset.k!] === Number(c.dataset.c)));
    root.querySelectorAll<HTMLElement>('.fg-pat[data-v]').forEach((b) => b.classList.toggle('on', String((this.L as any)[b.dataset.k!]) === b.dataset.v));
    root.querySelectorAll<HTMLElement>('.fg-pat[data-k="blush"]').forEach((b) => b.classList.toggle('on', this.L.blush));
    root.querySelectorAll<HTMLElement>('[data-val]').forEach((v) => { const i = Math.round(this.L.chub * 4); v.textContent = ['ROUND', 'PLUMP', 'CHUBBY', 'PUDGY', 'BALLOON'][i]; });
  }
  private changed() { this.dirty = 0.08; this.refresh(); sfx('click', 1, 0.4); if (Math.random() < 0.25) this.child.wave(); }

  private onMove = (e: PointerEvent) => { if (!this.drag) return; this.yaw -= (e.clientX - this.drag.x) * 0.008; this.pitch = clamp(this.pitch + (e.clientY - this.drag.y) * 0.004, -0.05, 0.9); this.drag = { x: e.clientX, y: e.clientY }; };
  private onUp = () => { this.drag = null; };
  private onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') this.close(null); };

  update(dt: number) {
    this.t += dt;
    if (this.dirty > 0) { this.dirty -= dt; if (this.dirty <= 0) { this.dirty = 0; this.child.setLook(this.L); } }
    if (!this.drag) this.yaw += Math.sin(this.t * 0.25) * dt * 0.08;
    const D = 7.6;
    this.cam.position.set(Math.sin(this.yaw) * Math.cos(this.pitch) * D, 1.45 + Math.sin(this.pitch) * D, Math.cos(this.yaw) * Math.cos(this.pitch) * D);
    this.cam.lookAt(0, 1.25, 0); this.cam.updateMatrixWorld();
    this.child.look.copy(this.cam.position);
    this.child.update(dt, this.cam);
    this.ring.scale.setScalar(1 + Math.sin(this.t * 1.6) * 0.015);
    this.fx.update(dt, innerHeight, this.cam.fov);
  }
  render(post: Post, t: number) { post.render(this.scene, this.cam, this.fxs, t); }
  resize(w: number, h: number) { this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
  private close(r: BabyLook | null) {
    removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp); removeEventListener('keydown', this.onKey);
    this.root.remove(); Tip.hide();
    this.done(r);
  }
}
