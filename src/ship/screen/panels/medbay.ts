// THE MEDBAY (ship:fn:heal): the two teammates on the surface on a lit triage board, each with their portrait
// rendered from their own rig and their state as cell gauges with icons (health, suit, hunger, sleep). The ship's
// field medkit is a kit 3D element on the shelf; HEAL sends it down: the kit flies to the teammate's card, lands with a
// bounce and dust, and their health fills (the ship's medical stock pays for it).
import * as THREE from 'three';
import type { PanelCtx, Panel } from './index';
import { div, place, artCanvas, S, keyCap, chip, iconOf, clean } from '../ui';
import { plate } from '../../../ui/kit/mat';
import { Px, P, INK, hex, cellBar, bevel, mixHex } from '../../../ui/kit/px';
import { bitText } from '../../../ui/kit/bitfont';
import { uiSfx } from '../../../ui/kit/sound';
import { tween, ease, placeDust, pop, burst, floatUp, Counter, shake } from '../../../ui/kit/juice';
import { ModelView, toon } from '../../../ui/kit/model3d';
import { crew, TEAMMATES } from '../../crew/index';
import { shipState, saveShip } from '../../hub/shipState';
import { portrait } from '../../../social/portrait';

function medkit(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 0.62, 0.5), toon({ color: 0xe8e4d8, gloss: 0.4 })); body.position.y = 0.31; g.add(body);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.1, 0.54), toon({ color: 0xc8c4b8, gloss: 0.4 })); lid.position.y = 0.6; g.add(lid);
  const red = toon({ color: 0xd03a2a, gloss: 0.5 });
  const a = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.02), red); a.position.set(0, 0.32, 0.26); g.add(a);
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.36, 0.02), red); b.position.set(0, 0.32, 0.26); g.add(b);
  const h = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 12, Math.PI), toon({ color: 0x40444a, metal: 0.6 })); h.position.y = 0.66; g.add(h);
  for (const x of [-0.42, 0.42]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.06), toon({ color: 0x9aa0a6, metal: 0.8 })); l.position.set(x, 0.5, 0.27); g.add(l); }
  return g;
}
interface TM { id: string; name?: string; hp: number; suit: number; hunger: number; fatigue: number; morale: number; alive: boolean }

