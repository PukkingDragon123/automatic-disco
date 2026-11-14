// The in-region HUD is Unit 07's own control console, built around the edges of the view so the middle stays
// clear: a raw-materials rail of rolling drums with their hold caps and a status rail (hull, charge, core cells, held
// ground) along the top, a switch bank with the big SKILLS switch; the terrain scope, the telemetry CRT, the command
// key bank and the ordnance selector wheel along the bottom; a shortwave set for Calder's transmissions. Every
// housing is painted pixel art; every value moves something. The console picks its own scale for the screen, folds
// into a compact stack on narrow ones, and on touch screens keeps the bottom corners clear for the thumb controls.
import { el, ui, Btn, Bar, iconImg, Tip, toast } from './kit';
import { sfx } from '../audio/audio';
import { thumb } from './thumbs';
import type { Hive } from '../game/hive';
import { ABILITIES, RES_COL, type Ability } from '../game/hive';
import type { World } from '../game/world';
import type { Creature } from '../game/creature';
import type { Building } from '../game/buildings';
import type { Vision } from '../game/vision';
import type { RtsCam } from '../app/rtsCam';
import type { Game } from '../game/game';
import { GENE, CAT_NAMES } from '../life/genes';
import { RES, SKILL, SKILLS, type Res } from '../game/skills';
import { PH, AM, CR, RD, hex } from './machine';
import { Odometer, Nixie, PixText, Lamp, Toggle, BigSwitch, Gauge, Knob, crtSettings, meterFace, place, tip, u, steamVent } from './gadgets';
import { RESM, STATM, BANK, PLATE, SCOPE, SEL, CMD, WHEEL, resArt, statArt, bankArt, bigSwitchArt, nameArt, scopeArt, selArt, cmdArt, radioArt } from './hudArt';
import { AbilityWheel } from './wheel';

export interface Cmd { icon: string; key: string; name: string; tip: () => string; disabled?: () => string | false; active?: () => boolean; run: () => void; cost?: string }
export interface HudCtx {
  hive: Hive; world: World; vision: Vision; cam: RtsCam;
  /** the region screen: run (resources, skills), the golem, hooks */
  game?: Game;
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

const MIND: Record<string, string> = { idle: 'RESTING', wander: 'WANDERING', graze: 'GRAZING', eat: 'FEEDING', hunt: 'HUNTING', flee: 'FLEEING', scavenge: 'SCAVENGING', order: 'MOVING', attack: 'FIGHTING', held: 'HELD', rest: 'RESTING', follow: 'FOLLOWING', mate: 'COURTING' };
const MM = 96;
const isAbilityCmd = (c: Cmd) => !!(ABILITIES as any)[c.icon] && (ABILITIES as any)[c.icon].key === c.key;
const SOURCE: Record<Res, string> = {
  ore: 'Shed by rock formations and seams: pull in the loose nuggets, or bore seams and boulders with the Ore Drill.',
  carbon: 'Husks under the plants; corpses and absorbed plants give more (Carbon Intake).',
  water: 'Dew globes beaded on damp-loving plants; the Water Siphon drinks rivers and the sea.',
  soil: 'Loose clods on bare ground; the Excavator scoops it anywhere.',
};
/** console scales tried, largest first (art pixels to screen pixels) */
const SCALES = [3, 2.5, 2, 1.5];

export class Hud {
  readonly root: HTMLDivElement;
  private mods: Record<string, HTMLDivElement> = {};
  private odo = {} as Record<Res, Odometer>; private capT = {} as Record<Res, PixText>; private fill = {} as Record<Res, HTMLDivElement>; private rlamp = {} as Record<Res, Lamp>;
  private flashT: Record<Res, number> = { ore: 0, carbon: 0, water: 0, soil: 0 };
  private hullFill: HTMLDivElement; private hullTxt: PixText;
  private chgNix: Nixie; private chgMax: PixText; private chgGauge: Gauge;
  private cellNix: Nixie; private cellLamp: Lamp; private cellHot = 0;
  private terFill: HTMLDivElement; private terTxt: PixText;
  private skillSw: BigSwitch;
  private clockNix: Nixie; private colon: HTMLDivElement; private dayLamp: Lamp;
  private mm: HTMLCanvasElement; private mmG: CanvasRenderingContext2D; private mmBase: Uint8ClampedArray | null = null; private mmT = 0; private mmImg: ImageData;
  private regionEl: HTMLDivElement;
  private selBox: HTMLDivElement; private selKey = '-'; private selBars: { hp?: Bar; en?: Bar; pr?: Bar } = {};
  private cmdBox: HTMLDivElement; private btns: Btn[] = []; private cmdKey = '';
  readonly wheel: AbilityWheel;
  private t = 0; private layoutKey = '';
  readonly dialog: HTMLDivElement;
  readonly objectives: HTMLDivElement;
  private onResize = () => this.layout();

