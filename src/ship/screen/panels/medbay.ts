// THE MEDBAY (ship:fn:heal): the two teammates on the surface on a lit triage board, each with their portrait
// rendered from their own rig and their state as cell gauges with icons (health, suit, hunger, sleep). The ship's
// field medkit is a kit 3D element on the shelf; HEAL sends it down: the kit flies to the teammate's card, lands with a
// bounce and dust, and their health fills (the ship's medical stock pays for it).
import * as THREE from 'three';
import type { PanelCtx, Panel } from './index';
import { div, S, clean } from '../ui';
import { icon3d, mMedkit } from '../icons3d';
import { panel, pkey, meter, section, para, status, type Panel as KPanel, type PKey } from '../../../ui/kit/panel';
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
  const { host, game } = ctx;
  const live: TM[] = (game?.colony?.teammates as TM[] | undefined) ?? TEAMMATES.map((id) => ({ id, hp: 100, suit: 100, hunger: 10, fatigue: 10, morale: 75, alive: crew.alive(id) }));
  const st = shipState();
  // ---- the field medkit (a live 3D element) and the medical stock
  const topRow = div('s7-row-top', host);
  const kv3 = new ModelView(mMedkit, { w: 56, h: 48, scale: S, spin: 0.5, hotSpin: 3, pitch: 0.5, zoom: 1.05, shadow: [2, 3, 0.45] });
  const kh = div('', topRow); kh.append(kv3.cv); kh.style.cursor = 'pointer'; kh.style.flex = 'none'; kh.style.position = 'relative'; kh.style.zIndex = '3';
  kh.addEventListener('pointerenter', () => { kv3.hot(true); uiSfx('hover', 0.4); });
  kh.addEventListener('pointermove', (e) => kv3.point(e.clientX, e.clientY));
  kh.addEventListener('pointerleave', () => kv3.hot(false));
  kh.addEventListener('click', () => { kv3.press(1); kv3.poke(10); uiSfx('glass', 0.4); });
  const right = div('', topRow); right.style.flex = '1';
  const stock = meter('MEDICAL STOCK', Math.min(1, st.supplies.medical / 60), { w: 180, segs: 12, col: 'red', value: Math.round(st.supplies.medical), unit: ' u' });
  right.append(stock.el, para('HEAL uses 4 units: health to full, fatigue down by 40, a little morale.', { dim: true }));
  host.append(section('ON THE SURFACE', `${live.filter((t) => t.alive).length} ALIVE`));
  const cards: { t: TM; p: KPanel; paint(): void; face: HTMLCanvasElement | null; key: PKey }[] = [];
  live.forEach((t, i) => {
    const p = panel({ tone: 'steel', head: 8, foot: 8, side: 6, lamps: [], hazard: false, glands: 0, vents: false, guards: false, cls: 's7-card7' });
    host.append(p.el); p.el.style.marginBottom = '8px';
    const ph = document.createElement('canvas'); ph.width = ph.height = 36; ph.style.width = ph.style.height = '72px'; ph.style.imageRendering = 'pixelated'; ph.style.flex = 'none'; ph.style.background = '#2a3036'; ph.style.boxShadow = 'inset 0 0 0 2px #08090c';
    const col = div('', p.body); col.style.flex = '1'; col.style.minWidth = '0';
    p.body.prepend(ph);
    const card = { t, p, face: null as HTMLCanvasElement | null, paint: () => {}, key: null as unknown as PKey };
    card.paint = () => {
      const m = crew.member(t.id), dead = !t.alive || !m.alive;
      const c = ph.getContext('2d')!; c.imageSmoothingEnabled = false; c.clearRect(0, 0, 36, 36);
      if (card.face) { c.filter = dead ? 'grayscale(1) brightness(.6)' : 'none'; c.drawImage(card.face, 0, 0, 36, 36); c.filter = 'none'; }
      const name = para(clean(m.name)); name.style.color = dead ? '#9a9488' : '#ffe39a'; name.style.margin = '0';
      const rows: HTMLElement[] = [name, para(`${clean(m.role)}${dead ? ', lost' : ', on the surface'}`, { dim: true })];
      const G: [string, 'hp' | 'suit' | 'hunger' | 'fatigue' | 'morale', number, number, 'red' | 'teal' | 'amber' | 'green' | 'white'][] = [['HEALTH', 'hp', t.hp, t.hp, 'red'], ['SUIT', 'suit', t.suit, t.suit, 'teal'], ['HUNGER', 'hunger', t.hunger, 100 - t.hunger, 'amber'], ['FATIGUE', 'fatigue', t.fatigue, 100 - t.fatigue, 'white'], ['MORALE', 'morale', t.morale, t.morale, 'green']];
      for (const [lab, k, v, fill, colr] of G) {
        const r = div('s7-row-top');
        const mt = meter(lab, dead ? 0 : fill / 100, { w: 110, segs: 10, col: colr, value: `${Math.round(v)}%` }); mt.el.style.flex = '1';
        const bad = k === 'hp' || k === 'suit' || k === 'morale' ? v < 45 : v > 55;
        const w = para(dead ? '--' : word(k, v)); w.style.margin = '0'; w.style.width = '86px'; w.style.color = bad ? '#ff9a80' : '#b8e0a0';
        r.append(mt.el, w); rows.push(r);
      }
      const need: string[] = [];
      if (!dead) { if (t.hp < 60) need.push('treat the injuries'); if (t.fatigue > 55) need.push('rest'); if (t.hunger > 55) need.push('food'); if (t.suit < 50) need.push('suit repair at the pod'); }
      rows.push(status(dead ? 'Beyond help.' : need.length ? `Needs: ${need.join(', ')}.` : 'Fit for work.', dead ? 'bad' : need.length ? 'warn' : 'ok').el);
      col.replaceChildren(...rows);
      if (card.key) col.append(card.key);
      card.key?.setDisabled(!game || dead || (t.hp >= 99 && t.fatigue < 15) || st.supplies.medical < 4);
    };
    card.key = pkey('HEAL', () => heal(card), { tone: 'cream', lamp: 'red', sound: 'confirm', icon: icon3d('medkit', 22) });
    card.paint();
    setTimeout(() => { try { card.face = portrait(t.id); } catch { card.face = null; } card.paint(); }, 80 + i * 120);
    cards.push(card);
  });
  const heal = (card: (typeof cards)[number]) => {
    const t = card.t;
    st.supplies.medical -= 4; saveShip(); stock.set(Math.min(1, st.supplies.medical / 60), Math.round(st.supplies.medical));
    const a = kh.getBoundingClientRect(), b = card.p.el.getBoundingClientRect();
    const dx = b.left + 40 - a.left, dy = b.top + 20 - a.top;
    kv3.poke(16); uiSfx('swishIn', 0.6);
    void tween(460, (k) => { const arc = Math.sin(k * Math.PI) * -80; kh.style.transform = `translate(${Math.round(dx * k)}px, ${Math.round(dy * k + arc)}px) scale(${1 - k * 0.35})`; }, ease.inCubic).then(() => {
      placeDust(b.left + 120, b.top + 80, 0.3, { ground: 'metal', layer: 'ui' });
      burst(b.left + 56, b.top + 56, { n: 18, ramp: P.malachite, kind: 'spark', layer: 'ui', up: 1 });
      uiSfx('glass', 0.5); setTimeout(() => uiSfx('confirm', 0.5), 120);
      const from = t.hp;
      t.hp = 100; t.fatigue = Math.max(0, t.fatigue - 40); t.morale = Math.min(100, t.morale + 6);
      floatUp(b.left + 56, b.top, `+${Math.round(100 - from)} HEALTH`, { color: '#b8f0a0', size: 16 });
      pop(card.p.el, 0.5); card.paint();
      game?.emit?.('teammate-healed', { id: t.id });
      return tween(520, (k) => { kh.style.transform = `translate(${Math.round(dx * (1 - k))}px, ${Math.round(dy * (1 - k))}px) scale(${0.65 + k * 0.35})`; }, ease.outBack);
    }).then(() => { kh.style.transform = ''; uiSfx('thudLight', 0.4); });
  };
  let acc = 0;
  return {
    update(dt) { acc += dt; if (acc > 2) { acc = 0; for (const c of cards) c.paint(); } },
    dispose() { kv3.dispose(); for (const c of cards) c.p.dispose(); },
  };
}
