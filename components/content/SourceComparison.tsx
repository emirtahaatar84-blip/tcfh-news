"use client";

import { useState } from "react";

/**
 * FAZ 2.1 (frontend) — "Kaynakları karşılaştır".
 *
 * İsteğe bağlı (isteğe bağlı yüklenir): kullanıcı açtığında API'den çekilir,
 * böylece haber sayfası yüklenirken ek istek yapılmaz (performans).
 *
 * Mobilde alt alta, masaüstünde yan yana kartlar.
 * Kaynak metni BİREBİR gösterilmez: başlık (atıf) + türetilmiş kısa özet.
 */

type ComparedSource = {
  name: string;
  url: string | null;
  headline: string;
  brief: string;
  overlap: number;
};

type Props = {
  newsId: string;
  labels: {
    toggle: string;
    title: string;
    loading: string;
    empty: string;
    error: string;
    original: string;
    source: string;
  };
};

export function SourceComparison({ newsId, labels }: Props) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [sources, setSources] = useState<ComparedSource[]>([]);

  async function load() {
    setState("loading");
    try {
      const response = await fetch(`/api/news/${newsId}/sources`);
      if (!response.ok) throw new Error("failed");
      const data = (await response.json()) as { sources?: ComparedSource[] };
      setSources(data.sources ?? []);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          if (state === "idle") void load();
        }}
        className="inline-flex min-h-[var(--size-touch)] items-center gap-space-2 rounded-full border border-[#22252a] bg-[#16181c] px-space-4 text-meta font-semibold text-zinc-300 transition hover:border-[#31363e] hover:text-zinc-100"
      >
        <span aria-hidden="true">⇄</span>
        {labels.toggle}
      </button>
    );
  }

  return (
    <section aria-labelledby={`compare-${newsId}`} className="mt-space-4">
      <h2 id={`compare-${newsId}`} className="section-title mb-space-2">
        {labels.title}
      </h2>

      {state === "loading" ? (
        <p className="text-xs text-zinc-500">{labels.loading}</p>
      ) : state === "error" ? (
        <p className="text-xs text-rose-400">{labels.error}</p>
      ) : sources.length === 0 ? (
        <p className="text-xs text-zinc-500">{labels.empty}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-space-2 sm:grid-cols-2 lg:grid-cols-3">
          {sources.map((source, index) => (
            <li
              key={`${source.name}-${index}`}
              className="rounded-2xl border border-[#22252a] bg-[#16181c] p-space-3"
            >
              <p className="flex items-center gap-space-2 text-[11px] font-semibold text-zinc-400">
                <span
                  aria-hidden="true"
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-[#22252a] text-[10px] font-bold text-zinc-400"
                >
                  {index + 1}
                </span>
                {source.name}
              </p>

              <p className="mt-space-2 text-[13px] leading-relaxed text-zinc-300">
                {source.brief}
              </p>

              {source.url ? (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="mt-space-2 inline-flex min-h-[36px] items-center text-label font-semibold text-blue-400 underline-offset-2 hover:underline"
                >
                  {labels.original} ↗
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
