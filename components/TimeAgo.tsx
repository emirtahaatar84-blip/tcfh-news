"use client";

import { useEffect, useState } from "react";
import { formatFullDate, formatRelativeTime } from "@/lib/time";
import type { Locale } from "@/lib/i18n-config";

type Props = {
  date: string;
  locale: Locale;
  className?: string;
};

export function TimeAgo({ date, locale, className }: Props) {
  const [label, setLabel] = useState(() => formatRelativeTime(date, locale));

  useEffect(() => {
    setLabel(formatRelativeTime(date, locale));

    const interval = window.setInterval(() => {
      setLabel(formatRelativeTime(date, locale));
    }, 60_000);

    return () => window.clearInterval(interval);
  }, [date, locale]);

  return (
    <time
      dateTime={date}
      title={formatFullDate(date, locale)}
      className={className}
      suppressHydrationWarning
    >
      {label}
    </time>
  );
}
