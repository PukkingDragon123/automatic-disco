// The in-region HUD is Unit 07's cockpit desk: a real 3D console drawn as pixel art over the bottom of the view
// (ui/desk/*). This file binds it to the game: what every instrument reads, what every object does when clicked, the
// five MODES that reconfigure the desk (and open and close the other systems' panels with them), the inspection
// clipboard for whatever is selected, the hover tags, keys, and the few DOM pieces that stay DOM (Calder's shortwave
// transmissions, the field notes).
//
//   EXPLORE  the strip only: drum, hull and charge, the holds. The world stays clear; floating text keeps quiet.
//   BUILD    the works catalogue comes up with the grid; the left wing carries the build tools and the works meter.
//   COMMAND  the holo table (ping it, right-click it to send units), the telemetry CRT, ordnance, rally.
//   BIO      the bioworks ledger, the life overlay, the lab, the family tree.
//   SURVEY   the scan table, the habitat overlay, the orrery and calendar, the binoculars for the census sheet.
import * as THREE from 'three';
import { el, ui, Tip, toast } from './kit';
import { sfx } from '../audio/audio';
import { thumb } from './thumbs';
import type { Hive } from '../game/hive';
import { ABILITIES, type Ability } from '../game/hive';
import type { World } from '../game/world';
import type { Creature } from '../game/creature';
import type { Building } from '../game/buildings';
import type { Vision } from '../game/vision';
import type { RtsCam } from '../app/rtsCam';
import type { Game } from '../game/game';
import { RES, SKILL, SKILLS, type Res } from '../game/skills';
import { AbilityWheel } from './wheel';
import { powerCost } from '../game/combat';
import { Desk, MODES, type Mode } from './desk/desk';
import { MODE_NAME } from './desk/parts';
import type { Hot } from './desk/kit';
import { R, text5, textW5, text3s, textW3s, Pix } from './desk/paint';
import { FLOAT } from './floatText';
import type { Climate } from '../game/climate';
import { SEASON } from '../game/climate';

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
  /** arm (or disarm) a field power for targeting */
  ability?: (a: Ability) => void;
  /** the power currently armed, if any */
  armed?: () => Ability | null;
}

const MIND: Record<string, string> = {
  idle: 'RESTING', wander: 'WANDERING', graze: 'GRAZING', eat: 'FEEDING', hunt: 'HUNTING', flee: 'FLEEING', scavenge: 'SCAVENGING', order: 'MOVING', attack: 'FIGHTING', held: 'HELD', rest: 'RESTING', follow: 'FOLLOWING', mate: 'COURTING',
  drink: 'DRINKING', sleep: 'ASLEEP', travel: 'ON THE MOVE', stalk: 'STALKING', ambush: 'LYING IN WAIT', display: 'THREAT DISPLAY', carry: 'DRAGGING A KILL', watch: 'KEEPING WATCH', curl: 'CURLED UP',
};
const SOURCE: Record<Res, string> = {
  ore: 'Shed by rock formations and seams: pull in the loose nuggets, or bore seams and boulders with the Ore Drill.',
  carbon: 'Husks under the plants; corpses and absorbed plants give more (Carbon Intake).',
  water: 'Dew globes beaded on damp-loving plants; the Water Siphon drinks rivers and the sea.',
  soil: 'Loose clods on bare ground; the Excavator scoops it anywhere.',
};
const isAbilityCmd = (c: Cmd) => !!(ABILITIES as any)[c.icon] && (ABILITIES as any)[c.icon].key === c.key;
type EcoV = { cycleOverlay(): void; toggleSurvey(on?: boolean): void; setOverlay(m: string): void; mode?: string };
type BioU = { toggleLedger(force?: boolean): void; ledgerOpen: boolean };
const store = { get(k: string, d: number) { try { const v = localStorage.getItem(k); return v === null ? d : +v; } catch { return d; } }, set(k: string, v: number) { try { localStorage.setItem(k, String(v)); } catch { /* private mode */ } } };
/** the console's phosphor: GAIN (brightness of every screen) and TUNE (green P1 or amber P3 tubes) */
export const crtSettings = {
  gain: store.get('oddworld.crt.gain', 0.5),
  tint: store.get('oddworld.crt.tint', 0),
  apply() { document.documentElement.style.setProperty('--crt-gain', String(0.7 + this.gain * 0.6)); document.body.classList.toggle('p3', this.tint >= 0.5); },
  setGain(v: number) { this.gain = Math.max(0, Math.min(1, v)); store.set('oddworld.crt.gain', this.gain); this.apply(); },
  setTint(v: number) { this.tint = v; store.set('oddworld.crt.tint', v); this.apply(); },
};

export class Hud {
  readonly root: HTMLDivElement;
  readonly desk: Desk;
  readonly wheel: AbilityWheel;
  readonly dialog: HTMLDivElement;
  readonly objectives: HTMLDivElement;
  mode: Mode = 'explore';
  /** the climate (game/climate.ts hands it over through the almanac) */
  climate: Climate | null = null;
  private tag: HTMLDivElement; private tagHot: Hot | null = null; private tagT = 0; private tagTxt = '';
  private t = 0; private slow = 0; private selKey = '-'; private cmdKey = ''; private cmds: Cmd[] = []; private keyHots: Hot[] = [];
  private flashT: Record<Res, number> = { ore: 0, carbon: 0, water: 0, soil: 0 };
  private dockT = 0; private lastHull = -1; private alarmT = 0; private cellHot = 0; private mapT = 0; private mapBuilt = 0; private crtT = 0;
  private thumbs = new Map<string, Pix | null>();
  private onResize = () => { this.desk.layout(); this.cssVars(); };

  constructor(readonly c: HudCtx) {
    this.root = el('div', 'hud', ui());
    this.desk = new Desk(this.root);
    this.tag = el('div', 'desk-tag', this.root);
    this.dialog = el('div', 'hud-dialog', this.root);
    this.objectives = el('div', 'px-dark hud-obj', this.root);
    this.objectives.style.display = 'none';
    this.wheel = new AbilityWheel({
      hive: c.hive,
      arm: (a) => { if (c.ability) return c.ability(a); const cmd = c.commands().find((x) => x.icon === a && isAbilityCmd(x)); if (cmd && !cmd.disabled?.()) cmd.run(); },
      armed: () => { if (c.armed) return c.armed(); const cmd = c.commands().find((x) => isAbilityCmd(x) && x.active?.()); return cmd ? (cmd.icon as Ability) : null; },
    });
    crtSettings.apply();
    this.bindDesk();
    this.desk.onHover = (h) => { this.tagHot = h; this.tagT = 0; if (h) sfx('hover', 1, 0.35); };
    // every object answers with a solid little click (a bakelite tap), its own action does the rest
    this.desk.onClick = () => sfx('hit', 2.2, 0.18);
    const g = c.game;
    g?.on('gather', (d: { res: Res }) => { if (d?.res) { this.flashT[d.res] = 0.3; this.desk.vessels[d.res].kick(1.2); } });
    g?.on('points', () => { this.cellHot = 2.5; });
    addEventListener('resize', this.onResize);
    this.cssVars();
    this.setMode('explore', true);
  }

