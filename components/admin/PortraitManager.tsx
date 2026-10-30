"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangleIcon,
  CheckIcon,
  ExternalLinkIcon,
  LoaderIcon,
  SparklesIcon,
  TrashIcon,
} from "@/components/icons";
import { formatDateTime } from "@/lib/datetime";

type Candidate = {
  id: string;
  title: string;
  sourceUrl: string;
  category: string | null;
  score: number;
  scoreReason: string | null;
  status: string;
  failureReason: string | null;
  publishedAt: string | null;
  portraitId: string | null;
};

type PortraitRow = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  category: string;
  subjectType: string;
  subjectName: string | null;
  status: string;
  sourceCount: number;
  reviewNotes: string | null;
  publishedAt: string | null;
  updatedAt: string;
  viewCount: number;
  originStoryUrl: string | null;
  sources: { name: string; url: string }[];
};

type RunRow = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  fetched: number;
  fresh: number;
  scored: number;
  queued: number;
  published: number;
  review: number;
  failed: number;
  note: string | null;
};

type DryItem = { title: string; total: number; reason: string };

type Labels = {
  title: string;
  subtitle: string;
  run: string;
  dryRun: string;
  running: string;
  refresh: string;
  runs: string;
  candidates: string;
  portraits: string;
  score: string;
  reason: string;
  status: string;
  publish: string;
  review: string;
  remove: string;
  restore: string;
  open: string;
  noData: string;
  feedStrategy: string;
  dryResults: string;
  lastRuns: string;
  sourcesCount: string;
  error: string;
  note: string;
  stats: string;
};

/**
 * Portre yönetim paneli: hattı çalıştır, adayları puanlarıyla gör,
 * incelemeye alınanları yayınla veya Uyar-Kaldır ile kaldır.
 */
