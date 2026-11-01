"use client";

import { useState } from "react";

/**
 * FAZ 1.2 (frontend) — "Hata bildir" formu.
 *
 * Küçük açılır form: neden seçimi + isteğe bağlı not → POST /api/report.
 * Çerez YOK, kimlik YOK. Sunucu IP'yi hashleyip saatte 5 ile sınırlar.
 */

const REASONS: { value: string; label: string }[] = [
  { value: "yanlis-bilgi", label: "Yanlış bilgi" },
  { value: "eksik-bilgi", label: "Eksik bilgi" },
  { value: "kaynaksiz-iddia", label: "Kaynaksız iddia" },
  { value: "hakaret-ayrimcilik", label: "Hakaret / ayrımcılık" },
  { value: "telif", label: "Telif ihlali" },
  { value: "reklam-spam", label: "Reklam / spam" },
  { value: "diger", label: "Diğer" },
];

type Props = {
  newsId: string;
  /** Erişilebilir etiketler (i18n). */
  labels: {
    trigger: string;
    title: string;
    reason: string;
    note: string;
    notePlaceholder: string;
    submit: string;
    cancel: string;
    success: string;
    error: string;
    rateLimited: string;
  };
};

export function ReportButton({ newsId, labels }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0].value);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error" | "limited">("idle");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("sending");

    try {
      const response = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newsId, reason, note: note.trim() || undefined }),
      });

      if (response.status === 429) {
        setState("limited");
        return;
      }

      if (!response.ok) {
        setState("error");
        return;
      }

      setState("sent");
      setNote("");
      // Kısa süre sonra formu kapat, mesaj kaybolsun.
      window.setTimeout(() => {
        setOpen(false);
        setState("idle");
      }, 2500);
    } catch {
      setState("error");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[var(--size-touch)] items-center gap-space-2 rounded-full border border-[#22252a] px-space-3 text-label text-zinc-500 transition hover:border-[#31363e] hover:text-zinc-300"
      >
        <span aria-hidden="true">⚑</span>
        {labels.trigger}
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      aria-labelledby="report-title"
      className="mt-space-3 w-full rounded-2xl border border-[#22252a] bg-[#16181c] p-space-4"
    >
      <h3 id="report-title" className="t-meta font-semibold text-zinc-200">
        {labels.title}
      </h3>

      <div className="mt-space-3 grid gap-space-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
        <div>
          <label htmlFor={`report-reason-${newsId}`} className="field-label">
            {labels.reason}
          </label>
          <select
            id={`report-reason-${newsId}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="field cursor-pointer [&>option]:bg-[#0e0f12]"
          >
            {REASONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`report-note-${newsId}`} className="field-label">
            {labels.note}
          </label>
          <input
            id={`report-note-${newsId}`}
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, 300))}
            placeholder={labels.notePlaceholder}
            maxLength={300}
            className="field"
          />
        </div>
      </div>

      <div className="mt-space-3 flex flex-wrap items-center gap-space-2">
        <button
          type="submit"
          disabled={state === "sending"}
          className="btn-primary min-h-[var(--size-touch)] px-space-4 text-meta disabled:opacity-60"
        >
          {labels.submit}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setState("idle");
          }}
          className="inline-flex min-h-[var(--size-touch)] items-center px-space-3 text-label text-zinc-500 hover:text-zinc-300"
        >
          {labels.cancel}
        </button>
      </div>

      {/* Durum mesajı: ekran okuyucuya duyurulur. */}
      <p aria-live="polite" className="mt-space-2 text-label">
        {state === "sent" ? (
          <span className="text-emerald-400">{labels.success}</span>
        ) : state === "limited" ? (
          <span className="text-amber-400">{labels.rateLimited}</span>
        ) : state === "error" ? (
          <span className="text-rose-400">{labels.error}</span>
        ) : null}
      </p>
    </form>
  );
}