  // ------------------------------------------------------------------ the desk's objects
  private hot(h: Hot) { return this.desk.addHot(h); }
  private bindDesk() {
    const d = this.desk, c = this.c, P = d.props, g = () => c.game;
    // ---- MODE selector: click a stop, click the knob to step, scroll it
    this.hot({ obj: d.knob.root, name: 'MODE SELECTOR', key: '1-5', tip: () => `<b>${MODE_NAME[this.mode]}</b>. ${MODES.map((m, i) => `${i + 1} ${MODE_NAME[m]}`).join(' · ')}`,
      click: (h) => { const a = Math.atan2(h.local.x, h.local.y), r = Math.hypot(h.local.x, h.local.y); if (r > 12) { let best = 0, bd = 9; MODES.forEach((_, i) => { const dd = Math.abs(a - (-2 + i) * 34 * Math.PI / 180); if (dd < bd) { bd = dd; best = i; } }); this.setMode(MODES[best]); } else this.setMode(MODES[(MODES.indexOf(this.mode) + 1) % MODES.length]); },
      wheel: (dy) => this.setMode(MODES[Math.max(0, Math.min(4, MODES.indexOf(this.mode) + (dy > 0 ? 1 : -1)))]) });
    // ---- the holds
    for (const r of RES) this.hot({ obj: d.vessels[r].root, name: `${r.toUpperCase()} HOLD`, tip: () => this.resTip(r) });
    this.hot({ obj: d.hull.root, name: 'HULL INTEGRITY', tip: () => { const [a, b] = this.hull(); return `${Math.ceil(a)} / ${Math.round(b)}. Plate Steel adds more. The crashed core patches the hull while Unit 07 stays close to it.`; } });
    this.hot({ obj: d.charge.root, name: 'CHARGE', tip: () => `Gravity energy for the field powers: ${Math.floor(c.hive.res.charge)} / ${c.hive.chargeCap}. Refills by itself; the Gravity Coil and Reactor Bloom hold more. The amber tick is what the chosen power costs.` });
    this.hot({ obj: d.reactor.root, name: 'REACTOR CORE', tip: () => 'It pulses with the charge it holds.', click: () => { d.reactor.hot = 0.8; sfx('pulse', 1.4, 0.3); } });
    // ---- the power drum: grab and flick it, scroll it, click a cartridge; the plunger fires
    const W = this.wheel;
    this.hot({ obj: d.drum.root, name: 'POWER DRUM', key: '[ ]', tip: () => this.powerTip(), wheel: (dy) => W.turn(dy > 0 ? 1 : -1),
      drag: {
        down: () => W.grab(),
        move: (_h, _dx, dy) => { const cv = d.view.canvas, k = cv.getBoundingClientRect().height / d.view.H; W.dragBy(dy / (k * 13 * d.sc * 1.2)); },
        up: () => W.release(),
      },
      click: (h) => {
        // a click on the cartridge in front fires; one above or below turns the drum to it
        const y = h.local.y;
        if (Math.abs(y) < 5) { if (W.trigger()) d.plunger.press(); setTimeout(() => d.plunger.release(), 120); } else W.turn(y > 0 ? -1 : 1);
      } });
    this.hot({ obj: d.plunger.root, name: 'FIRE', key: 'F', tip: () => this.powerTip(), click: () => { d.plunger.press(); setTimeout(() => d.plunger.release(), 140); W.trigger(); } });
    this.hot({ obj: d.readout.mesh, name: 'POWER READOUT', tip: () => this.powerTip() });
    // ---- the skill tree: the cells counter and the blueprint tube on the ledge
    this.hot({ obj: d.cells.root, name: 'CORE CELLS', key: 'K', tip: () => this.skillsTip(), click: () => this.openSkills() });
    this.hot({ obj: d.tube.root, lift: d.tube.body, name: 'BLUEPRINT TUBE · SKILL TREE', key: 'K', tip: () => this.skillsTip(), click: () => { sfx('open', 1.2, 0.5); this.openSkills(); } });
    this.hot({ obj: d.clock.root, name: 'CHRONOMETER', tip: () => { const cl = this.climate; return `Local time on this world. Night brings the hunters out.${cl ? ` Day ${cl.day}, ${SEASON[cl.season].name}.` : ''}`; } });
    this.hot({ obj: d.ground.root, name: 'HELD GROUND', tip: () => `${(c.conquest() * 100).toFixed(1)}% of this region's land is yours. Hold ${Math.round(c.hive.winAt * 100)}% and break every rival heart to take the region.` });
    d.beacons.forEach((b) => this.hot({ obj: b.root, name: 'ALARM BEACON', tip: () => 'Turns when Unit 07 is under attack.' }));
    this.hot({ obj: d.menuLever.root, name: 'PAUSE LEVER · MENU', key: 'ESC', tip: () => 'Stop the survey: the menu, settings, save.', click: () => { d.menuLever.throw(); sfx('click', 0.7, 0.8); setTimeout(() => c.openMenu(), 160); } });
    this.hot({ obj: d.tuckLever.root, name: d.tucked ? 'RAISE THE DESK' : 'TUCK THE DESK AWAY', key: '`', tip: () => 'Lower the whole console for a clean view (or raise it again).', click: () => this.tuck() });
    // ---- BUILD tools
    const fac = () => g()?.factory;
    this.hot({ obj: P.hat.root, lift: P.hat.body, name: 'HARD HAT · WORKS CATALOGUE', key: 'B', tip: () => `Miners, belts, machines, power, storage, land and water works.${g()?.run.skills.has('works') ? '' : '<div class="tip-warn">Unlock Field Works on the skill tree</div>'}`,
      click: () => { const f = fac(); if (!f) return; if (!f.build.active && !g()?.run.skills.has('works')) { sfx('deny'); this.tray('Buy <b>Field Works</b> on the skill tree to open the catalogue', 'warn'); return; } f.build.toggle(); } });
    this.hot({ obj: P.tin.root, lift: P.tin.body, name: 'PAINT TIN · ASSEMBLY BAY', key: 'V', tip: () => 'Refit Unit 07: paint, plating, lens and name.', click: () => c.openMirror() });
    this.hot({ obj: P.clip.root, lift: P.clip.body, name: 'CLIPBOARD · PRODUCTION REPORT', key: 'O', tip: () => 'Items made and used per minute, the power grids, and the machines holding the line up.', click: () => fac()?.ui.toggleStats() });
    this.hot({ obj: P.radio.root, lift: P.radio.body, name: 'HANDSET · CREW ROSTER', key: 'N', tip: () => 'Your workers: jobs, appetites, moods. Assign them to haul, operate, mine, forage or keep a pen.', click: () => fac()?.ui.toggleCrew() });
    this.hot({ obj: d.works.root, name: 'WORKS METER', tip: () => { const f = fac(); if (!f) return ''; const p = f.power(); return `Power ${Math.round(p.demand)} of ${Math.round(p.cap)} MW on ${p.grids} grid${p.grids === 1 ? '' : 's'}. ${f.buildings.length} structures, ${f.workers.active.length} workers on jobs.`; }, click: () => fac()?.ui.toggleStats() });
    this.hot({ obj: P.bobble.root, lift: P.bobble.body, name: 'DR. CALDER (BOBBLEHEAD)', tip: () => 'Corps issue, 1957. He nods at everything.', click: () => { P.bobble.bob(); sfx('call', 1.6, 0.25); } });
    this.hot({ obj: P.mug.root, lift: P.mug.body, name: 'COFFEE', tip: () => 'Calder\'s. Long cold.', click: () => { P.mug.jostle(3); sfx('squelch', 1.8, 0.25); } });
    // ---- COMMAND
    this.hot({ obj: d.table.root, name: 'HOLO TABLE', tip: () => 'The region in relief. Click to look there, right-click to send the selected units, drag to tilt it.',
      drag: { move: (_h, dx, dy) => { d.table.yawT += dx * 0.012; d.table.pitchT = Math.max(-0.25, Math.min(0.35, d.table.pitchT + dy * 0.006)); } },
      click: (h) => this.tableClick(h.point, 0), alt: (h) => this.tableClick(h.point, 2) });
    this.hot({ obj: d.crt.root, name: 'TELEMETRY', tip: () => 'Unit 07 and whatever it has linked. The knobs set GAIN and TUNE (green or amber tubes).' });
    this.hot({ obj: d.crt.knobs[0], name: 'GAIN', tip: () => 'Phosphor brightness for every screen on the console. Drag or scroll.', wheel: (dy) => crtSettings.setGain(crtSettings.gain - Math.sign(dy) * 0.08),
      drag: { move: (_h, dx, dy) => crtSettings.setGain(crtSettings.gain + (dx - dy) * 0.006) }, click: () => crtSettings.setGain(crtSettings.gain >= 0.95 ? 0.2 : crtSettings.gain + 0.2) });
    this.hot({ obj: d.crt.knobs[1], name: 'TUNE', tip: () => 'Swap the tubes: green P1 phosphor or amber P3.', click: () => { crtSettings.setTint(crtSettings.tint >= 0.5 ? 0 : 1); sfx('click', 0.8, 0.5); }, wheel: () => crtSettings.setTint(crtSettings.tint >= 0.5 ? 0 : 1) });
    this.hot({ obj: P.crate.root, lift: P.crate.body, name: 'AMMO CRATE · ORDNANCE BENCH', key: 'F2', tip: () => 'Design weapons from parts (frame, power, barrel, ammo), then issue them to Unit 07, robots and engineered creatures.', click: () => this.openBench() });
    this.hot({ obj: P.horn.root, lift: P.horn.body, name: 'RALLY HORN', key: 'G', tip: () => 'Allies rally to Unit 07 and follow it; blow again to release them.', click: () => this.rally() });
    this.hot({ obj: P.boom.root, lift: P.boom.body, name: P.boom.open ? 'SELF-DESTRUCT' : 'GUARDED SWITCH', tip: () => 'Corps standard. Lift the guard first.', click: (h) => this.selfDestruct(h.local) });
    // ---- BIO
    this.hot({ obj: P.jar.root, lift: P.jar.body, name: 'SPECIMEN JAR · BIOWORKS LEDGER', key: 'J', tip: () => 'Production per minute, upkeep, every producer, plant works, vats and habitats.', click: () => this.ledger() });
    this.hot({ obj: P.scope.root, lift: P.scope.body, name: 'MICROSCOPE · GENE LAB', key: 'L', tip: () => 'Put an absorbed species in the tank and rebuild it limb by limb.', click: () => this.openLab() });
    this.hot({ obj: P.scroll.root, lift: P.scroll.body, name: 'FAMILY TREE', key: 'T', tip: () => 'Every species you have met, made or watched branch off.', click: () => c.openTree() });
    this.hot({ obj: P.die.root, lift: P.die.body, name: 'LUCKY DIE', tip: () => 'Corps regulations forbid it.', click: () => { const n = P.die.roll(); sfx('crack', 1.6, 0.3); setTimeout(() => { sfx('hit', 1.4, 0.3); this.tray(`The die says <b>${n}</b>.`); }, 900); } });
    this.hot({ obj: P.fan.root, lift: P.fan.body, name: 'DESK FAN', tip: () => 'Three speeds and off.', click: () => { P.fan.speed = (P.fan.speed + 1) % 4; sfx('click', 1.3, 0.4); } });
    // ---- SURVEY
    for (const lens of [P.lens, P.lens2]) this.hot({ obj: lens.root, lift: lens.body, name: 'MAGNIFIER · HABITAT OVERLAY', key: 'H', tip: () => 'Moisture, fertility, life and danger inked over the ground. Each click shows the next layer, then off.', click: () => this.eco()?.cycleOverlay() });
    this.hot({ obj: P.bino.root, lift: P.bino.body, name: 'BINOCULARS · FIELD SURVEY', key: 'M', tip: () => 'The census sheet: the season, the water, every species\' numbers and how they are doing.', click: () => this.eco()?.toggleSurvey() });
    this.hot({ obj: d.orrery.root, name: 'ORRERY · ALMANAC', tip: () => this.almanacTip(), click: () => sfx('click', 1.5, 0.3) });
    this.hot({ obj: P.cal.root, lift: P.cal.body, name: 'CALENDAR', tip: () => this.almanacTip(), click: () => { P.cal.jostle(3); sfx('click', 1.8, 0.3); } });
  }

