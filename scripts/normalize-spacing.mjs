/**
 * Aralık sınıflarını token ölçeğine normalize eder (idempotent).
 *
 * Kapsam: yalnızca boşluk utilities (p/m/gap/space). İkon ve bileşen
 * boyutları (h/w/min-h/max-w/inset) ayrı ölçekte olduğu için dokunulmaz.
 *
 * Kural: eski px değeri → 8 pt ölçeğinde EN YAKIN basamak (eşitlikte üst).
 * Çıktı: `p-space-5`, `mt-space-3` gibi açık token anahtarları.
 *
 * Kullanım: node scripts/normalize-spacing.mjs
 */

import { readFile, writeFile } from "node:fs/promises";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SCALE = [0, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128];

function snap(px) {
  let best = SCALE[0];
  let bestDiff = Infinity;
  for (const value of SCALE) {
    const diff = Math.abs(value - px);
    // eşitlikte üst basamak tercih edilir
    if (diff < bestDiff || (diff === bestDiff && value > best)) {
      best = value;
      bestDiff = diff;
    }
  }
  return best;
}

function stepOf(px) {
  return SCALE.indexOf(px);
}

const SPACING_UTIL =
  /\b(?:-)?(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y)-(\d+(?:\.\d+)?|\[[^\]]+\])/g;

const ARBITRARY = /^\[(\d+(?:\.\d+)?)px\]$/;

function convert(prefix, raw) {
  let px;

  if (ARBITRARY.test(raw)) {
    px = Number(raw.slice(1, -3));
  } else {
    px = Number(raw) * 4;
  }

  if (!Number.isFinite(px)) return null;

  const snapped = snap(px);
  const step = stepOf(snapped);
  if (step < 0) return null;

  return `${prefix}-space-${step}`;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(full, out);
    } else if (/\.(tsx|ts)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const files = [...walk("app"), ...walk("components")];
let changed = 0;
let replacements = 0;

for (const file of files) {
  const source = await readFile(file, "utf8");

  const next = source.replace(SPACING_UTIL, (match, prefix, raw) => {
    const result = convert(prefix, raw);
    if (!result || result === match) return match;
    replacements += 1;
    return result;
  });

  if (next !== source) {
    await writeFile(file, next, "utf8");
    changed += 1;
  }
}

console.log(
  `[normalize-spacing] ${changed} dosya, ${replacements} sınıf token'a çevrildi.`,
);
