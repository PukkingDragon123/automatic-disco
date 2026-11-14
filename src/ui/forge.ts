// The Gene Lab (formerly the Gene Forge). Put a species in the specimen tank and rebuild it limb by limb: click a
// part of the floating specimen (or a tab) and a carousel of the genes you own for that body area slides up, each
// shown as a spinning 3D model of just that part; pick one and the field emitters arc to the tank, the fluid
// flashes and the specimen re-grows with it while the scientists react. Lineage, body plan and splice limits
// follow labRules.ts (the Gene Splicer opens cross-species grafts, the Deep Sequencer adds slots, the Growth Vat
// lifts the size cap). Filing the design hands it back through `done` (the flow adds it to run.reg) and emits
// 'prefab' { kind: 'creature', name }. The specimen shelf loads any species you have absorbed.
import type { Engine, Screen } from '../app/engine';
import type { Post } from '../gfx/post';
import type { Run } from '../game/run';
import type { Species } from '../game/species';
import type { Game } from '../game/game';
import { GENE, GENES, LINEAGE_NAMES, type GeneCat } from '../life/genes';
import { pheno, nameFor, type Design } from '../life/design';
import { toast, Tip, costHTML } from './kit';
import { icon } from './pixelart';
import { sfx } from '../audio/audio';
import { Rand, clamp } from '../core/rand';
import { LabScene, TANK } from './labScene';
import { LabIcons } from './labIcons';
import { LabUI, SWATCH, type CardSpec } from './labUI';
import { CAT_COL } from '../game/dnaHarvest';
import { thumb } from './thumbs';
import {
  TABS, TAB_ORDER, REG_TABS, REG_NAME, tabOf, install, remove, invalid, cost, limits, lockReason, ownedPlans, defaultsFor, intoTank, sizeCap, spliceLevel, fxLine, fixSegs, PLAN_NAME,
  type TabId, type LabCtx, type Change,
} from './labRules';

export interface ForgeResult { design: Design; parent: number | null }
export interface LabOpts {
  /** game events ('prefab' on filing) */
  emit?: (ev: string, data: unknown) => void;
  /** the species for the jars (default: designs and everything absorbed this run) */
  species?: Species[];
}
const CAT_SHORT: Record<GeneCat, string> = { body: 'PLAN', limb: 'LIMB', sense: 'SENSE', feed: 'FEED', defense: 'DEF', meta: 'META', repro: 'BROOD' };
const SEL_COL = 0xffcd6e, HOV_COL = 0x7affe0;
const maskOf = (regs: number[]) => regs.reduce((m, r) => m + 2 ** r, 0);

export class Forge implements Screen {
  private L: LabScene;
  private ui: LabUI;
  private icons: LabIcons;
  private ctx: LabCtx;
  private d: Design;
  private start: Design;
  private parent: number | null;
  private tab: TabId | 'genome' = 'genome';
  private hintTabs: TabId[] = [];
  private cardList: CardSpec[] = [];
  private jarSp: Species[] = [];
  private dirty = 0; private iconDirty = 0;
  private ptr: { id: number; x: number; y: number; sx: number; sy: number; moved: boolean; type: string } | null = null;
  private pts = new Map<number, { x: number; y: number }>(); private pinch = 0;
  private mouse: { x: number; y: number } | null = null; private hovT = 0; private hovReg = 0;
  private closing = false; private closed = false; private frames = 0;
  private canvas: HTMLCanvasElement;
  private prevTouch = '';
  private grade: { bloom: number; vig: number } | null = null;

