// The gene lab. A digested body is taken apart by science and something older:
//  1 LIFT      a rune circle burns into the ground and three magnetic rings spin up into a trap around the corpse;
//  2 SEPARATE  its cells boil out in a column and the field sorts them like a mass spectrometer, each cell line
//              bending along its own arc into the orb of the gene it carries;
//  3 CHOOSE    the genome hangs in the trap as orbs, each a spinning helix. Take as many as your capacity allows;
//              once per harvest you may SPLICE one: the strands unzip and you cut and rewrite them in time
//              (a clean cut makes the gene stronger, a bad one snaps it);
//  4 ABSORB    the chosen strands are drawn along the field into the child's skull; the rest unravel into helix.
import * as THREE from 'three';
import { GENE, CAT_NAMES, LINEAGE_NAMES, type GeneCat } from '../life/genes';
import { el, ui, panel, Btn, iconImg, Tip, toast } from '../ui/kit';
import { QTE } from '../ui/qte';
import { sfx } from '../audio/audio';
import type { Run } from './run';
import type { Fx } from './fx';
import type { VeyrChild } from './child';
import { gbuf, GN_DECL } from '../gfx/gbuf';

export const CAT_COL: Record<GeneCat, number> = { body: 0xeee2c4, limb: 0xffd860, sense: 0x6ad0ff, feed: 0xff6a5a, defense: 0xffa040, meta: 0xff8ac0, repro: 0xb8ffb0 };
const TAU = Math.PI * 2;
const CELLS = 22;

interface Orb {
  id: string; g: THREE.Group; helix: THREE.InstancedMesh; shell: THREE.Mesh; base: THREE.Vector3; card: HTMLDivElement; tag: HTMLDivElement; sel: boolean; hover: number; isNew: boolean;
  t: number; fly: number; gone: boolean; got: number; unzip: number; unzipTo: number; spliced: number; dead: boolean; col: THREE.Color;
}
interface Cell { k: number; delay: number; dur: number; seed: number; p0: THREE.Vector3; p1: THREE.Vector3; p2: THREE.Vector3; done: boolean }

