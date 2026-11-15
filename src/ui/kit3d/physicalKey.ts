// kit3d physical key: a keycap in a machined well. The cap carries its label (and an optional icon); lit, the cap
// glows from inside and a light ring round its foot comes on (both bloom). press() drives it down and lets it spring
// back with a click.
//   const k = physicalKey({ w: 0.2, d: 0.1, label: 'RESEARCH' }); anchor.add(k.group); k.setLit(true, 0xffb347)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { gbuf, F_EMIT } from '../../gfx/gbuf';
import { mat32, worldUV, canvasTex, K3 } from './tex';
import { iconCanvas } from '../../research/ui/icons';

export interface PhysicalKey { group: THREE.Group; hit: THREE.Mesh; lit: boolean; press(): void; setLit(on: boolean, color?: number): void; setLabel(label: string, icon?: string): void; update(dt: number): void }

export function physicalKey(o: { w?: number; d?: number; h?: number; cap?: number; label?: string; icon?: string; lit?: number; size?: 11 | 22 | 24 | 48 } = {}): PhysicalKey {
  const w = o.w ?? 0.12, d = o.d ?? 0.09, h = o.h ?? 0.035, rim = 0.012, litCol = new THREE.Color(o.lit ?? K3.amber);
  const group = new THREE.Group();
  const well = mat32(0x15181b, 'painted'), steel = mat32(K3.steel, 'brushed');
  // the well and its machined rim
  const base = new THREE.Mesh(worldUV(new THREE.BoxGeometry(w + rim * 2, 0.014, d + rim * 2)), well); base.position.y = 0.007; base.receiveShadow = true; group.add(base);
  for (const [x, z, bw, bd] of [[0, -(d / 2 + rim / 2), w + rim * 2, rim], [0, d / 2 + rim / 2, w + rim * 2, rim], [-(w / 2 + rim / 2), 0, rim, d], [w / 2 + rim / 2, 0, rim, d]]) {
    const r = new THREE.Mesh(worldUV(new THREE.BoxGeometry(bw, 0.02, bd)), steel); r.position.set(x, 0.01, z); r.castShadow = r.receiveShadow = true; group.add(r);
  }
  // the light ring at the cap's foot
  const ringM = gbuf(new THREE.MeshBasicMaterial({ color: 0x20262b }), 1);
  const ring = new THREE.Mesh(new THREE.BoxGeometry(w + 0.006, 0.006, d + 0.006), ringM); ring.position.y = 0.015; group.add(ring);
  // the cap
  const capCol = new THREE.Color(o.cap ?? 0xc9ccc4);
  const capM = gbuf(new THREE.MeshLambertMaterial({ color: capCol, emissive: 0x000000 }), 1);
  const cap = new THREE.Mesh(new RoundedBoxGeometry(w - 0.006, h, d - 0.006, 2, 0.008), capM); cap.castShadow = true; cap.receiveShadow = true;
  const capY = 0.016 + h / 2; cap.position.y = capY; group.add(cap);
  // the label on the cap's face
  const LW = 256, LH = Math.max(32, Math.round(256 * d / w / 8) * 8);
  const { g, tex } = canvasTex(LW, LH);
  const labM = gbuf(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }), 0);
  const lab = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.02, d - 0.02), labM); lab.rotation.x = -Math.PI / 2; lab.position.y = h / 2 + 0.0015; cap.add(lab);
  let label = o.label ?? '', icon = o.icon;
  const paint = (litOn: boolean) => {
    g.clearRect(0, 0, LW, LH);
    const ink = litOn ? '#3a1e00' : '#1e2226';
    let x = LW / 2;
    if (icon) { const ic = iconCanvas(icon, 'phos'); const s = Math.min(LH - 8, 48); g.imageSmoothingEnabled = false; g.drawImage(ic, label ? 10 : (LW - s) / 2, (LH - s) / 2, s, s); x = label ? LW / 2 + s / 2 : x; }
    if (label) { const size = o.size ?? 24; g.font = `${size}px '${size === 24 || size === 48 ? 'Title' : 'Body'}', monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = ink; g.fillText(label, Math.round(x), Math.round(LH / 2 + 1)); }
    tex.needsUpdate = true;
  };
  paint(false);
  let pt = -1, lit = false;
  const k: PhysicalKey = {
    group, hit: cap, lit: false,
    press() { pt = 0; },
    setLit(on, color) {
      if (color != null) litCol.set(color);
      lit = on; k.lit = on;
      capM.color.copy(on ? litCol.clone().lerp(new THREE.Color(0xffffff), 0.35) : capCol); capM.emissive.copy(on ? litCol.clone().multiplyScalar(0.55) : new THREE.Color(0));
      ringM.color.copy(on ? litCol.clone().multiplyScalar(2.2) : new THREE.Color(0x20262b)); gbuf(ringM, on ? F_EMIT : 1); gbuf(capM, on ? F_EMIT : 1);
      paint(on);
    },
    setLabel(l, ic) { label = l; icon = ic; paint(lit); },
    update(dt) {
      if (pt < 0) return;
      pt += dt; const u = pt / 0.22;
      cap.position.y = capY - 0.011 * (u < 0.3 ? u / 0.3 : Math.max(0, 1 - (u - 0.3) / 0.7));
      if (u >= 1) { pt = -1; cap.position.y = capY; }
    },
  };
  return k;
}
