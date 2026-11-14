// What the player sees of the ecosystem:
//  - activity bubbles over the animals near the camera (hand-drawn pixel icons on paper bubbles: asleep, drinking,
//    alarm, courting, hungry, spent, threat display, nesting, a kill, searching for water, shade, on watch)
//  - the ECOLOGY OVERLAY ([H] cycles it): soil moisture, soil fertility (and poison), life (herd and hunter density,
//    danger, migration routes, lures), drawn on the ground as stepped bands in the master palette with contour lines
//    where the bands change, like a hand-inked survey map, plus a typed legend slip
//  - the FIELD SURVEY sheet ([M]): a typed census form (species, role, schedule, count with a stepped trend graph,
//    births and deaths, a rubber-stamped status), the water stage, the season, the land, and field notes
//  - a few toasts for the big turns (drought, floods, a species gone), a typed slip over a newborn now and then
// Built once per Game (game.ts calls attachEco); it runs inside the game's update$ list.
import type { Game } from '../game/game';
import { GOLEM_REF, Emote, type Creature } from '../game/creature';
import type { Eco, EcoNote, CensusRow } from './eco';
import { CS } from './eco';
import { RAMPS } from '../art/palette';
import { S, el, toast } from '../ui/kit';
import { textSprite, floatText } from '../ui/floatText';
import { clamp } from '../core/rand';

export type OverlayMode = 'off' | 'water' | 'soil' | 'life';
const MODES: OverlayMode[] = ['off', 'water', 'soil', 'life'];
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

// ------------------------------------------------------------------------------------------------ the icons
// '#' outline ink, 'a' light, 'b' mid, 'c' dark (the icon's own ramp), '.' clear
const ICON: Record<number, { m: string[]; ramp: readonly number[]; idx: [number, number, number] }> = {
  [Emote.DRINK]: { ramp: RAMPS.water, idx: [6, 4, 2], m: ['...#...', '..#a#..', '.#aab#.', '#aabbb#', '#abbbc#', '.#bbc#.', '..###..'] },
  [Emote.ALARM]: { ramp: RAMPS.stampRed, idx: [3, 2, 1], m: ['.##.', '#ab#', '#ab#', '#ab#', '.##.', '....', '.##.', '.##.'] },
  [Emote.LOVE]: { ramp: RAMPS.coral, idx: [5, 4, 2], m: ['.##.##.', '#aa#ab#', '#aaabb#', '.#abb#.', '..#b#..', '...#...'] },
  [Emote.HUNGRY]: { ramp: RAMPS.moss, idx: [5, 4, 2], m: ['....##.', '...#aa#', '..#aab#', '.#abb#.', '.#bc#..', '#.##...', '#......'] },
  [Emote.TIRED]: { ramp: RAMPS.water, idx: [6, 4, 2], m: ['#.#....', '.......', '#.#..#.', '....#a#', '...#ab#', '...#bc#', '....##.'] },
  [Emote.ANGRY]: { ramp: RAMPS.stampRed, idx: [3, 2, 1], m: ['.#...#.', '#a...a#', '.......', '.......', '.......', '#a...a#', '.#...#.'] },
  [Emote.NEST]: { ramp: RAMPS.bone, idx: [5, 4, 2], m: ['.###.', '#aab#', '#aab#', '#abb#', '#abc#', '.###.'] },
  [Emote.FOOD]: { ramp: RAMPS.bone, idx: [5, 4, 2], m: ['##.....##', '#a#####a#', '.#aaabbb#.', '#a#####b#', '##.....##'] },
  [Emote.SEARCH]: { ramp: RAMPS.ink, idx: [2, 1, 0], m: ['.###.', '#...#', '....#', '..##.', '..#..', '.....', '..#..'] },
  [Emote.SHADE]: { ramp: RAMPS.moss, idx: [5, 4, 2], m: ['.#####.', '#aaaab#', '#abbbc#', '.#####.', '...#...', '...#...', '..###..'] },
  [Emote.WATCH]: { ramp: RAMPS.ochre, idx: [5, 3, 1], m: ['..###..', '.#aba#.', '#ab#ba#', '.#aba#.', '..###..'] },
};
const ZB = ['#####', '...#.', '..#..', '.#...', '#####'], ZS = ['###', '.#.', '###'];

