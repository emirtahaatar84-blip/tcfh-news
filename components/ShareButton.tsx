"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, ShareIcon } from "@/components/icons";

type Props = {
  title: string;
  url: string;
  labels: {
    share: string;
    copied: string;
    shareError: string;
  };
};

type Status = "idle" | "copied" | "error";

async function copyToClipboard(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }

    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const succeeded = document.execCommand("copy");
    document.body.removeChild(textarea);
    return succeeded;
  } catch {
    return false;
  }
}

export function ShareButton({ title, url, labels }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  function showStatus(next: Status) {
    setStatus(next);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setStatus("idle"), 2200);
  }

  /** Resolves site-relative share URLs ("/tr/news/xyz") against the origin. */
  function absoluteUrl(): string {
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    if (typeof window !== "undefined") {
      return new URL(url, window.location.origin).toString();
    }
    return url;
  }

  async function handleShare() {
    const target = absoluteUrl();

    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title, url: target });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }

    const copied = await copyToClipboard(target);
    showStatus(copied ? "copied" : "error");
  }

  const label =
    status === "copied"
      ? labels.copied
      : status === "error"
        ? labels.shareError
        : labels.share;

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label={label}
      title={label}
      className="inline-flex min-h-touch min-w-touch items-center justify-center rounded-full transition-colors hover:bg-white/10 hover:text-zinc-200"
    >
      {status === "copied" ? (
        <CheckIcon className="h-4 w-4 text-emerald-400" />
      ) : (
        <ShareIcon className="h-4 w-4" />
      )}
    </button>
  );
}
