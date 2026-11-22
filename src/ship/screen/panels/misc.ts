// The ship's smaller functions, each a compact textured panel:
//   ORDERS (bridge, ship:fn:quotas)   the program's directives as stamped order slips: what they ask (icons, numbers),
//                                     the time left on a clock dial, TRANSMIT when it is met; strikes as red lamps
//   STUDY (lab, ship:fn:study)        specimens from the stores sent up for study: each turns into knowledge
//   POWER (engineering, ship:fn:orbit) the reactor's bus shared out on five levers (the decks dim when starved)
//   PODS (hangar, ship:fn:pods)       the pod's arms and drones on the hangar's rack, with their state
//   UNIT 07 (AI core, ship:fn:link)   the core: save the colony, the link's standing
import * as THREE from 'three';
import type { PanelCtx, Panel } from './index';
import { div, place, artCanvas, S, keyCap, chip, iconOf, itemImg, clean } from '../ui';
import { plate } from '../../../ui/kit/mat';
import { Px, P, INK, hex, bevel, cellBar, mixHex, rivet } from '../../../ui/kit/px';
import { bitText } from '../../../ui/kit/bitfont';
import { uiSfx } from '../../../ui/kit/sound';
import { tween, ease, pop, burst, floatUp, Counter, shake, squash } from '../../../ui/kit/juice';
import { ModelView, toon } from '../../../ui/kit/model3d';
import { stepIcon, DATA_ICON } from '../../../story/icons';
import { ITEMS } from '../../../factory/items';
import { have, pay } from '../../../research/util';
import { shipState, setPower, type ShipState } from '../../hub/shipState';

const face = (host: HTMLElement, W: number, H: number, mat: Parameters<typeof plate>[2]['mat'], seed: number, head = 34) => {
  const bg = artCanvas(W, H); host.append(bg);
  const p = plate(W, H, { mat, seed, chamfer: 3, wear: 0.9, screws: true, grime: 0.7 });
  if (head) p.blit(plate(W - 20, head, { mat: 'enamel', seed: seed + 1, chamfer: 2, wear: 0.5, lip: 1 }), 10, 8);
  bg.getContext('2d')!.putImageData(p.image(), 0, 0);
  return bg.getContext('2d')!;
};
const none = (host: HTMLElement, W: number, H: number, what: string) => { const n = div('s7-abs k7-t16', host); place(n, 0, H / 2 - 8, W); n.style.textAlign = 'center'; n.textContent = what; n.style.color = '#c8c0a8'; };