function maskCanvas(m: string[], px: number, col: Record<string, string>) {
  const w = Math.max(...m.map((r) => r.length)), h = m.length;
  const cv = document.createElement('canvas'); cv.width = w * px; cv.height = h * px;
  const g = cv.getContext('2d')!;
  m.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const k = col[r[x]]; if (!k) continue; g.fillStyle = k; g.fillRect(x * px, y * px, px, px); } });
  return cv;
}
/** a paper bubble with a tail, the icon inside */
function bubble(e: Emote, px: number): HTMLCanvasElement {
  const ic = ICON[e];
  const iw = Math.max(...ic.m.map((r) => r.length)), ih = ic.m.length;
  const W = iw + 6, H = ih + 5, T = 3;
  const cv = document.createElement('canvas'); cv.width = W * px; cv.height = (H + T) * px;
  const g = cv.getContext('2d')!;
  const ink = hex(RAMPS.ink[1]), paper = hex(RAMPS.paper[4]), lo = hex(RAMPS.paper[2]);
  const P = (x: number, y: number, c: string) => { g.fillStyle = c; g.fillRect(x * px, y * px, px, px); };
  // body: chamfered corners, a shadow along the bottom and right inside edge
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const corner = (x < 2 && y < 2 && x + y < 2) || (x > W - 3 && y < 2 && W - 1 - x + y < 2) || (x < 2 && y > H - 3 && x + H - 1 - y < 2) || (x > W - 3 && y > H - 3 && W - 1 - x + H - 1 - y < 2);
    if (corner) continue;
    const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1 || (x === 1 && (y === 1 || y === H - 2)) || (x === W - 2 && (y === 1 || y === H - 2));
    P(x, y, edge ? ink : (x === W - 2 || y === H - 2) ? lo : paper);
  }
  // the tail, pointing down to the speaker
  P(2, H - 1, paper); P(3, H - 1, paper); P(1, H - 1, ink); P(4, H - 1, ink);
  P(2, H, paper); P(1, H, ink); P(3, H, ink); P(1, H + 1, ink); P(2, H + 1, ink); P(0, H + 2, ink);
  const col = { '#': ink, a: hex(ic.ramp[ic.idx[0]]), b: hex(ic.ramp[ic.idx[1]]), c: hex(ic.ramp[ic.idx[2]]) };
  g.drawImage(maskCanvas(ic.m, px, col), 3 * px, 2 * px + Math.floor((H - 4 - ih) / 2) * px);
  return cv;
}

// ------------------------------------------------------------------------------------------------ the view
export class EcoView {
  readonly eco: Eco;
  private cv: HTMLCanvasElement; private g: CanvasRenderingContext2D;
  private lo: HTMLCanvasElement; private lg: CanvasRenderingContext2D;
  mode: OverlayMode = 'off';
  private bubbles = new Map<string, HTMLCanvasElement>();
  private zz = new Map<number, HTMLCanvasElement>();
  private legend = new Map<string, HTMLCanvasElement>();
  private sheet: HTMLElement | null = null; private sheetT = 0;
  private lastT = 0; private toastT = -1e9; private birthT = -1e9;
  private vx: Float32Array; private vy: Float32Array; private vok: Uint8Array;
  private errs = 0;

