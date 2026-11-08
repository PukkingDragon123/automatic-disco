// The assembly bay (the mirror pool): fit out the golem: its asteroid rock, plate steel, reactor glow, the growth
// creeping over it, fissure pattern, face, head gear, hands and bulk, and a name; it rebuilds live and looks back.
import * as THREE from 'three';
import type { Screen } from '../app/engine';
import type { Post } from '../gfx/post';
import { el, panel, ui, Btn, Tip } from './kit';
import { sfx } from '../audio/audio';
import { VeyrChild, paintMetal, projUV, roundBox } from '../game/child';
import { Fx } from '../game/fx';
import { gbuf } from '../gfx/gbuf';
import { clamp } from '../core/rand';
import { type BabyLook, ROCKS, METALS, GLOWS, MOSSES, VEINS, HEADS, TOPS, ARMS, randomLook, saveLook } from '../game/babyLook';

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
  private table!: THREE.Group; private lamps: THREE.Mesh[] = [];

  constructor(look: BabyLook, readonly done: (l: BabyLook | null) => void) {
    this.L = { ...look };
    this.scene.background = new THREE.Color(0x0c0e10);
    this.scene.fog = new THREE.Fog(0x0c0e10, 8, 20);
    this.scene.add(new THREE.HemisphereLight(0xd8e0ff, 0x3a3020, 1.1));
    const key = new THREE.DirectionalLight(0xffe2b8, 3.0); key.position.set(-3, 6, 5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera as THREE.OrthographicCamera; sc.left = sc.bottom = -5; sc.right = sc.top = 5; sc.near = 0.5; sc.far = 20; this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x7affe0, 1.4); rim.position.set(3, 2.5, -4); this.scene.add(rim);
    // the assembly bay: a riveted steel floor, a hazard-ringed turntable, gantry posts with warning lamps
    const tex = (base: number, hz: boolean, rep: number) => { const t = paintMetal(base, hz); t.repeat.set(rep, rep); return t; };
    const mat = (t: THREE.Texture) => { const m = new THREE.MeshLambertMaterial({ map: t, flatShading: true }); gbuf(m, 1); return m; };
    const floorM = mat(tex(0x3a3e42, false, 1)), steel = mat(tex(0x5a5e62, false, 1)), haz = mat(tex(0xd0a020, true, 1));
    const floor = new THREE.Mesh(projUV(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), 0.35), floorM); floor.position.y = -0.16; floor.receiveShadow = true; this.scene.add(floor);
    const table = new THREE.Group(); this.table = table; this.scene.add(table);
    const top = new THREE.Mesh(projUV(new THREE.CylinderGeometry(1.6, 1.7, 0.32, 24, 1), 1.4), [haz, steel, steel]); top.receiveShadow = true; top.castShadow = true; table.add(top);
    const lip = new THREE.Mesh(projUV(new THREE.CylinderGeometry(1.25, 1.25, 0.34, 24, 1), 1.4), steel); lip.receiveShadow = true; table.add(lip);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 6), steel); b.position.set(Math.cos(a) * 1.42, 0.17, Math.sin(a) * 1.42); table.add(b); }
    this.lamps = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4, x = Math.cos(a) * 3.6, z = Math.sin(a) * 3.6;
      const post = new THREE.Mesh(projUV(roundBox(0.32, 4.2, 0.32, 0.03), 1.4), [steel, steel, steel, steel, haz, haz]); post.position.set(x, 1.95, z); post.castShadow = true; post.receiveShadow = true; this.scene.add(post);
      const lm = new THREE.MeshBasicMaterial({ color: 0xff8a20 }); gbuf(lm, 1);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 6), lm); lamp.position.set(x * 0.94, 2.6, z * 0.94); this.scene.add(lamp); this.lamps.push(lamp);
    }
    const gm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7affe0).multiplyScalar(1.6) }); gbuf(gm, 0);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.02, 6, 48), gm); this.ring.rotation.x = Math.PI / 2; this.ring.position.y = 0.17; this.scene.add(this.ring);
    this.fx = new Fx(this.fxs, this.scene);
    this.child = new VeyrChild(this.fx, 1.25, this.L, { grown: true });
    this.child.root.position.y = -0.22; this.child.hatch = 1;
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
    el('div', 'hdr fg-title', top, 'ASSEMBLY BAY');
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
    const step = (p: HTMLElement, label: string, k: 'bulk', lo: number, hi: number, d: number) => {
      el('div', 'hdr fg-h', p, label);
      const row = el('div', 'fg-pats', p);
      const v = el('span', 'small mir-val', row);
      const set = (x: number) => { this.L[k] = clamp(Math.round(x * 100) / 100, lo, hi); this.changed(); };
      el('button', 'fg-pat', row, '-').addEventListener('click', () => set(this.L[k] - d));
      el('button', 'fg-pat', row, '+').addEventListener('click', () => set(this.L[k] + d));
      v.dataset.val = k;
    };
    sw(left, 'ASTEROID ROCK', ROCKS, 'rock');
    sw(left, 'PLATE STEEL', METALS, 'metal');
    sw(left, 'REACTOR GLOW', GLOWS, 'glow');
    opt(left, 'FISSURES', VEINS, 'veins');
    step(left, 'BULK', 'bulk', 0, 1, 0.25);
    opt(right, 'FACE', HEADS, 'head');
    opt(right, 'HEAD GEAR', TOPS, 'top');
    opt(right, 'HANDS', ARMS, 'arms');
    opt(right, 'OVERGROWTH', MOSSES, 'moss');
    const bot = panel('fg-bot', root);
    const act = el('div', 'mir-act', bot);
    new Btn(act, { icon: 'dna', label: 'SURPRISE ME', size: 'wide', tip: () => 'Refit from the parts bin.' }, () => { const n = this.L.name; this.L = randomLook(); this.L.name = n; this.changed(); this.child.wave(); });
    new Btn(act, { icon: 'heart', label: 'WAVE', size: 'wide', tip: () => 'Say hi.' }, () => { this.child.wave(); sfx('call', 1.6, 0.5); });
    new Btn(act, { icon: 'core', label: 'BACK', size: 'wide', tip: () => 'Keep the old look. [Esc]' }, () => this.close(null));
    new Btn(act, { icon: 'bio', label: 'THIS IS ME', size: 'wide', tip: () => 'Keep this look (remembered for every world).' }, () => { saveLook(this.L); sfx('build'); this.close(this.L); });
    this.refresh(root);
    return root;
  }
  private refresh(root = this.root) {
    root.querySelectorAll<HTMLElement>('.chip').forEach((c) => c.classList.toggle('on', (this.L as any)[c.dataset.k!] === Number(c.dataset.c)));
    root.querySelectorAll<HTMLElement>('.fg-pat[data-v]').forEach((b) => b.classList.toggle('on', String((this.L as any)[b.dataset.k!]) === b.dataset.v));
    root.querySelectorAll<HTMLElement>('[data-val]').forEach((v) => { const i = Math.round(this.L.bulk * 4); v.textContent = ['SCOUT', 'LIGHT', 'STANDARD', 'HEAVY', 'SIEGE'][i]; });
  }
  private changed() { this.dirty = 0.08; this.refresh(); sfx('click', 1, 0.4); if (Math.random() < 0.25) this.child.wave(); }

  private onMove = (e: PointerEvent) => { if (!this.drag) return; this.yaw -= (e.clientX - this.drag.x) * 0.008; this.pitch = clamp(this.pitch + (e.clientY - this.drag.y) * 0.004, -0.05, 0.9); this.drag = { x: e.clientX, y: e.clientY }; };
  private onUp = () => { this.drag = null; };
  private onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') this.close(null); };

  update(dt: number) {
    this.t += dt;
    if (this.dirty > 0) { this.dirty -= dt; if (this.dirty <= 0) { this.dirty = 0; this.child.setLook(this.L); } }
    if (!this.drag) this.yaw += Math.sin(this.t * 0.25) * dt * 0.08;
    const D = 6.2;
    this.cam.position.set(Math.sin(this.yaw) * Math.cos(this.pitch) * D, 1.15 + Math.sin(this.pitch) * D, Math.cos(this.yaw) * Math.cos(this.pitch) * D);
    this.cam.lookAt(0, 0.95, 0); this.cam.updateMatrixWorld();
    this.child.look.copy(this.cam.position);
    this.child.update(dt, this.cam);
    this.ring.scale.setScalar(1 + Math.sin(this.t * 1.6) * 0.015);
    this.table.rotation.y = this.t * 0.15;
    this.lamps.forEach((l, i) => { l.visible = Math.sin(this.t * 3 + i * 1.6) > -0.2; });
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
