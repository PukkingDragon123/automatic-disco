// HUD v7 · THE CUSTOM TOOL BENCH (from the arsenal, or B in it). A machined steel workbench: in its middle a 3D JIG
// (src/ui/kit/hardware.ts), a turntable between two clamp jaws on lead screws, holds the tool being built as a live
// outlined model. Four anodised part trays (HEAD what it does, CORE its power, GRIP its handling, MOD an extra) hold the
// parts as small 3D renders; click one to fit it: the jaws wind open (their gears turning), the part drops on with a
// puff and a knock, the jaws lock (green LEDs). The tool's numbers sit on lit cell gauges and change as you fit parts;
// the bill of parts shows as item icons with counts (red when short). FORGE takes the parts from the stores and hangs
// the new tool in the arsenal (sparks, a heavy thud, the ring lights).
import type { Game } from '../../game/game';
import { ModelView, snapshot } from '../kit/model3d';
import { mCustomTool } from '../kit/models';
import { mJig, animJig } from '../kit/hardware';
import { plate, skin, pxCanvas } from '../kit/mat';
import { Px, P, INK, cellBar, rivet, screw } from '../kit/px';
import { uiSfx } from '../kit/sound';
import { placeDust, burst, shake, pop, squash, floatUp } from '../kit/juice';
import { floatIcon } from '../kit/floatIcon';
import { installKitStyle } from '../kit/style';
import { itemIcon, ITEMS } from '../../factory/items';
import { PARTS, PART_SLOTS, partOf, statsOf, costOf, addCustomTool, customTools, type Stats } from './tools';
import type { PartSlot } from '../kit/models';
import type { ToolWidget } from './toolWidget';

type G = Game & Record<string, any>;
const SLOT_NAME: Record<PartSlot, string> = { head: 'HEAD', core: 'CORE', grip: 'GRIP', mod: 'MOD' };
const STATS: { k: keyof Stats; name: string; max: number; ramp: readonly number[] }[] = [
  { k: 'power', name: 'POWER', max: 8, ramp: P.glowAmber }, { k: 'reach', name: 'REACH', max: 14, ramp: P.glowTeal }, { k: 'speed', name: 'SPEED', max: 5, ramp: P.malachite },
  { k: 'draw', name: 'DRAW', max: 10, ramp: P.ruby }, { k: 'mass', name: 'WEIGHT', max: 8, ramp: P.stone },
];
/** a steel vice (jaws, screw, handle bar) painted under the assembly */
function viceArt(): Px {
  const p = new Px(120, 40);
  const body = plate(120, 22, { mat: 'gun', seed: 81, chamfer: 3, wear: 0.8, lip: 1 }); p.blit(body, 0, 18);
  const jawL = plate(18, 26, { mat: 'steel', seed: 82, chamfer: 2, wear: 0.5, lip: 1 }), jawR = plate(18, 26, { mat: 'steel', seed: 83, chamfer: 2, wear: 0.5, lip: 1 });
  p.blit(jawL, 18, 0); p.blit(jawR, 84, 0);
  for (let y = 2; y < 24; y += 3) { p.hl(20, 33, y, P.steel[1]); p.hl(86, 99, y, P.steel[1]); }
  p.rect(36, 26, 48, 4, P.steel[4]); for (let x = 36; x < 84; x += 3) p.vl(x, 26, 29, P.steel[2]);
  screw(p, 4, 24, 3); screw(p, 110, 24, 4); rivet(p, 60, 34, 2, P.brass);
  p.outline(INK);
  return p;
}

