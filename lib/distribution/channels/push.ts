import { notifyCategory } from "@/lib/push";

/**
 * YAYILMA KANALI: Web Push.
 *
 * Mevcut `lib/push.ts` altyapısını sarmalar; motor için tek tip sonuç
 * döndürür. Bildirim tercihleri abone bazlıdır (kategori seçimi).
 *
 * KVKK: abonelik verisi cihazda kalır, sunucuda yalnızca push endpoint'i
 * ve şifreli anahtarlar bulunur (bildirim göndermek için zorunlu).
 */

export type PushChannelResult = {
  ok: boolean;
  sent: number;
  failed: number;
  error?: string;
};

export async function sendPush(story: {
  id: string;
  title: string;
  category: string;
  sourcesCount: number;
}): Promise<PushChannelResult> {
  try {
    const summary = await notifyCategory(story.category, {
      title: story.title,
      body: "Yeni haber yayınlandı",
      url: `/tr/haber/${story.id}`,
      tag: `news-${story.id}`,
    });

    // Hiç abone yoksa bu bir hata değil, "gönderilecek kimse yok".
    const ok = summary.failed === 0 || summary.sent > 0;

    return {
      ok,
      sent: summary.sent,
      failed: summary.failed,
      error: summary.error,
    };
  } catch (error) {
    return {
      ok: false,
      sent: 0,
      failed: 0,
      error: (error as Error).message.slice(0, 120),
    };
  }
}
