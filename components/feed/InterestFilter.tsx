"use client";

import { useDevicePrefs } from "@/components/DevicePrefsProvider";
import { CATEGORIES } from "@/lib/categories";

/**
 * FAZ 3.3 (frontend) — Kişisel filtre ("ilgi alanlarım").
 *
 * Kullanıcı kategori seçer; seçim YALNIZCA localStorage'da tutulur
 * (çerez yok, sunucuda kullanıcı verisi yok). Akış bu listeye göre
 * süzülür. "Tümünü göster" seçimi sıfırlar.
 */

type Props = {
  labels: {
    title: string;
    hint: string;
    reset: string;
    empty: string;
    categories: Record<string, string>;
  };
};

export function InterestFilter({ labels }: Props) {
  const { prefs, setInterests } = useDevicePrefs();
  const selected = prefs.interests ?? [];

  const toggle = (category: string) => {
    const next = selected.includes(category)
      ? selected.filter((item) => item !== category)
      : [...selected, category];
    setInterests(next);
  };

  return (
    <section
      aria-labelledby="interests-title"
      className="rounded-2xl border border-[#22252a] bg-[#16181c] p-space-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-space-2">
        <h2 id="interests-title" className="t-meta font-semibold text-zinc-200">
          {labels.title}
        </h2>

        {selected.length > 0 ? (
          <button
            type="button"
            onClick={() => setInterests([])}
            className="inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-[#22252a] px-space-3 text-label font-semibold text-zinc-400 transition hover:border-[#31363e] hover:text-zinc-200"
          >
            {labels.reset}
          </button>
        ) : null}
      </div>

      <p className="mt-space-1 text-[11px] text-zinc-500">{labels.hint}</p>

      <ul className="mt-space-3 flex flex-wrap gap-space-2">
        {CATEGORIES.map((category) => {
          const active = selected.includes(category);

          return (
            <li key={category}>
              <button
                type="button"
                onClick={() => toggle(category)}
                aria-pressed={active}
                className={`inline-flex min-h-[36px] items-center rounded-full border px-space-3 text-label font-semibold transition ${
                  active
                    ? "border-blue-500/40 bg-blue-500/15 text-blue-300"
                    : "border-[#22252a] bg-[#0e0f12] text-zinc-400 hover:border-[#31363e] hover:text-zinc-200"
                }`}
              >
                {active ? "✓ " : ""}
                {labels.categories[category] ?? category}
              </button>
            </li>
          );
        })}
      </ul>

      {selected.length > 0 ? (
        <p className="mt-space-2 text-[11px] text-zinc-500">
          {selected.join(" · ")}
        </p>
      ) : (
        <p className="mt-space-2 text-[11px] text-zinc-600">{labels.empty}</p>
      )}
    </section>
  );
}

/** Tercih listesine göre haber süzme (istemci tarafı, istek yok). */
export function matchesInterests(category: string, interests: string[]): boolean {
  if (!interests || interests.length === 0) return true;
  return interests.includes(category);
}
