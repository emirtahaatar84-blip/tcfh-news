"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { CheckIcon } from "@/components/icons";
import { formatDate, formatDateTime } from "@/lib/datetime";
import type {
  CitationAnchor,
  CitationLabels,
} from "@/lib/citation-types";

/**
 * Gövde içi atıf bağlantısı + isteksiz önizleme kartı.
 *
 * - Önizleme verisi sayfaya gömülüdür: hover/focus anında ağ isteği YOK.
 * - Fare: 150 ms gecikmeyle açılır, 100 ms içinde kapanır.
 * - Dokunmatik: ilk dokunuş önizlemeyi açar, ikinci dokunuş habere gider.
 * - Klavye: odaklanınca açılır, Escape kapatır, kart içindeki bağlantıya
 *   Tab ile geçilir (kart DOM'da atıfın hemen arkasındadır).
 * - Aynı anda tek önizleme açılır (global olay ile diğerleri kapanır).
 */

const OPEN_DELAY_MS = 150;
const CLOSE_DELAY_MS = 100;
const GAP_PX = 8;
const EDGE_MARGIN = 12;
const MAX_WIDTH = 320;
const OPEN_EVENT = "eth:citation-open";

type Position = {
  top: number;
  left: number;
  width: number;
  placement: "above" | "below";
};