export function PortraitManager({
  lang,
  labels,
}: {
  lang: string;
  labels: Labels;
}) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [portraits, setPortraits] = useState<PortraitRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [dry, setDry] = useState<DryItem[] | null>(null);
  const [dryStrategy, setDryStrategy] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/portraits", { cache: "no-store" });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = (await response.json()) as {
        running?: boolean;
        counts?: Record<string, number>;
        runs?: RunRow[];
        candidates?: Candidate[];
        portraits?: PortraitRow[];
      };

      setRuns(data.runs ?? []);
      setCandidates(data.candidates ?? []);
      setPortraits(data.portraits ?? []);
      setCounts(data.counts ?? {});
      setRunning(Boolean(data.running));
    } catch (loadError) {
      setError(`${labels.error}: ${(loadError as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [labels.error]);

  useEffect(() => {
    void load();
  }, [load]);

  async function start(action: "run" | "dry") {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/portraits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (response.status === 409) {
        setRunning(true);
        return;
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      if (action === "dry") {
        const data = (await response.json()) as {
          items?: DryItem[];
          strategy?: string;
        };
        setDry(data.items ?? []);
        setDryStrategy(data.strategy ?? "");
      } else {
        setRunning(true);
        // Hat arka planda çalışır: birkaç saniye sonra listeyi tazele.
        window.setTimeout(() => void load(), 8000);
      }
    } catch (startError) {
      setError(`${labels.error}: ${(startError as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function act(id: string, action: "publish" | "review" | "remove" | "restore") {
    setBusy(true);

    try {
      const response = await fetch(`/api/admin/portraits/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      await load();
    } catch (actError) {
      setError(`${labels.error}: ${(actError as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const statusClass = (status: string) =>
    status === "published"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
      : status === "review"
        ? "border-amber-500/25 bg-amber-500/10 text-amber-400"
        : status === "removed"
          ? "border-rose-500/25 bg-rose-500/10 text-rose-400"
          : status === "failed"
            ? "border-rose-500/25 bg-rose-500/10 text-rose-400"
            : "border-[#22252a] bg-white/5 text-zinc-400";

  return (
    <div className="space-y-space-4">
      <div className="admin-card">
        <div className="flex flex-wrap items-start justify-between gap-space-3">
          <div>
            <h2 className="flex items-center gap-space-2 text-lg font-bold text-zinc-50">
              <SparklesIcon className="h-5 w-5 text-violet-400" />
              {labels.title}
            </h2>
            <p className="mt-space-1 max-w-xl text-sm leading-relaxed text-muted">
              {labels.subtitle}
            </p>
          </div>

          <div className="flex flex-wrap gap-space-2">
            <button
              type="button"
              onClick={() => void start("dry")}
              disabled={busy}
              className="btn-secondary"
            >
              {labels.dryRun}
            </button>
            <button
              type="button"
              onClick={() => void start("run")}
              disabled={busy || running}
              className="btn-primary"
            >
              {busy || running ? (
                <LoaderIcon className="h-4 w-4 animate-spin" />
              ) : (
                <SparklesIcon className="h-4 w-4" />
              )}
              {running ? labels.running : labels.run}
            </button>
            <button type="button" onClick={() => void load()} className="btn-secondary">
              {labels.refresh}
            </button>
          </div>
        </div>

        <div className="mt-space-3 flex flex-wrap gap-space-2 text-[11px]">
          {Object.entries(counts).map(([status, count]) => (
            <span key={status} className={`chip ${statusClass(status)}`}>
              {status}: {count}
            </span>
          ))}
        </div>

        {error ? (
          <p className="mt-space-3 flex items-start gap-space-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-space-3 py-space-2 text-xs text-rose-300">
            <AlertTriangleIcon className="mt-space-1 h-4 w-4 shrink-0" />
            {error}
          </p>
        ) : null}

        {dry ? (
          <div className="mt-space-3 rounded-xl border border-[#22252a] bg-[#0e0f12] p-space-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              {labels.dryResults} · {labels.feedStrategy}: {dryStrategy}
            </p>
            {dry.length === 0 ? (
              <p className="mt-space-2 text-xs text-zinc-500">{labels.noData}</p>
            ) : (
              <ul className="mt-space-2 space-y-space-1">
                {dry.map((item, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-space-2 text-[11px] leading-snug"
                  >
                    <span
                      className={`shrink-0 rounded-full px-space-2 py-space-1 font-bold ${
                        item.total >= 7
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-[#22252a] text-zinc-400"
                      }`}
                    >
                      {item.total.toFixed(1)}
                    </span>
                    <span className="min-w-0 flex-1 text-zinc-300">
                      {item.title}
                      <span className="block text-[10px] text-zinc-500">{item.reason}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      <div className="admin-card">
        <h3 className="text-sm font-bold text-zinc-200">{labels.lastRuns}</h3>
        {loading ? (
          <p className="mt-space-2 flex items-center gap-space-2 text-xs text-zinc-500">
            <LoaderIcon className="h-4 w-4 animate-spin" />
            {labels.refresh}
          </p>
        ) : runs.length === 0 ? (
          <p className="mt-space-2 text-xs text-zinc-500">{labels.noData}</p>
        ) : (
          <ul className="mt-space-2 space-y-space-2">
            {runs.map((run) => (
              <li
                key={run.id}
                className="rounded-xl border border-[#22252a] bg-[#0e0f12] px-space-3 py-space-2"
              >
                <div className="flex flex-wrap items-center gap-space-2 text-[11px]">
                  <span className={`chip ${statusClass(run.status === "ok" ? "published" : "failed")}`}>
                    {run.status}
                  </span>
                  <span className="text-zinc-400">
                    {formatDateTime(run.startedAt, "tr")}
                  </span>
                  <span className="ml-auto text-zinc-500">
                    fetched {run.fetched} · fresh {run.fresh} · scored {run.scored} ·
                    queued {run.queued} · <span className="text-emerald-400">published {run.published}</span>
                    {" · "}<span className="text-amber-400">review {run.review}</span>
                    {" · "}<span className="text-rose-400">failed {run.failed}</span>
                  </span>
                </div>
                {run.note ? (
                  <p className="mt-space-1 text-[10px] leading-snug text-zinc-500">
                    {run.note.slice(0, 400)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="admin-card">
        <h3 className="text-sm font-bold text-zinc-200">
          {labels.portraits} ({portraits.length})
        </h3>

        {portraits.length === 0 ? (
          <p className="mt-space-2 text-xs text-zinc-500">{labels.noData}</p>
        ) : (
          <ul className="mt-space-2 space-y-space-2">
            {portraits.map((portrait) => (
              <li
                key={portrait.id}
                className="rounded-xl border border-[#22252a] bg-[#0e0f12] p-space-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-space-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-snug text-zinc-100">
                      {portrait.title}
                    </p>
                    <p className="mt-space-1 flex flex-wrap items-center gap-x-space-2 gap-y-space-1 text-[10px] text-zinc-500">
                      <span className={`chip ${statusClass(portrait.status)}`}>
                        {portrait.status}
                      </span>
                      <span>{portrait.category}</span>
                      <span>· {portrait.subjectType}</span>
                      <span>· {labels.sourcesCount}: {portrait.sourceCount}</span>
                      <span>· {portrait.viewCount} okunma</span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-space-2">
                    <a
                      href={`/${lang}/portre/${portrait.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/10 hover:text-zinc-100"
                      aria-label={labels.open}
                      title={labels.open}
                    >
                      <ExternalLinkIcon className="h-4 w-4" />
                    </a>

                    {portrait.status !== "published" ? (
                      <button
                        type="button"
                        onClick={() => void act(portrait.id, "publish")}
                        disabled={busy}
                        className="inline-flex min-h-[32px] items-center gap-space-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-space-3 text-[11px] font-semibold text-emerald-400 transition hover:bg-emerald-500/20"
                      >
                        <CheckIcon className="h-3 w-3" />
                        {labels.publish}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void act(portrait.id, "review")}
                        disabled={busy}
                        className="inline-flex min-h-[32px] items-center gap-space-1 rounded-full border border-[#22252a] px-space-3 text-[11px] font-semibold text-zinc-400 transition hover:text-zinc-100"
                      >
                        {labels.review}
                      </button>
                    )}

                    {portrait.status === "removed" ? (
                      <button
                        type="button"
                        onClick={() => void act(portrait.id, "restore")}
                        disabled={busy}
                        className="inline-flex min-h-[32px] items-center gap-space-1 rounded-full border border-emerald-500/30 px-space-3 text-[11px] font-semibold text-emerald-400"
                      >
                        {labels.restore}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void act(portrait.id, "remove")}
                        disabled={busy}
                        className="inline-flex min-h-[32px] items-center gap-space-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-space-3 text-[11px] font-semibold text-rose-400 transition hover:bg-rose-500/20"
                      >
                        <TrashIcon className="h-3 w-3" />
                        {labels.remove}
                      </button>
                    )}
                  </div>
                </div>

                {portrait.reviewNotes ? (
                  <p className="mt-space-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-space-2 py-space-2 text-[10px] leading-snug text-amber-300">
                    {labels.note}: {portrait.reviewNotes}
                  </p>
                ) : null}

                <p className="mt-space-2 flex flex-wrap gap-x-space-2 gap-y-space-1 text-[10px] text-zinc-600">
                  {portrait.sources.slice(0, 4).map((source) => (
                    <a
                      key={source.url}
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="hover:text-zinc-400 hover:underline"
                    >
                      {source.name}
                    </a>
                  ))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="admin-card">
        <h3 className="text-sm font-bold text-zinc-200">
          {labels.candidates} ({candidates.length})
        </h3>

        {candidates.length === 0 ? (
          <p className="mt-space-2 text-xs text-zinc-500">{labels.noData}</p>
        ) : (
          <ul className="mt-space-2 space-y-space-2">
            {candidates.map((candidate) => (
              <li
                key={candidate.id}
                className="rounded-xl border border-[#22252a] bg-[#0e0f12] px-space-3 py-space-2"
              >
                <div className="flex items-start gap-space-2">
                  <span
                    className={`mt-space-1 shrink-0 rounded-full px-space-2 py-space-1 text-[10px] font-bold ${
                      candidate.score >= 7
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-[#22252a] text-zinc-400"
                    }`}
                  >
                    {candidate.score.toFixed(1)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[11px] font-medium leading-snug text-zinc-300">
                      {candidate.title}
                    </p>
                    <p className="mt-space-1 flex flex-wrap items-center gap-x-space-2 text-[10px] text-zinc-600">
                      <span className={`chip ${statusClass(candidate.status)}`}>
                        {candidate.status}
                      </span>
                      {candidate.category ? <span>{candidate.category}</span> : null}
                      {candidate.failureReason ? (
                        <span className="text-amber-500">
                          {candidate.failureReason.slice(0, 120)}
                        </span>
                      ) : null}
                    </p>
                  </div>

                  <a
                    href={candidate.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-600 hover:text-zinc-300"
                    aria-label={labels.open}
                  >
                    <ExternalLinkIcon className="h-3.5 w-3.5" />
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
