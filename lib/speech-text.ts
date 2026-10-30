/**
 * Sesli okuma metni üretimi — tamamen istemci tarafında çalışır.
 *
 * Hiçbir metin sunucuya gönderilmez: cümleler sayfa render edilirken
 * (sunucu bileşeninde) hazırlanır ve yalnızca Web Speech API'ye verilir.
 * Ses sentezi tarayıcının kendi motorunda yapılır.
 */

export type SpeechMode = "summary" | "full";

export type SpeechDocument = {
  /** İçerik kimliği: "haber:<slug>" | "portre:<slug>" */
  contentId: string;
  title: string;
  url: string;
  coverImageUrl: string | null;
  mode: SpeechMode;
  sentences: string[];
  /** Yaklaşık süre (saniye, 1x hızda). */
  estimatedSeconds: number;
};

export type SpeechBundle = {
  summary: SpeechDocument;
  full: SpeechDocument;
};

/** Türkçe kısaltmalar: bunlardan sonra cümle bölünmez. */
const ABBREVIATIONS = new Set([
  "dr", "prof", "doç", "doc", "av", "vb", "örn", "orn", "bkz", "sn", "no",
  "yy", "mah", "cad", "sok", "apt", "tel", "tbmm", "ab", "abd", "bm", "ab",
  "tl", "usd", "eur", "kg", "km", "cm", "mm", "mw", "gb", "tb", "dk", "sa",
  "mö", "ms", "hz", "kg", "mv", "kv", "cc", "st", "yy", "mah", "sf", "bknz",
  "vs", "gz", "mg", "ml", "ar", "ge", "bkz.", "v.b", "v.s",
]);

const SENTENCE_END = ".!?…";

/**
 * Metni cümlelere böler.
 *
 * Kurallar:
 *  - Ondalık sayı ("1.5") ve kısaltmalar ("Prof. Dr.") bölünmez.
 *  - Cümle sonu noktalama + boşluk + büyük harf/rakam/tırnak ile doğrulanır.
 *  - 3 kelimeden kısa parçalar bir önceki cümleye eklenir (başlık kırıntısı).
 */
export function splitSentences(text: string): string[] {
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();

  if (!normalized) return [];

  const out: string[] = [];
  let start = 0;

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (!SENTENCE_END.includes(char)) continue;

    // Ondalık sayı: 1.5 / 12,5 (virgül zaten cümle sonu değil)
    if (
      char === "." &&
      /\d/.test(normalized[index - 1] ?? "") &&
      /\d/.test(normalized[index + 1] ?? "")
    ) {
      continue;
    }

    let end = index + 1;

    // Kapanış tırnağı/parantezi ve tekrarlanan noktalama
    while (end < normalized.length && /["'”’)\]]/.test(normalized[end])) end += 1;
    while (end < normalized.length && SENTENCE_END.includes(normalized[end])) end += 1;

    if (end < normalized.length) {
      if (normalized[end] !== " ") continue;

      const rest = normalized.slice(end + 1).trimStart();
      if (!rest) {
        // Metnin sonu — aşağıdaki tail bloğu ekler.
      } else if (!/^["“'‘(\[A-ZÇĞİÖŞÜ0-9]/.test(rest)) {
        continue;
      }
    }

    const candidate = normalized.slice(start, end).trim();
    if (!candidate) continue;

    const words = candidate.split(/\s+/);
    const lastWord = (words[words.length - 1] ?? "")
      .toLowerCase()
      .replace(/[^\p{L}.]/gu, "")
      .replace(/\.$/, "");

    if (ABBREVIATIONS.has(lastWord)) continue;
    // Tek harfli kısaltmalar (A. Yılmaz gibi)
    if (lastWord.length === 1) continue;

    // Çok kısa parçayı önceki cümleyle birleştir.
    if (words.length < 3 && out.length > 0) {
      out[out.length - 1] = `${out[out.length - 1]} ${candidate}`;
      start = end;
      index = end - 1;
      continue;
    }

    out.push(candidate);
    start = end;
    index = end - 1;
  }

  const tail = normalized.slice(start).trim();
  if (tail) {
    if (out.length > 0 && tail.split(/\s+/).length < 3) {
      out[out.length - 1] = `${out[out.length - 1]} ${tail}`;
    } else {
      out.push(tail);
    }
  }

  return out;
}

/** Türkçe konuşma hızı tahmini: ~13,5 karakter/saniye (1x). */
export function estimateSeconds(text: string, rate = 1): number {
  const chars = text.replace(/\s+/g, " ").trim().length;
  if (chars === 0) return 0;
  return Math.max(1, Math.round(chars / (13.5 * Math.max(rate, 0.5))));
}

function joinParts(parts: (string | null | undefined)[]): string {
  return parts
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

export type SummaryInput = {
  contentId: string;
  title: string;
  url: string;
  coverImageUrl: string | null;
  subtitle: string | null;
  bullets: string[];
};

/**
 * "Sesli özet": başlık + tek cümle özet + 3 madde. Hedef 60-90 saniye.
 */
export function buildSummaryDocument(input: SummaryInput): SpeechDocument {
  const text = joinParts([
    input.title ? `${input.title}.` : null,
    input.subtitle,
    ...input.bullets.slice(0, 6),
  ]);

  const sentences = splitSentences(text);

  return {
    contentId: input.contentId,
    title: input.title,
    url: input.url,
    coverImageUrl: input.coverImageUrl,
    mode: "summary",
    sentences,
    estimatedSeconds: estimateSeconds(sentences.join(" ")),
  };
}

export type FullTextSection = {
  heading: string;
  paragraphs: string[];
};

export type FullInput = {
  contentId: string;
  title: string;
  url: string;
  coverImageUrl: string | null;
  subtitle: string | null;
  sections: FullTextSection[];
};

/**
 * "Tüm metni dinle": başlık + özet + bölümler (kronoloji ve SSS dahil).
 * Kaynaklar listesi ve AI uyarısı BİLİNÇLİ olarak dışarıda bırakılır.
 */
export function buildFullDocument(input: FullInput): SpeechDocument {
  const parts: string[] = [];

  if (input.title) parts.push(`${input.title}.`);
  if (input.subtitle) parts.push(input.subtitle);

  for (const section of input.sections) {
    if (section.heading) parts.push(`${section.heading}.`);
    parts.push(...section.paragraphs);
  }

  const text = textForSpeech(parts.join(". "));

  return {
    contentId: input.contentId,
    title: input.title,
    url: input.url,
    coverImageUrl: input.coverImageUrl,
    mode: "full",
    sentences: splitSentences(text),
    estimatedSeconds: estimateSeconds(text),
  };
}

/**
 * Konuşma için temizlik: madde işaretleri, tırnaklar, parantez içi
 * kaynak numaraları ([1]) ve fazla noktalama atılır. Anlam korunur.
 */
export function textForSpeech(text: string): string {
  return text
    .replace(/\[\d+\]/g, " ") // [1] kaynak numaraları
    .replace(/\(bkz\.[^)]*\)/gi, " ")
    .replace(/^[\s•·\-–—*]+/gm, "")
    .replace(/["“”„«»]/g, "")
    .replace(/\s*[–—]\s*/g, ", ")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/([.,;:!?])\1+/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/\.\s*\./g, ".")
    .trim();
}
