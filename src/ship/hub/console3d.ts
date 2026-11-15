// Each room's function as a real piece of hardware: when a room is used, a machined console unit rises into the
// bottom of the shot on its pedestal, facing the camera, lit by the room and by its own lamp. A glass screen (a live
// readout behind glass that reflects the room and catches a glare) shows the room's state; analog dials beside it
// swing their needles; a row of keycaps under it carries the room's actions and physically presses when used (or
// when its keyboard key is struck); a knurled rotary knob clicks round to the key last used; three toggle switches
// throw with their lamps. Clean stylised surfaces (LIMBOPHOBIA material textures, 32 texels per metre).
import * as THREE from 'three';
import { Mats, Bin, box, cyl, quad, V3 } from './kit';
import { mat, glow, type Ctx } from './props';
import { gbuf } from '../../gfx/gbuf';
import { csfx } from '../../ui/cineAudio';

export interface ConsoleRow { label: string; value: () => string; gauge?: () => number }
export interface ConsoleKey { label: string; key?: string; run: () => void; disabled?: () => string | false; hot?: boolean }
export interface ConsoleSpec { title: string; rows: ConsoleRow[]; keys: ConsoleKey[] }

const W = 0.8, H = 0.34, NK = 5;
const P = Math.PI;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')!]; }

