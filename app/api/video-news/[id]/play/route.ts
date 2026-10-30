import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  isVideoNewsAuthorized,
  serializeVideoNews,
} from "@/lib/video-news";

export const dynamic = "force-dynamic";

/**
 * POST /api/video-news/:id/play
 * Owner videoyu oynadı — playedAt'i işaretler (yalnızca null ise).
 * Bu, yayınlama kilidini açar.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isVideoNewsAuthorized(request))) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Yetki gerekli." },
      { status: 401 },
    );
  }

  const { id } = await params;

  if (!/^[a-zA-Z0-9]{5,40}$/.test(id)) {
    return NextResponse.json(
      { error: "INVALID_ID", message: "Geçersiz kayıt kimliği." },
      { status: 400 },
    );
  }

  const existing = await prisma.videoNews.findUnique({ where: { id } });

  if (!existing) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Video haber kaydı bulunamadı." },
      { status: 404 },
    );
  }

  // Sadece null ise set et — tekrar oynatma zamanı damgasını değiştirmez.
  const record =
    existing.playedAt === null
      ? await prisma.videoNews.update({
          where: { id },
          data: { playedAt: new Date() },
        })
      : existing;

  return NextResponse.json(
    { item: serializeVideoNews(record) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