// ------------------------------------------------------------------ ORDERS
export function ordersPanel(ctx: PanelCtx): Panel {
  const { w: W, h: H, host, game } = ctx;
  const M = game?.mission;
  face(host, W, H, 'gun', 71);
  // strikes: three red lamps on the header
  const lamps = artCanvas(60, 18); place(lamps, 18, 16); host.append(lamps);
  const paintLamps = () => { const c = lamps.getContext('2d')!; c.clearRect(0, 0, 60, 18); for (let i = 0; i < 3; i++) { const on = (M?.strikes ?? 0) > i; c.fillStyle = '#08090c'; c.fillRect(i * 18, 2, 14, 14); c.fillStyle = on ? '#e84030' : '#4a2420'; c.fillRect(i * 18 + 2, 4, 10, 10); if (on) { c.fillStyle = '#ffb0a0'; c.fillRect(i * 18 + 3, 5, 3, 2); } } };
  paintLamps();
  const repH = div('s7-abs', host); place(repH, W - 92, 12); const sh = artCanvas(22, 22); sh.getContext('2d')!.drawImage(iconOf('shield', 'amber'), 0, 0, 22, 22); repH.append(sh); repH.style.display = 'flex'; repH.style.alignItems = 'center';
  const rep = new Counter(repH, { size: 32 }); rep.set(Math.round(M?.rep ?? 0), true);
  if (!M) { none(host, W, H, 'NO SETTLEMENT'); return { dispose() {} }; }
  const list = div('s7-abs', host); place(list, 10, 50, W - 20, H - 60); list.style.display = 'flex'; list.style.flexDirection = 'column'; list.style.gap = 6 * S + 'px';
  const slips: { q: any; el: HTMLDivElement; cv: HTMLCanvasElement; key: ReturnType<typeof keyCap> }[] = [];
  const build = () => {
    list.replaceChildren(); slips.length = 0;
    const qs = [...M.open(), ...M.quotas.filter((q: any) => q.state !== 'open').slice(-2)].slice(0, 4);
    if (!qs.length) { const n = div('k7-t16'); n.textContent = 'NO ORDERS'; n.style.color = '#c8c0a8'; list.append(n); return; }
    for (const q of qs) {
      const el = div('', list); el.style.position = 'relative'; el.style.width = (W - 20) * S + 'px'; el.style.height = 82 * S + 'px';
      const cv = artCanvas(W - 20, 82, ''); el.append(cv);
      const chips = div('s7-abs', el); place(chips, 8, 26, W - 130); chips.style.display = 'flex'; chips.style.gap = 2 * S + 'px'; chips.style.flexWrap = 'wrap';
      const pr = M.progress(q) as { ok: boolean; parts?: { have: number; need: number; item?: string; kind?: string }[] };
      if (q.kind === 'data') for (const k in q.data) chips.append(chip(stepIcon(DATA_ICON[k]), `${Math.floor(game.research?.data?.[k] ?? 0)}/${q.data[k]}`, { ok: (game.research?.data?.[k] ?? 0) >= q.data[k] }));
      else if (q.kind === 'items') for (const id in q.items) chips.append(chip(itemImg(id, 32), `${have(game, id)}/${q.items[id]}`, { ok: have(game, id) >= q.items[id] }));
      else if (q.milestone) chips.append(chip(iconOf('gauge', 'steel'), clean(q.milestone.label).slice(0, 18)));
      for (const id in q.reward?.items ?? {}) if (ITEMS[id]) { const r = chip(itemImg(id, 32), '+' + q.reward.items[id], { mat: 'brass' }); chips.append(r); }
      const key = keyCap(el, { label: q.state === 'met' ? 'SENT' : q.state === 'missed' ? 'MISSED' : 'TRANSMIT', w: 104, h: 28, mat: q.state === 'open' ? 'orange' : 'steel', sound: 'confirm', off: () => (q.state !== 'open' ? true : !M.progress(q).ok ? 'NOT YET' : false), onClick: () => send(q, el) });
      key.el.style.position = 'absolute'; place(key.el, W - 20 - 112, 46);
      slips.push({ q, el, cv, key });
      void pr;
    }
    paintSlips();
  };
  const paintSlips = () => {
    const now = (game.world?.time ?? 0);
    for (const s of slips) {
      const q = s.q, c = s.cv.getContext('2d')!;
      const p = plate(W - 20, 82, { mat: q.state === 'missed' ? 'steel' : 'paper', seed: q.no ?? 3, chamfer: 2, wear: 0.6, lip: 1, grime: 0.4 });
      // the deadline dial
      const left = Math.max(0, q.due - now), span = Math.max(1, q.due - q.issued), k = left / span;
      const cx = W - 20 - 22, cy = 22;
      p.disc(cx, cy, 13, () => INK); p.disc(cx, cy, 12, (d, lit) => mixHex(P.bone[3], P.bone[5], 0.5 + lit * 0.4));
      for (let a = -Math.PI / 2; a < -Math.PI / 2 + k * Math.PI * 2; a += 0.05) for (let r = 3; r < 10; r++) p.set(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), k < 0.25 ? P.ruby[3] : P.ochre[4]);
      c.putImageData(p.image(), 0, 0);
      bitText(c, clean(String(q.title ?? '').toUpperCase()).slice(0, 26), 8, 6, { color: hex(P.ink[1]), outline: null });
      if (q.state !== 'open') { c.save(); c.globalAlpha = 0.85; bitText(c, q.state === 'met' ? 'MET' : 'MISSED', W - 20 - 64, 6, { color: q.state === 'met' ? '#3a8a3a' : '#a03020', outline: null }); c.restore(); }
    }
  };
  const send = (q: any, el: HTMLElement) => {
    if (!M.transmit(q.id)) { uiSfx('error', 0.5); shake(el, 4); return; }
    uiSfx('bong', 0.6); ctx.shake(0.8);
    const r = el.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, { n: 24, ramp: P.glowAmber, kind: 'spark', layer: 'ui' });
    floatUp(r.left + r.width / 2, r.top, 'SENT', { color: '#ffe7a8', size: 32 });
    rep.set(Math.round(M.rep));
    setTimeout(build, 500);
  };
  build();
  let acc = 0;
  return { update(dt) { acc += dt; if (acc > 1) { acc = 0; paintSlips(); paintLamps(); for (const s of slips) s.key.refresh(); } }, dispose() {} };
}

