import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { normalizeCategory } from "@/lib/categories";
import { queuePortraitImage } from "@/lib/portrait-image";
import { foldTurkish } from "@/lib/utils";
import { getSettings } from "@/lib/settings";
import {
  dedupeStories,
  fetchFeedStories,
  filterByWindow,
  type FeedStory,
} from "@/lib/kantan-feed";
import {
  SCORE_THRESHOLD,
  isRecentlyCovered,
  scoreStories,
  type StoryScore,
} from "@/lib/portrait-score";
import { researchStory } from "@/lib/research";
import { computePus } from "@/lib/hq/pus";
import { PUS } from "@/lib/hq/config";
import {
  generatePortraitDraft,
  runAutoChecks,
  slugify,
  type PortraitDraft,
} from "@/lib/portrait-generate";

/**
 * Portre otomasyon akışı (Ek Bölüm 9.7).
 *
 *   1. Feed çek            2. son 24-48 saat + tekilleştir
 *   3. puanla              4. eşiği geçenleri kuyruğa al
 *   5. kaynaklı araştır    6. taslak üret
 *   7. otomatik kontroller 8. yayınla veya incelemeye al
 *   9. güncelleme takibi
 *
 * Feed okunamazsa hiçbir hikâye UYDURULMAZ; çalıştırma `feed_error` olarak
 * kaydedilir ve pipeline durur.
 */

const FEED_URL = process.env.PORTRAIT_FEED_URL ?? "https://kantan.news/feed";
const SITEMAP_URL =
  process.env.PORTRAIT_SITEMAP_URL ?? "https://kantan.news/sitemap-news-tr.xml";
const WINDOW_HOURS = Number(process.env.PORTRAIT_WINDOW_HOURS ?? 48);
const PER_DAY = Number(process.env.PORTRAIT_PER_DAY ?? 2);
const MAX_PER_RUN = Number(process.env.PORTRAIT_MAX_PER_RUN ?? PER_DAY);
// Editoryal akış: kademeli açılış (2 hafta gölge mod). Gölge süresince portre
// yayınlanır AMA `shadowMode` ile işaretlenir; owner panelden tek tıkla geri çeker.
// Süre bitince otomatik yayın kendiliğinden KAPANMAZ (fail-safe): owner açar.
const AUTO_PUBLISH = (process.env.PORTRAIT_AUTO_PUBLISH ?? "false") === "true";
const USE_GDELT = (process.env.PORTRAIT_USE_GDELT ?? "true") !== "false";
const SHADOW_DAYS = Number(process.env.PORTRAIT_SHADOW_DAYS ?? 14);

/** Gölge mod penceresi (PORTRAIT_SHADOW_START'tan itibaren). */
function isShadowPeriod(now: Date = new Date()): boolean {
  const start = process.env.PORTRAIT_SHADOW_START;
  if (!start) return false;
  const startAt = new Date(start).getTime();
  if (Number.isNaN(startAt)) return false;
  return now.getTime() < startAt + SHADOW_DAYS * 24 * 60 * 60 * 1000;
}

const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;

export type PipelineSummary = {
  runId: string;
  status: "ok" | "feed_error" | "empty_feed" | "error";
  feedStrategy: string;
  fetched: number;
  fresh: number;
  newCandidates: number;
  scored: number;
  queued: number;
  published: number;
  review: number;
  failed: number;
  notes: string[];
  portraits: { slug: string; title: string; status: string }[];
};

const state = globalThis as unknown as {
  portraitPipelineRunning?: boolean;
};

export function isPortraitPipelineRunning(): boolean {
  return Boolean(state.portraitPipelineRunning);
}

function startOfTodayIstanbul(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() + ISTANBUL_OFFSET_MS);
  const start = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return new Date(start - ISTANBUL_OFFSET_MS);
}

/** Portre yayını için benzersiz slug üretir. */
async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || "portre";
  let candidate = root;
  let counter = 2;

  // En fazla 50 deneme; sonra kısa bir karma eklenir.
  while (await prisma.portrait.findUnique({ where: { slug: candidate } })) {
    if (counter > 50) {
      candidate = `${root}-${Date.now().toString(36).slice(-5)}`;
      break;
    }
    candidate = `${root}-${counter}`;
    counter += 1;
  }

  return candidate;
}

