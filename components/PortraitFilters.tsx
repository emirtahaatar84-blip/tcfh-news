"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SearchIcon, XIcon } from "@/components/icons";
import { CATEGORIES } from "@/lib/categories";
import type { PortraitFilters } from "@/lib/portrait-query";
import type { Locale } from "@/lib/i18n-config";

type Labels = {
  search: string;
  category: string;
  type: string;
  range: string;
  sort: string;
  all: string;
  person: string;
  organization: string;
  event: string;
  week: string;
  month: string;
  newest: string;
  mostRead: string;
  clear: string;
  resultCount: string;
};

type Props = {
  lang: Locale;
  filters: PortraitFilters;
  total: number;
  labels: Labels;
};

/**
 * Portre listesi filtre çubuğu: arama, kategori, konu türü, tarih aralığı
 * ve sıralama. Değişiklikler URL'e yazılır (paylaşılabilir, geri tuşu çalışır).
 */
export function PortraitFilters({ lang, filters, total, labels }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [term, setTerm] = useState(filters.query ?? "");

  const apply = useCallback(
    (patch: Partial<PortraitFilters>) => {
      const params = new URLSearchParams(searchParams.toString());

      const setOrDelete = (key: string, value: string | null) => {
        if (value) params.set(key, value);
        else params.delete(key);
      };

      if ("query" in patch) setOrDelete("q", patch.query ?? null);
      if ("category" in patch) setOrDelete("category", patch.category ?? null);
      if ("type" in patch) setOrDelete("type", patch.type ?? null);
      if ("range" in patch) {
        setOrDelete("range", patch.range && patch.range !== "all" ? patch.range : null);
      }
      if ("sort" in patch) {
        setOrDelete("sort", patch.sort && patch.sort !== "new" ? patch.sort : null);
      }

      const query = params.toString();
      router.push(query ? `/${lang}/portreler?${query}` : `/${lang}/portreler`, {
        scroll: false,
      });
    },
    [lang, router, searchParams],
  );

  const hasFilters = Boolean(
    filters.query || filters.category || filters.type || filters.range !== "all",
  );

  return (
    <div className="space-y-space-3">
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          apply({ query: term.trim() || null });
        }}
        className="relative"
      >
        <SearchIcon className="pointer-events-none absolute left-space-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          type="search"
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            if (!event.target.value.trim()) apply({ query: null });
          }}
          placeholder={labels.search}
          aria-label={labels.search}
          className="field pl-space-7"
        />
      </form>

      <div className="scrollbar-hide flex gap-space-2 overflow-x-auto pb-space-1">
        <Chip
          active={!filters.category}
          onClick={() => apply({ category: null })}
          label={labels.all}
        />
        {CATEGORIES.map((category) => (
          <Chip
            key={category}
            active={filters.category === category}
            onClick={() => apply({ category })}
            label={category}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-space-2">
        <Chip
          active={!filters.type}
          onClick={() => apply({ type: null })}
          label={`${labels.type}: ${labels.all}`}
        />
        <Chip
          active={filters.type === "kisi"}
          onClick={() => apply({ type: "kisi" })}
          label={labels.person}
        />
        <Chip
          active={filters.type === "kurum"}
          onClick={() => apply({ type: "kurum" })}
          label={labels.organization}
        />
        <Chip
          active={filters.type === "olay"}
          onClick={() => apply({ type: "olay" })}
          label={labels.event}
        />

        <span aria-hidden="true" className="mx-space-1 h-4 w-px bg-[#22252a]" />

        <Chip
          active={filters.range === "all"}
          onClick={() => apply({ range: "all" })}
          label={`${labels.range}: ${labels.all}`}
        />
        <Chip
          active={filters.range === "week"}
          onClick={() => apply({ range: "week" })}
          label={labels.week}
        />
        <Chip
          active={filters.range === "month"}
          onClick={() => apply({ range: "month" })}
          label={labels.month}
        />

        <span aria-hidden="true" className="mx-space-1 h-4 w-px bg-[#22252a]" />

        <Chip
          active={filters.sort === "new"}
          onClick={() => apply({ sort: "new" })}
          label={labels.newest}
        />
        <Chip
          active={filters.sort === "views"}
          onClick={() => apply({ sort: "views" })}
          label={labels.mostRead}
        />

        {hasFilters ? (
          <button
            type="button"
            onClick={() => {
              setTerm("");
              router.push(`/${lang}/portreler`, { scroll: false });
            }}
            className="inline-flex min-h-touch items-center gap-space-1 rounded-full border border-[#22252a] px-space-3 text-[11px] font-semibold text-zinc-500 transition hover:text-zinc-200"
          >
            <XIcon className="h-3 w-3" />
            {labels.clear}
          </button>
        ) : null}
      </div>

      <p aria-live="polite" className="text-[11px] text-zinc-500">
        {labels.resultCount.replace("{count}", String(total))}
      </p>
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-touch shrink-0 items-center whitespace-nowrap rounded-full border px-space-3 text-[11px] font-semibold transition ${
        active
          ? "border-violet-500/50 bg-violet-500/15 text-violet-300"
          : "border-[#22252a] bg-[#16181c] text-zinc-400 hover:border-[#31363e] hover:text-zinc-100"
      }`}
    >
      {label}
    </button>
  );
}
