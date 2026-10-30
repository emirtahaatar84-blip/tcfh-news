import webpush from "web-push";
import { z } from "zod";
import { CATEGORIES, isCategory } from "@/lib/categories";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { getErrorMessage } from "@/lib/utils";

/**
 * PWA Web Push (VAPID) çekirdeği.
 *
 * Yapı:
 *   1. SAF FONKSİYONLAR (prisma/fetch YOK — tests/push.test.ts'te test edilir):
 *      normalizeCategories / shouldAutoPush / buildPushPayload
 *   2. Zod şemaları (API uç noktalarıyla paylaşılır — tests/push-api.test.ts)
 *   3. Yan etkili fonksiyonlar: VAPID okuma, abonelik upsert/sil,
 *      web-push gönderimi (ölü abonelik temizliği dahil) ve otomatik
 *      bildirim kancası (maybeAutoPush — processor.ts'ten fire-and-forget).
 *
 * VAPID anahtarları env'den okunur:
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (zorunlu),
 *   VAPID_SUBJECT (opsiyonel, varsayılan mailto: adresi).
 * Üretim: npx web-push generate-vapid-keys
 */

// ─── Sabitler ─────────────────────────────────────────────────────────────────

/** Otomatik bildirim için minimum kaynak sayısı ("✓ N Kaynaktan Doğrulandı"). */
const AUTO_PUSH_MIN_SOURCES = 3;

/** İki otomatik bildirim arası minimum süre (30 dakika). */
const AUTO_PUSH_COOLDOWN_MS = 30 * 60 * 1000;

/** 10 kategori + "all" = en fazla 11 abonelik kategorisi. */
const MAX_CATEGORIES = CATEGORIES.length + 1;

// ─── Saf fonksiyonlar (test edilebilir — yan etki YOK) ───────────────────────

/**
 * Abonelik kategori listesini normalize eder: yalnızca geçerli kategori
 * değerlerini (lib/categories.ts) ve "all" kabul eder; tekrarları temizler.
 * Boş / geçersiz girdi → ["all"]. En fazla 11 öğe (10 kategori + "all").
 */
export function normalizeCategories(input: unknown): string[] {
  if (!Array.isArray(input)) return ["all"];

  const valid = new Set<string>();

  for (const value of input) {
    if (typeof value !== "string") continue;

    const trimmed = value.trim();

    if (trimmed === "all" || isCategory(trimmed)) {
      valid.add(trimmed);
      if (valid.size >= MAX_CATEGORIES) break;
    }
  }

  return valid.size > 0 ? [...valid] : ["all"];
}

/**
 * Haber otomatik bildirim göndermeli mi? 3+ kaynak VE son gönderimden
 * beri 30 dakika geçmiş olmalı (kullanıcıları bildirim yağmuruna boğmamak
 * için cooldown).
 */
export function shouldAutoPush(
  story: { sourcesCount: number },
  lastPushAt: number | null,
  now: number,
): boolean {
  if (story.sourcesCount < AUTO_PUSH_MIN_SOURCES) return false;
  if (lastPushAt === null) return true;
  return now - lastPushAt >= AUTO_PUSH_COOLDOWN_MS;
}

/** SW'nin push event'inde beklediği bildirim yükü. */
export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

/**
 * Haber bildirimi yükünü kurar. title = site adı (parametre), body = haber
 * başlığı ("✓ N Kaynaktan Doğrulandı" hissi haber sayfasında verilir),
 * url = /tr/haber/{slug} (slug yoksa /tr/news/{id}), tag = kategori (aynı kategori bildirimleri
 * notification tag ile birleştirilir).
 */
export function buildPushPayload(
  story: { id: string; slug?: string | null; title: string; category: string },
  siteName: string,
): PushPayload {
  return {
    title: siteName,
    body: story.title,
    url: story.slug ? `/tr/haber/${story.slug}` : `/tr/news/${story.id}`,
    tag: story.category,
  };
}

// ─── Zod şemaları (API uç noktalarıyla paylaşılır) ────────────────────────────

/** Tarayıcı PushSubscription çekirdeği — gerçek toJSON() biçimi (içiçe keys). */
export const pushSubscriptionCoreSchema = z.object({
  endpoint: z
    .string()
    .trim()
    .min(1, "Abonelik uç noktası gerekli.")
    .regex(/^https:\/\//, "Abonelik uç noktası https ile başlamalıdır."),
  keys: z.object({
    p256dh: z.string().min(10, "p256dh anahtarı en az 10 karakter olmalıdır."),
    auth: z.string().min(10, "auth anahtarı en az 10 karakter olmalıdır."),
  }),
});

/** POST /api/push/subscribe gövdesi. */
export const pushSubscribeSchema = z.object({
  subscription: pushSubscriptionCoreSchema,
  categories: z
    .array(z.string())
    .max(MAX_CATEGORIES, `En fazla ${MAX_CATEGORIES} kategori seçilebilir.`)
    .optional(),
  locale: z.enum(["tr", "en"]).optional(),
});

export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

/** DELETE /api/push/subscribe gövdesi. */
export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().trim().min(1, "Uç nokta gerekli."),
});

