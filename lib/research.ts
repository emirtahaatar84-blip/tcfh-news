import Parser from "rss-parser";
import { TURKISH_CITIES } from "@/lib/geo";
import { foldTurkish, stripHtml } from "@/lib/utils";
import type { FeedStory } from "@/lib/kantan-feed";

/**
 * Kaynaklı araştırma katmanı (Ek Bölüm 9.3).
 *
 * Kullanılan kamuya açık kaynaklar:
 *   1. Türk ana akım medyasının herkese açık RSS akışları (aşağıdaki liste)
 *   2. Wikipedia (TR) — yalnızca arka plan bilgisi, `reference` türünde
 *   3. GDELT DOC 2.0 API — açık veri, uluslararası haber kapsamı (5 sn limiti)
 *   4. Aday hikâyenin kendi orijinal makalesi
 *
 * Kural: En az 3 BAĞIMSIZ alan adından doğrulanmış kaynak yoksa portre
 * yayınlanmaz. Doğrulanamayan iddia yazıya girmez; kaynak metni kopyalanmaz.
 */

export type SourceKind = "official" | "news" | "academic" | "data" | "reference";

export type ResearchSource = {
  name: string;
  title: string;
  url: string;
  domain: string;
  publishedAt: Date | null;
  accessedAt: Date;
  kind: SourceKind;
  /** Araştırma sırasında çekilen sayfa metni (LLM'e bağlam olarak verilir). */
  text: string;
  isPrimary: boolean;
  /** Geçmişe yönelik arşiv kaynağı mı (dava geçmişi, özgeçmiş, eski gelişme). */
  isHistorical?: boolean;
};

export type ResearchResult = {
  ok: boolean;
  queries: string[];
  sources: ResearchSource[];
  domainCount: number;
  notes: string[];
  error?: string;
};

const FETCH_TIMEOUT_MS = 12_000;
const MAX_ARTICLE_BYTES = 400_000;
const FEED_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_SOURCES = 8;
const MIN_INDEPENDENT_DOMAINS = 3;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/**
 * Türk ana akım medyasının herkese açık RSS akışları.
 * Her akış ayrı ayrı hata toleranslıdır; biri düşerse diğerleri kullanılır.
 */
const PUBLIC_FEEDS: { name: string; url: string; kind: SourceKind }[] = [
  // Ana akım / genel
  { name: "Anadolu Ajansı", url: "https://www.aa.com.tr/tr/rss/default?cat=guncel", kind: "news" },
  { name: "TRT Haber", url: "https://www.trthaber.com/sondakika.rss", kind: "news" },
  { name: "Habertürk", url: "https://www.haberturk.com/rss", kind: "news" },
  { name: "Sözcü", url: "https://www.sozcu.com.tr/feeds-rss-category-gundem", kind: "news" },
  { name: "CNN Türk", url: "https://www.cnnturk.com/feed/rss/news", kind: "news" },
  { name: "NTV", url: "https://www.ntv.com.tr/gundem.rss", kind: "news" },
  { name: "BBC Türkçe", url: "https://www.bbc.com/turkce/index.xml", kind: "news" },
  { name: "Milliyet", url: "https://www.milliyet.com.tr/rss/rssNew/gundemRss.xml", kind: "news" },
  { name: "Hürriyet", url: "https://www.hurriyet.com.tr/rss/anasayfa", kind: "news" },
  { name: "Sabah", url: "https://www.sabah.com.tr/rss/anasayfa.xml", kind: "news" },
  { name: "Gazete Duvar", url: "https://www.gazeteduvar.com.tr/rss", kind: "news" },
  { name: "Medyascope", url: "https://medyascope.tv/feed/", kind: "news" },
  // Ekonomi
  { name: "Ekonomim", url: "https://www.ekonomim.com/rss", kind: "news" },
  { name: "Bloomberg HT", url: "https://www.bloomberght.com/rss", kind: "news" },
  { name: "Dünya", url: "https://www.dunya.com/rss?list=1", kind: "news" },
  { name: "Anadolu Ekonomi", url: "https://www.aa.com.tr/tr/rss/default?cat=ekonomi", kind: "news" },
  // Teknoloji
  { name: "Webtekno", url: "https://www.webtekno.com/rss.xml", kind: "news" },
  { name: "DonanımHaber", url: "https://www.donanimhaber.com/rss/tum/", kind: "news" },
  { name: "ShiftDelete", url: "https://www.shiftdelete.net/feed", kind: "news" },
  // Savunma (uzman yayınlar)
  { name: "DefenceTurk", url: "https://www.defenceturk.net/feed", kind: "news" },
  { name: "SavunmaSanayiST", url: "https://www.savunmasanayist.com/feed/", kind: "news" },
];