const shellMat = (col: THREE.Color) => new THREE.ShaderMaterial({
  uniforms: { uCol: { value: col }, uK: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
  fragmentShader: GN_DECL + 'uniform vec3 uCol; uniform float uK; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.2); float q = floor(f * 5.0) / 5.0; gl_FragColor = vec4(uCol * (0.15 + q * 1.6) * uK, 1.0); gNormal = vec4(0.0); }',
});
/** a glowing additive band (magnetic rings) */
const bandMat = (col: number) => new THREE.ShaderMaterial({
  uniforms: { uCol: { value: new THREE.Color(col) }, uK: { value: 0 }, uT: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: GN_DECL + 'uniform vec3 uCol; uniform float uK, uT; varying vec2 vUv; void main(){ float d = step(0.5, fract(vUv.x * 48.0 - uT * 3.0)); float k = uK * (0.45 + 0.55 * d); gl_FragColor = vec4(uCol * k * 0.95, 1.0); gNormal = vec4(0.0); }',
});
/** the rune circle: two rings, a hexagram and twelve glyphs, hand-pixelled into a canvas */
function runeTexture() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!; g.fillStyle = '#fff';
  const px = (x: number, y: number) => g.fillRect(Math.round(x), Math.round(y), 1, 1);
  const circle = (r: number) => { for (let i = 0; i < 720; i++) { const a = (i / 720) * TAU; px(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } };
  circle(62); circle(60); circle(46); circle(44); circle(14);
  const line = (a: number, b: number, r: number) => { for (let i = 0; i <= 200; i++) { const t = i / 200, x = Math.cos(a) * r * (1 - t) + Math.cos(b) * r * t, y = Math.sin(a) * r * (1 - t) + Math.sin(b) * r * t; px(64 + x, 64 + y); } };
  for (let k = 0; k < 2; k++) for (let i = 0; i < 3; i++) line(k * Math.PI / 3 + (i * TAU) / 3, k * Math.PI / 3 + ((i + 1) * TAU) / 3, 44);
  const GLYPHS = ['10101.01110.11011.01110.10101', '11111.10001.10101.10001.11111', '00100.01110.10101.00100.00100', '10001.01010.00100.01010.10001', '01110.10000.01110.00001.01110', '11100.10100.11111.00101.00111'];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU, cx = 64 + Math.cos(a) * 53, cy = 64 + Math.sin(a) * 53;
    GLYPHS[i % GLYPHS.length].split('.').forEach((row, y) => row.split('').forEach((b, x) => { if (b === '1') px(cx - 2 + x, cy - 2 + y); }));
  }
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

export class Harvest {
  private orbs: Orb[] = [];
  private cells: Cell[] = [];
  private cellMesh: THREE.InstancedMesh | null = null;
  private rings: THREE.Mesh[] = [];
  private rune: THREE.Mesh | null = null;
  private box: HTMLDivElement | null = null;
  private status: HTMLDivElement | null = null;
  private cardRow: HTMLDivElement | null = null;
  private countEl: HTMLDivElement | null = null;
  open = false;
  child: VeyrChild | null = null;
  private center = new THREE.Vector3();
  private src = new THREE.Vector3();
  private done: ((chosen: string[]) => void) | null = null;
  private closing = 0;
  private coreAt = new THREE.Vector3();
  private phase: 'lift' | 'sep' | 'choose' | 'absorb' = 'lift';
  private T = 0; private castT = 0; private zapT = 0;
  private splices = 1; private splicing = false;
  private cam: THREE.Camera | null = null;
  private cap = 1;

  constructor(readonly scene: THREE.Scene, readonly fxScene: THREE.Scene, readonly run: Run, readonly fx: Fx) {}

  start(at: THREE.Vector3, speciesName: string, genes: string[], cap: number, core: THREE.Vector3, done: (chosen: string[]) => void) {
    this.open = true; this.done = done; this.closing = 0; this.phase = 'lift'; this.T = 0; this.splices = 1; this.splicing = false; this.cap = cap;
    this.src.copy(at);
    this.center.copy(at).add(new THREE.Vector3(0, 2.6, 0));
    this.coreAt.copy(core);
    const unknown = genes.filter((g) => !this.run.has(g));
    const known = genes.filter((g) => this.run.has(g) && this.run.genes.get(g)!.level < 3);
    const offer = [...unknown, ...known].slice(0, 5);
    sfx('pulse', 0.8, 0.8); sfx('absorb', 1, 0.6);
    // ---- the trap: rune circle and magnetic rings
    const rm = new THREE.MeshBasicMaterial({ map: runeTexture(), color: new THREE.Color(0x7affe0).multiplyScalar(1.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    gbuf(rm, 0);
    this.rune = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), rm);
    this.rune.rotation.x = -Math.PI / 2; this.rune.position.copy(at).add(new THREE.Vector3(0, 0.08, 0)); this.rune.scale.setScalar(0.01);
    this.scene.add(this.rune);
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1.25 + i * 0.45, 0.035, 6, 96), bandMat(i === 1 ? 0xb8a0ff : 0x7affe0));
      r.position.copy(this.center); r.rotation.set(Math.PI / 2 + (i - 1) * 0.5, i * 0.7, 0);
      this.scene.add(r); this.rings.push(r);
    }
    // ---- UI (hidden until the genome hangs in the trap)
    this.box = panel('harvest', ui(), 'dark');
    el('div', 'hdr h-title', this.box, `GENOME OF THE ${speciesName.toUpperCase()}`);
    this.status = el('div', 'small h-status', this.box, 'MAGNETIC LIFT · THE FIELD TAKES HOLD');
    this.countEl = el('div', 'small h-count', this.box); this.countEl.style.display = 'none';
    this.cardRow = el('div', 'h-cards', this.box); this.cardRow.style.display = 'none';
    // ---- orbs and the cells that will fill them
    const geo = new THREE.IcosahedronGeometry(0.06, 1);
    const cellM = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec3 vC; varying vec3 vN; varying vec3 vV; void main(){\n#ifdef USE_INSTANCING_COLOR\n vC = instanceColor;\n#else\n vC = vec3(1.0);\n#endif\n vec4 mv = modelViewMatrix * instanceMatrix * vec4(position,1.0); vN = normalize(normalMatrix * mat3(instanceMatrix) * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: GN_DECL + 'varying vec3 vC; varying vec3 vN; varying vec3 vV; void main(){ float d = abs(dot(normalize(vN), vV)); float rim = pow(1.0 - d, 1.6); float nuc = smoothstep(0.82, 0.95, d); vec3 c = vC * (0.25 + rim * 1.6) * (1.0 - nuc * 0.85); gl_FragColor = vec4(c, 1.0); gNormal = vec4(0.0); }',
    });
    this.cellMesh = new THREE.InstancedMesh(geo, cellM, Math.max(1, offer.length * CELLS));
    this.cellMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, offer.length * CELLS) * 3), 3);
    this.cellMesh.frustumCulled = false;
    this.scene.add(this.cellMesh);
    offer.forEach((id, i) => {
      const gd = GENE[id];
      const isNew = !this.run.has(id);
      const g = new THREE.Group();
      const a = (i - (offer.length - 1) / 2) * 0.62;
      const base = this.center.clone().add(new THREE.Vector3(Math.sin(a) * 2.2, Math.cos(a * 2) * 0.25, Math.cos(a) * 0.4));
      g.position.copy(base); g.scale.setScalar(0.001);
      const col = new THREE.Color(CAT_COL[gd.cat]);
      const hm = new THREE.MeshLambertMaterial({ color: 0xffffff }); gbuf(hm, 1 + 32);
      const helix = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), hm, 26);
      helix.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(26 * 3), 3);
      for (let k = 0; k < 26; k++) helix.setColorAt(k, k % 2 ? col.clone().multiplyScalar(2.2) : new THREE.Color(0x7affe0).multiplyScalar(1.8));
      g.add(helix);
      const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.46, 1), shellMat(col.clone()));
      g.add(shell);
      this.scene.add(g);
      // card
      const card = el('div', 'h-card', this.cardRow!);
      iconImg('cat-' + gd.cat, 'h-ico', card);
      el('div', 'h-name', card, gd.name);
      el('div', 'tiny h-cat', card, `${CAT_NAMES[gd.cat].toUpperCase()} · ${LINEAGE_NAMES[gd.lineage].toUpperCase()}`);
      const tag = el('div', 'h-tag ' + (isNew ? 'new' : 'up'), card, isNew ? 'NEW' : `REINFORCE → LV ${(this.run.genes.get(id)?.level ?? 0) + 1}`);
      const sp = el('button', 'h-splice', card, 'SPLICE');
      sp.addEventListener('click', (e) => { e.stopPropagation(); this.splice(orb); });
      card.addEventListener('pointerenter', () => { orb.hover = 1; sfx('hover'); Tip.show(`<h4>${gd.name}</h4>${gd.desc}<div class="sub" style="margin-top:4px">SPLICE: unzip the strands and cut them in time. A clean cut strengthens the gene; a bad one snaps it.</div>`, card); });
      card.addEventListener('pointerleave', () => { orb.hover = 0; Tip.hide(); });
      card.addEventListener('click', () => this.toggle(orb));
      const orb: Orb = { id, g, helix, shell, base, card, tag, sel: false, hover: 0, isNew, t: i * 0.7, fly: 0, gone: false, got: 0, unzip: 0, unzipTo: 0, spliced: 0, dead: false, col };
      this.layHelix(orb);
      this.orbs.push(orb);
      // its cell line
      for (let c = 0; c < CELLS; c++) {
        const s = Math.random();
        const p0 = at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.9, Math.random() * 0.5, (Math.random() - 0.5) * 0.9));
        const p1 = at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 1.3 + Math.random() * 0.6, (Math.random() - 0.5) * 0.3));
        // the separator: heavier lines bend less; each category curves to its own side
        const out = base.clone().sub(this.center); const side = new THREE.Vector3(-out.z, 0, out.x).normalize();
        const p2 = this.center.clone().addScaledVector(out, 0.35).addScaledVector(side, (i % 2 ? 1 : -1) * (0.5 + i * 0.12)).add(new THREE.Vector3(0, 0.6, 0));
        this.cells.push({ k: i, delay: 0.25 + (c / CELLS) * 1.6 + s * 0.25, dur: 1.2 + Math.random() * 0.5, seed: s * 100, p0, p1, p2, done: false });
        this.cellMesh!.setColorAt(this.cells.length - 1, col.clone().multiplyScalar(1.3));
      }
    });
    const row = el('div', 'h-row', this.box);
    row.style.display = 'none'; (this as any).btnRow = row;
    new Btn(row, { label: 'ABSORB', icon: 'dna', size: 'big' }, () => this.confirm());
    new Btn(row, { label: 'LET IT GO', icon: 'skull', size: 'wide' }, () => { for (const o of this.orbs) o.sel = false; this.confirm(); });
    this.updateCount();
    if (!offer.length) this.confirm();
  }

  private layHelix(o: Orb) {
    const m = new THREE.Matrix4(), u = o.unzip;
    for (let k = 0; k < 26; k++) {
      const s = k % 2, t = Math.floor(k / 2) / 12, ang = t * Math.PI * 2.4 + s * Math.PI;
      const r = 0.17 + u * 0.16, apart = (s ? 1 : -1) * u * 0.18 * Math.sin(Math.PI * t + 0.3);
      m.makeTranslation(Math.cos(ang) * r + apart, (t - 0.5) * (0.75 + u * 0.25), Math.sin(ang) * r);
      o.helix.setMatrixAt(k, m);
    }
    o.helix.instanceMatrix.needsUpdate = true;
  }
  private toggle(o: Orb) {
    if (this.phase !== 'choose' || o.dead || this.splicing) return;
    if (o.sel) { o.sel = false; sfx('close'); }
    else {
      const n = this.orbs.filter((x) => x.sel).length;
      if (n >= this.cap) { const first = this.orbs.find((x) => x.sel); if (first) first.sel = false; }
      o.sel = true; sfx('click');
    }
    this.updateCount();
  }
  /** unzip a helix and cut it in time */
  private async splice(o: Orb) {
    if (this.phase !== 'choose' || this.splicing || this.splices <= 0 || o.dead || !this.cam) return;
    this.splicing = true; this.splices--;
    Tip.hide();
    o.unzipTo = 1; sfx('zap', 1, 0.6);
    this.child?.cast(o.g.position);
    if (this.status) this.status.textContent = 'SPLICING · CUT THE STRAND WHERE IT SPLITS';
    await new Promise((r) => setTimeout(r, 520));
    const v = o.g.position.clone().project(this.cam);
    const grade = await QTE.ring((v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight, 30, 'CUT!');
    const p = o.g.position;
    if (grade > 0) {
      o.spliced = grade;
      o.tag.className = 'h-tag splice'; o.tag.textContent = `SPLICED +${grade}`;
      (o.shell.material as THREE.ShaderMaterial).uniforms.uCol.value.set(0xffe070);
      this.fx.burst(p.x, p.y, p.z, 40, 0xffe070, { glow: true, speed: 2.5, up: 1, size: 3, life: 1, grav: -0.3 });
      sfx('done'); toast(grade === 2 ? 'A clean cut. The strand rewrites itself <b>twice over</b>.' : 'The strand takes the cut.', 'good', 2600);
      this.splicing = false;
      if (!o.sel) this.toggle(o);
    } else {
      o.dead = true; o.sel = false;
      this.fx.burst(p.x, p.y, p.z, 50, 0xff5a5a, { glow: true, speed: 4, up: 2, size: 3, life: 1.1, grav: 2 });
      o.g.visible = false; o.card.classList.add('dead');
      sfx('crack', 1, 0.8); toast('The strand snapped.', 'warn', 2200);
    }
    o.unzipTo = 0;
    this.splicing = false;
    for (const x of this.orbs) (x.card.querySelector('.h-splice') as HTMLElement).style.display = 'none';
    if (this.status) this.status.textContent = 'THE GENOME HANGS IN THE FIELD';
    this.updateCount();
  }
  private updateCount() {
    const n = this.orbs.filter((x) => x.sel).length;
    if (this.countEl) this.countEl.innerHTML = `CHOOSE ${this.cap} · <span style="color:#ffe070">${n} / ${this.cap}</span> TAKEN${this.splices > 0 ? ' · SPLICE ONE' : ''} · THE REST UNRAVEL INTO HELIX`;
    for (const o of this.orbs) o.card.classList.toggle('sel', o.sel);
  }
  private confirm() {
    if (!this.open || this.closing || this.splicing) return;
    const picked = this.orbs.filter((o) => o.sel && !o.dead);
    const chosen: string[] = [];
    for (const o of picked) for (let k = 0; k <= o.spliced; k++) chosen.push(o.id);
    this.closing = 1.8; this.phase = 'absorb';
    sfx(chosen.length ? 'absorb' : 'close');
    if (this.child) { this.coreAt.copy(this.child.headPos()); this.child.cast(this.center); }
    for (const o of this.orbs) { if (o.dead) continue; if (!o.sel) this.fx.burst(o.g.position.x, o.g.position.y, o.g.position.z, 22, 0xffe070, { glow: true, speed: 2, up: 1, size: 2.5, life: 0.9, grav: -0.5 }); else o.fly = 0.001; }
    this.box?.remove(); this.box = null; Tip.hide();
    const d = this.done; this.done = null;
    d?.(chosen);
  }
  click(mx: number, my: number, cam: THREE.Camera): boolean {
    this.cam = cam;
    if (!this.open || this.closing || this.phase !== 'choose') return false;
    const o = this.pick(mx, my, cam);
    if (o) { this.toggle(o); return true; }
    return false;
  }
  hoverAt(mx: number, my: number, cam: THREE.Camera) {
    this.cam = cam;
    if (!this.open || this.closing || this.phase !== 'choose') return;
    const o = this.pick(mx, my, cam);
    for (const x of this.orbs) { const h = x === o ? 1 : 0; if (h && !x.hover) sfx('hover'); x.card.classList.toggle('hov', !!h); if (!x.card.matches(':hover')) x.hover = h; }
  }
  private pick(mx: number, my: number, cam: THREE.Camera): Orb | null {
    let best: Orb | null = null, bd = 46;
    const v = new THREE.Vector3();
    for (const o of this.orbs) {
      if (o.dead) continue;
      v.copy(o.g.position).project(cam);
      const d = Math.hypot((v.x * 0.5 + 0.5) * innerWidth - mx, (-v.y * 0.5 + 0.5) * innerHeight - my);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  update(dt: number, cam?: THREE.Camera) {
    if (!this.open) return;
    if (cam) this.cam = cam;
    this.T += dt;
    const T = this.T;
    // ---- phases
    if (this.phase === 'lift' && T > 0.9) { this.phase = 'sep'; if (this.status) this.status.textContent = 'SEPARATING CELL LINES · THE FIELD SORTS THEM BY WHAT THEY CARRY'; }
    if (this.phase === 'sep' && this.cells.every((c) => c.done)) {
      this.phase = 'choose';
      if (this.status) this.status.textContent = 'THE GENOME HANGS IN THE FIELD';
      if (this.countEl) this.countEl.style.display = '';
      if (this.cardRow) this.cardRow.style.display = '';
      const row = (this as any).btnRow as HTMLDivElement | undefined; if (row) row.style.display = '';
      sfx('open');
    }
    // ---- the trap
    const trapK = this.phase === 'absorb' ? Math.max(0, this.closing / 1.8) : Math.min(1, T * 1.6);
    if (this.rune) { this.rune.scale.setScalar(0.01 + trapK); this.rune.rotation.z += dt * 0.25; (this.rune.material as THREE.MeshBasicMaterial).opacity = trapK * (0.75 + Math.sin(T * 3) * 0.15); }
    this.rings.forEach((r, i) => {
      r.rotation.x += dt * (0.6 + i * 0.35) * (i % 2 ? 1 : -1); r.rotation.y += dt * (0.4 + i * 0.2);
      const u = (r.material as THREE.ShaderMaterial).uniforms; u.uK.value = trapK * (this.phase === 'choose' ? 0.3 : 0.75); u.uT.value = T;
      r.scale.setScalar(0.4 + trapK * 0.6);
    });
    if (this.phase === 'lift' || this.phase === 'sep') {
      this.castT -= dt; if (this.castT <= 0) { this.castT = 0.7; this.child?.cast(this.center); }
      this.zapT -= dt;
      if (this.zapT <= 0) {
        this.zapT = 0.06;
        const r = this.rings[Math.floor(Math.random() * 3)], a = Math.random() * TAU, rr = 1.25 + Math.random() * 0.9;
        const p = new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, 0).applyEuler(r.rotation).add(this.center);
        this.fx.arc(p, this.src.clone().add(new THREE.Vector3(0, 0.4 + Math.random(), 0)), 0.12, Math.random() < 0.5 ? 0x7affe0 : 0xb8a0ff, 0.18);
        if (Math.random() < 0.15) sfx('zap', 1.4, 0.15);
        if (this.child && Math.random() < 0.3) this.fx.arc(this.child.headPos(), this.center, 0.1, this.child.lookData.glow, 0.2);
      }
    }
    // ---- cells
    if (this.cellMesh) {
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      this.cells.forEach((c, i) => {
        const o = this.orbs[c.k];
        const u = (T - c.delay) / c.dur;
        if (u <= 0 || c.done || this.phase === 'absorb') { m.makeScale(0, 0, 0); this.cellMesh!.setMatrixAt(i, m); return; }
        if (u >= 1) { c.done = true; o.got += 1 / CELLS; if (Math.random() < 0.2) sfx('hover', 1.5 + Math.random(), 0.2); m.makeScale(0, 0, 0); this.cellMesh!.setMatrixAt(i, m); return; }
        const a = 1 - u, P3 = o.base;
        p.set(0, 0, 0)
          .addScaledVector(c.p0, a * a * a).addScaledVector(c.p1, 3 * a * a * u).addScaledVector(c.p2, 3 * a * u * u).addScaledVector(P3, u * u * u);
        const sw = (1 - u) * 0.22; p.x += Math.cos(u * TAU * 2 + c.seed) * sw; p.z += Math.sin(u * TAU * 2 + c.seed) * sw;
        const sc = 0.7 + Math.sin(u * Math.PI) * 0.6;
        m.compose(p, q, s.setScalar(sc)); this.cellMesh!.setMatrixAt(i, m);
      });
      this.cellMesh.instanceMatrix.needsUpdate = true;
    }
    // ---- orbs
    for (const o of this.orbs) {
      if (o.gone || o.dead) continue;
      o.t += dt;
      const k = o.hover || o.sel ? 1 : 0;
      if (Math.abs(o.unzip - o.unzipTo) > 0.001) { o.unzip += (o.unzipTo - o.unzip) * Math.min(1, dt * 6); this.layHelix(o); }
      if (o.fly > 0) {
        o.fly += dt * 0.8;
        o.g.position.lerp(this.coreAt, Math.min(1, dt * (1.5 + o.fly * 4)));
        o.g.scale.setScalar(Math.max(0.05, 1 - o.fly * 0.5));
        if (Math.random() < dt * 20) this.fx.arc(o.g.position.clone(), this.coreAt, 0.08, CAT_COL[GENE[o.id].cat], 0.15);
        if (o.g.position.distanceTo(this.coreAt) < 0.5) { this.fx.burst(this.coreAt.x, this.coreAt.y, this.coreAt.z, 30, CAT_COL[GENE[o.id].cat], { glow: true, up: 3, speed: 3, size: 3, life: 1 }); o.gone = true; o.g.visible = false; sfx('done'); }
      } else if (this.closing > 0) {
        o.g.scale.multiplyScalar(Math.max(0, 1 - dt * 4));
      } else {
        o.g.position.lerp(o.base.clone().add(new THREE.Vector3(0, Math.sin(o.t * 1.6) * 0.12, 0)), Math.min(1, dt * 3));
        const grow = this.phase === 'choose' ? 1 : 0.15 + Math.min(1, o.got) * 0.85;
        const target = grow * (1 + k * 0.28 + Math.sin(o.t * 3) * 0.03 + o.unzip * 0.25);
        o.g.scale.setScalar(o.g.scale.x + (target - o.g.scale.x) * Math.min(1, dt * 8));
      }
      o.helix.rotation.y += dt * (1.2 + k * 2.5) * (1 - o.unzip * 0.8);
      (o.shell.material as THREE.ShaderMaterial).uniforms.uK.value = (0.8 + k * 0.9 + (o.sel ? 0.6 : 0)) * (1 - o.unzip * 0.6);
    }
    if (this.closing > 0) {
      this.closing -= dt;
      if (this.closing <= 0) this.close();
    }
  }
  private close() {
    for (const o of this.orbs) { o.g.removeFromParent(); o.helix.geometry.dispose(); (o.helix.material as THREE.Material).dispose(); o.shell.geometry.dispose(); (o.shell.material as THREE.Material).dispose(); }
    for (const r of this.rings) { r.removeFromParent(); r.geometry.dispose(); (r.material as THREE.Material).dispose(); }
    if (this.rune) { this.rune.removeFromParent(); this.rune.geometry.dispose(); const mm = this.rune.material as THREE.MeshBasicMaterial; mm.map?.dispose(); mm.dispose(); }
    if (this.cellMesh) { this.cellMesh.removeFromParent(); this.cellMesh.geometry.dispose(); (this.cellMesh.material as THREE.Material).dispose(); }
    this.orbs = []; this.cells = []; this.rings = []; this.rune = null; this.cellMesh = null; this.open = false; this.closing = 0;
  }
  get blocking() { return this.open && this.closing <= 0; }
}
