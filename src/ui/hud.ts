// The in-region HUD is the golem's own control console, built around the edges of the view so the middle stays
// clear: an instrument rail of rolling drums, nixies and meters along the top; the terrain scope, the unit
// telemetry CRT, the command key bank and the ordnance selector wheel along the bottom; a shortwave set for
// Calder's transmissions. Every housing is painted pixel art; every value moves something.
import { el, ui, Btn, Bar, iconImg, fmt, Tip } from './kit';
import { sfx } from '../audio/audio';
import { thumb } from './thumbs';
import type { Hive } from '../game/hive';
import { EM_LEVELS, ABILITIES, type Ability } from '../game/hive';
import type { World } from '../game/world';
import type { Creature } from '../game/creature';
import type { Building } from '../game/buildings';
import type { Vision } from '../game/vision';
import type { RtsCam } from '../app/rtsCam';
import { GENE, CAT_NAMES } from '../life/genes';
import { RIVALS } from '../world/palette';
import { PH, AM, RD, CR, BR, GM } from './machine';
import { Odometer, Nixie, PixText, Lamp, Toggle, Gauge, Knob, crtSettings, meterFace, place, tip, u, steamVent } from './gadgets';
import { TOP, RAIL, BANK, PLATE, SCOPE, SEL, CMD, topArt, bankArt, nameArt, scopeArt, selArt, cmdArt, radioArt } from './hudArt';
import { AbilityWheel } from './wheel';

export interface Cmd { icon: string; key: string; name: string; tip: () => string; disabled?: () => string | false; active?: () => boolean; run: () => void; cost?: string }
export interface HudCtx {
  hive: Hive; world: World; vision: Vision; cam: RtsCam;
  sel: () => Creature[]; selB: () => Building | null;
  commands: () => Cmd[]; ctxKey: () => string;
  conquest: () => number; regionName: string;
  minimap: (x: number, z: number, button: number) => void;
  openTree: () => void; openBuilder: () => void; openMenu: () => void; openMirror: () => void;
  /** arm (or disarm) a field power for targeting; falls back to the command list when absent */
  ability?: (a: Ability) => void;
  /** the power currently armed, if any */
  armed?: () => Ability | null;
}

const MIND: Record<string, string> = { idle: 'RESTING', wander: 'WANDERING', graze: 'GRAZING', eat: 'FEEDING', hunt: 'HUNTING', flee: 'FLEEING', scavenge: 'SCAVENGING', order: 'MOVING', attack: 'FIGHTING', held: 'HELD BY TENDRILS', rest: 'RESTING', follow: 'FOLLOWING', mate: 'COURTING' };
const MM = 96;
const isAbilityCmd = (c: Cmd) => !!(ABILITIES as any)[c.icon] && (ABILITIES as any)[c.icon].key === c.key;

export class Hud {
  readonly root: HTMLDivElement;
  private odo: Record<string, Odometer> = {};
  private inc: Record<string, PixText> = {};
  private chgNix: Nixie; private chgMax: PixText; private chgGauge: Gauge; private helixNix: Nixie;
  private supOdo: Odometer; private supCap: PixText; private supLamp: Lamp;
  private fieldLamps: Lamp[] = []; private fieldFill: HTMLDivElement; private fieldTxt: PixText;
  private domFill: HTMLDivElement; private domTxt: PixText;
  private clockNix: Nixie; private colon: HTMLDivElement; private dayLamp: Lamp;
  private mm: HTMLCanvasElement; private mmG: CanvasRenderingContext2D; private mmBase: Uint8ClampedArray | null = null; private mmT = 0; private mmImg: ImageData;
  private regionEl: HTMLDivElement;
  private selBox: HTMLDivElement; private selKey = '-'; private selBars: { hp?: Bar; en?: Bar; pr?: Bar } = {};
  private cmdBox: HTMLDivElement; private btns: Btn[] = []; private cmdKey = '';
  readonly wheel: AbilityWheel;
  private t = 0;
  readonly dialog: HTMLDivElement;
  readonly objectives: HTMLDivElement;

