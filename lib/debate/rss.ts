import { md5 } from "@/lib/utils";
import { complete, parseJsonResponse } from "@/lib/ai";
import {
  checkDebateGates,
  computeMus,
  type MusInput,
  type MusResult,
} from "@/lib/debate/score";
import { prisma } from "@/lib/prisma";

/**
 * Münazara RSS hattı — SUNUCU TARAFI.
 *
 * Kural (11.7): feed'ler yalnızca sunucuda/build adımında çekilir ve
 * önbelleğe alınır. Tarayıcıdan üçüncü tarafa istek atılmaz; kullanıcı
 * IP'si sızmaz. Ham içerik kalıcı olarak saklanmaz: yalnızca üretilen
 * özet + kaynak bağlantısı tutulur.
 */

export type FeedItem = {
  guid: string;
  title: string;
  link: string;
  summary: string;
  publishedAt: string | null;
  category: string;
};

export type FeedCheck = {
  url: string;
  name: string;
  ok: boolean;
  reason: string;
  itemCount: number;
  newestAt: string | null;
};

const TIMEOUT_MS = 20_000;
const MAX_BYTES = 3_000_000;
const MIN_ITEMS = 5;
const MAX_AGE_DAYS = 30;

function decode(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ");
}

function strip(value: string): string {
  return decode(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, names: string[]): string {
  for (const name of names) {
    const match = block.match(
      new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"),
    );
    if (match) return decode(match[1]).trim();
  }
  return "";
}

function href(block: string): string {
  const match = block.match(/<link\b[^>]*href=["']([^"']+)["']/i);
  return match ? decode(match[1]).trim() : "";
}

/**
 * Alan eşlemesi: RSS 2.0 ve Atom birlikte desteklenir.
 * title → başlık · link/href → URL · pubDate/published/updated → tarih
 * description/summary/content → spot · category → kategori
 */
export function parseFeedXml(xml: string): FeedItem[] {
  const blocks = [
    ...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi),
    ...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi),
  ].map((match) => match[0]);

  return blocks.map((block) => {
    const link = tag(block, ["link"]) || href(block);
    const guid = tag(block, ["guid", "id"]) || link;

    return {
      guid: guid.trim(),
      title: strip(tag(block, ["title"])),
      link: link.trim(),
      summary: strip(
        tag(block, ["description", "summary", "content", "content:encoded"]),
      ).slice(0, 1200),
      publishedAt: tag(block, ["pubDate", "published", "updated", "dc:date"]) || null,
      category: strip(tag(block, ["category", "dc:subject"])).slice(0, 60),
    };
  });
}

/** Aday feed doğrulaması: HTTP 200, XML, ≥5 öğe, son 30 günde güncelleme. */
export async function checkFeed(name: string, url: string): Promise<FeedCheck> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          `tcfh-news-debate/1.0 (+${process.env.SITE_URL ?? "http://localhost:3000"})`,
        Accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    if (response.status !== 200) {
      return {
        url,
        name,
        ok: false,
        reason: `HTTP ${response.status}`,
        itemCount: 0,
        newestAt: null,
      };
    }

    const xml = (await response.text()).slice(0, MAX_BYTES);
    const items = parseFeedXml(xml);

    if (items.length < MIN_ITEMS) {
      return {
        url,
        name,
        ok: false,
        reason: `Yalnızca ${items.length} öğe (en az ${MIN_ITEMS} gerekli)`,
        itemCount: items.length,
        newestAt: null,
      };
    }

    const dates = items
      .map((item) => (item.publishedAt ? new Date(item.publishedAt) : null))
      .filter((date): date is Date => Boolean(date && !Number.isNaN(date.getTime())));

    const newest = dates.length
      ? new Date(Math.max(...dates.map((date) => date.getTime())))
      : null;

    if (!newest) {
      return {
        url,
        name,
        ok: false,
        reason: "Tarih alanı okunamadı",
        itemCount: items.length,
        newestAt: null,
      };
    }

    const ageDays = Math.floor((Date.now() - newest.getTime()) / 86_400_000);

    if (ageDays > MAX_AGE_DAYS) {
      return {
        url,
        name,
        ok: false,
        reason: `Son güncelleme ${ageDays} gün önce`,
        itemCount: items.length,
        newestAt: newest.toISOString(),
      };
    }

    return {
      url,
      name,
      ok: true,
      reason: `${items.length} öğe · ${ageDays} gün`,
      itemCount: items.length,
      newestAt: newest.toISOString(),
    };
  } catch (error) {
    return {
      url,
      name,
      ok: false,
      reason:
        error instanceof Error && error.name === "TimeoutError"
          ? "Zaman aşımı"
          : "Bağlantı hatası",
      itemCount: 0,
      newestAt: null,
    };
  }
}

