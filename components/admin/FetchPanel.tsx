"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangleIcon,
  CheckIcon,
  LoaderIcon,
  PlayIcon,
} from "@/components/icons";
import type { Dictionary } from "@/lib/i18n";
import type { ProcessResult } from "@/lib/processor";

type FetchJob = {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  lastResult: ProcessResult | null;
  error: string | null;
};

type Props = {
  dict: Dictionary["admin"]["fetch"];
  hasActiveSources: boolean;
};

const POLL_INTERVAL_MS = 3_000;

export function FetchPanel({ dict, hasActiveSources }: Props) {
  const router = useRouter();
  const [job, setJob] = useState<FetchJob | null>(null);
  const [starting, setStarting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const poll = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/fetch", { cache: "no-store" });

      if (!response.ok) throw new Error("Status request failed");

      const data = (await response.json()) as FetchJob;
      setJob(data);

      if (!data.running) {
        stopPolling();
        router.refresh();
      }
    } catch {
      setRequestError(dict.error);
      stopPolling();
    }
  }, [dict.error, router, stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = window.setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);
  }, [poll, stopPolling]);

  const handleStart = useCallback(async () => {
    setStarting(true);
    setRequestError(null);

    try {
      const response = await fetch("/api/admin/fetch", { method: "POST" });

      if (!response.ok) throw new Error("Start request failed");

      const data = (await response.json()) as FetchJob;
      setJob(data);
      startPolling();
    } catch {
      setRequestError(dict.error);
    } finally {
      setStarting(false);
    }
  }, [dict.error, startPolling]);

  useEffect(() => {
    // Attach to an already-running job after a page reload.
    void poll();

    return stopPolling;
  }, [poll, stopPolling]);

  const running = job?.running ?? false;
  const result = job?.lastResult ?? null;
  const errorMessage = job?.error ?? requestError;

  const stats = result
    ? [
        { label: dict.stats.sources, value: result.sources },
        { label: dict.stats.staged, value: result.staged },
        { label: dict.stats.clusters, value: result.clusters },
        { label: dict.stats.verified, value: result.verified },
        { label: dict.stats.published, value: result.published },
        { label: dict.stats.rejected, value: result.rejected },
        { label: dict.stats.failed, value: result.failed },
      ]
    : [];

  return (
    <section className="admin-card">
      <h2 className="text-lg font-bold text-zinc-50">{dict.title}</h2>
      <p className="mt-space-1 text-sm leading-relaxed text-muted">
        {dict.description}
      </p>

      {!hasActiveSources ? (
        <div className="mt-space-4 flex items-start gap-space-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-space-4 py-space-3 text-sm text-amber-300">
          <AlertTriangleIcon className="mt-space-1 h-4 w-4 shrink-0" />
          {dict.noSources}
        </div>
      ) : null}

      <div className="mt-space-5 flex flex-wrap items-center gap-space-3">
        <button
          type="button"
          onClick={() => void handleStart()}
          disabled={running || starting || !hasActiveSources}
          className="btn-primary"
        >
          {running || starting ? (
            <LoaderIcon className="h-4 w-4 animate-spin" />
          ) : (
            <PlayIcon className="h-4 w-4" />
          )}
          {running ? dict.running : dict.button}
        </button>

        {errorMessage ? (
          <span className="inline-flex items-center gap-space-2 text-sm text-rose-400">
            <AlertTriangleIcon className="h-4 w-4" />
            {errorMessage}
          </span>
        ) : null}

        {result && !running ? (
          <span className="inline-flex items-center gap-space-2 text-sm text-emerald-400">
            <CheckIcon className="h-4 w-4" />
            {dict.success}
          </span>
        ) : null}
      </div>

      {result ? (
        <div className="mt-space-5">
          <div className="grid grid-cols-3 gap-space-2 sm:grid-cols-6">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-border/70 bg-[#0e0f12]/60 px-space-3 py-space-3 text-center"
              >
                <p className="text-xl font-extrabold text-zinc-100">
                  {stat.value}
                </p>
                <p className="mt-space-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>

          {result.errors.length > 0 ? (
            <div className="mt-space-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-space-4">
              <p className="text-xs font-bold uppercase tracking-wide text-rose-300">
                {dict.recentErrors}
              </p>
              <ul className="mt-space-2 space-y-space-2">
                {result.errors.map((item, index) => (
                  <li
                    key={`${index}-${item.slice(0, 24)}`}
                    className="break-words text-xs leading-relaxed text-rose-200/80"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
