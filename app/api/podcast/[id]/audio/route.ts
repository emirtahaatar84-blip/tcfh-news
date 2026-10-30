import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  generatePodcastAudio,
  isPodcastAuthorized,
  PodcastError,
  PODCAST_ERROR_STATUS,
  serializePodcastEpisode,
} from "@/lib/podcast";

export const dynamic = "force-dynamic";

const ID_PATTERN = /^[a-zA-Z0-9]{5,40}$/;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/podcast/:id/audio — mp3 servis.
 * Owner her statüde dinleyebilir; herkese açık erişim YALNIZCA
 * status="published" olanlar içindir (yetkisiz + yayınlanmamış → 404).
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  if (!ID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: "INVALID_ID", message: "Geçersiz kayıt kimliği." },
      { status: 400 },
    );
  }

  const record = await prisma.podcastEpisode.findUnique({
    where: { id },
    select: { id: true, status: true, audio: true },
  });

  if (!record || record.audio === null || record.audio.length === 0) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Ses bulunamadı." },
      { status: 404 },
    );
  }

  const isOwner = await isPodcastAuthorized(request);

  if (!isOwner && record.status !== "published") {
    // Yayımlanmamış bölümün varlığını sızdırmamak için 404.
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Ses bulunamadı." },
      { status: 404 },
    );
  }

  const audio = new Uint8Array(record.audio);

  return new Response(audio, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(audio.length),
      // Yayımlanan bölüm publicly cache'lenir; owner önizlemesi asla.
      "Cache-Control":
        record.status === "published"
          ? "public, max-age=3600"
          : "private, no-store",
      "Accept-Ranges": "bytes",
    },
  });
}

/**
 * POST /api/podcast/:id/audio (owner)
 * Ses üretimini başlatır (draft/failed → audio_processing) ve 202 döner.
 * Üretim arka planda sürer; istemci GET /api/podcast ile poll eder.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  if (!(await isPodcastAuthorized(request))) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Yetki gerekli." },
      { status: 401 },
    );
  }

  const { id } = await params;

  if (!ID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: "INVALID_ID", message: "Geçersiz kayıt kimliği." },
      { status: 400 },
    );
  }

  try {
    const record = await generatePodcastAudio(id);

    return NextResponse.json(
      { item: serializePodcastEpisode(record) },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof PodcastError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: PODCAST_ERROR_STATUS[error.code] ?? 400 },
      );
    }

    return NextResponse.json(
      { error: "AUDIO_FAILED", message: "Ses üretimi başlatılamadı." },
      { status: 500 },
    );
  }
}
