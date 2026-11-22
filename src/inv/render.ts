// The containers in the world: a detailed model per placed container (inv/models.ts), riding its building's rise-in
// animation, lit by the works' selection and hover flags, its load and paint kept in step with the container.
import * as THREE from 'three';
import type { Game } from '../game/game';
import type { Storage } from './storage';
import type { Container } from './container';
import { ContainerModel } from './models';
import { F_SEL, F_HOVER } from '../gfx/gbuf';

interface FBView { x: number; y: number; z: number; r: number; rise: number; dead: boolean }
export class ContainerRender {
  readonly group = new THREE.Group();
  private models = new Map<Container, ContainerModel>();
  private t = 0;
  constructor(readonly g: Game, readonly st: Storage) {
    g.world.scene.add(this.group);
    st.on('container', (d: { c: Container; added: boolean }) => (d.added ? this.add(d.c) : this.drop(d.c)));
    for (const c of st.containers) this.add(c);
    g.update$.push((dt) => this.frame(dt));
  }
  private add(c: Container) {
    if (this.models.has(c) || !c.b) return;
    const m = new ContainerModel(c);
    this.models.set(c, m);
    this.group.add(m.root);
    this.place(c, m);
  }
  /** the model drawing a placed container (world/resources3d drops resources into it) */
  modelOf(c: Container): ContainerModel | null { return this.models.get(c) ?? null; }
  private drop(c: Container) { const m = this.models.get(c); if (!m) return; m.dispose(); this.models.delete(c); }
  private place(c: Container, m: ContainerModel) {
    const b = c.b as unknown as FBView;
    const e = 1 - (1 - Math.min(1, b.rise ?? 1)) ** 3;
    m.root.position.set(b.x, b.y, b.z);
    m.root.rotation.y = -(b.r & 3) * Math.PI / 2;
    m.root.scale.set(1, Math.max(0.001, e), 1);
  }
  private frame(dt: number) {
    this.t += dt;
    const R = (this.g.factory as unknown as { render?: { sel?: unknown; hover?: unknown } } | undefined)?.render;
    for (const [c, m] of this.models) {
      if (!c.b || (c.b as unknown as FBView).dead) { this.drop(c); continue; }
      if ((c.b as unknown as FBView).rise < 1 || m.root.scale.y < 1) this.place(c, m);
      m.update();
      m.flag.value = 1 + (R?.sel === c.b ? F_SEL : 0) + (R?.hover === c.b ? F_HOVER : 0);
    }
  }
}