// ------------------------------------------------------------------ STUDY
const SPECIMENS = ['specimen', 'tissue', 'blood_sample', 'egg', 'embryo', 'plant_cutting', 'venom_gland', 'seed_crystal', 'lumen_crystal', 'crystal'];
export function studyPanel(ctx: PanelCtx): Panel {
  const { w: W, h: H, host, game } = ctx;
  face(host, W, H, 'enamel', 81);
  const know = div('s7-abs', host); place(know, 16, 14, W - 32); know.style.display = 'flex'; know.style.gap = 3 * S + 'px';
  const paintKnow = () => { const d = game?.research?.data ?? { bio: 0, geo: 0, energy: 0, xeno: 0 }; know.replaceChildren(...['bio', 'geo', 'energy', 'xeno'].map((k) => chip(stepIcon(DATA_ICON[k]), String(Math.floor(d[k] ?? 0))))); };
  paintKnow();
  if (!game) { none(host, W, H, 'NO SETTLEMENT'); return { dispose() {} }; }
  const list = div('s7-abs', host); place(list, 10, 52, W - 20, H - 62); list.style.display = 'flex'; list.style.flexDirection = 'column'; list.style.gap = 4 * S + 'px';
  const gain = (id: string): [string, number][] => (/crystal/.test(id) ? [['geo', 3], ['xeno', 2]] : /seed|plant/.test(id) ? [['bio', 3]] : [['bio', 4], ['xeno', 1]]);
  const rows = () => {
    list.replaceChildren();
    const ids = SPECIMENS.filter((id) => ITEMS[id] && have(game, id) > 0);
    if (!ids.length) { const n = div('k7-t16'); n.textContent = 'NO SPECIMENS'; n.style.color = '#6a5a3a'; n.style.textShadow = 'none'; list.append(n); const s = chip(iconOf('vial', 'steel'), ''); list.append(s); return; }
    for (const id of ids.slice(0, 6)) {
      const el = div('', list); el.style.position = 'relative'; el.style.height = 34 * S + 'px'; el.style.width = (W - 20) * S + 'px';
      const bgc = artCanvas(W - 20, 34, ''); el.append(bgc); bgc.getContext('2d')!.putImageData(plate(W - 20, 34, { mat: 'steel', seed: id.length, chamfer: 2, wear: 0.5, lip: 1 }).image(), 0, 0);
      const ch = div('s7-abs', el); place(ch, 6, 7); ch.style.display = 'flex'; ch.style.gap = 2 * S + 'px';
      ch.append(chip(itemImg(id, 32), String(have(game, id))), ...gain(id).map(([k, n]) => chip(stepIcon(DATA_ICON[k]), '+' + n, { mat: 'brass' })));
      const key = keyCap(el, { label: 'SEND', w: 70, h: 26, mat: 'orange', sound: 'confirm', off: () => (have(game, id) < 1 ? true : false), onClick: () => {
        if (!pay(game, { [id]: 1 })) { uiSfx('error', 0.5); return; }
        for (const [k, n] of gain(id)) game.research?.addData?.(k, n, 'ship study');
        const r = el.getBoundingClientRect(); burst(r.right - 40, r.top + 20, { n: 12, ramp: P.glowTeal, kind: 'spark', layer: 'ui', up: 1 }); floatUp(r.right - 40, r.top, '+' + gain(id).reduce((a, [, n]) => a + n, 0), { color: '#b0f0e0', size: 16 });
        uiSfx('glass', 0.5); paintKnow(); setTimeout(rows, 250);
      } });
      key.el.style.position = 'absolute'; place(key.el, W - 20 - 76, 4);
    }
  };
  rows();
  return { dispose() {} };
}