  // ------------------------------------------------------------------ modes
  /** switch the presentation: the desk reconfigures, the mode's panels open, the last mode's close */
  setMode(m: Mode, quiet = false, follow = false) {
    const prev = this.mode;
    if (m === prev && !quiet) return;
    this.mode = m;
    this.desk.setMode(m);
    if (!quiet) { sfx('click', 0.6, 0.9); sfx('crack', 0.5, 0.3); this.desk.knob.kick(); }
    FLOAT.quiet = m === 'explore';
    document.body.dataset.deskMode = m;
    const g = this.c.game, f = g?.factory, ev = this.eco(), bio = this.bio();
    // each mode shows only its own panels: everything that belongs to another mode closes
    if (f) {
      if (m !== 'build' && f.build.active) f.build.toggle();
      if (m !== 'build' && f.ui.showStats) f.ui.toggleStats();
      if (m !== 'build' && f.ui.showCrew) f.ui.toggleCrew();
    }
    if (m !== 'bio' && bio?.ledgerOpen) bio.toggleLedger(false);
    if (m !== 'survey' && document.querySelector('.eco-sheet')) ev?.toggleSurvey(false);
    if (m !== 'bio' && m !== 'survey' && ev && ev.mode !== 'off') ev.setOverlay('off');
    // and the mode brings its own up (unless a panel's own key brought us here)
    if (!follow) {
      if (m === 'build' && f && !f.build.active) { if (g?.run.skills.has('works')) f.build.toggle(); else if (!quiet) this.tray('Buy <b>Field Works</b> on the skill tree to open the catalogue', 'warn'); }
      if (m === 'bio' && bio && !bio.ledgerOpen) bio.toggleLedger(true);
      if (m === 'bio' && ev) ev.setOverlay('life');
      if (m === 'survey' && ev) ev.setOverlay('water');
    }
    this.desk.table.scan = m === 'survey' ? 1 : 0.3;
    if (m === 'command') this.crtPaint();
    this.mapT = 0;
    this.panels = this.panelState();
    this.cssVars();
  }
  /** which panels are open now (a panel opened by its own key pulls the desk into its mode) */
  private panels: Record<string, boolean> = {};
  private panelState(): Record<string, boolean> {
    const f = this.c.game?.factory, ev = this.eco(), bio = this.bio();
    return { cat: !!f?.build.active, stats: !!f?.ui.showStats, crew: !!f?.ui.showCrew, ledger: !!bio?.ledgerOpen, sheet: !!document.querySelector('.eco-sheet'), overlay: !!ev && !!ev.mode && ev.mode !== 'off' };
  }
  private followPanels() {
    const now = this.panelState(), was = this.panels;
    const home: Record<string, Mode> = { cat: 'build', stats: 'build', crew: 'build', ledger: 'bio', sheet: 'survey', overlay: this.mode === 'bio' ? 'bio' : 'survey' };
    for (const k of Object.keys(now)) if (now[k] && !was[k] && home[k] !== this.mode) { this.setMode(home[k], false, true); return; }
    this.panels = now;
  }
  /** Esc: back to EXPLORE (true when that was something to do) */
  escape() { if (this.desk.tucked) { this.tuck(); return true; } if (this.mode !== 'explore') { this.setMode('explore'); return true; } return false; }
  private tuck() { const d = this.desk; d.tucked = !d.tucked; d.tuckLever.on = d.tucked; d.tuckLever.throw(); sfx(d.tucked ? 'close' : 'open', 0.8, 0.6); }

