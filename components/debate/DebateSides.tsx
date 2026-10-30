"use client";

import { useRef, useState } from "react";
import { CheckIcon } from "@/components/icons";

type Props = {
  government: string[];
  opposition: string[];
  governmentLabel: string;
  oppositionLabel: string;
  ariaLabel: string;
};

type Side = "government" | "opposition";

/**
 * "Taraflar" bloğu.
 * Masaüstü: iki kolon (Hükümet | Muhalefet) aynı anda görünür.
 * Mobil: sekme + yatay kaydırma ile geçiş (11.8).
 */
export function DebateSides({
  government,
  opposition,
  governmentLabel,
  oppositionLabel,
  ariaLabel,
}: Props) {
  const [side, setSide] = useState<Side>("government");
  const touchRef = useRef<{ x: number | null }>({ x: null });

  const tabs: { value: Side; label: string; count: number }[] = [
    { value: "government", label: governmentLabel, count: government.length },
    { value: "opposition", label: oppositionLabel, count: opposition.length },
  ];

  const switchSide = (next: Side) => setSide(next);

  const list = (items: string[], label: string) => (
    <ul className="space-y-space-2">
      {items.map((item, index) => (
        <li
          key={`${label}-${index}`}
          className="flex gap-space-2 rounded-xl border border-[#22252a] bg-[#16181c] px-space-3 py-space-3 text-[13px] leading-relaxed text-zinc-300"
        >
          <CheckIcon
            className={`mt-space-1 h-3.5 w-3.5 shrink-0 ${
              label === governmentLabel ? "text-emerald-500" : "text-rose-500"
            }`}
            aria-hidden="true"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <div
      onTouchStart={(event) => {
        touchRef.current.x = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const start = touchRef.current.x;
        const end = event.changedTouches[0]?.clientX ?? null;
        touchRef.current.x = null;
        if (start === null || end === null) return;
        const delta = end - start;
        if (Math.abs(delta) < 50) return;
        switchSide(delta < 0 ? "opposition" : "government");
      }}
    >
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="mb-space-2 inline-flex rounded-full border border-[#22252a] bg-[#16181c] p-space-1 md:hidden"
      >
        {tabs.map((tab) => {
          const selected = side === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`sides-${tab.value}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => switchSide(tab.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                  event.preventDefault();
                  switchSide(
                    tab.value === "government" ? "opposition" : "government",
                  );
                }
              }}
              className={`inline-flex min-h-[44px] items-center gap-space-2 rounded-full px-space-4 text-[13px] font-semibold transition ${
                selected
                  ? "bg-white/10 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {tab.label}
              <span className="text-[10px] text-zinc-500">{tab.count}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-space-3 md:grid-cols-2">
        <section
          id="sides-government"
          role="tabpanel"
          aria-label={governmentLabel}
          hidden={side !== "government"}
          className="md:block"
        >
          <h3 className="mb-space-2 flex items-center gap-space-2 text-[11px] font-bold uppercase tracking-wide text-emerald-400">
            {governmentLabel}
          </h3>
          {list(government, governmentLabel)}
        </section>

        <section
          id="sides-opposition"
          role="tabpanel"
          aria-label={oppositionLabel}
          hidden={side !== "opposition"}
          className="md:block"
        >
          <h3 className="mb-space-2 flex items-center gap-space-2 text-[11px] font-bold uppercase tracking-wide text-rose-400">
            {oppositionLabel}
          </h3>
          {list(opposition, oppositionLabel)}
        </section>
      </div>
    </div>
  );
}
