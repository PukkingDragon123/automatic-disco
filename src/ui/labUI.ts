// The gene lab's 2D panels, made of what a 1957 field lab had on the bench: an olive-enamel instrument strip with
// Bakelite controls across the top, a masonite clipboard holding the typed specimen record (it types itself as the
// specimen changes, the species name is rubber-stamped, Dr. Calder pencils his notes in the margin), a cyanotype
// drawing of the body proportions, a typed catalogue of the specimen jars, and along the bottom a card file: manila
// divider tabs on a steel drawer front, and McBee edge-notched index cards that slide up out of the drawer, each
// with a window cut in it where the 3D part turns (labIcons.ts). Everything is drawn at device resolution
// (labPaper.ts) in a muted, physical palette with one accent, stamp red.
import { el, ui, Tip } from './kit';
import { sfx } from '../audio/audio';
import { clamp } from '../core/rand';
import type { Design, Pattern, Cover } from '../life/design';
import type { GeneCat } from '../life/genes';
import { TABS, TAB_ORDER, type TabId } from './labRules';
import { paper, enamel, board, blueprint, notchCard, inkMask, paintEl, unpaint, type, pencil, reduced, PAL } from './labPaper';

const CSS = `
.lab, #ui > .lab { position: fixed; inset: 0; pointer-events: none; z-index: 3; font-family: 'Pixelify', monospace; color: ${PAL.graphite}; -webkit-font-smoothing: none; }
.lab .lb-p { position: absolute; pointer-events: auto; }
.lab b { color: inherit; font-weight: normal; }
.lab .vt { font-family: 'VT', monospace; font-size: var(--vt); line-height: calc(var(--vt) * 1.05); }
.lab .np { font-family: 'Jersey', monospace; font-size: var(--np); line-height: var(--np); letter-spacing: 0.04em; }
.lab .ps { font-family: 'Pixelify', monospace; font-size: var(--ps); line-height: calc(var(--ps) * 1.15); }
.lab .sw { font-family: 'Superwide', monospace; font-size: var(--sw); line-height: var(--sw); letter-spacing: 0.12em; }
.lb-caret { display: inline-block; width: 0.55em; height: 0.9em; margin-left: 1px; background: ${PAL.graphite}; vertical-align: -0.1em; opacity: 0.8; animation: lb-car 0.5s steps(2) infinite; }
@keyframes lb-car { 50% { opacity: 0; } }
/* ---------------------------------------------------------------- instrument strip */
.lab .lb-top { top: calc(6 * var(--k)); left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: calc(12 * var(--k)); padding: calc(6 * var(--k)) calc(14 * var(--k)); box-shadow: 0 calc(3 * var(--k)) calc(8 * var(--k)) rgba(10, 9, 6, 0.55); border-radius: calc(3 * var(--k)); max-width: calc(100vw - 12px); box-sizing: border-box; }
.lb-title { color: rgba(217, 210, 191, 0.88); text-shadow: 0 -1px 0 rgba(0, 0, 0, 0.55), 0 1px 0 rgba(255, 250, 230, 0.12); white-space: nowrap; }
.lb-title .sw { display: block; font-size: calc(var(--sw) * 2); line-height: calc(var(--sw) * 2); letter-spacing: 0.08em; }
.lb-title .np { display: block; color: rgba(217, 210, 191, 0.6); margin-top: calc(2 * var(--k)); }
.lb-holder { position: relative; padding: calc(4 * var(--k)) calc(6 * var(--k)) calc(3 * var(--k)); background: linear-gradient(180deg, #9a9c96, #6c6e69 45%, #8d8f8a); border-radius: calc(2 * var(--k)); box-shadow: inset 0 1px 0 rgba(255, 255, 250, 0.35), inset 0 -1px 0 rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.5); }
.lb-slip { position: relative; padding: calc(2 * var(--k)) calc(6 * var(--k)); box-shadow: inset 0 1px 2px rgba(40, 30, 20, 0.45); }
.lb-name { display: block; font-family: 'VT', monospace; font-size: var(--vt); line-height: var(--vt); width: calc(196 * var(--k)); background: transparent; border: none; outline: none; color: ${PAL.graphite}; padding: 0; caret-color: ${PAL.stamp}; }
.lb-latin { font-family: 'Pixelify', monospace; font-size: var(--ps); line-height: var(--ps); color: #6a6658; font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: calc(196 * var(--k)); margin-top: 1px; }
.lb-ctl { display: flex; flex-direction: column; align-items: center; gap: calc(3 * var(--k)); background: none; border: none; padding: 0; cursor: inherit; color: inherit; font: inherit; }
.lb-ctl .lab-l { font-family: 'Jersey', monospace; font-size: var(--np); line-height: var(--np); letter-spacing: 0.06em; color: rgba(217, 210, 191, 0.85); text-shadow: 0 -1px 0 rgba(0, 0, 0, 0.6); white-space: nowrap; }
.lb-ctl.dis { cursor: not-allowed; } .lb-ctl.dis .lab-l { color: rgba(217, 210, 191, 0.4); }
/* a Bakelite push button in a steel bezel */
.lb-push .cap { position: relative; width: calc(26 * var(--k)); height: calc(26 * var(--k)); border-radius: 50%; background: radial-gradient(circle at 50% 50%, #7a7c78 0 62%, #3a3d40 63% 68%, #9a9c96 69% 74%, #2a2c2c 75%); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.6); }
.lb-push .cap::after { content: ''; position: absolute; inset: 22%; border-radius: 50%; background: radial-gradient(circle at 36% 30%, #7a5a44, ${PAL.bakelite} 58%, #1e120c); box-shadow: 0 calc(2 * var(--k)) 0 #140b07, 0 calc(2 * var(--k)) calc(3 * var(--k)) rgba(0, 0, 0, 0.6); transition: transform 70ms ease-out, box-shadow 70ms ease-out; }
.lb-push.red .cap::after { background: radial-gradient(circle at 36% 30%, #c9786a, #9e3a30 55%, #5a1c16); box-shadow: 0 calc(2 * var(--k)) 0 #3c120e, 0 calc(2 * var(--k)) calc(3 * var(--k)) rgba(0, 0, 0, 0.6); }
.lb-push:hover .cap::after { filter: brightness(1.12); }
.lb-push:active .cap::after { transform: translateY(calc(2 * var(--k))); box-shadow: 0 0 0 #140b07, 0 1px 1px rgba(0, 0, 0, 0.6); }
.lb-push.dis .cap::after { filter: grayscale(0.85) brightness(0.65); }
.lb-push.big .cap { width: calc(34 * var(--k)); height: calc(34 * var(--k)); }
/* a Bakelite knob with a pointer, on a ticked skirt */
.lb-knob .cap { position: relative; width: calc(28 * var(--k)); height: calc(28 * var(--k)); border-radius: 50%; background: repeating-conic-gradient(from -135deg, rgba(217, 210, 191, 0.75) 0 2deg, transparent 2deg 30deg) , radial-gradient(circle, transparent 60%, rgba(0, 0, 0, 0.0) 61%); }
.lb-knob .cap i { position: absolute; inset: 18%; border-radius: 50%; background: radial-gradient(circle at 36% 30%, #6e5040, ${PAL.bakelite} 55%, #1a0f0a); box-shadow: 0 calc(2 * var(--k)) calc(3 * var(--k)) rgba(0, 0, 0, 0.6), inset 0 0 0 1px rgba(0, 0, 0, 0.5); transition: transform 360ms cubic-bezier(0.3, 1.6, 0.5, 1); }
.lb-knob .cap i::after { content: ''; position: absolute; left: 47%; top: 6%; width: 7%; height: 36%; background: rgba(217, 210, 191, 0.9); border-radius: 1px; }
.lb-knob:hover .cap i { filter: brightness(1.12); }
/* a bat-handle toggle on a hex nut; up is on */
.lb-tog .cap { position: relative; width: calc(22 * var(--k)); height: calc(28 * var(--k)); }
.lb-tog .cap::before { content: ''; position: absolute; left: 50%; top: 52%; width: calc(14 * var(--k)); height: calc(14 * var(--k)); transform: translate(-50%, -50%); clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%); background: linear-gradient(160deg, #a6a8a2, #55585a 60%, #3a3d40); }
.lb-tog .cap i { position: absolute; left: 50%; top: 52%; width: calc(4 * var(--k)); height: calc(16 * var(--k)); margin-left: calc(-2 * var(--k)); transform-origin: 50% 100%; transform: translateY(-100%) rotate(155deg); border-radius: calc(2 * var(--k)) calc(2 * var(--k)) 1px 1px; background: linear-gradient(90deg, #6e706c, #e2e2dc 40%, #8d8f8a); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.6); transition: transform 180ms cubic-bezier(0.3, 1.5, 0.5, 1); }
.lb-tog.on .cap i { transform: translateY(-100%) rotate(25deg); }
.lb-tog .cap b { position: absolute; left: 50%; top: 52%; width: calc(6 * var(--k)); height: calc(6 * var(--k)); margin: calc(-3 * var(--k)) 0 0 calc(-3 * var(--k)); border-radius: 50%; background: #2a2c2c; }
/* Dymo tape label */
.dymo { display: inline-block; padding: 1px calc(4 * var(--k)) 0; background: #23221f; color: #ece6d4; font-family: 'Jersey', monospace; font-size: var(--np); line-height: calc(var(--np) + 2px); letter-spacing: 0.12em; text-shadow: 0 1px 0 rgba(0, 0, 0, 0.8); box-shadow: 0 1px 1px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.08); }
/* ---------------------------------------------------------------- tools plate and drawers */
.lab .lb-tools { left: calc(6 * var(--k)); top: calc(6 * var(--k)); display: flex; flex-direction: column; gap: calc(8 * var(--k)); padding: calc(12 * var(--k)) calc(10 * var(--k)) calc(10 * var(--k)); border-radius: calc(3 * var(--k)); box-shadow: 0 calc(3 * var(--k)) calc(8 * var(--k)) rgba(10, 9, 6, 0.55); }
.lb-tools .lb-ctl { flex-direction: row; gap: calc(6 * var(--k)); }
.lab .lb-left { left: calc(98 * var(--k)); top: calc(10 * var(--k)); width: calc(250 * var(--k)); padding: calc(14 * var(--k)) calc(14 * var(--k)) calc(12 * var(--k)); box-sizing: border-box; color: ${PAL.ink}; display: none; box-shadow: 0 calc(4 * var(--k)) calc(10 * var(--k)) rgba(5, 10, 18, 0.6); transform-origin: 0 0; }
.lab .lb-left.open { display: block; animation: lb-pull 260ms cubic-bezier(0.2, 0.9, 0.3, 1.15) both; }
@keyframes lb-pull { 0% { transform: translateX(calc(-30 * var(--k))) rotate(-1.5deg); opacity: 0; } 100% { transform: rotate(-0.4deg); opacity: 1; } }
.bp-t { color: rgba(232, 238, 240, 0.92); margin-bottom: calc(10 * var(--k)); }
.bp-t .np { display: block; color: rgba(232, 238, 240, 0.6); margin-top: calc(3 * var(--k)); }
.lb-sl { display: grid; grid-template-columns: calc(64 * var(--k)) 1fr calc(30 * var(--k)); align-items: center; gap: calc(6 * var(--k)); height: calc(20 * var(--k)); }
.lb-sl > span { font-family: 'Jersey', monospace; font-size: var(--np); color: rgba(232, 238, 240, 0.85); }
.lb-sl .v { font-family: 'VT', monospace; font-size: var(--vt); color: ${PAL.ink}; text-align: right; }
.lb-sl .track { position: relative; height: calc(14 * var(--k)); touch-action: none; cursor: ew-resize; background: linear-gradient(rgba(232, 238, 240, 0.85), rgba(232, 238, 240, 0.85)) 0 50% / 100% 1px no-repeat, repeating-linear-gradient(90deg, rgba(232, 238, 240, 0.7) 0 1px, transparent 1px 10%) 0 100% / 100% 40% no-repeat, repeating-linear-gradient(90deg, rgba(232, 238, 240, 0.35) 0 1px, transparent 1px 2%) 0 100% / 100% 20% no-repeat; }
.lb-sl .cap { position: absolute; top: 0; bottom: 0; right: 0; background: repeating-linear-gradient(-45deg, rgba(232, 238, 240, 0.5) 0 1px, transparent 1px 4px); pointer-events: none; }
.lb-sl .cap::after { content: 'VAT'; position: absolute; right: 2px; top: -2px; font-family: 'Jersey'; font-size: var(--np); color: ${PAL.ink}; }
.lb-sl .knob { position: absolute; top: 0; width: 0; height: 100%; transition: left 120ms cubic-bezier(0.3, 1.4, 0.5, 1); }
.lb-sl .knob::before { content: ''; position: absolute; left: calc(-5 * var(--k)); top: calc(-2 * var(--k)); border: calc(5 * var(--k)) solid transparent; border-top: calc(8 * var(--k)) solid ${PAL.ink}; }
.lb-sl .knob::after { content: ''; position: absolute; left: 0; top: 0; width: 1px; height: 100%; background: ${PAL.ink}; }
.bp-n { font-family: 'Pixelify'; font-size: var(--ps); color: rgba(232, 238, 240, 0.6); margin-top: calc(8 * var(--k)); }
.lb-shelf { position: absolute; left: calc(98 * var(--k)); top: calc(10 * var(--k)); width: calc(260 * var(--k)); max-height: calc(100vh - 250 * var(--k)); overflow: hidden auto; scrollbar-width: none; pointer-events: auto; z-index: 4; display: none; padding: calc(16 * var(--k)) calc(14 * var(--k)) calc(12 * var(--k)); box-sizing: border-box; box-shadow: 0 calc(4 * var(--k)) calc(10 * var(--k)) rgba(10, 8, 4, 0.55); }
.lb-shelf.open { display: block; animation: lb-pull 260ms cubic-bezier(0.2, 0.9, 0.3, 1.15) both; }
.cat-h { border-bottom: 1px solid ${PAL.graphite}; padding-bottom: calc(4 * var(--k)); margin-bottom: calc(6 * var(--k)); }
.lb-jar { display: grid; grid-template-columns: calc(40 * var(--k)) 1fr; gap: calc(8 * var(--k)); align-items: center; padding: calc(4 * var(--k)) 0; border-bottom: 1px solid rgba(122, 150, 170, 0.45); cursor: inherit; }
.lb-jar:hover { background: rgba(184, 56, 46, 0.06); }
.lb-jar img { width: calc(40 * var(--k)); height: calc(40 * var(--k)); background: #2a2c2a; border: calc(2 * var(--k)) solid #ece6d4; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.45); transform: rotate(-2deg); image-rendering: auto; }
.lb-jar:nth-child(odd) img { transform: rotate(1.5deg); }
.lb-jar .vt { display: block; }
.lb-jar .pn { font-family: 'Pixelify'; font-size: var(--ps); color: #5a5850; }
/* ---------------------------------------------------------------- the clipboard and its record sheet */
.lab .lb-right { right: calc(6 * var(--k)); top: calc(6 * var(--k)); width: calc(262 * var(--k)); padding: calc(20 * var(--k)) calc(9 * var(--k)) calc(10 * var(--k)); box-sizing: border-box; box-shadow: 0 calc(4 * var(--k)) calc(10 * var(--k)) rgba(10, 8, 4, 0.6); border-radius: calc(7 * var(--k)); max-height: calc(100vh - 248 * var(--k)); display: flex; }
.lb-clip { position: absolute; left: 50%; top: calc(-3 * var(--k)); width: calc(92 * var(--k)); height: calc(26 * var(--k)); transform: translateX(-50%); z-index: 2; border-radius: calc(3 * var(--k)) calc(3 * var(--k)) calc(6 * var(--k)) calc(6 * var(--k)); background: linear-gradient(180deg, #c4c6c0, #8d8f8a 40%, #5a5c58 75%, #8d8f8a); box-shadow: 0 calc(2 * var(--k)) calc(3 * var(--k)) rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 250, 0.6); }
.lb-clip::before { content: ''; position: absolute; left: 30%; right: 30%; top: calc(6 * var(--k)); height: calc(5 * var(--k)); border-radius: calc(3 * var(--k)); background: #2a2c2c; box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.8), 0 1px 0 rgba(255, 255, 250, 0.4); }
.lb-sheet { position: relative; flex: 1; min-height: 0; overflow: hidden auto; scrollbar-width: none; padding: calc(16 * var(--k)) calc(12 * var(--k)) calc(12 * var(--k)); box-sizing: border-box; transform: rotate(-0.5deg); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.45), calc(-2 * var(--k)) calc(3 * var(--k)) calc(4 * var(--k)) rgba(20, 12, 4, 0.35); }
.lb-sheet::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse at var(--lx, 30%) var(--ly, 20%), rgba(255, 244, 214, 0.16), transparent 60%); animation: lb-lamp 14s ease-in-out infinite alternate; }
@keyframes lb-lamp { 0% { --lx: 25%; --ly: 15%; } 100% { --lx: 70%; --ly: 40%; } }
@property --lx { syntax: '<percentage>'; inherits: false; initial-value: 30%; } @property --ly { syntax: '<percentage>'; inherits: false; initial-value: 20%; }
.rs-head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid ${PAL.graphite}; padding-bottom: calc(3 * var(--k)); }
.rs-head .sw { letter-spacing: 0.18em; }
.rs-row { display: flex; align-items: baseline; gap: calc(6 * var(--k)); border-bottom: 1px solid rgba(59, 58, 54, 0.45); padding: calc(4 * var(--k)) 0 calc(2 * var(--k)); min-height: calc(16 * var(--k)); }
.rs-k { font-family: 'Jersey', monospace; font-size: var(--np); color: #6a6658; letter-spacing: 0.06em; flex: none; }
.rs-v { font-family: 'VT', monospace; font-size: var(--vt); color: ${PAL.graphite}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rs-2 { display: grid; grid-template-columns: 1fr 1fr; column-gap: calc(8 * var(--k)); }
.rs-nm { position: relative; min-height: calc(22 * var(--k)); }
.stamp { display: inline-block; font-family: 'Superwide', monospace; font-size: var(--sw); line-height: var(--sw); letter-spacing: 0.14em; color: ${PAL.stamp}; border: calc(2 * var(--k)) solid currentColor; padding: calc(3 * var(--k)) calc(5 * var(--k)) calc(2 * var(--k)); transform: rotate(var(--r, -3deg)); -webkit-mask-image: var(--ink); mask-image: var(--ink); -webkit-mask-size: calc(96 * var(--k) / 2); mask-size: calc(96 * var(--k) / 2); opacity: 0.88; text-shadow: 1px 0 0 currentColor; white-space: nowrap; }
.stamp.g { color: ${PAL.graphite}; opacity: 0.72; }
.stamp.long, .lb-card .stamp { font-family: 'Jersey', monospace; font-size: var(--np); line-height: var(--np); letter-spacing: 0.1em; }
.stamp.thump { animation: lb-thump 320ms cubic-bezier(0.2, 0.8, 0.3, 1.2) both; }
@keyframes lb-thump { 0% { transform: rotate(var(--r, -3deg)) scale(1.9); opacity: 0; } 55% { transform: rotate(var(--r, -3deg)) scale(0.9, 0.86); opacity: 0.95; } 100% { transform: rotate(var(--r, -3deg)) scale(1); opacity: 0.88; } }
.rs-t { font-family: 'Superwide', monospace; font-size: var(--sw); letter-spacing: 0.16em; margin: calc(9 * var(--k)) 0 calc(3 * var(--k)); color: #4a4842; }
.rs-stat { display: grid; grid-template-columns: calc(54 * var(--k)) 1fr calc(62 * var(--k)); align-items: center; gap: calc(6 * var(--k)); height: calc(15 * var(--k)); }
.rs-stat .rs-v { text-align: right; }
.rs-box { position: relative; height: calc(8 * var(--k)); border: 1px solid rgba(59, 58, 54, 0.8); border-radius: 1px; transform: rotate(var(--rr, 0deg)); }
.rs-box i { position: absolute; left: 0; top: 0; bottom: 0; background: repeating-linear-gradient(115deg, rgba(59, 58, 54, 0.85) 0 1px, transparent 1px 3px); transition: width 600ms cubic-bezier(0.3, 1.45, 0.5, 1); }
.rs-box.dn i { background: repeating-linear-gradient(115deg, rgba(59, 58, 54, 0.85) 0 1px, transparent 1px 3px), repeating-linear-gradient(25deg, rgba(59, 58, 54, 0.6) 0 1px, transparent 1px 3px); }
.rs-notes { position: relative; margin: calc(8 * var(--k)) 0 calc(2 * var(--k)); min-height: calc(18 * var(--k)); }
.pencil { font-family: 'Pixelify', monospace; font-size: var(--ps); line-height: calc(var(--ps) * 1.35); color: #4b4a46; opacity: 0.9; }
.pencil b { display: inline-block; }
.rs-notes .pencil { max-width: 66%; }
.pencil.wr { animation: lb-write 1.1s steps(28) both; }
@keyframes lb-write { 0% { clip-path: inset(0 100% 0 0); } 100% { clip-path: inset(0 0 0 0); } }
.rs-ok { position: absolute; right: 0; top: calc(-2 * var(--k)); --r: 6deg; }
.rs-slots { display: grid; grid-template-columns: repeat(2, 1fr); gap: calc(3 * var(--k)) calc(8 * var(--k)); }
.rs-slot { display: flex; align-items: center; gap: calc(4 * var(--k)); }
.rs-slot .rs-k { width: calc(36 * var(--k)); }
.rs-slot s { position: relative; display: inline-block; width: calc(8 * var(--k)); height: calc(8 * var(--k)); border: 1px solid rgba(59, 58, 54, 0.85); text-decoration: none; }
.rs-slot s.x::before, .rs-slot s.x::after { content: ''; position: absolute; left: -1px; right: -1px; top: 50%; height: 1px; background: #3e3d39; transform: rotate(42deg); }
.rs-slot s.x::after { transform: rotate(-38deg); }
.rs-cost { margin-top: calc(4 * var(--k)); }
.rs-fn { display: block; font-family: 'VT', monospace; font-size: var(--vt); line-height: calc(var(--vt) * 1.1); color: ${PAL.graphite}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rs-fn.none { color: #8a8678; }
.rs-upk { margin: calc(2 * var(--k)) 0 calc(2 * var(--k)); }
.rs-roles { display: flex; flex-wrap: wrap; gap: calc(2 * var(--k)); margin: calc(3 * var(--k)) 0 calc(4 * var(--k)); }
.rs-role { position: relative; border: none; cursor: inherit; padding: calc(2 * var(--k)) calc(5 * var(--k)) calc(1 * var(--k)); font-family: 'Jersey', monospace; font-size: var(--np); letter-spacing: 0.04em; color: #4a4842; background: linear-gradient(180deg, #cdbd93, #b8a77d); clip-path: polygon(calc(3 * var(--k)) 0, calc(100% - 3 * var(--k)) 0, 100% 100%, 0 100%); }
.rs-role.on { background: linear-gradient(180deg, #ddd0a8, #c8b88e); color: ${PAL.graphite}; }
.rs-role.on::after { content: ''; position: absolute; left: calc(4 * var(--k)); right: calc(4 * var(--k)); bottom: 1px; height: 1px; background: ${PAL.stamp}; }
.rs-role i { position: absolute; left: 0; bottom: 0; height: 2px; background: ${PAL.graphite}; opacity: 0.55; }
.rs-sug { display: grid; grid-template-columns: calc(10 * var(--k)) 1fr auto; align-items: baseline; gap: calc(4 * var(--k)); border-bottom: 1px dotted rgba(59, 58, 54, 0.4); padding: 1px 0; cursor: inherit; }
.rs-sug:hover { background: rgba(184, 56, 46, 0.06); }
.rs-sug s { position: relative; display: inline-block; width: calc(8 * var(--k)); height: calc(8 * var(--k)); border: 1px solid rgba(59, 58, 54, 0.85); text-decoration: none; }
.rs-sug.on s::before, .rs-sug.on s::after { content: ''; position: absolute; left: -1px; right: -1px; top: 50%; height: 1px; background: #3e3d39; transform: rotate(42deg); }
.rs-sug.on s::after { transform: rotate(-38deg); }
.rs-sug .rs-v { font-size: var(--vt); }
.rs-sug .w { font-family: 'Pixelify', monospace; font-size: var(--ps); color: #6a6658; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: calc(120 * var(--k)); text-align: right; }
.rs-sug.ok .w { color: ${PAL.stamp}; }
.rs-sug.unk .rs-v { color: #8a8678; }
.rs-sig { display: flex; align-items: flex-end; justify-content: space-between; margin-top: calc(10 * var(--k)); }
.rs-sig .ln { flex: 1; border-bottom: 1px solid rgba(59, 58, 54, 0.6); margin: 0 calc(6 * var(--k)); height: calc(14 * var(--k)); position: relative; }
.rs-sig .ln .pencil { position: absolute; left: calc(8 * var(--k)); bottom: 0; transform: rotate(-4deg); }
/* ---------------------------------------------------------------- the card file */
.lab .lb-dock { left: 0; right: 0; bottom: 0; height: calc(232 * var(--k)); pointer-events: none; display: flex; flex-direction: column; }
.lb-strip { pointer-events: auto; flex: 1; display: flex; gap: calc(10 * var(--k)); align-items: flex-end; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x proximity; touch-action: pan-x; padding: 0 calc(24 * var(--k)); scrollbar-width: none; overscroll-behavior: contain; margin-bottom: calc(-14 * var(--k)); }
.lb-strip::-webkit-scrollbar, .lb-tabs::-webkit-scrollbar, .lb-sheet::-webkit-scrollbar, .lb-shelf::-webkit-scrollbar { display: none; }
.lb-strip.center { justify-content: safe center; }
.lb-card { flex: none; position: relative; width: calc(124 * var(--k)); height: calc(170 * var(--k)); scroll-snap-align: center; cursor: inherit; background-size: 100% 100%; filter: drop-shadow(0 calc(-1 * var(--k)) calc(2 * var(--k)) rgba(20, 14, 6, 0.45)); transition: transform 160ms cubic-bezier(0.3, 1.4, 0.5, 1); transform: translateY(calc(6 * var(--k))) rotate(var(--tilt, 0deg)); }
.lb-card:hover, .lb-card.hov { transform: translateY(calc(-8 * var(--k))) rotate(0deg); }
.lb-card.draw { animation: lb-draw 460ms cubic-bezier(0.2, 0.85, 0.3, 1.18) both; animation-delay: var(--d, 0ms); }
@keyframes lb-draw { 0% { transform: translateY(105%) rotate(calc(var(--tilt, 0deg) * 4)); } 100% { transform: translateY(calc(6 * var(--k))) rotate(var(--tilt, 0deg)); } }
.lb-card.lock { filter: drop-shadow(0 calc(-1 * var(--k)) calc(2 * var(--k)) rgba(20, 14, 6, 0.45)) saturate(0.4) brightness(0.86); }
.lb-card.unk { filter: drop-shadow(0 calc(-1 * var(--k)) calc(2 * var(--k)) rgba(20, 14, 6, 0.45)) brightness(0.8); }
.lb-win { position: absolute; left: calc(8 * var(--k)); top: calc(14 * var(--k)); width: calc(108 * var(--k)); height: calc(84 * var(--k)); }
.lb-info { position: absolute; left: calc(8 * var(--k)); right: calc(8 * var(--k)); top: calc(101 * var(--k)); bottom: calc(6 * var(--k)); display: flex; flex-direction: column; gap: calc(2 * var(--k)); text-align: left; }
.lb-info .vt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #2e2d2a; }
.lb-info .np { color: #6a6658; white-space: nowrap; overflow: hidden; margin-top: calc(3 * var(--k)); }
.lb-info .ps { color: #3e4a52; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lb-card .stamp { position: absolute; right: calc(5 * var(--k)); top: calc(76 * var(--k)); --r: -8deg; padding: calc(2 * var(--k)) calc(4 * var(--k)) 1px; border-width: calc(1.5 * var(--k)); }
.lb-lv { position: absolute; right: calc(9 * var(--k)); top: calc(17 * var(--k)); font-family: 'VT', monospace; font-size: var(--vt); color: ${PAL.ink}; text-shadow: 0 1px 0 rgba(0, 0, 0, 0.6); pointer-events: none; }
.lb-card .q { position: absolute; left: calc(8 * var(--k)); top: calc(14 * var(--k)); width: calc(108 * var(--k)); height: calc(84 * var(--k)); display: flex; align-items: center; justify-content: center; font-family: 'Pixelify'; font-size: calc(var(--ps) * 4); color: rgba(232, 238, 240, 0.55); pointer-events: none; }
.lb-hint { pointer-events: none; align-self: center; margin-bottom: calc(40 * var(--k)); padding: calc(6 * var(--k)) calc(10 * var(--k)); background: rgba(217, 210, 191, 0.92); transform: rotate(-1deg); }
/* drawer front: enamel, a label holder, the divider tabs, a cup pull */
.lb-front { pointer-events: auto; position: relative; height: calc(54 * var(--k)); display: flex; align-items: center; gap: calc(14 * var(--k)); padding: 0 calc(14 * var(--k)); box-shadow: 0 calc(-3 * var(--k)) calc(6 * var(--k)) rgba(10, 9, 6, 0.55); }
.lb-area { flex: none; min-width: calc(170 * var(--k)); max-width: calc(220 * var(--k)); }
.lb-area .lb-slip { padding: calc(2 * var(--k)) calc(6 * var(--k)); }
.lb-area .vt { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lb-area .ps { display: block; color: #6a6658; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lb-tabs { flex: 1; display: flex; gap: calc(3 * var(--k)); overflow-x: auto; scrollbar-width: none; touch-action: pan-x; align-self: flex-start; padding-top: calc(4 * var(--k)); }
.lb-tab { flex: none; position: relative; height: calc(26 * var(--k)); padding: calc(4 * var(--k)) calc(10 * var(--k)) 0; border: none; cursor: inherit; font-family: 'Jersey', monospace; font-size: var(--np); letter-spacing: 0.06em; color: #4a4842; background: linear-gradient(180deg, #cdbd93, #b8a77d); clip-path: polygon(calc(6 * var(--k)) 0, calc(100% - 6 * var(--k)) 0, 100% 100%, 0 100%); box-shadow: inset 0 1px 0 rgba(255, 250, 225, 0.5); transition: transform 140ms cubic-bezier(0.3, 1.5, 0.5, 1); transform: translateY(calc(6 * var(--k))); }
.lb-tab:hover { transform: translateY(calc(2 * var(--k))); }
.lb-tab.act { transform: translateY(0); background: linear-gradient(180deg, #ddd0a8, #c8b88e); color: ${PAL.graphite}; }
.lb-tab.act::after { content: ''; position: absolute; left: calc(10 * var(--k)); right: calc(10 * var(--k)); bottom: calc(5 * var(--k)); height: 1px; background: ${PAL.stamp}; opacity: 0.8; }
.lb-tab.empty { color: rgba(74, 72, 66, 0.5); }
.lb-tab .n { font-family: 'Pixelify'; font-size: var(--ps); color: #6a6658; margin-left: calc(3 * var(--k)); }
.lb-tab.hint::before { content: ''; position: absolute; inset: calc(2 * var(--k)) calc(4 * var(--k)) calc(-2 * var(--k)); border: 1px solid rgba(59, 58, 54, 0.8); border-radius: 48% 52% 45% 55% / 60% 40% 60% 40%; transform: rotate(-2deg); pointer-events: none; }
.lb-pull { flex: none; width: calc(52 * var(--k)); height: calc(16 * var(--k)); border-radius: 0 0 calc(26 * var(--k)) calc(26 * var(--k)) / 0 0 calc(16 * var(--k)) calc(16 * var(--k)); background: linear-gradient(180deg, #5a5c58, #b4b6b0 40%, #6c6e69); box-shadow: 0 calc(2 * var(--k)) calc(3 * var(--k)) rgba(0, 0, 0, 0.55), inset 0 -1px 0 rgba(255, 255, 250, 0.3); }
/* paint chip card */
.lb-paint { pointer-events: auto; position: absolute; left: 50%; bottom: calc(100% + 8 * var(--k)); transform: translateX(-50%) rotate(0.6deg); display: flex; gap: calc(16 * var(--k)); align-items: flex-start; padding: calc(12 * var(--k)) calc(14 * var(--k)); box-sizing: border-box; max-width: calc(100vw - 16px); overflow-x: auto; box-shadow: 0 calc(3 * var(--k)) calc(8 * var(--k)) rgba(10, 8, 4, 0.5); animation: lb-pull 260ms cubic-bezier(0.2, 0.9, 0.3, 1.15) both; }
.lb-sw { display: grid; grid-template-columns: calc(52 * var(--k)) 1fr; align-items: center; gap: calc(3 * var(--k)) calc(6 * var(--k)); }
.lb-chips { display: flex; gap: calc(2 * var(--k)); }
.lb-chip { position: relative; width: calc(12 * var(--k)); height: calc(12 * var(--k)); box-shadow: inset 0 0 0 1px rgba(40, 38, 32, 0.7); cursor: inherit; }
.lb-chip.on::after { content: ''; position: absolute; inset: calc(-4 * var(--k)); border: 1.5px solid ${PAL.stamp}; border-radius: 52% 48% 55% 45% / 45% 55% 45% 55%; transform: rotate(-12deg); opacity: 0.85; }
.lb-opts { display: flex; flex-wrap: wrap; gap: calc(2 * var(--k)) calc(10 * var(--k)); max-width: calc(220 * var(--k)); margin-bottom: calc(6 * var(--k)); }
.lb-opt { display: flex; align-items: center; gap: calc(4 * var(--k)); background: none; border: none; padding: 0; cursor: inherit; font-family: 'VT', monospace; font-size: var(--vt); color: ${PAL.graphite}; }
.lb-opt s { position: relative; display: inline-block; width: calc(9 * var(--k)); height: calc(9 * var(--k)); border: 1px solid rgba(59, 58, 54, 0.85); text-decoration: none; }
.lb-opt.on s::before, .lb-opt.on s::after { content: ''; position: absolute; left: -2px; right: -2px; top: 50%; height: 1.5px; background: ${PAL.stamp}; transform: rotate(40deg); }
.lb-opt.on s::after { transform: rotate(-44deg); }
/* ---------------------------------------------------------------- floating bits */
.lb-say { position: absolute; transform: translate(-50%, -100%); pointer-events: none; max-width: calc(180 * var(--k)); padding: calc(5 * var(--k)) calc(8 * var(--k)) calc(6 * var(--k)); background: #ddd6c2; color: ${PAL.graphite}; font-family: 'Pixelify'; font-size: var(--ps); line-height: calc(var(--ps) * 1.2); box-shadow: 0 1px 0 rgba(0, 0, 0, 0.35), calc(1 * var(--k)) calc(3 * var(--k)) calc(5 * var(--k)) rgba(10, 8, 4, 0.45); border-radius: calc(3 * var(--k)); animation: lb-pop 200ms cubic-bezier(0.3, 1.5, 0.5, 1); }
.lb-say .np { display: block; color: #6a6658; margin-bottom: calc(2 * var(--k)); }
.lb-say::after { content: ''; position: absolute; left: 50%; bottom: calc(-5 * var(--k)); border: calc(5 * var(--k)) solid transparent; border-top-color: #ddd6c2; border-bottom: none; transform: translateX(-50%); }
.lb-say.out { opacity: 0; transition: opacity 300ms; }
@keyframes lb-pop { 0% { transform: translate(-50%, -85%) scale(0.85); opacity: 0; } 100% { transform: translate(-50%, -100%) scale(1); opacity: 1; } }
.lb-tag { position: absolute; pointer-events: none; padding: calc(4 * var(--k)) calc(8 * var(--k)) calc(4 * var(--k)) calc(16 * var(--k)); background: linear-gradient(180deg, #cdbd93, #bba982); clip-path: polygon(calc(8 * var(--k)) 0, 100% 0, 100% 100%, calc(8 * var(--k)) 100%, 0 50%); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5); white-space: nowrap; transform: rotate(-2deg); }
.lb-tag::before { content: ''; position: absolute; left: calc(6 * var(--k)); top: 50%; width: calc(5 * var(--k)); height: calc(5 * var(--k)); margin-top: calc(-2.5 * var(--k)); border-radius: 50%; background: #2a2c2a; box-shadow: 0 0 0 1px #8d8f8a; }
.lb-tag .vt { display: block; } .lb-tag .ps { display: block; color: #5a5850; }
.lb-stampbig { position: absolute; left: 50%; top: 38%; translate: -50% -50%; pointer-events: none; font-size: calc(var(--sw) * 4); line-height: calc(var(--sw) * 4); padding: calc(6 * var(--k)) calc(14 * var(--k)) calc(4 * var(--k)); border-width: calc(4 * var(--k)); --r: -7deg; text-align: center; }
.lb-stampbig .np { display: block; font-size: var(--np); letter-spacing: 0.1em; margin-top: calc(4 * var(--k)); font-family: 'Jersey'; }
.lb-veil { position: absolute; inset: 0; background: #0d0f0d; pointer-events: none; z-index: 9; display: flex; align-items: center; justify-content: center; transition: opacity 600ms; }
.lb-veil .vt { color: ${PAL.phos}; opacity: 0.85; letter-spacing: 0.2em; text-shadow: 0 0 4px rgba(127, 212, 138, 0.35); animation: lb-warm 1.2s ease-out both; }
@keyframes lb-warm { 0% { opacity: 0; transform: scaleY(0.05); filter: brightness(3); } 60% { transform: scaleY(1.05); } 100% { opacity: 0.85; transform: none; filter: none; } }
.lb-veil.off { opacity: 0; }
.lb-mtog { display: none !important; }
/* ---------------------------------------------------------------- smaller screens */
@media (max-width: 1100px) { .lb-title .np, .lb-latin { display: none; } .lb-name { width: calc(150 * var(--k)); } }
@media (max-width: 980px) {
  .lb-mtog { display: flex !important; }
  .lab .lb-right { display: none; z-index: 5; } .lab .lb-right.open { display: flex; }
  .lb-title { display: none; }
}
@media (max-height: 460px) {
  .lab .lb-dock { height: calc(170 * var(--k)); }
  .lb-card { width: calc(96 * var(--k)); height: calc(124 * var(--k)); }
  .lb-win, .lb-card .q { left: calc(6 * var(--k)); top: calc(13 * var(--k)); width: calc(84 * var(--k)); height: calc(56 * var(--k)); }
  .lb-info { top: calc(71 * var(--k)); left: calc(6 * var(--k)); right: calc(6 * var(--k)); } .lb-info .ps { display: none; }
  .lb-front { height: calc(42 * var(--k)); } .lb-tab { height: calc(22 * var(--k)); } .lb-area .ps { display: none; }
  .lab .lb-top { padding: calc(4 * var(--k)) calc(10 * var(--k)); } .lb-ctl .lab-l { display: none; }
  .lab .lb-right, .lb-shelf, .lab .lb-left { max-height: calc(100vh - 186 * var(--k)); }
  .lb-tools .lb-ctl .dymo { display: none; }
}
@media (prefers-reduced-motion: reduce) { .lab *, .lab *::before, .lab *::after { animation: none !important; transition: none !important; } }
body.lab-open [class^="tc-"], body.lab-open [class*=" tc-"] { display: none !important; }
`;
function injectCSS() {
  const old = document.getElementById('lab-css'); if (old) old.remove();
  const s = document.createElement('style'); s.id = 'lab-css'; s.textContent = CSS; document.head.appendChild(s);
}

