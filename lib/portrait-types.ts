import type { Portrait, PortraitSource } from "@prisma/client";
import type {
  ClaimItem,
  FaqItem,
  QuoteBlock,
  TimelineItem,
} from "@/lib/portrait-generate";
import type { SourceKind } from "@/lib/research";

/**
 * Portre veri transfer nesneleri. Tüm JSON sütunları güvenli biçimde
 * ayrıştırılır; bozuk veri sayfayı çökertmez.
 */

export type PortraitSourceDto = {
  name: string;
  title: string;
  url: string;
  domain: string;
  publishedAt: string | null;
  accessedAt: string;
  kind: SourceKind;
  isPrimary: boolean;
};

export type PortraitDto = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  category: string;
  subjectType: "kisi" | "kurum" | "olay";
  subjectName: string | null;
  coverImageUrl: string | null;
  coverImageCaption: string | null;
  coverImageCredit: string | null;
  whyNow: ClaimItem[];
  timeline: TimelineItem[];
  keyFacts: ClaimItem[];
  quote: QuoteBlock | null;
  faqs: FaqItem[];
  conflictNote: string | null;
  sourceCount: number;
  readingMinutes: number;
  status: string;
  reviewNotes: string | null;
  originStoryUrl: string | null;
  originSource: string;
  updateNote: string | null;
  publishedAt: string | null;
  updatedAt: string;
  viewCount: number;
  sources: PortraitSourceDto[];
};

function parseArray<T>(value: string): T[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function parseObject<T>(value: string | null): T | null {
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

export function serializePortraitSource(row: PortraitSource): PortraitSourceDto {
  return {
    name: row.name,
    title: row.title,
    url: row.url,
    domain: row.domain,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    accessedAt: row.accessedAt.toISOString(),
    kind: (["official", "news", "academic", "data", "reference"].includes(row.kind)
      ? row.kind
      : "news") as SourceKind,
    isPrimary: row.isPrimary,
  };
}

export function serializePortrait(
  row: Portrait & { sources?: PortraitSource[] },
): PortraitDto {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    category: row.category,
    subjectType:
      row.subjectType === "kisi" || row.subjectType === "kurum"
        ? row.subjectType
        : "olay",
    subjectName: row.subjectName,
    coverImageUrl: row.coverImageUrl,
    coverImageCaption: row.coverImageCaption,
    coverImageCredit: row.coverImageCredit,
    whyNow: parseArray<ClaimItem>(row.whyNow),
    timeline: parseArray<TimelineItem>(row.timeline),
    keyFacts: parseArray<ClaimItem>(row.keyFacts),
    quote: parseObject<QuoteBlock>(row.quote),
    faqs: parseArray<FaqItem>(row.faqs),
    conflictNote: row.conflictNote,
    sourceCount: row.sourceCount,
    readingMinutes: row.readingMinutes,
    status: row.status,
    reviewNotes: row.reviewNotes,
    originStoryUrl: row.originStoryUrl,
    originSource: row.originSource,
    updateNote: row.updateNote,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    viewCount: row.viewCount,
    sources: (row.sources ?? []).map(serializePortraitSource),
  };
}

/** Liste/kart görünümü için hafif DTO. */
export type PortraitCardDto = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  category: string;
  subjectType: "kisi" | "kurum" | "olay";
  subjectName: string | null;
  coverImageUrl: string | null;
  readingMinutes: number;
  listenMinutes: number;
  sourceCount: number;
  publishedAt: string | null;
  viewCount: number;
  originStoryUrl: string | null;
};

export function serializePortraitCard(row: Portrait): PortraitCardDto {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    category: row.category,
    subjectType:
      row.subjectType === "kisi" || row.subjectType === "kurum"
        ? row.subjectType
        : "olay",
    subjectName: row.subjectName,
    coverImageUrl: row.coverImageUrl,
    readingMinutes: row.readingMinutes,
    // Tahmini dinleme süresi (okuma süresinden türetilir; detayda kesin değer).
    listenMinutes: Math.max(1, Math.round(row.readingMinutes * 1.3)),
    sourceCount: row.sourceCount,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    viewCount: row.viewCount,
    originStoryUrl: row.originStoryUrl,
  };
}
