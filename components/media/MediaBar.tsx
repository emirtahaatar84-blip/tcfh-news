"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronRightIcon,
  HeadphonesIcon,
  LoaderIcon,
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SparklesIcon,
  TrashIcon,
  XIcon,
} from "@/components/icons";
import { SPEECH_RATES, useMedia, type SleepOption } from "@/components/media/MediaProvider";
import { formatDuration } from "@/lib/datetime";

type Labels = {
  speechTitle: string;
  audioTitle: string;
  play: string;
  pause: string;
  back15: string;
  forward30: string;
  speed: string;
  voice: string;
  noVoice: string;
  sleep: string;
  sleepOff: string;
  sleepEnd: string;
  transcript: string;
  collapse: string;
  expand: string;
  close: string;
  confirmTitle: string;
  confirmBody: string;
  confirmYes: string;
  confirmNo: string;
  resumeTitle: string;
  resumeBody: string;
  resume: string;
  dismiss: string;
  deviceOnly: string;
  unsupported: string;
  queue: string;
  queueEmpty: string;
  remove: string;
  remaining: string;
};

const SLEEP_OPTIONS: SleepOption[] = [0, 10, 20, 30, 60, -1];

export function MediaBar({ labels }: { labels: Labels }) {
  const media = useMedia();

  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);

  const sleepRef = useRef<HTMLDivElement | null>(null);
  const voiceRef = useRef<HTMLDivElement | null>(null);

  // Dış tıklama / Esc ile menüleri kapat.
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (sleepOpen && !sleepRef.current?.contains(target)) setSleepOpen(false);
      if (voiceOpen && !voiceRef.current?.contains(target)) setVoiceOpen(false);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSleepOpen(false);
        setVoiceOpen(false);
      }
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [sleepOpen, voiceOpen]);

  const isSpeech = media.kind === "speech";
  const isAudio = media.kind === "audio";
  const visible = isSpeech || isAudio;

  if (!visible && !media.resumeSuggestion) return null;

  const progress = isSpeech ? media.progress : (
    media.audioDuration > 0
      ? Math.round((media.audioCurrentTime / media.audioDuration) * 100)
      : 0
  );

  const elapsed = isSpeech ? media.elapsed : media.audioCurrentTime;
  const remaining = isSpeech
    ? media.remaining
    : Math.max(0, Math.round((media.audioDuration || 0) - media.audioCurrentTime));

  return (
    <>
      {/* Kaldığın yerden devam önerisi */}
      {media.resumeSuggestion ? (
        <div
          role="status"
          className="fixed inset-x-0 bottom-[calc(var(--bottom-clearance)+var(--space-4))] z-[55] mx-auto flex max-w-md items-center gap-space-3 rounded-2xl border border-[#22252a] bg-[#16181c] p-space-3 shadow-2xl lg:bottom-space-9"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-blue-400">
            <HeadphonesIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold text-zinc-200">
              {labels.resumeTitle}
            </p>
            <p className="truncate text-[10px] text-zinc-500">
              {media.resumeSuggestion.title}
            </p>
          </div>
          <button
            type="button"
            onClick={media.resumeFromSuggestion}
            className="shrink-0 rounded-full bg-blue-600 px-space-3 py-space-2 text-[11px] font-bold text-white"
          >
            {labels.resume}
          </button>
          <button
            type="button"
            onClick={media.dismissResume}
            aria-label={labels.dismiss}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:text-zinc-100"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {/* Değiştirme onayı */}
      {media.pendingDoc ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="switch-title"
          className="fixed inset-0 z-[75] flex items-center justify-center px-space-4"
        >
          <button
            type="button"
            aria-label={labels.confirmNo}
            onClick={media.cancelSwitch}
            className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
            tabIndex={-1}
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-[#22252a] bg-[#16181c] p-space-5 shadow-2xl">
            <h2 id="switch-title" className="text-base font-bold text-zinc-100">
              {labels.confirmTitle}
            </h2>
            <p className="mt-space-2 text-sm leading-relaxed text-zinc-400">
              {labels.confirmBody}
            </p>
            <div className="mt-space-5 flex gap-space-2">
              <button
                type="button"
                onClick={media.cancelSwitch}
                className="btn-secondary flex-1"
              >
                {labels.confirmNo}
              </button>
              <button
                type="button"
                onClick={media.confirmSwitch}
                className="btn-primary flex-1"
              >
                {labels.confirmYes}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {visible ? (
        <section
          aria-label={isSpeech ? labels.speechTitle : labels.audioTitle}
          className="fixed inset-x-0 bottom-[var(--size-bottom-nav)] z-[58] border-t border-[#22252a] bg-[#0e0f12]/97 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:bottom-0"
        >
          {/* Durum duyurusu */}
          <p aria-live="polite" className="sr-only">
            {media.status === "playing"
              ? `${labels.speechTitle}: ${labels.play}`
              : media.status === "paused"
                ? `${labels.speechTitle}: ${labels.pause}`
                : ""}
          </p>

          {/* İlerleme çubuğu */}
          <div className="relative h-1 w-full bg-[#22252a]">
            <div
              className="absolute inset-y-0 left-0 bg-blue-500"
              style={{ width: `${progress}%` }}
            />
            <input
              type="range"
              min={0}
              max={isSpeech ? 100 : media.audioDuration || 0}
              step={1}
              value={isSpeech ? progress : media.audioCurrentTime}
              onChange={(event) => {
                const value = Number(event.target.value);

                if (isSpeech) {
                  if (media.sentences.length === 0) return;
                  const target = Math.round((value / 100) * (media.sentences.length - 1));
                  media.jumpToSentence(target);
                } else {
                  media.seekAudio(value);
                }
              }}
              aria-label={labels.speechTitle}
              className="absolute inset-0 h-1 w-full cursor-pointer appearance-none bg-transparent accent-blue-500"
            />
          </div>

          {collapsed ? (
            <div className="flex items-center gap-space-2 px-space-3 py-space-2">
              <button
                type="button"
                onClick={media.toggle}
                aria-label={media.status === "playing" ? labels.pause : labels.play}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-white"
              >
                {media.status === "playing" ? (
                  <PauseIcon className="h-4 w-4" />
                ) : (
                  <PlayIcon className="ml-space-1 h-4 w-4" />
                )}
              </button>
              <p className="min-w-0 flex-1 truncate text-[11px] font-semibold text-zinc-300">
                {isSpeech ? media.doc?.title : media.audioTrack?.title}
              </p>
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                aria-label={labels.expand}
                className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-400 hover:text-zinc-100"
              >
                <ChevronRightIcon className="h-4 w-4 -rotate-90" />
              </button>
              <button
                type="button"
                onClick={media.stop}
                aria-label={labels.close}
                className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-500 hover:text-zinc-100"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="px-space-3 py-space-2">
              <div className="flex items-center gap-space-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#22252a] bg-[#16181c] text-zinc-400">
                  {isSpeech ? (
                    <SparklesIcon className="h-4 w-4 text-violet-400" />
                  ) : (
                    <HeadphonesIcon className="h-4 w-4" />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-bold text-zinc-200">
                    {isSpeech ? media.doc?.title : media.audioTrack?.title}
                  </p>
                  <p className="flex items-center gap-space-1 text-[10px] tabular-nums text-zinc-500">
                    <span>{formatDuration(elapsed)}</span>
                    <span aria-hidden="true">/</span>
                    <span>
                      {labels.remaining}: {formatDuration(remaining)}
                    </span>
                    {media.error ? (
                      <span className="truncate text-amber-400">· {media.error}</span>
                    ) : null}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-space-1">
                  <button
                    type="button"
                    onClick={() => media.seekBy(-15)}
                    aria-label={labels.back15}
                    title={labels.back15}
                    className="hidden h-11 w-11 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100 sm:flex"
                  >
                    <SkipBackIcon className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={media.toggle}
                    aria-label={media.status === "playing" ? labels.pause : labels.play}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-white transition hover:bg-blue-500"
                  >
                    {media.status === "playing" ? (
                      <PauseIcon className="h-4 w-4" />
                    ) : (
                      <PlayIcon className="ml-space-1 h-4 w-4" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => media.seekBy(30)}
                    aria-label={labels.forward30}
                    title={labels.forward30}
                    className="hidden h-11 w-11 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100 sm:flex"
                  >
                    <SkipForwardIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-space-1 flex items-center gap-space-1 overflow-x-auto">
                {/* Hız */}
                <button
                  type="button"
                  onClick={() => {
                    const currentIndex = SPEECH_RATES.indexOf(
                      media.rate as (typeof SPEECH_RATES)[number],
                    );
                    const nextIndex =
                      (currentIndex + 1) % SPEECH_RATES.length;
                    media.setRate(SPEECH_RATES[nextIndex]);
                  }}
                  aria-label={labels.speed}
                  className="min-h-touch shrink-0 rounded-full border border-[#22252a] px-space-2 text-[10px] font-bold text-zinc-400 transition hover:text-zinc-100"
                >
                  {media.rate}x
                </button>

                {/* Ses seçimi (yalnızca tr-TR) */}
                {isSpeech ? (
                  <div className="relative shrink-0" ref={voiceRef}>
                    <button
                      type="button"
                      onClick={() => setVoiceOpen((value) => !value)}
                      aria-expanded={voiceOpen}
                      className="min-h-touch rounded-full border border-[#22252a] px-space-2 text-[10px] font-semibold text-zinc-400 transition hover:text-zinc-100"
                    >
                      {labels.voice}
                    </button>

                    {voiceOpen ? (
                      <div className="absolute bottom-full left-0 mb-space-1 w-56 rounded-xl border border-[#22252a] bg-[#16181c] p-space-1 shadow-2xl">
                        {media.voices.length === 0 ? (
                          <p className="p-space-2 text-[10px] leading-snug text-amber-400">
                            {labels.noVoice}
                          </p>
                        ) : (
                          media.voices.map((voice) => (
                            <button
                              key={voice.uri}
                              type="button"
                              onClick={() => {
                                media.setVoice(voice.uri);
                                setVoiceOpen(false);
                              }}
                              className={`block w-full truncate rounded-lg px-space-3 py-space-2 text-left text-[11px] transition hover:bg-white/5 ${
                                media.voiceURI === voice.uri
                                  ? "text-blue-400"
                                  : "text-zinc-300"
                              }`}
                            >
                              {voice.name}
                            </button>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* Uyku zamanlayıcı */}
                <div className="relative shrink-0" ref={sleepRef}>
                  <button
                    type="button"
                    onClick={() => setSleepOpen((value) => !value)}
                    aria-expanded={sleepOpen}
                    className={`min-h-touch rounded-full border px-space-2 text-[10px] font-semibold transition ${
                      media.sleepMinutes !== 0
                        ? "border-blue-500/40 bg-blue-500/10 text-blue-400"
                        : "border-[#22252a] text-zinc-400 hover:text-zinc-100"
                    }`}
                  >
                    {media.sleepRemaining !== null
                      ? `${labels.sleep} · ${formatDuration(media.sleepRemaining)}`
                      : labels.sleep}
                  </button>

                  {sleepOpen ? (
                    <div className="absolute bottom-full left-0 mb-space-1 w-44 rounded-xl border border-[#22252a] bg-[#16181c] p-space-1 shadow-2xl">
                      {SLEEP_OPTIONS.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => {
                            media.setSleep(option);
                            setSleepOpen(false);
                          }}
                          className={`block min-h-[36px] w-full rounded-lg px-space-3 text-left text-[11px] transition hover:bg-white/5 ${
                            media.sleepMinutes === option
                              ? "text-blue-400"
                              : "text-zinc-300"
                          }`}
                        >
                          {option === 0
                            ? labels.sleepOff
                            : option === -1
                              ? labels.sleepEnd
                              : `${option} dk`}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                {isSpeech ? (
                  <button
                    type="button"
                    onClick={() => setExpanded((value) => !value)}
                    aria-expanded={expanded}
                    className="min-h-touch shrink-0 rounded-full border border-[#22252a] px-space-2 text-[10px] font-semibold text-zinc-400 transition hover:text-zinc-100"
                  >
                    {labels.transcript}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setExpanded((value) => !value)}
                    aria-expanded={expanded}
                    className="min-h-touch shrink-0 rounded-full border border-[#22252a] px-space-2 text-[10px] font-semibold text-zinc-400 transition hover:text-zinc-100"
                  >
                    {labels.queue} ({media.audioQueue.length})
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setCollapsed(true)}
                  aria-label={labels.collapse}
                  className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:text-zinc-100"
                >
                  <ChevronRightIcon className="h-3.5 w-3.5 rotate-90" />
                </button>

                <button
                  type="button"
                  onClick={media.stop}
                  aria-label={labels.close}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:text-zinc-100"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Cümle listesi (karaoke) / sıra listesi */}
              {expanded ? (
                <div className="mt-space-2 max-h-52 overflow-y-auto rounded-xl border border-[#22252a] bg-[#16181c]">
                  {isSpeech ? (
                    media.sentences.length === 0 ? (
                      <p className="p-space-3 text-center text-[11px] text-zinc-500">
                        {labels.queueEmpty}
                      </p>
                    ) : (
                      <ol className="divide-y divide-[#22252a]/60">
                        {media.sentences.map((sentence, sentenceIndex) => {
                          const active = sentenceIndex === media.index;

                          return (
                            <li key={sentenceIndex}>
                              <button
                                type="button"
                                onClick={() => media.jumpToSentence(sentenceIndex)}
                                aria-current={active ? "true" : undefined}
                                className={`flex w-full gap-space-2 px-space-3 py-space-2 text-left text-[11px] leading-snug transition ${
                                  active
                                    ? "bg-blue-500/15 text-blue-100"
                                    : "text-zinc-400 hover:bg-white/5"
                                }`}
                              >
                                <span className="w-4 shrink-0 text-right text-[9px] text-zinc-600">
                                  {sentenceIndex + 1}
                                </span>
                                <span>{sentence}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ol>
                    )
                  ) : media.audioQueue.length === 0 ? (
                    <p className="p-space-3 text-center text-[11px] text-zinc-500">
                      {labels.queueEmpty}
                    </p>
                  ) : (
                    <ul>
                      {media.audioQueue.map((track, trackIndex) => (
                        <li
                          key={`${track.id}-${trackIndex}`}
                          draggable
                          onDragStart={(event) =>
                            event.dataTransfer.setData("text/plain", String(trackIndex))
                          }
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault();
                            const from = Number(
                              event.dataTransfer.getData("text/plain"),
                            );
                            if (Number.isFinite(from)) {
                              media.moveInAudioQueue(from, trackIndex);
                            }
                          }}
                          className={`flex cursor-grab items-center gap-space-2 px-space-3 py-space-2 ${
                            trackIndex === media.audioIndex
                              ? "bg-blue-500/10 text-blue-300"
                              : "text-zinc-300"
                          }`}
                        >
                          <span className="w-4 shrink-0 text-center text-[10px] text-zinc-600">
                            {trackIndex + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => media.playAudio(media.audioQueue, trackIndex)}
                            className="min-w-0 flex-1 truncate text-left text-[11px] font-medium hover:underline"
                          >
                            {track.title}
                          </button>
                          <button
                            type="button"
                            onClick={() => media.removeFromAudioQueue(trackIndex)}
                            aria-label={`${labels.remove}: ${track.title}`}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-600 hover:text-rose-400"
                          >
                            <TrashIcon className="h-3 w-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}

              {isSpeech ? (
                <p className="mt-space-2 text-[9px] leading-snug text-zinc-600">
                  {labels.deviceOnly}
                </p>
              ) : null}

              {!media.supported ? (
                <p className="mt-space-2 flex items-center gap-space-1 text-[10px] text-amber-400">
                  <LoaderIcon className="h-3 w-3" />
                  {labels.unsupported}
                </p>
              ) : null}
            </div>
          )}
        </section>
      ) : null}
    </>
  );
}
