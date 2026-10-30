export const CATEGORIES = [
  "Gündem",
  "Teknoloji",
  "Yapay Zekâ",
  "Ekonomi",
  "Siyaset",
  "Spor",
  "Bilim",
  "Dünya",
  "Sağlık",
  "Kültür",
  "Diğer",
] as const;

export type Category = (typeof CATEGORIES)[number];

const ALIASES: Record<string, Category> = {
  // Legacy English values (pre-migration data / LLM output)
  tech: "Teknoloji",
  technology: "Teknoloji",
  economy: "Ekonomi",
  business: "Ekonomi",
  finance: "Ekonomi",
  world: "Dünya",
  international: "Dünya",
  politics: "Siyaset",
  political: "Siyaset",
  sport: "Spor",
  sports: "Spor",
  culture: "Kültür",
  arts: "Kültür",
  entertainment: "Kültür",
  health: "Sağlık",
  science: "Bilim",
  other: "Diğer",
  general: "Gündem",
  news: "Gündem",
  // ASCII-folded Turkish
  gundem: "Gündem",
  teknoloji: "Teknoloji",
  // AI / Yapay Zekâ
  ai: "Yapay Zekâ",
  "yapay zeka": "Yapay Zekâ",
  yapayzeka: "Yapay Zekâ",
  "artificial intelligence": "Yapay Zekâ",
  artificialintelligence: "Yapay Zekâ",
  "machine learning": "Yapay Zekâ",
  machinelearning: "Yapay Zekâ",
  llm: "Yapay Zekâ",
  generativeai: "Yapay Zekâ",
  "generative ai": "Yapay Zekâ",
  ekonomi: "Ekonomi",
  siyaset: "Siyaset",
  bilim: "Bilim",
  dunya: "Dünya",
  saglik: "Sağlık",
  kultur: "Kültür",
  diger: "Diğer",
  // Portre/dış feed kategorileri → site kategorileri
  savunma: "Gündem",
  defense: "Gündem",
  yazilim: "Teknoloji",
  yazılım: "Teknoloji",
  software: "Teknoloji",
  telefon: "Teknoloji",
  phone: "Teknoloji",
  mobil: "Teknoloji",
  donanim: "Teknoloji",
  donanım: "Teknoloji",
  hardware: "Teknoloji",
  oyun: "Teknoloji",
  gaming: "Teknoloji",
  podcastler: "Kültür",
  podcast: "Kültür",
  genel: "Gündem",
  otomobil: "Teknoloji",
  uzay: "Bilim",
};

export function isCategory(value: unknown): value is Category {
  return (
    typeof value === "string" &&
    (CATEGORIES as readonly string[]).includes(value)
  );
}

export function normalizeCategory(
  value: unknown,
  fallback: Category = "Diğer",
): Category {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().replace(/[.,;:!]+$/, "");

  if (isCategory(normalized)) return normalized;

  const alias = ALIASES[normalized.toLowerCase()];
  if (alias) return alias;

  return fallback;
}

/**
 * Lowercase Turkish handle names used on the category bar and feed cards
 * (e.g. "@gündem", "@teknoloji").
 */
export const ALL_CATEGORY_HANDLE = "gündem";

export const CATEGORY_HANDLES: Record<Category, string> = {
  Gündem: "gündem",
  Teknoloji: "teknoloji",
  "Yapay Zekâ": "yapayzeka",
  Ekonomi: "ekonomi",
  Siyaset: "siyaset",
  Spor: "spor",
  Bilim: "bilim",
  Dünya: "dünya",
  Sağlık: "sağlık",
  Kültür: "kültür",
  Diğer: "diğer",
};

/** "@teknoloji" style handle for a category value. */
export function handleForCategory(category: string): string {
  return `@${CATEGORY_HANDLES[isCategory(category) ? category : "Diğer"]}`;
}

/**
 * URL slug'ları (ASCII): /akis?kategori=yapayzeka
 * Görünen @handle'lardan farklıdır; adreslerde Türkçe karakter kullanılmaz.
 */
