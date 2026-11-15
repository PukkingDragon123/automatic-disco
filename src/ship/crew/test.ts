// Visual QA for the crew: ?test=crew&sheet=<id> (a personnel sheet: a portrait, a front / side / back turnaround
// against a height chart, the file card), ?test=crew&sheet=all (the whole crew in a line, to scale), ?test=crew&room
// (the crew living in the ship: the hub when it exists, the stub rooms otherwise), ?test=unit07 (the ball robot).
import * as THREE from 'three';
import type { Engine } from '../../app/engine';
import type { Input } from '../../app/input';
import { gbuf } from '../../gfx/gbuf';
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
    if (mid) { g.font = `${big ? 30 : 20}px VT, monospace`; g.fillStyle = big ? '#c9d2c8' : '#7d8e92'; g.fillText((cm / 100).toFixed(2) + ' m', 12, y - 6); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const bm = new THREE.MeshLambertMaterial({ map: t }); gbuf(bm, 0);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), bm); back.position.set(x0 + W / 2, H / 2, -0.7); back.receiveShadow = true; scene.add(back);
  return { key };
}

const CSS = /* css */`
.crew-sheet { position: fixed; right: 2.2vw; top: 3vh; bottom: 3vh; width: 36vw; z-index: 5; color: #d8dccf; font-family: 'VT', monospace; font-size: 20px; line-height: 24px;
  background: linear-gradient(180deg, #1c2229, #161b20); border: 2px solid #3a434a; outline: 1px solid #0c0f12; box-shadow: 0 0 0 1px #4c565c inset, 0 18px 40px rgba(0,0,0,0.5); padding: 26px 30px; overflow: hidden; }
.crew-sheet::before { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(0deg, rgba(0,0,0,0.12) 0 1px, transparent 1px 3px); pointer-events: none; }
.crew-sheet .k { font-family: 'Superwide', monospace; font-size: 12px; letter-spacing: 3px; color: #7fb88a; }
.crew-sheet .nm { font-family: 'Superwide', monospace; font-size: 34px; line-height: 40px; color: #e8e6da; margin: 8px 0 2px; letter-spacing: 1px; }
.crew-sheet .rl { color: #d9a43a; font-size: 22px; }
.crew-sheet .band { height: 6px; margin: 14px 0 16px; }
.crew-sheet .grid { display: grid; grid-template-columns: 120px 1fr; gap: 2px 14px; margin-bottom: 14px; }
.crew-sheet .grid b { font-weight: normal; color: #7fb88a; font-size: 16px; letter-spacing: 1px; }
.crew-sheet p { margin: 0 0 12px; color: #c8ccc0; font-size: 19px; line-height: 23px; }
.crew-sheet h5 { margin: 14px 0 6px; font-family: 'Superwide', monospace; font-weight: normal; font-size: 11px; letter-spacing: 3px; color: #7fb88a; }
.crew-sheet .q { color: #e8e2cc; font-size: 19px; margin: 3px 0; }
.crew-sheet .q::before { content: '> '; color: #d9a43a; }
.crew-sheet .day { display: flex; height: 22px; border: 1px solid #3a434a; margin-top: 4px; }
.crew-sheet .day span { display: block; height: 100%; border-right: 1px solid #0c0f12; }
.crew-sheet .lg { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 15px; color: #9aa69e; margin-top: 6px; }
.crew-sheet .lg i { display: inline-block; width: 10px; height: 10px; margin-right: 5px; vertical-align: 0; }
.crew-sheet .hrs { display: flex; justify-content: space-between; font-size: 13px; color: #6c7a7c; }
.crew-sheet .chips { display: flex; flex-wrap: wrap; gap: 4px; }
.crew-sheet .chips span { border: 1px solid #3a4a44; padding: 0 6px; font-size: 15px; color: #a8c4b0; }
.crew-sheet .stamp { position: absolute; right: 26px; top: 22px; font-family: 'Superwide', monospace; font-size: 12px; letter-spacing: 2px; color: rgba(184,56,46,0.85); border: 2px solid rgba(184,56,46,0.75); padding: 3px 8px; transform: rotate(-6deg); }
.crew-tag { position: fixed; z-index: 5; transform: translate(-50%, 0); text-align: center; font-family: 'VT', monospace; color: #d8dccf; font-size: 18px; line-height: 20px; white-space: nowrap; text-shadow: 0 1px 0 #000; }
.crew-tag b { display: block; font-family: 'Superwide', monospace; font-weight: normal; font-size: 11px; letter-spacing: 2px; color: #7fb88a; }
.crew-title { position: fixed; left: 2.4vw; top: 3vh; z-index: 5; color: #e8e6da; font-family: 'Superwide', monospace; font-size: 26px; letter-spacing: 2px; }
.crew-title small { display: block; font-family: 'VT', monospace; font-size: 20px; letter-spacing: 0; color: #7fb88a; margin-top: 6px; }
`;
export const ACT_COL: Record<Act, string> = {
  sleep: '#2c3a5a', work: '#4a7a9a', study: '#5a8aa8', eat: '#b08a4a', coffee: '#c8a060', chat: '#8a6aa0', repair: '#c8662e', exercise: '#5a9a6a',
  read: '#6a6a8a', tend: '#6a9a4a', cook: '#c8783a', patrol: '#7a7a86', treat: '#b0484a', pilot: '#4a8a7a', inventory: '#9a8a6a',
};
function style() { if (document.getElementById('crew-css')) return; const s = document.createElement('style'); s.id = 'crew-css'; s.textContent = CSS; document.head.appendChild(s); }
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function sheetCard(id: CrewId) {
  const d = ROSTER[id];
  const el = document.createElement('div'); el.className = 'crew-sheet';
  const col = `rgb(${d.dept_col.join(',')})`;
  const day = d.routine.map((b) => `<span style="width:${((b.to - b.from) / 24) * 100}%;background:${ACT_COL[b.act]}" title="${b.act}"></span>`).join('');
  const acts = [...new Set(d.routine.map((b) => b.act))];
  el.innerHTML = `
    <div class="k">${esc(PROGRAM)} · ${esc(SHIP_NAME)}</div>
    <div class="stamp">CREW ${String(CREW_IDS.indexOf(id) + 1).padStart(2, '0')} / 08</div>
    <div class="nm">${esc(d.name)}</div>
    <div class="rl">${esc(d.role)} · ${esc(d.rank)}</div>
    <div class="band" style="background:linear-gradient(90deg, ${col} 0 70%, transparent 70%)"></div>
    <div class="grid">
      <b>AGE</b><span>${d.age}</span><b>FROM</b><span>${esc(d.origin)}</span>
      <b>HEIGHT</b><span>${d.heightM.toFixed(2)} m</span><b>BODY</b><span>${esc(d.body)}</span>
      <b>DEPT</b><span>${esc(d.dept)}</span><b>VOICE</b><span>pitch ${d.voice.pitch.toFixed(2)} · rate ${d.voice.rate.toFixed(2)}</span>
    </div>
    <h5>LOOK</h5><p>${esc(d.look)}</p>
    <h5>KIT</h5><p>${esc(d.outfitNote)}</p>
    <h5>PERSON</h5><p>${esc(d.personality)}</p>
    <h5>HEARD AROUND THE SHIP</h5>${d.lines.idle.slice(0, 2).map((l) => `<div class="q">${esc(l)}</div>`).join('')}${d.lines.click.slice(0, 1).map((l) => `<div class="q">${esc(l)}</div>`).join('')}
    <h5>A DAY ABOARD</h5><div class="day">${day}</div><div class="hrs"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
    <div class="lg">${acts.map((a) => `<span><i style="background:${ACT_COL[a]}"></i>${a}</span>`).join('')}</div>`;
  document.body.appendChild(el);
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
  if (which === 'all') {
    studio(scene, { x0: -3.6, x1: 3.6 });
    const order: CrewId[] = ['quintero', 'kristiansen', 'castellanos', 'araujo', 'solano', 'baptiste', 'mamani', 'kowalczyk'];
    order.forEach((id, i) => { const m = buildCrewModel(id); const p = DEFAULT_PROP[id]; if (p) m.showProp(p); models.push({ m, x: -3.0 + i * 0.86, z: 0, yaw: (i - 3.5) * -0.04 }); });
    cam.fov = 21; cam.position.set(0, 1.05, 11.5); cam.lookAt(0, 0.92, 0);
    const t = document.createElement('div'); t.className = 'crew-title'; t.innerHTML = `THE CREW OF THE ${esc(SHIP_NAME)}<small>${esc(PROGRAM)} · eight aboard, to scale</small>`; document.body.appendChild(t);
  } else {
    const id = (CREW_IDS as string[]).includes(which) ? which as CrewId : 'solano';
    studio(scene, { x0: -1.2, x1: 2.2 });
    const prop = DEFAULT_PROP[id];
    const mk = () => { const m = buildCrewModel(id); if (prop) m.showProp(prop); return m; };
    cam.position.set(0, 1.05, 12); cam.lookAt(0, 1.0, 0); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    // place things by where they should land on screen: a world point at a depth along the ray through pixel (px, py)
    const atScreen = (px: number, py: number, depth: number) => { const v = new THREE.Vector3((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1, 0.5).unproject(cam).sub(cam.position).normalize(); return cam.position.clone().addScaledVector(v, depth / v.dot(cam.getWorldDirection(new THREE.Vector3()))); };
    // the portrait: head and shoulders, big, on the left
    const head = atScreen(innerWidth * 0.16, innerHeight * 0.36, 3.1);
    const portrait = mk(); const hy = portrait.P.crown * portrait.def.scale;
    models.push({ m: portrait, x: head.x, z: head.z, yaw: 0.38, y: head.y - hy + 0.12 });
    // the turnaround: front, side, back, to scale on the floor in front of the height chart
    for (const [i, yaw] of [[0, 0], [1, Math.PI / 2], [2, Math.PI]] as [number, number][]) {
      const f = atScreen(innerWidth * (0.36 + i * 0.1), innerHeight * 0.5, 12);
      models.push({ m: mk(), x: f.x, z: 0, yaw });
    }
    // the key light reaches the portrait too
    sheetCard(id);
    const g = P.get('gesture'); if (g) setTimeout(() => models[0].m.rig.gesture(g as never), 300);
  }
  for (const o of models) { o.m.root.position.set(o.x, o.y ?? 0, o.z); o.m.root.rotation.y = o.yaw; scene.add(o.m.root); }
  // name tags under the line-up
  const tags: HTMLDivElement[] = [];
  if (which === 'all') for (const o of models) { const d = o.m.def; const e = document.createElement('div'); e.className = 'crew-tag'; e.innerHTML = `<b>${esc(d.job.toUpperCase())}</b>${esc(d.short)} · ${d.heightM.toFixed(2)} m`; document.body.appendChild(e); tags.push(e); }
  const v = new THREE.Vector3();
  engine.setScreen({
    update(dt) {
      for (const o of models) o.m.update(dt, { speed: 0, fidget: !P.has('still') } as never);
      tags.forEach((e, i) => { v.set(models[i].x, -0.02, 0).project(cam); e.style.left = ((v.x + 1) / 2) * innerWidth + 'px'; e.style.top = ((1 - v.y) / 2) * innerHeight + 14 + 'px'; });
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
