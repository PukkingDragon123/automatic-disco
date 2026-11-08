// Headless screenshot harness: node scripts/shot.mjs <url> <out.png> [waitMs] [steps.json]
// steps: [{key, ms} | {press} | {click:[x,y], button} | {move:[x,y]} | {down:[x,y]} | {up:[x,y]} | {eval} | {wait} | {shot}]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/opt/node-tools/node_modules/');
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:5180/';
const out = process.argv[3] || 'scripts/out/shot.png';
const wait = Number(process.argv[4] || 4000);
const stepsArg = process.argv[5];
fs.mkdirSync('scripts/out', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const VW = Number(process.env.VW || 1280), VH = Number(process.env.VH || 720);
const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: Number(process.env.DSF || 1) });
page.setDefaultTimeout(180000);
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(wait);
if (stepsArg) {
  const steps = JSON.parse(stepsArg.trim().startsWith('[') ? stepsArg : fs.readFileSync(stepsArg, 'utf8'));
  for (const s of steps) {
    if (s.key) { await page.keyboard.down(s.key); await page.waitForTimeout(s.ms || 500); await page.keyboard.up(s.key); }
    if (s.press) await page.keyboard.press(s.press);
    if (s.move) await page.mouse.move(s.move[0], s.move[1], { steps: s.steps || 1 });
    if (s.down) { await page.mouse.move(s.down[0], s.down[1]); await page.mouse.down({ button: s.button || 'left' }); }
    if (s.up) { await page.mouse.move(s.up[0], s.up[1], { steps: s.steps || 8 }); await page.mouse.up({ button: s.button || 'left' }); }
    if (s.click) await page.mouse.click(s.click[0], s.click[1], { button: s.button || 'left' });
    if (s.wheel) await page.mouse.wheel(0, s.wheel);
    if (s.eval) { try { logs.push('[eval] ' + JSON.stringify(await page.evaluate(s.eval))); } catch (e) { logs.push('[eval-error] ' + e.message); } }
    if (s.wait) await page.waitForTimeout(s.wait);
    if (s.shot) { try { await page.screenshot({ path: s.shot }); } catch (e) { logs.push('[shot-error] ' + e.message); } }
  }
}
try { await page.screenshot({ path: out }); } catch (e) { logs.push('[shot-error] ' + e.message); }
console.log(logs.slice(0, 120).join('\n'));
await browser.close();
