// The touch controls as part of the desk (phones and tablets): a joystick on the left end of the console, the
// PUNCH / USE / THROW / POWER / FIRE caps and the drum knob on a raised board at the right end. ui/touch.ts keeps the
// input handling; its hit areas are docked over these pads, and the pads show what it reports (held caps sink,
// lamps light, dead caps go dark, the stick leans the way the thumb pushes it).
import * as THREE from 'three';
import { box, cyl, lathe, mesh, facet, mat, type DeskMat } from './gfx';
import { M, Spring, decal } from './kit';
import { R, label } from './paint';

export type PadId = 'punch' | 'use' | 'throw' | 'power' | 'wheel' | 'fire';
interface Cap { root: THREE.Group; cap: THREE.Group; m: DeskMat; lamp: DeskMat; sp: Spring; r: number }
export class Pads {
  readonly left = new THREE.Group();
  readonly right = new THREE.Group();
  readonly board = new THREE.Group();
  readonly caps = {} as Record<PadId, Cap>;
  private stick = new THREE.Group(); private sx = new Spring(0, 160, 12); private sy = new Spring(0, 160, 12);
  /** the stick's well, for docking its touch zone */
  readonly well: THREE.Object3D;
  constructor(tilt: number) {
    // ---- the joystick: a dished steel well on an olive plinth, a Bakelite ball on a chrome shaft
    const L = this.left;
    L.add(mesh(box(116, 30, 70), M('olive'), 0, 15, -24));
    L.add(mesh(box(118, 2, 72), M('steel', { spec: 1 }), 0, 30.5, -24));
    const well = mesh(lathe([[44, 0], [44, 2], [40, 3], [30, 1], [8, -2], [0, -2]], 16), M('steel', { spec: 1 }), 0, 31, -24);
    L.add(well); this.well = well;
    L.add(mesh(lathe([[12, 0], [12, 1.5], [6, 4]], 10), M('rubber'), 0, 31, -24));
    this.stick.add(mesh(cyl(2.2, 2.6, 18, 8), M('steel', { spec: 1 }), 0, 9, 0), mesh(facet(new THREE.IcosahedronGeometry(9, 1)), M('bake', { spec: 1 }), 0, 21, 0));
    this.stick.position.set(0, 32, -24);
    L.add(this.stick);
    // chevrons engraved round the well
    for (const [x, z, r] of [[0, -62, 0], [0, 14, Math.PI], [-38, -24, Math.PI / 2], [38, -24, -Math.PI / 2]] as [number, number, number][]) {
      const c = mesh(box(6, 0.6, 3), mat({ tint: R.glowTeal[3], emit: 0.4, flat: 0.5 }), x, 32.2, z); c.rotation.y = r; L.add(c);
    }
    // ---- the button board: leaning like the strip's panel, the caps on its face
    const Rt = this.right, B = this.board;
    Rt.add(mesh(box(190, 40, 60), M('olive'), 0, 20, -30));
    B.position.set(0, 40, -2); B.rotation.x = -(Math.PI / 2 - tilt);
    B.add(mesh(box(186, 150, 10), M('olive'), 0, 75, -5));
    B.add(mesh(box(190, 3, 12), M('steel', { spec: 1 }), 0, 150, -5));
    Rt.add(B);
    // layout from the old thumb arc (x, y from the board's bottom-right corner; radius), in art px
    const C = { x: 58, y: 44 };
    const at = (deg: number, d: number) => ({ x: C.x + Math.cos((deg * Math.PI) / 180) * d, y: C.y + Math.sin((deg * Math.PI) / 180) * d });
    const P: Record<PadId, { x: number; y: number; r: number; col: number; lab: string }> = {
      punch: { ...C, r: 30, col: R.stampRed[3], lab: 'PUNCH' },
      use: { ...at(0, 60), r: 21, col: R.clay[2], lab: 'USE' },
      throw: { ...at(48, 62), r: 21, col: R.clay[2], lab: 'THROW' },
      power: { ...at(94, 62), r: 21, col: R.clay[2], lab: 'POWER' },
      wheel: { ...at(70, 94), r: 12, col: R.olive[3], lab: '' },
      fire: { ...at(24, 100), r: 21, col: R.clay[2], lab: 'FIRE' },
    };
    for (const [id, p] of Object.entries(P) as [PadId, typeof P[PadId]][]) {
      const g = new THREE.Group(), cap = new THREE.Group(), m = mat({ tint: p.col, spec: 1 }), lamp = mat({ tint: R.steel[2], flat: 0.5 });
      g.add(mesh(lathe([[p.r + 4, 0], [p.r + 4, 2.5], [p.r + 1.5, 4], [p.r, 3]], 16).rotateX(Math.PI / 2), M('steel', { spec: 1 })));
      cap.add(mesh(lathe([[p.r - 1, 0], [p.r - 0.5, 3], [p.r * 0.75, p.r * 0.32 + 3], [0.2, p.r * 0.42 + 3]], 14).rotateX(Math.PI / 2), m));
      if (p.lab) { const l = decal(label(p.lab, R.bone[5], p.r > 25)); l.position.set(0, -p.r * 0.15, p.r * 0.42 + 3.6); cap.add(l); }
      g.add(cap);
      g.add(mesh(facet(new THREE.IcosahedronGeometry(1.8, 0)), lamp, 0, p.r + 2.5, 3));
      g.position.set(93 - p.x, p.y, 0);
      B.add(g);
      this.caps[id] = { root: g, cap, m, lamp, sp: new Spring(0, 260, 14), r: p.r };
    }
    // the drum knob's arrow on the little wheel cap
    const arr = mesh(box(8, 1.4, 1), mat({ tint: R.bone[5], flat: 0.6 }), 0, 0, 9); this.caps.wheel.cap.add(arr);
  }
  update(dt: number, st: { held: Record<string, boolean>; lamp: Record<string, number>; dead: Record<string, boolean>; stick: { x: number; y: number; on: boolean } } | null) {
    const sx = this.sx.step(st?.stick.on ? st.stick.x : 0, dt), sy = this.sy.step(st?.stick.on ? st.stick.y : 0, dt);
    this.stick.rotation.z = -sx * 0.45; this.stick.rotation.x = sy * 0.45;
    for (const [id, c] of Object.entries(this.caps) as [PadId, Cap][]) {
      const held = !!st?.held[id];
      c.cap.position.z = c.sp.step(held ? -2.6 : 0, dt);
      c.m.uniforms.uDim.value = st?.dead[id] ? 0.4 : 0;
      const l = st?.lamp[id] ?? 0;
      (c.lamp.uniforms.uTint.value as THREE.Color).setHex(l === 1 ? R.glowTeal[3] : l === 2 ? R.glowAmber[3] : R.steel[2]);
      c.lamp.uniforms.uEmit.value = l ? 0.8 : 0;
    }
  }
}
