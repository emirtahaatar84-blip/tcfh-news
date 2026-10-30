import { NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/auth";
import { unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Öneri penceresi: son 36 saatte oluşturulan haberler. */
const SUGGESTION_WINDOW_HOURS = 36;
const SUGGESTION_LIMIT = 8;

/**
 * GET /api/admin/moderation/suggestions (owner)
 * "En iyi haberler": yayında, denetlenmiş (qualityScore dolu) ve son 36
 * saatte oluşturulan haberler — qualityScore'a göre azalan, ilk 8 kayıt.
 */
export async function GET(request: Request) {
  if (!(await isAdminAuthorized(request))) return unauthorized();

  const cutoff = new Date(
    Date.now() - SUGGESTION_WINDOW_HOURS * 60 * 60 * 1000,
  );

  const rows = await prisma.newsItem.findMany({
    where: {
      removedAt: null,
      qualityScore: { not: null },
      createdAt: { gte: cutoff },
    },
    orderBy: [{ qualityScore: "desc" }, { createdAt: "desc" }],
    take: SUGGESTION_LIMIT,
    select: {
      id: true,
      title: true,
      summary: true,
      category: true,
      qualityScore: true,
      createdAt: true,
    },
  });

  return NextResponse.json(
    {
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        summary: row.summary,
        category: row.category,
        qualityScore: row.qualityScore,
        createdAt: row.createdAt.toISOString(),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