  constructor(readonly c: HudCtx) {
    this.root = el('div', 'hud', ui());
    this.root.style.setProperty('--radio', `url(${radioArt().url()})`);
    const mod = (cls: string, w: number, h: number, art: string) => { const m = el('div', 'mod ' + cls, this.root); m.style.width = u(w); m.style.height = u(h); m.style.backgroundImage = `url(${art})`; m.addEventListener('pointerdown', (e) => e.stopPropagation()); this.mods[cls] = m; return m; };
    const h = c.hive;

    // ---- conduit runs along the top and bottom edges, behind the housings
    el('div', 'conduit top', this.root); el('div', 'conduit bot', this.root);

    // ---- raw materials: four drum counters, each with its hold cap, a fill tube and a lamp
    const rm = mod('hud-res', RESM.w, RESM.h, resArt(RES.map((r) => RES_COL[r]), RES.map((r) => r.toUpperCase())).url());
    RES.forEach((r, k) => {
      const x = RESM.x0 + k * RESM.dx;
      this.odo[r] = new Odometer(rm, 3, x, 13);
      this.capT[r] = new PixText(rm, x + 26, 16, 18, 'left');
      this.fill[r] = place(el('div', 'tube-fill res', rm), x + 26, 24, 0, 2);
      this.fill[r].style.setProperty('--rc', hex(RES_COL[r]));
      this.rlamp[r] = new Lamp(rm, x + 36, 3, 'g', 'off');
      tip(place(el('div', 'hit', rm), x - 2, 2, 46, 26), () => this.resTip(r));
    });

    // ---- status: hull, charge, core cells, held ground
    const sm = mod('hud-stat', STATM.w, STATM.h, statArt(h.winAt).url()), X = STATM;
    this.hullFill = place(el('div', 'tube-fill hull', sm), X.hull, 13, 0, 7);
    this.hullTxt = new PixText(sm, X.hull, 23, 40, 'left');
    tip(place(el('div', 'hit', sm), X.hull - 2, 2, 44, 27), () => { const [a, b] = this.hull(); return `<h4>Hull Integrity</h4>${Math.ceil(a)} / ${Math.round(b)}. Plate Steel adds more. The crashed core patches the hull while Unit 07 stays close to it.`; });
    this.chgGauge = new Gauge(sm, X.chg - 1, 10, { w: 30, h: 19, cx: 15, cy: 16, r: 12, a0: -1.45, a1: 1.45, face: (p) => meterFace(p, 15, 16, 12, -1.45, 1.45, { ticks: 6, red: [0, 0.18] }) });
    this.chgNix = new Nixie(sm, 3, X.chg + 32, 12);
    this.chgMax = new PixText(sm, X.chg + 32, 4, 29, 'right');
    tip(place(el('div', 'hit', sm), X.chg - 2, 2, 64, 27), () => `<h4>Charge</h4>Gravity energy for the field powers. Refills by itself; the Gravity Coil and Reactor Bloom hold more and refill faster.`);
    this.cellNix = new Nixie(sm, 2, X.cel, 12);
    this.cellLamp = new Lamp(sm, X.cel + 21, 15, 'a', 'off');
    tip(place(el('div', 'hit', sm), X.cel - 2, 2, 30, 27), () => `<h4>Core Cells</h4>${this.points()} to spend on the skill tree. Earned by advancing: the first of each material, every load gathered, new species absorbed, ground held, big kills.`);
    this.terFill = place(el('div', 'tube-fill dom', sm), X.ter, 13, 0, 7);
    this.terTxt = new PixText(sm, X.ter, 23, 38, 'left');
    tip(place(el('div', 'hit', sm), X.ter - 2, 2, 42, 27), () => `<h4>Held Ground</h4>${(c.conquest() * 100).toFixed(1)}% of this region's land is yours. Graft plants and convert creatures to claim more. Hold ${Math.round(h.winAt * 100)}% (the red mark) and break every rival heart to take the region.`);

    // ---- name plate + chronometer
    const np = mod('hud-plate', PLATE.w, PLATE.h, nameArt().url());
    this.clockNix = new Nixie(np, 4, 7, 16, false);
    this.clockNix.e.querySelectorAll('.nx').forEach((t, i) => { if (i >= 2) (t as HTMLElement).style.left = u(i * 10 + 3); });
    this.colon = place(el('div', 'colon', np), 27, 19, 1, 7);
    this.dayLamp = new Lamp(np, 92, 17, 'a', 'on');
    tip(place(el('div', 'hit', np), 4, 14, 96, 18), () => '<h4>Chronometer</h4>Local time on this world. Night brings the hunters out.');

    // ---- switch bank: the big SKILLS switch, the lab, the tree, the assembly bay, the menu
    const bank = mod('hud-bank', BANK.w, BANK.h, bankArt().url()), T = BANK.tog;
    this.skillSw = new BigSwitch(bank, BANK.big, 3, 'SKILLS', 'K', bigSwitchArt().url(), () => this.skillsTip(), () => this.openSkills());
    new Toggle(bank, T[0], 4, 'LAB', 'L', () => '<h4>Field Laboratory</h4>The gene lab: put an absorbed species in the tank and rebuild it limb by limb.', () => this.openLab());
    new Toggle(bank, T[1], 4, 'TREE', 'T', () => '<h4>Tree of Descent</h4>Every species you have met, made or watched branch off.', () => c.openTree());
    new Toggle(bank, T[2], 4, 'ASSY', 'V', () => '<h4>Assembly Bay</h4>Refit Unit 07: paint, plating, lens and name.', () => c.openMirror());
    new Toggle(bank, T[3], 4, 'MENU', 'ESC', () => '<h4>Menu</h4>Pause the survey.', () => c.openMenu());

    // ---- terrain scope (minimap)
    const sc = mod('hud-scope', SCOPE.w, SCOPE.h, scopeArt().url());
    this.regionEl = place(el('div', 'scr sc-name', sc), 7, 5, 100, 9);
    this.regionEl.textContent = c.regionName.toUpperCase();
    this.mm = place(el('canvas', 'mm', sc), SCOPE.sx, SCOPE.sy, SCOPE.ss, SCOPE.ss);
    this.mm.width = MM; this.mm.height = MM;
    this.mmG = this.mm.getContext('2d')!; this.mmImg = this.mmG.createImageData(MM, MM);
    place(el('div', 'sweep', sc), SCOPE.sx, SCOPE.sy, SCOPE.ss, SCOPE.ss);
    place(el('div', 'scr-glass', sc), SCOPE.sx, SCOPE.sy, SCOPE.ss, SCOPE.ss);
    const N = c.world.region.N;
    const mmEv = (e: PointerEvent) => { const r = this.mm.getBoundingClientRect(); c.minimap(((e.clientX - r.left) / r.width) * N, ((e.clientY - r.top) / r.height) * N, e.button); };
    this.mm.addEventListener('pointerdown', (e) => { e.stopPropagation(); mmEv(e); this.mm.setPointerCapture(e.pointerId); });
    this.mm.addEventListener('pointermove', (e) => { if (e.buttons & 1) mmEv(e); });
    this.mm.addEventListener('contextmenu', (e) => e.preventDefault());

    // ---- unit telemetry
    const sl = mod('hud-sel', SEL.w, SEL.h, selArt().url());
    this.selBox = place(el('div', 'scr sel-scr', sl), SEL.sx, SEL.sy, SEL.sw, SEL.sh);
    new Lamp(sl, 191, 66, 'g', 'blink');
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

    // live feedback from the economy
    const g = c.game;
    g?.on('gather', (d: { res: Res }) => { if (d?.res) this.flashT[d.res] = 0.25; });
    g?.on('points', () => { this.cellHot = 2.5; this.cellNix.set(0); this.cellNix.set(this.points()); });
    addEventListener('resize', this.onResize);
    this.layout();
  }