/** POST /api/admin/push/send gövdesi. */
export const adminPushSendSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Bildirim başlığı gerekli.")
    .max(120, "Başlık en fazla 120 karakter olabilir."),
  body: z
    .string()
    .trim()
    .min(1, "Bildirim içeriği gerekli.")
    .max(500, "İçerik en fazla 500 karakter olabilir."),
  url: z.string().trim().max(500, "URL en fazla 500 karakter olabilir.").optional(),
  categories: z
    .array(z.string())
    .max(MAX_CATEGORIES, `En fazla ${MAX_CATEGORIES} kategori seçilebilir.`)
    .optional(),
});

export type AdminPushSendInput = z.infer<typeof adminPushSendSchema>;

// ─── Yan etkili fonksiyonlar ──────────────────────────────────────────────────

/** Gönderim özeti — hata fırlatılmaz, sonuç sayılarda döner. */
export type PushSendSummary = {
  sent: number;
  failed: number;
  removed: number;
  error?: string;
};

/** DB'den okunan abonelik satırının gönderim için gereken kısmı. */
type SubscriptionTarget = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

function auditLog(action: string, meta: object): void {
  console.log(
    JSON.stringify({
      channel: "audit",
      action,
      at: new Date().toISOString(),
      ...meta,
    }),
  );
}

/** VAPID genel anahtarı (frontend'e gösterilecek) — yoksa boş string. */
export function getVapidPublicKey(): string {
  return (process.env.VAPID_PUBLIC_KEY ?? "").trim();
}

function getVapidPrivateKey(): string {
  return (process.env.VAPID_PRIVATE_KEY ?? "").trim();
}

function getVapidSubject(): string {
  return (process.env.VAPID_SUBJECT ?? "mailto:admin@example.com").trim();
}

export type SaveSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  categories?: unknown;
  locale?: "tr" | "en";
  /** Oturum varsa aboneliği kullanıcıya bağla; yoksa cihaz bazlı kalır. */
  userId?: string | null;
};

/**
 * Aboneliği endpoint'e göre upsert eder. Aynı endpoint tekrar gelirse
 * anahtarlar ve kategoriler güncellenir (userId yalnızca yeni değer
 * geldiğinde değişir — mevcut bağ koparılmaz).
 */
export async function saveSubscription(
  input: SaveSubscriptionInput,
): Promise<{ categories: string[]; locale: string }> {
  const core = pushSubscriptionCoreSchema.parse({
    endpoint: input.endpoint,
    keys: { p256dh: input.p256dh, auth: input.auth },
  });

  const categories = normalizeCategories(input.categories);
  const locale = input.locale === "en" ? "en" : "tr";

  await prisma.pushSubscription.upsert({
    where: { endpoint: core.endpoint },
    update: {
      p256dh: core.keys.p256dh,
      auth: core.keys.auth,
      categories: JSON.stringify(categories),
      locale,
      ...(input.userId ? { userId: input.userId } : {}),
    },
    create: {
      endpoint: core.endpoint,
      p256dh: core.keys.p256dh,
      auth: core.keys.auth,
      userId: input.userId ?? null,
      categories: JSON.stringify(categories),
      locale,
    },
  });

  return { categories, locale };
}

/** Aboneliği endpoint'e göre siler (bulunamasa da hata vermez). */
export async function removeSubscription(endpoint: string): Promise<void> {
  const trimmed = endpoint.trim();
  if (!trimmed) return;

  await prisma.pushSubscription.deleteMany({ where: { endpoint: trimmed } });
}

/**
 * Abonelik listesine web-push gönderimi yapar. HATA FIRLATMAZ:
 *   - VAPID yapılandırılmamışsa sessizce özet döner
 *     ({ sent: 0, failed: 0, removed: 0, error: "VAPID yapılandırılmamış" }).
 *   - Push servisi 404/410 dönerse abonelik ölmüştür → DB'den silinir.
 */
