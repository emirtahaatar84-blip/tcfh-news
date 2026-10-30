/**
 * Cihaz içi kalıcılık katmanı — KVKK "sıfır kişisel veri" mimarisi.
 *
 * Hiçbir veri sunucuya gönderilmez. Her şey yalnızca bu cihazın
 * localStorage'ında tutulur. Şema sürümlenmiştir (storageVersion: 1) ve
 * gelecekteki göçler için `migrate()` kancası hazırdır.
 *
 * Anahtarlar `eth.v1.*` ad alanındadır. Eski `news:*` anahtarları ilk
 * okumada otomatik olarak yeni şemaya taşınır.
 */

export const STORAGE_VERSION = 1 as const;
export const STORAGE_PREFIX = "eth.v1";

export const STORAGE_EVENT = "eth:storage-changed";

/** localStorage kullanılamıyorsa (gizli mod, engelli çerezler) true döner. */
let storageAvailable: boolean | null = null;

export function isStorageAvailable(): boolean {
  if (storageAvailable !== null) return storageAvailable;
  if (typeof window === "undefined") return false;

  try {
    const probe = `${STORAGE_PREFIX}.probe`;
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }

  return storageAvailable;
}

/** Test/SSR için önbelleği sıfırlar. */
export function resetStorageAvailability(): void {
  storageAvailable = null;
}

// ─── Şema tipleri ───────────────────────────────────────────────────────────

export type ThemePreference = "system" | "dark" | "light";
export type FontSizePreference = "sm" | "md" | "lg";
export type LineHeightPreference = "tight" | "normal" | "wide";
/**
 * "auto" görünüm genişliğine göre çözer (< 768 Geniş, >= 768 Dengeli).
 * Kullanıcı üç moddan birini seçerse tercih bu cihazda saklanır.
 */
export type DensityPreference =
  | "auto"
  | "compact"
  | "balanced"
  | "comfortable";

export type Preferences = {
  storageVersion: typeof STORAGE_VERSION;
  theme: ThemePreference;
  fontSize: FontSizePreference;
  lineHeight: LineHeightPreference;
  /** Sıkı / Dengeli / Geniş; "auto" görünüm genişliğine göre çözer. */
  density: DensityPreference;
  /** Sade okuma modu: yan paneller ve öneri kutuları gizlenir. */
  readingMode: boolean;
  /** Okundu işaretleri açık mı? */
  readMarks: boolean;
  /** Kart 10 sn görünür kalınca otomatik "okundu" işaretle. */
  autoRead: boolean;
  /** İsteğe bağlı il seçimi (bölge haberleri) — yalnızca cihazda. */
  city: string | null;
  /** Sesli okuma hızı (0.75 … 2). */
  speechRate: number;
  /** Seçili ses (SpeechSynthesisVoice.voiceURI) — yalnızca cihazda. */
  speechVoice: string | null;
};

export type Bookmark = {
  id: string;
  title: string;
  /** Yerelleştirilmiş göreli yol, örn. /tr/news/abc */
  url: string;
  category: string;
  /** ISO 8601 */
  savedAt: string;
};

export type PlaybackState = {
  storageVersion: typeof STORAGE_VERSION;
  episodeId: string;
  title: string;
  /** Ses kaynağı (göreli URL) — dönüşte devam edebilmek için. */
  src: string;
  imageUrl: string | null;
  /** Kaldığı saniye */
  seconds: number;
  updatedAt: string;
  speed: number;
};

type StoreKey =
  | "prefs"
  | "bookmarks"
  | "read"
  | "playback"
  | "searches"
  | "speech";

function keyFor(name: StoreKey): string {
  return `${STORAGE_PREFIX}.${name}`;
}

export const DEFAULT_PREFERENCES: Preferences = {
  storageVersion: STORAGE_VERSION,
  theme: "system",
  fontSize: "md",
  lineHeight: "normal",
  density: "auto",
  readingMode: false,
  readMarks: true,
  autoRead: true,
  city: null,
  speechRate: 1,
  speechVoice: null,
};

// ─── Düşük seviye okuma/yazma ───────────────────────────────────────────────

function readRaw<T>(name: StoreKey): T | null {
  if (!isStorageAvailable()) return null;

  try {
    const raw = window.localStorage.getItem(keyFor(name));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeRaw(name: StoreKey, value: unknown): boolean {
  if (!isStorageAvailable()) return false;

  try {
    window.localStorage.setItem(keyFor(name), JSON.stringify(value));
    notifyStorageChanged();
    return true;
  } catch {
    // Kota dolu ya da izin yok — sessizce başarısız ol.
    return false;
  }
}

/** Abone bileşenlere (ör. Feed) değişikliği duyurur. */
export function notifyStorageChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STORAGE_EVENT));
}

