// ?test=hud7&view=panels: the kit's standard detailed boxes on one sheet (panel, slot, slotGrid, meter, pkey) in every
// tone, with real content: the bench's part bins (part icons from the tool models), an item record card, a specs
// readout and a bill of materials.
import { panel, slotGrid, slot, meter, pkey } from '../kit/panel';
import { ModelView } from '../kit/model3d';
import { bitReady } from '../kit/bitfont';
import { partIcon, partModel, customModel } from './parts3d';
import { PARTS, PART_SLOTS, statsOf, costOf } from './tools';
import { itemIcon, ITEMS } from '../../factory/items';
import type { Tone } from '../kit/machine';

export async function panelSheet() {
  await bitReady();
  document.body.style.background = '#1b2026';
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;inset:0;overflow:hidden;padding:28px 34px;display:flex;flex-wrap:wrap;gap:30px 34px;align-content:flex-start;align-items:flex-start;z-index:5';
  document.body.append(root);
  const parts = { head: 'bit', core: 'motor', grip: 'pistol', mod: 'scope' } as const;

  // ---- the parts bin: category keys, a grid of slots holding the real parts
  const bin = panel({ title: 'PARTS', tone: 'gun', serial: 'FAB-06', lamps: ['green', 'amber'], stencil: 'BAY 2', glands: 2 });
  bin.el.style.width = '372px';
  const keys = document.createElement('div'); keys.style.cssText = 'display:flex;gap:6px;margin-bottom:12px';
  for (const s of PART_SLOTS) { const k = pkey(s.toUpperCase(), () => {}, { w: 80, h: 32, tone: s === 'head' ? 'yellow' : 'cream', lamp: 'amber' }); if (s === 'head') k.setOn(true); keys.append(k); }
  bin.body.append(keys);
  const all = PART_SLOTS.flatMap((s) => PARTS[s].filter((p) => p.id !== 'none').map((p) => ({ s, p })));
  const grid = slotGrid(12, 4, 74, { gap: 8, numbered: true });
  grid.slots.forEach((sl, i) => {
    const e = all[i]; if (!e) { sl.set({ state: 4 }); return; }
    sl.set({ icon: partIcon(e.s, e.p.id, 56), count: i % 3 === 0 ? 2 : 1, state: e.p.id === 'bit' ? 3 : i === 5 ? 2 : 1 });
  });
  bin.body.append(grid.el);
  root.append(bin.el);

  // ---- an item record card (Limbophobia's item panel, ODDWORLD's hardware)
  const card = panel({ title: 'CORE BIT', tone: 'olive', serial: 'PT-0412', lamps: ['amber'], hazard: true, glands: 1, stencil: 'HEAD' });
  card.el.style.width = '360px';
  const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:12px;align-items:flex-start';
  const well = panel({ tone: 'dark', head: 8, foot: 8, side: 6, lamps: [], hazard: false, glands: 0, vents: false });
  well.el.style.cssText += ';width:150px;height:150px;flex:none';
  const mv = new ModelView(() => partModel('head', 'bit', 'hud')!, { w: 62, h: 62, scale: 2, spin: 0.5, pitch: 0.4, liveFps: 10 });
  well.body.append(mv.cv);
  const info = document.createElement('div'); info.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding-top:2px';
  const line = (k: string, v: string) => { const d = document.createElement('div'); d.className = 'k7-t16'; d.style.cssText = 'display:flex;gap:8px'; const a = document.createElement('span'); a.style.color = '#d8b060'; a.textContent = k; const b = document.createElement('span'); b.textContent = v; d.append(a, b); return d; };
  info.append(line('SLOT', 'HEAD'), line('MASS', '2 KG'), line('BASE', 'DRILL'));
  row.append(well.el, info);
  card.body.append(row);
  const mm = document.createElement('div'); mm.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:12px';
  mm.append(meter('PWR', 3 / 8, { w: 180, col: 'amber', value: 3 }).el, meter('RCH', 2 / 14, { w: 180, col: 'teal', value: 2 }).el, meter('WEAR', 0.82, { w: 180, col: 'green', value: '82%' }).el);
  card.body.append(mm);
  root.append(card.el);

  // ---- the specs readout + the bill
  const st = statsOf(parts), cost = costOf(parts);
  const spec = panel({ title: 'SPECS', tone: 'gun', lamps: ['green', 'red'], serial: 'CT-1', knobs: 2, toggles: 2, foot: 30 });
  spec.el.style.width = '340px';
  const ms = document.createElement('div'); ms.style.cssText = 'display:flex;flex-direction:column;gap:6px';
  ms.append(meter('PWR', st.power / 8, { w: 170, col: 'amber', value: st.power }).el, meter('RCH', st.reach / 14, { w: 170, col: 'teal', value: st.reach }).el, meter('SPD', (st.speed + 2) / 7, { w: 170, col: 'green', value: st.speed }).el, meter('KW', st.draw / 10, { w: 170, col: 'red', value: st.draw }).el, meter('KG', st.mass / 8, { w: 170, col: 'white', value: st.mass }).el);
  spec.body.append(ms);
  const bill = document.createElement('div'); bill.style.cssText = 'display:flex;gap:8px;margin-top:14px;flex-wrap:wrap';
  for (const [it, n] of Object.entries(cost)) { const s = slot(54, {}); const im = document.createElement('img'); im.src = itemIcon(it as never, 64); im.width = 38; im.height = 38; im.alt = ITEMS[it as never]?.name ?? it; s.set({ icon: im, count: n, state: 1 }); bill.append(s.el); }
  spec.body.append(bill);
  root.append(spec.el);

  // ---- the assembled tool in a well
  const tool = panel({ title: 'ASSEMBLY', tone: 'steel', lamps: ['teal', 'green', 'amber'], serial: 'JIG-3', handles: true });
  tool.el.style.width = '420px'; tool.el.style.height = '300px';
  const tv = new ModelView(() => customModel(parts, 'hud'), { w: 190, h: 110, scale: 2, spin: 0.35, pitch: 0.38, liveFps: 10 });
  tool.body.style.cssText = 'display:grid;place-items:center;height:100%';
  tool.body.append(tv.cv);
  root.append(tool.el);

  // ---- every tone
  const tones: Tone[] = ['gun', 'olive', 'cream', 'red', 'blue', 'teal', 'dark', 'yellow', 'brass'];
  for (const t of tones) {
    const p = panel({ title: t.toUpperCase(), tone: t, lamps: ['green'], glands: 1 });
    p.el.style.width = '176px'; p.el.style.height = '120px';
    const s = slot(48, { n: '1' }); s.set({ icon: partIcon('core', 'reactor', 34), state: 1 });
    p.body.append(s.el);
    root.append(p.el);
  }
}