  // ------------------------------------------------------------------ keys
  /** keys the console owns; true when used */
  key(k: string) {
    const n = '12345'.indexOf(k);
    if (n >= 0 && k.length === 1) {
      // a building's own numbered commands (the brood's gestation list) keep their keys
      if (!this.c.commands().some((cm) => cm && cm.key === k && !isAbilityCmd(cm))) { this.setMode(this.mode === MODES[n] && n > 0 ? 'explore' : MODES[n]); return true; }
    }
    if (k === '`') { this.tuck(); return true; }
    if (k === 'k') { this.openSkills(); return true; }
    if (k === 'b' && this.c.game?.factory) { this.buildToggle(); return true; }
    if (k === 'l' && this.c.game?.menu !== 'build') { this.openLab(); return true; }
    if (k === 'g') { this.rally(); return true; }
    return this.wheel.key(k);
  }
  /** B: the works catalogue (and the BUILD desk with it) */
  private buildToggle() {
    const g = this.c.game, f = g?.factory; if (!g || !f) return;
    if (!f.build.active && !g.run.skills.has('works')) { sfx('deny'); this.tray('Buy <b>Field Works</b> on the skill tree to open the catalogue', 'warn'); return; }
    if (f.build.active) { f.build.toggle(); if (this.mode === 'build') this.setMode('explore'); }
    else { if (this.mode !== 'build') this.setMode('build'); if (!f.build.active) f.build.toggle(); }
  }
  private openSkills() { const g = this.c.game, f = g?.opts.hooks?.openSkills; if (g && f) f(g); else this.tray('The skill tree is not connected', 'warn'); }
  private openLab() { const g = this.c.game, f = g?.opts.hooks?.openLab; if (g && f) f(g); else this.c.openBuilder(); }
  private openBench() { const g = this.c.game; if (g && g.engine.screen === g) import('../robots/weapons/bench').then((m) => m.openBench(g.engine, g)); }
  private ledger() { const b = this.bio(); if (b) b.toggleLedger(); else this.tray('The bioworks are not running here', 'warn'); }
  private rally() {
    const h = this.c.hive, why = h.rally();
    this.desk.props.horn.jostle(2);
    if (why) { sfx('deny'); this.tray(why, 'warn'); } else { sfx('call', 0.5, 0.6); this.tray(h.follow ? 'ALLIES RALLY TO UNIT 07 &middot; [G] TO RELEASE' : 'ALLIES RELEASED: THEY ROAM AND CLAIM GROUND', 'good'); }
  }
  private selfDestruct(local: THREE.Vector3) {
    const b = this.desk.props.boom;
    if (!b.open || local.z < -3) { b.toggleGuard(); sfx('click', 0.7, 0.6); return; }
    b.press(); sfx('deny'); sfx('hit', 0.6, 0.4);
    const lines = ['SELF-DESTRUCT REFUSED. UNIT 07 HAS A LOT TO LIVE FOR.', 'REQUEST DENIED BY THE UNIT. IT WOULD RATHER NOT.', 'SELF-DESTRUCT: NO. (THE UNIT HAS FILED A COMPLAINT.)'];
    this.tray(lines[Math.floor(Math.random() * lines.length)], 'warn');
    setTimeout(() => { if (b.open) b.toggleGuard(); }, 2600);
  }
  private eco() { return (this.c.game as unknown as { ecoView?: EcoV } | undefined)?.ecoView ?? null; }
  private bio() { return (this.c.game as unknown as { bioUI?: BioU } | undefined)?.bioUI ?? null; }
  /** the message tray: one compact line at a time (kit's toast, kept from piling up by style.css) */
  private tray(html: string, kind: 'info' | 'warn' | 'good' = 'info') { toast(html, kind, 2200); }

