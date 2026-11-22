// The ship's smaller functions, in the kit's machine panels:
//   ORDERS (bridge, ship:fn:quotas)    the program's directives: what each asks for (have / need), time left, the reward,
//                                      TRANSMIT when met; standing and strikes on meters
//   STUDY (lab, ship:fn:study)         specimens in the stores sent up for study: what each turns into
//   POWER (engineering, ship:fn:orbit) the reactor's bus on five meters with - / + keys (a starved deck dims)
//   PODS (hangar, ship:fn:pods)        the pod (a live 3D element), its arms and drones with their state
//   UNIT 07 (AI core, ship:fn:link)    the core (a live 3D element): save the colony, the link's numbers
import * as THREE from 'three';
import type { PanelCtx, Panel } from './index';
import { div, S, itemImg, clean } from '../ui';
import { icon3d, mPod } from '../icons3d';
import { panel, pkey, slot, meter, section, para, kv, status, type Panel as KPanel } from '../../../ui/kit/panel';
import { P } from '../../../ui/kit/px';
import { uiSfx } from '../../../ui/kit/sound';
import { burst, floatUp, shake } from '../../../ui/kit/juice';
import { ModelView, toon } from '../../../ui/kit/model3d';
import { ITEMS } from '../../../factory/items';
import { have, pay } from '../../../research/util';
import { shipState, setPower, type ShipState } from '../../hub/shipState';

const KNOW: Record<string, string> = { bio: 'Bio knowledge', geo: 'Geo knowledge', energy: 'Energy knowledge', xeno: 'Xeno knowledge' };
const none = (host: HTMLElement, what: string) => host.append(status(what, 'warn').el);
const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

// ------------------------------------------------------------------ ORDERS
export function ordersPanel(ctx: PanelCtx): Panel {
  const { host, game } = ctx;
  const M = game?.mission;
  if (!M) { none(host, 'No colony: the program sends orders once a pod is down.'); return { dispose() {} }; }
  const rep = meter('STANDING', M.rep / 100, { w: 180, segs: 12, col: 'amber', value: Math.round(M.rep), unit: ' / 100' });
  const strikes = meter('STRIKES', M.strikes / 3, { w: 90, segs: 3, col: 'red', value: `${M.strikes} / 3` });
  host.append(rep.el, strikes.el, para('Three missed orders and the program recalls the mission. Meeting one early raises standing more.', { dim: true }));
  const list = div('', host);
  const cards: KPanel[] = [];
  const build = () => {
    for (const c of cards) c.dispose(); cards.length = 0; list.replaceChildren();
    const qs = [...M.open(), ...M.quotas.filter((q: any) => q.state !== 'open').slice(-2)].slice(0, 4);
    if (!qs.length) { list.append(status('No orders right now. The next one arrives soon.', 'info').el); return; }
    for (const q of qs) {
      const p = panel({ title: clean(String(q.title ?? 'ORDER')).toUpperCase().slice(0, 28), tone: q.state === 'open' ? 'steel' : 'dark', lamps: [q.state === 'met' ? 'green' : q.state === 'missed' ? 'red' : 'amber'], hazard: false, glands: 0, foot: 10 });
      p.el.style.marginBottom = '8px'; list.append(p.el); cards.push(p);
      p.body.style.display = 'block';
      if (q.brief) p.text(clean(q.brief), { dim: true });
      const now = game.world?.time ?? 0;
      if (q.kind === 'data') for (const k in q.data) { const h = Math.floor(game.research?.data?.[k] ?? 0); p.kv(KNOW[k] ?? k, `${h} / ${q.data[k]}`, { color: h >= q.data[k] ? '#b8e0a0' : '#ff9a80' }); }
      else if (q.kind === 'items') for (const id in q.items) { const h = have(game, id); p.kv(clean(ITEMS[id]?.name ?? id), `${h} / ${q.items[id]}`, { color: h >= q.items[id] ? '#b8e0a0' : '#ff9a80' }); }
      else if (q.milestone) p.kv('Goal', clean(q.milestone.label));
      const rw = Object.entries(q.reward?.items ?? {}).filter(([id]) => ITEMS[id]).map(([id, n]) => `${n} ${clean(ITEMS[id].name)}`).join(', ');
      if (rw) p.kv('Reward', rw, { color: '#ffe39a' });
      if (q.state === 'open') {
        p.kv('Time left', mmss(q.due - now), { color: q.due - now < 90 ? '#ff9a80' : '#f2ecd4', bar: Math.max(0, Math.min(1, (q.due - now) / Math.max(1, q.due - q.issued))), barCol: '#e8a83a' });
        const ok = M.progress(q).ok;
        const k = pkey('TRANSMIT', () => send(q, p.el), { tone: 'yellow', lamp: ok ? 'green' : 'red', sound: 'confirm' }); k.setDisabled(!ok);
        p.status(ok ? 'Ready: TRANSMIT sends it up now.' : 'Not met yet.', ok ? 'ok' : 'info');
        p.body.append(k);
      } else p.status(q.state === 'met' ? 'Met and sent.' : 'Missed: a strike.', q.state === 'met' ? 'ok' : 'bad');
    }
  };
  const send = (q: any, el: HTMLElement) => {
    if (!M.transmit(q.id)) { uiSfx('error', 0.5); shake(el, 4); return; }
    uiSfx('bong', 0.6); ctx.shake(0.8);
    const r = el.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, { n: 24, ramp: P.glowAmber, kind: 'spark', layer: 'ui' });
    floatUp(r.left + r.width / 2, r.top, 'SENT', { color: '#ffe7a8', size: 32 });
    rep.set(M.rep / 100, Math.round(M.rep)); setTimeout(build, 400);
  };
  build();
  let acc = 0;
  return { update(dt) { acc += dt; if (acc > 2) { acc = 0; build(); rep.set(M.rep / 100, Math.round(M.rep)); strikes.set(M.strikes / 3, `${M.strikes} / 3`); } }, dispose() { for (const c of cards) c.dispose(); } };
}

