// Drawing the factory: one InstancedMesh per machine model (and per moving part), belts by shape, every crate on
// every belt (and on every worker's harness) as one instanced mesh that samples the item icon array, power cables
// sagging between poles, and the coal and copper outcrops. Matrices are rebuilt only when a model's set changes or
// something is rising in; the per-instance status lamp colour and work glow are written every frame.
import * as THREE from 'three';
import type { Factory, FBuilding } from './factory';
import { STATUS_COL } from './status';
import { FDEFS, isBelt } from './defs';
import { modelFor, beltGeo, beltPath, seamGeo, type Model, type Part } from './models';
import { machineMaterial, MU } from './tex';
import { iconArray, ITEM_INDEX, ITEM_IDS, type ItemId } from './items';
import { gbuf, F_SEL, F_HOVER } from '../gfx/gbuf';

const _m = new THREE.Matrix4(), _p = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _e = new THREE.Euler();
const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

class Batch {
  mesh: THREE.InstancedMesh;
  state: THREE.InstancedBufferAttribute; belt: THREE.InstancedBufferAttribute;
  list: FBuilding[] = [];
  dirty = true;
  constructor(readonly geo: THREE.BufferGeometry, readonly mat: THREE.Material, readonly scene: THREE.Object3D, cap = 16) {
    this.mesh = this.make(cap);
  }
  private make(cap: number) {
    const g = this.geo.clone();
    this.state = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); this.state.setUsage(THREE.DynamicDrawUsage);
    this.belt = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    g.setAttribute('aState', this.state); g.setAttribute('aBelt', this.belt);
    const m = new THREE.InstancedMesh(g, this.mat, cap);
    m.count = 0; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    this.scene.add(m);
    return m;
  }
  ensure(n: number) {
    if (n <= this.mesh.instanceMatrix.count) return;
    let cap = this.mesh.instanceMatrix.count; while (cap < n) cap *= 2;
    this.mesh.removeFromParent(); this.mesh.geometry.dispose();
    this.mesh = this.make(cap); this.dirty = true;
  }
}

export class FactoryRender {
  readonly group = new THREE.Group();
  readonly mat = machineMaterial(1);
  private batches = new Map<string, Batch>();
  private parts = new Map<string, Batch[]>();
  private keyOf = new Map<number, string>();
  beltsDirty = true; cablesDirty = true;
  private items: THREE.InstancedMesh; private itemAttr: THREE.InstancedBufferAttribute; private itemCap = 256;
  private itemMat: THREE.MeshLambertMaterial; private itemU = { uIcons: { value: iconArray() } };
  private cables: THREE.LineSegments;
  /** the selected / hovered building drawn on its own (for the outline rim) */
  private hi: THREE.Mesh[] = [];
  sel: FBuilding | null = null; hover: FBuilding | null = null;
  /** extra crates to draw this frame (workers' loads): x, y, z, item */
  extra: { x: number; y: number; z: number; id: ItemId; yaw: number }[] = [];
  private t = 0;

