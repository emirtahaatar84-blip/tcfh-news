import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import {
  extractJsonObject,
  getErrorMessage,
  resolveChatCompletionsUrl,
  truncate,
} from "@/lib/utils";

/**
 * Saatlik yayın kalitesi denetçisi — gemma-4-31b (env AUDITOR_MODEL ile
 * ezilebilir). Son 48 saatte oluşturulmuş, henüz denetlenmemiş ve
 * kaldırılmamış haberleri tarar; her birine 1-10 arası kalite puanı verir
 * ve keep=false ise haberi YUMUŞAK kaldırır (removedBy="gemma-audit").
 *
 * Ayrıca owner'ın geri getirme (restore) işlemini sağlar.
 * LLM çağrı deseni lib/x-studio.ts ile aynı:
 * `chat_template_kwargs: { enable_thinking: false }` ZORUNLU.
 */

const AUDITOR_TIMEOUT_MS = 120_000;
const DEFAULT_AUDITOR_MODEL = "gemma-4-31b";

/** Döngü başına denetlenecek haber sayısı. */
const AUDIT_BATCH_LIMIT = 20;
/** Son kaç saatte oluşturulan haberler denetlenir. */
const AUDIT_WINDOW_HOURS = 48;

const AUDITOR_SYSTEM_PROMPT =
  "Saatlik yayın kalitesi denetçisisin. Haberi değerlendir: " +
  "(1) haber değeri ve kalite 1-10, (2) uydurma/hallüsinasyon belirtisi, " +
  "(3) çöp/tıklama tuzağı içerik. " +
  "ÖNEMLİ: Bugünün tarihi her zaman user mesajında verilir; kendi eğitim " +
  "bilgilerindeki son tarihten sonraki olaylar 'tarih hatası' DEĞİLDİR — " +
  "verilen güncel tarihi temel al. " +
  'Yanıt: {"keep": boolean, "score": number, "reason": "string"} — ' +
  "reason Türkçe ve kısa olsun.";

const verdictSchema = z.object({
  keep: z
    .union([z.boolean(), z.literal("true"), z.literal("false")])
    .transform((value) => value === true || value === "true"),
  score: z
    .number()
    .transform((value) => Math.max(1, Math.min(10, Math.round(value)))),
  reason: z.string().trim().min(1, "Gerekçe boş olamaz.").max(600, "Gerekçe çok uzun."),
});

type AuditorVerdict = z.infer<typeof verdictSchema>;

export type AuditSummary = {
  audited: number;
  kept: number;
  removed: number;
  failed: number;
  errors: string[];
};

export type AuditJobState = {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  lastResult: AuditSummary | null;
  error: string | null;
};

const globalForAuditJob = globalThis as unknown as {
  newsAuditJob?: AuditJobState;
};

export function getAuditJob(): AuditJobState {
  if (!globalForAuditJob.newsAuditJob) {
    globalForAuditJob.newsAuditJob = {
      running: false,
      startedAt: null,
      finishedAt: null,
      lastResult: null,
      error: null,
    };
  }

  return globalForAuditJob.newsAuditJob;
}

/**
 * Denetim işini arka planda başlatır ve hemen döner.
 * Bir iş zaten çalışıyorsa false döner.
 */
