import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/next-auth";
import { prisma } from "@/lib/prisma";
import {
  audioResponse,
  getOrSynthesizeAudio,
  TtsError,
} from "@/lib/tts";
import { getErrorMessage, markdownToPlainText, truncate } from "@/lib/utils";
import { getVoicePersona } from "@/lib/voices";

export const dynamic = "force-dynamic";

/**
 * "Sesli Özet" — text-to-speech for a news story, read in the signed-in
 * user's preferred voice persona (Voice Design via `instructions`).
 * Anonymous visitors get the site default voice. Audio is cached per
 * (story, persona) in TtsCache.
 */

const ID_PATTERN = /^[a-zA-Z0-9]{5,40}$/;
const MAX_SPEECH_CHARS = 4_000;

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json(
    { error: "AUDIO_FAILED", message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function buildSpeechText(item: {
  title: string;
  summary: string;
  detailedContent: string | null;
}): string {
  const body = item.detailedContent?.trim() || item.summary;
  const text = `${item.title}. ${markdownToPlainText(body)}`;
  return truncate(text, MAX_SPEECH_CHARS);
}

async function preferredVoiceKey(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return "default";

  const user = await prisma.user.findUnique({
    where: { email },
    select: { selectedVoice: true },
  });

  return user?.selectedVoice ?? "default";
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  if (!ID_PATTERN.test(id)) {
    return errorResponse("Invalid news id.", 400);
  }

  const item = await prisma.newsItem.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      summary: true,
      detailedContent: true,
      removedAt: true,
    },
  });

  // Kaldırılmış haberin sesli özeti üretilmez.
  if (!item || item.removedAt !== null) {
    return errorResponse("News item not found.", 404);
  }

  const persona = getVoicePersona(await preferredVoiceKey());

  try {
    const audio = await getOrSynthesizeAudio(
      `news:${item.id}:${persona.key}`,
      buildSpeechText(item),
      persona.key,
    );

    return audioResponse(audio);
  } catch (error) {
    const status = error instanceof TtsError ? 502 : 500;
    return errorResponse(getErrorMessage(error), status);
  }
}
