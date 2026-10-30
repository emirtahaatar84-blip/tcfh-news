"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BookmarkFilledIcon,
  DownloadIcon,
  SearchIcon,
  TrashIcon,
  UploadIcon,
} from "@/components/icons";
import { formatDateTime } from "@/lib/datetime";
import {
  STORAGE_EVENT,
  clearBookmarks,
  getBookmarks,
  getPreferences,
  importBookmarks,
  isStorageAvailable,
  removeBookmark,
  setPreferences,
  type Bookmark,
} from "@/lib/local-store";
import type { Locale } from "@/lib/i18n-config";

type Labels = {
  title: string;
  subtitle: string;
  empty: string;
  emptyHint: string;
  search: string;
  sortDate: string;
  sortCategory: string;
  newest: string;
  oldest: string;
  selectAll: string;
  deleteSelected: string;
  clearAll: string;
  confirmTitle: string;
  confirmBody: string;
  confirmYes: string;
  confirmNo: string;
  exportJson: string;
  exportCsv: string;
  importJson: string;
  imported: string;
  importFailed: string;
  removed: string;
  deviceOnly: string;
  unavailable: string;
  readMarks: string;
  readMarksHint: string;
};

type Props = {
  lang: Locale;
  labels: Labels;
};

const EXPORT_VERSION = 1;

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function toCsv(items: Bookmark[]): string {
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const header = ["id", "title", "url", "category", "savedAt"].join(",");
  const rows = items.map((item) =>
    [item.id, item.title, item.url, item.category, item.savedAt]
      .map(escape)
      .join(","),
  );

  // BOM: Excel'in Türkçe karakterleri doğru okuması için.
  return `\ufeff${[header, ...rows].join("\r\n")}`;
}

/**
 * Cihaz içi kütüphane: arama, sıralama, tekil/toplu silme, tümünü temizleme
 * ve JSON/CSV dışa aktarma + JSON içe aktarma. Tüm işlemler tarayıcıda
 * gerçekleşir; hiçbir veri sunucuya gitmez.
 */
