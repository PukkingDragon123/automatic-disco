// Spinning 3D part icons for the gene lab's carousel. Each card has a transparent window; the part (one leg, the
// head with its horns, the tail, a wing, an organ...) is a real model cut out of a creature grown with that gene,
// riding in front of the lab camera exactly behind the window, turning on a little holo plate. Because they are in
// the lab's own scene they go through the same G-buffer: ink outlines, bloom, the same lamps. Models are grown one
// per frame and cached by what they depend on.
import * as THREE from 'three';
import { buildSpeciesModel } from '../life/creatureMesh';
import { GENE } from '../life/genes';
import type { Design } from '../life/design';
import { partGeometry, partMaterial, symbolFor, symbolMaterial, regUniforms, SYMBOLIC, type PartCut, type RegU } from '../life/partPreview';
import { GN_DECL } from '../gfx/gbuf';
import { tabOf, donorFor, TABS, REG, type LabCtx, type TabId } from './labRules';
import { CAT_COL } from '../game/dnaHarvest';
import { isBio } from '../life/genesBio';
import { bioSymbol } from '../biotech/organs';

interface Built { geo: THREE.BufferGeometry; tex: THREE.Texture; sym: boolean; used: number }
interface Slot { el: HTMLElement; gene: string | null; key: string; obj: THREE.Group | null; part: THREE.Mesh | null; plate: THREE.Mesh; U: RegU; spin: number; hover: number; ready: boolean; tilt: number; pu: { uCol: { value: THREE.Color }; uT: { value: number }; uOn: { value: number } } }

const PLATE_F = GN_DECL + `uniform vec3 uCol; uniform float uT, uOn; varying vec2 vUv;
// the viewing box behind a card's window: a backlit cyanotype ground, white-ink grid and a turntable ellipse
void main(){
  vec2 px = vUv * vec2(108.0, 84.0);
  vec2 q = vUv - vec2(0.5, 0.36);
  vec3 c = mix(vec3(0.075, 0.15, 0.24), vec3(0.115, 0.23, 0.35), smoothstep(0.75, 0.0, length(vUv - vec2(0.5, 0.62))));
  float grid = (mod(floor(px.x), 9.0) < 1.0 || mod(floor(px.y), 9.0) < 1.0) ? 1.0 : 0.0;
  c += vec3(0.11, 0.17, 0.24) * grid * 0.45;
  float e = length(q * vec2(1.0, 2.6));
  c += vec3(0.85, 0.9, 0.92) * step(abs(e - 0.34), 0.006) * (0.35 + 0.25 * uOn);
  float tick = step(abs(fract(atan(q.y * 2.6, q.x) / 6.2831 * 24.0 + uT * 0.05) - 0.5), 0.04) * step(abs(e - 0.36), 0.014);
  c += vec3(0.85, 0.9, 0.92) * tick * 0.25;
  c *= 1.0 - 0.25 * step(0.5, fract(vUv.y * 42.0 - uT * 0.6)) * 0.15;
  gl_FragColor = vec4(c, 1.0);
  gNormal = vec4(0.5, 0.5, 1.0, 0.0);
}`;
const PLATE_V = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';

/** what a gene's icon cuts out of its donor */
function cutFor(tab: TabId, id: string): PartCut {
  switch (tab) {
    case 'legs': return { regions: [REG.legs], oneSide: true };
    case 'arms': return id === 'hump' ? { regions: [], whole: true } : { regions: [REG.arms], oneSide: true };
    case 'tail': return id === 'stinger' ? { regions: [], whole: true } : { regions: [REG.tail] };
    case 'wings': return { regions: [REG.wings], oneSide: true };
    case 'eyes': case 'senses': case 'jaw': case 'crown': return { regions: [REG.head, REG.eyes, REG.crown, REG.jaw, REG.feelers] };
    default: return { regions: [], whole: true };
  }
}
const maskOf = (regs: number[]) => regs.reduce((m, r) => m + 2 ** r, 0);

