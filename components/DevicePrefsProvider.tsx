"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_PREFERENCES,
  STORAGE_EVENT,
  getPreferences,
  isStorageAvailable,
  setPreferences,
  type DensityPreference,
  type FontPreference,
  type FontSizePreference,
  type LineHeightPreference,
  type Preferences,
  type ThemePreference,
} from "@/lib/local-store";
import {
  type Density,
  isDensity,
} from "@/lib/design/density";

type DevicePrefsContextValue = {
  prefs: Preferences;
  storageAvailable: boolean;
  ready: boolean;
  setTheme: (theme: ThemePreference) => void;
  setFontSize: (size: FontSizePreference) => void;
  setLineHeight: (height: LineHeightPreference) => void;
  setReadingMode: (enabled: boolean) => void;
  setReadMarks: (enabled: boolean) => void;
  setAutoRead: (enabled: boolean) => void;
  setDensity: (density: DensityPreference) => void;
  /** FAZ 3.3 — kişisel ilgi alanları (yalnızca localStorage, sunucuya gitmez). */
  setInterests: (interests: string[]) => void;
  setFont: (font: FontPreference) => void;
  /** Ekranda gerçekten uygulanan yoğunluk ("auto" çözümlenmiş hâli). */
  resolvedDensity: Density;
};

const DevicePrefsContext = createContext<DevicePrefsContextValue | null>(null);

function resolveTheme(theme: ThemePreference): "dark" | "light" {
  if (theme !== "system") return theme;

  if (typeof window === "undefined") return "dark";

  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

/** Genişlik sınıfına göre varsayılan yoğunluk (işaretçi tipi de dikkate alınır). */
function resolveDensity(preference: DensityPreference): Density {
  if (preference !== "auto" && isDensity(preference)) return preference;

  if (typeof window === "undefined") return "comfortable";

  const width = window.innerWidth;
  if (width < 768) return "comfortable";
  // 768-1179 ve >= 1180: Dengeli. İşaretçi tipi yoğunluğu değiştirmez;
  // yalnızca CSS'te dokunma hedefi/durum stillerini etkiler.
  return "balanced";
}

function applyTheme(theme: ThemePreference): void {
  if (typeof document === "undefined") return;

  const resolved = resolveTheme(theme);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

/**
 * Cihaz içi tercihler: tema, yazı boyutu, satır aralığı, sade okuma modu
 * ve okundu işaretleri. Hepsi yalnızca localStorage'da tutulur; sunucuya
 * hiçbir şey gönderilmez.
 *
 * `prefers-color-scheme` varsayılanı izlenir; kullanıcı seçimi varsa o
 * uygulanır. FOUC, root layout'taki satır içi script ile engellenir.
 */
export function DevicePrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [ready, setReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [resolvedDensity, setResolvedDensity] = useState<Density>("comfortable");

  // İlk yükleme: localStorage'dan oku, temayı uygula.
  useEffect(() => {
    const available = isStorageAvailable();
    setStorageAvailable(available);

    const stored = getPreferences();
    setPrefs(stored);
    applyTheme(stored.theme);
    setReady(true);

    const sync = () => {
      const next = getPreferences();
      setPrefs(next);
      applyTheme(next.theme);
    };

    window.addEventListener(STORAGE_EVENT, sync);
    window.addEventListener("storage", sync);

    return () => {
      window.removeEventListener(STORAGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Yoğunluk: tercih "auto" ise genişlik/işaretçi değişimini izle.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncDensity = () => {
      const next = resolveDensity(prefs.density);
      setResolvedDensity(next);
      document.documentElement.dataset.density = next;
    };

    syncDensity();

    if (prefs.density !== "auto") return;

    window.addEventListener("resize", syncDensity);

    return () => {
      window.removeEventListener("resize", syncDensity);
    };
  }, [prefs.density, ready]);

  // "system" tercihinde işletim sistemi temasını canlı izle.
  useEffect(() => {
    if (prefs.theme !== "system") return;

    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyTheme("system");

    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [prefs.theme]);

  // Yazı tipi ölçeği ve satır aralığını <html> üzerinde yayınla.
  useEffect(() => {
    if (typeof document === "undefined") return;

    document.documentElement.dataset.fontSize = prefs.fontSize;
    document.documentElement.dataset.lineHeight = prefs.lineHeight;
    document.documentElement.dataset.readingMode = prefs.readingMode
      ? "on"
      : "off";
  }, [prefs.fontSize, prefs.lineHeight, prefs.readingMode]);

  const update = useCallback((patch: Partial<Preferences>) => {
    const next = setPreferences(patch);
    setPrefs(next);

    if (patch.theme) applyTheme(next.theme);
  }, []);

  const setAutoRead = useCallback((enabled: boolean) => {
    update({ autoRead: enabled });
  }, [update]);

  const value = useMemo<DevicePrefsContextValue>(
    () => ({
      prefs,
      storageAvailable,
      ready,
      setTheme: (theme) => update({ theme }),
      setFontSize: (fontSize) => update({ fontSize }),
      setLineHeight: (lineHeight) => update({ lineHeight }),
      setReadingMode: (readingMode) => update({ readingMode }),
      setFont: (font) => update({ font }),
      setInterests: (interests) =>
        update({ interests: [...new Set(interests)].slice(0, 12) }),
      setReadMarks: (readMarks) => update({ readMarks }),
      setAutoRead,
      setDensity: (density) => update({ density }),
      resolvedDensity,
    }),
    [prefs, ready, storageAvailable, update, setAutoRead, resolvedDensity],
  );

  return (
    <DevicePrefsContext.Provider value={value}>
      {children}
    </DevicePrefsContext.Provider>
  );
}

export function useDevicePrefs(): DevicePrefsContextValue {
  const context = useContext(DevicePrefsContext);

  if (!context) {
    throw new Error("useDevicePrefs, DevicePrefsProvider içinde kullanılmalıdır.");
  }

  return context;
}

/**
 * localStorage engelliyse gösterilen zarif bilgi şeridi. Uygulama
 * çökmez; yalnızca cihaz içi özellikler devre dışı kalır.
 */
export function StorageNotice() {
  const { storageAvailable, ready } = useDevicePrefs();

  if (!ready || storageAvailable) return null;

  return (
    <div
      role="status"
      className="border-b border-amber-500/25 bg-amber-500/10 px-space-4 py-space-2 text-center text-xs text-amber-300"
    >
      Tarayıcınız cihaz içi depolamaya izin vermiyor. Yer imleri, tema ve
      dinleme konumu bu oturumda saklanamaz; site bunun dışında normal çalışır.
    </div>
  );
}
