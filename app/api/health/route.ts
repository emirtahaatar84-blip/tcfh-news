import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Son başarılı üretim bu süreden eskiyse sağlık "gecikme" durumuna düşer. */
const STALE_HOURS = 2;

/**
 * FAZ 1.4 — Sağlık ucu.
 *
 * GET /api/health
 *   { status, database, lastPublishedAt, hoursSincePublish, pipeline }
 *
 * `pipeline`:
 *   ok       → son 2 saat içinde haber üretildi
 *   gecikme  → 2 saatten uzun süredir yeni haber yok (LOG'a hata yazılır)
 *   bos      → hiç haber yok (yeni kurulum)
 *
 * 503 yalnızca veritabanı erişilemezse döner; üretim gecikmesi 200 + uyarı.
 */
export async function GET() {
  let lastPublishedAt: Date | null = null;

  try {
    await prisma.$queryRaw`SELECT 1`;

    const last = await prisma.newsItem.findFirst({
      where: { removedAt: null },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    lastPublishedAt = last?.createdAt ?? null;
  } catch {
    return NextResponse.json(
      {
        status: "error",
        database: "unreachable",
        message: "Veritabanına erişilemiyor.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const hoursSincePublish = lastPublishedAt
    ? Number(((Date.now() - lastPublishedAt.getTime()) / 3_600_000).toFixed(2))
    : null;

  const pipeline: "ok" | "gecikme" | "bos" =
    hoursSincePublish === null
      ? "bos"
      : hoursSincePublish > STALE_HOURS
        ? "gecikme"
        : "ok";

  // Üretim durduysa sunucu loglarına hata yaz (izleme araçları yakalar).
  if (pipeline === "gecikme") {
    console.error(
      JSON.stringify({
        channel: "health",
        level: "error",
        message: `Haber üretimi durmuş: son başarılı özet ${hoursSincePublish} saat önce.`,
        lastPublishedAt: lastPublishedAt?.toISOString() ?? null,
        thresholdHours: STALE_HOURS,
        at: new Date().toISOString(),
      }),
    );
  }

  return NextResponse.json(
    {
      status: "ok",
      database: "ok",
      lastPublishedAt: lastPublishedAt?.toISOString() ?? null,
      hoursSincePublish,
      pipeline,
      staleAfterHours: STALE_HOURS,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
