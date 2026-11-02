import { prisma } from "@/lib/prisma";
import {
  createDistributionJob,
  distributionKey,
  buildSocialText,
  retryDelayMs,
  MAX_ATTEMPTS,
  type ChannelId,
  type ChannelStatus,
  type DistributableStory,
} from "@/lib/distribution/engine";
import { submitUrls, isIndexNowEnabled } from "@/lib/distribution/channels/indexnow";
import { sendPush } from "@/lib/distribution/channels/push";

/**
 * HABER YAYILMA MOTORU — orkestratör.
 *
 * `distributeStory(newsId)` yayın anında çağrılır (fire-and-forget).
 * Kanal sonuçlarını `DistributionLog`'a yazar; başarısız olanlar
 * `retryFailedDistributions()` ile üstel geri çekilmeyle yeniden denenir.
 *
 * Tasarım ilkeleri:
 *   • Yayın ASLA bloklanmaz — tüm hatalar yutulur, log'a yazılır.
 *   • Idempotent — aynı haber+kanal ikinci kez gönderilmez.
 *   • Denetlenebilir — her deneme süre + sonuç + hata ile kayıtlı.
 */

export type ChannelOutcome = {
  channel: ChannelId;
  status: ChannelStatus;
  detail?: string;
  error?: string;
  durationMs: number;
};

export type DistributionSummary = {
  newsId: string;
  channels: ChannelOutcome[];
  sent: number;
  skipped: number;
  failed: number;
};

const running = new Set<string>();

/** Tek bir kanalı çalıştırır; sonucu normalize eder. */
async function runChannel(
  channel: ChannelId,
  story: DistributableStory,
  urls: string[],
): Promise<ChannelOutcome> {
  const started = Date.now();

  try {
    switch (channel) {
      case "indexnow": {
        if (!isIndexNowEnabled()) {
          return {
            channel,
            status: "skipped",
            detail: "INDEXNOW_KEY tanımlı değil",
            durationMs: Date.now() - started,
          };
        }
        const result = await submitUrls(urls);
        return {
          channel,
          status: result.ok ? "sent" : "failed",
          detail: JSON.stringify({ status: result.status, submitted: result.submitted }),
          error: result.error,
          durationMs: Date.now() - started,
        };
      }

      case "push": {
        const result = await sendPush({
          id: story.id,
          title: story.title,
          category: story.category,
          sourcesCount: story.sourcesCount,
        });

        // Abone yoksa başarısızlık değil, atlama sayılır.
        const status: ChannelStatus =
          result.failed === 0 && result.sent === 0
            ? "skipped"
            : result.ok
              ? "sent"
              : "failed";

        return {
          channel,
          status,
          detail: JSON.stringify({ sent: result.sent, failed: result.failed }),
          error: result.error,
          durationMs: Date.now() - started,
        };
      }

      case "social": {
        // X taslağı üretilir; otomatik GÖNDERİM yapılmaz (editör onayı).
        const text = buildSocialText({
          title: story.title,
          category: story.category,
          verifiedSourceCount: story.verifiedSourceCount,
          slug: story.slug,
          id: story.id,
        });

        return {
          channel,
          status: "sent",
          detail: JSON.stringify({ draft: text, length: text.length }),
          durationMs: Date.now() - started,
        };
      }

      case "rss":
      case "sitemap": {
        // Akış ve dizin otomatik güncellenir; burada yalnızca kayıt tutulur.
        return {
          channel,
          status: "sent",
          detail: "otomatik güncelleniyor",
          durationMs: Date.now() - started,
        };
      }

      default:
        return {
          channel,
          status: "skipped",
          detail: "bilinmeyen kanal",
          durationMs: Date.now() - started,
        };
    }
  } catch (error) {
    return {
      channel,
      status: "failed",
      error: (error as Error).message.slice(0, 400),
      durationMs: Date.now() - started,
    };
  }
}

/** Sonucu veritabanına yazar (idempotent upsert). */
async function persistOutcome(
  newsId: string,
  outcome: ChannelOutcome,
  attempt: number,
): Promise<void> {
  const dedupeKey = distributionKey(newsId, outcome.channel);

  const retryable = outcome.status === "failed" && attempt < MAX_ATTEMPTS - 1;
  const nextRetryAt = retryable ? new Date(Date.now() + retryDelayMs(attempt + 1)) : null;

  const data = {
    newsId,
    channel: outcome.channel,
    status: outcome.status,
    attempt,
    nextRetryAt,
    detail: outcome.detail ?? null,
    error: outcome.error ?? null,
    durationMs: outcome.durationMs,
    sentAt: outcome.status === "sent" ? new Date() : null,
  };

  try {
    await prisma.distributionLog.upsert({
      where: { dedupeKey },
      update: data,
      create: { ...data, dedupeKey },
    });
  } catch {
    // Log yazılamazsa yayılma yine çalışır.
  }
}