  // ------------------------------------------------------------------ layout
  private isTouch() { return document.body.classList.contains('touch') || matchMedia('(pointer: coarse)').matches; }
  /** pick a scale for the top rails and one for the bottom deck; stack everything on narrow screens; keep the bottom
   *  corners free on touch screens */
  layout() {
    const W = innerWidth, H = innerHeight, touch = this.isTouch();
    const key = `${W}x${H}|${touch}`;
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    const topW = PLATE.w + RESM.w + STATM.w + BANK.w + 6, botW = SCOPE.w + SEL.w + CMD.w + WHEEL.w + 4;
    let sT = 1, sB = 1;
    for (const k of SCALES) if (topW * k <= W && BANK.h * k <= H * 0.15) { sT = k; break; }
    for (const k of SCALES) if (k <= sT && botW * k <= W && WHEEL.h * k <= H * 0.42) { sB = k; break; }
    const compact = topW > W;
    const M = this.mods;
    const put = (e: HTMLElement | null | undefined, s: number, p: { l?: number; r?: number; t?: number; b?: number } | null) => {
      if (!e) return;
      // the shortwave set and the field notes show and hide themselves (story); only place them
      if (e !== this.dialog && e !== this.objectives) e.style.display = p ? '' : 'none';
      if (!p) return;
      e.style.setProperty('--s', String(s));
      e.style.left = p.l !== undefined ? `${Math.round(p.l)}px` : 'auto'; e.style.right = p.r !== undefined ? `${Math.round(p.r)}px` : 'auto';
      e.style.top = p.t !== undefined ? `${Math.round(p.t)}px` : 'auto'; e.style.bottom = p.b !== undefined ? `${Math.round(p.b)}px` : 'auto';
    };
    const wl = this.root.querySelector('.wl') as HTMLElement | null, wd = this.root.querySelector('.wl-desc') as HTMLElement | null;
    this.root.classList.toggle('compact', compact);
    this.root.classList.toggle('touch', touch);
    if (!compact) {
      // one rail across the top: plate left, bank right, the two rails centred in between
      const free = W - (PLATE.w + BANK.w) * sT, grp = (RESM.w + STATM.w) * sT, l0 = PLATE.w * sT + Math.max(0, (free - grp) / 2);
      put(M['hud-plate'], sT, { l: 0, t: 0 });
      put(M['hud-res'], sT, { l: l0, t: 0 });
      put(M['hud-stat'], sT, { l: l0 + RESM.w * sT, t: 0 });
      put(M['hud-bank'], sT, { r: 0, t: 0 });
      put(this.objectives, sT, { r: 2 * sT, t: (BANK.h + 3) * sT });
      if (touch) {
        put(M['hud-scope'], sT, { l: 0, t: PLATE.h * sT + 2 });
        put(M['hud-sel'], sB, null);
        put(M['hud-cmd'], sB, { l: (W - CMD.w * sB) / 2, b: 0 });
        put(wl, sB, null); put(wd, sB, null);
        put(this.dialog, sT, { l: Math.max(SCOPE.w * sT + 4, (W - 226 * sT) / 2), t: (STATM.h + 4) * sT });
      } else {
        const roomSel = SCOPE.w + SEL.w + CMD.w + WHEEL.w + 4 <= W / sB;
        put(M['hud-scope'], sB, { l: 0, b: 0 });
        put(M['hud-sel'], sB, roomSel ? { l: SCOPE.w * sB, b: 0 } : null);
        put(M['hud-cmd'], sB, { r: (WHEEL.w + 2) * sB, b: 0 });
        put(wl, sB, { r: 0, b: 0 }); put(wd, sB, { r: 0, b: 152 * sB });
        put(this.dialog, sB, { l: 2 * sB, b: (SCOPE.h + 4) * sB });
      }
    } else {
      // narrow screens: the rails stack at the top, the scope and the bank under them, the keys at the bottom
      const two = RESM.w + STATM.w <= W, row = two ? RESM.h : RESM.h * 2;
      put(M['hud-plate'], 1, null);
      put(M['hud-res'], 1, { l: 0, t: 0 });
      put(M['hud-stat'], 1, two ? { l: RESM.w, t: 0 } : { l: 0, t: RESM.h });
      put(M['hud-bank'], 1, { r: 0, t: row });
      put(M['hud-scope'], 1, { l: 0, t: row });
      put(this.objectives, 1, { r: 2, t: row + BANK.h + 3 });
      put(this.dialog, 1, { l: 0, t: row + SCOPE.h + 3 });
      put(M['hud-sel'], 1, null);
      put(M['hud-cmd'], 1, touch ? { l: (W - CMD.w) / 2, b: 0 } : { l: 0, b: 0 });
      put(wl, 1, touch ? null : { r: 0, b: 0 }); put(wd, 1, touch ? null : { r: 0, b: 152 });
    }
  }

