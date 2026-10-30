import { CLASSIFIER } from "./config";
import { foldTurkish, tokenize } from "./normalize";

/**
 * Çok etiketli kategori sınıflandırıcı.
 * 4 sinyal → kategori başına 0-1 skor. LLM kullanılmaz, tamamen deterministik.
 */

export const CATEGORIES = [
  "Gündem", "Teknoloji", "Yapay Zekâ", "Ekonomi", "Siyaset",
  "Spor", "Bilim", "Dünya", "Sağlık", "Kültür",
] as const;

export type Category = (typeof CATEGORIES)[number];
export const FALLBACK_CATEGORY = "Diğer";

export const CATEGORY_HANDLES: Record<string, string> = {
  Gündem: "gundem",
  Teknoloji: "teknoloji",
  "Yapay Zekâ": "yapayzeka",
  Ekonomi: "ekonomi",
  Siyaset: "siyaset",
  Spor: "spor",
  Bilim: "bilim",
  Dünya: "dunya",
  Sağlık: "saglik",
  Kültür: "kultur",
  Diğer: "diger",
};

export type ClassifierInput = {
  title: string;
  spot?: string;
  body?: string;
  /** Feed'in kendi varsayılan kategorisi (varsa). */
  feedCategory?: string;
};

export type ClassifierResult = {
  scores: Record<string, number>;
  primary: string;
  secondary: string[];
  ambiguous: boolean;
  tags: string[];
  signals: {
    title: Record<string, number>;
    body: Record<string, number>;
    feed: Record<string, number>;
    entity: Record<string, number>;
  };
};

const SUFFIXES = CLASSIFIER.suffixes;

/** Etiketler her zaman ASCII slug olur: @dunya, @yapayzeka. */
function toSlug(value: string): string {
  return foldTurkish(value).replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

/** Kelime öbeğini token dizisinde arar; eşleşme sayısını döndürür. */
function countPhraseMatches(tokens: string[], keywordTokens: string[]): number {
  if (keywordTokens.length === 0) return 0;
  const size = keywordTokens.length;
  let hits = 0;
  for (let i = 0; i + size <= tokens.length; i += 1) {
    let matched = true;
    for (let j = 0; j < size; j += 1) {
      if (tokens[i + j] !== keywordTokens[j]) {
        matched = false;
        break;
      }
    }
    if (matched) hits += 1;
  }
  return hits;
}

function keywordTokensFor(category: string): string[][] {
  const raw = CLASSIFIER.keywords[category] ?? [];
  return raw.map((keyword) => tokenize(keyword, SUFFIXES));
}

function normalizeDistribution(raw: Record<string, number>): Record<string, number> {
  const total = Object.values(raw).reduce((sum, value) => sum + value, 0);
  if (total <= 0) return raw;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) out[key] = value / total;
  return out;
}

function empty(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const category of CATEGORIES) out[category] = 0;
  return out;
}

export function classifyArticle(input: ClassifierInput): ClassifierResult {
  const titleTokens = tokenize(input.title, SUFFIXES);
  const bodyText = `${input.spot ?? ""} ${input.body ?? ""}`.trim();
  const bodyTokens = tokenize(bodyText, SUFFIXES);

  const titleRaw = empty();
  const bodyRaw = empty();
  const entityRaw = empty();
  const feedRaw = empty();

  // Gövde normalizasyonu: uzun metin kayırmasın diye 30 token'lık pencereye bölünür.
  const bodyWindows = Math.max(1, Math.ceil(bodyTokens.length / 30));

  const titleAndBody = [...titleTokens, ...bodyTokens];

  for (const category of CATEGORIES) {
    const keywordTokens = keywordTokensFor(category);

    let titleHits = 0;
    let bodyHits = 0;

    for (const keyword of keywordTokens) {
      titleHits += countPhraseMatches(titleTokens, keyword);
      bodyHits += countPhraseMatches(bodyTokens, keyword);
    }

    titleRaw[category] = titleHits;
    bodyRaw[category] = bodyHits / bodyWindows;

    const entities = (CLASSIFIER.entityLexicon[category] ?? []).map((name) =>
      tokenize(name, SUFFIXES),
    );
    let entityHits = 0;
    for (const entity of entities) {
      if (countPhraseMatches(titleAndBody, entity) > 0) entityHits += 1;
    }
    entityRaw[category] = entityHits;
  }

  if (input.feedCategory) {
    const match = CATEGORIES.find(
      (category) =>
        category.toLocaleLowerCase("tr-TR") ===
        input.feedCategory!.trim().toLocaleLowerCase("tr-TR"),
    );
    if (match) feedRaw[match] = 1;
  }

  const titleP = normalizeDistribution(titleRaw);
  const bodyP = normalizeDistribution(bodyRaw);
  const entityP = normalizeDistribution(entityRaw);

  const scores: Record<string, number> = {};
  for (const category of CATEGORIES) {
    scores[category] =
      CLASSIFIER.signals.titleKeyword * titleP[category] +
      CLASSIFIER.signals.bodyKeywordDensity * bodyP[category] +
      CLASSIFIER.signals.feedDefault * feedRaw[category] +
      CLASSIFIER.signals.entityLexicon * entityP[category];
  }

  const ranked = CATEGORIES.map((category) => ({
    category,
    score: scores[category],
  })).sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const runnerUp = ranked[1];
  const allZero = top.score <= 0;
  const ambiguous =
    allZero || (runnerUp ? top.score - runnerUp.score < CLASSIFIER.ambiguityMargin : false);

  const primary = ambiguous ? FALLBACK_CATEGORY : top.category;

  const secondary = ambiguous
    ? []
    : ranked
        .filter(
          (item) =>
            item.category !== primary && item.score >= CLASSIFIER.secondaryMin,
        )
        .slice(0, CLASSIFIER.maxSecondary)
        .map((item) => item.category);

  // ── Etiketler: @kategori-slug + varlık etiketleri (en fazla 5) ────────────
  const tags: string[] = [];
  const pushTag = (tag: string) => {
    if (tags.length >= CLASSIFIER.maxTagsTotal) return;
    if (!tags.includes(tag)) tags.push(tag);
  };

  pushTag(`@${toSlug(CATEGORY_HANDLES[primary] ?? "diger")}`);
  for (const category of secondary) pushTag(`@${toSlug(CATEGORY_HANDLES[category])}`);

  let entityTagCount = 0;
  for (const category of [top.category, ...secondary]) {
    for (const name of CLASSIFIER.entityLexicon[category] ?? []) {
      if (entityTagCount >= CLASSIFIER.maxEntityTags) break;
      const tokens = tokenize(name, SUFFIXES);
      if (countPhraseMatches(titleAndBody, tokens) === 0) continue;
      // Görünen etiket: orijinal yazım değil, slug (kişisel veri taşımaz).
      const slug = toSlug(tokens.join("-"));
      pushTag(`@${slug}`);
      entityTagCount += 1;
    }
  }

  return {
    scores,
    primary,
    secondary,
    ambiguous,
    tags,
    signals: { title: titleRaw, body: bodyRaw, feed: feedRaw, entity: entityRaw },
  };
}
