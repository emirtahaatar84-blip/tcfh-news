export default function FeedLoading() {
  return (
    <div
      className="animate-pulse space-y-space-3 px-space-3 pb-space-6 pt-space-3 sm:px-space-5"
      aria-hidden="true"
    >
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="rounded-2xl border border-[#22252a] bg-[#16181c] p-space-4 sm:p-space-4"
        >
          <div className="flex items-start gap-space-3">
            <div className="h-11 w-11 shrink-0 rounded-xl bg-[#22252a]" />
            <div className="min-w-0 flex-1 space-y-space-2">
              <div className="h-3 w-24 rounded-full bg-[#22252a]" />
              <div className="h-3.5 w-4/5 rounded-full bg-[#22252a]" />
              <div className="h-2.5 w-32 rounded-full bg-[#22252a]/70" />
            </div>
          </div>
          <div className="mt-space-3 h-3 w-full rounded-full bg-[#22252a]/70" />
          <div className="mt-space-2 h-3 w-11/12 rounded-full bg-[#22252a]/70" />
          <div className="mt-space-3 h-36 w-full rounded-2xl bg-[#22252a]/50" />
          <div className="mt-space-3 flex items-center gap-space-3">
            <div className="h-4 w-10 rounded-full bg-[#22252a]/70" />
            <div className="h-4 w-10 rounded-full bg-[#22252a]/70" />
          </div>
        </div>
      ))}
    </div>
  );
}