  // ------------------------------------------------------------------ tips
  private points() { return this.c.game?.run.skills.points ?? 0; }
  private buyable() { const run = this.c.game?.run; if (!run) return []; return SKILLS.filter((s) => !run.skills.why(s.id, run.res)); }
  private skillsTip() { const n = this.points(), b = this.buyable(); return `Build Unit 07 up, part by part, power by power. ${n} core cell${n === 1 ? '' : 's'} to spend.${b.length ? ` Ready now: ${b.slice(0, 4).map((s) => s.name).join(', ')}${b.length > 4 ? '…' : ''}` : ''}`; }
  private resTip(r: Res) { const run = this.c.game?.run, h = this.c.hive; return `${Math.floor(run?.res[r] ?? 0)} / ${h.cap(r)} in the hold. ${SOURCE[r]}`; }
  private powerTip() {
    const a = this.wheel.current; if (!a) return 'No field powers installed: buy Telekinesis, Gravity Slam, Repulse and the rest on the skill tree to load the drum.';
    const d = ABILITIES[a], why = this.c.hive.can(a);
    return `<b>${d.name}</b> [${d.key}]: ${d.desc.replace(/<[^>]+>/g, '')}${why ? `<div class="tip-warn">${why}</div>` : ''}<div class="sub">Drag or scroll the drum to choose; the plunger or F arms it.</div>`;
  }
  private almanacTip() {
    const c = this.climate; if (!c) return 'The planet, its sun and its two moons.';
    const S = SEASON[c.season], next = (s: Parameters<Climate['until']>[0]) => Math.ceil(c.until(s) / c.dayLength);
    return `Year ${c.year}, day ${c.day}: <b>${S.name}</b> (${Math.round(c.seasonT * 100)}% through). ${Math.round(c.temp)}°C, ${c.weather}. Eclipse in ${next('eclipse')} days · bloodtide in ${next('bloodtide')} days.`;
  }
  private hull(): [number, number] {
    const pl = this.c.game?.player as any, ch = this.c.game?.child as any, h = this.c.hive;
    if (pl && typeof pl.hull === 'number') return [pl.hull, pl.hullMax || h.hullMax];
    if (ch && typeof ch.hp === 'number') return [ch.hp, ch.maxHp ?? ch.hpMax ?? ch.hullMax ?? h.hullMax];
    return [h.hull, h.hullMax];
  }

  // ------------------------------------------------------------------ per frame
  update(dt: number) {
    this.t += dt;
    const c = this.c, h = c.hive, d = this.desk, run = c.game?.run;
    for (const r of RES) if (this.flashT[r] > 0) this.flashT[r] -= dt;
    this.cellHot = Math.max(0, this.cellHot - dt);
    this.wheel.update(dt);
    if (this.wheel.ticks) d.drum.tick();
    // ---- the drum and its readout
    if (d.drum.root.userData.load !== this.wheel.loadN) { d.drum.root.userData.load = this.wheel.loadN; d.drum.load(this.wheel.order.map((a) => this.wheel.icon(a))); }
    d.drum.update(dt, this.wheel.ang, this.wheel.states(this.t));
    const armed = c.armed?.() ?? null, cur = this.wheel.current, why = cur ? h.can(cur) : 'none';
    d.plunger.update(dt, armed && armed === cur ? 'armed' : why ? 'dead' : 'idle', this.t);
    this.readout();
    // ---- gauges
    const cap = Math.max(1, h.chargeCap);
    d.charge.set(h.res.charge / cap); d.charge.setMark(cur && ABILITIES[cur].charge ? Math.min(1, powerCost(cur) / cap) : null);
    d.reactor.level = Math.min(1, h.res.charge / cap);
    const [hp, hm] = this.hull(), hf = Math.max(0, Math.min(1, hp / Math.max(1, hm)));
    d.hull.set(hf);
    if (this.lastHull >= 0 && hp < this.lastHull - 0.5) { const k = Math.min(3, (this.lastHull - hp) / Math.max(10, hm * 0.05)); d.jostle(0.6 + k); this.alarmT = 4; }
    this.lastHull = hp;
    this.alarmT = Math.max(0, this.alarmT - dt);
    const shake = (c.cam as unknown as { shakeT?: number; shakeA?: number });
    if ((shake.shakeT ?? 0) > 0.05 && Math.random() < dt * 8) d.jostle(Math.min(2, (shake.shakeA ?? 0.3) * 2));
    for (const b of d.beacons) b.on = this.alarmT > 0 || hf < 0.25 ? 1 : 0;
    if ((this.slow -= dt) <= 0) { this.slow = 0.125; this.slowUpdate(hp, hm, hf); }
    // ---- the wings' instruments
    if (d.mode === 'command' || d.mode === 'survey') this.tableUpdate(dt);
    if ((this.crtT -= dt) <= 0) { this.crtT = 0.25; if (d.mode === 'command') this.crtPaint(); }
    this.selection();
    // ---- touch: the thumb pads on the desk mirror the touch controls (and their hit areas sit over the pads)
    const tc = (c.game?.player as unknown as { touch?: { active: boolean; dock: (a: unknown, z: unknown) => void; state(): Desk['padState'] } } | undefined)?.touch;
    if (tc) {
      d.setTouch(tc.active);
      d.padState = tc.active ? tc.state() : null;
      if (tc.active && (this.dockT -= dt) <= 0) { this.dockT = 0.5; const pd = d.padDock(); if (pd) tc.dock(pd.at, pd.zone); }
    }
    // ---- hover tag
    this.tagUpdate(dt);
    d.update(dt);
    d.render();
    void run;
  }
  private slowUpdate(hp: number, hm: number, hf: number) {
    const c = this.c, h = c.hive, d = this.desk, run = c.game?.run;
    h.countUnits();
    // the centre console stays out of the way while a genome is being taken apart
    const fold = !!document.querySelector('.harvest');
    this.root.classList.toggle('fold', fold);
    for (const r of RES) {
      const v = run?.res[r] ?? 0, cap = h.cap(r), f = v / cap;
      d.resCount[r].set(v); d.vessels[r].set(f);
      const cp = d.resCap[r], key = '/' + cap;
      if (cp.key !== key) { cp.key = key; cp.clear(); text3s(cp.p, key, Math.round((18 - textW3s(key)) / 2), 0, R.bone[3], R.ink[0]); cp.flush(); }
      const lm = d.resLamp[r]; lm.col = f >= 0.999 ? R.stampRed[3] : f >= 0.85 ? R.glowAmber[3] : R.glowTeal[3]; lm.state = f >= 0.999 ? 'blink' : this.flashT[r] > 0 ? 'on' : f >= 0.85 ? 'on' : 'off';
    }
    this.plate(d.hullTxt, `${Math.ceil(hp)}/${Math.round(hm)}`, hf < 0.3 ? R.stampRed[3] : R.bone[4]);
    this.plate(d.chgTxt, `${Math.floor(h.res.charge)}/${h.chargeCap}`, R.bone[4]);
    const pts = this.points(), ready = this.buyable().length > 0;
    d.cells.set(pts);
    d.cellLamp.state = this.cellHot > 0 ? 'fast' : pts > 0 ? (ready ? 'blink' : 'on') : 'off';
    const dd = c.world.day, hh = Math.floor(dd * 24), mi = Math.floor((dd * 24 - hh) * 60);
    d.clock.set(hh * 100 + mi);
    d.ground.set(Math.floor(c.conquest() * 100));
    // works meter
    const fac = c.game?.factory;
    if (fac) {
      const pw = fac.power(), load = pw.cap ? pw.demand / pw.cap : 0;
      d.works.gauge.set(Math.min(1, load));
      let st = 0; for (const v of Object.values(fac.inventory)) st += v;
      d.works.store.set(st); d.works.crew.set(fac.workers.active.length);
      const bad = fac.buildings.some((b) => b.status === 'nopower');
      d.works.lamp.state = bad || load > 0.95 ? 'blink' : pw.demand > 0 ? 'on' : 'off';
    }
    this.cssVars();
    this.followPanels();
    // the mode knob's window and lamps
    d.knob.show(MODES.indexOf(this.mode), MODE_NAME[this.mode], this.t);
    // the tools that are open burn a little
    const ev = this.eco(), bio = this.bio(), P = d.props;
    const glow = (p: { body: THREE.Object3D }, on: boolean) => p.body.traverse((o) => { const m = (o as THREE.Mesh).material as any; if (m?.uniforms?.uGlow) m.uniforms.uGlow.value.setRGB(on ? 0.12 : 0, on ? 0.1 : 0, on ? 0.04 : 0); });
    glow(P.hat, !!fac?.build.active); glow(P.clip, !!fac?.ui.showStats); glow(P.radio, !!fac?.ui.showCrew);
    glow(P.jar, !!bio?.ledgerOpen); glow(P.bino, !!document.querySelector('.eco-sheet')); glow(P.lens, !!ev && ev.mode !== 'off'); glow(P.lens2, !!ev && ev.mode !== 'off');
    void hm;
  }
  /** a small engraved readout under a gauge */
  private plate(ld: { p: Pix; key: string; clear(c?: number): void; flush(): void }, s: string, col: number) {
    const key = s + col; if (ld.key === key) return; ld.key = key;
    ld.clear(); text3s(ld.p, s, Math.round((30 - textW3s(s)) / 2), 1, col, R.ink[0]); ld.flush();
  }
  /** the power readout: two lines of amber VFD under the drum's hood */
  private readout() {
    const [a, b, st] = this.wheel.lines(), ro = this.desk.readout;
    const key = a + '|' + b + st + (st === 'arm' ? Math.floor(this.t * 3) % 2 : '');
    if (ro.key === key) return; ro.key = key;
    ro.clear(R.ink[0]);
    const ink = st === 'bad' ? R.stampRed[3] : st === 'arm' ? (Math.floor(this.t * 3) % 2 ? R.glowAmber[4] : R.glowAmber[2]) : st === 'wait' ? R.glowAmber[2] : R.glowAmber[3];
    text3s(ro.p, a.slice(0, 16), 2, 2, R.glowAmber[4]);
    text3s(ro.p, b.slice(0, 16), 2, 9, ink);
    ro.flush();
  }

