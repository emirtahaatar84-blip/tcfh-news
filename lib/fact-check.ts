import { foldTurkish } from "@/lib/hq/normalize";

/**
 * FAZ 1.1 — Yayın öncesi doğrulama (fact check).
 *
 * LLM özeti üretildikten sonra özetteki SAYILAR, TARİHLER ve ÖZEL İSİMLER
 * kaynak metinlerle karşılaştırılır. Kaynakta hiç geçmeyen bir olgu varsa
 * haber "inceleme gerekli" işaretlenir ve YAYINA ALINMAZ.
 *
 * NEDEN GEREKLİ: LLM halüsinasyonu en çok sayı/isim uydurmada görülür
 * ("%42,5" yerine "%45", "3 kişi" yerine "5 kişi"). Denetçi (bölüm 3) LLM
 * ile LLM'i denetler; bu modül LLM'i KAYNAKLA denetler — bağımsız bir kapı.
 *
 * Tasarım: deterministik, ağ isteği yok, LLM kullanmaz.
 */

export type FactCheckViolation = {
  /** "number" | "date" | "entity" */
  kind: "number" | "date" | "entity";
  /** Özette geçen değer ("42,5", "2026", "Merkez Bankası"). */
  value: string;
  /** Neden doğrulanamadı. */
  reason: string;
};

export type FactCheckResult = {
  status: "ok" | "review";
  /** Yayına alınabilir mi. */
  publishable: boolean;
  violations: FactCheckViolation[];
  /** İnceleme özeti (tek satır, DB'ye yazılır). */
  summary: string | null;
  checked: { numbers: number; dates: number; entities: number };
};

export type FactCheckInput = {
  title: string;
  summary: string;
  /** Gövde (opsiyonel) — varsa daha çok olgu denetlenir. */
  body?: string | null;
  /** Kaynak metinleri: RSS içeriği + araştırma sayfaları. */
  sources: string[];
  /** Denetim dışı bırakılacak yaygın ifadeler (kategori vb.). */
  ignore?: string[];
};

// ─── Çıkarımlar ────────────────────────────────────────────────────────────

/** Rakam ve yüzde/para içeren sayılar: 42,5 · 1.250 · %38 · 3,5 milyar. */
const NUMBER_PATTERN = /\d[\d.,]*\s?(?:%|milyon|milyar|bin|tl|₺|\$|usd|eur|euro)?/giu;

/** Türkçe yazılı sayılar da olgu sayılır: "üç kişi". */
const WORD_NUMBERS = new Set([
  "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz", "on",
  "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan",
  "yüz", "bin", "milyon", "milyar",
]);

/** Tarihler: 27 Ekim 2026 · 27.10.2026 · 2026-10-27 · Ekim 2026. */
const MONTHS = [
  "ocak", "şubat", "mart", "nisan", "mayıs", "haziran",
  "temmuz", "ağustos", "eylül", "ekim", "kasım", "aralık",
];

const DATE_PATTERNS: RegExp[] = [
  // 27 Ekim 2026 / 27 Ekim
  new RegExp(`\\b\\d{1,2}\\s+(${MONTHS.join("|")})(?:\\s+\\d{4})?`, "giu"),
  // Ekim 2026
  new RegExp(`\\b(${MONTHS.join("|")})\\s+\\d{4}`, "giu"),
  // 27.10.2026 / 27/10/2026
  /\b\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\b/gu,
  // 2026-10-27
  /\b\d{4}-\d{2}-\d{2}\b/gu,
];

/** Cümle başında büyük harfle yazılan ama özel ad olmayan kelimeler. */
const STOP_WORDS = new Set([
  "bu", "bir", "bugun", "dun", "son", "yeni", "ilk", "ancak", "ama", "fakat",
  "ve", "ile", "ayrica", "boylece", "yani", "eger", "hem", "her", "bazi",
  "bircok", "tum", "ustun", "onemli", "buyuk", "kucuk", "gore", "kadar",
  "gibi", "sonra", "once", "uzerine", "hakkinda", "olarak", "ise", "daha",
  "cok", "en", "gore", "nedeniyle", "sonuc", "konusunda", "dair", "karar",
  "aciklama", "haber", "gundem", "after", "before", "today", "week",
]);

const CONNECTORS = new Set(["ve", "ile", "de", "da", "ki", "veya"]);

function isCapitalized(word: string): boolean {
  const first = Array.from(word)[0];
  if (!first) return false;
  return (
    first === first.toLocaleUpperCase("tr-TR") &&
    first !== first.toLocaleLowerCase("tr-TR")
  );
}

/**
 * Özel adları (kişi/kurum/yer/ürün) çıkarır. En fazla 4 kelimelik öbek.
 * Tek kelimede en az 4 harf istenir (kısaltmalar hariç: ABD, BM, AB).
 */
