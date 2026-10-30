import type { Locale } from "@/lib/i18n-config";
import { normalizeCategory } from "@/lib/categories";
import { resolveCitations } from "@/lib/citations";
import type { CitationAnchor } from "@/lib/citation-types";
import { estimateSeconds, buildFullDocument, buildSummaryDocument, splitSentences, textForSpeech, type SpeechBundle } from "@/lib/speech-text";
import { parseSourcesMeta, serializeNewsItem } from "@/lib/news-types";
import { prisma } from "@/lib/prisma";
import { readingTimeMinutes, stripHtml } from "@/lib/utils";

/**
 * Birleşik içerik modeli — /haber/<slug> ve /portre/<slug> aynı şablonu
 * kullanır. Veri yoksa ilgili bölüm render EDİLMEZ (uydurma yok).
 */

export type ContentKind = "portre" | "haber";

export type ClaimItem = { text: string; sourceIndex?: number };

export type TimelineItem = { date: string; text: string; sourceIndex?: number };

export type QuoteBlock = {
  text: string;
  speaker: string;
  date?: string;
  sourceIndex?: number;
};

export type FaqItem = { question: string; answer: string; sourceIndex?: number };

export type ContentSource = {
  name: string;
  title: string;
  url: string;
  publishedAt: string | null;
  accessedAt?: string | null;
  kind?: string;
};

export type RelatedItem = {
  href: string;
  title: string;
  category: string;
  imageUrl: string | null;
  meta: string;
};

export type ContentItem = {
  kind: ContentKind;
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  category: string;
  coverImageUrl: string | null;
  coverImageAlt: string;
  coverImageCaption: string | null;
  coverImageCredit: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  readingMinutes: number;
  sourceCount: number;
  subjectType: "kisi" | "kurum" | "olay" | null;
  subjectName: string | null;
  whyNow: ClaimItem[];
  timeline: TimelineItem[];
  keyFacts: ClaimItem[];
  quote: QuoteBlock | null;
  faqs: FaqItem[];
  conflictNote: string | null;
  sources: ContentSource[];
  bodyMarkdown: string | null;
  related: RelatedItem[];
  /**
   * Gövde içi atıflar (en fazla 5). Sunucu tarafında üretilir; önizleme
   * verisi de sayfaya gömülüdür. Hover/focus sırasında istek yapılmaz.
   */
  citations: CitationAnchor[];
  /** Kanonik yol: /tr/portre/slug veya /tr/haber/slug */
  href: string;
  originStoryUrl: string | null;
};

function parseJsonArray<T>(value: string | null | undefined): T[] {
  if (!value) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function parseJsonObject<T>(value: string | null | undefined): T | null {
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as T)
      : null;
  } catch {
    return null;
  }
}

