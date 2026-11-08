// The void between worlds: the main menu (a planet turning, the seed circling it, every world you became hanging
// in a ring as small green globes), the archive (look at a conquered world, launch an offspring from it), and
// the ascension finale (the region borders dissolve, the whole planet goes over to the Veyr).
import * as THREE from 'three';
import type { Screen } from '../app/engine';
import { type Post, resetGrade } from '../gfx/post';
import { el, panel, ui, Btn, Tip } from './kit';
import { TITLE, titleArt } from './hudArt';
import { brassWord } from './machine';
import { sfx } from '../audio/audio';
import { makeGlobe, stars, type Globe } from './globe';
import { makePlanet, type Planet } from '../world/planet';
import { gbuf } from '../gfx/gbuf';
import { VEYR } from '../world/palette';
import { GENE } from '../life/genes';

export interface ArchiveEntry { seed: number; name: string; date: string; species: number; genes: string[]; regions: number }

function asteroid() {
  const g = new THREE.IcosahedronGeometry(0.09, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i); v.multiplyScalar(0.8 + Math.abs(Math.sin(v.x * 40) * Math.cos(v.y * 33)) * 0.4); p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals();
  const m = new THREE.MeshLambertMaterial({ color: 0x3a3048, emissive: new THREE.Color(VEYR.vein), emissiveIntensity: 0.25, flatShading: true }); gbuf(m, 1);
  return new THREE.Mesh(g, m);
}

export class MenuScreen implements Screen {
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(30, 1, 0.05, 200);
  private globe: Globe; private seedRock: THREE.Mesh;
  private worlds: { g: Globe; e: ArchiveEntry }[] = [];
  private root: HTMLDivElement; private arch: HTMLDivElement | null = null;
  private t = 0; private focus: number = -1;
  private camPos = new THREE.Vector3(0, 0.35, 5.4); private camLook = new THREE.Vector3(0.6, 0, 0);

