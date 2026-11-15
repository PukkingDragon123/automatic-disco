// THE MISSION: the research vessel above sets quotas with deadlines (research data, shipped items, a colony
// milestone). Meeting one earns a supply drop and reputation; missing one is a strike. Three strikes and the UNAA
// recalls the mission: the colony is abandoned (colony.fail('recalled')). Deadlines run on game time, so pause and
// speed apply. Requirements met at the deadline are collected automatically; the player can transmit early for
// more reputation.
import type { Game } from '../game/game';
import { DATA_NAME, type DataKind } from './tech';
import { pick, have, pay, give, anyG, gtime, itemName } from './util';

export const SHIP = 'UNAA AUSTRAL';
export type QKind = 'data' | 'items' | 'milestone';
export interface Milestone { k: 'workers' | 'power' | 'building' | 'techs' | 'upgrades' | 'scans'; n: number; kind?: string; label: string }
export interface Quota {
  id: string; no: number; kind: QKind; title: string; brief: string;
  data?: Partial<Record<DataKind, number>>; items?: Record<string, number>; milestone?: Milestone;
  issued: number; due: number; state: 'open' | 'met' | 'missed';
  reward: { items: Record<string, number>; rep: number };
  /** when it was resolved (game time) */
  at?: number; early?: boolean;
}
type Ev = 'quota' | 'drop' | 'recall';

const BRIEFS: Record<QKind, string[]> = {
  data: ['The board wants proof this world is worth the fuel.', 'Science review in orbit. Send what you have learned.', 'The program lead asked for raw data, not summaries.'],
  items: ['The vessel needs stock for the return leg.', 'Fabrication aboard is short. Ship it up on the next lift.', 'Material samples for the Antarctic labs.'],
  milestone: ['The council reviews colony viability this cycle.', 'Show the board a colony, not a camp.', 'Investors are watching the telemetry.'],
};

export class Mission {
  quotas: Quota[] = [];
  strikes = 0; rep = 50; no = 0;
  /** game time when the next quota is issued */
  next = 150;
  recalled = false;
  /** drops in flight / landed (the world draws them) */
  drops: { x: number; z: number; t: number; items: Record<string, number> }[] = [];
  private fns: Record<string, ((d: any) => void)[]> = {};
  private warned = new Set<string>();
  /** difficulty 0.6..1.6: tighter deadlines, bigger asks */
  difficulty = 1;
  constructor(readonly g: Game | null) {}
  on(ev: Ev, fn: (d: any) => void) { (this.fns[ev] ??= []).push(fn); return () => { const a = this.fns[ev]; const i = a?.indexOf(fn) ?? -1; if (i >= 0) a!.splice(i, 1); }; }
  private emit(ev: Ev, d: any) { for (const f of this.fns[ev] ?? []) { try { f(d); } catch (e) { console.error('mission', ev, e); } } }
  private now() { return this.g ? gtime(this.g) : 0; }
  open() { return this.quotas.filter((q) => q.state === 'open'); }
  get(id: string) { return this.quotas.find((q) => q.id === id) ?? null; }

  // ---------------------------------------------------------------- progress
  /** 0..1 and a short "12 / 30" line */
  progress(q: Quota): { k: number; text: string; ok: boolean } {
    const G = anyG(this.g!);
    if (q.kind === 'data') {
      let need = 0, got = 0; const parts: string[] = [];
      for (const k in q.data) { const n = q.data[k as DataKind]!, h = Math.min(n, Math.floor(G?.research?.data?.[k] ?? 0)); need += n; got += h; parts.push(`${h}/${n} ${DATA_NAME[k as DataKind]}`); }
      return { k: need ? got / need : 1, text: parts.join(' · '), ok: got >= need };
    }
    if (q.kind === 'items') {
      let need = 0, got = 0; const parts: string[] = [];
      for (const k in q.items) { const n = q.items[k], h = this.g ? Math.min(n, have(this.g, k)) : 0; need += n; got += h; parts.push(`${h}/${n} ${itemName(k).toUpperCase()}`); }
      return { k: need ? got / need : 1, text: parts.join(' · '), ok: got >= need };
    }
    const m = q.milestone!, v = this.measure(m);
    return { k: Math.min(1, v / m.n), text: `${Math.floor(v)}/${m.n} ${m.label}`, ok: v >= m.n };
  }
  measure(m: Milestone): number {
    const G = anyG(this.g!); if (!G) return 0;
    try {
      switch (m.k) {
        case 'workers': return G.colony?.workers?.length ?? (G.world?.creatures ?? []).filter((c: any) => !c.dead && c.faction === 'veyr').length;
        case 'power': return G.factory?.power?.().supply ?? 0;
        case 'building': return (G.factory?.buildings ?? []).filter((b: any) => !b.dead && b.kind === m.kind).length;
        case 'techs': return (G.research?.known?.() ?? []).length - 2;
        case 'upgrades': return (G.upgrades?.list?.() ?? []).reduce((s: number, u: any) => s + u.n, 0);
        case 'scans': return G.research?.scans?.size ?? 0;
      }
    } catch { /* missing system */ }
    return 0;
  }

