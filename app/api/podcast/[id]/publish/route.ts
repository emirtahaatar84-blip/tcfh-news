import { NextRequest, NextResponse } from "next/server";
import {
  isPodcastAuthorized,
  PodcastError,
  PODCAST_ERROR_STATUS,
  publishPodcastEpisode,
  serializePodcastEpisode,
} from "@/lib/podcast";

export const dynamic = "force-dynamic";

/**
 * POST /api/podcast/:id/publish (owner)
 * ready durumdaki bölümü yayımlar. Owner sesi dinleMEmişse (playedAt null)
 * 403 "Önce podcast'i dinlemelisiniz" döner.
 */
export async function POST(
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

  try {
    const record = await publishPodcastEpisode(id);

    return NextResponse.json(
      { item: serializePodcastEpisode(record) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof PodcastError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: PODCAST_ERROR_STATUS[error.code] ?? 400 },
      );
    }

    return NextResponse.json(
      { error: "PUBLISH_FAILED", message: "Bölüm yayımlanamadı." },
      { status: 500 },
    );
  }
}
