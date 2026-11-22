// THE MONITOR (bridge, ship:fn:link): the system's worlds and the landing, as one small 3D globe in a brass bezel.
// The world's real regions are painted on it (biomes in their colours, seas, ice caps, the region borders) and it is a
// kit 3D element: drag to spin and tilt it. Five worlds sit under it as little globes (the easiest marked); pick one and
// the big globe spins up and re-skins. The three safest landing sites stand on it as beacons; the colony's own region
// carries the pod. Pick a site: its name and danger come up and DEPLOY lights.
import * as THREE from 'three';
import type { PanelCtx, Panel } from './index';
import { KitView, type KView } from '../kitview';
import { div, place, artCanvas, S, keyCap, iconOf, clean, textEl, pxLine } from '../ui';
import { plate } from '../../../ui/kit/mat';
import { Px, P, INK, hex, hash, mixHex } from '../../../ui/kit/px';
import { libColor } from '../../../ui/kit/libmat';
import { toon, renderModel, fitRoot } from '../../../ui/kit/model3d';
import { bitText } from '../../../ui/kit/bitfont';
import { uiSfx } from '../../../ui/kit/sound';
import { Spring, pop, squash } from '../../../ui/kit/juice';
import { systemWorlds, type World } from '../../hub/monitor';
import { BIOME_COL, type Planet, type PRegion } from '../../../world/planet';
import { shipLander } from '../../hub/index';

const SEA = new Set(['ocean', 'reef', 'archipelago']);
/** the world's surface as an equirect pixel map: warped regions, biome colour with a real rock grain, seas, ice, borders */
function planetTex(p: Planet, W = 192, H = 96): THREE.DataTexture {
  const data = new Uint8Array(W * H * 4);
  const C = p.regions.map((r) => new THREE.Vector3(...r.c));
  const n = new THREE.Vector3();
  const vn = (x: number, y: number, z: number, s: number) => { // cheap value noise on the sphere
    const f = (a: number) => Math.floor(a);
    return hash(f(x * s + 50), f(y * s + 50) * 31 + f(z * s + 50) * 7, p.seed);
  };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const u = (i + 0.5) / W, v = (j + 0.5) / H, phi = u * Math.PI * 2, th = (1 - v) * Math.PI;
    n.set(-Math.cos(phi) * Math.sin(th), Math.cos(th), Math.sin(phi) * Math.sin(th));
    // warp the lookup a little so borders wander
    const wx = (vn(n.x, n.y, n.z, 4) - 0.5) * 0.22, wy = (vn(n.y, n.z, n.x, 4) - 0.5) * 0.22, wz = (vn(n.z, n.x, n.y, 4) - 0.5) * 0.22;
    const q = new THREE.Vector3(n.x + wx, n.y + wy, n.z + wz).normalize();
    let b1 = -2, b2 = -2, k1 = 0;
    for (let k = 0; k < C.length; k++) { const d = q.dot(C[k]); if (d > b1) { b2 = b1; b1 = d; k1 = k; } else if (d > b2) b2 = d; }
    const r = p.regions[k1], sea = SEA.has(r.biome);
    let col = BIOME_COL[r.biome];
    const grain = libColor('stone', i * 3, j * 3), gl = (((grain >> 16) & 255) + ((grain >> 8) & 255) + (grain & 255)) / 765;
    let k = 0.78 + (gl - 0.5) * 0.5 + (vn(n.x, n.y, n.z, 11) - 0.5) * 0.18;
    if (sea) { col = vn(n.x, n.y, n.z, 7) > 0.78 && r.biome !== 'ocean' ? mixHex(BIOME_COL.coast, 0x8a7a50, 0.3) : mixHex(0x163848, 0x2a6070, vn(n.x, n.y, n.z, 3)); k = 0.9 + (gl - 0.5) * 0.15; }
    if (Math.abs(n.y) > 0.9 - vn(n.x, 0, n.z, 6) * 0.06) { col = 0xd8e0e4; k = 0.92 + (gl - 0.5) * 0.3; }
    if (b1 - b2 < 0.012) k *= 0.62; // the region border
    const o = (j * W + i) * 4;
    data[o] = Math.min(255, ((col >> 16) & 255) * k); data[o + 1] = Math.min(255, ((col >> 8) & 255) * k); data[o + 2] = Math.min(255, (col & 255) * k); data[o + 3] = 255;
  }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat); t.colorSpace = THREE.NoColorSpace;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.wrapS = THREE.RepeatWrapping; t.needsUpdate = true;
  return t;
}
const texCache = new Map<number, THREE.DataTexture>();
const texOf = (p: Planet) => { let t = texCache.get(p.seed); if (!t) { t = planetTex(p); texCache.set(p.seed, t); } return t; };
function globeModel(w: World | { planet: Planet; size?: number }, ringed: boolean): THREE.Group {
  const g = new THREE.Group();
  const s = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), toon({ map: texOf(w.planet), gloss: 0.1, rim: 0.25 }));
  s.name = 'surface'; s.position.y = 1; g.add(s);
  if (ringed) { const r = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.05, 4, 64), toon({ color: 0xc8b48a, gloss: 0.3 })); r.rotation.set(Math.PI / 2 - 0.35, 0, 0.25); r.position.y = 1; g.add(r); }
  return g;
}

