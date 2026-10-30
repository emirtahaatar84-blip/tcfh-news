import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializePublicPodcastEpisode } from "@/lib/podcast";

export const dynamic = "force-dynamic";

/**
 * GET /api/podcast/public (herkese açık — koruma YOK)
 * Yayımlanmış bölümler: {id, title, mode, category, publishedAt,
 * audioDurationSec, hasAudio, speakers}. Senaryo metni YOK — yalnızca
 * konuşmacı listesi.
 */
export async function GET() {
  const rows = await prisma.podcastEpisode.findMany({
    where: { status: "published" },
    orderBy: { publishedAt: "desc" },
    take: 50,
  });

  return NextResponse.json(
    { items: rows.map(serializePublicPodcastEpisode) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
