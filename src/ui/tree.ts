// The Tree of Descent: every species met, made or watched branch off, laid out as a pannable, zoomable family
// tree. Founders sit on top grouped by lineage, descendants hang below; lines are coloured by who owns the child
// (wild, yours, a rival's); extinct lines go grey. Click a species for its genome and numbers, and evolve your own.
import * as THREE from 'three';
import type { Screen } from '../app/engine';
import type { Post } from '../gfx/post';
import type { Registry, Species } from '../game/species';
import { el, panel, ui, Btn, Tip } from './kit';
import { thumb } from './thumbs';
import { sfx } from '../audio/audio';
import { GENE, CAT_NAMES, LINEAGE_NAMES } from '../life/genes';
import { CAT_COL } from '../game/dnaHarvest';
import { clamp } from '../core/rand';
import { gbuf } from '../gfx/gbuf';

const NX = 104, NY = 150, CW = 76, CH = 104;
const OWN = { wild: '#d8c890', veyr: '#7affe0', rival: '#ff8ab0' } as const;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

export class TreeScreen implements Screen {
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(30, 1, 0.1, 10);
  private root: HTMLDivElement; private view: HTMLDivElement; private info: HTMLDivElement;
  private pan = { x: 0, y: 0 }; private zoom = 1;
  private drag: { x: number; y: number; moved: boolean } | null = null;
  private pos = new Map<number, { x: number; y: number }>();
  private nodes = new Map<number, HTMLDivElement>();
  private sel: Species | null = null;
  private stars: THREE.Points;

