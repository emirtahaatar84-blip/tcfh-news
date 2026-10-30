/**
 * Gövde içi atıf üretimi — "altılı çapraz bağ".
 *
 * Atıflar sunucu tarafında, içerik render edilirken (build/render anında)
 * deterministik olarak kurulur:
 *
 *   1. İçerik gövdesindeki özel ad ifadeleri (kişi/kurum/yer/olay)
 *      çıkarılır.
 *   2. Bu ifade, kendi sitemizde DAHA ÖNCE yayımlanmış bir içeriğin
 *      başlığında geçiyorsa hedef adayı olur.
 *   3. En fazla 5 atıf, hedef başına en fazla 1 atıf üretilir.
 *
 * Tarayıcıda arama, istek veya analitik YOKTUR. Aday dizini 60 saniye
 * boyunca süreç belleğinde tutulur; kişisel veri içermez.
 */

import { prisma } from "@/lib/prisma";
import { CITATION as CITATION_CONFIG } from "@/lib/hq/config";
import { resolveCitationPairs } from "@/lib/hq/citation";
import { estimateSeconds, splitSentences } from "@/lib/speech-text";
import { truncate } from "@/lib/utils";
import type {
  CitationAnchor,
  CitationPreview,
  CitationTopicType,
  TextPart,
} from "@/lib/citation-types";

export const MAX_CITATIONS = 3; // İŞ 4.4 — 5'ten düşürüldü (yanlış atıf riski)
export const MAX_PHRASE_WORDS = 12;
export const MAX_FIRST_SENTENCE = 180;

export type IndexedTarget = {
  id: string;
  kind: "haber" | "portre";
  slug: string;
  title: string;
  titleNorm: string;
  summary: string;
  category: string;
  topicType: CitationTopicType;
  publishedAt: Date;
  updatedAt: Date | null;
  sourceCount: number;
  readingMinutes: number;
};

export type EntityMention = {
  text: string;
  start: number;
  end: number;
  /** Karşılaştırma için normalize edilmiş, bağlaçsız kelimeler. */
  tokens: string[];
};

const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu;

const CONNECTORS = new Set(["ve", "ile", "de", "da", "ki", "veya", "ya"]);

/**
 * Cümle başında büyük harfle yazılan ama özel ad olmayan kelimeler.
 * (Türkçede her cümle büyük harfle başladığı için bu filtre zorunlu.)
 */
const STOP_ENTITIES = new Set([
  "bu",
  "bir",
  "bugun",
  "dun",
  "son",
  "yeni",
  "ilk",
  "ancak",
  "ama",
  "fakat",
  "ve",
  "ile",
  "ote",
  "ayrica",
  "boylece",
  "dolayisiyla",
  "yani",
  "eger",
  "hem",
  "her",
  "bazi",
  "bircok",
  "tum",
  "turkiye",
  "ocak",
  "subat",
  "mart",
  "nisan",
  "mayis",
  "haziran",
  "temmuz",
  "agustos",
  "eylul",
  "ekim",
  "kasim",
  "aralik",
  "pazartesi",
  "sali",
  "carsamba",
  "persembe",
  "cuma",
  "cumartesi",
  "pazar",
  "dunya",
  "avrupa",
  "amerika",
  "asya",
  "afrika",
  "orta",
  "dogu",
  "bati",
  "kuzey",
  "guney",
]);

/** Türkçe küçük harfe indirger ve aksanları sadeleştirir. */
export function normalizeCitationText(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/\u0307/g, "")
    .replace(/[çÇ]/g, "c")
    .replace(/[ğĞ]/g, "g")
    .replace(/[ıİ]/g, "i")
    .replace(/[öÖ]/g, "o")
    .replace(/[şŞ]/g, "s")
    .replace(/[üÜ]/g, "u")
    .replace(/[âÂ]/g, "a")
    .replace(/[îÎ]/g, "i")
    .replace(/[ûÛ]/g, "u")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function isCapitalized(word: string): boolean {
  const first = Array.from(word)[0] ?? "";
  if (!first) return false;

  const upper = first.toLocaleUpperCase("tr-TR");
  const lower = first.toLocaleLowerCase("tr-TR");
  return first === upper && first !== lower;
}

/**
 * Metindeki özel ad ifadelerini (en fazla 12 kelime) konumlarıyla çıkarır.
 * Saf fonksiyondur; testlerde doğrudan çağrılır.
 */
