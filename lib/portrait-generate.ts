import { AiUnavailableError, complete } from "@/lib/ai";
import { foldTurkish, readingTimeMinutes } from "@/lib/utils";
import type { FeedStory } from "@/lib/kantan-feed";
import type { ResearchSource } from "@/lib/research";
import type { StoryScore } from "@/lib/portrait-score";

/**
 * Portre taslağı üretimi ve otomatik kontroller (Ek Bölüm 9.4 / 9.7).
 *
 * Tasarım kararı: model YALNIZCA araştırmada toplanan numaralı kaynaklarla
 * beslenir ve her iddia için `sourceIndex` ister. Böylece "kaynak zorunlu"
 * kuralı yapısal olarak uygulanır; kaynak dışı cümle denetimde yakalanır.
 */

export type ClaimItem = { text: string; sourceIndex: number };

export type TimelineItem = {
  date: string;
  text: string;
  sourceIndex: number;
};

export type QuoteBlock = {
  text: string;
  speaker: string;
  date: string;
  sourceIndex: number;
};

export type FaqItem = {
  question: string;
  answer: string;
  sourceIndex: number;
};

export type PortraitDraft = {
  title: string;
  subtitle: string;
  subjectType: "kisi" | "kurum" | "olay";
  subjectName: string | null;
  whyNow: ClaimItem[];
  timeline: TimelineItem[];
  keyFacts: ClaimItem[];
  quote: QuoteBlock | null;
  faqs: FaqItem[];
  updateNote: string | null;
  /** Kaynaklar çelişiyorsa iki tarafı da veren not. */
  conflictNote: string | null;
};

export type GenerationResult =
  | {
      ok: true;
      draft: PortraitDraft;
      readingMinutes: number;
      model: string;
      warnings: string[];
    }
  | { ok: false; error: string; notes: string[] };

// ─── KVKK md. 6 — özel nitelikli kişisel veri kalıpları ─────────────────────

const SPECIAL_CATEGORY_PATTERNS: { label: string; pattern: RegExp }[] = [
  {
    label: "sağlık/engellilik durumu",
    pattern:
      /\b(sağlık durumu|saglik durumu|hastalığı|hastaligi|hastalık geçmişi|hastalik gecmisi|teşhis|teshis|engelli|engellilik|psikolojik rahatsızlık|psikolojik rahatsizlik|ruh sağlığı|ruh sagligi|madde bağımlılığı|madde bagimliligi|alkol bağımlılığı|alkol bagimliligi|kumar bağımlılığı|kumar bagimliligi|uyuşturucu|uyusturucu|bağımlılık tedavisi|bagimlilik tedavisi|tedavi gördü|tedavi gordu|ameliyat oldu|hastanede tedavi)\b/iu,
  },
  {
    label: "cinsel hayat",
    pattern: /\b(cinsel hayat|cinsel yönelim|cinsel yonelim|seksüel|seksuel|ilişki yaşadı|iliski yasadi)\b/iu,
  },
  {
    label: "din/inanç",
    pattern: /\b(dindar|dini inanç|dini inanc|inanç grubu|inanc grubu|mezhep|ateist|müslüman oldu|musluman oldu)\b/iu,
  },
  {
    label: "etnik köken",
    pattern: /\b(etnik köken|etnik koken|etnik kimlik|kürt kökenli|kurt kokenli|ermeni kökenli|ermeni kokenli)\b/iu,
  },
  {
    label: "siyasi görüş",
    pattern: /\b(siyasi görüşü|siyasi gorusu|parti üyeliği|parti uyeligi|oy verdi|oyverdi)\b/iu,
  },
  {
    label: "sendika/dernek üyeliği",
    pattern: /\b(sendika üyeliği|sendika uyeligi|dernek üyeliği|dernek uyeligi)\b/iu,
  },
  {
    label: "adli sicil",
    pattern: /\b(adli sicil|sabıka|sabika|hüküm giydi|hukum giydi|mahkum oldu)\b/iu,
  },
  {
    label: "reşit olmayan",
    pattern:
      /\b(\d{1,2} yaşındaki|\d{1,2} yasindaki|çocuk gelin|cocuk gelin|reşit olmayan|resit olmayan|18 yaş altı|18 yas alti)\b/iu,
  },
];

export function findSpecialCategoryViolation(
  text: string,
): { label: string; match: string } | null {
  for (const rule of SPECIAL_CATEGORY_PATTERNS) {
    const match = text.match(rule.pattern);
    if (match) return { label: rule.label, match: match[0] };
  }
  return null;
}