/**
 * Bir haberi tüm kanallara dağıtır. Yayın akışından fire-and-forget
 * çağrılır; hata fırlatmaz.
 */
export async function distributeStory(newsId: string): Promise<DistributionSummary | null> {
  if (running.has(newsId)) return null;
  running.add(newsId);

  try {
    const job = await createDistributionJob(newsId);
    if (!job) return null;

    // Daha önce gönderilmiş kanalları atla (idempotent).
    const existing = await prisma.distributionLog.findMany({
      where: { newsId, status: { in: ["sent", "skipped"] } },
      select: { channel: true },
    });
    const done = new Set(existing.map((row) => row.channel));

    const outcomes: ChannelOutcome[] = [];

    for (const plan of job.plan) {
      if (done.has(plan.channel)) {
        outcomes.push({
          channel: plan.channel,
          status: "skipped",
          detail: "zaten gönderildi",
          durationMs: 0,
        });
        continue;
      }

      // Plan "gönderme" demişse hiç denenmez (ör. taze olmayan push).
      if (!plan.shouldSend) {
        const outcome: ChannelOutcome = {
          channel: plan.channel,
          status: "skipped",
          detail: plan.reason,
          durationMs: 0,
        };
        outcomes.push(outcome);
        await persistOutcome(newsId, outcome, 0);
        continue;
      }

      const outcome = await runChannel(plan.channel, job.story, job.urls);
      outcomes.push(outcome);
      await persistOutcome(newsId, outcome, 0);
    }

    return {
      newsId,
      channels: outcomes,
      sent: outcomes.filter((row) => row.status === "sent").length,
      skipped: outcomes.filter((row) => row.status === "skipped").length,
      failed: outcomes.filter((row) => row.status === "failed").length,
    };
  } catch (error) {
    console.error("[distribution] hatası:", (error as Error).message.slice(0, 200));
    return null;
  } finally {
    running.delete(newsId);
  }
}

/**
 * Zamanı gelmiş başarısız dağıtımları yeniden dener.
 * Zamanlayıcıdan periyodik çağrılır.
 */
export async function retryFailedDistributions(limit = 20): Promise<{
  retried: number;
  succeeded: number;
}> {
  const due = await prisma.distributionLog.findMany({
    where: {
      status: "failed",
      attempt: { lt: MAX_ATTEMPTS },
      nextRetryAt: { lte: new Date() },
    },
    orderBy: { nextRetryAt: "asc" },
    take: limit,
    select: { id: true, newsId: true, channel: true, attempt: true },
  });

  let retried = 0;
  let succeeded = 0;

  for (const row of due) {
    const job = await createDistributionJob(row.newsId);
    if (!job) continue;

    const outcome = await runChannel(row.channel as ChannelId, job.story, job.urls);
    await persistOutcome(row.newsId, outcome, row.attempt + 1);

    retried += 1;
    if (outcome.status === "sent") succeeded += 1;
  }

  return { retried, succeeded };
}

/** Yayılma özeti (panel için). */
export async function distributionReport(hours = 24) {
  const since = new Date(Date.now() - hours * 3_600_000);

  const rows = await prisma.distributionLog.groupBy({
    by: ["channel", "status"],
    where: { createdAt: { gte: since } },
    _count: true,
  });

  const byChannel = new Map<string, { sent: number; failed: number; skipped: number }>();

  for (const row of rows) {
    const entry = byChannel.get(row.channel) ?? { sent: 0, failed: 0, skipped: 0 };
    if (row.status === "sent") entry.sent += row._count;
    else if (row.status === "failed") entry.failed += row._count;
    else if (row.status === "skipped") entry.skipped += row._count;
    byChannel.set(row.channel, entry);
  }

  return {
    windowHours: hours,
    channels: [...byChannel.entries()].map(([channel, stats]) => ({ channel, ...stats })),
    pendingRetries: await prisma.distributionLog.count({
      where: { status: "failed", attempt: { lt: MAX_ATTEMPTS }, nextRetryAt: { lte: new Date() } },
    }),
  };
}
