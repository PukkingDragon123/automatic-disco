// Callouts: paper tags pinned around a live 3D vignette, each with a hand-inked leader line to the part of the thing
// it describes (a world anchor projected every frame). Lines wobble a little, end in a dot, and are drawn in one SVG.
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
      // the line leaves the tag from the edge nearest the anchor and ends on the part with a dot
      const ex = Math.max(x + 6, Math.min(x + bw - 6, p.x)), ey = Math.max(y + 6, Math.min(y + bh - 6, p.y));
      const mx = (ex + p.x) / 2 + Math.sin(c.seed) * 4, my = (ey + p.y) / 2 + Math.cos(c.seed * 1.7) * 4;
      if (Math.hypot(ex - p.x, ey - p.y) > 10) path += `M${ex.toFixed(0)} ${ey.toFixed(0)} Q${mx.toFixed(0)} ${my.toFixed(0)} ${p.x.toFixed(0)} ${p.y.toFixed(0)} `;
      dots += `<rect x="${Math.round(p.x) - 3}" y="${Math.round(p.y) - 3}" width="6" height="6" fill="#2b2622"/>`;
    }
    this.svg.innerHTML = `<path d="${path}" stroke="#2b2622" stroke-width="2" fill="none" stroke-linecap="square"/>${dots}`;
  }
}
