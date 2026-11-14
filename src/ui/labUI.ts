// The gene lab's panels, over the 3D laboratory: the specimen file (name, proportions, the jar shelf) on the left,
// the phenotype readout and the filing controls on the right, and along the bottom the parts carousel: a row of
// body-area tabs over a swipeable strip of cards whose windows show the spinning 3D part icons (labIcons.ts).
// Scientists' lines float over their heads; the region under the cursor is named in a tag. Styles are injected
// here so the lab owns its look (Corps olive housings, Bakelite keys, phosphor CRTs, paper specimen cards).
import { el, ui, panel, Btn, iconImg, Tip, S } from './kit';
import { icon } from './pixelart';
import { sfx } from '../audio/audio';
import { clamp } from '../core/rand';
import type { Design, Pattern, Cover } from '../life/design';
import { TABS, TAB_ORDER, type TabId } from './labRules';

const CSS = `
.lab, #ui > .lab { position: fixed; inset: 0; pointer-events: none; z-index: 3; font-family: 'VT', monospace; }
.lab .lb-p { position: absolute; pointer-events: auto; }
.lab .lb-top { top: calc(2px * var(--s)); left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: calc(3px * var(--s)); padding: 0 calc(2px * var(--s)) !important; max-width: calc(100vw - 8px); box-sizing: border-box; }
.lb-title { font-family: 'VT'; font-size: calc(13px * var(--s)); line-height: 1; color: var(--hot); letter-spacing: 2px; white-space: nowrap; }
.lb-title small { display: block; font-size: calc(6px * var(--s)); color: var(--gold); letter-spacing: 1px; text-shadow: var(--amb-glow); }
.lb-name { font-family: 'VT'; font-size: calc(10px * var(--s)); background: #020805; color: var(--hot); border: none; box-shadow: inset 0 0 0 calc(1px * var(--s)) #1b6630; padding: calc(1px * var(--s)) calc(3px * var(--s)); width: calc(104px * var(--s)); outline: none; text-shadow: var(--phos-glow); caret-color: var(--glow); }
.lb-latin { font-size: calc(7px * var(--s)); color: var(--dim); font-style: italic; white-space: nowrap; max-width: calc(90px * var(--s)); overflow: hidden; text-overflow: ellipsis; }
.lb-toggle { display: none !important; }
.lab .lb-tools { left: calc(2px * var(--s)); top: calc(28px * var(--s)); width: calc(64px * var(--s)); display: flex; flex-direction: column; gap: calc(2px * var(--s)); padding: 0 !important; }
.lb-tools .px-btn.wide { min-width: 0; width: 100%; height: calc(20px * var(--s)); justify-content: flex-start; padding: 0 calc(2px * var(--s)); }
.lb-tools .px-btn .lbl { font-size: calc(7px * var(--s)); }
.lb-tools .px-btn.act .lbl { color: var(--gold); }
.lab .lb-left { left: calc(68px * var(--s)); top: calc(28px * var(--s)); width: calc(132px * var(--s)); max-height: calc(100vh - 146px * var(--s)); display: none; flex-direction: column; overflow: hidden auto; scrollbar-width: none; z-index: 4; }
.lab .lb-left.open { display: flex; animation: crt-on 220ms steps(5); }
.lab .lb-right { right: calc(2px * var(--s)); top: calc(28px * var(--s)); width: calc(124px * var(--s)); max-height: calc(100vh - 146px * var(--s)); display: flex; flex-direction: column; overflow: hidden auto; scrollbar-width: none; }
.lb-top .px-btn.big { min-width: 0; height: calc(22px * var(--s)); }
.lb-top .px-btn.wide { min-width: 0; height: calc(22px * var(--s)); }
.lb-h { font-size: calc(9px * var(--s)); margin: calc(1px * var(--s)) 0 calc(2px * var(--s)); color: var(--gold); text-shadow: var(--amb-glow); letter-spacing: 1px; }
.lb-h::before { content: ''; display: inline-block; width: calc(5px * var(--s)); height: calc(5px * var(--s)); margin-right: calc(3px * var(--s)); background: var(--haz) 0 0 / calc(16px * var(--s)) calc(6px * var(--s)); vertical-align: middle; }
.lb-sl { display: grid; grid-template-columns: calc(40px * var(--s)) 1fr; align-items: center; gap: calc(3px * var(--s)); margin: calc(2px * var(--s)) 0; font-size: calc(7px * var(--s)); }
.lb-sl .track { position: relative; height: calc(6px * var(--s)); background: #08090b; box-shadow: inset 0 calc(1px * var(--s)) 0 #000, 0 calc(1px * var(--s)) 0 #5c646c; touch-action: none; }
.lb-sl .track::before { content: ''; position: absolute; left: calc(2px * var(--s)); right: calc(2px * var(--s)); top: calc(2px * var(--s)); height: calc(2px * var(--s)); background: repeating-linear-gradient(90deg, #2a9144 0 calc(1px * var(--s)), transparent calc(1px * var(--s)) calc(4px * var(--s))); opacity: 0.7; }
.lb-sl .cap { position: absolute; top: 0; bottom: 0; right: 0; background: repeating-linear-gradient(45deg, rgba(255, 108, 68, 0.45) 0 calc(2px * var(--s)), transparent calc(2px * var(--s)) calc(4px * var(--s))); pointer-events: none; }
.lb-sl .knob { position: absolute; top: calc(-3px * var(--s)); width: calc(6px * var(--s)); height: calc(12px * var(--s)); background: linear-gradient(90deg, #fff0bc 0 calc(1px * var(--s)), #d8ab50 calc(1px * var(--s)) calc(4px * var(--s)), #7c581b calc(4px * var(--s))); box-shadow: 0 0 0 calc(1px * var(--s)) #06070a; }
.lb-row { display: flex; flex-wrap: wrap; gap: calc(2px * var(--s)); align-items: center; }
.lb-row .px-btn.wide { min-width: 0; flex: 1; height: calc(18px * var(--s)); }
.lb-row .px-btn .lbl { font-size: calc(8px * var(--s)); }
.lb-stats { display: flex; flex-direction: column; gap: calc(1px * var(--s)); }
.lb-mass { color: var(--gold); margin-bottom: calc(2px * var(--s)); font-size: calc(7px * var(--s)); }
.lb-stat { display: grid; grid-template-columns: calc(30px * var(--s)) 1fr calc(34px * var(--s)); align-items: center; gap: calc(2px * var(--s)); font-size: calc(7px * var(--s)); }
.lb-stat .v { text-align: right; color: var(--hot); }
.lb-sbar { height: calc(4px * var(--s)); background: #030a05; box-shadow: 0 0 0 calc(1px * var(--s)) #0b3017; }
.lb-sbar > div { height: 100%; background: repeating-linear-gradient(90deg, #7ae088 0 calc(3px * var(--s)), #1b6630 calc(3px * var(--s)) calc(4px * var(--s))); box-shadow: 0 0 calc(3px * var(--s)) rgba(67, 182, 90, 0.6); transition: width 150ms steps(6); }
.lb-sbar > div.dn { background: repeating-linear-gradient(90deg, #ff9a6a 0 calc(3px * var(--s)), #8a2a12 calc(3px * var(--s)) calc(4px * var(--s))); }
.lb-warn { margin: calc(3px * var(--s)) 0; font-size: calc(7px * var(--s)); line-height: calc(7px * var(--s)); }
.lb-slots { display: grid; grid-template-columns: repeat(4, 1fr); gap: calc(1px * var(--s)); font-size: calc(6px * var(--s)); margin: calc(2px * var(--s)) 0; }
.lb-slots div { background: #030a05; box-shadow: inset 0 0 0 1px #0b3017; padding: calc(1px * var(--s)); text-align: center; }
.lb-slots b { display: block; font-size: calc(8px * var(--s)); }
.lb-slots .full b { color: var(--amber); text-shadow: var(--amb-glow); }
.lb-act { margin-top: auto; display: flex; flex-direction: column; gap: calc(3px * var(--s)); }
.lb-act .px-btn.big { min-width: 0; width: 100%; }
.lb-cost { display: flex; flex-wrap: wrap; align-items: center; gap: calc(2px * var(--s)); font-size: calc(7px * var(--s)); }
.lb-cost img { width: calc(9px * var(--s)); height: calc(9px * var(--s)); vertical-align: middle; }
/* ---- the parts dock */
.lab .lb-dock { left: 0; right: 0; bottom: 0; height: calc(116px * var(--s)); pointer-events: none; display: flex; flex-direction: column; }
.lb-head { pointer-events: auto; margin: 0 auto; display: flex; align-items: center; gap: calc(3px * var(--s)); padding: 0 calc(2px * var(--s)) !important; max-width: calc(100vw - 8px); box-sizing: border-box; }
.lb-area { font-size: calc(10px * var(--s)); color: var(--gold); text-shadow: var(--amb-glow); white-space: nowrap; min-width: calc(60px * var(--s)); }
.lb-area small { display: block; font-size: calc(6px * var(--s)); color: var(--dim); text-shadow: none; white-space: normal; max-width: calc(130px * var(--s)); line-height: calc(6px * var(--s)); }
.lb-tabs { display: flex; gap: calc(1px * var(--s)); overflow-x: auto; scrollbar-width: none; touch-action: pan-x; }
.lb-tab { flex: none; display: flex; align-items: center; gap: calc(1px * var(--s)); font-family: 'VT'; font-size: calc(7px * var(--s)); line-height: calc(7px * var(--s)); background: #16181a; color: var(--stamp); border: none; box-shadow: inset 0 0 0 calc(1px * var(--s)) #363c43; padding: calc(1px * var(--s)) calc(2px * var(--s)); cursor: inherit; }
.lb-tab img { width: calc(9px * var(--s)); height: calc(9px * var(--s)); }
.lb-tab.hint { box-shadow: inset 0 0 0 calc(1px * var(--s)) #8c6a22; color: var(--gold); }
.lb-tab.act { background: #0b3017; color: var(--hot); box-shadow: inset 0 0 0 calc(1px * var(--s)) #43b65a; text-shadow: var(--phos-glow); }
.lb-tab.empty { opacity: 0.55; }
.lb-tab .n { color: var(--gold); margin-left: 1px; }
.lb-strip { pointer-events: auto; flex: 1; display: flex; gap: calc(4px * var(--s)); align-items: flex-end; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x proximity; touch-action: pan-x; padding: 0 calc(12px * var(--s)) calc(3px * var(--s)); scrollbar-width: none; overscroll-behavior: contain; }
.lb-strip::-webkit-scrollbar, .lb-tabs::-webkit-scrollbar, .lab .lb-left::-webkit-scrollbar, .lab .lb-right::-webkit-scrollbar { display: none; }
.lb-strip.center { justify-content: safe center; }
.lb-card { flex: none; position: relative; width: calc(60px * var(--s)); height: calc(88px * var(--s)); scroll-snap-align: center; cursor: inherit; transition: transform 90ms steps(3); }
.lb-card:hover, .lb-card.hov { transform: translateY(calc(-3px * var(--s))); }
.lb-win { position: absolute; left: calc(2px * var(--s)); right: calc(2px * var(--s)); top: calc(2px * var(--s)); height: calc(50px * var(--s)); box-shadow: 0 0 0 calc(2px * var(--s)) #0c0e0c, 0 0 0 calc(3px * var(--s)) var(--cc, #43b65a), 0 calc(3px * var(--s)) 0 calc(3px * var(--s)) #050605; }
.lb-win::before, .lb-win::after { content: ''; position: absolute; width: calc(5px * var(--s)); height: calc(5px * var(--s)); border: solid var(--cc, #43b65a); opacity: 0.9; }
.lb-win::before { left: calc(2px * var(--s)); top: calc(2px * var(--s)); border-width: calc(1px * var(--s)) 0 0 calc(1px * var(--s)); }
.lb-win::after { right: calc(2px * var(--s)); bottom: calc(2px * var(--s)); border-width: 0 calc(1px * var(--s)) calc(1px * var(--s)) 0; }
.lb-info { position: absolute; left: 0; right: 0; bottom: 0; height: calc(34px * var(--s)); box-sizing: border-box; padding: calc(3px * var(--s)) calc(3px * var(--s)) calc(2px * var(--s)); display: flex; flex-direction: column; gap: 1px; text-align: center; color: #2a2418; text-shadow: none;
  background: repeating-linear-gradient(90deg, transparent 0 calc(3px * var(--s)), rgba(120, 90, 50, 0.13) calc(3px * var(--s)) calc(4px * var(--s))), linear-gradient(180deg, #ece4c6, #d8cea8);
  box-shadow: inset 0 calc(-1px * var(--s)) 0 #a89e7a, inset calc(-1px * var(--s)) 0 0 #b4aa86; clip-path: polygon(0 0, 100% 0, 100% 100%, calc(5px * var(--s)) 100%, 0 calc(100% - calc(5px * var(--s)))); }
.lb-info .nm { font-family: 'Jersey'; font-size: calc(9px * var(--s)); line-height: calc(8px * var(--s)); color: #1a1610; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lb-info .mt { font-size: calc(6px * var(--s)); line-height: calc(6px * var(--s)); color: #6a5a3a; white-space: nowrap; overflow: hidden; }
.lb-info .fx { font-size: calc(6px * var(--s)); line-height: calc(6px * var(--s)); color: #2a4a2a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lb-st { position: absolute; top: calc(-4px * var(--s)); right: calc(-1px * var(--s)); font-size: calc(6px * var(--s)); line-height: calc(7px * var(--s)); padding: 0 calc(2px * var(--s)); color: #ece4c6; background: #1b6630; z-index: 2; }
.lb-card.on .lb-st { background: var(--gold); color: #1a1610; box-shadow: 0 0 calc(4px * var(--s)) rgba(255, 200, 100, 0.6); }
.lb-card.on .lb-info { background: repeating-linear-gradient(90deg, transparent 0 calc(3px * var(--s)), rgba(120, 90, 50, 0.13) calc(3px * var(--s)) calc(4px * var(--s))), linear-gradient(180deg, #fff2c8, #f0d890); }
.lb-card.lock .lb-st { background: #6a2a1a; }
.lb-card.lock .lb-info { filter: grayscale(0.7) brightness(0.8); }
.lb-card.unk .lb-info { filter: grayscale(1) brightness(0.6); }
.lb-card.none .lb-win { box-shadow: 0 0 0 calc(2px * var(--s)) #0c0e0c, 0 0 0 calc(3px * var(--s)) #6a2a1a; background: repeating-linear-gradient(45deg, rgba(10, 12, 10, 0.92) 0 calc(4px * var(--s)), rgba(40, 20, 14, 0.92) calc(4px * var(--s)) calc(8px * var(--s))); }
.lb-card.none .lb-win span { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: calc(14px * var(--s)); color: var(--warn); }
.lb-lv { position: absolute; left: calc(4px * var(--s)); top: calc(4px * var(--s)); font-size: calc(6px * var(--s)); color: var(--gold); text-shadow: var(--amb-glow); z-index: 2; pointer-events: none; }
.lb-hint { pointer-events: none; align-self: center; margin-bottom: calc(10px * var(--s)); font-size: calc(9px * var(--s)); color: var(--hot); text-shadow: var(--phos-glow); animation: blink 1.6s steps(2) infinite; letter-spacing: 1px; text-align: center; }
/* hide & colour editor */
.lb-paint { pointer-events: auto; position: absolute; left: 50%; bottom: calc(100% + 2px * var(--s)); transform: translateX(-50%); display: flex; gap: calc(4px * var(--s)); align-items: flex-start; padding: 0 calc(3px * var(--s)) !important; max-width: calc(100vw - 8px); box-sizing: border-box; overflow-x: auto; }
.lb-sw { display: grid; grid-template-columns: calc(22px * var(--s)) 1fr; align-items: center; gap: 1px calc(2px * var(--s)); font-size: calc(6px * var(--s)); }
.lb-chips { display: flex; gap: 1px; }
.lb-chip { width: calc(6px * var(--s)); height: calc(6px * var(--s)); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.6); cursor: inherit; }
.lb-chip.on { box-shadow: 0 0 0 1px #fff0c4, 0 0 0 calc(2px * var(--s)) #8c4a12; }
.lb-pats { display: flex; flex-wrap: wrap; gap: calc(1px * var(--s)); max-width: calc(120px * var(--s)); }
.lb-pat { font-family: 'VT'; font-size: calc(7px * var(--s)); line-height: calc(7px * var(--s)); background: #16181a; color: var(--stamp); border: none; box-shadow: inset 0 0 0 calc(1px * var(--s)) #363c43; padding: calc(1px * var(--s)) calc(2px * var(--s)); cursor: inherit; }
.lb-pat.on { color: #1a1610; background: var(--gold); box-shadow: inset 0 0 0 calc(1px * var(--s)) #8c4a12; }
/* scientists' lines, the region tag, the save stamp, the shelf */
.lb-say { position: absolute; transform: translate(-50%, -100%); pointer-events: none; max-width: calc(110px * var(--s)); padding: calc(2px * var(--s)) calc(4px * var(--s)); background: #f0ead6; color: #1a1610; text-shadow: none; font-size: calc(7px * var(--s)); line-height: calc(7px * var(--s)); box-shadow: 0 0 0 calc(1px * var(--s)) #1a1610, calc(2px * var(--s)) calc(2px * var(--s)) 0 rgba(0, 0, 0, 0.45); animation: lb-pop 160ms steps(3); }
.lb-say b { display: block; color: #8c4a12; font-size: calc(6px * var(--s)); text-shadow: none; }
.lb-say::after { content: ''; position: absolute; left: 50%; bottom: calc(-4px * var(--s)); width: calc(4px * var(--s)); height: calc(4px * var(--s)); background: #f0ead6; box-shadow: calc(1px * var(--s)) calc(1px * var(--s)) 0 #1a1610; transform: translateX(-50%) rotate(45deg); }
.lb-say.out { opacity: 0; transition: opacity 300ms steps(3); }
@keyframes lb-pop { 0% { transform: translate(-50%, -80%) scale(0.6); } 100% { transform: translate(-50%, -100%) scale(1); } }
.lb-tag { position: absolute; pointer-events: none; padding: calc(1px * var(--s)) calc(3px * var(--s)); font-size: calc(8px * var(--s)); line-height: calc(8px * var(--s)); background: rgba(2, 10, 5, 0.85); color: var(--hot); text-shadow: var(--phos-glow); box-shadow: inset 0 0 0 1px #43b65a; white-space: nowrap; }
.lb-tag i { display: block; color: var(--gold); font-size: calc(6px * var(--s)); text-shadow: var(--amb-glow); }
.lb-stamp { position: absolute; left: 50%; top: 40%; transform: translate(-50%, -50%) rotate(-8deg); pointer-events: none; font-family: 'VT'; font-size: calc(30px * var(--s)); line-height: 1; color: #d83a2a; border: calc(3px * var(--s)) solid #d83a2a; padding: calc(2px * var(--s)) calc(8px * var(--s)); letter-spacing: 3px; text-shadow: none; opacity: 0.92; animation: lb-stamp 260ms steps(4); mix-blend-mode: screen; }
.lb-stamp small { display: block; font-size: calc(9px * var(--s)); text-align: center; letter-spacing: 1px; }
@keyframes lb-stamp { 0% { transform: translate(-50%, -50%) rotate(-8deg) scale(2.4); opacity: 0; } 100% { transform: translate(-50%, -50%) rotate(-8deg) scale(1); opacity: 0.92; } }
.lb-shelf { position: absolute; left: calc(68px * var(--s)); top: calc(28px * var(--s)); width: calc(140px * var(--s)); max-height: calc(100vh - 146px * var(--s)); overflow: hidden auto; pointer-events: auto; z-index: 4; display: none; }
.lb-shelf.open { display: block; animation: crt-on 260ms steps(6); }
.lb-jar { display: grid; grid-template-columns: calc(26px * var(--s)) 1fr; gap: calc(2px * var(--s)); align-items: center; padding: calc(1px * var(--s)); cursor: inherit; font-size: calc(7px * var(--s)); line-height: calc(7px * var(--s)); }
.lb-jar:hover, .lb-jar.hov { background: #0b3017; color: var(--hot); }
.lb-jar img { width: calc(26px * var(--s)); height: calc(26px * var(--s)); background: #020805; box-shadow: inset 0 0 0 1px #1b6630; }
.lb-jar i { display: block; color: var(--dim); font-size: calc(6px * var(--s)); }
.lb-veil { position: absolute; inset: 0; background: #020403; pointer-events: none; opacity: 1; transition: opacity 600ms steps(8); z-index: 9; display: flex; align-items: center; justify-content: center; color: var(--glow); text-shadow: var(--phos-glow); font-size: calc(10px * var(--s)); letter-spacing: 2px; }
.lb-veil.off { opacity: 0; }
@media (max-width: 980px) {
  .lb-toggle { display: inline-flex !important; }
  .lab .lb-right { display: none; z-index: 5; }
  .lab .lb-right.open { display: flex; }
  .lb-latin, .lb-title small { display: none; }
  .lb-name { width: calc(78px * var(--s)); }
  .lb-top .px-btn .lbl { display: none; }
  .lb-top .px-btn.big, .lb-top .px-btn.wide { width: calc(24px * var(--s)); padding: 0; }
  .lb-top .px-btn.big .ico, .lb-top .px-btn.wide .ico { margin: 0; }
}
@media (max-width: 560px) { .lb-title { display: none; } .lab .lb-tools { width: calc(24px * var(--s)); } .lb-tools .px-btn .lbl { display: none; } .lab .lb-left, .lb-shelf { left: calc(28px * var(--s)); } }
@media (max-height: 560px) { .lab .lb-dock { height: calc(100px * var(--s)); } .lb-card { height: calc(76px * var(--s)); width: calc(52px * var(--s)); } .lb-win { height: calc(42px * var(--s)); } .lb-info { height: calc(30px * var(--s)); } }
body.lab-open [class^="tc-"], body.lab-open [class*=" tc-"] { display: none !important; }
@media (max-height: 450px) {
  .lab .lb-dock { height: calc(84px * var(--s)); }
  .lb-card { width: calc(46px * var(--s)); height: calc(64px * var(--s)); }
  .lb-win { height: calc(34px * var(--s)); }
  .lb-info { height: calc(28px * var(--s)); padding-top: calc(2px * var(--s)); } .lb-info .fx { display: none; }
  .lb-area small, .lb-title { display: none; }
  .lab .lb-tools, .lab .lb-right, .lab .lb-left, .lb-shelf { top: calc(24px * var(--s)); max-height: calc(100vh - 112px * var(--s)); }
  .lb-tools .px-btn.wide { height: calc(16px * var(--s)); }
}
`;
function injectCSS() {
  if (document.getElementById('lab-css')) return;
  const s = document.createElement('style'); s.id = 'lab-css'; s.textContent = CSS; document.head.appendChild(s);
}