  constructor(readonly game: Game) {
    this.eco = game.world.eco;
    (game as unknown as { eco: Eco }).eco = this.eco;
    (game as unknown as { ecoView: EcoView }).ecoView = this;
    this.cv = el('canvas', 'overlay2d eco-ov', document.body);
    this.g = this.cv.getContext('2d')!;
    this.lo = document.createElement('canvas'); this.lg = this.lo.getContext('2d')!;
    const G1 = this.eco.G + 1;
    this.vx = new Float32Array(G1 * G1); this.vy = new Float32Array(G1 * G1); this.vok = new Uint8Array(G1 * G1);
    // the factory's buildings are structures the wildlife keeps clear of
    this.eco.structures = () => ((game as unknown as { factory?: { buildings?: { x: number; z: number }[] } }).factory?.buildings ?? []);
    this.eco.onNote = (n) => this.noted(n);
    const wh = game.world.hooks, prev = wh.onBirth;
    wh.onBirth = (kid, par, nsp) => { prev?.(kid, par, nsp); if (kid.faction === 'wild') this.born(kid); };
    const off = game.input.onKey((e) => this.key(e));
    game.update$.push((dt) => { try { this.update(dt); } catch (err) { if (this.errs++ < 5) console.error('eco view', err); } });
    // hide when the game is not on screen (lab, tree, menus) and clean up when it is gone
    const watch = () => {
      if ((window as unknown as { __game?: Game }).__game !== game && performance.now() - this.lastT > 3000) { this.cv.remove(); this.sheet?.remove(); off(); return; }
      // the game hides its HUD when another screen (lab, tree, menu) is over it
      const on = game.hud.root.style.display !== 'none';
      this.cv.style.display = on ? '' : 'none';
      if (this.sheet) this.sheet.style.display = on ? '' : 'none';
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
    injectStyle();
  }

  // ---------------------------------------------------------------- controls
  setOverlay(m: OverlayMode) { this.mode = m; }
  cycleOverlay() {
    this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
    toast(this.mode === 'off' ? 'Ecology overlay off' : `Ecology overlay: <b>${LEG[this.mode].title}</b> &middot; [H] next`, 'info', 1600);
  }
  toggleSurvey(on = !this.sheet) {
    if (!on) { this.sheet?.remove(); this.sheet = null; return; }
    if (this.sheet) return;
    this.sheet = el('div', 'eco-sheet', document.body);
    this.sheet.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.sheetT = 0; this.fillSheet();
  }
  private key(e: KeyboardEvent) {
    if (this.game.hud.root.style.display === 'none' || e.ctrlKey || e.metaKey || e.repeat) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    // H and M (with no units selected: then they are the Hold and Move commands)
    if (this.game.sel.some((c) => c.faction === 'veyr' && !c.dead)) return;
    const k = e.key.toLowerCase();
    if (k === 'h') this.cycleOverlay();
    else if (k === 'm') this.toggleSurvey();
  }

  // ---------------------------------------------------------------- per frame
  private update(dt: number) {
    const g = this.game;
    this.lastT = performance.now();
    // the weather waters the land
    this.eco.rain = (g as unknown as { details?: { raining: number } }).details?.raining ?? 0;
    const W = innerWidth, H = innerHeight;
    if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
    const c = this.g;
    c.clearRect(0, 0, W, H);
    c.imageSmoothingEnabled = false;
    if (this.mode !== 'off') this.drawOverlay(W, H);
    this.drawEmotes(dt);
    if (this.sheet && (this.sheetT -= dt) <= 0) { this.sheetT = 1; this.fillSheet(); }
  }

  // ---------------------------------------------------------------- bubbles
  private drawEmotes(dt: number) {
    const g = this.game, w = g.world, ctx = this.g, px = Math.max(1, Math.min(3, Math.round(S)));
    const tx = g.cam.target.x, tz = g.cam.target.z, R = Math.max(30, g.cam.dist * 1.1);
    const list: { c: Creature; d: number }[] = [];
    for (const c of w.creatures) {
      if (c.dead || !c.mesh.visible || c.faction !== 'wild' && c.emote === Emote.NONE) continue;
      // asleep, drinking and keeping watch show for as long as they last; the rest pop up and go
      if (c.emote === Emote.NONE && c.mind !== 'sleep' && c.mind !== 'drink' && c.mind !== 'watch') continue;
      const d = (c.x - tx) ** 2 + (c.z - tz) ** 2;
      if (d > R * R) continue;
      list.push({ c, d });
    }
    list.sort((a, b) => a.d - b.d);
    const t = w.time;
    for (const { c } of list.slice(0, 18)) {
      const top = c.y + c.air + c.sp.pheno.height * c.growth * (1 - c.rest * 0.3) + 0.25;
      const [sx, sy, ok] = g.screenOf(c.x, top, c.z);
      if (!ok || sx < -40 || sy < -40 || sx > innerWidth + 40 || sy > innerHeight + 40) continue;
      if (c.emote === Emote.NONE && (c.mind === 'drink' || c.mind === 'watch')) {
        const b = this.bubble(c.mind === 'drink' ? Emote.DRINK : Emote.WATCH, px);
        if (b) ctx.drawImage(b, Math.round(sx - 2 * px), Math.round(sy - b.height - Math.floor((t * 1.5 + c.id) % 2) * px));
        continue;
      }
      if (c.emote === Emote.NONE || c.emote === Emote.SLEEP) {
        if (c.mind !== 'sleep') continue;
        // asleep: a big Z and small z's drifting up and fading in steps
        const ph = (t * 0.5 + c.id * 0.37) % 1, k = Math.floor(ph * 4);
        const zb = this.zGlyph(0, px), zs = this.zGlyph(1, px);
        ctx.globalAlpha = 1;
        ctx.drawImage(zb, Math.round(sx + 2 * px), Math.round(sy - 6 * px - k * 2 * px));
        if (k >= 1) { ctx.globalAlpha = k >= 3 ? 0.5 : 1; ctx.drawImage(zs, Math.round(sx + 8 * px + (k % 2) * px), Math.round(sy - 11 * px - k * 2 * px)); }
        ctx.globalAlpha = 1;
        continue;
      }
      const b = this.bubble(c.emote, px);
      if (!b) continue;
      // pops in over three steps, bobs a pixel
      const age = Math.max(0, 2.6 - c.emoteT), pop = age < 0.06 ? 0.5 : age < 0.12 ? 0.8 : 1;
      const bob = Math.floor((t * 2 + c.id) % 2) * px;
      const wd = Math.round(b.width * pop), ht = Math.round(b.height * pop);
      ctx.globalAlpha = c.emoteT < 0.3 ? 0.5 : 1;
      ctx.drawImage(b, Math.round(sx - 2 * px), Math.round(sy - ht - bob), wd, ht);
      ctx.globalAlpha = 1;
    }
  }
  private bubble(e: Emote, px: number) {
    if (!ICON[e]) return null;
    const k = e + ':' + px;
    let b = this.bubbles.get(k);
    if (!b) this.bubbles.set(k, (b = bubble(e, px)));
    return b;
  }
  private zGlyph(small: number, px: number) {
    const k = small * 10 + px;
    let z = this.zz.get(k);
    if (!z) this.zz.set(k, (z = maskCanvas(small ? ZS : ZB, px, { '#': hex(RAMPS.paper[4]) })));
    return z;
  }

  // ---------------------------------------------------------------- the overlay
  private drawOverlay(W: number, H: number) {
    const g = this.game, eco = this.eco, R = g.region, G = eco.G, G1 = G + 1, K = 2;
    const lw = Math.ceil(W / K), lh = Math.ceil(H / K);
    if (this.lo.width !== lw || this.lo.height !== lh) { this.lo.width = lw; this.lo.height = lh; }
    const c = this.lg;
    c.clearRect(0, 0, lw, lh);
    // project the grid corners onto the ground
    const tx = g.cam.target.x, tz = g.cam.target.z, reach = Math.max(90, g.cam.dist * 4);
    for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) {
      const x = Math.min(R.N - 0.01, i * CS), z = Math.min(R.N - 0.01, j * CS), k = j * G1 + i;
      if ((x - tx) ** 2 + (z - tz) ** 2 > reach * reach) { this.vok[k] = 0; continue; }
      const y = Math.max(R.heightAt(x, z), R.water) + 0.1;
      const [sx, sy, ok] = g.screenOf(x, y, z);
      this.vok[k] = ok ? 1 : 0; this.vx[k] = sx / K; this.vy[k] = sy / K;
    }
    const L = LEG[this.mode];
    const band = new Int8Array(G * G);
    for (let n = 0; n < G * G; n++) band[n] = this.bandOf(n);
    // fills
    c.globalAlpha = 0.3;
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const n = j * G + i, b = band[n];
      if (b < 0) continue;
      const a = j * G1 + i, bb = a + 1, cc = a + G1 + 1, d = a + G1;
      if (!this.vok[a] || !this.vok[bb] || !this.vok[cc] || !this.vok[d]) continue;
      c.fillStyle = L.fill[b];
      c.beginPath(); c.moveTo(this.vx[a], this.vy[a]); c.lineTo(this.vx[bb], this.vy[bb]); c.lineTo(this.vx[cc], this.vy[cc]); c.lineTo(this.vx[d], this.vy[d]); c.closePath(); c.fill();
    }
    // contour lines where the band steps
    c.globalAlpha = 0.9; c.lineWidth = 1;
    // an inked contour with a paler line beside it, like a hand-drawn survey boundary
    const edge = (p: number, q: number, b: number) => {
      if (!this.vok[p] || !this.vok[q]) return;
      const x0 = Math.round(this.vx[p]) + 0.5, y0 = Math.round(this.vy[p]) + 0.5, x1 = Math.round(this.vx[q]) + 0.5, y1 = Math.round(this.vy[q]) + 0.5;
      c.strokeStyle = L.line[b]; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      c.strokeStyle = L.fill[b]; c.beginPath(); c.moveTo(x0, y0 + 1); c.lineTo(x1, y1 + 1); c.stroke();
    };
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const n = j * G + i, b = band[n];
      if (i + 1 < G && band[n + 1] !== b) edge(j * G1 + i + 1, (j + 1) * G1 + i + 1, Math.max(b, band[n + 1]));
      if (j + 1 < G && band[n + G] !== b) edge((j + 1) * G1 + i, (j + 1) * G1 + i + 1, Math.max(b, band[n + G]));
    }
    // marks: poison hatching, danger crosses, flooded hatching
    c.globalAlpha = 0.85;
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const n = j * G + i, a = j * G1 + i, d = a + G1 + 1;
      if (!this.vok[a] || !this.vok[d]) continue;
      const mx = (this.vx[a] + this.vx[d]) / 2, my = (this.vy[a] + this.vy[d]) / 2;
      if (this.mode === 'soil' && eco.poisonF[n] > 0.12) this.hatch(c, a, hex(RAMPS.stampRed[3]));
      if (this.mode === 'water' && eco.floodF[n] > 0.2) this.hatch(c, a, hex(RAMPS.water[6]));
      if (this.mode === 'water' && eco.irr[n] > 0.3) this.diamond(c, mx, my, hex(RAMPS.glowTeal[3]));
      if (this.mode === 'life' && eco.danger[n] > 0.35) this.cross(c, mx, my, hex(RAMPS.stampRed[3]));
      if (this.mode === 'life' && eco.popC[n] > 0.15) { c.strokeStyle = hex(RAMPS.stampRed[2]); this.quad(c, a); }
    }
    if (this.mode === 'life') this.drawLife(c, K);
    c.globalAlpha = 1;
    this.g.drawImage(this.lo, 0, 0, lw * K, lh * K);
    this.drawLegend(W);
  }
  private bandOf(n: number): number {
    const e = this.eco;
    switch (this.mode) {
      case 'water': {
        if (e.waterF[n] > 0.6) return -1;
        const m = e.moist[n];
        return m < 0.2 ? 0 : m < 0.36 ? 1 : m < 0.54 ? 2 : m < 0.74 ? 3 : 4;
      }
      case 'soil': {
        if (e.waterF[n] > 0.6) return -1;
        const f = e.fert[n];
        return f < 0.2 ? 0 : f < 0.38 ? 1 : f < 0.56 ? 2 : f < 0.74 ? 3 : 4;
      }
      case 'life': {
        const p = e.popH[n] + e.popC[n];
        return p < 0.12 ? -1 : p < 0.35 ? 0 : p < 0.7 ? 1 : p < 1.2 ? 2 : 3;
      }
    }
    return -1;
  }
  private quad(c: CanvasRenderingContext2D, a: number) {
    const G1 = this.eco.G + 1, b = a + 1, cc = a + G1 + 1, d = a + G1;
    if (!this.vok[b] || !this.vok[cc] || !this.vok[d]) return;
    c.beginPath(); c.moveTo(this.vx[a], this.vy[a]); c.lineTo(this.vx[b], this.vy[b]); c.lineTo(this.vx[cc], this.vy[cc]); c.lineTo(this.vx[d], this.vy[d]); c.closePath(); c.stroke();
  }
  /** ruled diagonal hatching, 4 px apart on screen, clipped to the cell */
  private hatch(c: CanvasRenderingContext2D, a: number, col: string) {
    const G1 = this.eco.G + 1, b = a + 1, d = a + G1, e = a + G1 + 1;
    if (!this.vok[b] || !this.vok[d] || !this.vok[e]) return;
    const xs = [this.vx[a], this.vx[b], this.vx[e], this.vx[d]], ys = [this.vy[a], this.vy[b], this.vy[e], this.vy[d]];
    const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs)), y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
    if (x1 - x0 > 900 || y1 - y0 > 900) return;
    c.save();
    c.beginPath(); c.moveTo(xs[0], ys[0]); for (let k = 1; k < 4; k++) c.lineTo(xs[k], ys[k]); c.closePath(); c.clip();
    c.fillStyle = col;
    // stepped 1 px diagonals (no anti-aliasing)
    for (let s = x0 - (y1 - y0) - ((x0 + y0) % 4 + 4) % 4; s < x1; s += 4) for (let y = y0; y <= y1; y++) { const x = s + (y - y0); if (x >= x0 && x <= x1) c.fillRect(x, y, 1, 1); }
    c.restore();
  }
  private cross(c: CanvasRenderingContext2D, x: number, y: number, col: string) {
    c.fillStyle = col; x = Math.round(x); y = Math.round(y);
    for (let k = -2; k <= 2; k++) { c.fillRect(x + k, y + k, 1, 1); c.fillRect(x + k, y - k, 1, 1); }
  }
  private diamond(c: CanvasRenderingContext2D, x: number, y: number, col: string) {
    c.fillStyle = col; x = Math.round(x); y = Math.round(y);
    for (let k = -2; k <= 2; k++) { const w = 2 - Math.abs(k); c.fillRect(x - w, y + k, w * 2 + 1, 1); }
    c.fillStyle = hex(RAMPS.ink[1]); c.fillRect(x, y, 1, 1);
  }
  /** herd trails (the migration routes), lures, sleeping grounds */
  private drawLife(c: CanvasRenderingContext2D, K: number) {
    const g = this.game, eco = this.eco, R = g.region, t = g.world.time;
    const P = (x: number, z: number): [number, number, boolean] => { const [sx, sy, ok] = g.screenOf(x, Math.max(R.heightAt(x, z), R.water) + 0.15, z); return [sx / K, sy / K, ok]; };
    for (const tr of eco.trails.values()) {
      if (tr.pts.length < 4) continue;
      const col = tr.diet === 'carn' ? hex(RAMPS.stampRed[3]) : hex(RAMPS.bone[5]);
      c.fillStyle = col;
      // dotted, marching slowly toward the newest point
      let acc = (t * 4) % 6;
      for (let i = 0; i + 3 < tr.pts.length; i += 2) {
        const [x0, y0, a] = P(tr.pts[i], tr.pts[i + 1]), [x1, y1, b] = P(tr.pts[i + 2], tr.pts[i + 3]);
        if (!a || !b) continue;
        const L = Math.hypot(x1 - x0, y1 - y0);
        for (; acc < L; acc += 6) { const f = acc / L; c.fillRect(Math.round(x0 + (x1 - x0) * f), Math.round(y0 + (y1 - y0) * f), 2, 2); }
        acc -= L;
      }
      // an arrowhead at the herd's end
      const n = tr.pts.length;
      const [ax, ay, ok1] = P(tr.pts[n - 2], tr.pts[n - 1]), [bx, by, ok2] = P(tr.pts[n - 4], tr.pts[n - 3]);
      if (ok1 && ok2) {
        const dx = ax - bx, dy = ay - by, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
        for (let k = 0; k < 5; k++) { c.fillRect(Math.round(ax - ux * k - uy * k * 0.7), Math.round(ay - uy * k + ux * k * 0.7), 2, 2); c.fillRect(Math.round(ax - ux * k + uy * k * 0.7), Math.round(ay - uy * k - ux * k * 0.7), 2, 2); }
      }
    }
    for (const l of eco.lures) {
      const [x, y, ok] = P(l.x, l.z); if (!ok) continue;
      this.diamond(c, x, y, l.s > 0 ? hex(RAMPS.glowTeal[2]) : hex(RAMPS.stampRed[2]));
    }
    for (const hs of eco.herdSleep.values()) {
      if (g.world.time - hs.day > g.world.dayLen * 0.6) continue;
      const [x, y, ok] = P(hs.x, hs.z); if (!ok) continue;
      c.drawImage(this.zGlyph(1, 1), Math.round(x - 1), Math.round(y - 1));
    }
    void GOLEM_REF;
  }
  private drawLegend(W: number) {
    const L = LEG[this.mode], px = Math.max(1, Math.min(2, Math.round(S)));
    let slip = this.legend.get(this.mode + px);
    if (!slip) {
      // a typed slip for the title, then a key: an inked swatch and its typed word per band
      const title = textSprite(L.title, 'info');
      const keys = L.labels.map((s) => textSprite(s, 'info', { tape: false }));
      const sw = 7 * px, gap = 2 * px, kh = Math.max(...keys.map((k) => k.height));
      const rowW = keys.reduce((s, k) => s + k.width + sw + gap * 3, 0);
      slip = document.createElement('canvas'); slip.width = Math.ceil(Math.max(title.width, rowW) + 4 * px); slip.height = title.height + kh + 2 * px;
      const g = slip.getContext('2d')!; g.imageSmoothingEnabled = false;
      g.drawImage(title, Math.round((slip.width - title.width) / 2), 0);
      let x = 2 * px; const y = title.height + px;
      L.labels.forEach((_, i) => {
        const k = keys[i], sy = y + Math.round((kh - sw) / 2);
        g.fillStyle = hex(RAMPS.ink[1]); g.fillRect(x - px, sy - px, sw + 2 * px, sw + 2 * px);
        g.fillStyle = L.fill[i]; g.fillRect(x, sy, sw, sw);
        g.fillStyle = L.line[i]; g.fillRect(x, sy + sw - px, sw, px);
        g.drawImage(k, x + sw + gap, y);
        x += sw + gap * 3 + k.width;
      });
      this.legend.set(this.mode + px, slip);
    }
    // top centre, or clear of the survey sheet when it is open
    const sr = this.sheet ? this.sheet.getBoundingClientRect().right + 8 : 0;
    this.g.drawImage(slip, Math.round(Math.max(W / 2 - slip.width / 2, sr)), Math.round(46 * S));
  }

  // ---------------------------------------------------------------- notes, toasts
  private noted(n: EcoNote) {
    const g = this.game, now = g.world.time;
    if (n.kind === 'birth') return;
    const big = n.kind === 'drought' || n.kind === 'flood' || n.kind === 'extinct' || n.kind === 'season' || n.kind === 'arrive';
    if (big && now - this.toastT > 25) { this.toastT = now; toast(`<b>FIELD NOTE</b> &middot; ${n.text.toLowerCase().replace(/^./, (m) => m.toUpperCase())}`, n.kind === 'extinct' || n.kind === 'drought' ? 'warn' : 'info', 4200); }
  }
  /** a typed slip over a newborn near the camera, now and then */
  born(kid: Creature) {
    const g = this.game, now = g.world.time;
    if (now - this.birthT < 20 || !kid.mesh.visible) return;
    if ((kid.x - g.cam.target.x) ** 2 + (kid.z - g.cam.target.z) ** 2 > 30 * 30) return;
    this.birthT = now;
    floatText(g, kid.x, kid.y + kid.sp.pheno.height + 0.5, kid.z, `NEW ${kid.sp.name.split(' ').pop()!.toUpperCase()} YOUNG`, 'good');
  }

  // ---------------------------------------------------------------- the survey sheet
  private fillSheet() {
    const s = this.sheet; if (!s) return;
    const g = this.game, w = g.world, eco = this.eco;
    const rows = eco.census();
    const d = w.day, hh = Math.floor(((d * 24 + 6) % 24 + 24) % 24), mm = Math.floor((((d * 24 + 6) % 1) * 60 + 60) % 60);
    let mo = 0, fe = 0, ve = 0, n = 0;
    for (let c = 0; c < eco.G * eco.G; c++) { if (eco.waterF[c] > 0.6) continue; mo += eco.moist[c]; fe += eco.fert[c]; ve += Math.min(1, eco.veg[c]); n++; }
    mo /= n; fe /= n; ve /= n;
    const lv = eco.level, rain = eco.rain;
    const tot = rows.reduce((a, r) => a + r.alive, 0);
    const word = (v: number, a: string[]) => a[clamp(Math.floor(v * a.length), 0, a.length - 1)];
    s.innerHTML = `
      <div class="es-x" title="Close [M]">&times;</div>
      <div class="es-top"><span>U.S. PLANETARY CORPS</span><span>FORM 7-E</span></div>
      <div class="es-title">FIELD SURVEY: FAUNA &amp; FLORA</div>
      <div class="es-meta">REGION <u>${g.regionName.toUpperCase()}</u> &nbsp; DAY <u>${eco.dayNo}</u> &nbsp; TIME <u>${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}</u></div>
      <div class="es-meta">SEASON <u>${eco.seasonName()}</u></div>
      <div class="es-meta">WATER STAGE <u>${lv >= 0 ? '+' : '&minus;'}${Math.abs(lv).toFixed(2)} M ${lv > 0.25 ? 'IN SPATE' : lv < -0.15 ? 'LOW' : 'NORMAL'}</u> &nbsp; RAIN <u>${rain > 0.5 ? 'HEAVY' : rain > 0.1 ? 'SHOWERS' : 'NONE'}</u></div>
      <div class="es-meta">SOIL <u>${word(mo, ['PARCHED', 'DRY', 'MOIST', 'WET', 'SODDEN'])} ${mo.toFixed(2)}</u> &nbsp; FERTILITY <u>${fe.toFixed(2)}</u> &nbsp; FORAGE <u>${Math.round(ve * 100)}%</u></div>
      <table class="es-t"><tr><th>SPECIES</th><th>ROLE</th><th>HRS</th><th>NO.</th><th>TREND</th><th>B / D</th><th>STATUS</th></tr>
      ${rows.slice(0, 14).map((r, i) => this.row(r, i)).join('')}
      </table>
      <div class="es-sum">TOTAL ${tot} ANIMALS &nbsp;&middot;&nbsp; PLANTS LOST ${eco.diedPlants} / REGROWN ${eco.sprouted + eco.added}</div>
      <div class="es-notes"><div class="es-nh">FIELD NOTES</div>${eco.notes.slice(-4).reverse().map((n) => `<div>D${n.day} &mdash; ${n.text.toLowerCase()}</div>`).join('') || '<div>nothing remarkable yet</div>'}</div>
      <div class="es-foot">[M] CLOSE &nbsp; [H] HABITAT OVERLAY: ${this.mode === 'off' ? 'OFF' : LEG[this.mode].title}</div>`;
    (s.querySelector('.es-x') as HTMLElement).onclick = () => this.toggleSurvey(false);
    s.querySelectorAll('canvas.es-spark').forEach((cv, i) => this.spark(cv as HTMLCanvasElement, rows[i]));
  }
  private row(r: CensusRow, i: number) {
    const st = r.status.toUpperCase(), cls = r.status === 'extinct' || r.status === 'declining' || r.status === 'endangered' ? 'red' : r.status === 'booming' ? 'amb' : '';
    const hrs = r.sched === 'day' ? 'DAY' : r.sched === 'night' ? 'NIGHT' : r.sched === 'dusk' ? 'DUSK' : '';
    const role = (GUILD[r.guild] ?? r.role ?? '').toUpperCase();
    const tag = r.introduced ? ' <i>INTRO.</i>' : '';
    return `<tr class="${r.alive ? '' : 'gone'}"><td>${r.name.toUpperCase()}${tag}</td><td>${role}</td><td>${hrs}</td><td class="n">${r.alive}${r.young ? `<small>+${r.young}j</small>` : ''}</td><td><canvas class="es-spark" width="40" height="12" data-i="${i}"></canvas></td><td class="n">${r.born}/${r.died}</td><td><span class="es-st ${cls}" style="transform:rotate(${((r.id * 37) % 7) - 3}deg)">${st}</span></td></tr>`;
  }
  /** a stepped trend graph, inked */
  private spark(cv: HTMLCanvasElement, r: CensusRow) {
    const g = cv.getContext('2d')!, W = cv.width, H = cv.height, t = r.trend.length ? r.trend : [r.alive];
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#9fb4c2'; g.fillRect(0, H - 1, W, 1);
    const max = Math.max(2, ...t), n = t.length;
    g.fillStyle = r.status === 'declining' || r.status === 'extinct' ? '#b8382e' : '#3b3a36';
    let py = -1;
    for (let x = 0; x < W; x++) {
      const v = t[Math.min(n - 1, Math.floor((x / W) * n))], y = H - 2 - Math.round((v / max) * (H - 3));
      g.fillRect(x, y, 1, 1);
      if (py >= 0 && py !== y) { const a = Math.min(py, y), b = Math.max(py, y); g.fillRect(x, a, 1, b - a); }
      py = y;
    }
  }
}

