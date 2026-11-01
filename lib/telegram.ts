import { prisma } from "@/lib/prisma";
import { siteBase } from "@/lib/feeds";

/**
 * FAZ 4.2 — Telegram botu.
 *
 * Komutlar:
 *   /start  → abone ol
 *   /dur    → abonelikten çık
 *
 * KVKK: YALNIZCA `chatId` saklanır. Ad, kullanıcı adı, telefon, konum
 * TUTULMAZ. Bot token'ı yalnızca ortam değişkeninden (`TELEGRAM_BOT_TOKEN`)
 * okunur, koda gömülmez, istemciye gönderilmez.
 */

const API = "https://api.telegram.org";

function token(): string | null {
  const value = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return value && value.length > 20 ? value : null;
}

export function isTelegramEnabled(): boolean {
  return token() !== null;
}

/** Botun genel linki (@kullaniciadi → https://t.me/kullaniciadi). */
export function telegramBotUrl(): string | null {
  const username = process.env.TELEGRAM_BOT_USERNAME?.trim()?.replace(/^@/, "");
  return username ? `https://t.me/${username}` : null;
}

type TgMessage = {
  message_id: number;
  chat: { id: number | string };
  text?: string;
  from?: { language_code?: string };
};

type TgUpdate = { update_id: number; message?: TgMessage };

async function callApi<T>(
  method: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; result?: T; error?: string }> {
  const botToken = token();
  if (!botToken) return { ok: false, error: "TELEGRAM_BOT_TOKEN tanımlı değil" };

  try {
    const response = await fetch(`${API}/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });

    const payload = (await response.json()) as {
      ok?: boolean;
      result?: T;
      description?: string;
    };

    if (!payload.ok) {
      return { ok: false, error: payload.description ?? `HTTP ${response.status}` };
    }

    return { ok: true, result: payload.result };
  } catch (error) {
    return { ok: false, error: (error as Error).message.slice(0, 160) };
  }
}

/** Basit mesaj gönderir. Markdown kullanılmaz (kullanıcı adı kaçış sorunu). */
export async function sendTelegramMessage(
  chatId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const result = await callApi<TgMessage>("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  });

  return { ok: result.ok, error: result.error };
}

/**
 * Webhook güncellemesini işler. `/start` abonenin kaydını açar,
 * `/dur` kapatır. Bilinmeyen komutlarda kısa yardım yanıtı verilir.
 */
export async function handleTelegramUpdate(update: TgUpdate): Promise<void> {
  const message = update.message;
  if (!message?.text) return;

  const chatId = String(message.chat.id);
  const command = message.text.trim().toLowerCase().split(/\s+/)[0].replace(/@.*$/, "");
  const base = siteBase();

  if (command === "/start") {
    await prisma.telegramSubscriber.upsert({
      where: { chatId },
      update: { active: true },
      create: {
        chatId,
        active: true,
        locale: message.from?.language_code?.startsWith("tr") ? "tr" : "tr",
      },
    });

    await sendTelegramMessage(
      chatId,
      [
        "Abone oldunuz ✅",
        "",
        "Her sabah 08:00'de günün özetini buraya göndereceğim.",
        `Haberlere göz atmak için: ${base}`,
        "",
        "Çıkmak için /dur yazın.",
      ].join("\n"),
    );
    return;
  }

  if (command === "/dur" || command === "/stop") {
    await prisma.telegramSubscriber.updateMany({
      where: { chatId },
      data: { active: false },
    });

    await sendTelegramMessage(chatId, "Abonelik durduruldu. Tekrar başlamak için /start yazın.");
    return;
  }

  await sendTelegramMessage(
    chatId,
    ["Komutlar:", "/start — günlük özet aboneliği", "/dur — aboneliği durdur"].join("\n"),
  );
}

/**
 * Günün özetini tüm aktif abonelere gönderir.
 * Aynı özet ikinci kez gönderilmez (`sentAt`).
 */
export async function broadcastDailyDigest(digest: {
  id: string;
  title: string;
  body: string;
  sentAt?: Date | null;
}): Promise<{ sent: number; failed: number; skipped: boolean }> {
  if (!isTelegramEnabled()) return { sent: 0, failed: 0, skipped: true };
  if (digest.sentAt) return { sent: 0, failed: 0, skipped: true };

  const subscribers = await prisma.telegramSubscriber.findMany({
    where: { active: true },
    select: { chatId: true },
    take: 5000,
  });

  const base = siteBase();
  const text = `${digest.title}\n\n${digest.body}\n\n${base}`;

  let sent = 0;
  let failed = 0;

  for (const subscriber of subscribers) {
    const result = await sendTelegramMessage(subscriber.chatId, text);
    if (result.ok) {
      sent += 1;
    } else {
      failed += 1;
      // Bot engellenmiş / sohbet silinmiş → aboneliği kapat.
      if (result.error?.includes("blocked") || result.error?.includes("chat not found")) {
        await prisma.telegramSubscriber
          .updateMany({ where: { chatId: subscriber.chatId }, data: { active: false } })
          .catch(() => undefined);
      }
    }
    // Telegram sınırı: saniyede ~30 mesaj. Küçük bekleme.
    await new Promise((resolve) => setTimeout(resolve, 35));
  }

  if (sent > 0) {
    await prisma.dailyDigest.update({
      where: { id: digest.id },
      data: { sentAt: new Date() },
    });
  }

  return { sent, failed, skipped: false };
}