export function LibraryView({ lang, labels }: Props) {
  const [items, setItems] = useState<Bookmark[]>([]);
  const [ready, setReady] = useState(false);
  const [term, setTerm] = useState("");
  const [sort, setSort] = useState<"date" | "category">("date");
  const [ascending, setAscending] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [readMarks, setReadMarks] = useState(true);
  const [storageOk, setStorageOk] = useState(true);

  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(() => {
    setItems(getBookmarks());
    setReadMarks(getPreferences().readMarks);
  }, []);

  useEffect(() => {
    setStorageOk(isStorageAvailable());
    refresh();

    const sync = () => refresh();
    window.addEventListener(STORAGE_EVENT, sync);
    window.addEventListener("storage", sync);

    return () => {
      window.removeEventListener(STORAGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [refresh]);

  useEffect(() => {
    setReady(true);
  }, []);

  const visible = useMemo(() => {
    const needle = term.trim().toLocaleLowerCase("tr");

    const filtered = needle
      ? items.filter(
          (item) =>
            item.title.toLocaleLowerCase("tr").includes(needle) ||
            item.category.toLocaleLowerCase("tr").includes(needle),
        )
      : [...items];

    filtered.sort((a, b) => {
      if (sort === "category") {
        const compare = a.category.localeCompare(b.category, "tr");
        return ascending ? compare : -compare;
      }

      const compare = a.savedAt.localeCompare(b.savedAt);
      return ascending ? compare : -compare;
    });

    return filtered;
  }, [ascending, items, sort, term]);

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function removeOne(id: string) {
    removeBookmark(id);
    setSelected((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    refresh();
    setNotice(labels.removed);
    window.setTimeout(() => setNotice(null), 2500);
  }

  function removeSelected() {
    for (const id of selected) removeBookmark(id);
    const count = selected.size;
    setSelected(new Set());
    refresh();
    setNotice(`${count} ${labels.removed}`);
    window.setTimeout(() => setNotice(null), 2500);
  }

  function exportJson() {
    download(
      "yer-imleri.json",
      JSON.stringify(
        { storageVersion: EXPORT_VERSION, exportedAt: new Date().toISOString(), items },
        null,
        2,
      ),
      "application/json",
    );
  }

  function exportCsv() {
    download("yer-imleri.csv", toCsv(items), "text/csv;charset=utf-8");
  }

  async function onImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);

      const incoming = Array.isArray(parsed)
        ? parsed
        : (parsed as { items?: unknown }).items;

      if (!Array.isArray(incoming)) throw new Error("invalid");

      const result = importBookmarks(incoming as Bookmark[]);
      refresh();
      setNotice(
        labels.imported
          .replace("{added}", String(result.added))
          .replace("{skipped}", String(result.skipped)),
      );
      window.setTimeout(() => setNotice(null), 3500);
    } catch {
      setNotice(labels.importFailed);
      window.setTimeout(() => setNotice(null), 3500);
    }
  }

  return (
    <div className="px-space-3 pb-space-7 pt-space-4 sm:px-space-5">
      <div className="flex flex-wrap items-start justify-between gap-space-3">
        <div>
          <h1 className="t-h1 flex items-center gap-space-2 text-zinc-100">
            <BookmarkFilledIcon className="h-5 w-5 text-blue-500" />
            {labels.title}
          </h1>
          <p className="mt-space-1 text-xs leading-relaxed text-zinc-500">
            {labels.subtitle}
          </p>
        </div>

        <span className="rounded-full border border-[#22252a] bg-[#16181c] px-space-3 py-space-1 text-[10px] font-semibold text-zinc-500">
          {labels.deviceOnly}
        </span>
      </div>

      {!storageOk ? (
        <p
          role="status"
          className="mt-space-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-space-3 py-space-2 text-xs text-amber-300"
        >
          {labels.unavailable}
        </p>
      ) : null}

      {notice ? (
        <p
          role="status"
          className="mt-space-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-space-3 py-space-2 text-xs text-emerald-300"
        >
          {notice}
        </p>
      ) : null}

      {/* Araç çubuğu */}
      <div className="mt-space-4 space-y-space-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-space-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={labels.search}
            aria-label={labels.search}
            className="field pl-space-7"
          />
        </div>

        <div className="flex flex-wrap items-center gap-space-2">
          <button
            type="button"
            onClick={() => setSort("date")}
            aria-pressed={sort === "date"}
            className={`rounded-full border px-space-3 py-space-2 text-[11px] font-semibold transition ${
              sort === "date"
                ? "border-blue-500/50 bg-blue-500/15 text-blue-400"
                : "border-[#22252a] bg-[#16181c] text-zinc-400 hover:text-zinc-100"
            }`}
          >
            {labels.sortDate}
          </button>
          <button
            type="button"
            onClick={() => setSort("category")}
            aria-pressed={sort === "category"}
            className={`rounded-full border px-space-3 py-space-2 text-[11px] font-semibold transition ${
              sort === "category"
                ? "border-blue-500/50 bg-blue-500/15 text-blue-400"
                : "border-[#22252a] bg-[#16181c] text-zinc-400 hover:text-zinc-100"
            }`}
          >
            {labels.sortCategory}
          </button>
          <button
            type="button"
            onClick={() => setAscending((value) => !value)}
            aria-pressed={ascending}
            className="rounded-full border border-[#22252a] bg-[#16181c] px-space-3 py-space-2 text-[11px] font-semibold text-zinc-400 transition hover:text-zinc-100"
          >
            {ascending ? labels.oldest : labels.newest}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-space-2 border-t border-[#22252a] pt-space-2">
          <button
            type="button"
            onClick={exportJson}
            disabled={items.length === 0}
            className="inline-flex items-center gap-space-2 rounded-full border border-[#22252a] px-space-3 py-space-2 text-[11px] font-semibold text-zinc-400 transition hover:text-zinc-100 disabled:opacity-40"
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            {labels.exportJson}
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={items.length === 0}
            className="inline-flex items-center gap-space-2 rounded-full border border-[#22252a] px-space-3 py-space-2 text-[11px] font-semibold text-zinc-400 transition hover:text-zinc-100 disabled:opacity-40"
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            {labels.exportCsv}
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-space-2 rounded-full border border-[#22252a] px-space-3 py-space-2 text-[11px] font-semibold text-zinc-400 transition hover:text-zinc-100"
          >
            <UploadIcon className="h-3.5 w-3.5" />
            {labels.importJson}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={onImport}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          />
        </div>

        {items.length > 0 ? (
          <div className="flex flex-wrap items-center gap-space-2">
            <button
              type="button"
              onClick={() =>
                setSelected(
                  selected.size === items.length
                    ? new Set()
                    : new Set(items.map((item) => item.id)),
                )
              }
              className="rounded-full border border-[#22252a] px-space-3 py-space-2 text-[11px] font-semibold text-zinc-400 transition hover:text-zinc-100"
            >
              {labels.selectAll}
            </button>
            {selected.size > 0 ? (
              <button
                type="button"
                onClick={removeSelected}
                className="rounded-full border border-rose-500/30 bg-rose-500/10 px-space-3 py-space-2 text-[11px] font-semibold text-rose-400 transition hover:bg-rose-500/20"
              >
                {labels.deleteSelected} ({selected.size})
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="ml-auto rounded-full border border-[#22252a] px-space-3 py-space-2 text-[11px] font-semibold text-zinc-500 transition hover:text-rose-400"
            >
              {labels.clearAll}
            </button>
          </div>
        ) : null}

        {/* Okundu işaretleri tercihi */}
        <label className="flex cursor-pointer items-start gap-space-3 rounded-xl border border-[#22252a] bg-[#16181c] px-space-3 py-space-3">
          <input
            type="checkbox"
            checked={readMarks}
            onChange={(event) => {
              setPreferences({ readMarks: event.target.checked });
              setReadMarks(event.target.checked);
            }}
            className="mt-space-1 h-4 w-4 accent-blue-600"
          />
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-zinc-200">
              {labels.readMarks}
            </span>
            <span className="block text-[10px] leading-snug text-zinc-500">
              {labels.readMarksHint}
            </span>
          </span>
        </label>
      </div>

      {/* Liste */}
      {ready && items.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-space-5 py-space-9 text-center">
          <BookmarkFilledIcon className="mb-space-3 h-6 w-6 text-zinc-600" />
          <h2 className="text-base font-medium text-zinc-300">{labels.empty}</h2>
          <p className="mt-space-2 max-w-sm text-sm leading-relaxed text-zinc-500">
            {labels.emptyHint}
          </p>
          <Link href={`/${lang}`} className="btn-secondary mt-space-5">
            {labels.title}
          </Link>
        </div>
      ) : (
        <ul className="mt-space-4 space-y-space-2">
          {visible.map((item) => {
            const checked = selected.has(item.id);

            return (
              <li
                key={item.id}
                className={`flex items-start gap-space-3 rounded-2xl border bg-[#16181c] p-space-3 transition ${
                  checked ? "border-blue-500/40" : "border-[#22252a]"
                }`}
              >
                <label className="mt-space-1 flex h-6 w-6 shrink-0 items-center justify-center">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSelected(item.id)}
                    aria-label={item.title || item.id}
                    className="h-4 w-4 accent-blue-600"
                  />
                </label>

                <div className="min-w-0 flex-1">
                  <Link
                    href={item.url}
                    className="line-clamp-2 block text-sm font-semibold leading-snug text-zinc-200 transition hover:text-zinc-50"
                  >
                    {item.title || item.id}
                  </Link>
                  <p className="mt-space-1 flex flex-wrap items-center gap-x-space-2 gap-y-space-1 text-[11px] text-zinc-500">
                    {item.category ? <span>{item.category}</span> : null}
                    <span aria-hidden="true">·</span>
                    <time dateTime={item.savedAt}>
                      {formatDateTime(item.savedAt, lang)}
                    </time>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => removeOne(item.id)}
                  aria-label={`${item.title || item.id} — ${labels.removed}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/10 hover:text-rose-400"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {confirmOpen ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="clear-title"
          className="fixed inset-0 z-[70] flex items-center justify-center px-space-4"
        >
          <button
            type="button"
            aria-label={labels.confirmNo}
            onClick={() => setConfirmOpen(false)}
            className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
            tabIndex={-1}
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-[#22252a] bg-[#16181c] p-space-5 shadow-2xl">
            <h2
              id="clear-title"
              className="text-base font-bold text-zinc-100"
            >
              {labels.confirmTitle}
            </h2>
            <p className="mt-space-2 text-sm leading-relaxed text-zinc-400">
              {labels.confirmBody}
            </p>
            <div className="mt-space-5 flex gap-space-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="btn-secondary flex-1"
              >
                {labels.confirmNo}
              </button>
              <button
                type="button"
                onClick={() => {
                  clearBookmarks();
                  setSelected(new Set());
                  setConfirmOpen(false);
                  refresh();
                }}
                className="inline-flex flex-1 items-center justify-center gap-space-2 rounded-full bg-rose-600 px-space-4 py-space-2 text-sm font-bold text-white transition hover:bg-rose-500"
              >
                <TrashIcon className="h-4 w-4" />
                {labels.confirmYes}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
