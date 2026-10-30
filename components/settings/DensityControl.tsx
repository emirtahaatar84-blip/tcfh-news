"use client";

import { useDevicePrefs } from "@/components/DevicePrefsProvider";
import { DENSITIES, type Density } from "@/lib/design/tokens";
import { densityLabel } from "@/lib/design/density";

type Props = {
  /** Görünür etiket (ör. "Yoğunluk"). */
  label: string;
  /** Ekran okuyucu için grup adı. */
  groupLabel: string;
  /** Her modun kısa açıklaması (title). */
  hints?: Record<Density, string>;
  /** "Otomatik" durumunun kısa etiketi. */
  autoLabel?: string;
  /** "Otomatiğe dön" düğmesi metni. */
  resetLabel?: string;
  className?: string;
};

/**
 * Yoğunluk (density) kontrolü — 3 seçenek, aria-pressed, 44 px hedef.
 *
 * - Seçim yalnızca cihazda (localStorage `storageVersion: 1`) saklanır.
 * - Yazı boyutunu DEĞİŞTİRMEZ; yalnızca aralıkları ölçekler.
 * - "Otomatik" seçeneği görünüm genişliğine göre çözer (<768 Geniş,
 *   >=768 Dengeli); kullanıcı sabit bir mod seçebilir.
 */
export function DensityControl({
  label,
  groupLabel,
  hints,
  autoLabel = "Otomatik",
  resetLabel = "Otomatiğe dön",
  className,
}: Props) {
  const { prefs, setDensity, resolvedDensity } = useDevicePrefs();

  const isAuto = prefs.density === "auto";

  return (
    <div className={className}>
      <div className="flex flex-wrap items-baseline justify-between gap-inline">
        <p className="t-meta font-semibold text-zinc-200">{label}</p>
        <p className="t-label text-zinc-500" aria-live="polite">
          {isAuto ? autoLabel : densityLabel(resolvedDensity)}
        </p>
      </div>

      <div
        role="group"
        aria-label={groupLabel}
        className="mt-space-2 grid grid-cols-3 gap-inline"
      >
        {DENSITIES.map((density) => {
          const active = prefs.density === density;
          return (
            <button
              key={density}
              type="button"
              aria-pressed={active}
              aria-label={densityLabel(density)}
              title={hints?.[density]}
              onClick={() => setDensity(density)}
              className="density-option"
            >
              {densityLabel(density)}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setDensity("auto")}
        aria-pressed={isAuto}
        className={`mt-space-2 inline-flex min-h-touch items-center rounded-full px-space-3 text-label font-semibold transition ${
          isAuto
            ? "bg-blue-500/15 text-blue-300"
            : "text-zinc-400 hover:text-zinc-200"
        }`}
      >
        {resetLabel}
      </button>
    </div>
  );
}
