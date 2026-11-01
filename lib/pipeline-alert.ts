import { prisma } from "@/lib/prisma";
import { sendTelegramMessage, isTelegramEnabled } from "@/lib/telegram";
import { getSettings } from "@/lib/settings";

/**
 * FAZ 5.3 — Üretim durduğunda Telegram uyarısı.
 *
 * Kural: son başarılı sentez 2 saatten eskiyse haber ver. Aynı uyarı
 * SAATTE EN FAZLA BİR KEZ gönderilir (bellekte zaman damgası).
 *
 * Alıcı: OWNER_EMAIL'de tanımlı hesapların Telegram abonelikleri değil —
 * owner'ın kendi chat id'si `TELEGRAM_ALERT_CHAT_ID` env'inden okunur.
 * (Bot sahibi bota /start yazınca chat id'sini log'dan alabilir.)
 */

const ALERT_INTERVAL_MS = 60 * 60 * 1000; // 1 saat
const STALE_HOURS = 2;

type AlertState = { lastSentAt?: number };

const state = globalThis as unknown as { __pipelineAlert?: AlertState };

function alertState(): AlertState {
  if (!state.__pipelineAlert) state.__pipelineAlert = {};
  return state.__pipelineAlert;
}

export type PipelineCheck = {
  stale: boolean;
  hoursSincePublish: number | null;
  alerted: boolean;
  reason?: string;
};

/** Üretim durumunu denetler; gerekirse Telegram uyarısı gönderir. */
export async function checkPipelineHealth(): Promise<PipelineCheck> {
  const last = await prisma.newsItem.findFirst({
    where: { removedAt: null },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (!last) {
    return { stale: true, hoursSincePublish: null, alerted: false, reason: "Haber yok." };
  }

  const hours = (Date.now() - last.createdAt.getTime()) / 3_600_000;

  if (hours <= STALE_HOURS) {
    return { stale: false, hoursSincePublish: Number(hours.toFixed(1)), alerted: false };
  }

  const chatId = process.env.TELEGRAM_ALERT_CHAT_ID?.trim();

  if (!isTelegramEnabled() || !chatId) {
    return {
      stale: true,
      hoursSincePublish: Number(hours.toFixed(1)),
      alerted: false,
      reason: "TELEGRAM_BOT_TOKEN veya TELEGRAM_ALERT_CHAT_ID tanımlı değil.",
    };
  }

  // Saatte en fazla bir uyarı.
  const current = alertState();
  if (current.lastSentAt && Date.now() - current.lastSentAt < ALERT_INTERVAL_MS) {
    return {
      stale: true,
      hoursSincePublish: Number(hours.toFixed(1)),
      alerted: false,
      reason: "Bu saat içinde uyarı zaten gönderildi.",
    };
  }

  const settings = await getSettings().catch(() => null);

  const text = [
    "⚠️ Haber üretimi durdu",
    "",
    `Son başarılı sentez: ${hours.toFixed(1)} saat önce.`,
    `Eşik: ${STALE_HOURS} saat.`,
    settings?.modelName ? `Model: ${settings.modelName}` : "",
    "",
    "Kontrol: /api/health",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await sendTelegramMessage(chatId, text);

  if (result.ok) current.lastSentAt = Date.now();

  return {
    stale: true,
    hoursSincePublish: Number(hours.toFixed(1)),
    alerted: result.ok,
    reason: result.ok ? undefined : result.error,
  };
}