export class Bench {
  readonly el: HTMLDivElement; isOpen = false;
  private parts: Record<PartSlot, string> = { head: 'lens', core: 'cell', grip: 'pistol', mod: 'none' };
  private view: ModelView | null = null; private viceEl: HTMLDivElement; private statEl: HTMLDivElement; private costEl: HTMLDivElement; private trayEls = new Map<string, HTMLButtonElement>();
  private key = (e: KeyboardEvent) => { if (!this.isOpen) return; if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.open(false); } };
  constructor(readonly g: G, readonly w: ToolWidget) {
    installKitStyle(); injectBenchCSS();
    const el = this.el = document.createElement('div'); el.className = 'h7-bench';
    const top = document.createElement('div'); top.className = 'h7-bench-top';
    skin(top, (W, H) => plate(W, H, { mat: 'gun', seed: 91, chamfer: 8, wear: 0.7, grime: 0.5, screws: true, rivets: true, hazard: 8 }));
    // trays
    const trays = document.createElement('div'); trays.className = 'h7-trays';
    for (const slot of PART_SLOTS) {
      const tray = document.createElement('div'); tray.className = 'h7-tray';
      skin(tray, (W, H) => plate(W, H, { mat: 'gun', seed: 92 + slot.length, chamfer: 4, wear: 0.6, lip: 2, wells: [[6, 20, W - 12, H - 26, 0x0b0e12]] }));
      const lab = document.createElement('div'); lab.className = 'k7-t16 h7-tray-n'; lab.textContent = SLOT_NAME[slot]; tray.append(lab);
      const row = document.createElement('div'); row.className = 'h7-tray-row';
      for (const pd of PARTS[slot]) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'h7-part'; b.title = '';
        const cv = pd.id === 'none' ? null : snapshot(`part|${slot}|${pd.id}`, () => mCustomTool({ [slot]: pd.id } as Record<PartSlot, string>, slot), 36, 30, { yaw: slot === 'head' ? 1.1 : 0.6, pitch: 0.4, zoom: 1.1 });
        if (cv) { const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height; c2.getContext('2d')!.drawImage(cv, 0, 0); c2.style.width = cv.width * 2 + 'px'; c2.style.height = cv.height * 2 + 'px'; c2.style.imageRendering = 'pixelated'; b.append(c2); }
        else { const x = document.createElement('span'); x.className = 'k7-t32'; x.textContent = '-'; x.style.width = '72px'; x.style.textAlign = 'center'; b.append(x); }
        const n = document.createElement('span'); n.className = 'k7-t16 h7-part-n'; n.textContent = pd.name; b.append(n);
        b.addEventListener('pointerenter', () => { uiSfx('hover', 0.35); b.classList.add('hot'); });
        b.addEventListener('pointerleave', () => b.classList.remove('hot'));
        b.addEventListener('click', (e) => { e.stopPropagation(); this.fit(slot, pd.id, b); });
        row.append(b); this.trayEls.set(slot + '|' + pd.id, b);
      }
      tray.append(row); trays.append(tray);
    }
    // the vice with the assembly
    this.viceEl = document.createElement('div'); this.viceEl.className = 'h7-vice';
    // the stats and the bill
    const side = document.createElement('div'); side.className = 'h7-bench-side';
    this.statEl = document.createElement('div'); this.statEl.className = 'h7-bstats';
    this.costEl = document.createElement('div'); this.costEl.className = 'h7-bcost';
    const forge = floatIcon({ build: () => mCustomTool({ head: 'torch', core: 'motor', grip: 'handle', mod: 'tank' }), name: 'FORGE', size: [56, 48], nameSize: 32, sound: '', view: { pitch: 0.4, spin: 0.4 }, onClick: () => this.forge(forge.el) });
    const back = floatIcon({ build: () => mCustomTool({ head: 'lens', core: 'cell', grip: 'pistol' }), name: 'BACK', size: [40, 34], nameSize: 16, sound: 'back', view: { pitch: 0.4 }, onClick: () => { this.open(false); this.w.openArsenal(); } });
    back.el.classList.add('h7-bench-back');
    side.append(this.statEl, this.costEl, forge.el);
    top.append(trays, this.viceEl, side, back.el);
    el.append(top);
    el.addEventListener('pointerdown', (e) => { if (e.target === el) this.open(false); });
  }
  open(on: boolean) {
    if (on === this.isOpen) return;
    this.isOpen = on;
    if (on) {
      if (!this.el.isConnected) document.body.append(this.el);
      this.el.classList.add('on');
      const top = this.el.firstElementChild as HTMLElement;
      top.animate([{ transform: 'translateY(40px) scale(.96)', opacity: 0 }, { transform: 'translateY(-6px) scale(1.01)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 360, easing: 'ease-out' });
      top.querySelectorAll('.h7-part').forEach((p, i) => (p as HTMLElement).animate([{ transform: 'translateY(-30px)', opacity: 0 }, { transform: 'translateY(3px)', opacity: 1, offset: 0.7 }, { transform: 'none' }], { duration: 320, delay: 100 + i * 25, easing: 'ease-out', fill: 'backwards' }));
      uiSfx('open', 0.6); uiSfx('creak', 0.35);
      this.rebuild(false);
      addEventListener('keydown', this.key, true);
    } else {
      removeEventListener('keydown', this.key, true);
      uiSfx('close', 0.5);
      this.el.classList.remove('on'); this.view?.dispose(); this.view = null;
    }
  }
  private fit(slot: PartSlot, id: string, from?: HTMLElement) {
    if (this.parts[slot] === id) { from && shake(from, 3); return; }
    this.parts[slot] = id;
    if (from) squash(from, 0.6);
    this.rebuild(true);
  }
  private rebuild(fitted: boolean) {
    // the jig keeps its place; only the tool in it is rebuilt (the jaws open, the part goes on, the jaws lock)
    const prev = this.view;
    const v = new ModelView(() => mJig(() => mCustomTool(this.parts)), { w: 270, h: 200, scale: 2, spin: 0, yaw0: -0.3, rock: 0.12, hotSpin: 0, pitch: 0.46, anim: (r, t, hot) => animJig(r, t, hot), liveFps: 15, zoom: 1.08 });
    v.cv.classList.add('h7-bench-model');
    v.cv.addEventListener('pointerenter', () => v.hot(true)); v.cv.addEventListener('pointerleave', () => v.hot(false)); v.cv.addEventListener('pointermove', (e) => v.point(e.clientX, e.clientY));
    if (fitted && prev) {
      // open the old jig's jaws, then swap in the new one with its jaws open and lock them
      const ps = prev.state<{ clamp: number }>(); if (ps) ps.clamp = 0;
      uiSfx('winch', 0.45, 1.2);
      setTimeout(() => {
        prev.dispose(); this.viceEl.prepend(v.cv); this.view = v;
        const go = () => { const st = v.state<{ clamp: number; c?: number; flash: number }>(); if (!st) { setTimeout(go, 30); return; } st.c = 0; st.clamp = 0; setTimeout(() => { st.clamp = 1; st.flash = performance.now() / 1000 + 0.5; uiSfx('clunk', 0.6); uiSfx('metal', 0.45, 0.9); }, 220); };
        go();
        v.cv.animate([{ transform: 'translateY(-10px)' }, { transform: 'translateY(0)' }], { duration: 260, easing: 'cubic-bezier(.5,0,.9,.5)' });
        const r = this.viceEl.getBoundingClientRect(); placeDust(r.left + r.width / 2, r.top + r.height * 0.62, 0.4, { layer: 'ui', ground: 'metal' });
      }, 260);
    } else { prev?.dispose(); this.viceEl.prepend(v.cv); this.view = v; }
    for (const [k, b] of this.trayEls) { const [slot, id] = k.split('|'); b.classList.toggle('on', this.parts[slot as PartSlot] === id); }
    this.syncStats();
  }
  private syncStats() {
    const st = statsOf(this.parts);
    this.statEl.innerHTML = '';
    for (const s of STATS) {
      const row = document.createElement('div'); row.className = 'h7-bstat';
      const nm = document.createElement('span'); nm.className = 'k7-t16'; nm.textContent = s.name;
      const p = new Px(64, 9); cellBar(p, 1, 1, 62, 7, Math.max(0, st[s.k]) / s.max, s.ramp);
      const cv = pxCanvas(p, 2);
      const v = document.createElement('span'); v.className = 'k7-t32'; v.textContent = (st[s.k] > 0 && s.k !== 'mass' && s.k !== 'draw' ? '+' : '') + st[s.k];
      row.append(nm, cv, v); this.statEl.append(row);
    }
    const cost = costOf(this.parts);
    this.costEl.innerHTML = '';
    for (const [it, n] of Object.entries(cost)) {
      const have = this.g.storage?.count?.(it) ?? 0;
      const e = document.createElement('div'); e.className = 'h7-bill' + (have >= n ? '' : ' short');
      const ic = document.createElement('img'); ic.src = itemIcon(it, 64); ic.alt = ITEMS[it]?.name ?? it; ic.className = 'h7-bill-ic';
      const t = document.createElement('span'); t.className = 'k7-t32'; t.textContent = `${n}`;
      e.title = (ITEMS[it]?.name ?? it); e.append(ic, t); this.costEl.append(e);
    }
  }
  private forge(btn: HTMLElement) {
    const cost = costOf(this.parts), st = this.g.storage;
    const short = Object.entries(cost).filter(([it, n]) => (st?.count?.(it) ?? 0) < n);
    if (short.length && !this.g.__freeParts) { shake(btn, 6); uiSfx('error', 0.6); this.costEl.querySelectorAll('.short').forEach((e) => pop(e as HTMLElement, 0.5)); return; }
    if (st && !this.g.__freeParts) for (const [it, n] of Object.entries(cost)) st.take(it, n);
    const head = partOf('head', this.parts.head), n = customTools(this.g).length + 1;
    const name = `${head.name.split(' ').pop()} MK-${n}`;
    addCustomTool(this.g, { id: 'custom_' + Date.now().toString(36), name, parts: { ...this.parts }, base: head.base ?? 'scanner', stats: statsOf(this.parts) });
    const r = this.viceEl.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height * 0.4, { n: 30, ramp: P.glowAmber, speed: 340, life: 0.7 });
    placeDust(r.left + r.width / 2, r.top + r.height * 0.75, 0.7, { layer: 'ui', ground: 'metal' });
    floatUp(r.left + r.width / 2, r.top, name, { size: 32, color: '#ffe39a' });
    uiSfx('confirm', 0.7); uiSfx('slam', 0.5);
    this.view?.press(1.5);
    { const st = this.view?.state<{ flash: number; spin: number }>(); if (st) { st.flash = performance.now() / 1000 + 1.2; st.spin += 6; } }
    this.syncStats();
  }
}

let css = false;
function injectBenchCSS() {
  if (css) return; css = true;
  const s = document.createElement('style');
  s.textContent = `
.h7-bench { position: fixed; inset: 0; z-index: 9250; display: none; align-items: center; justify-content: center; background: radial-gradient(ellipse at 50% 50%, rgba(8,9,12,.5), rgba(8,9,12,.88)); }
.h7-bench.on { display: flex; }
.h7-bench-top { position: relative; width: 1560px; height: 660px; display: grid; grid-template-columns: 520px 1fr 380px; gap: 10px; padding: 34px 34px 30px; box-sizing: border-box; }
.h7-bench-top > * { position: relative; z-index: 1; }
.h7-trays { display: flex; flex-direction: column; gap: 10px; }
.h7-tray { position: relative; padding: 6px 10px 6px 12px; height: 128px; box-sizing: border-box; }
.h7-tray > * { position: relative; z-index: 1; }
.h7-tray-n { color: #9fe0d0; margin-bottom: 2px; }
.h7-tray-row { display: flex; gap: 4px; align-items: flex-end; }
.h7-part { position: relative; display: flex; flex-direction: column; align-items: center; border: 0; background: none; padding: 0; margin: 0; cursor: pointer; width: 112px; transition: transform .2s cubic-bezier(.2,.9,.3,1.6), filter .15s; filter: drop-shadow(3px 4px 0 rgba(5,6,8,.45)); }
.h7-part canvas { display: block; }
.h7-part.hot { transform: translateY(-5px); filter: brightness(1.2) drop-shadow(0 0 6px rgba(255,200,110,.6)); }
.h7-part.on { filter: brightness(1.2) drop-shadow(0 0 8px rgba(255,180,70,.85)); }
.h7-part.on .h7-part-n { color: var(--k7-amber); }
.h7-part-n { color: var(--k7-dim); }
.h7-vice { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; padding-top: 40px; }
.h7-bench-model { position: relative; z-index: 2; display: block; filter: drop-shadow(6px 8px 0 rgba(5,6,8,.4)); }
.h7-vice-art { position: relative; z-index: 1; display: block; }
.h7-bench-side { display: flex; flex-direction: column; gap: 14px; align-items: flex-start; padding-top: 30px; }
.h7-bstats { display: flex; flex-direction: column; gap: 4px; }
.h7-bstat { display: grid; grid-template-columns: 82px 132px 60px; align-items: center; gap: 8px; }
.h7-bstat canvas { display: block; }
.h7-bcost { display: flex; flex-wrap: wrap; gap: 6px 14px; max-width: 360px; }
.h7-bill { display: flex; align-items: center; gap: 2px; }
.h7-bill-ic { width: 64px; height: 64px; image-rendering: pixelated; filter: drop-shadow(2px 2px 0 rgba(5,6,8,.5)); }
.h7-bill.short .k7-t32 { color: var(--k7-red); }
.h7-bench-back { position: absolute !important; right: 30px; top: 18px; }
`;
  document.head.append(s);
}