function draftToJson(draft: PortraitDraft) {
  return {
    whyNow: JSON.stringify(draft.whyNow),
    timeline: JSON.stringify(draft.timeline),
    keyFacts: JSON.stringify(draft.keyFacts),
    faqs: JSON.stringify(draft.faqs),
    quote: draft.quote ? JSON.stringify(draft.quote) : null,
  };
}

/**
 * Aynı konuda güncelleme: 7 gün içinde portrelenmiş konu yeniden gelirse
 * yeni portre üretilmez; mevcut portreye güncelleme notu düşülür.
 */
async function recordUpdate(
  candidateTitle: string,
  subjectName: string | null,
): Promise<string | null> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const recents = await prisma.portrait.findMany({
    where: {
      status: "published",
      removedAt: null,
      publishedAt: { gte: since },
    },
    select: { id: true, title: true, subjectName: true },
    take: 50,
  });

  const subjectKey = subjectName ? foldTurkish(subjectName) : null;

  const target =
    (subjectKey
      ? recents.find(
          (row) => row.subjectName && foldTurkish(row.subjectName) === subjectKey,
        )
      : null) ??
    recents.find((row) => {
      const a = foldTurkish(row.title).split(/\s+/).filter((token) => token.length >= 4);
      const b = new Set(
        foldTurkish(candidateTitle)
          .split(/\s+/)
          .filter((token) => token.length >= 4),
      );
      if (a.length === 0) return false;
      const hits = a.filter((token) => b.has(token)).length;
      return hits / a.length >= 0.4;
    });

  if (!target) return null;

  const today = new Date().toISOString().slice(0, 10);
  const note = `${today}: aynı konuda yeni gelişme tespit edildi — “${candidateTitle}”.`;

  await prisma.portrait.update({
    where: { id: target.id },
    data: {
      updateNote: target.title ? note : note,
      // Güncelleme tarihini görünür kılmak için updatedAt otomatik güncellenir.
    },
  });

  return target.title;
}

/** Tek bir adayı araştırır, taslak üretir, kontrollerden geçirir. */
type CandidateSubject = {
  total: number;
  subjectType: "kisi" | "kurum" | "olay";
  subjectName: string | null;
};

/** Kuyruktaki adayı (yeni hikâye yoksa) FeedStory'ye geri çevirir. */
function candidateToStory(candidate: {
  sourceKey: string;
  sourceUrl: string;
  originalUrl: string | null;
  title: string;
  summary: string | null;
  category: string | null;
  tags: string;
  imageUrl: string | null;
  imageCredit: string | null;
  publishedAt: Date | null;
}): FeedStory {
  return {
    key: candidate.sourceKey,
    title: candidate.title,
    url: candidate.sourceUrl,
    originalUrl: candidate.originalUrl,
    publishedAt: candidate.publishedAt,
    summary: candidate.summary ?? "",
    category: candidate.category ?? "",
    tags: candidate.tags
      ? candidate.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
      : [],
    imageUrl: candidate.imageUrl,
    imageCredit: candidate.imageCredit,
    externalId: null,
  };
}

