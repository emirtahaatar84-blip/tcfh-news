"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DebateCard } from "@/components/debate/DebateCard";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import type { DebateListItem } from "@/lib/debate/types";
import type { Locale } from "@/lib/i18n-config";

type Props = {
  debates: DebateListItem[];
  locale: Locale;
  labels: {
    reading: string;
    listening: string;
    verified: string;
    cta: string;
    previous: string;
    next: string;
    region: string;
  };
};

const CARD_WIDTH = 320;
const GAP = 12;

/**
 * Yatay kaydırılabilir münazara kartları (11.8).
 * - Dokunmatik: yerel scroll + snap (tarayıcı yönetir)
 * - Fare: pointer events ile sürükleme
 * - Klavye: sol/sağ ok tuşları + erişilebilir önceki/sonraki düğmeleri
 * Sürükleme sırasında yanlış tıklama engellenir (8 px eşiği).
 */
export function DebateCarousel({ debates, locale, labels }: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startScroll: number;
    moved: boolean;
    pointerId: number | null;
  }>({ active: false, startX: 0, startScroll: 0, moved: false, pointerId: null });

  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  const updateEdges = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    setCanPrev(track.scrollLeft > 4);
    setCanNext(track.scrollLeft + track.clientWidth < track.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    updateEdges();
    track.addEventListener("scroll", updateEdges, { passive: true });
    window.addEventListener("resize", updateEdges);

    return () => {
      track.removeEventListener("scroll", updateEdges);
      window.removeEventListener("resize", updateEdges);
    };
  }, [updateEdges]);

  const scrollByCards = useCallback((direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollBy({
      left: direction * (CARD_WIDTH + GAP),
      behavior: reduce ? "auto" : "smooth",
    });
  }, []);

  return (
    <section
      aria-roledescription="carousel"
      aria-label={labels.region}
      className="relative"
    >
      <div className="mb-space-2 flex items-center justify-between gap-space-2">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">
          {labels.region}
        </h2>
        <div className="flex items-center gap-space-1">
          <button
            type="button"
            onClick={() => scrollByCards(-1)}
            disabled={!canPrev}
            aria-label={labels.previous}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-[#22252a] bg-[#16181c] text-zinc-400 transition hover:text-zinc-100 disabled:opacity-40"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollByCards(1)}
            disabled={!canNext}
            aria-label={labels.next}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-[#22252a] bg-[#16181c] text-zinc-400 transition hover:text-zinc-100 disabled:opacity-40"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={trackRef}
        tabIndex={0}
        role="group"
        aria-label={labels.region}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            event.preventDefault();
            scrollByCards(1);
          }
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            scrollByCards(-1);
          }
        }}
        onPointerDown={(event) => {
          if (event.pointerType === "touch") return;
          const track = trackRef.current;
          if (!track) return;
          dragRef.current = {
            active: true,
            startX: event.clientX,
            startScroll: track.scrollLeft,
            moved: false,
            pointerId: event.pointerId,
          };
          track.setPointerCapture(event.pointerId);
          track.style.cursor = "grabbing";
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          const track = trackRef.current;
          if (!drag.active || !track || event.pointerType === "touch") return;

          const delta = event.clientX - drag.startX;
          if (Math.abs(delta) > 8) drag.moved = true;
          track.scrollLeft = drag.startScroll - delta;
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current;
          const track = trackRef.current;
          if (!drag.active || !track) return;
          drag.active = false;
          track.style.cursor = "";
          if (drag.pointerId !== null) {
            try {
              track.releasePointerCapture(drag.pointerId);
            } catch {
              // zaten bırakılmış olabilir
            }
          }
          void event;
        }}
        onPointerCancel={() => {
          dragRef.current.active = false;
          const track = trackRef.current;
          if (track) track.style.cursor = "";
        }}
        onClickCapture={(event) => {
          if (dragRef.current.moved) {
            event.preventDefault();
            event.stopPropagation();
            dragRef.current.moved = false;
          }
        }}
        className="scrollbar-hide -mx-space-1 flex snap-x snap-mandatory gap-space-3 overflow-x-auto px-space-1 pb-space-2 [touch-action:pan-x]"
      >
        {debates.map((debate) => (
          <div key={debate.id} className="snap-start">
            <DebateCard
              debate={debate}
              locale={locale}
              labels={labels}
              fixedWidth
            />
          </div>
        ))}
      </div>
    </section>
  );
}
