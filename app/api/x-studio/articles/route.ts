import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isStudioAuthorized } from "@/lib/x-studio";

export const dynamic = "force-dynamic";

/**
 * GET /api/x-studio/articles?date=&category=&q=
 * Post üretilebilecek yayınlanmış haberler. `hasDraft` alanı, habere daha
 * önce havuzdan post atıldığını (mükerrer uyarısı için) işaretler.
 */
export async function GET(request: NextRequest) {
  if (!(await isStudioAuthorized(request))) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Yetki gerekli." },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? "";
  const category = searchParams.get("category") ?? "";
  const q = (searchParams.get("q") ?? "").trim().slice(0, 100);

  // Tarih filtresi: YYYY-AA-GG → o günün başlangıcı.
  let createdAt: { gte?: Date; lt?: Date } | undefined;

  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    createdAt = { gte: start, lt: end };
  }

  const rows = await prisma.newsItem.findMany({
    where: {
      removedAt: null,
      ...(createdAt ?? {}),
      ...(category ? { category } : {}),
      ...(q
        ? { OR: [{ title: { contains: q } }, { summary: { contains: q } }] }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: {
      id: true,
      title: true,
      summary: true,
      category: true,
      sourcesCount: true,
      createdAt: true,
      xDrafts: { select: { id: true }, take: 1 },
    },
  });

  return NextResponse.json(
    {
      articles: rows.map((row) => ({
        id: row.id,
        title: row.title,
        summary: row.summary,
        category: row.category,
        sourcesCount: row.sourcesCount,
        createdAt: row.createdAt.toISOString(),
        hasDraft: row.xDrafts.length > 0,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