export const CATEGORY_SLUGS: Record<Category, string> = {
  Gündem: "gundem",
  Teknoloji: "teknoloji",
  "Yapay Zekâ": "yapayzeka",
  Ekonomi: "ekonomi",
  Siyaset: "siyaset",
  Spor: "spor",
  Bilim: "bilim",
  Dünya: "dunya",
  Sağlık: "saglik",
  Kültür: "kultur",
  Diğer: "diger",
};

const SLUG_TO_CATEGORY: Record<string, Category> = Object.fromEntries(
  (Object.entries(CATEGORY_SLUGS) as [Category, string][]).map(
    ([category, slug]) => [slug, category],
  ),
);

export function slugForCategory(value: unknown): string {
  return CATEGORY_SLUGS[isCategory(value) ? value : "Diğer"];
}

/** Bilinmeyen slug → null (URL elle düzenlenebilir). */
export function categoryFromSlug(value: unknown): Category | null {
  if (typeof value !== "string") return null;
  return SLUG_TO_CATEGORY[value.trim().toLowerCase()] ?? null;
}

/** Sol kolondaki kategori listesi (Tümü + 10 kategori; "Diğer" gizli). */
export const FEED_NAV_CATEGORIES: readonly Category[] = CATEGORIES.filter(
  (category) => category !== "Diğer",
);

/**
 * Static Tailwind classes for category badges. Keep this map static so that
 * Tailwind can detect every class during the build.
 */
export const CATEGORY_BADGE_CLASSES: Record<Category, string> = {
  Gündem: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
  Teknoloji: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",
  "Yapay Zekâ": "border-cyan-500/30 bg-cyan-500/10 text-cyan-400",
  Ekonomi: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  Siyaset: "border-red-500/30 bg-red-500/10 text-red-400",
  Spor: "border-orange-500/30 bg-orange-500/10 text-orange-400",
  Bilim: "border-blue-500/30 bg-blue-500/10 text-blue-400",
  Dünya: "border-sky-500/30 bg-sky-500/10 text-sky-400",
  Sağlık: "border-rose-500/30 bg-rose-500/10 text-rose-400",
  Kültür: "border-violet-500/30 bg-violet-500/10 text-violet-400",
  Diğer: "border-white/10 bg-white/5 text-zinc-400",
};

/** Icon tile background + icon color per category. */
export const CATEGORY_AVATAR_CLASSES: Record<Category, string> = {
  Gündem: "bg-[#22252a] text-zinc-300",
  Teknoloji: "bg-[#22252a] text-yellow-500",
  "Yapay Zekâ": "bg-[#22252a] text-cyan-400",
  Ekonomi: "bg-[#22252a] text-emerald-500",
  Siyaset: "bg-[#22252a] text-red-500",
  Spor: "bg-[#22252a] text-orange-500",
  Bilim: "bg-[#22252a] text-blue-500",
  Dünya: "bg-[#22252a] text-sky-500",
  Sağlık: "bg-[#22252a] text-rose-500",
  Kültür: "bg-[#22252a] text-violet-500",
  Diğer: "bg-[#22252a] text-zinc-400",
};

/** Handle (@kategori) text color per category. */
export const CATEGORY_TEXT_CLASSES: Record<Category, string> = {
  Gündem: "text-zinc-300",
  Teknoloji: "text-yellow-400",
  "Yapay Zekâ": "text-cyan-400",
  Ekonomi: "text-emerald-400",
  Siyaset: "text-red-400",
  Spor: "text-orange-400",
  Bilim: "text-blue-400",
  Dünya: "text-sky-400",
  Sağlık: "text-rose-400",
  Kültür: "text-violet-400",
  Diğer: "text-zinc-400",
};

export function badgeClassesFor(category: string): string {
  return CATEGORY_BADGE_CLASSES[
    isCategory(category) ? category : "Diğer"
  ];
}

export function avatarClassesFor(category: string): string {
  return CATEGORY_AVATAR_CLASSES[
    isCategory(category) ? category : "Diğer"
  ];
}

/** Handle (@kategori) text color per category. */
export function accentClassesFor(category: string): string {
  return CATEGORY_TEXT_CLASSES[
    isCategory(category) ? category : "Diğer"
  ];
}
