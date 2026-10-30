"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon, XIcon } from "@/components/icons";
import type { Locale } from "@/lib/i18n-config";

type Props = {
  lang: Locale;
  initialQuery: string;
  placeholder: string;
  label: string;
  clearLabel: string;
};

/**
 * Büyük arama alanı. 300 ms debounce ile URL'i günceller (?q=…), böylece
 * sonuç paylaşılabilir ve geri tuşu çalışır. Sunucuya kişisel veri gitmez;
 * yalnızca arama terimi o istekte değerlendirilir, saklanmaz.
 */
export function SearchForm({
  lang,
  initialQuery,
  placeholder,
  label,
  clearLabel,
}: Props) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function push(next: string) {
    const trimmed = next.trim();
    router.push(
      trimmed
        ? `/${lang}/ara?q=${encodeURIComponent(trimmed)}`
        : `/${lang}/ara`,
      { scroll: false },
    );
  }

  function onChange(next: string) {
    setValue(next);

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => push(next), 300);
  }

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        push(value);
      }}
      className="relative"
    >
      <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
        spellCheck={false}
        className="h-14 w-full rounded-2xl border border-[#22252a] bg-[#16181c] pl-space-7 pr-space-7 text-base text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            setValue("");
            if (timer.current) clearTimeout(timer.current);
            router.push(`/${lang}/ara`, { scroll: false });
          }}
          aria-label={clearLabel}
          className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/10 hover:text-zinc-100"
        >
          <XIcon className="h-4 w-4" />
        </button>
      ) : null}
    </form>
  );
}
