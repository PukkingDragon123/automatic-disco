// The in-region HUD: resources, EM level and conquest across the top; minimap, selection and command card along
// the bottom. Pixel frames, live portraits, segmented bars.
import { el, ui, panel, Btn, Bar, iconImg, fmt, Tip, S } from './kit';
import { icon } from './pixelart';
import { thumb } from './thumbs';
import type { Hive } from '../game/hive';
import { EM_LEVELS } from '../game/hive';
import type { World } from '../game/world';
import type { Creature } from '../game/creature';
import type { Building } from '../game/buildings';
import type { Vision } from '../game/vision';
import type { RtsCam } from '../app/rtsCam';
import { GENE, CAT_NAMES } from '../life/genes';
import { VEYR, RIVALS } from '../world/palette';

export interface Cmd { icon: string; key: string; name: string; tip: () => string; disabled?: () => string | false; active?: () => boolean; run: () => void; cost?: string }
export interface HudCtx {
  hive: Hive; world: World; vision: Vision; cam: RtsCam;
  sel: () => Creature[]; selB: () => Building | null;
  commands: () => Cmd[]; ctxKey: () => string;
  conquest: () => number; regionName: string;
  minimap: (x: number, z: number, button: number) => void;
  openTree: () => void; openBuilder: () => void; openMenu: () => void; openMirror: () => void;
}

const MIND: Record<string, string> = { idle: 'Resting', wander: 'Wandering', graze: 'Grazing', eat: 'Feeding', hunt: 'Hunting', flee: 'Fleeing', scavenge: 'Scavenging', order: 'Moving', attack: 'Fighting', held: 'Held by tendrils', rest: 'Resting', follow: 'Following', mate: 'Courting' };

export class Hud {
  readonly root: HTMLDivElement;
  private resEls: Record<string, HTMLSpanElement> = {};
  private incEls: Record<string, HTMLSpanElement> = {};
  private emBar: Bar; private emTxt: HTMLSpanElement; private conqBar: Bar; private conqTxt: HTMLSpanElement;
  private mm: HTMLCanvasElement; private mmG: CanvasRenderingContext2D; private mmBase: ImageData | null = null; private mmT = 0;
  private selBox: HTMLDivElement; private selKey = '-'; private selBars: { hp?: Bar; en?: Bar; pr?: Bar } = {};
  private cmdBox: HTMLDivElement; private btns: Btn[] = []; private cmdKey = '';
  private t = 0;
  private clock: HTMLSpanElement;
  readonly dialog: HTMLDivElement;
  readonly objectives: HTMLDivElement;

  constructor(readonly c: HudCtx) {
    this.root = el('div', 'hud', ui());
    // ---- top bar
    const top = panel('hud-top', this.root, 'dark');
    const res = el('div', 'res', top);
    for (const [k, ic, tip] of [['bio', 'bio', 'Biomass: life force. Grows moss, structures and creatures.'], ['min', 'min', 'Minerals: ferrite and crystal pumped by Root Taps.'], ['charge', 'charge', 'Charge: the pull of your gravity well. Spent on field abilities; refills faster as you grow.'], ['helix', 'helix', 'Helix: evolutionary potential, from every genome you take apart. Spent on new designs.'], ['supply', 'supply', 'Creatures alive / how many your wombs can feed.']] as const) {
      const p = el('div', 'pill', res);
      iconImg(ic, 'pi', p);
      this.resEls[k] = el('span', 'pv', p);
      this.incEls[k] = el('span', 'pinc', p);
      p.addEventListener('pointerenter', () => Tip.show(`<h4>${k === 'supply' ? 'Supply' : k[0].toUpperCase() + k.slice(1)}</h4>${tip}`, p));
      p.addEventListener('pointerleave', () => Tip.hide());
    }
    const em = el('div', 'em', top);
    iconImg('em', 'pi', em);
    const emc = el('div', 'emc', em);
    this.emTxt = el('span', 'emt', emc);
    this.emBar = new Bar(emc, 0x8a72ff, false);
    em.addEventListener('pointerenter', () => Tip.show('<h4>Field Strength</h4>Your gravity field grows with your mass: moss, structures, the core. Each level widens your reach, deepens your charge and wakes new abilities.', em));
    em.addEventListener('pointerleave', () => Tip.hide());
    const cq = el('div', 'em conq', top);
    iconImg('planet', 'pi', cq);
    const cqc = el('div', 'emc', cq);
    this.conqTxt = el('span', 'emt', cqc);
    this.conqBar = new Bar(cqc, 0x2fc49a, false);
    cq.addEventListener('pointerenter', () => Tip.show('<h4>Dominion</h4>How much of this region\'s living ground is yours. Take 60% and destroy any rival heart to claim it.', cq));
    cq.addEventListener('pointerleave', () => Tip.hide());
    const right = el('div', 'tr', top);
    this.clock = el('span', 'clock small', right);
    new Btn(right, { icon: 'mirror', hotkey: 'V', size: 'sq', tip: () => '<h4>Mirror Pool</h4>Look at yourself. Choose your colours, eyes, antennae and name.' }, () => c.openMirror());
    new Btn(right, { icon: 'tree', hotkey: 'T', size: 'sq', tip: () => '<h4>Tree of Descent</h4>Every species you have met, made or watched branch off.' }, () => c.openTree());
    new Btn(right, { icon: 'builder', hotkey: 'C', size: 'sq', tip: () => '<h4>Gene Forge</h4>Design a new species from the genes you own.' }, () => c.openBuilder());
    new Btn(right, { icon: 'pause', hotkey: 'Esc', size: 'sq', tip: () => '<h4>Menu</h4>' }, () => c.openMenu());
    // ---- bottom: minimap
    const mmP = panel('hud-mm', this.root);
    this.mm = el('canvas', 'mm', mmP);
    this.mm.width = c.world.region.N; this.mm.height = c.world.region.N;
    this.mmG = this.mm.getContext('2d')!;
    const mmEv = (e: PointerEvent) => {
      const r = this.mm.getBoundingClientRect();
      c.minimap(((e.clientX - r.left) / r.width) * c.world.region.N, ((e.clientY - r.top) / r.height) * c.world.region.N, e.button);
    };
    this.mm.addEventListener('pointerdown', (e) => { e.stopPropagation(); mmEv(e); this.mm.setPointerCapture(e.pointerId); });
    this.mm.addEventListener('pointermove', (e) => { if (e.buttons & 1) mmEv(e); });
    this.mm.addEventListener('contextmenu', (e) => e.preventDefault());
    // ---- selection panel
    this.selBox = panel('hud-sel', this.root);
    // ---- command card
    this.cmdBox = panel('hud-cmd', this.root);
    // ---- dialog (researcher) + objectives
    this.dialog = el('div', 'hud-dialog', this.root);
    this.objectives = el('div', 'px-dark hud-obj', this.root);
    this.objectives.style.display = 'none';
  }

