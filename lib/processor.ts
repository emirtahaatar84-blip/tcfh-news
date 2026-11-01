import { createHash } from "crypto";
import { runFactCheck } from "@/lib/fact-check";
import { extractUsage, recordTokenUsage, canSpendTokens } from "@/lib/token-budget";
import Parser from "rss-parser";
import type { SystemSettings } from "@prisma/client";
import { normalizeCategory, type Category } from "@/lib/categories";
import { classifyArticle, FALLBACK_CATEGORY } from "@/lib/hq/classifier";
import { detectCity } from "@/lib/geo";
import { queueNewsImage } from "@/lib/imagegen";
import { prisma } from "@/lib/prisma";
import { uniqueNewsSlug } from "@/lib/unique-slug";
import { maybeAutoPush } from "@/lib/push";
import { reviewStory, type ReviewVerdict } from "@/lib/reviewer";
import { getSettings, DEFAULT_PROMPT_TEMPLATE } from "@/lib/settings";
import {
  extractJsonObject,
  foldTurkish,
  getErrorMessage,
  isValidHttpUrl,
  md5,
  parseJsonArray,
  readingTimeMinutes,
  resolveChatCompletionsUrl,
  stripHtml,
  truncate,
} from "@/lib/utils";

/**
 * Independent Multi-Source News Synthesis Engine.
 *
 * Cycle pipeline (every 10 minutes):
 *   1. Ingestion — raw RSS items from every active source are staged in
 *      `RawFeedItem` (deduplicated by source + URL).
 *   2. Clustering — unprocessed items from the last 60 minutes are
 *      grouped by event via title similarity. EVERY cluster (including
 *      single-source ones) is eligible; quality is enforced downstream by
 *      the pre-publish reviewer (qwen3-vl-30b) and the hourly gemma audit.
 *   3. Persona synthesis — the LLM writes an original Turkish report in
 *      the voice of a category-specific writer persona.
 *   4. Pre-publish review — the reviewer compares the draft against the
 *      source material; only approved drafts become NewsItems.
 *   5. Cleanup — raw items older than 2 hours are purged.
 */

const MAX_ITEMS_PER_SOURCE = 15;
const MAX_CONTENT_LENGTH = 6_000;
const MAX_ARTICLES_PER_PROMPT = 6;
const ARTICLE_CONTENT_LIMIT = 2_500;
const LLM_TIMEOUT_MS = 120_000;
const LLM_CONCURRENCY = 2;
const CLUSTER_WINDOW_MS = 60 * 60 * 1000;
const RAW_RETENTION_MS = 2 * 60 * 60 * 1000;
const CLUSTER_SIMILARITY_THRESHOLD = 0.25;
const CLUSTER_MIN_SHARED_TOKENS = 2;
/** Döngü başına yeni sentez limiti (hacim kontrolü). */
const MAX_SYNTHESIS_PER_CYCLE = 8;
/** Denetçi ulaşılamazsa bir haber en fazla bu kadar döngü bekletilir. */
const MAX_REVIEW_ATTEMPTS = 3;
/** Bekleyen (pendingReview) taslakların bellek içi ömrü. */
const PENDING_TTL_MS = 2 * 60 * 60 * 1000;

const parser = new Parser({
  timeout: 20_000,
  headers: {
    "User-Agent":
      `MicroNewsBot/1.0 (+${process.env.SITE_URL ?? "http://localhost:3000"}; RSS aggregator)`,
    Accept:
      "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
  },
  customFields: {
    item: ["media:content", "media:thumbnail"],
  },
});

export class LlmNotConfiguredError extends Error {
  constructor() {
    super("LLM provider is not configured.");
    this.name = "LlmNotConfiguredError";
  }
}

type RawCandidate = {
  hash: string;
  title: string;
  content: string;
  sourceName: string;
  sourceUrl: string;
  imageUrl: string | null;
};

export type ProcessResult = {
  sources: number;
  fetched: number;
  staged: number;
  clusters: number;
  /** Doğrulama şartı kalktı: artık işleme giren (tüm) küme sayısı. */
  verified: number;
  published: number;
  rejected: number;
  purged: number;
  failed: number;
  errors: string[];
};

export type FetchJobState = {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  lastResult: ProcessResult | null;
  error: string | null;
};

const globalForJob = globalThis as unknown as {
  newsFetchJob?: FetchJobState;
};

export function getFetchJob(): FetchJobState {
  if (!globalForJob.newsFetchJob) {
    globalForJob.newsFetchJob = {
      running: false,
      startedAt: null,
      finishedAt: null,
      lastResult: null,
      error: null,
    };
  }

  return globalForJob.newsFetchJob;
}

/**
 * Starts the fetch job in the background and returns immediately.
 * Returns false when a job is already running.
 */
export function startFetchJob(): boolean {
  const job = getFetchJob();

  if (job.running) return false;

  job.running = true;
  job.startedAt = new Date().toISOString();
  job.finishedAt = null;
  job.lastResult = null;
  job.error = null;

  void processFeeds()
    .then((result) => {
      job.lastResult = result;
    })
    .catch((error) => {
      job.error = getErrorMessage(error);
    })
    .finally(() => {
      job.running = false;
      job.finishedAt = new Date().toISOString();
    });

  return true;
}