  constructor(readonly f: Factory) {
    f.g.world.scene.add(this.group);
    // belt crates
    const g = new THREE.BoxGeometry(0.26, 0.15, 0.26);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) { const face = Math.floor(i / 4); if (face !== 2) uv.setXY(i, 0.03, 0.03); }
    this.itemAttr = new THREE.InstancedBufferAttribute(new Float32Array(this.itemCap), 1); this.itemAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aItem', this.itemAttr);
    const m = (this.itemMat = new THREE.MeshLambertMaterial());
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.itemU);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aItem; varying vec3 vIu;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvIu = vec3(uv, aItem);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform highp sampler2DArray uIcons; varying vec3 vIu;')
        .replace('#include <map_fragment>', 'vec4 ic = texture(uIcons, vIu); diffuseColor.rgb *= ic.rgb * (ic.a > 0.5 ? 1.0 : 0.8);');
    };
    m.customProgramCacheKey = () => 'fac-crate';
    gbuf(m, 1);
    this.items = new THREE.InstancedMesh(g, m, this.itemCap);
    this.items.count = 0; this.items.frustumCulled = false; this.items.castShadow = true;
    this.group.add(this.items);
    // power cables
    const lm = gbuf(new THREE.LineBasicMaterial({ color: 0x1f232b }), 0);
    this.cables = new THREE.LineSegments(new THREE.BufferGeometry(), lm);
    this.cables.frustumCulled = false;
    this.group.add(this.cables);
    // coal and copper outcrops
    for (const s of f.seams) {
      if (s.kind !== 'coal' && s.kind !== 'copper') continue;
      const mesh = new THREE.Mesh(seamGeo(s.kind, s.i * 977 + 13), this.mat);
      mesh.position.set(s.x, f.g.region.heightAt(s.x, s.z), s.z); mesh.castShadow = true; mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }
  private batchKey(b: FBuilding) {
    if (isBelt(b.kind)) return (b.kind === 'pipe' ? 'pipe:' : 'belt:') + b.shape;
    return 'm:' + b.def.model + (b.def.model === 'miner' ? b.kind : '');
  }
  private modelOf(b: FBuilding): Model { return modelFor(b.kind, b.def.model, b.def.hooks?.model); }
  private batch(key: string, b: FBuilding): Batch {
    let bt = this.batches.get(key);
    if (!bt) {
      const geo = key.startsWith('belt:') ? beltGeo(key.slice(5) as 'straight') : key.startsWith('pipe:') ? beltGeo(key.slice(5) as 'straight', true) : this.modelOf(b).base;
      bt = new Batch(geo, this.mat, this.group);
      this.batches.set(key, bt);
      if (!key.startsWith('belt:') && !key.startsWith('pipe:')) this.parts.set(key, this.modelOf(b).parts.map((p) => new Batch(p.geo, this.mat, this.group)));
    }
    return bt;
  }
  add(b: FBuilding) { const k = this.batchKey(b); this.keyOf.set(b.id, k); const bt = this.batch(k, b); bt.list.push(b); bt.dirty = true; }
  remove(b: FBuilding) {
    const k = this.keyOf.get(b.id); if (!k) return;
    const bt = this.batches.get(k); if (bt) { const i = bt.list.indexOf(b); if (i >= 0) bt.list.splice(i, 1); bt.dirty = true; }
    this.keyOf.delete(b.id);
    if (this.sel === b) this.sel = null; if (this.hover === b) this.hover = null;
  }
  /** a belt changed shape: move it to the right batch */
  private rebatchBelts() {
    for (const b of this.f.buildings) {
      if (!isBelt(b.kind)) continue;
      const k = this.batchKey(b), old = this.keyOf.get(b.id);
      if (k !== old) { if (old) { const o = this.batches.get(old); if (o) { o.list.splice(o.list.indexOf(b), 1); o.dirty = true; } } this.keyOf.set(b.id, k); const bt = this.batch(k, b); bt.list.push(b); bt.dirty = true; }
    }
    // belt heights: each cell eases from its feeder's height to the next cell's
    for (const b of this.f.buildings) {
      if (!isBelt(b.kind)) continue;
      const [fx, fz] = b.fwd, nx = this.f.at(b.cx + fx, b.cz + fz), pv = this.f.at(b.cx - fx, b.cz - fz);
      const yo = nx && isBelt(nx.kind) ? (b.y + nx.y) / 2 : b.y, yi = pv && isBelt(pv.kind) && b.shape === 'straight' ? (b.y + pv.y) / 2 : b.y;
      (b as unknown as { yIn: number }).yIn = yi; (b as unknown as { yOut: number }).yOut = yo;
    }
    this.beltsDirty = false;
  }
  /** base matrix of a building into _m */
  private base(b: FBuilding, hidden: boolean) {
    const rise = hidden ? 0 : b.rise, e = 1 - (1 - rise) ** 3;
    if (isBelt(b.kind)) {
      const yi = (b as unknown as { yIn: number }).yIn ?? b.y, yo = (b as unknown as { yOut: number }).yOut ?? b.y, dh = yo - yi;
      _e.set(-Math.atan(dh), -(b.r & 3) * Math.PI / 2, 0, 'YXZ'); _q.setFromEuler(_e);
      _s.set(hidden ? 0 : 1, e || 0.0001, Math.sqrt(1 + dh * dh));
      _m.compose(_v.set(b.x, (yi + yo) / 2, b.z), _q, _s);
      return;
    }
    _q.setFromAxisAngle(AX.y, -(b.r & 3) * Math.PI / 2);
    _s.set(hidden ? 0 : 1, Math.max(0.0001, e), hidden ? 0 : 1);
    _m.compose(_v.set(b.x, b.y, b.z), _q, _s);
  }
  private partMatrix(b: FBuilding, p: Part, k: number) {
    _p.identity();
    let a = 0;
    const ph = b.phase;
    switch (p.mode) {
      case 'spin': a = ph * p.speed; _p.makeRotationAxis(AX[p.axis], a); break;
      case 'rock': a = Math.sin(ph * p.speed * Math.PI * 2 * 0.5) * (p.amp ?? 0.3); _p.makeRotationAxis(AX[p.axis], a); break;
      case 'yaw':
        if (b.kind === 'turret') a = b.aim + (b.r & 3) * Math.PI / 2;
        else a = Math.sin(ph * p.speed) * (p.amp ?? 0.5);
        _p.makeRotationAxis(AX.y, a); break;
      case 'bob': _p.makeTranslation(0, Math.sin(ph * p.speed * 6) * (p.amp ?? 0.1), 0); break;
      case 'press': {
        if (b.kind === 'sluice') { _p.makeTranslation(0, b.on ? 1.15 : 0, 0); break; }
        if (b.kind === 'pen') { _p.makeTranslation(0, (b as unknown as { shut?: number }).shut ? 0 : 1.1, 0); break; }
        if (p.axis === 'x') { _p.makeTranslation(Math.sin(ph * p.speed * 2) * (p.amp ?? 0.5), 0, 0); break; }
        const c = (ph * p.speed) % 1; _p.makeTranslation(0, -(c < 0.3 ? c / 0.3 : c < 0.5 ? 1 : 1 - (c - 0.5) / 0.5) * (p.amp ?? 0.3), 0); break;
      }
    }
    void k;
    // pivot
    const pv = p.pivot;
    _p.premultiply(new THREE.Matrix4().makeTranslation(pv[0], pv[1], pv[2]));
    _p.premultiply(_m);
  }
  update(dt: number) {
    this.t += dt; MU.uTime.value = this.f.time;
    if (this.beltsDirty) this.rebatchBelts();
    const blink = Math.floor(this.t * 2.5) % 2 === 0;
    const hiddenSet = new Set<FBuilding>(); if (this.sel) hiddenSet.add(this.sel); if (this.hover) hiddenSet.add(this.hover);
    for (const [key, bt] of this.batches) {
      const list = bt.list;
      bt.ensure(list.length);
      const rising = list.some((b) => b.rise < 1) || bt.dirty || list.some((b) => hiddenSet.has(b)) || (bt as unknown as { hadHidden?: boolean }).hadHidden;
      (bt as unknown as { hadHidden?: boolean }).hadHidden = list.some((b) => hiddenSet.has(b));
      const parts = this.parts.get(key) ?? [];
      for (const pb of parts) pb.ensure(list.length);
      const sa = bt.state.array as Float32Array, ba = bt.belt.array as Float32Array;
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (rising || parts.length) { this.base(b, hiddenSet.has(b)); if (rising) bt.mesh.setMatrixAt(i, _m); }
        // status lamp: steady green working, blinking amber / rust / red when something is wrong
        const st = b.status;
        _c.setHex(STATUS_COL[st]);
        const on = st === 'working' || st === 'idle' || st === 'offline' || blink ? 1 : 0.15;
        sa[i * 4] = _c.r * on; sa[i * 4 + 1] = _c.g * on; sa[i * 4 + 2] = _c.b * on; sa[i * 4 + 3] = b.work;
        ba[i] = isBelt(b.kind) && b.kind !== 'pipe' ? (b.def.belt ?? 0.3) : 0;
        for (let k = 0; k < parts.length; k++) {
          const pd = this.modelOf(b).parts[k];
          if (hiddenSet.has(b)) { parts[k].mesh.setMatrixAt(i, _p.makeScale(0, 0, 0)); continue; }
          this.partMatrix(b, pd, k);
          parts[k].mesh.setMatrixAt(i, _p);
        }
      }
      bt.mesh.count = list.length; bt.state.needsUpdate = true; bt.belt.needsUpdate = true;
      if (rising) bt.mesh.instanceMatrix.needsUpdate = true;
      bt.dirty = false;
      for (const pb of parts) { pb.mesh.count = list.length; pb.mesh.instanceMatrix.needsUpdate = true; }
    }
    this.highlight();
    this.drawItems();
    if (this.cablesDirty) this.drawCables();
  }
  /** the selected and hovered buildings, drawn singly so the post pass rims them */
  private highlight() {
    const want: [FBuilding, number][] = [];
    if (this.sel) want.push([this.sel, 1 + F_SEL]);
    if (this.hover && this.hover !== this.sel) want.push([this.hover, 1 + F_HOVER]);
    while (this.hi.length < want.length) {
      const flag = { value: 1 };
      const m = machineMaterial(flag); (m as unknown as { __flag: { value: number } }).__flag = flag;
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), m); mesh.castShadow = true;
      this.group.add(mesh); this.hi.push(mesh);
    }
    this.hi.forEach((mesh, i) => {
      const w = want[i];
      if (!w) { mesh.visible = false; return; }
      const [b, flag] = w;
      const geo = isBelt(b.kind) ? beltGeo(b.shape, b.kind === 'pipe') : this.modelOf(b).base;
      if (mesh.geometry !== geo) mesh.geometry = geo;
      (mesh.material as unknown as { __flag: { value: number } }).__flag.value = flag;
      this.base(b, false); mesh.matrixAutoUpdate = false; mesh.matrix.copy(_m); mesh.visible = true;
    });
  }
  private drawItems() {
    let n = 0;
    const need = (k: number) => {
      if (k <= this.itemCap) return;
      while (this.itemCap < k) this.itemCap *= 2;
      const g = this.items.geometry;
      this.itemAttr = new THREE.InstancedBufferAttribute(new Float32Array(this.itemCap), 1); this.itemAttr.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('aItem', this.itemAttr);
      const mesh = new THREE.InstancedMesh(g, this.itemMat, this.itemCap);
      mesh.frustumCulled = false; mesh.castShadow = true;
      this.items.removeFromParent(); this.items.dispose(); this.items = mesh; this.group.add(mesh);
    };
    let total = this.extra.length;
    for (const b of this.f.buildings) total += b.items.length;
    need(total + 8);
    if (this.itemU.uIcons.value !== iconArray()) this.itemU.uIcons.value = iconArray();
    const ia = this.itemAttr.array as Float32Array;
    for (const b of this.f.buildings) {
      if (!b.items.length || b.kind === 'pipe') continue;
      const r = -(b.r & 3) * Math.PI / 2, cs = Math.cos(r), sn = Math.sin(r);
      const belt = isBelt(b.kind);
      const yi = (b as unknown as { yIn: number }).yIn ?? b.y, yo = (b as unknown as { yOut: number }).yOut ?? b.y;
      for (const it of b.items) {
        let lx = 0, lz = 0, hx = 0, hz = 1, y = b.y + 0.62;
        if (belt) { const P = beltPath(b.shape, Math.min(1, it.t)); lx = P[0]; lz = P[1]; hx = P[2]; hz = P[3]; y = yi + (yo - yi) * it.t + 0.4; }
        else if (b.kind === 'lift') y = b.y + 1.9;
        const wx = b.x + lx * cs + lz * sn, wz = b.z - lx * sn + lz * cs;
        const yaw = Math.atan2(hx * cs + hz * sn, -hx * sn + hz * cs);
        _q.setFromAxisAngle(AX.y, yaw);
        _m.compose(_v.set(wx, y, wz), _q, _s.set(1, 1, 1));
        this.items.setMatrixAt(n, _m); ia[n] = ITEM_INDEX[it.id] ?? 0; n++;
      }
    }
    for (const e of this.extra) {
      _q.setFromAxisAngle(AX.y, e.yaw);
      _m.compose(_v.set(e.x, e.y, e.z), _q, _s.set(1.2, 1.2, 1.2));
      this.items.setMatrixAt(n, _m); ia[n] = ITEM_INDEX[e.id] ?? 0; n++;
    }
    this.items.count = n;
    this.items.instanceMatrix.needsUpdate = true; this.itemAttr.needsUpdate = true;
    void ITEM_IDS;
  }
  /** cables sag between pole tops, and drop from a pole to each machine it powers */
  private drawCables() {
    const f = this.f, pts: number[] = [], core = f.g.veyr.core;
    const top = (b: FBuilding | null): [number, number, number] => b ? (b.kind === 'pole' ? [b.x, b.y + 2.9, b.z] : [b.x, b.y + FDEFS[b.kind].h * 0.85, b.z]) : core ? [core.x, core.y + 1.6, core.z] : [0, 0, 0];
    const sag = (a: [number, number, number], c: [number, number, number], k: number) => {
      const n = 8, L = Math.hypot(c[0] - a[0], c[2] - a[2]);
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const y = (t: number) => a[1] + (c[1] - a[1]) * t - Math.sin(t * Math.PI) * L * k;
        pts.push(a[0] + (c[0] - a[0]) * t0, y(t0), a[2] + (c[2] - a[2]) * t0, a[0] + (c[0] - a[0]) * t1, y(t1), a[2] + (c[2] - a[2]) * t1);
      }
    };
    for (const [a, b] of f.links) sag(top(a), top(b), 0.05);
    for (const b of f.buildings) {
      if (!b.def.power || !b.grid || b.kind === 'pole') continue;
      const plug = (b as unknown as { plug?: FBuilding | null }).plug;
      if (plug === undefined) continue;
      sag(top(plug), top(b), 0.04);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.cables.geometry.dispose(); this.cables.geometry = g;
    this.cablesDirty = false;
  }
}
