// THE PROGRAM (K): Unit 07's mastery, research, Upgrader and mission, each as ONE live 3D vignette with hand-drawn
// paper pinned over it (lowpix stroke frames, ink text, callouts with leader lines to the thing itself):
//   MASTERY   the path as a living diorama that grows as it is mastered (src/ui/skillMastery.ts)
//   RESEARCH  the latest specimen under the scanner dome, the tech index cards (src/research/ui/researchTab.ts)
//   UPGRADER  the Upgrader beside the pod, the part on the hoist (src/research/ui/upgraderTab.ts)
//   MISSION   the Meridian in orbit, the directives on a telegram (src/research/ui/missionTab.ts)
// The game is suspended while it is open; the engine renders the vignette.
import type { Engine, Screen } from '../app/engine';
import type { Post } from '../gfx/post';
import { el, ui, Tip } from './kit';
import { sfx } from '../audio/audio';
import { csfx } from './cineAudio';
import { MasteryPage } from './skillMastery';
import { ResearchPage } from '../research/ui/researchTab';
import { UpgraderPage } from '../research/ui/upgraderTab';
import { MissionPage } from '../research/ui/missionTab';
import { iconURL, iconsReady } from '../research/ui/icons';
import { installFrames } from '../research/ui/frames';
import type { Vignette } from '../research/ui/stage3d';
import type { Mastery, PathId } from '../research/mastery';
import type { Research } from '../research/research';
import type { Upgrades } from '../research/upgrades';
import type { Mission } from '../research/mission';
import '../research/ui/paper.css';

export type TabId = 'mastery' | 'research' | 'upgrader' | 'mission';
const TABS: { id: TabId; name: string; icon: string; key: string }[] = [
  { id: 'mastery', name: 'MASTERY', icon: 'sprout', key: '1' },
  { id: 'research', name: 'RESEARCH', icon: 'lens', key: '2' },
  { id: 'upgrader', name: 'UPGRADER', icon: 'wrench', key: '3' },
  { id: 'mission', name: 'MISSION', icon: 'arcs', key: '4' },
];
/** what the screens read: the game (or a stand-in with the same fields) */
export interface SkillHost { mastery?: Mastery; research?: Research; upgrades?: Upgrades; mission?: Mission; emit?(ev: string, d?: any): void; [k: string]: any }
/** one tab: a vignette and the paper over it */
export interface TabPage { vig?: Vignette; el: HTMLElement; update(dt: number): void; dispose(): void; key?(e: KeyboardEvent): boolean }