  constructor(readonly c: HudCtx) {
    this.root = el('div', 'hud', ui());
    this.root.style.setProperty('--radio', `url(${radioArt().url()})`);
    const mod = (cls: string, w: number, h: number, art: string) => { const m = el('div', 'mod ' + cls, this.root); m.style.width = u(w); m.style.height = u(h); m.style.backgroundImage = `url(${art})`; m.addEventListener('pointerdown', (e) => e.stopPropagation()); return m; };
    const h = c.hive;

    // ---- conduit runs along the top and bottom edges, behind the housings
    el('div', 'conduit top', this.root); el('div', 'conduit bot', this.root);
    // ---- instrument rail
    const top = mod('hud-top', TOP.w, TOP.h, topArt().url());
    const X = RAIL;
    const res = (k: string, x: number, tipH: string) => {
      this.odo[k] = new Odometer(top, 5, x, 13);
      this.inc[k] = new PixText(top, x + 44, 16, 16, 'center');
      const hit = place(el('div', 'hit', top), x - 2, 2, 64, 25); tip(hit, () => tipH);
    };
    res('bio', X.bio, '<h4>Biomass</h4>Life force drawn up through the moss. Grows moss, structures and creatures. The little screen shows the rate per second.');
    res('min', X.min, '<h4>Minerals</h4>Ferrite and crystal pumped by Root Taps or torn loose by a gravity well.');
    this.chgGauge = new Gauge(top, X.chg - 1, 10, { w: 30, h: 19, cx: 15, cy: 16, r: 12, a0: -1.45, a1: 1.45, face: (p) => meterFace(p, 15, 16, 12, -1.45, 1.45, { ticks: 6, red: [0, 0.18] }) });
    this.chgNix = new Nixie(top, 3, X.chg + 32, 12);
    this.chgMax = new PixText(top, X.chg + 32, 4, 29, 'right');
    tip(place(el('div', 'hit', top), X.chg - 2, 2, 64, 27), () => '<h4>Charge</h4>The pull of your gravity well. Spent by the ordnance selector; refills faster as your field grows.');
    this.helixNix = new Nixie(top, 3, X.hel, 12);
    tip(place(el('div', 'hit', top), X.hel - 2, 2, 33, 27), () => '<h4>Helix</h4>Evolutionary potential, from every genome you take apart. Spent on new designs.');
    this.supOdo = new Odometer(top, 2, X.sup, 13);
    this.supCap = new PixText(top, X.sup + 17, 16, 16, 'left');
    this.supLamp = new Lamp(top, X.sup + 26, 4, 'r', 'off');
    tip(place(el('div', 'hit', top), X.sup - 2, 2, 36, 27), () => '<h4>Supply</h4>Creatures alive / how many your wombs can feed.');
    for (let i = 0; i < 5; i++) this.fieldLamps.push(new Lamp(top, X.fld + i * 8, 12, 'g', 'off'));
    this.fieldFill = place(el('div', 'tube-fill', top), X.fld, 22, 0, 4);
    this.fieldTxt = new PixText(top, X.fld + 22, 4, 17, 'right');
    tip(place(el('div', 'hit', top), X.fld - 2, 2, 43, 27), () => '<h4>Field Strength</h4>Your gravity field grows with your mass: moss, structures, the core. Each level widens your reach, deepens your charge and unlocks chambers on the selector.');
    this.domFill = place(el('div', 'tube-fill dom', top), X.dom, 13, 0, 7);
    this.domTxt = new PixText(top, X.dom + 33, 4, 13, 'right');
    tip(place(el('div', 'hit', top), X.dom - 2, 2, 50, 27), () => '<h4>Dominion</h4>How much of this region\'s living ground is yours. Fill the tube to the red mark (60%) and destroy any rival heart to claim it for Earth.');

    // ---- name plate + chronometer
    const np = mod('hud-plate', PLATE.w, PLATE.h, nameArt().url());
    this.clockNix = new Nixie(np, 4, 7, 16, false);
    this.clockNix.e.querySelectorAll('.nx').forEach((t, i) => { if (i >= 2) (t as HTMLElement).style.left = u(i * 10 + 3); });
    this.colon = place(el('div', 'colon', np), 27, 19, 1, 7);
    this.dayLamp = new Lamp(np, 92, 17, 'a', 'on');
    tip(place(el('div', 'hit', np), 4, 14, 96, 18), () => '<h4>Chronometer</h4>Local time on this world. Night brings the hunters out.');

    // ---- auxiliary toggles
    const bank = mod('hud-bank', BANK.w, BANK.h, bankArt().url());
    new Toggle(bank, 7, 4, 'ASSY', 'V', () => '<h4>Assembly Bay</h4>Refit Unit 07: paint, plating, lens and name.', () => c.openMirror());
    new Toggle(bank, 28, 4, 'TREE', 'T', () => '<h4>Tree of Descent</h4>Every species you have met, made or watched branch off.', () => c.openTree());
    new Toggle(bank, 49, 4, 'FORGE', 'C', () => '<h4>Gene Forge</h4>Design a new species from the genes you own.', () => c.openBuilder());
    new Toggle(bank, 70, 4, 'MENU', 'ESC', () => '<h4>Menu</h4>Pause the survey.', () => c.openMenu());

    // ---- terrain scope (minimap)
    const sc = mod('hud-scope', SCOPE.w, SCOPE.h, scopeArt().url());
    this.regionEl = place(el('div', 'scr sc-name', sc), 7, 5, 100, 9);
    this.regionEl.textContent = c.regionName.toUpperCase();
    this.mm = place(el('canvas', 'mm', sc), SCOPE.sx, SCOPE.sy, SCOPE.ss, SCOPE.ss);
    this.mm.width = MM; this.mm.height = MM;
    this.mmG = this.mm.getContext('2d')!; this.mmImg = this.mmG.createImageData(MM, MM);
    const sweep = place(el('div', 'sweep', sc), SCOPE.sx, SCOPE.sy, SCOPE.ss, SCOPE.ss); void sweep;
    place(el('div', 'scr-glass', sc), SCOPE.sx, SCOPE.sy, SCOPE.ss, SCOPE.ss);
    const N = c.world.region.N;
    const mmEv = (e: PointerEvent) => { const r = this.mm.getBoundingClientRect(); c.minimap(((e.clientX - r.left) / r.width) * N, ((e.clientY - r.top) / r.height) * N, e.button); };
    this.mm.addEventListener('pointerdown', (e) => { e.stopPropagation(); mmEv(e); this.mm.setPointerCapture(e.pointerId); });
    this.mm.addEventListener('pointermove', (e) => { if (e.buttons & 1) mmEv(e); });
    this.mm.addEventListener('contextmenu', (e) => e.preventDefault());

    // ---- unit telemetry
    const sl = mod('hud-sel', SEL.w, SEL.h, selArt().url());
    this.selBox = place(el('div', 'scr sel-scr', sl), SEL.sx, SEL.sy, SEL.sw, SEL.sh);
    const lamp = new Lamp(sl, 191, 66, 'g', 'blink'); void lamp;
    crtSettings.apply();
    new Knob(sl, 187, 17, crtSettings.gain, 8, (v) => crtSettings.setGain(v), () => '<h4>Gain</h4>Phosphor brightness for every screen on the console. Drag or scroll.');
    new Knob(sl, 187, 41, crtSettings.tint, 1, (v) => crtSettings.setTint(v), () => '<h4>Tune</h4>Swap the tubes: green P1 phosphor or amber P3. Drag or scroll.');

    // ---- command bank
    const cm = mod('hud-cmd', CMD.w, CMD.h, cmdArt().url());
    this.cmdBox = place(el('div', 'cmd-grid', cm), CMD.kx, CMD.ky, 102, 76);

    // ---- ordnance selector
    this.wheel = new AbilityWheel(this.root, {
      hive: h,
      arm: (a) => {
        if (c.ability) return c.ability(a);
        const cmd = c.commands().find((x) => x.icon === a && isAbilityCmd(x)); if (cmd && !cmd.disabled?.()) cmd.run();
      },
      armed: () => {
        if (c.armed) return c.armed();
        const cmd = c.commands().find((x) => isAbilityCmd(x) && x.active?.()); return cmd ? (cmd.icon as Ability) : null;
      },
    });
    steamVent(cm, 104, 12, 9);

    // ---- shortwave set (researcher) + field notes
    this.dialog = el('div', 'hud-dialog', this.root);
    this.objectives = el('div', 'px-dark hud-obj', this.root);
    this.objectives.style.display = 'none';
    // power-on: the console wakes module by module
    Array.from(this.root.querySelectorAll('.mod, .wl')).forEach((m, i) => { (m as HTMLElement).style.animationDelay = `${i * 70}ms`; m.classList.add('boot'); });
  }

