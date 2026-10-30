#!/usr/bin/env node
/**
 * Elle doğrulanmış örnek portre tohumu.
 *
 * AMAÇ: AI anahtarı yapılandırılmadan önce /portreler bölümünün boş
 * kalmaması ve şablonun gerçek veriyle görülebilmesi.
 *
 * Tüm olgular scripts/portrait-sample-data.json içindeki kamuya açık
 * kaynaklardan birebir doğrulanmıştır; hiçbir bilgi tahmin edilmemiştir.
 *
 * Kullanım:
 *   npm run portrait:sample
 *   docker compose exec news node scripts/portrait-sample.mjs
 *
 * Idempotent: aynı slug varsa günceller, yoksa oluşturur.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = await readFile(join(here, "portrait-sample-data.json"), "utf8");
  const { slug, sources, data } = JSON.parse(raw);

  console.log("[portrait-sample] yazılıyor:", slug);

  const payload = {
    title: data.title,
    subtitle: data.subtitle,
    category: data.category,
    subjectType: data.subjectType,
    subjectName: data.subjectName,
    // TELİF: dış kaynak görseli yok — kapak kendi AI üretimimiz.
    coverImageUrl: `/api/portraits/${portraitId}/image`,
    coverImageCaption: data.coverImageCaption,
    coverImageCredit: data.coverImageCredit,
    whyNow: JSON.stringify(data.whyNow),
    timeline: JSON.stringify(data.timeline),
    keyFacts: JSON.stringify(data.keyFacts),
    quote: JSON.stringify(data.quote),
    faqs: JSON.stringify(data.faqs),
    conflictNote: data.conflictNote,
    sourceCount: sources.filter((source) => source.kind !== "reference").length,
    readingMinutes: data.readingMinutes,
    status: "published",
    reviewNotes:
      "Elle doğrulanmış örnek dosya: tüm olgular Anadolu Ajansı, NTV ve ShiftDelete metinlerinden doğrulandı.",
    originStoryUrl: data.originStoryUrl,
    originSource: "kantan.news",
    feedScore: data.feedScore,
    publishedAt: new Date("2026-10-25T15:00:00Z"),
  };

  const existing = await prisma.portrait.findUnique({ where: { slug } });

  // Kimlik: kapak yolu id'ye bağlı → yeni kayıtta önceden üret.
  const portraitId = existing?.id ?? randomUUID().replace(/-/g, "");

  const portrait = existing
    ? await prisma.portrait.update({
        where: { id: existing.id },
        data: {
          ...payload,
          coverImageUrl: `/api/portraits/${existing.id}/image`,
          removedAt: null,
          removalReason: null,
        },
      })
    : await prisma.portrait.create({
        data: { id: portraitId, slug, ...payload },
      });

  await prisma.portraitSource.deleteMany({ where: { portraitId: portrait.id } });

  await prisma.portraitSource.createMany({
    data: sources.map((source) => ({
      portraitId: portrait.id,
      name: source.name,
      title: source.title,
      url: source.url,
      domain: source.domain,
      publishedAt: source.publishedAt ? new Date(source.publishedAt) : undefined,
      accessedAt: new Date(),
      kind: source.kind,
      isPrimary: source.isPrimary,
    })),
  });

  console.log("[portrait-sample] tamam:", `/tr/portreler/${portrait.slug}`);
}

main()
  .catch((error) => {
    console.error("[portrait-sample] hata:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