const GUILD: Record<string, string> = { grazer: 'GRAZER', browser: 'BROWSER', predator: 'HUNTER', scavenger: 'SCAVENGER', decomposer: 'RECYCLER', forager: 'FORAGER' };
/** legend per mode: band fills (light to dark of the theme), contour inks and labels */
const LEG: Record<Exclude<OverlayMode, 'off'>, { title: string; fill: string[]; line: string[]; labels: string[] }> = {
  water: {
    title: 'SOIL MOISTURE', labels: ['PARCHED', 'DRY', 'MOIST', 'WET', 'SODDEN'],
    fill: [RAMPS.sand[4], RAMPS.straw[3], RAMPS.teal[3], RAMPS.water[4], RAMPS.water[5]].map(hex),
    line: [RAMPS.sand[2], RAMPS.straw[1], RAMPS.teal[1], RAMPS.water[2], RAMPS.water[3]].map(hex),
  },
  soil: {
    title: 'SOIL FERTILITY', labels: ['BARREN', 'POOR', 'FAIR', 'RICH', 'LUSH'],
    fill: [RAMPS.clay[3], RAMPS.soil[4], RAMPS.ochre[4], RAMPS.moss[4], RAMPS.moss[5]].map(hex),
    line: [RAMPS.clay[1], RAMPS.soil[2], RAMPS.ochre[2], RAMPS.moss[2], RAMPS.moss[3]].map(hex),
  },
  life: {
    title: 'ANIMAL DENSITY / ROUTES', labels: ['FEW', 'SOME', 'MANY', 'CROWDED'],
    fill: [RAMPS.straw[4], RAMPS.ochre[4], RAMPS.rust[4], RAMPS.rust[3]].map(hex),
    line: [RAMPS.straw[2], RAMPS.ochre[2], RAMPS.rust[2], RAMPS.rust[1]].map(hex),
  },
};