export class HubConsole {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private spec: ConsoleSpec | null = null;
  private scr: { c: HTMLCanvasElement; g: CanvasRenderingContext2D; tex: THREE.CanvasTexture };
  private keys: { g: THREE.Group; cap: THREE.Mesh; lbl: { c: HTMLCanvasElement; g: CanvasRenderingContext2D; tex: THREE.CanvasTexture }; lamp: THREE.MeshBasicMaterial; t: number; k: ConsoleKey | null }[] = [];
  private needles: THREE.Object3D[] = []; private nv = [0, 0];
  private knob: THREE.Group; private knobA = 0; private knobT = 0;
  private toggles: { lever: THREE.Object3D; lamp: THREE.MeshBasicMaterial; on: boolean; t: number }[] = [];
  private k = 0; private goal = 0; private acc = 0;
  private pickables: THREE.Object3D[] = [];
  private lamp: THREE.PointLight;
  constructor(M: Mats, bin: Bin) {
    const c = { M, bin } as unknown as Ctx;
    this.root.visible = false; this.root.add(this.body);
    const gun = mat(c, 'gun'), steel = mat(c, 'steel'), dark = mat(c, 'dark'), black = mat(c, 'black'), rubber = mat(c, 'rubber');
    const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.body) => { const e = new THREE.Mesh(bin.g(g), m); e.position.set(x, y, z); parent.add(e); return e; };
    // ---- the chassis: a deep machined case, side cheeks, a top lip, vents, screws, the arm it hangs from
    add(box(W, H, 0.12, 0.012), gun, 0, 0, -0.06);
    for (const s of [-1, 1]) { add(box(0.03, H + 0.04, 0.16, 0.008), dark, s * (W / 2 + 0.012), 0, -0.05); add(box(0.032, 0.05, 0.05), steel, s * (W / 2 + 0.012), H / 2 - 0.02, 0.04); }
    add(box(W + 0.05, 0.022, 0.17, 0.006), dark, 0, H / 2 + 0.012, -0.04);
    add(box(W + 0.05, 0.03, 0.17, 0.006), dark, 0, -H / 2 - 0.015, -0.04);
    for (let i = 0; i < 9; i++) add(box(0.05, 0.006, 0.01), black, -0.2 + i * 0.05, -H / 2 + 0.012, 0.003);
    for (const [x, y] of [[-W / 2 + 0.018, H / 2 - 0.018], [W / 2 - 0.018, H / 2 - 0.018], [-W / 2 + 0.018, -H / 2 + 0.03], [W / 2 - 0.018, -H / 2 + 0.03]]) add(cyl(0.007, 0.007, 0.006, 8), steel, x, y, 0.003).rotation.x = P / 2;
    // the pedestal it rises on, and its cable
    add(cyl(0.03, 0.04, 0.7, 12), steel, 0, -H / 2 - 0.36, -0.1);
    add(cyl(0.012, 0.012, 0.7, 6), rubber, 0.06, -H / 2 - 0.36, -0.13);
    // ---- the screen: a recessed bezel, the live readout, glass over it that reflects and catches a glare
    const sw = 0.44, sh = 0.2, sx = -0.05, sy = 0.045;
    add(box(sw + 0.04, sh + 0.04, 0.02, 0.006), black, sx, sy, 0.005);
    const [sc, sg] = canvas(512, 232);
    const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace; st.magFilter = THREE.LinearFilter; st.minFilter = THREE.LinearFilter; st.generateMipmaps = false;
    this.scr = { c: sc, g: sg, tex: st };
    const sm = M.glow('console.screen', 0xffffff, 1.05, st); add(quad(sw, sh), sm, sx, sy, 0.016);
    const glass = new THREE.MeshPhongMaterial({ color: 0x0a1014, specular: 0xffffff, shininess: 120, envMap: M.env, reflectivity: 0.35, combine: THREE.MixOperation, transparent: true, opacity: 0.22, depthWrite: false });
    gbuf(glass, 0); bin.m(glass); add(quad(sw, sh), glass, sx, sy, 0.02).renderOrder = 2;
    const [gc, gg] = canvas(64, 32); const gr = gg.createLinearGradient(0, 0, 64, 32); gr.addColorStop(0.25, 'rgba(255,255,255,0)'); gr.addColorStop(0.36, 'rgba(255,255,255,0.5)'); gr.addColorStop(0.42, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.18)'); gr.addColorStop(0.55, 'rgba(255,255,255,0)'); gg.fillStyle = gr; gg.fillRect(0, 0, 64, 32);
    const gt = new THREE.CanvasTexture(gc); const glare = new THREE.MeshBasicMaterial({ map: gt, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }); gbuf(glare, 0); bin.m(glare); bin.t(gt);
    add(quad(sw, sh), glare, sx, sy, 0.021).renderOrder = 3;
    // ---- two analog dials on the left: steel bezels, cream faces with ticks, needles that swing
    const [dc, dg] = canvas(128, 128);
    dg.fillStyle = '#e0cfa6'; dg.beginPath(); dg.arc(64, 64, 62, 0, 7); dg.fill();
    dg.strokeStyle = '#1e232c'; dg.lineWidth = 4; for (let k = 0; k <= 10; k++) { const a = P * 0.75 + (k / 10) * P * 1.5, r0 = k % 5 ? 46 : 40; dg.beginPath(); dg.moveTo(64 + Math.cos(a) * r0, 64 + Math.sin(a) * r0); dg.lineTo(64 + Math.cos(a) * 56, 64 + Math.sin(a) * 56); dg.stroke(); }
    dg.strokeStyle = '#b13c2b'; dg.lineWidth = 6; dg.beginPath(); dg.arc(64, 64, 52, P * 0.75 + P * 1.2, P * 0.75 + P * 1.5); dg.stroke();
    const dt = new THREE.CanvasTexture(dc); dt.colorSpace = THREE.SRGBColorSpace; bin.t(dt);
    const face = M.get('console.dial', { map: dt, flag: 0 });
    for (let i = 0; i < 2; i++) {
      const x = -W / 2 + 0.075, y = 0.085 - i * 0.12;
      add(cyl(0.05, 0.052, 0.022, 24), steel, x, y, 0.01).rotation.x = P / 2;
      add(new THREE.CircleGeometry(0.043, 24), face, x, y, 0.0215);
      const nd = new THREE.Group(); nd.position.set(x, y, 0.024); this.body.add(nd);
      add(box(0.004, 0.036, 0.003), M.get('console.needle', { color: 0xb13c2b }), 0, 0.016, 0, nd);
      add(cyl(0.006, 0.006, 0.006, 10), black, 0, 0, 0.002, nd).rotation.x = P / 2;
      add(new THREE.CircleGeometry(0.043, 24), glass, x, y, 0.026);
      this.needles.push(nd);
    }
    // ---- the knurled rotary knob on the right, a pointer line, detent marks round it
    this.knob = new THREE.Group(); this.knob.position.set(W / 2 - 0.08, 0.06, 0.012); this.body.add(this.knob);
    add(cyl(0.042, 0.046, 0.03, 24), black, 0, 0, 0.015, this.knob).rotation.x = P / 2;
    for (let i = 0; i < 24; i++) { const a = (i / 24) * P * 2, r = add(box(0.004, 0.008, 0.028), dark, Math.cos(a) * 0.044, Math.sin(a) * 0.044, 0.015, this.knob); r.rotation.z = a; }
    add(box(0.005, 0.03, 0.004), M.glow('console.knobline', 0xe9cb89, 1.4), 0, 0.02, 0.032, this.knob);
    for (let i = 0; i < NK; i++) { const a = P / 2 + (i - (NK - 1) / 2) * -0.5; add(box(0.004, 0.01, 0.003), steel, W / 2 - 0.08 + Math.cos(a) * 0.062, 0.06 + Math.sin(a) * 0.062, 0.004).rotation.z = a - P / 2; }
    this.pickables.push(this.knob);
    // ---- three toggle switches under the knob, a lamp over each
    for (let i = 0; i < 3; i++) {
      const x = W / 2 - 0.13 + i * 0.05, y = -0.035;
      add(box(0.03, 0.045, 0.008), steel, x, y, 0.004);
      const lever = new THREE.Group(); lever.position.set(x, y, 0.01); this.body.add(lever);
      add(cyl(0.004, 0.005, 0.03, 8), mat(c, 'chrome'), 0, 0.015, 0, lever); add(new THREE.SphereGeometry(0.007, 8, 6), mat(c, 'chrome'), 0, 0.03, 0, lever);
      const lm = M.live(0x2c7240, 1); add(new THREE.SphereGeometry(0.006, 8, 6), lm, x, y + 0.035, 0.006);
      lever.rotation.x = -0.45; lever.userData.toggle = i;
      this.toggles.push({ lever, lamp: lm as THREE.MeshBasicMaterial, on: i === 0, t: 0 }); this.pickables.push(lever);
    }
    // ---- the key row: keycaps on stems in a recessed well, each with a printed legend and a lamp
    add(box(W - 0.06, 0.07, 0.02, 0.006), black, 0, -H / 2 + 0.07, 0.0);
    const kw = 0.112, gap = 0.016, x0 = -((NK - 1) * (kw + gap)) / 2;
    for (let i = 0; i < NK; i++) {
      const g = new THREE.Group(); g.position.set(x0 + i * (kw + gap), -H / 2 + 0.07, 0.012); this.body.add(g);
      const cap = add(box(kw, 0.05, 0.028, 0.006), mat(c, 'dark'), 0, 0, 0.0, g); cap.userData.key = i;
      const [lc, lg] = canvas(160, 64); const lt = new THREE.CanvasTexture(lc); lt.colorSpace = THREE.SRGBColorSpace; lt.anisotropy = 4; bin.t(lt);
      add(quad(kw - 0.012, 0.038), M.get('console.key' + i, { map: lt, flag: 0 }), 0, 0.002, 0.0145, g);
      const lamp = M.live(0x3a2a18, 1); add(box(0.022, 0.005, 0.004), lamp, kw / 2 - 0.02, 0.019, 0.0145, g);
      this.keys.push({ g, cap, lbl: { c: lc, g: lg, tex: lt }, lamp: lamp as THREE.MeshBasicMaterial, t: 0, k: null });
      this.pickables.push(cap);
    }
    // its own work lamp, so the unit is lit wherever it hangs
    this.lamp = new THREE.PointLight(0xffe2b8, 2.2, 2.4, 1.6); this.lamp.position.set(0, H / 2 + 0.25, 0.35); this.root.add(this.lamp);
  }

  /** stand the unit in front of a camera pose (where the camera is about to be), facing it, in the bottom of frame */
  show(spec: ConsoleSpec, cam: { pos: THREE.Vector3; look: THREE.Vector3; fov: number }) {
    this.setSpec(spec);
    const f = cam.look.clone().sub(cam.pos).normalize(), right = new V3().crossVectors(f, new V3(0, 1, 0)).normalize(), up = new V3().crossVectors(right, f).normalize();
    const d = 1.25, half = Math.tan((cam.fov * P) / 360) * d;
    const p = cam.pos.clone().addScaledVector(f, d).addScaledVector(up, -half * 0.66);
    this.root.position.copy(p);
    // face the camera, tilted back a little like a desk unit
    const m = new THREE.Matrix4().lookAt(p, cam.pos.clone().addScaledVector(up, -0.05), up);
    this.root.quaternion.setFromRotationMatrix(m); this.root.rotateY(P);
    this.root.rotateX(-0.08);
    this.root.visible = true; this.goal = 1; this.k = Math.min(this.k, 0.001);
    csfx('servo', 0.5); csfx('clamp', 0.35);
  }
  hide() { if (this.goal) { this.goal = 0; csfx('servo', 0.35); } }
  get shown() { return this.root.visible && this.goal > 0; }
  setSpec(spec: ConsoleSpec) {
    this.spec = spec;
    this.keys.forEach((k, i) => {
      const s = spec.keys[i] ?? null; k.k = s; k.g.visible = !!s;
      const g = k.lbl.g; g.clearRect(0, 0, 160, 64);
      if (s) {
        const dis = !!s.disabled?.();
        g.fillStyle = dis ? '#2a2f32' : s.hot ? '#99702a' : '#3d4346'; g.fillRect(0, 0, 160, 64);
        g.fillStyle = dis ? '#6e7373' : s.hot ? '#13161c' : '#e5dbc3'; g.textAlign = 'center'; g.textBaseline = 'middle';
        const t = s.label.toUpperCase(); g.font = `${t.length > 11 ? 11 : 22}px Body`; g.fillText(t, 80, 30);
        if (s.key) { g.font = '11px Body'; g.textAlign = 'left'; g.fillText(s.key.toUpperCase(), 6, 10); }
        k.lamp.color.setHex(s.hot && !dis ? 0xe9cb89 : 0x2a2018).multiplyScalar(s.hot && !dis ? 2.2 : 1);
      }
      k.lbl.tex.needsUpdate = true;
    });
    this.draw(0);
  }
  /** the readout behind the glass */
  private draw(t: number) {
    const s = this.spec, { g, c } = this.scr; if (!s) return;
    const w = c.width, h = c.height;
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#0d1a20'); bg.addColorStop(1, '#081014'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(95,168,184,0.08)'; for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 1, h); for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 1);
    g.textBaseline = 'top'; g.textAlign = 'left'; g.fillStyle = '#e9cb89'; g.font = '24px Title'; g.fillText(s.title.toUpperCase(), 16, 12);
    g.fillStyle = '#5fa8b8'; g.fillRect(16, 42, w - 32, 2);
    s.rows.slice(0, 5).forEach((r, i) => {
      const y = 54 + i * 34;
      g.font = '22px Body'; g.fillStyle = '#8aaeb8'; g.textAlign = 'left'; g.fillText(r.label.toUpperCase(), 16, y);
      let v = ''; try { v = r.value().replace(/<[^>]*>/g, ''); } catch { v = '--'; }
      g.fillStyle = '#e5dbc3'; g.textAlign = 'right'; g.fillText(v, w - 16, y);
      if (r.gauge) { const k = Math.max(0, Math.min(1, r.gauge())); g.fillStyle = 'rgba(95,168,184,0.25)'; g.fillRect(16, y + 26, w - 32, 4); g.fillStyle = k > 0.85 ? '#e0a040' : '#5fc4b8'; g.fillRect(16, y + 26, (w - 32) * k, 4); }
    });
    // a slow scan bar and the glass's depth (darker corners)
    const sy = ((t * 40) % (h + 40)) - 20; g.fillStyle = 'rgba(150,220,235,0.05)'; g.fillRect(0, sy, w, 18);
    const v = g.createRadialGradient(w / 2, h / 2, h * 0.4, w / 2, h / 2, w * 0.62); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)'); g.fillStyle = v; g.fillRect(0, 0, w, h);
    this.scr.tex.needsUpdate = true;
  }
  /** press the key bound to a keyboard key; true when the console had one */
  pressKey(key: string) { const i = this.keys.findIndex((k) => k.k?.key?.toLowerCase() === key.toLowerCase()); if (i < 0) return false; this.press(i); return true; }
  private press(i: number) {
    const k = this.keys[i]; if (!k?.k) return;
    k.t = 1; this.knobT = i;
    if (k.k.disabled?.()) { csfx('tick', 0.5); return; }
    csfx('button', 0.7); csfx('relay', 0.3);
    try { k.k.run(); } catch (e) { console.error('console key', e); }
  }
  private ray = new THREE.Raycaster();
  /** what is under a ray: a key, the knob or a toggle */
  hit(ray: THREE.Ray) {
    if (!this.shown) return null;
    this.ray.ray.copy(ray);
    const h = this.ray.intersectObjects(this.pickables, true)[0];
    if (!h) return null;
    let o: THREE.Object3D | null = h.object;
    while (o && o.userData.key === undefined && o.userData.toggle === undefined && o !== this.knob) o = o.parent;
    return o;
  }
  /** click: press a key, throw a toggle, turn the knob */
  pick(ray: THREE.Ray) {
    const o = this.hit(ray); if (!o) return false;
    if (o.userData.key !== undefined) this.press(o.userData.key);
    else if (o.userData.toggle !== undefined) { const t = this.toggles[o.userData.toggle]; t.on = !t.on; csfx('clamp', 0.5); }
    else { this.knobT = (this.knobT + 1) % NK; csfx('tick', 0.6); }
    return true;
  }
  update(dt: number, t: number) {
    if (!this.root.visible) return;
    // rise on the pedestal (ease out), or sink away
    this.k += (this.goal - this.k) * Math.min(1, dt * (this.goal ? 5 : 7));
    if (!this.goal && this.k < 0.01) { this.root.visible = false; return; }
    const e = this.k;
    this.body.position.set(0, (1 - e) * -0.6, (1 - e) * -0.1); this.body.rotation.x = (1 - e) * -0.5;
    // keys spring back after a press
    for (const k of this.keys) { k.t = Math.max(0, k.t - dt * 6); k.cap.position.z = -0.01 * Math.sin(Math.min(1, k.t) * P); k.g.children.forEach((ch, j) => { if (j > 0) ch.position.z = (j === 1 ? 0.0145 : 0.0145) - 0.01 * Math.sin(Math.min(1, k.t) * P); }); }
    // needles follow their gauges, damped
    const gs = (this.spec?.rows ?? []).filter((r) => r.gauge);
    this.needles.forEach((n, i) => { const v = gs[i] ? Math.max(0, Math.min(1, gs[i].gauge!())) : 0.05 + Math.sin(t * 0.7 + i) * 0.02; this.nv[i] += (v - this.nv[i]) * Math.min(1, dt * 2.5); n.rotation.z = P * 0.75 - this.nv[i] * P * 1.5 + P / 2; });
    // the knob clicks round to the last key (detents)
    const goalA = (this.knobT - (NK - 1) / 2) * -0.5; this.knobA += (goalA - this.knobA) * Math.min(1, dt * 10); this.knob.rotation.z = Math.round(this.knobA / 0.05) * 0.05;
    for (const tg of this.toggles) { tg.lever.rotation.x += ((tg.on ? 0.45 : -0.45) - tg.lever.rotation.x) * Math.min(1, dt * 18); tg.lamp.color.setHex(tg.on ? 0x73b073 : 0x1f3a25).multiplyScalar(tg.on ? 2 : 1); }
    this.acc += dt; if (this.acc > 0.25) { this.acc = 0; this.draw(t); }
  }
}