// ------------------------------------------------------------------ STUDY
const SPECIMENS = ['specimen', 'tissue', 'blood_sample', 'egg', 'embryo', 'plant_cutting', 'venom_gland', 'seed_crystal', 'lumen_crystal', 'crystal'];
export function studyPanel(ctx: PanelCtx): Panel {
  const { host, game } = ctx;
  const know = div('', host);
  const paintKnow = () => { const d = game?.research?.data ?? { bio: 0, geo: 0, energy: 0, xeno: 0 }; know.replaceChildren(section('KNOWLEDGE'), ...['bio', 'geo', 'energy', 'xeno'].map((k) => kv(KNOW[k], Math.floor(d[k] ?? 0)).el)); };
  paintKnow();
  if (!game) { none(host, 'No colony: specimens come up from the surface.'); return { dispose() {} }; }
  host.append(section('SPECIMENS IN THE STORES'));
  const list = div('', host);
  const gain = (id: string): [string, number][] => (/crystal/.test(id) ? [['geo', 3], ['xeno', 2]] : /seed|plant/.test(id) ? [['bio', 3]] : [['bio', 4], ['xeno', 1]]);
  const rows = () => {
    list.replaceChildren();
    const ids = SPECIMENS.filter((id) => ITEMS[id] && have(game, id) > 0);
    if (!ids.length) { list.append(status('No specimens yet. Sample creatures and plants on the surface with the sampler tool.', 'info').el); return; }
    for (const id of ids.slice(0, 6)) {
      const r = div('s7-row-top', list); r.style.marginBottom = '6px';
      const sl = slot(44, { title: clean(ITEMS[id].name) }); const ic = itemImg(id, 32).cloneNode() as HTMLImageElement; ic.style.width = ic.style.height = '32px'; sl.set({ icon: ic, count: have(game, id), state: 1 }); r.append(sl.el);
      const c = div('', r); c.style.flex = '1'; c.append(kv(clean(ITEMS[id].name), gain(id).map(([k, n]) => `+${n} ${KNOW[k]}`).join(', '), { color: '#8fd8c8' }).el);
      const k = pkey('SEND UP', () => {
        if (!pay(game, { [id]: 1 })) { uiSfx('error', 0.5); return; }
        for (const [kk, n] of gain(id)) game.research?.addData?.(kk, n, 'ship study');
        const rr = r.getBoundingClientRect(); burst(rr.right - 60, rr.top + 20, { n: 12, ramp: P.glowTeal, kind: 'spark', layer: 'ui', up: 1 }); floatUp(rr.right - 60, rr.top, gain(id).map(([kk, n]) => `+${n} ${kk.toUpperCase()}`).join(' '), { color: '#b0f0e0', size: 16 });
        uiSfx('glass', 0.5); paintKnow(); setTimeout(rows, 250);
      }, { tone: 'cream', lamp: 'green', icon: icon3d('flask', 22) });
      r.append(k);
    }
  };
  rows();
  return { dispose() {} };
}

// ------------------------------------------------------------------ POWER
const BUS: [keyof ShipState['power'], string, string][] = [['life', 'LIFE', 'Air, heat and water for the crew'], ['lab', 'LAB', 'The ship lab and its tanks'], ['workshop', 'SHOP', 'The hangar and the pod works'], ['sensors', 'SENSE', 'The bridge, the monitor and the dish'], ['engines', 'DRIVE', 'Station keeping and the drive']];
export function powerPanel(ctx: PanelCtx): Panel {
  const { host } = ctx;
  host.append(para('The reactor\'s output is shared on one bus; raising one share takes from the others. A starved deck dims and works slower.', { dim: true }));
  const rows: (() => void)[] = [];
  for (const [k, name, what] of BUS) {
    const r = div('', host); r.style.marginBottom = '6px';
    const top = div('s7-row-top', r);
    const m = meter(name, 0, { w: 160, segs: 12, col: k === 'life' ? 'green' : 'amber', value: '' }); m.el.style.flex = '1';
    const minus = pkey('-', () => { setPower(k, shipState().power[k] - 0.05); uiSfx('switch', 0.5); paintAll(); }, { w: 40, tone: 'cream', lamp: false });
    const plus = pkey('+', () => { setPower(k, shipState().power[k] + 0.05); uiSfx('switch', 0.5); paintAll(); ctx.shake(0.2); }, { w: 40, tone: 'cream', lamp: false });
    top.append(m.el, minus, plus);
    r.append(para(what, { dim: true }));
    rows.push(() => { const v = shipState().power[k]; m.set(v / 0.6, `${Math.round(v * 100)}%`); });
  }
  const paintAll = () => rows.forEach((f) => f());
  paintAll();
  return { dispose() {} };
}

