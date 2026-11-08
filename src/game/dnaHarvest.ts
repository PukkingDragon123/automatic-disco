// The harvest: a digested genome hangs above the ground as glowing orbs, each a spinning helix of one gene.
// You may take as many as your capacity allows; the rest unravel into helix.
import * as THREE from 'three';
import { GENE, CAT_NAMES, LINEAGE_NAMES, type GeneCat } from '../life/genes';
import { el, ui, panel, Btn, iconImg, Tip } from '../ui/kit';
import { sfx } from '../audio/audio';
import type { Run } from './run';
import type { Fx } from './fx';
import { gbuf, GN_DECL } from '../gfx/gbuf';

export const CAT_COL: Record<GeneCat, number> = { body: 0xeee2c4, limb: 0xffd860, sense: 0x6ad0ff, feed: 0xff6a5a, defense: 0xffa040, meta: 0xff8ac0, repro: 0xb8ffb0 };

interface Orb { id: string; g: THREE.Group; helix: THREE.InstancedMesh; shell: THREE.Mesh; base: THREE.Vector3; card: HTMLDivElement; sel: boolean; hover: number; isNew: boolean; t: number; fly: number; gone: boolean }

export class Harvest {
  private orbs: Orb[] = [];
  private box: HTMLDivElement | null = null;
  private countEl: HTMLDivElement | null = null;
  open = false;
  private center = new THREE.Vector3();
  private done: ((chosen: string[]) => void) | null = null;
  private closing = 0;
  private coreAt = new THREE.Vector3();

  constructor(readonly scene: THREE.Scene, readonly fxScene: THREE.Scene, readonly run: Run, readonly fx: Fx) {}

