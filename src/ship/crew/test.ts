// Visual QA for the crew: ?test=crew&sheet=<id> (a personnel sheet: a portrait, a front / side / back turnaround
// against a height chart, the file card), ?test=crew&sheet=all (the whole crew in a line, to scale), ?test=crew&room
// (the crew living in the ship: the hub when it exists, the stub rooms otherwise), ?test=unit07 (the ball robot).
import * as THREE from 'three';
import type { Engine } from '../../app/engine';
import type { Input } from '../../app/input';
import { gbuf } from '../../gfx/gbuf';
import { Ink, INK, textW, idBadge } from './doodle';
import { SpeechBubble } from '../../ui/cineBubble';
import { crewState } from './state';
import { buildCrewModel, type CrewModel } from './model';
import { ROSTER, CREW_IDS, SHIP_NAME, PROGRAM, type CrewId, type Act } from './roster';

const DEFAULT_PROP: Partial<Record<CrewId, string>> = { quintero: 'mug', kowalczyk: 'wrench', araujo: 'ladle', mamani: 'jar' };

function studio(scene: THREE.Scene, o: { x0?: number; x1?: number; dark?: boolean } = {}) {
  scene.background = new THREE.Color(0x161b22);
  scene.add(new THREE.HemisphereLight(0xb8c4d4, 0x3a342e, 1.25));
  const key = new THREE.DirectionalLight(0xfff0dc, 2.6); key.position.set(-4, 7, 9); key.target.position.set(0, 0.9, 2);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004;
  const sc = key.shadow.camera as THREE.OrthographicCamera; sc.left = -5; sc.right = 5; sc.top = 5; sc.bottom = -3; sc.near = 1; sc.far = 30; scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x9ad0e8, 1.3); rim.position.set(4, 3, -5); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffe4c8, 0.9); fill.position.set(2, 1.6, 9); scene.add(fill);
  // the floor and the height-chart backdrop (painted at native resolution)
  const fm = new THREE.MeshLambertMaterial({ color: 0x2a3038 }); gbuf(fm, 0);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), fm); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const x0 = o.x0 ?? -0.6, x1 = o.x1 ?? 2.0, W = x1 - x0, H = 2.4;
  const c = document.createElement('canvas'); c.width = Math.round(W * 400); c.height = Math.round(H * 400);
  const g = c.getContext('2d')!;
  g.fillStyle = '#1d232b'; g.fillRect(0, 0, c.width, c.height);
  // a faint drafting grid, then the height lines every 10 cm (heavier every 50) with labels
  g.strokeStyle = 'rgba(120,150,170,0.08)'; g.lineWidth = 1;
  for (let x = 0; x < c.width; x += 20) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, c.height); g.stroke(); }
  for (let cm = 0; cm <= 240; cm += 5) {
    const y = c.height - cm * 4 - 0.5, big = cm % 50 === 0, mid = cm % 10 === 0;
    g.strokeStyle = big ? 'rgba(210,220,210,0.45)' : mid ? 'rgba(160,190,200,0.22)' : 'rgba(160,190,200,0.08)'; g.lineWidth = big ? 2 : 1;
    g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke();
    if (mid) { g.font = `${big ? 22 : 11}px Body, monospace`; g.fillStyle = big ? '#c9d2c8' : '#7d8e92'; g.fillText((cm / 100).toFixed(2) + ' m', 12, y - 6); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const bm = new THREE.MeshLambertMaterial({ map: t }); gbuf(bm, 0);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), bm); back.position.set(x0 + W / 2, H / 2, -0.7); back.receiveShadow = true; scene.add(back);
  return { key };
}