export interface CardSpec { gene: string | null; name: string; meta: string; fx: string; state: 'on' | 'ok' | 'lock' | 'unk' | 'none'; tag: string; col: number; lv?: number; tip: string; cat?: GeneCat; foreign?: boolean }
export interface LabHandlers {
  tab(t: TabId | 'genome'): void; card(gene: string | null, i: number): void; hoverCard(el: HTMLElement | null, gene: string | null): void;
  save(): void; leave(): void; reset(): void; reroll(): void; name(s: string): void;
  slider(key: keyof Design, v: number): void; color(k: 'base' | 'belly' | 'pattern' | 'accent' | 'eye', c: number): void; pattern(p: Pattern): void; cover(c: Cover): void;
  shelf(open: boolean): void; jar(i: number): void; hoverJar(i: number): void;
  saveDisabled(): string | false;
  /** the role planner: target a role, graft a suggested gene */
  role(r: string): void; suggest(gene: string): void;
}
/** what the record sheet shows */
export interface RecordData {
  name: string; latin: string; plan: string; diet: string; length: string; mass: string; flies: boolean;
  stats: { k: string; v: number; txt: string; dn?: boolean }[];
  notes: string[]; viable: boolean; splice: string;
  slots: { k: string; n: number; max: number }[]; total: number;
  cost: string; each: string; formNo: string;
  /** what it does in the field ("PASSES 4.2 IRON PELLETS/MIN") and what it costs to keep */
  fns: string[]; upkeep: string;
  /** the role planner */
  roles: { k: string; name: string; on: boolean; score: number }[];
  sugg: { id: string; name: string; state: 'on' | 'ok' | 'lock' | 'unk'; why: string }[];
  advice: string;
}
export const SWATCH = [0x6a5a3a, 0x9a7a4a, 0xc8a040, 0xd8c08a, 0xe8e0c8, 0x5a6a3a, 0x3a7a5a, 0x2a6a7a, 0x3a4a7a, 0x5a3a7a, 0x8a3a5a, 0xa83a2a, 0xd86a2a, 0x2a2a30, 0x6a6a70, 0xb0a8a0, 0x7affe0, 0xffe070];
const EYES = [0x7affe0, 0xffe070, 0xff6a4a, 0x101010, 0x40c8e8, 0xf0f0e0, 0x80e040];
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const CAT_IX: Record<GeneCat, number> = { body: 0, limb: 2, sense: 4, feed: 6, defense: 8, meta: 10, repro: 12 };
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** a labelled control: a Bakelite push button, a knob, or a bat-handle toggle */
class Ctl {
  readonly e: HTMLButtonElement;
  constructor(parent: HTMLElement, readonly o: { kind: 'push' | 'knob' | 'tog'; label: string; tip?: () => string; disabled?: () => string | false; on?: () => boolean; red?: boolean; big?: boolean; dymo?: boolean }, onClick: () => void) {
    const e = (this.e = el('button', `lb-ctl lb-${o.kind}${o.red ? ' red' : ''}${o.big ? ' big' : ''}`, parent));
    const cap = el('span', 'cap', e);
    if (o.kind === 'knob') el('i', '', cap); else if (o.kind === 'tog') { el('i', '', cap); el('b', '', cap); }
    el('span', o.dymo ? 'dymo' : 'lab-l', e, o.label);
    let turn = 0;
    e.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const d = o.disabled?.(); if (d) { sfx('deny'); Tip.show(`<div class="tip-warn">${d}</div>`, e); return; }
      if (o.kind === 'knob') { turn += 60; (cap.firstChild as HTMLElement).style.transform = `rotate(${turn}deg)`; }
      sfx(o.kind === 'tog' ? 'click' : 'click', o.kind === 'knob' ? 0.8 : 1, 0.6);
      onClick(); this.refresh();
    });
    e.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    e.addEventListener('pointerenter', () => { if (o.tip) { const d = o.disabled?.(); Tip.show(o.tip() + (d ? `<div class="tip-warn">${d}</div>` : ''), e); } });
    e.addEventListener('pointerleave', () => Tip.hide());
    this.refresh();
  }
  refresh() { this.e.classList.toggle('dis', !!this.o.disabled?.()); this.e.classList.toggle('on', !!this.o.on?.()); }
}

