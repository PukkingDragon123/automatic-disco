// EMPIRE · THE PLANET MAP. The whole world in one painted equirectangular sheet (longitude across, latitude down), in
// the planet's own biome colours: relief hill-shaded from the upper left in clustered dithered steps, seas by depth
// with pale shallows, ranges with snow, polar ice; the regions' frontiers wander (geo.ts warp). Over it: the
// TERRITORY (a wash in the holder's colour and a hard border where holders change: the empire gold, the Concord
// orange, the Consortium teal), unsurveyed ground under painted cloud, the region names, your SETTLEMENTS as tier
// glyphs with their names, the rival bases as their emblems, ROADS (dashed ochre) and RAIL (steel with ties) along
// great circles, and the CONVOYS, trains, settler wagons and pods moving along them. Drag sideways to turn the globe;
// hover for a card; click a region or a settlement to pick it.
import type { Empire } from './empire';
import type { PRegion } from '../world/planet';
import { BIOME_COL } from '../world/planet';
import { BIOMES } from '../world/region';
import { Px, P, INK, hex, hash, mixHex } from '../ui/kit/px';
import { bitText, bitMeasure } from '../ui/kit/bitfont';
import { showTip, hideTip, type TipContent } from '../ui/kit/panel';
import { uiSfx } from '../ui/kit/sound';
import { dirOf, regionAt, relief, slerp, lonLat, km, isSea, type V3 } from './geo';
import { tierGlyph, blocGlyph, unitGlyph, glyphCv } from './glyphs';
import { TIER_NAME, BLOC_COL, BLOC_SHORT, LINK_RULE, relationWord, type SettlementData, type BlocId } from './types';
import { ITEMS } from '../factory/items';

const S = 2; // css px per art px
const WARM = 0xfff0c8, COOL = 0x1a1530;
const rampOf = (c: number) => [-3, -2, -1, 0, 1, 2, 3].map((k) => (k < 0 ? mixHex(c, COOL, 0.15 * -k) : k > 0 ? mixHex(c, WARM, 0.12 * k) : c));
const at = (r: number[], i: number) => r[Math.max(0, Math.min(r.length - 1, Math.round(i)))];

interface Base { W: number; H: number; px: Px; reg: Int8Array; gap: Float32Array; cv: HTMLCanvasElement }
const bases = new Map<string, Base>();
/** the planet painted at W x H art px (cached) */
function paintBase(e: Empire, W: number, H: number): Base {
  const p = e.planet, key = `${p.seed}|${W}x${H}`;
  const hit = bases.get(key); if (hit) return hit;
  const N = W * H, reg = new Int8Array(N), gap = new Float32Array(N), hgt = new Float32Array(N), d: V3 = [0, 0, 0];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    dirOf(((x + 0.5) / W) * Math.PI * 2 - Math.PI, (0.5 - (y + 0.5) / H) * Math.PI, d);
    const [a, , g] = regionAt(p, d), i = y * W + x;
    reg[i] = a; gap[i] = g;
    const r = p.regions[a], h = relief(p.seed, d);
    // sea regions are mostly water with islands; land regions mostly land with lakes and inlets
    hgt[i] = isSea(r) ? h - 0.32 : h + 0.42 + (r.danger - 2) * 0.05;
  }
  const px = new Px(W, H), sea = (i: number) => hgt[i] < 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, r = p.regions[reg[i]], h = hgt[i], lat = Math.abs(0.5 - (y + 0.5) / H) * 2;
    const hl = hgt[Math.max(0, y - 1) * W + Math.max(0, x - 1)];
    const light = (hl - h) * -9;
    const n = hash(x >> 1, y >> 1, 3) * 0.5 + hash(x >> 2, y >> 2, 5) * 0.5;
    if (sea(i)) {
      // water by depth: deep slate-teal to pale shallows, a foam lip on the coast
      let coast = false; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = (x + dx + W) % W, Y = Math.max(0, Math.min(H - 1, y + dy)); if (!sea(Y * W + X)) coast = true; }
      const k = Math.max(0, Math.min(6, 4.6 + h * 9 + (n - 0.5) * 1.1));
      px.set(x, y, coast ? P.water[6] : lat > 0.9 ? at([...P.snow], 2 + n * 2) : P.water[Math.round(k)]);
      continue;
    }
    const base = BIOME_COL[r.biome] ?? 0x5e7a40, ramp = rampOf(base);
    let lv = 3 + light * 1.4 + (h - 0.4) * 2.2 + (n - 0.5) * 0.9;
    let col = at(ramp, lv);
    const mountainous = r.biome === 'highland' || r.biome === 'tundra' || r.biome === 'crystal' || r.biome === 'ashland';
    if (h > (mountainous ? 0.62 : 0.84)) { const st = rampOf(r.biome === 'ashland' ? P.basalt[4] : P.stone[4]); col = at(st, 3 + light * 1.8 + (n - 0.5)); if (h > (mountainous ? 0.78 : 0.95) || lat > 0.72) col = at([...P.snow], 3 + light * 1.5 + n); }
    if (lat > 0.86) col = at([...P.snow], 3.5 + light + n * 0.8);
    // a few greener or drier patches inside each biome
    if (hash(x >> 3, y >> 3, r.id) > 0.82) { lv += 0.6; col = mixHex(col, r.biome === 'desert' || r.biome === 'savanna' ? P.sand[4] : P.moss[4], 0.25); }
    px.set(x, y, col);
  }
  const b: Base = { W, H, px, reg, gap, cv: px.canvas() };
  bases.set(key, b); if (bases.size > 4) bases.delete(bases.keys().next().value as string);
  return b;
}