  update(dt: number) {
    this.t += dt;
    const c = this.c, h = c.hive;
    // resources (text 8x a second)
    if (Math.floor(this.t * 8) !== Math.floor((this.t - dt) * 8)) {
      h.countUnits();
      this.resEls.bio.textContent = fmt(h.res.bio); this.incEls.bio.textContent = '+' + h.income.bio.toFixed(1);
      this.resEls.min.textContent = fmt(h.res.min); this.incEls.min.textContent = h.income.min > 0.05 ? '+' + h.income.min.toFixed(1) : '';
      this.resEls.charge.textContent = `${Math.floor(h.res.charge)}`; this.incEls.charge.textContent = `/${60 + h.emLevel * 40}`;
      this.resEls.helix.textContent = fmt(h.res.helix); this.incEls.helix.textContent = '';
      this.resEls.supply.textContent = `${h.supplyUsed}`; this.incEls.supply.textContent = `/${h.supplyCap}`;
      this.resEls.supply.classList.toggle('full', h.supplyUsed >= h.supplyCap);
      const lv = h.emLevel, a = EM_LEVELS[lv - 1] ?? 0, b = EM_LEVELS[lv] ?? a;
      this.emTxt.textContent = `FIELD LV ${lv}`;
      this.emBar.set(lv >= EM_LEVELS.length ? 1 : (h.mass - a) / Math.max(1, b - a));
      const q = c.conquest();
      this.conqTxt.textContent = `DOMINION ${Math.floor(q * 100)}%`;
      this.conqBar.set(q / 0.6);
      const d = c.world.day, hh = Math.floor(d * 24), night = d > 0.75 || d < 0.22;
      this.clock.innerHTML = `<img src="${icon(night ? 'em' : 'bio')}"> ${String(hh).padStart(2, '0')}:${String(Math.floor((d * 24 - hh) * 60)).padStart(2, '0')} · ${c.regionName}`;
    }
    this.minimap(dt);
    this.selection();
    this.commands();
  }

