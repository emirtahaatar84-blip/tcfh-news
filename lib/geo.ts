
/**
 * Konum bazlı haber önerileri ("Bölgenizden Haberler") — coğrafi yardımcılar.
 *
 * SIFIR VERİ POLİTİKASI (KVKK): Ziyaretçi konumu yalnızca İL düzeyinde ve
 * İSTEK BAŞINA geçici olarak tespit edilir. IP adresi veya konum bilgisi
 * ne veritabanına ne de diske yazılır; dış API önbelleği yalnızca süreç
 * belleğinde kısa TTL ile tutulur.
 *
 * IP tabanlı tespit YOKTUR. Bölge haberleri yalnızca kullanıcının
 * cihazında seçtiği il ile çalışır.
 */

/** 81 il — kanonik adlar (LLM haber metinlerinde bu yazımla geçer). */
export const TURKISH_CITIES = [
  "Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Aksaray", "Amasya",
  "Ankara", "Antalya", "Ardahan", "Artvin", "Aydın", "Balıkesir", "Bartın",
  "Batman", "Bayburt", "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur",
  "Bursa", "Çanakkale", "Çankırı", "Çorum", "Denizli", "Diyarbakır",
  "Düzce", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir",
  "Gaziantep", "Giresun", "Gümüşhane", "Hakkari", "Hatay", "Iğdır",
  "Isparta", "İstanbul", "İzmir", "Kahramanmaraş", "Karabük", "Karaman",
  "Kars", "Kastamonu", "Kayseri", "Kırıkkale", "Kırklareli", "Kırşehir",
  "Kilis", "Kocaeli", "Konya", "Kütahya", "Malatya", "Manisa", "Mardin",
  "Mersin", "Muğla", "Muş", "Nevşehir", "Niğde", "Ordu", "Osmaniye",
  "Rize", "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas", "Şanlıurfa",
  "Şırnak", "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Uşak", "Van",
  "Yalova", "Yozgat", "Zonguldak",
] as const;

const CITY_FOLD_MAP: Record<string, string> = {
  ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u",
  â: "a", î: "i", û: "u",
};

/**
 * İl adını eşleşme anahtarına çevirir. tr-TR küçük harf (İ→i, I→ı doğru
 * çalışır) + Türkçe diyakritik katlama: "İstanbul", "Istanbul" ve
 * "İSTANBUL" aynı anahtara ("istanbul") iner.
 */
function foldCityKey(value: string): string {
  const lowered = value.trim().toLocaleLowerCase("tr-TR");

  let out = "";
  for (const char of lowered) {
    out += CITY_FOLD_MAP[char] ?? char;
  }
  return out;
}

/** Katlanmış (ASCII) ad → kanonik il adı eşlemesi. */
const CITY_BY_FOLDED = new Map<string, string>(
  TURKISH_CITIES.map((city) => [foldCityKey(city), city]),
);

/** Serbest metni kanonik il adına çevirir ("Istanbul" → "İstanbul"). */
export function normalizeCity(raw: string): string | null {
  return CITY_BY_FOLDED.get(foldCityKey(raw)) ?? null;
}

/** Sözcük sınırına duyarlı il araması: "İstanbul" kökü, "İstanbul'da"
 *  gibi ekli biçimleri de yakalar (kelime sınırı + kök eşleşmesi). */
function buildCityPatterns(): { city: string; re: RegExp }[] {
  return TURKISH_CITIES.map((city) => ({
    city,
    re: new RegExp(
      `(^|[^\\p{L}])${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      "u",
    ),
  }));
}

const CITY_PATTERNS = buildCityPatterns();

/**
 * Haber metninden konusu geçen ili bulur. Başlık önceliklidir; başlıkta
 * yoksa özete bakılır. Türkçe ekler ("İstanbul'da", "Ankara'ya") kök
 * eşleşmesiyle yakalanır. Bulunamazsa null.
 */
export function detectCity(
  title: string,
  summary: string,
): string | null {
  for (const source of [title, summary]) {
    if (!source) continue;

    let best: { city: string; index: number } | null = null;

    for (const { city, re } of CITY_PATTERNS) {
      const match = re.exec(source);
      if (match) {
        const index = match.index;
        // En erken geçen il kazanır (metnin konusu o).
        if (!best || index < best.index) best = { city, index };
      }
    }

    if (best) return best.city;
  }

  return null;
}

/**
 * NOT (KVKK): IP tabanlı ziyaretçi konumu tespiti KALDIRILDI.
 * Hiçbir IP adresi okunmaz, saklanmaz veya üçüncü tarafa gönderilmez.
 * Bölge haberleri yalnızca kullanıcının cihazında seçtiği il ile çalışır.
 */

/** Kullanıcının cihazda seçtiği ili doğrular (sunucu tarafı doğrulama). */
export function cityFromParam(value: string | null | undefined): string | null {
  if (!value) return null;
  return normalizeCity(value);
}
