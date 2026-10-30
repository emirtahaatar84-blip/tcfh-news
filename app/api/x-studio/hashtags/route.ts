import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isStudioAuthorized } from "@/lib/x-studio";

export const dynamic = "force-dynamic";

/**
 * GET /api/x-studio/hashtags?categoryId=
 * Öneri havuzu: ağırlık sırasına göre (en son kullanma zamanı bilgisi ile).
 */
export async function GET(request: NextRequest) {
  if (!(await isStudioAuthorized(request))) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Yetki gerekli." },
      { status: 401 },
    );
  }

  const categoryId =
    new URL(request.url).searchParams.get("categoryId") ?? undefined;

  const rows = await prisma.hashTagPool.findMany({
    where: categoryId ? { categoryId } : undefined,
    orderBy: [{ weight: "desc" }, { tag: "asc" }],
    take: 50,
  });

  return NextResponse.json(
    {
      hashtags: rows.map((row) => ({
        tag: row.tag,
        categoryId: row.categoryId,
        weight: row.weight,
        lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
