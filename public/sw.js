/*
 * emirtahaatar.com.tr — PWA Service Worker (elle yazılmış, framework yok).
 *
 * Stratejiler:
 *   - install:   /offline + /manifest.webmanifest + ana ikon precache, skipWaiting
 *   - activate:  clients.claim
 *   - fetch:     GET-only;
 *                  _next/static/ & /icons/  → cache-first
 *                  /api/news*               → network-first (başarısızsa cache)
 *                  navigation               → network-first (başarısızsa /offline)
 *                  diğerleri                → passthrough
 *   - push:      { title, body, url, tag } → showNotification
 *   - notificationclick: data.url'ı aç (pencere varsa focus+navigate)
 *
 * Push event hataları yutulur — SW asla çökmemeli.
 */

const CACHE_NAME = "news-cache-v2";
const NEWS_CACHE = "news-offline-v1";
const NEWS_CACHE_LIMIT = 20;

const PRECACHE_URLS = [
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
];

const NOTIFICATION_ICON = "/icons/icon-192.png";

// ─── install ─────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // Precache hedefleri henüz yoksa (frontend fazı) kurulum yarıda kalmasın.
      await Promise.allSettled(
        PRECACHE_URLS.map((url) => cache.add(new Request(url, { cache: "reload" }))),
      );

      await self.skipWaiting();
    })(),
  );
});

// ─── activate ────────────────────────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Eski sürüm cache'lerini temizle (offline haber cache'i korunur).
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== NEWS_CACHE)
          .map((key) => caches.delete(key)),
      );

      await self.clients.claim();
    })(),
  );
});

// ─── fetch ───────────────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Yalnızca GET; diğer metotlara (POST/DELETE...) müdahale etme.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Aynı origin dışındaki isteklere müdahale etme.
  if (url.origin !== self.location.origin) return;

  // Statik varlıklar → cache-first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Haber API'si → network-first (başarısızsa cache'ten).
  if (url.pathname.startsWith("/api/news")) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Sayfa gezinmesi → network-first (başarısızsa cachelenmiş /offline).
  if (request.mode === "navigate") {
    event.respondWith(navigationFallback(request));
    return;
  }

  // Diğerleri → passthrough (SW müdahale etmez).
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // Cache'te de yoksa ağ hatası yanıtı döndür.
    return cached || Response.error();
  }
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return Response.error();
  }
}

async function navigationFallback(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);
    return response;
  } catch (error) {
    // Son okunan haberlerden biri mi? Çevrimdışı kopyasını dene.
    const newsCache = await caches.open(NEWS_CACHE);
    const savedNews = await newsCache.match(request, { ignoreSearch: true });
    if (savedNews) return savedNews;

    const offline = await cache.match("/offline");
    if (offline) return offline;

    return new Response(
      "<!DOCTYPE html><html lang=\"tr\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Çevrimdışı</title></head><body style=\"font-family:system-ui;background:#0a0a0a;color:#e4e4e7;display:flex;min-height:100vh;align-items:center;justify-content:center\"><p>Şu anda çevrimdışısınız. Bağlantı geri geldiğinde tekrar deneyin.</p></body></html>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

// ─── message: son okunan haberleri çevrimdışı sakla ─────────────────────────

self.addEventListener("message", (event) => {
  const data = event.data;

  if (!data || data.type !== "cache-news" || typeof data.url !== "string") return;

  event.waitUntil(
    (async () => {
      try {
        const url = new URL(data.url, self.location.origin);
        if (url.origin !== self.location.origin) return;

        const response = await fetch(url.href, { cache: "reload" });
        if (!response || !response.ok) return;

        const cache = await caches.open(NEWS_CACHE);
        await cache.put(url.href, response.clone());

        // En fazla 20 haber: en eskileri sil.
        const keys = await cache.keys();
        if (keys.length > NEWS_CACHE_LIMIT) {
          const excess = keys.length - NEWS_CACHE_LIMIT;
          for (let i = 0; i < excess; i += 1) {
            await cache.delete(keys[i]);
          }
        }
      } catch (error) {
        // Sessizce geç — çevrimdışı kayıt isteğe bağlıdır.
      }
    })(),
  );
});

// ─── push ────────────────────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      try {
        if (!event.data) return;

        let data;
        try {
          data = event.data.json();
        } catch (parseError) {
          return; // bozuk yük — yut.
        }

        const payload =
          data && typeof data === "object"
            ? data
            : {};

        const title =
          typeof payload.title === "string" && payload.title.length > 0
            ? payload.title
            : "emirtahaatar.com.tr";

        const url =
          typeof payload.url === "string" && payload.url.length > 0
            ? payload.url
            : "/tr";

        await self.registration.showNotification(title, {
          body: typeof payload.body === "string" ? payload.body : "",
          tag: typeof payload.tag === "string" ? payload.tag : undefined,
          icon: NOTIFICATION_ICON,
          badge: NOTIFICATION_ICON,
          data: { url },
        });
      } catch (error) {
        // Push hatalarını yut — SW çökmesin.
      }
    })(),
  );
});

// ─── notificationclick ───────────────────────────────────────────────────────

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    (async () => {
      try {
        const data = event.notification.data;
        const url =
          data && typeof data.url === "string" && data.url.length > 0
            ? data.url
            : "/tr";

        const windowClients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });

        for (const client of windowClients) {
          if ("focus" in client) {
            await client.focus();
            if ("navigate" in client) {
              await client.navigate(url);
            }
            return;
          }
        }

        await self.clients.openWindow(url);
      } catch (error) {
        // Tıklama hatalarını yut — SW çökmesin.
      }
    })(),
  );
});
