// The ordnance workbench (ART.md: real 1950s bench materials). On the left a drafting sheet: the drawing number and
// name typed in, four typed index cards (frame, power unit, barrel or emitter, ammunition or payload) whose lines you
// tick, a bio payload struck through with the gene it still needs. On the right a cyanotype elevation of the weapon
// drawn in white ink with dimension lines, the figures card (damage, rate, range, spread, heat, ammunition, weight,
// sustained output) with hand-ruled bars, the tooling bill against the store, and a rubber stamp: APPROVED, or REFUSED
// with the reason. Between them the test-fire range: the weapon on a clamp stand fires downrange at target robots
// that walk on and fall over; the measured output is read off a panel meter. [J] / [Esc] closes.
import * as THREE from 'three';
import type { Engine, Screen } from '../../app/engine';
import type { Post } from '../../gfx/post';
import type { Game } from '../../game/game';
import { Fx } from '../../game/fx';
import { gbuf } from '../../gfx/gbuf';
import { RAMPS } from '../../art/palette';
import { Kit } from '../kit';
import { atlasFor, kitMaterial, livery } from '../atlas';
import { PARTS, PART, SLOTS, SLOT_NAME, partsOf, refuse, weaponStats, weaponCost, newDesign, toWeapon, type WeaponDesign, type Slot } from './parts';
import { buildWeaponMesh, type WeaponMesh } from './model';
import { store, saveStore, genesOf, lack, toolUp, isTooled, equipGolem, issueTo, designById } from './store';
import { RobotUnit, spawnRobot, tickRobots, fireWeapon, type RobotKind } from '../unit';

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const C = { paper: hex(RAMPS.paper[4]), paper2: hex(RAMPS.paper[3]), graphite: hex(RAMPS.ink[2]), ink: hex(RAMPS.ink[1]), blue: '#1d3b5a', blueGrid: '#2a4d70', white: '#e8eef0', red: hex(RAMPS.stampRed[3]), amber: hex(RAMPS.glowAmber[3]), olive: hex(RAMPS.olive[3]), line: '#9fb4c2' };
const CSS = `
.wb { position: fixed; inset: 0; pointer-events: none; z-index: 40; font-family: 'VT', monospace; color: ${C.graphite}; }
.wb .sheet { pointer-events: auto; position: absolute; left: 14px; top: 14px; bottom: 14px; width: min(400px, 38vw); background: ${C.paper};
  background-image: linear-gradient(${C.line}33 1px, transparent 1px), linear-gradient(90deg, ${C.line}33 1px, transparent 1px); background-size: 12px 12px;
  box-shadow: 3px 4px 0 ${hex(RAMPS.ink[0])}88; padding: 10px 12px; overflow-y: auto; transform: rotate(-0.35deg); }
.wb .sheet h1 { font: 15px 'Superwide', monospace; letter-spacing: 1px; margin: 2px 0 2px; color: ${C.ink}; }
.wb .sheet .no { font-size: 11px; color: ${C.graphite}; border-bottom: 1px solid ${C.graphite}; padding-bottom: 4px; margin-bottom: 6px; display: flex; gap: 6px; align-items: center; }
.wb input.name { font: 13px 'VT', monospace; background: transparent; border: none; border-bottom: 1px dashed ${C.graphite}; color: ${C.ink}; width: 160px; text-transform: uppercase; }
.wb .card { background: ${hex(RAMPS.paper[5])}; margin: 8px 0; padding: 5px 8px 6px; box-shadow: 1px 2px 0 ${hex(RAMPS.paper[0])}; border-top: 3px solid ${hex(RAMPS.stampRed[1])}66; }
.wb .card:nth-child(odd) { transform: rotate(0.3deg); } .wb .card:nth-child(even) { transform: rotate(-0.25deg); }
.wb .card .t { font: 11px 'Jersey', monospace; letter-spacing: 1px; color: ${C.red}; margin-bottom: 3px; }
.wb .row { font-size: 12px; line-height: 15px; padding: 1px 2px; cursor: pointer; display: flex; gap: 6px; }
.wb .row:hover { background: ${hex(RAMPS.paper[3])}66; }
.wb .row .box { width: 24px; flex: none; color: ${C.ink}; white-space: pre; }
.wb .row.on { color: ${C.ink}; } .wb .row.on .nm { text-decoration: underline; text-decoration-color: ${C.red}; }
.wb .row.lock { color: ${hex(RAMPS.paper[0])}; } .wb .row.lock .nm { text-decoration: line-through; }
.wb .row .gn { font-size: 10px; color: ${C.red}; margin-left: auto; }
.wb .desc { font-size: 11px; color: ${hex(RAMPS.ink[2])}; margin: 3px 2px 0; font-style: italic; }
.wb .files { display: flex; flex-wrap: wrap; gap: 3px; margin: 4px 0; }
.wb .files span { font-size: 10px; padding: 1px 5px; background: ${hex(RAMPS.paper[3])}; cursor: pointer; border-bottom: 2px solid transparent; }
.wb .files span.on { border-bottom-color: ${C.red}; background: ${hex(RAMPS.paper[5])}; }
.wb .right { pointer-events: auto; position: absolute; right: 14px; top: 14px; width: min(360px, 34vw); display: flex; flex-direction: column; gap: 10px; }
.wb canvas.bp { width: 100%; image-rendering: pixelated; box-shadow: 3px 4px 0 ${hex(RAMPS.ink[0])}88; transform: rotate(0.4deg); }
.wb .figs { background: ${C.paper}; padding: 8px 10px; box-shadow: 3px 4px 0 ${hex(RAMPS.ink[0])}88; font-size: 12px; position: relative; }
.wb .figs .r { display: flex; align-items: center; gap: 6px; line-height: 15px; }
.wb .figs .k { width: 74px; } .wb .figs .v { width: 54px; text-align: right; color: ${C.ink}; }
.wb .figs .bar { flex: 1; height: 7px; border-bottom: 1px solid ${C.graphite}; position: relative; }
.wb .figs .bar i { position: absolute; left: 0; bottom: 1px; height: 5px; background: repeating-linear-gradient(90deg, ${C.graphite} 0 3px, transparent 3px 4px); }
.wb .bill { font-size: 11px; margin-top: 6px; border-top: 1px dashed ${C.graphite}; padding-top: 4px; }
.wb .bill .no { color: ${C.red}; }
.wb .stamp { position: absolute; right: 8px; top: 4px; font: 16px 'Superwide', monospace; padding: 2px 8px; border: 3px solid currentColor; transform: rotate(-8deg); opacity: 0.85; }
.wb .stamp.ok { color: ${C.olive}; } .wb .stamp.no { color: ${C.red}; font-size: 12px; max-width: 200px; transform: rotate(-4deg); }
.wb .btns { display: flex; flex-wrap: wrap; gap: 5px; }
.wb button { font: 12px 'VT', monospace; background: ${hex(RAMPS.olive[2])}; color: ${C.paper}; border: none; border-bottom: 3px solid ${hex(RAMPS.olive[0])}; padding: 4px 9px; cursor: pointer; }
.wb button:hover { background: ${hex(RAMPS.olive[3])}; } .wb button.red { background: ${hex(RAMPS.stampRed[2])}; border-bottom-color: ${hex(RAMPS.stampRed[0])}; }
.wb button:disabled { opacity: 0.45; cursor: default; }
.wb select { font: 12px 'VT', monospace; background: ${C.paper}; color: ${C.ink}; border: 1px solid ${C.graphite}; }
.wb .meter { position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%); background: ${hex(RAMPS.brass[2])}; padding: 4px 10px; color: ${C.paper}; font-size: 12px; box-shadow: 2px 3px 0 ${hex(RAMPS.ink[0])}88; pointer-events: none; }
.wb .meter b { color: ${hex(RAMPS.glowAmber[4])}; font-weight: normal; }
.wb .hint { position: absolute; left: 50%; top: 10px; transform: translateX(-50%); font-size: 11px; color: ${C.paper}; background: ${hex(RAMPS.ink[0])}aa; padding: 2px 8px; }
`;

