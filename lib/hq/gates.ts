import { CITATION } from "./config";
import { foldTurkish } from "./normalize";

/**
 * 8 otomatik kalite kapısı. Geçmeyen portre yayına gitmez.
 * 3, 4, 5 numaralı kapılar "hard" (hukuk) kapılarıdır: uyarı değil, BLOK.
 */

export type GateDraft = {
  title: string;
  subtitle: string;
  whyNow: { text: string }[];
  timeline: { text: string }[];
  keyFacts: { text: string }[];
  transparencyNote?: string | null;
};

export type GateSource = {
  url: string;
  domain: string;
  text: string;
  /** Araştırma sırasında yapılan canlılık kontrolü. */
  alive: boolean;
};

export type GateInput = {
  draft: GateDraft;
  sources: GateSource[];
  independentSourceCount: number;
  /** Yayımlanmış portrelerle en yüksek metin benzerliği (0-1). */
  maxSimilarity: number;
  coveredRecently: boolean;
};

export type GateResult = {
  id: number;
  label: string;
  ok: boolean;
  hard: boolean;
  detail?: string;
};

export type GatesOutcome = {
  passed: boolean;
  hardBlocked: boolean;
  updateMode: boolean;
  gates: GateResult[];
  reasons: string[];
};

// ─── KVKK md.6 — özel nitelikli kişisel veri sözlüğü ────────────────────────
const SPECIAL_CATEGORY: { label: string; terms: string[] }[] = [
  { label: "sağlık", terms: ["hastalik", "kanser", "diyabet", "psikiyatri", "engelli", "ameliyat", "teshis", "hamilelik", "hiv"] },
  { label: "cinsel hayat", terms: ["cinsel", "cinsel hayat", "cinsel yonelim", "escinsel"] },
  { label: "din", terms: ["musluman", "hristiyan", "yahudi", "alevi", "namaz", "ibadet", "dini inanc"] },
  { label: "etnik köken", terms: ["etnik", "kurt kokenli", "ermeni kokenli", "arap kokenli", "irk"] },
  { label: "siyasi görüş", terms: ["siyasi gorus", "parti uyeligi", "oy tercihi"] },
  { label: "sendika üyeliği", terms: ["sendika uyeligi", "sendikali"] },
  { label: "adli sicil", terms: ["adli sicil", "sabikali", "hukum giymis", "mahkumiyet kaydi"] },
];

export function findSpecialCategoryViolation(
  text: string,
): { label: string; match: string } | null {
  const folded = foldTurkish(text);
  for (const group of SPECIAL_CATEGORY) {
    for (const term of group.terms) {
      if (folded.includes(term)) return { label: group.label, match: term };
    }
  }
  return null;
}

const MINOR_ROLE_TERMS = ["cocuk", "bebek", "ogrenci", "kucuk yasta", "ilkokul", "ortaokul", "lise ogrencisi"];
const AGE_PATTERN = /(\d{1,2})\s*ya(sinda|sindaki|sina)\b/gi;

/** Reşit olmayan kişi: yaş (0-17) veya yaş + rol birlikte geçiyorsa. */
export function findMinorSubject(text: string): string | null {
  const folded = foldTurkish(text);

  for (const match of text.matchAll(AGE_PATTERN)) {
    const age = Number(match[1]);
    if (age <= 17) return `${age} yaşında ifadesi`;
  }

  // Yaş belirtilmese de "çocuk/öğrenci + isim" kombinasyonu risklidir.
  const role = MINOR_ROLE_TERMS.find((term) => folded.includes(term));
  if (role) {
    const hasAgeWord = folded.includes("yasinda") || /\d{1,2}\s*yas/.test(folded);
    if (hasAgeWord) return `${role} + yaş`;
    // Rol tek başına ise yalnızca "adı" bağlamı varsa blokla.
    if (folded.includes("adi") || folded.includes("adli") || folded.includes("kimligi")) {
      return `${role} + kimlik`;
    }
  }

  return null;
}

const ACCUSATION_TERMS = [
  "suclu", "hirsiz", "yolsuzluk", "dolandirici", "sahtekar", "casus",
  "terorist", "ruşvet", "rusvet", "zimmet", "kaçakçı", "kacakci",
];

