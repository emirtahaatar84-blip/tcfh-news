import { createHash } from "crypto";
import Parser from "rss-parser";
import { foldTurkish, stripHtml, truncate } from "@/lib/utils";

/**
 * Dış hikâye akışı okuyucu (Ek Bölüm 9.1).
 *
 * Kaynak `https://kantan.news/feed` bir SPA'dır: HTML kabuğu döner, veri
 * JSON API'sindedir. Bu yüzden sırayla üç strateji denenir:
 *
 *   1. RSS/Atom         → <item> / <entry>
 *   2. JSON             → { data: [...] } / { items: [...] } / dizi
 *   3. HTML             → <article> öğeleri
 *   4. SPA keşfi        → aynı origin'de /api/news (JSON) ve /feed.xml
 *
 * Hiçbiri sonuç vermezse `ok: false` döner. Uydurma hikâye ÜRETİLMEZ.
 */

export type FeedStory = {
  /** Tekilleştirme anahtarı: "<source>:<externalId>" veya URL karması. */
  key: string;
  title: string;
  url: string;
  originalUrl: string | null;
  publishedAt: Date | null;
  summary: string;
  category: string;
  tags: string[];
  imageUrl: string | null;
  imageCredit: string | null;
  externalId: string | null;
};

export type FeedResult =
  | {
      ok: true;
      strategy: "rss" | "json" | "html";
      sourceUrl: string;
      stories: FeedStory[];
      /** Hangi feed alanı hangi iç alana eşlendi (rapor için). */
      mapping: Record<string, string>;
      /** Rapor: kaç kayıt okundu, kaçı atlandı ve neden. */
      notes: string[];
    }
  | {
      ok: false;
      strategy: "none";
      sourceUrl: string;
      stories: [];
      mapping: Record<string, string>;
      notes: string[];
      error: string;
    };

const FETCH_TIMEOUT_MS = 20_000;
const MAX_BODY_BYTES = 4 * 1024 * 1024;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Alan eşleme tablosu — README/rapor için tek kaynak. */
export const FEED_FIELD_MAP: Record<string, string> = {
  "title / headline / name": "title",
  "link / url / permalink / slug": "url",
  "pubDate / published / published_at / updated / created_at": "publishedAt",
  "description / summary / social_summary / excerpt / content": "summary",
  "category / section / tags": "category + tags",
  "media:content / enclosure / image_url / thumbnail": "imageUrl",
  "image_credit / credit": "imageCredit",
  "id / guid": "externalId",
  "original_link / source_url": "originalUrl",
};

function sourceOrigin(sourceUrl: string): string {
  try {
    return new URL(sourceUrl).origin;
  } catch {
    return "https://kantan.news";
  }
}

