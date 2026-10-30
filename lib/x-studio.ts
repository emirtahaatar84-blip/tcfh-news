import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { isAdminAuthorized } from "@/lib/auth";
import {
  extractJsonObject,
  getErrorMessage,
  parseJsonArray,
  resolveChatCompletionsUrl,
  truncate,
} from "@/lib/utils";

/**
 * X Stüdyo çekirdeği: post üretim kuyruğu + katı AI kuralları.
 *
 * Akış: POST /generate → arka planda LLM işi başlatır ve jobId döner;
 * istemci GET /generate/:jobId ile poll eder (senkron AI çağrısı YOK).
 * Otomatik X API gönderimi YOKTUR — kullanıcı panoya kopyalayıp manuel paylaşır.
 */

// ─── Zod şemaları (endpoint'lerle paylaşılır) ────────────────────────────────

export const generateRequestSchema = z.object({
  articleIds: z.array(z.string().regex(/^[a-zA-Z0-9]{5,40}$/)).min(1).max(5),
  styleSlug: z.string().regex(/^[a-z0-9-]{2,30}$/),
  tone: z.enum(["tarafsiz", "sicak", "ciddi"]).default("tarafsiz"),
  length: z.enum(["kisa", "orta", "uzun"]).default("orta"),
  emojiLevel: z.number().int().min(0).max(5).default(2),
  withSource: z.boolean().default(true),
  withBadge: z.boolean().default(true),
});

