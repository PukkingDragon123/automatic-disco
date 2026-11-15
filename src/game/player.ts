// v6: the golem no longer walks the planet. On the ground Unit 07 IS the landed colony pod (src/colony): it acts
// through arms, drones and the crew, under a free RTS camera. This class stays as the stationary stand-in the older
// systems ask for as `game.player` (factions and robots aim at it, the ocean and the details layer look it up): it
// sits at the pod, takes hits into the pod's integrity, and keeps the creature death gore going.
import * as THREE from 'three';
import type { Game } from './game';
import type { Creature } from './creature';
import { Gore } from './gore';
import { BLOW } from './combat';

const _v = new THREE.Vector3();

export class Player {
  readonly gore: Gore;
  /** the golem's stones and loot are gone; kept empty for readers that look */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly stones = { list: [] as any[] };
  /** how wet the stand-in is (the details layer reads it) */
  wet = 0;
  /** true: other systems treat the pod as present and targetable */
  started = true;
  invuln = 0; vx = 0; vz = 0; yaw = 0; driving = false;
  scanCd = 0; scanReach = 26;
  touch: null = null;
  constructor(readonly g: Game) {
    this.gore = new Gore(g);
    const prev = g.world.hooks.onDeath;
    g.world.hooks.onDeath = (c, by) => { prev?.(c, by); this.onDeath(c, by); };
    g.update$.push((dt) => { try { this.gore.update(dt); } catch (e) { if (this.errs++ < 3) console.error('gore', e); } });
  }
  private errs = 0;
  private get pod() { return (this.g as unknown as { colony?: { pod: { x: number; y: number; z: number; hp: number; damage(n: number): void } } }).colony?.pod; }
  get x() { return this.pod?.x ?? this.g.region.landing.x; }
  get z() { return this.pod?.z ?? this.g.region.landing.z; }
  get y() { return this.pod?.y ?? this.g.region.heightAt(this.x, this.z); }
  set y(_v: number) { /* the pod stands where it landed */ }
  get alive() { const p = this.pod; return !!p && p.hp > 0; }
  get radius() { return 2.7; }
  get height() { return 4.5; }
  get mass() { return 40000; }
  get hull() { return this.pod?.hp ?? 0; }
  /** hits on "the player" land on the pod's hull */
  hurt(n: number, _from?: unknown) { this.pod?.damage(n); }
  headPos() { return _v.set(this.x, this.y + 5, this.z).clone(); }
  /** the old golem input hooks: the pod takes no direct input here (src/colony handles it) */
  leftDown(_e: PointerEvent) { return false; }
  moveTo(_mx: number, _my: number) { /* the pod never moves */ }
  canPower(_a: string) { return false; }
  /** the ocean's dive layer asks these of a moving golem; the pod has no golem skills and never moves */
  has(_id: string) { return false; }
  blocked(_x: number, _z: number) { return true; }
  wave() { /* nothing to wave with */ }
  /** tests step it by hand; the gore runs in update$ */
  update(_dt: number) { /* stationary */ }
  private onDeath(c: Creature, by: Creature | null) {
    const blow = BLOW.c === c;
    const violent = blow || !!by || (c.fx.flash.value > 0.25 && c.energy > 0.02) || c.stunT > 0;
    try {
      if (violent) this.gore.die(c, blow ? BLOW.dir : by ? _v.set(c.x - by.x, 0, c.z - by.z) : null, blow ? BLOW.over : 0);
      else this.gore.wound(c, 6, 1);
    } catch (e) { if (this.errs++ < 3) console.error('gore', e); }
    if (c.faction !== 'veyr' && (c.stunT > 0 || c.mind === 'held')) this.g.emit('kill', { species: c.sp.name, by: 'colony' });
  }
  dispose() { try { this.gore.dispose(); } catch { /* already gone */ } }
}