  // ------------------------------------------------------------------ minimap
  private minimap(dt: number) {
    this.mmT -= dt;
    if (this.mmT > 0) return;
    this.mmT = 0.2;
    const c = this.c, w = c.world, R = w.region, N = R.N, g = this.mmG;
    if (!this.mmBase) {
      this.mmBase = g.createImageData(N, N);
      const av = w.terrain.avg;
      for (let i = 0; i < N * N; i++) {
        const blk = R.b[i];
        let col = R.h[i] < R.water ? R.pal.water : av[[0, 27, 3, 4, 7, 9, 10, 11, 13, 15, 17, 19, 20, 30][blk] ?? 0];
        const sh = 0.75 + (R.h[i] / 20) * 0.5;
        const x = i % N, z = (i / N) | 0;
        const edge = x > 0 && R.h[i] > R.h[i - 1] + 0.9 ? 1.18 : 1;
        this.mmBase.data[i * 4] = Math.min(255, ((col >> 16) & 255) * sh * edge); this.mmBase.data[i * 4 + 1] = Math.min(255, ((col >> 8) & 255) * sh * edge); this.mmBase.data[i * 4 + 2] = Math.min(255, (col & 255) * sh * edge); this.mmBase.data[i * 4 + 3] = 255;
        void z;
      }
    }
    const img = g.createImageData(N, N), d = img.data, base = this.mmBase.data, vis = c.vision.vis, seen = c.vision.seen;
    const mossC = [0x2f, 0xc4, 0x8a], cr = RIVALS[0].creep;
    for (let i = 0; i < N * N; i++) {
      let r = base[i * 4], gg = base[i * 4 + 1], b = base[i * 4 + 2];
      if (w.moss[i] > 0.5) { r = mossC[0]; gg = mossC[1]; b = mossC[2]; }
      else if (w.creep[i] > 0.5) { r = (cr >> 16) & 255; gg = (cr >> 8) & 255; b = cr & 255; }
      if (!seen[i]) { r = 8; gg = 9; b = 13; } else if (!vis[i]) { r *= 0.45; gg *= 0.45; b *= 0.5; }
      d[i * 4] = r; d[i * 4 + 1] = gg; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    for (const cr2 of w.creatures) {
      if (cr2.dead || !cr2.visibleNow) continue;
      g.fillStyle = cr2.faction === 'veyr' ? '#7affe0' : cr2.faction === 'rival' ? '#ff6aa0' : cr2.diet === 'carn' ? '#ff7050' : '#ffe070';
      const s = cr2.size > 1.5 ? 2 : 1;
      g.fillRect(Math.floor(cr2.x) - (s >> 1), Math.floor(cr2.z) - (s >> 1), s + 1, s + 1);
    }
    for (const hv of w.hives) for (const b of hv.buildings) {
      if (!b.visibleNow) continue;
      g.fillStyle = hv.faction === 'veyr' ? '#e8fff8' : '#ffb0c8';
      const s = b.def.kind === 'core' ? 4 : 2;
      g.fillRect(Math.floor(b.x) - s / 2, Math.floor(b.z) - s / 2, s, s);
    }
    // camera footprint
    const cam = c.cam, t = cam.target;
    const hw = cam.dist * 0.62, hd = cam.dist * 0.42;
    const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
    const pts = [[-hw, -hd * 1.4], [hw, -hd * 1.4], [hw * 0.7, hd], [-hw * 0.7, hd]].map(([x, z]) => [t.x + x * cy + z * sy, t.z - x * sy + z * cy]);
    g.strokeStyle = '#f4f0e8'; g.lineWidth = 1; g.beginPath();
    pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z))); g.closePath(); g.stroke();
  }

  // ------------------------------------------------------------------ selection panel
  private selection() {
    const sel = this.c.sel(), sb = this.c.selB();
    const key = sb ? 'b' + sb.id + (sb.done ? 'd' : 'g') + sb.queue.join(',') : sel.map((s) => s.id).join(',');
    const box = this.selBox;
    if (key !== this.selKey) {
      this.selKey = key;
      box.innerHTML = ''; this.selBars = {};
      if (sb) this.buildingInfo(sb);
      else if (sel.length === 1) this.creatureInfo(sel[0]);
      else if (sel.length > 1) {
        el('div', 'hdr sel-title', box, `${sel.length} CREATURES`);
        const grid = el('div', 'sel-grid', box);
        for (const s of sel.slice(0, 24)) {
          const cell = el('div', 'sel-cell', grid);
          const im = el('img', '', cell); im.src = thumb(s.sp);
          const hb = new Bar(cell, 0x5ad86a, false); hb.set(s.hp / s.maxHp);
          (cell as any).__c = s; (cell as any).__b = hb;
        }
      } else {
        el('div', 'hdr sel-title', box, 'THE VEYR');
        el('div', 'small', box, 'Select a creature or structure. Paint growth with [G]. Seize prey on your moss with [1].');
      }
    }
    // live bars
    if (sel.length === 1 && !sb) {
      const s = sel[0];
      this.selBars.hp?.set(s.hp / s.maxHp, `${Math.ceil(s.hp)} / ${Math.ceil(s.maxHp)}`);
      this.selBars.en?.set(s.energy, s.dead ? `${Math.ceil(s.bio)} biomass` : `${Math.round(s.energy * 100)}% fed`);
      const m = box.querySelector('.mind'); if (m) m.textContent = s.dead ? (s.digest > 0 ? 'Being digested' : 'Dead') : MIND[s.mind] ?? s.mind;
    } else if (sb) {
      this.selBars.hp?.set(sb.hp / sb.maxHp, `${Math.ceil(sb.hp)} / ${sb.maxHp}`);
      if (this.selBars.pr) {
        if (!sb.done) this.selBars.pr.set(sb.progress, `growing ${Math.floor(sb.progress * 100)}%`);
        else if (sb.def.kind === 'brood' && sb.queue.length) { const sp = this.c.world.reg.get(sb.queue[0]); this.selBars.pr.set(sb.qT / sp.pheno.buildTime, `gestating ${sp.name}`); }
        else if (sb.def.kind === 'tap') { const d = this.c.world.region.deposits[sb.deposit]; this.selBars.pr.set(d ? d.amount / (d.kind === 'ore' ? 1600 : 1100) : 0, d ? `${Math.floor(d.amount)} left` : 'depleted'); }
        else this.selBars.pr.set(1, 'alive');
      }
    } else for (const cell of Array.from(box.querySelectorAll('.sel-cell'))) { const s = (cell as any).__c as Creature; (cell as any).__b.set(s.hp / s.maxHp); }
  }
  private creatureInfo(s: Creature) {
    const box = this.selBox;
    const row = el('div', 'sel-row', box);
    const pf = el('div', 'px-inset portrait', row);
    const im = el('img', '', pf); im.src = thumb(s.sp);
    const info = el('div', 'sel-info', row);
    el('div', 'hdr sel-name', info, s.sp.name);
    const owner = s.faction === 'veyr' ? '<span style="color:#7affe0">YOURS</span>' : s.faction === 'rival' ? '<span style="color:#ff8ab0">RIVAL</span>' : `<span style="color:#ffe070">WILD · ${s.diet === 'carn' ? 'PREDATOR' : s.diet === 'herb' ? 'GRAZER' : s.diet === 'scav' ? 'SCAVENGER' : 'OMNIVORE'}</span>`;
    el('div', 'small', info, `<i>${s.sp.design.latin}</i> · ${owner}`);
    this.selBars.hp = new Bar(info, 0x5ad86a); this.selBars.en = new Bar(info, 0xe0b040);
    el('div', 'small mind', info);
    const st = s.st;
    el('div', 'tiny stats', info, `ATK ${st.attack.toFixed(0)}  ARMOR ${Math.round(st.armor * 100)}%  SPD ${st.speed.toFixed(1)}  SIGHT ${st.sight.toFixed(0)}  ${Math.round(s.mass)}KG`);
    const genes = el('div', 'genes', info);
    for (const g of s.sp.design.genes) {
      const gd = GENE[g]; if (!gd) continue;
      const gi = iconImg('cat-' + gd.cat, 'gene', genes);
      gi.addEventListener('pointerenter', () => Tip.show(`<h4>${gd.name}</h4><div class="sub">${CAT_NAMES[gd.cat]} · ${gd.lineage}</div>${gd.desc}`, gi));
      gi.addEventListener('pointerleave', () => Tip.hide());
    }
  }
  private buildingInfo(b: Building) {
    const box = this.selBox;
    const row = el('div', 'sel-row', box);
    const pf = el('div', 'px-inset portrait', row);
    iconImg(b.def.kind, 'bigico', pf);
    const info = el('div', 'sel-info', row);
    el('div', 'hdr sel-name', info, b.def.name);
    el('div', 'small', info, b.faction === 'veyr' ? b.def.desc : 'A rival structure.');
    this.selBars.hp = new Bar(info, 0x5ad86a);
    this.selBars.pr = new Bar(info, 0x7a62e8);
    if (b.def.kind === 'brood' && b.queue.length) {
      const q = el('div', 'queue', info);
      for (const id of b.queue) { const im = el('img', 'qimg', q); im.src = thumb(this.c.world.reg.get(id)); }
    }
  }

  // ------------------------------------------------------------------ command card
  private commands() {
    const key = this.c.ctxKey();
    if (key !== this.cmdKey) {
      this.cmdKey = key;
      this.cmdBox.innerHTML = ''; this.btns = [];
      const grid = el('div', 'cmd-grid', this.cmdBox);
      const cmds = this.c.commands();
      for (let i = 0; i < 12; i++) {
        const cm = cmds[i];
        if (!cm) { el('div', 'cmd-empty', grid); continue; }
        this.btns.push(new Btn(grid, { icon: cm.icon, hotkey: cm.key, cost: cm.cost, tip: () => `<h4>${cm.name}</h4>${cm.tip()}`, disabled: cm.disabled, active: cm.active }, cm.run));
      }
    }
    for (const b of this.btns) b.refresh();
  }
  invalidate() { this.cmdKey = ''; this.selKey = '-'; }
  dispose() { this.root.remove(); Tip.hide(); }
}
void VEYR;