const SPECIAL_CATEGORY_PATTERNS = [
  /\bsağlık (durumu|raporu)\b/i,
  /\bcinsel (hayat|yönelim)\b/i,
  /\bdini? (inanc|görüş)\b/i,
  /\betnik (köken|kimlik)\b/i,
  /\bsendika üyeli/i,
  /\badli sicil\b/i,
];

const MINOR_PATTERN = /\b(\d{1,2}) yaşında (çocuk|kız|erkek|öğrenci)\b/i;

/** KVKK/editoryal koruma: özel nitelikli veri ve reşit olmayan işareti. */
export function detectProtectedContent(text: string): {
  hasSpecialCategoryData: boolean;
  hasMinorName: boolean;
  hasUnverifiedAccusationInTitle: boolean;
} {
  return {
    hasSpecialCategoryData: SPECIAL_CATEGORY_PATTERNS.some((pattern) =>
      pattern.test(text),
    ),
    hasMinorName: MINOR_PATTERN.test(text),
    hasUnverifiedAccusationInTitle: /\b(suçlu|hırsız|dolandırıcı|terörist)\b/i.test(
      text,
    ),
  };
}

/** "Bu meclis ... inanır" biçiminde deterministik motion önerisi. */
export function suggestMotion(title: string): string {
  const topic = title
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim()
    .toLocaleLowerCase("tr-TR");

  return `Bu meclis, ${topic} konusunda düzenleme yapılması gerektiğine inanır.`;
}

/** Tek cümlelik "ne oldu" özeti (en fazla 25 kelime). */
export function summarizeFeedItem(item: FeedItem): string {
  const source = item.summary || item.title;
  const first = source.split(/(?<=[.!?])\s+/)[0] ?? source;
  const words = first.split(/\s+/).filter(Boolean);

  return (words.length > 25 ? `${words.slice(0, 25).join(" ")}…` : first).trim();
}

export type CandidateScore = {
  item: FeedItem;
  sourceKey: string;
  summary: string;
  motion: string;
  mus: MusResult;
  gates: ReturnType<typeof checkDebateGates>;
  protected: ReturnType<typeof detectProtectedContent>;
};

/**
 * Aday içerik için MUS + kalite kapıları. LLM anahtarı varsa başlık/özet
 * yorumu için kullanılabilir; yoksa deterministik şablon devreye girer
 * (uydurma kaynak yok, tarayıcı isteği yok).
 */
export function evaluateCandidate(input: {
  item: FeedItem;
  feedUrl: string;
  independentSourceCount: number;
  recencyDays: number;
  scope: "tr" | "global";
  hasTurkeyLink: boolean;
  levelFit: number;
  originality: "none" | "similar" | "duplicate";
  level: "lise" | "universite" | "karma";
  levelFilter: boolean;
}): CandidateScore {
  const protectedFlags = detectProtectedContent(
    `${input.item.title} ${input.item.summary}`,
  );

  const musInput: MusInput = {
    controversy: 3,
    infoNeed: Math.min(5, input.independentSourceCount),
    recencyDays: input.recencyDays,
    scope: input.scope,
    hasTurkeyLink: input.hasTurkeyLink,
    levelFit: input.levelFit,
    originality: input.originality,
    levelFilter: input.levelFilter,
  };

  const mus = computeMus(musInput);
  const motion = suggestMotion(input.item.title);
  const summary = summarizeFeedItem(input.item);

  const gates = checkDebateGates({
    motionText: motion,
    independentSourceCount: input.independentSourceCount,
    governmentArguments: 3,
    oppositionArguments: 3,
    keyClashCount: 3,
    ...protectedFlags,
  });

  return {
    item: input.item,
    sourceKey: `${input.feedUrl}::${md5(input.item.guid || input.item.link)}`,
    summary,
    motion,
    mus,
    gates,
    protected: protectedFlags,
  };
}