export interface CardSpec { gene: string | null; name: string; meta: string; fx: string; state: 'on' | 'ok' | 'lock' | 'unk' | 'none'; tag: string; col: number; lv?: number; tip: string }
export interface LabHandlers {
  tab(t: TabId | 'genome'): void; card(gene: string | null, i: number): void; hoverCard(el: HTMLElement | null, gene: string | null): void;
  save(): void; leave(): void; reset(): void; reroll(): void; name(s: string): void;
  slider(key: keyof Design, v: number): void; color(k: 'base' | 'belly' | 'pattern' | 'accent' | 'eye', c: number): void; pattern(p: Pattern): void; cover(c: Cover): void;
  shelf(open: boolean): void; jar(i: number): void; hoverJar(i: number): void;
  saveDisabled(): string | false;
}
export const SWATCH = [0x6a5a3a, 0x9a7a4a, 0xc8a040, 0xd8c08a, 0xe8e0c8, 0x5a6a3a, 0x3a7a5a, 0x2a6a7a, 0x3a4a7a, 0x5a3a7a, 0x8a3a5a, 0xa83a2a, 0xd86a2a, 0x2a2a30, 0x6a6a70, 0xb0a8a0, 0x7affe0, 0xffe070];
const EYES = [0x7affe0, 0xffe070, 0xff6a4a, 0x101010, 0x40c8e8, 0xf0f0e0, 0x80e040];
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