export class LabIcons {
  readonly root = new THREE.Group();
  private slots: Slot[] = [];
  private cache = new Map<string, Built>();
  private queue: Slot[] = [];
  private t = 0;
  constructor(readonly cam: THREE.PerspectiveCamera, readonly ctx: LabCtx) { cam.add(this.root); }

  /** what a gene's icon depends on (so a change elsewhere on the body does not re-grow it) */
  private keyOf(id: string, base: Design): string {
    if (SYMBOLIC.has(id) || !GENE[id] || isBio(id)) return 'sym:' + id;
    const tab = tabOf(id);
    const group = tab === 'eyes' || tab === 'senses' || tab === 'jaw' || tab === 'crown' ? ['eyes', 'senses', 'jaw', 'crown'] : tab === 'legs' || tab === 'arms' ? ['legs', 'arms'] : tab === 'tail' || tab === 'wings' ? [tab] : null;
    const genes = group ? base.genes.filter((g) => group.includes(tabOf(g))).sort() : [...base.genes].sort();
    const { plan, colors, pattern, cover, size, len, girth, legLen, legThick, neck, head, tail, seed, patScale } = base;
    return id + '|' + JSON.stringify([plan, colors, pattern, cover, size, len, girth, legLen, legThick, neck, head, tail, seed, patScale, genes]);
  }