  // ---------------------------------------------------------------- issuing
  private makeQuota(): Quota {
    const no = ++this.no, d = this.difficulty, sc = (1 + (no - 1) * 0.35) * d, t = this.now();
    const span = Math.round((520 + no * 40) / Math.sqrt(d));
    const kinds: QKind[] = ['data', 'items', 'milestone'];
    // a fixed opening order, then rotate with a little variety
    const kind = kinds[(no - 1) % 3];
    const q: Quota = { id: 'q' + no, no, kind, title: '', brief: BRIEFS[kind][no % BRIEFS[kind].length], issued: t, due: t + span, state: 'open', reward: { items: {}, rep: 8 + Math.round(no * 1.5) } };
    if (kind === 'data') {
      const pool: DataKind[] = no < 3 ? ['bio'] : no < 6 ? ['bio', 'geo'] : ['bio', 'geo', 'energy', 'xeno'];
      const a = pool[no % pool.length], b = pool[(no + 1) % pool.length];
      q.data = { [a]: Math.round(14 * sc) }; if (a !== b && no >= 4) q.data[b] = Math.round(8 * sc);
      q.title = `TRANSMIT ${Object.entries(q.data).map(([k, n]) => `${n} ${DATA_NAME[k as DataKind]}`).join(' + ')} DATA`;
      q.reward.items = { [pick('iron_plate')]: Math.round(12 * sc), [pick('circuit')]: Math.round(2 + no * 0.6) };
    } else if (kind === 'items') {
      const tiers = [[pick('iron_plate'), 20], [pick('copper_wire'), 30], [pick('wood', 'carbon'), 40], [pick('gear'), 16], [pick('circuit'), 8], [pick('motor'), 4]] as [string, number][];
      const [id, n] = tiers[Math.min(tiers.length - 1, Math.floor((no - 1) / 2))];
      q.items = { [id]: Math.round(n * sc) };
      q.title = `SHIP ${q.items[id]} ${itemName(id).toUpperCase()}`;
      q.reward.items = { [pick('motor')]: 1 + Math.floor(no / 3), [pick('crystal')]: Math.round(3 * sc), [pick('glass')]: Math.round(6 * sc) };
    } else {
      const ms: Milestone[] = [
        { k: 'building', n: 1, kind: 'research_station', label: 'RESEARCH STATION' },
        { k: 'scans', n: Math.round(8 * sc), label: 'THINGS SCANNED' },
        { k: 'techs', n: Math.round(3 * sc), label: 'TECHS RESEARCHED' },
        { k: 'workers', n: Math.round(3 * sc), label: 'WORKERS' },
        { k: 'power', n: Math.round(40 * sc), label: 'MW GENERATED' },
        { k: 'upgrades', n: Math.max(1, Math.round(sc)), label: 'UPGRADES INSTALLED' },
      ];
      const m = ms[(no - 3 + ms.length * 4) % ms.length];
      q.milestone = m;
      q.title = m.k === 'building' ? `RUN A ${m.label}` : `REACH ${m.n} ${m.label}`;
      q.reward.items = { [pick('reinforced_plate', 'iron_plate')]: Math.round(6 * sc), [pick('servo', 'motor')]: 1 };
    }
    return q;
  }
  issue(): Quota {
    const q = this.makeQuota();
    this.quotas.push(q);
    this.emit('quota', { q, phase: 'new' });
    anyG(this.g!)?.emit?.('quota-new', { q });
    return q;
  }

