/** Türkçe normalizasyon, ek soyma, tokenizasyon. Saf fonksiyonlar. */

const CHAR_MAP: Record<string, string> = {
  ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", İ: "i", ö: "o", Ö: "o",
  ş: "s", Ş: "s", ü: "u", Ü: "u", â: "a", Â: "a", î: "i", Î: "i",
  û: "u", Û: "u", é: "e", ô: "o",
};

/** Orijinal metni koruyarak yalnızca karşılaştırma için ASCII'e indirger. */
export function foldTurkish(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/\u0307/g, "")
    .replace(/[çÇğĞıİöÖşŞüÜâÂîÎûÛéô]/g, (char) => CHAR_MAP[char] ?? char)
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export const STOP_WORDS = new Set([
  "bir", "bu", "su", "ile", "ve", "veya", "ama", "fakat", "icin", "olan",
  "olarak", "daha", "cok", "en", "son", "yeni", "gore", "kadar", "gibi",
  "sonra", "once", "uzerine", "hakkinda", "turkiye", "turk", "yil", "gun",
  "ay", "hafta", "gundem", "haber", "haberler", "de", "da", "ki", "mi",
  "ise", "her", "bazi", "tum", "iki", "uc", "dort", "bes", "bin", "milyon",
]);

/** Basit ek soyma — kök en az 3 karakter kalmalı. */
export function stripSuffixes(token: string, suffixes: readonly string[], minStem = 3): string {
  if (token.length <= 4) return token;
  for (const rawSuffix of suffixes) {
    // Ek listesi Türkçe karakter içerebilir; metin fold edilmiş olduğu için
    // ek de fold edilerek karşılaştırılır (nın → nin).
    const suffix = foldTurkish(rawSuffix);
    if (!suffix) continue;
    if (token.length - suffix.length < minStem) continue;
    if (!token.endsWith(suffix)) continue;
    const stem = token.slice(0, token.length - suffix.length);
    // İkizleşme: "zamm" → "zam", "hiss" → "his"
    const last = stem[stem.length - 1];
    const prev = stem[stem.length - 2];
    if (last && last === prev && !"aeiou".includes(last)) return stem.slice(0, -1);
    return stem;
  }
  return token;
}

/**
 * Tokenizasyon önbelleği. foldTurkish + ek soyma uzun metinlerde ≈45 ms
 * sürüyor; atıf eşleştirmede aynı metin 400 kez tokenize ediliyordu.
 * Anahtar metnin kendisidir (içerik bazlı, kişisel veri yok).
 */
const TOKEN_CACHE = new Map<string, string[]>();
const TOKEN_CACHE_LIMIT = 800;

export function tokenize(
  text: string,
  suffixes: readonly string[] = [],
  minStem = 3,
): string[] {
  const key = `${minStem}:${text}`;
  const cached = TOKEN_CACHE.get(key);
  if (cached) return cached;

  const result = foldTurkish(text)
    .split(" ")
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token))
    .map((token) => stripSuffixes(token, suffixes, minStem));

  if (TOKEN_CACHE.size >= TOKEN_CACHE_LIMIT) {
    const firstKey = TOKEN_CACHE.keys().next().value;
    if (firstKey !== undefined) TOKEN_CACHE.delete(firstKey);
  }
  TOKEN_CACHE.set(key, result);

  return result;
}

export function resetTokenCache(): void {
  TOKEN_CACHE.clear();
}

/** Varlık anahtarları: kök en az 4 karakter (adlar aşırı kırpılmaz). */
export function entityTokens(text: string, suffixes: readonly string[] = []): string[] {
  return tokenize(text, suffixes, 4);
}

/** İki varlık anahtarı aynı varlığı gösteriyor mu (kök/çekim farkı toleranslı). */
export function entityKeysMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  return a.startsWith(b) || b.startsWith(a);
}

/** İki token dizisi arasında Jaccard benzerliği. */
export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Kosinüs benzerliği (terim frekansı vektörleri). */
export function cosine(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const freq = (tokens: string[]) => {
    const map = new Map<string, number>();
    for (const token of tokens) map.set(token, (map.get(token) ?? 0) + 1);
    return map;
  };
  const fa = freq(a);
  const fb = freq(b);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [token, count] of fa) {
    normA += count * count;
    dot += count * (fb.get(token) ?? 0);
  }
  for (const count of fb.values()) normB += count * count;
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Kısa metinlerde birebir geçiş veya %90 token örtüşmesi. */
export function phraseAppearsIn(
  phrase: string,
  text: string,
  minSimilarity: number,
  suffixes: readonly string[] = [],
  /** Aynı metin için tekrar tekrar çağrılıyorsa önceden hesaplanmış tokenlar. */
  presetTextTokens?: string[],
): boolean {
  const folded = foldTurkish(text);
  const foldedPhrase = foldTurkish(phrase);
  if (!foldedPhrase) return false;
  if (folded.includes(foldedPhrase)) return true;

  const phraseTokens = tokenize(phrase, suffixes);
  if (phraseTokens.length === 0) return false;

  const textTokens = presetTextTokens ?? tokenize(text, suffixes);
  const size = phraseTokens.length;
  for (let i = 0; i + size <= textTokens.length; i += 1) {
    const window = textTokens.slice(i, i + size);
    let hits = 0;
    for (let j = 0; j < size; j += 1) if (window[j] === phraseTokens[j]) hits += 1;
    if (hits / size >= minSimilarity) return true;
  }
  return false;
}