// ─── Göç (migration) ────────────────────────────────────────────────────────

/**
 * Şema sürümü ileride artırıldığında eski veriler burada dönüştürülür.
 * Şu an tek sürüm (v1) olduğu için yalnızca eski `news:*` anahtarlarını
 * yeni `eth.v1.*` yapısına taşır.
 */
function migrate(): void {
  if (!isStorageAvailable()) return;

  try {
    const legacyBookmarks = window.localStorage.getItem("news:bookmarks");

    if (legacyBookmarks && !window.localStorage.getItem(keyFor("bookmarks"))) {
      const parsed: unknown = JSON.parse(legacyBookmarks);

      if (Array.isArray(parsed)) {
        const ids = parsed.filter(
          (value): value is string => typeof value === "string",
        );

        const now = new Date().toISOString();

        const items: Bookmark[] = ids.map((id) => ({
          id,
          title: "",
          url: `/tr/news/${id}`,
          category: "",
          savedAt: now,
        }));

        window.localStorage.setItem(
          keyFor("bookmarks"),
          JSON.stringify({ storageVersion: STORAGE_VERSION, items }),
        );
      }

      window.localStorage.removeItem("news:bookmarks");
    }
  } catch {
    // Bozuk eski veri — yok say.
  }
}

let migrated = false;

function ensureMigrated(): void {
  if (migrated) return;
  migrated = true;
  migrate();
}

// ─── Tercihler ──────────────────────────────────────────────────────────────

export function getPreferences(): Preferences {
  ensureMigrated();

  const stored = readRaw<Partial<Preferences>>("prefs");

  if (!stored || stored.storageVersion !== STORAGE_VERSION) {
    return { ...DEFAULT_PREFERENCES };
  }

  return {
    ...DEFAULT_PREFERENCES,
    ...stored,
    storageVersion: STORAGE_VERSION,
  };
}

export function setPreferences(patch: Partial<Preferences>): Preferences {
  const next: Preferences = {
    ...getPreferences(),
    ...patch,
    storageVersion: STORAGE_VERSION,
  };

  writeRaw("prefs", next);
  return next;
}

// ─── Yer imleri ─────────────────────────────────────────────────────────────

export function getBookmarks(): Bookmark[] {
  ensureMigrated();

  const stored = readRaw<{ storageVersion?: number; items?: unknown }>(
    "bookmarks",
  );

  if (!stored || stored.storageVersion !== STORAGE_VERSION) return [];
  if (!Array.isArray(stored.items)) return [];

  return stored.items.filter((entry): entry is Bookmark => {
    if (!entry || typeof entry !== "object") return false;
    const candidate = entry as Partial<Bookmark>;
    return typeof candidate.id === "string";
  });
}

function saveBookmarks(items: Bookmark[]): void {
  writeRaw("bookmarks", { storageVersion: STORAGE_VERSION, items });
}

export function isBookmarked(id: string): boolean {
  return getBookmarks().some((item) => item.id === id);
}

export function addBookmark(bookmark: Bookmark): Bookmark[] {
  const current = getBookmarks().filter((item) => item.id !== bookmark.id);
  const next = [bookmark, ...current];
  saveBookmarks(next);
  return next;
}

export function removeBookmark(id: string): Bookmark[] {
  const next = getBookmarks().filter((item) => item.id !== id);
  saveBookmarks(next);
  return next;
}

export function toggleBookmark(bookmark: Bookmark): {
  bookmarks: Bookmark[];
  saved: boolean;
} {
  if (isBookmarked(bookmark.id)) {
    return { bookmarks: removeBookmark(bookmark.id), saved: false };
  }

  return { bookmarks: addBookmark(bookmark), saved: true };
}

/** Kart göründüğünde eski (başlıksız) yer imi kaydını zenginleştirir. */
export function enrichBookmark(
  id: string,
  patch: Partial<Omit<Bookmark, "id">>,
): void {
  const items = getBookmarks();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return;

  const current = items[index];
  const next = { ...current };

  // Yalnızca gerçekten değişen alanları yaz — STORAGE_EVENT döngüsünü önler.
  let changed = false;
  for (const key of ["title", "url", "category"] as const) {
    const value = patch[key];
    if (typeof value === "string" && value && current[key] !== value) {
      next[key] = value;
      changed = true;
    }
  }

  if (!changed) return;

  items[index] = next;
  saveBookmarks(items);
}

