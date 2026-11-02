import { absoluteUrl, siteBase } from "@/lib/feeds";

/**
 * YAYILMA KANALI: IndexNow.
 *
 * Bing, Yandex, Seznam ve Naver'a "bu URL yayınlandı" bildirimi.
 * Google kullanmaz (sitemap + crawl'a güvenir) ama sitemap taraması
 * saatler alırken IndexNow dakikalar içinde dizine sokar.
 *
 * KVKK: yalnızca herkese açık URL listesi gönderilir.
 */

const ENDPOINT = "https://api.indexnow.org/indexnow";

export function isIndexNowEnabled(): boolean {
  const key = process.env.INDEXNOW_KEY?.trim();
  return Boolean(key && /^[a-zA-Z0-9-]{8,128}$/.test(key));
}

export function keyLocation(): string | null {
  const key = process.env.INDEXNOW_KEY?.trim();
  return key ? `${siteBase()}/${key}.txt` : null;
}

export type IndexNowResult = {
  ok: boolean;
  status: number;
  submitted: number;
  error?: string;
};

export async function submitUrls(urls: string[]): Promise<IndexNowResult> {
  const key = process.env.INDEXNOW_KEY?.trim();

  if (!key || !isIndexNowEnabled()) {
    return { ok: false, status: 0, submitted: 0, error: "INDEXNOW_KEY tanımlı değil" };
  }

  const unique = [...new Set(urls.map((url) => absoluteUrl(url).trim()))]
    .filter((url) => /^https?:\/\//i.test(url))
    .slice(0, 10_000);

  if (unique.length === 0) {
    return { ok: false, status: 0, submitted: 0, error: "URL yok" };
  }

  const base = siteBase();

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: new URL(base).host,
        key,
        keyLocation: keyLocation(),
        urlList: unique,
      }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });

    // 200 = kabul, 202 = doğrulama bekliyor (ikisi de başarı).
    const ok = response.status === 200 || response.status === 202;

    return {
      ok,
      status: response.status,
      submitted: unique.length,
      error: ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      submitted: 0,
      error: (error as Error).message.slice(0, 120),
    };
  }
}
