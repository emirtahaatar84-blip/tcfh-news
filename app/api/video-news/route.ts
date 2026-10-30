import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  isVideoNewsAuthorized,
  serializeVideoNews,
  submitVideoNews,
  videoNewsSubmitSchema,
} from "@/lib/video-news";

export const dynamic = "force-dynamic";

/**
 * GET /api/video-news
 * Tüm video haber kayıtları (yeniden eskiye), transkript HARİÇ.
 */
export async function GET(request: NextRequest) {
  if (!(await isVideoNewsAuthorized(request))) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Yetki gerekli." },
      { status: 401 },
    );
  }

  const rows = await prisma.videoNews.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(
    { items: rows.map(serializeVideoNews) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * POST /api/video-news
 * Gövde: { url: "https://www.youtube.com/watch?v=..." }
 * Kaydı oluşturur (status=processing) ve işlemeyi arka planda başlatır.
 * Aynı video tekrar gönderilirse mevcut kayıt döner (mükerrer engeli).
 */
export async function POST(request: NextRequest) {
  if (!(await isVideoNewsAuthorized(request))) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Yetki gerekli." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "INVALID_JSON", message: "Geçersiz JSON gövdesi." },
      { status: 400 },
    );
  }

  const parsed = videoNewsSubmitSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "INVALID_PAYLOAD",
        message: "Geçerli bir YouTube linki girin (youtube.com veya youtu.be).",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  let record;
  try {
    record = await submitVideoNews(parsed.data.url);
  } catch (error) {
    return NextResponse.json(
      {
        error: "SUBMIT_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Video haber kaydı oluşturulamadı.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { item: serializeVideoNews(record) },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
