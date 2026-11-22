// SUPPLY (cargo hold, ship:fn:drops): request a supply capsule from the ship's stores. Each request is a real crate
// (a kit 3D element, outlined, turning on its pallet) with what it carries as item icons and counts, and its price in
// standing with the program (the mission's reputation, the stars). REQUEST: the crate drops out of the bay with a
// thud and dust, and the capsule comes down by the pod (game.mission.drop: the world flies it in and it lands in the
// stores). One capsule at a time.
import * as THREE from 'three';
import type { PanelCtx, Panel } from './index';
import { div, S, itemImg, clean } from '../ui';
import { icon3d } from '../icons3d';
import { panel, pkey, slot, meter, section, para, kv, status, bindTip, type Panel as KPanel, type PKey } from '../../../ui/kit/panel';
import { have } from '../../../research/util';
import { plate } from '../../../ui/kit/mat';
import { Px, P, INK, hex, mixHex } from '../../../ui/kit/px';
import { bitText } from '../../../ui/kit/bitfont';
import { uiSfx } from '../../../ui/kit/sound';
import { tween, ease, placeDust, pop, Counter, floatUp, shake } from '../../../ui/kit/juice';
import { ModelView, toon } from '../../../ui/kit/model3d';
import { mCrate } from '../../../ui/kit/models';
import { pick } from '../../../research/util';
import { ITEMS } from '../../../factory/items';

interface Req { name: string; icon: string; items: Record<string, number>; cost: number; tint: number }
const REQS = (): Req[] => [
  { name: 'PARTS', icon: 'gear', tint: 0xd8a060, cost: 8, items: { [pick('iron_plate')]: 10, [pick('iron_rod')]: 6, [pick('gear')]: 4 } },
  { name: 'WIRING', icon: 'arcs', tint: 0x7fb0d8, cost: 12, items: { [pick('copper_wire')]: 12, [pick('circuit')]: 3, [pick('glass')]: 2 } },
  { name: 'RATIONS', icon: 'wheat', tint: 0x9fd080, cost: 6, items: { [pick('fruit', 'berries')]: 12, [pick('water')]: 10, [pick('seed_grass', 'seeds')]: 6 } },
];
/** a supply crate on its pallet, its band painted the request's colour */
function crateModel(tint: number) {
  return () => {
    const g = new THREE.Group();
    const c = mCrate(); c.position.y = 0.12; g.add(c);
    const pal = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 1.1), toon({ color: 0x8a6a40 })); pal.position.y = 0.06; g.add(pal);
    for (const z of [-0.4, 0, 0.4]) { const s = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.05, 0.16), toon({ color: 0x6a4e2a })); s.position.set(0, 0.02, z); g.add(s); }
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.14, 1.06), toon({ color: tint, gloss: 0.4 })); band.position.y = 0.62; g.add(band);
    return g;
  };
}