  constructor(readonly opts: { hasSave: boolean; archive: ArchiveEntry[]; onNew: (seed: number) => void; onContinue: () => void; onLaunch: (e: ArchiveEntry) => void; onMirror: (back: () => void) => void }) {
    this.scene.background = new THREE.Color(0x02040a);
    this.scene.add(stars(1800, 70));
    const show: Planet = makePlanet(1000 + Math.floor(Math.random() * 9000));
    this.globe = makeGlobe(show, 1);
    this.globe.group.position.set(1.35, -0.1, 0);
    this.scene.add(this.globe.group);
    this.seedRock = asteroid(); this.scene.add(this.seedRock);
    opts.archive.forEach((e, i) => {
      const p = makePlanet(e.seed); for (const r of p.regions) r.state = 'veyr';
      const g = makeGlobe(p, 0.22, { ascended: true });
      const a = (i / Math.max(1, opts.archive.length)) * Math.PI * 2;
      g.group.position.set(1.35 + Math.cos(a) * 1.9, Math.sin(a * 2) * 0.3, Math.sin(a) * 1.9);
      g.refresh(); this.scene.add(g.group); this.worlds.push({ g, e });
    });
    this.root = el('div', 'menu', ui());
    const title = el('div', 'mn-title', this.root);
    title.style.width = `calc(${TITLE.w}px * var(--s))`; title.style.height = `calc(${TITLE.h}px * var(--s))`;
    title.style.backgroundImage = `url(${titleArt().url()})`;
    const logo = el('div', 'mn-logo', title);
    brassWord('ODDWORLD', 'Jersey', 40).then((c) => { c.className = 'mn-logo-cv'; c.style.width = `calc(${c.width}px * var(--s))`; c.style.height = `calc(${c.height}px * var(--s))`; logo.appendChild(c); });
    el('div', 'scr mn-tag', title, 'TAKE THE WORLD FOR EARTH.<span class="cur">&#9608;</span>');
    const col = panel('mn-col', this.root, 'panel');
    if (opts.hasSave) new Btn(col, { icon: 'planet', label: 'CONTINUE', size: 'big', tip: () => 'Return to the world you are taking.' }, () => this.close(() => opts.onContinue()));
    new Btn(col, { icon: 'core', label: 'NEW WORLD', size: 'big', tip: () => opts.hasSave ? 'Abandon the current world and fall on a new one.' : 'Fall on a new world.' }, () => this.close(() => opts.onNew(Math.floor(Math.random() * 1e6))));
    new Btn(col, { icon: 'tree', label: `ARCHIVE · ${opts.archive.length}`, size: 'big', tip: () => 'Worlds claimed for Earth.' }, () => this.openArchive());
    new Btn(col, { icon: 'mirror', label: 'ASSEMBLY BAY', size: 'big', tip: () => 'Refit Unit 07: paint, plating, lens and name.' }, () => { this.root.style.visibility = 'hidden'; Tip.hide(); opts.onMirror(() => { this.root.style.visibility = ''; }); });
    const seedRow = el('div', 'mn-seed', col);
    el('span', 'small', seedRow, 'SEED');
    const inp = el('input', 'fg-name mn-seedin', seedRow) as HTMLInputElement; inp.placeholder = 'random'; inp.maxLength = 9;
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && inp.value) this.close(() => opts.onNew(Math.abs(parseInt(inp.value, 36) || 1) % 1e9)); });
    el('div', 'tiny mn-foot', this.root, 'U.S.P.C. FIELD MANUAL 7 · WASD/EDGE PAN · WHEEL ZOOM · RIGHT-CLICK ORDERS · SELECTOR: SCROLL OR [ ] TO TURN, ENTER TO FIRE');
    sfx('open');
  }
  private openArchive() {
    if (this.arch) { this.arch.remove(); this.arch = null; this.focus = -1; return; }
    const a = panel('mn-arch', this.root, 'dark'); this.arch = a;
    el('div', 'hdr', a, 'WORLDS CLAIMED FOR EARTH');
    if (!this.opts.archive.length) { el('div', 'small', a, 'None yet. Claim a world and it will hang here, green.'); return; }
    const list = el('div', 'mn-alist', a);
    this.opts.archive.forEach((e, i) => {
      const c = el('div', 'h-card mn-acard', list);
      el('div', 'h-name', c, e.name);
      el('div', 'tiny', c, `${e.date} · ${e.regions} REGIONS · ${e.species} SPECIES · ${e.genes.length} GENES`);
      c.addEventListener('click', () => { this.focus = i; sfx('click'); this.detail(e); });
    });
  }
  private detail(e: ArchiveEntry) {
    const old = this.root.querySelector('.mn-detail'); old?.remove();
    const d = panel('mn-detail', this.root, 'dark');
    el('div', 'hdr', d, e.name.toUpperCase());
    el('div', 'small', d, `Claimed for Earth on ${e.date}. ${e.regions} regions, ${e.species} species in its tree.`);
    const gl = el('div', 'tr-genes', d);
    for (const id of e.genes.slice(0, 24)) if (GENE[id]) el('span', 'tr-gene', gl, GENE[id].name);
    new Btn(d, { icon: 'planet', label: 'LAUNCH OFFSPRING', size: 'big', tip: () => 'Throw a seed of this world at a new one. It carries three of its genes.' }, () => this.close(() => this.opts.onLaunch(e)));
  }
  update(dt: number) {
    this.t += dt;
    const t = this.t;
    this.globe.group.rotation.y += dt * 0.06; this.globe.mat.uniforms.uT.value = t;
    // the seed circles the world it wants
    const a = t * 0.35;
    this.seedRock.position.set(1.35 + Math.cos(a) * 1.45, 0.25 + Math.sin(a * 0.7) * 0.25, Math.sin(a) * 1.45);
    this.seedRock.rotation.set(t * 0.9, t * 0.6, 0);
    for (const w of this.worlds) { w.g.group.rotation.y += dt * 0.2; w.g.mat.uniforms.uT.value = t; }
    const want = this.focus >= 0 && this.worlds[this.focus] ? this.worlds[this.focus].g.group.position : null;
    const pos = want ? want.clone().add(new THREE.Vector3(0, 0.15, 0.95)) : new THREE.Vector3(0, 0.35, 5.4);
    const look = want ? want.clone() : new THREE.Vector3(0.6, 0, 0);
    this.camPos.lerp(pos, Math.min(1, dt * 2.5)); this.camLook.lerp(look, Math.min(1, dt * 2.5));
    this.cam.position.copy(this.camPos); this.cam.lookAt(this.camLook); this.cam.updateMatrixWorld();
  }
  render(post: Post, t: number) { resetGrade(post.grade); post.render(this.scene, this.cam, undefined, t); }
  resize(w: number, h: number) { this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
  private closed = false;
  private close(then: () => void) { if (this.closed) return; this.closed = true; this.root.remove(); Tip.hide(); sfx('click'); then(); }
  dispose() { if (!this.closed) { this.closed = true; this.root.remove(); } }
}

