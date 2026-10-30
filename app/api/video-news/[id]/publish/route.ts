import { NextRequest, NextResponse } from "next/server";
import {
  isVideoNewsAuthorized,
  publishVideoNews,
  serializeVideoNews,
  VideoNewsError,
} from "@/lib/video-news";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ERROR_STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  NOT_PLAYED: 403,
  NOT_READY: 409,
  ALREADY_PUBLISHED: 409,
};

/**
 * POST /api/video-news/:id/publish
 * ready durumdaki haberi NewsItem olarak yayımlar. Video owner tarafından
 * oynatılMAMIŞSA (playedAt null) 403 döner.
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

  try {
    const newsItemId = await publishVideoNews(id);
    const record = await prisma.videoNews.findUnique({ where: { id } });

    return NextResponse.json(
      {
        newsItemId,
        item: record ? serializeVideoNews(record) : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof VideoNewsError) {
      return NextResponse.json(
        {
          error: error.code,
          message: error.message,
        },
        { status: ERROR_STATUS[error.code] ?? 400 },
      );
    }

    return NextResponse.json(
      { error: "PUBLISH_FAILED", message: "Haber yayımlanamadı." },
      { status: 500 },
    );
  }
}
