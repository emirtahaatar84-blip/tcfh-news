import { foldTurkish } from "@/lib/hq/normalize";

/**
 * SİTE NİŞİ — Teknoloji & Yapay Zekâ odaklı haber akışı.
 *
 * NEDEN: Site 4.800+ haber taşıyor ve her şeyi eşit gösteriyordu. Okuyucu
 * "ne için burada olduğunu" bilmiyordu. Niş tanımı, akışın kimliğini
 * belirler: teknoloji/YZ haberleri öne çıkar, ilgi çekici diğer konular
 * (spor kulüpleri, dünya gündemi) görünür kalır, geri kalan geri plana düşer.
 *
 * Bu dosya TEK KAYNAK: hangi kategori ana, hangi ikincil, hangi kulüpler
 * takip edilir. Değiştirmek için başka yere bakma.
 */

export type NicheTier = "core" | "interest" | "peripheral" | "off";

/**
 * Katman ağırlıkları — önem skoruna çarpan olarak uygulanır.
 * 1.0 = tam ağırlık, 0.6 = geri planda, 0.25 = neredeyse gizli.
 */
export const TIER_WEIGHT: Record<NicheTier, number> = {
  core: 1.0,
  interest: 0.85,
  peripheral: 0.45,
  off: 0.2,
};

/**
 * Kategori → katman.
 *
 * core       : sitenin kimliği (teknoloji + yapay zekâ + bilim)
 * interest   : ilgi çekici, görünür kalır (dünya gündemi, ekonomi, siyaset)
 * peripheral : var ama geri planda (sağlık, kültür, gündem)
 * off        : akışta en sonda (saf magazin spor)
 */
export const CATEGORY_TIER: Record<string, NicheTier> = {
  Teknoloji: "core",
  "Yapay Zekâ": "core",
  Bilim: "core",

  Dünya: "interest",
  Ekonomi: "interest",
  Siyaset: "interest",

  Gündem: "peripheral",
  Sağlık: "peripheral",
  Kültür: "peripheral",

  Spor: "off",
  Diğer: "off",
};

export function tierOf(category: string): NicheTier {
  return CATEGORY_TIER[category] ?? "off";
}

export function weightOf(category: string): number {
  return TIER_WEIGHT[tierOf(category)];
}

/**
 * Takip edilen spor kulüpleri — başlıkta geçerse haber "ilgi çekici"
 * sayılır ve katman ağırlığı yükseltilir.
 *
 * NEDEN: Türkiye'de spor haberi = kulüp haberi. "Spor" kategorisi genel
 * olarak geri planda ama Fenerbahçe/Galatasaray gibi kulüpler geniş kitle
 * ilgilendirir. Kulüp adı geçen haber peripheral'dan interest'e çıkar.
 */
export const TRACKED_CLUBS = [
  // Türkiye
  "fenerbahçe", "fenerbahce", "galatasaray", "beşiktaş", "besiktas",
  "trabzonspor", "başakşehir", "basaksehir", "adana demirspor", "konyaspor",
  // Avrupa (Türkiye'de en çok takip edilenler)
  "barcelona", "barça", "barca", "real madrid", "madrid", "atletico",
  "manchester united", "manchester city", "liverpool", "chelsea", "arsenal",
  "juventus", "milan", "inter", "bayern", "dortmund", "psg", "paris saint",
] as const;

/** Takip edilen teknoloji/YZ varlıkları — başlıkta geçerse çekirdek sayılır. */
export const TRACKED_ENTITIES = [
  // Yapay zekâ
  "openai", "chatgpt", "anthropic", "claude", "gemini", "deepseek", "llama",
  "midjourney", "stable diffusion", "hugging face", "mistral", "copilot",
  "grok", "nvidia", "google deepmind", "perplexity",
  // Donanım / çip
  "apple", "iphone", "ipad", "macbook", "samsung", "galaxy", "pixel",
  "intel", "amd", "tsmc", "qualcomm", "arm", "asus", "lenovo", "dell",
  "nihayet", "ryzen", "geforce", "rtx", "radeon", "snapdragon",
  // Platform / yazılım
  "microsoft", "windows", "google", "android", "meta", "tesla", "spacex",
  "amazon", "aws", "azure", "linux", "github", "docker", "kubernetes",
  // Türkiye teknoloji
  "aselsan", "baykar", "tusaş", "tusas", "roketsan", "tübitak", "tubitak",
  "togg", "bilişim vadisi", "bilisim vadisi", "teknopark",
] as const;

