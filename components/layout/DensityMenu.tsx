"use client";

import { useEffect, useRef, useState } from "react";
import { TextAlignIcon } from "@/components/icons";
import { useDevicePrefs } from "@/components/DevicePrefsProvider";
import { DENSITIES, type Density } from "@/lib/design/tokens";
import { densityLabel } from "@/lib/design/density";

type Labels = {
  density: string;
  densityGroup: string;
  densityHint: string;
  densityAuto: string;
  densityResetAuto: string;
  densityCompactHint: string;
  densityBalancedHint: string;
  densityComfortableHint: string;
};

/**
 * Üst menüde yoğunluk seçici. Üç mod da her genişlikte erişilebilir;
 * 44 px hedef, aria-pressed ve Escape ile kapanma. Tercih cihazda saklanır.
 */
export function DensityMenu({ labels }: { labels: Labels }) {
  const { prefs, setDensity, resolvedDensity } = useDevicePrefs();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const hints: Record<Density, string> = {
    compact: labels.densityCompactHint,
    balanced: labels.densityBalancedHint,
    comfortable: labels.densityComfortableHint,
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`${labels.density}: ${densityLabel(resolvedDensity)}`}
        title={labels.density}
        className="flex h-[var(--size-touch)] w-[var(--size-touch)] items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100"
      >
        <TextAlignIcon className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-space-2 w-64 rounded-xl border border-[#22252a] bg-[#16181c] p-space-3 shadow-2xl">
          <p className="text-label text-zinc-300">{labels.density}</p>
          <p className="mt-space-1 text-meta text-zinc-500">{labels.densityHint}</p>

          <div role="group" aria-label={labels.densityGroup} className="mt-space-3 flex">
            {DENSITIES.map((density) => (
              <button
                key={density}
                type="button"
                aria-pressed={resolvedDensity === density}
                title={hints[density]}
                onClick={() => {
                  setDensity(density);
                  setOpen(false);
                }}
                className={`density-option flex-1 ${
                  resolvedDensity === density
                    ? "border-blue-500/50 bg-blue-500/15 text-blue-300"
                    : ""
                }`}
              >
                {densityLabel(density)}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setDensity("auto");
              setOpen(false);
            }}
            aria-pressed={prefs.density === "auto"}
            className="mt-space-2 inline-flex min-h-[var(--size-touch)] items-center rounded-full px-space-2 text-meta font-semibold text-zinc-400 transition hover:text-zinc-100"
          >
            {labels.densityResetAuto}
          </button>
        </div>
      ) : null}
    </div>
  );
}
