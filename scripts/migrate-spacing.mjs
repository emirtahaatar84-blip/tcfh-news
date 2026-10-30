/**
 * Token normalizasyonu — tek seferlik göç aracı (idempotent).
 *
 * Amaç: bileşenlerdeki ham px / keyfi aralık sınıflarını token sınıflarına
 * çevirmek. Tekrar çalıştırılabilir; eşleşme yoksa dosya değişmez.
 *
 * Kullanım: node scripts/migrate-spacing.mjs
 */

import { readFile, writeFile } from "node:fs/promises";

const FILES = [
  "components/NewsCard.tsx",
  "components/NewsCardSkeleton.tsx",
  "components/FeaturedNewsCard.tsx",
  "components/feed/PortraitFeedCard.tsx",
  "components/Feed.tsx",
  "components/feed/FeedPage.tsx",
  "components/layout/RightRail.tsx",
  "components/layout/MobileSummaryStrip.tsx",
  "components/layout/MobileNav.tsx",
  "components/layout/SiteHeader.tsx",
  "components/content/ContentArticle.tsx",
  "components/debate/DebateCard.tsx",
  "components/debate/DebateStepper.tsx",
  "components/settings/DensityControl.tsx",
  "components/PreferencesView.tsx",
];

/** sıra önemli: daha özgül desenler önce. */
const RULES = [
  // Kart yüzeyi: padding + çerçeve token'lardan gelir.
  [/rounded-2xl border border-\[#22252a\] bg-\[#16181c\] p-3\.5 sm:p-4/g, "surface-card"],
  [/rounded-2xl border border-\[#22252a\] bg-\[#16181c\] p-3\.5/g, "surface-card"],
  [/rounded-2xl border border-\[#22252a\] bg-\[#16181c\] px-3\.5 py-3/g, "surface-card"],
  [/rounded-2xl border border-\[#22252a\] bg-\[#16181c\] px-4 py-3/g, "surface-card"],
  [/rounded-2xl border border-\[#22252a\] bg-\[#16181c\] px-4 py-3\.5/g, "surface-card"],
  [/rounded-2xl border border-\[#22252a\] bg-\[#16181c\] p-3\.5/g, "surface-card"],

  // Tipografi
  [/text-\[15px\] font-semibold leading-tight/g, "t-h3"],
  [/text-\[15px\] font-bold leading-tight/g, "t-h3"],
  [/text-\[22px\] font-extrabold leading-snug/g, "t-h1"],
  [/text-\[17px\] font-bold leading-snug/g, "t-h2"],
  [/text-\[15px\] font-semibold leading-relaxed/g, "t-body font-semibold"],
  [/text-\[15px\] leading-relaxed/g, "t-body"],
  [/text-\[13px\] leading-relaxed/g, "t-meta leading-relaxed"],
  [/text-\[11px\] leading-relaxed/g, "t-label leading-relaxed"],
  [/text-\[12px\] leading-relaxed/g, "t-meta leading-relaxed"],
  [/text-\[12px\] font-semibold leading-snug/g, "t-meta font-semibold"],
  [/text-\[13px\] font-semibold/g, "t-meta font-semibold"],

  // Aralıklar (semantik)
  [/mt-2\.5/g, "mt-spot-meta"],
  [/mt-1\.5/g, "mt-title-spot"],
  [/gap-2(?=["\s])/g, "gap-inline"],
  [/gap-1\.5/g, "gap-space-2"],
  [/gap-3(?=["\s])/g, "gap-space-3"],

  // Listeler (kart arası boşluk yoğunluğa bağlı)
  [/flex flex-col gap-space-3/g, "feed-stack"],
  [/flex flex-col gap-card-gap/g, "feed-stack"],
  [/space-y-4/g, "space-y-space-4"],
];

let totalChanged = 0;

for (const file of FILES) {
  let source;
  try {
    source = await readFile(file, "utf8");
  } catch {
    console.log(`[skip] ${file} bulunamadı`);
    continue;
  }

  const before = source;
  for (const [pattern, replacement] of RULES) {
    source = source.replace(pattern, replacement);
  }

  if (source !== before) {
    await writeFile(file, source, "utf8");
    totalChanged += 1;
    console.log(`[ok] ${file}`);
  }
}

console.log(`[migrate-spacing] ${totalChanged} dosya güncellendi.`);