export function clearBookmarks(): Bookmark[] {
  saveBookmarks([]);
  return [];
}

/** İçe aktarma: mevcut kayıtlarla birleştirir, çift kayıtları atlar. */
export function importBookmarks(incoming: Bookmark[]): {
  items: Bookmark[];
  added: number;
  skipped: number;
} {
  const current = getBookmarks();
  const seen = new Set(current.map((item) => item.id));
  let added = 0;
  let skipped = 0;

  for (const bookmark of incoming) {
    if (!bookmark?.id || typeof bookmark.id !== "string") {
      skipped += 1;
      continue;
    }

    if (seen.has(bookmark.id)) {
      skipped += 1;
      continue;
    }

    seen.add(bookmark.id);
    added += 1;
    current.push({
      id: bookmark.id,
      title: typeof bookmark.title === "string" ? bookmark.title : "",
      url:
        typeof bookmark.url === "string" && bookmark.url.startsWith("/")
          ? bookmark.url
          : `/tr/news/${bookmark.id}`,
      category:
        typeof bookmark.category === "string" ? bookmark.category : "",
      savedAt:
        typeof bookmark.savedAt === "string"
          ? bookmark.savedAt
          : new Date().toISOString(),
    });
  }

  saveBookmarks(current);
  return { items: current, added, skipped };
}

// ─── Okundu işaretleri ──────────────────────────────────────────────────────

export function getReadIds(): string[] {
  ensureMigrated();

  const stored = readRaw<{ storageVersion?: number; ids?: unknown }>("read");
  if (!stored || stored.storageVersion !== STORAGE_VERSION) return [];
  if (!Array.isArray(stored.ids)) return [];

  return stored.ids.filter(
    (value): value is string => typeof value === "string",
  );
}

export function isRead(id: string): boolean {
  return getReadIds().includes(id);
}

export function markRead(id: string): string[] {
  const current = getReadIds();
  if (current.includes(id)) return current;

  // En fazla 500 kimlik tut — localStorage şişmesin.
  const next = [id, ...current].slice(0, 500);
  writeRaw("read", { storageVersion: STORAGE_VERSION, ids: next });
  return next;
}

export function clearReadMarks(): void {
  writeRaw("read", { storageVersion: STORAGE_VERSION, ids: [] });
}

// ─── Oynatma konumu ─────────────────────────────────────────────────────────

export function getPlayback(): PlaybackState | null {
  ensureMigrated();

  const stored = readRaw<PlaybackState>("playback");
  if (!stored || stored.storageVersion !== STORAGE_VERSION) return null;
  if (typeof stored.episodeId !== "string") return null;

  return stored;
}

export function savePlayback(state: Omit<PlaybackState, "storageVersion">): void {
  writeRaw("playback", { ...state, storageVersion: STORAGE_VERSION });
}

export function clearPlayback(): void {
  if (!isStorageAvailable()) return;
  try {
    window.localStorage.removeItem(keyFor("playback"));
    notifyStorageChanged();
  } catch {
    // yok say
  }
}

// ─── Son aramalar ───────────────────────────────────────────────────────────

const MAX_RECENT_SEARCHES = 8;

export function getRecentSearches(): string[] {
  ensureMigrated();

  const stored = readRaw<{ storageVersion?: number; items?: unknown }>(
    "searches",
  );
  if (!stored || stored.storageVersion !== STORAGE_VERSION) return [];
  if (!Array.isArray(stored.items)) return [];

  return stored.items.filter(
    (value): value is string => typeof value === "string",
  );
}

export function addRecentSearch(term: string): string[] {
  const trimmed = term.trim();
  if (!trimmed) return getRecentSearches();

  const next = [
    trimmed,
    ...getRecentSearches().filter((item) => item !== trimmed),
  ].slice(0, MAX_RECENT_SEARCHES);

  writeRaw("searches", { storageVersion: STORAGE_VERSION, items: next });
  return next;
}

export function clearRecentSearches(): void {
  writeRaw("searches", { storageVersion: STORAGE_VERSION, items: [] });
}

// ─── Tüm cihaz verisini sil ────────────────────────────────────────────────

