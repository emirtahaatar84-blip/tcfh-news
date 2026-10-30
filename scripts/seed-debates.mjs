#!/usr/bin/env node
/**
 * Münazara örnek dosyalarını ve doğrulanmış RSS kaynaklarını yükler.
 *
 * Idempotent: aynı slug tekrar yüklenirse güncellenir, kaynaklar yenilenir.
 * Kullanıcı verisi yazmaz; yalnızca kamuya açık kaynak derlemesi.
 *
 * Kullanım (VDS konteyneri içinde):
 *   docker exec tcfh-news node scripts/seed-debates.mjs
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const prisma = new PrismaClient();

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

const debates = JSON.parse(
  await readFile(resolve(root, "prisma/seed/debates.json"), "utf8"),
);

let feedReport = null;
for (const candidate of [
  "prisma/seed/feed-status.json",
  "lib/debate/feed-status.json",
]) {
  try {
    feedReport = JSON.parse(
      await readFile(resolve(root, candidate), "utf8"),
    );
    break;
  } catch {
    feedReport = null;
  }
}

for (const [index, debate] of debates.entries()) {
  const publishedAt = daysAgo(debate.recencyDays ?? 3);

  const data = {
    title: debate.title,
    level: debate.level,
    category: debate.category,
    motionText: debate.motionText,
    motionType: debate.motionType,
    motionScope: debate.motionScope,
    difficulty: debate.difficulty,
    controversy: debate.controversy,
    infoNeed: debate.infoNeed,
    recencyDays: debate.recencyDays,
    whyNow: JSON.stringify(debate.whyNow ?? []),
    governmentThesis: JSON.stringify(debate.governmentThesis ?? []),
    oppositionThesis: JSON.stringify(debate.oppositionThesis ?? []),
    keyClash: JSON.stringify(debate.keyClash ?? []),
    burdens: JSON.stringify(debate.burdens ?? {}),
    glossary: JSON.stringify(debate.glossary ?? []),
    faqs: JSON.stringify(debate.faqs ?? []),
    conflictNote: debate.conflictNote ?? null,
    levelNote: debate.levelNote ?? null,
    musScore: debate.musScore ?? 0,
    musBreakdown: JSON.stringify(debate.musBreakdown ?? {}),
    musReason: debate.musReason ?? null,
    status: "published",
    editorPin: index === 0 ? 2 : 0,
    readingMinutes: debate.readingMinutes ?? 8,
    sourceCount: (debate.sources ?? []).length,
    publishedAt,
  };

  const topic = await prisma.debateTopic.upsert({
    where: { slug: debate.slug },
    update: data,
    create: { slug: debate.slug, ...data },
  });

  await prisma.debateSource.deleteMany({ where: { debateId: topic.id } });

  for (const [sourceIndex, source] of (debate.sources ?? []).entries()) {
    await prisma.debateSource.create({
      data: {
        debateId: topic.id,
        name: source.name,
        title: source.title,
        url: source.url,
        publishedAt: source.publishedAt ? new Date(source.publishedAt) : null,
        supports: source.supports ?? "",
        domain: domainOf(source.url),
        isPrimary: Boolean(source.isPrimary) || sourceIndex === 0,
      },
    });
  }

  console.log(
    `[seed] ${debate.level.padEnd(10)} ${debate.slug} · MUS ${debate.musScore} · ${(debate.sources ?? []).length} kaynak`,
  );
}

if (feedReport?.results) {
  for (const result of feedReport.results) {
    const status = result.status === "ok" ? "ok" : "failed";
    const note =
      result.status === "ok"
        ? `${result.itemCount} öğe · son güncelleme ${result.ageDays} gün önce`
        : result.reason;

    await prisma.debateFeed.upsert({
      where: { url: result.url },
      update: {
        name: result.name,
        status,
        itemCount: result.itemCount ?? 0,
        lastItemAt: result.newestItemAt ? new Date(result.newestItemAt) : null,
        checkedAt: new Date(feedReport.checkedAt),
        note,
      },
      create: {
        name: result.name,
        url: result.url,
        status,
        itemCount: result.itemCount ?? 0,
        lastItemAt: result.newestItemAt ? new Date(result.newestItemAt) : null,
        checkedAt: new Date(feedReport.checkedAt),
        note,
      },
    });
  }

  console.log(
    `[seed] RSS kaynakları: ${feedReport.ok} çalışıyor, ${feedReport.failed} başarısız`,
  );
}

await prisma.$disconnect();