// ------------------------------------------------------------------ PODS
export function podsPanel(ctx: PanelCtx): Panel {
  const { host, game } = ctx;
  const col = game?.colony;
  const top = div('s7-row-top', host);
  const v = new ModelView(mPod, { w: 90, h: 80, scale: S, spin: 0.4, hotSpin: 2.2, pitch: 0.45, zoom: 1.0, shadow: [3, 4, 0.5] });
  const vh = div('', top); vh.append(v.cv); vh.style.cursor = 'pointer'; vh.style.flex = 'none';
  vh.addEventListener('pointerenter', () => { v.hot(true); uiSfx('hover', 0.4); }); vh.addEventListener('pointerleave', () => v.hot(false)); vh.addEventListener('pointermove', (e) => v.point(e.clientX, e.clientY));
  vh.addEventListener('click', () => { v.press(1.2); v.poke(12); uiSfx('metal', 0.5); });
  const info = div('', top); info.style.flex = '1';
  info.append(section('THE POD'), kv('Arms', col?.arms?.length ?? 0).el, kv('Drones', col?.drones?.length ?? 0).el, kv('Structures', col?.structures?.length ?? 0).el);
  if (!col) { none(host, 'No colony: the pod is still in its cradle aboard.'); return { dispose() { v.dispose(); } }; }
  host.append(section('UNITS'));
  for (const a of col.arms ?? []) host.append(meter(`ARM: ${String(a.kind).toUpperCase()}`, Math.max(0, Math.min(1, a.hp / Math.max(1, a.maxHp ?? 100))), { w: 140, segs: 10, col: 'green', value: `${Math.round((a.hp / Math.max(1, a.maxHp ?? 100)) * 100)}%` }).el);
  for (const d of col.drones ?? []) host.append(meter(`DRONE: ${String(d.kind).toUpperCase()}`, Math.max(0, Math.min(1, d.battery ?? 1)), { w: 140, segs: 10, col: 'teal', value: `${Math.round((d.battery ?? 1) * 100)}%` }).el);
  if (!(col.arms?.length || col.drones?.length)) host.append(status('No arms or drones built yet: the pod works list builds them.', 'info').el);
  return { dispose() { v.dispose(); } };
}

// ------------------------------------------------------------------ UNIT 07 (the core)
export function corePanel(ctx: PanelCtx): Panel {
  const { host, game } = ctx;
  const top = div('s7-row-top', host);
  const core = new ModelView(coreModel, { w: 90, h: 90, scale: S, spin: 0.6, hotSpin: 2.6, pitch: 0.35, zoom: 1.0, liveFps: 10, anim: (r, t) => { const o = r.getObjectByName('orb'); if (o) { o.position.y = 1.25 + Math.sin(t * 2) * 0.05; o.rotation.y = t; } } });
  const vh = div('', top); vh.append(core.cv); vh.style.cursor = 'pointer'; vh.style.flex = 'none';
  vh.addEventListener('pointerenter', () => { core.hot(true); uiSfx('hover', 0.4); }); vh.addEventListener('pointerleave', () => core.hot(false));
  vh.addEventListener('click', () => { core.press(1); core.poke(10); uiSfx('bong', 0.4); });
  const info = div('', top); info.style.flex = '1';
  info.append(section('UNIT 07'), kv('Sol', game?.colony?.sol ?? 0).el, kv('Standing', Math.round(game?.mission?.rep ?? 0), { unit: '/ 100' }).el, kv('Nodes learned', game?.unlocks?.owned?.().length ?? 0).el);
  const st = status(game?.colony ? 'The colony saves itself every minute; SAVE writes it now.' : 'No colony to save yet.', game?.colony ? 'info' : 'warn');
  host.append(st.el);
  const save = pkey('SAVE THE COLONY', () => {
    try { game.colony.save(); } catch (e) { console.error(e); }
    const r = save.getBoundingClientRect(); floatUp(r.left + r.width / 2, r.top, 'SAVED', { color: '#b8f0a0', size: 32 }); burst(r.left + r.width / 2, r.top, { n: 16, ramp: P.glowTeal, kind: 'spark', layer: 'ui', up: 1 });
    st.set('Saved just now.', 'ok');
  }, { tone: 'yellow', lamp: 'green', sound: 'confirm', icon: icon3d('scroll', 22) });
  save.setDisabled(!game?.colony);
  host.append(save);
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