// ─── Stage 1: Ingestion ──────────────────────────────────────────────────────

async function stageRawItems(result: ProcessResult): Promise<void> {
  const sources = await prisma.rSSSource.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });

  result.sources = sources.length;
  if (sources.length === 0) return;

  const candidates: RawCandidate[] = [];

  await Promise.all(
    sources.map(async (source) => {
      try {
        const feed = await parser.parseURL(source.url);
        const items = feed.items ?? [];
        result.fetched += items.length;

        for (const item of items.slice(0, MAX_ITEMS_PER_SOURCE)) {
          const link = (item.link ?? item.guid ?? "").trim();
          const title = (item.title ?? "").trim();
          const sourceName = source.name.trim() || "RSS";

          if (!link || !title || !isValidHttpUrl(link)) continue;

          const content =
            item.contentSnippet ||
            (typeof item.content === "string" ? item.content : "") ||
            item.summary ||
            title;

          candidates.push({
            hash: md5(`${sourceName}|${link}`),
            title: truncate(title, 300),
            content: truncate(stripHtml(content) || title, MAX_CONTENT_LENGTH),
            sourceName,
            sourceUrl: link,
            // TELİF: RSS görselleri hiç saklanmaz — her haber için
            // AI üretimli telifsiz illüstrasyon oluşturulur (lib/imagegen).
            imageUrl: null,
          });
        }
      } catch (error) {
        result.failed += 1;
        result.errors.push(
          `${source.name}: ${truncate(getErrorMessage(error), 240)}`,
        );
      }
    }),
  );

  if (candidates.length === 0) return;

  const unique = new Map<string, RawCandidate>();
  for (const candidate of candidates) {
    if (!unique.has(candidate.hash)) unique.set(candidate.hash, candidate);
  }

  const existing = await prisma.rawFeedItem.findMany({
    where: { hash: { in: [...unique.keys()] } },
    select: { hash: true },
  });
  const existingHashes = new Set(existing.map((row) => row.hash));

  // Touch items still present in the current feed listings: their
  // clustering window follows the story for as long as it stays listed,
  // so a later source joining the same event still merges into the
  // cluster within the 60-minute window.
  if (existingHashes.size > 0) {
    await prisma.rawFeedItem.updateMany({
      where: { hash: { in: [...existingHashes] } },
      data: { fetchedAt: new Date() },
    });
  }

  const fresh = [...unique.values()].filter(
    (candidate) => !existingHashes.has(candidate.hash),
  );

  if (fresh.length === 0) return;

  await prisma.rawFeedItem.createMany({
    data: fresh.map((candidate) => ({
      hash: candidate.hash,
      title: candidate.title,
      content: candidate.content,
      sourceName: candidate.sourceName,
      sourceUrl: candidate.sourceUrl,
      imageUrl: candidate.imageUrl,
    })),
  });

  result.staged = fresh.length;
}

// ─── Stage 2: Clustering ─────────────────────────────────────────────────────

const CLUSTER_STOPWORDS = new Set([
  // Turkish
  "haber", "haberi", "haberler", "son", "dakika", "ile", "için", "kadar",
  "sonra", "önce", "olarak", "olan", "yeni", "ilk", "büyük", "sonunda",
  "açıkladı", "açıklandı", "söyledi", "dedi", "başladı", "başlattı",
  "devam", "ediyor", "sürüyor", "yaşanan", "yaşadı", "bulundu", "geldi",
  "gitti", "yaptı", "yapılan", "alındı", "verildi", "çıktı", "oldu",
  "olacak", "olanak", "şekilde", "zaman", "bugün", "yarın", "dün",
  "geçen", "gelecek", "hakkında", "göre", "karşı", "yanında", "beraber",
  "çalışma", "çalıştı", "istiyor", "istedi", "kullanılan", "kullandı",
  "bulunan", "etti", "edilen", "ettiği", "olduğu", "olduğunu", "büyükelçiliği",
  "başkanı", "başkanı", "genel", "merkez", "kurulu", "kuruluş",
  // English
  "says", "said", "will", "after", "before", "about", "from", "with",
  "have", "has", "been", "were", "which", "while", "would", "their",
  "there", "than", "then", "them", "they", "when", "what", "where",
  "also", "amid", "among", "both", "each", "more", "most", "other",
  "such", "only", "very", "just", "like", "make", "made", "take",
  "took", "give", "given", "still", "since", "being", "under", "again",
  "once", "here", "your", "news", "report", "reports", "update", "live",
  "latest", "first", "last", "next", "year", "years", "month", "week",
]);