/** Markdown gövdesini düz metin paragraflarına çevirir (sesli okuma için). */
export function markdownToParagraphs(markdown: string): string[] {
  return markdown
    .split(/\n{2,}/)
    .map((block) => textForSpeech(block.replace(/^#{1,6}\s+/gm, "").replace(/^[-*]\s+/gm, "").replace(/\*\*/g, "")))
    .filter((block) => block.length > 0);
}

// ─── Ortak yardımcılar ──────────────────────────────────────────────────────

function kindLabel(kind: string | undefined, lang: Locale): string {
  if (lang !== "tr") {
    return kind === "official" ? "Official" : kind === "academic" ? "Academic" : kind === "reference" ? "Reference" : "News";
  }

  return kind === "official"
    ? "Resmî"
    : kind === "academic"
      ? "Akademik"
      : kind === "data"
        ? "Veri"
        : kind === "reference"
          ? "Başvuru"
          : "Haber";
}

export { kindLabel };

async function relatedItems(
  lang: Locale,
  category: string,
  excludeIds: { news?: string; portrait?: string },
): Promise<RelatedItem[]> {
  const [news, portraits] = await Promise.all([
    prisma.newsItem.findMany({
      where: {
        removedAt: null,
        category,
        ...(excludeIds.news ? { NOT: { id: excludeIds.news } } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 3,
      select: { id: true, slug: true, title: true, category: true, imageUrl: true, readingMinutes: true, createdAt: true },
    }),
    prisma.portrait.findMany({
      where: {
        status: "published",
        removedAt: null,
        category,
        ...(excludeIds.portrait ? { NOT: { id: excludeIds.portrait } } : {}),
      },
      orderBy: [{ publishedAt: "desc" }],
      take: 2,
      select: { slug: true, title: true, category: true, coverImageUrl: true, readingMinutes: true },
    }),
  ]);

  const items: RelatedItem[] = [];

  for (const portrait of portraits) {
    items.push({
      href: `/${lang}/portre/${portrait.slug}`,
      title: portrait.title,
      category: portrait.category,
      imageUrl: portrait.coverImageUrl,
      meta: `${portrait.readingMinutes} dk`,
    });
  }

  for (const item of news) {
    if (!item.slug) continue;

    items.push({
      href: `/${lang}/haber/${item.slug}`,
      title: item.title,
      category: item.category,
      imageUrl: item.imageUrl,
      meta: `${item.readingMinutes} dk`,
    });
  }

  return items.slice(0, 4);
}

// ─── Portre ─────────────────────────────────────────────────────────────────

export async function getPortraitContent(
  lang: Locale,
  slug: string,
): Promise<ContentItem | null> {
  const row = await prisma.portrait.findFirst({
    where: { slug, status: "published", removedAt: null },
    include: { sources: { orderBy: [{ isPrimary: "desc" }, { accessedAt: "asc" }] } },
  });

  if (!row) return null;

  const whyNow = parseJsonArray<ClaimItem>(row.whyNow);
  const timeline = parseJsonArray<TimelineItem>(row.timeline);
  const keyFacts = parseJsonArray<ClaimItem>(row.keyFacts);
  const faqs = parseJsonArray<FaqItem>(row.faqs);
  const quote = parseJsonObject<QuoteBlock>(row.quote);

  const citations = await resolveCitations({
    lang,
    kind: "portre",
    id: row.id,
    title: row.title,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    texts: [
      ...whyNow.map((item) => item.text),
      ...keyFacts.map((item) => item.text),
      ...timeline.map((item) => item.text),
    ],
  });

  return {
    kind: "portre",
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    category: row.category,
    coverImageUrl: row.coverImageUrl ?? `/api/portraits/${row.id}/image`,
    coverImageAlt: row.title,
    coverImageCaption: row.coverImageCaption,
    coverImageCredit: row.coverImageCredit,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    readingMinutes: row.readingMinutes,
    sourceCount: row.sourceCount,
    subjectType:
      row.subjectType === "kisi" || row.subjectType === "kurum"
        ? row.subjectType
        : "olay",
    subjectName: row.subjectName,
    whyNow,
    timeline,
    keyFacts,
    quote,
    faqs,
    conflictNote: row.conflictNote,
    sources: row.sources.map((source) => ({
      name: source.name,
      title: source.title,
      url: source.url,
      publishedAt: source.publishedAt?.toISOString() ?? null,
      accessedAt: source.accessedAt.toISOString(),
      kind: source.kind,
    })),
    bodyMarkdown: null,
    related: await relatedItems(lang, row.category, { portrait: row.id }),
    citations,
    href: `/${lang}/portre/${row.slug}`,
    originStoryUrl: row.originStoryUrl,
  };
}

// ─── Haber ──────────────────────────────────────────────────────────────────

/** Haber gövdesinden olgusal maddeler çıkarır (uydurma yok, özet metinden). */
function extractClaims(text: string, limit: number): ClaimItem[] {
  return splitSentences(textForSpeech(text))
    .filter((sentence) => sentence.length > 40)
    .slice(0, limit)
    .map((sentence) => ({ text: sentence.replace(/\.$/, "") }));
}

export async function getNewsContent(
  lang: Locale,
  slug: string,
): Promise<ContentItem | null> {
  // Kanonik: slug. Eski/eksik kayıtlar için id ile de aranır; çağıran
  // katman slug boşsa kanonik adrese yönlendirir.
  const row =
    (await prisma.newsItem.findUnique({ where: { slug } })) ??
    (await prisma.newsItem.findUnique({ where: { id: slug } }));

  if (!row || row.removedAt) return null;

  const sourcesMeta = parseSourcesMeta(row.sourcesMeta, row.sourcesList);
  const plainBody = stripHtml(row.detailedContent ?? "").trim();

  const whyNow = extractClaims(row.summary, 3);
  const keyFacts = extractClaims(plainBody || row.summary, 5);

  // Kronoloji yalnızca gerçek tarih verisi varsa (en az 4 farklı gün).
  const dates = sourcesMeta
    .map((source) => source.fetchedAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => value.slice(0, 10));

  const uniqueDates = [...new Set(dates)].sort();
  const timeline: TimelineItem[] =
    uniqueDates.length >= 4
      ? uniqueDates.slice(0, 10).map((date) => ({
          date,
          text: "Kaynak taraması güncellendi.",
        }))
      : [];

  const bodyParagraphs = markdownToParagraphs(row.detailedContent ?? "");
  const citations = await resolveCitations({
    lang,
    kind: "haber",
    id: row.id,
    title: row.title,
    publishedAt: row.createdAt.toISOString(),
    texts: [row.summary, ...bodyParagraphs],
  });

  return {
    kind: "haber",
    id: row.id,
    slug: row.slug ?? row.id,
    title: row.title,
    subtitle: row.summary,
    category: normalizeCategory(row.category),
    coverImageUrl: row.imageUrl ?? `/api/news/${row.id}/image`,
    coverImageAlt: row.title,
    coverImageCaption: null,
    coverImageCredit:
      row.imageCredit ?? "Yapay zekâ ile üretilmiş özgün illüstrasyon",
    publishedAt: row.createdAt.toISOString(),
    updatedAt: row.auditedAt?.toISOString() ?? null,
    readingMinutes: row.readingMinutes || readingTimeMinutes(`${row.title} ${plainBody}`),
    sourceCount: row.sourcesCount,
    subjectType: null,
    subjectName: null,
    whyNow,
    timeline,
    keyFacts,
    quote: null,
    faqs: [],
    conflictNote: null,
    sources: sourcesMeta.map((source) => ({
      name: source.name,
      title: source.headline || row.title,
      url: source.url ?? "",
      publishedAt: source.fetchedAt,
      accessedAt: source.fetchedAt,
      kind: "news",
    })),
    bodyMarkdown: row.detailedContent ?? null,
    related: await relatedItems(lang, normalizeCategory(row.category), { news: row.id }),
    citations,
    href: `/${lang}/haber/${row.slug ?? row.id}`,
    originStoryUrl: null,
  };
}

// ─── Sesli okuma paketi ─────────────────────────────────────────────────────

export function buildSpeechBundle(content: ContentItem, lang: Locale): SpeechBundle {
  const contentId = `${content.kind}:${content.slug}`;
  const url = content.href;

  const summary = buildSummaryDocument({
    contentId,
    title: content.title,
    url,
    coverImageUrl: content.coverImageUrl,
    subtitle: content.subtitle,
    // Özet: 3 "neden gündemde" maddesi + 3 olgu → hedef 60-90 saniye.
    bullets: [
      ...content.whyNow.map((item) => item.text),
      ...content.keyFacts.map((item) => item.text),
    ].slice(0, 6),
  });

  const sections: { heading: string; paragraphs: string[] }[] = [];

  if (content.whyNow.length > 0) {
    sections.push({
      heading: lang === "tr" ? "Neden gündemde" : "Why it matters now",
      paragraphs: content.whyNow.map((item) => item.text),
    });
  }

  if (content.timeline.length > 0) {
    sections.push({
      heading: lang === "tr" ? "Kronoloji" : "Timeline",
      paragraphs: content.timeline.map(
        (item) => `${item.date}. ${item.text}`,
      ),
    });
  }

  if (content.keyFacts.length > 0) {
    sections.push({
      heading: lang === "tr" ? "Bilinmesi gerekenler" : "Key facts",
      paragraphs: content.keyFacts.map((item) => item.text),
    });
  }

  if (content.bodyMarkdown) {
    const paragraphs = markdownToParagraphs(content.bodyMarkdown);
    if (paragraphs.length > 0) {
      sections.push({
        heading: lang === "tr" ? "Ayrıntılar" : "Details",
        paragraphs,
      });
    }
  }

  if (content.quote) {
    sections.push({
      heading: lang === "tr" ? "Alıntı" : "Quote",
      paragraphs: [`${content.quote.speaker}: ${content.quote.text}`],
    });
  }

  if (content.faqs.length > 0) {
    sections.push({
      heading: lang === "tr" ? "Sık sorulanlar" : "Frequently asked",
      paragraphs: content.faqs.map((faq) => `${faq.question} ${faq.answer}`),
    });
  }

  const full = buildFullDocument({
    contentId,
    title: content.title,
    url,
    coverImageUrl: content.coverImageUrl,
    subtitle: content.subtitle,
    sections,
  });

  return { summary, full };
}

/** Dinleme süresi (dk) — tahmini. */
export function listenMinutes(bundle: SpeechBundle): number {
  return Math.max(1, Math.round(estimateSeconds(bundle.full.sentences.join(" ")) / 60));
}

export { serializeNewsItem };