export async function sendPushToSubscriptions(
  subscriptions: SubscriptionTarget[],
  payload: PushPayload,
): Promise<PushSendSummary> {
  const publicKey = getVapidPublicKey();
  const privateKey = getVapidPrivateKey();

  if (!publicKey || !privateKey) {
    return { sent: 0, failed: 0, removed: 0, error: "VAPID yapılandırılmamış" };
  }

  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0, removed: 0 };
  }

  webpush.setVapidDetails(getVapidSubject(), publicKey, privateKey);

  const serialized = JSON.stringify(payload);
  const summary: PushSendSummary = { sent: 0, failed: 0, removed: 0 };

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          serialized,
        );
        summary.sent += 1;
      } catch (error) {
        const statusCode =
          typeof error === "object" && error !== null && "statusCode" in error
            ? Number((error as { statusCode: unknown }).statusCode)
            : 0;

        if (statusCode === 404 || statusCode === 410) {
          // Ölü abonelik — push servisi artık tanımıyor, DB'den sil.
          try {
            await prisma.pushSubscription.deleteMany({
              where: { endpoint: subscription.endpoint },
            });
            summary.removed += 1;
          } catch (removeError) {
            auditLog("push.dead-cleanup-failed", {
              endpoint: subscription.endpoint,
              error: getErrorMessage(removeError),
            });
            summary.failed += 1;
          }
        } else {
          summary.failed += 1;
        }
      }
    }),
  );

  return summary;
}

/** DB'deki categories JSON dizisini güvenle parse eder. */
function parseStoredCategories(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

/**
 * Bir kategoriye (VEYA "all" aboneliği olan herkese) bildirim gönderir.
 * category === "all" verilirse tüm abonelikler hedeflenir.
 */
export async function notifyCategory(
  category: string,
  payload: PushPayload,
): Promise<PushSendSummary> {
  const rows = await prisma.pushSubscription.findMany({
    select: { endpoint: true, p256dh: true, auth: true, categories: true },
  });

  const targets = rows.filter((row) => {
    if (category === "all") return true;
    const list = parseStoredCategories(row.categories);
    return list.includes(category) || list.includes("all");
  });

  return sendPushToSubscriptions(targets, payload);
}

/**
 * Birden fazla kategoriye tek seferde gönderim (admin duyuruları) —
 * endpoint bazında tekilleştirir, aynı cihaza çift bildirim gitmez.
 */
export async function sendToCategories(
  categories: string[],
  payload: PushPayload,
): Promise<PushSendSummary> {
  const normalized = normalizeCategories(categories);

  const rows = await prisma.pushSubscription.findMany({
    select: { endpoint: true, p256dh: true, auth: true, categories: true },
  });

  const seen = new Set<string>();
  const targets: SubscriptionTarget[] = [];

  for (const row of rows) {
    if (seen.has(row.endpoint)) continue;

    const list = parseStoredCategories(row.categories);
    const matches = normalized.includes("all")
      ? true
      : normalized.some((category) => list.includes(category));

    if (matches) {
      seen.add(row.endpoint);
      targets.push({
        endpoint: row.endpoint,
        p256dh: row.p256dh,
        auth: row.auth,
      });
    }
  }

  return sendPushToSubscriptions(targets, payload);
}

// ─── Otomatik bildirim kancası (processor.ts'ten çağrılır) ────────────────────

const globalForPush = globalThis as unknown as {
  pushLastAutoPushAt?: number;
};

/**
 * Yayınlanan haber için otomatik bildirim: 3+ kaynaklı haberlerde ve son
 * gönderimden 30 dakika geçtiyse kategori abonelerine gönderir.
 * lastPushAt bellek içi tutulur (globalThis deseni — podcast.ts ile aynı).
 * ASLA reject olmaz; fire-and-forget çağrılabilir.
 */
export async function maybeAutoPush(story: {
  id: string;
  title: string;
  category: string;
  sourcesCount: number;
}): Promise<PushSendSummary> {
  try {
    const now = Date.now();

    if (!shouldAutoPush(story, globalForPush.pushLastAutoPushAt ?? null, now)) {
      return { sent: 0, failed: 0, removed: 0 };
    }

    // Cooldown'u gönderimden ÖNCE kilitle — eşzamanlı haberler çift göndermez.
    globalForPush.pushLastAutoPushAt = now;

    const settings = await getSettings();
    const payload = buildPushPayload(story, settings.siteName);
    const summary = await notifyCategory(story.category, payload);

    auditLog("push.auto", {
      newsId: story.id,
      category: story.category,
      sourcesCount: story.sourcesCount,
      ...summary,
    });

    return summary;
  } catch (error) {
    const message = getErrorMessage(error);
    auditLog("push.auto-failed", { newsId: story.id, error: message });
    return { sent: 0, failed: 0, removed: 0, error: message };
  }
}
