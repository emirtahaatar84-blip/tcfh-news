"use client";

import { useEffect, useState } from "react";
import { LoaderIcon, SparklesIcon } from "@/components/icons";
import { formatDate } from "@/lib/datetime";

type Labels = {
  title: string;
  subtitle: string;
  loading: string;
  unavailable: string;
  aiWarning: string;
  anonymous: string;
};

type Props = {
  labels: Labels;
};

/**
 * "Günün brifingi": son 24 saatteki haberlerden 5 maddelik sabah özeti.
 * Yalnızca toplu (anonim) veriden üretilir; kişiselleştirme yoktur.
 * AI yapılandırılmamışsa kart hiç gösterilmez.
 */
export function DailyBriefing({ labels }: Props) {
  const [state, setState] = useState<"loading" | "ready" | "hidden">("loading");
  const [items, setItems] = useState<string[]>([]);
  const [closing, setClosing] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/ai/briefing", {
          cache: "no-store",
        });

        if (!response.ok) {
          if (!cancelled) setState("hidden");
          return;
        }

        const data = (await response.json()) as {
          success?: boolean;
          items?: unknown;
          closing?: unknown;
        };

        if (!data.success || !Array.isArray(data.items) || data.items.length === 0) {
          if (!cancelled) setState("hidden");
          return;
        }

        if (cancelled) return;

        setItems(
          data.items.filter((item): item is string => typeof item === "string"),
        );
        setClosing(typeof data.closing === "string" ? data.closing : "");
        setState("ready");
      } catch {
        if (!cancelled) setState("hidden");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "hidden") return null;

  return (
    <section
      aria-labelledby="daily-briefing-title"
      className="mx-space-3 mt-space-3 overflow-hidden rounded-2xl border border-[#22252a] bg-gradient-to-br from-[#16181c] to-[#0e0f12] sm:mx-space-5"
    >
      <div className="flex items-center gap-space-2 border-b border-[#22252a] px-space-4 py-space-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/15 text-blue-400">
          <SparklesIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id="daily-briefing-title"
            className="text-sm font-bold text-zinc-100"
          >
            {labels.title}
          </h2>
          <p className="truncate text-[11px] text-zinc-500">
            {labels.subtitle} · {formatDate(new Date())}
          </p>
        </div>
      </div>

      <div className="px-space-4 py-space-3">
        {state === "loading" ? (
          <p className="flex items-center gap-space-2 py-space-2 text-xs text-zinc-500">
            <LoaderIcon className="h-4 w-4 animate-spin" />
            {labels.loading}
          </p>
        ) : (
          <ol className="space-y-space-2">
            {items.map((item, index) => (
              <li
                key={index}
                className="flex gap-space-3 text-[13px] leading-relaxed text-zinc-300"
              >
                <span
                  aria-hidden="true"
                  className="mt-space-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-[9px] font-bold text-blue-400"
                >
                  {index + 1}
                </span>
                {item}
              </li>
            ))}
          </ol>
        )}

        {closing ? (
          <p className="mt-space-3 border-t border-[#22252a] pt-space-3 text-xs italic text-zinc-400">
            {closing}
          </p>
        ) : null}
      </div>

      <p className="border-t border-[#22252a] px-space-4 py-space-2 text-[10px] leading-relaxed text-zinc-500">
        {labels.aiWarning} · {labels.anonymous}
      </p>
    </section>
  );
}