  start(at: THREE.Vector3, speciesName: string, genes: string[], cap: number, core: THREE.Vector3, done: (chosen: string[]) => void) {
    this.open = true; this.done = done; this.closing = 0;
    this.center.copy(at).add(new THREE.Vector3(0, 2.6, 0));
    this.coreAt.copy(core);
    // offer: unknown genes first, then reinforcements, at most five
    const unknown = genes.filter((g) => !this.run.has(g));
    const known = genes.filter((g) => this.run.has(g) && (this.run.genes.get(g)!.level < 3));
    const offer = [...unknown, ...known].slice(0, 5);
    sfx('absorb', 1, 0.8);
    this.box = panel('harvest', ui(), 'dark');
    el('div', 'hdr h-title', this.box, `GENOME OF THE ${speciesName.toUpperCase()}`);
    this.countEl = el('div', 'small h-count', this.box);
    const cards = el('div', 'h-cards', this.box);
    offer.forEach((id, i) => {
      const gd = GENE[id];
      const isNew = !this.run.has(id);
      const g = new THREE.Group();
      const a = (i - (offer.length - 1) / 2) * 0.62;
      const base = this.center.clone().add(new THREE.Vector3(Math.sin(a) * 2.2, Math.cos(a * 2) * 0.25, Math.cos(a) * 0.4));
      g.position.copy(at).add(new THREE.Vector3(0, 0.3, 0));
      // helix of tiny blocks
      const col = new THREE.Color(CAT_COL[gd.cat]);
      const hm = new THREE.MeshLambertMaterial({ color: 0xffffff });
      gbuf(hm, 1 + 32);
      const helix = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), hm, 26);
      helix.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(26 * 3), 3);
      const m = new THREE.Matrix4();
      for (let k = 0; k < 26; k++) {
        const s = k % 2, t = Math.floor(k / 2) / 12, ang = t * Math.PI * 2.4 + s * Math.PI;
        m.makeTranslation(Math.cos(ang) * 0.17, (t - 0.5) * 0.75, Math.sin(ang) * 0.17);
        helix.setMatrixAt(k, m);
        helix.setColorAt(k, s ? col.clone().multiplyScalar(2.2) : new THREE.Color(0x7affe0).multiplyScalar(1.8));
      }
      g.add(helix);
      const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.46, 1), new THREE.ShaderMaterial({
        uniforms: { uCol: { value: col }, uK: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader: GN_DECL + 'uniform vec3 uCol; uniform float uK; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.2); float q = floor(f * 5.0) / 5.0; gl_FragColor = vec4(uCol * (0.15 + q * 1.6) * uK, 1.0); gNormal = vec4(0.0); }',
      }));
      g.add(shell);
      this.scene.add(g);
      // card
      const card = el('div', 'h-card', cards);
      iconImg('cat-' + gd.cat, 'h-ico', card);
      el('div', 'h-name', card, gd.name);
      el('div', 'tiny h-cat', card, `${CAT_NAMES[gd.cat].toUpperCase()} · ${LINEAGE_NAMES[gd.lineage].toUpperCase()}`);
      el('div', 'h-tag ' + (isNew ? 'new' : 'up'), card, isNew ? 'NEW' : `REINFORCE → LV ${(this.run.genes.get(id)?.level ?? 0) + 1}`);
      card.addEventListener('pointerenter', () => { orb.hover = 1; sfx('hover'); Tip.show(`<h4>${gd.name}</h4>${gd.desc}`, card); });
      card.addEventListener('pointerleave', () => { orb.hover = 0; Tip.hide(); });
      card.addEventListener('click', () => this.toggle(orb, cap));
      const orb: Orb = { id, g, helix, shell, base, card, sel: false, hover: 0, isNew, t: i * 0.7, fly: 0, gone: false };
      this.orbs.push(orb);
    });
    const row = el('div', 'h-row', this.box);
    new Btn(row, { label: 'ABSORB', icon: 'dna', size: 'big' }, () => this.confirm());
    new Btn(row, { label: 'LET IT GO', icon: 'skull', size: 'wide' }, () => { for (const o of this.orbs) o.sel = false; this.confirm(); });
    this.cap = cap;
    this.updateCount();
    if (!offer.length) this.confirm();
  }
  private cap = 1;
  private toggle(o: Orb, cap: number) {
    if (o.sel) { o.sel = false; sfx('close'); }
    else {
      const n = this.orbs.filter((x) => x.sel).length;
      if (n >= cap) { const first = this.orbs.find((x) => x.sel); if (first) first.sel = false; }
      o.sel = true; sfx('click');
    }
    this.updateCount();
  }
  private updateCount() {
    const n = this.orbs.filter((x) => x.sel).length;
    if (this.countEl) this.countEl.innerHTML = `CHOOSE ${this.cap} · <span style="color:#ffe070">${n} / ${this.cap}</span> TAKEN · THE REST UNRAVEL INTO HELIX`;
    for (const o of this.orbs) o.card.classList.toggle('sel', o.sel);
  }
  private confirm() {
    if (!this.open || this.closing) return;
    const chosen = this.orbs.filter((o) => o.sel).map((o) => o.id);
    this.closing = 1.6;
    sfx(chosen.length ? 'absorb' : 'close');
    for (const o of this.orbs) { if (!o.sel) this.fx.burst(o.g.position.x, o.g.position.y, o.g.position.z, 22, 0xffe070, { glow: true, speed: 2, up: 1, size: 2.5, life: 0.9, grav: -0.5 }); else o.fly = 0.001; }
    this.box?.remove(); this.box = null; Tip.hide();
    const d = this.done; this.done = null;
    d?.(chosen);
  }
  /** mouse picking: returns true if the click was consumed */
  click(mx: number, my: number, cam: THREE.Camera): boolean {
    if (!this.open || this.closing) return false;
    const o = this.pick(mx, my, cam);
    if (o) { this.toggle(o, this.cap); return true; }
    return false;
  }
  hoverAt(mx: number, my: number, cam: THREE.Camera) {
    if (!this.open || this.closing) return;
    const o = this.pick(mx, my, cam);
    for (const x of this.orbs) { const h = x === o ? 1 : 0; if (h && !x.hover) sfx('hover'); x.card.classList.toggle('hov', !!h); if (!x.card.matches(':hover')) x.hover = h; }
  }
  private pick(mx: number, my: number, cam: THREE.Camera): Orb | null {
    let best: Orb | null = null, bd = 46;
    const v = new THREE.Vector3();
    for (const o of this.orbs) {
      v.copy(o.g.position).project(cam);
      const sx = (v.x * 0.5 + 0.5) * innerWidth, sy = (-v.y * 0.5 + 0.5) * innerHeight;
      const d = Math.hypot(sx - mx, sy - my);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  update(dt: number) {
    if (!this.open) return;
    for (const o of this.orbs) {
      if (o.gone) continue;
      o.t += dt;
      const k = o.hover || o.sel ? 1 : 0;
      if (o.fly > 0) {
        o.fly += dt * 0.8;
        o.g.position.lerp(this.coreAt, Math.min(1, dt * (1.5 + o.fly * 4)));
        o.g.scale.setScalar(Math.max(0.05, 1 - o.fly * 0.5));
        if (o.g.position.distanceTo(this.coreAt) < 0.6) { this.fx.burst(this.coreAt.x, this.coreAt.y, this.coreAt.z, 30, CAT_COL[GENE[o.id].cat], { glow: true, up: 3, speed: 3, size: 3, life: 1 }); o.gone = true; o.g.visible = false; sfx('done'); }
      } else if (this.closing > 0) {
        o.g.scale.multiplyScalar(Math.max(0, 1 - dt * 4));
      } else {
        o.g.position.lerp(o.base.clone().add(new THREE.Vector3(0, Math.sin(o.t * 1.6) * 0.12, 0)), Math.min(1, dt * 3));
        const s = 1 + k * 0.28 + Math.sin(o.t * 3) * 0.03;
        o.g.scale.setScalar(s);
      }
      o.helix.rotation.y += dt * (1.2 + k * 2.5);
      (o.shell.material as THREE.ShaderMaterial).uniforms.uK.value = 0.8 + k * 0.9 + (o.sel ? 0.6 : 0);
    }
    if (this.closing > 0) {
      this.closing -= dt;
      if (this.closing <= 0) this.close();
    }
  }
  private close() {
    for (const o of this.orbs) { o.g.removeFromParent(); o.helix.geometry.dispose(); (o.helix.material as THREE.Material).dispose(); o.shell.geometry.dispose(); }
    this.orbs = []; this.open = false; this.closing = 0;
  }
  get blocking() { return this.open && this.closing <= 0; }
}
void Btn;