const CSS = /* css */`
.crew-sheet { position: fixed; right: 24px; top: 32px; width: 700px; height: 1016px; z-index: 5; color: #c8e8d0; font-family: 'Body', monospace; font-size: 22px; line-height: 26px; -webkit-font-smoothing: none; }
.crew-sheet > canvas { position: absolute; left: 0; top: 0; image-rendering: pixelated; }
.crew-sheet .in { position: absolute; left: 44px; top: 40px; right: 44px; bottom: 34px; overflow: hidden; }
.crew-sheet .k { font-size: 11px; line-height: 22px; letter-spacing: 2px; color: #4f8a6a; }
.crew-sheet .nm { font-family: 'Title', monospace; font-size: 48px; line-height: 48px; color: #c8ffd8; margin: 6px 0 4px; }
.crew-sheet .rl { color: #e2b45a; }
.crew-sheet .band { height: 6px; margin: 10px 0 12px; }
.crew-sheet .grid { display: grid; grid-template-columns: 110px 1fr; gap: 0 12px; margin-bottom: 4px; }
.crew-sheet .grid b { font-weight: normal; color: #4f8a6a; font-size: 11px; line-height: 26px; letter-spacing: 2px; }
.crew-sheet p { margin: 0 0 6px; color: #a8d8b8; }
.crew-sheet h5 { margin: 8px 0 0; font-family: 'Title', monospace; font-weight: normal; font-size: 24px; line-height: 26px; color: #8fe0b0; }
.crew-sheet .q { color: #e8e2cc; }
.crew-sheet .q::before { content: '> '; color: #e2b45a; }
.crew-sheet .day { display: flex; height: 22px; margin-top: 6px; border: 2px solid #2a4a38; }
.crew-sheet .day span { display: block; height: 100%; border-right: 2px solid #0a1410; }
.crew-sheet .lg { display: flex; flex-wrap: wrap; gap: 0 14px; font-size: 11px; line-height: 22px; color: #8fb89c; margin-top: 2px; }
.crew-sheet .lg i { display: inline-block; width: 10px; height: 10px; margin-right: 6px; }
.crew-sheet .hrs { display: flex; justify-content: space-between; font-size: 11px; line-height: 22px; color: #4f8a6a; }
.crew-sheet .stamp { position: absolute; right: 0; top: 0; font-family: 'Title', monospace; font-size: 24px; line-height: 24px; color: #c84a3a; border: 2px solid #b8382e; padding: 4px 8px 2px; }
.crew-tag { position: fixed; z-index: 5; text-align: center; font-family: 'Body', monospace; color: #d8dccf; font-size: 22px; line-height: 24px; white-space: nowrap; text-shadow: 2px 2px 0 #000; -webkit-font-smoothing: none; }
.crew-tag b { display: block; font-family: 'Title', monospace; font-weight: normal; font-size: 24px; line-height: 26px; color: #8fe0b0; }
.crew-title { position: fixed; left: 40px; top: 32px; z-index: 5; color: #e8e6da; font-family: 'TitleL', monospace; font-size: 64px; line-height: 64px; text-shadow: 4px 4px 0 #000; }
.crew-title small { display: block; font-family: 'Body', monospace; font-size: 22px; line-height: 30px; color: #8fe0b0; text-shadow: 2px 2px 0 #000; margin-top: 8px; }
`;
export const ACT_COL: Record<Act, string> = {
  sleep: '#2c3a5a', work: '#4a7a9a', study: '#5a8aa8', eat: '#b08a4a', coffee: '#c8a060', chat: '#8a6aa0', repair: '#c8662e', exercise: '#5a9a6a',
  read: '#6a6a8a', tend: '#6a9a4a', cook: '#c8783a', patrol: '#7a7a86', treat: '#b0484a', pilot: '#4a8a7a', inventory: '#9a8a6a',
};
function style() { if (document.getElementById('crew-css')) return; const s = document.createElement('style'); s.id = 'crew-css'; s.textContent = CSS; document.head.appendChild(s); }
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** what a gear piece is called on the sheet and the bone its callout points at */
const GEAR_TAG: Partial<Record<string, [string, string]>> = {
  toolBelt: ['TOOL BELT', 'hips'], goggles: ['WELDING GOGGLES', 'head'], kneePads: ['KNEE PADS', 'shinL'], earDefenders: ['EAR DEFENDERS', 'neck'],
  stethoscope: ['STETHOSCOPE', 'chest'], medScanner: ['MED SCANNER', 'hips'], tablet: ['HER TABLET', 'handL'], stylus: ['STYLUS IN THE BUN', 'head'],
  rankBoards: ['FOUR BARS', 'uarmL'], mug: ['MATE, ALWAYS', 'handR'], aviators: ['AVIATORS', 'head'], flightPatches: ['MISSION PATCHES', 'chest'],
  headsetNeck: ['FLIGHT HEADSET', 'neck'], fieldVest: ['SAMPLE VEST', 'chest'], seedPouch: ['300 SEEDS', 'hips'], specimenJar: ['SPECIMEN JAR', 'handR'],
  apron: ['APRON', 'spine'], ladle: ['LADLE', 'handR'], towel: ['TOWEL', 'chest'], tacVest: ['PLATE CARRIER', 'chest'], holster: ['STUN PISTOL', 'thighR'],
  shoulderRadio: ['RADIO', 'chest'], wrench: ['WRENCH', 'handR'], wristComp: ['WRIST COMP', 'farmL'], patchL: ['UNAA CREST', 'uarmL'],
};
/** the sheet: hand-drawn callouts over the 3D vignette (name, role, gear with leader lines, height, mood, a line) */
function sheetCallouts(id: CrewId, hero: CrewModel, turn: CrewModel[], cam: THREE.PerspectiveCamera, hook: (fn: (dt: number) => void) => void) {
  const d = ROSTER[id], st = crewState();
  const W = innerWidth, H = innerHeight;
  const c = document.createElement('canvas'); c.style.cssText = 'position:fixed;left:0;top:0;z-index:5;pointer-events:none;image-rendering:pixelated'; document.body.appendChild(c);
  const bub = null as SpeechBubble | null;
  const scr = (o: THREE.Object3D, dy = 0) => { const v = o.getWorldPosition(new THREE.Vector3()); v.y += dy; v.project(cam); return [Math.round(((v.x + 1) / 2) * W), Math.round(((1 - v.y) / 2) * H)] as [number, number]; };
  const tags = d.gear.filter((g) => GEAR_TAG[g] && g !== 'patchL').slice(0, 4);
  const mood = st.mood, moodWord = mood > 0.7 ? 'STEADY' : mood > 0.5 ? 'TIRED' : mood > 0.3 ? 'GRIEVING' : 'BROKEN';
  const badge = idBadge(d, mood, 2);
  let t = 0, last = -1, shown = false;
  hook((dt) => {
    t += dt;
    const boil = Math.floor(t * 4);
    const hp = scr(hero.rig.j.head, 0.3);
    void bub; void shown;
    if (boil === last) return; last = boil;
    const I = new Ink(W, H); I.seed = boil % 6 + 1;
    // the ID badge (2x) top left, the full name and two facts under it
    I.g.save(); I.g.setTransform(1, 0, 0, 1, 0, 0); I.g.drawImage(badge, 32 * I.k, 24 * I.k); I.g.restore();
    I.label(d.name, 44, 384, 'Title', 24, INK.light);
    I.label(`${d.age} · ${d.origin.split(',')[0]}`, 44, 414, 'Body', 22, INK.mute);
    // gear: callouts with leader lines to the part, alternating sides of the hero
    const hx = scr(hero.root)[0];
    tags.forEach((g, i) => {
      const [label, bone] = GEAR_TAG[g]!;
      const b = (hero.rig.bones as Record<string, THREE.Object3D>)[bone] ?? hero.rig.j.chest;
      const p = scr(b, bone === 'head' ? 0.12 : bone.startsWith('hand') ? -0.06 : 0.02);
      const right = i % 2 === 1, ly = 470 + i * 120, lx = right ? hx + 300 : hx - 300 - textW(label, 'Title', 24);
      I.label(label, lx, ly, 'Title', 24, INK.light);
      I.leader([right ? lx - 8 : lx + textW(label, 'Title', 24) + 8, ly + 14], p, INK.light);
    });
    // the mood: a little face drawn by the head, its word
    const mx = hp[0] + 340, my = hp[1] + 70;
    I.loop(mx, my, 22, 22, 2, INK.light, { outline: INK.dark });
    I.r(mx - 9, my - 6, 4, 4, INK.light).r(mx + 6, my - 6, 4, 4, INK.light);
    const curve = mood > 0.6 ? 1 : mood > 0.4 ? 0 : -1;
    I.stroke([[mx - 10, my + 7 - curve * 2], [mx, my + 7 + curve * 4], [mx + 10, my + 7 - curve * 2]], 2, INK.light, { outline: INK.dark, amp: 0.5 });
    I.label('MOOD ' + moodWord, mx + 34, my - 26, 'Title', 24, INK.light);
    I.label('voice ' + d.voice.pitch.toFixed(2), mx + 34, my + 2, 'Body', 22, INK.mute);
    // the turnaround's labels
    ['FRONT', 'SIDE', 'BACK'].forEach((s, i) => { const f = scr(turn[i].root); I.label(s, f[0], f[1] + 12, 'Body', 22, INK.mute, 'center'); });
    // a day aboard: a strip of blocks drawn in ink, the acts under it
    const x0 = W - 760, y0 = H - 136, w0 = 700;
    I.label('A DAY ABOARD', x0, y0 - 36, 'Title', 24, INK.light);
    d.routine.forEach((r) => { const xa = x0 + Math.round((r.from / 24) * w0), xb = x0 + Math.round((r.to / 24) * w0); I.r(xa, y0, xb - xa, 22, ACT_COL[r.act]); I.vl(xb - 1, y0, y0 + 21, INK.dark); });
    I.stroke([[x0 - 2, y0 - 2], [x0 + w0 + 2, y0 - 2], [x0 + w0 + 2, y0 + 24], [x0 - 2, y0 + 24], [x0 - 2, y0 - 2]], 2, INK.light, { outline: INK.dark, amp: 0.6 });
    [0, 6, 12, 18, 24].forEach((hh) => I.label(String(hh).padStart(2, '0'), x0 + (hh / 24) * w0, y0 + 30, 'Body', 11, INK.mute, 'center'));
    const acts = [...new Set(d.routine.map((r) => r.act))];
    let lx = x0, ly2 = y0 + 48;
    for (const a of acts) { const w = 18 + textW(a, 'Body', 22) + 22; if (lx + w > x0 + w0 + 40) { lx = x0; ly2 += 28; } I.r(lx, ly2 + 4, 12, 12, ACT_COL[a]); I.label(a, lx + 18, ly2, 'Body', 22, INK.light); lx += w; }
    const g = c.getContext('2d')!; c.width = I.c.width; c.height = I.c.height; c.style.width = W + 'px'; c.style.height = H + 'px'; g.drawImage(I.c, 0, 0);
  });
}
export async function testCrew(engine: Engine, input: Input, P: URLSearchParams) {
  void input;
  style();
  const which = P.get('sheet') ?? 'solano';
  if (P.has('room')) { (await import('./life')).testLife(engine, P); return; }
  if (P.has('page')) { const { crewPage } = await import('./paint'); const c = crewPage().canvas; c.style.cssText = 'position:fixed;left:0;top:0;width:1024px;height:1024px;z-index:9;background:#555'; document.body.appendChild(c); return; }
  if (which === 'unit07' || P.get('test') === 'unit07') { testUnit07(engine, P); return; }
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(17, innerWidth / innerHeight, 0.1, 200);
  const models: { m: CrewModel; x: number; z: number; yaw: number; y?: number }[] = [];
  let frameFn: ((dt: number) => void) | null = null;
  if (which === 'all') {
    studio(scene, { x0: -3.6, x1: 3.6 });
    const order: CrewId[] = ['quintero', 'kristiansen', 'castellanos', 'araujo', 'solano', 'baptiste', 'mamani', 'kowalczyk'];
    order.forEach((id, i) => { const m = buildCrewModel(id); const p = DEFAULT_PROP[id]; if (p) m.showProp(p); models.push({ m, x: -3.0 + i * 0.86, z: 0, yaw: (i - 3.5) * -0.04 }); });
    cam.fov = 21; cam.position.set(0, 1.05, 11.5); cam.lookAt(0, 0.92, 0);
    const t = document.createElement('div'); t.className = 'crew-title'; t.innerHTML = `THE CREW OF THE ${esc(SHIP_NAME)}<small>${esc(PROGRAM)}: eight aboard, to scale</small>`; document.body.appendChild(t);
  } else {
    const id = (CREW_IDS as string[]).includes(which) ? which as CrewId : 'solano';
    studio(scene, { x0: 0.6, x1: 3.4 });
    const prop = DEFAULT_PROP[id];
    const mk = () => { const m = buildCrewModel(id); if (prop) m.showProp(prop); return m; };
    cam.fov = 24; cam.position.set(0, 1.0, 6.4); cam.lookAt(0, 0.9, 0); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    // the hero: full figure, three-quarter view, centre left; the turnaround (front, side, back) further back on the right
    models.push({ m: mk(), x: -0.62, z: 0.6, yaw: 0.42 });
    [0, Math.PI / 2, Math.PI].forEach((yaw, i) => models.push({ m: mk(), x: 1.2 + i * 0.52, z: -0.3, yaw }));
    sheetCallouts(id, models[0].m, models.slice(1).map((o) => o.m), cam, (fn) => (frameFn = fn));
    const g = P.get('gesture'); if (g) setTimeout(() => models[0].m.rig.gesture(g as never), 300);
  }
  for (const o of models) { o.m.root.position.set(o.x, o.y ?? 0, o.z); o.m.root.rotation.y = o.yaw; scene.add(o.m.root); }
  // name tags under the line-up
  const tags: HTMLDivElement[] = [];
  if (which === 'all') for (const o of models) { const d = o.m.def; const e = document.createElement('div'); e.className = 'crew-tag'; e.innerHTML = `<b>${esc(d.job.toUpperCase())}</b>${esc(d.short)}<br>${d.heightM.toFixed(2)} m`; document.body.appendChild(e); tags.push(e); }
  const v = new THREE.Vector3();
  engine.setScreen({
    update(dt) {
      frameFn?.(dt);
      for (const o of models) o.m.update(dt, { speed: 0, fidget: !P.has('still') } as never);
      tags.forEach((e, i) => { v.set(models[i].x, -0.02, 0).project(cam); e.style.left = Math.round(((v.x + 1) / 2) * innerWidth - e.offsetWidth / 2) + 'px'; e.style.top = Math.round(((1 - v.y) / 2) * innerHeight + 14) + 'px'; });
    },
    render(post, t) { post.render(scene, cam, undefined, t); },
    resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); },
  });
  (window as unknown as { __crew: unknown }).__crew = { scene, cam, models };
  engine.start();
}