  // ------------------------------------------------------------------ holo table
  private tableUpdate(dt: number) {
    const c = this.c, w = c.world, Rg = w.region, N = Rg.N, d = this.desk, vis = c.vision.vis, seen = c.vision.seen;
    const data = {
      N, h: Rg.h as unknown as Float32Array, water: Rg.water,
      cell: (i: number) => {
        if (!seen[i]) return R.ink[1];
        const wet = Rg.h[i] < Rg.water, dim = !vis[i];
        if (wet) return dim ? R.water[1] : R.water[3];
        if (w.moss[i] > 0.5) return dim ? R.malachite[3] : R.malachite[5];
        if (w.creep[i] > 0.5) return dim ? R.glowAmber[1] : R.glowAmber[3];
        const hh = Math.max(0, Math.min(3, Math.floor((Rg.h[i] - Rg.water) / 3)));
        return R.glowTeal[Math.max(0, hh - (dim ? 1 : 0))];
      },
    };
    this.mapT -= dt;
    if (this.mapBuilt <= 0) { d.table.build(data); this.mapBuilt = 8; } else this.mapBuilt -= dt;
    if (this.mapT > 0) return;
    this.mapT = 0.3;
    d.table.recolour(data);
    const pins: [number, number, number, number][] = [];
    const gp = c.hive.golem(); if (gp) pins.push([gp.x, gp.z, R.snow[5], 1.8]);
    for (const hv of w.hives) for (const b of hv.buildings) if (b.visibleNow) pins.push([b.x, b.z, hv.faction === 'veyr' ? R.glowTeal[4] : R.stampRed[3], b.def.kind === 'core' ? 1.8 : 1.1]);
    const fac = c.game?.factions;
    if (fac) for (const st of fac.structures) { if (st.dead) continue; const i = Math.floor(st.z) * N + Math.floor(st.x); if (seen[i]) pins.push([st.x, st.z, R.stampRed[3], st.kind === 'lander' ? 2 : 1.2]); }
    for (const u of (c.game?.robots ?? []) as { x: number; z: number; dead: boolean; faction: string }[]) { if (u.dead) continue; const i = Math.floor(u.z) * N + Math.floor(u.x); if (vis[i]) pins.push([u.x, u.z, u.faction === 'veyr' ? R.bone[4] : R.coral[4], 0.8]); }
    let n = 0;
    for (const cr of w.creatures) {
      if (cr.dead || !cr.visibleNow || n > 110) continue; n++;
      const hostile = cr.faction === 'rival' || (cr.faction === 'wild' && cr.diet === 'carn');
      pins.push([cr.x, cr.z, cr.faction === 'veyr' ? R.bone[5] : hostile ? R.coral[4] : R.straw[4], cr.size > 1.5 ? 0.9 : 0.6]);
    }
    d.table.setPins(N, pins);
    const cam = c.cam, t = cam.target, hw = cam.dist * 0.62, hd = cam.dist * 0.42, sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
    d.table.setFoot(N, [[-hw, -hd * 1.4], [hw, -hd * 1.4], [hw * 0.7, hd], [-hw * 0.7, hd]].map(([x, z]) => [t.x + x * cy + z * sy, t.z - x * sy + z * cy]) as [number, number][]);
  }
  private tableClick(p: THREE.Vector3, button: number) {
    const d = this.desk, N = this.c.world.region.N;
    const lp = d.table.relief.worldToLocal(p.clone());
    const [x, z] = d.table.toRegion(N, lp);
    if (x < 0 || z < 0 || x >= N || z >= N) return;
    d.table.pingAt(lp);
    this.c.minimap(x, z, button);
    sfx(button === 2 ? 'call' : 'click', button === 2 ? 0.8 : 1.6, 0.4);
  }