async function processCandidate(
  story: FeedStory,
  score: CandidateSubject,
  modelName: string,
): Promise<{ status: "published" | "review" | "failed"; slug?: string; title?: string; note?: string }> {
  const research = await researchStory(story, score.subjectName, {
    useGdelt: USE_GDELT,
  });

  if (!research.ok) {
    return {
      status: "failed",
      note: `Araştırma yetersiz (${research.domainCount} bağımsız kaynak). ${research.notes.slice(-2).join(" ")}`,
    };
  }

  const generation = await generatePortraitDraft({
    story,
    // generatePortraitDraft yalnızca subjectType/subjectName/total kullanır.
    score: score as unknown as StoryScore,
    sources: research.sources,
    model: modelName,
  });

  if (!generation.ok) {
    return {
      status: "failed",
      note: `${generation.error}: ${generation.notes.join(" ")}`,
    };
  }

  const checks = runAutoChecks({
    draft: generation.draft,
    sources: research.sources,
    domainCount: research.domainCount,
    model: generation.model,
  });

  const publish = AUTO_PUBLISH && checks.passed;
  const shadow = isShadowPeriod();
  const slug = await uniqueSlug(generation.draft.title);
  const now = new Date();

  // Kimliği önceden üret: kapak görseli yolu id'ye bağlı (/api/portraits/:id/image).
  const portraitId = randomUUID().replace(/-/g, "");

  const portrait = await prisma.portrait.create({
    data: {
      id: portraitId,
      slug,
      title: generation.draft.title,
      subtitle: generation.draft.subtitle || null,
      category: normalizeCategory(story.category),
      subjectType: generation.draft.subjectType,
      subjectName: generation.draft.subjectName,
      // TELİF: dış kaynak görseli KULLANILMAZ. Kapak kendi AI üretimimizdir;
      // gerçek görsel arka planda hazırlanır, hazır olana dek SVG fallback.
      coverImageUrl: `/api/portraits/${portraitId}/image`,
      coverImageCaption: null,
      coverImageCredit: "Yapay zekâ ile üretilmiş özgün illüstrasyon",
      ...draftToJson(generation.draft),
      conflictNote: generation.draft.conflictNote,
      sourceCount: research.domainCount,
      readingMinutes: generation.readingMinutes,
      status: publish ? "published" : "review",
      reviewNotes: checks.passed
        ? AUTO_PUBLISH
          ? [shadow ? "GÖLGE MOD (kademeli açılış)" : null, ...(checks.warnings.length > 0 ? [checks.warnings.join(" | ")] : [])]
              .filter(Boolean)
              .join(" | ") || null
          : "Otomatik yayın kapalı (PORTRAIT_AUTO_PUBLISH=false)."
        : checks.notes.join(" | "),
      originStoryUrl: story.url,
      originSource: "kantan.news",
      feedScore: Math.round(score.total * 10),
      publishedAt: publish ? now : null,
      updateNote: generation.draft.updateNote,
      sources: {
        create: research.sources.map((source) => ({
          name: source.name,
          title: source.title,
          url: source.url,
          domain: source.domain,
          publishedAt: source.publishedAt,
          accessedAt: source.accessedAt,
          kind: source.kind,
          isPrimary: source.isPrimary,
        })),
      },
    },
  });

  // Telifsiz kapak görselini arka planda üret (SVG fallback anında servis edilir).
  queuePortraitImage({
    id: portrait.id,
    title: portrait.title,
    category: portrait.category,
    subjectType: portrait.subjectType,
  });

  return {
    status: publish ? "published" : "review",
    slug: portrait.slug,
    title: portrait.title,
    note: checks.passed
      ? checks.warnings.length > 0
        ? checks.warnings.join(" | ")
        : undefined
      : checks.notes.join(" | "),
  };
}

/**
 * Tam pipeline çalıştırması. Eşzamanlı çalışmayı engeller.
 */