/** Significant-token set used for event similarity. */
function tokenizeTitle(title: string): Set<string> {
  const folded = foldTurkish(title.toLocaleLowerCase("tr-TR"));
  const words = folded.match(/[a-z0-9]+/g) ?? [];

  return new Set(
    words.filter(
      (word) =>
        (word.length >= 4 || /^\d{3,}$/.test(word)) &&
        !CLUSTER_STOPWORDS.has(word),
    ),
  );
}

/**
 * Document-frequency filter: tokens that appear in many items (template
 * words like "maçı", "saat", "kanalda", "deprem") carry no event signal and
 * would wrongly merge unrelated stories. Only rare tokens (df below the
 * limit) are used for similarity.
 */
function significantTokens(
  tokenSets: Set<string>[],
): Set<string>[] {
  const df = new Map<string, number>();

  for (const tokens of tokenSets) {
    for (const token of tokens) {
      df.set(token, (df.get(token) ?? 0) + 1);
    }
  }

  const limit = Math.max(3, Math.floor(tokenSets.length * 0.05));

  return tokenSets.map(
    (tokens) =>
      new Set([...tokens].filter((token) => (df.get(token) ?? 0) <= limit)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;

  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared += 1;
  }

  return shared / (a.size + b.size - shared);
}

type StagedItem = {
  id: string;
  title: string;
  content: string;
  sourceName: string;
  sourceUrl: string;
  imageUrl: string | null;
  fetchedAt: Date;
};

type Cluster = {
  items: StagedItem[];
  tokens: Set<string>;
};

/**
 * Greedy event clustering over rare-token sets. Two items belong to the
 * same event when their significant-token Jaccard similarity reaches the
 * threshold with at least 2 shared rare tokens.
 */
function clusterItems(items: StagedItem[]): Cluster[] {
  const rawSets = items.map((item) => tokenizeTitle(item.title));
  const tokenSets = significantTokens(rawSets);

  const clusters: Cluster[] = [];

  items.forEach((item, index) => {
    const tokens = tokenSets[index];

    if (tokens.size === 0) {
      clusters.push({ items: [item], tokens: new Set() });
      return;
    }

    let best: Cluster | null = null;
    let bestScore = 0;

    for (const cluster of clusters) {
      if (cluster.tokens.size === 0) continue;

      let shared = 0;
      for (const token of tokens) {
        if (cluster.tokens.has(token)) shared += 1;
      }
      if (shared < CLUSTER_MIN_SHARED_TOKENS) continue;

      const score = jaccard(tokens, cluster.tokens);

      if (score > bestScore) {
        bestScore = score;
        best = cluster;
      }
    }

    if (best && bestScore >= CLUSTER_SIMILARITY_THRESHOLD) {
      best.items.push(item);
      for (const token of tokens) best.tokens.add(token);
    } else {
      clusters.push({ items: [item], tokens: new Set(tokens) });
    }
  });

  return clusters;
}

// ─── Stage 3: Persona synthesis + pre-publish review ────────────────────────

/** Kategoriye özel yazar kişilikleri — "farklı yazarlar yazmış gibi". */
const WRITER_PERSONAS: Record<Category, string> = {
  Gündem:
    "Tecrübeli bir ana haberler muhabirisin: sakin ve ölçülü bir üslubun var; en önemli bilgiyi ilk cümleye koyar, okuru telaşa sürüklemeden olayın öncelik sırasını net biçimde aktarırsın.",
  Teknoloji:
    "Meraklı bir teknoloji editörüsün: net ve anlaşılır yazarsın; teknik jargonu ilk geçtiği yerde kısaça açıklar, okuru akıllı sayar ama küçümsemezsin.",
  "Yapay Zekâ":
    "Yapay zekâ editörüsün: model sürümleri, şirket hamleleri ve düzenlemeleri somut biçimde aktarırsın; hype'a kapılmaz, bir gelişmenin gerçekte neyi değiştirdiğini sade dille anlatırsın.",
  Bilim:
    "Titiz bir bilim yazarısın: yöntem ve kaynak hassasiyetine önem verirsin; kesinlik iddiasında bulunmaz, 'bilim insanlarına göre', 'araştırmanın bulgularına göre' gibi temkinli bir dil kullanırsın.",
  Spor:
    "Enerjik bir spor yazarısın: maçın ritmini metne taşırsın; skor ve durum bilgisini hızlı verirken insan hikâyelerine de yer verirsin.",
  Ekonomi:
    "Sayı odaklı bir ekonomi muhabirisin: net veri ve rakamları ön plana çıkarırsın; haberin okurun cebine ve sektöre olası etkisini kısaca analiz edersin.",
  Siyaset:
    "Tarafsız bir siyaset editörüsün: dengeli ve tarafgirlikten uzak yazarsın; her iddiayı kimin söylediğiyle ve kaynağıyla aktarırsın.",
  Dünya:
    "Deneyimli bir dış haberler editörüsün: olaya tarihsel ve bölgesel bağlam katar, gelişmenin yerel ve küresel etkisini okura gösterirsin.",
  Sağlık:
    "Dikkatli bir sağlık yazarısın: abartısız ve sakin bir dil kullanırsın; 'uzmanlar uyarıyor' gibi bilgilendirici ama korkutmayan bir üslup seçersin.",
  Kültür:
    "Kültür-sanat yazarısın: akıcı ve betimleyici bir dilin var; eseri ya da olayı sahnesiyle, rengiyle okurun gözünde canlandırırsın.",
  Diğer:
    "Genel bir haber editörüsün: sade, net ve anlaşılır yazarsın.",
};

/** Temel kurallar her kişilikte ortaktır; sistem prompt'u bunlara eklenir. */
function writerSystemPrompt(category: Category): string {
  const persona = WRITER_PERSONAS[category] ?? WRITER_PERSONAS["Diğer"];

  return `${persona}

Ortak kurallar (her yazar kişiliğinde geçerli):
- Haberi SADECE verilen makalelerdeki bilgilerden, kendi cümlelerinle ve özgün biçimde yaz; hiçbir kaynaktan cümleleri aynen kopyalama.
- Tarafsız ol: yorum katma, spekülasyon üretme; isim, sayı, tarih ve alıntıları kaynaktaki haliyle koru.
- Yanıtını SADECE geçerli JSON olarak ver; markdown çiti ekleme.`;
}

/**
 * Kümenin muhtemel kategorisi: kümedeki kaynakların RSS kayıt
 * kategorileri arasında çoğunluk oyu. Kişilik seçimi için kullanılır;
 * nihai kategori yine LLM çıktısından gelir.
 */
async function loadSourceCategories(): Promise<Map<string, Category>> {
  const sources = await prisma.rSSSource.findMany({
    select: { name: true, category: true },
  });

  const map = new Map<string, Category>();

  for (const source of sources) {
    map.set(source.name.trim(), normalizeCategory(source.category));
  }

  return map;
}

function clusterCategory(
  items: StagedItem[],
  sourceCategories: Map<string, Category>,
): Category {
  const counts = new Map<Category, number>();

  for (const item of items) {
    const category = sourceCategories.get(item.sourceName.trim());
    if (!category) continue;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  let best: Category = "Diğer";
  let bestCount = 0;

  for (const [category, count] of counts) {
    if (count > bestCount) {
      best = category;
      bestCount = count;
    }
  }

  return best;
}

type LlmAnswer = {
  isValidStory: boolean;
  title: string;
  summary: string;
  category: Category;
  detailedContent: string;
};

type ChatRequestBody = {
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  response_format?: { type: "json_object" };
};

async function requestCompletion(
  endpoint: string,
  apiKey: string,
  body: ChatRequestBody,
): Promise<Response> {
  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    cache: "no-store",
  });
}