// ------------------------------------------------------------------ POWER
const BUS: [keyof ShipState['power'], string, string][] = [['life', 'heart', 'LIFE'], ['lab', 'flask', 'LAB'], ['workshop', 'wrench', 'SHOP'], ['sensors', 'telescope', 'SENSE'], ['engines', 'core', 'DRIVE']];
export function powerPanel(ctx: PanelCtx): Panel {
  const { w: W, h: H, host } = ctx;
  face(host, W, H, 'gun', 91, 0);
  const n = BUS.length, lw = Math.floor((W - 20) / n), top = 40, bot = H - 70;
  const cv = artCanvas(W, H); host.append(cv); cv.style.touchAction = 'none'; cv.style.cursor = 'ns-resize';
  const c = cv.getContext('2d')!;
  const paint = () => {
    const p = new Px(W, H), pw = shipState().power;
    BUS.forEach(([k], i) => {
      const x = 10 + i * lw + Math.round(lw / 2), v = pw[k];
      // the slot, sunk, with tick marks, and the lever's knob on it
      bevel(p, x - 4, top, 8, bot - top, P.steel, { chamfer: 2, sunk: true });
      for (let y = top + 6; y < bot - 4; y += 12) { p.hl(x - 10, x - 7, y, P.steel[4]); p.hl(x + 7, x + 10, y, P.steel[4]); }
      const ky = Math.round(bot - (v / 0.6) * (bot - top));
      cellBar(p, x - 2, ky, 4, bot - ky - 2, 1, P.glowAmber, 0);
      bevel(p, x - 14, ky - 8, 28, 16, P.rust, { chamfer: 3 });
      rivet(p, x - 9, ky - 3, 1, P.steel); rivet(p, x + 7, ky - 3, 1, P.steel);
    });
    c.clearRect(0, 0, W, H); c.putImageData(p.image(), 0, 0);
    BUS.forEach(([k, ic, name], i) => { const x = 10 + i * lw + Math.round(lw / 2); c.drawImage(iconOf(ic, 'amber'), x - 10, bot + 8, 20, 20); bitText(c, name, x, bot + 30, { align: 'center', color: '#e8dcc0' }); bitText(c, Math.round(shipState().power[k] * 100) + '', x, 16, { align: 'center', color: '#ffd890' }); });
  };
  paint();
  let drag = -1;
  const at = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / S, (e.clientY - r.top) / S]; };
  cv.addEventListener('pointerdown', (e) => { const [x] = at(e); drag = Math.max(0, Math.min(n - 1, Math.floor((x - 10) / lw))); cv.setPointerCapture(e.pointerId); uiSfx('switch', 0.5); });
  cv.addEventListener('pointermove', (e) => { if (drag < 0) return; const [, y] = at(e); const v = Math.max(0.05, Math.min(0.6, ((bot - y) / (bot - top)) * 0.6)); const k = BUS[drag][0]; if (Math.abs(shipState().power[k] - v) > 0.01) { setPower(k, v); paint(); uiSfx('tick', 0.25, 0.8 + v); } });
  cv.addEventListener('pointerup', () => { if (drag >= 0) { uiSfx('clunk', 0.5); ctx.shake(0.3); } drag = -1; });
  return { dispose() {} };
}

// ------------------------------------------------------------------ PODS
export function podsPanel(ctx: PanelCtx): Panel {
  const { w: W, h: H, host, game } = ctx;
  face(host, W, H, 'steel', 101);
  const col = game?.colony;
  const sum = div('s7-abs', host); place(sum, 16, 14, W - 32); sum.style.display = 'flex'; sum.style.gap = 3 * S + 'px';
  sum.append(chip(iconOf('arm', 'steel'), String(col?.arms?.length ?? 0)), chip(iconOf('drone', 'steel'), String(col?.drones?.length ?? 0)), chip(iconOf('pole', 'steel'), String(col?.structures?.length ?? 0)));
  // the pod itself on the hangar rack: a kit 3D capsule
  const v = new ModelView(podModel, { w: 150, h: 120, scale: S, spin: 0.4, hotSpin: 2.2, pitch: 0.45, zoom: 1.0, shadow: [3, 4, 0.5] });
  const vh = div('s7-abs', host); vh.append(v.cv); place(vh, Math.round(W / 2 - 75), 52); vh.style.cursor = 'pointer';
  vh.addEventListener('pointerenter', () => { v.hot(true); uiSfx('hover', 0.4); }); vh.addEventListener('pointerleave', () => v.hot(false)); vh.addEventListener('pointermove', (e) => v.point(e.clientX, e.clientY));
  vh.addEventListener('click', () => { v.press(1.2); v.poke(12); uiSfx('metal', 0.5); });
  const list = div('s7-abs', host); place(list, 10, 180, W - 20, H - 190); list.style.display = 'flex'; list.style.flexWrap = 'wrap'; list.style.gap = 3 * S + 'px';
  const units: { icon: string; hp: number }[] = [...(col?.arms ?? []).map((a: any) => ({ icon: 'arm', hp: a.hp / Math.max(1, a.maxHp ?? 100) })), ...(col?.drones ?? []).map((d: any) => ({ icon: 'drone', hp: (d.battery ?? 1) }))];
  if (!units.length) { const e = div('k7-t16', list); e.textContent = game ? 'NONE BUILT' : 'NO SETTLEMENT'; e.style.color = '#d8d0b8'; }
  for (const u of units.slice(0, 12)) { const cv = artCanvas(68, 26, ''); const p = plate(68, 26, { mat: 'enamel', seed: 7, chamfer: 2, wear: 0.4, lip: 1 }); cellBar(p, 26, 9, 36, 8, Math.max(0, Math.min(1, u.hp)), P.glowTeal, 0); const c = cv.getContext('2d')!; c.putImageData(p.image(), 0, 0); c.drawImage(iconOf(u.icon, 'steel'), 3, 3, 20, 20); list.append(cv); }
  return { dispose() { v.dispose(); } };
}
function podModel(): THREE.Group {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 1.1, 12), toon({ color: 0xe8e4d8, gloss: 0.3 })); hull.position.y = 0.75; g.add(hull);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), toon({ color: 0xd8d4c8, gloss: 0.3 })); cap.position.y = 1.3; g.add(cap);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.77, 0.77, 0.14, 12), toon({ color: 0xd06a2a, gloss: 0.4 })); band.position.y = 0.32; g.add(band);
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.05), toon({ color: 0x3a6070, gloss: 0.9, emissive: 0x0a1a20 })); win.position.set(0, 1.0, 0.6); g.add(win);
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), toon({ color: 0x60666c, metal: 0.7 })); leg.position.set(Math.cos(a) * 0.7, 0.2, Math.sin(a) * 0.7); leg.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35); g.add(leg); }
  return g;
}

