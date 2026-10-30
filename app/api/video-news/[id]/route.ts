import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isVideoNewsAuthorized } from "@/lib/video-news";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/video-news/:id
 * Video haber kaydını siler. Kayıt yayımlanmışsa yalnızca VideoNews kaydı
 * silinir — bağlı NewsItem akışta kalır.
 */
export async function DELETE(
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

  await prisma.videoNews.delete({ where: { id } });

  return NextResponse.json(
    {
      deleted: true,
      newsItemId: existing.newsItemId,
      newsItemKept: Boolean(existing.newsItemId),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
