// The Gene Forge: design a species from genes you own. Body plans are gated by the body genes absorbed; parts
// must come from the same lineage unless your field can splice. The phenotype (stats, warnings, cost) updates
// live, and the creature walks on a pedestal of flesh while you sculpt it.
import * as THREE from 'three';
import type { Screen } from '../app/engine';
import type { Post } from '../gfx/post';
import type { Run } from '../game/run';
import { GENE, GENES, CAT_NAMES, LINEAGE_NAMES, PLAN_LEGS, PLAN_LINEAGE, compatible, type GeneCat, type Plan, type GeneDef } from '../life/genes';
import { pheno, type Design, type Pattern, type Cover, nameFor } from '../life/design';
import { buildSpeciesModel } from '../life/creatureMesh';
import { makeInstance } from '../life/creatureMesh';
import { Animator } from '../life/anim';
import { el, ui, panel, Btn, iconImg, Tip, toast, costHTML, S } from './kit';
import { icon } from './pixelart';
import { sfx } from '../audio/audio';
import { Rand, clamp } from '../core/rand';
import { binomial } from '../world/plantArt';
import { gbuf } from '../gfx/gbuf';
import { VEYR } from '../world/palette';
import type { Species } from '../game/species';

const PLAN_NAME: Record<Plan, string> = { hexapod: 'Hexapod', octopod: 'Arachnid', quadruped: 'Quadruped', biped: 'Biped', hexapodV: 'Six-Limbed', serpent: 'Serpent', gastropod: 'Gastropod', hominid: 'Hominid' };
const LIMITS: Record<GeneCat, number> = { body: 1, limb: 3, sense: 3, feed: 2, defense: 3, meta: 2, repro: 1 };
const SWATCH = [0x6a5a3a, 0x9a7a4a, 0xc8a040, 0xd8c08a, 0xe8e0c8, 0x5a6a3a, 0x3a7a5a, 0x2a6a7a, 0x3a4a7a, 0x5a3a7a, 0x8a3a5a, 0xa83a2a, 0xd86a2a, 0x2a2a30, 0x6a6a70, 0xb0a8a0, 0x7affe0, 0xffe070];

export interface ForgeResult { design: Design; parent: number | null }

