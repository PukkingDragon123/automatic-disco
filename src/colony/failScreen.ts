// The colony is lost. A cinematic: the world slows to a stop, the camera pulls up and away from the pod in a slow
// arc while the alarm lamps keep turning, letterbox bars close in, the program's teletype prints the cause, and a
// MISSION FAILED stamp comes down. Then the choices: RETRY from the last save, or RETURN TO THE SHIP.
import * as THREE from 'three';
import type { Colony } from './colony';
import { sfx } from '../audio/audio';

export type FailReason = 'collapse-power' | 'collapse-oxygen' | 'collapse-food' | 'collapse-workers' | 'pod-destroyed' | 'recalled';
const TEXT: Record<FailReason, [string, string]> = {
  'collapse-power': ['COLONY COLLAPSE · POWER', 'The battery ran flat and stayed flat. Life support, the scrubbers and the arms went dark one after another.'],
  'collapse-oxygen': ['COLONY COLLAPSE · OXYGEN', 'The tank ran dry. Nobody in the pod could breathe, and nobody outside could refill a suit.'],
  'collapse-food': ['COLONY COLLAPSE · FOOD', 'The lockers were empty for too long. The crew could not work, then could not stand.'],
  'collapse-workers': ['COLONY COLLAPSE · NO WORKERS', 'There is nobody left on the ground to keep the colony running.'],
  'pod-destroyed': ['POD CP-07 DESTROYED', 'The hull gave way. Unit 07\'s core went silent with it.'],
  'recalled': ['MISSION RECALLED', 'The program has pulled the colony. Quotas missed; the board has lost confidence in Unit 07.'],
};

export class FailScreen {
  on = false;
  private el: HTMLDivElement | null = null; private t = 0;
  private prevCine: ((cam: THREE.PerspectiveCamera, dt: number) => void) | null = null;
  private from = new THREE.Vector3(); private ang = 0;
  constructor(readonly c: Colony) {}
  show(reason: FailReason, detail?: string) {
    if (this.on) return;
    this.on = true; this.t = 0;
    const g = this.c.g, [title, body] = TEXT[reason] ?? ['COLONY LOST', ''];
    this.from.copy(g.cam.cam.position); this.ang = Math.atan2(this.from.x - this.c.pod.x, this.from.z - this.c.pod.z);
    this.prevCine = g.cineCam;
    g.cineCam = (cam, dt) => this.camera(cam, dt);
    sfx('spawn-alarm', 0.7, 0.9); sfx('pulse', 0.4, 1);
    const save = this.c.loadSave(), sv = save ? `SOL ${save.sol} · ${Math.floor((save.t ?? 0) / 60)}:${String(Math.floor((save.t ?? 0) % 60)).padStart(2, '0')}` : 'LANDING';
    const st = this.c, arms = st.arms.length, dr = st.drones.length, ss = st.structures.filter((s) => s.done).length, crew = st.teammates.filter((t) => t.alive).length;
    const el = document.createElement('div'); el.className = 'cf-screen'; this.el = el; document.body.appendChild(el);
    el.innerHTML = `<div class="cf-wash"></div><div class="cf-bar top"></div><div class="cf-bar bot"></div>
      <div class="cf-card">
        <div class="cf-head">UNAA PLANETARY RESEARCH PROGRAM · COLONY TELEMETRY · ${g.regionName.toUpperCase()}</div>
        <div class="cf-title">${title}</div>
        <div class="cf-body"></div>
        ${detail ? `<div class="cf-detail">${detail}</div>` : ''}
        <div class="cf-stats"><span>SOLS<b>${st.sol}</b></span><span>ARMS<b>${arms}</b></span><span>DRONES<b>${dr}</b></span><span>STRUCTURES<b>${ss}</b></span><span>CREW ALIVE<b>${crew} / 2</b></span></div>
        <div class="cf-stamp">MISSION FAILED</div>
        <div class="cf-btns"><button class="cf-btn retry"><i>▶</i> RETRY FROM LAST SAVE <small>${sv}</small></button><button class="cf-btn ship"><i>◆</i> RETURN TO THE SHIP</button></div>
      </div>`;
    // the teletype prints the cause
    const b = el.querySelector('.cf-body') as HTMLDivElement; let i = 0;
    const type = () => { if (!this.on) return; i += 2; b.textContent = body.slice(0, i); if (i < body.length) setTimeout(type, 28); };
    setTimeout(type, 1300);
    setTimeout(() => { el.classList.add('stamped'); sfx('hit', 0.5, 1); sfx('crack', 0.6, 0.7); }, 2600);
    setTimeout(() => el.classList.add('ready'), 3200);
    (el.querySelector('.retry') as HTMLButtonElement).onclick = () => { sfx('click'); this.retry(); };
    (el.querySelector('.ship') as HTMLButtonElement).onclick = () => { sfx('click'); this.toShip(); };
    requestAnimationFrame(() => el.classList.add('on'));
  }
  private camera(cam: THREE.PerspectiveCamera, dt: number) {
    this.t += dt;
    const p = this.c.pod, k = 1 - Math.exp(-this.t * 0.25);
    const a = this.ang + this.t * 0.06, r = 18 + k * 26, h = 9 + k * 26;
    cam.position.set(p.x + Math.sin(a) * r, p.y + h, p.z + Math.cos(a) * r);
    cam.lookAt(p.x, p.y + 2, p.z); cam.updateMatrixWorld();
  }
  /** rebuild the region from the colony's last save */
  retry() {
    const g = this.c.g, save = this.c.loadSave();
    this.hide();
    const G = g.constructor as new (e: typeof g.engine, i: typeof g.input, o: typeof g.opts) => typeof g;
    const opts = { ...g.opts, descent: false, story: false, resumeColony: save ?? true } as typeof g.opts;
    // the old region goes first (its dispose clears the UI layer), then the new one is built from the save
    g.engine.setScreen({ update() { /* between regions */ }, render() { /* nothing */ } });
    const ng = new G(g.engine, g.input, opts);
    g.engine.setScreen(ng);
    (g.opts.hooks as { onRetry?: (n: typeof g) => void } | undefined)?.onRetry?.(ng);
  }
  toShip() {
    const g = this.c.g;
    this.hide();
    const h = g.opts.hooks as { openShip?: (gg: typeof g, back: () => void) => void; onLose?: (gg: typeof g) => void; openMenu?: (gg: typeof g) => void } | undefined;
    if (h?.onLose) { h.onLose(g); return; }
    this.c.shipLink();
  }
  hide() { this.on = false; this.el?.remove(); this.el = null; this.c.g.cineCam = this.prevCine; }
  dispose() { this.el?.remove(); this.el = null; this.on = false; }
}