export function supplyPanel(ctx: PanelCtx): Panel {
  const { host, game } = ctx;
  const M = game?.mission ?? null;
  // ---- standing with the program: what pays for capsules
  const rep = meter('STANDING', (M?.rep ?? 0) / 100, { w: 200, segs: 14, col: 'amber', value: Math.round(M?.rep ?? 0), unit: ' / 100' });
  host.append(rep.el);
  const st = status('', 'info'); host.append(st.el);
  let pending = false;
  const paintSt = () => st.set(!M ? 'No settlement: a capsule needs the pod to land by.' : pending ? 'A capsule is on its way down. It lands by the pod and its stock goes to the stores.' : 'Met orders raise standing; each capsule spends some.', !M ? 'warn' : pending ? 'busy' : 'info');
  paintSt();
  host.append(section('CAPSULES', 'FROM THE SHIP\'S STORES'));
  const reqs = REQS();
  const views: ModelView[] = [], keys: PKey[] = [], cards: KPanel[] = [];
  reqs.forEach((r, i) => {
    const p = panel({ title: `${r.name} CAPSULE`, tone: 'steel', lamps: ['amber'], hazard: false, glands: 0, foot: 10, cls: 's7-card7' });
    host.append(p.el); cards.push(p); p.el.style.marginBottom = '8px';
    const v = new ModelView(crateModel(r.tint), { w: 56, h: 50, scale: S, spin: 0.35, hotSpin: 2.4, pitch: 0.5, zoom: 1.05, shadow: [2, 3, 0.45] });
    views.push(v);
    const vh = div('', p.body); vh.style.flex = 'none'; vh.style.cursor = 'pointer'; vh.append(v.cv);
    vh.addEventListener('pointerenter', () => { v.hot(true); uiSfx('hover', 0.4); });
    vh.addEventListener('pointermove', (e) => v.point(e.clientX, e.clientY));
    vh.addEventListener('pointerleave', () => v.hot(false));
    vh.addEventListener('click', () => { v.press(1); v.poke(9); uiSfx('thudLight', 0.5); });
    const col = div('', p.body); col.style.flex = '1'; col.style.minWidth = '0';
    col.append(kv('Cost', r.cost, { unit: 'standing', color: (M?.rep ?? 0) >= r.cost ? '#b8e0a0' : '#ff9a80' }).el);
    const list = div('s7-keys', col); list.style.margin = '4px 0';
    for (const [id, n] of Object.entries(r.items)) {
      if (!ITEMS[id]) continue;
      const sl = slot(40, { title: clean(ITEMS[id].name) }); const ic = itemImg(id, 32).cloneNode() as HTMLImageElement; ic.style.width = ic.style.height = '28px'; ic.style.imageRendering = 'pixelated';
      sl.set({ icon: ic, count: n, state: 1 }); list.append(sl.el);
      bindTip(sl.el, () => ({ title: clean(ITEMS[id].name), sub: `${n} in this capsule`, rows: [['In your stores', game ? have(game, id) : '--']] }));
    }
    col.append(para(Object.entries(r.items).filter(([id]) => ITEMS[id]).map(([id, n]) => `${n} x ${clean(ITEMS[id].name)}`).join(', ') + '.', { dim: true }));
    const key = pkey('REQUEST', () => request(i, vh, v), { tone: 'yellow', lamp: 'amber', sound: 'confirm', icon: icon3d('crate', 22) });
    col.append(key); keys.push(key);
  });
  const keyState = () => reqs.forEach((r, i) => keys[i].setDisabled(!M || pending || (M.rep ?? 0) < r.cost));
  keyState();
  const request = (i: number, vh: HTMLElement, v: ModelView) => {
    if (!M) return;
    const r = reqs[i];
    M.rep = Math.max(0, (M.rep ?? 0) - r.cost); rep.set(M.rep / 100, Math.round(M.rep));
    pending = true; paintSt(); keyState();
    const items: Record<string, number> = {}; for (const [id, n] of Object.entries(r.items)) if (ITEMS[id]) items[id] = n;
    v.press(1.4); uiSfx('winch', 0.6);
    const rr = vh.getBoundingClientRect();
    void tween(380, (k) => { vh.style.transform = `translateY(${Math.round(-k * 60)}px) scale(${1 - k * 0.3})`; vh.style.opacity = String(1 - k); }, ease.inBack).then(() => {
      uiSfx('swishOut', 0.6);
      floatUp(rr.left + rr.width / 2, rr.top, 'CAPSULE AWAY', { color: '#ffe7a8', size: 16 });
      try { M.drop(items); } catch (e) { console.error('supply drop', e); }
      setTimeout(() => { vh.style.transform = 'translateY(-40px)'; vh.style.opacity = '0'; void tween(420, (k) => { vh.style.transform = `translateY(${Math.round((1 - k) * -40)}px)`; vh.style.opacity = String(k); }, ease.outBounce).then(() => { vh.style.transform = ''; placeDust(rr.left + rr.width / 2, rr.bottom - 6, 0.55, { ground: 'metal', layer: 'ui' }); pop(vh, 0.6); }); }, 900);
      setTimeout(() => { pending = false; paintSt(); keyState(); }, 8000);
    });
    ctx.shake(0.6);
  };
  return {
    update() { if (M && Math.round(M.rep) !== Math.round(lastRep)) { lastRep = M.rep; rep.set(M.rep / 100, Math.round(M.rep)); keyState(); } },
    dispose() { for (const v of views) v.dispose(); for (const c of cards) c.dispose(); },
  };
}
let lastRep = -1;
