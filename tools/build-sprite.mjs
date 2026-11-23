// Baut den SVG-Icon-Sprite in index.html aus Lucide-Icons (ISC-Lizenz, https://lucide.dev).
// Aufruf: npm run sprite   (benötigt Internet, lädt von unpkg.com)
// Neues Icon: Eintrag in ICONS ergänzen (id in der App → Lucide-Name), Skript ausführen.
import { readFile, writeFile } from 'node:fs/promises';

const LUCIDE_VERSION = '0.460.0';
const ICONS = {
  silos: 'warehouse',
  history: 'history',
  settings: 'settings',
  add: 'plus',
  back: 'chevron-left',
  truck: 'truck',
  pencil: 'pencil',
  'bell-off': 'bell-off',
  warning: 'triangle-alert',
  share: 'share',
  export: 'download',
  import: 'upload',
  trash: 'trash-2',
  sprout: 'sprout',
  'home-add': 'square-plus',
  more: 'ellipsis',
  close: 'x',
  phone: 'smartphone',
  check: 'circle-check',
};

const base = `https://unpkg.com/lucide-static@${LUCIDE_VERSION}`;
const get = async (path) => {
  const res = await fetch(`${base}/${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.text();
};

const symbols = [];
for (const [id, name] of Object.entries(ICONS)) {
  const svg = await get(`icons/${name}.svg`);
  const inner = svg
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>[\s\S]*$/, '')
    .replace(/\s*\n\s*/g, '')
    .replace(/\s+\/>/g, '/>');
  symbols.push(`    <symbol id="i-${id}" viewBox="0 0 24 24">${inner}</symbol>`);
}

const sprite = [
  `  <!-- ICONS:START – generiert von tools/build-sprite.mjs. Lucide v${LUCIDE_VERSION} (ISC), siehe icons/LUCIDE-LICENSE.txt -->`,
  '  <svg xmlns="http://www.w3.org/2000/svg" style="display:none">',
  ...symbols,
  '  </svg>',
  '  <!-- ICONS:END -->',
].join('\n');

const htmlPath = new URL('../index.html', import.meta.url);
const html = await readFile(htmlPath, 'utf8');
if (!/<!-- ICONS:START[\s\S]*?ICONS:END -->/.test(html)) throw new Error('Marker ICONS:START/END fehlen in index.html');
await writeFile(htmlPath, html.replace(/  <!-- ICONS:START[\s\S]*?ICONS:END -->/, sprite));
await writeFile(new URL('../icons/LUCIDE-LICENSE.txt', import.meta.url), await get('LICENSE'));
console.log(`${symbols.length} Icons in index.html geschrieben.`);
