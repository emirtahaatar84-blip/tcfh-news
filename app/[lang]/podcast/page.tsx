import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MicIcon, PlayIcon } from "@/components/icons";
import { PodcastPlayButton } from "@/components/PodcastPlayButton";
import { TimeAgo } from "@/components/TimeAgo";
import { badgeClassesFor } from "@/lib/categories";
import { getDictionary } from "@/lib/i18n";
import type { Dictionary } from "@/lib/i18n";
import { isLocale, type Locale } from "@/lib/i18n-config";
import { prisma } from "@/lib/prisma";
import {
  serializePublicPodcastEpisode,
  type PublicPodcastEpisodeDto,
} from "@/lib/podcast";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ lang: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const lang = isLocale(rawLang) ? rawLang : "tr";
  const dict = await getDictionary(lang);

  // Herkese açık sayfa — noindex gerekmiyor.
  return { title: dict.podcast.title };
}

export default async function PodcastPage({ params }: PageProps) {
  const { lang: rawLang } = await params;

  if (!isLocale(rawLang)) notFound();

  const lang: Locale = rawLang;
  const dict = await getDictionary(lang);

  // Yayınlanmış bölümler (yeniden eskiye). Senaryo metni ASLA gönderilmez —
  // serializePublicPodcastEpisode yalnızca konuşmacı isim/rol çıkarır.
  const rows = await prisma.podcastEpisode.findMany({
    where: { status: "published" },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: 50,
  });

  const episodes = rows.map(serializePublicPodcastEpisode);

  return (
    <div className="mx-auto w-full max-w-3xl px-space-4 py-space-6 sm:px-space-5">
      <header>
        <h1 className="t-h1 flex items-center gap-space-3 text-zinc-50">
          <MicIcon className="h-6 w-6 text-zinc-300" />
          {dict.podcast.title}
        </h1>
        <p className="mt-space-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
          {dict.podcast.subtitle}
        </p>
      </header>

      {episodes.length === 0 ? (
        <div className="mt-space-5 rounded-2xl border border-dashed border-[#22252a] px-space-4 py-space-7 text-center">
          <MicIcon className="mx-auto mb-space-2 h-6 w-6 text-zinc-600" />
          <p className="text-sm text-zinc-400">{dict.podcast.empty}</p>
        </div>
      ) : (
        <div className="block-stack mt-space-6">
          {episodes.map((episode) => (
            <PodcastEpisodeCard
              key={episode.id}
              episode={episode}
              lang={lang}
              dict={dict.podcast}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Bölüm kartı (sunucu bileşeni) ────────────────────────────────────────────

type CardProps = {
  episode: PublicPodcastEpisodeDto;
  lang: Locale;
  dict: Dictionary["podcast"];
};

function modeLabel(mode: string, dict: Dictionary["podcast"]): string {
  if (mode === "daily") return dict.daily;
  if (mode === "weekly") return dict.weekly;
  if (mode === "custom") return dict.custom;
  return mode;
}

function modeChipClasses(mode: string): string {
  switch (mode) {
    case "daily":
      return "border-sky-500/25 bg-sky-500/10 text-sky-300";
    case "weekly":
      return "border-violet-500/25 bg-violet-500/10 text-violet-300";
    case "custom":
      return "border-amber-500/25 bg-amber-500/10 text-amber-300";
    default:
      return "border-[#22252a] bg-white/[0.04] text-zinc-400";
  }
}

function PodcastEpisodeCard({ episode, lang, dict }: CardProps) {
  const minutes = episode.audioDurationSec
    ? Math.max(1, Math.round(episode.audioDurationSec / 60))
    : null;

  return (
    <article className="rounded-2xl border border-[#22252a] bg-[#16181c] p-space-4 transition-colors hover:border-[#31363e] sm:p-space-5">
      <div className="flex items-start gap-space-4">
        {/* Oynat göstergesi */}
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-600 text-white shadow-lg"
        >
          <PlayIcon className="ml-space-1 h-5 w-5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-space-2">
            <span
              className={`chip ${modeChipClasses(episode.mode)}`}
            >
              {modeLabel(episode.mode, dict)}
            </span>
            {episode.category ? (
              <span className={`chip ${badgeClassesFor(episode.category)}`}>
                {episode.category}
              </span>
            ) : null}
          </div>

          <h2 className="mt-space-2 text-base font-bold leading-snug text-zinc-50">
            {episode.title ?? dict.title}
          </h2>

          <p className="mt-space-1 flex flex-wrap items-center gap-x-space-2 gap-y-space-1 text-xs text-zinc-500">
            {episode.publishedAt ? (
              <TimeAgo date={episode.publishedAt} locale={lang} />
            ) : null}
            {minutes ? (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  ~{minutes} {dict.minutes}
                </span>
              </>
            ) : null}
          </p>

          {episode.speakers.length > 0 ? (
            <div className="mt-space-2 flex flex-wrap gap-space-2">
              {episode.speakers.map((speaker) => (
                <span
                  key={speaker.name}
                  className="chip border-[#22252a] bg-[#0e0f12] text-zinc-400"
                >
                  <span className="font-semibold text-zinc-300">
                    {speaker.name}
                  </span>
                  {speaker.role ? (
                    <span className="text-zinc-500">· {speaker.role}</span>
                  ) : null}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {episode.hasAudio ? (
        <PodcastPlayButton
          episodeId={episode.id}
          title={episode.title ?? dict.title}
          labels={{ play: dict.play, pause: dict.pause }}
        />
      ) : null}
    </article>
  );
}
