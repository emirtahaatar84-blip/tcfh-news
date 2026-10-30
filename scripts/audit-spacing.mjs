#!/usr/bin/env node
/**
 * Token dışı aralık taraması.
 *
 * Kurallar:
 *  1. Boşluk sınıflarında ham px yasak: `p-[18px]`, `gap-[22px]`, `mt-[30px]`.
 *  2. Ölçek dışı Tailwind aralık sınıfı yasak: `p-3.5`, `gap-7.5`, `mt-14`.
 *     (0–10 tam sayı basamakları ve semantik `card-x`, `title-spot` vb. serbest.)
 *  3. `1px`/`2px` çizgi ve odak halkası ölçümleri aralık değildir; taranmaz.
 *
 * Kullanım:
 *   node scripts/audit-spacing.mjs            # kritik kapsam, hata varsa çıkış 1
 *   node scripts/audit-spacing.mjs --report   # tüm depo, yalnızca rapor
 */
import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const reportOnly = process.argv.includes("--report");

const CRITICAL = [
  "app/globals.css",
  "app/layout.tsx",
  "app/[lang]/layout.tsx",
  "components/layout/",
  "components/feed/",
  "components/NewsCard.tsx",
  "components/NewsCardSkeleton.tsx",
  "components/PortraitCard.tsx",
  "components/Feed.tsx",
  "components/PreferencesView.tsx",
  "components/content/ContentArticle.tsx",
  "components/settings/",
  "lib/design/",
];

const SPACING_PREFIX =
  "(?:m[trblxy]?|p[trblxy]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|right|bottom|left)";

const RAW_PX = new RegExp(
  `(?:^|[\\s"'\`])${SPACING_PREFIX}-\\[[0-9.]+px\\]`,
  "g",
);
const OUT_OF_SCALE = new RegExp(
  `(?:^|[\\s"'\`])${SPACING_PREFIX}-(?!(?:space-)?(?:[0-9]|10)(?![0-9.]))(?!(?:card|title|spot|block|column|inline|page|top|bottom|rail|section|after)[a-z-]*)([0-9]+(?:\\.[0-9]+)?)(?![0-9.])`,
  "g",
);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".next" ||
      entry.name === ".git"
    ) {
      continue;
    }

    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if ([".tsx", ".ts", ".css"].includes(extname(entry.name))) {
      files.push(full);
    }
  }

  return files;
}

function isCritical(file) {
  const rel = relative(root, file).replaceAll("\\", "/");
  if (rel.includes("generated/tokens.css")) return false;
  return CRITICAL.some((entry) =>
    entry.endsWith("/") ? rel.startsWith(entry) : rel === entry,
  );
}

function lineHits(file, regex) {
  const hits = [];
  const source = readFileSync(file, "utf8");
  const lines = source.split("\n");

  lines.forEach((line, index) => {
    regex.lastIndex = 0;
    if (regex.test(line)) {
      const match = line.match(regex);
      hits.push({ line: index + 1, text: match?.[0]?.trim() ?? line.trim() });
    }
  });

  return hits;
}

const files = [
  ...(await walk(join(root, "app"))),
  ...(await walk(join(root, "components"))),
  ...(await walk(join(root, "lib"))),
];

const rawPx = [];
const outOfScale = [];

for (const file of files) {
  const rel = relative(root, file).replaceAll("\\", "/");
  if (rel === "lib/design/tokens.ts") continue;

  for (const hit of lineHits(file, new RegExp(RAW_PX.source, "g"))) {
    rawPx.push({ file: rel, ...hit });
  }

  for (const hit of lineHits(file, new RegExp(OUT_OF_SCALE.source, "g"))) {
    outOfScale.push({ file: rel, ...hit });
  }
}

const criticalRaw = rawPx.filter((hit) =>
  isCritical(join(root, hit.file)),
);
const criticalScale = outOfScale.filter((hit) =>
  isCritical(join(root, hit.file)),
);

function print(title, items) {
  if (items.length === 0) {
    console.log(`✓ ${title}: temiz`);
    return;
  }

  console.log(`\n${title} (${items.length}):`);
  for (const item of items.slice(0, 60)) {
    console.log(`  ${item.file}:${item.line}  ${item.text}`);
  }
  if (items.length > 60) {
    console.log(`  … ${items.length - 60} satır daha`);
  }
}

print("Kritik kapsam · ham px", criticalRaw);
print("Kritik kapsam · ölçek dışı sınıf", criticalScale);

if (!reportOnly) {
  print("Tüm depo · ham px (bootstrap)", rawPx);
  print("Tüm depo · ölçek dışı sınıf (bootstrap)", outOfScale);
  console.log(
    `\nÖzet: kritik ${criticalRaw.length + criticalScale.length}, ` +
      `depo geneli ${rawPx.length + outOfScale.length} ihlal.`,
  );
} else {
  console.log(
    `\nRapor: depo geneli ${rawPx.length} ham px, ` +
      `${outOfScale.length} ölçek dışı sınıf (kritik kapsam dışında bilgi amaçlı).`,
  );
}

const failed = !reportOnly && criticalRaw.length + criticalScale.length > 0;
process.exit(failed ? 1 : 0);
