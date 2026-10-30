"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckIcon,
  ExternalLinkIcon,
  LoaderIcon,
  PlayIcon,
  PlusIcon,
  TrashIcon,
  VideoIcon,
} from "@/components/icons";
import { MarkdownContent } from "@/components/MarkdownContent";
import { badgeClassesFor } from "@/lib/categories";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n-config";
import type { VideoNewsDto } from "@/lib/video-news";

type Props = {
  lang: Locale;
  dict: Dictionary["admin"]["videoNews"];
};

const POLL_INTERVAL_MS = 4000;

/** Basit YouTube link kontrolü — zod yok, sadece boş/yanlış biçim uyarısı. */
function isLikelyYouTubeUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    return (
      host === "youtube.com" ||
      host === "www.youtube.com" ||
      host === "m.youtube.com" ||
      host === "youtu.be" ||
      host.endsWith(".youtube.com")
    );
  } catch {
    return false;
  }
}

export function VideoNewsManager({ lang, dict }: Props) {
  const [items, setItems] = useState<VideoNewsDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const toastTimer = useRef<number | null>(null);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setLoadError(false);
    }

    try {
      const response = await fetch("/api/video-news", { cache: "no-store" });
      if (!response.ok) throw new Error("failed");

      const data = (await response.json()) as { items: VideoNewsDto[] };
      setItems(data.items);
    } catch {
      if (!silent) setLoadError(true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hasProcessing = items.some((item) => item.status === "processing");

  // İşleme devam ederken 4 sn'de bir sessiz poll; processing kalmayınca durur.
  useEffect(() => {
    if (!hasProcessing) return;

    const timer = setInterval(() => void load(true), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasProcessing, load]);

  function upsertItem(next: VideoNewsDto) {
    setItems((previous) => {
      const exists = previous.some((item) => item.id === next.id);
      return exists
        ? previous.map((item) => (item.id === next.id ? next : item))
        : [next, ...previous];
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = url.trim();
    if (!trimmed || !isLikelyYouTubeUrl(trimmed)) {
      setSubmitError(dict.invalidUrl);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch("/api/video-news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        item?: VideoNewsDto;
        message?: string;
      };

      if (!response.ok || !data.item) {
        setSubmitError(data.message ?? dict.error);
        return;
      }

      upsertItem(data.item);
      setUrl("");
      setExpandedId(null);
    } catch {
      setSubmitError(dict.error);
    } finally {
      setSubmitting(false);
    }
  }

  /** Oynatma kilidi: kapalı oynatıcı → tıkla → play uç noktası + iframe. */
  async function handlePlay(item: VideoNewsDto) {
    // İyimser: iframe hemen yüklensin, istek arka planda tamamlansın.
    upsertItem({ ...item, playedAt: item.playedAt ?? new Date().toISOString() });

    try {
      const response = await fetch(`/api/video-news/${item.id}/play`, {
        method: "POST",
      });
      if (!response.ok) return;

      const data = (await response.json()) as { item?: VideoNewsDto };
      if (data.item) upsertItem(data.item);
    } catch {
      // Oynatma beyanı başarısız olsa da iframe açık kalır; publish yine 403 verir.
    }
  }

  async function handlePublish(item: VideoNewsDto) {
    setPendingId(item.id);

    try {
      const response = await fetch(`/api/video-news/${item.id}/publish`, {
        method: "POST",
      });

      const data = (await response.json().catch(() => ({}))) as {
        item?: VideoNewsDto | null;
        message?: string;
      };

      if (!response.ok) {
        showToast(data.message ?? dict.publishLocked);
        return;
      }

      if (data.item) upsertItem(data.item);
      showToast(dict.toastPublished);
    } catch {
      showToast(dict.error);
    } finally {
      setPendingId(null);
    }
  }

  async function handleRetry(item: VideoNewsDto) {
    setPendingId(item.id);

    try {
      const response = await fetch(`/api/video-news/${item.id}/retry`, {
        method: "POST",
      });

      const data = (await response.json().catch(() => ({}))) as {
        item?: VideoNewsDto;
        message?: string;
      };

      if (!response.ok || !data.item) {
        showToast(data.message ?? dict.error);
        return;
      }

      upsertItem(data.item);
    } catch {
      showToast(dict.error);
    } finally {
      setPendingId(null);
    }
  }

  async function handleDelete(item: VideoNewsDto) {
    if (!window.confirm(dict.confirmDelete)) return;

    setPendingId(item.id);

    try {
      const response = await fetch(`/api/video-news/${item.id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Delete failed");

      setItems((previous) => previous.filter((entry) => entry.id !== item.id));
      if (expandedId === item.id) setExpandedId(null);
      showToast(dict.toastDeleted);
    } catch {
      showToast(dict.error);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="w-full">
      {/* ── Üst kısım: link girişi ── */}
      <div className="rounded-2xl border border-border/70 bg-[#080808] p-space-5">
        <h2 className="text-lg font-bold text-zinc-50">{dict.title}</h2>
        <p className="mt-space-1 text-sm leading-relaxed text-muted">
          {dict.description}
        </p>

        <form onSubmit={handleSubmit} className="mt-space-4">
          <div className="flex flex-col gap-space-2 sm:flex-row">
            <input
              id="video-news-url"
              type="text"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder={dict.urlPlaceholder}
              autoComplete="off"
              className="field flex-1"
            />
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary shrink-0"
            >
              {submitting ? (
                <LoaderIcon className="h-4 w-4 animate-spin" />
              ) : (
                <PlusIcon className="h-4 w-4" />
              )}
              {dict.submit}
            </button>
          </div>

          <div className="mt-space-3 flex flex-wrap items-center justify-between gap-space-3">
            <span aria-live="polite" className="text-sm">
              {submitError ? (
                <span className="text-rose-400">{submitError}</span>
              ) : null}
            </span>

            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="btn-secondary px-space-3 py-space-2 text-xs"
            >
              {loading ? (
                <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {dict.refresh}
            </button>
          </div>
        </form>
      </div>

      {/* ── Kayıt listesi ── */}
      <div className="mt-space-5 space-y-space-3">
        {loading ? (
          // İskelet kartlar
          [0, 1, 2].map((index) => (
            <div
              key={index}
              className="animate-pulse-soft flex gap-space-3 rounded-2xl border border-border/70 bg-[#080808] p-space-4"
            >
              <div className="aspect-video w-28 shrink-0 rounded-lg bg-[#16181c]" />
              <div className="flex-1 space-y-space-2 py-space-1">
                <div className="h-3 w-3/4 rounded-full bg-[#16181c]" />
                <div className="h-2.5 w-1/2 rounded-full bg-[#16181c]" />
              </div>
            </div>
          ))
        ) : loadError ? (
          <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-space-4 text-center">
            <p className="text-sm text-rose-300">{dict.error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="btn-secondary mt-space-3"
            >
              {dict.retry}
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-space-4 py-space-7 text-center">
            <VideoIcon className="mx-auto mb-space-2 h-6 w-6 text-zinc-600" />
            <p className="text-sm font-medium text-zinc-300">{dict.empty}</p>
            <p className="mt-space-1 text-xs text-muted">{dict.emptyHint}</p>
          </div>
        ) : (
          items.map((item) => (
            <VideoNewsCard
              key={item.id}
              item={item}
              lang={lang}
              dict={dict}
              expanded={expandedId === item.id}
              pending={pendingId === item.id}
              onToggleExpand={() =>
                setExpandedId((previous) =>
                  previous === item.id ? null : item.id,
                )
              }
              onPlay={() => void handlePlay(item)}
              onPublish={() => void handlePublish(item)}
              onRetry={() => void handleRetry(item)}
              onDelete={() => void handleDelete(item)}
            />
          ))
        )}
      </div>

      {/* Bildirim (toast) */}
      {toast ? (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[#22252a] bg-[#16181c] px-space-4 py-space-3 text-sm text-zinc-100 shadow-xl"
        >
          <span className="inline-flex items-center gap-space-2">
            <CheckIcon className="h-4 w-4 text-emerald-400" />
            {toast}
          </span>
        </div>
      ) : null}
    </section>
  );
}

// ─── Tek kayıt kartı ──────────────────────────────────────────────────────────

type CardProps = {
  item: VideoNewsDto;
  lang: Locale;
  dict: Dictionary["admin"]["videoNews"];
  expanded: boolean;
  pending: boolean;
  onToggleExpand: () => void;
  onPlay: () => void;
  onPublish: () => void;
  onRetry: () => void;
  onDelete: () => void;
};

function statusChipClasses(status: string): string {
  switch (status) {
    case "processing":
      return "border-blue-500/25 bg-blue-500/10 text-blue-300";
    case "ready":
      return "border-amber-500/25 bg-amber-500/10 text-amber-400";
    case "failed":
      return "border-rose-500/25 bg-rose-500/10 text-rose-400";
    case "published":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-400";
    default:
      return "border-border bg-white/[0.04] text-muted";
  }
}

function statusLabel(
  status: string,
  dict: Dictionary["admin"]["videoNews"],
): string {
  switch (status) {
    case "processing":
      return dict.processing;
    case "ready":
      return dict.ready;
    case "failed":
      return dict.failed;
    case "published":
      return dict.published;
    default:
      return status;
  }
}

function VideoNewsCard({
  item,
  lang,
  dict,
  expanded,
  pending,
  onToggleExpand,
  onPlay,
  onPublish,
  onRetry,
  onDelete,
}: CardProps) {
  const isProcessing = item.status === "processing";
  const isReady = item.status === "ready";
  const isFailed = item.status === "failed";
  const isPublished = item.status === "published";
  const isPlayed = item.playedAt !== null;
  const publishLocked = isReady && !isPlayed;

  const embedUrl = `https://www.youtube.com/embed/${item.youtubeId}`;

  return (
    <article className="rounded-2xl border border-border/70 bg-[#080808] p-space-4">
      {/* ── Satır başlığı: thumbnail + bilgi + durum ── */}
      <div className="flex items-start gap-space-4">
        <button
          type="button"
          onClick={isReady ? onToggleExpand : undefined}
          disabled={!isReady}
          aria-label={isReady ? dict.details : undefined}
          className="relative block aspect-video w-24 shrink-0 overflow-hidden rounded-lg border border-border bg-[#0e0f12] sm:w-28"
        >
          {item.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.thumbnailUrl}
              alt={item.videoTitle ?? ""}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-muted">
              <VideoIcon className="h-5 w-5" />
            </span>
          )}
          {isReady ? (
            <span className="absolute bottom-1 right-1 rounded bg-black/70 px-space-1 py-space-1 text-[10px] font-semibold text-zinc-200">
              ▾
            </span>
          ) : null}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-space-2">
            <span
              className={`inline-flex items-center gap-space-2 rounded-full border px-space-2 py-space-1 text-[11px] font-semibold ${statusChipClasses(item.status)}`}
            >
              {isProcessing ? (
                <LoaderIcon className="h-3 w-3 animate-spin" />
              ) : null}
              {statusLabel(item.status, dict)}
            </span>
            {item.category ? (
              <span className={`chip ${badgeClassesFor(item.category)}`}>
                {item.category}
              </span>
            ) : null}
          </div>

          <p className="mt-space-2 line-clamp-2 text-sm font-semibold leading-snug text-zinc-100">
            {item.videoTitle ?? item.title ?? item.url}
          </p>

          <p className="mt-space-1 flex flex-wrap items-center gap-x-space-2 gap-y-space-1 text-[11px] text-muted">
            {item.channel ? (
              <>
                <span className="truncate">{item.channel}</span>
                <span aria-hidden="true">·</span>
              </>
            ) : null}
            <span>
              {new Date(item.createdAt).toLocaleDateString(
                lang === "en" ? "en-US" : "tr-TR",
              )}
            </span>
            {item.readTime ? (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  {dict.readTime.replace("{minutes}", String(item.readTime))}
                </span>
              </>
            ) : null}
          </p>

          {isFailed && item.error ? (
            <p className="mt-space-2 break-words text-xs text-rose-400">
              {item.error}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-space-2">
          {isFailed ? (
            <button
              type="button"
              onClick={onRetry}
              disabled={pending}
              className="btn-secondary px-space-3 py-space-2 text-xs"
            >
              {pending ? (
                <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {dict.retry}
            </button>
          ) : null}

          {isReady ? (
            <button
              type="button"
              onClick={onPublish}
              disabled={pending || publishLocked}
              title={publishLocked ? dict.publishLocked : undefined}
              className="btn-primary px-space-3 py-space-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? (
                <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {dict.publish}
            </button>
          ) : null}

          {isPublished && item.newsItemId ? (
            <Link
              href={`/${lang}/news/${item.newsItemId}`}
              target="_blank"
              className="btn-secondary px-space-3 py-space-2 text-xs"
            >
              <ExternalLinkIcon className="h-3.5 w-3.5" />
              {dict.viewInFeed}
            </Link>
          ) : null}

          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            aria-label={dict.delete}
            title={dict.delete}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-50"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Yayınla kilidi alt yazısı ── */}
      {publishLocked ? (
        <p className="mt-space-3 flex items-center gap-space-2 text-xs text-amber-400/90">
          🔒 {dict.publishLocked}
        </p>
      ) : null}

      {/* ── Detay: oynatıcı + haber önizlemesi (yalnızca ready) ── */}
      {isReady && expanded ? (
        <div className="mt-space-4 space-y-space-4 border-t border-border/70 pt-space-4">
          {/* Oynatma kilidi: playedAt dolana kadar kapalı oynatıcı */}
          {isPlayed ? (
            <div className="aspect-video w-full overflow-hidden rounded-xl border border-border bg-black">
              <iframe
                src={embedUrl}
                title={item.videoTitle ?? item.title ?? "YouTube"}
                loading="lazy"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                className="h-full w-full"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={onPlay}
              className="group relative block aspect-video w-full overflow-hidden rounded-xl border border-border bg-black"
            >
              {item.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.thumbnailUrl}
                  alt={item.videoTitle ?? ""}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover opacity-80 transition group-hover:opacity-100"
                />
              ) : null}
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-space-3 bg-black/40">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition group-hover:scale-105">
                  <PlayIcon className="ml-space-1 h-6 w-6" />
                </span>
                <span className="rounded-full bg-black/60 px-space-3 py-space-1 text-xs font-semibold text-zinc-100">
                  {dict.playToUnlock}
                </span>
              </span>
            </button>
          )}

          {/* Üretilen haber önizlemesi */}
          {item.title ? (
            <div className="rounded-xl border border-border/70 bg-[#0e0f12]/60 p-space-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted">
                {dict.preview}
              </p>
              <h3 className="mt-space-2 text-base font-bold leading-snug text-zinc-50">
                {item.title}
              </h3>
              {item.summary ? (
                <p className="mt-space-2 text-sm leading-relaxed text-zinc-300">
                  {item.summary}
                </p>
              ) : null}
              {item.content ? (
                <div className="mt-space-3">
                  <MarkdownContent content={item.content} />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