const BIOME_TEXT: Record<string, [string, string]> = {
  meadow: ['MEADOW', 'Open grassland and soft soil: easy building, steady water.'],
  jungle: ['JUNGLE', 'Dense wet forest: rich wood and life, slow going.'],
  savanna: ['SAVANNA', 'Dry grass and scattered trees: wide ground, little water.'],
  marsh: ['MARSH', 'Wetland and peat: water everywhere, soft footings.'],
  highland: ['HIGHLAND', 'Hills and stone: ore close to the surface, hard ground.'],
  tundra: ['TUNDRA', 'Frozen plain: cold nights, thin soil, little life.'],
  desert: ['DESERT', 'Sand and rock: sun for power, no water.'],
  crystal: ['CRYSTAL FIELD', 'Crystal outcrops: rare minerals, odd life.'],
  ashland: ['ASHLAND', 'Volcanic ash and vents: heat and sulphur, poor soil.'],
  coast: ['COAST', 'Shore and dunes: water, salt and fish.'],
  archipelago: ['ARCHIPELAGO', 'Small islands on open water: little room to build.'],
  reef: ['REEF', 'Coral shallows: sea life, almost no dry ground.'],
  ocean: ['OPEN OCEAN', 'Deep water: a splashdown, no ground.'],
};
const DIFF = ['', 'GENTLE', 'FAIR', 'HARSH', 'SEVERE', 'LETHAL'];
const DANGER = ['', 'LOW', 'MEDIUM', 'HIGH'];

