"use client";

import { useEffect, useRef, useState } from "react";

/**
 * FAZ 4 (frontend) — Sesli bülten oynatıcı.
 *
 * Otomatik oynatma YOK (kullanıcı tıklamalı). Basit kontroller:
 * oynat/duraklat, hız seçimi (0.75–2×), ilerleme çubuğu, süre.
 *
 * KVKK: ses dosyası KENDİ sunucumuzdan servis edilir; üçüncü taraf yok.
 */

type Props = {
  src: string;
  title: string;
  labels: {
    play: string;
    pause: string;
    speed: string;
  };
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${String(sec).padStart(2, "0")}`;
}

export function DigestPlayer({ src, title, labels }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = rate;
  }, [rate]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const seek = (value: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(duration) || duration <= 0) return;
    audio.currentTime = (value / 100) * duration;
    setCurrent(audio.currentTime);
  };

  return (
    <div className="rounded-2xl border border-[#22252a] bg-[#16181c] p-space-4">
      <p className="t-meta font-semibold text-zinc-200">{title}</p>

      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />

      <div className="mt-space-3 flex items-center gap-space-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? labels.pause : labels.play}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition hover:bg-blue-500"
        >
          <span aria-hidden="true">{playing ? "❚❚" : "▶"}</span>
        </button>

        <div className="min-w-0 flex-1">
          <input
            type="range"
            min={0}
            max={100}
            step={0.5}
            value={duration > 0 ? (current / duration) * 100 : 0}
            onChange={(event) => seek(Number(event.target.value))}
            aria-label="İlerleme"
            className="w-full accent-blue-500"
          />
          <div className="mt-space-1 flex justify-between text-[11px] text-zinc-500">
            <span>{formatTime(current)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <label className="flex items-center gap-space-2 text-[11px] text-zinc-400">
          <span className="sr-only">{labels.speed}</span>
          <select
            value={rate}
            onChange={(event) => setRate(Number(event.target.value))}
            className="rounded-lg border border-[#22252a] bg-[#0e0f12] px-space-2 py-space-1 text-[11px] text-zinc-300"
            aria-label={labels.speed}
          >
            {[0.75, 1, 1.25, 1.5, 2].map((value) => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