function readMessageContent(payload: unknown): string {
  const choices = (payload as { choices?: unknown })?.choices;

  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("LLM response did not contain any choices.");
  }

  const message = (choices[0] as { message?: { content?: unknown } })?.message;
  const content = message?.content;

  if (typeof content === "string" && content.trim()) return content;

  if (Array.isArray(content)) {
    const combined = content
      .map((part) =>
        typeof part === "object" && part !== null && "text" in part
          ? String((part as { text?: unknown }).text ?? "")
          : "",
      )
      .join("")
      .trim();

    if (combined) return combined;
  }

  throw new Error("LLM response was empty.");
}

function parseBooleanFlag(value: unknown): boolean {
  return (
    value === true ||
    value === 1 ||
    value === "true" ||
    value === "True" ||
    value === "TRUE"
  );
}

/**
 * Geçmiş bağlam gerektiren haberlerde (dava, soruşturma, özgeçmiş) Google
 * Haberler arşivinden ÖNCEKİ gelişmeleri toplar. Haber metnine
 * "GEÇMİŞ BAĞLAM" olarak eklenir; LLM bunu kronoloji için kullanır.
 *
 * Yalnızca kamuya açık başlık + kaynak adı taşınır; kullanıcı verisi yok.
 */
async function fetchHistoricalContext(article: StagedItem): Promise<string> {
  const { detectTemporalContext } = await import("@/lib/research");
  const { fetchGoogleNewsHistory } = await import("@/lib/google-news");
  const { foldTurkish } = await import("@/lib/utils");

  const folded = foldTurkish(article.title);
  const needsHistory = /(dava|iddianame|sorusturma|gozalti|tutukla|hakim karsisinda|ilk kez|vefat|hayatini kaybetti)/.test(
    folded,
  );

  if (!needsHistory) return "";

  // Konu adı: başlığın ilk özel ad öbeği (ör. "Sadettin Saran").
  const subject = article.title
    .split(/[^\p{L}\p{N}]+/u)
    .slice(0, 3)
    .join(" ")
    .trim();

  if (subject.length < 4) return "";

  const notes: string[] = [];
  const items = await fetchGoogleNewsHistory(subject, notes);
  if (items.length === 0) return "";

  const cutoff = Date.now() - 60 * 60 * 1000; // son 1 saat "geçmiş" sayılmaz
  const past = items
    .filter((item) => item.publishedAt && item.publishedAt.getTime() < cutoff)
    .slice(0, 5);

  if (past.length === 0) return "";

  return past
    .map(
      (item, index) =>
        `Geçmiş #${index + 1} — ${item.domain} (${item.publishedAt?.toISOString().slice(0, 10)})\n${item.title}`,
    )
    .join("\n\n");
}

