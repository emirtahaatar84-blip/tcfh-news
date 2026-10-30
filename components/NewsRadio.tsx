"use client";

import { HeadphonesIcon, PauseIcon, PlayIcon } from "@/components/icons";
import { useMedia } from "@/components/media/MediaProvider";
import type { Locale } from "@/lib/i18n-config";
import type { FeedNewsItem } from "@/lib/news-types";

type RadioLabels = {
  radio: string;
  radioNow: string;
  radioEnd: string;
  radioError: string;
};

type Props = {
  lang: Locale;
  items: FeedNewsItem[];
  labels: RadioLabels;
};

/**
 * "Haber Radyosu" başlatıcısı: akıştaki haberleri kalıcı alt oynatıcıya
 * sıra olarak yükler. Ses tek bir <audio> elemanından çalar; kontroller
 * (duraklat, 15 sn geri, 30 sn ileri, hız, uyku) alt oynatıcıdadır.
 */
export function NewsRadio({ items, labels }: Props) {
  const media = useMedia();

  if (items.length === 0) return null;

  const isRadioPlaying =
    media.kind === "audio" &&
    media.audioTrack?.src.startsWith("/api/news/") === true &&
    media.status === "playing";

  function start() {
    if (isRadioPlaying) {
      media.toggle();
      return;
    }

    media.playAudio(
      items.map((item) => ({
        id: item.id,
        title: item.title,
        src: `/api/news/${item.id}/audio`,
      })),
      0,
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      aria-pressed={isRadioPlaying}
      className={`inline-flex min-h-[36px] items-center gap-space-2 rounded-full border px-space-3 text-[11px] font-semibold transition ${
        isRadioPlaying
          ? "border-blue-500/40 bg-blue-500/10 text-blue-400"
          : "border-[#22252a] bg-[#16181c] text-zinc-300 hover:bg-[#1d2026] hover:text-zinc-100"
      }`}
    >
      {isRadioPlaying ? (
        <>
          <PauseIcon className="h-3.5 w-3.5" />
          {labels.radioNow}
        </>
      ) : (
        <>
          <PlayIcon className="ml-space-1 h-3.5 w-3.5" />
          <HeadphonesIcon className="h-3.5 w-3.5" />
          {labels.radio}
        </>
      )}
    </button>
  );
}
