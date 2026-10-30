"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRightIcon, LoaderIcon, MapPinIcon } from "@/components/icons";
import { TimeAgo } from "@/components/TimeAgo";
import { TURKISH_CITIES } from "@/lib/geo";
import type { Locale } from "@/lib/i18n-config";
import {
  STORAGE_EVENT,
  getPreferences,
  setPreferences,
} from "@/lib/local-store";
import type { FeedNewsItem, FeedPage } from "@/lib/news-types";

type Labels = {
  title: string;
  prompt: string;
  choose: string;
  change: string;
  clear: string;
  deviceOnly: string;
  empty: string;
  loading: string;
};

type Props = {
  lang: Locale;
  labels: Labels;
};

/**
 * "İlinizden haberler" — KVKK uyumlu bölge modülü.
 *
 * Konum IP'den TAHMİN EDİLMEZ. Kullanıcı isterse listeden il seçer; seçim
 * yalnızca cihazda (localStorage) saklanır ve haberler o ile göre sunucudan
 * çekilir. Hiçbir IP adresi okunmaz veya saklanmaz.
 */
export function LocalRegionNews({ lang, labels }: Props) {
  const [city, setCity] = useState<string | null>(null);
  const [items, setItems] = useState<FeedNewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (target: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);

    try {
      const response = await fetch(
        `/api/news?city=${encodeURIComponent(target)}&limit=4`,
        { cache: "no-store", signal: controller.signal },
      );

      if (!response.ok) throw new Error("failed");

      const data = (await response.json()) as FeedPage;
      if (!controller.signal.aborted) setItems(data.items);
    } catch {
      if (!controller.signal.aborted) setItems([]);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    const sync = () => {
      const next = getPreferences().city;
      setCity(next);
    };

    sync();

    window.addEventListener(STORAGE_EVENT, sync);
    return () => window.removeEventListener(STORAGE_EVENT, sync);
  }, []);

  useEffect(() => {
    if (city) void load(city);
  }, [city, load]);

  if (!city) {
    return (
      <section className="mx-space-3 mt-space-3 rounded-2xl border border-[#22252a] bg-[#16181c] px-space-4 py-space-3 sm:mx-space-5">
        <div className="flex items-center gap-space-2">
          <MapPinIcon className="h-4 w-4 shrink-0 text-zinc-500" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-zinc-200">
              {labels.title}
            </p>
            <p className="text-[10px] leading-snug text-zinc-500">
              {labels.prompt}
            </p>
          </div>

          {picking ? (
            <select
              autoFocus
              aria-label={labels.choose}
              defaultValue=""
              onChange={(event) => {
                const value = event.target.value;
                if (!value) return;
                setPreferences({ city: value });
                setCity(value);
                setPicking(false);
              }}
              className="max-w-[150px] rounded-lg border border-[#22252a] bg-[#0e0f12] px-space-2 py-space-2 text-xs text-zinc-200"
            >
              <option value="">{labels.choose}</option>
              {TURKISH_CITIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="shrink-0 rounded-full border border-[#22252a] px-space-3 py-space-2 text-[11px] font-semibold text-zinc-300 transition hover:bg-white/5"
            >
              {labels.choose}
            </button>
          )}
        </div>
        <p className="mt-space-2 text-[10px] text-zinc-500">{labels.deviceOnly}</p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="region-title"
      className="mx-space-3 mt-space-3 overflow-hidden rounded-2xl border border-[#22252a] bg-[#16181c] sm:mx-space-5"
    >
      <div className="flex items-center justify-between gap-space-2 border-b border-[#22252a] px-space-4 py-space-3">
        <h2
          id="region-title"
          className="flex items-center gap-space-2 text-xs font-bold text-zinc-200"
        >
          <MapPinIcon className="h-3.5 w-3.5 text-rose-400" />
          {labels.title} · {city}
        </h2>

        <div className="flex items-center gap-space-2">
          <select
            aria-label={labels.change}
            value={city}
            onChange={(event) => {
              const value = event.target.value;
              setPreferences({ city: value || null });
              setCity(value || null);
              if (!value) setItems([]);
            }}
            className="max-w-[120px] rounded-lg border border-[#22252a] bg-[#0e0f12] px-space-2 py-space-1 text-[10px] text-zinc-300"
          >
            <option value="">{labels.clear}</option>
            {TURKISH_CITIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="flex items-center gap-space-2 px-space-4 py-space-4 text-[11px] text-zinc-500">
          <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
          {labels.loading}
        </p>
      ) : items.length === 0 ? (
        <p className="px-space-4 py-space-4 text-[11px] text-zinc-500">{labels.empty}</p>
      ) : (
        <ul className="divide-y divide-[#22252a]/70">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/${lang}/haber/${item.slug}`}
                className="flex items-center gap-space-2 px-space-4 py-space-3 transition hover:bg-white/5"
              >
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 block text-xs font-semibold leading-snug text-zinc-200">
                    {item.title}
                  </span>
                  <span className="mt-space-1 block text-[10px] text-zinc-500">
                    <TimeAgo date={item.createdAt} locale={lang} />
                  </span>
                </span>
                <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