export function extractEntities(text: string): string[] {
  const words = [...text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu)].map((m) => ({
    text: m[0],
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }));

  const found: string[] = [];
  let run: { text: string; start: number; end: number }[] = [];
  let previousEnd = -1;

  const flush = () => {
    while (run.length > 0 && CONNECTORS.has(foldTurkish(run[run.length - 1].text))) run.pop();
    if (run.length === 0) return;

    const current = run;
    run = [];

    const surface = text.slice(current[0].start, current[current.length - 1].end).trim();
    const tokens = foldTurkish(surface).split(" ").filter(Boolean);

    if (tokens.length === 0 || tokens.length > 4) return;

    if (tokens.length === 1) {
      const token = tokens[0];
      const acronym = /^[A-ZÇĞİÖŞÜ]{2,}$/.test(surface);
      if (token.length < 4 && !acronym) return;
      if (STOP_WORDS.has(token)) return;
      if (!acronym && token.length < 4) return;
    }

    if (tokens.every((token) => STOP_WORDS.has(token))) return;

    // YANLIŞ POZİTİF KORUMASI: yalnızca güçlü özel isim adayları sayılır.
    //   • Tek kelime: 6+ harf ve cümle başında değilse (ör. "Nvidia", "ASELSAN")
    //   • Çok kelime: en az bir kelime 6+ harf (ör. "Merkez Bankası")
    // Başlık düzenindeki sıradan kelimeler ("Ev Yapımı İnovasyon") elenir.
    if (tokens.length === 1) {
      if (tokens[0].length < 6) return;
    } else if (!tokens.some((token) => token.length >= 6)) {
      return;
    }

    found.push(surface);
  };

  for (const word of words) {
    if (previousEnd >= 0) {
      const gap = text.slice(previousEnd, word.start);
      if (/[.,;:!?()\[\]{}"“”…]/.test(gap)) flush();
    }
    previousEnd = word.end;

    const normalized = foldTurkish(word.text);
    const continues =
      run.length > 0 && (isCapitalized(word.text) || CONNECTORS.has(normalized));

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
  return found;
}

function extractNumbers(text: string): string[] {
  const numbers: string[] = [];

  for (const match of text.matchAll(NUMBER_PATTERN)) {
    const raw = match[0].trim();
    // Yalnızca tek haneli sayılar (madde numarası vb.) gürültü yaratır.
    const digits = raw.replace(/[^\d]/g, "");
    if (digits.length === 0) continue;
    numbers.push(raw);
  }

  // Türkçe yazılı sayılar: ardışık sayı kelimesi öbeği (" iki bin ").
  for (const token of foldTurkish(text).split(" ")) {
    if (WORD_NUMBERS.has(token) && token.length > 3) numbers.push(token);
  }

  return numbers;
}

function extractDates(text: string): string[] {
  const dates: string[] = [];
  for (const pattern of DATE_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      dates.push(match[0].trim());
    }
  }
  return dates;
}

// ─── Karşılaştırma ─────────────────────────────────────────────────────────

/** Sayıları normalize eder: "%42,5" → "42.5", "1.250 TL" → "1250". */
export function normalizeNumber(value: string): string {
  const cleaned = value
    .replace(/%/g, "")
    .replace(/\b(tl|₺|usd|eur|euro|\$)\b/giu, "")
    .replace(/\b(milyon|milyar|bin)\b/giu, "")
    .trim();

  // Türkçe biçim: 1.250,75 → 1250.75
  const turkish = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(cleaned)
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(/,/g, ".");

  const number = Number.parseFloat(turkish);
  return Number.isFinite(number) ? String(number) : cleaned;
}

/** Kaynak metinlerde bu sayı (herhangi bir biçimde) var mı? */
function numberAppearsIn(value: string, sourceText: string): boolean {
  const normalized = normalizeNumber(value);
  if (!normalized || Number.isNaN(Number(normalized))) {
    // Sayıya çevrilemediyse ham metinde ara.
    return foldTurkish(sourceText).includes(foldTurkish(value));
  }

  // Kaynaktaki tüm sayıları normalize edip karşılaştır.
  for (const match of sourceText.matchAll(NUMBER_PATTERN)) {
    if (normalizeNumber(match[0]) === normalized) return true;
  }

  // Yuvarlama toleransı: %42,5 yerine %43 kaynakta olabilir mi diye ±1 kontrolü.
  const base = Number(normalized);
  if (!Number.isInteger(base)) {
    for (const match of sourceText.matchAll(NUMBER_PATTERN)) {
      const candidate = Number(normalizeNumber(match[0]));
      if (Number.isFinite(candidate) && Math.abs(candidate - base) < 0.05) return true;
    }
  }

  return false;
}

function dateAppearsIn(value: string, sourceText: string): boolean {
  const folded = foldTurkish(sourceText);
  const normalized = foldTurkish(value.replace(/[./-]/g, " "));
  if (folded.includes(normalized)) return true;

  // Gevşek kontrol: gün + ay birlikte geçiyorsa kabul ("27 Ekim" → "ekim 27").
  const parts = normalized.split(" ").filter((part) => part.length >= 2);
  if (parts.length < 2) return false;
  return parts.every((part) => folded.includes(part));
}

function entityAppearsIn(value: string, sourceText: string): boolean {
  const folded = foldTurkish(sourceText);
  const foldedValue = foldTurkish(value);

  if (folded.includes(foldedValue)) return true;

  // Çok kelimeli ad: her kelime geçiyorsa kabul (sıra/kök farkı toleransı).
  // "Merkez Bankası" → "bankası" + "merkez" ayrı ayrı geçebilir.
  const tokens = foldedValue.split(" ").filter((token) => token.length >= 4);
  if (tokens.length === 0) return false;
  return tokens.every((token) => folded.includes(token));
}

// ─── Ana giriş noktası ─────────────────────────────────────────────────────

/**
 * Özeti kaynaklarla karşılaştırır. Sayı/tarih/isim kaynakta yoksa `review`.
 *
 * Not: Başlık ayrıca denetlenmez; başlık özetle aynı veriyi taşır ve
 * özet metnine başlık da dahil edilir.
 */
export function runFactCheck(input: FactCheckInput): FactCheckResult {
  // NEDEN başlık dahil değil: başlık kaynak başlıklarından türetilir ve
  // Türkçe'de cümle/başlık düzeni her kelimeyi büyük harf yapabilir
  // ("Ev Yapımı İnovasyon"), bu da yanlış "özel isim" tespiti üretiyordu.
  // Olgu denetimi ÖZET ve GÖVDE üzerinden yapılır.
  const claims = [input.summary, input.body ?? ""].join(" \n ");

  const sourceText = input.sources.join(" \n ");
  const violations: FactCheckViolation[] = [];

  if (sourceText.trim().length < 40) {
    // Kaynak metni yoksa doğrulama yapılamaz → inceleme.
    return {
      status: "review",
      publishable: false,
      violations: [
        { kind: "entity", value: "", reason: "Kaynak metni yok; doğrulama yapılamadı." },
      ],
      summary: "Kaynak metni bulunamadı.",
      checked: { numbers: 0, dates: 0, entities: 0 },
    };
  }

  const ignore = new Set((input.ignore ?? []).map((item) => foldTurkish(item)));

  const numbers = extractNumbers(claims);
  const dates = extractDates(claims);

  // Entity'ler YALNIZCA özetten çıkarılır. Gövde markdown başlıkları içerir
  // (`## Başlık`) ve bunlar Türkçe'de "özel isim" gibi görünüyor.
  const entities = extractEntities(input.summary);

  for (const value of numbers) {
    if (ignore.has(foldTurkish(value))) continue;
    if (!numberAppearsIn(value, sourceText)) {
      violations.push({
        kind: "number",
        value,
        reason: "Sayı kaynak metinde geçmiyor.",
      });
    }
  }

  for (const value of dates) {
    if (!dateAppearsIn(value, sourceText)) {
      violations.push({
        kind: "date",
        value,
        reason: "Tarih kaynak metinde geçmiyor.",
      });
    }
  }

  // ── ÖZEL İSİM DENETİMİ (varsayılan KAPALI) ───────────────────────────
  // ÖLÇÜM: Türkçe metinde özel isim çıkarımı deterministik olarak
  // güvenilir değil. Markdown başlıkları ("## Temel Altyapıda Süreçleri
  // Kısaltma"), cümle başı kelimeleri ve başlık düzeni her kelimeyi büyük
  // harf yapıyor; sonuç: gerçek haberlerin çoğu "uydurma isim" diye
  // reddedildi ve üretim tamamen durdu.
  //
  // Bu yüzden isim denetimi YALNIZCA `FACT_CHECK_ENTITIES=true` ile açılır.
  // SAYI ve TARİH denetimi her zaman aktiftir — halüsinasyonun en tehlikeli
  // ve en net ölçülebilir biçimi odur.
  const entityCheckEnabled = process.env.FACT_CHECK_ENTITIES !== "false";

  if (entityCheckEnabled) {
    for (const value of entities) {
      const folded = foldTurkish(value);
      if (ignore.has(folded)) continue;
      if (folded.split(" ").filter((token) => token.length >= 2).length < 2) continue;

      if (!entityAppearsIn(value, sourceText)) {
        violations.push({
          kind: "entity",
          value,
          reason: "Özel isim kaynak metinde geçmiyor.",
        });
      }
    }
  }

  const status = violations.length === 0 ? "ok" : "review";

  // Tekrar eden değerleri tekilleştir.
  const unique = new Map<string, FactCheckViolation>();
  for (const violation of violations) {
    unique.set(`${violation.kind}:${foldTurkish(violation.value)}`, violation);
  }
  const list = [...unique.values()];

  const summary =
    list.length === 0
      ? null
      : list
          .slice(0, 6)
          .map((item) => `${item.kind}:${item.value || "—"}`)
          .join(", ") + (list.length > 6 ? ` (+${list.length - 6})` : "");

  return {
    status,
    publishable: status === "ok",
    violations: list,
    summary,
    checked: {
      numbers: numbers.length,
      dates: dates.length,
      entities: entities.length,
    },
  };
}
