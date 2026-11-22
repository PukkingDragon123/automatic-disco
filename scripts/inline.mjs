// Fold dist-artifact into one self-contained page body (no doctype/html/head/body: the host wraps it).
//   node scripts/inline.mjs [out.html]   (after `npx vite build --config vite.artifact.config.ts`)
// - the CSS is inlined, every url() it makes to a file (fonts, the build planner's and node map's PNG frames) becomes a
//   data URI;
// - the single JS module is inlined; the creature build worker becomes a blob URL;
// - every runtime file the game fetches from public/ (sounds, .glb models, PNG icons and art) is packed into the page:
//   images as data URIs (an <img>.src must resolve at once), everything else in one gzip pack unpacked on first use
//   (DecompressionStream); a small resolver in front of the module answers fetch(), <img>.src and <audio>.src for
//   those paths, whatever base the page is served from (it matches the path's tail: 'sfx/ui/ui_click_1.mp3').
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
const dir = 'dist-artifact', out = process.argv[2] || 'dist-artifact/oddworld.html';
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const assets = path.join(dir, 'assets');
const files = fs.readdirSync(assets);
const workers = files.filter((f) => f.endsWith('.js') && f.includes('.worker-'));
const js = files.filter((f) => f.endsWith('.js') && !f.includes('.worker-'));
if (js.length !== 1) throw new Error('expected one JS chunk, got ' + js.join(','));
const MIME = { woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', glb: 'model/gltf-binary', json: 'application/json' };
const mimeOf = (f) => MIME[path.extname(f).slice(1).toLowerCase()] || 'application/octet-stream';
const kb = (n) => (n / 1024).toFixed(0) + ' KB';

// ---- the CSS, its url()s as data URIs
let css = files.filter((f) => f.endsWith('.css')).map((f) => fs.readFileSync(path.join(assets, f), 'utf8')).join('\n');
let cssN = 0;
css = css.replace(/url\((['"]?)([^)'"]+)\1\)/g, (m, q, u) => {
  if (/^(data:|blob:|#)/.test(u)) return m;
  const clean = u.replace(/[?#].*$/, '');
  const p = [path.join(assets, clean), path.join(dir, clean.replace(/^(\.\.\/)+/, '')), path.join(dir, clean.replace(/^\.?\//, ''))].find((x) => fs.existsSync(x) && fs.statSync(x).isFile());
  if (!p) throw new Error('css url not found ' + u);
  cssN++;
  return `url(data:${mimeOf(p)};base64,${fs.readFileSync(p).toString('base64')})`;
});

// ---- the runtime files (public/ is copied into dist-artifact by vite)
const RUNTIME = [/^sfx\/.+\.mp3$/, /^inv\/[^/]+\.glb$/, /^inv\/ui\/.+\.png$/, /^models\/.+\.glb$/, /^icons\/colony\/.+\.png$/, /^ui\/build\/art\/.+\.png$/];
const walk = (d, pre = '') => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name), pre + e.name + '/') : [pre + e.name]));
const pub = walk(dir).filter((f) => RUNTIME.some((re) => re.test(f)));
const imgs = {}, packed = [];
let imgBytes = 0, packBytes = 0;
for (const f of pub) {
  const b = fs.readFileSync(path.join(dir, f));
  if (/\.(png|jpg|webp|gif|svg)$/i.test(f)) { imgs[f] = `data:${mimeOf(f)};base64,${b.toString('base64')}`; imgBytes += b.length; }
  else { packed.push([f, b]); packBytes += b.length; }
}
// the pack: [u32 index length][index JSON: [[path, offset, length, mime]...]][bytes], gzipped
const index = []; let off = 0;
for (const [f, b] of packed) { index.push([f, off, b.length, mimeOf(f)]); off += b.length; }
const ib = Buffer.from(JSON.stringify(index)), head = Buffer.alloc(4); head.writeUInt32LE(ib.length, 0);
const gz = zlib.gzipSync(Buffer.concat([head, ib, ...packed.map((p) => p[1])]), { level: 9 });
const resolver = `(()=>{
const IMG=${JSON.stringify(imgs)};
const PACK="${gz.toString('base64')}";
const NAMES=new Set(${JSON.stringify(packed.map((p) => p[0]))});
let pack=null;
const unpack=()=>pack||(pack=(async()=>{const s=atob(PACK),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);
const ab=await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
const dv=new DataView(ab),n=dv.getUint32(0,true),idx=JSON.parse(new TextDecoder().decode(new Uint8Array(ab,4,n))),m=new Map(),b0=4+n;
for(const [f,o,l,t] of idx)m.set(f,{buf:ab.slice(b0+o,b0+o+l),type:t});return m;})());
const key=(u,set)=>{if(typeof u!=='string'||/^(data:|blob:)/.test(u))return null;let p=u.replace(/^[a-z][a-z0-9+.-]*:\\/\\/[^/]*/i,'').replace(/[?#].*$/,'');
try{p=decodeURIComponent(p)}catch{}const parts=p.split('/').filter((x)=>x&&x!=='.');for(let i=0;i<parts.length;i++){const k=parts.slice(i).join('/');if(set(k))return k;}return null;};
const inImg=(k)=>Object.prototype.hasOwnProperty.call(IMG,k),inPack=(k)=>NAMES.has(k);const hits={};const hit=(k)=>{hits[k]=(hits[k]||0)+1;};
const raw=window.fetch.bind(window);
window.fetch=async(input,init)=>{const u=typeof input==='string'?input:input instanceof URL?input.href:input&&input.url;
const ki=key(u,inImg);if(ki){hit(ki);return raw(IMG[ki]);}const k=key(u,inPack);if(!k)return raw(input,init);
const e=(await unpack()).get(k);hit(k);return new Response(e.buf.slice(0),{status:200,headers:{'Content-Type':e.type}});};
const blobs=new Map();
const media=(k)=>{if(blobs.has(k))return blobs.get(k);const p=unpack().then((m)=>URL.createObjectURL(new Blob([m.get(k).buf],{type:m.get(k).type})));blobs.set(k,p);return p;};
for(const C of [HTMLImageElement,HTMLMediaElement,HTMLSourceElement]){const d=Object.getOwnPropertyDescriptor(C.prototype,'src');if(!d||!d.set)continue;
Object.defineProperty(C.prototype,'src',{configurable:true,enumerable:d.enumerable,get(){return d.get.call(this)},set(v){const ki=key(v,inImg);if(ki){hit(ki);return d.set.call(this,IMG[ki]);}
const k=key(v,inPack);if(k){hit(k);media(k).then((b)=>d.set.call(this,b));return;}return d.set.call(this,v);}});}
window.__owAssets={images:Object.keys(IMG).length,packed:NAMES.size,unpack,hits};
})();`;

// ---- the module
let code = fs.readFileSync(path.join(assets, js[0]), 'utf8');
// self-contained workers become blob URLs (the page has no files beside it)
for (const w of workers) {
  const src = fs.readFileSync(path.join(assets, w), 'utf8');
  const re = new RegExp('new URL\\(new URL\\(`' + w.replace(/[.]/g, '\\.') + '`,import\\.meta\\.url\\)\\.href,``\\+import\\.meta\\.url\\)', 'g');
  const n = (code.match(re) || []).length; if (!n) throw new Error('worker reference not found ' + w);
  code = code.replace(re, () => `URL.createObjectURL(new Blob([${JSON.stringify(src)}],{type:'text/javascript'}))`);
}
// any other asset file the bundle still points at would 404 from a single page
const left = (code.match(/new URL\(`[^`]+\.(png|glb|mp3|ttf|woff2|otf|jpg|json|wasm)`,import\.meta\.url\)/g) || []);
if (left.length) throw new Error('unresolved asset URLs in the bundle: ' + left.slice(0, 5).join(' '));
code = code.replace(/<\/script/gi, '<\\/script');
const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || 'ODDWORLD';
const page = `<title>${title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="description" content="ODDWORLD: crash a pod on an alien world, befriend the stranded explorer, and build a colony from nothing.">
<style>${css}</style>
<canvas id="view"></canvas>
<div id="ui"></div>
<script>${resolver.replace(/<\/script/gi, '<\\/script')}</script>
<script type="module">${code}</script>
`;
fs.writeFileSync(out, page);
console.log(`css ${kb(css.length)} (${cssN} urls inlined) · js ${kb(code.length)} · images ${pub.length - packed.length} (${kb(imgBytes)}) · pack ${packed.length} files ${kb(packBytes)} -> gzip ${kb(gz.length)}`);
console.log('wrote', out, (page.length / 1e6).toFixed(2), 'MB');