export type NicheMatch = {
  /** Kategori katmanı. */
  tier: NicheTier;
  /** Etkin ağırlık (kulüp/varlık yükseltmesi dahil). */
  weight: number;
  /** Başlıkta bulunan takip edilen kulüp (varsa). */
  club: string | null;
  /** Başlıkta bulunan takip edilen teknoloji varlığı (varsa). */
  entity: string | null;
  /** Nişin çekirdeğinde mi (teknoloji/YZ veya takip edilen varlık). */
  isCore: boolean;
};

function anyMatch(foldedText: string, list: readonly string[]): string | null {
  for (const term of list) {
    if (foldedText.includes(foldTurkish(term))) return term;
  }
  return null;
}

/**
 * Bir haberin niş içindeki konumunu belirler.
 *
 * Kurallar:
 *   • Takip edilen teknoloji/YZ varlığı geçen her haber çekirdek sayılır
 *     (kategorisi "Spor" bile olsa — ör. "Nvidia sponsorluk anlaşması").
 *   • Takip edilen spor kulübü geçen haber "off"dan "interest"e çıkar.
 *   • Kategori katmanı temel ağırlığı verir.
 */
export function matchNiche(input: {
  title: string;
  summary?: string;
  category: string;
}): NicheMatch {
  const folded = foldTurkish(`${input.title} ${input.summary ?? ""}`);
  const tier = tierOf(input.category);

  const entity = anyMatch(folded, TRACKED_ENTITIES);
  const club = anyMatch(folded, TRACKED_CLUBS);

  let weight = weightOf(input.category);
  let resolvedTier = tier;

  // Teknoloji/YZ varlığı → her zaman çekirdek.
  if (entity) {
    weight = Math.max(weight, 1.0);
    resolvedTier = "core";
  }

  // Takip edilen kulüp → en az "interest".
  if (club && resolvedTier !== "core") {
    weight = Math.max(weight, TIER_WEIGHT.interest);
    resolvedTier = "interest";
  }

  return {
    tier: resolvedTier,
    weight,
    club,
    entity,
    isCore: resolvedTier === "core",
  };
}

/** Niş etiketi: arayüzde rozet olarak gösterilir. */
export function nicheLabel(match: NicheMatch, locale: "tr" | "en" = "tr"): string | null {
  if (match.isCore) return locale === "tr" ? "Odak" : "Focus";
  if (match.club) return locale === "tr" ? "Takip" : "Tracked";
  return null;
}

/** Nişin sloganı — ana sayfa ve meta için tek kaynak. */
export const NICHE_COPY = {
  tr: {
    tagline: "Teknoloji ve yapay zekâ gelişmeleri, kaynakla doğrulanmış.",
    description:
      "Teknoloji ve yapay zekâ haberleri; dünya gündemi ve takip edilen kulüplerle birlikte, birden fazla kaynakla karşılaştırılarak yapay zekâ ile özetlenir.",
    coreTitle: "Teknoloji & Yapay Zekâ",
    interestTitle: "Dünya gündemi ve ilgi alanları",
    allTitle: "Tüm akış",
  },
  en: {
    tagline: "Technology and AI, verified across sources.",
    description:
      "Technology and AI news, together with world affairs and followed clubs — compared across multiple sources and summarized with AI.",
    coreTitle: "Technology & AI",
    interestTitle: "World affairs and interests",
    allTitle: "Full feed",
  },
} as const;

/**
 * Kategori GÖRÜNTÜLEME sırası — nişe göre.
 *
 * `CATEGORIES` sabiti (veritabanı, URL, sınıflandırıcı) DEĞİŞMEZ; yalnızca
 * arayüzdeki liste bu sırayı kullanır. Teknoloji ve Yapay Zekâ öne gelir.
 */
export const NICHE_CATEGORY_ORDER = [
  "Teknoloji",
  "Yapay Zekâ",
  "Bilim",
  "Dünya",
  "Ekonomi",
  "Siyaset",
  "Gündem",
  "Sağlık",
  "Kültür",
  "Spor",
  "Diğer",
] as const;

/** Nişe göre sıralanmış kategori listesi. */
export function orderForNiche<T extends string>(categories: readonly T[]): T[] {
  const rank = new Map<string, number>(
    NICHE_CATEGORY_ORDER.map((category, index) => [category, index]),
  );

  return [...categories].sort(
    (a, b) => (rank.get(a) ?? 99) - (rank.get(b) ?? 99),
  );
}