  // ---------------------------------------------------------------- resolving
  /** pay a quota now (the TRANSMIT button) */
  transmit(id: string): boolean {
    const q = this.get(id); if (!q || q.state !== 'open') return false;
    if (!this.progress(q).ok) return false;
    const G = anyG(this.g!);
    if (q.kind === 'data') { for (const k in q.data) G.research.data[k] -= q.data[k as DataKind]!; }
    else if (q.kind === 'items') { if (!this.g || !pay(this.g, q.items!)) return false; }
    const early = q.due - this.now() > 60;
    this.met(q, early);
    return true;
  }
  private met(q: Quota, early: boolean) {
    q.state = 'met'; q.at = this.now(); q.early = early;
    this.rep = Math.min(100, this.rep + q.reward.rep + (early ? 4 : 0));
    if (this.rep >= 60 && this.strikes > 0 && this.quotas.filter((x) => x.state === 'met').length % 2 === 0) this.strikes--;
    const G = anyG(this.g!);
    G?.mastery?.gain?.(q.kind === 'data' ? 'bio' : q.kind === 'items' ? 'industry' : 'robotics', 30, 'Quota met');
    this.emit('quota', { q, phase: 'met' });
    G?.emit?.('quota-met', { q });
    // the drop: better stock the better the program thinks of you
    const k = 0.7 + this.rep / 100;
    const items: Record<string, number> = {};
    for (const id in q.reward.items) items[id] = Math.max(1, Math.round(q.reward.items[id] * k));
    this.drop(items);
    this.next = Math.min(this.next, this.now() + 90);
  }
  private missed(q: Quota) {
    q.state = 'missed'; q.at = this.now();
    this.strikes++; this.rep = Math.max(0, this.rep - 15);
    this.emit('quota', { q, phase: 'missed' });
    anyG(this.g!)?.emit?.('quota-missed', { q, strikes: this.strikes });
    if (this.strikes >= 3) this.recall();
    this.next = Math.min(this.next, this.now() + 60);
  }
  recall() {
    if (this.recalled) return;
    this.recalled = true;
    this.emit('recall', {});
    const G = anyG(this.g!);
    G?.emit?.('mission-recalled', {});
    if (G?.colony?.fail) G.colony.fail('recalled', 'Three directives missed. The UNAA program has recalled the mission.');
    else G?.opts?.hooks?.onLose?.(G);
  }
  /** a supply capsule to the pod */
  drop(items: Record<string, number>) {
    const G = anyG(this.g!); const core = G?.veyr?.core;
    const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 4;
    const x = (core?.x ?? 64) + Math.cos(a) * r, z = (core?.z ?? 64) + Math.sin(a) * r;
    this.drops.push({ x, z, t: 0, items });
    this.emit('drop', { x, z, items });
  }
  /** a landed capsule hands its stock to the stores */
  landed(d: { x: number; z: number; items: Record<string, number> }) {
    if (this.g) give(this.g, d.items, d.x, d.z);
    anyG(this.g!)?.emit?.('supply-drop', { items: d.items, x: d.x, z: d.z });
  }

  tick(dt: number) {
    if (this.recalled || dt <= 0) return;
    const t = this.now();
    for (const q of this.open()) {
      const left = q.due - t;
      if (left <= 0) { if (this.progress(q).ok && this.transmitAuto(q)) continue; this.missed(q); continue; }
      if (left < 90 && !this.warned.has(q.id)) { this.warned.add(q.id); this.emit('quota', { q, phase: 'warn' }); }
    }
    if (t >= this.next && this.open().length < (this.no >= 4 ? 2 : 1)) { this.issue(); this.next = t + 240 + Math.random() * 120; }
  }
  private transmitAuto(q: Quota) { const ok = this.transmit(q.id); if (ok) q.early = false; return ok; }
  toJSON() { return { quotas: this.quotas, strikes: this.strikes, rep: this.rep, no: this.no, next: this.next, recalled: this.recalled }; }
  load(d: any) {
    if (!d || typeof d !== 'object') return;
    this.quotas = Array.isArray(d.quotas) ? d.quotas : []; this.strikes = Number(d.strikes) || 0; this.rep = Number(d.rep ?? 50);
    this.no = Number(d.no) || this.quotas.length; this.next = Number(d.next) || 150; this.recalled = !!d.recalled;
  }
}