  // ------------------------------------------------------------------ keys and switches
  /** keys the console owns (K skills, L lab, and the selector's turn / fire keys); true when used */
  key(k: string) {
    if (k === 'k') { this.skillSw.flick(); this.openSkills(); return true; }
    if (k === 'l' && this.c.game?.menu !== 'build') { this.openLab(); return true; }
    return this.wheel.key(k);
  }
  private openSkills() {
    const g = this.c.game, f = g?.opts.hooks?.openSkills;
    if (g && f) f(g); else toast('The skill tree is not connected', 'warn', 1600);
  }
  private openLab() {
    const g = this.c.game, f = g?.opts.hooks?.openLab;
    if (g && f) f(g); else this.c.openBuilder();
  }
  private points() { return this.c.game?.run.skills.points ?? 0; }
  /** skills it could buy right now */
  private buyable() {
    const run = this.c.game?.run; if (!run) return [];
    return SKILLS.filter((s) => !run.skills.why(s.id, run.res));
  }
  private skillsTip() {
    const n = this.points(), b = this.buyable();
    return `<h4>Skill Tree</h4>Build Unit 07 up, part by part, power by power. ${n} core cell${n === 1 ? '' : 's'} to spend.${b.length ? `<div class="sub" style="margin-top:3px">Ready now: ${b.slice(0, 4).map((s) => s.name).join(', ')}${b.length > 4 ? '…' : ''}</div>` : ''}`;
  }
  private resTip(r: Res) {
    const run = this.c.game?.run, h = this.c.hive;
    return `<h4>${r}</h4>${Math.floor(run?.res[r] ?? 0)} / ${h.cap(r)} in the hold. ${SOURCE[r]}`;
  }
  /** hull from the golem's controller if it keeps one, else the hive's fallback */
  private hull(): [number, number] {
    const pl = this.c.game?.player as any, ch = this.c.game?.child as any, h = this.c.hive;
    if (pl && typeof pl.hull === 'number') return [pl.hull, pl.hullMax || h.hullMax];
    if (ch && typeof ch.hp === 'number') return [ch.hp, ch.maxHp ?? ch.hpMax ?? ch.hullMax ?? h.hullMax];
    if (ch && typeof ch.hull === 'number') return [ch.hull, ch.hullMax ?? ch.maxHull ?? h.hullMax];
    return [h.hull, h.hullMax];
  }

