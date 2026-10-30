"use client";

import { useCallback, useEffect, useState } from "react";
import { BookmarkFilledIcon, BookmarkIcon } from "@/components/icons";
import {
  STORAGE_EVENT,
  enrichBookmark,
  isBookmarked,
  isStorageAvailable,
  toggleBookmark,
  type Bookmark,
} from "@/lib/local-store";

type Props = {
  bookmark: Omit<Bookmark, "savedAt">;
  labels: {
    save: string;
    saved: string;
  };
  /** "icon": kartlar için kompakt; "button": detay sayfası için metinli. */
  variant?: "icon" | "button";
  className?: string;
};

/**
 * "Kaydet" toggle'ı. aria-pressed ile durumu bildirir; tüm veri yalnızca
 * cihazda (localStorage) tutulur, sunucuya hiçbir şey gönderilmez.
 */
export function SaveButton({ bookmark, labels, variant = "icon", className }: Props) {
  const [saved, setSaved] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    setSaved(isBookmarked(bookmark.id));

    // Yalnızca oku — yazma işlemi STORAGE_EVENT döngüsü yaratır.
    const sync = () => setSaved(isBookmarked(bookmark.id));

    // Başlıksız eski kayıtları bir kez zenginleştir.
    setTimeout(() => {
      enrichBookmark(bookmark.id, {
        title: bookmark.title,
        url: bookmark.url,
        category: bookmark.category,
      });
    }, 0);

    window.addEventListener(STORAGE_EVENT, sync);
    return () => window.removeEventListener(STORAGE_EVENT, sync);
  }, [bookmark.category, bookmark.id, bookmark.title, bookmark.url]);

  const onToggle = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      event.preventDefault();

      if (!isStorageAvailable()) {
        setUnavailable(true);
        window.setTimeout(() => setUnavailable(false), 3200);
        return;
      }

      const result = toggleBookmark({
        ...bookmark,
        savedAt: new Date().toISOString(),
      });

      setSaved(result.saved);
    },
    [bookmark],
  );

  const label = saved ? labels.saved : labels.save;

  if (variant === "button") {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={saved}
        aria-label={label}
        title={label}
        className={`btn-secondary ${saved ? "border-blue-500/40 text-blue-400" : ""} ${className ?? ""}`}
      >
        {saved ? (
          <BookmarkFilledIcon className="h-4 w-4" />
        ) : (
          <BookmarkIcon className="h-4 w-4" />
        )}
        <span>{label}</span>
      </button>
    );
  }

  return (
    <span className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={saved}
        aria-label={label}
        title={label}
        className={`touch-target flex items-center justify-center rounded-full p-space-2 transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
          saved ? "text-blue-500" : "text-zinc-500 hover:text-zinc-100"
        } ${className ?? ""}`}
      >
        {saved ? (
          <BookmarkFilledIcon className="h-4 w-4" />
        ) : (
          <BookmarkIcon className="h-4 w-4" />
        )}
      </button>

      {unavailable ? (
        <span
          role="status"
          className="absolute bottom-full right-0 mb-space-2 w-56 rounded-xl border border-[#22252a] bg-[#16181c] p-space-3 text-[11px] leading-snug text-zinc-300 shadow-xl"
        >
          Tarayıcınız cihaz içi depolamaya izin vermediği için kaydedilemedi.
        </span>
      ) : null}
    </span>
  );
}
