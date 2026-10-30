"use client";

import { useEffect, useState } from "react";
import { HeadphonesIcon, LoaderIcon, PauseIcon, PlayIcon, SparklesIcon } from "@/components/icons";
import { useMedia } from "@/components/media/MediaProvider";
import { getSpeechResume, type SpeechResume } from "@/lib/local-store";
import type { SpeechBundle } from "@/lib/speech-text";

type Labels = {
  summary: string;
  full: string;
  playing: string;
  paused: string;
  unsupported: string;
  noVoice: string;
  resume: string;
  resumeBody: string;
  dismiss: string;
  deviceOnly: string;
};

type Props = {
  bundle: SpeechBundle;
  labels: Labels;
};

/**
 * "Sesli özeti dinle" / "Tüm metni dinle" düğmeleri — başlığın hemen altında.
 * Okuma tarayıcıda yapılır; hiçbir metin veya ses sunucuya gönderilmez.
 */
export function ListenControls({ bundle, labels }: Props) {
  const media = useMedia();
  const [resume, setResume] = useState<SpeechResume | null>(null);

  useEffect(() => {
    const saved = getSpeechResume();

    if (
      saved &&
      saved.contentId === bundle.full.contentId &&
      saved.sentenceIndex > 0 &&
      saved.sentenceIndex < bundle.full.sentences.length
    ) {
      setResume(saved);
    }
  }, [bundle.full.contentId, bundle.full.sentences.length]);

  const activeId = media.doc?.contentId ?? null;
  const isSameContent = activeId === bundle.full.contentId;
  const isPlayingSummary = isSameContent && media.doc?.mode === "summary";
  const isPlayingFull = isSameContent && media.doc?.mode === "full";
  const playing = media.status === "playing";

  function start(mode: "summary" | "full") {
    const doc = mode === "summary" ? bundle.summary : bundle.full;
    if (doc.sentences.length === 0) return;
    media.requestSpeech(doc, 0);
  }

  function toggleMode(mode: "summary" | "full") {
    const same = mode === "summary" ? isPlayingSummary : isPlayingFull;

    if (same) {
      media.toggle();
      return;
    }

    start(mode);
  }

  if (!media.supported) {
    return (
      <p className="mt-space-3 flex items-start gap-space-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-space-3 py-space-2 text-[11px] leading-relaxed text-amber-300">
        <LoaderIcon className="mt-space-1 h-3.5 w-3.5 shrink-0" />
        {labels.unsupported}
      </p>
    );
  }

  return (
    <div className="mt-space-3">
      <div className="flex flex-wrap items-center gap-space-2">
        <button
          type="button"
          onClick={() => toggleMode("summary")}
          aria-pressed={isPlayingSummary && playing}
          className="inline-flex min-h-[44px] items-center gap-space-2 rounded-full border border-violet-500/35 bg-violet-500/10 px-space-4 text-xs font-bold text-violet-300 transition hover:bg-violet-500/20"
        >
          {isPlayingSummary && playing ? (
            <PauseIcon className="h-3.5 w-3.5" />
          ) : (
            <SparklesIcon className="h-3.5 w-3.5" />
          )}
          {isPlayingSummary && playing
            ? labels.playing
            : isPlayingSummary && media.status === "paused"
              ? labels.paused
              : labels.summary}
        </button>

        <button
          type="button"
          onClick={() => toggleMode("full")}
          aria-pressed={isPlayingFull && playing}
          className="inline-flex min-h-[44px] items-center gap-space-2 rounded-full border border-[#22252a] bg-[#16181c] px-space-4 text-xs font-bold text-zinc-300 transition hover:border-[#31363e] hover:text-zinc-100"
        >
          {isPlayingFull && playing ? (
            <PauseIcon className="h-3.5 w-3.5" />
          ) : (
            <PlayIcon className="ml-space-1 h-3.5 w-3.5" />
          )}
          <HeadphonesIcon className="h-3.5 w-3.5" />
          {isPlayingFull && playing
            ? labels.playing
            : isPlayingFull && media.status === "paused"
              ? labels.paused
              : labels.full}
        </button>

        {media.voices.length === 0 ? (
          <span className="text-[10px] leading-snug text-amber-400">
            {labels.noVoice}
          </span>
        ) : null}
      </div>

      {resume && !isSameContent ? (
        <div className="mt-space-2 flex flex-wrap items-center gap-space-2 rounded-xl border border-[#22252a] bg-[#16181c] px-space-3 py-space-2">
          <p className="min-w-0 flex-1 text-[11px] leading-snug text-zinc-400">
            <span className="font-semibold text-zinc-200">{labels.resume}</span>{" "}
            {labels.resumeBody}
          </p>
          <button
            type="button"
            onClick={() => {
              media.requestSpeech(bundle.full, resume.sentenceIndex);
              setResume(null);
            }}
            className="min-h-[36px] shrink-0 rounded-full bg-blue-600 px-space-3 text-[11px] font-bold text-white"
          >
            {labels.resume}
          </button>
          <button
            type="button"
            onClick={() => setResume(null)}
            className="min-h-[36px] shrink-0 rounded-full px-space-2 text-[11px] text-zinc-500 hover:text-zinc-300"
          >
            {labels.dismiss}
          </button>
        </div>
      ) : null}

      <p className="mt-space-2 text-[10px] leading-snug text-zinc-600">
        {labels.deviceOnly}
      </p>
    </div>
  );
}