// ------------------------------------------------------------------ UNIT 07 (the core)
export function corePanel(ctx: PanelCtx): Panel {
  const { w: W, h: H, host, game } = ctx;
  face(host, W, H, 'gun', 111, 0);
  const core = new ModelView(coreModel, { w: 140, h: 140, scale: S, spin: 0.6, hotSpin: 2.6, pitch: 0.35, zoom: 1.0, liveFps: 10, anim: (r, t) => { const o = r.getObjectByName('orb'); if (o) { o.position.y = 1.25 + Math.sin(t * 2) * 0.05; o.rotation.y = t; } } });
  const vh = div('s7-abs', host); vh.append(core.cv); place(vh, Math.round(W / 2 - 70), 20); vh.style.cursor = 'pointer';
  vh.addEventListener('pointerenter', () => { core.hot(true); uiSfx('hover', 0.4); }); vh.addEventListener('pointerleave', () => core.hot(false));
  vh.addEventListener('click', () => { core.press(1); core.poke(10); uiSfx('bong', 0.4); });
  const save = keyCap(host, { label: 'SAVE', icon: iconOf('chip', 'amber'), w: 110, h: 30, mat: 'orange', sound: 'confirm', off: () => (!game?.colony ? 'NO SETTLEMENT' : false), onClick: () => {
    try { game.colony.save(); } catch (e) { console.error(e); }
    const r = save.el.getBoundingClientRect(); floatUp(r.left + r.width / 2, r.top, 'SAVED', { color: '#b8f0a0', size: 32 }); burst(r.left + r.width / 2, r.top, { n: 16, ramp: P.glowTeal, kind: 'spark', layer: 'ui', up: 1 });
  } });
  save.el.style.position = 'absolute'; place(save.el, Math.round(W / 2 - 55), 180);
  const sol = div('s7-abs', host); place(sol, 16, 230, W - 32); sol.style.display = 'flex'; sol.style.gap = 3 * S + 'px'; sol.style.justifyContent = 'center';
  sol.append(chip(iconOf('moon', 'steel'), String(game?.colony?.sol ?? 0)), chip(iconOf('shield', 'amber'), String(Math.round(game?.mission?.rep ?? 0))), chip(iconOf('nodes', 'steel'), String(game?.unlocks?.owned?.().length ?? 0)));
  void squash; void tween; void ease;
  return { dispose() { core.dispose(); } };
}
function coreModel(): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, 0.3, 8), toon({ color: 0x50565c, metal: 0.7 })); base.position.y = 0.15; g.add(base);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.6, 8), toon({ color: 0x8a9096, metal: 0.7 })); col.position.y = 0.6; g.add(col);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.36), toon({ color: 0xc8a060, metal: 0.6 })); fin.position.set(Math.cos(a) * 0.48, 0.65, Math.sin(a) * 0.48); fin.rotation.y = -a; g.add(fin); }
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), toon({ color: 0x7fe0c0, emissive: 0x1a5a48, gloss: 0.8 })); orb.name = 'orb'; orb.position.y = 1.25; g.add(orb);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.04, 6, 24), toon({ color: 0xc8a060, metal: 0.8 })); ring.rotation.x = Math.PI / 2 - 0.3; ring.position.y = 1.25; g.add(ring);
  return g;
}
void mixHex; void squash;