  constructor(readonly reg: Registry, readonly opts: { close: () => void; evolve?: (sp: Species) => void; time: number }) {
    this.scene.background = new THREE.Color(0x060a0c);
    const n = 600, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { p[i * 3] = (Math.random() - 0.5) * 6; p[i * 3 + 1] = (Math.random() - 0.5) * 4; p[i * 3 + 2] = -2 - Math.random() * 4; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.stars = new THREE.Points(g, gbuf(new THREE.PointsMaterial({ color: 0x3a6a62, size: 2, sizeAttenuation: false }), 0));
    this.scene.add(this.stars);
    this.root = el('div', 'tree', ui());
    const top = panel('tr-top', this.root, 'dark');
    el('div', 'hdr tr-title', top, 'TREE OF DESCENT');
    const list = reg.list;
    const mine = list.filter((s) => s.owner === 'veyr').length, riv = list.filter((s) => s.owner === 'rival').length, ext = list.filter((s) => s.extinct || (s.alive <= 0 && s.total > 0)).length;
    el('div', 'small tr-legend', top, `<span style="color:${OWN.wild}">■ WILD</span> <span style="color:${OWN.veyr}">■ YOURS ${mine}</span> <span style="color:${OWN.rival}">■ RIVAL ${riv}</span> <span style="color:#6a6a70">■ EXTINCT ${ext}</span> · ${list.length} SPECIES`);
    new Btn(top, { icon: 'stop', label: 'CLOSE', size: 'wide', tip: () => '[Esc] / [T]' }, () => this.close());
    this.view = el('div', 'tr-view', this.root);
    this.info = panel('tr-info', this.root);
    this.info.style.display = 'none';
    this.layout();
    this.build();
    // start on your newest species, else the oldest founder
    const focus = [...list].reverse().find((s) => s.owner === 'veyr') ?? list[0];
    if (focus) { const q = this.pos.get(focus.id)!; this.pan.x = innerWidth * 0.4 - q.x * NX - CW / 2; this.pan.y = Math.max(190, innerHeight * 0.45 - q.y * NY); this.select(focus); }
    this.apply();
    this.root.addEventListener('pointerdown', this.onDown);
    addEventListener('pointermove', this.onMove); addEventListener('pointerup', this.onUp);
    this.root.addEventListener('wheel', this.onWheel, { passive: false });
    addEventListener('keydown', this.onKey);
    sfx('open');
  }

  // ------------------------------------------------------------------ layout: tidy tree, founders grouped by lineage
  private layout() {
    const list = this.reg.list, kids = new Map<number, Species[]>(), roots: Species[] = [];
    for (const s of list) { if (s.parent === null || !this.reg.get(s.parent)) roots.push(s); else { const k = kids.get(s.parent) ?? []; k.push(s); kids.set(s.parent, k); } }
    roots.sort((a, b) => (a.design.lineage < b.design.lineage ? -1 : a.design.lineage > b.design.lineage ? 1 : a.born - b.born));
    let cursor = 0, lastLin = '';
    const place = (s: Species, depth: number): number => {
      const ch = (kids.get(s.id) ?? []).sort((a, b) => a.born - b.born);
      let x: number;
      if (!ch.length) { x = cursor; cursor += 1; } else { const xs = ch.map((c) => place(c, depth + 1)); x = (Math.min(...xs) + Math.max(...xs)) / 2; }
      this.pos.set(s.id, { x, y: depth });
      return x;
    };
    for (const r of roots) {
      if (r.design.lineage !== lastLin) { if (lastLin) cursor += 0.8; lastLin = r.design.lineage; const lab = el('div', 'tr-lin hdr', this.view, LINEAGE_NAMES[r.design.lineage].toUpperCase()); lab.style.left = `${cursor * NX}px`; lab.style.top = `-46px`; }
      place(r, 0); cursor += 0.25;
    }
  }
  private build() {
    const list = this.reg.list;
    let w = 0, h = 0;
    for (const p of this.pos.values()) { w = Math.max(w, p.x * NX + CW); h = Math.max(h, p.y * NY + CH); }
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', String(w + 40)); svg.setAttribute('height', String(h + 40)); svg.setAttribute('class', 'tr-svg'); svg.setAttribute('shape-rendering', 'crispEdges');
    this.view.appendChild(svg);
    for (const s of list) {
      if (s.parent === null) continue;
      const a = this.pos.get(s.parent), b = this.pos.get(s.id); if (!a || !b) continue;
      const x0 = a.x * NX + CW / 2, y0 = a.y * NY + CH, x1 = b.x * NX + CW / 2, y1 = b.y * NY, ym = Math.round((y0 + y1) / 2);
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', `M${Math.round(x0)} ${y0} V${ym} H${Math.round(x1)} V${y1}`);
      const dead = s.extinct || (s.alive <= 0 && s.total > 0);
      path.setAttribute('stroke', dead ? '#3a3a42' : OWN[s.owner]); path.setAttribute('stroke-width', '3'); path.setAttribute('fill', 'none');
      if (s.role === 'drift') path.setAttribute('stroke-dasharray', '6 4');
      svg.appendChild(path);
    }
    for (const s of list) {
      const p = this.pos.get(s.id)!;
      const dead = s.extinct || (s.alive <= 0 && s.total > 0);
      const n = el('div', `tr-node own-${s.owner}${dead ? ' dead' : ''}`, this.view);
      n.style.left = `${p.x * NX}px`; n.style.top = `${p.y * NY}px`;
      const img = el('img', 'tr-img', n) as HTMLImageElement; img.src = thumb(s); img.draggable = false;
      el('div', 'tr-name', n, s.name);
      el('div', 'tiny tr-pop', n, dead ? '✝ EXTINCT' : `◉ ${s.alive} · ${s.design.plan.toUpperCase()}`);
      n.addEventListener('pointerup', (e) => { if (this.drag && this.drag.moved) return; e.stopPropagation(); this.select(s); sfx('click'); });
      n.addEventListener('pointerenter', () => { sfx('hover'); });
      this.nodes.set(s.id, n);
    }
  }
  private select(s: Species) {
    this.sel = s;
    for (const [id, n] of this.nodes) n.classList.toggle('sel', id === s.id);
    const I = this.info; I.innerHTML = ''; I.style.display = 'flex';
    const d = s.design, st = s.pheno.stats;
    const img = el('img', 'tr-big', I) as HTMLImageElement; img.src = thumb(s);
    el('div', 'hdr tr-iname', I, s.name);
    el('div', 'small tr-latin', I, `<i>${d.latin}</i>`);
    el('div', 'tiny', I, `${LINEAGE_NAMES[d.lineage].toUpperCase()} · ${d.plan.toUpperCase()} · <span style="color:${OWN[s.owner]}">${s.owner === 'veyr' ? 'YOURS' : s.owner.toUpperCase()}</span>`);
    const par = s.parent !== null ? this.reg.get(s.parent) : null;
    if (par) { const pl = el('div', 'small tr-par', I, `DESCENDS FROM <u>${par.name}</u>`); pl.addEventListener('click', () => { this.select(par); this.focus(par); }); }
    const born = Math.max(0, s.born), mm = Math.floor(born / 60);
    el('div', 'small', I, `ALIVE ${s.alive} · EVER ${s.total} · KILLS ${s.kills}${born > 0 ? ` · AROSE ${mm}m ${Math.floor(born % 60)}s` : ' · NATIVE'}`);
    const bars = el('div', 'tr-stats', I);
    const stat = (k: string, v: number, max: number) => { const r = el('div', 'tr-stat', bars); el('span', 'tiny', r, k); const b = el('div', 'fg-sbar', r); (el('div', '', b) as HTMLDivElement).style.width = `${clamp(v / max, 0.03, 1) * 100}%`; el('span', 'tiny', r, String(Math.round(v * 10) / 10)); };
    stat('HP', st.hp, 400); stat('BITE', st.attack, 60); stat('SPEED', st.speed, 8); stat('MASS', st.mass, 2000); stat('ARMOR', st.armor, 1);
    const gl = el('div', 'tr-genes', I);
    for (const id of d.genes) { const g = GENE[id]; if (!g) continue; const c = el('span', 'tr-gene', gl, g.name); c.style.borderColor = hex(CAT_COL[g.cat]); c.addEventListener('pointerenter', () => Tip.show(`<h4>${g.name}</h4><div class="sub">${CAT_NAMES[g.cat]}</div>${g.desc}`, c)); c.addEventListener('pointerleave', () => Tip.hide()); }
    if (this.opts.evolve && s.owner === 'veyr') new Btn(I, { icon: 'builder', label: 'EVOLVE FROM THIS', size: 'wide', tip: () => 'Open the Gene Forge with this species as the starting point.' }, () => { const e = this.opts.evolve!; this.close(); e(s); });
  }
  private focus(s: Species) { const q = this.pos.get(s.id); if (!q) return; this.pan.x = innerWidth * 0.4 - (q.x * NX + CW / 2) * this.zoom; this.pan.y = Math.max(190, innerHeight * 0.45 - q.y * NY * this.zoom); this.apply(); }
  private apply() { this.view.style.transform = `translate(${Math.round(this.pan.x)}px, ${Math.round(this.pan.y)}px) scale(${this.zoom})`; }
  private onDown = (e: PointerEvent) => { if ((e.target as HTMLElement).closest('.tr-info, .tr-top')) return; this.drag = { x: e.clientX, y: e.clientY, moved: false }; };
  private onMove = (e: PointerEvent) => { if (!this.drag) return; const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) this.drag.moved = true; this.pan.x += dx; this.pan.y += dy; this.drag.x = e.clientX; this.drag.y = e.clientY; this.apply(); };
  private onUp = () => { setTimeout(() => { this.drag = null; }, 0); };
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const steps = [0.5, 0.75, 1, 1.5, 2];
    const i = steps.indexOf(this.zoom), j = clamp(i + (e.deltaY > 0 ? -1 : 1), 0, steps.length - 1), z = steps[j];
    if (z === this.zoom) return;
    this.pan.x = e.clientX - ((e.clientX - this.pan.x) * z) / this.zoom; this.pan.y = e.clientY - ((e.clientY - this.pan.y) * z) / this.zoom;
    this.zoom = z; this.apply();
  };
  private onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 't' || e.key === 'T') this.close(); };

  update(dt: number) { this.stars.rotation.z += dt * 0.01; }
  render(post: Post, t: number) { post.render(this.scene, this.cam, undefined, t); }
  resize(w: number, h: number) { this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
  private close() {
    removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp); removeEventListener('keydown', this.onKey);
    this.root.remove(); Tip.hide(); sfx('close');
    this.opts.close();
  }
}
