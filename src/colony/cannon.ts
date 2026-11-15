// The gunner's seat: a cinematic over-the-barrel view for the pod's mass driver. The camera sits behind the breech
// looking down the barrel; the pointer swings the turret (the barrel follows on its servos), the wheel zooms the
// sight, the left button fires a coil-gun slug when the capacitors are charged. The sight shows range, bearing,
// elevation, the capacitor charge and the slug's predicted fall. Slugs fly ballistic, crater the ground and hurt
// everything in the blast.
import * as THREE from 'three';
import type { Colony } from './colony';
import type { Arm } from './arms';
import { sfx } from '../audio/audio';
import { vfx2d } from '../game/vfx2d';
import { clamp, damp } from '../core/rand';
import { hudCanvas } from './tex';

interface Shell { p: THREE.Vector3; v: THREE.Vector3; t: number; dmg: number }
const G = 9.8, V0 = 78;
const _v = new THREE.Vector3(), _d = new THREE.Vector3();

export class CannonView {
  on = false;
  arm: Arm | null = null;
  private yaw = 0; private pitch = 0.08; private baseYaw = 0; private fov = 46; private fovGoal = 46;
  charge = 1; private shells: Shell[] = [];
  private el: HTMLDivElement | null = null; private cv: HTMLCanvasElement | null = null; private g2: CanvasRenderingContext2D | null = null;
  private prevCine: ((cam: THREE.PerspectiveCamera, dt: number) => void) | null = null; private prevFov = 36;
  private impact = new THREE.Vector3(); private impactOk = false; private flashT = 0; private camPos = new THREE.Vector3(); private camInit = false;
  constructor(readonly c: Colony) {}
  enter(a: Arm) {
    this.on = true; this.arm = a; this.camInit = false;
    const pod = this.c.pod;
    this.baseYaw = a.hpt.angle + pod.yaw; this.yaw = this.baseYaw; this.pitch = 0.08;
    const g = this.c.g;
    this.prevCine = g.cineCam; this.prevFov = g.cam.cam.fov;
    g.cineCam = (cam, dt) => this.apply(cam, dt);
    this.el = document.createElement('div'); this.el.className = 'cn-view'; document.body.appendChild(this.el);
    this.el.innerHTML = `<div class="cn-bar top"></div><div class="cn-bar bot"></div><canvas class="cn-sight"></canvas>
      <div class="cn-tag"><b>${a.name}</b> · GUNNER</div><div class="cn-help"><span>MOUSE</span> AIM <span>LMB</span> FIRE <span>WHEEL</span> ZOOM <span>RMB / ESC</span> LEAVE THE SEAT</div>`;
    this.cv = this.el.querySelector('canvas'); this.g2 = this.cv!.getContext('2d');
    document.body.classList.add('cannon-on');
    sfx('open', 0.6, 0.8); sfx('pulse', 0.6, 0.3);
  }
  exit() {
    if (!this.on) return;
    this.on = false;
    const g = this.c.g;
    g.cineCam = this.prevCine; g.cam.cam.fov = this.prevFov; g.cam.cam.updateProjectionMatrix();
    this.el?.remove(); this.el = null; this.cv = null; this.g2 = null;
    document.body.classList.remove('cannon-on');
    if (this.arm) { this.arm.target = null; this.arm.controlled = false; }
    this.arm = null;
  }
  /** aim from the pointer, charge the capacitors */
  update(dt: number, simDt: number) {
    const a = this.arm, g = this.c.g; if (!a || !this.on) return;
    const inp = g.input;
    const nx = inp.mx / innerWidth - 0.5, ny = inp.my / innerHeight - 0.5;
    const zoom = this.fov / 46;
    this.yaw = this.baseYaw - nx * 2.1 * Math.max(0.35, zoom);
    this.pitch = clamp(0.1 - ny * 1.1 * Math.max(0.35, zoom), -0.12, 0.75);
    if (inp.wheel) this.fovGoal = clamp(this.fovGoal * Math.pow(1.15, inp.wheel), 12, 50);
    this.fov = damp(this.fov, this.fovGoal, 8, dt);
    const piv = a.pivot(_v);
    a.target = (a.target ?? new THREE.Vector3()).set(piv.x + Math.sin(this.yaw) * Math.cos(this.pitch) * 40, piv.y + Math.sin(this.pitch) * 40, piv.z + Math.cos(this.yaw) * Math.cos(this.pitch) * 40);
    const lvl = 1 + (a.level - 1) * 0.35;
    if (simDt > 0 && this.c.vitals.powerOk) this.charge = Math.min(1, this.charge + simDt / (3.5 / lvl));
    this.flashT = Math.max(0, this.flashT - dt);
    this.predict();
    this.draw();
  }
  private apply(cam: THREE.PerspectiveCamera, dt: number) {
    const a = this.arm; if (!a) return;
    const muzzle = a.tip(new THREE.Vector3()), dir = a.muzzleDir(_d), piv = a.pivot(new THREE.Vector3());
    // behind the breech, a little above the barrel
    const want = piv.clone().addScaledVector(dir, -2.6).add(new THREE.Vector3(0, 1.05, 0));
    if (!this.camInit) { this.camPos.copy(cam.position); this.camInit = true; }
    this.camPos.lerp(want, Math.min(1, dt * 6));
    cam.position.copy(this.camPos);
    if (this.flashT > 0) cam.position.addScaledVector(dir, -this.flashT * 0.8).add(new THREE.Vector3((Math.random() - 0.5) * this.flashT, (Math.random() - 0.5) * this.flashT, 0));
    cam.lookAt(muzzle.clone().addScaledVector(dir, 30).add(new THREE.Vector3(0, -1.5, 0)));
    cam.fov = this.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  }
  /** where a slug fired now would come down */
  private predict() {
    const a = this.arm!, g = this.c.g, N = g.region.N;
    const p = a.tip(new THREE.Vector3()), v = a.muzzleDir(new THREE.Vector3()).multiplyScalar(V0);
    this.impactOk = false;
    for (let i = 0; i < 400; i++) {
      const dt = 0.03; v.y -= G * dt; p.addScaledVector(v, dt);
      if (p.x < 0 || p.z < 0 || p.x > N || p.z > N) return;
      if (p.y <= g.world.surfaceY(p.x, p.z)) { this.impact.copy(p); this.impactOk = true; return; }
    }
  }
  fire() {
    const a = this.arm, g = this.c.g; if (!a) return;
    if (this.charge < 1) { sfx('deny', 0.7, 0.5); return; }
    if (!this.c.vitals.powerOk) { sfx('deny', 0.6, 0.6); this.c.alert('MASS DRIVER: NO POWER', 'warn', undefined, 'cn-pw'); return; }
    this.charge = 0;
    const p = a.tip(new THREE.Vector3()), dir = a.muzzleDir(new THREE.Vector3());
    this.shells.push({ p: p.clone(), v: dir.clone().multiplyScalar(V0), t: 0, dmg: 90 * (1 + (a.level - 1) * 0.35) });
    a.kick(); this.flashT = 0.35;
    this.c.vitals.spend(6);
    g.fx.burst(p.x, p.y, p.z, 26, 0x9ad8ff, { glow: true, speed: 6, up: 1, size: 3, life: 0.35 });
    for (let i = 0; i < 12; i++) g.fx.glow.emit(p.x, p.y, p.z, dir.x * (8 + i * 2) + (Math.random() - 0.5) * 3, dir.y * (8 + i * 2) + Math.random() * 2, dir.z * (8 + i * 2) + (Math.random() - 0.5) * 3, new THREE.Color(0xbfe8ff).multiplyScalar(3), 1, 4, 0.25, 0, 3);
    vfx2d.play('smoke', p.x, p.y, p.z, { scale: 1.2 });
    sfx('pulse', 0.5, 1); sfx('crack', 0.5, 0.9); sfx('zap', 0.4, 0.6);
    g.cam.shake(0.5, 0.35);
    g.emit('cannon-fire', { x: p.x, z: p.z });
  }
  /** slugs in flight (run every frame, paused or not; they only move with sim time) */
  tickShells(dt: number) {
    if (!this.shells.length || dt <= 0) return;
    const g = this.c.g, N = g.region.N;
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      const steps = 3, h = dt / steps;
      let hit = false;
      for (let k = 0; k < steps && !hit; k++) {
        s.v.y -= G * h; s.p.addScaledVector(s.v, h); s.t += h;
        if (s.p.x < 0 || s.p.z < 0 || s.p.x > N || s.p.z > N || s.t > 8) { this.shells.splice(i, 1); hit = true; break; }
        const gy = g.world.surfaceY(s.p.x, s.p.z);
        if (s.p.y <= gy) { this.explode(s.p.x, gy, s.p.z, s.dmg); this.shells.splice(i, 1); hit = true; }
      }
      if (!hit) { g.fx.glow.emit(s.p.x, s.p.y, s.p.z, 0, 0, 0, new THREE.Color(0xbfe8ff).multiplyScalar(3), 1, 3.2, 0.35, 0, 0); g.fx.glow.emit(s.p.x, s.p.y, s.p.z, (Math.random() - 0.5) * 0.4, 0.2, (Math.random() - 0.5) * 0.4, new THREE.Color(0x6a6a70), 0.6, 2.4, 0.9, -0.3, 1); }
    }
  }
  private explode(x: number, y: number, z: number, dmg: number) {
    const g = this.c.g, R = 4.2;
    vfx2d.play('impact', x, y + 0.3, z, { scale: 2.4 }); vfx2d.play('smoke', x, y + 0.5, z, { scale: 2.6 }); vfx2d.play('dust', x, y, z, { scale: 2.4 }); vfx2d.play('shock', x, y + 0.1, z, { scale: 2 });
    g.fx.burst(x, y + 0.5, z, 60, 0xffb060, { glow: true, speed: 7, up: 6, size: 4, life: 0.9, grav: 9 });
    g.fx.burst(x, y + 0.3, z, 40, 0x5a4a3a, { speed: 5, up: 7, size: 4, life: 1.4, grav: 12 });
    const d = Math.hypot(x - g.cam.cam.position.x, z - g.cam.cam.position.z);
    g.cam.shake(clamp(1.4 - d / 50, 0.15, 1), 0.6);
    sfx('crack', 0.35, clamp(1.2 - d / 70, 0.2, 1)); sfx('pulse', 0.4, clamp(1.2 - d / 70, 0.2, 1));
    let kills = 0;
    g.world.near(x, z, R, (c) => { if (c.dead || c.faction === 'veyr') return; const k = 1 - Math.hypot(c.x - x, c.z - z) / R; g.world.damage(c, dmg * (0.3 + 0.7 * k), null); c.stunT = Math.max(c.stunT, 1.5); if (c.dead) kills++; });
    g.factions?.eachHostileIn(x, z, R + 1, 'veyr', (ref) => g.factions!.hit(ref, dmg * 0.8, null));
    try { g.region.shape(x, z, 1.5, -0.45); g.world.terrain.flushDirty(); g.world.flora.reseat(x, z, 2.2); g.world.flora.impulse?.(x, z, 5, 2.4); } catch { /* terrain edit optional */ }
    (g.world.terrain as unknown as { scorch?(x: number, z: number, r: number, k?: number): void }).scorch?.(x, z, 2, 0.9);
    g.emit('cannon-hit', { x, z, kills });
  }
  /** the sight: reticle, mil ticks, range, bearing tape, elevation, charge, the predicted fall */
  private draw() {
    const cv = this.cv, g2 = this.g2, a = this.arm; if (!cv || !g2 || !a) return;
    const dpr = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    g2.setTransform(dpr, 0, 0, dpr, 0, 0); g2.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2 + H * 0.06, ph = '#9fe0a8', amb = '#e0b050', red = '#e0604a';
    g2.lineWidth = 1.5; g2.strokeStyle = ph; g2.fillStyle = ph; g2.font = "16px 'VT', monospace"; g2.textBaseline = 'middle';
    // the vignette of the sight's tube
    const grd = g2.createRadialGradient(cx, cy, Math.min(W, H) * 0.32, cx, cy, Math.max(W, H) * 0.75); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(4,8,6,0.78)'); g2.fillStyle = grd; g2.fillRect(0, 0, W, H); g2.fillStyle = ph;
    // reticle: a broken ring, a chevron, stadia ticks
    g2.beginPath(); for (let i = 0; i < 4; i++) { const a0 = i * Math.PI / 2 + 0.25; g2.moveTo(cx + Math.cos(a0) * 70, cy + Math.sin(a0) * 70); g2.arc(cx, cy, 70, a0, a0 + Math.PI / 2 - 0.5); } g2.stroke();
    g2.beginPath(); g2.moveTo(cx - 12, cy + 12); g2.lineTo(cx, cy); g2.lineTo(cx + 12, cy + 12); g2.stroke();
    for (let i = -6; i <= 6; i++) { if (!i) continue; const L = i % 2 ? 6 : 12; g2.beginPath(); g2.moveTo(cx + i * 22, cy - L); g2.lineTo(cx + i * 22, cy + L); g2.stroke(); }
    for (let i = 1; i <= 5; i++) { g2.beginPath(); g2.moveTo(cx - (i % 2 ? 8 : 16), cy + i * 26); g2.lineTo(cx + (i % 2 ? 8 : 16), cy + i * 26); g2.stroke(); g2.fillText(String(i * 100), cx + 22, cy + i * 26); }
    // bearing tape across the top
    const brg = ((((-this.yaw * 180) / Math.PI) % 360) + 360) % 360;
    g2.save(); g2.beginPath(); g2.rect(cx - 260, 96, 520, 40); g2.clip();
    for (let d = Math.floor(brg / 5) * 5 - 60; d <= brg + 60; d += 5) { const x = cx + (d - brg) * 4.3; g2.beginPath(); g2.moveTo(x, 100); g2.lineTo(x, d % 15 ? 108 : 116); g2.stroke(); if (d % 15 === 0) { g2.textAlign = 'center'; g2.fillText(String(((d % 360) + 360) % 360).padStart(3, '0'), x, 126); } }
    g2.restore(); g2.textAlign = 'center'; g2.beginPath(); g2.moveTo(cx, 92); g2.lineTo(cx - 6, 84); g2.lineTo(cx + 6, 84); g2.closePath(); g2.fill();
    // elevation ladder on the left
    const el = (this.pitch * 180) / Math.PI;
    g2.textAlign = 'right'; g2.fillText(`ELV ${el >= 0 ? '+' : ''}${el.toFixed(1)}°`, 210, cy);
    for (let k = -4; k <= 8; k++) { const y = cy - (k * 5 - el) * 6; if (y < 160 || y > H - 160) continue; g2.beginPath(); g2.moveTo(222, y); g2.lineTo(k % 2 ? 232 : 244, y); g2.stroke(); }
    // the predicted fall: a diamond over the impact point with its range
    if (this.impactOk) {
      const p = this.impact.clone().project(this.c.g.cam.cam);
      if (p.z < 1) {
        const sx = (p.x * 0.5 + 0.5) * W, sy = (-p.y * 0.5 + 0.5) * H, rng = Math.hypot(this.impact.x - this.c.pod.x, this.impact.z - this.c.pod.z);
        g2.strokeStyle = amb; g2.fillStyle = amb; g2.beginPath(); g2.moveTo(sx, sy - 12); g2.lineTo(sx + 12, sy); g2.lineTo(sx, sy + 12); g2.lineTo(sx - 12, sy); g2.closePath(); g2.stroke();
        g2.textAlign = 'left'; g2.fillText(`IMPACT ${rng.toFixed(0)} M`, sx + 18, sy - 2);
        let hostile = false; this.c.g.world.near(this.impact.x, this.impact.z, 4.2, (c) => { if (!c.dead && c.faction !== 'veyr') hostile = true; });
        if (hostile) { g2.fillStyle = red; g2.fillText('TARGET IN BLAST', sx + 18, sy + 16); }
      }
    }
    // capacitor bank on the right: eight cells filling
    g2.textAlign = 'left'; g2.fillStyle = ph; g2.strokeStyle = ph;
    const bx = W - 250; g2.fillText(this.charge >= 1 ? 'CAPACITORS · READY' : 'CAPACITORS · CHARGING', bx, cy - 40);
    for (let i = 0; i < 8; i++) { const on = this.charge * 8 > i + 0.5; g2.strokeRect(bx + i * 24, cy - 24, 18, 34); if (on) g2.fillRect(bx + i * 24 + 3, cy - 21, 12, 28); }
    if (!this.c.vitals.powerOk) { g2.fillStyle = red; g2.fillText('NO POWER', bx, cy + 30); }
    g2.fillStyle = ph; g2.fillText(`ZOOM ${(46 / this.fov).toFixed(1)}×`, bx, cy + 54);
    if (this.flashT > 0) { g2.fillStyle = `rgba(220,240,255,${(this.flashT * 1.4).toFixed(2)})`; g2.fillRect(0, 0, W, H); }
  }
  dispose() { this.exit(); this.shells = []; }
}
void hudCanvas;
