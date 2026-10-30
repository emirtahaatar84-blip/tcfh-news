"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangleIcon, LoaderIcon, TrashIcon } from "@/components/icons";

type Props = {
  newsId: string;
  labels: {
    remove: string;
    reasonTitle: string;
    copyright: string;
    hallucination: string;
    removed: string;
    error: string;
  };
  /** Sunucuda doğrulanmış sahip/moderatör oturumu var mı? */
  canModerate: boolean;
  variant?: "card" | "page";
};

/**
 * Owner-only silent moderation button. Renders nothing for regular users
 * and visitors. Opens a small reason picker (copyright / false news) and
 * deletes the story without any public trace.
 */
export function RemoveNewsButton({
  newsId,
  labels,
  canModerate,
  variant = "card",
}: Props) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!canModerate) return;

    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [canModerate]);

  // Sahip oturumu yoksa hiç render etme.
  if (!canModerate) {
    return null;
  }

  if (done) {
    return (
      <span className="inline-flex items-center gap-space-2 text-xs font-semibold text-emerald-400">
        <AlertTriangleIcon className="h-3.5 w-3.5" />
        {labels.removed}
      </span>
    );
  }

  async function remove(reason: string) {
    setBusy(true);
    setError(false);

    try {
      const response = await fetch(`/api/news/${newsId}/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });

      if (!response.ok) throw new Error("failed");

      setDone(true);
      setOpen(false);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const isCard = variant === "card";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        disabled={busy}
        aria-label={labels.remove}
        title={labels.remove}
        className={
          isCard
            ? "rounded-full p-space-2 text-rose-400/70 transition hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-50"
            : "inline-flex items-center gap-space-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-space-4 py-space-2 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50"
        }
      >
        {busy ? (
          <LoaderIcon className={isCard ? "h-4 w-4 animate-spin" : "h-4 w-4 animate-spin"} />
        ) : (
          <TrashIcon className={isCard ? "h-4 w-4" : "h-4 w-4"} />
        )}
        {!isCard ? <span>{labels.remove}</span> : null}
      </button>

      {open ? (
        <div
          onClick={(event) => event.stopPropagation()}
          className="absolute bottom-full right-0 z-50 mb-space-2 w-56 overflow-hidden rounded-xl border border-[#22252a] bg-[#16181c] shadow-xl"
        >
          <p className="border-b border-[#22252a] px-space-4 py-space-3 text-xs font-bold text-zinc-100">
            {labels.reasonTitle}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove("copyright")}
            className="flex w-full items-center gap-space-2 px-space-4 py-space-3 text-left text-xs font-medium text-zinc-300 transition hover:bg-white/5"
          >
            <TrashIcon className="h-3.5 w-3.5 shrink-0 text-rose-400" />
            {labels.copyright}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove("hallucination")}
            className="flex w-full items-center gap-space-2 px-space-4 py-space-3 text-left text-xs font-medium text-zinc-300 transition hover:bg-white/5"
          >
            <AlertTriangleIcon className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            {labels.hallucination}
          </button>
          {error ? (
            <p className="border-t border-[#22252a] px-space-4 py-space-2 text-xs text-rose-400">
              {labels.error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
