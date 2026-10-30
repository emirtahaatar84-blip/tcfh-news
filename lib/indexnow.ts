import { prisma } from "@/lib/prisma";
import { absoluteUrl, siteBase } from "@/lib/feeds";

/**
 * IndexNow — arama motorlarına anında "bu URL değişti" bildirimi.
 *
 * DESTEKLENEN: Bing, Yandex, Seznam, Naver (Google kullanmaz; Google
 * sitemap + crawl'a güvenir).
 *
 * NEDEN GEREKLİ: sitemap taraması saatler/günler alır. Haber saniyeler
 * içinde eskiyor; IndexNow yeni haberi dakikalar içinde dizine sokturur.
 *
 * KVKK: yalnızca herkese açık URL listesi gönderilir. Kullanıcı verisi YOK.
 * Anahtar (INDEXNOW_KEY) sadece sunucuda; anahtar dosyası `/api/indexnow/[key]`
 * ucundan servis edilir (arama motoru sahiplik doğrulaması için ister).
 */

const ENDPOINT = "https://api.indexnow.org/indexnow";
const MAX_URLS_PER_CALL = 10_000;

export type IndexNowResult = {
  ok: boolean;
  status: number;
  submitted: number;
  reason?: string;
};

function indexNowKey(): string | null {
  const key = process.env.INDEXNOW_KEY?.trim();
  if (!key || key.length < 8) return null;
  // Anahtar yalnız a-z 0-9 ve tire olabilir (protokol kuralı).
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(key)) return null;
  return key;
}

/** Anahtarın doğrulanabilmesi için adres: /{key}.txt */
export function indexNowKeyLocation(base: string, key: string): string {
  return `${base}/${key}.txt`;
}

export function isIndexNowEnabled(): boolean {
  return indexNowKey() !== null;
}

/**
 * Verilen URL'leri IndexNow'a bildirir. Anahtar yoksa sessizce atlar
 * (kapalı özellik hata üretmez).
 */
export async function submitIndexNow(urls: string[]): Promise<IndexNowResult> {
  const key = indexNowKey();
  if (!key) {
    return { ok: false, status: 0, submitted: 0, reason: "INDEXNOW_KEY tanımlı değil" };
  }

  const unique = [...new Set(urls.map((url) => absoluteUrl(url).trim()))]
    .filter((url) => /^https?:\/\//i.test(url))
    .slice(0, MAX_URLS_PER_CALL);

  if (unique.length === 0) {
    return { ok: false, status: 0, submitted: 0, reason: "Gönderilecek URL yok" };
  }

  const base = siteBase();
  const body = {
    host: new URL(base).host,
    key,
    keyLocation: indexNowKeyLocation(base, key),
    urlList: unique,
  };

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });

    // 200 = kabul, 202 = kabul (doğrulama bekliyor). Diğerleri hata.
    const ok = response.status === 200 || response.status === 202;

    return {
      ok,
      status: response.status,
      submitted: unique.length,
      reason: ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      submitted: 0,
      reason: (error as Error).message.slice(0, 120),
    };
  }
}

/** Yayınlanmış tek bir haberin tüm dil URL'lerini bildirir. */
export async function submitNewsUrl(slug: string): Promise<IndexNowResult> {
  return submitIndexNow([
    `/${"tr"}/haber/${slug}`,
    `/${"en"}/haber/${slug}`,
  ]);
}

/** Son N saatte yayınlanan haberleri topluca bildirir (toplu telafi). */
export async function submitRecentNews(hours = 24): Promise<IndexNowResult> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const rows = await prisma.newsItem.findMany({
    where: { removedAt: null, createdAt: { gte: since }, slug: { not: null } },
    select: { slug: true },
    take: 500,
    orderBy: { createdAt: "desc" },
  });

  const urls = rows.flatMap((row) => [
    `/tr/haber/${row.slug}`,
    `/en/haber/${row.slug}`,
  ]);

  return submitIndexNow(urls);
}
