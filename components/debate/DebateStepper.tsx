"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
  RefreshIcon,
} from "@/components/icons";
import {
  REQUIRED_FIELD_LABELS,
  formatTimer,
  stageDurationLabel,
  type DebateStage,
} from "@/lib/debate/format";

type Labels = {
  start: string;
  pause: string;
  resume: string;
  reset: string;
  next: string;
  previous: string;
  done: string;
  timeUp: string;
  required: string;
  speaker: string;
  task: string;
  output: string;
  timer: string;
};

type Props = {
  stages: DebateStage[];
  labels: Labels;
};

/**
 * Aşama aşama ilerleyen münazara akışı (stepper).
 *
 * - Süre sayacı: duraklat / devam / sıfırla.
 * - Tamamlanan aşamalar işaretlenir.
 * - Süre bitince ve aşama değişince aria-live ile duyurulur.
 * - JS kapalıyken tüm aşamalar statik liste olarak görünür (bu bileşen
 *   yalnızca etkileşimi ekler; içerik sunucuda da render edilir).
 */
export function DebateStepper({ stages, labels }: Props) {
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState(stages[0]?.seconds ?? 0);
  const [running, setRunning] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const intervalRef = useRef<number | null>(null);

  const stage = stages[index];

  const stopTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopTimer();
  }, [stopTimer]);

  useEffect(() => {
    if (!running || !stage) return;

    intervalRef.current = window.setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          stopTimer();
          setRunning(false);
          setAnnouncement(`${stage.label}: ${labels.timeUp}`);
          return 0;
        }
        return value - 1;
      });
    }, 1000);

    return () => stopTimer();
  }, [running, stage, labels.timeUp, stopTimer]);

  const selectStage = (next: number) => {
    if (next < 0 || next >= stages.length) return;
    stopTimer();
    setRunning(false);
    setIndex(next);
    setRemaining(stages[next].seconds);
    setAnnouncement(
      `${stages[next].index}. ${stages[next].label} · ${stageDurationLabel(stages[next])}`,
    );
  };

  const completeCurrent = () => {
    setCompleted((previous) => {
      const next = new Set(previous);
      next.add(index);
      return next;
    });
  };

  if (!stage) return null;

  return (
    <div className="space-y-space-3">
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {/* Aşama listesi */}
      <ol className="space-y-space-2">
        {stages.map((item, itemIndex) => {
          const active = itemIndex === index;
          const done = completed.has(itemIndex);

          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => selectStage(itemIndex)}
                aria-current={active ? "step" : undefined}
                className={`flex w-full items-start gap-space-3 rounded-xl border px-space-3 py-space-3 text-left transition ${
                  active
                    ? "border-violet-500/40 bg-violet-500/[0.08]"
                    : "border-[#22252a] bg-[#16181c] hover:border-[#31363e]"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-title-spot flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    done
                      ? "bg-emerald-500/20 text-emerald-300"
                      : active
                        ? "bg-violet-500/20 text-violet-200"
                        : "bg-[#22252a] text-zinc-400"
                  }`}
                >
                  {done ? <CheckIcon className="h-3 w-3" /> : item.index}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-space-2">
                    <span className="t-meta font-semibold text-zinc-200">
                      {item.label}
                    </span>
                    <span className="text-[10px] font-semibold text-zinc-500">
                      {stageDurationLabel(item)}
                    </span>
                    {done ? (
                      <span className="text-[10px] font-bold uppercase text-emerald-400">
                        {labels.done}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-title-spot block text-[10px] text-zinc-500">
                    {labels.speaker}: {item.speakerLabel}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* Aktif aşama paneli */}
      <div className="surface-card">
        <div className="flex flex-wrap items-center justify-between gap-inline">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-violet-300">
              {labels.speaker}: {stage.speakerLabel}
            </p>
            <h3 className="mt-title-spot text-[15px] font-bold text-zinc-100">
              {stage.index}. {stage.label}
            </h3>
          </div>

          <div className="flex items-center gap-inline">
            <span
              className="rounded-full border border-[#22252a] bg-[#0e0f12] px-space-3 py-space-1 text-lg font-bold tabular-nums text-zinc-100"
              aria-label={`${labels.timer}: ${formatTimer(remaining)}`}
            >
              {formatTimer(remaining)}
            </span>
            <button
              type="button"
              onClick={() => {
                if (remaining === 0) setRemaining(stage.seconds);
                setRunning((value) => !value);
              }}
              aria-pressed={running}
              className="inline-flex min-h-[44px] items-center gap-space-2 rounded-full border border-[#22252a] bg-white/5 px-space-3 text-[12px] font-semibold text-zinc-200 hover:bg-white/10"
            >
              {running ? (
                <>
                  <PauseIcon className="h-3.5 w-3.5" /> {labels.pause}
                </>
              ) : (
                <>
                  <PlayIcon className="h-3.5 w-3.5" />{" "}
                  {remaining < stage.seconds ? labels.resume : labels.start}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                stopTimer();
                setRunning(false);
                setRemaining(stage.seconds);
                setAnnouncement(`${stage.label}: ${labels.reset}`);
              }}
              aria-label={labels.reset}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#22252a] text-zinc-400 hover:text-zinc-100"
            >
              <RefreshIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        <dl className="mt-space-3 space-y-space-2 t-meta leading-relaxed">
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              {labels.task}
            </dt>
            <dd className="text-zinc-300">{stage.task}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              {labels.output}
            </dt>
            <dd className="text-zinc-300">{stage.output}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              {labels.required}
            </dt>
            <dd className="mt-space-1 flex flex-wrap gap-space-2">
              {stage.required.map((field) => (
                <span
                  key={field}
                  className="rounded-full border border-[#22252a] bg-[#0e0f12] px-space-3 py-space-1 text-[10px] font-semibold text-zinc-300"
                >
                  {REQUIRED_FIELD_LABELS[field]}
                </span>
              ))}
            </dd>
          </div>
        </dl>

        <div className="mt-space-3 flex items-center justify-between gap-inline border-t border-[#22252a] pt-spot-meta">
          <button
            type="button"
            onClick={() => selectStage(index - 1)}
            disabled={index === 0}
            className="inline-flex min-h-[44px] items-center gap-space-1 rounded-full border border-[#22252a] px-space-3 text-[12px] font-semibold text-zinc-300 disabled:opacity-40"
          >
            <ChevronLeftIcon className="h-3.5 w-3.5" />
            {labels.previous}
          </button>

          <button
            type="button"
            onClick={() => {
              completeCurrent();
              setAnnouncement(
                `${stage.label}: ${labels.done}. ${labels.next}.`,
              );
              if (index < stages.length - 1) selectStage(index + 1);
            }}
            className="inline-flex min-h-[44px] items-center gap-space-1 rounded-full border border-violet-500/40 bg-violet-500/15 px-space-3 text-[12px] font-bold text-violet-200"
          >
            {labels.next}
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