const TARGETS: { kind: RobotKind; x: number; z: number }[] = [{ kind: 'sov_trooper', x: -1.2, z: 6 }, { kind: 'prc_scout', x: 1.6, z: 8.5 }, { kind: 'sov_tank', x: -0.4, z: 12 }];

export class WeaponBench implements Screen {
  static current: WeaponBench | null = null;
  readonly scene = new THREE.Scene(); readonly fxs = new THREE.Scene();
  readonly cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 200);
  private fx: Fx;
  private host: { world: { scene: THREE.Scene; surfaceY(x: number, z: number): number; time: number }; region: { N: number; isSolid(): boolean }; fx: Fx; robots: RobotUnit[] };
  private el: HTMLDivElement; private style: HTMLStyleElement;
  private d: WeaponDesign;
  private wm: WeaponMesh | null = null;
  private stand = new THREE.Group(); private yaw = new THREE.Group(); private pitch = new THREE.Group();
  private cd = 0; private t = 0; private dmgLog: { t: number; n: number }[] = [];
  private respawn: { kind: RobotKind; x: number; z: number; t: number }[] = [];
  private firing = true;
  constructor(readonly engine: Engine, readonly game: Game | null, readonly close: () => void) {
    WeaponBench.current = this;
    (globalThis as unknown as { __bench?: WeaponBench }).__bench = this;
    const s = store();
    this.d = { ...(designById(s.golem.hand) ?? s.designs[0] ?? newDesign()) };
    // ---- the range
    const sc = this.scene;
    sc.background = new THREE.Color(RAMPS.sky[1]);
    sc.add(new THREE.HemisphereLight(0xd8dcd0, 0x4a4030, 1.4));
    const sun = new THREE.DirectionalLight(0xfff0dc, 2.4); sun.position.set(-4, 8, 2); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    const shc = sun.shadow.camera as THREE.OrthographicCamera; shc.left = shc.bottom = -10; shc.right = shc.top = 10; shc.far = 40; sun.target.position.set(0, 0, 6); sc.add(sun, sun.target);
    const gm = new THREE.MeshLambertMaterial({ color: RAMPS.sand[2] }); gbuf(gm, 1);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), gm); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; sc.add(ground);
    this.fx = new Fx(this.fxs, sc);
    this.host = { world: { scene: sc, surfaceY: () => 0, time: 0 }, region: { N: 400, isSolid: () => false }, fx: this.fx, robots: [] };
    // the firing point: a concrete pad, a sandbag berm downrange, distance boards, the clamp stand
    const at = atlasFor(livery('uspc')), mat = kitMaterial(at);
    const props = new THREE.Group(); sc.add(props);
    const k = new Kit(3);
    k.on(props);
    k.box(0, 0.05, 0, 3, 0.1, 2.2, 'pc0', { ch: 0.02 });
    for (let i = 0; i < 14; i++) k.box(-4.5 + i * 0.68 + (i % 2) * 0.1, 0.18 + (i % 3) * 0.02, 15.5, 0.62, 0.32, 0.4, 'cv', { ch: 0.06 });
    for (let i = 0; i < 12; i++) k.box(-4.2 + i * 0.7, 0.48, 15.6, 0.6, 0.28, 0.38, 'cv', { ch: 0.06 });
    for (const z of [5, 10, 15]) { k.box(3.2, 0.5, z, 0.06, 1, 0.06, 'st0'); k.box(3.2, 0.9, z, 0.5, 0.3, 0.03, 'plainA').push(3.2, 0.9, z + 0.016).decal(0, 0, 0, 0.44, 0.06, 'ser1').pop(); }
    k.on(this.stand);
    k.cyl(0, 0.2, 0, 0.18, 0.22, 0.2, 10, 'st0');
    k.cyl(0, 0.6, 0, 0.05, 0.05, 0.8, 8, 'pa0');
    k.lathe(0, 1.0, 0, [[0.09, 0], [0.12, 0.04], [0.1, 0.06]], 10, 'st0');
    k.finish([mat]);
    this.stand.position.set(0, 0.1, 0); sc.add(this.stand);
    this.yaw.position.set(0, 1.12, 0); this.stand.add(this.yaw); this.yaw.add(this.pitch);
    for (const T of TARGETS) this.spawnTarget(T.kind, T.x, T.z);
    // ---- the paper
    this.style = document.createElement('style'); this.style.textContent = CSS; document.head.appendChild(this.style);
    this.el = document.createElement('div'); this.el.className = 'wb'; document.body.appendChild(this.el);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    addEventListener('keydown', this.onKey);
    this.cam.position.set(2.0, 2.5, -3.8); this.cam.lookAt(0, 0.7, 6.5);
    this.setDesign(this.d);
  }
  private onKey = (e: KeyboardEvent) => {
    if (WeaponBench.current !== this) return;
    const t = (e.target as HTMLElement | null)?.tagName; if (t === 'INPUT' && e.key !== 'Escape') return;
    if (e.key === 'Escape' || e.key === 'j' || e.key === 'J') { e.preventDefault(); this.close(); }
  };
  private spawnTarget(kind: RobotKind, x: number, z: number) {
    const u = spawnRobot(this.host as unknown as Game, kind, kind.startsWith('prc') ? 'prc' : 'soviet', x, z);
    u.yaw = Math.PI + (Math.random() - 0.5) * 0.6; u.demo = { speed: kind === 'prc_scout' ? 0 : 0.6 };
    u.userData = { kind, x, z };
  }
  // -------------------------------------------------------------------------------------------- the design
  setDesign(d: WeaponDesign) {
    this.d = d;
    if (this.wm) { this.wm.root.removeFromParent(); }
    this.wm = buildWeaponMesh(d, 'uspc');
    this.pitch.add(this.wm.root);
    this.wm.root.position.set(0, 0.06, -this.wm.length * 0.3);
    this.dmgLog = [];
    this.paint();
  }
  private pick(slot: Slot, id: string) {
    const d = { ...this.d, [slot]: id } as WeaponDesign;
    const s = store(), i = s.designs.findIndex((x) => x.id === d.id);
    if (i >= 0 && !d.id.startsWith('stock-')) { s.designs[i] = d; saveStore(); }
    else if (i >= 0) { const n = { ...d, id: newDesign().id, name: d.name.replace(/^/, '') + ' MOD' }; s.designs.push(n); saveStore(); this.setDesign(n); return; }
    this.setDesign(d);
  }
  private paint() {
    const d = this.d, s = store(), G = genesOf(this.game), why = refuse(d, G), st = weaponStats(d), cost = weaponCost(d), short = lack(this.game, d), tooled = isTooled(d);
    const fac = (this.game as unknown as { factory?: { count(id: string): number } } | null)?.factory;
    const files = s.designs.map((x) => `<span data-file="${x.id}" class="${x.id === d.id ? 'on' : ''}">${x.name}</span>`).join('');
    const cards = SLOTS.map((slot) => {
      const rows = partsOf(slot).map((p) => {
        const locked = !!p.genes && !p.genes.some(G);
        const on = d[slot] === p.id;
        return `<div class="row ${on ? 'on' : ''} ${locked ? 'lock' : ''}" data-slot="${slot}" data-part="${p.id}"><span class="box">${on ? '[x]' : '[ ]'}</span><span class="nm">${p.name}</span>${locked ? `<span class="gn">GENE: ${p.genes!.join(' / ').replace(/_/g, ' ')}</span>` : ''}</div>`;
      }).join('');
      return `<div class="card"><div class="t">${SLOT_NAME[slot]}</div>${rows}<div class="desc">${PART[d[slot]]?.desc ?? ''}</div></div>`;
    }).join('');
    const bar = (v: number, max: number) => `<span class="bar"><i style="width:${Math.max(2, Math.min(100, (v / max) * 100))}%"></i></span>`;
    const figs = [['DAMAGE', st.dmg.toFixed(1), st.dmg, 40], ['RATE /S', st.rate.toFixed(2), st.rate, 6], ['RANGE M', st.range.toFixed(1), st.range, 20], ['SPREAD', (st.spread * 57.3).toFixed(1) + '°', st.spread, 0.2], ['HEAT', st.heat.toFixed(1), st.heat, 6], ['AMMO /SH', st.ammo.toFixed(2), st.ammo, 3], ['WEIGHT KG', (st.weight * 4).toFixed(0), st.weight, 30], ['OUTPUT', st.dps.toFixed(1), st.dps, 60]] as const;
    const fxs = Object.entries(st.fx).filter(([, v]) => v).map(([k, v]) => `${k.toUpperCase()} ${Number(v).toFixed(0)}`).join(' · ');
    const bill = Object.entries(cost).map(([k, n]) => { const have = fac ? fac.count(k) : Infinity; return `<span class="${have < (n ?? 0) ? 'no' : ''}">${n} ${k.replace(/_/g, ' ')}${fac ? ` (${have})` : ''}</span>`; }).join(' · ');
    const kinds: RobotKind[] = ['scout', 'worker', 'trooper', 'heavy', 'artillery', 'walker'];
    this.el.innerHTML = `
      <div class="sheet">
        <h1>ORDNANCE BRANCH · U.S.P.C.</h1>
        <div class="no">DWG No. ${d.id.toUpperCase().slice(0, 10)} <input class="name" value="${d.name}" maxlength="22"></div>
        <div class="files">${files}<span data-new="1">+ NEW DRAWING</span></div>
        ${cards}
      </div>
      <div class="right">
        <canvas class="bp" width="360" height="190"></canvas>
        <div class="figs">
          ${why ? `<div class="stamp no">REFUSED · ${why.toUpperCase()}</div>` : tooled ? '<div class="stamp ok">ON THE LINE</div>' : '<div class="stamp ok">APPROVED</div>'}
          ${figs.map(([k, v, x, m]) => `<div class="r"><span class="k">${k}</span><span class="v">${v}</span>${bar(x, m)}</div>`).join('')}
          <div class="r" style="margin-top:3px"><span class="k">FIRES</span><span>${st.shot.toUpperCase()}${fxs ? ' · ' + fxs : ''} · ${st.mount === 'mount' ? 'MOUNT' : 'HAND / ARM'}</span></div>
          <div class="bill">TOOLING: ${bill}${short ? `<br><span class="no">${short}</span>` : ''}</div>
        </div>
        <div class="btns">
          <button data-act="tool" ${why || tooled ? 'disabled' : ''}>TOOL UP</button>
          <button data-act="hand" ${why || !tooled ? 'disabled' : ''}>GOLEM: ARM${s.golem.hand === d.id ? ' ✓' : ''}</button>
          <button data-act="mount" ${why || !tooled ? 'disabled' : ''}>GOLEM: MOUNT${s.golem.mount === d.id ? ' ✓' : ''}</button>
          <select data-act="issue" ${why || !tooled ? 'disabled' : ''}><option value="">ISSUE TO ROBOTS…</option>${kinds.map((k) => `<option value="${k}">${k.toUpperCase()}${s.issue[k] === d.id ? ' ✓' : ''}</option>`).join('')}</select>
          <button data-act="fire">${this.firing ? 'HOLD FIRE' : 'TEST FIRE'}</button>
          <button class="red" data-act="close">CLOSE [J]</button>
        </div>
      </div>
      <div class="meter">RANGE METER · OUTPUT <b class="dps">0.0</b> /S</div>
      <div class="hint">TICK A LINE ON EACH CARD · THE RANGE FIRES WHAT IS DRAWN</div>`;
    this.el.querySelectorAll<HTMLElement>('.row').forEach((r) => r.onclick = () => { if (!r.classList.contains('lock')) this.pick(r.dataset.slot as Slot, r.dataset.part!); });
    this.el.querySelectorAll<HTMLElement>('[data-file]').forEach((r) => r.onclick = () => { const x = designById(r.dataset.file); if (x) this.setDesign({ ...x }); });
    this.el.querySelector<HTMLElement>('[data-new]')!.onclick = () => { const n = newDesign({ frame: d.frame, power: d.power, barrel: d.barrel, payload: d.payload }); store().designs.push(n); saveStore(); this.setDesign(n); };
    const nm = this.el.querySelector<HTMLInputElement>('input.name')!;
    nm.onchange = () => { const s2 = store(), i = s2.designs.findIndex((x) => x.id === d.id); d.name = nm.value.toUpperCase().slice(0, 22) || d.name; if (i >= 0) { s2.designs[i] = { ...d }; saveStore(); } this.paint(); };
    const act = (a: string) => this.el.querySelector<HTMLElement>(`[data-act="${a}"]`)!;
    act('tool').onclick = () => { const e = toolUp(this.game, d); if (e) alertStamp(this.el, e); this.paint(); };
    act('hand').onclick = () => { equipGolem(this.game, 'hand', store().golem.hand === d.id ? null : d.id); this.paint(); };
    act('mount').onclick = () => { equipGolem(this.game, 'mount', store().golem.mount === d.id ? null : d.id); this.paint(); };
    (act('issue') as HTMLSelectElement).onchange = (e) => { const k = (e.target as HTMLSelectElement).value; if (k) issueTo(this.game, k, store().issue[k] === d.id ? null : d.id); this.paint(); };
    act('fire').onclick = () => { this.firing = !this.firing; this.paint(); };
    act('close').onclick = () => this.close();
    drawElevation(this.el.querySelector<HTMLCanvasElement>('canvas.bp')!, d);
  }
  // -------------------------------------------------------------------------------------------- the screen
  update(dt: number) {
    this.t += dt; this.host.world.time += dt;
    const why = refuse(this.d, genesOf(this.game));
    // aim at the nearest standing target, fire what is drawn
    const live = this.host.robots.filter((u) => !u.dead);
    const tgt = live.sort((a, b) => a.z - b.z)[0];
    if (tgt && this.wm) {
      const p = new THREE.Vector3(tgt.x, tgt.y + tgt.height * 0.5, tgt.z);
      const o = this.yaw.getWorldPosition(new THREE.Vector3());
      this.yaw.rotation.y = THREE.MathUtils.damp(this.yaw.rotation.y, Math.atan2(p.x - o.x, p.z - o.z), 8, dt);
      this.pitch.rotation.x = THREE.MathUtils.damp(this.pitch.rotation.x, -Math.atan2(p.y - o.y, Math.hypot(p.x - o.x, p.z - o.z)), 8, dt);
      this.cd -= dt;
      if (this.firing && !why && this.cd <= 0) {
        const w = toWeapon(this.d);
        this.cd = w.cd;
        this.scene.updateMatrixWorld(true);
        const mz = this.wm.muzzle.getWorldPosition(new THREE.Vector3());
        const hp0 = live.reduce((a, u) => a + u.hp, 0);
        fireWeapon(this.host, { faction: 'veyr', x: 0, z: 0 }, mz, p, w);
        this.dmgLog.push({ t: this.t, n: -hp0 });
        this.wm.root.position.z = -this.wm.length * 0.3 - 0.04;
      }
    }
    if (this.wm) this.wm.root.position.z = THREE.MathUtils.damp(this.wm.root.position.z, -this.wm.length * 0.3, 10, dt);
    const hpBefore = this.host.robots.reduce((a, u) => a + Math.max(0, u.hp), 0);
    tickRobots(this.host, dt);
    const hpAfter = this.host.robots.reduce((a, u) => a + Math.max(0, u.hp), 0);
    // the output meter: damage over the last five seconds
    if (hpBefore > hpAfter) this.dmgLog.push({ t: this.t, n: hpBefore - hpAfter });
    this.dmgLog = this.dmgLog.filter((e) => e.t > this.t - 5);
    const dps = this.dmgLog.reduce((a, e) => a + Math.max(0, e.n), 0) / 5;
    const m = this.el.querySelector('.dps'); if (m) m.textContent = dps.toFixed(1);
    // targets that fell walk back on
    for (const u of [...this.host.robots]) if (u.dead && !u.userData.gone) { u.userData.gone = true; this.respawn.push({ ...(u.userData as { kind: RobotKind; x: number; z: number }), t: 3 }); }
    for (let i = this.respawn.length - 1; i >= 0; i--) { const r = this.respawn[i]; r.t -= dt; if (r.t <= 0) { this.respawn.splice(i, 1); this.spawnTarget(r.kind, r.x, r.z); } }
    this.fx.update(dt, this.engine.h, this.cam.fov);
  }
  resize(w: number, h: number) { this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
  suspend() { this.el.style.display = 'none'; }
  resume() { this.el.style.display = ''; }
  dispose() {
    WeaponBench.current = null;
    removeEventListener('keydown', this.onKey);
    this.el.remove(); this.style.remove();
    for (const u of [...this.host.robots]) u.dispose();
  }
  /** the range, drawn by the engine */
  render(post: Post, t: number) { post.render(this.scene, this.cam, this.fxs, t); }
}