  /** keys the console owns (the selector's turn / fire keys); true when used */
  key(k: string) { return this.wheel.key(k); }

  update(dt: number) {
    this.t += dt;
    const c = this.c, h = c.hive;
    if (Math.floor(this.t * 8) !== Math.floor((this.t - dt) * 8)) {
      h.countUnits();
      // the centre console retracts while a genome is being taken apart
      const fold = !!document.querySelector('.harvest');
      if (fold !== this.root.classList.contains('fold')) { this.root.classList.toggle('fold', fold); sfx(fold ? 'close' : 'open', 1, 0.4); }
      this.odo.bio.set(h.res.bio); this.inc.bio.set(h.income.bio > 0.05 ? '+' + h.income.bio.toFixed(1) : '0', PH[8], true);
      this.odo.min.set(h.res.min); this.inc.min.set(h.income.min > 0.05 ? '+' + h.income.min.toFixed(1) : '0', PH[8], true);
      const cap = 60 + h.emLevel * 40;
      this.chgNix.set(h.res.charge); this.chgMax.set('/' + cap, CR[3]);
      this.helixNix.set(h.res.helix);
      this.supOdo.set(h.supplyUsed); this.supCap.set('/' + h.supplyCap, CR[3]);
      this.supLamp.set(h.supplyUsed >= h.supplyCap ? 'blink' : 'off');
      const lv = h.emLevel, a = EM_LEVELS[lv - 1] ?? 0, b = EM_LEVELS[lv] ?? a;
      this.fieldLamps.forEach((l, i) => l.set(i < lv ? 'on' : i === lv ? 'dim' : 'off'));
      this.fieldTxt.set('LV ' + lv, AM[6], true);
      const fp = lv >= EM_LEVELS.length ? 1 : (h.mass - a) / Math.max(1, b - a);
      this.fieldFill.style.width = u(Math.round(Math.max(0, Math.min(1, fp)) * 39));
      const q = c.conquest();
      this.domTxt.set(Math.floor(q * 100) + '%', q >= 0.6 ? AM[6] : PH[8], true);
      this.domFill.style.width = u(Math.round(Math.max(0, Math.min(1, q / 0.6)) * 46));
      const d = c.world.day, hh = Math.floor(d * 24), mi = Math.floor((d * 24 - hh) * 60), night = d > 0.75 || d < 0.22;
      this.clockNix.set(hh * 100 + mi);
      this.dayLamp.set(night ? 'dim' : 'on', night ? 'g' : 'a');
      this.colon.classList.toggle('off', Math.floor(this.t * 2) % 2 === 1);
    }
    const cap = 60 + h.emLevel * 40;
    this.chgGauge.set(h.res.charge / cap); this.chgGauge.update(dt);
    this.minimap(dt);
    this.selection();
    this.commands();
    this.wheel.update(dt);
  }

