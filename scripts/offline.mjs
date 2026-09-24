// Builds one self-contained HTML file that runs straight from disk (double-click, file://):
// every model, texture, animation and the font are embedded, since browsers refuse to load
// neighbouring files for local pages. Run after `vite build --mode single`.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const src = 'dist-single';
const assets = join(src, 'assets');
const files = [];
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
};
walk(assets);

const embed = {};
for (const p of files) {
  const name = relative(assets, p).split('\\').join('/');
  // Text files go in as they are (the .glb.txt models are already base64), binaries as base64.
  embed[name] = /\.(txt|json)$/.test(name) ? readFileSync(p, 'utf8') : readFileSync(p).toString('base64');
}
// Keep "</script" out of the inline JSON.
const data = JSON.stringify(embed).replace(/</g, '\\u003c');
const html = readFileSync(join(src, 'index.html'), 'utf8');
const out = html.replace('<head>', `<head><script>window.__ASSETS=${data};</script>`);
if (out === html) throw new Error('no <head> in the page');
mkdirSync('dist-offline', { recursive: true });
writeFileSync(join('dist-offline', 'Rien ne va plus.html'), out);
console.log(`dist-offline/Rien ne va plus.html: ${(out.length / 1e6).toFixed(1)} MB, ${files.length} assets embedded`);