export function medbayPanel(ctx: PanelCtx): Panel {
  const { w: W, h: H, host, game } = ctx;
  const live: TM[] = (game?.colony?.teammates as TM[] | undefined) ?? TEAMMATES.map((id) => ({ id, hp: 100, suit: 100, hunger: 10, fatigue: 10, morale: 75, alive: crew.alive(id) }));
  const st = shipState();
  const bg = artCanvas(W, H); host.append(bg);
  const p = plate(W, H, { mat: 'enamel', seed: 61, chamfer: 3, wear: 0.7, screws: true, grime: 0.5 });
  // the shelf with the kit, a red cross stencil on the wall
  p.blit(plate(W - 20, 76, { mat: 'steel', seed: 6, chamfer: 3, wear: 0.6, lip: 2 }), 10, 8);
  for (let y = 0; y < 18; y++) for (let x = 0; x < 18; x++) if ((x >= 6 && x < 12) || (y >= 6 && y < 12)) p.set(W - 40 + x, 20 + y, mixHex(P.ruby[3], P.ruby[4], (x + y) / 36));
  bg.getContext('2d')!.putImageData(p.image(), 0, 0);
  const kv = new ModelView(medkit, { w: 80, h: 64, scale: S, spin: 0.5, hotSpin: 3, pitch: 0.5, zoom: 1.05, shadow: [2, 3, 0.45] });
  const kh = div('s7-abs', host); kh.append(kv.cv); place(kh, 16, 14); kh.style.cursor = 'pointer'; kh.style.zIndex = '3';
  kh.addEventListener('pointerenter', () => { kv.hot(true); uiSfx('hover', 0.4); });
  kh.addEventListener('pointermove', (e) => kv.point(e.clientX, e.clientY));
  kh.addEventListener('pointerleave', () => kv.hot(false));
  kh.addEventListener('click', () => { kv.press(1); kv.poke(10); uiSfx('glass', 0.4); });
  // the medical stock, rolling
  const medIc = artCanvas(20, 20); place(medIc, 104, 26); host.append(medIc); medIc.getContext('2d')!.drawImage(iconOf('cross', 'red'), 0, 0, 20, 20);
  const mh = div('s7-abs', host); place(mh, 128, 22);
  const med = new Counter(mh, { size: 32 }); med.set(Math.round(st.supplies.medical), true);
  // a card per teammate
  const cards: { t: TM; el: HTMLDivElement; cv: HTMLCanvasElement; paint(): void; face: HTMLCanvasElement | null }[] = [];
  const ch = Math.floor((H - 96 - 12) / 2);
  live.forEach((t, i) => {
    const y = 92 + i * (ch + 8);
    const el = div('s7-abs', host); place(el, 10, y, W - 20, ch);
    const cv = artCanvas(W - 20, ch, ''); el.append(cv);
    const card = { t, el, cv, face: null as HTMLCanvasElement | null, paint: () => {} };
    card.paint = () => {
      const m = crew.member(t.id), dead = !t.alive || !m.alive;
      const q = new Px(W - 20, ch);
      q.blit(plate(W - 20, ch, { mat: 'steel', seed: 40 + i, chamfer: 3, wear: 0.8, lip: 2 }), 0, 0);
      // the photo well and the four gauges
      bevel(q, 8, 8, 52, 52, P.steel, { chamfer: 2, sunk: true });
      for (let yy = 10; yy < 58; yy++) for (let xx = 10; xx < 58; xx++) q.set(xx, yy, mixHex(0x2a3238, 0x4a5258, (yy - 10) / 48));
      const G: [number, number[]][] = [[t.hp / 100, [...P.ruby]], [t.suit / 100, [...P.sapphire]], [1 - t.hunger / 100, [...P.ochre]], [1 - t.fatigue / 100, [...P.glowTeal]]];
      G.forEach(([v, r], k) => cellBar(q, 92, 30 + k * 15, W - 20 - 92 - 92, 9, dead ? 0 : Math.max(0, Math.min(1, v)), r, 0));
      const c = cv.getContext('2d')!; c.imageSmoothingEnabled = false; c.putImageData(q.image(), 0, 0);
      if (card.face) { c.filter = dead ? 'grayscale(1) brightness(.6)' : 'none'; c.drawImage(card.face, 12, 12, 44, 44); c.filter = 'none'; }
      bitText(c, clean((m.short ?? t.name ?? t.id).toUpperCase()), 68, 8, { color: dead ? '#a09888' : '#ffe7a8' });
      ['heart', 'shield', 'wheat', 'moon'].forEach((ic, k) => c.drawImage(iconOf(ic, k === 0 ? 'red' : 'steel'), 70, 27 + k * 15, 14, 14));
      if (dead) { c.fillStyle = 'rgba(8,9,12,0.55)'; c.fillRect(0, 0, W - 20, ch); bitText(c, 'LOST', (W - 20) / 2, ch / 2 - 8, { color: '#c8b8a0', align: 'center' }); }
    };
    card.paint();
    setTimeout(() => { try { card.face = portrait(t.id); } catch { card.face = null; } card.paint(); }, 80 + i * 120);
    const key = keyCap(host, {
      label: 'HEAL', icon: iconOf('cross', 'red'), w: 84, h: 28, mat: 'enamel', sound: 'confirm',
      off: () => (!game ? 'ON THE SHIP' : !t.alive ? 'LOST' : t.hp >= 99 && t.fatigue < 15 ? 'WELL' : st.supplies.medical < 4 ? 'NO STOCK' : false),
      onClick: () => heal(card, key),
    });
    place(key.el, W - 20 - 84 - 4, y + ch - 36).style.position = 'absolute';
    cards.push(card);
  });
  const heal = (card: (typeof cards)[number], key: ReturnType<typeof keyCap>) => {
    const t = card.t;
    st.supplies.medical -= 4; saveShip(); med.set(Math.round(st.supplies.medical));
    // the kit flies down to the card and lands with a bounce
    const a = kh.getBoundingClientRect(), b = card.el.getBoundingClientRect();
    const dx = b.left + 30 * S - a.left, dy = b.top + 10 * S - a.top;
    kv.poke(16); uiSfx('swishIn', 0.6);
    void tween(460, (k) => { const arc = Math.sin(k * Math.PI) * -40 * S; kh.style.transform = `translate(${Math.round(dx * k)}px, ${Math.round(dy * k + arc)}px) scale(${1 - k * 0.35})`; }, ease.inCubic).then(() => {
      placeDust(b.left + 70 * S, b.top + 40 * S, 0.3, { ground: 'metal', layer: 'ui' });
      burst(b.left + 34 * S, b.top + 34 * S, { n: 18, ramp: P.malachite, kind: 'spark', layer: 'ui', up: 1 });
      uiSfx('glass', 0.5); setTimeout(() => uiSfx('confirm', 0.5), 120);
      const from = t.hp;
      t.hp = 100; t.fatigue = Math.max(0, t.fatigue - 40); t.morale = Math.min(100, t.morale + 6);
      floatUp(b.left + 34 * S, b.top, '+' + Math.round(100 - from), { color: '#b8f0a0', size: 32 });
      pop(card.el, 0.7); card.paint(); key.refresh();
      game?.emit?.('teammate-healed', { id: t.id });
      return tween(520, (k) => { kh.style.transform = `translate(${Math.round(dx * (1 - k))}px, ${Math.round(dy * (1 - k))}px) scale(${0.65 + k * 0.35})`; }, ease.outBack);
    }).then(() => { kh.style.transform = ''; uiSfx('thudLight', 0.4); });
  };
  let acc = 0;
  return {
    update(dt) { acc += dt; if (acc > 1) { acc = 0; for (const c of cards) c.paint(); } void shake; void hex; void INK; void chip; },
    dispose() { kv.dispose(); },
  };
}
