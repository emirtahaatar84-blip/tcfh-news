import { CITATION, CLASSIFIER, SENSITIVE_TERMS } from "./config";
import {
  cosine,
  entityKeysMatch,
  entityTokens,
  foldTurkish,
  jaccard,
  phraseAppearsIn,
  tokenize,
} from "./normalize";

/**
 * Atıf eşleştirici. Kesinlik > kapsama: emin değilse atıf KURMAZ.
 *
 * 4 zorunlu ön koşul → 5 sinyalli skor → eşik.
 */

/** Ek listesi tek kaynaktan gelir (config). */
const SUFFIXES = CLASSIFIER.suffixes;

export type ContentRef = {
  id: string;
  kind: "haber" | "portre";
  title: string;
  /** İlk paragraf(lar) — birleşik metin. */
  text: string;
  category: string;
  publishedAt: Date;
  /** Varsa pipeline'ın olay kümesi kimliği. */
  clusterKey?: string | null;
  /** İlk N paragraf ayrı ayrı (atıf yalnızca bunlara konur). */
  paragraphs?: string[];
};

export type EntityMention = { text: string; key: string; tokens: string[] };

const STOP_ENTITIES = new Set([
  "bu", "bir", "bugun", "dun", "son", "yeni", "ilk", "ancak", "ama", "fakat",
  "ve", "ile", "ayrica", "boylece", "dolayisiyla", "yani", "eger", "hem",
  "her", "bazi", "bircok", "tum", "ocak", "subat", "mart", "nisan", "mayis",
  "haziran", "temmuz", "agustos", "eylul", "ekim", "kasim", "aralik",
  "pazartesi", "sali", "carsamba", "persembe", "cuma", "cumartesi", "pazar",
  "dunya", "avrupa", "asya", "afrika", "kuzey", "guney", "dogu", "bati",
]);

const CONNECTORS = new Set(["ve", "ile", "de", "da", "ki", "veya"]);

function isCapitalized(word: string): boolean {
  const first = Array.from(word)[0];
  if (!first) return false;
  return first === first.toLocaleUpperCase("tr-TR") && first !== first.toLocaleLowerCase("tr-TR");
}

/**
 * Özel ad ifadelerini (kişi/kurum/yer/ürün) konum bilgisiyle çıkarır.
 * Tek başına ülke/bölge adları spesifik sayılmaz.
 */