  // ------------------------------------------------------------------ telemetry CRT
  private crtPaint() {
    const d = this.desk, crt = d.crt, p = crt.scr.p, c = this.c, h = c.hive, run = c.game?.run;
    crt.amber = crtSettings.tint >= 0.5; crt.gain = crtSettings.gain;
    crt.scr.clear(crt.bg());
    const I = (i: number) => crt.ink(i);
    let y = 2;
    const line = (s: string, col = I(3)) => { text3s(p, s.slice(0, 22), 3, y, col); y += 7; };
    const sel = c.sel(), sb = c.selB();
    if (sel.length > 1) {
      text5(p, `${sel.length} LINKED`, 3, y, I(4)); y += 10;
      for (const s of sel.slice(0, 4)) line(`${s.sp.name.slice(0, 14).toUpperCase()} ${Math.round((s.hp / s.maxHp) * 100)}%`);
    } else if (sel.length === 1 || sb) {
      const nm = sb ? sb.def.name : sel[0].sp.name;
      text5(p, nm.toUpperCase().slice(0, 14), 3, y, I(4)); y += 10;
      if (sb) { line(`HULL ${Math.ceil(sb.hp)}/${sb.maxHp}`); line(sb.done ? 'NOMINAL' : `GROWING ${Math.floor(sb.progress * 100)}%`); }
      else { const s = sel[0]; line(`HP ${Math.ceil(s.hp)}/${Math.ceil(s.maxHp)}`); line(s.dead ? 'DEAD' : MIND[s.mind] ?? s.mind.toUpperCase()); line(`${Math.round(s.energy * 100)}% FED`, I(2)); }
    } else {
      const parts = ['head', 'torso', 'armR', 'armL', 'coil', 'plating1', 'plating2', 'reactor'].filter((id) => run?.skills.has(id));
      text5(p, 'UNIT 07', 3, y, I(4)); y += 10;
      const [hp, hm] = this.hull();
      line((parts.length ? SKILL[parts[parts.length - 1]].name : 'SURVEY HEAD').toUpperCase(), I(2));
      line(`HULL ${Math.round((hp / Math.max(1, hm)) * 100)}% GND ${(c.conquest() * 100).toFixed(1)}%`);
      line(`ALLIES ${h.allyCount()}/${h.allyCap()} HOLD ${h.cap('ore')}`);
      const hint = this.hint(); const words = hint.split(' '); let ln = '';
      for (const w of words) { if ((ln + ' ' + w).trim().length > 22) { line(ln, I(2)); ln = w; } else ln = (ln + ' ' + w).trim(); if (y > 40) break; }
      if (ln && y <= 40) line(ln + (Math.floor(this.t * 2) % 2 ? '_' : ''), I(2));
    }
    crt.scanBand(p, this.t);
    crt.scr.flush();
  }
  private hint() {
    const run = this.c.game?.run, h = this.c.hive;
    if (!run) return 'STANDING BY.';
    const S = run.skills, b = this.buyable();
    if (b.length && S.points > 0) return `CORE CELLS READY: OPEN THE BLUEPRINTS [K]. NEXT: ${b[0].name.toUpperCase()}.`;
    if (S.owned.size <= 1) return 'FLY CLOSE TO NUGGETS, HUSKS, DEW AND CLODS: THE FIELD PULLS THEM IN.';
    if (!S.has('graft')) return 'EVERY LOAD GATHERED EARNS CORE CELLS. PLANT GRAFT CLAIMS GROUND.';
    if (h.territory() < 0.05) return 'GRAFT PLANTS [E] TO CLAIM THE GROUND AROUND THEM.';
    if (S.has('command') && h.allyCount() && !h.follow) return '[G] RALLIES YOUR ALLIES. RIGHT-CLICK THE TABLE TO SEND THEM.';
    return `HOLD ${Math.round(h.winAt * 100)}% OF THE LAND AND BREAK EVERY RIVAL HEART.`;
  }

