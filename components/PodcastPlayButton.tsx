"use client";

import { PauseIcon, PlayIcon } from "@/components/icons";
import { useMedia } from "@/components/media/MediaProvider";
import { formatDuration } from "@/lib/datetime";

type Props = {
  episodeId: string;
  title: string;
  labels: { play: string; pause: string };
};

/**
 * Podcast bölümü oynat düğmesi — kalıcı alt oynatıcıyı kullanır.
 * Böylece sayfada tek bir <audio> elemanı olur ve gezinirken ses kesilmez.
 */
export function PodcastPlayButton({ episodeId, title, labels }: Props) {
  const media = useMedia();
  const src = `/api/podcast/${episodeId}/audio`;

  const isCurrent = media.audioTrack?.src === src;
  const playing = isCurrent && media.status === "playing";

  return (
    <div className="mt-space-3 flex items-center gap-space-2">
      <button
        type="button"
        onClick={() => {
          if (isCurrent) {
            media.toggle();
            return;
          }
          media.playAudio([{ id: episodeId, title, src }], 0);
        }}
        aria-label={playing ? labels.pause : labels.play}
        aria-pressed={playing}
        className="inline-flex min-h-[44px] items-center gap-space-2 rounded-full bg-blue-600 px-space-4 text-sm font-bold text-white transition hover:bg-blue-500"
      >
        {playing ? (
          <PauseIcon className="h-4 w-4" />
        ) : (
          <PlayIcon className="ml-space-1 h-4 w-4" />
        )}
        {playing ? labels.pause : labels.play}
      </button>

      {isCurrent ? (
        <span className="text-xs tabular-nums text-zinc-500">
          {formatDuration(media.audioCurrentTime)} / {formatDuration(media.audioDuration)}
        </span>
      ) : null}
    </div>
  );
}
