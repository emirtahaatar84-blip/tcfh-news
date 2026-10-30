import { NextRequest, NextResponse } from "next/server";
import { allowRequest } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/portraits/[id]/view
 *
 * Toplu (kişi bazlı olmayan) okunma sayacı. IP okunmaz, çerez yazılmaz,
 * kullanıcı kimliği tutulmaz. Aynı tarayıcıda tekilleştirme istemci
 * tarafında (sessionStorage) yapılır.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  // Uç nokta bazlı, kişiselleştirilmemiş hız sınırı.
  if (!allowRequest("portrait-view", 120)) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const { id } = await context.params;

  if (!/^[a-zA-Z0-9_-]{5,60}$/.test(id)) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  }

  try {
    const updated = await prisma.portrait.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
      select: { viewCount: true, status: true },
    });

    if (updated.status !== "published") {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json(
      { success: true, viewCount: updated.viewCount },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
}
