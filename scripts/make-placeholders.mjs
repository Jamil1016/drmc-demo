// Generates the handful of invented placeholder images the demo serves as
// report "attachments" (public/demo-attachments/placeholder-N.png). Pure Node:
// a hand-rolled PNG encoder (zlib + CRC32), no image library, no source photos.
//
//   node scripts/make-placeholders.mjs
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/demo-attachments");
const W = 480;
const H = 360;

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(pixel) {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < W; x++) {
      const [r, g, b] = pixel(x, y);
      const o = y * (W * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const PALETTES = [
  [[20, 33, 61], [72, 110, 170], [252, 163, 17]],
  [[34, 60, 52], [96, 150, 120], [236, 220, 170]],
  [[60, 36, 66], [140, 96, 160], [240, 200, 120]],
  [[40, 44, 52], [120, 130, 146], [120, 200, 220]],
  [[70, 40, 30], [170, 110, 80], [250, 230, 200]],
];

// Each variant: a vertical gradient "sky", a ground band, and a few blocks that
// read as a generic work-site photo without depicting anything real.
function variant(n) {
  const [dark, mid, accent] = PALETTES[n];
  const blocks = Array.from({ length: 4 + n }, (_, i) => ({
    x: 30 + ((i * 97 + n * 53) % (W - 120)),
    w: 40 + ((i * 31 + n * 17) % 60),
    h: 60 + ((i * 47 + n * 29) % 150),
  }));
  return (x, y) => {
    const ground = H - 70;
    if (y > ground) return mix(dark, [0, 0, 0], (y - ground) / 140);
    for (const b of blocks) {
      if (x >= b.x && x < b.x + b.w && y >= ground - b.h) {
        const win = (x - b.x) % 14 > 8 && (ground - y) % 18 > 10;
        return win ? accent : mix(dark, mid, 0.35 + ((b.x % 5) / 10));
      }
    }
    return mix(mid, [235, 240, 245], y / ground);
  };
}

fs.mkdirSync(OUT, { recursive: true });
for (let n = 0; n < PALETTES.length; n++) {
  const file = path.join(OUT, `placeholder-${n + 1}.png`);
  fs.writeFileSync(file, encodePng(variant(n)));
  console.log("wrote", file);
}
