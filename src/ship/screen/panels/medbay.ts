// THE MEDBAY (ship:fn:heal): the two teammates on the surface on a lit triage board, each with their portrait
// rendered from their own rig and their state as cell gauges with icons (health, suit, hunger, sleep). The ship's
// field medkit is a kit 3D element on the shelf; HEAL sends it down: the kit flies to the teammate's card, lands with a
// bounce and dust, and their health fills (the ship's medical stock pays for it).
import * as THREE from 'three';
import type { PanelCtx, Panel } from './index';
import { div, place, artCanvas, S, keyCap, iconOf, clean, textEl } from '../ui';
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

const word = (k: 'hp' | 'suit' | 'hunger' | 'fatigue' | 'morale', v: number): string => {
  if (k === 'hp') return v > 90 ? 'Healthy' : v > 60 ? 'Bruised' : v > 30 ? 'Injured' : 'Critical';
  if (k === 'suit') return v > 85 ? 'Sealed' : v > 50 ? 'Scuffed' : v > 20 ? 'Leaking' : 'Breached';
  if (k === 'hunger') return v < 25 ? 'Fed' : v < 55 ? 'Peckish' : v < 80 ? 'Hungry' : 'Starving';
  if (k === 'fatigue') return v < 25 ? 'Rested' : v < 55 ? 'Tired' : v < 80 ? 'Exhausted' : 'Collapsing';
  return v > 70 ? 'Good spirits' : v > 45 ? 'Steady' : v > 25 ? 'Low' : 'Breaking';
};
export function medbayPanel(ctx: PanelCtx): Panel {
  const { w: W, h: H, host, game } = ctx;
  const live: TM[] = (game?.colony?.teammates as TM[] | undefined) ?? TEAMMATES.map((id) => ({ id, hp: 100, suit: 100, hunger: 10, fatigue: 10, morale: 75, alive: crew.alive(id) }));
  const st = shipState();
  const bg = artCanvas(W, H); host.append(bg);
  const p = plate(W, H, { mat: 'enamel', seed: 61, chamfer: 3, wear: 0.7, screws: true, grime: 0.5 });
  p.blit(plate(W - 16, 70, { mat: 'steel', seed: 6, chamfer: 3, wear: 0.6, lip: 2 }), 8, 6);
  bg.getContext('2d')!.putImageData(p.image(), 0, 0);
  // ---- the field medkit on its shelf and the medical stock
  const kv = new ModelView(medkit, { w: 64, h: 56, scale: S, spin: 0.5, hotSpin: 3, pitch: 0.5, zoom: 1.05, shadow: [2, 3, 0.45] });
  const kh = div('s7-abs', host); kh.append(kv.cv); place(kh, 12, 10); kh.style.cursor = 'pointer'; kh.style.zIndex = '3';
  kh.addEventListener('pointerenter', () => { kv.hot(true); uiSfx('hover', 0.4); });
  kh.addEventListener('pointermove', (e) => kv.point(e.clientX, e.clientY));
  kh.addEventListener('pointerleave', () => kv.hot(false));
  kh.addEventListener('click', () => { kv.press(1); kv.poke(10); uiSfx('glass', 0.4); });
  const info = div('s7-abs', host); place(info, 82, 10, W - 98); info.style.display = 'flex'; info.style.flexDirection = 'column'; info.style.gap = '0';
  const stockRow = div(''); stockRow.style.display = 'flex'; stockRow.style.alignItems = 'baseline'; stockRow.style.gap = 2 * S + 'px';
  const medHost = div(''); const med = new Counter(medHost, { size: 32 }); med.set(Math.round(st.supplies.medical), true);
  stockRow.append(textEl('MEDICAL STOCK', { color: '#ffe7a8', wrap: false }), medHost, textEl('units', { color: '#d8ccb0', wrap: false }));
  info.append(stockRow, textEl('HEAL uses 4 units: health to full, fatigue down by 40, a little morale.', { color: '#d8ccb0' }));
  // ---- a card per teammate: portrait, name and role, each condition as a gauge, a value and a word
  const cards: { t: TM; el: HTMLDivElement; cv: HTMLCanvasElement; paint(): void; face: HTMLCanvasElement | null }[] = [];
  const y0 = 84, ch = Math.floor((H - y0 - 8 - 6) / 2);
  live.forEach((t, i) => {
    const y = y0 + i * (ch + 6);
    const el = div('s7-abs', host); place(el, 8, y, W - 16, ch);
    const cv = artCanvas(W - 16, ch, ''); el.append(cv);
    const col = div('s7-abs', el); place(col, 58, 4, W - 16 - 62); col.style.display = 'flex'; col.style.flexDirection = 'column'; col.style.gap = '0';
    const card = { t, el, cv, face: null as HTMLCanvasElement | null, paint: () => {} };
    const GW = 58, gx = 100;
    card.paint = () => {
      const m = crew.member(t.id), dead = !t.alive || !m.alive;
      const q = new Px(W - 16, ch);
      q.blit(plate(W - 16, ch, { mat: 'steel', seed: 40 + i, chamfer: 3, wear: 0.8, lip: 2 }), 0, 0);
      bevel(q, 6, 6, 46, 46, P.steel, { chamfer: 2, sunk: true });
      for (let yy = 8; yy < 50; yy++) for (let xx = 8; xx < 50; xx++) q.set(xx, yy, mixHex(0x2a3238, 0x4a5258, (yy - 8) / 42));
      const G: [number, readonly number[]][] = [[t.hp / 100, P.ruby], [t.suit / 100, P.sapphire], [1 - t.hunger / 100, P.ochre], [1 - t.fatigue / 100, P.glowTeal], [t.morale / 100, P.malachite]];
      G.forEach(([v, r], k) => cellBar(q, gx, 24 + k * 9, GW, 6, dead ? 0 : Math.max(0, Math.min(1, v)), r, 0));
      const c = cv.getContext('2d')!; c.imageSmoothingEnabled = false; c.putImageData(q.image(), 0, 0);
      if (card.face) { c.filter = dead ? 'grayscale(1) brightness(.6)' : 'none'; c.drawImage(card.face, 10, 10, 38, 38); c.filter = 'none'; }
      const rows: [string, string, 'hp' | 'suit' | 'hunger' | 'fatigue' | 'morale', number][] = [['heart', 'Health', 'hp', t.hp], ['shield', 'Suit', 'suit', t.suit], ['wheat', 'Hunger', 'hunger', t.hunger], ['moon', 'Fatigue', 'fatigue', t.fatigue], ['heart', 'Morale', 'morale', t.morale]];
      const lines: HTMLElement[] = [textEl(`${clean(m.name)}`, { color: dead ? '#a09888' : '#ffe7a8', wrap: false }), textEl(`${clean(m.role)}${dead ? ', LOST' : ', on the surface'}`, { color: '#c8c0a8', wrap: false })];
      for (const [, name, k, v] of rows) {
        const r = div(''); r.style.display = 'flex'; r.style.gap = 2 * S + 'px'; r.style.height = 9 * S + 'px';
        const a = textEl(name, { color: '#c8c0a8', wrap: false }); a.style.width = 40 * S + 'px';
        const sp = div(''); sp.style.width = (GW + 2) * S + 'px';
        const b = textEl(`${Math.round(v)}%`, { color: '#e8dcc0', wrap: false }); b.style.width = 26 * S + 'px'; b.style.textAlign = 'right';
        const bad = k === 'hp' || k === 'suit' || k === 'morale' ? v < 45 : v > 55;
        r.append(a, sp, b, textEl(dead ? '--' : word(k, v), { color: bad ? '#ff9a80' : '#b8e0a0', wrap: false }));
        lines.push(r);
      }
      col.replaceChildren(...lines);
      // what needs doing, in one line
      const need: string[] = [];
      if (!dead) { if (t.hp < 60) need.push('treat the injuries'); if (t.fatigue > 55) need.push('rest'); if (t.hunger > 55) need.push('food'); if (t.suit < 50) need.push('suit repair at the pod'); }
      const tail = textEl(dead ? 'Beyond help.' : need.length ? `Needs: ${need.join(', ')}.` : 'Fit for work.', { color: dead ? '#a09888' : need.length ? '#ffc890' : '#b8e0a0' });
      col.append(tail);
    };
    card.paint();
    setTimeout(() => { try { card.face = portrait(t.id); } catch { card.face = null; } card.paint(); }, 80 + i * 120);
    const key = keyCap(host, {
      label: 'HEAL', icon: iconOf('cross', 'red'), w: 78, h: 26, mat: 'enamel', sound: 'confirm',
      off: () => (!game ? 'ON THE SHIP' : !t.alive ? 'LOST' : t.hp >= 99 && t.fatigue < 15 ? 'WELL' : st.supplies.medical < 4 ? 'NO STOCK' : false),
      onClick: () => heal(card, key),
    });
    place(key.el, 8 + 4, y + ch - 32).style.position = 'absolute';
    cards.push(card);
  });
  const heal = (card: (typeof cards)[number], key: ReturnType<typeof keyCap>) => {
    const t = card.t;
    st.supplies.medical -= 4; saveShip(); med.set(Math.round(st.supplies.medical));
    const a = kh.getBoundingClientRect(), b = card.el.getBoundingClientRect();
    const dx = b.left + 20 * S - a.left, dy = b.top + 6 * S - a.top;
    kv.poke(16); uiSfx('swishIn', 0.6);
    void tween(460, (k) => { const arc = Math.sin(k * Math.PI) * -40 * S; kh.style.transform = `translate(${Math.round(dx * k)}px, ${Math.round(dy * k + arc)}px) scale(${1 - k * 0.35})`; }, ease.inCubic).then(() => {
      placeDust(b.left + 60 * S, b.top + 40 * S, 0.3, { ground: 'metal', layer: 'ui' });
      burst(b.left + 28 * S, b.top + 28 * S, { n: 18, ramp: P.malachite, kind: 'spark', layer: 'ui', up: 1 });
      uiSfx('glass', 0.5); setTimeout(() => uiSfx('confirm', 0.5), 120);
      const from = t.hp;
      t.hp = 100; t.fatigue = Math.max(0, t.fatigue - 40); t.morale = Math.min(100, t.morale + 6);
      floatUp(b.left + 28 * S, b.top, `+${Math.round(100 - from)} HEALTH`, { color: '#b8f0a0', size: 16 });
      pop(card.el, 0.7); card.paint(); key.refresh();
      game?.emit?.('teammate-healed', { id: t.id });
      return tween(520, (k) => { kh.style.transform = `translate(${Math.round(dx * (1 - k))}px, ${Math.round(dy * (1 - k))}px) scale(${0.65 + k * 0.35})`; }, ease.outBack);
    }).then(() => { kh.style.transform = ''; uiSfx('thudLight', 0.4); });
  };
  let acc = 0;
  return {
    update(dt) { acc += dt; if (acc > 1) { acc = 0; for (const c of cards) c.paint(); } },
    dispose() { kv.dispose(); },
  };
}
