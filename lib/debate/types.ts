import type { DebateLevel } from "@/lib/debate/config";
import type { DebateTopic, DebateSource } from "@prisma/client";

/**
 * Münazara DTO'ları — istemci bileşenleri Prisma tipi görmez.
 */

export type DebateMotionType = "politika" | "deger" | "olgu";
export type DebateMotionScope = "tr" | "global";

export type DebateClaim = { text: string; sourceIndex?: number };

export type DebateClash = {
  title: string;
  government: string;
  opposition: string;
  rebuttal: string;
};

export type DebateBurdens = {
  government: string[];
  opposition: string[];
};

export type DebateGlossaryItem = { term: string; definition: string };
export type DebateFaq = { question: string; answer: string };

export type DebateSourceDto = {
  id: string;
  name: string;
  title: string;
  url: string;
  publishedAt: string | null;
  accessedAt: string;
  supports: string;
  domain: string;
  isPrimary: boolean;
};

export type DebateListItem = {
  id: string;
  slug: string;
  title: string;
  level: DebateLevel;
  category: string;
  motionText: string;
  motionType: DebateMotionType;
  motionScope: DebateMotionScope;
  difficulty: number;
  controversy: number;
  sourceCount: number;
  readingMinutes: number;
  listenMinutes: number;
  publishedAt: string;
  updatedAt: string;
  musScore: number;
  editorPin: number;
  recencyDays: number;
  viewCount: number;
  href: string;
};

export type DebateDetail = DebateListItem & {
  levelNote: string | null;
  whyNow: DebateClaim[];
  governmentThesis: DebateClaim[];
  oppositionThesis: DebateClaim[];
  keyClash: DebateClash[];
  burdens: DebateBurdens;
  glossary: DebateGlossaryItem[];
  faqs: DebateFaq[];
  conflictNote: string | null;
  sources: DebateSourceDto[];
  musReason: string | null;
  musBreakdown: Record<string, unknown>;
};

function parseArray<T>(value: string | null | undefined): T[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function parseObject<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

export function motionTypeLabel(type: string): string {
  if (type === "deger") return "Değer";
  if (type === "olgu") return "Olgu";
  return "Politika";
}

export function scopeLabel(scope: string): string {
  return scope === "global" ? "Küresel" : "Türkiye";
}

/** Dinleme süresi: metin uzunluğundan ~150 kelime/dk. */
export function estimateDebateListenMinutes(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 150));
}

export function serializeDebateListItem(
  row: DebateTopic,
  lang: string,
): DebateListItem {
  const level: DebateLevel =
    row.level === "lise" || row.level === "universite" ? row.level : "karma";

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    level,
    category: row.category,
    motionText: row.motionText,
    motionType:
      row.motionType === "deger" || row.motionType === "olgu"
        ? row.motionType
        : "politika",
    motionScope: row.motionScope === "global" ? "global" : "tr",
    difficulty: row.difficulty,
    controversy: row.controversy,
    sourceCount: row.sourceCount,
    readingMinutes: row.readingMinutes,
    listenMinutes: estimateDebateListenMinutes(
      `${row.title} ${row.motionText} ${row.whyNow} ${row.governmentThesis} ${row.oppositionThesis}`,
    ),
    publishedAt: row.publishedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    musScore: row.musScore,
    editorPin: row.editorPin,
    recencyDays: Math.max(
      0,
      Math.floor(
        (Date.now() - row.publishedAt.getTime()) / (24 * 60 * 60 * 1000),
      ),
    ),
    viewCount: row.viewCount,
    href: `/${lang}/munazara/${row.slug}`,
  };
}

export function serializeDebateDetail(
  row: DebateTopic & { sources: DebateSource[] },
  lang: string,
): DebateDetail {
  const list = serializeDebateListItem(row, lang);

  return {
    ...list,
    levelNote: row.levelNote,
    whyNow: parseArray<DebateClaim>(row.whyNow).filter(
      (item) => item?.text,
    ),
    governmentThesis: parseArray<DebateClaim>(row.governmentThesis).filter(
      (item) => item?.text,
    ),
    oppositionThesis: parseArray<DebateClaim>(row.oppositionThesis).filter(
      (item) => item?.text,
    ),
    keyClash: parseArray<DebateClash>(row.keyClash).filter(
      (item) => item?.title,
    ),
    burdens: parseObject<DebateBurdens>(row.burdens, {
      government: [],
      opposition: [],
    }),
    glossary: parseArray<DebateGlossaryItem>(row.glossary).filter(
      (item) => item?.term,
    ),
    faqs: parseArray<DebateFaq>(row.faqs).filter((item) => item?.question),
    conflictNote: row.conflictNote,
    sources: row.sources.map((source) => ({
      id: source.id,
      name: source.name,
      title: source.title,
      url: source.url,
      publishedAt: source.publishedAt?.toISOString() ?? null,
      accessedAt: source.accessedAt.toISOString(),
      supports: source.supports,
      domain: source.domain,
      isPrimary: source.isPrimary,
    })),
    musReason: row.musReason,
    musBreakdown: parseObject<Record<string, unknown>>(row.musBreakdown, {}),
  };
}
