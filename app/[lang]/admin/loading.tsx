export default function AdminLoading() {
  return (
    <div className="animate-pulse px-space-4 py-space-5" aria-hidden="true">
      <div className="h-3 w-24 rounded-full bg-[#22252a]" />
      <div className="mt-space-5 h-7 w-56 rounded-full bg-[#22252a]" />
      <div className="mt-space-3 h-3 w-full max-w-md rounded-full bg-[#16181c]" />
      <div className="mt-space-5 grid grid-cols-3 gap-space-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-16 rounded-xl border border-border/70 bg-[#080808]"
          />
        ))}
      </div>
      <div className="mt-space-5 h-12 rounded-xl border border-border/70 bg-[#080808]" />
      <div className="mt-space-4 h-80 rounded-2xl border border-border/70 bg-[#080808]" />
    </div>
  );
}