export class SkillTree implements Screen {
  static current: SkillTree | null = null;
  private root: HTMLDivElement; private tabsEl: HTMLDivElement;
  private page: TabPage | null = null; tab: TabId;
  private tabBtns = new Map<TabId, HTMLElement>(); private lampT = 0;
  private W = innerWidth; private H = innerHeight;
  readonly close: () => void;
  constructor(readonly host: SkillHost, readonly engine: Engine, opts: { tab?: TabId; path?: PathId; close: () => void }) {
    SkillTree.current = this;
    installFrames();
    this.close = opts.close;
    this.root = el('div', 'pp', ui());
    this.tabsEl = el('div', 'pp-tabs', this.root);
    const tt = el('div', 'pp-title pp-tag', this.tabsEl); el('div', 'k', tt, 'UNIT 07 · UNAA MERIDIAN'); el('div', 't', tt, 'PROGRAM');
    for (const tb of TABS) {
      const b = el('div', 'pp-tab', this.tabsEl);
      const im = el('img', '', b); im.src = iconURL(tb.icon, 'phos');
      el('span', '', b, tb.name); el('i', 'dot', b);
      b.title = `key ${tb.key}`;
      b.addEventListener('click', () => this.show(tb.id));
      this.tabBtns.set(tb.id, b);
    }
    const x = el('div', 'pp-key pp-close', this.tabsEl, 'CLOSE  K');
    x.addEventListener('click', () => this.close());
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', this.onKey, true);
    this.tab = opts.tab ?? 'mastery';
    this.show(this.tab, opts.path, true);
    void iconsReady.then(() => { if (SkillTree.current !== this) return; for (const [k, b] of this.tabBtns) { const im = b.querySelector('img'); const tb = TABS.find((q) => q.id === k); if (im && tb) im.src = iconURL(tb.icon, 'phos'); } this.show(this.tab, undefined, true); });
    csfx('page', 0.6);
  }
  show(id: TabId, path?: PathId, force = false) {
    if (!force && id === this.tab && this.page) return;
    const keepPath = this.page instanceof MasteryPage ? this.page.path : undefined;
    this.page?.dispose(); this.page = null; this.tab = id;
    for (const [k, b] of this.tabBtns) b.classList.toggle('on', k === id);
    const H = this.host;
    try {
      if (id === 'mastery' && H.mastery) this.page = new MasteryPage(H.mastery, path ?? keepPath, () => H.emit?.('mastery-perk', {}));
      else if (id === 'research' && H.research) this.page = new ResearchPage(H.research, H, this.engine);
      else if (id === 'upgrader' && H.upgrades) this.page = new UpgraderPage(H.upgrades, H as never, H.research ?? null);
      else if (id === 'mission' && H.mission) this.page = new MissionPage(H.mission, H as never, this.engine);
    } catch (e) { console.error('program tab', id, e); }
    if (this.page) { this.root.insertBefore(this.page.el, this.tabsEl); this.page.vig?.resize(this.W, this.H); }
    if (!force) { csfx('page', 0.5, 1.1); sfx('click'); }
    this.lamps();
  }
  private onKey = (e: KeyboardEvent) => {
    if (SkillTree.current !== this) return;
    const t = (e.target as HTMLElement)?.tagName; if (t === 'INPUT' || t === 'TEXTAREA') return;
    if (document.querySelector('.evc')) return;
    e.stopImmediatePropagation();
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'escape' || k === 'k') { e.preventDefault(); this.close(); return; }
    const tb = TABS.find((q) => q.key === k); if (tb) { this.show(tb.id); return; }
    if (k === 'tab') { e.preventDefault(); const i = TABS.findIndex((q) => q.id === this.tab); this.show(TABS[(i + (e.shiftKey ? 3 : 1)) % 4].id); return; }
    this.page?.key?.(e);
  };
  /** a red dot on a tab with something waiting on it */
  private lamps() {
    const H = this.host, R = H.research, M = H.mission;
    const P: PathId[] = ['plant', 'bio', 'energy', 'industry', 'robotics'];
    const pend: Record<TabId, boolean> = {
      mastery: !!H.mastery && P.some((p) => H.mastery!.points(p) > 0 || H.mastery!.canFocus(p)),
      research: !!R && R.queue.length === 0,
      upgrader: !!H.upgrades && !!R && ['pod_plating', 'arm_grapple', 'drone_scout'].some((b) => R.unlocked(b) && !H.upgrades!.has(b)),
      mission: !!M && M.open().some((q) => M.progress(q).ok),
    };
    for (const [k, b] of this.tabBtns) b.querySelector('.dot')?.classList.toggle('on', pend[k]);
  }
  update(dt: number) {
    this.lampT -= dt; if (this.lampT <= 0) { this.lampT = 0.5; this.lamps(); }
    try { this.page?.vig?.update(dt); this.page?.update(dt); } catch (e) { console.error('program page', e); }
  }
  render(post: Post, t: number) { this.page?.vig?.render(post, t); }
  resize(w: number, h: number) { this.W = innerWidth; this.H = innerHeight; void w; void h; this.page?.vig?.resize(this.W, this.H); }
  dispose() {
    if (SkillTree.current === this) SkillTree.current = null;
    removeEventListener('keydown', this.onKey, true);
    this.page?.dispose(); this.root.remove(); Tip.hide();
  }
}

// ------------------------------------------------------------------ wiring helpers
/** open the program over a game (idempotent) */
export function openSkillTree(engine: Engine, host: SkillHost, tab?: TabId, path?: PathId) {
  if (SkillTree.current) { if (tab) SkillTree.current.show(tab, path); return SkillTree.current; }
  const s = new SkillTree(host, engine, { tab, path, close: () => { if (engine.screen === s) engine.pop(); else s.dispose(); } });
  engine.push(s);
  return s;
}

// ------------------------------------------------------------------ ?test=skills (alias of ?test=mastery)
export function testSkills(engine: Engine, P: URLSearchParams) { void import('../research/test').then((m) => m.testProgression(engine, P)); }
