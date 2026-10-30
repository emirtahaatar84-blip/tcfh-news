import { NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/auth";
import { unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/moderation/removed (owner)
 * Yumuşak kaldırılmış haberler (owner veya gemma-audit tarafından),
 * kaldırma zamanına göre yeniden eskiye, en fazla 50 kayıt.
 */
export async function GET(request: Request) {
  if (!(await isAdminAuthorized(request))) return unauthorized();

  const rows = await prisma.newsItem.findMany({
    where: { removedAt: { not: null } },
    orderBy: { removedAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      removedAt: true,
      removalReason: true,
      removedBy: true,
    },
  });

  return NextResponse.json(
    {
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        removedAt: row.removedAt?.toISOString() ?? null,
        removalReason: row.removalReason,
        removedBy: row.removedBy,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
