import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  isPodcastAuthorized,
  podcastSubmitSchema,
  serializePodcastEpisode,
  submitPodcastEpisode,
} from "@/lib/podcast";

export const dynamic = "force-dynamic";

/**
 * GET /api/podcast (owner)
 * Tüm podcast bölümleri (yeniden eskiye, 100 limit), script dahil,
 * ses bytes hariç.
 */
export async function GET(request: NextRequest) {
  if (!(await isPodcastAuthorized(request))) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Yetki gerekli." },
      { status: 401 },
    );
  }

  const rows = await prisma.podcastEpisode.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(
    { items: rows.map(serializePodcastEpisode) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * POST /api/podcast (owner)
 * Gövde: { mode: "daily"|"weekly"|"custom", category?: string|null,
 *         topic?: string, newsIds?: string[] (max 8) }
 * Kaydı oluşturur (status=processing) ve senaryo üretimini arka planda
 * başlatır. newsIds verildiyse materyal o kısıya iner (custom mod gibi;
 * topic opsiyonel). newsIds yoksa custom modda topic zorunludur.
 */
export async function POST(request: NextRequest) {
  if (!(await isPodcastAuthorized(request))) {
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

  const parsed = podcastSubmitSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "INVALID_PAYLOAD",
        message: "Geçersiz istek gövdesi.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    const record = await submitPodcastEpisode(parsed.data);

    return NextResponse.json(
      { item: serializePodcastEpisode(record) },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "SUBMIT_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Podcast kaydı oluşturulamadı.",
      },
      { status: 400 },
    );
  }
}