export function extractEntityMentions(text: string): EntityMention[] {
  const words: { text: string; start: number; end: number }[] = [];

  for (const match of text.matchAll(WORD_RE)) {
    const start = match.index ?? 0;
    words.push({ text: match[0], start, end: start + match[0].length });
  }

  const mentions: EntityMention[] = [];
  let run: { text: string; start: number; end: number }[] = [];
  let previousEnd = -1;

  const flush = () => {
    while (run.length > 0 && CONNECTORS.has(normalizeCitationText(run[run.length - 1].text))) {
      run.pop();
    }

    if (run.length === 0) return;

    const raw = run;
    run = [];

    const rawText = text.slice(raw[0].start, raw[raw.length - 1].end);
    const rawWords = rawText.split(/\s+/).filter(Boolean);

    if (rawWords.length === 0 || rawWords.length > MAX_PHRASE_WORDS) return;

    const tokens = rawWords
      .map((word) => normalizeCitationText(word.split(/[’']/)[0] || word))
      .filter((token) => token.length > 0 && !CONNECTORS.has(token));

    if (tokens.length === 0) return;

    if (tokens.length === 1) {
      const token = tokens[0];
      // Tek kelimelik atıf için en az 4 karakter ve anlamlı bir ad gerekir.
      if (token.length < 4) return;
      if (STOP_ENTITIES.has(token)) return;
    }

    // En az bir kelime 3+ karakter olmalı (ör. "AB", "BM" gibi kısaltmalar
    // tek başına çok geniş eşleşir).
    if (!tokens.some((token) => token.length >= 3)) return;

    mentions.push({
      text: rawText,
      start: raw[0].start,
      end: raw[raw.length - 1].end,
      tokens,
    });

    // Çok kelimeli ifadenin ilk kelimesi de tek başına bir hedefe
    // eşleşebilir (ör. "Apple Vision Pro" → "Apple" haberi). Uzun ifade
    // her zaman önceliklidir.
    if (rawWords.length > 1) {
      const head = raw[0];
      const headToken = normalizeCitationText(
        head.text.split(/[’']/)[0] || head.text,
      );

      if (
        isCapitalized(head.text) &&
        headToken.length >= 5 &&
        !STOP_ENTITIES.has(headToken)
      ) {
        mentions.push({
          text: text.slice(head.start, head.end),
          start: head.start,
          end: head.end,
          tokens: [headToken],
        });
      }
    }
  };

  for (const word of words) {
    // Noktalama işareti özel adı böler: "Erdoğan, Türkiye" iki ayrı ifadedir.
    if (previousEnd >= 0) {
      const gap = text.slice(previousEnd, word.start);
      if (/[.,;:!?()[\]{}"“”…]|[-–—]/.test(gap)) {
        flush();
      }
    }
    previousEnd = word.end;

    const normalized = normalizeCitationText(word.text);
    const continuesRun =
      run.length > 0 &&
      (isCapitalized(word.text) || CONNECTORS.has(normalized));

    if (continuesRun) {
      if (run.length >= MAX_PHRASE_WORDS) {
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

// ─── Aday dizini (60 sn önbellek) ───────────────────────────────────────────

const INDEX_TTL_MS = 60_000;

let indexCache: { loadedAt: number; items: IndexedTarget[] } | null = null;

export async function loadCitationIndex(): Promise<IndexedTarget[]> {
  if (indexCache && Date.now() - indexCache.loadedAt < INDEX_TTL_MS) {
    return indexCache.items;
  }

  const [news, portraits] = await Promise.all([
    prisma.newsItem.findMany({
      where: { removedAt: null, slug: { not: null } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 400,
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        category: true,
        createdAt: true,
        auditedAt: true,
        sourcesCount: true,
        readingMinutes: true,
      },
    }),
    prisma.portrait.findMany({
      where: { status: "published", removedAt: null },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: 120,
      select: {
        id: true,
        slug: true,
        title: true,
        subtitle: true,
        category: true,
        publishedAt: true,
        updatedAt: true,
        subjectType: true,
        sourceCount: true,
        readingMinutes: true,
      },
    }),
  ]);

  const items: IndexedTarget[] = [];

  for (const row of news) {
    if (!row.slug) continue;

    items.push({
      id: row.id,
      kind: "haber",
      slug: row.slug,
      title: row.title,
      titleNorm: ` ${normalizeCitationText(row.title)} `,
      summary: row.summary,
      category: row.category,
      topicType: "olay",
      publishedAt: row.createdAt,
      updatedAt: row.auditedAt,
      sourceCount: row.sourcesCount,
      readingMinutes: row.readingMinutes,
    });
  }

  for (const row of portraits) {
    items.push({
      id: row.id,
      kind: "portre",
      slug: row.slug,
      title: row.title,
      titleNorm: ` ${normalizeCitationText(row.title)} `,
      summary: row.subtitle ?? row.title,
      category: row.category,
      topicType:
        row.subjectType === "kisi" || row.subjectType === "kurum"
          ? row.subjectType
          : "olay",
      publishedAt: row.publishedAt ?? row.updatedAt,
      updatedAt: row.updatedAt,
      sourceCount: row.sourceCount,
      readingMinutes: row.readingMinutes,
    });
  }

  indexCache = { loadedAt: Date.now(), items };
  return items;
}

/** Testler ve içerik güncellemeleri için önbelleği temizler. */
export function resetCitationIndex(): void {
  indexCache = null;
}

function firstSentenceOf(value: string): string {
  const plain = value.replace(/\s+/g, " ").trim();
  if (!plain) return "";

  const sentence = splitSentences(plain)[0] ?? plain;
  const trimmed = sentence.trim();

  return trimmed.length > MAX_FIRST_SENTENCE
    ? truncate(trimmed, MAX_FIRST_SENTENCE)
    : trimmed;
}

function toPreview(target: IndexedTarget, lang: string): CitationPreview {
  const href =
    target.kind === "portre"
      ? `/${lang}/portre/${target.slug}`
      : `/${lang}/haber/${target.slug}`;

  const listenMinutes = Math.max(
    1,
    Math.round(
      estimateSeconds(`${target.title} ${target.summary}`.slice(0, 1200)) / 60,
    ),
  );

  return {
    id: target.id,
    slug: target.slug,
    href,
    kind: target.kind,
    title: target.title,
    firstSentence: firstSentenceOf(target.summary),
    category: target.category,
    topicType: target.topicType,
    publishedAt: target.publishedAt.toISOString(),
    updatedAt: target.updatedAt?.toISOString() ?? null,
    sourceCount: target.sourceCount,
    readingTime: Math.max(1, target.readingMinutes),
    listenTime: listenMinutes,
  };
}

type CandidateMatch = {
  target: IndexedTarget;
  score: number;
};

/**
 * Bir ifade için yayımlanmış hedef adaylarını puanlar. Yalnızca mevcut
 * içerikten ÖNCE yayımlanmış, farklı bir içerik hedef olabilir.
 */
export function rankCitationCandidates(
  mention: EntityMention,
  targets: IndexedTarget[],
  current: {
    id: string;
    kind: "haber" | "portre";
    publishedAt: Date;
    titleNorm?: string;
  },
): CandidateMatch[] {
  const phraseNorm = mention.tokens.join(" ");
  if (!phraseNorm) return [];

  const matches: CandidateMatch[] = [];

  for (const target of targets) {
    if (target.id === current.id && target.kind === current.kind) continue;
    if (target.publishedAt.getTime() >= current.publishedAt.getTime()) continue;
    if (current.titleNorm && target.titleNorm === current.titleNorm) continue;

    if (!target.titleNorm.includes(` ${phraseNorm} `)) continue;

    const ageDays = Math.max(
      0,
      (current.publishedAt.getTime() - target.publishedAt.getTime()) /
        (24 * 60 * 60 * 1000),
    );

    const score =
      mention.tokens.length * 50 +
      Math.min(30, Math.round(30 - ageDays)) +
      Math.min(10, target.sourceCount);

    matches.push({ target, score });
  }

  return matches.sort((a, b) => b.score - a.score);
}

/**
 * İŞ 4 — Atıf çözümleme (yeni algoritma).
 *
 * Kesinlik > kapsama. Dört zorunlu ön koşul sağlanmazsa atıf KURULMAZ:
 *   1. Hedef en az 1 saat daha eski.
 *   2. En az 1 ortak spesifik varlık (kategori adı sayılmaz).
 *   3. Aynı olay / doğrudan devamı.
 *   4. Atıf ifadesi hedef metninde gerçekten geçiyor (%90 benzerlik).
 * Ardından ağırlıklı AtıfSkoru eşiği uygulanır (varsayılan 0.80,
 * hassas cümlelerde 0.90). İçerik başına en fazla 3 atıf.
 */
export async function resolveCitations(input: {
  lang: string;
  kind: "haber" | "portre";
  id: string;
  title: string;
  publishedAt: string | null;
  texts: string[];
}): Promise<CitationAnchor[]> {
  const paragraphs = input.texts
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter((text) => text.length >= 24);

  if (paragraphs.length === 0) return [];

  let targets: IndexedTarget[];

  try {
    targets = await loadCitationIndex();
  } catch {
    // Veritabanı okunamazsa atıf üretme — uydurma bağlantı yok.
    return [];
  }

  if (targets.length === 0) return [];

  const publishedAt = input.publishedAt ? new Date(input.publishedAt) : new Date();
  const currentPublishedAt = Number.isNaN(publishedAt.getTime()) ? new Date() : publishedAt;

  // Atıf yalnızca ilk 3 paragrafta kurulur.
  const scopedParagraphs = paragraphs.slice(0, CITATION_CONFIG.maxParagraphs);
  const currentText = scopedParagraphs.join(" ");

  let blacklisted: Set<string>;
  try {
    blacklisted = await loadCitationBlacklist(input.kind, input.id);
  } catch {
    blacklisted = new Set();
  }

  const outcomes = resolveCitationPairs(
    {
      id: input.id,
      kind: input.kind,
      title: input.title,
      text: currentText,
      paragraphs: scopedParagraphs,
      category: "",
      publishedAt: currentPublishedAt,
      clusterKey: null,
    },
    targets
      .filter((target) => !(target.kind === input.kind && target.id === input.id))
      .map((target) => ({
        id: target.id,
        kind: target.kind,
        title: target.title,
        text: target.summary,
        category: target.category,
        publishedAt: target.publishedAt,
        clusterKey: null,
      })),
    { blacklisted, threshold: await currentThreshold() },
  );

  const byId = new Map(targets.map((target) => [target.id, target]));

  return outcomes.anchors
    .map((outcome) => {
      const target = byId.get(outcome.targetId);
      if (!target) return null;
      const preview = toPreview(target, input.lang);

      const anchor: CitationAnchor = {
        targetId: outcome.targetId,
        phrase: outcome.anchor ?? target.title,
        href: preview.href,
        preview,
      };

      // Denetim izi: her atıf kayıt altına alınır (İŞ 4.5).
      void recordCitation(input, outcome);
      return anchor;
    })
    .filter((anchor): anchor is CitationAnchor => anchor !== null);
}

/** 4.5 — Atıf kaydı (fire-and-forget; render'ı asla bloklamaz). */
async function recordCitation(
  input: { kind: "haber" | "portre"; id: string },
  outcome: { targetId: string; score: number; commonEntities: string[]; anchor: string | null },
): Promise<void> {
  try {
    await prisma.citation.create({
      data: {
        fromKind: input.kind,
        fromId: input.id,
        toKind: "haber",
        toId: outcome.targetId,
        score: outcome.score,
        entities: JSON.stringify(outcome.commonEntities),
        anchor: outcome.anchor,
        rule: "auto",
      },
    });
  } catch {
    // Tablo yoksa veya yazma başarısızsa atıf yine çalışır.
  }
}

/** Kara liste: aynı çift bir daha eşleşmez. */
export async function loadCitationBlacklist(
  kind: string,
  id: string,
): Promise<Set<string>> {
  const rows = await prisma.citationBlacklist.findMany({
    where: { fromKind: kind, fromId: id },
    select: { toId: true },
  });
  return new Set(rows.map((row) => row.toId));
}

/** Sistem ayarındaki güncel eşik (otomatik denetim yükseltebilir). */
export async function currentThreshold(): Promise<number> {
  try {
    const row = await prisma.systemSettings.findFirst({
      select: { citationThreshold: true },
    });
    return row?.citationThreshold ?? CITATION_CONFIG.threshold;
  } catch {
    return CITATION_CONFIG.threshold;
  }
}

/**
 * Bir metni atıf parçalarına böler. Her hedef içerik toplamda yalnızca bir
 * kez işaretlenir; `used` çağıran tarafından içerik başına oluşturulur.
 * Saf fonksiyondur.
 */
export function annotateText(
  text: string,
  anchors: CitationAnchor[],
  used: Set<string>,
): TextPart[] {
  if (anchors.length === 0 || text.length === 0) return [{ text }];

  const parts: TextPart[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    let best: { index: number; anchor: CitationAnchor } | null = null;

    for (const anchor of anchors) {
      if (used.has(anchor.targetId)) continue;

      const index = text.indexOf(anchor.phrase, cursor);
      if (index === -1) continue;

      if (
        !best ||
        index < best.index ||
        (index === best.index &&
          anchor.phrase.length > best.anchor.phrase.length)
      ) {
        best = { index, anchor };
      }
    }

    if (!best) break;

    // Güvenlik: boş ifade cursor'ı ilerletmez → sonsuz döngü.
    if (!best.anchor.phrase) {
      used.add(best.anchor.targetId);
      continue;
    }

    if (best.index > cursor) {
      parts.push({ text: text.slice(cursor, best.index) });
    }

    parts.push({ text: best.anchor.phrase, citation: best.anchor });
    used.add(best.anchor.targetId);
    cursor = best.index + best.anchor.phrase.length;
  }

  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor) });
  }

  return parts.length > 0 ? parts : [{ text }];
}