// ─── Yardımcılar ────────────────────────────────────────────────────────────

export function slugify(title: string): string {
  const map: Record<string, string> = {
    ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u",
    Ç: "c", Ğ: "g", İ: "i", Ö: "o", Ş: "s", Ü: "u",
  };

  return title
    .split("")
    .map((char) => map[char] ?? char)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const MONTHS_TR: Record<string, string> = {
  ocak: "01", şubat: "02", subat: "02", mart: "03", nisan: "04",
  mayıs: "05", mayis: "05", haziran: "06", temmuz: "07", ağustos: "08",
  agustos: "08", eylül: "09", eylul: "09", ekim: "10", kasım: "11",
  kasim: "11", aralık: "12", aralik: "12",
};

/**
 * Tarih ifadesini YYYY-MM-DD'ye normalize eder. Model bazen "25 Ekim 2026"
 * yazar; bunu olduğu gibi saklamak yerine ISO'ya çeviriyoruz.
 */
export function normalizeTimelineDate(value: string): string {
  const trimmed = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`;

  if (/^\d{4}$/.test(trimmed)) return `${trimmed}-01-01`;

  const match = trimmed.match(/^(\d{1,2})\s+([\p{L}]+)\s+(\d{4})$/u);
  if (match) {
    const day = match[1].padStart(2, "0");
    const month = MONTHS_TR[foldTurkish(match[2].toLowerCase())];
    if (month) return `${match[3]}-${month}-${day}`;
  }

  return "";
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Alıntının kaynak metinde birebir geçip geçmediğini denetler. */
function quoteAppearsInSource(quote: string, sourceText: string): boolean {
  const normalize = (value: string) =>
    foldTurkish(value.toLowerCase())
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();

  const needle = normalize(quote);
  const haystack = normalize(sourceText);

  if (needle.length < 15) return false;

  return haystack.includes(needle);
}

// ─── Prompt ─────────────────────────────────────────────────────────────────

function buildSourceBlock(sources: ResearchSource[]): string {
  return sources
    .map((source, index) => {
      const date = source.publishedAt
        ? source.publishedAt.toISOString().slice(0, 10)
        : "tarih yok";

      const label = source.isHistorical ? " [GEÇMİŞ BAĞLAM]" : "";

      return `[${index + 1}]${label} ${source.name} (${source.domain}) — ${date}
Başlık: ${source.title}
URL: ${source.url}
Metin: ${source.text.slice(0, 2200)}`;
    })
    .join("\n\n");
}

const SYSTEM_PROMPT = `Sen deneyimli bir Türk haber editörüsün. Görevin, yalnızca sana verilen numaralı kaynaklardan bir "Portre" sayfası taslağı üretmek.

KESİN KURALLAR:
- SADECE verilen kaynaklardaki bilgiyi kullan. Kaynakta olmayan hiçbir tarih, sayı, unvan, isim veya iddia yazma. Hesaplama/tahmin yapma.
- Her cümle bir kaynağa dayanmalı; her maddeye 1 tabanlı "sourceIndex" ekle.
- Kaynaklar çelişiyorsa bunu "differences" alanında belirt, tek tarafı gerçekmiş gibi yazma.
- Özel nitelikli kişisel veri YAZMA: sağlık/engellilik, cinsel hayat, din/inanç, etnik köken, siyasi görüş, sendika/dernek üyeliği, adli sicil. Reşit olmayanlar hakkında portre üretme.
- Hakaret, hedef gösterme, nefret söylemi, suç isnadı yok. Doğrulanmamış suçlama "iddia" olarak ve kaynağıyla yazılır; başlığa çıkmaz.
- Tıbbi, hukuki, finansal tavsiye verme.
- Tarafsız, kısa ve akıcı Türkçe kullan. Kaynak metnini kopyalama; kendi cümlelerinle yeniden yaz. Alıntı en fazla 1 cümle olabilir ve BİREBİR olmalı.
- Başlık en fazla 90 karakter, manşet tonunda ama abartısız. TÜMÜ BÜYÜK HARF kullanma.
- "subtitle" en fazla 25 kelime, tek cümle.
- [GEÇMİŞ BAĞLAM] etiketli kaynaklar olayın geçmişidir: kronolojiye kronolojik olarak ekle, "Neden gündemde" bölümünde bugünkü gelişmenin geçmişe nasıl bağlandığını açıkla. Bugünkü olayla karıştırma.

Şu JSON şemasında yanıt ver:
{
  "title": "...",
  "subtitle": "...",
  "subjectType": "kisi|kurum|olay",
  "subjectName": "varsa kişi/kurum adı, yoksa null",
  "whyNow": [{ "text": "...", "sourceIndex": 1 }, ...],
  "timeline": [{ "date": "YYYY-MM-DD veya YYYY-MM", "text": "...", "sourceIndex": 1 }, ...],
  "keyFacts": [{ "text": "...", "sourceIndex": 1 }, ...],
  "quote": { "text": "...", "speaker": "...", "date": "YYYY-MM-DD", "sourceIndex": 1 },
  "faqs": [{ "question": "...", "answer": "...", "sourceIndex": 1 }, ...],
  "updateNote": null,
  "differences": "kaynaklar çelişiyorsa iki tarafı da özetle; çelişki yoksa null"
}

Zorunlu adetler: whyNow tam 3, timeline 4-10, keyFacts tam 5, faqs 3-5.
Doğrulanmış birebir alıntı yoksa "quote" alanını null yap.`;

// ─── Doğrulama ──────────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function validIndex(value: unknown, max: number): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) return null;
  return parsed;
}

function parseClaims(value: unknown, max: number, limit: number): ClaimItem[] {
  if (!Array.isArray(value)) return [];

  const items: ClaimItem[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) continue;

    const text = typeof record.text === "string" ? record.text.trim() : "";
    const sourceIndex = validIndex(record.sourceIndex, max);

    if (!text || sourceIndex === null) continue;

    items.push({ text, sourceIndex });
    if (items.length >= limit) break;
  }

  return items;
}

function parseTimeline(value: unknown, max: number): TimelineItem[] {
  if (!Array.isArray(value)) return [];

  const items: TimelineItem[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) continue;

    const text = typeof record.text === "string" ? record.text.trim() : "";
    const date = typeof record.date === "string" ? normalizeTimelineDate(record.date) : "";
    const sourceIndex = validIndex(record.sourceIndex, max);

    if (!text || !date || sourceIndex === null) continue;

    items.push({ date, text, sourceIndex });
    if (items.length >= 10) break;
  }

  // Kronolojiyi tarihe göre sırala.
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

function parseFaqs(value: unknown, max: number): FaqItem[] {
  if (!Array.isArray(value)) return [];

  const items: FaqItem[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) continue;

    const question = typeof record.question === "string" ? record.question.trim() : "";
    const answer = typeof record.answer === "string" ? record.answer.trim() : "";
    const sourceIndex = validIndex(record.sourceIndex, max);

    if (!question || !answer || sourceIndex === null) continue;

    items.push({ question, answer, sourceIndex });
    if (items.length >= 5) break;
  }

  return items;
}

/**
 * Otomatik kontrol listesi (9.7 adım 7). Her madde geçmeli; aksi hâlde
 * portre yayına alınmaz, "review" durumunda bekletilir ve neden yazılır.
 */
export type CheckResult = {
  passed: boolean;
  /** Yayını engelleyen hatalar. */
  notes: string[];
  /** Bilgilendirici düzeltmeler (engellemez, ör. kaldırılan alıntı). */
  warnings: string[];
  checked: { label: string; ok: boolean; detail?: string }[];
};

export function runAutoChecks(input: {
  draft: PortraitDraft;
  sources: ResearchSource[];
  domainCount: number;
  model: string;
}): CheckResult {
  const notes: string[] = [];
  const warnings: string[] = [];
  const checked: { label: string; ok: boolean; detail?: string }[] = [];

  const push = (label: string, ok: boolean, detail?: string) => {
    checked.push({ label, ok, detail });
    if (!ok) notes.push(detail ? `${label}: ${detail}` : label);
  };

  // 1) En az 3 bağımsız kaynak
  push(
    "En az 3 bağımsız kaynak",
    input.domainCount >= 3,
    `bulunan bağımsız alan adı: ${input.domainCount}`,
  );

  // 2) Her iddia kaynaklı
  const allClaims = [
    ...input.draft.whyNow,
    ...input.draft.keyFacts,
    ...input.draft.timeline,
    ...input.draft.faqs,
  ];

  const sourceCount = input.sources.length;
  const outOfRange = allClaims.filter(
    (claim) => claim.sourceIndex < 1 || claim.sourceIndex > sourceCount,
  ).length;

  push(
    "Tüm maddeler kaynak numarasına bağlı",
    outOfRange === 0 && allClaims.length > 0,
    outOfRange > 0
      ? `${outOfRange} madde geçersiz kaynak numarası içeriyor`
      : undefined,
  );

  // 3) Yapısal zorunluluklar
  push(
    "Yapı tamam (3 / 4-10 / 5 / 3-5)",
    input.draft.whyNow.length === 3 &&
      input.draft.timeline.length >= 4 &&
      input.draft.keyFacts.length === 5 &&
      input.draft.faqs.length >= 3,
    `whyNow:${input.draft.whyNow.length} timeline:${input.draft.timeline.length} keyFacts:${input.draft.keyFacts.length} faqs:${input.draft.faqs.length}`,
  );

  // 4) Tek cümlede özet ≤ 25 kelime
  push(
    "Tek cümlede özet en fazla 25 kelime",
    wordCount(input.draft.subtitle) > 0 && wordCount(input.draft.subtitle) <= 25,
    `kelime: ${wordCount(input.draft.subtitle)}`,
  );

  // 5) Başlık uzunluğu
  push(
    "Başlık 90 karakteri aşmıyor",
    input.draft.title.length > 0 && input.draft.title.length <= 90,
    `uzunluk: ${input.draft.title.length}`,
  );

  // 6) Alıntı birebir mi?
  if (input.draft.quote) {
    const source = input.sources[input.draft.quote.sourceIndex - 1];
    const verbatim = source
      ? quoteAppearsInSource(input.draft.quote.text, source.text)
      : false;

    if (!verbatim) {
      // Doğrulanamayan alıntı yazıya girmez → kutu kaldırılır.
      input.draft.quote = null;
      warnings.push(
        "Alıntı kaynak metinde birebir bulunamadı; alıntı kutusu kaldırıldı.",
      );
    }

    push(
      "Alıntı kaynakta birebir doğrulandı",
      true,
      verbatim ? undefined : "alıntı kutusu kaldırıldı",
    );
  } else {
    push("Alıntı doğrulaması", true, "alıntı yok");
  }

  // 7) KVKK md. 6 — özel nitelikli veri
  const fullText = [
    input.draft.title,
    input.draft.subtitle,
    ...input.draft.whyNow.map((item) => item.text),
    ...input.draft.keyFacts.map((item) => item.text),
    ...input.draft.timeline.map((item) => item.text),
    ...input.draft.faqs.map((item) => `${item.question} ${item.answer}`),
    input.draft.quote?.text ?? "",
  ].join(" ");

  const violation = findSpecialCategoryViolation(fullText);

  push(
    "Özel nitelikli kişisel veri yok (KVKK md. 6)",
    violation === null,
    violation ? `${violation.label} (“${violation.match}”)` : undefined,
  );

  // 8) Reşit olmayan özne
  const minorSubject =
    /\b(\d{1,2})\s*yaşında\b/i.test(fullText) &&
    /(öğrenci|ogrenci|çocuk|cocuk)/i.test(fullText);

  push(
    "Reşit olmayan özne yok",
    !minorSubject,
    minorSubject ? "metinde yaş + çocuk/öğrenci birlikte geçiyor" : undefined,
  );

  // 9) Uzunluk/okunabilirlik
  push(
    "Metin yeterli uzunlukta",
    fullText.length >= 400,
    `karakter: ${fullText.length}`,
  );

  return { passed: notes.length === 0, notes, warnings, checked };
}

// ─── Üretim ─────────────────────────────────────────────────────────────────

/**
 * Araştırma kaynaklarından portre taslağı üretir.
 * Model yoksa `AI_UNAVAILABLE` döner; çağıran katman portreyi incelemeye alır.
 */
export async function generatePortraitDraft(input: {
  story: FeedStory;
  score: StoryScore;
  sources: ResearchSource[];
  model: string;
}): Promise<GenerationResult> {
  const notes: string[] = [];

  if (input.sources.length < 3) {
    return {
      ok: false,
      error: "INSUFFICIENT_SOURCES",
      notes: ["Üretim için en az 3 kaynak gerekir."],
    };
  }

  const userPrompt = `Hikâye başlığı: ${input.story.title}
Kategori: ${input.story.category || "belirsiz"}
Konu türü ipucu: ${input.score.subjectType}
Konu adı ipucu: ${input.score.subjectName ?? "belirsiz"}

KAYNAKLAR:
${buildSourceBlock(input.sources)}`;

  /** Model çağrısı + katı JSON ayrıştırma (tek yeniden deneme ile). */
  const requestJson = async (
    retry: boolean,
  ): Promise<Record<string, unknown> | null> => {
    const raw = await complete({
      json: true,
      // Reasoning modelleri zincir düşünce için ek token harcar.
      maxTokens: retry ? 3600 : 3000,
      temperature: retry ? 0.1 : 0.25,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...(retry
          ? [
              {
                role: "system" as const,
                content:
                  "Önceki yanıt geçersiz veya eksik JSON'du. Şimdi YALNIZCA geçerli, eksiksiz bir JSON nesnesi döndür; açıklama, markdown veya kod bloğu ekleme.",
              },
            ]
          : []),
        { role: "user", content: userPrompt },
      ],
    });

    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      const first = cleaned.indexOf("{");
      const last = cleaned.lastIndexOf("}");
      return asRecord(JSON.parse(cleaned.slice(first, last + 1)));
    } catch {
      return null;
    }
  };

  let parsed: Record<string, unknown> | null = null;

  try {
    parsed = await requestJson(false);
    if (!parsed) parsed = await requestJson(true);
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      return { ok: false, error: "AI_UNAVAILABLE", notes: ["AI anahtarı yapılandırılmamış."] };
    }
    return {
      ok: false,
      error: "AI_FAILED",
      notes: [(error as Error).message],
    };
  }

  if (!parsed) {
    return { ok: false, error: "INVALID_JSON", notes: ["Model geçerli JSON döndürmedi (2 deneme)."] };
  }

  if (!parsed) {
    return { ok: false, error: "INVALID_JSON", notes: ["Model boş yanıt döndü."] };
  }

  const max = input.sources.length;

  const subjectTypeRaw =
    parsed.subjectType === "kisi" || parsed.subjectType === "kurum"
      ? parsed.subjectType
      : "olay";

  const quoteRecord = asRecord(parsed.quote);
  let quote: QuoteBlock | null = null;

  if (quoteRecord) {
    const text = typeof quoteRecord.text === "string" ? quoteRecord.text.trim() : "";
    const speaker =
      typeof quoteRecord.speaker === "string" ? quoteRecord.speaker.trim() : "";
    const sourceIndex = validIndex(quoteRecord.sourceIndex, max);

    if (text && speaker && sourceIndex !== null) {
      quote = {
        text,
        speaker,
        date:
          typeof quoteRecord.date === "string"
            ? normalizeTimelineDate(quoteRecord.date) || quoteRecord.date
            : "",
        sourceIndex,
      };
    }
  }

  const draft: PortraitDraft = {
    title: typeof parsed.title === "string" ? parsed.title.trim().slice(0, 120) : "",
    subtitle: typeof parsed.subtitle === "string" ? parsed.subtitle.trim() : "",
    subjectType: subjectTypeRaw,
    subjectName:
      typeof parsed.subjectName === "string" && parsed.subjectName.trim()
        ? parsed.subjectName.trim().slice(0, 120)
        : input.score.subjectName,
    whyNow: parseClaims(parsed.whyNow, max, 3),
    timeline: parseTimeline(parsed.timeline, max),
    keyFacts: parseClaims(parsed.keyFacts, max, 5),
    quote,
    faqs: parseFaqs(parsed.faqs, max),
    updateNote:
      typeof parsed.updateNote === "string" && parsed.updateNote.trim()
        ? parsed.updateNote.trim()
        : null,
    conflictNote:
      typeof parsed.differences === "string" &&
      parsed.differences.trim() &&
      parsed.differences.trim().toLowerCase() !== "null"
        ? parsed.differences.trim().slice(0, 800)
        : null,
  };

  if (!draft.title) {
    return { ok: false, error: "EMPTY_DRAFT", notes: ["Başlık üretilemedi."] };
  }

  const bodyText = [
    draft.title,
    draft.subtitle,
    ...draft.whyNow.map((item) => item.text),
    ...draft.keyFacts.map((item) => item.text),
    ...draft.timeline.map((item) => item.text),
    ...draft.faqs.map((item) => `${item.question} ${item.answer}`),
  ].join(" ");

  const warnings: string[] = [];

  const violation = findSpecialCategoryViolation(bodyText);
  if (violation) {
    warnings.push(`KVKK md. 6 riski: ${violation.label}`);
    notes.push(`Özel nitelikli veri tespit edildi: ${violation.label}`);
  }

  return {
    ok: true,
    draft,
    readingMinutes: Math.max(2, readingTimeMinutes(bodyText)),
    model: input.model,
    warnings,
  };
}