export function monitorPanel(ctx: PanelCtx): Panel {
  const { w: W, h: H, host } = ctx;
  const L = shipLander();
  const runSeed = ctx.game?.run?.seed ?? L?.runSeed() ?? 1;
  const worlds = systemWorlds(runSeed);
  const here = L?.planet() ?? null;
  if (here && !worlds.some((x) => x.seed === here.seed)) worlds[0] = { ...worlds[0], seed: here.seed, planet: here };
  let wi = Math.max(0, here ? worlds.findIndex((x) => x.seed === here.seed) : worlds.reduce((b, x, k) => (x.diff < worlds[b].diff ? k : b), 0));
  const best = worlds.reduce((b, x, k) => (x.diff < worlds[b].diff ? k : b), 0);
  const homeSeed: number | null = ctx.game?.opts?.seed ?? null;

  // ---- the panel's face: gunmetal, the globe's sunk bezel at the upper left, a readout plate beside it
  const G = 172, gx = 8, gy = 6;
  const bg = artCanvas(W, H); host.append(bg);
  {
    const p = plate(W, H, { mat: 'gun', seed: 23, chamfer: 3, wear: 0.9, screws: true, grime: 0.7 });
    const cx = gx + G / 2, cy = gy + G / 2, R = G / 2;
    p.disc(cx, cy, R + 3, () => INK);
    p.disc(cx, cy, R + 2, (d, lit) => libColor('brass', Math.round(cx + lit * 40), Math.round(cy + d), 0.72 + lit * 0.42));
    p.disc(cx, cy, R - 1, () => INK);
    p.disc(cx, cy, R - 2, (d) => mixHex(0x05070c, 0x101a2a, Math.max(0, 1 - d / R) * 0.8));
    for (let i = 0; i < 50; i++) { const a = hash(i, 3, 9) * Math.PI * 2, rr = Math.sqrt(hash(i, 4, 9)) * (R - 6); p.set(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr), hash(i, 5, 9) > 0.8 ? 0xfff0d0 : 0x8090a8); }
    p.blit(plate(W - G - 22, G, { mat: 'enamel', seed: 5, chamfer: 2, wear: 0.5, lip: 1 }), G + 14, gy);
    p.blit(plate(W - 16, 112, { mat: 'enamel', seed: 6, chamfer: 2, wear: 0.5, lip: 1 }), 8, gy + G + 50);
    bg.getContext('2d')!.putImageData(p.image(), 0, 0);
  }
  // ---- the globe, a kit 3D element
  const gcv = artCanvas(G - 6, G - 6); place(gcv, gx + 3, gy + 3); host.append(gcv); gcv.style.cursor = 'grab'; gcv.style.touchAction = 'none';
  const ov = artCanvas(G - 6, G - 6); place(ov, gx + 3, gy + 3); ov.style.pointerEvents = 'none'; host.append(ov);
  const oc = ov.getContext('2d')!;
  let kv: KitView;
  const build = () => { const m = globeModel(worlds[wi], hash(worlds[wi].seed, 1) > 0.6); kv = new KitView(m, { ink: 2, edge: 0.05, rimK: 0.9 }); };
  build();
  const yaw = new Spring(0, { k: 30, d: 9 }), pitch = new Spring(0.35, { k: 30, d: 9 }), zoom = new Spring(1.02, { k: 50, d: 11 });
  let spin = 0.12;
  const view = (): KView => ({ w: gcv.width, h: gcv.height, yaw: yaw.x, pitch: pitch.x, zoom: zoom.x });
  let dirty = true, acc = 0, t = 0;
  const draw = () => { kv.draw(gcv.getContext('2d')!, view()); dirty = false; };
  let sites: PRegion[] = [], site = -1;
  const pickSites = () => { sites = worlds[wi].planet.regions.filter((r) => r.state !== 'veyr' && r.state !== 'lost' && r.seed !== homeSeed).sort((a, b) => a.danger - b.danger).slice(0, 3); site = -1; };
  pickSites();
  const face = (r: PRegion | null) => { if (!r) return; const [x, , z] = r.c, a = Math.atan2(-x, z); yaw.target = a + Math.round((yaw.target - a) / (Math.PI * 2)) * Math.PI * 2; pitch.target = 0.35 + r.c[1] * 0.5; };
  face(sites[0] ?? null);
  const homeR = (): PRegion | null => (homeSeed !== null && here && worlds[wi].seed === here.seed ? here.regions.find((r) => r.seed === homeSeed) ?? null : null);
  // ---- the world's readout beside the globe
  const facts = div('s7-abs', host); place(facts, G + 20, gy + 5, W - G - 34); facts.style.display = 'flex'; facts.style.flexDirection = 'column'; facts.style.gap = '0';
  const paintFacts = () => {
    const wd = worlds[wi], f = Object.fromEntries(wd.facts);
    const row = (k: string, v: string, col = '#2a2014') => { const r = div(''); r.style.display = 'flex'; r.style.justifyContent = 'space-between'; r.append(textEl(k, { dark: true, color: '#6a5a40', wrap: false }), textEl(v, { dark: true, color: col, wrap: false })); return r; };
    facts.replaceChildren(
      textEl(clean(wd.planet.name.toUpperCase()), { dark: true, color: '#2a2014', wrap: false }),
      textEl(`${DIFF[wd.diff]} WORLD (${wd.diff}/5)${wi === best ? ', EASIEST' : ''}`, { dark: true, color: wd.diff <= 2 ? '#2e6a2a' : wd.diff <= 3 ? '#8a5a10' : '#8a2a1a', wrap: false }),
      row('Gravity', f.GRAVITY ?? '--'), row('Mean temp', f['MEAN TEMP'] ?? '--'), row('Air', (f.ATMOSPHERE ?? '--').replace(' ATM', ' atm')), row('Water', f['SURFACE WATER'] ?? '--'),
      row('Life', (f['LIFE SIGNS'] ?? '--').toLowerCase()), row('Regions', f.REGIONS ?? '--'),
      textEl(clean(wd.tag), { dark: true, color: '#6a5a40' }),
    );
  };
  paintFacts();
  // ---- the system's worlds
  const sysL = textEl('THE SYSTEM: 5 WORLDS (* = EASIEST)', { color: '#e8dcc0', wrap: false }); sysL.className += ' s7-abs'; place(sysL, 10, gy + G + 4); host.append(sysL);
  const row = div('s7-abs', host); place(row, 10, gy + G + 14); row.style.display = 'flex'; row.style.gap = 6 * S + 'px';
  const chips: HTMLCanvasElement[] = [];
  worlds.forEach((_wd, i) => {
    const cv = artCanvas(32, 32, ''); cv.style.cursor = 'pointer'; cv.className = 's7-tab'; row.append(cv); chips.push(cv);
    cv.title = clean(worlds[i].planet.name);
    cv.addEventListener('pointerenter', () => uiSfx('hover', 0.4));
    cv.addEventListener('click', () => { if (i === wi) return; wi = i; uiSfx('glitch', 0.4); uiSfx('select', 0.6); squash(cv, 0.7); reskin(); });
  });
  const paintChips = () => worlds.forEach((wd, i) => {
    const c = chips[i].getContext('2d')!; c.clearRect(0, 0, 32, 32);
    const pp = new Px(32, 32); pp.disc(16, 16, 15, () => INK); pp.disc(16, 16, 14, (_d, lit) => (i === wi ? P.ochre : P.steel)[Math.max(0, Math.min(6, Math.round(3 + lit * 2)))]);
    c.putImageData(pp.image(), 0, 0);
    renderModel(fitRoot(globeModel(wd, false)), c, 26, 26, { yaw: 0.6 + i, pitch: 0.3, zoom: 1.05, ink: 1 }, 3, 3);
    if (i === best) bitText(c, '*', 26, -3, { color: '#ffd060' });
  });
  paintChips();
  // ---- the landing sites: a row each (number, name, ground, danger); the picked one described
  const siteBox = div('s7-abs', host); place(siteBox, 14, gy + G + 54, W - 28, 104); siteBox.style.display = 'flex'; siteBox.style.flexDirection = 'column'; siteBox.style.gap = 1 * S + 'px';
  const paintSites = () => {
    siteBox.replaceChildren(textEl('LANDING SITES (SAFEST FIRST)', { dark: true, color: '#6a5a40', wrap: false }));
    const hr = homeR(); if (hr) siteBox.append(textEl(`POD: your colony, ${clean(hr.name)}`, { dark: true, color: '#1a5a7a', wrap: false }));
    sites.forEach((r, k) => {
      const b = BIOME_TEXT[r.biome] ?? [r.biome.toUpperCase(), ''];
      const e = textEl(`${k === site ? '>' : ' '}${k + 1}. ${clean(r.name)}: ${b[0].toLowerCase()}, danger ${DANGER[r.danger] ?? r.danger}`, { dark: true, color: k === site ? '#2a2014' : '#5a4a30', wrap: false });
      e.style.cursor = 'pointer'; e.addEventListener('click', () => pick(k)); e.addEventListener('pointerenter', () => uiSfx('hover', 0.3));
      siteBox.append(e);
    });
    const r = site >= 0 ? sites[site] : null;
    siteBox.append(textEl(r ? (BIOME_TEXT[r.biome]?.[1] ?? '') : 'Pick a site: click its beacon on the globe or its line here.', { dark: true, color: r ? '#2a2014' : '#8a7a5a' }));
  };
  paintSites();
  const statusEl = div('s7-abs', host); place(statusEl, 10, H - 40, W - 150);
  const paintStatus = () => statusEl.replaceChildren(textEl(!L ? 'No mission link: deploying needs the mission flow.' : site < 0 ? 'DEPLOY drops a new pod on the picked site.' : `Ready: DEPLOY sends a pod to ${clean(sites[site].name)}.`, { color: site >= 0 ? '#b8f0a0' : '#d8ccb0' }));
  paintStatus();
  const deploy = keyCap(host, { label: 'DEPLOY', icon: iconOf('drone', 'amber'), w: 120, h: 32, mat: 'orange', sound: 'confirm', off: () => (site < 0 ? 'PICK A SITE' : !L ? 'NO MISSION' : false), onClick: () => void go() });
  place(deploy.el, W - 132, H - 42); deploy.el.style.position = 'absolute';
  const pick = (k: number) => { site = k; uiSfx('select', 0.7); uiSfx('metalClose', 0.3); face(sites[k]); paintSites(); paintStatus(); deploy.refresh(); deploy.flash(); };
  const reskin = () => { build(); pickSites(); paintChips(); paintFacts(); paintSites(); paintStatus(); deploy.refresh(); pop(facts, 0.5); yaw.kick(14); zoom.x = 0.7; zoom.target = 1.02; face(sites[0] ?? null); dirty = true; };
  // ---- input on the globe
  let drag: { x: number; y: number; yaw: number; pitch: number; moved: boolean } | null = null;
  const local = (e: PointerEvent) => { const r = gcv.getBoundingClientRect(); return [(e.clientX - r.left) / S, (e.clientY - r.top) / S]; };
  gcv.addEventListener('pointerdown', (e) => { const [x, y] = local(e); drag = { x, y, yaw: yaw.target, pitch: pitch.target, moved: false }; gcv.setPointerCapture(e.pointerId); spin = 0; });
  gcv.addEventListener('pointermove', (e) => {
    const [x, y] = local(e);
    if (drag) { const dx = x - drag.x, dy = y - drag.y; if (Math.hypot(dx, dy) > 3) drag.moved = true; if (drag.moved) { yaw.target = drag.yaw + dx * 0.02; pitch.target = Math.max(-0.9, Math.min(1.2, drag.pitch + dy * 0.012)); } return; }
    gcv.style.cursor = hit(x, y) >= 0 ? 'pointer' : 'grab';
  });
  gcv.addEventListener('pointerup', (e) => {
    const d = drag; drag = null; try { gcv.releasePointerCapture(e.pointerId); } catch { /* */ }
    if (!d) return;
    if (d.moved) { setTimeout(() => { spin = 0.12; }, 2500); return; }
    const [x, y] = local(e), k = hit(x, y); if (k >= 0) pick(k);
  });
  const hit = (x: number, y: number) => {
    let bi = -1, bd = 12;
    sites.forEach((r, k) => { const n = new THREE.Vector3(...r.c), [px, py, f] = kv.project(n.clone().setY(n.y + 1), view(), n); if (!f) return; const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; bi = k; } });
    return bi;
  };
  const go = async () => {
    const r = sites[site]; if (!r || !L) return;
    uiSfx('thudHeavy', 0.6); ctx.shake(1.5);
    zoom.target = 1.6; yaw.kick(-6);
    await new Promise((res) => setTimeout(res, 420));
    const seed = worlds[wi].seed, hub = ctx.hub;
    const scr = (window as unknown as { __ship7?: { dispose(): void } }).__ship7;
    if (hub) { (window as unknown as { __hubPanel?: { dispose(): void } }).__hubPanel?.dispose(); const { podDrop } = await import('../../hub/drop'); await podDrop(hub); L.land(seed, r); return; }
    scr?.dispose();
    L.land(seed, r);
  };
  return {
    update(dt) {
      t += dt;
      if (!drag && spin) yaw.target += dt * spin;
      yaw.step(dt); pitch.step(dt); zoom.step(dt);
      acc += dt;
      if ((acc > 1 / 24 && (!yaw.settled || !pitch.settled || !zoom.settled)) || dirty) { acc = 0; draw(); }
      oc.clearRect(0, 0, ov.width, ov.height);
      const v = view();
      const beacon = (r: PRegion, label: string, col: string, on: boolean) => {
        const n = new THREE.Vector3(...r.c), base = n.clone().setY(n.y + 1), tip = n.clone().multiplyScalar(1.22).setY(n.y * 1.22 + 1);
        const [bx, by, f] = kv.project(base, v, n), [tx, ty] = kv.project(tip, v);
        if (!f) return;
        pxLine(oc, bx, by, tx, ty, '#08090c', 3); pxLine(oc, bx, by, tx, ty, col);
        const rr = on ? 5 + Math.round(Math.sin(t * 6)) : 4;
        oc.fillStyle = '#08090c'; oc.fillRect(Math.round(tx - rr - 1), Math.round(ty - rr - 1), rr * 2 + 2, rr * 2 + 2);
        oc.fillStyle = col; oc.fillRect(Math.round(tx - rr), Math.round(ty - rr), rr * 2, rr * 2);
        oc.fillStyle = '#08090c'; oc.fillRect(Math.round(tx - rr + 2), Math.round(ty - rr + 2), rr * 2 - 4, rr * 2 - 4);
        bitText(oc, label, Math.round(tx), Math.round(ty - 8), { color: col, align: 'center' });
      };
      sites.forEach((r, k) => beacon(r, String(k + 1), k === site ? '#ffe7a8' : k === 0 ? '#9fe08a' : '#ffc560', k === site));
      const hr = homeR(); if (hr) beacon(hr, 'POD', '#7fd0e8', true);
    },
    dispose() { /* the globe textures stay cached */ },
  };
}