let styled = false;
function injectStyle() {
  if (styled) return; styled = true;
  const st = document.createElement('style');
  st.textContent = `
  .eco-sheet { position: fixed; left: calc(10px * var(--s, 1)); top: calc(40px * var(--s, 1)); width: calc(232px * var(--s, 1)); z-index: 11; pointer-events: auto;
    background-color: #d9d2bf; color: #3b3a36; font-family: 'VT', monospace; font-size: calc(5px * var(--s, 1)); line-height: calc(7px * var(--s, 1));
    padding: calc(7px * var(--s, 1)) calc(8px * var(--s, 1)) calc(6px * var(--s, 1)); transform: rotate(-0.6deg);
    background-image: repeating-linear-gradient(0deg, transparent 0, transparent calc(7px * var(--s, 1) - 1px), #9fb4c2 calc(7px * var(--s, 1) - 1px), #9fb4c2 calc(7px * var(--s, 1)));
    box-shadow: calc(2px * var(--s, 1)) calc(3px * var(--s, 1)) 0 #2b2a27; border-left: calc(11px * var(--s, 1)) solid #d2cab4; }
  .eco-sheet::before { content: ''; position: absolute; left: calc(-9px * var(--s, 1)); top: calc(16px * var(--s, 1)); width: calc(4px * var(--s, 1)); height: calc(4px * var(--s, 1)); background: #8c8471; box-shadow: 0 calc(70px * var(--s, 1)) 0 #8c8471, 0 calc(140px * var(--s, 1)) 0 #8c8471; }
  .eco-sheet::after { content: ''; position: absolute; right: calc(28px * var(--s, 1)); top: calc(-5px * var(--s, 1)); width: calc(34px * var(--s, 1)); height: calc(10px * var(--s, 1)); background: #bdb59f; opacity: 0.85; transform: rotate(3deg); }
  .eco-sheet u { text-decoration: none; border-bottom: 1px solid #3b3a36; padding: 0 2px; }
  .es-top { display: flex; justify-content: space-between; letter-spacing: 1px; color: #67645c; }
  .es-title { font-size: calc(8px * var(--s, 1)); line-height: calc(10px * var(--s, 1)); letter-spacing: 1px; margin: calc(2px * var(--s, 1)) 0 calc(3px * var(--s, 1)); }
  .es-meta { white-space: nowrap; overflow: hidden; }
  .es-t { width: 100%; border-collapse: collapse; margin-top: calc(5px * var(--s, 1)); }
  .es-t th { text-align: left; font-weight: normal; color: #67645c; border-bottom: 1px solid #3b3a36; }
  .es-t td { padding: 0 calc(2px * var(--s, 1)) 0 0; white-space: nowrap; vertical-align: middle; }
  .es-t td.n { text-align: right; padding-right: calc(4px * var(--s, 1)); }
  .es-t td small { color: #67645c; font-size: 0.85em; margin-left: 1px; }
  .es-t td i { font-style: normal; color: #b8382e; font-size: 0.85em; }
  .es-t tr.gone td { color: #8c8471; text-decoration: line-through; text-decoration-color: #3b3a36; }
  .es-t canvas { width: calc(30px * var(--s, 1)); height: calc(9px * var(--s, 1)); image-rendering: pixelated; vertical-align: middle; }
  .es-st { display: inline-block; padding: 0 2px; border: 1px solid #3b3a36; color: #3b3a36; font-size: 0.9em; line-height: 1.1; opacity: 0.85; }
  .es-st.red { color: #b8382e; border-color: #b8382e; }
  .es-st.amb { color: #a47b42; border-color: #a47b42; }
  .es-sum { margin-top: calc(4px * var(--s, 1)); color: #67645c; }
  .es-notes { margin-top: calc(4px * var(--s, 1)); font-family: 'Pixelify', monospace; color: #1f232b; transform: rotate(0.5deg); }
  .es-nh { font-family: 'VT', monospace; color: #67645c; letter-spacing: 1px; }
  .es-foot { margin-top: calc(4px * var(--s, 1)); text-align: right; color: #8c8471; }
  .es-x { position: absolute; right: calc(5px * var(--s, 1)); top: calc(2px * var(--s, 1)); cursor: pointer; font-size: calc(9px * var(--s, 1)); color: #67645c; }
  `;
  document.head.appendChild(st);
}

/** build the ecosystem's view for a game (game.ts calls this once) */
export function attachEco(game: Game): EcoView { return new EcoView(game); }
export function ecoView(game: Game): EcoView | null { return (game as unknown as { ecoView?: EcoView }).ecoView ?? null; }
