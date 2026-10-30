"use client";

import { useEffect, useState } from "react";
import { ArrowUpIcon } from "@/components/icons";

type Props = {
  label: string;
};

/**
 * "Yukarı çık" düğmesi. Üç ekran yüksekliğinden sonra görünür.
 * Hareket azaltma tercihinde animasyonsuz, doğrudan yukarı kaydırır.
 */
export function ScrollToTop({ label }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      setVisible(window.scrollY > window.innerHeight * 3);
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => {
        const reduce = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      }}
      aria-label={label}
      title={label}
      className="fixed bottom-[var(--bottom-clearance)] right-space-3 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-[#22252a] bg-[#16181c] text-zinc-300 shadow-lg shadow-black/40 transition hover:border-[#31363e] hover:text-zinc-50 focus-visible:ring-2 focus-visible:ring-blue-500/60 lg:bottom-space-5 lg:right-space-5"
    >
      <ArrowUpIcon className="h-5 w-5" />
    </button>
  );
}
