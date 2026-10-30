import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isPodcastAuthorized } from "@/lib/podcast";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/podcast/:id (owner)
 * Podcast bölüm kaydını (ses dahil) siler.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isPodcastAuthorized(request))) {
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

  const existing = await prisma.podcastEpisode.findUnique({ where: { id } });

  if (!existing) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Podcast kaydı bulunamadı." },
      { status: 404 },
    );
  }

  await prisma.podcastEpisode.delete({ where: { id } });

  return NextResponse.json(
    { deleted: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