function alertStamp(root: HTMLElement, why: string) {
  const s = document.createElement('div');
  s.className = 'stamp no'; s.textContent = why.toUpperCase();
  s.style.cssText = 'position:fixed;left:50%;top:40%;transform:translate(-50%,-50%) rotate(-6deg);background:#e2dbc6;font-size:14px;z-index:60;pointer-events:none';
  root.appendChild(s); setTimeout(() => s.remove(), 1800);
}

/** the cyanotype elevation: white ink on Prussian blue, a faint grid, each part drawn as its outline with a callout */
function drawElevation(cv: HTMLCanvasElement, d: WeaponDesign) {
  const g = cv.getContext('2d')!; const W = cv.width, H = cv.height;
  g.fillStyle = '#1d3b5a'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#2a4d70'; g.lineWidth = 1;
  for (let x = 0.5; x < W; x += 12) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0.5; y < H; y += 12) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  const ink = '#e8eef0';
  // a wobbly ink line, as if drawn by hand
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.9;
  const ln = (x0: number, y0: number, x1: number, y1: number, w = 1) => { g.strokeStyle = ink; g.lineWidth = w; g.beginPath(); g.moveTo(Math.round(x0 + rnd()) + 0.5, Math.round(y0 + rnd()) + 0.5); const mx = (x0 + x1) / 2 + rnd(), my = (y0 + y1) / 2 + rnd(); g.lineTo(Math.round(mx) + 0.5, Math.round(my) + 0.5); g.lineTo(Math.round(x1 + rnd()) + 0.5, Math.round(y1 + rnd()) + 0.5); g.stroke(); };
  const rect = (x: number, y: number, w: number, h: number) => { ln(x, y, x + w, y); ln(x + w, y, x + w, y + h); ln(x + w, y + h, x, y + h); ln(x, y + h, x, y); };
  // a callout: a leader from the part to a shelf line at the sheet's edge, the name lettered on the shelf
  const label = (s: string, x: number, y: number, side: 'l' | 'r', ty: number) => {
    const ex = side === 'l' ? 8 : W - 8, sx = side === 'l' ? 118 : W - 118;
    ln(x, y, sx, ty); ln(sx, ty, ex, ty);
    g.fillStyle = ink; g.font = '10px VT, monospace'; g.textAlign = side === 'l' ? 'left' : 'right'; g.fillText(s, ex, ty - 3);
  };
  const cy = 105;
  const f = d.frame, rx = f === 'pistol' ? 120 : 95, rw = f === 'cannon' ? 90 : f === 'pistol' ? 50 : 75, rh = f === 'cannon' ? 34 : f === 'turret' ? 30 : 22;
  // stock / grip / mount
  if (f === 'rifle') { ln(rx, cy - 6, rx - 55, cy + 6); ln(rx - 55, cy + 6, rx - 58, cy + 20); ln(rx - 58, cy + 20, rx, cy + 10); }
  if (f === 'pistol' || f === 'rifle') { ln(rx + 14, cy + rh / 2, rx + 8, cy + rh / 2 + 24); ln(rx + 8, cy + rh / 2 + 24, rx + 22, cy + rh / 2 + 24); ln(rx + 22, cy + rh / 2 + 24, rx + 26, cy + rh / 2); }
  if (f === 'turret') { rect(rx - 10, cy + rh / 2 + 6, rw + 20, 8); ln(rx + rw / 2, cy + rh / 2, rx + rw / 2, cy + rh / 2 + 6); }
  if (f === 'armmount') { for (const x of [rx + 12, rx + rw - 14]) { ln(x - 8, cy + rh / 2 + 2, x + 8, cy + rh / 2 + 2); ln(x - 8, cy + rh / 2 + 2, x - 8, cy + rh / 2 + 14); ln(x + 8, cy + rh / 2 + 2, x + 8, cy + rh / 2 + 14); } }
  if (f === 'cannon') { ln(rx + 20, cy + rh / 2, rx + 10, cy + rh / 2 + 22); ln(rx + 60, cy + rh / 2, rx + 70, cy + rh / 2 + 22); ln(rx, cy + rh / 2 + 22, rx + 80, cy + rh / 2 + 22); }
  rect(rx, cy - rh / 2, rw, rh);
  label(PART[f]?.name.toUpperCase() ?? '', rx + rw * 0.3, cy - rh / 2, 'l', 52);
  // power unit
  const p = d.power, px = rx + rw * 0.25;
  if (p === 'powder') rect(px, cy + rh / 2, 16, 18);
  if (p === 'electric') { for (let i = 0; i < 4; i++) rect(rx + rw + i * 6, cy - 8, 4, 16); for (let i = 0; i < 3; i++) rect(px + i * 9, cy - rh / 2 - 14, 5, 14); }
  if (p === 'steam') { rect(px - 6, cy + rh / 2, 44, 14); ln(px + 38, cy + rh / 2 + 7, px + 46, cy + rh / 2 + 7); }
  if (p === 'gravity') for (let i = 0; i < 3; i++) rect(rx + rw + i * 8, cy - 11, 5, 22);
  if (p === 'atomic') { rect(px, cy - rh / 2 - 16, 34, 16); ln(px + 4, cy - rh / 2 - 8, px + 30, cy - rh / 2 - 8); }
  label(PART[p]?.name.toUpperCase() ?? '', px + 8, cy - rh / 2 - 4, 'r', 46);
  // barrel / emitter
  const b = d.barrel, bx = rx + rw + (p === 'electric' ? 26 : p === 'gravity' ? 26 : 0);
  let bl = 120;
  if (b === 'rifled') { bl = f === 'pistol' ? 40 : 130; rect(bx, cy - 4, bl, 8); if (f !== 'pistol') rect(bx, cy - 7, bl * 0.55, 14); }
  if (b === 'rail') { bl = 140; ln(bx, cy - 5, bx + bl, cy - 5, 2); ln(bx, cy + 5, bx + bl, cy + 5, 2); for (let i = 0; i < 5; i++) rect(bx + 10 + i * 28, cy - 9, 4, 18); }
  if (b === 'flame') { bl = 80; rect(bx, cy - 3, 54, 6); ln(bx + 54, cy - 3, bx + bl, cy - 9); ln(bx + 54, cy + 3, bx + bl, cy + 9); ln(bx + bl, cy - 9, bx + bl, cy + 9); }
  if (b === 'lens') { bl = 84; rect(bx, cy - 4, 50, 8); ln(bx + 50, cy - 4, bx + 74, cy - 18); ln(bx + 50, cy + 4, bx + 74, cy + 18); rect(bx + 74, cy - 20, 8, 40); }
  if (b === 'spore') { bl = 100; rect(bx, cy - 10, 86, 20); ln(bx + 86, cy - 10, bx + bl, cy - 14); ln(bx + 86, cy + 10, bx + bl, cy + 14); }
  label(PART[b]?.name.toUpperCase() ?? '', bx + bl * 0.6, cy + 6, 'r', H - 26);
  // payload
  const a = d.payload;
  if (['venom', 'acid', 'spores', 'paralytic'].includes(a)) { rect(px - 4, cy - rh / 2 - 28, 30, 14); ln(px + 26, cy - rh / 2 - 21, bx + 10, cy - 6); }
  if (a === 'napalm') { rect(px - 6, cy + rh / 2 + 4, 44, 10); rect(px - 6, cy + rh / 2 + 15, 44, 10); }
  if (a === 'rocks') rect(px, cy - rh / 2 - 14, 30, 14);
  if (a === 'spines') for (let i = 0; i < 5; i++) ln(px + i * 5, cy - rh / 2, px + i * 5 + 6, cy - rh / 2 - 16);
  label(PART[a]?.name.toUpperCase() ?? '', px, cy + rh / 2 + 10, 'l', H - 26);
  // the overall dimension line
  const x0 = f === 'rifle' ? rx - 58 : rx, x1 = bx + bl;
  ln(x0, H - 8, x1, H - 8); ln(x0, H - 12, x0, H - 4); ln(x1, H - 12, x1, H - 4);
  g.fillStyle = ink; g.textAlign = 'center'; g.font = '10px VT, monospace';
  g.fillText(`${((x1 - x0) / 100).toFixed(2)} M`, (x0 + x1) / 2, H - 11);
  g.textAlign = 'left'; g.font = '11px Jersey, monospace'; g.fillText(d.name, 8, 14); g.textAlign = 'right'; g.fillText('SIDE ELEVATION · SCALE 1:8', W - 8, 14);
}

/** open the bench over a game (or anything: game may be null for the test page) */
export function openBench(engine: Engine, game: Game | null) {
  if (WeaponBench.current) return WeaponBench.current;
  const b: WeaponBench = new WeaponBench(engine, game, () => { if (engine.screen === b) engine.pop(); b.dispose(); });
  engine.push(b);
  return b;
}
void PARTS;