type Props = {
  anchor: CitationAnchor;
  labels: CitationLabels;
  lang: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function CitationLink({ anchor, labels, lang }: Props) {
  const id = useId();
  const popoverId = `citation-${anchor.targetId}-${id.replace(/:/g, "")}`;
  const titleId = `${popoverId}-title`;

  const linkRef = useRef<HTMLAnchorElement | null>(null);
  const popoverRef = useRef<HTMLSpanElement | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerTypeRef = useRef<string>("mouse");
  const suppressFocusRef = useRef(false);

  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const openRef = useRef(false);

  const preview = anchor.preview;

  const clearTimers = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const computePosition = useCallback((): Position | null => {
    const link = linkRef.current;
    if (!link || typeof window === "undefined") return null;

    const rect = link.getBoundingClientRect();
    const width = Math.min(MAX_WIDTH, window.innerWidth - EDGE_MARGIN * 2);
    const height = popoverRef.current?.offsetHeight ?? 240;

    const left = clamp(
      rect.left + rect.width / 2 - width / 2,
      EDGE_MARGIN,
      window.innerWidth - width - EDGE_MARGIN,
    );

    const spaceAbove = rect.top - EDGE_MARGIN - GAP_PX;
    const spaceBelow =
      window.innerHeight - rect.bottom - EDGE_MARGIN - GAP_PX;
    const placement: "above" | "below" =
      spaceAbove >= height || spaceAbove >= spaceBelow ? "above" : "below";

    let top =
      placement === "above" ? rect.top - GAP_PX - height : rect.bottom + GAP_PX;

    if (top < EDGE_MARGIN) top = rect.bottom + GAP_PX;
    if (top + height > window.innerHeight - EDGE_MARGIN) {
      top = window.innerHeight - EDGE_MARGIN - height;
    }

    return {
      top: Math.max(EDGE_MARGIN, top),
      left,
      width,
      placement,
    };
  }, []);

  const openNow = useCallback(() => {
    clearTimers();
    if (!openRef.current) {
      openRef.current = true;
      window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: popoverId }));
    }
    setOpen(true);
  }, [clearTimers, popoverId]);

  const scheduleOpen = useCallback(() => {
    clearTimers();
    openTimerRef.current = setTimeout(openNow, OPEN_DELAY_MS);
  }, [clearTimers, openNow]);

  const closeNow = useCallback(() => {
    clearTimers();
    openRef.current = false;
    setOpen(false);
    setPosition(null);
  }, [clearTimers]);

  const scheduleClose = useCallback(() => {
    clearTimers();
    closeTimerRef.current = setTimeout(closeNow, CLOSE_DELAY_MS);
  }, [clearTimers, closeNow]);

  // Konum: kart DOM'a girdikten sonra gerçek yüksekliğiyle hesaplanır.
  useLayoutEffect(() => {
    if (!open) return;

    const update = () => setPosition(computePosition());

    update();

    const frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [open, computePosition]);

  // Kaydırma/yeniden boyutlandırmada konumu güncelle.
  useEffect(() => {
    if (!open) return;

    const update = () => setPosition(computePosition());
    window.addEventListener("scroll", update, { passive: true, capture: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, { capture: true });
      window.removeEventListener("resize", update);
    };
  }, [open, computePosition]);

  // Aynı anda tek önizleme + dışarı tıklama + Escape.
  useEffect(() => {
    if (!open) return;

    const onOtherOpen = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail && detail !== popoverId) closeNow();
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (linkRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      closeNow();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      closeNow();
      suppressFocusRef.current = true;
      linkRef.current?.focus();
      suppressFocusRef.current = false;
    };

    window.addEventListener(OPEN_EVENT, onOtherOpen);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      window.removeEventListener(OPEN_EVENT, onOtherOpen);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, closeNow, popoverId]);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  const handleFocus = () => {
    if (suppressFocusRef.current) return;
    // Yalnızca klavye/AT odağında aç: dokunmatikte odak, tıklamadan önce
    // gelir ve iki dokunuş kuralını bozar.
    if (!linkRef.current?.matches(":focus-visible")) return;
    openNow();
  };

  const handleBlur = (event: React.FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget as Node | null;
    if (!next) {
      scheduleClose();
      return;
    }
    if (linkRef.current?.contains(next)) return;
    if (popoverRef.current?.contains(next)) return;
    scheduleClose();
  };

  return (
    <span className="citation-wrap">
      <a
        ref={linkRef}
        href={anchor.href}
        className="citation"
        data-cite={anchor.targetId}
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label={`${labels.related}: ${preview.title}`}
        onPointerDown={(event) => {
          pointerTypeRef.current = event.pointerType;
        }}
        onPointerEnter={(event) => {
          if (event.pointerType !== "mouse") return;
          scheduleOpen();
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== "mouse") return;
          scheduleClose();
        }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onClick={(event) => {
          // Dokunmatik: ilk dokunuş yalnızca önizlemeyi açar.
          if (pointerTypeRef.current !== "mouse" && !open) {
            event.preventDefault();
            openNow();
          }
        }}
      >
        <span className="citation__label">{anchor.phrase}</span>
      </a>

      {open ? (
        <span
          ref={popoverRef}
          id={popoverId}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          data-placement={position?.placement ?? "above"}
          suppressHydrationWarning
          className="citation-popover"
          style={{
            top: position ? `${position.top}px` : "0px",
            left: position ? `${position.left}px` : "0px",
            width: position ? `${position.width}px` : undefined,
            visibility: position ? "visible" : "hidden",
          }}
          onBlur={handleBlur}
          onPointerEnter={(event) => {
            if (event.pointerType !== "mouse") return;
            clearTimers();
          }}
          onPointerLeave={(event) => {
            if (event.pointerType !== "mouse") return;
            scheduleClose();
          }}
        >
          <span className="flex flex-wrap items-center gap-space-2">
            <span className="chip border-violet-500/30 bg-violet-500/10 px-space-2 py-space-1 text-[10px] text-violet-300">
              {preview.category}
            </span>
            <span className="rounded-full border border-[#22252a] px-space-2 py-space-1 text-[10px] font-semibold text-zinc-400">
              {labels.related}
            </span>
          </span>

          <span
            id={titleId}
            className="mt-space-2 line-clamp-2 block text-[13px] font-bold leading-snug text-zinc-100"
          >
            {preview.title}
          </span>

          {preview.firstSentence ? (
            <span className="mt-space-2 line-clamp-4 block text-[12px] leading-relaxed text-zinc-400">
              {preview.firstSentence}
            </span>
          ) : null}

          <span className="mt-space-2 flex flex-wrap items-center gap-x-space-2 gap-y-space-1 text-[10px] text-zinc-500">
            {preview.sourceCount > 0 ? (
              <span className="inline-flex items-center gap-space-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-space-2 py-space-1 font-semibold text-emerald-400">
                <CheckIcon className="h-2.5 w-2.5" />
                {labels.verified.replace("{count}", String(preview.sourceCount))}
              </span>
            ) : null}
            <span>
              {labels.readingTime.replace(
                "{minutes}",
                String(preview.readingTime),
              )}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {labels.listeningTime.replace(
                "{minutes}",
                String(preview.listenTime),
              )}
            </span>
          </span>

          <span className="mt-space-1 block text-[10px] text-zinc-600">
            {preview.publishedAt ? (
              <>
                {labels.published}: {formatDateTime(preview.publishedAt, lang)}
              </>
            ) : null}
            {preview.updatedAt && preview.updatedAt !== preview.publishedAt ? (
              <>
                {" · "}
                {labels.updated}: {formatDate(preview.updatedAt, lang)}
              </>
            ) : null}
          </span>

          <span className="mt-space-3 flex items-center justify-between gap-space-2 border-t border-[#22252a] pt-space-2">
            <Link
              href={preview.href}
              prefetch={false}
              className="inline-flex min-h-[44px] items-center rounded-lg px-space-1 text-[12px] font-bold text-blue-400 transition hover:text-blue-300"
            >
              {labels.goTo}
              <span aria-hidden="true" className="ml-space-1">
                →
              </span>
            </Link>
            <button
              type="button"
              onClick={closeNow}
              aria-label={labels.close}
              className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/10 hover:text-zinc-200"
            >
              <span aria-hidden="true" className="text-base leading-none">
                ×
              </span>
            </button>
          </span>
        </span>
      ) : null}
    </span>
  );
}