function renderPrompt(
  template: string,
  articles: StagedItem[],
  historicalContext = "",
): string {
  const articleBlock = articles
    .map(
      (article, index) =>
        `Article #${index + 1} — Source: ${article.sourceName}\n` +
        `Title: ${article.title}\n` +
        `Content:\n${truncate(article.content, ARTICLE_CONTENT_LIMIT)}`,
    )
    .join("\n\n---\n\n");

  const historicalBlock = historicalContext
    ? `\n\nGEÇMİŞ BAĞLAM (önceki gelişmeler — yalnızca bağlam için, bugünkü olay değil):\n${historicalContext}`
    : "";

  return template
    .replaceAll("{articles}", articleBlock)
    .replaceAll("{sourceCount}", String(articles.length))
    .replaceAll("{historical}", historicalBlock);
}

async function synthesizeCluster(
  settings: SystemSettings,
  articles: StagedItem[],
  personaCategory: Category,
  historicalContext = "",
): Promise<LlmAnswer | null> {
  const endpoint = resolveChatCompletionsUrl(settings.providerUrl);
  const prompt = renderPrompt(
    settings.promptTemplate.trim() || DEFAULT_PROMPT_TEMPLATE,
    articles,
    historicalContext,
  );

  const baseBody: ChatRequestBody = {
    model: settings.modelName,
    messages: [
      {
        role: "system",
        content: writerSystemPrompt(personaCategory),
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
  };

  let response = await requestCompletion(endpoint, settings.apiKey, baseBody);

  // Some OpenAI-compatible providers do not implement response_format.
  if (!response.ok && [400, 404, 422].includes(response.status)) {
    await response.text();
    const fallbackBody: ChatRequestBody = {
      model: baseBody.model,
      messages: baseBody.messages,
    };
    response = await requestCompletion(endpoint, settings.apiKey, fallbackBody);
  }

  if (!response.ok) {
    const details = truncate((await response.text()).replace(/\s+/g, " "), 300);
    throw new Error(`LLM HTTP ${response.status}${details ? `: ${details}` : ""}`);
  }

  const payload = (await response.json()) as unknown;

  // FAZ 5.4 — token kullanımını kaydet (maliyet görünürlüğü + bütçe).
  const usage = extractUsage(payload);
  void recordTokenUsage({
    model: settings.modelName,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    kind: "synthesis",
  });

  const raw = readMessageContent(payload);
  const parsed = JSON.parse(extractJsonObject(raw)) as {
    isValidStory?: unknown;
    title?: unknown;
    summary?: unknown;
    category?: unknown;
    detailedContent?: unknown;
  };

  if (!parseBooleanFlag(parsed.isValidStory)) {
    return null;
  }

  const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
  const summary =
    typeof parsed.summary === "string" ? parsed.summary.trim() : "";

  if (!title || !summary) {
    throw new Error("LLM response did not include a title and summary.");
  }

  const detailedContent =
    typeof parsed.detailedContent === "string"
      ? parsed.detailedContent.trim()
      : "";

  return {
    isValidStory: true,
    title: truncate(title, 300),
    summary: truncate(summary, 600),
    category: normalizeCategory(parsed.category),
    detailedContent: truncate(detailedContent, 10_000),
  };
}

/** Yapılandırılmış audit kaydı (JSON log — podcast.ts/x-studio.ts deseni). */
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

/**
 * pendingReview deposu: denetçiye ulaşılamayan (ağ/5xx/timeout) taslaklar
 * küme anahtarıyla (ham öğe id'lerinin sıralı karması) bellekte tutulur;
 * ham öğeler işlenmemiş bırakıldığı için bir sonraki döngüde YENİDEN
 * sentezlenmeden yalnızca denetim yeniden denenir.
 */
type PendingStory = {
  answer: LlmAnswer;
  sourceNames: string[];
  imageUrl: string | null;
  attempts: number;
  createdAt: number;
};

const globalForPending = globalThis as unknown as {
  newsPendingReviews?: Map<string, PendingStory>;
};

/**
 * Kaynak kartı için meta veri üretir: her kaynak için ilk görülen
 * makale URL'si ve alınma saati. Aynı kaynaktan gelen tekrarlar atlanır.
 */

/**
 * FAZ 1.5 — Kümenin kaynak metinlerinden deterministik içerik parmak izi.
 * Aynı ham içerikler tekrar geldiğinde (RSS gecikmesi, yeniden tarama)
 * LLM çağrısı yapılmadan atlanır.
 */
function hashClusterContent(items: { sourceUrl: string; content: string }[]): string {
  const payload = [...items]
    .map((item) => `${item.sourceUrl}::${item.content.length}::${item.content.slice(0, 400)}`)
    .sort()
    .join("|");

  return createHash("sha256").update(payload).digest("hex");
}

/**
 * FAZ 1.4 — Bağımsız kaynak sayısı.
 *
 * `sourcesCount` ham kayıt sayısıdır: aynı medya grubuna ait iki yayın
 * (ör. NTV + CNBC-e) tek ses sayılır. Rozetler bu değeri kullanır.
 */
function countIndependentSources(names: string[]): number {
  const groups: [string, string[]][] = [
    ["demiroren", ["hürriyet", "hurriyet", "milliyet", "cnn türk", "cnnturk", "posta"]],
    ["dogus", ["ntv", "cnbc"]],
    ["turkuvaz", ["sabah", "atv", "a haber", "a-haber"]],
    ["anadolu", ["anadolu", "aa"]],
    ["trt", ["trt"]],
    ["bbc", ["bbc"]],
    ["dunya", ["dünya", "dunya"]],
  ];
  const seen = new Set<string>();

  for (const raw of names) {
    const foldedName = normalizeCategoryKey(raw);
    let group = foldedName;

    for (const [key, members] of groups) {
      if (members.some((member) => foldedName.includes(normalizeCategoryKey(member)))) {
        group = key;
        break;
      }
    }

    seen.add(group);
  }

  return Math.max(1, seen.size);
}

function normalizeCategoryKey(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-z0-9şğıöçü ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSourcesMeta(
  items: {
    sourceName: string;
    sourceUrl: string;
    title: string;
    fetchedAt?: Date;
  }[],
): {
  name: string;
  url: string | null;
  fetchedAt: string | null;
  headline: string;
}[] {
  const seen = new Map<
    string,
    {
      name: string;
      url: string | null;
      fetchedAt: string | null;
      headline: string;
    }
  >();

  for (const item of items) {
    if (seen.has(item.sourceName)) continue;

    seen.set(item.sourceName, {
      name: item.sourceName,
      url: item.sourceUrl || null,
      fetchedAt: item.fetchedAt ? item.fetchedAt.toISOString() : null,
      headline: item.title,
    });
  }

  return [...seen.values()];
}

function pendingStore(): Map<string, PendingStory> {
  if (!globalForPending.newsPendingReviews) {
    globalForPending.newsPendingReviews = new Map();
  }
  return globalForPending.newsPendingReviews;
}

async function runSynthesis(
  settings: SystemSettings,
  result: ProcessResult,
): Promise<void> {
  const cutoff = new Date(Date.now() - CLUSTER_WINDOW_MS);

  const rows = await prisma.rawFeedItem.findMany({
    where: { fetchedAt: { gte: cutoff }, processedAt: null },
    orderBy: { fetchedAt: "asc" },
  });

  if (rows.length === 0) return;

  const staged: StagedItem[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    imageUrl: row.imageUrl,
    fetchedAt: row.fetchedAt,
  }));

  const clusters = clusterItems(staged);
  result.clusters = clusters.length;

  // Doğrulama şartı KALDIRILDI: her küme (tek kaynaklı dahil) haber olur.
  const queue = clusters.map((cluster) => {
    const sourceNames = [
      ...new Set(cluster.items.map((item) => item.sourceName)),
    ];
    return { cluster, sourceNames };
  });

  // pendingReview davranışı: doğrulama yerine denetçi belirler.
  result.verified = queue.length;

  const sourceCategories = await loadSourceCategories();

  // Bellek hijyeni: süresi dolan bekleyen taslaklar atılır (ham öğeler de
  // 2 saat sonra zaten purge ediliyor).
  const pendingCutoff = Date.now() - PENDING_TTL_MS;
  for (const [key, entry] of pendingStore()) {
    if (entry.createdAt < pendingCutoff) pendingStore().delete(key);
  }

  let synthesized = 0;

  const worker = async () => {
    for (;;) {
      const entry = queue.shift();
      if (!entry) return;

      // FAZ 5.4 — Günlük bütçe %100'e ulaştıysa yeni sentez yapılmaz.
      const budget = await canSpendTokens();
      if (budget.state === "blocked") {
        result.errors.push(
          `Günlük token bütçesi doldu (${budget.used}/${budget.budget}); üretim duraklatıldı.`,
        );
        auditLog("story.budget-blocked", {
          used: budget.used,
          budget: budget.budget,
        });
        return;
      }
      if (budget.state === "warn") {
        auditLog("story.budget-warn", {
          used: budget.used,
          budget: budget.budget,
          ratio: budget.ratio,
        });
      }

      const { cluster, sourceNames } = entry;
      const articles = cluster.items.slice(0, MAX_ARTICLES_PER_PROMPT);

      // GEÇMİŞ BAĞLAMI: dava/soruşturma/vefat gibi olaylarda haberin
      // öncesindeki gelişmeler de araştırılır (yoksa haber yalnızca
      // "bugün ne oldu"yu anlatır, geçmişi boş bırakır).
      let historicalContext = "";
      try {
        historicalContext = await fetchHistoricalContext(cluster.items[0]);
      } catch {
        // Geçmiş bağlam alınamazsa haber yine üretilir.
      }
      const rawIds = cluster.items.map((item) => item.id);
      const clusterKey = md5([...rawIds].sort().join("|"));
      const pending = pendingStore().get(clusterKey) ?? null;

      // Denetçi arka arkaya MAX_REVIEW_ATTEMPTS kez ulaşılamadıysa haber
      // yayınlamadan atlanır (bir daha denenmez).
      if (pending && pending.attempts >= MAX_REVIEW_ATTEMPTS) {
        await prisma.rawFeedItem.updateMany({
          where: { id: { in: rawIds } },
          data: { processedAt: new Date() },
        });
        pendingStore().delete(clusterKey);
        result.failed += 1;
        result.errors.push(
          `${sourceNames.join(", ")}: denetçi ${MAX_REVIEW_ATTEMPTS} kez ulaşılamadı, haber atlandı`,
        );
        auditLog("story.skipped", {
          title: pending.answer.title,
          attempts: pending.attempts,
          reason: "denetçi sürekli ulaşılamaz",
        });
        continue;
      }

      try {
        let answer = pending?.answer ?? null;

        if (!answer) {
          // Döngü başına sentez limiti: kalan kümeler sonraki döngüde.
          if (synthesized >= MAX_SYNTHESIS_PER_CYCLE) continue;
          synthesized += 1;

          const personaCategory = clusterCategory(cluster.items, sourceCategories);
          answer = await synthesizeCluster(settings, articles, personaCategory, historicalContext);

          if (!answer) {
            result.rejected += 1;
            await prisma.rawFeedItem.updateMany({
              where: { id: { in: rawIds } },
              data: { processedAt: new Date() },
            });
            continue;
          }
        }

        // RSS görselleri kullanılmaz (telif) — AI illüstrasyon, haber
        // oluşturulduktan sonra arka planda üretilir.
        const imageUrl: string | null = null;

        // Yayın öncesi denetim: NewsItem oluşturmadan ÖNCE.
        let verdict: ReviewVerdict;
        try {
          verdict = await reviewStory({
            title: answer.title,
            summary: answer.summary,
            content: answer.detailedContent || answer.summary,
            sourceTitles: articles.map((article) => article.title),
            sourceSnippets: articles.map((article) => article.content),
          });
        } catch (error) {
          // Denetçi ÇAĞRILAMADI (ağ/5xx/timeout) → haber pendingReview
          // olarak bekletilir, bir sonraki döngüde tekrar denenir.
          const attempts = (pending?.attempts ?? 0) + 1;
          pendingStore().set(clusterKey, {
            answer,
            sourceNames,
            imageUrl,
            attempts,
            createdAt: Date.now(),
          });
          result.failed += 1;
          result.errors.push(
            `${sourceNames.join(", ")}: ${truncate(getErrorMessage(error), 240)}`,
          );
          auditLog("story.review-pending", {
            title: answer.title,
            attempts,
            error: truncate(getErrorMessage(error), 240),
          });
          continue;
        }

        if (!verdict.approved) {
          // Reddedildi → NewsItem OLUŞTURULMAZ, ham öğeler işlendi sayılır.
          await prisma.rawFeedItem.updateMany({
            where: { id: { in: rawIds } },
            data: { processedAt: new Date() },
          });
          pendingStore().delete(clusterKey);
          result.rejected += 1;
          auditLog("story.rejected", {
            title: answer.title,
            reason: verdict.reason,
          });
          continue;
        }

        // ── FAZ 1.1 — DOĞRULAMA KAPISI ───────────────────────────────────
        // Özetteki sayı/tarih/isimler kaynak metinlerle karşılaştırılır.
        // Kaynakta olmayan bir olgu varsa haber YAYINA ALINMAZ.
        const factCheck = runFactCheck({
          title: answer.title,
          summary: answer.summary,
          body: answer.detailedContent,
          sources: [
            ...articles.map((article) => `${article.title} ${article.content}`),
            historicalContext,
          ],
          // Kategori ve site adı kaynak metinde geçmese de olgudur.
          ignore: [answer.category, "TCFH News"],
        });

        if (!factCheck.publishable) {
          await prisma.rawFeedItem.updateMany({
            where: { id: { in: rawIds } },
            data: { processedAt: new Date() },
          });
          pendingStore().delete(clusterKey);
          result.rejected += 1;
          result.errors.push(
            `${sourceNames.join(", ")}: doğrulama başarısız (${factCheck.summary})`,
          );
          auditLog("story.factcheck-failed", {
            title: answer.title,
            violations: factCheck.violations.slice(0, 5),
            checked: factCheck.checked,
          });
          continue;
        }

        // ── FAZ 1.5 — ÖNBELLEK ───────────────────────────────────────────
        // Aynı kaynak metinlerinden aynı haber ikinci kez sentezlenmesin.
        const contentHash = hashClusterContent(cluster.items);

        const duplicate = await prisma.newsItem.findFirst({
          where: { contentHash, removedAt: null },
          select: { id: true, slug: true },
        });

        if (duplicate) {
          await prisma.rawFeedItem.updateMany({
            where: { id: { in: rawIds } },
            data: { processedAt: new Date() },
          });
          pendingStore().delete(clusterKey);
          result.published += 0; // tekrar sayılmaz
          auditLog("story.cache-hit", {
            title: answer.title,
            existingSlug: duplicate.slug,
            contentHash: contentHash.slice(0, 12),
          });
          continue;
        }

        // İŞ 3 — Kategori ve etiketler LLM'den değil sınıflandırıcıdan gelir.
        const classification = classifyArticle({
          title: answer.title,
          spot: answer.summary,
          body: answer.detailedContent ?? undefined,
        });

        const publishedItem = await prisma.newsItem.create({
          data: {
            // Yeni URL şeması: /haber/<slug> (en fazla 6 kelime).
            slug: await uniqueNewsSlug(answer.title),
            title: answer.title,
            summary: answer.summary,
            detailedContent: answer.detailedContent || null,
            // Kategori ARTIK LLM'den alınmıyor: deterministik sınıflandırıcı
            // başlık + özet + gövdeyi puanlıyor (İŞ 3). Belirsizlik → "Diğer".
            category: classification.primary === FALLBACK_CATEGORY
              ? answer.category
              : classification.primary,
            tags: JSON.stringify(classification.tags),
            categoryScores: JSON.stringify(classification.scores),
            classifiedAt: new Date(),
            city: detectCity(answer.title, answer.summary),
            sourcesCount: sourceNames.length,
            sourcesList: JSON.stringify(sourceNames),
            sourcesMeta: JSON.stringify(
              buildSourcesMeta(cluster.items),
            ),
            imageUrl,
            readingMinutes: readingTimeMinutes(
              `${answer.title} ${answer.summary} ${answer.detailedContent ?? ""}`,
            ),
            // ── FAZ 1: güven alanları ────────────────────────────────────
            aiGenerated: true,
            verifiedSourceCount: countIndependentSources(sourceNames),
            contentHash,
            factCheckStatus: factCheck.status,
            factCheckNotes: factCheck.summary,
          },
        });

        // Telifsiz AI görseli: gösterim /api/news/{id}/image ucundan yapılır;
        // üretim (Pollinations → Cloudflare → SVG zinciri) arka planda kuyruklanır.
        await prisma.newsItem.update({
          where: { id: publishedItem.id },
          data: { imageUrl: `/api/news/${publishedItem.id}/image` },
        });

        try {
          void queueNewsImage(
            publishedItem.id,
            publishedItem.title,
            publishedItem.category,
          );
        } catch {
          // Görsel üretim hatası haber yayınını asla etkilemesin.
        }

        // PWA otomatik bildirim: fire-and-forget — döngüyü yavaşlatmasın.
        // maybeAutoPush asla reject olmaz; yine de korumalı çağrılır.
        try {
          void maybeAutoPush({
            id: publishedItem.id,
            title: publishedItem.title,
            category: publishedItem.category,
            sourcesCount: publishedItem.sourcesCount,
          });
        } catch {
          // Bildirim hatası haber yayınını asla etkilemesin.
        }

        await prisma.rawFeedItem.updateMany({
          where: { id: { in: rawIds } },
          data: { processedAt: new Date() },
        });

        pendingStore().delete(clusterKey);
        result.published += 1;
      } catch (error) {
        result.failed += 1;
        result.errors.push(
          `${sourceNames.join(", ")}: ${truncate(getErrorMessage(error), 240)}`,
        );
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(LLM_CONCURRENCY, queue.length) }, () =>
      worker(),
    ),
  );
}

// ─── Stage 4: Cleanup ────────────────────────────────────────────────────────

async function purgeRawItems(result: ProcessResult): Promise<void> {
  const cutoff = new Date(Date.now() - RAW_RETENTION_MS);

  const purged = await prisma.rawFeedItem.deleteMany({
    where: { fetchedAt: { lt: cutoff } },
  });

  result.purged = purged.count;
}

// ─── Orchestration ───────────────────────────────────────────────────────────

/** Runs the full cycle pipeline: stage → cluster → synthesize → review → purge. */
export async function processFeeds(): Promise<ProcessResult> {
  const settings = await getSettings();

  if (
    !settings.providerUrl.trim() ||
    !settings.apiKey.trim() ||
    !settings.modelName.trim()
  ) {
    throw new LlmNotConfiguredError();
  }

  const result: ProcessResult = {
    sources: 0,
    fetched: 0,
    staged: 0,
    clusters: 0,
    verified: 0,
    published: 0,
    rejected: 0,
    purged: 0,
    failed: 0,
    errors: [],
  };

  await stageRawItems(result);
  await runSynthesis(settings, result);
  await purgeRawItems(result);

  return {
    ...result,
    errors: result.errors.slice(-10),
  };
}

/** Helper for the feed API: parses the stored sourcesList JSON column. */
export function parseSourcesList(value: string | null | undefined): string[] {
  return parseJsonArray(value);
}