/**
 * Adayı veritabanına yazar (tekilleştirme: feed + guid/link karması).
 * Ham içerik saklanmaz; yalnızca özet + bağlantı + MUS raporu tutulur.
 */
export async function storeCandidate(
  score: CandidateScore,
  feed: { url: string; name: string },
  level: "lise" | "universite" | "karma",
): Promise<"created" | "exists" | "skipped"> {
  if (!score.gates.passed) return "skipped";

  const existing = await prisma.debateCandidate.findUnique({
    where: { sourceKey: score.sourceKey },
    select: { id: true },
  });

  if (existing) return "exists";

  await prisma.debateCandidate.create({
    data: {
      sourceKey: score.sourceKey,
      feedUrl: feed.url,
      sourceName: feed.name,
      title: score.item.title.slice(0, 200),
      url: score.item.link,
      summary: score.summary.slice(0, 400),
      publishedAt: score.item.publishedAt
        ? new Date(score.item.publishedAt)
        : null,
      musScore: score.mus.score,
      musBreakdown: JSON.stringify({
        components: score.mus.components,
        weights: score.mus.weights,
        reason: score.mus.reason,
        level,
      }),
      musReason: score.mus.reason,
      motionText: score.motion,
      status: score.mus.decision === "auto" ? "queued" : "review",
    },
  });

  return "created";
}

/**
 * İsteğe bağlı LLM yorumu. Anahtar yalnızca sunucudadır; yoksa çağrılmaz
 * ve deterministik motion/özet kullanılır. Sonuç şeması doğrulanır.
 */
export async function interpretWithAi(input: {
  title: string;
  summary: string;
}): Promise<{
  motion: string;
  governmentArguments: string[];
  oppositionArguments: string[];
  usedAi: boolean;
}> {
  const fallback = {
    motion: suggestMotion(input.title),
    governmentArguments: [
      "Politikanın ölçülebilir bir fayda ürettiğini göster",
      "Uygulama maliyetinin yönetilebilir olduğunu kanıtla",
      "Alternatiflerin daha büyük zarar ürettiğini ortaya koy",
    ],
    oppositionArguments: [
      "Politikanın temel haklar üzerindeki orantısız etkisini göster",
      "Uygulamanın fiilen etkisiz kalacağını kanıtla",
      "Daha az müdahaleci alternatifin yeterli olduğunu ortaya koy",
    ],
    usedAi: false,
  };

  try {
    const raw = await complete({
      json: true,
      maxTokens: 900,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Tarafsız bir münazara editörüsün. Yalnızca verilen başlık ve özetten hareket et. Kişisel veri, suçlama veya kesin hüküm üretme. Yalnızca JSON döndür.",
        },
        {
          role: "user",
          content: `Başlık: ${input.title}\nÖzet: ${input.summary}\n\nŞu JSON şemasını doldur: {"motion":"Bu meclis ... inanır.","governmentArguments":["...","...","..."],"oppositionArguments":["...","...","..."]}`,
        },
      ],
    });

    const parsed = parseJsonResponse<{
      motion?: unknown;
      governmentArguments?: unknown;
      oppositionArguments?: unknown;
    }>(raw);

    const motion =
      typeof parsed.motion === "string" ? parsed.motion.trim() : "";
    const gov = Array.isArray(parsed.governmentArguments)
      ? parsed.governmentArguments.filter(
          (value): value is string => typeof value === "string" && value.length > 8,
        )
      : [];
    const opp = Array.isArray(parsed.oppositionArguments)
      ? parsed.oppositionArguments.filter(
          (value): value is string => typeof value === "string" && value.length > 8,
        )
      : [];

    if (
      /^Bu meclis\b.+\binanır[.!]?$/i.test(motion) &&
      gov.length >= 3 &&
      opp.length >= 3
    ) {
      return {
        motion,
        governmentArguments: gov.slice(0, 3),
        oppositionArguments: opp.slice(0, 3),
        usedAi: true,
      };
    }

    return fallback;
  } catch {
    return fallback;
  }
}
