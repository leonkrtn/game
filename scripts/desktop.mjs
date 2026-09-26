// Packs the offline build into a macOS app (Electron): `npm run desktop`.
// Output: desktop-dist/Rien-ne-va-plus-mac-<arch>.zip, ad-hoc signed so Apple Silicon runs it.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

const ELECTRON = process.env.ELECTRON_VERSION ?? '44.4.5';
const ARCHES = (process.env.ARCH ?? 'arm64,x64').split(',');
const RCODESIGN = process.env.RCODESIGN ?? 'rcodesign';
const root = resolve(import.meta.dirname, '..');
const cache = join(root, '.cache', 'electron');
const out = join(root, 'desktop-dist');
const game = join(root, 'dist-offline', 'Rien ne va plus.html');
const APP = 'Rien ne va plus.app';
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

if (!existsSync(game)) throw new Error('Run `npm run build:offline` first.');
mkdirSync(cache, { recursive: true });
mkdirSync(out, { recursive: true });

/** The app icon: a roulette wheel on a dark tile, drawn as SVG and written as .icns. */
async function icns() {
  const pockets = Array.from({ length: 37 }, (_, i) => {
    const a0 = (i / 37) * Math.PI * 2, a1 = ((i + 1) / 37) * Math.PI * 2;
    const p = (a, r) => `${512 + Math.cos(a) * r},${512 + Math.sin(a) * r}`;
    const fill = i === 0 ? '#1f8a4a' : i % 2 ? '#b8101c' : '#141414';
    return `<path d="M${p(a0, 250)} L${p(a0, 360)} A360 360 0 0 1 ${p(a1, 360)} L${p(a1, 250)} A250 250 0 0 0 ${p(a0, 250)}Z" fill="${fill}"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
    <defs><radialGradient id="bg" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#3a0a1a"/><stop offset="1" stop-color="#0a0206"/></radialGradient>
    <radialGradient id="c" cx="45%" cy="40%" r="60%"><stop offset="0" stop-color="#f4d27a"/><stop offset="1" stop-color="#7a5010"/></radialGradient></defs>
    <rect x="80" y="80" width="864" height="864" rx="190" fill="url(#bg)"/>
    <circle cx="512" cy="512" r="395" fill="#5a3010" stroke="#e0b44a" stroke-width="22"/>
    ${pockets}
    <circle cx="512" cy="512" r="250" fill="url(#c)"/>
    <circle cx="512" cy="512" r="60" fill="#e0b44a" stroke="#7a5010" stroke-width="10"/>
    <circle cx="700" cy="330" r="30" fill="#f8f8f8"/>
  </svg>`;
  const chunk = (type, data) => {
    const h = Buffer.alloc(8);
    h.write(type, 0, 'ascii');
    h.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([h, data]);
  };
  const png = (s) => sharp(Buffer.from(svg)).resize(s, s).png().toBuffer();
  const body = Buffer.concat([chunk('ic10', await png(1024)), chunk('ic09', await png(512)), chunk('ic08', await png(256)), chunk('ic07', await png(128))]);
  return chunk('icns', body);
}

const icon = await icns();

const plistSet = (xml, key, value) => {
  const re = new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`);
  return re.test(xml) ? xml.replace(re, `$1${value}$2`) : xml.replace('</dict>\n</plist>', `\t<key>${key}</key>\n\t<string>${value}</string>\n</dict>\n</plist>`);
};

for (const arch of ARCHES) {
  const zip = join(cache, `electron-v${ELECTRON}-darwin-${arch}.zip`);
  if (!existsSync(zip)) {
    console.log(`downloading Electron ${ELECTRON} ${arch}`);
    execFileSync('curl', ['-sSfL', '-o', zip, `https://github.com/electron/electron/releases/download/v${ELECTRON}/electron-v${ELECTRON}-darwin-${arch}.zip`], { stdio: 'inherit' });
  }
  const work = join(out, `mac-${arch}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  execFileSync('unzip', ['-q', zip, '-d', work]);
  const app = join(work, APP);
  renameSync(join(work, 'Electron.app'), app);
  const res = join(app, 'Contents', 'Resources');
  rmSync(join(res, 'default_app.asar'), { force: true });
  const dir = join(res, 'app');
  mkdirSync(dir);
  for (const f of ['main.cjs', 'preload.cjs']) copyFileSync(join(root, 'desktop', f), join(dir, f));
  copyFileSync(game, join(dir, 'game.html'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'rien-ne-va-plus', productName: 'Rien ne va plus', version, main: 'main.cjs' }, null, 2));
  writeFileSync(join(res, 'electron.icns'), icon);
  const plistPath = join(app, 'Contents', 'Info.plist');
  let plist = readFileSync(plistPath, 'utf8');
  plist = plistSet(plist, 'CFBundleName', 'Rien ne va plus');
  plist = plistSet(plist, 'CFBundleDisplayName', 'Rien ne va plus');
  plist = plistSet(plist, 'CFBundleIdentifier', 'de.rienneva.plus');
  plist = plistSet(plist, 'CFBundleShortVersionString', version);
  plist = plistSet(plist, 'CFBundleVersion', version);
  // Marks it as a game: macOS turns on Game Mode in fullscreen.
  plist = plistSet(plist, 'LSApplicationCategoryType', 'public.app-category.games');
  writeFileSync(plistPath, plist);
  console.log(`signing ${arch}`);
  execFileSync(RCODESIGN, ['sign', app], { stdio: ['ignore', 'ignore', 'inherit'] });
  const target = join(out, `Rien-ne-va-plus-mac-${arch}.zip`);
  rmSync(target, { force: true });
  execFileSync('zip', ['-qry', target, APP], { cwd: work });
  rmSync(work, { recursive: true, force: true });
  console.log(`built ${target}`);
}
