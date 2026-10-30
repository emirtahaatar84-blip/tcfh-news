import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  isVideoNewsAuthorized,
  processVideoNews,
  serializeVideoNews,
} from "@/lib/video-news";

export const dynamic = "force-dynamic";

/**
 * POST /api/video-news/:id/retry
 * failed durumdaki kaydı tekrar işleme alır (status=processing + arka plan
 * işlemi).
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

  if (existing.status !== "failed") {
    return NextResponse.json(
      {
        error: "NOT_FAILED",
        message: "Sadece başarısız kayıtlar yeniden işlenebilir.",
      },
      { status: 409 },
    );
  }

  const record = await prisma.videoNews.update({
    where: { id },
    data: { status: "processing", error: null },
  });

  // Arka planda yeniden işle — isteği bekletme.
  void processVideoNews(id);

  return NextResponse.json(
    { item: serializeVideoNews(record) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
