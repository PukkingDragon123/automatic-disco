// THE PROGRAM TERMINAL (replaces the old 1957 skill room): Unit 07's own console, opened with K. Four tabs on one
// big phosphor CRT in a riveted gunmetal housing: MASTERY (the five engineering paths, src/ui/skillMastery.ts),
// RESEARCH (data into tech, src/research/ui/researchTab.ts), UPGRADER (blueprints built from real parts and
// installed on the pod) and MISSION (the Austral's quotas). The game is suspended while it is open.
import type { Engine, Screen } from '../app/engine';
import type { Post } from '../gfx/post';
import { el, ui, Tip } from './kit';
import { sfx } from '../audio/audio';
import { csfx } from './cineAudio';
import { MasteryPage, type TabPage } from './skillMastery';
import { ResearchPage } from '../research/ui/researchTab';
import { UpgraderPage } from '../research/ui/upgraderTab';
import { MissionPage } from '../research/ui/missionTab';
import { iconURL } from '../research/ui/icons';
import { DATA_KINDS, DATA_NAME } from '../research/tech';
import type { Mastery, PathId } from '../research/mastery';
import type { Research } from '../research/research';
import type { Upgrades } from '../research/upgrades';
import type { Mission } from '../research/mission';
import { fmtTime, gtime } from '../research/util';
import type { Game } from '../game/game';
import '../research/ui/terminal.css';
import '../story/choice.css';

export type TabId = 'mastery' | 'research' | 'upgrader' | 'mission';
const TABS: { id: TabId; name: string; icon: string; key: string }[] = [
  { id: 'mastery', name: 'MASTERY', icon: 'gear', key: '1' },
  { id: 'research', name: 'RESEARCH', icon: 'lens', key: '2' },
  { id: 'upgrader', name: 'UPGRADER', icon: 'wrench', key: '3' },
  { id: 'mission', name: 'MISSION', icon: 'arcs', key: '4' },
];
/** what the terminal reads: the game (or a stand-in with the same fields) */
export interface SkillHost { mastery?: Mastery; research?: Research; upgrades?: Upgrades; mission?: Mission; emit?(ev: string, d?: any): void; [k: string]: any }

