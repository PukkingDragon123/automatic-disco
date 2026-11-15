// Callouts: engraved brass tags around a live 3D vignette, each with a straight machined pointer (a steel rod, dark
// edged with a lit core) to the part of the thing it describes (a world anchor projected every frame), ending on a
// rivet. All pointers are drawn in one SVG.
import * as THREE from 'three';
import type { Vignette } from './stage3d';

export interface Call { el: HTMLElement; anchor: THREE.Object3D; dx: number; dy: number; seed: number; hidden?: boolean }
export class Callouts {
  readonly svg: SVGSVGElement;
  list: Call[] = [];
  private v = { x: 0, y: 0, ok: true };
  private tmp = new THREE.Vector3();
  constructor(parent: HTMLElement, public vig: Vignette) {
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'pp-ink'); this.svg.setAttribute('width', '100%'); this.svg.setAttribute('height', '100%');
    parent.appendChild(this.svg);
  }
  add(el: HTMLElement, anchor: THREE.Object3D, dx: number, dy: number) { const c = { el, anchor, dx, dy, seed: this.list.length * 7.3 + 1 }; this.list.push(c); return c; }
  clear() { for (const c of this.list) c.el.remove(); this.list = []; this.svg.innerHTML = ''; }
  update() {
    const p = this.v;
    let path = '', dots = '';
    for (const c of this.list) {
      const w = c.anchor.getWorldPosition(this.tmp);
      this.vig.project(w, p);
      const vis = p.ok && !c.hidden;
      c.el.style.display = vis ? '' : 'none';
      if (!vis) continue;
      const r = c.el.getBoundingClientRect(), bw = r.width || 64, bh = r.height || 48;
      const x = Math.round(p.x + c.dx - bw / 2), y = Math.round(p.y + c.dy - bh / 2);
      c.el.style.left = x + 'px'; c.el.style.top = y + 'px';
      // the rod leaves the tag from the edge nearest the anchor, dead straight, and ends on a rivet over the part
      const ex = Math.round(Math.max(x + 6, Math.min(x + bw - 6, p.x))), ey = Math.round(Math.max(y + 6, Math.min(y + bh - 6, p.y)));
      const ax = Math.round(p.x), ay = Math.round(p.y);
      if (Math.hypot(ex - ax, ey - ay) > 10) path += `M${ex} ${ey} L${ax} ${ay} `;
      dots += `<rect x="${ax - 5}" y="${ay - 5}" width="10" height="10" fill="#15171b"/><rect x="${ax - 3}" y="${ay - 3}" width="6" height="6" fill="#aab1b4"/><rect x="${ax - 3}" y="${ay - 3}" width="3" height="3" fill="#d2d7d6"/>`;
    }
    this.svg.innerHTML = `<path d="${path}" stroke="#15171b" stroke-width="4" fill="none" stroke-linecap="square" shape-rendering="crispEdges"/><path d="${path}" stroke="#858d93" stroke-width="2" fill="none" stroke-linecap="square" shape-rendering="crispEdges"/>${dots}`;
  }
}
