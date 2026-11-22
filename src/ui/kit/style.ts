// UI KIT · CSS. Alagard text at its crisp sizes (16 / 32 / 48 px) with an 8-way ink outline and a stepped extrusion,
// the floating icon, the rolling counter, the floating numbers, badges. Injected once by installKitStyle().
let done = false;
const ink = (px: number, c = 'var(--k7-ink)') => {
  const o: string[] = [];
  for (let y = -px; y <= px; y += px) for (let x = -px; x <= px; x += px) if (x || y) o.push(`${x}px ${y}px 0 ${c}`);
  return o.join(', ');
};
const extrude = (px: number, n: number, col: string) => { const o: string[] = []; for (let k = 1; k <= n; k++) o.push(`${px * k}px ${px * (k + 1)}px 0 ${col}`); return o.join(', '); };
export function installKitStyle() {
  if (done) return; done = true;
  const st = document.createElement('style');
  st.id = 'k7-kit-style';
  st.textContent = `
:root { --k7-ink: #08090c; --k7-cream: #f2ead2; --k7-warm: #ffe7a8; --k7-dim: #b9ad8f; --k7-red: #e36a4c; --k7-amber: #ffc560; --k7-green: #9fe08a; --k7-blue: #a8c4db; }
.k7-t16, .k7-t32, .k7-t48 { font-family: 'Alagard', monospace; font-weight: normal; color: var(--k7-cream); white-space: nowrap; -webkit-font-smoothing: none; font-smooth: never; text-rendering: optimizeSpeed; letter-spacing: 0; }
.k7-t16 { font-size: 16px; line-height: 18px; text-shadow: ${ink(1)}, ${extrude(1, 1, 'var(--k7-ink)')}; }
.k7-t32 { font-size: 32px; line-height: 34px; text-shadow: ${ink(2)}, ${extrude(2, 1, 'var(--k7-ink)')}; }
.k7-t48 { font-size: 48px; line-height: 50px; text-shadow: ${ink(3)}, ${extrude(3, 1, 'var(--k7-ink)')}; }
/* the floating name: a stepped brown extrusion under the ink, tipped back a little (the world text's letters) */
.k7-name { display: block; transform: perspective(240px) rotateX(14deg); transform-origin: 50% 0; transition: transform .22s cubic-bezier(.2,.9,.3,1.4), color .15s; }
.k7-name.k7-t32 { text-shadow: ${ink(2)}, 2px 4px 0 #3a2a14, 4px 6px 0 var(--k7-ink), 0 10px 10px rgba(0,0,0,.55); }
.k7-name.k7-t16 { text-shadow: ${ink(1)}, 1px 2px 0 #3a2a14, 2px 3px 0 var(--k7-ink), 0 6px 6px rgba(0,0,0,.5); }

/* the floating icon: the 3D model over its shadow, its name floating under it; no box, tile or key */
.k7-fi { position: relative; display: inline-flex; flex-direction: column; align-items: center; gap: 0; margin: 0; padding: 0; border: 0; background: none; outline: none;
  cursor: pointer; pointer-events: auto; -webkit-tap-highlight-color: transparent; --glow: #ffd27a; }
.k7-fi, .k7-fi * { border-radius: 0 !important; }
.k7-fi .k7-ic { position: relative; display: block; line-height: 0; transition: transform .24s cubic-bezier(.2,.9,.3,1.5), filter .18s ease; transform-origin: 50% 90%; }
.k7-fi .k7-bob { position: relative; z-index: 1; display: block; animation: k7-bob 3.6s ease-in-out var(--ph, 0s) infinite alternate; }
.k7-fi .k7-model, .k7-fi .k7-sh { display: block; image-rendering: pixelated; pointer-events: none; }
.k7-fi .k7-sh { position: absolute; left: 50%; bottom: -2px; z-index: 0; transform: translateX(-50%); animation: k7-shade 3.6s ease-in-out var(--ph, 0s) infinite alternate; transition: opacity .2s; }
@keyframes k7-bob { from { transform: translateY(2px); } to { transform: translateY(-4px); } }
@keyframes k7-shade { from { opacity: .95; } to { opacity: .7; } }
.k7-fi .k7-name { position: relative; z-index: 2; margin-top: -6px; color: #efe4c4; pointer-events: none; }
.k7-fi.hot .k7-ic, .k7-fi:focus-visible .k7-ic { transform: translateY(-12px) scale(1.06); filter: brightness(1.18) drop-shadow(0 0 8px color-mix(in srgb, var(--glow) 65%, transparent)); }
.k7-fi.hot .k7-sh { opacity: .45; }
.k7-fi.hot .k7-name, .k7-fi:focus-visible .k7-name { color: #fff4cf; transform: perspective(240px) rotateX(6deg) translateY(-3px); }
.k7-fi.down .k7-ic { transform: translateY(2px) scale(.97); filter: brightness(1.35) drop-shadow(0 0 10px var(--glow)); transition-duration: .05s; }
.k7-fi.on .k7-ic { filter: brightness(1.12) drop-shadow(0 0 7px color-mix(in srgb, var(--glow) 60%, transparent)); }
.k7-fi.on .k7-name { color: #ffe39a; }
.k7-fi.lock { cursor: default; }
.k7-fi.lock .k7-model { filter: grayscale(.85) brightness(.6); }
.k7-fi.lock .k7-name { color: #8f8670; }
.k7-fi .k7-badge { position: absolute; right: 2px; top: 4px; z-index: 3; pointer-events: none; image-rendering: pixelated; }
.k7-fi .k7-badge.pulse { animation: k7-pulse 1.1s ease-in-out infinite; }
@keyframes k7-pulse { 50% { transform: translateY(-3px) scale(1.08); filter: brightness(1.25); } }
.k7-fi .k7-hint { position: absolute; left: 50%; top: -4px; transform: translateX(-50%); z-index: 3; opacity: 0; transition: opacity .15s; pointer-events: none; color: #ffd98a; }
.k7-fi.hot .k7-hint { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .k7-fi .k7-bob, .k7-fi .k7-sh { animation: none; } }

/* the rolling counter: digit columns, whole-pixel offsets set by juice.ts */
.k7-count { display: inline-flex; vertical-align: top; }
.k7-count .k7-col { display: inline-block; overflow: hidden; text-align: center; transition: width .18s ease-out; }
.k7-t16.k7-count .k7-col { height: 20px; margin: 0 -1px; }
.k7-t32.k7-count .k7-col { height: 38px; margin: 0 -2px; }
.k7-t48.k7-count .k7-col { height: 54px; margin: 0 -3px; }
.k7-count .k7-strip { display: flex; flex-direction: column; will-change: transform; }
.k7-count .k7-strip i { display: block; font-style: normal; color: inherit; }
.k7-t16.k7-count .k7-strip i { height: 20px; line-height: 18px; }
.k7-t32.k7-count .k7-strip i { height: 38px; line-height: 34px; }
.k7-t48.k7-count .k7-strip i { height: 54px; line-height: 50px; }

.k7-float { position: fixed; z-index: 9100; pointer-events: none; transform: translate(-50%, 0); }
.k7-tip { position: fixed; z-index: 9200; pointer-events: none; transform: translate(-50%, -100%); opacity: 0; transition: opacity .12s; }
.k7-tip.on { opacity: 1; }
`;
  document.head.append(st);
}
