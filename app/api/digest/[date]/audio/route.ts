import { NextRequest, NextResponse } from "next/server";
import { readDigestAudio } from "@/lib/digest-audio";

export const dynamic = "force-dynamic";

/**
 * FAZ 4.3 — GET /api/digest/YYYY-MM-DD/audio
 *
 * Günün özetinin sesli bülteni (mp3). Dosya yoksa 404.
 * Özel karakter içermeyen, tarih biçimli bir yoldur; kimlik doğrulaması yok.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ date: string }> },
) {
  const { date } = await context.params;

  const audio = await readDigestAudio(date);

  if (!audio) {
    return new NextResponse("Ses dosyası bulunamadı.", { status: 404 });
  }

  return new NextResponse(new Uint8Array(audio.data), {
    status: 200,
    headers: {
      "Content-Type": audio.mime,
      "Content-Length": String(audio.data.length),
      "Cache-Control": "public, max-age=86400",
      "Accept-Ranges": "bytes",
    },
  });
}
