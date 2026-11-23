// Erzeugt die App-Icons (SVG + PNG) ohne externe Abhängigkeiten.
// Aufruf: npm run icons
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const GREEN = [47, 125, 50];
const WHITE = [255, 255, 255];
const FEED = [242, 193, 78];

// Motiv in Einheitskoordinaten (0..1). Reihenfolge = Zeichenreihenfolge.
const shapes = [
  { color: WHITE, test: (x, y) => x >= 0.32 && x <= 0.68 && y >= 0.38 && y <= 0.8 },
  { color: WHITE, test: (x, y) => y <= 0.38 && (x - 0.5) ** 2 + (y - 0.38) ** 2 <= 0.18 ** 2 },
  { color: WHITE, test: (x, y) => x >= 0.2 && x <= 0.8 && y >= 0.8 && y <= 0.835 },
  { color: FEED, test: (x, y) => x >= 0.36 && x <= 0.64 && y >= 0.56 && y <= 0.76 },
];

function pixel(x, y) {
  let c = GREEN;
  for (const s of shapes) if (s.test(x, y)) c = s.color;
  return c;
}

function png(size) {
  const SS = 4; // Supersampling für Kantenglättung
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let py = 0; py < size; py++) {
    raw[py * (size * 3 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const c = pixel((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size);
          acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2];
        }
      const o = py * (size * 3 + 1) + 1 + px * 3;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(acc[i] / (SS * SS));
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // Bittiefe
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="rgb(${GREEN})"/>
  <path d="M32 38 A18 18 0 0 1 68 38 V80 H32 Z" fill="#fff"/>
  <rect x="20" y="80" width="60" height="3.5" fill="#fff"/>
  <rect x="36" y="56" width="28" height="20" fill="rgb(${FEED})"/>
</svg>
`;

writeFileSync(new URL('../icons/icon.svg', import.meta.url), svg);
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(new URL(`../icons/${name}`, import.meta.url), png(size));
}
console.log('Icons erzeugt.');
