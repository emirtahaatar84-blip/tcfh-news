"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { LoaderIcon } from "@/components/icons";
import { TimeAgo } from "@/components/TimeAgo";
import type { Locale } from "@/lib/i18n-config";
import type { FeedNewsItem } from "@/lib/news-types";

type Props = {
  lang: Locale;
  initialItems: FeedNewsItem[];
  initialHasMore: boolean;
  labels: { loadMore: string; loading: string; end: string; error: string; retry: string };
};

/**
 * "Son haberler" listesi + "Daha fazla yükle".
 * Sonsuz kaydırma YOKTUR: yalnızca kullanıcı düğmeye basınca yükler.
 */
export function LoadMoreNews({ lang, initialItems, initialHasMore, labels }: Props) {
  const [items, setItems] = useState(initialItems);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const loadingRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;

    loadingRef.current = true;
    setLoading(true);
    setError(false);

    try {
      const response = await fetch(
        `/api/news?page=${page + 1}&limit=8`,
        { cache: "no-store" },
      );

      if (!response.ok) throw new Error("failed");

      const data = (await response.json()) as {
        items: FeedNewsItem[];
        hasMore: boolean;
      };

      setItems((previous) => {
        const seen = new Set(previous.map((item) => item.id));
        return [...previous, ...data.items.filter((item) => !seen.has(item.id))];
      });
      setPage((value) => value + 1);
      setHasMore(data.hasMore);
    } catch {
      setError(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [hasMore, page]);

  if (items.length === 0) return null;

  return (
    <div>
      <ul className="divide-y divide-[#22252a]/70">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/${lang}/haber/${item.slug}`}
              className="group flex items-start gap-space-3 py-space-3 transition"
            >
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 block text-[13px] font-semibold leading-snug text-zinc-200 group-hover:text-zinc-50">
                  {item.title}
                </span>
                <span className="mt-space-1 flex flex-wrap items-center gap-x-space-2 text-[10px] text-zinc-500">
                  <span>{item.category}</span>
                  <span aria-hidden="true">·</span>
                  <span>{item.readingMinutes} dk</span>
                  <span aria-hidden="true">·</span>
                  <TimeAgo date={item.createdAt} locale={lang} />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-space-3 flex justify-center">
        {error ? (
          <button type="button" onClick={loadMore} className="btn-secondary">
            {labels.retry}
          </button>
        ) : hasMore ? (
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="btn-secondary min-w-[180px]"
          >
            {loading ? (
              <>
                <LoaderIcon className="h-4 w-4 animate-spin" />
                {labels.loading}
              </>
            ) : (
              labels.loadMore
            )}
          </button>
        ) : (
          <p className="text-[11px] text-zinc-600">{labels.end}</p>
        )}
      </div>
    </div>
  );
}
