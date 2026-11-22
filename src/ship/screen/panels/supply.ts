// SUPPLY (cargo hold, ship:fn:drops): request a supply capsule from the ship's stores. Each request is a real crate
// (a kit 3D element, outlined, turning on its pallet) with what it carries as item icons and counts, and its price in
// standing with the program (the mission's reputation, the stars). REQUEST: the crate drops out of the bay with a
// thud and dust, and the capsule comes down by the pod (game.mission.drop: the world flies it in and it lands in the
// stores). One capsule at a time.
import * as THREE from 'three';
import type { PanelCtx, Panel } from './index';
import { div, place, artCanvas, S, keyCap, chip, iconOf, itemImg } from '../ui';
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
  const { w: W, h: H, host, game } = ctx;
  const M = game?.mission ?? null;
  const bg = artCanvas(W, H); host.append(bg);
  const p = plate(W, H, { mat: 'olive', seed: 13, chamfer: 3, wear: 1, screws: true, grime: 0.9, hazard: 8 });
  p.blit(plate(W - 20, 34, { mat: 'enamel', seed: 4, chamfer: 2, wear: 0.6, lip: 1 }), 10, 8);
  bg.getContext('2d')!.putImageData(p.image(), 0, 0);
  // the standing with the program: stars and a rolling number
  const star = artCanvas(22, 22); place(star, 16, 14); host.append(star); star.getContext('2d')!.drawImage(iconOf('shield', 'amber'), 0, 0, 22, 22);
  const repHost = div('s7-abs', host); place(repHost, 42, 12);
  const rep = new Counter(repHost, { size: 32 });
  rep.set(Math.round(M?.rep ?? 0), true);
  const flight = div('s7-abs k7-t16', host); place(flight, W - 120, 20); flight.style.color = '#3a2a14'; flight.style.textShadow = 'none';
  const inFlight = () => !!M?.drops?.some((d: { t: number }) => d.t < 999 && !(d as { done?: boolean }).done) && pending;
  let pending = false;
  const reqs = REQS();
  const rowH = Math.floor((H - 56 - 12) / reqs.length);
  const views: ModelView[] = [], keys: ReturnType<typeof keyCap>[] = [];
  reqs.forEach((r, i) => {
    const y = 50 + i * rowH;
    const shelf = artCanvas(W - 20, rowH - 6); place(shelf, 10, y); host.append(shelf);
    const sp = new Px(W - 20, rowH - 6);
    const pl = plate(W - 20, rowH - 6, { mat: 'steel', seed: 20 + i, chamfer: 3, wear: 0.7, lip: 2, grime: 0.5 });
    sp.blit(pl, 0, 0);
    // a painted floor under the crate: the lit pad
    for (let yy = rowH - 22; yy < rowH - 10; yy++) for (let xx = 8; xx < 82; xx++) { const d = Math.hypot((xx - 45) / 37, (yy - (rowH - 16)) / 6); if (d < 1) sp.set(xx, yy, mixHex(P.steel[1], P.steel[3], 1 - d)); }
    shelf.getContext('2d')!.putImageData(sp.image(), 0, 0);
    const sc = shelf.getContext('2d')!;
    bitText(sc, r.name, 92, 6, { color: '#f2ead2' });
    // the crate itself, a live 3D element
    const v = new ModelView(crateModel(r.tint), { w: 76, h: rowH - 12, scale: S, spin: 0.35, hotSpin: 2.4, pitch: 0.5, zoom: 1.05, shadow: [2, 3, 0.45] });
    views.push(v);
    const vh = div('s7-abs', host); vh.append(v.cv); place(vh, 16, y + 2); vh.style.cursor = 'pointer';
    vh.addEventListener('pointerenter', () => { v.hot(true); uiSfx('hover', 0.4); });
    vh.addEventListener('pointermove', (e) => v.point(e.clientX, e.clientY));
    vh.addEventListener('pointerleave', () => v.hot(false));
    vh.addEventListener('click', () => { v.press(1); v.poke(9); uiSfx('thudLight', 0.5); });
    // what it carries
    const items = div('s7-abs', host); place(items, 100, y + 24, W - 130); items.style.display = 'flex'; items.style.gap = 2 * S + 'px'; items.style.flexWrap = 'wrap';
    for (const [id, n] of Object.entries(r.items)) if (ITEMS[id]) items.append(chip(itemImg(id, 32), String(n)));
    // the price and the key
    const price = chip(iconOf('shield', 'amber'), String(r.cost), { ok: (M?.rep ?? 0) >= r.cost });
    const ph = div('s7-abs', host); ph.append(price); place(ph, 100, y + rowH - 36);
    const key = keyCap(host, {
      label: 'REQUEST', w: 96, h: 28, mat: 'orange', sound: 'confirm',
      off: () => (!M ? 'NO COLONY' : pending ? 'IN FLIGHT' : (M.rep ?? 0) < r.cost ? 'LOW STANDING' : false),
      onClick: () => request(i, vh, v),
    });
    place(key.el, W - 116, y + rowH - 40).style.position = 'absolute';
    keys.push(key);
  });
  const request = (i: number, vh: HTMLElement, v: ModelView) => {
    if (!M) return;
    const r = reqs[i];
    M.rep = Math.max(0, (M.rep ?? 0) - r.cost); rep.set(Math.round(M.rep));
    pending = true;
    const items: Record<string, number> = {}; for (const [id, n] of Object.entries(r.items)) if (ITEMS[id]) items[id] = n;
    // the crate is lifted out of the bay, then the capsule goes
    v.press(1.4); uiSfx('winch', 0.6);
    const rr = vh.getBoundingClientRect();
    void tween(380, (k) => { vh.style.transform = `translateY(${Math.round(-k * 30) * S}px) scale(${1 - k * 0.3})`; vh.style.opacity = String(1 - k); }, ease.inBack).then(() => {
      uiSfx('swishOut', 0.6);
      floatUp(rr.left + rr.width / 2, rr.top, 'v', { color: '#ffe7a8', size: 32 });
      try { M.drop(items); } catch (e) { console.error('supply drop', e); }
      setTimeout(() => { vh.style.transform = 'translateY(-40px)'; vh.style.opacity = '0'; void tween(420, (k) => { vh.style.transform = `translateY(${Math.round((1 - k) * -20) * S}px)`; vh.style.opacity = String(k); }, ease.outBounce).then(() => { vh.style.transform = ''; placeDust(rr.left + rr.width / 2, rr.bottom - 6, 0.55, { ground: 'metal', layer: 'ui' }); pop(vh, 0.6); }); }, 900);
      setTimeout(() => { pending = false; keys.forEach((k) => k.refresh()); }, 8000);
      keys.forEach((k) => k.refresh());
    });
    ctx.shake(0.6);
  };
  let t = 0;
  return {
    update(dt) {
      t += dt;
      const f = pending ? 'IN FLIGHT' : '';
      if (flight.textContent !== f) { flight.textContent = f; if (f) pop(flight, 0.8); }
      if (M && Math.round(M.rep) !== rep.value) rep.set(Math.round(M.rep));
      void inFlight; void hex; void INK; void shake;
    },
    dispose() { for (const v of views) v.dispose(); },
  };
}