  // ------------------------------------------------------------------ terrain scope
  private minimap(dt: number) {
    this.mmT -= dt;
    if (this.mmT > 0) return;
    this.mmT = 0.2;
    const c = this.c, w = c.world, R = w.region, N = R.N, g = this.mmG, k = N / MM;
    const col = (v: number) => [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    if (!this.mmBase) {
      // terrain as phosphor luminance: height and cliff edges read as brighter traces
      this.mmBase = new Uint8ClampedArray(MM * MM * 3);
      const av = w.terrain.avg;
      for (let y = 0; y < MM; y++) for (let x = 0; x < MM; x++) {
        const i = Math.floor(y * k) * N + Math.floor(x * k);
        const blk = R.b[i];
        const wet = R.h[i] < R.water;
        const cc = wet ? R.pal.water : av[[0, 27, 3, 4, 7, 9, 10, 11, 13, 15, 17, 19, 20, 30][blk] ?? 0];
        const lum = (((cc >> 16) & 255) * 0.3 + ((cc >> 8) & 255) * 0.59 + (cc & 255) * 0.11) / 255;
        const edge = x > 0 && R.h[i] > R.h[Math.floor(y * k) * N + Math.floor((x - 1) * k)] + 0.9;
        let v = wet ? ((x + y) % 3 === 0 ? 2 : 1.4) : 2 + lum * 1.6 + (R.h[i] / 20) * 1.4 + (edge ? 1.2 : 0);
        const p = col(PH[Math.max(0, Math.min(6, Math.round(v)))]);
        this.mmBase.set(p, (y * MM + x) * 3);
      }
    }
    const d = this.mmImg.data, base = this.mmBase, vis = c.vision.vis, seen = c.vision.seen;
    const moss = col(PH[8]), mossE = col(PH[7]), creep = col(AM[4]), creepD = col(AM[2]), dark = col(PH[1]), grid = col(PH[3]);
    for (let y = 0; y < MM; y++) for (let x = 0; x < MM; x++) {
      const i = Math.floor(y * k) * N + Math.floor(x * k), o = (y * MM + x) * 4, b = (y * MM + x) * 3;
      let r = base[b], gg = base[b + 1], bb = base[b + 2];
      if (w.moss[i] > 0.5) { const m = w.moss[i] > 0.9 ? moss : mossE; r = m[0]; gg = m[1]; bb = m[2]; }
      else if (w.creep[i] > 0.5) { const m = (x + y) % 2 ? creep : creepD; r = m[0]; gg = m[1]; bb = m[2]; }
      if (!seen[i]) { const gr = x % 12 === 0 || y % 12 === 0 ? ((x + y) % 2 ? grid : dark) : dark; r = gr[0]; gg = gr[1]; bb = gr[2]; } else if (!vis[i]) { r *= 0.5; gg *= 0.5; bb *= 0.5; }
      d[o] = r; d[o + 1] = gg; d[o + 2] = bb; d[o + 3] = 255;
    }
    g.putImageData(this.mmImg, 0, 0);
    const blink = Math.floor(this.t * 3) % 2 === 0;
    for (const cr of w.creatures) {
      if (cr.dead || !cr.visibleNow) continue;
      const hostile = cr.faction === 'rival' || (cr.faction === 'wild' && cr.diet === 'carn');
      if (hostile && !blink && cr.faction === 'rival') continue;
      g.fillStyle = cr.faction === 'veyr' ? '#e0ffe0' : cr.faction === 'rival' ? '#ff5a3a' : cr.diet === 'carn' ? '#ffa432' : '#d0c8a4';
      const s = cr.size > 1.5 ? 2 : 1;
      g.fillRect(Math.floor(cr.x / k) - (s >> 1), Math.floor(cr.z / k) - (s >> 1), s, s);
    }
    for (const hv of w.hives) for (const b of hv.buildings) {
      if (!b.visibleNow) continue;
      g.fillStyle = hv.faction === 'veyr' ? '#ffffff' : '#ff6a4a';
      const s = b.def.kind === 'core' ? 3 : 2;
      g.fillRect(Math.floor(b.x / k) - (s >> 1), Math.floor(b.z / k) - (s >> 1), s, s);
    }
    // camera footprint, dotted
    const cam = c.cam, t = cam.target;
    const hw = cam.dist * 0.62, hd = cam.dist * 0.42;
    const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
    const pts = [[-hw, -hd * 1.4], [hw, -hd * 1.4], [hw * 0.7, hd], [-hw * 0.7, hd]].map(([x, z]) => [(t.x + x * cy + z * sy) / k, (t.z - x * sy + z * cy) / k]);
    g.fillStyle = '#c0ffc6';
    for (let e = 0; e < 4; e++) {
      const [x0, y0] = pts[e], [x1, y1] = pts[(e + 1) % 4], n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)));
      for (let s = 0; s <= n; s += 2) g.fillRect(Math.round(x0 + ((x1 - x0) * s) / n), Math.round(y0 + ((y1 - y0) * s) / n), 1, 1);
    }
    void RIVALS;
  }

  // ------------------------------------------------------------------ unit telemetry
  private selection() {
    const sel = this.c.sel(), sb = this.c.selB();
    const key = sb ? 'b' + sb.id + (sb.done ? 'd' : 'g') + sb.queue.join(',') : sel.map((s) => s.id).join(',');
    const box = this.selBox;
    if (key !== this.selKey) {
      this.selKey = key;
      box.innerHTML = ''; this.selBars = {};
      box.classList.remove('on'); void box.offsetWidth; box.classList.add('on');
      const idle = !sb && !sel.length;
      if (idle !== box.parentElement!.classList.contains('idle')) { box.parentElement!.classList.toggle('idle', idle); sfx(idle ? 'close' : 'open', 1, 0.25); }
      if (sb) this.buildingInfo(sb);
      else if (sel.length === 1) this.creatureInfo(sel[0]);
      else if (sel.length > 1) {
        el('div', 'sel-title', box, `&gt; ${sel.length} UNITS LINKED`);
        const grid = el('div', 'sel-grid', box);
        for (const s of sel.slice(0, 21)) {
          const cell = el('div', 'sel-cell', grid);
          const im = el('img', '', cell); im.src = thumb(s.sp);
          const hb = new Bar(cell, PH[7], false); hb.set(s.hp / s.maxHp);
          (cell as any).__c = s; (cell as any).__b = hb;
        }
      } else {
        el('div', 'sel-title', box, '&gt; UNIT 07 &middot; STANDING BY');
        el('div', 'sel-idle', box, 'NO TARGET LINKED. SELECT A CREATURE OR STRUCTURE.<br>[G] DIRECT GROWTH &middot; [B] GROW STRUCTURE<br>TURN THE SELECTOR TO ARM A FIELD POWER.<span class="cur">&#9608;</span>');
      }
    }
    if (sel.length === 1 && !sb) {
      const s = sel[0];
      this.selBars.hp?.set(s.hp / s.maxHp, `${Math.ceil(s.hp)} / ${Math.ceil(s.maxHp)}`);
      this.selBars.en?.set(s.energy, s.dead ? `${Math.ceil(s.bio)} BIOMASS` : `${Math.round(s.energy * 100)}% FED`);
      const m = box.querySelector('.mind'); if (m) m.textContent = s.dead ? (s.digest > 0 ? 'BEING DIGESTED' : 'DEAD') : MIND[s.mind] ?? s.mind.toUpperCase();
    } else if (sb) {
      this.selBars.hp?.set(sb.hp / sb.maxHp, `${Math.ceil(sb.hp)} / ${sb.maxHp}`);
      if (this.selBars.pr) {
        if (!sb.done) this.selBars.pr.set(sb.progress, `GROWING ${Math.floor(sb.progress * 100)}%`);
        else if (sb.def.kind === 'brood' && sb.queue.length) { const sp = this.c.world.reg.get(sb.queue[0]); this.selBars.pr.set(sb.qT / sp.pheno.buildTime, `GESTATING ${sp.name.toUpperCase()}`); }
        else if (sb.def.kind === 'tap') { const d = this.c.world.region.deposits[sb.deposit]; this.selBars.pr.set(d ? d.amount / (d.kind === 'ore' ? 1600 : 1100) : 0, d ? `${Math.floor(d.amount)} LEFT` : 'DEPLETED'); }
        else this.selBars.pr.set(1, 'NOMINAL');
      }
    } else for (const cell of Array.from(box.querySelectorAll('.sel-cell'))) { const s = (cell as any).__c as Creature; (cell as any).__b.set(s.hp / s.maxHp); }
  }
  private creatureInfo(s: Creature) {
    const box = this.selBox;
    const row = el('div', 'sel-row', box);
    const pf = el('div', 'portrait', row);
    const im = el('img', '', pf); im.src = thumb(s.sp);
    const info = el('div', 'sel-info', row);
    el('div', 'sel-name', info, s.sp.name.toUpperCase());
    const owner = s.faction === 'veyr' ? '<span class="ok">YOURS</span>' : s.faction === 'rival' ? '<span class="bad">RIVAL</span>' : `<span class="amb">WILD &middot; ${s.diet === 'carn' ? 'PREDATOR' : s.diet === 'herb' ? 'GRAZER' : s.diet === 'scav' ? 'SCAVENGER' : 'OMNIVORE'}</span>`;
    el('div', 'sel-sub', info, `<i>${s.sp.design.latin}</i> &middot; ${owner}`);
    this.selBars.hp = new Bar(info, PH[7]); this.selBars.en = new Bar(info, AM[5]);
    el('div', 'sel-sub mind', info);
    const st = s.st;
    el('div', 'stats', info, `ATK ${st.attack.toFixed(0)} ARM ${Math.round(st.armor * 100)}% SPD ${st.speed.toFixed(1)} SGT ${st.sight.toFixed(0)} ${Math.round(s.mass)}KG`);
    const genes = el('div', 'genes', info);
    for (const g of s.sp.design.genes) {
      const gd = GENE[g]; if (!gd) continue;
      const gi = iconImg('cat-' + gd.cat, 'gene', genes);
      gi.addEventListener('pointerenter', () => Tip.show(`<h4>${gd.name}</h4><div class="sub">${CAT_NAMES[gd.cat]} &middot; ${gd.lineage}</div>${gd.desc}`, gi));
      gi.addEventListener('pointerleave', () => Tip.hide());
    }
  }
  private buildingInfo(b: Building) {
    const box = this.selBox;
    const row = el('div', 'sel-row', box);
    const pf = el('div', 'portrait', row);
    iconImg(b.def.kind, 'bigico', pf);
    const info = el('div', 'sel-info', row);
    el('div', 'sel-name', info, b.def.name.toUpperCase());
    el('div', 'sel-sub desc', info, b.faction === 'veyr' ? b.def.desc : 'A RIVAL STRUCTURE.');
    this.selBars.hp = new Bar(info, PH[7]);
    this.selBars.pr = new Bar(info, AM[5]);
    if (b.def.kind === 'brood' && b.queue.length) {
      const q = el('div', 'queue', info);
      for (const id of b.queue) { const im = el('img', 'qimg', q); im.src = thumb(this.c.world.reg.get(id)); }
    }
  }

  // ------------------------------------------------------------------ command bank (powers live on the selector)
  private commands() {
    const key = this.c.ctxKey();
    if (key !== this.cmdKey) {
      this.cmdKey = key;
      this.cmdBox.innerHTML = ''; this.btns = [];
      const cmds = this.c.commands().filter((x) => x && !isAbilityCmd(x));
      for (let i = 0; i < 12; i++) {
        const cm = cmds[i];
        if (!cm) { el('div', 'cmd-empty', this.cmdBox); continue; }
        this.btns.push(new Btn(this.cmdBox, { icon: cm.icon, hotkey: cm.key === 'Escape' ? 'ESC' : cm.key, cost: cm.cost, tip: () => `<h4>${cm.name}</h4>${cm.tip()}`, disabled: cm.disabled, active: cm.active }, cm.run));
      }
      this.cmdBox.classList.remove('on'); void this.cmdBox.offsetWidth; this.cmdBox.classList.add('on');
    }
    for (const b of this.btns) b.refresh();
  }
  invalidate() { this.cmdKey = ''; this.selKey = '-'; }
  dispose() { this.root.remove(); Tip.hide(); }
}
void BR; void GM; void RD; void fmt;