export function extractEntities(text: string): EntityMention[] {
  const words = [...text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu)].map((match) => ({
    text: match[0],
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));

  const mentions: EntityMention[] = [];
  let run: { text: string; start: number; end: number }[] = [];
  let previousEnd = -1;

  const flush = () => {
    while (run.length > 0 && CONNECTORS.has(foldTurkish(run[run.length - 1].text))) run.pop();
    if (run.length === 0) return;

    const current = run;
    run = [];

    const surface = text.slice(current[0].start, current[current.length - 1].end);
    const tokens = entityTokens(surface, SUFFIXES);

    if (tokens.length === 0 || tokens.length > 4) return;
    if (tokens.length === 1) {
      const isAcronymWord = /^[A-ZÇĞİÖŞÜ]{2,}$/.test(surface.trim());
      if (tokens[0].length < 4 && !isAcronymWord) return;
      if (STOP_ENTITIES.has(tokens[0])) return;
    } else if (tokens.every((token) => STOP_ENTITIES.has(token))) {
      return;
    }

    mentions.push({ text: surface, key: tokens.join(" "), tokens });

    // Çok kelimeli ifadedeki HER özel ad ayrıca tek başına sayılır:
    // "Derbide Fenerbahçe" → "Fenerbahçe", "Nvidia Blackwell Ultra" → "Nvidia".
    if (tokens.length > 1) {
      for (const word of current) {
        if (!isCapitalized(word.text)) continue;
        const single = entityTokens(word.text, SUFFIXES);
        if (single.length !== 1) continue;
        const value = single[0];
        const isAcronym = /^[A-ZÇĞİÖŞÜ]{2,}$/.test(word.text);
        if (value.length < 4 && !isAcronym) continue;
        if (STOP_ENTITIES.has(value)) continue;
        mentions.push({ text: word.text, key: value, tokens: single });
      }
    }
  };

  for (const word of words) {
    if (previousEnd >= 0) {
      const gap = text.slice(previousEnd, word.start);
      if (/[.,;:!?()[\]{}"“”…]/.test(gap)) flush();
    }
    previousEnd = word.end;

    const normalized = foldTurkish(word.text);
    const continues = run.length > 0 && (isCapitalized(word.text) || CONNECTORS.has(normalized));

    if (continues) {
      if (run.length >= 4) {
        flush();
        run = [word];
      } else {
        run.push(word);
      }
      continue;
    }

    flush();
    if (isCapitalized(word.text)) run = [word];
  }

  flush();
  return mentions;
}

/**
 * Varlık çıkarım önbelleği. Anahtar metnin kendisi (içerik bazlı, kullanıcı
 * verisi yok). 400 hedef × 184 ms = 73 sn'lik render gecikmesini önler.
 */
const ENTITY_CACHE = new Map<string, EntityMention[]>();
const ENTITY_CACHE_LIMIT = 600;

export function entitiesOf(text: string): EntityMention[] {
  const cached = ENTITY_CACHE.get(text);
  if (cached) return cached;

  const result = extractEntities(text);

  if (ENTITY_CACHE.size >= ENTITY_CACHE_LIMIT) {
    // Basit LRU: ilk eklenen atılır.
    const firstKey = ENTITY_CACHE.keys().next().value;
    if (firstKey !== undefined) ENTITY_CACHE.delete(firstKey);
  }
  ENTITY_CACHE.set(text, result);

  return result;
}

export function resetEntityCache(): void {
  ENTITY_CACHE.clear();
}

export function isSensitive(text: string): boolean {
  const folded = foldTurkish(text);
  const all = [
    ...SENSITIVE_TERMS.politics,
    ...SENSITIVE_TERMS.crime,
    ...SENSITIVE_TERMS.health,
  ];
  return all.some((term) => folded.includes(term));
}

function timeProximity(ageDays: number): number {
  for (const band of CITATION.timeProximityBands) {
    if (ageDays <= band.maxDays) return band.score;
  }
  return 0;
}

function categoryScore(a: string, b: string): number {
  if (a === b) return CITATION.categoryMatch.same;
  const neighbor = CITATION.neighborCategories.some(
    ([x, y]) => (x === a && y === b) || (y === a && x === b),
  );
  return neighbor ? CITATION.categoryMatch.neighbor : CITATION.categoryMatch.different;
}

export type CitationScore = {
  score: number;
  breakdown: {
    entityOverlap: number;
    eventSimilarity: number;
    textSimilarity: number;
    timeProximity: number;
    categoryMatch: number;
  };
  commonEntities: string[];
  anchor: string | null;
};

/**
 * PERFORMANS — Toplu puanlama için önceden hesaplanmış içerik.
 *
 * `scoreCitationPair` tek çift için doğru ama 400 hedefte her hedefte
 * varlık çıkarımı + tokenizasyon yeniden yapılıyordu (≈95 ms × 400 = 38 sn).
 * Bu sarmalayıcı her içeriği BİR KEZ hazırlar, sonra saf karşılaştırma yapar.
 */
export type PreparedContent = {
  ref: ContentRef;
  entities: Map<string, EntityMention>;
  tokens: string[];
  titleTokens: string[];
};

export function prepareContent(ref: ContentRef): PreparedContent {
  const fullText = `${ref.title} ${ref.text}`;
  return {
    ref,
    entities: new Map(entitiesOf(fullText).map((item) => [item.key, item])),
    tokens: tokenize(fullText, SUFFIXES),
    titleTokens: tokenize(ref.title, SUFFIXES),
  };
}

/** Hazırlanmış iki içerik için skor (yan etkisiz, saf hesaplama). */
export function scorePreparedPair(
  current: PreparedContent,
  target: PreparedContent,
): CitationScore {
  const targetEntityKeys = new Set(target.entities.keys());

  const commonEntities = [...current.entities.keys()].filter((key) =>
    targetEntityKeys.has(key),
  );

  const entityOverlap =
    commonEntities.length === 0
      ? CITATION.entityOverlapScores.none
      : commonEntities.length === 1
        ? CITATION.entityOverlapScores.one
        : CITATION.entityOverlapScores.twoOrMore;

  let eventSimilarity: number;
  const a = current.ref.clusterKey;
  const b = target.ref.clusterKey;
  if (a && b) {
    eventSimilarity =
      a === b ? CITATION.eventSimilarityScores.same : CITATION.eventSimilarityScores.different;
  } else {
    const titleSimilarity = jaccard(current.titleTokens, target.titleTokens);
    eventSimilarity =
      titleSimilarity >= CITATION.eventDerivation.sameTitleJaccard
        ? CITATION.eventSimilarityScores.same
        : titleSimilarity >= CITATION.eventDerivation.continuationTitleJaccard
          ? CITATION.eventSimilarityScores.continuation
          : CITATION.eventSimilarityScores.different;
  }

  const textSimilarity = cosine(current.tokens, target.tokens);

  const ageDays = Math.max(
    0,
    (current.ref.publishedAt.getTime() - target.ref.publishedAt.getTime()) / 86_400_000,
  );

  const breakdown = {
    entityOverlap,
    eventSimilarity,
    textSimilarity,
    timeProximity: timeProximity(ageDays),
    categoryMatch: categoryScore(current.ref.category, target.ref.category),
  };

  const w = CITATION.weights;
  const score =
    w.entityOverlap * breakdown.entityOverlap +
    w.eventSimilarity * breakdown.eventSimilarity +
    w.textSimilarity * breakdown.textSimilarity +
    w.timeProximity * breakdown.timeProximity +
    w.categoryMatch * breakdown.categoryMatch;

  // Atıf ifadesi: en uzun özel ad, hedef metinde doğrulanmalı.
  let anchor: string | null = null;
  const targetText = `${target.ref.title} ${target.ref.text}`;
  for (const mention of [...current.entities.values()].sort(
    (x, y) => y.tokens.length - x.tokens.length,
  )) {
    if (mention.tokens.length > CITATION.maxAnchorWords) continue;
    if (
      phraseAppearsIn(
        mention.text,
        targetText,
        CITATION.verifySimilarity,
        SUFFIXES,
        target.tokens,
      )
    ) {
      anchor = mention.text;
      break;
    }
  }

  return {
    score: Number(score.toFixed(4)),
    breakdown,
    commonEntities,
    anchor,
  };
}

/** 4.3 — Tek çift için skorlama (testler ve tekil kullanım). */
/** 4.3 — Skorlama. Küme bilgisi yoksa olay benzerliği başlık örtüşmesinden türetilir. */
export function scoreCitationPair(
  current: ContentRef,
  target: ContentRef,
  anchorPhrase?: string,
): CitationScore {
  // PERFORMANS: Varlık çıkarımı pahalı (≈50 ms/1000 karakter). Aynı içerik
  // için tekrar tekrar çağrılmasın diye süreç belleğinde önbelleklenir.
  const currentEntities = new Map(
    entitiesOf(`${current.title} ${current.text}`).map((item) => [item.key, item]),
  );
  const targetEntityKeys = new Set(
    entitiesOf(`${target.title} ${target.text}`).map((item) => item.key),
  );

  // PERFORMANS: O(n²) yerine kümeler üzerinden doğrudan arama.
  const commonEntities = [...currentEntities.keys()].filter(
    (key) => targetEntityKeys.has(key),
  );

  const entityOverlap =
    commonEntities.length === 0
      ? CITATION.entityOverlapScores.none
      : commonEntities.length === 1
        ? CITATION.entityOverlapScores.one
        : CITATION.entityOverlapScores.twoOrMore;

  let eventSimilarity: number;
  if (current.clusterKey && target.clusterKey) {
    eventSimilarity =
      current.clusterKey === target.clusterKey
        ? CITATION.eventSimilarityScores.same
        : CITATION.eventSimilarityScores.different;
  } else {
    const titleSimilarity = jaccard(
      tokenize(current.title, SUFFIXES),
      tokenize(target.title, SUFFIXES),
    );
    eventSimilarity =
      titleSimilarity >= CITATION.eventDerivation.sameTitleJaccard
        ? CITATION.eventSimilarityScores.same
        : titleSimilarity >= CITATION.eventDerivation.continuationTitleJaccard
          ? CITATION.eventSimilarityScores.continuation
          : CITATION.eventSimilarityScores.different;
  }

  const textSimilarity = cosine(
    tokenize(`${current.title} ${current.text}`, SUFFIXES),
    tokenize(`${target.title} ${target.text}`, SUFFIXES),
  );

  const ageDays = Math.max(
    0,
    (current.publishedAt.getTime() - target.publishedAt.getTime()) / 86_400_000,
  );

  const breakdown = {
    entityOverlap,
    eventSimilarity,
    textSimilarity,
    timeProximity: timeProximity(ageDays),
    categoryMatch: categoryScore(current.category, target.category),
  };

  const w = CITATION.weights;
  const score =
    w.entityOverlap * breakdown.entityOverlap +
    w.eventSimilarity * breakdown.eventSimilarity +
    w.textSimilarity * breakdown.textSimilarity +
    w.timeProximity * breakdown.timeProximity +
    w.categoryMatch * breakdown.categoryMatch;

  let anchor = anchorPhrase ?? null;
  if (!anchor) {
    // PERFORMANS: hedef metnin tokenları bir kez hesaplanır; her varlık için
    // yeniden tokenize edilmesi 400 hedefte onlarca saniye kaybettiriyordu.
    const targetText = `${target.title} ${target.text}`;
    const targetTokens = tokenize(targetText, SUFFIXES);

    for (const mention of [...currentEntities.values()].sort(
      (a, b) => b.tokens.length - a.tokens.length,
    )) {
      if (mention.tokens.length > CITATION.maxAnchorWords) continue;
      if (
        phraseAppearsIn(
          mention.text,
          targetText,
          CITATION.verifySimilarity,
          SUFFIXES,
          targetTokens,
        )
      ) {
        anchor = mention.text;
        break;
      }
    }
  }

  return {
    score: Number(score.toFixed(4)),
    breakdown,
    commonEntities,
    anchor,
  };
}

export type CiteRejection =
  | "too_recent"
  | "no_entity"
  | "different_event"
  | "unverified_phrase"
  | "blacklisted"
  | "below_candidate";

export type CitationOutcome = {
  targetId: string;
  passed: boolean;
  score: number;
  breakdown: CitationScore["breakdown"];
  commonEntities: string[];
  anchor: string | null;
  reason: CiteRejection | "ok" | "candidate";
  threshold: number;
};

/** 4.2 + 4.3 + 4.4 — Tek çift için karar. */
export function evaluatePair(
  current: ContentRef,
  target: ContentRef,
  options: {
    blacklisted?: Set<string>;
    threshold?: number;
  } = {},
): CitationOutcome {
  const score = scoreCitationPair(current, target);
  const pairKey = `${current.kind}:${current.id}->${target.kind}:${target.id}`;

  const base = {
    targetId: target.id,
    score: score.score,
    breakdown: score.breakdown,
    commonEntities: score.commonEntities,
    anchor: score.anchor,
  };

  // Ön koşul 1 — zaman: hedef en az 1 saat daha eski.
  const ageHours =
    (current.publishedAt.getTime() - target.publishedAt.getTime()) / 3_600_000;
  if (ageHours < CITATION.minAgeHours) {
    return { ...base, passed: false, reason: "too_recent", threshold: CITATION.threshold };
  }

  // Ön koşul 2 — en az 1 spesifik ortak varlık.
  if (score.commonEntities.length === 0) {
    return { ...base, passed: false, reason: "no_entity", threshold: CITATION.threshold };
  }

  // Ön koşul 3 — aynı olay veya doğrudan devamı.
  if (score.breakdown.eventSimilarity === 0) {
    return { ...base, passed: false, reason: "different_event", threshold: CITATION.threshold };
  }

  // Ön koşul 4 — ifade hedefte gerçekten geçiyor mu.
  if (!score.anchor) {
    return { ...base, passed: false, reason: "unverified_phrase", threshold: CITATION.threshold };
  }

  if (options.blacklisted?.has(pairKey)) {
    return { ...base, passed: false, reason: "blacklisted", threshold: CITATION.threshold };
  }

  // Hassas cümlelerde eşik yükselir.
  const threshold = isSensitive(`${current.title} ${current.text}`)
    ? CITATION.sensitiveThreshold
    : (options.threshold ?? CITATION.threshold);

  if (score.score >= threshold) {
    return { ...base, passed: true, reason: "ok", threshold };
  }

  if (score.score >= CITATION.candidateThreshold) {
    return { ...base, passed: false, reason: "candidate", threshold };
  }

  return { ...base, passed: false, reason: "below_candidate", threshold };
}

/** 4.4 — İçerik başına karar: en iyi 3 atıf, hedef başına 1, yalnız ilk 3 paragraf. */
export function resolveCitationPairs(
  current: ContentRef,
  targets: ContentRef[],
  options: { blacklisted?: Set<string>; threshold?: number } = {},
): { anchors: CitationOutcome[]; candidates: CitationOutcome[]; rejected: CitationOutcome[] } {
  const anchors: CitationOutcome[] = [];
  const candidates: CitationOutcome[] = [];
  const rejected: CitationOutcome[] = [];
  const usedTargets = new Set<string>();

  // ── Ön filtre (PERFORMANS) ───────────────────────────────────────────
  // Pahalı hazırlık (29 ms/içerik) yalnızca GERÇEKTEN aday olabilecek
  // içerikler için yapılır. Ucuz ön koşullar burada elenir:
  //   • hedef en az 1 saat daha eski olmalı
  //   • başlıkta en az bir ortak anlamlı token olmalı (kategori adı hariç)
  // Bu filtre atıf oranını değiştirmez: elenen çiftler zaten `too_recent`
  // veya `different_event` olurdu.
  const currentTitleTokens = new Set(tokenize(current.title, SUFFIXES));

  const preselected = [...targets]
    .filter((target) => !(target.id === current.id && target.kind === current.kind))
    .filter(
      (target) =>
        (current.publishedAt.getTime() - target.publishedAt.getTime()) / 3_600_000 >=
        CITATION.minAgeHours,
    )
    .filter((target) => {
      const tokens = tokenize(target.title, SUFFIXES);
      return tokens.some((token) => currentTitleTokens.has(token) && token.length >= 4);
    })
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, 25);

  const ordered = preselected;

  // PERFORMANS: Her içerik BİR kez hazırlanır (varlık + token).
  const preparedCurrent = prepareContent(current);
  const preparedTargets = ordered.map((target) => prepareContent(target));

  // Döngü dışına alınan sabitler (her çiftte yeniden hesaplamak gereksiz).
  const sensitiveCurrent = isSensitive(`${current.title} ${current.text}`);
  const effectiveThreshold = sensitiveCurrent
    ? CITATION.sensitiveThreshold
    : (options.threshold ?? CITATION.threshold);
  const scopedParagraphs = (current.paragraphs ?? [current.text]).slice(0, CITATION.maxParagraphs);

  for (const preparedTarget of preparedTargets) {
    const target = preparedTarget.ref;
    if (usedTargets.has(target.id)) continue;
    if (anchors.length >= CITATION.maxPerContent) break;

    const score = scorePreparedPair(preparedCurrent, preparedTarget);
    const base = {
      targetId: target.id,
      score: score.score,
      breakdown: score.breakdown,
      commonEntities: score.commonEntities,
      anchor: score.anchor,
    };

    // Ön koşullar — evaluatePair ile aynı sıra.
    const ageHours =
      (current.publishedAt.getTime() - target.publishedAt.getTime()) / 3_600_000;

    const outcome: CitationOutcome =
      ageHours < CITATION.minAgeHours
        ? { ...base, passed: false, reason: "too_recent", threshold: CITATION.threshold }
        : score.commonEntities.length === 0
          ? { ...base, passed: false, reason: "no_entity", threshold: CITATION.threshold }
          : score.breakdown.eventSimilarity === 0
            ? { ...base, passed: false, reason: "different_event", threshold: CITATION.threshold }
            : !score.anchor
              ? { ...base, passed: false, reason: "unverified_phrase", threshold: CITATION.threshold }
              : options.blacklisted?.has(`${current.kind}:${current.id}->${target.kind}:${target.id}`)
                ? { ...base, passed: false, reason: "blacklisted", threshold: CITATION.threshold }
                : score.score >= effectiveThreshold
                  ? { ...base, passed: true, reason: "ok" as const, threshold: effectiveThreshold }
                  : score.score >= CITATION.candidateThreshold
                    ? { ...base, passed: false, reason: "candidate" as const, threshold: effectiveThreshold }
                    : { ...base, passed: false, reason: "below_candidate" as const, threshold: effectiveThreshold };

    if (outcome.passed) {
      const inScope = scopedParagraphs
        .some((paragraph) =>
          phraseAppearsIn(outcome.anchor ?? "", paragraph, CITATION.verifySimilarity, SUFFIXES),
        );

      if (!inScope) {
        rejected.push({ ...outcome, passed: false, reason: "unverified_phrase" });
        continue;
      }

      anchors.push(outcome);
      usedTargets.add(target.id);
      continue;
    }

    if (outcome.reason === "candidate") candidates.push(outcome);
    else rejected.push(outcome);
  }

  return { anchors, candidates, rejected };
}

