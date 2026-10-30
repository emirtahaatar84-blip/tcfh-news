#!/usr/bin/env node
/**
 * Yeni URL şeması göçü:
 *   NewsItem.slug  → /haber/<slug>
 *   Portrait.slug  → /portre/<slug> (en fazla 6 kelime) + slugHistory
 *
 * Idempotent ve hızlı: mevcut slug'lar belleğe alınır, çakışma kontrolü
 * Set üzerinden yapılır (O(n) sorgu). Binlerce kayıt için güvenlidir.
 *
 * Kullanım:
 *   npm run backfill:slugs
 *   docker compose exec news node scripts/backfill-slugs.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TR_MAP = {
  ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", I: "i", İ: "i",
  ö: "o", Ö: "o", ş: "s", Ş: "s", ü: "u", Ü: "u",
  â: "a", Â: "a", î: "i", Î: "i", û: "u", Û: "u",
  é: "e", É: "e", ê: "e", Ê: "e", ô: "o", Ô: "o",
};

function foldAscii(value) {
  let out = "";
  for (const char of value) out += TR_MAP[char] ?? char;
  return out.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const MAX_WORDS = 6;
const MAX_LEN = 80;

function slugify(value, maxWords = MAX_WORDS) {
  const words = foldAscii(value)
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9\s-]+/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, maxWords);

  const joined = words.join("-").replace(/-+/g, "-").replace(/^-|-$/g, "");

  if (joined.length > MAX_LEN) {
    const trimmed = joined.slice(0, MAX_LEN);
    const lastDash = trimmed.lastIndexOf("-");
    return (lastDash > 20 ? trimmed.slice(0, lastDash) : trimmed).replace(/-$/g, "");
  }

  return joined;
}

/** Bellekteki Set üzerinden benzersiz slug üretir. */
function uniqueSlug(base, taken) {
  const root = base || "icerik";
  if (!taken.has(root)) {
    taken.add(root);
    return root;
  }

  for (let index = 2; index < 500; index += 1) {
    const candidate = `${root}-${index}`.slice(0, MAX_LEN);
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }

  const fallback = `${root}-${Date.now().toString(36).slice(-6)}`.slice(0, MAX_LEN);
  taken.add(fallback);
  return fallback;
}

async function main() {
  // ── Haberler ────────────────────────────────────────────────────────────
  const news = await prisma.newsItem.findMany({
    select: { id: true, title: true, slug: true },
    orderBy: { createdAt: "asc" },
  });

  const takenNews = new Set(news.map((row) => row.slug).filter(Boolean));

  let newsUpdated = 0;

  for (const row of news) {
    if (row.slug && row.slug.split("-").length <= MAX_WORDS) continue;

    // Eski slug varsa ondan türet (başlık değişmiş olabilir).
    const base = slugify(row.slug ? row.slug.replace(/-/g, " ") : row.title);
    const slug = uniqueSlug(base, takenNews);

    await prisma.newsItem.update({ where: { id: row.id }, data: { slug } });
    newsUpdated += 1;

    if (newsUpdated % 250 === 0) {
      console.log(`[slugs] … ${newsUpdated} haber güncellendi`);
    }
  }

  // ── Portreler ───────────────────────────────────────────────────────────
  const portraits = await prisma.portrait.findMany({
    select: { id: true, title: true, slug: true, slugHistory: true },
  });

  const takenPortraits = new Set(portraits.map((row) => row.slug));
  let portraitUpdated = 0;

  for (const row of portraits) {
    if (row.slug.split("-").length <= MAX_WORDS) continue;

    const base = slugify(row.title);
    takenPortraits.delete(row.slug);
    const slug = uniqueSlug(base, takenPortraits);

    let history = [];
    try {
      history = JSON.parse(row.slugHistory || "[]");
    } catch {
      history = [];
    }

    await prisma.portrait.update({
      where: { id: row.id },
      data: {
        slug,
        slugHistory: JSON.stringify([
          ...new Set([...history, row.slug].filter((item) => item && item !== slug)),
        ]),
      },
    });

    portraitUpdated += 1;
    console.log(`[slugs] portre ${row.slug} → ${slug}`);
  }

  console.log(
    `[slugs] tamam: ${newsUpdated} haber, ${portraitUpdated} portre güncellendi.`,
  );
}

main()
  .catch((error) => {
    console.error("[slugs] hata:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