  // ------------------------------------------------------------------ tick
  update(dt: number) {
    this.t += dt;
    const c = this.c, h = c.hive, run = c.game?.run;
    for (const r of RES) if (this.flashT[r] > 0) this.flashT[r] -= dt;
    this.cellHot = Math.max(0, this.cellHot - dt);
    if (Math.floor(this.t * 8) !== Math.floor((this.t - dt) * 8)) {
      h.countUnits();
      // the touch class can arrive after the console is built (the first touch)
      if (Math.floor(this.t * 2) !== Math.floor((this.t - dt) * 2)) this.layout();
      // the centre console retracts while a genome is being taken apart
      const fold = !!document.querySelector('.harvest');
      if (fold !== this.root.classList.contains('fold')) { this.root.classList.toggle('fold', fold); sfx(fold ? 'close' : 'open', 1, 0.4); }
      for (const r of RES) {
        const v = run?.res[r] ?? 0, cap = h.cap(r), f = v / cap;
        this.odo[r].set(v);
        this.capT[r].set('/' + cap, CR[3]);
        this.fill[r].style.width = u(Math.round(Math.max(0, Math.min(1, f)) * 16));
        this.rlamp[r].set(f >= 0.999 ? 'blink' : this.flashT[r] > 0 ? 'on' : f >= 0.85 ? 'dim' : 'off', f >= 0.999 ? 'r' : f >= 0.85 ? 'a' : 'g');
      }
      const [hp, hm] = this.hull(), hf = Math.max(0, Math.min(1, hp / Math.max(1, hm)));
      this.hullFill.style.width = u(Math.round(hf * 40));
      this.hullFill.classList.toggle('low', hf < 0.3);
      this.hullTxt.set(`${Math.ceil(hp)}/${Math.round(hm)}`, hf < 0.3 ? RD[6] : PH[8], true);
      this.chgNix.set(h.res.charge); this.chgMax.set('/' + h.chargeCap, CR[3]);
      const pts = this.points();
      this.cellNix.set(pts);
      const ready = this.buyable().length > 0;
      this.cellLamp.set(this.cellHot > 0 ? 'fast' : pts > 0 ? (ready ? 'blink' : 'on') : 'off');
      this.skillSw.lamp.set(ready ? 'blink' : pts > 0 ? 'on' : 'dim', ready ? 'g' : 'a');
      const q = c.conquest();
      this.terTxt.set(`${Math.floor(q * 100)}%`, q >= h.winAt ? AM[6] : PH[8], true);
      this.terFill.style.width = u(Math.round(Math.max(0, Math.min(1, q / 0.6)) * 38));
      const d = c.world.day, hh = Math.floor(d * 24), mi = Math.floor((d * 24 - hh) * 60), night = d > 0.75 || d < 0.22;
      this.clockNix.set(hh * 100 + mi);
      this.dayLamp.set(night ? 'dim' : 'on', night ? 'g' : 'a');
      this.colon.classList.toggle('off', Math.floor(this.t * 2) % 2 === 1);
    }
    this.chgGauge.set(h.res.charge / Math.max(1, h.chargeCap)); this.chgGauge.update(dt);
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
        const v = wet ? ((x + y) % 3 === 0 ? 2 : 1.4) : 2 + lum * 1.6 + (R.h[i] / 20) * 1.4 + (edge ? 1.2 : 0);
        const p = col(PH[Math.max(0, Math.min(6, Math.round(v)))]);
        this.mmBase.set(p, (y * MM + x) * 3);
      }
    }
    const d = this.mmImg.data, base = this.mmBase, vis = c.vision.vis, seen = c.vision.seen;
    const mine = col(PH[8]), mineE = col(PH[7]), theirs = col(AM[4]), theirsD = col(AM[2]), dark = col(PH[1]), grid = col(PH[3]);
    for (let y = 0; y < MM; y++) for (let x = 0; x < MM; x++) {
      const i = Math.floor(y * k) * N + Math.floor(x * k), o = (y * MM + x) * 4, b = (y * MM + x) * 3;
      let r = base[b], gg = base[b + 1], bb = base[b + 2];
      if (w.moss[i] > 0.5) { const m = w.moss[i] > 0.9 || (x + y) % 3 === 0 ? mine : mineE; r = m[0]; gg = m[1]; bb = m[2]; }
      else if (w.creep[i] > 0.5) { const m = (x + y) % 2 ? theirs : theirsD; r = m[0]; gg = m[1]; bb = m[2]; }
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
    // Unit 07: a bright cross that pulses
    const gp = c.hive.golem();
    if (gp) {
      const gx = Math.floor(gp.x / k), gy = Math.floor(gp.z / k);
      g.fillStyle = blink ? '#ffffff' : '#c0ffc6';
      g.fillRect(gx - 1, gy, 3, 1); g.fillRect(gx, gy - 1, 1, 3);
      if (blink) { g.fillStyle = 'rgba(192,255,198,0.5)'; g.fillRect(gx - 2, gy, 1, 1); g.fillRect(gx + 2, gy, 1, 1); g.fillRect(gx, gy - 2, 1, 1); g.fillRect(gx, gy + 2, 1, 1); }
    }
    // camera footprint, dotted
    const cam = c.cam, t = cam.target;
    const hw = cam.dist * 0.62, hd = cam.dist * 0.42;
    const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
    const pts = [[-hw, -hd * 1.4], [hw, -hd * 1.4], [hw * 0.7, hd], [-hw * 0.7, hd]].map(([x, z]) => [(t.x + x * cy + z * sy) / k, (t.z - x * sy + z * cy) / k]);
    g.fillStyle = 'rgba(192,255,198,0.6)';
    for (let e = 0; e < 4; e++) {
      const [x0, y0] = pts[e], [x1, y1] = pts[(e + 1) % 4], n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)));
      for (let s = 0; s <= n; s += 2) g.fillRect(Math.round(x0 + ((x1 - x0) * s) / n), Math.round(y0 + ((y1 - y0) * s) / n), 1, 1);
    }
  }

  // ------------------------------------------------------------------ unit telemetry
  private selection() {
    const sel = this.c.sel(), sb = this.c.selB(), run = this.c.game?.run;
    const idleKey = run ? `i${run.skills.points}|${run.skills.owned.size}|${Math.floor(this.t / 2)}` : 'i';
    const key = sb ? 'b' + sb.id + (sb.done ? 'd' : 'g') + sb.queue.join(',') : sel.length ? sel.map((s) => s.id).join(',') : idleKey;
    const box = this.selBox;
    if (key !== this.selKey) {
      const wasIdle = this.selKey.startsWith('i');
      this.selKey = key;
      box.innerHTML = ''; this.selBars = {};
      if (!(wasIdle && key.startsWith('i'))) { box.classList.remove('on'); void box.offsetWidth; box.classList.add('on'); }
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
      } else this.idleInfo();
    }
    if (sel.length === 1 && !sb) {
      const s = sel[0];
      this.selBars.hp?.set(s.hp / s.maxHp, `${Math.ceil(s.hp)} / ${Math.ceil(s.maxHp)}`);
      this.selBars.en?.set(s.energy, s.dead ? `${Math.ceil(s.bio)} CARBON LEFT` : `${Math.round(s.energy * 100)}% FED`);
      const m = box.querySelector('.mind'); if (m) m.textContent = s.dead ? (s.digest > 0 ? 'BEING TAKEN APART' : 'DEAD') : MIND[s.mind] ?? s.mind.toUpperCase();
    } else if (sb) {
      this.selBars.hp?.set(sb.hp / sb.maxHp, `${Math.ceil(sb.hp)} / ${sb.maxHp}`);
      if (this.selBars.pr) {
        if (!sb.done) this.selBars.pr.set(sb.progress, `GROWING ${Math.floor(sb.progress * 100)}%`);
        else if (sb.def.kind === 'brood' && sb.queue.length) { const sp = this.c.world.reg.get(sb.queue[0]); this.selBars.pr.set(sb.qT / sp.pheno.buildTime, `GESTATING ${sp.name.toUpperCase()}`); }
        else if (sb.def.kind === 'tap') { const d = this.c.world.region.deposits[sb.deposit]; this.selBars.pr.set(d ? d.amount / (d.kind === 'ore' ? 1600 : 1100) : 0, d ? `${Math.floor(d.amount)} LEFT` : 'DEPLETED'); }
        else this.selBars.pr.set(1, 'NOMINAL');
      }
    } else for (const cell of Array.from(box.querySelectorAll('.sel-cell'))) { const s = (cell as any).__c as Creature; if (s) (cell as any).__b.set(s.hp / s.maxHp); }
  }
  /** nothing linked: Unit 07's own readout and what to do next */
  private idleInfo() {
    const box = this.selBox, g = this.c.game, h = this.c.hive;
    const run = g?.run;
    const parts = ['head', 'torso', 'armR', 'armL', 'coil', 'plating1', 'plating2', 'reactor'].filter((id) => run?.skills.has(id));
    const body = parts.length ? SKILL[parts[parts.length - 1]].name.toUpperCase() : 'SURVEY HEAD';
    el('div', 'sel-title', box, `&gt; UNIT 07 &middot; ${parts.length} PART${parts.length === 1 ? '' : 'S'} &middot; ${body}`);
    const [hp, hm] = this.hull();
    el('div', 'sel-sub', box, `HULL ${Math.round((hp / Math.max(1, hm)) * 100)}% &middot; HOLD ${h.cap('ore')} &middot; ALLIES ${h.allyCount()}/${h.allyCap()} &middot; GROUND ${(this.c.conquest() * 100).toFixed(1)}%`);
    el('div', 'sel-idle', box, this.hint() + '<span class="cur">&#9608;</span>');
  }
  private hint() {
    const run = this.c.game?.run, h = this.c.hive;
    if (!run) return 'STANDING BY.';
    const S = run.skills, b = this.buyable();
    if (b.length && S.points > 0) return `CORE CELLS READY. THROW THE SKILLS SWITCH [K]: ${b.slice(0, 2).map((s) => s.name.toUpperCase()).join(', ')}.`;
    if (S.owned.size <= 1) return 'GATHER LOOSE GRIT: FLY CLOSE TO NUGGETS, HUSKS, DEW AND CLODS AND THE FIELD PULLS THEM IN.';
    if (!S.has('graft')) return 'GATHER. EVERY LOAD EARNS CORE CELLS. PLANT GRAFT LETS YOU CLAIM GROUND.';
    if (h.territory() < 0.05) return 'GRAFT PLANTS TO CLAIM THE GROUND AROUND THEM.';
    if (!S.has('convert')) return 'HOLD MORE GROUND. NEURAL GRAFT TURNS BEATEN CREATURES INTO ALLIES THAT CLAIM AS THEY ROAM.';
    return `HOLD ${Math.round(h.winAt * 100)}% OF THE LAND AND BREAK EVERY RIVAL HEART.`;
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
  dispose() { removeEventListener('resize', this.onResize); this.root.remove(); Tip.hide(); }
}