export async function runPortraitPipeline(
  options: { trigger?: string; quota?: number } = {},
): Promise<PipelineSummary> {
  if (state.portraitPipelineRunning) {
    throw new Error("Portre hattı zaten çalışıyor.");
  }

  state.portraitPipelineRunning = true;

  const notes: string[] = [];
  const portraits: { slug: string; title: string; status: string }[] = [];

  const run = await prisma.portraitRun.create({ data: {} });
  void options.trigger;

  const summary: PipelineSummary = {
    runId: run.id,
    status: "ok",
    feedStrategy: "none" as string,
    fetched: 0,
    fresh: 0,
    newCandidates: 0,
    scored: 0,
    queued: 0,
    published: 0,
    review: 0,
    failed: 0,
    notes,
    portraits,
  };

  try {
    // ── 1) Feed ────────────────────────────────────────────────────────────
    const primary = await fetchFeedStories(FEED_URL, { sourceName: "kantan.news" });
    const feed: { ok: boolean; strategy: string; stories: FeedStory[]; notes: string[]; error?: string } = {
      ok: primary.ok,
      strategy: primary.strategy,
      stories: [...primary.stories],
      notes: primary.notes,
      error: "error" in primary ? primary.error : undefined,
    };

    notes.push(...feed.notes);
    summary.feedStrategy = feed.strategy;

    if (!feed.ok) {
      summary.status = "feed_error";
      notes.push(feed.error ?? "feed_error");

      await prisma.portraitRun.update({
        where: { id: run.id },
        data: {
          status: summary.status,
          finishedAt: new Date(),
          note: (feed.error ?? "feed_error").slice(0, 900),
        },
      });

      // ── Yedek: feed makale döndürmüyorsa sitemap'ten oku ─────────────────
      if (feed.stories.length === 0) {
        const { fetchSitemapStories } = await import("@/lib/kantan-sitemap");
        const fallback = await fetchSitemapStories(SITEMAP_URL, {
          windowHours: WINDOW_HOURS,
          max: 50,
        });

        notes.push(...fallback.notes);

        if (fallback.ok) {
          summary.status = "ok";
          summary.feedStrategy = "sitemap";
          feed.stories = fallback.stories;
          notes.push("Birincil feed boş; sitemap yedeği kullanıldı.");
        } else {
          notes.push(fallback.error ?? "Sitemap yedeği de başarısız.");
          return summary;
        }
      } else {
        return summary;
      }
    }

    summary.fetched = feed.stories.length;

    // ── 2) Pencere + tekilleştirme ─────────────────────────────────────────
    const { fresh, skipped } = filterByWindow(feed.stories, WINDOW_HOURS);
    const deduped = dedupeStories(fresh);

    summary.fresh = deduped.length;
    notes.push(
      `${feed.stories.length} hikâye okundu; ${skipped} tanesi ${WINDOW_HOURS} saat penceresi dışında, ${feed.stories.length - skipped - deduped.length} tanesi tekrar.`,
    );

    if (deduped.length === 0) {
      summary.status = "empty_feed";

      await prisma.portraitRun.update({
        where: { id: run.id },
        data: {
          status: summary.status,
          fetched: summary.fetched,
          finishedAt: new Date(),
          note: "Pencerede yeni hikâye yok.",
        },
      });

      return summary;
    }

    // ── 3) Aday kaydı (duplicate skip) ─────────────────────────────────────
    const existingKeys = new Set(
      (
        await prisma.portraitCandidate.findMany({
          where: { sourceKey: { in: deduped.map((story) => story.key) } },
          select: { sourceKey: true },
        })
      ).map((row) => row.sourceKey),
    );

    const newStories = deduped.filter((story) => !existingKeys.has(story.key));
    summary.newCandidates = newStories.length;

    if (newStories.length === 0) {
      notes.push("Yeni hikâye yok (duplicate skip); kuyruktaki adaylar değerlendirilecek.");
    }

    // ── 4) Puanlama ────────────────────────────────────────────────────────
    const scores = newStories.length > 0 ? scoreStories(newStories) : new Map<string, StoryScore>();

    for (const story of newStories) {
      const score = scores.get(story.key);
      if (!score) continue;

      // İŞ 1.2 — PUS, eski 7.0 eşiğinin yerini alır.
      const pus = computePus({
        affectedScope: score.total >= 8 ? "country" : score.total >= 6 ? "sector" : "company",
        distinctSubjects: score.subjectType === "olay" ? 3 : 1,
        independentSources: 3,
        publishedAt: story.publishedAt ?? new Date(),
        coveredRecently: false,
        turkeyImpact: score.dimensions.turkeyAffinity.score >= 6,
      });

      await prisma.portraitCandidate.create({
        data: {
          sourceKey: story.key,
          sourceName: "kantan.news",
          sourceUrl: story.url,
          originalUrl: story.originalUrl,
          title: story.title,
          summary: story.summary || null,
          category: story.category || null,
          tags: story.tags.join(", "),
          imageUrl: story.imageUrl,
          imageCredit: story.imageCredit,
          publishedAt: story.publishedAt,
          // İŞ 1.2 — PUS (0-100) skor kolonuna ondalık olarak yazılır.
          score: Math.round(pus.total * 10),
          scoreBreakdown: JSON.stringify({ pus: pus.dimensions, legacy: score.dimensions }),
          scoreReason: `${pus.decision} (PUS ${pus.total}) · eski skor ${score.total.toFixed(1)}`,
          subjectType: score.subjectType,
          subjectName: score.subjectName,
          status: pus.decision === "reject" ? "skipped" : "queued",
          failureReason:
            pus.decision === "reject"
              ? `PUS eşik altı: ${pus.total} < ${PUS.thresholds.reviewMin}`
              : pus.decision === "review"
                ? `PUS ${pus.total} → inceleme kuyruğu (${PUS.thresholds.reviewMin}-${PUS.thresholds.autoPublish - 1})`
                : null,
        },
      });

      summary.scored += 1;
    }

    // ── 5) Kuyruk ve günlük kota ───────────────────────────────────────────
    // YENİ: incelemede bekleyen portreler de "üretilmiş" sayılır. Aksi hâlde
    // otomatik yayın kapalıyken her çalıştırma 2 yeni taslak üretip kuyruğu
    // sonsuz büyütüyordu.
    const todayStart = startOfTodayIstanbul();
    const [publishedToday, reviewToday] = await Promise.all([
      prisma.portrait.count({
        where: {
          status: "published",
          removedAt: null,
          publishedAt: { gte: todayStart },
        },
      }),
      prisma.portrait.count({
        where: { status: "review", createdAt: { gte: todayStart } },
      }),
    ]);

    // Çalıştırma sırasında tam 1 portre hedefleniyor; akşam telafisi 2.
    // YALNIZCA yayınlananlar günlük kotayı doldurur. İncelemedeki taslaklar
    // sayılırsa (eski davranış) gölge mod kapalıyken hat sonsuza kadar durur.
    const runQuota = Math.max(1, Number(options.quota ?? 1));
    const remainingQuota = Math.min(runQuota, Math.max(0, PER_DAY - publishedToday));
    summary.queued = remainingQuota;

    notes.push(
      `Bugün yayınlanan: ${publishedToday}, incelemede: ${reviewToday} (kota: ${publishedToday}/${PER_DAY}); ` +
        `bu çalıştırmanın kotası: ${remainingQuota}.`,
    );

    if (remainingQuota === 0) {
      await prisma.portraitRun.update({
        where: { id: run.id },
        data: {
          status: "ok",
          fetched: summary.fetched,
          fresh: summary.fresh,
          scored: summary.scored,
          queued: 0,
          finishedAt: new Date(),
          note: "Günlük portre kotası dolu.",
        },
      });

      return summary;
    }

    const queuedCandidates = await prisma.portraitCandidate.findMany({
      where: { status: "queued" },
      orderBy: [{ score: "desc" }, { publishedAt: "desc" }],
      // Kota kadar değil, biraz fazla aday çek: 7 gün kuralıyla atlananlar
      // olursa sıradaki aday denenebilsin.
      take: Math.min(8, remainingQuota + MAX_PER_RUN + 1),
    });

    if (newStories.length === 0 && queuedCandidates.length === 0) {
      await prisma.portraitRun.update({
        where: { id: run.id },
        data: {
          status: "ok",
          fetched: summary.fetched,
          fresh: summary.fresh,
          finishedAt: new Date(),
          note: "Yeni hikâye ve bekleyen aday yok.",
        },
      });

      notes.push("Yeni hikâye ve bekleyen aday yok.");
      return summary;
    }

    // ── 6) 7 gün kuralı ────────────────────────────────────────────────────
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentPortraits = await prisma.portrait.findMany({
      where: {
        status: "published",
        removedAt: null,
        publishedAt: { gte: sevenDaysAgo },
      },
      select: { title: true, subjectName: true, category: true },
      take: 100,
    });

    const settings = await getSettings();

    let produced = 0;
    let categoryToday: string | null = null;

    // Bugün zaten yayınlanan/incelemede olan kategoriler (çeşitlilik kuralı).
    const producedCategories = await prisma.portrait.findMany({
      where: { createdAt: { gte: todayStart } },
      select: { category: true },
      take: 5,
    });
    if (producedCategories.length > 0) {
      categoryToday = producedCategories[0].category;
    }

    for (const candidate of queuedCandidates) {
      if (produced >= remainingQuota) break;

      const story =
        newStories.find((item) => item.key === candidate.sourceKey) ??
        deduped.find((item) => item.key === candidate.sourceKey) ??
        candidateToStory(candidate);

      // Skor: yeni puanlamada varsa onu, yoksa adaydaki kayıtlı değerleri kullan.
      const freshScore = scores.get(story.key);

      const score: CandidateSubject = freshScore
        ? {
            total: freshScore.total,
            subjectType: freshScore.subjectType,
            subjectName: freshScore.subjectName,
          }
        : {
            total: candidate.score / 10,
            subjectType:
              candidate.subjectType === "kisi" || candidate.subjectType === "kurum"
                ? candidate.subjectType
                : "olay",
            subjectName: candidate.subjectName,
          };

      // 7 gün kuralı: aynı konu varsa portre üretme, güncelleme notu düş.
      const coverage = isRecentlyCovered(
        {
          title: candidate.title,
          subjectName: score.subjectName,
          category: candidate.category,
        },
        recentPortraits,
      );

      // Günlük çeşitlilik: aynı gün iki portre aynı kategoriden olamaz.
      const candidateCategory = normalizeCategory(candidate.category);
      const alreadyUsedToday =
        produced > 0 && normalizeCategory(categoryToday) === candidateCategory;

      if (alreadyUsedToday) {
        await prisma.portraitCandidate.update({
          where: { id: candidate.id },
          data: {
            status: "skipped",
            failureReason: `Günlük çeşitlilik: bugünkü portre(ler) “${categoryToday}” kategorisinde.`,
          },
        });

        notes.push(`Atlandı (çeşitlilik): ${candidateCategory}`);
        continue;
      }

      if (coverage.covered) {
        const updatedTitle = await recordUpdate(candidate.title, score.subjectName);

        await prisma.portraitCandidate.update({
          where: { id: candidate.id },
          data: {
            status: "skipped",
            failureReason: updatedTitle
              ? `${coverage.reason}; mevcut portre güncellendi (“${updatedTitle}”).`
              : coverage.reason,
          },
        });

        notes.push(`Atlandı: ${coverage.reason}`);
        continue;
      }

      await prisma.portraitCandidate.update({
        where: { id: candidate.id },
        data: { status: "researching" },
      });

      try {
        const result = await processCandidate(story, score, settings.modelName);

        if (result.status === "published") {
          summary.published += 1;
          produced += 1;
          categoryToday = normalizeCategory(candidate.category);

          await prisma.portraitCandidate.update({
            where: { id: candidate.id },
            data: { status: "published", portraitId: result.slug ?? null },
          });

          portraits.push({
            slug: result.slug ?? "",
            title: result.title ?? candidate.title,
            status: "published",
          });
        } else if (result.status === "review") {
          summary.review += 1;
          produced += 1;
          categoryToday = normalizeCategory(candidate.category);

          await prisma.portraitCandidate.update({
            where: { id: candidate.id },
            data: {
              status: "review",
              portraitId: result.slug ?? null,
              failureReason: result.note ?? "Otomatik kontrolü geçemedi.",
            },
          });

          portraits.push({
            slug: result.slug ?? "",
            title: result.title ?? candidate.title,
            status: "review",
          });
        } else {
          summary.failed += 1;

          await prisma.portraitCandidate.update({
            where: { id: candidate.id },
            data: { status: "failed", failureReason: result.note ?? "Bilinmeyen hata." },
          });

          notes.push(`Üretim başarısız (${candidate.title.slice(0, 60)}): ${result.note}`);
        }
      } catch (error) {
        summary.failed += 1;

        await prisma.portraitCandidate.update({
          where: { id: candidate.id },
          data: {
            status: "failed",
            failureReason: (error as Error).message.slice(0, 500),
          },
        });

        notes.push(`Hata: ${(error as Error).message}`);
      }
    }

    await prisma.portraitRun.update({
      where: { id: run.id },
      data: {
        status: "ok",
        fetched: summary.fetched,
        fresh: summary.fresh,
        scored: summary.scored,
        queued: summary.queued,
        published: summary.published,
        review: summary.review,
        failed: summary.failed,
        finishedAt: new Date(),
        note: notes.slice(0, 20).join(" | ").slice(0, 2000),
      },
    });

    return summary;
  } catch (error) {
    summary.status = "error";
    notes.push((error as Error).message);

    await prisma.portraitRun.update({
      where: { id: run.id },
      data: {
        status: "error",
        finishedAt: new Date(),
        note: (error as Error).message.slice(0, 900),
      },
    });

    return summary;
  } finally {
    state.portraitPipelineRunning = false;
  }
}

/** Yalnızca skorlama (kuru çalıştırma) — yayın yapmaz. */
export async function scoreFeedOnly(limit = 20): Promise<{
  strategy: string;
  items: { title: string; total: number; reason: string }[];
  notes: string[];
}> {
  const feed = await fetchFeedStories(FEED_URL, { sourceName: "kantan.news" });

  if (!feed.ok) {
    return { strategy: "none", items: [], notes: [...feed.notes, feed.error] };
  }

  const { fresh } = filterByWindow(feed.stories, WINDOW_HOURS);
  const deduped = dedupeStories(fresh).slice(0, limit);
  const scores = scoreStories(deduped);

  return {
    strategy: feed.strategy,
    notes: feed.notes,
    items: deduped
      .map((story) => {
        const score = scores.get(story.key);
        return {
          title: story.title,
          total: score?.total ?? 0,
          reason: score?.reason ?? "",
        };
      })
      .sort((a, b) => b.total - a.total),
  };
}
