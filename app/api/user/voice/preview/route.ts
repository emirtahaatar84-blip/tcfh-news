import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/next-auth";
import { getOrSynthesizeAudio, TtsError } from "@/lib/tts";
import { getErrorMessage } from "@/lib/utils";
import { getVoicePersona } from "@/lib/voices";

export const dynamic = "force-dynamic";

/**
 * Persona preview: a short fixed sample line synthesized in the requested
 * voice (Voice Design), cached per persona. Sign-in required.
 */

const PREVIEW_TEXT =
  "Merhaba! Ben de haber özetlerini sizin için seslendirebilirim. Sesli özetlerde bu tonu duyar, her haberi tarafsız bir dille dinlersiniz.";

function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "UNAUTHORIZED", message: "Sign in required." },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return unauthorized();

  const voiceKey = new URL(request.url).searchParams.get("voice") ?? "default";
  const persona = getVoicePersona(voiceKey);

  try {
    const audio = await getOrSynthesizeAudio(
      `preview:${persona.key}`,
      PREVIEW_TEXT,
      persona.key,
    );

    // Previews may evolve with the persona set: cache moderately.
    return new Response(new Uint8Array(Buffer.from(audio.data, "base64")), {
      status: 200,
      headers: {
        "Content-Type": audio.mimeType,
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error) {
    const status = error instanceof TtsError ? 502 : 500;
    return NextResponse.json(
      { error: "AUDIO_FAILED", message: getErrorMessage(error) },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
