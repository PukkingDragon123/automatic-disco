// The UPGRADER tab: researched blueprints down the left, a phosphor schematic of the pod in the middle with every
// install slot called out (lit when filled, pulsing when the selected blueprint goes there), and the build card on
// the right: the real parts it takes (have / need from the stores), the gantry's progress, and BUILD AND INSTALL.
import { el } from '../../ui/kit';
import { sfx } from '../../audio/audio';
import { csfx } from '../../ui/cineAudio';
import { BLUEPRINTS, BLUEPRINT, TARGET_NAME, costOf, type Upgrades, type Target, type UpgraderState } from '../upgrades';
import { upState } from '../buildings';
import { itemIcon } from '../../factory/items';
import { have, itemName, fmtTime } from '../util';
import { iconURL } from './icons';
import { TECHS } from '../tech';
import type { TabPage } from '../../ui/skillMastery';
import type { Game } from '../../game/game';

const TARGETS: Target[] = ['pod', 'arm', 'tool', 'drone'];
const C = { ink: '#a9cdae', hot: '#d2e4d3', glow: '#7fb88a', dim: '#557f5f', faint: '#264a32', deep: '#14261b', amber: '#d9a43a', amberHi: '#ecd29a', red: '#cc6252' };

export class UpgraderPage implements TabPage {
  readonly el: HTMLElement;
  private sel: string | null = null;
  private left: HTMLElement; private mid: HTMLElement; private right: HTMLElement;
  private cv: HTMLCanvasElement; private cx: CanvasRenderingContext2D;
  private sig = ''; private t = 0; private W = 0; private H = 0; private dpr = 1; private ro: ResizeObserver;
  private doneT = -9; private doneId = ''; private off: () => void;
  constructor(readonly U: Upgrades, readonly g: Game, readonly research: { unlocked(id: string): boolean } | null) {
    this.el = el('div', 'pt-page pu');
    this.left = el('div', 'pt-col', this.el);
    this.mid = el('div', 'pu-schem', this.el);
    this.right = el('div', 'pt-col', this.el);
    this.cv = el('canvas', '', this.mid); this.cx = this.cv.getContext('2d')!;
    this.ro = new ResizeObserver(() => { const r = this.mid.getBoundingClientRect(); this.dpr = Math.max(1, Math.min(2, devicePixelRatio || 1)); this.W = Math.floor(r.width); this.H = Math.floor(r.height); this.cv.width = Math.floor(this.W * this.dpr); this.cv.height = Math.floor(this.H * this.dpr); }); this.ro.observe(this.mid);
    this.sel = BLUEPRINTS.find((b) => this.known(b.id) && this.U.count(b.id) < b.max)?.id ?? BLUEPRINTS.find((b) => this.known(b.id))?.id ?? null;
    this.off = U.on('install', (d) => { this.doneT = this.t; this.doneId = d.id; csfx('thud', 1, 0.8); csfx('servo', 0.8, 0.8); this.sig = ''; });
  }
  private known(id: string) { return this.research ? this.research.unlocked(id) : true; }
  /** the Upgrader buildings, idle first */
  private machines(): any[] { const bs = ((this.g as any)?.factory?.buildings ?? []).filter((b: any) => b.kind === 'upgrader' && !b.dead); return bs.sort((a: any, b: any) => (upState(a).job ? 1 : 0) - (upState(b).job ? 1 : 0)); }
  private signature() { const m = this.machines(); return [this.sel, this.U.list().map((u) => u.id + u.n).join(','), m.length, m.map((b) => (upState(b).job ? upState(b).job!.id + Math.floor((upState(b).job!.t / upState(b).job!.time) * 40) : '-') + b.status).join(','), this.sel ? this.U.missing(this.sel).map((x) => x[1]).join(',') : ''].join('|'); }
  update(dt: number) { this.t += dt; const s = this.signature(); if (s !== this.sig) { this.sig = s; this.build(); } this.draw(); }
  key(e: KeyboardEvent) { if (e.key === 'Enter' && this.sel) { this.start(); return true; } return false; }
  private start() {
    const id = this.sel; if (!id) return;
    const m = this.machines()[0];
    if (!m) { sfx('deny'); return; }
    const st = upState(m);
    if (!this.U.start(st, id)) { sfx('deny'); return; }
    csfx('lever', 0.8); csfx('servo', 0.7, 1); sfx('click'); this.sig = '';
  }
  private build() {
    const U = this.U;
    // ---------------- left: blueprints by target
    const L = this.left; L.innerHTML = '';
    for (const tg of TARGETS) {
      el('div', 'pt-h', L, TARGET_NAME[tg]);
      for (const b of BLUEPRINTS.filter((q) => q.target === tg)) {
        const k = this.known(b.id), n = U.count(b.id);
        const row = el('div', 'pu-row' + (this.sel === b.id ? ' sel' : '') + (n ? ' inst' : '') + (k ? '' : ' lock'), L);
        const im = el('img', 'pt-ico', row); im.src = iconURL(b.icon, n >= b.max ? 'amber' : k ? 'phos' : 'dim');
        const mm = el('div', '', row); el('div', 'nm', mm, b.name); el('div', 'ef', mm, k ? b.effect : 'Blueprint not researched');
        el('div', 'n', row, n >= b.max ? 'FITTED' : b.max > 1 ? `${n}/${b.max}` : k ? '' : 'LOCKED');
        row.addEventListener('click', () => { this.sel = b.id; sfx('click'); this.sig = ''; });
      }
    }
    // ---------------- right: the build card
    const R = this.right; R.innerHTML = '';
    const ms = this.machines(), busy = ms.find((b) => upState(b).job);
    el('div', 'pt-h', R, `UPGRADER · ${ms.length ? ms.length + ' ON THE GRID' : 'NONE BUILT'}`);
    if (!ms.length) {
      const bx = el('div', 'pt-box hot', R);
      el('div', 'pt-txt big', bx, 'No Upgrader in the colony.');
      el('div', 'pt-txt', bx, this.known('upgrader') ? 'Build one from the RESEARCH tab of the build menu [B]. It needs power.' : 'Research UPGRADER first, then build it [B].');
    }
    if (busy) {
      const st = upState(busy), j = st.job!, bp = BLUEPRINT[j.id];
      const bx = el('div', 'pt-box hot', R);
      el('div', 'pt-txt', bx, `GANTRY AT WORK · ${bp.name.toUpperCase()}`);
      const bar = el('div', 'pt-bar amb pu-big', bx); el('i', '', bar).style.width = `calc(${(j.t / j.time) * 100}% - 4px)`;
      el('div', 'pt-txt dim', bx, busy.status === 'nopower' ? '<span class="pt-warn">NO POWER: THE GANTRY HAS STOPPED</span>' : `${fmtTime(j.time - j.t)} to install`);
    }
    const b = this.sel ? BLUEPRINT[this.sel] : null;
    if (b) {
      const k = this.known(b.id), n = U.count(b.id);
      const hd = el('div', '', R); hd.style.cssText = 'display:flex;gap:14px;align-items:center;margin-top:6px';
      const im = el('img', 'pt-ico', hd); im.src = iconURL(b.icon, n ? 'amber' : 'lit'); im.style.cssText = 'width:72px;height:72px;background:#071209;box-shadow:inset 0 0 0 2px #264a32';
      const nm = el('div', '', hd); el('div', 'pt-txt big', nm, `<span style="font-family:Jersey;font-size:30px;line-height:30px">${b.name}</span>`);
      el('div', 'pt-txt dim', nm, `${TARGET_NAME[b.target]} · ${fmtTime(b.time)} on the gantry`);
      el('div', 'pt-txt big', R, b.desc);
      el('div', 'pt-txt pt-plus', R, b.effect);
      const parts = el('div', 'pt-box', R);
      el('div', 'pt-h', parts, 'PARTS FROM THE STORES');
      const cost = costOf(b.id);
      for (const id in cost) {
        const h = have(this.g, id), row = el('div', 'pu-part' + (h < cost[id] ? ' short' : ''), parts);
        const ii = el('img', 'pt-ico', row); try { ii.src = itemIcon(id); } catch { /* icon */ }
        el('div', 'nm', row, itemName(id));
        el('div', 'q', row, `${Math.min(h, 9999)} / ${cost[id]}`);
      }
      const why = U.why(b.id, ms[0] ? upState(ms[0]) : null) ?? (ms.length ? null : 'No Upgrader built');
      const lbl = !k ? 'RESEARCH THE BLUEPRINT' : n >= b.max ? 'FITTED' : why ? why.toUpperCase() : 'BUILD AND INSTALL  [ENTER]';
      const key = el('div', 'pt-key' + (why ? ' dead' : ' arm'), R, lbl); key.style.alignSelf = 'flex-start';
      key.addEventListener('click', () => this.start());
      if (!k) { const t = TECHS.find((q) => q.blueprint === b.id); if (t) el('div', 'pt-txt dim', R, `Research ${t.name} on the RESEARCH tab.`); }
      if (this.doneId === b.id && this.t - this.doneT < 6) { const s = el('div', 'pt-stamp', R, 'INSTALLED'); s.style.right = '20px'; s.style.top = '120px'; }
    }
  }
  // ---------------------------------------------------------------- the schematic
  private draw() {
    const g = this.cx, W = this.W, H = this.H, t = this.t, U = this.U; if (!W) return;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); g.imageSmoothingEnabled = false; g.clearRect(0, 0, W, H);
    const sel = this.sel ? BLUEPRINT[this.sel] : null;
    // blueprint grid
    g.fillStyle = 'rgba(20, 38, 27, 0.55)';
    for (let x = 0; x < W; x += 24) g.fillRect(x, 0, 1, H);
    for (let y = 0; y < H; y += 24) g.fillRect(0, y, W, 1);
    g.fillStyle = C.dim; g.font = '11px Superwide'; g.fillText('DWG U07-POD · INSTALL SLOTS · SIDE ELEVATION', 14, 22);
    g.font = '18px VT'; g.fillText(`${U.list().reduce((s, u) => s + u.n, 0)} UPGRADES FITTED`, 14, 44);
    const cx = W / 2, cy = H * 0.5, R = Math.min(W * 0.17, H * 0.26);
    // the pod: an octagonal shell on three legs, hatch on top, lens at the front
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    const oct = (r: number) => { g.beginPath(); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.86; if (k) g.lineTo(x, y); else g.moveTo(x, y); } g.closePath(); };
    const plated = U.has('pod_plating');
    g.lineWidth = plated ? 5 : 2; g.strokeStyle = plated ? C.amber : sel?.id === 'pod_plating' ? `rgba(210,228,211,${0.4 + pulse * 0.6})` : C.glow; oct(R); g.stroke();
    g.lineWidth = 1; g.strokeStyle = C.faint; oct(R * 0.78); g.stroke();
    // panel lines and rivet rows on the shell, dimension line under it
    g.fillStyle = C.faint;
    for (let k = -3; k <= 3; k++) g.fillRect(cx + k * R * 0.22, cy - R * 0.62, 1, R * 1.24);
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; g.fillRect(cx + Math.cos(a) * R * 0.9 - 1, cy + Math.sin(a) * R * 0.77 - 1, 3, 3); }
    g.fillStyle = C.dim; g.font = '9px Superwide'; g.textAlign = 'center'; g.fillText('3.80 M', cx, cy + R * 1.5); g.textAlign = 'left';
    g.fillRect(cx - R, cy + R * 1.4, R * 2, 1); g.fillRect(cx - R, cy + R * 1.36, 1, 9); g.fillRect(cx + R, cy + R * 1.36, 1, 9);
    for (const s of [-1, 0, 1]) { g.strokeStyle = C.glow; g.lineWidth = 2; g.beginPath(); g.moveTo(cx + s * R * 0.5, cy + R * 0.8); g.lineTo(cx + s * R * 0.95, cy + R * 1.25); g.lineTo(cx + s * R * 1.1, cy + R * 1.25); g.stroke(); }
    g.fillStyle = C.faint; g.fillRect(cx - R * 1.4, cy + R * 1.25, R * 2.8, 2);
    // lens
    g.strokeStyle = C.hot; g.lineWidth = 2; g.strokeRect(cx + R * 0.55, cy - R * 0.15, R * 0.3, R * 0.3);
    g.fillStyle = 'rgba(185,220,189,0.25)'; g.fillRect(cx + R * 0.6, cy - R * 0.1, R * 0.2, R * 0.2);
    // slots: callouts in two columns at the sides, leader lines to the point on the drawing
    const bw = Math.min(230, W * 0.22), bh = 36, lxL = 16, lxR = W - 16 - bw;
    const slot = (id: string | string[], x: number, y: number, side: -1 | 1, fy: number, label: string, filled: boolean, sub = '') => {
      const ids = Array.isArray(id) ? id : [id], isSel = !!sel && ids.includes(sel.id);
      const col = filled ? C.amber : isSel ? `rgba(236,210,154,${0.5 + pulse * 0.5})` : C.dim;
      const bx = side < 0 ? lxL : lxR, by = Math.round(H * fy - bh / 2), ex = side < 0 ? bx + bw : bx;
      g.strokeStyle = col; g.lineWidth = isSel ? 2 : 1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(ex + side * -24, by + bh / 2); g.lineTo(ex, by + bh / 2); g.stroke();
      g.fillStyle = col; g.fillRect(x - 3, y - 3, 6, 6);
      g.fillStyle = filled ? 'rgba(40,28,8,0.9)' : 'rgba(6,16,10,0.92)'; g.fillRect(bx, by, bw, bh);
      g.strokeStyle = col; g.lineWidth = isSel ? 2 : 1; g.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      g.fillStyle = filled ? C.amberHi : isSel ? C.hot : C.ink; g.font = '19px VT'; g.fillText(label, bx + 10, by + 17);
      g.fillStyle = filled ? C.amber : C.dim; g.font = '9px Superwide'; g.fillText(sub || (filled ? 'FITTED' : 'EMPTY'), bx + 10, by + 30);
    };
    slot('pod_capacitor', cx, cy - R * 0.55, -1, 0.17, 'CAPACITOR RING', U.has('pod_capacitor'), 'POD CORE');
    slot('pod_plating', cx - R * 0.92, cy - R * 0.36, -1, 0.29, 'POD PLATING', U.has('pod_plating'), 'POD CORE · HULL');
    slot('pod_coolant', cx - R * 0.6, cy + R * 0.3, -1, 0.41, 'COOLANT LOOP', U.has('pod_coolant'), 'POD CORE');
    // hatch and mast
    g.strokeStyle = U.has('pod_capacitor') ? C.amber : C.glow; g.lineWidth = 2; g.strokeRect(cx - R * 0.25, cy - R * 0.92, R * 0.5, R * 0.12);
    if (U.has('pod_sensor')) { g.strokeStyle = C.amber; g.beginPath(); g.moveTo(cx, cy - R * 0.92); g.lineTo(cx, cy - R * 1.35); g.stroke(); g.strokeRect(cx - 8, cy - R * 1.42, 16, 10); }
    slot('pod_sensor', cx, cy - R * 0.9, 1, 0.12, 'SENSOR MAST', U.has('pod_sensor'), 'POD CORE · SCAN +50%');
    // arm sockets: 2 standard + up to 2 more
    const sockets = 2 + U.count('arm_socket');
    const arms = ['arm_grapple', 'arm_cutter', 'arm_drill', 'arm_welder', 'arm_long'].filter((a) => U.has(a));
    const sp: [number, number][] = [];
    for (let k = 0; k < 4; k++) {
      const side = k % 2 ? 1 : -1, row = Math.floor(k / 2), ax = cx + side * R * 0.98, ay = cy + (row ? R * 0.3 : -R * 0.05);
      sp.push([ax, ay]);
      const open = k < sockets, armId = arms[k];
      g.strokeStyle = open ? C.glow : C.faint; g.lineWidth = 2; g.strokeRect(ax - 7, ay - 7, 14, 14);
      if (open && armId) { g.strokeStyle = C.amber; g.lineWidth = 3; g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax + side * R * 0.35, ay - R * 0.22); g.lineTo(ax + side * R * 0.62, ay + R * 0.05); g.stroke(); g.fillStyle = C.amber; g.fillRect(ax + side * R * 0.62 - 4, ay + R * 0.05 - 4, 8, 8); }
    }
    const armIds = ['arm_socket', 'arm_grapple', 'arm_cutter', 'arm_drill', 'arm_welder', 'arm_long'];
    const armLabel = (k: number) => (k >= sockets ? 'SOCKET NOT CUT' : arms[k] ? BLUEPRINT[arms[k]].name.toUpperCase() : 'BARE SOCKET');
    slot(armIds, sp[0][0], sp[0][1], -1, 0.6, armLabel(0), !!arms[0], `ARM SOCKET 1`);
    slot(armIds, sp[1][0], sp[1][1], 1, 0.28, armLabel(1), !!arms[1], `ARM SOCKET 2`);
    slot(armIds, sp[2][0], sp[2][1], -1, 0.72, armLabel(2), !!arms[2], 2 < sockets ? 'ARM SOCKET 3' : 'NEEDS ARM SOCKET');
    slot(armIds, sp[3][0], sp[3][1], 1, 0.42, armLabel(3), !!arms[3], 3 < sockets ? 'ARM SOCKET 4' : 'NEEDS ARM SOCKET');
    // tools along the front
    const tools = ['tool_scanner2', 'tool_tractor', 'tool_repair', 'tool_cannon'];
    tools.forEach((id, i) => slot(id, cx + R * 0.7, cy - R * 0.1 + i * R * 0.1, 1, 0.56 + i * 0.1, BLUEPRINT[id].name.toUpperCase(), U.has(id), `TOOL SLOT ${i + 1}`));
    // drone bay
    const berths = 1 + (U.has('drone_bay') ? 2 : 0), dn = U.count('drone_') - U.count('drone_bay');
    slot(['drone_scout', 'drone_hauler', 'drone_builder', 'drone_bay'], cx - R * 0.2, cy + R * 0.7, -1, 0.86, `DRONE BAY ${dn}/${berths}`, dn > 0, ['drone_scout', 'drone_hauler', 'drone_builder'].filter((d) => U.has(d)).map((d) => BLUEPRINT[d].name.split(' ')[0].toUpperCase()).join(' · ') || 'NO DRONES');
    // a fresh install: a burst of light on the slot
    if (t - this.doneT < 1.4) { g.save(); g.globalAlpha = 1 - (t - this.doneT) / 1.4; g.strokeStyle = C.amberHi; g.lineWidth = 3; oct(R * (1 + (t - this.doneT) * 0.4)); g.stroke(); g.restore(); }
    // the gantry, if one is working
    const busy = this.machines().find((b) => upState(b).job) as any;
    if (busy) {
      const st: UpgraderState = upState(busy), k = st.job!.t / st.job!.time;
      g.fillStyle = C.amberHi; g.font = '11px Superwide'; g.fillText('GANTRY', 14, H - 40);
      g.fillStyle = C.faint; g.fillRect(14, H - 30, W - 28, 10);
      g.fillStyle = C.amber; g.fillRect(16, H - 28, (W - 32) * k, 6);
      const hx = 16 + (W - 32) * k; g.fillRect(hx - 2, H - 40, 4, 22);
    }
  }
  dispose() { this.off(); this.ro.disconnect(); this.el.remove(); }
}