export class Forge implements Screen {
  private scene = new THREE.Scene();
  private fx = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.05, 200);
  private root: HTMLDivElement;
  private d: Design;
  private mesh: THREE.SkinnedMesh | null = null; private anim: Animator | null = null;
  private yaw = 0.6; private pitch = 0.32; private dist = 4; private distGoal = 4;
  private drag: { x: number; y: number } | null = null;
  private dirty = 0; private t = 0;
  private statBox!: HTMLDivElement; private warnBox!: HTMLDivElement; private costBox!: HTMLDivElement; private nameIn!: HTMLInputElement;
  private geneBox!: HTMLDivElement; private tab: GeneCat = 'limb';
  private sliders: { key: keyof Design; set: (v: number) => void }[] = [];
  private planRow!: HTMLDivElement;
  private walk = true;
  private spores: THREE.Points;

  constructor(readonly run: Run, readonly vaults: number, readonly helix: () => number, readonly base: Species | null, readonly done: (r: ForgeResult | null) => void) {
    this.d = this.initial();
    // ---- chamber: pedestal of flesh and moss, rim of glow, drifting spores
    this.scene.background = new THREE.Color(0x05080a);
    this.scene.add(new THREE.HemisphereLight(0x9ab8d0, 0x203828, 1.6));
    const key = new THREE.DirectionalLight(0xfff0e0, 2.6); key.position.set(-3, 5, 4); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera as THREE.OrthographicCamera; sc.left = sc.bottom = -4; sc.right = sc.top = 4; sc.near = 0.5; sc.far = 20;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x7affe0, 1.6); rim.position.set(3, 2, -4); this.scene.add(rim);
    const ped = new THREE.Group();
    const m = new THREE.MeshLambertMaterial(); gbuf(m, 1);
    const g = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const inst = new THREE.InstancedMesh(g, m, 400);
    let n = 0; const mat = new THREE.Matrix4(); const col = new THREE.Color();
    for (let z = -6; z <= 6; z++) for (let x = -6; x <= 6; x++) {
      const r = Math.hypot(x, z); if (r > 6.3) continue;
      const h = r < 5 ? 0 : -0.25;
      mat.makeTranslation(x * 0.5, h - 0.25 + (r > 5.5 ? -0.1 : 0), z * 0.5);
      inst.setMatrixAt(n, mat);
      col.set(r > 5.2 ? 0x1e3a40 : (x * 7 + z * 3) % 5 === 0 ? VEYR.mossLight : (x + z) % 3 === 0 ? VEYR.mossDark : VEYR.moss);
      inst.setColorAt(n++, col);
    }
    inst.count = n; inst.receiveShadow = true;
    ped.add(inst);
    this.scene.add(ped);
    const sp = new Float32Array(300 * 3); for (let i = 0; i < 300; i++) { sp[i * 3] = (Math.random() - 0.5) * 14; sp[i * 3 + 1] = Math.random() * 6; sp[i * 3 + 2] = (Math.random() - 0.5) * 14; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.spores = new THREE.Points(sg, new THREE.PointsMaterial({ color: new THREE.Color(VEYR.vein).multiplyScalar(1.8), size: 2, sizeAttenuation: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.fx.add(this.spores);
    this.root = this.buildUI();
    this.rebuild();
    addEventListener('pointermove', this.onMove);
    addEventListener('pointerup', this.onUp);
    addEventListener('wheel', this.onWheel, { passive: true });
    addEventListener('keydown', this.onKey);
  }

  private plans(): Plan[] {
    const out: Plan[] = [];
    for (const g of this.run.genes.keys()) { const gd = GENE[g]; if (gd?.cat === 'body' && gd.plan) out.push(gd.plan); }
    return out;
  }
  private initial(): Design {
    if (this.base) return JSON.parse(JSON.stringify(this.base.design));
    const plans = this.plans();
    const plan = plans[plans.length - 1] ?? 'hexapod';
    return this.defaultsFor(plan);
  }
  private defaultsFor(plan: Plan): Design {
    const r = new Rand(Date.now() & 0xffff);
    const lin = PLAN_LINEAGE[plan];
    const owned = [...this.run.genes.keys()].map((k) => GENE[k]).filter(Boolean);
    const genes: string[] = [owned.find((g) => g.cat === 'body' && g.plan === plan)?.id ?? ''];
    const legs = PLAN_LEGS[plan].find((l) => this.run.has(l)); if (legs) genes.push(legs);
    for (const cat of ['sense', 'feed', 'meta', 'repro'] as GeneCat[]) { const g = owned.find((x) => x.cat === cat && x.lineage === lin && !genes.includes(x.id)); if (g) genes.push(g.id); }
    const d: Design = {
      name: '', latin: binomial(r), plan, lineage: lin, genes: genes.filter(Boolean), size: 0.3, len: 0.5, girth: 0.5, legLen: 0.5, legThick: 0.5, neck: 0.4, head: 0.5, tail: 0.4, segs: 3,
      colors: { base: 0x2f8f6e, belly: 0xb8e8c8, pattern: 0x0e3a30, accent: VEYR.vein, eye: 0x7affe0 }, pattern: 'stripes', patScale: 1, cover: lin === 'arthropod' ? 'chitin' : lin === 'vertebrate' ? 'scales' : 'slime', seed: r.int(1, 1e6),
    };
    d.name = 'Veyr ' + nameFor(d, r).split(' ')[1];
    return d;
  }

  // ------------------------------------------------------------------ UI
  private buildUI(): HTMLDivElement {
    const root = el('div', 'forge', ui());
    const top = panel('fg-top', root, 'dark');
    el('div', 'hdr fg-title', top, 'GENE FORGE');
    this.nameIn = el('input', 'fg-name', top) as HTMLInputElement;
    this.nameIn.value = this.d.name; this.nameIn.maxLength = 28;
    this.nameIn.addEventListener('input', () => { this.d.name = this.nameIn.value; });
    this.nameIn.addEventListener('keydown', (e) => e.stopPropagation());
    new Btn(top, { icon: 'dna', label: 'RE-ROLL', size: 'wide', tip: () => 'New colours and a new name.' }, () => { const r = new Rand(Math.random() * 1e9); this.d.colors = { base: r.pick(SWATCH), belly: r.pick(SWATCH), pattern: r.pick(SWATCH), accent: r.pick(SWATCH), eye: r.pick([0x7affe0, 0xffe070, 0xff6a4a, 0x101010]) }; this.d.pattern = r.pick(['plain', 'stripes', 'spots', 'bands', 'mottled', 'saddle', 'rings']); this.d.name = 'Veyr ' + nameFor(this.d, r).split(' ')[1]; this.nameIn.value = this.d.name; this.dirty = 0.01; this.refreshColors(); });
    // ---- left: body
    const left = panel('fg-left', root);
    el('div', 'hdr fg-h', left, 'BODY PLAN');
    this.planRow = el('div', 'fg-plans', left);
    this.renderPlans();
    el('div', 'hdr fg-h', left, 'PROPORTIONS');
    const sl = (label: string, key: keyof Design, tip: string, show = () => true) => {
      const row = el('div', 'fg-sl', left);
      el('span', 'small', row, label);
      const tr = el('div', 'track', row), knob = el('div', 'knob', tr);
      const set = (v: number) => { knob.style.left = `calc(${v * 100}% - ${3 * S}px)`; };
      set(this.d[key] as number);
      const upd = (e: PointerEvent) => { const r = tr.getBoundingClientRect(); const v = clamp((e.clientX - r.left) / r.width, 0, 1); (this.d as any)[key] = v; set(v); this.dirty = 0.12; };
      tr.addEventListener('pointerdown', (e) => { e.stopPropagation(); tr.setPointerCapture(e.pointerId); upd(e); sfx('click', 1, 0.4); });
      tr.addEventListener('pointermove', (e) => { if (e.buttons & 1) upd(e); });
      row.addEventListener('pointerenter', () => Tip.show(`<h4>${label}</h4>${tip}`, row)); row.addEventListener('pointerleave', () => Tip.hide());
      this.sliders.push({ key, set });
      (row as any).__show = show;
      return row;
    };
    sl('Size', 'size', 'Overall body size. Mass grows with the cube of length: big bodies are strong, slow to grow and hungry.');
    sl('Length', 'len', 'Body length for its size.');
    sl('Girth', 'girth', 'Width and depth of the torso: more mass, more organs, more food needed.');
    sl('Leg length', 'legLen', 'Longer legs take longer strides: faster, but they must carry the body.');
    sl('Leg thickness', 'legThick', 'Bone or chitin cross-section. Too thin for the mass and the animal is slow and fragile.');
    sl('Neck', 'neck', 'Reach and grazing height.');
    sl('Head', 'head', 'Bigger heads carry bigger eyes and jaws.');
    sl('Tail', 'tail', 'Balance and counterweight.');
    el('div', 'hdr fg-h', left, 'COLOUR');
    const sw = el('div', 'fg-sw', left);
    for (const [k, lab] of [['base', 'Body'], ['belly', 'Belly'], ['pattern', 'Pattern'], ['accent', 'Accent']] as const) {
      const r = el('div', 'fg-swr', sw);
      el('span', 'tiny', r, lab.toUpperCase());
      const row = el('div', 'fg-chips', r);
      for (const c of SWATCH) { const ch = el('div', 'chip', row); ch.style.background = '#' + c.toString(16).padStart(6, '0'); ch.dataset.k = k; ch.dataset.c = String(c); ch.addEventListener('click', () => { (this.d.colors as any)[k] = c; this.dirty = 0.05; this.refreshColors(); sfx('click', 1, 0.4); }); }
    }
    const pr = el('div', 'fg-pats', left);
    for (const p of ['plain', 'stripes', 'spots', 'bands', 'mottled', 'saddle', 'rings'] as Pattern[]) { const b = el('button', 'fg-pat', pr, p.toUpperCase()); b.dataset.p = p; b.addEventListener('click', () => { this.d.pattern = p; this.dirty = 0.05; this.refreshColors(); sfx('click', 1, 0.4); }); }
    const cr = el('div', 'fg-pats cover', left);
    for (const c of ['chitin', 'fur', 'scales', 'skin', 'slime'] as Cover[]) { const b = el('button', 'fg-pat', cr, c.toUpperCase()); b.dataset.c = c; b.addEventListener('click', () => { this.d.cover = c; this.dirty = 0.05; this.refreshColors(); sfx('click', 1, 0.4); }); }
    // ---- right: phenotype
    const right = panel('fg-right', root);
    el('div', 'hdr fg-h', right, 'PHENOTYPE');
    this.statBox = el('div', 'fg-stats', right);
    this.warnBox = el('div', 'fg-warn', right);
    this.refreshColors();
    // ---- bottom: genes
    const bot = panel('fg-bot', root);
    const tabs = el('div', 'fg-tabs', bot);
    for (const c of ['limb', 'sense', 'feed', 'defense', 'meta', 'repro'] as GeneCat[]) {
      const t = el('button', 'fg-tab', tabs); t.dataset.c = c;
      iconImg('cat-' + c, 'ti', t); el('span', '', t, CAT_NAMES[c].toUpperCase());
      t.addEventListener('click', () => { this.tab = c; this.renderGenes(); sfx('click', 1, 0.5); });
    }
    this.geneBox = el('div', 'fg-genes', bot);
    this.renderGenes();
    // ---- actions
    const act = el('div', 'fg-act', right);
    this.costBox = el('div', 'fg-cost', act);
    new Btn(act, { icon: 'brood', label: 'GROW SPECIES', size: 'big', disabled: () => this.invalid() }, () => this.finish());
    new Btn(act, { icon: 'stop', label: 'DISCARD', size: 'wide' }, () => this.close(null));
    const hint = el('div', 'tiny fg-hint', root, 'DRAG TO ORBIT · WHEEL ZOOMS · [W] WALK / STAND · [ESC] LEAVE');
    void hint;
    root.addEventListener('pointerdown', (e) => { if (e.target === root) { this.drag = { x: e.clientX, y: e.clientY }; } });
    return root;
  }
  private renderPlans() {
    this.planRow.innerHTML = '';
    const owned = this.plans();
    for (const p of ['hexapod', 'octopod', 'quadruped', 'biped', 'hexapodV', 'serpent', 'gastropod', 'hominid'] as Plan[]) {
      const ok = owned.includes(p);
      if (!ok && (p === 'hominid')) continue;
      const b = new Btn(this.planRow, { label: PLAN_NAME[p].toUpperCase(), size: 'wide', active: () => this.d.plan === p, disabled: () => (ok ? false : `Absorb a ${LINEAGE_NAMES[PLAN_LINEAGE[p]].toLowerCase()} body plan first`), tip: () => `<h4>${PLAN_NAME[p]}</h4>${GENES.find((g) => g.plan === p)?.desc ?? ''}` }, () => {
        if (this.d.plan === p) return;
        const keep = this.d.colors, nm = this.d.name;
        this.d = this.defaultsFor(p); this.d.colors = keep; if (nm) this.d.name = nm;
        this.nameIn.value = this.d.name;
        for (const s of this.sliders) s.set(this.d[s.key] as number);
        this.renderPlans(); this.renderGenes(); this.refreshColors(); this.dirty = 0.01;
      });
      b.refresh();
    }
  }
  private splice() { return this.run.splice(this.vaults); }
  private geneState(g: GeneDef): string | null {
    if (!compatible(g, this.d.lineage, this.splice())) return g.lineage !== this.d.lineage ? `${LINEAGE_NAMES[g.lineage]} gene: your field cannot graft it onto a ${LINEAGE_NAMES[this.d.lineage].toLowerCase()} yet` : 'Incompatible';
    if (g.cat === 'limb' && g.part && PLAN_LEGS[this.d.plan].includes(g.id) === false && Object.values(PLAN_LEGS).flat().includes(g.id)) return 'Walking legs of another body plan';
    return null;
  }
  private renderGenes() {
    for (const t of Array.from(document.querySelectorAll('.fg-tab'))) (t as HTMLElement).classList.toggle('act', (t as HTMLElement).dataset.c === this.tab);
    const box = this.geneBox; box.innerHTML = '';
    const owned = [...this.run.genes.values()].map((o) => GENE[o.id]).filter((g) => g && g.cat === this.tab);
    if (!owned.length) { el('div', 'small fg-none', box, `You own no ${CAT_NAMES[this.tab].toLowerCase()} genes yet. Digest more creatures.`); return; }
    for (const g of owned) {
      const on = this.d.genes.includes(g.id), why = this.geneState(g);
      const card = el('div', 'h-card fg-card' + (on ? ' sel' : '') + (why ? ' locked' : ''), box);
      iconImg('cat-' + g.cat, 'h-ico', card);
      el('div', 'h-name', card, g.name);
      el('div', 'tiny h-cat', card, `${LINEAGE_NAMES[g.lineage].toUpperCase()} · LV ${this.run.genes.get(g.id)!.level}`);
      if (why) el('div', 'h-tag up', card, 'LOCKED');
      card.addEventListener('pointerenter', () => Tip.show(`<h4>${g.name}</h4>${g.desc}${why ? `<div class="tip-warn">${why}</div>` : ''}`, card));
      card.addEventListener('pointerleave', () => Tip.hide());
      card.addEventListener('click', () => {
        if (why) { sfx('deny'); return; }
        if (on) { this.d.genes = this.d.genes.filter((x) => x !== g.id); }
        else {
          // walking legs are exclusive; categories have limits
          if (PLAN_LEGS[this.d.plan].includes(g.id)) this.d.genes = this.d.genes.filter((x) => !PLAN_LEGS[this.d.plan].includes(x));
          const inCat = this.d.genes.filter((x) => GENE[x]?.cat === g.cat);
          if (inCat.length >= LIMITS[g.cat]) { const drop = inCat.find((x) => !PLAN_LEGS[this.d.plan].includes(x)) ?? inCat[0]; this.d.genes = this.d.genes.filter((x) => x !== drop); }
          this.d.genes.push(g.id);
        }
        sfx('click', 1, 0.6); this.dirty = 0.01; this.renderGenes();
      });
    }
  }
  private refreshColors() {
    for (const ch of Array.from(document.querySelectorAll('.fg-chips .chip'))) { const e = ch as HTMLElement; e.classList.toggle('on', (this.d.colors as any)[e.dataset.k!] === Number(e.dataset.c)); }
    for (const b of Array.from(document.querySelectorAll('.fg-pat'))) { const e = b as HTMLElement; e.classList.toggle('on', e.dataset.p ? e.dataset.p === this.d.pattern : e.dataset.c === this.d.cover); }
  }

  private cost() { return 3 + Math.max(0, this.d.genes.length - 4); }
  private invalid(): string | false {
    if (!this.d.genes.some((g) => GENE[g]?.cat === 'body')) return 'No body plan';
    if (!this.d.genes.some((g) => GENE[g]?.cat === 'feed')) return 'It needs a way to feed';
    if (!this.d.genes.some((g) => GENE[g]?.cat === 'repro')) return 'It needs a way to reproduce';
    if (PLAN_LEGS[this.d.plan].length && !this.d.genes.some((g) => PLAN_LEGS[this.d.plan].includes(g))) return 'It needs limbs to move';
    if (this.helix() < this.cost()) return `Needs ${this.cost()} helix`;
    if (!this.d.name.trim()) return 'Name it';
    return false;
  }
  private updateStats() {
    const p = pheno(this.d), st = p.stats;
    const rows: [string, number, number, string][] = [
      ['HEALTH', st.hp, 600, `${Math.round(st.hp)}`], ['ARMOUR', st.armor, 0.75, `${Math.round(st.armor * 100)}%`], ['SPEED', st.speed, 10, `${st.speed.toFixed(1)} m/s`],
      ['ATTACK', st.attack, 40, st.attack.toFixed(1)], ['SIGHT', st.sight, 30, `${st.sight.toFixed(0)} m`], ['STEALTH', st.stealth, 0.9, `${Math.round(st.stealth * 100)}%`],
      ['UPKEEP', st.upkeep, 0.6, st.upkeep.toFixed(2)], ['BROOD', st.litter, 5, `${st.litter} / ${Math.round(st.gestation)}s`],
    ];
    this.statBox.innerHTML = `<div class="fg-mass tiny">${p.length.toFixed(2)} M · ${p.stats.mass < 10 ? p.stats.mass.toFixed(1) : Math.round(p.stats.mass)} KG · ${p.diet === 'carn' ? 'CARNIVORE' : p.diet === 'herb' ? 'HERBIVORE' : p.diet === 'scav' ? 'SCAVENGER' : 'OMNIVORE'}${p.canFly ? ' · FLIES' : ''}</div>` +
      rows.map(([n, v, max, txt]) => `<div class="fg-stat"><span class="tiny">${n}</span><div class="fg-sbar"><div style="width:${clamp(v / max, 0, 1) * 100}%"></div></div><span class="tiny v">${txt}</span></div>`).join('');
    const inv = this.invalid();
    this.warnBox.innerHTML = [...p.warnings, ...(inv ? [inv] : [])].map((w) => `<div class="tip-warn">▲ ${w}</div>`).join('') || '<div class="small" style="color:#7affe0">Anatomy sound.</div>';
    this.costBox.innerHTML = `<div class="small">DESIGN</div><span class="c-chg"><img src="${icon('helix')}">${this.cost()}</span> <span class="small">/ ${this.helix()}</span><div class="small">EACH</div>${costHTML(p.cost, Math.round(st.armor * 60))} <span class="small">· ${p.buildTime.toFixed(0)}S</span>`;
  }

  // ------------------------------------------------------------------ preview
  private rebuild() {
    if (this.mesh) { this.mesh.removeFromParent(); (this.mesh.material as THREE.Material).dispose(); this.mesh.geometry.dispose(); }
    this.d.segs = this.d.plan === 'serpent' ? Math.round(7 + this.d.len * 6) : Math.round(2 + this.d.len * 2);
    const model = buildSpeciesModel(this.d);
    const { mesh, bones } = makeInstance(model);
    this.mesh = mesh; this.anim = new Animator(model.rig, bones, mesh);
    const L = model.rig.length;
    this.distGoal = clamp(L * 2.2 + model.rig.height * 1.4 + 1.2, 2.2, 14);
    this.scene.add(mesh);
    this.updateStats();
  }
  private onMove = (e: PointerEvent) => { if (!this.drag) return; this.yaw -= (e.clientX - this.drag.x) * 0.008; this.pitch = clamp(this.pitch + (e.clientY - this.drag.y) * 0.005, 0.05, 1.1); this.drag = { x: e.clientX, y: e.clientY }; };
  private onUp = () => { this.drag = null; };
  private onWheel = (e: WheelEvent) => { this.distGoal = clamp(this.distGoal * (e.deltaY > 0 ? 1.1 : 0.9), 1.5, 16); };
  private onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') this.close(null); else if (e.key === 'w') this.walk = !this.walk; };

  update(dt: number) {
    this.t += dt;
    if (this.dirty > 0) { this.dirty -= dt; if (this.dirty <= 0) { this.dirty = 0; this.rebuild(); } }
    if (!this.drag) this.yaw += dt * 0.15;
    this.dist += (this.distGoal - this.dist) * Math.min(1, dt * 5);
    const h = this.mesh ? this.mesh.geometry.boundingSphere!.center.y : 0.5;
    this.cam.position.set(Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist, h + Math.sin(this.pitch) * this.dist, Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist);
    this.cam.lookAt(0, h * 0.8, 0);
    this.cam.updateMatrixWorld();
    if (this.mesh && this.anim) {
      this.mesh.position.set(0, 0, 0);
      this.mesh.updateMatrixWorld(true);
      this.anim.update(dt, { speed: this.walk ? Math.min(1.6, pheno(this.d).stats.speed * 0.35) : 0, turn: 0, state: this.walk ? 'move' : 'idle', act: 0, lookYaw: Math.sin(this.t * 0.7) * 0.4, lookPitch: 0, ground: () => 0, air: 0 });
    }
    const p = this.spores.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { let y = p.getY(i) + dt * 0.25; if (y > 6) y = 0; p.setY(i, y); }
    p.needsUpdate = true;
  }
  render(post: Post, t: number) { post.render(this.scene, this.cam, this.fx, t); }
  resize(w: number, h: number) { this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }

  private finish() {
    const inv = this.invalid(); if (inv) { toast(inv, 'warn'); return; }
    sfx('build');
    this.close({ design: JSON.parse(JSON.stringify(this.d)), parent: this.base?.id ?? null });
  }
  private close(r: ForgeResult | null) {
    removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp); removeEventListener('wheel', this.onWheel); removeEventListener('keydown', this.onKey);
    this.root.remove(); Tip.hide();
    if (this.mesh) { this.mesh.removeFromParent(); (this.mesh.material as THREE.Material).dispose(); }
    this.done(r);
  }
}
