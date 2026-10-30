/**
 * PWA ikon üreteci — sıfır bağımlılık (yalnızca Node yerleşik modülleri).
 *
 * Elle PNG yazar: 8-bit RGBA, satır başına filter byte 0,
 * IDAT zlib.deflateSync ile sıkıştırılır, CRC32 elle hesaplanır.
 *
 * Desen: koyu zemin #16181c üzerine piksel-bitmap "e" harfi (#e4e4e7).
 *
 * Kullanım: node scripts/generate-icons.mjs
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public", "icons");

// --- Desen sabitleri -------------------------------------------------------

const BG = [0x16, 0x18, 0x1c, 0xff]; // #16181c
const FG = [0xe4, 0xe4, 0xe7, 0xff]; // #e4e4e7

/** 16×16 piksel-bitmap, küçük harf "e". */
const GLYPH = [
  "................",
  "................",
  ".....######.....",
  "...##########...",
  "..####....####..",
  "..###......###..",
  ".###............",
  ".###............",
  ".###############",
  ".###############",
  ".###......###...",
  "..###......###..",
  "..####....####..",
  "...##########...",
  ".....######.....",
  "................",
];

// --- PNG yazımı ------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

/** RGBA ham piksel verisinden tam bir PNG dosyası üretir. */
function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR: width, height, bit depth 8, color type 6 (RGBA),
  // compression 0, filter 0, interlace 0.
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // Scanlines: her satır filter byte 0 + RGBA.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- İkon çizimi -----------------------------------------------------------

/**
 * size×size ikon: koyu zemin + ortalanmış, ölçeklenmiş "e" bitmap'i.
 * glyphScale 1 → tüm tuval, 0.6 → güvenli bölge (maskable).
 */
function drawIcon(size, glyphScale) {
  const rgba = Buffer.alloc(size * size * 4);
  const glyphSize = Math.round(size * glyphScale);
  const cell = glyphSize / GLYPH.length;
  const offset = Math.floor((size - glyphSize) / 2);

  const sample = (v) => {
    const g = Math.floor((v - offset) / cell);
    if (g < 0 || g >= GLYPH.length) return -1;
    return g;
  };

  for (let y = 0; y < size; y++) {
    const row = GLYPH[sample(y)] ?? null;
    for (let x = 0; x < size; x++) {
      const on = row !== null && row[sample(x)] === "#";
      const color = on ? FG : BG;
      const i = (y * size + x) * 4;
      rgba[i] = color[0];
      rgba[i + 1] = color[1];
      rgba[i + 2] = color[2];
      rgba[i + 3] = color[3];
    }
  }

  return encodePng(size, size, rgba);
}

// --- Çalıştır --------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });

const outputs = [
  ["icon-192.png", drawIcon(192, 1)],
  ["icon-512.png", drawIcon(512, 1)],
  ["maskable-512.png", drawIcon(512, 0.6)], // %60 boyut, güvenli bölge
];

for (const [name, png] of outputs) {
  writeFileSync(join(OUT_DIR, name), png);
  console.log(`✓ public/icons/${name} (${png.length} bytes)`);
}