  // ------------------------------------------------------------------ the inspection clipboard
  private selection() {
    const c = this.c, sel = c.sel(), sb = c.selB(), d = this.desk, bd = d.board;
    const has = !!sb || sel.length > 0;
    bd.shown = has && !d.tucked;
    if (!has) { this.selKey = '-'; return; }
    // the action keys (the old command bank, minus the powers: those live on the drum)
    const ck = c.ctxKey();
    if (ck !== this.cmdKey) {
      this.cmdKey = ck;
      this.cmds = c.commands().filter((x) => x && !isAbilityCmd(x)).slice(0, 7);
      for (const hk of this.keyHots) this.removeHot(hk);
      bd.setKeys(this.cmds.map((cm, i) => ({ id: String(i), icon: cm.icon, key: cm.key })));
      this.keyHots = bd.keys.map((k, i) => {
        const cm = this.cmds[i];
        return this.hot({ obj: k.root, name: cm.name.toUpperCase(), key: cm.key === 'Escape' ? 'ESC' : cm.key, tip: () => cm.tip(), off: () => cm.disabled?.() ?? false,
          click: () => { k.sp.kick(-40); const why = cm.disabled?.(); if (why) { sfx('deny'); this.tray(String(why), 'warn'); } else { sfx('click'); cm.run(); } } });
      });
    }
    bd.keys.forEach((k, i) => { const cm = this.cmds[i]; if (!cm) return; k.dim = !!cm.disabled?.(); k.act = !!cm.active?.(); });
    // the paper: redrawn when what it shows changes (bars update twice a second)
    const key = (sb ? 'b' + sb.id + (sb.done ? 'd' : 'g') + sb.queue.join(',') : sel.map((s) => s.id).join(',')) + '|' + Math.floor(this.t * 2);
    if (key === this.selKey) return;
    this.selKey = key;
    const pp = bd.paper, p = pp.p, W = p.w;
    pp.clear(R.paper[5]);
    for (let y = 14; y < p.h; y += 7) p.hl(1, W - 2, y, R.sky[4]);
    p.vl(8, 0, p.h - 1, R.coral[5]);
    const ink = R.ink[2], bar = (x: number, y: number, w: number, f: number, col: number) => { p.rect(x, y, w, 4, R.paper[3]); p.rect(x, y, Math.round(w * Math.max(0, Math.min(1, f))), 4, col); p.hl(x, x + w - 1, y + 4, R.paper[2]); };
    if (sb) {
      text5(p, sb.def.name.toUpperCase().slice(0, 18), 12, 3, ink);
      text3s(p, sb.faction === 'veyr' ? 'YOURS' : 'A RIVAL STRUCTURE', 12, 16, sb.faction === 'veyr' ? R.malachite[2] : R.stampRed[3]);
      bar(12, 25, 70, sb.hp / sb.maxHp, R.malachite[3]); text3s(p, `${Math.ceil(sb.hp)}/${sb.maxHp}`, 86, 24, ink);
      const pr = !sb.done ? sb.progress : 1;
      bar(12, 33, 70, pr, R.ochre[4]); text3s(p, sb.done ? 'NOMINAL' : `${Math.floor(pr * 100)}%`, 86, 32, ink);
      this.wrap(p, sb.faction === 'veyr' ? sb.def.desc : '', 12, 44, W - 16, ink);
    } else if (sel.length === 1) {
      const s = sel[0];
      const th = this.thumbPix(s.sp);
      if (th) p.blit(th, W - th.w - 3, 2);
      text5(p, s.sp.name.toUpperCase().slice(0, 16), 12, 3, ink);
      const owner = s.faction === 'veyr' ? 'ALLY' : s.faction === 'rival' ? 'RIVAL' : s.diet === 'carn' ? 'PREDATOR' : s.diet === 'herb' ? 'GRAZER' : s.diet === 'scav' ? 'SCAVENGER' : 'OMNIVORE';
      text3s(p, `${owner} · ${s.dead ? 'DEAD' : MIND[s.mind] ?? s.mind.toUpperCase()}`, 12, 16, s.faction === 'veyr' ? R.malachite[2] : s.faction === 'rival' ? R.stampRed[3] : R.ochre[2]);
      bar(12, 25, 60, s.hp / s.maxHp, R.malachite[3]); text3s(p, `${Math.ceil(s.hp)}/${Math.ceil(s.maxHp)}`, 76, 24, ink);
      bar(12, 33, 60, s.energy, R.ochre[4]); text3s(p, `${Math.round(s.energy * 100)}% FED`, 76, 32, ink);
      const st = s.st;
      text3s(p, `ATK ${st.attack.toFixed(0)}  ARM ${Math.round(st.armor * 100)}%  SPD ${st.speed.toFixed(1)}  ${Math.round(s.mass)}KG`, 12, 42, ink);
      text3s(p, s.sp.design.latin.toUpperCase().slice(0, 30), 12, 51, R.ink[1]);
      text3s(p, `${s.sp.design.genes.length} GENES`, 12, 60, R.ink[1]);
    } else {
      text5(p, `${sel.length} UNITS LINKED`, 12, 3, ink);
      sel.slice(0, 12).forEach((s, i) => {
        const x = 12 + (i % 4) * 30, y = 16 + Math.floor(i / 4) * 16, th = this.thumbPix(s.sp, 14);
        if (th) p.blit(th, x, y);
        bar(x + 15, y + 5, 12, s.hp / s.maxHp, R.malachite[3]);
      });
    }
    pp.flush();
  }
  private wrap(p: Pix, s: string, x: number, y: number, w: number, col: number) {
    let ln = '';
    for (const word of s.toUpperCase().split(' ')) { if (textW3s((ln + ' ' + word).trim()) > w) { text3s(p, ln, x, y, col); y += 7; ln = word; if (y > p.h - 6) return; } else ln = (ln + ' ' + word).trim(); }
    if (ln && y <= p.h - 6) text3s(p, ln, x, y, col);
  }
  /** a species portrait from the thumbnail renderer, shrunk to fit and snapped in for the clipboard */
  private thumbPix(sp: { name: string } & object, size = 24): Pix | null {
    const k = sp.name + size;
    if (this.thumbs.has(k)) return this.thumbs.get(k)!;
    this.thumbs.set(k, null);
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
      const g = cv.getContext('2d')!; g.imageSmoothingEnabled = false;
      const s = Math.min(size / img.width, size / img.height);
      g.drawImage(img, (size - img.width * s) / 2, (size - img.height * s) / 2, img.width * s, img.height * s);
      const d = g.getImageData(0, 0, size, size).data, p = new Pix(size, size);
      for (let i = 0; i < size * size; i++) if (d[i * 4 + 3] > 120) p.set(i % size, Math.floor(i / size), (d[i * 4] << 16) | (d[i * 4 + 1] << 8) | d[i * 4 + 2]);
      this.thumbs.set(k, p); this.selKey = '-';
    };
    try { img.src = thumb(sp as never); } catch { /* no renderer */ }
    return null;
  }
  private removeHot(h: Hot) { const i = this.desk.hots.indexOf(h); if (i >= 0) this.desk.hots.splice(i, 1); if (this.desk.hover === h) this.desk.hover = null; }

  // ------------------------------------------------------------------ the hover tag
  private tagUpdate(dt: number) {
    const h = this.tagHot, tg = this.tag;
    if (!h || this.desk.tucked && h.obj !== this.desk.tuckLever.root) { if (tg.style.display !== 'none') tg.style.display = 'none'; return; }
    this.tagT += dt;
    const off = h.off?.();
    const name = h.name + (h.key ? ` [${h.key}]` : ''), n = Math.min(name.length, Math.floor(this.tagT * 70));
    const tip = this.tagT > 0.25 ? (h.tip?.() ?? '') : '';
    const html = `<div class="tg-n">${name.slice(0, n)}${n < name.length ? '<span class="cur">_</span>' : ''}</div>${tip ? `<div class="tg-t">${tip}</div>` : ''}${off ? `<div class="tg-w">${off}</div>` : ''}`;
    if (html !== this.tagTxt) { this.tagTxt = html; tg.innerHTML = html; }
    tg.style.display = 'block';
    // above the object, clamped to the screen
    const b = new THREE.Box3().setFromObject(h.lift ?? h.obj), v = new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2);
    const s = this.desk.view.toScreen(v);
    const w = tg.offsetWidth, hh = tg.offsetHeight;
    tg.style.left = Math.round(Math.max(4, Math.min(innerWidth - w - 4, s.x - w / 2))) + 'px';
    tg.style.top = Math.round(Math.max(4, s.y - hh - 10)) + 'px';
    Tip.hide();
  }
  /** publish where the desk is, so panels and toasts keep clear of it */
  private cssKey = '';
  private cssVars() {
    const d = this.desk, r = document.documentElement.style;
    const v = [d.stripTop, d.wingTop.L, d.wingTop.R, d.wingW].map(Math.round), key = v.join(',');
    if (key === this.cssKey) return; this.cssKey = key;
    r.setProperty('--desk-h', v[0] + 'px'); r.setProperty('--desk-wl', v[1] + 'px'); r.setProperty('--desk-wr', v[2] + 'px'); r.setProperty('--desk-ww', v[3] + 'px');
    r.setProperty('--hud-top', '6px');
  }

  // ------------------------------------------------------------------ the almanac
  /** game/climate.ts (through ui/almanac.ts): the orrery and the calendar follow the sky */
  setClimate(c: Climate) { this.climate = c; }
  invalidate() { this.cmdKey = ''; this.selKey = '-'; }
  /** run the desk's animations forward (headless tests and screenshots, where frames are slow) */
  settle(n = 120) { this.mapT = 0; this.mapBuilt = 0; this.update(1 / 30); this.crtPaint(); for (let i = 0; i < n; i++) { this.wheel.update(1 / 30); this.desk.update(1 / 30); } this.desk.render(); }
  dispose() {
    removeEventListener('resize', this.onResize);
    for (const v of ['--hud-top', '--desk-h', '--desk-wl', '--desk-wr', '--desk-ww']) document.documentElement.style.removeProperty(v);
    delete document.body.dataset.deskMode;
    FLOAT.quiet = false;
    this.desk.dispose(); this.root.remove(); Tip.hide();
  }
}
void textW5;