export const draftCreateSchema = z.object({
  articleId: z.string().regex(/^[a-zA-Z0-9]{5,40}$/),
  styleId: z.string().regex(/^[a-zA-Z0-9_]{5,40}$/),
  text: z.string().min(1).max(1000),
  hashtags: z.array(z.string().regex(/^#[\p{L}\p{N}_]{2,30}$/u)).max(3).default([]),
});

export const draftPatchSchema = z.object({
  status: z.enum(["draft", "copied", "published", "rejected"]),
  externalUrl: z.string().url().optional(),
});

export type GenerateRequest = z.infer<typeof generateRequestSchema>;

// ─── Üretim işi (kuyruk + polling) ───────────────────────────────────────────

export type XVariant = {
  text: string;
  charCount: number;
  hashtags: string[];
};

export type XArticleResult = {
  articleId: string;
  title: string;
  variants: XVariant[];
};

export type XGenerateJob = {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  results: XArticleResult[];
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
};

const globalForJobs = globalThis as unknown as {
  xStudioJobs?: Map<string, XGenerateJob>;
};

function jobStore(): Map<string, XGenerateJob> {
  if (!globalForJobs.xStudioJobs) {
    globalForJobs.xStudioJobs = new Map();
  }
  return globalForJobs.xStudioJobs;
}

/** Boş iş kaydını oluşturur ve arka planda üretimi başlatır. */
export function startGenerateJob(
  request: GenerateRequest,
  actor: string,
): string {
  const id = `xjob_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const job: XGenerateJob = {
    id,
    status: "queued",
    results: [],
    error: null,
    createdAt: new Date().toISOString(),
    finishedAt: null,
  };

  jobStore().set(id, job);

  // 10 dakikadan eski işleri temizle (bellek hijyeni).
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [key, value] of jobStore()) {
    if (new Date(value.createdAt).getTime() < cutoff) jobStore().delete(key);
  }

  auditLog("x-studio.generate.queued", actor, {
    articleIds: request.articleIds,
    styleSlug: request.styleSlug,
  });

  void runGenerateJob(job, request, actor);

  return id;
}

export function getGenerateJob(id: string): XGenerateJob | null {
  return jobStore().get(id) ?? null;
}

// ─── Rate limit: kullanıcı başına dakikada 10 üretim ────────────────────────

const globalForLimit = globalThis as unknown as {
  xStudioLimits?: Map<string, { count: number; windowStart: number }>;
};

export function checkRateLimit(key: string, limit = 10): boolean {
  if (!globalForLimit.xStudioLimits) {
    globalForLimit.xStudioLimits = new Map();
  }

  const now = Date.now();
  const entry = globalForLimit.xStudioLimits.get(key);

  if (!entry || now - entry.windowStart > 60_000) {
    globalForLimit.xStudioLimits.set(key, { count: 1, windowStart: now });
    return true;
  }

  entry.count += 1;
  return entry.count <= limit;
}

/** İsteğin sahibini (Basic Auth kullanıcısı) belirler — rate limit anahtarı. */
export function actorFromRequest(request: Request): string {
  return process.env.ADMIN_USER || "admin";
}

/** Yönetim paneli erişim kontrolü: sahip oturumu veya Basic Auth yedeği. */
export async function isStudioAuthorized(request: Request): Promise<boolean> {
  return isAdminAuthorized(request);
}

// ─── Yapılandırılmış audit kaydı (JSON log) ─────────────────────────────────

export function auditLog(action: string, actor: string, meta: object): void {
  console.log(
    JSON.stringify({
      channel: "audit",
      action,
      actor,
      at: new Date().toISOString(),
      ...meta,
    }),
  );
}

// ─── AI üretim kuralları ─────────────────────────────────────────────────────

const TONE_LABELS: Record<string, string> = {
  tarafsiz: "tamamen tarafsız, bildirimsel",
  sicak: "sıcak ve akıcı, abartısız",
  ciddi: "ciddi ve resmi",
};

const LENGTH_BUDGETS: Record<string, number> = {
  kisa: 180,
  orta: 230,
  uzun: 278,
};

/** Emoji seviyesi → maksimum emoji sayısı tablosu (0-5). */
const EMOJI_MAX = [0, 1, 2, 3, 4, 5];

/**
 * Global sistem kuralları — her stilde, her üretimde birebir uygulanır.
 * Bunlar halüsinasyon ve telif riskini sıfırlamak için tasarlanmıştır.
 */
function globalRules(emojiLevel: number, withSource: boolean, withBadge: boolean): string {
  return `SENSİN DEĞİL, KURALLAR ÖNEMLİ — bu kuralların hiçbiri ihlal edilemez:

1. SADECE verilen haber metnindeki bilgiyi kullan. Yeni isim, sayı, tarih, alıntı UYDURMA. Metinde yoksa yazma.
2. Tüm özel isimler, sayılar, kurum adları BİREBİR korunur (kısaltma/yazım değişikliği yok).
3. Haberin "spekülasyon" kısmı ile "doğrulanmış" kısmını ayır; kesinlik iddiası taşıyan ifadeleri doğrulama durumuna göre yumuşat ("temasa geçildi" ≠ "anlaşıldı").
4. Post 280 karakteri GEÇMEZ. Link ve rozet dahil toplam karakter bütçesine dikkat et.
5. Hashtag: en fazla 3 tane. 1 kategori çapası + 1 konu + gerekiyorsa 1 kurum. YALNIZCA sana verilen hashtag havuzundan seç; havuzda uygun yoksa hashtag önerme (boş bırak).
6. Reklam dili, tıklam tuzağı (clickbait), abartılı vaat YOK. "İşte", "şaşırtan", "duyan dondu" gibi ifadeler yasak.
7. Emoji seviyesi ${emojiLevel}/5: toplamda en fazla ${EMOJI_MAX[emojiLevel] ?? emojiLevel} emoji kullanılır. Seviye 0 ise emoji KULLANMA.
${withBadge ? "8. Doğrulama rozeti açıksa sona '✓ {N} Kaynaktan Doğrulandı' formatında rozet ekle (verilen kaynak sayısını kullan)." : "8. Doğrulama rozeti KAPALI: rozet ekleme."}
${withSource ? "9. Kaynak linki açıksa sona verilen linki ekle; link karakter bütçesinden düşülür." : "9. Kaynak linki KAPALI: link ekleme."}

Yanıt: SADECE geçerli JSON, markdown çiti olmadan:
{"variants": [{"text": "post metni (hashtag'ler metnin sonunda)", "hashtags": ["#etiket"]}]}
Tam olarak 3 farklı varyant üret. Her varyant farklı yapı/vurguda olsun ama kuralların hepsine uysun.`;
}

/** Tek makale için 3 varyant üretir. */
async function generateForArticle(
  request: GenerateRequest,
  style: { slug: string; systemPrompt: string },
  article: { id: string; title: string; summary: string; detailedContent: string | null; category: string; sourcesCount: number },
  siteUrl: string,
  pool: string[],
): Promise<XVariant[]> {
  const settings = await getSettings();

  if (!settings.apiKey.trim() || !settings.providerUrl.trim()) {
    throw new Error("LLM sağlayıcısı yapılandırılmamış.");
  }

  const link = `${siteUrl}/tr/news/${article.id}`;
  const userPrompt = `HABER:
Başlık: ${article.title}
Özet: ${article.summary}
Detay: ${truncate(article.detailedContent ?? article.summary, 1500)}
Kategori: ${article.category}
Doğrulayan kaynak sayısı: ${article.sourcesCount}
Paylaşım linki: ${link}

PARAMETRELER:
Ton: ${TONE_LABELS[request.tone]}
Uzunluk hedefi: ~${LENGTH_BUDGETS[request.length]} karakter (280 sert üst sınır)
Stil: ${style.slug}
${request.withSource ? `Link sonda yer alacak: ${link} (link ${link.length} karakter yer tutar)` : "Link kullanılmayacak."}

HASHTAG HAVUZU (yalnızca bunlardan seç):
${pool.length > 0 ? pool.join(" ") : "(havuz boş — hashtag kullanma)"}`;

  const response = await fetch(resolveChatCompletionsUrl(settings.providerUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.modelName,
      messages: [
        {
          role: "system",
          content: `${style.systemPrompt}\n\n${globalRules(request.emojiLevel, request.withSource, request.withBadge)}`,
        },
        { role: "user", content: userPrompt },
      ],
      // Model (qwen3.8-flash-next) "thinking" modunda çok kısıtlı promptlarda
      // dakikalarca reasoning yapıp zaman aşımına düşüyor. Düşünme modunu
      // kapatınca aynı prompt ~13 saniyede net JSON döndürüyor.
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal: AbortSignal.timeout(120_000),
    cache: "no-store",
  });

  if (!response.ok) {
    const details = truncate((await response.text()).replace(/\s+/g, " "), 200);
    throw new Error(`LLM HTTP ${response.status}${details ? `: ${details}` : ""}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };

  const raw = payload.choices?.[0]?.message?.content;
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("LLM yanıtı boş döndü.");
  }

  const parsed = JSON.parse(extractJsonObject(raw)) as {
    variants?: Array<{ text?: unknown; hashtags?: unknown }>;
  };

  const list = Array.isArray(parsed.variants) ? parsed.variants.slice(0, 3) : [];

  const variants: XVariant[] = list
    .map((item) => {
      const text = typeof item.text === "string" ? item.text.trim() : "";
      const hashtags = Array.isArray(item.hashtags)
        ? item.hashtags
            .filter((tag): tag is string => typeof tag === "string")
            .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
            .filter((tag) => pool.includes(tag) || pool.includes(tag.slice(1)))
            .slice(0, 3)
        : [];
      return { text, charCount: text.length, hashtags };
    })
    .filter((item) => item.text.length > 0);

  if (variants.length === 0) {
    throw new Error("LLM geçerli varyant döndürmedi.");
  }

  return variants;
}