export class LabUI {
  readonly root: HTMLDivElement;
  readonly nameIn: HTMLInputElement; readonly latin: HTMLDivElement;
  readonly left: HTMLDivElement; readonly right: HTMLDivElement;
  readonly area: HTMLDivElement; readonly tabs: HTMLDivElement; readonly strip: HTMLDivElement; readonly paint: HTMLDivElement; readonly head: HTMLDivElement;
  readonly shelfBox: HTMLDivElement; readonly tagEl: HTMLDivElement; readonly veil: HTMLDivElement;
  private ctls: Ctl[] = [];
  private sliders: { key: keyof Design; set: (v: number) => void; cap: HTMLDivElement; v: HTMLElement }[] = [];
  private tabEls = new Map<string, HTMLButtonElement>();
  cards: HTMLDivElement[] = [];
  private bubbles: { e: HTMLDivElement; who: number; t: number }[] = [];
  private painted: HTMLElement[] = [];
  private rec: Record<string, HTMLElement> = {};
  private lastTab = ''; private lastStates = new Map<string, string>(); private lastName = '';
  private cardImg = new Map<string, string>();
  private onResize = () => this.scale();

  constructor(readonly h: LabHandlers) {
    injectCSS();
    this.root = el('div', 'lab', ui());
    this.root.style.setProperty('--ink', inkMask());
    this.scale();
    addEventListener('resize', this.onResize);
    const P = (e: HTMLElement, f: (w: number, h: number) => string) => { this.painted.push(e); paintEl(e, f); return e; };
    // ---- the instrument strip
    const top = P(el('div', 'lb-p lb-top', this.root), (w, hh) => enamel(w, hh, { seed: 21 }));
    el('div', 'lb-title', top, '<span class="sw">GENE LAB</span><span class="np">U.S. PLANETARY CORPS · FIELD LAB 4</span>');
    const holder = el('div', 'lb-holder', top), slip = P(el('div', 'lb-slip', holder), (w, hh) => paper(w, hh, { seed: 5, edge: 1 }));
    this.nameIn = el('input', 'lb-name', slip) as HTMLInputElement; this.nameIn.maxLength = 28; this.nameIn.spellcheck = false;
    this.nameIn.addEventListener('input', () => h.name(this.nameIn.value));
    this.nameIn.addEventListener('keydown', (e) => e.stopPropagation());
    this.latin = el('div', 'lb-latin', slip);
    this.ctls.push(new Ctl(top, { kind: 'knob', label: 'RE-ROLL', tip: () => '<h4>Re-roll</h4>New colours, pattern and a new name.' }, () => h.reroll()));
    this.ctls.push(new Ctl(top, { kind: 'push', label: 'FILE PREFAB', red: true, big: true, disabled: () => h.saveDisabled(), tip: () => '<h4>File as a prefab</h4>Stamp the record and add the design to your species. Grow it in a Brood Womb; with the Flesh Printer, print living copies.' }, () => h.save()));
    this.ctls.push(new Ctl(top, { kind: 'tog', label: 'LEAVE', on: () => true, tip: () => 'Back to the field. An unfiled record is lost. [ESC]' }, () => h.leave()));
    this.ctls.push(new Ctl(top, { kind: 'push', label: 'RECORD', tip: () => 'The specimen record' }, () => { this.right.classList.toggle('open'); this.left.classList.remove('open'); }));
    this.ctls[this.ctls.length - 1].e.classList.add('lb-mtog');
    // ---- tools plate: toggles open the drawings and the catalogue
    const tools = P(el('div', 'lb-p lb-tools', this.root), (w, hh) => enamel(w, hh, { seed: 33 }));
    const drawer = (which: 'left' | 'shelf') => {
      const lo = which === 'left' ? !this.left.classList.contains('open') : false, so = which === 'shelf' ? !this.shelfBox.classList.contains('open') : false;
      this.left.classList.toggle('open', lo); this.shelfBox.classList.toggle('open', so); this.right.classList.remove('open');
      h.shelf(so);
    };
    this.ctls.push(new Ctl(tools, { kind: 'tog', label: 'SHAPE', dymo: true, on: () => !!this.left?.classList.contains('open'), tip: () => '<h4>Proportions</h4>The drawing of the body: size, length, girth, legs, neck, head and tail.' }, () => drawer('left')));
    this.ctls.push(new Ctl(tools, { kind: 'tog', label: 'JARS', dymo: true, on: () => !!this.shelfBox?.classList.contains('open'), tip: () => '<h4>Specimen catalogue</h4>Every species you have absorbed is kept in a jar. Click a jar on the shelves, or pick one here, to put it in the tank.' }, () => drawer('shelf')));
    this.ctls.push(new Ctl(tools, { kind: 'push', label: 'RESET', dymo: true, tip: () => 'Back to the specimen you started with.' }, () => h.reset()));
    // ---- the proportions drawing (cyanotype)
    this.left = P(el('div', 'lb-p lb-left', this.root), (w, hh) => blueprint(w, hh, 9)) as HTMLDivElement;
    el('div', 'bp-t', this.left, '<span class="sw">BODY PROPORTIONS</span><span class="np">DWG 7-B · SCALE AS SHOWN · DO NOT SCALE FROM PRINT</span>');
    const sl = (label: string, key: keyof Design, tip: string) => {
      const row = el('div', 'lb-sl', this.left);
      el('span', '', row, label);
      const tr = el('div', 'track', row), cap = el('div', 'cap', tr), knob = el('div', 'knob', tr), v = el('span', 'v', row);
      cap.style.width = '0';
      const set = (x: number) => { knob.style.left = `${x * 100}%`; type(v, String(Math.round(x * 100)), 80); };
      const upd = (e: PointerEvent) => { const r = tr.getBoundingClientRect(); h.slider(key, clamp((e.clientX - r.left) / r.width, 0, 1)); };
      tr.addEventListener('pointerdown', (e) => { e.stopPropagation(); tr.setPointerCapture(e.pointerId); upd(e); sfx('click', 1, 0.4); });
      tr.addEventListener('pointermove', (e) => { if (tr.hasPointerCapture(e.pointerId)) upd(e); });
      row.addEventListener('pointerenter', () => Tip.show(`<h4>${label}</h4>${tip}`, row)); row.addEventListener('pointerleave', () => Tip.hide());
      this.sliders.push({ key, set, cap, v });
    };
    sl('SIZE', 'size', 'Overall body size. Mass grows with the cube of length: big bodies are strong, slow to grow and hungry. Full size needs the Growth Vat.');
    sl('LENGTH', 'len', 'Body length for its size.');
    sl('GIRTH', 'girth', 'Width and depth of the torso: more mass, more organs, more food needed.');
    sl('LEG LEN', 'legLen', 'Longer legs take longer strides: faster, but they must carry the body.');
    sl('LEG BONE', 'legThick', 'Bone or chitin cross-section. Too thin for the mass and the animal is slow and fragile.');
    sl('NECK', 'neck', 'Reach and grazing height.');
    sl('HEAD', 'head', 'Bigger heads carry bigger eyes and jaws.');
    sl('TAIL', 'tail', 'Balance and counterweight.');
    el('div', 'bp-n', this.left, 'DRAG TO WALK ROUND THE TANK · WHEEL OR PINCH TO ZOOM');
    // ---- the clipboard with the specimen record
    this.right = P(el('div', 'lb-p lb-right', this.root), (w, hh) => board(w, hh)) as HTMLDivElement;
    el('div', 'lb-clip', this.right);
    const sheet = P(el('div', 'lb-sheet', this.right), (w, hh) => paper(w, hh, { seed: 17, coffee: [w * 0.78, hh * 0.84, Math.min(w, hh) * 0.16], fold: Math.round(hh * 0.42) }));
    this.buildRecord(sheet);
    // ---- the catalogue of jars
    this.shelfBox = P(el('div', 'lb-shelf', this.root), (w, hh) => paper(w, hh, { seed: 29, tape: true })) as HTMLDivElement;
    // ---- the card file
    const dock = el('div', 'lb-p lb-dock', this.root);
    this.paint = P(el('div', 'lb-paint', dock), (w, hh) => paper(w, hh, { seed: 41, edge: 2 })) as HTMLDivElement; this.paint.style.display = 'none';
    this.strip = el('div', 'lb-strip', dock);
    this.strip.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { this.strip.scrollLeft += e.deltaY; e.preventDefault(); } e.stopPropagation(); }, { passive: false });
    this.head = P(el('div', 'lb-front', dock), (w, hh) => enamel(w, hh, { seed: 47, color: '#45483a', chips: Math.round(w / 40) })) as HTMLDivElement;
    const ah = el('div', 'lb-holder lb-area', this.head);
    this.area = P(el('div', 'lb-slip', ah), (w, hh) => paper(w, hh, { seed: 53, edge: 1 })) as HTMLDivElement;
    this.tabs = el('div', 'lb-tabs', this.head);
    for (const t of ['genome', ...TAB_ORDER] as (TabId | 'genome')[]) {
      const b = el('button', 'lb-tab', this.tabs); b.dataset.t = t;
      el('span', '', b, t === 'genome' ? 'GENOME' : TABS[t as TabId].short);
      el('span', 'n', b);
      b.addEventListener('click', (e) => { e.stopPropagation(); sfx('click', 1.3, 0.4); h.tab(t); });
      b.addEventListener('pointerenter', () => { if (t !== 'genome') Tip.show(`<h4>${TABS[t as TabId].name}</h4>${TABS[t as TabId].desc}`, b); });
      b.addEventListener('pointerleave', () => Tip.hide());
      this.tabEls.set(t, b);
    }
    el('div', 'lb-pull', this.head);
    this.tagEl = el('div', 'lb-tag', this.root); this.tagEl.style.display = 'none';
    this.veil = el('div', 'lb-veil', this.root, '<span class="vt">FIELD LABORATORY 4 · POWERING UP</span>');
    this.buildPaint();
  }
  /** pixel fonts stay crisp only at whole multiples of their own grid: 1x up to 1000 px tall, 2x above */
  private scale() {
    const k = innerHeight >= 1040 ? 2 : 1, r = this.root.style;
    r.setProperty('--k', k + 'px'); r.setProperty('--vt', 14 * k + 'px'); r.setProperty('--ps', 11 * k + 'px'); r.setProperty('--np', 13 * k + 'px'); r.setProperty('--sw', 10 * k + 'px');
    this.cardImg.clear();
    if (this.cards.length) requestAnimationFrame(() => this.dressCards());
  }

  // ---------------------------------------------------------------------------------------------- the record sheet
  private buildRecord(s: HTMLElement) {
    const R = this.rec;
    const hd = el('div', 'rs-head', s);
    el('span', 'sw', hd, 'SPECIMEN RECORD');
    R.no = el('span', 'vt', hd);
    el('div', 'np', s, 'U.S. PLANETARY CORPS · FORM LB-7 · FIELD LAB 4').style.cssText = 'color:#6a6658;margin:calc(3 * var(--k)) 0 calc(4 * var(--k))';
    const nm = el('div', 'rs-row rs-nm', s); el('span', 'rs-k', nm, 'SPECIES'); R.name = el('span', 'stamp', nm);
    const lt = el('div', 'rs-row', s); el('span', 'rs-k', lt, 'BINOMIAL'); R.latin = el('span', 'rs-v', lt);
    const two = el('div', 'rs-2', s);
    for (const [k, l] of [['plan', 'PLAN'], ['diet', 'DIET'], ['length', 'LENGTH'], ['mass', 'MASS']]) { const r = el('div', 'rs-row', two); el('span', 'rs-k', r, l); R[k] = el('span', 'rs-v', r); }
    el('div', 'rs-t', s, 'PHENOTYPE');
    R.stats = el('div', '', s);
    R.notes = el('div', 'rs-notes', s);
    el('div', 'rs-t', s, 'FUNCTIONS IN THE FIELD');
    R.fns = el('div', '', s);
    R.upk = el('div', 'pencil rs-upk', s);
    el('div', 'rs-t', s, 'ROLE PLANNER');
    R.roles = el('div', 'rs-roles', s);
    R.sugg = el('div', '', s);
    R.advice = el('div', 'pencil', s);
    el('div', 'rs-t', s, 'GENE SLOTS');
    R.slots = el('div', 'rs-slots', s);
    el('div', 'rs-t', s, 'REQUISITION');
    R.cost = el('div', 'rs-v rs-cost', s); R.each = el('div', 'ps', s); R.each.style.color = '#5a5850';
    const sig = el('div', 'rs-sig', s); el('span', 'rs-k', sig, 'EXAMINED'); const ln = el('span', 'ln', sig); el('span', 'pencil', ln, pencil('R. Calder', 3)); el('span', 'rs-k', sig, 'U.S.P.C.');
  }
  /** fill the record; changed fields retype themselves, a new name is stamped again */
  record(d: RecordData) {
    const R = this.rec;
    type(R.no, d.formNo, 40, -1);
    if (d.name !== this.lastName) {
      R.name.textContent = d.name.toUpperCase() || '—';
      R.name.classList.toggle('long', d.name.length > 11);
      if (this.lastName && !reduced()) { R.name.classList.remove('thump'); void R.name.offsetWidth; R.name.classList.add('thump'); }
      this.lastName = d.name;
    }
    type(R.latin, d.latin); type(R.plan, d.plan); type(R.diet, d.diet); type(R.length, d.length); type(R.mass, d.mass);
    if (R.stats.childElementCount !== d.stats.length) {
      R.stats.innerHTML = '';
      d.stats.forEach((st, i) => { const r = el('div', 'rs-stat', R.stats); el('span', 'rs-k', r, st.k); const b = el('span', 'rs-box' + (st.dn ? ' dn' : ''), r); b.style.setProperty('--rr', `${((i * 37) % 5 - 2) * 0.12}deg`); el('i', '', b); el('span', 'rs-v', r); });
    }
    d.stats.forEach((st, i) => { const r = R.stats.children[i] as HTMLElement; (r.querySelector('i') as HTMLElement).style.width = `${clamp(st.v, 0, 1) * 100}%`; type(r.querySelector('.rs-v') as HTMLElement, st.txt, 60, i * 40); });
    // Calder's notes in pencil, and the verdict stamped
    const notes = d.notes.length ? d.notes : [d.flies ? 'Flies. Keep the lid on.' : 'Anatomy sound. Would grow.'];
    const key = notes.join('|') + d.viable;
    if (R.notes.dataset.k !== key) {
      R.notes.dataset.k = key;
      R.notes.innerHTML = notes.slice(0, 3).map((n, i) => `<div class="pencil wr" style="animation-delay:${i * 0.35}s">${pencil('→ ' + n, i + 7)}</div>`).join('') + `<span class="stamp rs-ok${d.viable ? '' : ' g'}${reduced() ? '' : ' thump'}">${d.viable ? 'VIABLE' : 'NOT VIABLE'}</span>`;
    }
    R.slots.innerHTML = d.slots.map((s) => `<div class="rs-slot"><span class="rs-k">${s.k}</span>${Array.from({ length: s.max }, (_, i) => `<s class="${i < s.n ? 'x' : ''}"></s>`).join('')}</div>`).join('');
    type(R.cost, d.cost); type(R.each, d.each, 70);
    // functions: typed, one line each
    const fk = d.fns.join('|');
    if (R.fns.dataset.k !== fk) {
      R.fns.dataset.k = fk; R.fns.innerHTML = '';
      if (!d.fns.length) el('span', 'rs-fn none', R.fns, 'NONE. GRAFT A FUNCTION ORGAN (WORK TAB).');
      d.fns.forEach((f, i) => type(el('span', 'rs-fn', R.fns), f, 60, i * 120));
    }
    if (R.upk.dataset.k !== d.upkeep) { R.upk.dataset.k = d.upkeep; R.upk.innerHTML = pencil('→ ' + d.upkeep, 11); }
    // the role planner: manila tabs with a fill bar for how well the design fills each role
    const rk = d.roles.map((r) => r.k + r.on + Math.round(r.score * 10)).join(',');
    if (R.roles.dataset.k !== rk) {
      R.roles.dataset.k = rk; R.roles.innerHTML = '';
      for (const r of d.roles) {
        const b = el('button', `rs-role${r.on ? ' on' : ''}`, R.roles, r.name);
        const bar = el('i', '', b); bar.style.width = `${Math.round(r.score * 100)}%`;
        b.addEventListener('click', (e) => { e.stopPropagation(); sfx('click', 1.3, 0.4); this.h.role(r.k); });
      }
    }
    const sk = d.sugg.map((x) => x.id + x.state + x.why).join('|');
    if (R.sugg.dataset.k !== sk) {
      R.sugg.dataset.k = sk; R.sugg.innerHTML = '';
      for (const x of d.sugg) {
        const row = el('div', `rs-sug ${x.state}`, R.sugg);
        el('s', '', row); el('span', 'rs-v', row, esc(x.name.toUpperCase())); el('span', 'w', row, esc(x.why));
        row.addEventListener('click', (e) => { e.stopPropagation(); this.h.suggest(x.id); });
        row.addEventListener('pointerenter', () => Tip.show(`<h4>${esc(x.name)}</h4>${x.state === 'ok' ? 'Click to graft it on.' : x.state === 'on' ? 'Grafted.' : esc(x.why)}`, row));
        row.addEventListener('pointerleave', () => Tip.hide());
      }
    }
    if (R.advice.dataset.k !== d.advice) { R.advice.dataset.k = d.advice; R.advice.innerHTML = pencil(d.advice, 13); }
  }

  // ---------------------------------------------------------------------------------------------- tabs & cards
  setTab(t: TabId | 'genome', hint: TabId[], counts: Partial<Record<TabId | 'genome', number>>, title: string, sub: string) {
    for (const [k, b] of this.tabEls) {
      b.classList.toggle('act', k === t); b.classList.toggle('hint', hint.includes(k as TabId) && k !== t);
      const n = counts[k as TabId] ?? 0; (b.querySelector('.n') as HTMLElement).textContent = n ? String(n) : '';
      b.classList.toggle('empty', k !== 'genome' && !n);
    }
    let a = this.area.querySelector('.vt') as HTMLElement | null, s = this.area.querySelector('.ps') as HTMLElement | null;
    if (!a) { a = el('span', 'vt', this.area); s = el('span', 'ps', this.area); }
    type(a, title, 60); type(s!, sub, 120);
    this.tabEls.get(t)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  setCards(list: CardSpec[], hint?: string, tab = '') {
    const keepScroll = this.strip.dataset.k === list.map((c) => c.gene).join(',');
    const sx = this.strip.scrollLeft, fresh = tab !== this.lastTab;
    this.lastTab = tab;
    this.strip.innerHTML = ''; this.cards = [];
    if (hint) P2(el('div', 'lb-hint vt', this.strip, esc(hint)));
    const states = new Map<string, string>();
    list.forEach((c, i) => {
      const card = el('div', `lb-card ${c.state}${fresh && !reduced() ? ' draw' : ''}`, this.strip);
      card.style.setProperty('--d', `${i * 55}ms`); card.style.setProperty('--tilt', `${((i * 53) % 7 - 3) * 0.35}deg`);
      card.dataset.cat = c.cat ?? 'meta';
      const win = el('div', 'lb-win', card);
      if (c.state === 'unk') el('div', 'q', card, '?');
      if (c.lv) el('div', 'lb-lv', card, `LV ${c.lv}`);
      const info = el('div', 'lb-info', card);
      el('div', 'vt', info, esc(c.name)); el('div', 'np', info, esc(c.meta)); el('div', 'ps', info, esc(c.fx));
      const k = c.gene ?? '?';
      states.set(k, c.state);
      const st = c.state === 'on' ? c.tag : c.state === 'lock' ? 'RESTRICTED' : c.foreign ? 'SPLICE' : '';
      if (st) { const s = el('span', `stamp${c.state === 'on' ? '' : ' g'}`, card, st); if (!fresh && this.lastStates.get(k) !== c.state && c.state === 'on' && !reduced()) s.classList.add('thump'); }
      card.addEventListener('click', (e) => { e.stopPropagation(); this.h.card(c.gene, i); });
      card.addEventListener('pointerenter', () => { card.classList.add('hov'); this.h.hoverCard(win, c.gene); if (c.tip) Tip.show(c.tip, card); sfx('hover', 1.2, 0.35); });
      card.addEventListener('pointerleave', () => { card.classList.remove('hov'); this.h.hoverCard(null, null); Tip.hide(); });
      card.addEventListener('animationend', () => card.classList.remove('draw'), { once: true });
      (card as HTMLDivElement & { win?: HTMLElement }).win = win;
      this.cards.push(card);
    });
    this.lastStates = states;
    if (fresh && list.length && !reduced()) sfx('squelch', 3, 0.08);
    this.dressCards();
    this.strip.classList.toggle('center', this.strip.scrollWidth <= this.strip.clientWidth + 2);
    this.strip.dataset.k = list.map((c) => c.gene).join(',');
    if (keepScroll) this.strip.scrollLeft = sx;
  }
  /** the card stock: an edge-notched index card cut to the measured window, one notch per gene category */
  private dressCards() {
    const c0 = this.cards[0]; if (!c0) return;
    const w = c0.offsetWidth, hh = c0.offsetHeight, win = (c0 as HTMLDivElement & { win?: HTMLElement }).win!;
    if (w < 8) return;
    const u = parseFloat(this.root.style.getPropertyValue('--k')) || 1;
    for (const c of this.cards) {
      const cat = (c.dataset.cat ?? 'meta') as GeneCat, key = `${w}x${hh}|${cat}`;
      let img = this.cardImg.get(key);
      if (!img) { img = notchCard(w, hh, { x: win.offsetLeft, y: win.offsetTop, w: win.offsetWidth, h: win.offsetHeight }, CAT_IX[cat] ?? 1, 7 + (CAT_IX[cat] ?? 0), u); this.cardImg.set(key, img); }
      c.style.backgroundImage = img;
    }
  }
  scrollTo(i: number) { const c = this.cards[i]; if (c) c.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); }

  // ---------------------------------------------------------------------------------------------- hide & colour
  private buildPaint() {
    const p = this.paint;
    const sw = el('div', 'lb-sw', p);
    for (const [k, lab] of [['base', 'BODY'], ['belly', 'BELLY'], ['pattern', 'MARKINGS'], ['accent', 'ACCENT'], ['eye', 'EYES']] as const) {
      el('span', 'rs-k', sw, lab);
      const row = el('div', 'lb-chips', sw);
      for (const c of k === 'eye' ? EYES : SWATCH) { const ch = el('div', 'lb-chip', row); ch.style.background = hex(c); ch.dataset.k = k; ch.dataset.c = String(c); ch.addEventListener('click', (e) => { e.stopPropagation(); this.h.color(k, c); sfx('click', 1.4, 0.35); }); }
    }
    const col = el('div', '', p);
    el('div', 'rs-t', col, 'PATTERN').style.marginTop = '0';
    const pr = el('div', 'lb-opts', col);
    for (const pt of ['plain', 'stripes', 'spots', 'bands', 'mottled', 'saddle', 'rings'] as Pattern[]) { const b = el('button', 'lb-opt', pr, `<s></s>${pt.toUpperCase()}`); b.dataset.p = pt; b.addEventListener('click', (e) => { e.stopPropagation(); this.h.pattern(pt); sfx('click', 1.4, 0.35); }); }
    el('div', 'rs-t', col, 'COVER');
    const cr = el('div', 'lb-opts', col);
    for (const c of ['chitin', 'fur', 'scales', 'skin', 'slime'] as Cover[]) { const b = el('button', 'lb-opt', cr, `<s></s>${c.toUpperCase()}`); b.dataset.c = c; b.addEventListener('click', (e) => { e.stopPropagation(); this.h.cover(c); sfx('click', 1.4, 0.35); }); }
  }
  showPaint(on: boolean, d: Design) {
    this.paint.style.display = on ? '' : 'none';
    if (!on) return;
    for (const ch of Array.from(this.paint.querySelectorAll('.lb-chip'))) { const e = ch as HTMLElement; e.classList.toggle('on', (d.colors as unknown as Record<string, number>)[e.dataset.k!] === Number(e.dataset.c)); }
    for (const b of Array.from(this.paint.querySelectorAll('.lb-opt'))) { const e = b as HTMLElement; e.classList.toggle('on', e.dataset.p ? e.dataset.p === d.pattern : e.dataset.c === d.cover); }
  }

  // ---------------------------------------------------------------------------------------------- readouts
  setDesign(d: Design, cap: number) {
    if (document.activeElement !== this.nameIn) this.nameIn.value = d.name;
    this.latin.textContent = d.latin;
    for (const s of this.sliders) { s.set(d[s.key] as number); s.cap.style.width = s.key === 'size' && cap < 1 ? `${(1 - cap) * 100}%` : '0'; }
  }
  refresh() { for (const c of this.ctls) c.refresh(); }

  // ---------------------------------------------------------------------------------------------- the catalogue
  setShelf(list: { name: string; sub: string; img: string }[]) {
    const b = this.shelfBox; b.innerHTML = '';
    el('div', 'cat-h', b, '<span class="sw">SPECIMEN CATALOGUE</span>');
    if (!list.length) el('div', 'pencil', b, pencil('Nothing in the jars yet. Absorb something.', 5));
    list.forEach((j, i) => {
      const r = el('div', 'lb-jar', b);
      const im = el('img', '', r) as HTMLImageElement; if (j.img) im.src = j.img;
      el('div', '', r, `<span class="vt">${esc(j.name)}</span><span class="pn">${esc(j.sub)}</span>`);
      r.addEventListener('click', (e) => { e.stopPropagation(); this.h.jar(i); });
      r.addEventListener('pointerenter', () => this.h.hoverJar(i)); r.addEventListener('pointerleave', () => this.h.hoverJar(-1));
    });
  }
  closeShelf() { this.shelfBox.classList.remove('open'); this.refresh(); }

  // ---------------------------------------------------------------------------------------------- floating bits
  tag(html: string | null, x = 0, y = 0) {
    if (!html) { this.tagEl.style.display = 'none'; return; }
    if (this.tagEl.dataset.h !== html) { this.tagEl.innerHTML = html; this.tagEl.dataset.h = html; }
    this.tagEl.style.display = 'block';
    const w = this.tagEl.offsetWidth;
    this.tagEl.style.left = Math.min(innerWidth - w - 4, x + 16) + 'px'; this.tagEl.style.top = Math.max(4, y - 34) + 'px';
  }
  say(who: number, name: string, text: string, _col: string) {
    for (const b of this.bubbles) if (b.who === who) b.t = Math.min(b.t, 0.3);
    const e = el('div', 'lb-say', this.root, `<span class="np">${esc(name)}</span>${esc(text)}`);
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
  stamp(title: string, sub: string) { const s = el('div', 'stamp lb-stampbig thump', this.root, `${esc(title)}<span class="np">${esc(sub)}</span>`); setTimeout(() => s.remove(), 2400); }
  ready() { this.veil.classList.add('off'); setTimeout(() => this.veil.remove(), 700); }
  dispose() { removeEventListener('resize', this.onResize); for (const e of this.painted) unpaint(e); this.root.remove(); Tip.hide(); }
}
/** a hint slip of paper */
function P2(e: HTMLElement) { paintEl(e, (w, h) => paper(w, h, { seed: 61, edge: 1 })); return e; }
