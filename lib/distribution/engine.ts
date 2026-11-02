import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { siteBase } from "@/lib/feeds";
import { foldTurkish } from "@/lib/hq/normalize";

/**
 * HABER YAYILMA MOTORU — çekirdek.
 *
 * NEDEN: Yayılma bugüne kadar dağınıktı: push `processor.ts` içinden,
 * IndexNow yoktu, sosyal paylaşım elle yapılıyordu. Hiçbirinin sonucu
 * kaydedilmiyordu; başarısız gönderim sessizce kayboluyordu.
 *
 * ÇÖZÜM: Her haber için TEK bir "dağıtım işi" oluşturulur. İş, kanallara
 * ayrılır; her kanal bağımsız denetlenir, sonucu kaydedilir ve başarısız
 * olan üstel geri çekilmeyle yeniden denenir.
 *
 * İlkeler:
 *   • Yayın asla engellenmez — motor fire-and-forget çalışır.
 *   • Her deneme `DistributionLog`'a yazılır (kanal, durum, hata, süre).
 *   • Aynı haber + kanal ikinci kez gönderilmez (idempotent).
 *   • KVKK: kanal bazlı hiçbir kişisel veri saklanmaz.
 */

export type ChannelId =
  | "push"
  | "indexnow"
  | "social"
  | "rss"
  | "sitemap";

export type ChannelStatus = "pending" | "sent" | "skipped" | "failed";

export type DistributableStory = {
  id: string;
  slug: string | null;
  title: string;
  summary: string;
  category: string;
  sourcesCount: number;
  verifiedSourceCount: number;
  createdAt: Date;
};

/** Hangi haber hangi kanala gider — tek karar noktası. */
export type ChannelPlan = {
  channel: ChannelId;
  /** Kanal bu haber için çalıştırılacak mı. */
  shouldSend: boolean;
  /** Neden gönderiliyor / neden atlanıyor (denetim için). */
  reason: string;
};

export const MAX_ATTEMPTS = 4;

/** Üstel geri çekilme: 1. deneme hemen, sonra 2, 8, 30 dakika. */
export function retryDelayMs(attempt: number): number {
  const table = [0, 2, 8, 30];
  return (table[Math.min(attempt, table.length - 1)] ?? 30) * 60_000;
}

/**
 * Haberin yayılma planını üretir.
 *
 * Kurallar (ölçülebilir, gerekçeli):
 *   • push    → yalnızca doğrulanmış (≥2 kaynak) VEYA önemli kategoride
 *               ve son 6 saatte üretilmiş. Spam bildirimi engellenir.
 *   • indexnow→ her yeni haber (arama motorlarına anında bildirim)
 *   • social  → doğrulanmış ve Türkiye ilgili haberler (X taslağı)
 *   • rss     → her haber (akış otomatik güncellenir; bilgi amaçlı kayıt)
 *   • sitemap → her haber (dizin güncellenir; bilgi amaçlı kayıt)
 */
export function planChannels(story: DistributableStory): ChannelPlan[] {
  const plan: ChannelPlan[] = [];

  const ageHours = (Date.now() - story.createdAt.getTime()) / 3_600_000;
  const isFresh = ageHours <= 6;
  const isVerified = story.verifiedSourceCount >= 2;

  // ── Push ──────────────────────────────────────────────────────────────
  if (!isFresh) {
    plan.push({ channel: "push", shouldSend: false, reason: `taze değil (${ageHours.toFixed(1)} saat)` });
  } else if (!isVerified && !PUSH_CATEGORIES.has(story.category)) {
    plan.push({
      channel: "push",
      shouldSend: false,
      reason: `tek kaynak ve "${story.category}" bildirim için düşük öncelik`,
    });
  } else {
    plan.push({
      channel: "push",
      shouldSend: true,
      reason: isVerified ? `${story.verifiedSourceCount} kaynakla doğrulandı` : "öncelikli kategori",
    });
  }

  // ── IndexNow ──────────────────────────────────────────────────────────
  plan.push({ channel: "indexnow", shouldSend: true, reason: "arama motorlarına anında bildirim" });

  // ── Sosyal (X taslağı) ────────────────────────────────────────────────
  if (isVerified) {
    plan.push({ channel: "social", shouldSend: true, reason: `${story.verifiedSourceCount} kaynak — paylaşıma uygun` });
  } else {
    plan.push({ channel: "social", shouldSend: false, reason: "tek kaynak — paylaşım için doğrulama beklenir" });
  }

  // ── RSS / sitemap (kayıt amaçlı) ──────────────────────────────────────
  plan.push({ channel: "rss", shouldSend: true, reason: "akış otomatik güncellenir" });
  plan.push({ channel: "sitemap", shouldSend: true, reason: "dizin otomatik güncellenir" });

  return plan;
}

/** Bildirim gönderilecek kategoriler — kamu yararı yüksek olanlar. */
const PUSH_CATEGORIES = new Set([
  "Gündem",
  "Sağlık",
  "Ekonomi",
  "Siyaset",
  "Dünya",
]);

/** Bir haberin dağıtım işini oluşturur (idempotent). */
export async function createDistributionJob(storyId: string) {
  const story = await prisma.newsItem.findUnique({
    where: { id: storyId },
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      category: true,
      sourcesCount: true,
      verifiedSourceCount: true,
      createdAt: true,
    },
  });

  if (!story) return null;

  const plan = planChannels(story);

  return {
    story,
    plan,
    /** Yayılma için kanonik URL'ler (tr + en). */
    urls: [
      `${siteBase()}/tr/haber/${story.slug ?? story.id}`,
      `${siteBase()}/en/haber/${story.slug ?? story.id}`,
    ],
  };
}

/** Kanal + haber için idempotency anahtarı. */
export function distributionKey(storyId: string, channel: ChannelId): string {
  return createHash("sha256").update(`${storyId}:${channel}`).digest("hex").slice(0, 32);
}

/** Haber başlığından sosyal paylaşım metni üretir (X için, ≤270 karakter). */
export function buildSocialText(story: {
  title: string;
  category: string;
  verifiedSourceCount: number;
  slug: string | null;
  id: string;
}, lang: "tr" | "en" = "tr"): string {
  const url = `${siteBase()}/${lang}/haber/${story.slug ?? story.id}`;
  const tag = `#${foldTurkish(story.category).replace(/\s+/g, "")}`;

  const suffix =
    story.verifiedSourceCount > 1
      ? `${story.verifiedSourceCount} kaynakla doğrulandı`
      : "";

  const parts = [story.title];
  if (suffix) parts.push(`(${suffix})`);
  parts.push(tag, url);

  let text = parts.join(" ");
  if (text.length > 270) {
    const room = 270 - url.length - tag.length - 6;
    text = `${story.title.slice(0, Math.max(40, room))}… ${tag} ${url}`;
  }
  return text;
}
