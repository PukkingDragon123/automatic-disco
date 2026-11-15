// The events' stage: one Cinema (game/cinema.ts) bound to the planet game. While a scene plays it drives the game
// camera through game.cineCam (chaining whatever hook was there before), and the cinema is ticked with real time
// from that same hook, so scenes run even while the simulation is paused for a decision.
import * as THREE from 'three';
import { Cinema, type Script } from '../game/cinema';
import type { Game } from '../game/game';
import { ui } from '../ui/kit';
import { anyG } from '../research/util';

const V3 = THREE.Vector3;
export class Stage {
  readonly cine: Cinema;
  private prev: ((cam: THREE.PerspectiveCamera, dt: number) => void) | null = null;
  private hook: ((cam: THREE.PerspectiveCamera, dt: number) => void) | null = null;
  /** scene props to remove when a scene ends */
  props: THREE.Object3D[] = [];
  constructor(readonly g: Game) {
    this.cine = new Cinema({
      enter: () => { anyG(g).setMode?.({ k: 'normal' }); document.body.classList.add('ev-on'); },
      exit: () => { anyG(g).hud?.invalidate?.(); document.body.classList.remove('ev-on'); },
    });
    this.cine.ui.root.remove(); ui().appendChild(this.cine.ui.root);
  }
  /** ground height under (x, z) */
  ground = (x: number, z: number) => { const g = anyG(this.g); try { return g.world.surfaceY(x, z); } catch { return 0; } };
  at(x: number, z: number, h = 0) { return new V3(x, this.ground(x, z) + h, z); }
  /** the pod (the colony's centre) */
  pod(): THREE.Vector3 {
    const g = anyG(this.g), p = g.colony?.pod ?? g.veyr?.core;
    const x = p?.x ?? g.region?.landing?.x ?? 64, z = p?.z ?? g.region?.landing?.z ?? 64;
    return this.at(x, z);
  }
  private attach() {
    const g = anyG(this.g);
    if (this.hook && g.cineCam === this.hook) return;
    this.prev = g.cineCam ?? null;
    this.hook = (cam, dt) => { this.cine.update(dt); if (this.cine.active) this.cine.apply(cam); else this.prev?.(cam, dt); };
    g.cineCam = this.hook;
  }
  private detach() { const g = anyG(this.g); if (g.cineCam === this.hook) g.cineCam = this.prev; this.hook = null; }
  async play(script: Script, name: string, skippable = true) {
    this.attach();
    const c = this.cine, g = anyG(this.g);
    c.cam.from(g.cam.cam, 20);
    const skipped = await c.play(async (cc) => { cc.ui.fade(1, 0); await script(cc); }, { name, skippable });
    for (const p of this.props.splice(0)) p.removeFromParent();
    // keep ticking the cinema UI for its fade-outs, then let the camera go
    setTimeout(() => { if (!c.active) this.detach(); }, 900);
    return skipped;
  }
  dispose() { this.detach(); this.cine.dispose(); }
}
