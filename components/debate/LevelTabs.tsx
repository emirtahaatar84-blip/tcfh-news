"use client";

import { useRef } from "react";
import Link from "next/link";
import type { Locale } from "@/lib/i18n-config";
import type { DebateLevelFilter } from "@/lib/debate/config";

export type { DebateLevelFilter };

type Option = {
  value: DebateLevelFilter;
  label: string;
  href: string;
};

type Props = {
  lang: Locale;
  current: DebateLevelFilter;
  options: Option[];
  panelId: string;
  label: string;
};

/**
 * Seviye segment kontrolü (11.2).
 * role="tablist" + role="tab" + aria-selected; ok tuşlarıyla gezinme.
 * Her sekme gerçek bir bağlantıdır: geri tuşu ve paylaşılabilir URL çalışır.
 */
export function LevelTabs({ lang, current, options, panelId, label }: Props) {
  const refs = useRef<Array<HTMLAnchorElement | null>>([]);

  const move = (index: number, direction: 1 | -1) => {
    const next = (index + direction + options.length) % options.length;
    const element = refs.current[next];
    element?.focus();
    element?.click();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      className="inline-flex rounded-full border border-[#22252a] bg-[#16181c] p-space-1"
    >
      {options.map((option, index) => {
        const selected = option.value === current;

        return (
          <Link
            key={option.value}
            ref={(element) => {
              refs.current[index] = element;
            }}
            href={option.href}
            role="tab"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            hrefLang={lang === "tr" ? "tr-TR" : "en"}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                event.preventDefault();
                move(index, 1);
              }
              if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                event.preventDefault();
                move(index, -1);
              }
              if (event.key === "Home") {
                event.preventDefault();
                refs.current[0]?.focus();
              }
              if (event.key === "End") {
                event.preventDefault();
                refs.current[options.length - 1]?.focus();
              }
            }}
            className={`inline-flex min-h-[44px] items-center rounded-full px-space-4 text-[13px] font-semibold transition ${
              selected
                ? "bg-white/10 text-zinc-100 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
