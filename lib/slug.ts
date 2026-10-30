/**
 * URL slug üretimi — Türkçe karakterler ASCII'ye katlanır.
 *
 * Kurallar (yeni format):
 *  - yalnızca a-z, 0-9 ve tire
 *  - en fazla 6 kelime
 *  - en fazla 80 karakter
 *  - tire ile başlamaz/bitmez, çift tire yok
 */

const TR_MAP: Record<string, string> = {
  ç: "c", Ç: "c",
  ğ: "g", Ğ: "g",
  ı: "i", I: "i",
  İ: "i", i: "i",
  ö: "o", Ö: "o",
  ş: "s", Ş: "s",
  ü: "u", Ü: "u",
  â: "a", Â: "a",
  î: "i", Î: "i",
  û: "u", Û: "u",
  ê: "e", Ê: "e",
  ô: "o", Ô: "o",
  é: "e", É: "e",
};

/** Türkçe/aksanlı harfleri ASCII karşılığına çevirir. */
export function foldAscii(value: string): string {
  let out = "";

  for (const char of value) {
    out += TR_MAP[char] ?? char;
  }

  return out.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const MAX_SLUG_WORDS = 6;
const MAX_SLUG_LENGTH = 80;

/**
 * Başlıktan okunabilir slug üretir.
 * "SİPER Ürün-2: Havada Hedef Değiştiren Füze" → "siper-urun-2-havada-hedef"
 */
export function slugify(value: string, maxWords = MAX_SLUG_WORDS): string {
  const words = foldAscii(value)
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9\s-]+/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, maxWords);

  const joined = words.join("-").replace(/-+/g, "-").replace(/^-|-$/g, "");

  // Uzunluk sınırı: kelime ortasında kesmemek için son tam kelimede bitir.
  if (joined.length > MAX_SLUG_LENGTH) {
    const trimmed = joined.slice(0, MAX_SLUG_LENGTH);
    const lastDash = trimmed.lastIndexOf("-");
    return (lastDash > 20 ? trimmed.slice(0, lastDash) : trimmed).replace(/-$/g, "");
  }

  return joined;
}

/** Slug geçerli mi (rota yakalama için)? */
export function isValidSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= MAX_SLUG_LENGTH;
}

/** Çakışma durumunda "-2", "-3" … ekler. */
export function withSuffix(slug: string, index: number): string {
  if (index <= 1) return slug;
  return `${slug}-${index}`.slice(0, MAX_SLUG_LENGTH);
}

/**
 * Slug'ın kelime sayısı 6'dan fazlaysa kısaltır (eski kayıtların göçü için).
 */
export function shortenSlug(slug: string, maxWords = MAX_SLUG_WORDS): string {
  const parts = slug.split("-").filter(Boolean);
  if (parts.length <= maxWords) return slug;
  return parts.slice(0, maxWords).join("-");
}

export { MAX_SLUG_WORDS, MAX_SLUG_LENGTH };