const parser = new Parser<Record<string, unknown>, Record<string, unknown>>({
  timeout: FETCH_TIMEOUT_MS,
  headers: { "User-Agent": UA },
  customFields: {
    item: [
      ["content:encoded", "contentEncoded"],
      ["dc:date", "dcDate"],
      ["source", "sourceName"],
    ],
  },
});

type ResearchGlobalState = {
  portraitFeedCache?: Map<string, { at: number; items: FeedItemLite[] }>;
  portraitGdeltGate?: number;
  /** 429 sonrası GDELT bekleme zamanı (ms). */
  portraitGdeltDisabledUntil?: number;
};

const globalState = globalThis as unknown as ResearchGlobalState;

export type FeedItemLite = {
  feed: string;
  kind: SourceKind;
  title: string;
  link: string;
  summary: string;
  publishedAt: Date | null;
  domain: string;
};

function cache(): Map<string, { at: number; items: FeedItemLite[] }> {
  if (!globalState.portraitFeedCache) {
    globalState.portraitFeedCache = new Map();
  }
  return globalState.portraitFeedCache;
}

// ─── Metin yardımcıları ─────────────────────────────────────────────────────

function fold(value: string): string {
  return foldTurkish(value.toLocaleLowerCase("tr-TR"));
}

/**
 * Kaynak olarak kullanılabilir mi? Ana sayfa/çıplak alan adı ve yalnızca
 * çapa (#fragment) içeren bağlantılar makale metni vermez → elenir.
 */
function isArticleUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!parsed.pathname || parsed.pathname === "/") return false;
    // Yalnızca çapa ile ayrılmış ana sayfa bağlantıları (dha.com.tr/#dha-1)
    if (parsed.hash && parsed.pathname === "/") return false;
    return true;
  } catch {
    return false;
  }
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function classifyDomain(domain: string): SourceKind {
  if (domain.endsWith(".gov.tr") || domain.endsWith(".mil.tr") || domain.endsWith(".bel.tr")) {
    return "official";
  }
  if (domain.includes("wikipedia.org")) return "reference";
  if (domain.endsWith(".edu.tr") || domain.includes("dergipark") || domain.endsWith(".edu")) {
    return "academic";
  }
  if (domain.includes("tuik.gov") || domain.includes("tcmb.gov")) return "data";
  return "news";
}

function significantTokens(text: string, min = 4): string[] {
  const stop = new Set([
    "bir", "bu", "şu", "su", "ile", "ve", "veya", "ama", "için", "icin", "olan",
    "olarak", "daha", "çok", "cok", "son", "yeni", "göre", "gore", "kadar",
    "gibi", "sonra", "önce", "once", "üzerine", "uzerine", "hakkında",
    "hakkinda", "haber", "haberler", "gündem", "gundem", "türkiye", "turkiye",
  ]);

  return [
    ...new Set(
      fold(text)
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((token) => token.length >= min && !stop.has(token)),
    ),
  ];
}

function overlapScore(a: string[], b: Set<string>): number {
  if (a.length === 0) return 0;
  let hits = 0;
  for (const token of a) if (b.has(token)) hits += 1;
  return hits / a.length;
}

async function fetchHtml(url: string, maxBytes = MAX_ARTICLE_BYTES): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "tr,en;q=0.7" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: "follow",
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/html") && !type.includes("text/plain") && !type.includes("xml") && !type.includes("json")) {
    throw new Error(`Desteklenmeyen içerik türü: ${type}`);
  }

  const buffer = await response.arrayBuffer();
  const slice = buffer.byteLength > maxBytes ? buffer.slice(0, maxBytes) : buffer;

  return new TextDecoder("utf-8").decode(slice);
}

/** Sayfa HTML'inden ana metni çıkarır (kaba ama bağımlılıksız). */
export function extractArticleText(html: string): string {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  // Paragrafları koru: blok sonlarını yeni satıra çevir.
  const withBreaks = withoutNoise
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");

  return stripHtml(withBreaks)
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 8000);
}

// ─── Sorgu üretimi (3-6) ────────────────────────────────────────────────────

/**
 * Konuyu 3-6 arama sorgusuna böler: konu adı, başlık çekirdeği, kurum,
 * yer adı ve kategori bazlı varyantlar.
 */