async function fetchText(url: string): Promise<{ text: string; type: string }> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept:
        "application/rss+xml, application/atom+xml, application/xml, application/json, text/html;q=0.8",
      "Accept-Language": "tr,en;q=0.7",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} (${url})`);
  }

  const type = response.headers.get("content-type") ?? "";
  const buffer = await response.arrayBuffer();

  if (buffer.byteLength > MAX_BODY_BYTES) {
    throw new Error(`Yanıt çok büyük (${buffer.byteLength} bayt): ${url}`);
  }

  return { text: new TextDecoder("utf-8").decode(buffer), type };
}

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  // Gelecekteki tarihleri (saat kayması) şimdiye sabitle.
  const now = Date.now();
  if (date.getTime() > now + 60_000) return new Date(now);

  return date;
}

function absoluteUrl(value: unknown, base: string): string | null {
  if (typeof value !== "string" || !value.trim()) return null;

  const raw = value.trim();

  try {
    const url = new URL(raw, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function cleanText(value: unknown, maxLength = 600): string {
  if (typeof value !== "string") return "";

  // HTML varlıkları ve etiketleri temizle; CData kalıntısını at.
  const withoutCdata = value.replace(/<!\[CDATA\[|\]\]>/g, " ");
  return truncate(stripHtml(withoutCdata).replace(/\s+/g, " ").trim(), maxLength);
}

function splitTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .slice(0, 12);
  }

  if (typeof value !== "string") return [];

  return value
    .split(/[,;|]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function hashKey(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 24);
}

function buildKey(
  source: string,
  externalId: string | null,
  url: string,
): string {
  if (externalId) return `${source}:${foldTurkish(externalId).slice(0, 60)}`;
  return `${source}:url:${hashKey(url)}`;
}

// ─── 1) JSON stratejisi ──────────────────────────────────────────────────────

type JsonRecord = Record<string, unknown>;

function pickString(record: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function pickDate(record: JsonRecord, keys: string[]): Date | null {
  for (const key of keys) {
    const parsed = parseDate(record[key]);
    if (parsed) return parsed;
  }
  return null;
}

function pickImage(record: JsonRecord): string | null {
  const direct = pickString(record, [
    "image_url",
    "imageUrl",
    "image",
    "thumbnail",
    "cover",
    "cover_image",
    "og_image",
  ]);

  if (direct) return direct;

  const images = record.images;
  if (Array.isArray(images) && images.length > 0) {
    const first = images[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object") {
      return pickString(first as JsonRecord, ["url", "src"]);
    }
  }

  const media = record.media;
  if (media && typeof media === "object") {
    return pickString(media as JsonRecord, ["url", "src"]);
  }

  return null;
}

function normalizeJsonRecord(
  record: JsonRecord,
  base: string,
  source: string,
): FeedStory | null {
  const title = cleanText(pickString(record, ["title", "headline", "name"]), 300);
  if (!title) return null;

  const externalId = pickString(record, ["id", "guid", "_id", "external_id"]);
  const slug = pickString(record, ["slug", "permalink"]);

  const linkCandidates = [
    pickString(record, ["link", "url", "permalink", "web_url", "source_url"]),
  ];

  // SPA API'sinde `link` yok; `slug` ile yayın URL'si kurulur.
  if (!linkCandidates[0] && slug) {
    linkCandidates.push(`/${slug}`);
  }

  const url =
    linkCandidates
      .map((candidate) => absoluteUrl(candidate, base))
      .find((value): value is string => Boolean(value)) ?? null;

  if (!url) return null;

  const summary = cleanText(
    pickString(record, [
      "social_summary",
      "summary",
      "description",
      "excerpt",
      "content",
      "abstract",
    ]),
    900,
  );

  const categoryRaw = pickString(record, ["category", "section", "topic"]);
  const tags = splitTags(record.tags ?? record.keywords ?? record.categories);

  const imageRaw = pickImage(record);
  const imageUrl = imageRaw ? absoluteUrl(imageRaw, base) : null;

  return {
    key: buildKey(source, externalId, url),
    title,
    url,
    originalUrl: absoluteUrl(
      pickString(record, ["original_link", "originalUrl", "source_link"]),
      base,
    ),
    publishedAt: pickDate(record, [
      "published_at",
      "publishedAt",
      "pubDate",
      "published",
      "created_at",
      "createdAt",
      "updated_at",
      "date",
    ]),
    summary,
    category: categoryRaw ? cleanText(categoryRaw, 60) : "",
    tags,
    imageUrl,
    imageCredit: pickString(record, ["image_credit", "imageCredit", "credit"]),
    externalId,
  };
}

function recordsFromJson(payload: unknown): JsonRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (item): item is JsonRecord => Boolean(item) && typeof item === "object",
    );
  }

  if (!payload || typeof payload !== "object") return [];

  const container = payload as JsonRecord;

  for (const key of ["data", "items", "articles", "stories", "results", "posts", "feed"]) {
    const value = container[key];

    if (Array.isArray(value)) {
      return value.filter(
        (item): item is JsonRecord => Boolean(item) && typeof item === "object",
      );
    }

    // { data: { items: [...] } }
    if (value && typeof value === "object") {
      const nested = value as JsonRecord;
      for (const nestedKey of ["items", "data", "articles", "results"]) {
        const nestedValue = nested[nestedKey];
        if (Array.isArray(nestedValue)) {
          return nestedValue.filter(
            (item): item is JsonRecord =>
              Boolean(item) && typeof item === "object",
          );
        }
      }
    }
  }

  return [];
}

function parseJsonFeed(
  text: string,
  base: string,
  source: string,
): FeedStory[] {
  const payload: unknown = JSON.parse(text);
  const records = recordsFromJson(payload);

  const stories: FeedStory[] = [];
  for (const record of records) {
    const story = normalizeJsonRecord(record, base, source);
    if (story) stories.push(story);
  }

  return stories;
}

// ─── 2) RSS / Atom stratejisi ────────────────────────────────────────────────

const parser = new Parser<Record<string, unknown>, Record<string, unknown>>({
  timeout: FETCH_TIMEOUT_MS,
  headers: { "User-Agent": BROWSER_UA },
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
      ["content:encoded", "contentEncoded"],
      ["dc:date", "dcDate"],
      ["source", "sourceName"],
    ],
  },
});

function firstAttribute(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstAttribute(item);
      if (found) return found;
    }
    return null;
  }

  if (value && typeof value === "object") {
    const record = value as JsonRecord;
    const direct = record.$ ?? record;
    if (direct && typeof direct === "object") {
      const attrs = direct as JsonRecord;
      if (typeof attrs.url === "string") return attrs.url;
      if (typeof attrs.href === "string") return attrs.href;
    }
    if (typeof record.url === "string") return record.url;
  }

  if (typeof value === "string") return value;

  return null;
}

async function parseRssFeed(
  xml: string,
  base: string,
  source: string,
): Promise<FeedStory[]> {
  const feed = await parser.parseString(xml);

  const stories: FeedStory[] = [];

  for (const item of feed.items ?? []) {
    const record = item as unknown as JsonRecord;
    const title = cleanText(record.title, 300);
    if (!title) continue;

    const url = absoluteUrl(
      record.link ?? record.guid ?? record.id,
      base,
    );
    if (!url) continue;

    const summary = cleanText(
      record.contentSnippet ?? record.content ?? record.contentEncoded ?? record.summary,
      900,
    );

    const imageRaw =
      firstAttribute(record.enclosure) ??
      firstAttribute(record.mediaContent) ??
      firstAttribute(record.mediaThumbnail) ??
      (typeof record.image === "string" ? record.image : null);

    const categories = Array.isArray(record.categories)
      ? record.categories
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter(Boolean)
      : [];

    const externalId =
      typeof record.guid === "string" ? record.guid : typeof record.id === "string" ? record.id : null;

    stories.push({
      key: buildKey(source, externalId, url),
      title,
      url,
      originalUrl: null,
      publishedAt: parseDate(
        record.isoDate ?? record.pubDate ?? record.dcDate ?? record.updated,
      ),
      summary,
      category: categories[0] ?? "",
      tags: categories.slice(0, 12),
      imageUrl: imageRaw ? absoluteUrl(imageRaw, base) : null,
      imageCredit: null,
      externalId,
    });
  }

  return stories;
}

// ─── 3) HTML stratejisi ──────────────────────────────────────────────────────

function extractAttribute(tag: string, attribute: string): string | null {
  const pattern = new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, "i");
  return tag.match(pattern)?.[1] ?? null;
}

function parseHtmlFeed(html: string, base: string, source: string): FeedStory[] {
  const stories: FeedStory[] = [];

  // <article> blokları: başlık + link + tarih + spot.
  const articlePattern = /<article\b[\s\S]*?<\/article>/gi;
  const blocks = html.match(articlePattern) ?? [];

  for (const block of blocks) {
    const anchorMatch = block.match(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!anchorMatch) continue;

    const url = absoluteUrl(anchorMatch[1], base);
    if (!url) continue;

    const headingMatch = block.match(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/i);
    const title = cleanText(headingMatch?.[1] ?? anchorMatch[2], 300);
    if (!title) continue;

    const timeMatch = block.match(/<time\b[^>]*>([\s\S]*?)<\/time>/i);
    const dateAttr = timeMatch
      ? extractAttribute(timeMatch[0], "datetime")
      : null;

    const paragraphs = [...block.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((match) => cleanText(match[1], 400))
      .filter(Boolean);

    const imgTag = block.match(/<img\b[^>]*>/i)?.[0] ?? null;

    stories.push({
      key: buildKey(source, null, url),
      title,
      url,
      originalUrl: null,
      publishedAt: parseDate(dateAttr ?? timeMatch?.[1]),
      summary: paragraphs[0] ?? "",
      category: "",
      tags: [],
      imageUrl: imgTag
        ? absoluteUrl(
            extractAttribute(imgTag, "src") ?? extractAttribute(imgTag, "data-src"),
            base,
          )
        : null,
      imageCredit: null,
      externalId: null,
    });
  }

  return stories;
}

// ─── 4) SPA keşfi ────────────────────────────────────────────────────────────

/**
 * SPA HTML kabuğu tespiti: gövdede <article> yok ve #root/__NEXT_DATA__
 * gibi işaretler var. Bu durumda aynı origin'deki JSON API'ler denenir.
 */
function looksLikeSpa(html: string): boolean {
  const lower = html.toLowerCase();
  return (
    !lower.includes("<article") &&
    (lower.includes('id="root"') ||
      lower.includes("id='root'") ||
      lower.includes("__next_data__") ||
      lower.includes("data-reactroot"))
  );
}

function spaJsonCandidates(sourceUrl: string): string[] {
  const origin = sourceOrigin(sourceUrl);
  return [
    `${origin}/api/news?limit=50`,
    `${origin}/api/feed`,
    `${origin}/feed.json`,
  ];
}

// ─── Ana giriş noktası ──────────────────────────────────────────────────────

export async function fetchFeedStories(
  feedUrl: string,
  options: { sourceName?: string } = {},
): Promise<FeedResult> {
  const source = options.sourceName ?? "kantan.news";
  const notes: string[] = [];
  const base = sourceOrigin(feedUrl);

  const fail = (error: string): FeedResult => ({
    ok: false,
    strategy: "none",
    sourceUrl: feedUrl,
    stories: [],
    mapping: FEED_FIELD_MAP,
    notes,
    error,
  });

  let text = "";
  let contentType = "";

  try {
    const response = await fetchText(feedUrl);
    text = response.text;
    contentType = response.type;
  } catch (error) {
    notes.push(`Feed isteği başarısız: ${(error as Error).message}`);
  }

  const looksJson =
    contentType.includes("json") ||
    /^\s*[[{]/.test(text.slice(0, 200));

  const looksXml =
    contentType.includes("xml") ||
    /^\s*<\?xml/.test(text.slice(0, 200)) ||
    /<rss\b|<feed\b/i.test(text.slice(0, 2000));

  // 1) JSON
  if (text && looksJson) {
    try {
      const stories = parseJsonFeed(text, base, source);
      if (stories.length > 0) {
        notes.push(`JSON stratejisi: ${stories.length} hikâye okundu.`);
        return {
          ok: true,
          strategy: "json",
          sourceUrl: feedUrl,
          stories,
          mapping: FEED_FIELD_MAP,
          notes,
        };
      }
      notes.push("JSON gövdesi tanındı ama hikâye bulunamadı.");
    } catch (error) {
      notes.push(`JSON ayrıştırılamadı: ${(error as Error).message}`);
    }
  }

  // 2) RSS/Atom
  if (text && looksXml) {
    try {
      const stories = await parseRssFeed(text, base, source);
      if (stories.length > 0) {
        notes.push(`RSS/Atom stratejisi: ${stories.length} hikâye okundu.`);
        return {
          ok: true,
          strategy: "rss",
          sourceUrl: feedUrl,
          stories,
          mapping: FEED_FIELD_MAP,
          notes,
        };
      }
      notes.push("XML gövdesi tanındı ama <item>/<entry> bulunamadı.");
    } catch (error) {
      notes.push(`XML ayrıştırılamadı: ${(error as Error).message}`);
    }
  }

  // 3) HTML <article>
  if (text) {
    const stories = parseHtmlFeed(text, base, source);
    if (stories.length > 0) {
      notes.push(`HTML stratejisi: ${stories.length} <article> bulundu.`);
      return {
        ok: true,
        strategy: "html",
        sourceUrl: feedUrl,
        stories,
        mapping: FEED_FIELD_MAP,
        notes,
      };
    }

    if (looksLikeSpa(text)) {
      notes.push(
        "HTML bir SPA kabuğu (içerik istemcide render ediliyor). JSON API deneniyor.",
      );
    } else if (!text) {
      notes.push("Feed gövdesi boş.");
    } else {
      notes.push("HTML'de <article> öğesi bulunamadı.");
    }
  }

  // 4) SPA keşfi
  for (const candidate of spaJsonCandidates(feedUrl)) {
    try {
      const response = await fetchText(candidate);

      if (!/^\s*[[{]/.test(response.text.slice(0, 200))) {
        notes.push(`SPA adayı JSON değil: ${candidate}`);
        continue;
      }

      const stories = parseJsonFeed(response.text, base, source);

      if (stories.length > 0) {
        notes.push(`SPA keşfi başarılı: ${candidate} (${stories.length} hikâye).`);
        return {
          ok: true,
          strategy: "json",
          sourceUrl: candidate,
          stories,
          mapping: FEED_FIELD_MAP,
          notes,
        };
      }

      notes.push(`SPA adayı boş: ${candidate}`);
    } catch (error) {
      notes.push(`SPA adayı başarısız (${candidate}): ${(error as Error).message}`);
    }
  }

  return fail(
    "Feed okunamadı: ne RSS/Atom, ne JSON, ne de HTML <article> bulundu.",
  );
}

/**
 * Zaman penceresi filtresi: son N saat (varsayılan 48).
 * Tarihi olmayan hikâyeler belirsizdir → pencereye alınmaz.
 */
export function filterByWindow(
  stories: FeedStory[],
  hours: number,
  now: Date = new Date(),
): { fresh: FeedStory[]; skipped: number } {
  const cutoff = now.getTime() - hours * 60 * 60 * 1000;
  const fresh: FeedStory[] = [];
  let skipped = 0;

  for (const story of stories) {
    if (!story.publishedAt) {
      skipped += 1;
      continue;
    }

    if (story.publishedAt.getTime() < cutoff) {
      skipped += 1;
      continue;
    }

    fresh.push(story);
  }

  return { fresh, skipped };
}

/** Aynı URL'nin yalnızca bir kez işlenmesini sağlar. */
export function dedupeStories(stories: FeedStory[]): FeedStory[] {
  const seenKeys = new Set<string>();
  const seenUrls = new Set<string>();
  const unique: FeedStory[] = [];

  for (const story of stories) {
    const urlKey = story.url.replace(/[?#].*$/, "").replace(/\/+$/, "");

    if (seenKeys.has(story.key) || seenUrls.has(urlKey)) continue;

    seenKeys.add(story.key);
    seenUrls.add(urlKey);
    unique.push(story);
  }

  return unique;
}
