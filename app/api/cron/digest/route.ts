import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { generateDailyDigest } from "@/lib/digest";
import { generateDigestAudio, purgeOldDigestAudio } from "@/lib/digest-audio";
import { broadcastDailyDigest, isTelegramEnabled } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * FAZ 4.1 — Günün özeti cron'u (her gün 08:00 Europe/Istanbul).
 *
 * GET/POST /api/cron/digest?key=CRON_SECRET_KEY
 *   ?force=1  → aynı gün için yeniden üret
 *   ?audio=0  → sesli bülten üretme
 *
 * Sıra: özet üret → sesli bülten → Telegram yayını → eski sesleri sil.
 */
async function handle(request: NextRequest) {
  if (!(await isCronAuthorized(request))) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const force = params.get("force") === "1";
  const withAudio = params.get("audio") !== "0";

  const digest = await generateDailyDigest({ force });

  let audio: Awaited<ReturnType<typeof generateDigestAudio>> | null = null;
  if (withAudio) {
    audio = await generateDigestAudio(digest.id);
  }

  const broadcast = await broadcastDailyDigest({
    id: digest.id,
    title: digest.title,
    body: digest.body,
  });

  const purged = await purgeOldDigestAudio();

  return NextResponse.json(
    {
      success: true,
      date: digest.date,
      created: digest.created,
      stories: digest.newsIds.length,
      audio: audio ? { ok: audio.ok, url: audio.url, seconds: audio.seconds } : null,
      telegram: { enabled: isTelegramEnabled(), ...broadcast },
      purgedAudioFiles: purged,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