export function buildQueries(story: FeedStory, subjectName: string | null): string[] {
  const queries: string[] = [];

  const push = (value: string) => {
    const cleaned = value.replace(/\s+/g, " ").trim();
    if (cleaned.length >= 3 && !queries.some((item) => fold(item) === fold(cleaned))) {
      queries.push(cleaned);
    }
  };

  if (subjectName) push(subjectName);

  // Başlıktan en ayırt edici sözcükler. İlk kelime bağlaç/edat ise atılır:
  // "arasinda makine emniyeti…" gibi arama motorunda işe yaramayan sorgular
  // kaynak bulmayı engelliyordu.
  const EDGE_WORDS = new Set(["arasinda", "uzerine", "dair", "ile", "ve", "icin", "sonra", "once"]);
  const titleTokens = significantTokens(story.title, 5)
    .filter((token) => !EDGE_WORDS.has(fold(token)))
    .slice(0, 5);
  if (titleTokens.length >= 2) push(titleTokens.join(" "));

  // İlk 3 sözcük (genellikle özne + eylem).
  const headWords = story.title
    .replace(/[|–—-].*$/, "")
    .trim()
    .split(/\s+/)
    .filter((word) => !EDGE_WORDS.has(fold(word)));
  push(headWords.slice(0, 4).join(" "));

  if (subjectName) push(`${subjectName} açıklama`);

  const city = TURKISH_CITIES.find((item) =>
    fold(`${story.title} ${story.summary}`).includes(fold(item)),
  );
  if (city) push(`${city} ${titleTokens.slice(0, 2).join(" ")}`);

  if (story.category) push(`${story.category} ${titleTokens.slice(0, 2).join(" ")}`);

  // ── GEÇMİŞE YÖNELİK ARAŞTIRMA SORGULARI ────────────────────────────────
  // Dava, soruşturma, iddianame gibi olaylar geçmişe dayanır. Sadece "şu an
  // ne oldu" değil, "bu konuda önceden ne oldu" da araştırılmalı.
  const temporalHints = detectTemporalContext(story);
  for (const hint of temporalHints) push(hint);

  return queries.slice(0, 8);
}

/**
 * Geçmiş bağlamı gerektiren olayları tespit eder ve arşiv sorguları üretir.
 * "İlk kez hakim karşısına çıktı", "davası", "soruşturma" gibi ifadeler
 * olayın öncesinde bir geçmiş olduğunu gösterir.
 */
export function detectTemporalContext(story: FeedStory): string[] {
  const text = fold(`${story.title} ${story.summary}`);
  const queries: string[] = [];

  const subject = story.title
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 2)
    .join(" ");

  const needsHistory =
    /(dava|davasi|davada|iddianame|sorusturma|gozalti|tutukla|hakim karsisinda|ilk kez|yeniden|davet|temyiz|istinaf)/.test(
      text,
    );

  const needsBackground =
    /(vefat|olum|hayatini kaybetti|yasamini yitirdi|istedifa|atandi|gorevden|kriz|skandal|rekor|ilk kez|yildonumu)/.test(
      text,
    );

  if (needsHistory) {
    queries.push(`${subject} dava geçmişi iddianame`);
    queries.push(`${subject} soruşturma geçmişi`);
  }

  if (needsBackground) {
    queries.push(`${subject} kimdir özgeçmiş`);
    queries.push(`${subject} geçmiş gelişmeler`);
  }

  return queries;
}

// ─── Kaynak toplama ────────────────────────────────────────────────────────

