import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { resolveSpeechEndpoint, resolveTtsModel } from "@/lib/speech";
import { getVoicePersona } from "@/lib/voices";

/**
 * FAZ 4.3 — Sesli bülten (günün özeti → mp3).
 *
 * SES MOTORU: Mevcut TTS hattı (VoxCPM 2, OpenAI uyumlu `/audio/speech`).
 *
 * NEDEN Piper DEĞİL: Piper iyi bir açık kaynak Türkçe TTS'tir ama ayrı bir
 * ikili (binary) + 60-100 MB model indirmesi + konteyner imajında ek katman
 * gerektirir. Projede zaten çalışan ve Türkçe destekleyen bir TTS istemcisi
 * var; aynı işi ek bağımlılık olmadan yapıyor. Piper'a geçiş istenirse
 * yalnızca `synthesize()` içi değişir (arayüz aynı kalır).
 *
 * SAKLAMA: media/digest/YYYY-MM-DD.mp3 — 14 günden eski dosyalar silinir.
 */

const MEDIA_DIR = path.join(process.cwd(), "media", "digest");
const RETENTION_DAYS = 14;
const TTS_TIMEOUT_MS = 180_000;

/** Özet metnini seslendirmeye uygun hâle getirir. */
function toSpeechText(title: string, body: string): string {
  return [
    title,
    "",
    body,
    "",
    "Ayrıntılar için siteyi ziyaret edebilirsiniz.",
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

async function synthesizeSpeech(text: string): Promise<Buffer | null> {
  const settings = await getSettings();

  if (!settings.providerUrl.trim() || !settings.apiKey.trim()) {
    return null;
  }

  const persona = getVoicePersona("default");

  try {
    const response = await fetch(resolveSpeechEndpoint(settings.providerUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: resolveTtsModel(),
        voice: "default",
        ...(persona?.instructions ? { instructions: persona.instructions } : {}),
        input: text,
        response_format: "mp3",
      }),
      signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.length > 5000 ? buffer : null;
  } catch {
    return null;
  }
}

/** mp3 süresini kabadan tahmin eder (bit hızı 64 kbps varsayımı). */
function estimateSeconds(bytes: number): number {
  return Math.max(1, Math.round((bytes * 8) / (64 * 1000)));
}

/**
 * Günün özeti için sesli bülten üretir. MP3 diske yazılır ve
 * `DailyDigest.audioUrl` güncellenir.
 */
export async function generateDigestAudio(digestId: string): Promise<{
  ok: boolean;
  url?: string;
  seconds?: number;
  reason?: string;
}> {
  const digest = await prisma.dailyDigest.findUnique({ where: { id: digestId } });
  if (!digest) return { ok: false, reason: "Özet bulunamadı." };

  // Zaten var olan dosyayı yeniden üretme.
  if (digest.audioUrl) {
    const filePath = path.join(MEDIA_DIR, `${digest.date}.mp3`);
    try {
      await stat(filePath);
      return { ok: true, url: digest.audioUrl, seconds: digest.audioSeconds ?? undefined };
    } catch {
      // Dosya yok → yeniden üret.
    }
  }

  await prisma.dailyDigest
    .update({ where: { id: digestId }, data: { status: "audio_processing" } })
    .catch(() => undefined);

  const audio = await synthesizeSpeech(toSpeechText(digest.title, digest.body));

  if (!audio) {
    await prisma.dailyDigest
      .update({ where: { id: digestId }, data: { status: "audio_failed" } })
      .catch(() => undefined);

    return {
      ok: false,
      reason: "TTS sağlayıcısı yapılandırılmamış veya yanıt vermedi.",
    };
  }

  await mkdir(MEDIA_DIR, { recursive: true });
  await writeFile(path.join(MEDIA_DIR, `${digest.date}.mp3`), audio);

  const url = `/api/digest/${digest.date}/audio`;
  const seconds = estimateSeconds(audio.length);

  await prisma.dailyDigest.update({
    where: { id: digestId },
    data: { audioUrl: url, audioSeconds: seconds, status: "ready" },
  });

  return { ok: true, url, seconds };
}

/** Sesli bülten dosyasını okur (route için). */
export async function readDigestAudio(
  date: string,
): Promise<{ data: Buffer; mime: string } | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  try {
    const data = await readFile(path.join(MEDIA_DIR, `${date}.mp3`));
    return { data, mime: "audio/mpeg" };
  } catch {
    return null;
  }
}

/** 14 günden eski ses dosyalarını siler; DB kaydındaki audioUrl temizlenir. */
export async function purgeOldDigestAudio(): Promise<number> {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let removed = 0;

  try {
    const files = await readdir(MEDIA_DIR);

    for (const file of files) {
      if (!file.endsWith(".mp3")) continue;

      const filePath = path.join(MEDIA_DIR, file);
      const info = await stat(filePath).catch(() => null);
      if (!info || info.mtimeMs >= cutoff) continue;

      await unlink(filePath).catch(() => undefined);
      removed += 1;

      const date = file.replace(/\.mp3$/, "");
      await prisma.dailyDigest
        .updateMany({ where: { date }, data: { audioUrl: null } })
        .catch(() => undefined);
    }
  } catch {
    // Klasör yoksa yapılacak bir şey yok.
  }

  return removed;
}