export function findUnverifiedAccusation(
  title: string,
  sources: GateSource[],
): string | null {
  const foldedTitle = foldTurkish(title);

  for (const term of ACCUSATION_TERMS) {
    if (!foldedTitle.includes(term)) continue;

    const supported = sources.some((source) => foldTurkish(source.text).includes(term));
    if (!supported) return `başlıkta “${term}” var, kaynaklarda doğrulanamadı`;
  }

  return null;
}

function wordCount(value: string): number {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

export function runQualityGates(input: GateInput): GatesOutcome {
  const { draft, sources, independentSourceCount, maxSimilarity, coveredRecently } = input;
  const gates: GateResult[] = [];

  const add = (id: number, label: string, ok: boolean, hard: boolean, detail?: string) => {
    gates.push({ id, label, ok, hard, detail });
  };

  // 1) En az 3 bağımsız kaynak
  add(
    1,
    "En az 3 bağımsız kaynak",
    independentSourceCount >= 3,
    true,
    `bağımsız kaynak: ${independentSourceCount}`,
  );

  // 2) Her bölüm dolu
  const structureOk =
    wordCount(draft.subtitle) > 0 &&
    wordCount(draft.subtitle) <= 25 &&
    draft.whyNow.length === 3 &&
    draft.timeline.length >= 4 &&
    draft.keyFacts.length === 5 &&
    sources.length >= 3 &&
    Boolean(draft.transparencyNote && draft.transparencyNote.trim().length > 10);

  add(
    2,
    "Bölümler dolu (özet≤25 kelime, 3 madde, ≥4 durak, 5 madde, kaynaklar, şeffaflık)",
    structureOk,
    true,
    `özet:${wordCount(draft.subtitle)} whyNow:${draft.whyNow.length} kronoloji:${draft.timeline.length} facts:${draft.keyFacts.length} kaynak:${sources.length}`,
  );

  const fullText = [
    draft.title,
    draft.subtitle,
    ...draft.whyNow.map((item) => item.text),
    ...draft.timeline.map((item) => item.text),
    ...draft.keyFacts.map((item) => item.text),
  ].join(" ");

  // 3) KVKK md.6 — özel nitelikli kişisel veri
  const violation = findSpecialCategoryViolation(fullText);
  add(
    3,
    "Özel nitelikli kişisel veri yok (KVKK md.6)",
    violation === null,
    true,
    violation ? `${violation.label}: “${violation.match}”` : undefined,
  );

  // 4) Reşit olmayan kişi
  const minor = findMinorSubject(fullText);
  add(
    4,
    "Reşit olmayan kişi yok",
    minor === null,
    true,
    minor ? `tespit: ${minor}` : undefined,
  );

  // 5) Doğrulanmamış suçlama başlıkta
  const accusation = findUnverifiedAccusation(draft.title, sources);
  add(
    5,
    "Doğrulanmamış suçlama başlıkta değil",
    accusation === null,
    true,
    accusation ?? undefined,
  );

  // 6) Ölü kaynak linki
  const dead = sources.filter((source) => !source.alive);
  add(
    6,
    "Ölü kaynak linki yok",
    dead.length === 0,
    true,
    dead.length > 0 ? `ölü: ${dead.map((source) => source.domain).join(", ")}` : undefined,
  );

  // 7) 7 gün kuralı — yeni üretim yerine güncelleme modu
  add(
    7,
    "Son 7 günde aynı konu işlenmedi",
    !coveredRecently,
    false,
    coveredRecently ? "güncelleme moduna geçilir, yeni portre üretilmez" : undefined,
  );

  // 8) Metin benzerliği
  add(
    8,
    "Mevcut portrelerle benzerlik %85 altında",
    maxSimilarity < 0.85,
    true,
    `benzerlik: ${(maxSimilarity * 100).toFixed(1)}%`,
  );

  const reasons = gates.filter((gate) => !gate.ok).map((gate) => `${gate.id}. ${gate.label}${gate.detail ? ` — ${gate.detail}` : ""}`);
  const hardBlocked = gates.some((gate) => gate.hard && !gate.ok);

  return {
    passed: reasons.length === 0,
    hardBlocked,
    updateMode: coveredRecently,
    gates,
    reasons,
  };
}
