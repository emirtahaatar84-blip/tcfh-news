/**
 * Sonsuz kaydırma sırasında gösterilen iskelet kart — NewsCard düzenini
 * taklit eden animate-pulse blokları. Algılanan yükleme hızını artırır.
 */
export function NewsCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden surface-card"
    >
      <div className="flex items-start gap-space-3">
        <div className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-[#22252a]" />

        <div className="min-w-0 flex-1">
          <div className="h-3.5 w-28 animate-pulse rounded-full bg-[#22252a]" />
          <div className="mt-spot-meta h-4 w-full animate-pulse rounded-full bg-[#22252a]" />
          <div className="mt-space-2 h-4 w-2/3 animate-pulse rounded-full bg-[#22252a]" />
          <div className="mt-spot-meta h-5 w-40 animate-pulse rounded-full bg-[#22252a]" />
        </div>

        <div className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-[#22252a]" />
      </div>

      <div className="mt-spot-meta h-[3.75rem] w-full animate-pulse rounded-xl bg-[#22252a]" />

      <div className="mt-spot-meta flex items-center gap-space-3">
        <div className="h-5 w-16 animate-pulse rounded-full bg-[#22252a]" />
        <div className="ml-auto h-5 w-5 animate-pulse rounded-full bg-[#22252a]" />
        <div className="h-5 w-5 animate-pulse rounded-full bg-[#22252a]" />
      </div>
    </div>
  );
}
