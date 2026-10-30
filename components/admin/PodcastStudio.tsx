"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckIcon,
  ExternalLinkIcon,
  LoaderIcon,
  MicIcon,
  TrashIcon,
} from "@/components/icons";
import { badgeClassesFor, CATEGORIES } from "@/lib/categories";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n-config";
import { PODCAST_VOICES } from "@/lib/podcast-voices";

/**
 * YZ Podcast Stüdyosu ("Potkes") — owner arayüzü.
 *
 * Akış: mod/kategori/konu seç → POST /api/podcast (processing) →
 * polling → taslak editör (tek yazma alanı, PUT script) → POST audio
 * (audio_processing) → ready: <audio> + oynatma kilidi (POST play) →
 * POST publish → published (public sayfa linki).
 *
 * Desen VideoNewsManager ile aynı: 4 sn polling, alt-orta toast,
 * animate-pulse-soft iskelet, kart: border-border/70 bg-[#080808].
 */

const POLL_INTERVAL_MS = 4000;

/** Tüm bölüm metni üst sınırı (backend podcastScriptUpdateSchema ile aynı). */
const SCRIPT_MAX_CHARS = 6000;

type PodcastDict = Dictionary["admin"]["podcast"];

type EpisodeMode = "daily" | "weekly" | "custom";

type PodcastSpeaker = { name: string; role: string; voiceKey: string };

type PodcastTurn = { speaker: string; text: string };

type PodcastScript = { speakers: PodcastSpeaker[]; turns: PodcastTurn[] };

type PodcastEpisodeDto = {
  id: string;
  title: string | null;
  mode: string;
  category: string | null;
  topic: string | null;
  script: PodcastScript | null;
  status: string;
  hasAudio: boolean;
  audioDurationSec: number | null;
  playedAt: string | null;
  publishedAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};


type Props = {
  lang: Locale;
  dict: PodcastDict;
};

/** Konuşmacı çipleri için sabit ton havuzu (Tailwind JIT için statik). */
const SPEAKER_TONES: readonly string[] = [
  "border-blue-500/30 bg-blue-500/10 text-blue-300",
  "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  "border-amber-500/30 bg-amber-500/10 text-amber-300",
  "border-violet-500/30 bg-violet-500/10 text-violet-300",
];

function speakerTone(speakers: PodcastSpeaker[], name: string): string {
  const index = speakers.findIndex((speaker) => speaker.name === name);
  return SPEAKER_TONES[(index < 0 ? 0 : index) % SPEAKER_TONES.length];
}

function modeLabel(mode: string, dict: PodcastDict): string {
  if (mode === "hourly") return dict.modes.hourly;
  if (mode === "daily") return dict.modes.daily;
  if (mode === "weekly") return dict.modes.weekly;
  if (mode === "custom") return dict.modes.custom;
  return mode;
}

function statusLabel(status: string, dict: PodcastDict): string {
  switch (status) {
    case "processing":
      return dict.statuses.processing;
    case "draft":
      return dict.statuses.draft;
    case "audio_processing":
      return dict.statuses.audioProcessing;
    case "ready":
      return dict.statuses.ready;
    case "published":
      return dict.statuses.published;
    case "failed":
      return dict.statuses.failed;
    default:
      return status;
  }
}

function statusChipClasses(status: string): string {
  switch (status) {
    case "processing":
    case "audio_processing":
      return "border-blue-500/25 bg-blue-500/10 text-blue-300";
    case "draft":
    case "ready":
      return "border-amber-500/25 bg-amber-500/10 text-amber-400";
    case "published":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-400";
    case "failed":
      return "border-rose-500/25 bg-rose-500/10 text-rose-400";
    default:
      return "border-border bg-white/[0.04] text-muted";
  }
}

function modeChipClasses(mode: string): string {
  switch (mode) {
    case "hourly":
      return "border-cyan-500/25 bg-cyan-500/10 text-cyan-300";
    case "daily":
      return "border-sky-500/25 bg-sky-500/10 text-sky-300";
    case "weekly":
      return "border-violet-500/25 bg-violet-500/10 text-violet-300";
    case "custom":
      return "border-amber-500/25 bg-amber-500/10 text-amber-300";
    default:
      return "border-border bg-white/[0.04] text-muted";
  }
}

