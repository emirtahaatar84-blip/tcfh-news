"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Yatay kaydırılan şeritler için ortak davranış (WCAG 2.1.1 + 2.5.7).
 *
 * - Snap: öğeler tam hizalı durur.
 * - Klavye: ← / → / Home / End.
 * - Butonlar: önceki/sonraki; kaydırılamıyorsa gizli.
 * - Dokunmatik: `touch-action: pan-x`; dikey kaydırma engellenmez.
 * - Sürükleme sırasında kazara tıklama: hareket 6 px'i geçerse tıklama yutulur.
 */

const CLICK_SUPPRESS_PX = 6;

type Props = {
  children: ReactNode;
  /** Ekranda görünen bölümün erişilebilir adı. */
  label: string;
  className?: string;
  innerClassName?: string;
  /** Butonları gizle (ör. masaüstünde gereksiz). */
  hideButtons?: boolean;
};

export function ScrollRail({
  children,
  label,
  className = "",
  innerClassName = "",
  hideButtons = false,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  const sync = useCallback(() => {
    const element = scrollerRef.current;
    if (!element) return;
    const max = element.scrollWidth - element.clientWidth;
    setCanPrev(element.scrollLeft > 2);
    setCanNext(element.scrollLeft < max - 2);
  }, []);

  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;

    sync();
    element.addEventListener("scroll", sync, { passive: true });

    const observer = new ResizeObserver(sync);
    observer.observe(element);

    return () => {
      element.removeEventListener("scroll", sync);
      observer.disconnect();
    };
  }, [sync]);

  const scrollByPage = (direction: 1 | -1) => {
    const element = scrollerRef.current;
    if (!element) return;
    element.scrollBy({ left: direction * element.clientWidth * 0.85, behavior: "smooth" });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const element = scrollerRef.current;
    if (!element) return;

    const step = element.clientWidth * 0.85;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      element.scrollBy({ left: step, behavior: "smooth" });
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      element.scrollBy({ left: -step, behavior: "smooth" });
    } else if (event.key === "Home") {
      event.preventDefault();
      element.scrollTo({ left: 0, behavior: "smooth" });
    } else if (event.key === "End") {
      event.preventDefault();
      element.scrollTo({ left: element.scrollWidth, behavior: "smooth" });
    }
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") {
      dragStart.current = { x: event.clientX, y: event.clientY };
      suppressClick.current = false;
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    if (!start) return;
    const dx = Math.abs(event.clientX - start.x);
    const dy = Math.abs(event.clientY - start.y);
    if (dx > CLICK_SUPPRESS_PX && dx > dy) suppressClick.current = true;
    else if (dy > CLICK_SUPPRESS_PX) dragStart.current = null;
  };

  const onClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (suppressClick.current) {
      event.preventDefault();
      event.stopPropagation();
      suppressClick.current = false;
    }
    dragStart.current = null;
  };

  return (
    <div className={`relative ${className}`}>
      {!hideButtons && canPrev ? (
        <button
          type="button"
          onClick={() => scrollByPage(-1)}
          aria-label={`${label}: önceki`}
          className="absolute left-0 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[#31363e] bg-[#0e0f12]/95 text-zinc-300 shadow-lg transition hover:text-white sm:flex"
        >
          <span aria-hidden="true">‹</span>
        </button>
      ) : null}

      {!hideButtons && canNext ? (
        <button
          type="button"
          onClick={() => scrollByPage(1)}
          aria-label={`${label}: sonraki`}
          className="absolute right-0 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[#31363e] bg-[#0e0f12]/95 text-zinc-300 shadow-lg transition hover:text-white sm:flex"
        >
          <span aria-hidden="true">›</span>
        </button>
      ) : null}

      <div
        ref={scrollerRef}
        role="group"
        aria-label={label}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onClickCapture={onClickCapture}
        className={`scrollbar-hide flex snap-x snap-mandatory gap-space-2 overflow-x-auto pb-space-1 [touch-action:pan-x] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${innerClassName}`}
      >
        {children}
      </div>
    </div>
  );
}