/** ?test=unit07: the ball robot turning on a stand, its gravity beam on a floating cube (&grav), moods (&mood=alert) */
function testUnit07(engine: Engine, P: URLSearchParams) {
  void import('./unit07').then(({ Unit07 }) => {
    const scene = new THREE.Scene(); studio(scene, { x0: -2, x1: 2 });
    const u = new Unit07(); scene.add(u.root, u.fx); u.place(new THREE.Vector3(0, 1.3, 0));
    if (P.get('mood')) u.mood = P.get('mood') as never;
    const cam = new THREE.PerspectiveCamera(Number(P.get('fov') ?? 22), innerWidth / innerHeight, 0.05, 100);
    const yaw = Number(P.get('yaw') ?? 0.5), D = Number(P.get('dist') ?? 2.2);
    cam.position.set(Math.sin(yaw) * D, 1.3 + D * 0.18, Math.cos(yaw) * D); cam.lookAt(0, 1.25, 0);
    const cube = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), gbuf(new THREE.MeshLambertMaterial({ color: 0xb84a3a }), 1));
    cube.position.set(0.8, 1.1, 0.4); if (P.has('grav')) scene.add(cube);
    u.lookAt(P.has('grav') ? cube.position : cam.position);
    let t = 0;
    engine.setScreen({
      update(dt) { t += dt; if (P.has('grav')) { cube.position.y = 1.1 + Math.sin(t * 2) * 0.05; cube.rotation.set(t, t * 0.7, 0); u.grav(cube.position, 0.13); } if (P.has('spin')) u.lookAt(new THREE.Vector3(Math.sin(t) * 3, 1.3, Math.cos(t) * 3)); u.camQ.copy(cam.quaternion); u.update(dt); },
      render(post, tt) { post.render(scene, cam, undefined, tt); },
      resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); },
    });
    engine.start();
  });
}