async function loadPublicFeeds(notes: string[]): Promise<FeedItemLite[]> {
  const store = cache();
  const items: FeedItemLite[] = [];

  await Promise.all(
    PUBLIC_FEEDS.map(async (feed) => {
      const cached = store.get(feed.url);
      if (cached && Date.now() - cached.at < FEED_CACHE_TTL_MS) {
        items.push(...cached.items);
        return;
      }

      try {
        const response = await fetch(feed.url, {
          headers: {
            "User-Agent": UA,
            Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
          },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          redirect: "follow",
          cache: "no-store",
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const xml = await response.text();
        const parsed = await parser.parseString(xml);

        const normalized: FeedItemLite[] = (parsed.items ?? [])
          .map((raw) => {
            const record = raw as unknown as Record<string, unknown>;
            const title = typeof record.title === "string" ? record.title.trim() : "";
            const link = typeof record.link === "string" ? record.link.trim() : "";

            if (!title || !link) return null;

            const publishedRaw =
              record.isoDate ?? record.pubDate ?? record.dcDate ?? null;
            const published =
              typeof publishedRaw === "string" && !Number.isNaN(new Date(publishedRaw).getTime())
                ? new Date(publishedRaw)
                : null;

            const summary = String(
              record.contentSnippet ?? record.content ?? record.contentEncoded ?? "",
            );

            return {
              feed: feed.name,
              kind: feed.kind,
              title,
              link,
              summary: stripHtml(summary).slice(0, 600),
              publishedAt: published,
              domain: domainOf(link),
            } satisfies FeedItemLite;
          })
          .filter((item): item is FeedItemLite => item !== null);

        store.set(feed.url, { at: Date.now(), items: normalized });
        items.push(...normalized);
      } catch (error) {
        notes.push(`RSS kaynağı atlandı (${feed.name}): ${(error as Error).message}`);
      }
    }),
  );

  return items;
}

async function fetchWikipedia(subjectName: string, notes: string[]): Promise<ResearchSource | null> {
  const title = subjectName.replace(/\s+/g, "_");

  try {
    const response = await fetch(
      `https://tr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      },
    );

    if (!response.ok) return null;

    const data = (await response.json()) as {
      title?: string;
      extract?: string;
      content_urls?: { desktop?: { page?: string } };
    };

    const extract = data.extract?.trim();
    const url = data.content_urls?.desktop?.page;

    if (!extract || !url) return null;

    return {
      name: "Wikipedia (TR)",
      title: data.title ?? subjectName,
      url,
      domain: "tr.wikipedia.org",
      publishedAt: null,
      accessedAt: new Date(),
      kind: "reference",
      text: extract,
      isPrimary: false,
      // Wikipedia = olayın geçmişi/özgeçmişi. LLM geçmiş bağlam olarak kullanır.
      isHistorical: true,
    };
  } catch (error) {
    notes.push(`Wikipedia atlandı: ${(error as Error).message}`);
    return null;
  }
}

/**
 * GDELT DOC 2.0 — açık veri. Servis 5 saniyede 1 istek istiyor; global
 * bir kapı (gate) ile sıraya alınır. 429 alınırsa sessizce atlanır.
 */
async function fetchGdelt(query: string, notes: string[]): Promise<FeedItemLite[]> {
  const now = Date.now();
  const last = globalState.portraitGdeltGate ?? 0;

  // GDELT ücretsiz uçta dakikada çok az isteğe izin veriyor (429). Ardışık
  // çağrılar arasında en az 15 sn bırakılır; yine 429 gelirse devre dışı kalır.
  const disabledUntil = globalState.portraitGdeltDisabledUntil ?? 0;
  if (now < disabledUntil) {
    notes.push("GDELT geçici olarak devre dışı (429 sonrası bekleme).");
    return [];
  }

  if (now - last < 15_000) return [];
  globalState.portraitGdeltGate = now;

  try {
    const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
    url.searchParams.set("query", query);
    url.searchParams.set("mode", "artlist");
    url.searchParams.set("maxrecords", "15");
    url.searchParams.set("format", "json");
    url.searchParams.set("sort", "datedesc");

    const response = await fetch(url.toString(), {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });

    if (response.status === 429) {
      // 30 dakika bekle; hattı bloklamasın.
      globalState.portraitGdeltDisabledUntil = now + 30 * 60 * 1000;
      notes.push("GDELT atlandı (HTTP 429) — 30 dk devre dışı.");
      return [];
    }

    if (!response.ok) {
      notes.push(`GDELT atlandı (HTTP ${response.status}).`);
      return [];
    }

    const data = (await response.json()) as {
      articles?: { title?: string; url?: string; seendate?: string; domain?: string }[];
    };

    return (data.articles ?? [])
      .map((article) => {
        const link = typeof article.url === "string" ? article.url : "";
        const title = typeof article.title === "string" ? article.title.trim() : "";
        if (!link || !title) return null;

        const seen = article.seendate;
        let publishedAt: Date | null = null;

        if (typeof seen === "string" && /^\d{8}T\d{6}Z$/.test(seen)) {
          const iso = `${seen.slice(0, 4)}-${seen.slice(4, 6)}-${seen.slice(6, 8)}T${seen.slice(9, 11)}:${seen.slice(11, 13)}:${seen.slice(13, 15)}Z`;
          const parsed = new Date(iso);
          if (!Number.isNaN(parsed.getTime())) publishedAt = parsed;
        }

        return {
          feed: article.domain ?? domainOf(link),
          kind: classifyDomain(domainOf(link)),
          title,
          link,
          summary: "",
          publishedAt,
          domain: domainOf(link),
        } satisfies FeedItemLite;
      })
      .filter((item): item is FeedItemLite => item !== null);
  } catch (error) {
    notes.push(`GDELT atlandı: ${(error as Error).message}`);
    return [];
  }
}

/**
 * Aday hikâye için kaynaklı araştırma yapar.
 *
 * Başarı ölçütü: en az 3 bağımsız alan adı. Aksi hâlde `ok: false` döner ve
 * çağıran katman portreyi yayınlamaz (taslak/inceleme durumunda bekletir).
 */
export async function researchStory(
  story: FeedStory,
  subjectName: string | null,
  options: { useGdelt?: boolean } = {},
): Promise<ResearchResult> {
  const notes: string[] = [];
  const queries = buildQueries(story, subjectName);

  const storyTokens = significantTokens(`${story.title} ${story.summary}`);
  const subjectTokens = subjectName ? significantTokens(subjectName) : [];
  const needleSet = new Set([...storyTokens, ...subjectTokens]);

  // 1) Kamuya açık RSS havuzu
  const feedItems = await loadPublicFeeds(notes);

  // Geçmiş bağlamı gerekiyor mu? (dava/soruşturma/ilk kez gibi olaylar)
  const temporalContext = detectTemporalContext(story);
  const historicalNeedleSet = new Set([
    ...needleSet,
    ...significantTokens(temporalContext.join(" ")),
  ]);
  const wantsHistory = temporalContext.length > 0;

  // 2) GDELT (en fazla 2 sorgu, 5 sn limitine saygılı)
  if (options.useGdelt !== false) {
    for (const query of queries.slice(0, 2)) {
      const gdeltItems = await fetchGdelt(query, notes);
      feedItems.push(...gdeltItems);
    }
  }

  // 2b) GEÇMİŞE YÖNELİK ARAMA — olay tarih gerektiriyorsa (dava, soruşturma,
  // özgeçmiş) arşive uzanan Google Haberler araması yapılır.
  if (wantsHistory) {
    const { fetchGoogleNewsHistory } = await import("@/lib/google-news");

    // Konu adı + geçmiş anahtar kelimesi: en isabetli arşiv sorgusu.
    const historyQueries: string[] = [];
    if (subjectName) historyQueries.push(subjectName);
    else historyQueries.push(story.title.split(/\s+/).slice(0, 3).join(" "));

    for (const query of historyQueries.slice(0, 2)) {
      const historyItems = await fetchGoogleNewsHistory(query, notes);
      feedItems.push(...historyItems);
    }
  }

  // Eşleşme: başlık/özet benzerliği veya konu adının geçmesi.
  // GEÇMİŞ: olay tarih gerektiriyorsa eski içerik de aday olur ve
  // `isHistorical` ile işaretlenir — LLM'e geçmiş bağlam olarak verilir.
  const matches = feedItems
    .map((item) => {
      const itemTokens = [...significantTokens(item.title), ...significantTokens(item.summary)];
      const itemSet = new Set(itemTokens);
      const overlap = overlapScore([...needleSet], itemSet);
      const subjectHit =
        subjectName ? fold(item.title).includes(fold(subjectName)) : false;

      // Yaş: 30 günden eski içerik "geçmiş" sayılır. Google Haberler
      // araması arşive uzandığı için sonuçları geçmiş bağlam sayılır.
      const ageDays = item.publishedAt
        ? (Date.now() - item.publishedAt.getTime()) / 86_400_000
        : 0;
      const isHistorical = ageDays > 30 || item.feed === "Google Haberler";

      return { item, overlap, subjectHit, isHistorical, ageDays };
    })
    .filter(
      ({ overlap, subjectHit }) =>
        // Geçmiş bağlamı gerekiyorsa daha gevşek eşik: eski ama konuyla
      // ilgili içerikler de kabul edilir.
        overlap >= (wantsHistory ? 0.04 : 0.08) || subjectHit,
    )
    .sort((a, b) => {
      // Güncel olay için tazelik önemli; geçmiş bağlamda konu yakınlığı.
      const recency = (x: typeof a) => (wantsHistory ? 0 : x.ageDays > 30 ? -0.1 : 0.05);
      const scoreA = a.overlap + (a.subjectHit ? 0.5 : 0) + (a.item.publishedAt ? recency(a) : 0);
      const scoreB = b.overlap + (b.subjectHit ? 0.5 : 0) + (b.item.publishedAt ? recency(b) : 0);
      return scoreB - scoreA;
    });

  // Makale olmayan (ana sayfa) bağlantıları ele, sonra alan adına göre
  // tekilleştir — böylece aynı alan adından en alakalı MAKALE kalır.
  const byDomain = new Map<string, { item: FeedItemLite; isHistorical: boolean }>();
  for (const { item, isHistorical } of matches) {
    // Google Haberler bağlantıları yönlendirme linkidir; alan adı ayıklanmış
    // değilse "news.google.com" tek kaynak sayılıp yanlış tekilleştiriyordu.
    if (item.domain === "news.google.com" || !item.domain) continue;
    if (!isArticleUrl(item.link)) continue;
    const key = item.domain || item.feed;
    if (!byDomain.has(key)) byDomain.set(key, { item, isHistorical });
    if (byDomain.size >= MAX_SOURCES + 4) break;
  }

  // 3) Kaynak sayfalarını çek (metin kanıtı için)
  const sources: ResearchSource[] = [];
  const accessedAt = new Date();

  const pageCandidates = [...byDomain.values()].slice(0, MAX_SOURCES);

  await Promise.all(
    pageCandidates.map(async ({ item, isHistorical }) => {
      let text = "";

      try {
        const html = await fetchHtml(item.link);
        text = extractArticleText(html);
      } catch (error) {
        notes.push(`Sayfa okunamadı (${item.domain}): ${(error as Error).message}`);
      }

      sources.push({
        name: item.feed,
        title: item.title,
        url: item.link,
        domain: item.domain || domainOf(item.link),
        publishedAt: item.publishedAt,
        accessedAt,
        kind: classifyDomain(item.domain || domainOf(item.link)),
        // Metin alınamadıysa başlık+özet yeterli olur (kaynak yine gösterilir).
        text: text || item.summary || item.title,
        isPrimary: false,
        isHistorical,
      });
    }),
  );

  // 4) Orijinal makale (kantan'ın gösterdiği dış kaynak)
  if (
    story.originalUrl &&
    isArticleUrl(story.originalUrl) &&
    domainOf(story.originalUrl) !== domainOf(story.url)
  ) {
    try {
      const html = await fetchHtml(story.originalUrl);
      const text = extractArticleText(html);

      sources.push({
        name: domainOf(story.originalUrl) || "Orijinal kaynak",
        title: story.title,
        url: story.originalUrl,
        domain: domainOf(story.originalUrl),
        publishedAt: story.publishedAt,
        accessedAt,
        kind: classifyDomain(domainOf(story.originalUrl)),
        text: text || story.summary,
        isPrimary: true,
      });
    } catch (error) {
      notes.push(`Orijinal makale okunamadı: ${(error as Error).message}`);
    }
  }

  // 5) Wikipedia (arka plan)
  if (subjectName) {
    const wiki = await fetchWikipedia(subjectName, notes);
    if (wiki) sources.push(wiki);
  }

  // Ölü/hatalı kaynakları at: yalnızca metni olanlar kalır.
  const usable = sources.filter((source) => source.text.trim().length >= 40);

  // Alan adı tekilleştirme (aynı domainden tek kaynak).
  const uniqueByDomain = new Map<string, ResearchSource>();
  for (const source of usable.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))) {
    if (!uniqueByDomain.has(source.domain)) uniqueByDomain.set(source.domain, source);
  }

  const finalSources = [...uniqueByDomain.values()].slice(0, MAX_SOURCES);
  const nonReferenceDomains = finalSources.filter(
    (source) => source.kind !== "reference",
  ).length;

  if (nonReferenceDomains < MIN_INDEPENDENT_DOMAINS) {
    notes.push(
      `Yetersiz doğrulama: ${nonReferenceDomains} bağımsız haber/resmî kaynak bulundu (en az ${MIN_INDEPENDENT_DOMAINS} gerekli).`,
    );

    return {
      ok: false,
      queries,
      sources: finalSources,
      domainCount: nonReferenceDomains,
      notes,
      error: "INSUFFICIENT_SOURCES",
    };
  }

  return {
    ok: true,
    queries,
    sources: finalSources,
    domainCount: nonReferenceDomains,
    notes,
  };
}