export function startAuditJob(): boolean {
  const job = getAuditJob();

  if (job.running) return false;

  job.running = true;
  job.startedAt = new Date().toISOString();
  job.finishedAt = null;
  job.lastResult = null;
  job.error = null;

  void auditPublishedNews()
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

function auditorModel(): string {
  return process.env.AUDITOR_MODEL?.trim() || DEFAULT_AUDITOR_MODEL;
}

async function callAuditor(item: {
  title: string;
  summary: string;
  detailedContent: string | null;
  sourcesCount?: number;
}): Promise<AuditorVerdict> {
  const settings = await getSettings();

  if (!settings.apiKey.trim() || !settings.providerUrl.trim()) {
    throw new Error("LLM sağlayıcısı yapılandırılmamış.");
  }

  const today = new Date().toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const userPrompt = `BUGÜNÜN TARİHİ: ${today}

HABER (yayında):
Başlık: ${item.title}
Özet: ${item.summary}
İçerik:
${truncate(item.detailedContent ?? item.summary, 4_000)}`;

  const response = await fetch(resolveChatCompletionsUrl(settings.providerUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: auditorModel(),
      messages: [
        { role: "system", content: AUDITOR_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      // Denetçi model thinking modunda askıda kalabilir — kapatmak ZORUNLU.
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal: AbortSignal.timeout(AUDITOR_TIMEOUT_MS),
    cache: "no-store",
  });

  if (!response.ok) {
    const details = truncate((await response.text()).replace(/\s+/g, " "), 200);
    throw new Error(`Denetçi LLM HTTP ${response.status}${details ? `: ${details}` : ""}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };

  const raw = payload.choices?.[0]?.message?.content;

  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("Denetçi LLM yanıtı boş döndü.");
  }

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(extractJsonObject(raw));
  } catch {
    throw new Error("Denetçi yanıtı geçerli JSON değildi.");
  }

  const parsed = verdictSchema.safeParse(parsedJson);

  if (!parsed.success) {
    throw new Error(
      `Denetçi çıktısı doğrulanamadı: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "(kök)"}: ${issue.message}`)
        .join("; ")
        .slice(0, 300)}`,
    );
  }

  return parsed.data;
}

/**
 * Saatlik kalite denetimi: son 48 saatte oluşturulan, kaldırılmamış ve
 * henüz denetlenmemiş (auditedAt=null) haberleri (döngü başına en fazla
 * AUDIT_BATCH_LIMIT adet) gemma-4-31b ile değerlendirir.
 *
 * keep=false  → yumuşak kaldırma: removedAt=now, removalReason=reason,
 *               removedBy="gemma-audit" (+ ses önbelleği temizlenir).
 * Her durumda → auditedAt=now, qualityScore=score kaydedilir.
 *
 * Tek haberin LLM hatası toplamı bozmaz: o haber auditedAt=null kalır ve
 * bir sonraki saatte tekrar denenir. Asla reject olmaz.
 */
export async function auditPublishedNews(): Promise<AuditSummary> {
  const summary: AuditSummary = {
    audited: 0,
    kept: 0,
    removed: 0,
    failed: 0,
    errors: [],
  };

  const cutoff = new Date(Date.now() - AUDIT_WINDOW_HOURS * 60 * 60 * 1000);

  const items = await prisma.newsItem.findMany({
    where: {
      createdAt: { gte: cutoff },
      removedAt: null,
      auditedAt: null,
    },
    // En yeni haberler öncelikli — öneri listesi (son 36 saat) hızla
    // dolması ve taze içerik erken denetlenmesi için.
    orderBy: { createdAt: "desc" },
    take: AUDIT_BATCH_LIMIT,
    // Tek kaynak denetimi için gerekli.
    select: {
      id: true,
      title: true,
      summary: true,
      detailedContent: true,
      sourcesCount: true,
    },
  });

  if (items.length === 0) return summary;

  for (const item of items) {
    try {
      const verdict = await callAuditor(item);

      const now = new Date();

      // TEK KAYNAK: bağımsız doğrulama yok → daha katı eşik. Rozetle
      // yayınlanır ama denetimden geçmezse kaldırılır.
      const singleSource = (item.sourcesCount ?? 0) < 2;
      const effectiveKeep = verdict.keep && (!singleSource || verdict.score >= 7);

      if (effectiveKeep) {
        await prisma.newsItem.update({
          where: { id: item.id },
          data: { auditedAt: now, qualityScore: verdict.score },
        });

        summary.kept += 1;
        auditLog("moderation.audit.kept", {
          newsId: item.id,
          score: verdict.score,
          reason: verdict.reason,
        });
      } else {
        await prisma.newsItem.update({
          where: { id: item.id },
          data: {
            auditedAt: now,
            qualityScore: verdict.score,
            removedAt: now,
            removalReason: truncate(verdict.reason, 500),
            removedBy: "gemma-audit",
          },
        });

        // Kaldırılan haberin sesli önbelleği de temizlenir.
        await prisma.ttsCache.deleteMany({
          where: { cacheKey: { startsWith: `news:${item.id}:` } },
        });

        summary.removed += 1;
        auditLog("moderation.audit.removed", {
          newsId: item.id,
          score: verdict.score,
          reason: verdict.reason,
          removedBy: "gemma-audit",
        });
      }

      summary.audited += 1;
    } catch (error) {
      // Bu haber denetilemedi — auditedAt null kalır, sonraki turda tekrar denenir.
      summary.failed += 1;
      summary.errors.push(
        `${item.title}: ${truncate(getErrorMessage(error), 240)}`,
      );
      auditLog("moderation.audit.item-failed", {
        newsId: item.id,
        error: truncate(getErrorMessage(error), 240),
      });
    }
  }

  auditLog("moderation.audit.cycle", {
    audited: summary.audited,
    kept: summary.kept,
    removed: summary.removed,
    failed: summary.failed,
  });

  return summary;
}

/**
 * Owner'ın geri getirme işlemi: yumuşak kaldırılmış bir haberin
 * removedAt/removalReason/removedBy alanlarını temizler.
 * Kaldırılmamış (removedAt=null) veya var olmayan haber için null döner.
 */
export async function restoreNewsItem(id: string) {
  const existing = await prisma.newsItem.findUnique({ where: { id } });

  if (!existing || existing.removedAt === null) return null;

  const restored = await prisma.newsItem.update({
    where: { id },
    data: {
      removedAt: null,
      removalReason: null,
      removedBy: null,
    },
  });

  auditLog("moderation.restored", { newsId: id });

  return restored;
}