  constructor(readonly run: Run, readonly vaults: number, readonly helix: () => number, readonly base: Species | null, readonly done: (r: ForgeResult | null) => void, readonly opts: LabOpts = {}) {
    this.ctx = { run, vaults, helix };
    this.d = this.initial();
    this.start = JSON.parse(JSON.stringify(this.d));
    this.parent = base?.owner === 'veyr' ? base.id : null;
    this.L = new LabScene();
    this.icons = new LabIcons(this.L.cam, this.ctx);
    this.ui = new LabUI({
      tab: (t) => this.openTab(t, true), card: (_g, i) => this.pickCard(i), hoverCard: (e) => this.icons.hover(e),
      save: () => this.save(), leave: () => this.close(null), reset: () => this.load(this.start, this.parent, 'load'), reroll: () => this.reroll(), name: (s) => { this.d.name = s; this.ui.refresh(); },
      slider: (k, v) => this.slider(k, v), color: (k, c) => { (this.d.colors as unknown as Record<string, number>)[k] = c; this.restyle(); }, pattern: (p) => { this.d.pattern = p; this.restyle(); }, cover: (c) => { this.d.cover = c; this.restyle(); },
      shelf: (o) => { if (o) this.fillShelf(); }, jar: (i) => this.loadJar(i), hoverJar: (i) => { this.L.hoverJar = i; },
      saveDisabled: () => invalid(this.ctx, this.d),
    });
    this.L.onSay = (i, text) => { const s = this.L.sci[i]; this.ui.say(i, s.name, text, s.col); };
    // the shelves: your designs first, then everything you have absorbed
    this.jarSp = opts.species ?? this.shelfSpecies();
    this.L.setJars([...this.jarSp, ...new Array(Math.max(0, 18 - this.jarSp.length)).fill(null)].slice(0, 18));
    this.L.setSpecimen(this.d, false, true);
    this.openTab('genome', false);
    this.refresh();
    // input
    this.canvas = document.getElementById('view') as HTMLCanvasElement;
    this.prevTouch = this.canvas.style.touchAction; this.canvas.style.touchAction = 'none';
    this.canvas.addEventListener('pointerdown', this.onDown);
    addEventListener('pointermove', this.onMove);
    addEventListener('pointerup', this.onUp); addEventListener('pointercancel', this.onUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: true });
    addEventListener('keydown', this.onKey);
    document.body.classList.add('lab-open');
    sfx('open'); sfx('pulse', 0.6, 0.4);
    setTimeout(() => { if (!this.closed) this.L.speak(0, 'idle', true); }, 1800);
  }

  // ---------------------------------------------------------------------------------------------- the design
  private initial(): Design {
    if (this.base) return intoTank(this.ctx, this.base.design).d;
    const plans = ownedPlans(this.run);
    const last = [...this.run.reg.list].reverse().find((s) => s.owner === 'veyr' && s.role === 'design');
    if (last && !plans.length) return intoTank(this.ctx, last.design).d;
    const d = defaultsFor(this.run, plans[plans.length - 1] ?? 'hexapod');
    d.size = Math.min(d.size, sizeCap(this.ctx));
    return d;
  }
  private shelfSpecies(): Species[] {
    const from = new Set([...this.run.genes.values()].map((g) => g.from));
    const mine = this.run.reg.list.filter((s) => s.owner === 'veyr' && s.role === 'design').reverse();
    const wild = this.run.reg.list.filter((s) => s.owner !== 'veyr' && from.has(s.name)).reverse();
    const seen = new Set<string>(), out: Species[] = [];
    for (const s of [...(this.base ? [this.base] : []), ...mine, ...wild]) { if (seen.has(s.name)) continue; seen.add(s.name); out.push(s); }
    return out.slice(0, 18);
  }
  private fillShelf() {
    this.ui.setShelf(this.jarSp.map((s) => ({ name: s.name, sub: s.owner === 'veyr' ? 'YOUR DESIGN' : `ABSORBED · ${LINEAGE_NAMES[s.design.lineage].toUpperCase()}`, img: '' })));
    // portraits come in one per frame (each renders the species once)
    this.jarSp.forEach((s, i) => setTimeout(() => { if (this.closed) return; const img = this.ui.shelfBox.querySelectorAll('.lb-jar img')[i] as HTMLImageElement | undefined; if (img) { try { img.src = thumb(s); } catch { /* no renderer */ } } }, 30 + i * 40));
  }
  private loadJar(i: number) {
    const sp = this.jarSp[i]; if (!sp || this.closing) return;
    this.ui.closeShelf();
    const jar = this.L.jars[i];
    if (jar) { this.L.fx.arc(jar.at, TANK.electrode, 0.5, 0x7affe0, 0.4); this.L.fx.burst(jar.at.x, jar.at.y, jar.at.z, 14, 0x7affe0, { glow: true, speed: 1, up: 1, size: 2, life: 0.6, grav: 0 }); }
    const d = intoTank(this.ctx, sp.design);
    if (sp.owner !== 'veyr') d.d.name = 'Veyr ' + (nameFor(d.d, new Rand(d.d.seed)).split(' ')[1] ?? 'Specimen');
    this.load(d.d, sp.owner === 'veyr' ? sp.id : null, 'load');
    if (d.capped) toast('The Growth Vat is needed to grow it to full size. Scaled down.', 'info', 3200);
  }
  private load(d: Design, parent: number | null, kind: 'load') {
    this.d = JSON.parse(JSON.stringify(d)); this.parent = parent;
    this.L.setSpecimen(this.d, true); this.L.edit(0.8); this.L.react(kind);
    this.openTab('genome', false);
    this.refresh();
  }
  /** apply a change to the specimen with the full effect */
  private apply(ch: Change, gene: string) {
    const prev = this.d;
    this.d = ch.d; fixSegs(this.d);
    const g = GENE[gene];
    const kind = g?.cat === 'body' ? 'plan' : g && g.lineage !== this.d.lineage ? 'splice' : 'edit';
    this.L.setSpecimen(this.d, true);
    this.L.edit(kind === 'plan' ? 1.7 : kind === 'splice' ? 1.35 : 1);
    const inv = invalid({ ...this.ctx, helix: () => 999 }, { ...this.d, name: this.d.name || 'x' });
    this.L.react(inv && !invalid({ ...this.ctx, helix: () => 999 }, { ...prev, name: prev.name || 'x' }) ? 'bad' : kind);
    if (ch.msg) toast(ch.msg, 'info', 2800);
    if (kind === 'plan') this.hintTabs = [];
    this.refresh();
    if (this.tab !== 'genome') this.L.present(TABS[this.tab].regs[0] ?? 1);
  }
  private slider(k: keyof Design, v: number) {
    if (k === 'size') v = Math.min(v, sizeCap(this.ctx));
    (this.d as unknown as Record<string, number>)[k] = v;
    fixSegs(this.d);
    this.ui.setDesign(this.d, sizeCap(this.ctx));
    this.dirty = 0.22; this.iconDirty = 0.6;
    this.stats();
  }
  private restyle() { this.dirty = 0.08; this.iconDirty = 0.5; this.ui.showPaint(this.tab === 'hide', this.d); }
  private reroll() {
    const r = new Rand(Math.random() * 1e9);
    this.d.colors = { base: r.pick(SWATCH), belly: r.pick(SWATCH), pattern: r.pick(SWATCH), accent: r.pick(SWATCH), eye: r.pick([0x7affe0, 0xffe070, 0xff6a4a, 0x101010]) };
    this.d.pattern = r.pick(['plain', 'stripes', 'spots', 'bands', 'mottled', 'saddle', 'rings']);
    this.d.name = 'Veyr ' + nameFor(this.d, r).split(' ')[1];
    this.L.setSpecimen(this.d, false); this.L.edit(0.45);
    this.iconDirty = 0.4;
    this.refresh();
  }

  // ---------------------------------------------------------------------------------------------- tabs and cards
  private openTab(t: TabId | 'genome', user: boolean) {
    this.tab = t;
    if (user && t !== 'genome') this.L.present(TABS[t].regs.length > 6 ? 1 : TABS[t].regs[0]);
    if (t === 'genome') { this.hintTabs = []; this.L.targetGoal.set(0.3, 1.72, -0.3); this.L.distGoal = clamp(this.L.distGoal, 8.2, 10); }
    else { this.L.targetGoal.set(0.25, 1.85, 0); if (this.L.distGoal > 7.6) this.L.distGoal = 7.2; }
    this.ui.showPaint(t === 'hide', this.d);
    this.cards();
  }
  private owned(tab: TabId) { return [...this.run.genes.keys()].filter((id) => GENE[id] && tabOf(id) === tab); }
  private cards() {
    const d = this.d, t = this.tab;
    const L: CardSpec[] = [];
    const geneCard = (id: string): CardSpec => {
      const g = GENE[id], on = d.genes.includes(id) || (g.cat === 'body' && g.plan === d.plan), why = on ? null : lockReason(this.ctx, d, g);
      const lv = this.run.genes.get(id)?.level;
      const meta = g.cat === 'body' ? `${LINEAGE_NAMES[g.lineage].toUpperCase()} FRAME` : `${CAT_SHORT[g.cat]} · ${LINEAGE_NAMES[g.lineage].toUpperCase()}`;
      const foreign = g.lineage !== d.lineage && g.cat !== 'body';
      const tag = on ? (t === 'genome' ? TABS[tabOf(id)].short : 'IN') : why ? 'LOCKED' : foreign ? 'SPLICE' : 'GRAFT';
      const tip = `<h4>${g.name}</h4>${g.desc}<div class="sub" style="margin-top:3px">${fxLine(g, 6) || 'No direct stat effect.'}</div>`
        + (why ? `<div class="tip-warn">${why}</div>` : on ? (t === 'genome' ? '<div class="sub">Click to open its body area.</div>' : g.cat === 'body' ? '<div class="sub">The current body plan.</div>' : '<div class="sub">Installed. Click to remove it.</div>') : `<div class="sub">${foreign ? 'Cross-lineage splice. ' : ''}Click to graft it on.</div>`);
      return { gene: id, name: g.cat === 'body' && g.plan ? PLAN_NAME[g.plan] : g.name, meta, fx: g.cat === 'body' && g.plan ? `${({ hexapod: '6 LEGS', octopod: '8 LEGS', quadruped: '4 LEGS', biped: '2 LEGS', hexapodV: '6 LEGS', hominid: '2 LEGS', serpent: 'NO LEGS', gastropod: 'ONE FOOT' } as Record<string, string>)[g.plan]} · ${g.tier === 3 ? 'RARE' : g.tier === 2 ? 'UNCOMMON' : 'COMMON'}` : fxLine(g), state: on ? 'on' : why ? 'lock' : 'ok', tag, col: CAT_COL[g.cat], lv, tip };
    };
    if (t === 'genome') {
      const ids = [...d.genes].filter((id) => GENE[id]).sort((a, b) => TAB_ORDER.indexOf(tabOf(a)) - TAB_ORDER.indexOf(tabOf(b)));
      for (const id of ids) L.push(geneCard(id));
    } else {
      const ids = this.owned(t);
      const st = (id: string) => { const c = geneCard(id); return c.state === 'on' ? 0 : c.state === 'ok' ? 1 : 2; };
      ids.sort((a, b) => st(a) - st(b) || GENE[a].tier - GENE[b].tier);
      for (const id of ids) L.push(geneCard(id));
      const unk = GENES.filter((g) => tabOf(g.id) === t && !this.run.has(g.id)).length;
      if (unk) L.push({ gene: null, name: 'UNSEQUENCED', meta: `${unk} MORE IN THE WILD`, fx: 'ABSORB TO SEQUENCE', state: 'unk', tag: '?', col: 0x3a5a4a, tip: `<h4>Unsequenced</h4>${unk} more ${TABS[t].name.toLowerCase()} gene${unk > 1 ? 's' : ''} exist out there. Absorb the creatures that carry them.` });
    }
    this.cardList = L;
    const counts: Partial<Record<TabId | 'genome', number>> = { genome: d.genes.length };
    for (const k of TAB_ORDER) counts[k] = this.owned(k).length;
    const title = t === 'genome' ? `GENOME · ${d.genes.length} GENES` : TABS[t].name;
    const sub = t === 'genome' ? 'Click a part of the specimen, or a tab, to change it.' : TABS[t].desc;
    this.ui.setTab(t, this.hintTabs, counts, title, sub);
    this.ui.setCards(L, t !== 'genome' && !L.length ? `NO ${TABS[t].name} GENES YET · ABSORB MORE CREATURES` : t === 'genome' && !L.length ? 'THE TANK IS EMPTY' : undefined);
    this.icons.set(this.ui.cards.map((c, i) => ({ el: (c as HTMLDivElement & { win?: HTMLElement }).win!, gene: L[i].gene })), d);
  }
  private pickCard(i: number) {
    const c = this.cardList[i]; if (!c || this.closing) return;
    if (this.tab === 'genome') { if (c.gene) { const t = tabOf(c.gene); this.hintTabs = []; this.openTab(t, true); sfx('click'); } return; }
    if (c.state === 'unk') { sfx('deny'); toast('Absorb more creatures to sequence these genes.', 'info', 2400); return; }
    if (!c.gene) return;
    const g = GENE[c.gene];
    if (c.state === 'lock') { sfx('deny'); toast(lockReason(this.ctx, this.d, g) ?? 'Locked', 'warn', 2600); this.L.speak(2, 'bad', true); return; }
    if (c.state === 'on') {
      if (g.cat === 'body') { sfx('deny'); return; }
      this.apply(remove(this.d, c.gene), c.gene); sfx('close');
      return;
    }
    this.apply(install(this.ctx, this.d, c.gene), c.gene);
    sfx('build', 1, 0.6);
  }

  // ---------------------------------------------------------------------------------------------- readouts
  private refresh() {
    this.ui.setDesign(this.d, sizeCap(this.ctx));
    this.stats();
    this.cards();
  }
  private stats() {
    const p = pheno(this.d), st = p.stats;
    const rows: [string, number, number, string][] = [
      ['HEALTH', st.hp, 600, `${Math.round(st.hp)}`], ['ARMOUR', st.armor, 0.75, `${Math.round(st.armor * 100)}%`], ['SPEED', st.speed, 10, `${st.speed.toFixed(1)} M/S`],
      ['ATTACK', st.attack, 40, st.attack.toFixed(1)], ['SIGHT', st.sight, 30, `${st.sight.toFixed(0)} M`], ['STEALTH', st.stealth, 0.9, `${Math.round(st.stealth * 100)}%`],
      ['UPKEEP', st.upkeep, 0.6, st.upkeep.toFixed(2)], ['BROOD', st.litter, 5, `${st.litter} / ${Math.round(st.gestation)}S`],
    ];
    this.ui.stats.innerHTML = `<div class="lb-mass">${PLAN_NAME[this.d.plan].toUpperCase()} · ${p.length.toFixed(2)} M · ${st.mass < 10 ? st.mass.toFixed(1) : Math.round(st.mass)} KG · ${p.diet === 'carn' ? 'CARNIVORE' : p.diet === 'herb' ? 'HERBIVORE' : p.diet === 'scav' ? 'SCAVENGER' : 'OMNIVORE'}${p.canFly ? ' · FLIES' : ''}</div>`
      + rows.map(([n, v, max, txt]) => `<div class="lb-stat"><span>${n}</span><div class="lb-sbar"><div class="${n === 'UPKEEP' ? 'dn' : ''}" style="width:${clamp(v / max, 0, 1) * 100}%"></div></div><span class="v">${txt}</span></div>`).join('');
    const inv = invalid(this.ctx, this.d);
    const splice = spliceLevel(this.ctx);
    const notes = [...p.warnings.map((w) => `<div class="tip-warn">▲ ${w}</div>`), ...(inv ? [`<div class="tip-warn">■ ${inv}</div>`] : [])];
    this.ui.warn.innerHTML = (notes.join('') || '<div style="color:var(--hot)">ANATOMY SOUND. VIABLE.</div>') + `<div style="color:var(--dim);margin-top:2px">SPLICE ${splice >= 2 ? 'OPEN: ANY LINEAGE' : splice === 1 ? 'PARTIAL: ORGANS ONLY' : 'CLOSED: ONE LINEAGE'}${this.run.skills?.has('vat') ? ' · VAT ONLINE' : ''}</div>`;
    const lim = limits(this.ctx);
    this.ui.slots.innerHTML = (['limb', 'sense', 'feed', 'defense', 'meta', 'repro'] as GeneCat[]).map((c) => { const n = this.d.genes.filter((g) => GENE[g]?.cat === c).length; return `<div class="${n >= lim[c] ? 'full' : ''}">${CAT_SHORT[c]}<b>${n}/${lim[c]}</b></div>`; }).join('') + `<div>TOTAL<b>${this.d.genes.length}</b></div>`;
    this.ui.cost.innerHTML = `<span>DESIGN</span><span class="c-chg"><img src="${icon('helix')}">${cost(this.d)}</span><span>/ ${Math.floor(this.helix())}</span><span>· EACH</span>${costHTML(p.cost, Math.round(st.armor * 60))}<span>· ${p.buildTime.toFixed(0)}S</span>`;
    this.ui.refresh();
  }

  // ---------------------------------------------------------------------------------------------- input
  private onDown = (e: PointerEvent) => {
    if (this.closing) return;
    this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pts.size === 2) { const [a, b] = [...this.pts.values()]; this.pinch = Math.hypot(a.x - b.x, a.y - b.y); this.ptr = null; return; }
    this.ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, type: e.pointerType };
    Tip.hide();
  };
  private onMove = (e: PointerEvent) => {
    if (this.pts.has(e.pointerId)) this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pts.size === 2 && this.pinch > 0) {
      const [a, b] = [...this.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      this.L.distGoal = clamp(this.L.distGoal * (this.pinch / Math.max(20, d)), 3.4, 11); this.pinch = d; return;
    }
    if (e.pointerType === 'mouse') this.mouse = (e.target === this.canvas) ? { x: e.clientX, y: e.clientY } : null;
    const p = this.ptr; if (!p || p.id !== e.pointerId) return;
    if (!p.moved && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 7) p.moved = true;
    if (p.moved) {
      this.L.yawGoal = clamp(this.L.yawGoal - (e.clientX - p.x) * 0.0055, -0.95, 0.95);
      this.L.pitchGoal = clamp(this.L.pitchGoal + (e.clientY - p.y) * 0.0035, -0.08, 0.55);
      this.ui.tag(null);
    }
    p.x = e.clientX; p.y = e.clientY;
  };
  private onUp = (e: PointerEvent) => {
    this.pts.delete(e.pointerId); if (this.pts.size < 2) this.pinch = 0;
    const p = this.ptr; if (!p || p.id !== e.pointerId) return;
    this.ptr = null;
    if (p.moved || this.closing || e.type === 'pointercancel') return;
    this.tap(e.clientX, e.clientY);
  };
  private onWheel = (e: WheelEvent) => { this.L.distGoal = clamp(this.L.distGoal * (e.deltaY > 0 ? 1.1 : 0.9), 3.4, 11); };
  private onKey = (e: KeyboardEvent) => {
    if (this.closing) return;
    if (e.key === 'Escape') { if (this.ui.shelfBox.classList.contains('open')) this.ui.closeShelf(); else if (this.tab !== 'genome') this.openTab('genome', true); else this.close(null); }
    else if (e.key === 'ArrowRight') this.ui.strip.scrollBy({ left: 160, behavior: 'smooth' });
    else if (e.key === 'ArrowLeft') this.ui.strip.scrollBy({ left: -160, behavior: 'smooth' });
  };
  /** a click or tap on the lab: a part of the specimen opens its area; a jar loads its species */
  private tap(x: number, y: number) {
    const hit = this.L.pickRegion(x, y);
    if (hit) {
      const tabs = REG_TABS[hit.reg] ?? ['body'];
      this.hintTabs = tabs;
      sfx('click', 1.2, 0.7); sfx('zap', 2, 0.15);
      this.L.fx.burst(hit.at.x, hit.at.y, hit.at.z, 10, HOV_COL, { glow: true, speed: 0.8, up: 0.4, size: 2, life: 0.5, grav: 0 });
      this.openTab(tabs[0], false);
      this.L.present(hit.reg);
      this.flashReg = { reg: hit.reg, t: 0.8 };
      return;
    }
    const j = this.L.pickJar(this.L.rayAt(x, y));
    if (j >= 0) { this.loadJar(j); return; }
  }
  private flashReg: { reg: number; t: number } | null = null;

  // ---------------------------------------------------------------------------------------------- frame
  update(dt: number) {
    if (this.closed) return;
    this.frames++;
    if (this.frames === 3) this.ui.ready();
    if (this.dirty > 0) { this.dirty -= dt; if (this.dirty <= 0) { this.dirty = 0; this.L.setSpecimen(this.d, false); } }
    if (this.iconDirty > 0) { this.iconDirty -= dt; if (this.iconDirty <= 0) { this.iconDirty = 0; this.cards(); } }
    // hover: what is under the mouse in the tank (a few times a second: picking walks every triangle)
    this.hovT -= dt;
    if (this.hovT <= 0) {
      this.hovT = 0.09;
      const m = this.mouse;
      let reg = 0, jar = -1;
      if (m && !this.ptr?.moved && !this.closing) {
        const hit = this.L.pickRegion(m.x, m.y);
        if (hit) reg = hit.reg; else jar = this.L.pickJar(this.L.rayAt(m.x, m.y));
        if (reg && reg !== this.hovReg) sfx('hover', 1.4, 0.4);
        if (reg) {
          const t = REG_TABS[reg]?.[0];
          const names = t ? this.d.genes.filter((g) => tabOf(g) === t).map((g) => GENE[g].name) : [];
          this.ui.tag(`${REG_NAME[reg]}<i>${names.length ? names.join(' · ') : 'NOTHING GROWN HERE'} · CLICK TO EDIT</i>`, m.x, m.y);
        } else if (jar >= 0) this.ui.tag(`SPECIMEN JAR<i>${this.jarSp[jar]?.name ?? ''} · CLICK TO LOAD</i>`, m.x, m.y);
        else this.ui.tag(null);
        this.canvas.style.cursor = reg || jar >= 0 ? 'pointer' : '';
      } else if (!m) this.ui.tag(null);
      this.hovReg = reg; this.L.hoverJar = jar;
    }
    if (this.flashReg) { this.flashReg.t -= dt; if (this.flashReg.t <= 0) this.flashReg = null; }
    const showReg = this.hovReg || this.flashReg?.reg || 0;
    if (showReg) this.L.hover(showReg, maskOf([showReg]), HOV_COL);
    else if (this.tab !== 'genome' && TABS[this.tab].regs.length <= 6) this.L.hover(0, maskOf(TABS[this.tab].regs), SEL_COL);
    else this.L.hover(0, 0, SEL_COL);
    this.L.update(dt);
    this.icons.update(dt);
    this.ui.tickBubbles(dt, (i) => this.L.project(this.L.headPos(i)));
  }
  render(post: Post, t: number) {
    if (!this.grade) { this.grade = { bloom: post.grade.bloom, vig: post.grade.vig }; post.grade.bloom = 0.42; post.grade.vig = 0.42; }
    post.render(this.L.scene, this.L.cam, this.L.fxs, t);
  }
  resize(w: number, h: number) { this.L.cam.aspect = w / h; this.L.cam.updateProjectionMatrix(); }

  // ---------------------------------------------------------------------------------------------- filing and leaving
  private save() {
    if (this.closing) return;
    const inv = invalid(this.ctx, this.d);
    if (inv) { toast(inv, 'warn'); this.L.react('bad'); return; }
    this.closing = true;
    const d: Design = JSON.parse(JSON.stringify(this.d));
    this.L.react('save'); this.L.edit(0.7);
    this.ui.stamp('FILED', `${d.name.toUpperCase()} · PREFAB No.${String(this.run.reg.list.length + 1).padStart(3, '0')}`);
    sfx('build'); setTimeout(() => sfx('done'), 300);
    try { this.opts.emit?.('prefab', { kind: 'creature', name: d.name }); } catch (e) { console.error('prefab event', e); }
    setTimeout(() => this.close({ design: d, parent: this.parent }), 1500);
  }
  private close(r: ForgeResult | null) {
    if (this.closed) return;
    this.teardown();
    this.done(r);
  }
  private teardown() {
    if (this.closed) return;
    this.closed = true;
    this.canvas.removeEventListener('pointerdown', this.onDown);
    removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp); removeEventListener('pointercancel', this.onUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    removeEventListener('keydown', this.onKey);
    this.canvas.style.touchAction = this.prevTouch; this.canvas.style.cursor = '';
    document.body.classList.remove('lab-open');
    this.ui.dispose(); this.icons.dispose(); this.L.dispose();
    const eng = (window as unknown as { __engine?: Engine }).__engine;
    if (this.grade && eng) { eng.post.grade.bloom = this.grade.bloom; eng.post.grade.vig = this.grade.vig; }
    Tip.hide();
  }
  dispose() { this.teardown(); }
}
/** the lab's own name; Forge stays for older call sites */
export { Forge as Lab };

/**
 * Open the lab over a running region (the openBuilder / openLab hooks): filing adds the design to run.reg via
 * game.addDesign (which charges the helix), and the 'prefab' event goes out on the game's bus.
 */
export function openLab(engine: Engine, game: Game, base: Species | null = null) {
  if (game.run.skills && !game.run.skills.has('lab')) { sfx('deny'); toast('No laboratory yet. Build the <b>Field Laboratory</b> on the skill tree.', 'warn', 3200); return; }
  engine.push(new Forge(game.run, game.vaults, () => game.veyr.res.helix, base, (res) => {
    engine.pop();
    if (res) game.addDesign(res.design, res.parent, cost(res.design));
  }, { emit: (ev, d) => game.emit(ev, d) }));
}