  /** bind icons to card windows (null gene: an unknown gene, shown as a dim strand) */
  set(cards: { el: HTMLElement; gene: string | null }[], base: Design) {
    const keep = new Map<HTMLElement, Slot>(); for (const s of this.slots) keep.set(s.el, s);
    const next: Slot[] = [];
    for (const c of cards) {
      const key = c.gene ? this.keyOf(c.gene, base) : 'sym:unknown';
      let s = keep.get(c.el);
      if (s && s.key === key) { keep.delete(c.el); next.push(s); continue; }
      if (s) { keep.delete(c.el); this.drop(s); }
      const pu = { uCol: { value: new THREE.Color(c.gene ? CAT_COL[GENE[c.gene]?.cat ?? 'meta'] : 0x3a5a4a) }, uT: { value: 0 }, uOn: { value: 0 } };
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ uniforms: pu, vertexShader: PLATE_V, fragmentShader: PLATE_F }));
      plate.visible = false; this.root.add(plate);
      s = { el: c.el, gene: c.gene, key, obj: null, part: null, plate, U: regUniforms(), spin: Math.random() * 6, hover: 0, ready: false, tilt: 0.32, pu };
      next.push(s); this.queue.push(s);
      (s as Slot & { base: Design }).base = JSON.parse(JSON.stringify(base));
    }
    for (const s of keep.values()) this.drop(s);
    this.slots = next;
  }
  hover(el: HTMLElement | null) { for (const s of this.slots) s.hover = s.el === el ? 1 : 0; }
  private drop(s: Slot) {
    s.obj?.removeFromParent(); s.plate.removeFromParent(); s.plate.geometry.dispose(); (s.plate.material as THREE.Material).dispose();
    if (s.part) (s.part.material as THREE.Material).dispose();
    this.queue = this.queue.filter((q) => q !== s);
  }
  private build(s: Slot) {
    let b = this.cache.get(s.key);
    if (!b) {
      const id = s.gene ?? 'unknown';
      if (!s.gene || SYMBOLIC.has(id) || !GENE[id] || isBio(id)) { const sym = s.gene && isBio(id) ? bioSymbol(id) : symbolFor(s.gene ? id : 'unknown'); b = { geo: sym.geo, tex: sym.tex, sym: true, used: 0 }; }
      else {
        const donor = donorFor(this.ctx, (s as Slot & { base: Design }).base, id);
        const m = buildSpeciesModel(donor);
        const tab = tabOf(id);
        const geo = partGeometry(m, cutFor(tab, id)) ?? partGeometry(m, { regions: [], whole: true })!;
        m.geo.dispose(); m.depthMat.dispose();
        b = { geo, tex: m.tex, sym: false, used: 0 };
      }
      this.cache.set(s.key, b);
      this.trim();
    }
    b.used = this.t;
    const tab = s.gene && GENE[s.gene] ? tabOf(s.gene) : 'organs';
    s.U.uMask.value = b.sym ? 0 : maskOf(TABS[tab].regs.length > 6 ? [] : TABS[tab].regs);
    (s.U.uCol.value as THREE.Color).set(0xcfdde6);
    s.U.uK.value = 0.45; s.U.uHolo.value = s.gene ? 0.16 : 0.5;
    const mat = b.sym ? symbolMaterial(b.tex, s.U) : partMaterial(b.tex, s.U);
    const part = new THREE.Mesh(b.geo, mat);
    if (!s.gene) (mat as THREE.MeshLambertMaterial).color.setRGB(0.25, 0.32, 0.3);
    const obj = new THREE.Group(); obj.add(part); obj.visible = false;
    this.root.add(obj);
    s.obj = obj; s.part = part; s.ready = true;
    // legs, tails and wings hang along one axis: tip them so they fill the window
    s.tilt = tab === 'legs' || tab === 'tail' ? 0.25 : tab === 'wings' ? 0.7 : 0.32;
  }
  private trim() {
    if (this.cache.size <= 28) return;
    const inUse = new Set(this.slots.map((s) => s.key));
    const old = [...this.cache.entries()].filter(([k]) => !inUse.has(k)).sort((a, b) => a[1].used - b[1].used);
    for (const [k, b] of old.slice(0, this.cache.size - 28)) { b.geo.dispose(); b.tex.dispose(); this.cache.delete(k); }
  }

  /** follow the card windows; grow one queued model per frame */
  update(dt: number) {
    this.t += dt;
    for (let n = 0; n < 1 && this.queue.length; n++) {
      // build the visible ones first
      const vis = this.queue.findIndex((s) => { const r = s.el.getBoundingClientRect(); return r.right > 0 && r.left < innerWidth && r.width > 0; });
      const s = this.queue.splice(vis >= 0 ? vis : 0, 1)[0];
      try { this.build(s); } catch (e) { console.error('lab icon', s.gene, e); s.ready = true; }
    }
    const cam = this.cam, D = 0.6, th = Math.tan((cam.fov * Math.PI) / 360), wpp = (2 * D * th) / innerHeight;
    for (const s of this.slots) {
      const r = s.el.getBoundingClientRect();
      const on = r.width > 4 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight && s.el.isConnected && !!s.el.offsetParent;
      s.plate.visible = on;
      if (s.obj) s.obj.visible = on && s.ready;
      if (!on) continue;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const x = ((cx / innerWidth) * 2 - 1) * D * th * cam.aspect, y = (-(cy / innerHeight) * 2 + 1) * D * th;
      s.plate.position.set(x, y, -D - 0.06); s.plate.scale.set(r.width * wpp * 1.0 * (D + 0.06) / D, r.height * wpp * (D + 0.06) / D, 1);
      s.pu.uT.value = this.t; s.pu.uOn.value = s.hover;
      if (s.obj && s.part) {
        s.spin += dt * (0.9 + s.hover * 2.2);
        const rad = Math.min(r.width, r.height) * 0.46 * wpp * (1 + s.hover * 0.1);
        s.obj.position.set(x, y + r.height * 0.03 * wpp, -D + rad * 0.2);
        s.obj.scale.setScalar(rad);
        s.obj.rotation.set(s.tilt, s.spin, 0);
        s.U.uT.value = this.t; s.U.uK.value = 0.35 + s.hover * 0.45;
      }
    }
  }
  dispose() {
    for (const s of this.slots) this.drop(s);
    this.slots = [];
    for (const b of this.cache.values()) { b.geo.dispose(); b.tex.dispose(); }
    this.cache.clear();
    this.root.removeFromParent();
  }
}
