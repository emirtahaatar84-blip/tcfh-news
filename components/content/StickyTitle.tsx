"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  title: string;
  /** Geri dönüş bağlantısı etiketi. */
  backLabel: string;
  backHref: string;
};

/**
 * Yapışkan mini başlık + ince okuma ilerleme çubuğu.
 * Başlık görünümden çıktığında üstte belirir; ilerleme yüzdesi scroll'a bağlı.
 */
export function StickyTitle({ title, backLabel, backHref }: Props) {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;

    const onScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(
        scrollable > 0 ? Math.min(100, Math.max(0, (window.scrollY / scrollable) * 100)) : 0,
      );
    };

    const observer =
      sentinel && typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            ([entry]) => setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0),
            { threshold: 0 },
          )
        : null;

    if (sentinel && observer) observer.observe(sentinel);

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      observer?.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <>
      <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />

      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px] bg-transparent"
      >
        <div
          className="h-full bg-gradient-to-r from-blue-600 to-blue-400"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div
        className={`fixed inset-x-0 top-0 z-40 border-b border-[#22252a] bg-[#0e0f12]/95 backdrop-blur-xl transition-transform duration-200 ${
          visible ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        <div className="mx-auto flex h-12 max-w-3xl items-center gap-space-2 px-space-3 sm:px-space-5">
          <a
            href={backHref}
            className="shrink-0 text-[11px] font-semibold text-zinc-400 transition hover:text-zinc-100"
          >
            ← {backLabel}
          </a>
          <p className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-200">
            {title}
          </p>
          <span className="shrink-0 text-[10px] tabular-nums text-zinc-500">
            %{Math.round(progress)}
          </span>
        </div>
      </div>
    </>
  );
}