async function runGenerateJob(
  job: XGenerateJob,
  request: GenerateRequest,
  actor: string,
): Promise<void> {
  job.status = "running";

  try {
    const style = await prisma.xStyle.findUnique({ where: { slug: request.styleSlug } });
    if (!style) throw new Error(`Stil bulunamadı: ${request.styleSlug}`);

    const articles = await prisma.newsItem.findMany({
      where: { id: { in: request.articleIds }, removedAt: null },
    });

    if (articles.length === 0) throw new Error("Haber bulunamadı.");

    // Hashtag havuzu: kategori eşleşmileri + yüksek ağırlıklılar.
    const pool = await prisma.hashTagPool.findMany({
      orderBy: [{ weight: "desc" }],
      take: 25,
    });
    const poolTags = pool.map((row) => row.tag);

    const siteUrl = (process.env.SITE_URL || "http://localhost:3000").replace(/\/+$/, "");

    for (const article of articles) {
      const variants = await generateForArticle(
        request,
        style,
        article,
        siteUrl,
        poolTags,
      );

      job.results.push({
        articleId: article.id,
        title: article.title,
        variants,
      });
    }

    job.status = "done";
    job.finishedAt = new Date().toISOString();

    // Havuz etiketlerinin kullanım zamanını güncelle.
    const usedTags = new Set(job.results.flatMap((r) => r.variants.flatMap((v) => v.hashtags.map((h) => h.replace("#", "")))));
    if (usedTags.size > 0) {
      await prisma.hashTagPool.updateMany({
        where: { tag: { in: [...usedTags] } },
        data: { lastUsedAt: new Date() },
      });
    }

    auditLog("x-studio.generate.done", actor, {
      jobId: job.id,
      articles: articles.length,
      variants: job.results.reduce((sum, r) => sum + r.variants.length, 0),
    });
  } catch (error) {
    job.status = "failed";
    job.error = getErrorMessage(error);
    job.finishedAt = new Date().toISOString();
    auditLog("x-studio.generate.failed", actor, {
      jobId: job.id,
      error: job.error,
    });
  }
}

/** Draft kaydından istemciye güvenli DTO üretir. */
export type XDraftDto = {
  id: string;
  articleId: string;
  articleTitle: string;
  styleName: string;
  text: string;
  hashtags: string[];
  charCount: number;
  status: string;
  copiedAt: string | null;
  publishedAt: string | null;
  externalUrl: string | null;
  createdAt: string;
};

export function serializeDraft(draft: {
  id: string;
  articleId: string;
  variants: string;
  hashtags: string;
  charCount: number;
  status: string;
  copiedAt: Date | null;
  publishedAt: Date | null;
  externalUrl: string | null;
  createdAt: Date;
  article?: { title: string } | null;
  style?: { name: string } | null;
}): XDraftDto {
  const texts = parseJsonArray(draft.variants);

  return {
    id: draft.id,
    articleId: draft.articleId,
    articleTitle: draft.article?.title ?? "",
    styleName: draft.style?.name ?? "",
    text: texts[0] ?? "",
    hashtags: parseJsonArray(draft.hashtags),
    charCount: draft.charCount,
    status: draft.status,
    copiedAt: draft.copiedAt?.toISOString() ?? null,
    publishedAt: draft.publishedAt?.toISOString() ?? null,
    externalUrl: draft.externalUrl,
    createdAt: draft.createdAt.toISOString(),
  };
}
