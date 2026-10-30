"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BotIcon, LoaderIcon, SparklesIcon, UserIcon } from "@/components/icons";
import type { Locale } from "@/lib/i18n-config";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  sources?: { id: string; slug?: string; title: string }[];
};

type Labels = {
  title: string;
  subtitle: string;
  placeholder: string;
  send: string;
  thinking: string;
  empty: string;
  suggestions: string[];
  noStoreNotice: string;
  aiWarning: string;
  clear: string;
  error: string;
  unavailable: string;
  rateLimited: string;
};

type Props = {
  lang: Locale;
  labels: Labels;
};

/**
 * AI Asistan sohbeti. Yalnızca sitede yayınlanmış içeriklere dayanır (RAG).
 *
 * KVKK: geçmiş yalnızca BELLEKTE tutulur; sekme kapanınca silinir, hiçbir
 * yere (sunucu/cookie/localStorage) yazılmaz. Sayfa yenilenirse sohbet
 * sıfırlanır. Kullanıcıdan kişisel bilgi istenmez.
 */
export function AssistantChat({ lang, labels }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  async function send(question: string) {
    const trimmed = question.trim();
    if (!trimmed || busy) return;

    setError(null);
    setInput("");

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: trimmed },
    ];
    setMessages(nextMessages);
    setBusy(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
        cache: "no-store",
      });

      const data = (await response.json()) as {
        success?: boolean;
        answer?: string;
        sources?: { id: string; slug?: string; title: string }[];
        error?: string;
      };

      if (!response.ok || data.success !== true) {
        if (response.status === 429) setError(labels.rateLimited);
        else if (data.error === "AI_UNAVAILABLE") setError(labels.unavailable);
        else setError(labels.error);
        return;
      }

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: String(data.answer ?? ""),
          sources: Array.isArray(data.sources) ? data.sources : [],
        },
      ]);
    } catch {
      setError(labels.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-[#22252a] px-space-3 py-space-3 sm:px-space-5">
        <h1 className="t-h1 flex items-center gap-space-2 text-zinc-100">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400">
            <BotIcon className="h-4 w-4" />
          </span>
          {labels.title}
        </h1>
        <p className="mt-space-1 text-xs leading-relaxed text-zinc-500">
          {labels.subtitle}
        </p>
        <p
          role="note"
          className="mt-space-2 inline-flex items-center gap-space-2 rounded-full border border-amber-500/25 bg-amber-500/10 px-space-3 py-space-1 text-[10px] font-semibold text-amber-400"
        >
          {labels.noStoreNotice}
        </p>
      </div>

      <div
        ref={listRef}
        className="min-h-[40vh] flex-1 overflow-y-auto px-space-3 py-space-4 sm:px-space-5"
        aria-live="polite"
        aria-busy={busy}
      >
        {messages.length === 0 ? (
          <div className="mx-auto max-w-md py-space-5 text-center">
            <span className="mx-auto mb-space-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#22252a] bg-[#16181c] text-blue-400">
              <SparklesIcon className="h-5 w-5" />
            </span>
            <p className="text-sm leading-relaxed text-zinc-400">
              {labels.empty}
            </p>

            <div className="mt-space-4 flex flex-wrap justify-center gap-space-2">
              {labels.suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void send(suggestion)}
                  className="rounded-full border border-[#22252a] bg-[#16181c] px-space-3 py-space-2 text-[11px] font-medium text-zinc-400 transition hover:border-[#31363e] hover:text-zinc-100"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="space-y-space-3">
            {messages.map((message, index) => (
              <li
                key={index}
                className={`flex gap-space-3 ${
                  message.role === "user" ? "flex-row-reverse" : ""
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-space-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    message.role === "user"
                      ? "bg-white/10 text-zinc-300"
                      : "bg-blue-500/15 text-blue-400"
                  }`}
                >
                  {message.role === "user" ? (
                    <UserIcon className="h-3.5 w-3.5" />
                  ) : (
                    <SparklesIcon className="h-3.5 w-3.5" />
                  )}
                </span>

                <div
                  className={`max-w-[85%] rounded-2xl px-space-4 py-space-3 text-[13px] leading-relaxed ${
                    message.role === "user"
                      ? "bg-blue-600 text-white"
                      : "border border-[#22252a] bg-[#16181c] text-zinc-200"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>

                  {message.sources && message.sources.length > 0 ? (
                    <ul className="mt-space-2 space-y-space-1 border-t border-[#22252a] pt-space-2">
                      {message.sources.map((source) => (
                        <li key={source.id}>
                          <Link
                            href={`/${lang}/haber/${source.slug ?? source.id}`}
                            className="block truncate text-[11px] font-semibold text-blue-400 hover:text-blue-300 hover:underline"
                          >
                            → {source.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {message.role === "assistant" ? (
                    <p className="mt-space-2 text-[10px] leading-snug text-zinc-500">
                      {labels.aiWarning}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}

            {busy ? (
              <li className="flex items-center gap-space-2 pl-space-6 text-xs text-zinc-500">
                <LoaderIcon className="h-4 w-4 animate-spin" />
                {labels.thinking}
              </li>
            ) : null}
          </ul>
        )}

        {error ? (
          <p role="alert" className="mt-space-3 text-center text-xs text-rose-400">
            {error}
          </p>
        ) : null}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
        className="sticky bottom-space-8 border-t border-[#22252a] bg-[#0e0f12]/95 px-space-3 py-space-3 backdrop-blur-xl sm:px-space-5 lg:bottom-0"
      >
        <div className="flex items-end gap-space-2">
          <label htmlFor="assistant-input" className="sr-only">
            {labels.placeholder}
          </label>
          <textarea
            id="assistant-input"
            value={input}
            onChange={(event) => setInput(event.target.value.slice(0, 500))}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(input);
              }
            }}
            rows={1}
            placeholder={labels.placeholder}
            className="field max-h-32 min-h-[44px] resize-none rounded-2xl"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="btn-primary shrink-0 !px-space-4"
          >
            {labels.send}
          </button>
        </div>

        <div className="mt-space-2 flex items-center justify-between gap-space-2">
          <p className="text-[10px] text-zinc-600">{labels.noStoreNotice}</p>
          {messages.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                setError(null);
              }}
              className="text-[10px] font-semibold text-zinc-500 hover:text-zinc-300"
            >
              {labels.clear}
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
