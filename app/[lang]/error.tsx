"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import en from "@/locales/en.json";
import tr from "@/locales/tr.json";

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ lang?: string }>();
  const dict = params?.lang === "en" ? en : tr;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center px-space-5 py-space-9 text-center">
      <h1 className="t-h1 text-zinc-50">
        {dict.errors.title}
      </h1>
      <p className="mt-space-2 max-w-sm text-sm leading-relaxed text-muted">
        {dict.errors.description}
      </p>
      <button type="button" onClick={reset} className="btn-primary mt-space-5">
        {dict.errors.retry}
      </button>
    </div>
  );
}