export async function clearAllDeviceData(): Promise<void> {
  // Push aboneliği varsa geri al (sunucuda kayıtlı olmasın).
  try {
    const endpoint = window.localStorage.getItem("pwa-push-endpoint");
    if (endpoint && "serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) await subscription.unsubscribe();
    }
  } catch {
    // yok say
  }

  try {
    for (const name of [
      "prefs",
      "bookmarks",
      "read",
      "playback",
      "searches",
      "speech",
    ] as const) {
      window.localStorage.removeItem(keyFor(name));
    }

    // Eski/pwa anahtarları ve oturum içi sayaçlar.
    window.localStorage.removeItem("pwa-push-endpoint");
    window.localStorage.removeItem("pwa-install-dismissed");
    window.localStorage.removeItem("news:viewed-news");

    window.sessionStorage.clear();
  } catch {
    // Depolama kapalı olabilir.
  }

  // Service worker cache'lerini temizle (çevrimdışı haber kopyaları dahil).
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // yok say
  }

  notifyStorageChanged();
}

// ─── Anonim görüntülenme sayacı ────────────────────────────────────────────

const VIEWED_SESSION_PREFIX = "eth.viewed:";

/** Aynı haber oturumda yalnızca bir kez sayılır. */
function consumeViewedOnce(id: string): boolean {
  try {
    const key = `${VIEWED_SESSION_PREFIX}${id}`;
    if (window.sessionStorage.getItem(key)) return false;
    window.sessionStorage.setItem(key, "1");
    return true;
  } catch {
    return true;
  }
}

/**
 * Sunucudaki görüntülenme sayacını artırır. Kişisel veri gönderilmez
 * (yalnızca haber kimliği); IP sunucuda saklanmaz.
 */
export async function trackView(id: string): Promise<number | null> {
  if (!consumeViewedOnce(id)) return null;

  try {
    const response = await fetch("/api/news/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
      cache: "no-store",
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { viewCount?: unknown };
    return typeof data.viewCount === "number" ? data.viewCount : null;
  } catch {
    return null;
  }
}

// ─── Portre okuma tekilleştirmesi (oturum içi) ─────────────────────────────
//
// Sunucuda kişi bazlı izleme yok; yalnızca toplu sayaç var. Aynı portrenin
// oturumda iki kez sayılmaması için sessionStorage kullanılır (sekme
// kapanınca silinir).

const PORTRAIT_VIEWED_KEY = `${STORAGE_PREFIX}.portrait-viewed`;

export function hasViewedPortrait(id: string): boolean {
  try {
    const raw = window.sessionStorage.getItem(PORTRAIT_VIEWED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) && parsed.includes(id);
  } catch {
    return false;
  }
}

/** İlk çağrıda true döner ve kimliği oturuma yazar. */
export function consumePortraitView(id: string): boolean {
  try {
    const raw = window.sessionStorage.getItem(PORTRAIT_VIEWED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const ids = Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];

    if (ids.includes(id)) return false;

    window.sessionStorage.setItem(
      PORTRAIT_VIEWED_KEY,
      JSON.stringify([...ids, id].slice(-200)),
    );

    return true;
  } catch {
    // Depolama kapalı: sayım yine de yapılabilir.
    return true;
  }
}

// ─── Sesli okuma konumu ─────────────────────────────────────────────────────
//
// Sekme kapanınca sunucuda iz kalmaz: konum yalnızca bu cihazda tutulur.
// "Kaldığın yerden devam et" önerisi bu kayda dayanır.

export type SpeechResume = {
  storageVersion: typeof STORAGE_VERSION;
  contentId: string;
  title: string;
  url: string;
  mode: "summary" | "full";
  sentenceIndex: number;
  rate: number;
  updatedAt: string;
};

export function getSpeechResume(): SpeechResume | null {
  ensureMigrated();

  const stored = readRaw<SpeechResume>("speech");
  if (!stored || stored.storageVersion !== STORAGE_VERSION) return null;
  if (typeof stored.contentId !== "string" || !stored.contentId) return null;
  if (typeof stored.sentenceIndex !== "number") return null;

  return stored;
}

export function saveSpeechResume(
  input: Omit<SpeechResume, "storageVersion" | "updatedAt">,
): void {
  writeRaw("speech", {
    ...input,
    storageVersion: STORAGE_VERSION,
    updatedAt: new Date().toISOString(),
  });
}

export function clearSpeechResume(): void {
  if (!isStorageAvailable()) return;

  try {
    window.localStorage.removeItem(keyFor("speech"));
    notifyStorageChanged();
  } catch {
    // yok say
  }
}
