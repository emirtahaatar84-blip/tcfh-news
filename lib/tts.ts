import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { resolveSpeechEndpoint, resolveTtsModel } from "@/lib/speech";
import { getVoicePersona, type VoicePersona } from "@/lib/voices";
import { truncate } from "@/lib/utils";

/**
 * VoxCPM 2 TTS helper. Synthesizes speech through the OpenAI-compatible
 * /audio/speech endpoint of the configured LLM provider (same API key) and
 * caches the result in TtsCache by an explicit cache key, so every
 * (content, persona) pair is billed exactly once.
 *
 * Voice Design: the provider only ships the `default` voice but accepts
 * free-form textual voice descriptions via `instructions`.
 */

const TTS_TIMEOUT_MS = 180_000;

export class TtsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TtsError";
  }
}

async function synthesize(
  text: string,
  persona: VoicePersona,
): Promise<{ data: string; mimeType: string }> {
  const settings = await getSettings();

  if (!settings.providerUrl.trim() || !settings.apiKey.trim()) {
    throw new TtsError("LLM provider is not configured.");
  }

  const endpoint = resolveSpeechEndpoint(settings.providerUrl);
  const model = resolveTtsModel();

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model,
      voice: "default",
      ...(persona.instructions
        ? { instructions: persona.instructions }
        : {}),
      input: text,
      response_format: "mp3",
    }),
    signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
    cache: "no-store",
  });

  if (!response.ok) {
    const details = truncate((await response.text()).replace(/\s+/g, " "), 300);
    throw new TtsError(
      `TTS HTTP ${response.status}${details ? `: ${details}` : ""}`,
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length === 0) {
    throw new TtsError("TTS returned an empty audio body.");
  }

  const mimeType = response.headers.get("content-type") ?? "audio/mpeg";

  return {
    data: buffer.toString("base64"),
    mimeType: mimeType.startsWith("audio/") ? mimeType : "audio/mpeg",
  };
}

export type CachedAudio = {
  data: string;
  mimeType: string;
};

/** Returns cached audio for the key, synthesizing and storing it on miss. */
export async function getOrSynthesizeAudio(
  cacheKey: string,
  text: string,
  personaKey: string | null | undefined,
): Promise<CachedAudio> {
  const cached = await prisma.ttsCache.findUnique({ where: { cacheKey } });
  if (cached) return { data: cached.data, mimeType: cached.mimeType };

  const persona = getVoicePersona(personaKey);
  const audio = await synthesize(text, persona);

  try {
    await prisma.ttsCache.create({
      data: {
        cacheKey,
        data: audio.data,
        mimeType: audio.mimeType,
      },
    });
  } catch {
    // Concurrent request cached the same audio — that copy wins.
    const existing = await prisma.ttsCache.findUnique({ where: { cacheKey } });
    if (existing) {
      return { data: existing.data, mimeType: existing.mimeType };
    }
  }

  return audio;
}

/** Serves cached audio bytes with immutable cache headers. */
export function audioResponse(audio: CachedAudio): Response {
  const buffer = Buffer.from(audio.data, "base64");

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": audio.mimeType,
      "Content-Length": String(buffer.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Accept-Ranges": "bytes",
    },
  });
}