export class SkillTree implements Screen {
  static current: SkillTree | null = null;
  private root: HTMLDivElement; private crt: HTMLDivElement; private tabsEl: HTMLDivElement; private clock: HTMLDivElement; private foot: HTMLDivElement;
  private page: TabPage | null = null; tab: TabId;
  private tabBtns = new Map<TabId, HTMLElement>(); private t = 0; private footT = 0;
  constructor(readonly host: SkillHost, opts: { tab?: TabId; path?: PathId; close: () => void }) {
    SkillTree.current = this;
    this.close = opts.close;
    this.root = el('div', 'pt', ui());
    const house = el('div', 'pt-house', this.root);
    const top = el('div', 'pt-top', house);
    const br = el('div', 'pt-brand', top); el('div', 'k', br, 'UNIT 07 · UNAA AUSTRAL'); el('div', 't', br, 'PROGRAM TERMINAL');
    this.tabsEl = el('div', 'pt-tabs', top);
    for (const tb of TABS) {
      const b = el('div', 'pt-tab', this.tabsEl);
      const im = el('img', 'pt-ico', b); im.src = iconURL(tb.icon, 'steel');
      const tx = el('div', '', b); el('div', 'n', tx, `KEY ${tb.key}`); el('div', '', tx, tb.name);
      el('div', 'dot', b);
      b.addEventListener('click', () => this.show(tb.id));
      this.tabBtns.set(tb.id, b);
    }
    this.clock = el('div', 'pt-clock', top);
    const x = el('div', 'pt-x', top, 'CLOSE [K]');
    x.addEventListener('click', () => this.close());
    this.crt = el('div', 'pt-crt', house);
    this.foot = el('div', 'pt-foot', house);
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', this.onKey, true);
    this.tab = opts.tab ?? 'mastery';
    this.show(this.tab, opts.path, true);
    csfx('relay', 0.7); csfx('hum', 0.35);
  }
  readonly close: () => void;
  show(id: TabId, path?: PathId, first = false) {
    if (!first && id === this.tab && this.page) return;
    this.page?.dispose(); this.page = null; this.tab = id;
    for (const [k, b] of this.tabBtns) b.classList.toggle('on', k === id);
    const H = this.host;
    try {
      if (id === 'mastery' && H.mastery) this.page = new MasteryPage(H.mastery, path, () => H.emit?.('mastery-perk', {}));
      else if (id === 'research' && H.research) this.page = new ResearchPage(H.research);
      else if (id === 'upgrader' && H.upgrades) this.page = new UpgraderPage(H.upgrades, H as unknown as Game, H.research ?? null);
      else if (id === 'mission' && H.mission) this.page = new MissionPage(H.mission, H as unknown as Game);
    } catch (e) { console.error('terminal tab', id, e); }
    if (this.page) this.crt.appendChild(this.page.el);
    else el('div', 'pt-page', this.crt, '<div class="pt-txt big">This console is not connected here.</div>');
    if (!first) { csfx('relay', 0.5, 1.2); sfx('click'); }
    this.footer();
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
  private footer() {
    const H = this.host, R = H.research, M = H.mission, f = this.foot; f.innerHTML = '';
    if (R) for (const k of DATA_KINDS) el('div', 'res', f, `${DATA_NAME[k]} <b>${Math.floor(R.data[k])}</b>`);
    if (H.mastery) { const pts = (['plant', 'bio', 'energy', 'industry', 'robotics'] as PathId[]).reduce((s, p) => s + Math.max(0, H.mastery!.points(p)), 0); el('div', 'res', f, `MASTERY POINTS <b>${pts}</b>`); }
    if (M) el('div', 'res', f, `STRIKES <b>${M.strikes}/3</b> &nbsp; REP <b>${Math.round(M.rep)}</b>`);
    el('div', 'hint', f, `<b>1-4</b> TABS &nbsp;·&nbsp; <b>Q E</b> PAGE &nbsp;·&nbsp; <b>ENTER</b> CONFIRM &nbsp;·&nbsp; <b>K</b> CLOSE`);
    // the tab lamps: something waiting on that tab
    const pend: Record<TabId, boolean> = {
      mastery: !!H.mastery && (['plant', 'bio', 'energy', 'industry', 'robotics'] as PathId[]).some((p) => H.mastery!.points(p) > 0 || H.mastery!.canFocus(p)),
      research: !!R && R.queue.length === 0,
      upgrader: !!H.upgrades && !!R && ['pod_plating', 'arm_grapple', 'drone_scout'].some((b) => R.unlocked(b) && !H.upgrades!.has(b)),
      mission: !!M && M.open().some((q) => M.progress(q).ok),
    };
    for (const [k, b] of this.tabBtns) b.querySelector('.dot')?.classList.toggle('on', pend[k]);
    const G = H as unknown as Game, now = H.world ? gtime(G) : 0;
    const day = Math.floor(now / 600) + 1, open = M?.open?.()[0];
    this.clock.innerHTML = `SOL <b>${String(day).padStart(2, '0')}</b> · ${fmtTime(now % 600)}<br>${open ? `NEXT DUE <b>${fmtTime(open.due - now)}</b>` : 'NO DIRECTIVE OPEN'}`;
  }
  update(dt: number) {
    this.t += dt; this.footT -= dt;
    // the colony's systems keep their own clocks: nothing ticks while the terminal is up, except the Upgrader page
    try { this.page?.update(dt); } catch (e) { console.error('terminal page', e); }
    if (this.footT <= 0) { this.footT = 0.5; this.footer(); }
  }
  render(_post: Post, _t: number) { /* the CRT covers the screen */ }
  dispose() {
    if (SkillTree.current === this) SkillTree.current = null;
    removeEventListener('keydown', this.onKey, true);
    this.page?.dispose(); this.root.remove(); Tip.hide();
    csfx('relay', 0.5, 0.8);
  }
}

// ------------------------------------------------------------------ wiring helpers
/** open the terminal over a game (idempotent) */
export function openSkillTree(engine: Engine, host: SkillHost, tab?: TabId, path?: PathId) {
  if (SkillTree.current) { if (tab) SkillTree.current.show(tab, path); return SkillTree.current; }
  const s = new SkillTree(host, { tab, path, close: () => { if (engine.screen === s) engine.pop(); else s.dispose(); } });
  engine.push(s);
  return s;
}

// ------------------------------------------------------------------ ?test=skills (alias of ?test=mastery)
export function testSkills(engine: Engine, P: URLSearchParams) { void import('../research/test').then((m) => m.testProgression(engine, P)); }