/** ascension: the borders dissolve and the whole world goes over to the Veyr */
export class AscendScreen implements Screen {
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(30, 1, 0.05, 200);
  private globe: Globe; private root: HTMLDivElement; private line: HTMLDivElement;
  private t = 0; private flipped = 0; private order: number[];
  private lines: string[];
  constructor(readonly planet: Planet, name: string, readonly done: () => void) {
    this.scene.background = new THREE.Color(0x02040a);
    this.scene.add(stars(1600, 70));
    this.globe = makeGlobe(planet, 1); this.scene.add(this.globe.group);
    this.order = planet.regions.filter((r) => r.state !== 'veyr').map((r) => r.id);
    this.root = el('div', 'ascend', ui());
    this.line = el('div', 'title asc-line', this.root, '');
    this.lines = [`${planet.name} answers to Earth now.`, 'Every root, every river, every beast: logged, tagged, ours.', 'The rivals are scrap. The survey is complete.', `${name} plants the flag.`, `${planet.name}: CLAIMED FOR HUMANITY.`];
    sfx('pulse', 0.3, 1);
  }
  update(dt: number) {
    this.t += dt;
    const t = this.t;
    this.globe.group.rotation.y += dt * 0.15;
    this.globe.mat.uniforms.uT.value = t;
    // regions flip one by one, then the borders go
    const want = Math.min(this.order.length, Math.floor(t / 0.45));
    while (this.flipped < want) { this.planet.regions[this.order[this.flipped]].state = 'veyr'; this.flipped++; this.globe.refresh(); sfx('grow', 1, 0.5); }
    if (t > this.order.length * 0.45 + 0.8 && this.globe.mat.uniforms.uAsc.value < 1) { this.globe.mat.uniforms.uAsc.value = 1; (this.globe.atmo.material as THREE.ShaderMaterial).uniforms.uCol.value.set(VEYR.vein); sfx('absorb', 0.6, 1); }
    const li = Math.floor((t - 1) / 3.2);
    const txt = li >= 0 && li < this.lines.length ? this.lines[li] : '';
    if (this.line.textContent !== txt) this.line.textContent = txt;
    if (li >= this.lines.length && !this.root.querySelector('.px-btn')) new Btn(this.root, { icon: 'planet', label: 'INTO THE ARCHIVE', size: 'big' }, () => { this.root.remove(); this.done(); });
    const z = 3.6 - Math.min(1, t / 20) * 0.8;
    this.cam.position.set(0, 0.3, z); this.cam.lookAt(0, 0, 0); this.cam.updateMatrixWorld();
  }
  render(post: Post, t: number) { resetGrade(post.grade); post.render(this.scene, this.cam, undefined, t); }
  resize(w: number, h: number) { this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
  dispose() { this.root.remove(); }
}
