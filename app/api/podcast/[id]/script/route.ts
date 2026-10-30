import { NextRequest, NextResponse } from "next/server";
import {
  isPodcastAuthorized,
  PodcastError,
  podcastScriptUpdateSchema,
  PODCAST_ERROR_STATUS,
  serializePodcastEpisode,
  updatePodcastEpisodeScript,
} from "@/lib/podcast";

export const dynamic = "force-dynamic";

/**
 * PUT /api/podcast/:id/script (owner)
 * Gövde: { turns: [{speaker, text}] } — turns tamamen değiştirilir,
 * speakers sabit kalır. Mevcut ses varsa geçersiz kılınır (status=draft).
 */
export async function PUT(
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "INVALID_JSON", message: "Geçersiz JSON gövdesi." },
      { status: 400 },
    );
  }

  const parsed = podcastScriptUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "INVALID_PAYLOAD",
        message: "Geçersiz senaryo gövdesi.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    const record = await updatePodcastEpisodeScript(
      id,
      parsed.data.turns,
      parsed.data.speakerVoices,
    );

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
      { error: "UPDATE_FAILED", message: "Senaryo güncellenemedi." },
      { status: 500 },
    );
  }
}