export interface MapPick { region: number | null; settlement: SettlementData | null }

export class PlanetMap {
  readonly cv: HTMLCanvasElement; private c: CanvasRenderingContext2D;
  private base: Base | null = null; private terr: HTMLCanvasElement | null = null; private terrKey = '';
  private lon0 = 0; private drag: { x: number; lon: number; moved: boolean } | null = null;
  private hover: { x: number; y: number } | null = null; hot: MapPick = { region: null, settlement: null };
  sel: MapPick = { region: null, settlement: null };
  /** when set, the next settlement clicked is the other end of a new road */
  linkFrom: SettlementData | null = null;
  onPick: (p: MapPick) => void = () => {};
  onLink: (a: SettlementData, b: SettlementData) => void = () => {};
  private t = 0; private tipKey = ''; private tipT = 0;
  /** the tallest the sheet may be (css px); the width follows the parent */
  maxH = 500;
  constructor(readonly e: Empire) {
    const cv = this.cv = document.createElement('canvas'); cv.className = 'emp-map-cv';
    this.c = cv.getContext('2d')!;
    cv.addEventListener('pointerdown', (ev) => { if (ev.button !== 0) return; this.drag = { x: ev.clientX, lon: this.lon0, moved: false }; cv.setPointerCapture(ev.pointerId); });
    cv.addEventListener('pointermove', (ev) => {
      const r = cv.getBoundingClientRect(); this.hover = { x: ev.clientX - r.left, y: ev.clientY - r.top };
      const d = this.drag;
      if (d) { if (!d.moved && Math.abs(ev.clientX - d.x) > 5) { d.moved = true; uiSfx('scroll', 0.3); } if (d.moved) { this.lon0 = d.lon - ((ev.clientX - d.x) / r.width) * Math.PI * 2; cv.style.cursor = 'grabbing'; } }
    });
    const up = () => { const d = this.drag; this.drag = null; cv.style.cursor = ''; if (d && !d.moved) this.click(); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', () => { this.drag = null; });
    cv.addEventListener('pointerleave', () => { this.hover = null; hideTip(); });
  }
  /** centre the map on a region */
  focus(region: number) { const r = this.e.region(region); if (r) this.lon0 = lonLat(r.c)[0]; }
  private click() {
    const h = this.hot;
    if (this.linkFrom) {
      if (h.settlement && h.settlement !== this.linkFrom) { const a = this.linkFrom; this.linkFrom = null; this.onLink(a, h.settlement); }
      else { this.linkFrom = null; uiSfx('back', 0.4); }
      return;
    }
    this.sel = { ...h }; uiSfx(h.region !== null ? 'select' : 'tick', 0.5);
    this.onPick(this.sel);
  }
  // ---------------------------------------------------------------- projection
  private get W() { return this.base?.W ?? 1; }
  private get H() { return this.base?.H ?? 1; }
  /** a direction to css px on the canvas (x wrapped into the sheet) */
  proj(d: readonly number[]): [number, number] {
    const [lon, lat] = lonLat(d), W = this.W * S, H = this.H * S;
    let x = (((lon - this.lon0) / (Math.PI * 2) + 0.5) % 1 + 1) % 1 * W;
    return [x, (0.5 - lat / Math.PI) * H];
  }
  private dirAt(x: number, y: number): V3 { const W = this.W * S, H = this.H * S; return dirOf((x / W - 0.5) * Math.PI * 2 + this.lon0, (0.5 - y / H) * Math.PI); }
  /** known ground: everything once the planet is surveyed, else your regions and their neighbours */
  known(region: number) {
    if (this.e.has('empire:map')) return true;
    return this.e.d.settlements.some((s) => s.region === region || this.e.adj[s.region]?.includes(region));
  }
  // ---------------------------------------------------------------- layers
  private territory(): HTMLCanvasElement {
    const e = this.e, b = this.base!, owners = e.planet.regions.map((r) => e.owner(r.id)), known = e.planet.regions.map((r) => this.known(r.id));
    const key = owners.join(',') + '|' + known.join('') + '|' + b.W;
    if (this.terr && key === this.terrKey) return this.terr;
    this.terrKey = key;
    const { W, H, reg, gap } = b, p = new Px(W, H);
    const colOf = (o: string | null) => (o === 'you' ? BLOC_COL.you : o === 'soviet' ? BLOC_COL.soviet : o === 'prc' ? BLOC_COL.prc : -1);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, ri = reg[i];
      if (!known[ri]) {
        // unsurveyed: painted cloud with lit tops
        const n = hash(x >> 2, y >> 2, 11) * 0.6 + hash(x >> 1, y >> 1, 13) * 0.4, top = hash(x >> 2, (y - 1) >> 2, 11) < n - 0.15;
        p.set(x, y, top ? P.snow[4] : n > 0.55 ? P.slate[5] : n > 0.3 ? P.slate[4] : P.slate[3], 238);
        continue;
      }
      const o = owners[ri], c = colOf(o);
      // the frontier: where the region changes within a pixel or two
      let edge = false, other = -1;
      if (gap[i] < 0.02) for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) { const X = (x + dx + W) % W, Y = Math.max(0, Math.min(H - 1, y + dy)); const rj = reg[Y * W + X]; if (rj !== ri) { edge = true; other = rj; break; } }
      if (edge) {
        const oc = owners[other];
        if (c >= 0 && oc !== o) { p.set(x, y, c); continue; }
        if (c < 0 && oc !== o) { p.set(x, y, INK, 120); continue; }
        // a region boundary inside one holder: a faint dotted line
        if ((x + y) % 3 === 0) p.set(x, y, c >= 0 ? mixHex(c, 0xffffff, 0.3) : 0xe8e0c8, 110);
        continue;
      }
      if (c >= 0) p.set(x, y, c, o === 'you' ? 58 : 40);
    }
    // the frontier gets an ink lip on the outside so it reads on any ground
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (p.alpha(x, y) > 200 || gap[i] > 0.03) continue;
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) { const X = (x + dx + W) % W, Y = Math.max(0, Math.min(H - 1, y + dy)); if (p.alpha(X, Y) >= 255 && reg[Y * W + X] !== reg[i]) { p.set(x, y, INK, 170); break; } }
    }
    this.terr = p.canvas();
    return this.terr;
  }
  // ---------------------------------------------------------------- frame
  draw(dt: number) {
    this.t += dt;
    const cv = this.cv, wcss = Math.max(200, cv.parentElement?.clientWidth ?? 800), hcss = Math.max(100, this.maxH);
    const W = Math.max(100, Math.floor(Math.min(wcss, hcss * 2) / S / 4) * 4), H = W / 2;
    if (!this.base || this.base.W !== W) { this.base = paintBase(this.e, W, H); this.terr = null; }
    const CW = W * S, CH = H * S;
    if (cv.width !== CW || cv.height !== CH) { cv.width = CW; cv.height = CH; cv.style.width = CW + 'px'; cv.style.height = CH + 'px'; }
    const c = this.c; c.imageSmoothingEnabled = false;
    const off = (((this.lon0 / (Math.PI * 2)) % 1) + 1) % 1 * CW;
    const sheet = (img: HTMLCanvasElement) => { c.drawImage(img, -off, 0, CW, CH); c.drawImage(img, CW - off, 0, CW, CH); };
    sheet(this.base.cv); sheet(this.territory());
    // the graticule: every 30 degrees, faint
    c.fillStyle = 'rgba(8,9,12,0.16)';
    for (let k = 1; k < 6; k++) c.fillRect(0, Math.round((k / 6) * CH), CW, 1);
    for (let k = 0; k < 12; k++) { const x = Math.round(((k / 12) * CW - off + CW) % CW); c.fillRect(x, 0, 1, CH); }
    this.hitTest();
    this.drawLinks(); this.drawRivals(); this.drawConvoys(); this.drawSettlements(); this.drawLabels();
    this.drawHover();
  }
  private seg(a: readonly number[], b: readonly number[], n: number, fn: (pts: [number, number][]) => void) {
    // a great-circle polyline, split where it crosses the sheet's seam
    let run: [number, number][] = [], last: [number, number] | null = null;
    for (let i = 0; i <= n; i++) { const p = this.proj(slerp(a, b, i / n)); if (last && Math.abs(p[0] - last[0]) > this.W * S * 0.5) { if (run.length > 1) fn(run); run = []; } run.push(p); last = p; }
    if (run.length > 1) fn(run);
  }
  private poly(pts: [number, number][], w: number, col: string, dash: number[] = []) {
    const c = this.c; c.strokeStyle = col; c.lineWidth = w; c.setLineDash(dash); c.lineCap = 'butt'; c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(Math.round(x) + 0.5, Math.round(y) + 0.5) : c.moveTo(Math.round(x) + 0.5, Math.round(y) + 0.5))); c.stroke(); c.setLineDash([]);
  }
  private drawLinks() {
    const e = this.e;
    for (const l of e.d.links) {
      const A = e.settlement(l.a), B = e.settlement(l.b); if (!A || !B) continue;
      const a = e.region(A.region)!.c, b = e.region(B.region)!.c, n = Math.max(8, Math.round(km(e.planet, A.region, B.region) / 120));
      this.seg(a, b, n, (pts) => {
        this.poly(pts, 6, hex(INK));
        if (l.kind === 'rail') { this.poly(pts, 4, hex(P.steel[5])); this.poly(pts, 2, hex(P.sapphire[5]), [2, 6]); }
        else this.poly(pts, 3, hex(P.ochre[5]), [6, 4]);
      });
      if (l.built < 1) {
        // the crews' progress: the finished part solid gold, the rest dotted
        const done = slerp(a, b, l.built);
        this.seg(a, done, Math.max(2, Math.round(n * l.built)), (pts) => this.poly(pts, 3, hex(P.gold[5])));
        this.seg(done, b, Math.max(2, Math.round(n * (1 - l.built))), (pts) => this.poly(pts, 3, 'rgba(240,230,200,0.9)', [2, 5]));
        const [x, y] = this.proj(done); this.c.fillStyle = hex(P.gold[6]); this.c.fillRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6);
      }
    }
    // a road being drawn from a settlement to the pointer
    if (this.linkFrom && this.hover) {
      const a = e.region(this.linkFrom.region)!.c, [x0, y0] = this.proj(a), tgt = this.hot.settlement;
      const [x1, y1] = tgt ? this.proj(e.region(tgt.region)!.c) : [this.hover.x, this.hover.y];
      this.poly([[x0, y0], [x1, y1]], 3, tgt && tgt !== this.linkFrom ? hex(P.gold[6]) : 'rgba(240,230,200,0.8)', [6, 4]);
    }
  }
  private drawRivals() {
    const e = this.e, c = this.c;
    for (const r of e.planet.regions) {
      if (!this.known(r.id)) continue;
      const bs = e.rivalsIn(r.id); if (!bs.length) continue;
      const [x, y] = this.proj(r.c);
      bs.forEach((b, i) => {
        const g = glyphCv(blocGlyph(b, 1)), mine = !!e.settlementAt(r.id);
        const ox = mine ? 26 + i * 22 : (i - (bs.length - 1) / 2) * 24, oy = mine ? -10 : 0;
        const war = e.bloc(b).treaty === 'war';
        if (war && Math.floor(this.t * 3) % 2) { c.fillStyle = 'rgba(255,60,40,0.5)'; c.fillRect(Math.round(x + ox - g.width), Math.round(y + oy - g.height), g.width * 2, g.height * 2); }
        c.drawImage(g, Math.round(x + ox - g.width), Math.round(y + oy - g.height), g.width * 2, g.height * 2);
      });
    }
  }
  private convoyAt(cv: (typeof this.e.d.convoys)[number]): [number, number] | null {
    const e = this.e, k = Math.max(0, Math.min(1, cv.t / Math.max(1, cv.dur)));
    if (cv.kind === 'drop' && cv.region !== undefined) { const [x, y] = this.proj(e.region(cv.region)!.c); return [x, y - (1 - k) * (y + 30)]; }
    if (cv.kind === 'settlers' && cv.region !== undefined) { const A = e.settlement(cv.from); if (!A) return null; return this.proj(slerp(e.region(A.region)!.c, e.region(cv.region)!.c, k)); }
    if (cv.kind === 'deal') { const B = e.settlement(cv.to); if (!B) return null; const [x, y] = this.proj(e.region(B.region)!.c); return [x + (1 - k) * 160, y - (1 - k) * 60]; }
    const p = e.path(cv.from, cv.to); if (!p) return null;
    let want = p.km * k;
    for (let i = 0; i < p.ids.length - 1; i++) {
      const A = e.settlement(p.ids[i])!, B = e.settlement(p.ids[i + 1])!, L = km(e.planet, A.region, B.region);
      if (want <= L || i === p.ids.length - 2) return this.proj(slerp(e.region(A.region)!.c, e.region(B.region)!.c, Math.min(1, want / Math.max(1, L))));
      want -= L;
    }
    return null;
  }
  private drawConvoys() {
    const c = this.c;
    for (const cv of this.e.d.convoys) {
      const p = this.convoyAt(cv); if (!p) continue;
      let kind: 'convoy' | 'train' | 'pod' | 'settlers' | 'deal' = cv.kind === 'drop' ? 'pod' : cv.kind === 'settlers' ? 'settlers' : cv.kind === 'deal' ? 'deal' : 'convoy';
      if (cv.kind === 'trade') { const pa = this.e.path(cv.from, cv.to); if (pa?.kind === 'rail') kind = 'train'; }
      const g = glyphCv(unitGlyph(kind, 1)), bob = Math.round(Math.sin(this.t * 6 + cv.id) * 1);
      if (kind === 'pod') { c.fillStyle = 'rgba(255,200,120,0.5)'; c.fillRect(Math.round(p[0]) - 1, Math.round(p[1]) - 26, 2, 22); }
      c.drawImage(g, Math.round(p[0] - g.width), Math.round(p[1] - g.height) + bob, g.width * 2, g.height * 2);
    }
  }
  private drawSettlements() {
    const e = this.e, c = this.c;
    for (const s of e.d.settlements) {
      const [x, y] = this.proj(e.region(s.region)!.c), g = glyphCv(tierGlyph(s.tier, 1));
      const hot = this.hot.settlement === s || this.sel.settlement === s;
      if (e.isLive(s)) { const k = (this.t % 1.6) / 1.6; c.strokeStyle = `rgba(255,224,140,${0.8 * (1 - k)})`; c.lineWidth = 2; c.beginPath(); c.arc(Math.round(x), Math.round(y), 14 + k * 26, 0, Math.PI * 2); c.stroke(); }
      if (hot) { c.fillStyle = 'rgba(255,230,160,0.25)'; c.beginPath(); c.arc(Math.round(x), Math.round(y), 24, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = 'rgba(5,6,8,0.45)'; c.fillRect(Math.round(x - g.width * 0.8), Math.round(y + g.height - 2), Math.round(g.width * 1.6), 3);
      const sc = hot ? 3 : 2;
      c.drawImage(g, Math.round(x - (g.width * sc) / 2), Math.round(y - g.height * sc + g.height), g.width * sc, g.height * sc);
      if (s.id === e.d.seat) { const st = glyphCv(blocGlyph('you', 1)); c.drawImage(st, Math.round(x - g.width * sc / 2 - st.width * 2), Math.round(y - g.height * sc + g.height - 4), st.width * 2, st.height * 2); }
    }
  }
  private drawLabels() {
    const e = this.e, c = this.c;
    for (const r of e.planet.regions) {
      if (!this.known(r.id)) continue;
      const [x, y] = this.proj(r.c), s = e.settlementAt(r.id);
      if (s) {
        const t = s.name.toUpperCase(), w = bitMeasure(t);
        bitText(c, t, Math.round(x - w / 2), Math.round(y + 18), { color: '#ffe7a8' });
        const t2 = `${TIER_NAME[s.tier].toUpperCase()} · ${Math.round(s.pop)} POP`, w2 = bitMeasure(t2);
        bitText(c, t2, Math.round(x - w2 / 2), Math.round(y + 34), { color: '#c8d4c0' });
      } else {
        const t = r.name.toUpperCase(), w = bitMeasure(t);
        bitText(c, t, Math.round(x - w / 2), Math.round(y + 12), { color: isSea(r) ? '#bfe4e0' : '#efe4c4' });
      }
    }
  }
  private hitTest() {
    const h = this.hover; const prev = this.hot;
    if (!h || this.drag?.moved) { this.hot = { region: null, settlement: null }; return; }
    let best: SettlementData | null = null, bd = 22;
    for (const s of this.e.d.settlements) { const [x, y] = this.proj(this.e.region(s.region)!.c); const d = Math.hypot(x - h.x, y - (h.y + 6)); if (d < bd) { bd = d; best = s; } }
    const [ri] = regionAt(this.e.planet, this.dirAt(h.x, h.y));
    this.hot = { region: best ? best.region : ri, settlement: best };
    if (prev.region !== this.hot.region || prev.settlement !== this.hot.settlement) uiSfx('hover', 0.25);
    this.cv.style.cursor = this.drag?.moved ? 'grabbing' : this.linkFrom ? (best ? 'pointer' : 'crosshair') : 'pointer';
  }
  private drawHover() {
    const h = this.hover, c = this.c;
    const sr = this.sel.region !== null ? this.e.region(this.sel.region) : null;
    if (sr) this.ringRegion(sr, P.gold[6], 2);
    if (!h) return;
    const r = this.hot.region !== null ? this.e.region(this.hot.region) : null;
    if (r && r !== sr) this.ringRegion(r, 0xf0ead0, 1);
    // the card is rebuilt when the pointer finds something new (or twice a second), placed by the pointer
    const rect = this.cv.getBoundingClientRect(), key = `${this.hot.region}|${this.hot.settlement?.id}|${!!this.linkFrom}|${Math.round(h.x / 8)}|${Math.round(h.y / 8)}`;
    if (key !== this.tipKey || this.t - this.tipT > 0.5) {
      this.tipKey = key; this.tipT = this.t;
      const tip = this.tipFor(this.hot);
      if (tip) showTip(tip, { x: rect.left + h.x, y: rect.top + h.y }); else hideTip();
    }
    void c;
  }
  private ringRegion(r: PRegion, col: number, w: number) {
    const [x, y] = this.proj(r.c), c = this.c, n = 28;
    c.fillStyle = hex(col);
    for (let i = 0; i < n; i++) { if (i % 2) continue; const a = (i / n) * Math.PI * 2 + this.t * 0.6; c.fillRect(Math.round(x + Math.cos(a) * 34), Math.round(y + Math.sin(a) * 34), w * 2, w * 2); }
  }
  /** the hover card: what this region or settlement is, in numbers */
  tipFor(p: MapPick): TipContent | null {
    const e = this.e;
    if (p.settlement) {
      const s = p.settlement, r = e.region(s.region)!, top = e.topProd(s, 3);
      return {
        title: s.name.toUpperCase(), sub: `${TIER_NAME[s.tier]} in ${r.name} · ${BIOMES[r.biome]?.name ?? r.biome}`,
        desc: e.isLive(s) ? 'You are here: this settlement is live.' : 'Runs on its own while you are elsewhere (abstract output and upkeep).',
        rows: [['Population', Math.round(s.pop)], ['Happiness', Math.round(s.happiness), '%'], ['Buildings', s.buildings], ['Food', s.food, 'meals'], ...top.map(([k, v]) => [ITEMS[k]?.name ?? k, `+${v}`, '/min'] as [string, string, string])],
        status: s.short.length ? [`Short of ${s.short.map((x) => ITEMS[x]?.name ?? x).join(', ')}`, 'warn'] : ['Nothing short', 'ok'],
        hint: this.linkFrom ? [['CLICK', `build a road from ${this.linkFrom.name}`]] : [['CLICK', 'open its card'], ['DRAG', 'turn the globe']],
      };
    }
    if (p.region === null) return null;
    const r = e.region(p.region)!;
    if (!this.known(r.id)) return { title: 'UNCHARTED', desc: 'Beyond your survey: learn PLANET SURVEY on the skill tree to chart every region.', status: ['Unknown ground', 'info'] };
    const near = e.d.settlements.map((s) => [s, km(e.planet, s.region, r.id)] as [SettlementData, number]).sort((a, b) => a[1] - b[1])[0];
    const rivals = e.rivalsIn(r.id);
    return {
      title: r.name.toUpperCase(), sub: `${BIOMES[r.biome]?.name ?? r.biome} · danger ${r.danger} of 3`,
      desc: rivals.length ? `Held by ${rivals.map((b) => `the ${BLOC_SHORT[b as BlocId]} (${relationWord(e.bloc(b as BlocId).relation)})`).join(' and ')}.` : 'No rival base holds this ground.',
      rows: [['Nearest settlement', near ? `${near[0].name}, ${near[1]}` : '-', near ? 'km' : undefined], ['Convoy reach', e.nearSettlements(r.id).length ? 'yes (borders yours)' : 'no (pod drop only)']],
      status: e.settlementAt(r.id) ? ['Your settlement', 'ok'] : ['Unsettled: click to plan an outpost', 'info'],
      hint: [['CLICK', 'pick this region'], ['DRAG', 'turn the globe']],
    };
  }
  /** the road / rail glossary line for the legend */
  static legend(): [string, string][] { return [['ROAD', LINK_RULE.road.desc], ['RAIL', LINK_RULE.rail.desc]]; }
}
