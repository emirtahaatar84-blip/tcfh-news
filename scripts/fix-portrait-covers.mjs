#!/usr/bin/env node
/**
 * Telif temizliği: portre kapaklarını dış kaynak URL'lerinden kendi
 * AI üretimimize taşır.
 *
 * Neden: kapak görselleri kantan.news/haber ajansı kaynaklıydı → telif
 * riski. Artık her portre /api/portraits/:id/image ucundan TELİFSİZ,
 * tamamen özgün illüstrasyonla servis edilir.
 *
 * Idempotent. Kullanım:
 *   npm run portrait:fix-covers
 *   docker compose exec news node scripts/fix-portrait-covers.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CREDIT = "Yapay zekâ ile üretilmiş özgün illüstrasyon";

async function main() {
  const rows = await prisma.portrait.findMany({
    select: { id: true, slug: true, coverImageUrl: true, coverImageCredit: true },
  });

  let updated = 0;

  for (const row of rows) {
    const expected = `/api/portraits/${row.id}/image`;
    const needsFix =
      row.coverImageUrl !== expected ||
      row.coverImageCredit !== CREDIT;

    if (!needsFix) continue;

    const wasExternal = Boolean(
      row.coverImageUrl && /^https?:\/\//i.test(row.coverImageUrl),
    );

    await prisma.portrait.update({
      where: { id: row.id },
      data: {
        coverImageUrl: expected,
        coverImageCaption: null,
        coverImageCredit: CREDIT,
      },
    });

    updated += 1;
    console.log(
      `[fix-covers] ${row.slug} → ${expected}${wasExternal ? " (dış görsel kaldırıldı)" : ""}`,
    );
  }

  console.log(`[fix-covers] tamam: ${updated}/${rows.length} güncellendi.`);
}

main()
  .catch((error) => {
    console.error("[fix-covers] hata:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
