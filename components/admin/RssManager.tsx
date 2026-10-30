"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckIcon,
  ExternalLinkIcon,
  LoaderIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/icons";
import { CATEGORIES, badgeClassesFor, isCategory } from "@/lib/categories";
import type { Dictionary } from "@/lib/i18n";
import type { RssSourceDto } from "@/lib/rss-source";
import { formatMessage } from "@/lib/format";

type Props = {
  initialSources: RssSourceDto[];
  dict: Dictionary["admin"]["rss"];
  categoryLabels: Dictionary["categories"];
};

export function RssManager({ initialSources, dict, categoryLabels }: Props) {
  const router = useRouter();
  const [sources, setSources] = useState(initialSources);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<string>("World");
  const [adding, setAdding] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdding(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/rss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url, category }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        source?: RssSourceDto;
        error?: string;
      };

      if (response.status === 409) {
        setError(dict.duplicate);
        return;
      }

      if (!response.ok || !data.source) {
        setError(
          data.error === "INVALID_URL" ? dict.invalidUrl : dict.error,
        );
        return;
      }

      setSources((previous) => [data.source as RssSourceDto, ...previous]);
      setName("");
      setUrl("");
      setNotice(dict.added);
      router.refresh();
    } catch {
      setError(dict.error);
    } finally {
      setAdding(false);
    }
  }

  async function toggleSource(source: RssSourceDto) {
    setPendingId(source.id);
    setError(null);

    try {
      const response = await fetch(`/api/admin/rss/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !source.isActive }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        source?: RssSourceDto;
      };

      if (!response.ok || !data.source) throw new Error("Update failed");

      setSources((previous) =>
        previous.map((item) =>
          item.id === source.id ? (data.source as RssSourceDto) : item,
        ),
      );
      router.refresh();
    } catch {
      setError(dict.error);
    } finally {
      setPendingId(null);
    }
  }

  async function deleteSource(source: RssSourceDto) {
    const confirmed = window.confirm(
      formatMessage(dict.deleteConfirm, { name: source.name }),
    );
    if (!confirmed) return;

    setPendingId(source.id);
    setError(null);

    try {
      const response = await fetch(`/api/admin/rss/${source.id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Delete failed");

      setSources((previous) =>
        previous.filter((item) => item.id !== source.id),
      );
      router.refresh();
    } catch {
      setError(dict.error);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="admin-card">
      <h2 className="text-lg font-bold text-zinc-50">{dict.title}</h2>
      <p className="mt-space-1 text-sm leading-relaxed text-muted">
        {dict.description}
      </p>

      <form
        onSubmit={handleAdd}
        className="mt-space-5 space-y-space-4 rounded-xl border border-border/80 bg-[#0e0f12]/60 p-space-4"
      >
        <h3 className="text-sm font-bold text-zinc-200">{dict.addTitle}</h3>

        <div className="grid gap-space-4 sm:grid-cols-2">
          <div>
            <label htmlFor="rss-name" className="field-label">
              {dict.name}
            </label>
            <input
              id="rss-name"
              type="text"
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={dict.namePlaceholder}
              className="field"
            />
          </div>

          <div>
            <label htmlFor="rss-category" className="field-label">
              {dict.category}
            </label>
            <select
              id="rss-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="field cursor-pointer [&>option]:bg-[#0e0f12]"
            >
              {CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {categoryLabels[item] ?? item}
                </option>
              ))}
            </select>
            {/* Kategori artık zorunlu değil: sınıflandırıcı her içerik için
                kendi kararını verir. Bu seçim yalnızca feed varsayılanı sinyali. */}
            <p className="mt-space-2 text-xs text-muted">{dict.categoryHint}</p>
          </div>
        </div>

        <div>
          <label htmlFor="rss-url" className="field-label">
            {dict.url}
          </label>
          <input
            id="rss-url"
            type="url"
            required
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder={dict.urlPlaceholder}
            className="field"
          />
        </div>

        <div className="flex flex-wrap items-center gap-space-3">
          <button type="submit" disabled={adding} className="btn-primary">
            {adding ? (
              <LoaderIcon className="h-4 w-4 animate-spin" />
            ) : (
              <PlusIcon className="h-4 w-4" />
            )}
            {adding ? dict.adding : dict.add}
          </button>

          <span aria-live="polite" className="text-sm">
            {notice ? (
              <span className="inline-flex items-center gap-space-2 text-emerald-400">
                <CheckIcon className="h-4 w-4" />
                {notice}
              </span>
            ) : null}
            {error ? <span className="text-rose-400">{error}</span> : null}
          </span>
        </div>
      </form>

      <div className="mt-space-5 space-y-space-2">
        {sources.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-space-4 py-space-6 text-center text-sm text-muted">
            {dict.empty}
          </p>
        ) : null}

        {sources.map((source) => (
          <div
            key={source.id}
            className="flex flex-col gap-space-3 rounded-xl border border-border/70 bg-[#0e0f12]/60 p-space-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-space-2">
                <span className="truncate text-sm font-semibold text-zinc-200">
                  {source.name}
                </span>
                <span
                  className={`chip ${badgeClassesFor(source.category)}`}
                >
                  {isCategory(source.category)
                    ? (categoryLabels[source.category] ?? source.category)
                    : source.category}
                </span>
                <span
                  className={`text-[11px] font-semibold ${
                    source.isActive ? "text-emerald-400" : "text-muted"
                  }`}
                >
                  {source.isActive ? dict.active : dict.inactive}
                </span>
              </div>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-space-1 flex items-center gap-space-1 truncate text-xs text-muted transition hover:text-zinc-300"
              >
                <ExternalLinkIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{source.url}</span>
              </a>
            </div>

            <div className="flex shrink-0 items-center gap-space-2">
              <button
                type="button"
                role="switch"
                aria-checked={source.isActive}
                aria-label={dict.toggle}
                title={dict.toggle}
                disabled={pendingId === source.id}
                onClick={() => void toggleSource(source)}
                className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-50 ${
                  source.isActive ? "bg-accent" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`absolute top-space-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${
                    source.isActive ? "left-space-5" : "left-space-1"
                  }`}
                />
              </button>

              <button
                type="button"
                aria-label={dict.delete}
                title={dict.delete}
                disabled={pendingId === source.id}
                onClick={() => void deleteSource(source)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-50"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