export function PodcastStudio({ lang, dict }: Props) {
  const [items, setItems] = useState<PodcastEpisodeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // ── Yeni bölüm formu ──
  const [mode, setMode] = useState<EpisodeMode>("daily");
  const [category, setCategory] = useState("");
  const [topic, setTopic] = useState("");
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
      const response = await fetch("/api/podcast", { cache: "no-store" });
      if (!response.ok) throw new Error("failed");

      const data = (await response.json()) as { items: PodcastEpisodeDto[] };
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

  const hasBusy = items.some(
    (item) =>
      item.status === "processing" || item.status === "audio_processing",
  );

  // Senaryo veya ses üretilirken 4 sn'de bir sessiz poll; bitince durur.
  useEffect(() => {
    if (!hasBusy) return;

    const timer = setInterval(() => void load(true), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasBusy, load]);

  function upsertItem(next: PodcastEpisodeDto) {
    setItems((previous) => {
      const exists = previous.some((item) => item.id === next.id);
      return exists
        ? previous.map((item) => (item.id === next.id ? next : item))
        : [next, ...previous];
    });
  }

  // ── Yeni bölüm oluşturma ──

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTopic = topic.trim();

    if (mode === "custom" && !trimmedTopic) {
      setSubmitError(dict.topicRequired);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch("/api/podcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          category: mode === "custom" ? null : category || null,
          topic: mode === "custom" ? trimmedTopic : undefined,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        item?: PodcastEpisodeDto;
        message?: string;
      };

      if (!response.ok || !data.item) {
        setSubmitError(data.message ?? dict.errorLabel);
        return;
      }

      upsertItem(data.item);
      setTopic("");
    } catch {
      setSubmitError(dict.errorLabel);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Kart eylemleri (API çağrıları burada toplanır) ──

  async function requestItem(
    item: PodcastEpisodeDto,
    url: string,
    init: RequestInit,
  ): Promise<PodcastEpisodeDto | null> {
    setPendingId(item.id);

    try {
      const response = await fetch(url, init);
      const data = (await response.json().catch(() => ({}))) as {
        item?: PodcastEpisodeDto;
        message?: string;
      };

      if (!response.ok || !data.item) {
        showToast(data.message ?? dict.errorLabel);
        return null;
      }

      upsertItem(data.item);
      return data.item;
    } catch {
      showToast(dict.errorLabel);
      return null;
    } finally {
      setPendingId(null);
    }
  }

  function handleSaveScript(
    item: PodcastEpisodeDto,
    turns: PodcastTurn[],
    speakerVoices?: Record<string, string>,
  ) {
    return requestItem(item, `/api/podcast/${item.id}/script`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turns, speakerVoices }),
    }).then((updated) => {
      if (updated) showToast(dict.toastSaved);
      return updated;
    });
  }

  function handleGenerateAudio(item: PodcastEpisodeDto) {
    return requestItem(item, `/api/podcast/${item.id}/audio`, {
      method: "POST",
    });
  }

  function handlePlayed(item: PodcastEpisodeDto) {
    // İyimser: playedAt işaretleme idempotent; hata olsa da publish 403 verir.
    return requestItem(item, `/api/podcast/${item.id}/play`, {
      method: "POST",
    });
  }

  function handlePublish(item: PodcastEpisodeDto) {
    return requestItem(item, `/api/podcast/${item.id}/publish`, {
      method: "POST",
    }).then((updated) => {
      if (updated) showToast(dict.toastPublished);
      return updated;
    });
  }

  async function handleDelete(item: PodcastEpisodeDto) {
    if (!window.confirm(dict.confirmDelete)) return;

    setPendingId(item.id);

    try {
      const response = await fetch(`/api/podcast/${item.id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Delete failed");

      setItems((previous) => previous.filter((entry) => entry.id !== item.id));
      if (expandedId === item.id) setExpandedId(null);
      showToast(dict.toastDeleted);
    } catch {
      showToast(dict.errorLabel);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="w-full">
      {/* ── Üst kısım: yeni bölüm formu ── */}
      <div className="rounded-2xl border border-border/70 bg-[#080808] p-space-5">
        <h2 className="text-lg font-bold text-zinc-50">{dict.title}</h2>
        <p className="mt-space-1 text-sm leading-relaxed text-muted">
          {dict.description}
        </p>

        <form onSubmit={handleCreate} className="mt-space-4 space-y-space-4">
          {/* Mod seçimi */}
          <div>
            <div className="grid grid-cols-1 gap-space-2 sm:grid-cols-3">
              {(["daily", "weekly", "custom"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  aria-pressed={mode === value}
                  className={`rounded-xl border px-space-3 py-space-3 text-left text-sm font-semibold transition ${
                    mode === value
                      ? "border-blue-500/40 bg-blue-500/10 text-blue-200"
                      : "border-border/70 bg-[#0e0f12]/60 text-muted hover:bg-white/[0.04] hover:text-zinc-300"
                  }`}
                >
                  <span className="block">{dict.modes[value]}</span>
                  <span className="mt-space-1 block text-[11px] font-medium text-muted">
                    {dict.modeHints[value]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Kategori (daily/weekly) */}
          {mode !== "custom" ? (
            <div>
              <label
                htmlFor="podcast-category"
                className="field-label block text-xs font-semibold text-zinc-300"
              >
                {dict.category}
              </label>
              <select
                id="podcast-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="field mt-space-2"
              >
                <option value="">{dict.allCategories}</option>
                {CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {/* Özel konu (custom) */}
          {mode === "custom" ? (
            <div>
              <label
                htmlFor="podcast-topic"
                className="field-label block text-xs font-semibold text-zinc-300"
              >
                {dict.topic} *
              </label>
              <textarea
                id="podcast-topic"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder={dict.topicPlaceholder}
                rows={3}
                maxLength={500}
                className="field mt-space-2 resize-y"
              />
            </div>
          ) : null}

          {/* Gönder */}
          <div className="flex flex-wrap items-center justify-between gap-space-3">
            <span aria-live="polite" className="text-sm">
              {submitError ? (
                <span className="text-rose-400">{submitError}</span>
              ) : null}
            </span>

            <button
              type="submit"
              disabled={submitting}
              className="btn-primary shrink-0"
            >
              {submitting ? (
                <LoaderIcon className="h-4 w-4 animate-spin" />
              ) : (
                <MicIcon className="h-4 w-4" />
              )}
              {submitting ? dict.creating : dict.create}
            </button>
          </div>
        </form>
      </div>

      {/* ── Bölüm listesi ── */}
      <div className="mt-space-5 flex items-center justify-between gap-space-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted">
          {dict.tab}
        </h3>
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

      <div className="mt-space-3 space-y-space-3">
        {loading ? (
          // İskelet kartlar
          [0, 1, 2].map((index) => (
            <div
              key={index}
              className="animate-pulse-soft rounded-2xl border border-border/70 bg-[#080808] p-space-4"
            >
              <div className="flex gap-space-4">
                <div className="h-12 w-12 shrink-0 rounded-xl bg-[#16181c]" />
                <div className="flex-1 space-y-space-2 py-space-1">
                  <div className="h-3 w-1/3 rounded-full bg-[#16181c]" />
                  <div className="h-3 w-3/4 rounded-full bg-[#16181c]" />
                  <div className="h-2.5 w-1/2 rounded-full bg-[#16181c]" />
                </div>
              </div>
            </div>
          ))
        ) : loadError ? (
          <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-space-4 text-center">
            <p className="text-sm text-rose-300">{dict.errorLabel}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="btn-secondary mt-space-3"
            >
              {dict.refresh}
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-space-4 py-space-7 text-center">
            <MicIcon className="mx-auto mb-space-2 h-6 w-6 text-zinc-600" />
            <p className="text-sm font-medium text-zinc-300">{dict.empty}</p>
            <p className="mt-space-1 text-xs text-muted">{dict.emptyHint}</p>
          </div>
        ) : (
          items.map((item) => (
            <EpisodeCard
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
              onNotify={showToast}
              onSaveScript={(turns, speakerVoices) =>
                handleSaveScript(item, turns, speakerVoices)
              }
              onGenerateAudio={() => handleGenerateAudio(item)}
              onPlayed={() => handlePlayed(item)}
              onPublish={() => handlePublish(item)}
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

// ─── Tek bölüm kartı ──────────────────────────────────────────────────────────

type CardProps = {
  item: PodcastEpisodeDto;
  lang: Locale;
  dict: PodcastDict;
  expanded: boolean;
  pending: boolean;
  onToggleExpand: () => void;
  onNotify: (message: string) => void;
  onSaveScript: (
    turns: PodcastTurn[],
    speakerVoices?: Record<string, string>,
  ) => Promise<PodcastEpisodeDto | null>;
  onGenerateAudio: () => Promise<PodcastEpisodeDto | null>;
  onPlayed: () => Promise<PodcastEpisodeDto | null>;
  onPublish: () => Promise<PodcastEpisodeDto | null>;
  onDelete: () => void;
};

function EpisodeCard({
  item,
  lang,
  dict,
  expanded,
  pending,
  onToggleExpand,
  onNotify,
  onSaveScript,
  onGenerateAudio,
  onPlayed,
  onPublish,
  onDelete,
}: CardProps) {
  const script = item.script;
  const speakers = script?.speakers ?? [];

  const isDraft = item.status === "draft";
  const isReady = item.status === "ready";
  const isFailed = item.status === "failed";
  const isPublished = item.status === "published";
  const isBusy =
    item.status === "processing" || item.status === "audio_processing";

  const isPlayed = item.playedAt !== null;
  const publishLocked = isReady && !isPlayed;

  const durationMinutes = item.audioDurationSec
    ? Math.max(1, Math.round(item.audioDurationSec / 60))
    : null;

  // ── Taslak editörü yerel durumu: TEK yazma alanı ──
  const initialText = () =>
    (script?.turns ?? []).map((turn) => turn.text.trim()).join("\n\n");
  const [scriptText, setScriptText] = useState(initialText);
  const [syncedUpdatedAt, setSyncedUpdatedAt] = useState(item.updatedAt);

  // Konuşmacı başına karakter sesi seçimi (tek sesli bülten).
  const initialVoices = () =>
    Object.fromEntries(speakers.map((speaker) => [speaker.name, speaker.voiceKey]));
  const [speakerVoices, setSpeakerVoices] =
    useState<Record<string, string>>(initialVoices);

  // Kayıt sunucuda değiştiyse (kaydet/poll) editörü eşitle.
  useEffect(() => {
    if (item.updatedAt === syncedUpdatedAt) return;
    setSyncedUpdatedAt(item.updatedAt);
    setScriptText(
      (item.script?.turns ?? []).map((turn) => turn.text.trim()).join("\n\n"),
    );
    setSpeakerVoices(
      Object.fromEntries(
        (item.script?.speakers ?? []).map((speaker) => [
          speaker.name,
          speaker.voiceKey,
        ]),
      ),
    );
  }, [item.updatedAt, item.script, syncedUpdatedAt]);

  const originalVoices = Object.fromEntries(
    speakers.map((speaker) => [speaker.name, speaker.voiceKey]),
  );

  const dirty =
    scriptText.trim() !== initialText() ||
    JSON.stringify(speakerVoices) !== JSON.stringify(originalVoices);

  // Oynatma kilidi: POST /play tek seferlik beyan.
  const playClaimedRef = useRef(false);

  async function handleSave() {
    const text = scriptText.trim();
    const speaker = speakers[0]?.name ?? script?.turns[0]?.speaker;

    if (!speaker || text.length === 0 || text.length > SCRIPT_MAX_CHARS) {
      onNotify(dict.errorLabel);
      return;
    }

    await onSaveScript([{ speaker, text }], speakerVoices);
  }

  async function handleGenerateAudio() {
    // Kaydedilmemiş değişiklik varsa uyar — ses eski senaryodan üretilir.
    if (isDraft && dirty) {
      onNotify(dict.unsavedWarning);
      return;
    }
    await onGenerateAudio();
  }

  function handleAudioPlay() {
    if (item.playedAt || playClaimedRef.current) return;
    playClaimedRef.current = true;
    void onPlayed();
  }

  return (
    <article className="rounded-2xl border border-border/70 bg-[#080808] p-space-4">
      {/* ── Satır başlığı ── */}
      <div className="flex items-start gap-space-4">
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-[#0e0f12] ${
            isBusy ? "animate-pulse-soft text-blue-300" : "text-zinc-400"
          }`}
        >
          <MicIcon className="h-5 w-5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-space-2">
            <span
              className={`inline-flex items-center gap-space-2 rounded-full border px-space-2 py-space-1 text-[11px] font-semibold ${statusChipClasses(item.status)}`}
            >
              {isBusy ? (
                <LoaderIcon className="h-3 w-3 animate-spin" />
              ) : null}
              {statusLabel(item.status, dict)}
            </span>
            <span
              className={`chip ${modeChipClasses(item.mode)}`}
            >
              {modeLabel(item.mode, dict)}
            </span>
            {item.category ? (
              <span className={`chip ${badgeClassesFor(item.category)}`}>
                {item.category}
              </span>
            ) : null}
          </div>

          <p className="mt-space-2 text-sm font-semibold leading-snug text-zinc-100">
            {item.title ?? modeLabel(item.mode, dict)}
          </p>

          <p className="mt-space-1 flex flex-wrap items-center gap-x-space-2 gap-y-space-1 text-[11px] text-muted">
            <span>
              {new Date(item.createdAt).toLocaleDateString(
                lang === "en" ? "en-US" : "tr-TR",
              )}
            </span>
            {durationMinutes ? (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  ~{durationMinutes} {dict.minutes}
                </span>
              </>
            ) : null}
          </p>

          {/* Konuşmacı listesi (isim + rol) */}
          {speakers.length > 0 ? (
            <div className="mt-space-2 flex flex-wrap gap-space-2">
              {speakers.map((speaker) => (
                <span
                  key={speaker.name}
                  className={`inline-flex items-center gap-space-1 rounded-full border px-space-2 py-space-1 text-[11px] font-medium ${speakerTone(speakers, speaker.name)}`}
                >
                  <span className="font-semibold">{speaker.name}</span>
                  {speaker.role ? (
                    <span className="font-normal opacity-70">
                      · {speaker.role}
                    </span>
                  ) : null}
                </span>
              ))}
            </div>
          ) : null}

          {isFailed && item.error ? (
            <p className="mt-space-2 break-words text-xs text-rose-400">
              {item.error}
            </p>
          ) : null}
          {isFailed && !script ? (
            <p className="mt-space-2 text-xs text-rose-400/90">
              {dict.failedScriptNote}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-space-2">
          {isDraft ? (
            <button
              type="button"
              onClick={onToggleExpand}
              aria-expanded={expanded}
              className="btn-secondary px-space-3 py-space-2 text-xs"
            >
              {expanded ? "▴" : "▾"}
            </button>
          ) : null}

          {isFailed && script ? (
            <button
              type="button"
              onClick={() => void handleGenerateAudio()}
              disabled={pending}
              className="btn-secondary px-space-3 py-space-2 text-xs"
            >
              {pending ? (
                <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {dict.audioRegenerate}
            </button>
          ) : null}

          {isReady ? (
            <button
              type="button"
              onClick={() => void onPublish()}
              disabled={pending || publishLocked}
              title={publishLocked ? dict.listenFirst : undefined}
              className="btn-primary px-space-3 py-space-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? (
                <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {dict.publish}
            </button>
          ) : null}

          {isPublished ? (
            <Link
              href={`/${lang}/podcast`}
              target="_blank"
              className="btn-secondary px-space-3 py-space-2 text-xs"
            >
              <ExternalLinkIcon className="h-3.5 w-3.5" />
              {dict.viewPublic}
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

      {/* ── Ready: oynatıcı + oynatma kilidi ── */}
      {isReady ? (
        <div className="mt-space-4 border-t border-border/70 pt-space-4">
          <audio
            controls
            preload="none"
            src={`/api/podcast/${item.id}/audio`}
            onPlay={handleAudioPlay}
            className="h-10 w-full"
          />
          {publishLocked ? (
            <p className="mt-space-3 flex items-center gap-space-2 text-xs text-amber-400/90">
              🔒 {dict.listenFirst}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ── Failed (ses): oynatıcı YOK — hata + "Sesi Yeniden Üret" ── */}

      {/* ── Taslak editörü (draft kartı genişler) ── */}
      {isDraft && expanded && script ? (
        <div className="mt-space-4 space-y-space-3 border-t border-border/70 pt-space-4">
          {/* Karakter sesleri — her konuşmacı için sabit sinir sesi */}
          {speakers.length > 0 ? (
            <div className="rounded-xl border border-border/70 bg-[#0e0f12]/60 p-space-3">
              <p className="text-[11px] font-semibold text-zinc-300">
                {dict.voiceSelect}
              </p>
              <div className="mt-space-2 grid gap-space-2 sm:grid-cols-2">
                {speakers.map((speaker) => (
                  <label
                    key={speaker.name}
                    className="flex items-center gap-space-2 text-xs"
                  >
                    <span
                      className={`inline-flex shrink-0 items-center gap-space-1 rounded-full border px-space-2 py-space-1 text-[11px] font-semibold ${speakerTone(speakers, speaker.name)}`}
                    >
                      {speaker.name}
                    </span>
                    <select
                      value={speakerVoices[speaker.name] ?? speaker.voiceKey}
                      onChange={(event) =>
                        setSpeakerVoices((previous) => ({
                          ...previous,
                          [speaker.name]: event.target.value,
                        }))
                      }
                      aria-label={`${dict.voiceSelect}: ${speaker.name}`}
                      className="field min-w-0 flex-1 cursor-pointer py-space-2 text-xs [&>option]:bg-[#0e0f12]"
                    >
                      {Object.entries(PODCAST_VOICES).map(([key, profile]) => (
                        <option key={key} value={key}>
                          {profile.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {/* Tek yazma alanı — tüm bülten metni */}
          <div className="rounded-xl border border-border/70 bg-[#0e0f12]/60 p-space-3">
            <div className="flex flex-wrap items-baseline justify-between gap-space-2">
              <label
                htmlFor={`podcast-script-${item.id}`}
                className="text-[11px] font-semibold text-zinc-300"
              >
                {dict.scriptLabel}
              </label>
              <p className="text-[10px] text-muted">{dict.scriptHint}</p>
            </div>
            <textarea
              id={`podcast-script-${item.id}`}
              value={scriptText}
              onChange={(event) => setScriptText(event.target.value)}
              maxLength={SCRIPT_MAX_CHARS}
              rows={12}
              placeholder={dict.scriptPlaceholder}
              aria-label={dict.scriptLabel}
              className="field mt-space-2 resize-y text-sm leading-relaxed"
            />
            <p
              className={`mt-space-1 text-right text-[10px] ${
                scriptText.trim().length === 0 ||
                scriptText.trim().length > SCRIPT_MAX_CHARS
                  ? "text-rose-400"
                  : "text-muted"
              }`}
            >
              {scriptText.length}/{SCRIPT_MAX_CHARS}
            </p>
          </div>

          {/* Alt eylemler */}
          <div className="flex flex-wrap items-center gap-space-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={pending || !dirty}
              className="btn-primary px-space-3 py-space-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? (
                <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {dict.save}
            </button>
            <button
              type="button"
              onClick={() => void handleGenerateAudio()}
              disabled={pending}
              className="btn-secondary px-space-3 py-space-2 text-xs"
            >
              {pending ? (
                <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <MicIcon className="h-3.5 w-3.5" />
              )}
              {dict.generateAudio}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
