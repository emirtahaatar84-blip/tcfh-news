"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  /** Yapışkanlık için gereken en az görünüm yüksekliği (px). */
  minViewportHeight?: number;
  className?: string;
  children: React.ReactNode;
};

/**
 * Kolon sticky sarmalayıcısı.
 *
 * Kural: kaydırma kilidi yok, orta kolon tek kaydırılan bölge. Bu yüzden
 * yalnızca içerik görünüm yüksekliğine SIĞDIĞINDA sticky olur. Uzun rail
 * normal sayfa akışıyla kayar; ikinci bir kaydırma alanı açılmaz.
 */
export function RailSticky({
  minViewportHeight = 720,
  className = "",
  children,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [sticky, setSticky] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const measure = () => {
      const available =
        window.innerHeight -
        Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--size-header",
          ) || "56",
        ) -
        64;

      setSticky(
        window.innerWidth >= 1180 &&
          window.innerHeight >= minViewportHeight &&
          node.scrollHeight <= available,
      );
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [minViewportHeight]);

  return (
    <div
      ref={ref}
      className={`${className} ${sticky ? "layout-rail-sticky" : ""}`}
    >
      {children}
    </div>
  );
}