export class LabUI {
  readonly root: HTMLDivElement;
  readonly nameIn: HTMLInputElement; readonly latin: HTMLDivElement;
  readonly left: HTMLDivElement; readonly right: HTMLDivElement;
  readonly stats: HTMLDivElement; readonly warn: HTMLDivElement; readonly slots: HTMLDivElement; readonly cost: HTMLDivElement;
  readonly area: HTMLDivElement; readonly tabs: HTMLDivElement; readonly strip: HTMLDivElement; readonly paint: HTMLDivElement; readonly head: HTMLDivElement;
  readonly shelfBox: HTMLDivElement; readonly tagEl: HTMLDivElement; readonly veil: HTMLDivElement;
  private saveBtn!: Btn; private toolBtns: Btn[] = []; private sliders: { key: keyof Design; set: (v: number) => void; cap: HTMLDivElement }[] = [];
  private tabEls = new Map<string, HTMLButtonElement>();
  cards: HTMLDivElement[] = [];
  private bubbles: { e: HTMLDivElement; who: number; t: number }[] = [];

  constructor(readonly h: LabHandlers) {
    injectCSS();
    this.root = el('div', 'lab', ui());
    // ---- top: title plate and the specimen's name
    const top = panel('lb-p lb-top', this.root, 'dark');
    el('div', 'lb-title', top, 'GENE LAB<small>U.S.P.C. FIELD LABORATORY 4</small>');
    this.nameIn = el('input', 'lb-name', top) as HTMLInputElement; this.nameIn.maxLength = 28; this.nameIn.spellcheck = false;
    this.nameIn.addEventListener('input', () => h.name(this.nameIn.value));
    this.nameIn.addEventListener('keydown', (e) => e.stopPropagation());
    this.latin = el('div', 'lb-latin', top);
    new Btn(top, { icon: 'dna', size: 'sq', tip: () => '<h4>Re-roll</h4>New colours, pattern and a new name.' }, () => h.reroll());
    this.saveBtn = new Btn(top, { icon: 'brood', label: 'FILE PREFAB', size: 'big', disabled: () => h.saveDisabled(), tip: () => '<h4>File as a prefab</h4>Save this design to your species. Grow it in a Brood Womb; with the Flesh Printer, print living copies.' }, () => h.save());
    new Btn(top, { icon: 'stop', label: 'LEAVE', size: 'wide', tip: () => 'Back to the field. Unfiled changes are lost. [ESC]' }, () => h.leave());
    new Btn(top, { icon: 'cat-meta', size: 'sq', cls: 'lb-toggle', tip: () => 'Phenotype' }, () => { this.right.classList.toggle('open'); this.left.classList.remove('open'); });
    // ---- left: a column of tools; proportions and the jar shelf open beside it
    const tools = panel('lb-p lb-tools', this.root, 'inset');
    const drawer = (which: 'left' | 'shelf') => {
      const lo = which === 'left' ? !this.left.classList.contains('open') : false, so = which === 'shelf' ? !this.shelfBox.classList.contains('open') : false;
      this.left.classList.toggle('open', lo); this.shelfBox.classList.toggle('open', so); this.right.classList.remove('open');
      this.toolBtns.forEach((b, i) => { b.o.active = () => (i === 0 ? this.left.classList.contains('open') : i === 1 ? this.shelfBox.classList.contains('open') : false); b.refresh(); });
      h.shelf(so);
    };
    this.toolBtns.push(new Btn(tools, { icon: 'cat-body', label: 'SHAPE', size: 'wide', tip: () => '<h4>Proportions</h4>Size, length, girth, legs, neck, head and tail.' }, () => drawer('left')));
    this.toolBtns.push(new Btn(tools, { icon: 'tree', label: 'JARS', size: 'wide', tip: () => '<h4>Specimen shelf</h4>Every species you have absorbed is kept in a jar. Click a jar on the shelves, or pick one here, to put it in the tank.' }, () => drawer('shelf')));
    new Btn(tools, { icon: 'stop', label: 'RESET', size: 'wide', tip: () => 'Back to the specimen you started with.' }, () => h.reset());
    this.left = panel('lb-p lb-left', this.root);
    el('div', 'lb-h', this.left, 'PROPORTIONS');
    const sl = (label: string, key: keyof Design, tip: string) => {
      const row = el('div', 'lb-sl', this.left);
      el('span', '', row, label);
      const tr = el('div', 'track', row), cap = el('div', 'cap', tr), knob = el('div', 'knob', tr);
      cap.style.width = '0';
      const set = (v: number) => { knob.style.left = `calc(${v * 100}% - ${3 * S}px)`; };
      const upd = (e: PointerEvent) => { const r = tr.getBoundingClientRect(); const v = clamp((e.clientX - r.left) / r.width, 0, 1); h.slider(key, v); };
      tr.addEventListener('pointerdown', (e) => { e.stopPropagation(); tr.setPointerCapture(e.pointerId); upd(e); sfx('click', 1, 0.4); });
      tr.addEventListener('pointermove', (e) => { if (tr.hasPointerCapture(e.pointerId)) upd(e); });
      row.addEventListener('pointerenter', () => Tip.show(`<h4>${label}</h4>${tip}`, row)); row.addEventListener('pointerleave', () => Tip.hide());
      this.sliders.push({ key, set, cap });
    };
    sl('SIZE', 'size', 'Overall body size. Mass grows with the cube of length: big bodies are strong, slow to grow and hungry. Full size needs the Growth Vat.');
    sl('LENGTH', 'len', 'Body length for its size.');
    sl('GIRTH', 'girth', 'Width and depth of the torso: more mass, more organs, more food needed.');
    sl('LEG LEN', 'legLen', 'Longer legs take longer strides: faster, but they must carry the body.');
    sl('LEG BONE', 'legThick', 'Bone or chitin cross-section. Too thin for the mass and the animal is slow and fragile.');
    sl('NECK', 'neck', 'Reach and grazing height.');
    sl('HEAD', 'head', 'Bigger heads carry bigger eyes and jaws.');
    sl('TAIL', 'tail', 'Balance and counterweight.');
    el('div', 'small', this.left, 'DRAG TO WALK ROUND THE TANK · WHEEL OR PINCH TO ZOOM').style.cssText = `font-size:calc(6px * var(--s));line-height:calc(7px * var(--s));color:var(--dim);margin-top:calc(2px * var(--s))`;
    // ---- right: phenotype and filing
    this.right = panel('lb-p lb-right', this.root);
    el('div', 'lb-h', this.right, 'PHENOTYPE');
    this.stats = el('div', 'lb-stats', this.right);
    this.warn = el('div', 'lb-warn', this.right);
    el('div', 'lb-h', this.right, 'GENE SLOTS');
    this.slots = el('div', 'lb-slots', this.right);
    el('div', 'lb-h', this.right, 'COST');
    this.cost = el('div', 'lb-cost', this.right);
    // ---- the shelf drawer
    this.shelfBox = panel('lb-shelf', this.root, 'dark');
    // ---- bottom dock
    const dock = el('div', 'lb-p lb-dock', this.root);
    this.paint = panel('lb-paint', dock, 'dark'); this.paint.style.display = 'none';
    this.head = panel('lb-head', dock, 'dark');
    this.area = el('div', 'lb-area', this.head);
    this.tabs = el('div', 'lb-tabs', this.head);
    for (const t of ['genome', ...TAB_ORDER] as (TabId | 'genome')[]) {
      const b = el('button', 'lb-tab', this.tabs); b.dataset.t = t;
      el('img', '', b).setAttribute('src', icon(t === 'genome' ? 'dna' : TABS[t as TabId].icon, { shadow: true }));
      el('span', '', b, t === 'genome' ? 'GENOME' : TABS[t as TabId].short);
      el('span', 'n', b);
      b.addEventListener('click', (e) => { e.stopPropagation(); sfx('click', 1, 0.5); h.tab(t); });
      b.addEventListener('pointerenter', () => { if (t !== 'genome') Tip.show(`<h4>${TABS[t as TabId].name}</h4>${TABS[t as TabId].desc}`, b); });
      b.addEventListener('pointerleave', () => Tip.hide());
      this.tabEls.set(t, b);
    }
    this.strip = el('div', 'lb-strip', dock);
    this.strip.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { this.strip.scrollLeft += e.deltaY; e.preventDefault(); } e.stopPropagation(); }, { passive: false });
    this.tagEl = el('div', 'lb-tag', this.root); this.tagEl.style.display = 'none';
    this.veil = el('div', 'lb-veil', this.root, 'OPENING THE FIELD LABORATORY...');
    this.buildPaint();
  }

  // ---------------------------------------------------------------------------------------------- tabs & cards
  setTab(t: TabId | 'genome', hint: TabId[], counts: Partial<Record<TabId | 'genome', number>>, title: string, sub: string) {
    for (const [k, b] of this.tabEls) {
      b.classList.toggle('act', k === t); b.classList.toggle('hint', hint.includes(k as TabId) && k !== t);
      const n = counts[k as TabId] ?? 0; (b.querySelector('.n') as HTMLElement).textContent = n ? String(n) : '';
      b.classList.toggle('empty', k !== 'genome' && !n);
    }
    this.area.innerHTML = `${title}<small>${sub}</small>`;
    this.tabEls.get(t)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  setCards(list: CardSpec[], hint?: string) {
    const keepScroll = this.strip.dataset.k === list.map((c) => c.gene).join(',');
    const sx = this.strip.scrollLeft;
    this.strip.innerHTML = ''; this.cards = [];
    if (hint) { el('div', 'lb-hint', this.strip, hint); }
    list.forEach((c, i) => {
      const card = el('div', `lb-card ${c.state}`, this.strip);
      card.style.setProperty('--cc', hex(c.col));
      const win = el('div', 'lb-win', card);
      if (c.state === 'none') el('span', '', win, '✕');
      if (c.lv) el('div', 'lb-lv', card, `LV ${c.lv}`);
      const info = el('div', 'lb-info', card);
      el('div', 'nm', info, c.name); el('div', 'mt', info, c.meta); el('div', 'fx', info, c.fx);
      el('div', 'lb-st', card, c.tag);
      card.addEventListener('click', (e) => { e.stopPropagation(); this.h.card(c.gene, i); });
      card.addEventListener('pointerenter', () => { card.classList.add('hov'); this.h.hoverCard(win, c.gene); if (c.tip) Tip.show(c.tip, card); sfx('hover', 1, 0.5); });
      card.addEventListener('pointerleave', () => { card.classList.remove('hov'); this.h.hoverCard(null, null); Tip.hide(); });
      (card as HTMLDivElement & { win?: HTMLElement }).win = win;
      this.cards.push(card);
    });
    this.strip.classList.toggle('center', this.strip.scrollWidth <= this.strip.clientWidth + 2);
    this.strip.dataset.k = list.map((c) => c.gene).join(',');
    if (keepScroll) this.strip.scrollLeft = sx;
  }
  scrollTo(i: number) { const c = this.cards[i]; if (c) c.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); }

  // ---------------------------------------------------------------------------------------------- hide & colour
  private buildPaint() {
    const p = this.paint;
    const sw = el('div', 'lb-sw', p);
    for (const [k, lab] of [['base', 'BODY'], ['belly', 'BELLY'], ['pattern', 'MARKS'], ['accent', 'ACCENT'], ['eye', 'EYES']] as const) {
      el('span', '', sw, lab);
      const row = el('div', 'lb-chips', sw);
      for (const c of k === 'eye' ? EYES : SWATCH) { const ch = el('div', 'lb-chip', row); ch.style.background = hex(c); ch.dataset.k = k; ch.dataset.c = String(c); ch.addEventListener('click', (e) => { e.stopPropagation(); this.h.color(k, c); sfx('click', 1, 0.4); }); }
    }
    const col = el('div', '', p);
    el('div', 'lb-h', col, 'PATTERN');
    const pr = el('div', 'lb-pats', col);
    for (const pt of ['plain', 'stripes', 'spots', 'bands', 'mottled', 'saddle', 'rings'] as Pattern[]) { const b = el('button', 'lb-pat', pr, pt.toUpperCase()); b.dataset.p = pt; b.addEventListener('click', (e) => { e.stopPropagation(); this.h.pattern(pt); sfx('click', 1, 0.4); }); }
    el('div', 'lb-h', col, 'COVER');
    const cr = el('div', 'lb-pats', col);
    for (const c of ['chitin', 'fur', 'scales', 'skin', 'slime'] as Cover[]) { const b = el('button', 'lb-pat', cr, c.toUpperCase()); b.dataset.c = c; b.addEventListener('click', (e) => { e.stopPropagation(); this.h.cover(c); sfx('click', 1, 0.4); }); }
  }
  showPaint(on: boolean, d: Design) {
    this.paint.style.display = on ? '' : 'none';
    if (!on) return;
    for (const ch of Array.from(this.paint.querySelectorAll('.lb-chip'))) { const e = ch as HTMLElement; e.classList.toggle('on', (d.colors as unknown as Record<string, number>)[e.dataset.k!] === Number(e.dataset.c)); }
    for (const b of Array.from(this.paint.querySelectorAll('.lb-pat'))) { const e = b as HTMLElement; e.classList.toggle('on', e.dataset.p ? e.dataset.p === d.pattern : e.dataset.c === d.cover); }
  }

  // ---------------------------------------------------------------------------------------------- readouts
  setDesign(d: Design, cap: number) {
    if (document.activeElement !== this.nameIn) this.nameIn.value = d.name;
    this.latin.textContent = d.latin;
    for (const s of this.sliders) { s.set(d[s.key] as number); s.cap.style.width = s.key === 'size' && cap < 1 ? `${(1 - cap) * 100}%` : '0'; }
  }
  refresh() { this.saveBtn.refresh(); }

  // ---------------------------------------------------------------------------------------------- shelf
  setShelf(list: { name: string; sub: string; img: string }[]) {
    const b = this.shelfBox; b.innerHTML = '';
    el('div', 'lb-h', b, 'SPECIMEN JARS');
    if (!list.length) el('div', 'small', b, 'No specimens yet. Absorb a creature and its jar appears here.');
    list.forEach((j, i) => {
      const r = el('div', 'lb-jar', b);
      const im = el('img', '', r) as HTMLImageElement; if (j.img) im.src = j.img;
      el('div', '', r, `${j.name}<i>${j.sub}</i>`);
      r.addEventListener('click', (e) => { e.stopPropagation(); this.h.jar(i); });
      r.addEventListener('pointerenter', () => this.h.hoverJar(i)); r.addEventListener('pointerleave', () => this.h.hoverJar(-1));
    });
  }
  closeShelf() { this.shelfBox.classList.remove('open'); this.toolBtns.forEach((b) => b.refresh()); }

  // ---------------------------------------------------------------------------------------------- floating bits
  tag(html: string | null, x = 0, y = 0) {
    if (!html) { this.tagEl.style.display = 'none'; return; }
    this.tagEl.innerHTML = html; this.tagEl.style.display = 'block';
    const w = this.tagEl.offsetWidth;
    this.tagEl.style.left = Math.min(innerWidth - w - 4, x + 14) + 'px'; this.tagEl.style.top = Math.max(4, y - 30) + 'px';
  }
  say(who: number, name: string, text: string, col: string) {
    for (const b of this.bubbles) if (b.who === who) b.t = Math.min(b.t, 0.3);
    const e = el('div', 'lb-say', this.root, `<b style="color:${col === '#ffcd6e' ? '#8c4a12' : col === '#9fd0ff' ? '#2a4a8a' : '#1b6630'}">${name}</b>${text}`);
    this.bubbles.push({ e, who, t: 2.6 + text.length * 0.04 });
  }
  /** keep the lines over the speakers' heads */
  tickBubbles(dt: number, pos: (who: number) => [number, number, boolean]) {
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.t -= dt;
      const [x, y, ok] = pos(b.who);
      const hw = b.e.offsetWidth / 2 + 4;
      b.e.style.left = clamp(x, hw, innerWidth - hw) + 'px'; b.e.style.top = clamp(y, b.e.offsetHeight + 30, innerHeight) + 'px';
      b.e.style.visibility = ok ? 'visible' : 'hidden';
      if (b.t < 0.3) b.e.classList.add('out');
      if (b.t <= 0) { b.e.remove(); this.bubbles.splice(i, 1); }
    }
  }
  stamp(title: string, sub: string) { const s = el('div', 'lb-stamp', this.root, `${title}<small>${sub}</small>`); setTimeout(() => s.remove(), 2400); }
  ready() { this.veil.classList.add('off'); setTimeout(() => this.veil.remove(), 700); }
  dispose() { this.root.remove(); Tip.hide(); }
}
export { iconImg };
