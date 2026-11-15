// Fold dist-artifact into one self-contained page body (no doctype/html/head/body: the host wraps it):
// the CSS (fonts as data URIs) and the single JS module are inlined.
import fs from 'node:fs';
import path from 'node:path';
const dir = 'dist-artifact', out = process.argv[2] || 'dist-artifact/oddworld.html';
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const assets = path.join(dir, 'assets');
const files = fs.readdirSync(assets);
const workers = files.filter((f) => f.endsWith('.js') && f.includes('.worker-'));
const js = files.filter((f) => f.endsWith('.js') && !f.includes('.worker-'));
if (js.length !== 1) throw new Error('expected one JS chunk, got ' + js.join(','));
let css = files.filter((f) => f.endsWith('.css')).map((f) => fs.readFileSync(path.join(assets, f), 'utf8')).join('\n');
css = css.replace(/url\((['"]?)([^)'"]+\.(woff2|ttf|otf))\1\)/g, (m, q, u, ext) => {
  const p = [path.join(assets, u), path.join(dir, u.replace(/^(\.\.\/)+/, '')), path.join(dir, u.replace(/^\.?\//, ''))].find((x) => fs.existsSync(x));
  if (!p) throw new Error('font not found ' + u);
  return `url(data:font/${ext};base64,${fs.readFileSync(p).toString('base64')})`;
});
let code = fs.readFileSync(path.join(assets, js[0]), 'utf8');
// self-contained workers become blob URLs (the page has no files beside it)
for (const w of workers) {
  const src = fs.readFileSync(path.join(assets, w), 'utf8');
  const re = new RegExp('new URL\\(new URL\\(`' + w.replace(/[.]/g, '\\.') + '`,import\\.meta\\.url\\)\\.href,``\\+import\\.meta\\.url\\)', 'g');
  const n = (code.match(re) || []).length; if (!n) throw new Error('worker reference not found ' + w);
  code = code.replace(re, () => `URL.createObjectURL(new Blob([${JSON.stringify(src)}],{type:'text/javascript'}))`);
}
code = code.replace(/<\/script/gi, '<\\/script');
const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || 'ODDWORLD';
const page = `<title>${title}</title>
<meta name="description" content="A speculative-evolution roguelike RTS. You are Unit 07, an asteroid machine golem sent to take an alien world for Earth.">
<style>${css}</style>
<canvas id="view"></canvas>
<div id="ui"></div>
<script type="module">${code}</script>
`;
fs.writeFileSync(out, page);
console.log('wrote', out, (page.length / 1e6).toFixed(2), 'MB');
