"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangleIcon,
  CheckIcon,
  LoaderIcon,
  MicIcon,
  ShieldCheckIcon,
  ShieldIcon,
  TrophyIcon,
} from "@/components/icons";
import { badgeClassesFor } from "@/lib/categories";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n-config";

/**
 * Denetim paneli — owner arayüzü.
 *
 * A) En İyi Haberler: saatlik gemma-audit denetiminin puanladığı haberler.
 *    Seçilenler (en az 2) POST /api/podcast ile custom moda gönderilir
 *    (Potkes'e Çevir) → Podcast Stüdyosu'na geçiş.
 * B) Kaldırılan Haberler: yumuşak kaldırma listesi + geri yükleme
 *    (POST /api/admin/moderation/restore).
 *
 * Desen VideoNewsManager/PodcastStudio ile aynı: alt-orta toast,
 * animate-pulse-soft iskelet, kart: border-border/70 bg-[#080808].
 */

type ModerationDict = Dictionary["admin"]["moderation"];

type SuggestionDto = {
  id: string;
  title: string;
  summary: string;
  category: string;
  qualityScore: number;
  createdAt: string;
};

type RemovedNewsDto = {
  id: string;
  title: string;
  removedAt: string;
  removalReason: string;
  removedBy: "gemma-audit" | "owner";
};

type AuditStatusDto = {
  running: boolean;
  lastResult: {
    audited: number;
    kept: number;
    removed: number;
    failed: number;
  } | null;
};

type Props = {
  lang: Locale;
  dict: ModerationDict;
  categoryLabels: Dictionary["categories"];
  /** Admin panelinde başka sekmeye geçiş (ör. podcast stüdyosu). */
  onNavigateTab?: (tab: "podcast") => void;
};

export function ModerationPanel({
  lang,
  dict,
  categoryLabels,
  onNavigateTab,
}: Props) {
  const [suggestions, setSuggestions] = useState<SuggestionDto[]>([]);
  const [removedItems, setRemovedItems] = useState<RemovedNewsDto[]>([]);
  const [audit, setAudit] = useState<AuditStatusDto | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [sending, setSending] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [podcastCreated, setPodcastCreated] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const locale = lang === "en" ? "en-US" : "tr-TR";

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);

    try {
      const [suggestionsRes, removedRes, auditRes] = await Promise.all([
        fetch("/api/admin/moderation/suggestions", { cache: "no-store" }),
        fetch("/api/admin/moderation/removed", { cache: "no-store" }),
        fetch("/api/cron/audit", { cache: "no-store" }),
      ]);

      if (!suggestionsRes.ok || !removedRes.ok || !auditRes.ok) {
        throw new Error("failed");
      }

      const suggestionsData = (await suggestionsRes.json()) as {
        items: SuggestionDto[];
      };
      const removedData = (await removedRes.json()) as {
        items: RemovedNewsDto[];
      };
      const auditData = (await auditRes.json()) as AuditStatusDto;

      setSuggestions(suggestionsData.items);
      setRemovedItems(removedData.items);
      setAudit(auditData);

      // Seçim, yalnızca hâlâ listede olan haberlerde korunur.
      const visibleIds = new Set(suggestionsData.items.map((item) => item.id));
      setSelectedIds((previous) => {
        const next = new Set<string>();
        for (const id of previous) {
          if (visibleIds.has(id)) next.add(id);
        }
        return next;
      });
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedCount = selectedIds.size;
  const allSelected =
    suggestions.length > 0 &&
    suggestions.every((item) => selectedIds.has(item.id));

  function toggleSelected(id: string) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds(
      allSelected
        ? new Set()
        : new Set(suggestions.map((item) => item.id)),
    );
  }

  // ── Potkes'e Çevir: seçilen haberlerden custom podcast bölümü ──

  async function handleToPodcast() {
    const newsIds = Array.from(selectedIds);
    if (newsIds.length < 2) return;

    setSending(true);

    try {
      const response = await fetch("/api/podcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "custom",
          newsIds,
          topic: "Seçkin haberler tartışması",
        }),
      });

      if (!response.ok) {
        showToast(dict.error);
        return;
      }

      setPodcastCreated(true);
      showToast(dict.podcastToast);
    } catch {
      showToast(dict.error);
    } finally {
      setSending(false);
    }
  }

  // ── Saatlik denetimi manuel tetikle ──

  async function handleRunAudit() {
    setAuditing(true);

    try {
      const response = await fetch("/api/cron/audit", { method: "POST" });
      if (!response.ok) {
        showToast(dict.error);
        return;
      }

      showToast(dict.auditStarted);
      void load();
    } catch {
      showToast(dict.error);
    } finally {
      setAuditing(false);
    }
  }

  // ── Kaldırılan haberi geri yükle ──

  async function handleRestore(item: RemovedNewsDto) {
    setPendingId(item.id);

    try {
      const response = await fetch("/api/admin/moderation/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newsItemId: item.id }),
      });

      // 404: zaten yayında — listeden düşürmek yine de doğru.
      if (!response.ok && response.status !== 404) {
        showToast(dict.error);
        return;
      }

      setRemovedItems((previous) =>
        previous.filter((entry) => entry.id !== item.id),
      );
      showToast(dict.restored);
    } catch {
      showToast(dict.error);
    } finally {
      setPendingId(null);
    }
  }

  const lastAuditText = audit?.lastResult
    ? dict.lastAuditSummary
        .replace("{audited}", String(audit.lastResult.audited))
        .replace("{kept}", String(audit.lastResult.kept))
        .replace("{removed}", String(audit.lastResult.removed))
    : "—";

  return (
    <section className="w-full">
      {/* ── A) En İyi Haberler ── */}
      <div className="rounded-2xl border border-border/70 bg-[#080808] p-space-5">
        <div className="flex flex-wrap items-start justify-between gap-space-3">
          <h2 className="text-lg font-bold text-zinc-50">{dict.bestNews}</h2>

          <div className="flex flex-wrap items-center gap-space-2">
            <button
              type="button"
              onClick={() => void handleRunAudit()}
              disabled={auditing || loading}
              className="btn-secondary px-space-3 py-space-2 text-xs"
            >
              {auditing ? (
                <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldCheckIcon className="h-3.5 w-3.5" />
              )}
              {dict.runAudit}
            </button>

            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="btn-secondary px-space-3 py-space-2 text-xs"
            >
              {loading ? (
                <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {dict.refresh}
            </button>
          </div>
        </div>

        {/* Son denetim durumu */}
        <p className="mt-space-2 flex flex-wrap items-center gap-space-2 text-xs text-muted">
          <span className="font-semibold text-zinc-400">{dict.lastAudit}:</span>
          <span>{lastAuditText}</span>
          {audit?.running ? (
            <span className="inline-flex items-center gap-space-1 text-blue-300">
              <LoaderIcon className="h-3 w-3 animate-spin" />
            </span>
          ) : null}
        </p>

        {/* Seçim çubuğu */}
        {!loading && !loadError && suggestions.length > 0 ? (
          <div className="mt-space-4 flex flex-wrap items-center justify-between gap-space-3">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="btn-secondary px-space-3 py-space-2 text-xs"
            >
              <CheckIcon className="h-3.5 w-3.5" />
              {dict.selectAll}
            </button>

            <div className="flex items-center gap-space-3">
              {selectedCount < 2 ? (
                <span className="text-xs text-muted">{dict.selectAtLeast}</span>
              ) : null}
              <button
                type="button"
                onClick={() => void handleToPodcast()}
                disabled={selectedCount < 2 || sending}
                className="btn-primary px-space-3 py-space-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? (
                  <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <MicIcon className="h-3.5 w-3.5" />
                )}
                {dict.toPodcast}
              </button>
            </div>
          </div>
        ) : null}

        {/* Podcast oluşturuldu → stüdyoya geçiş */}
        {podcastCreated ? (
          <div className="mt-space-3 flex flex-wrap items-center justify-between gap-space-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-space-4 py-space-3">
            <p className="text-xs font-medium text-emerald-300">
              {dict.podcastToast}
            </p>
            {onNavigateTab ? (
              <button
                type="button"
                onClick={() => onNavigateTab("podcast")}
                className="text-xs font-semibold text-blue-300 transition hover:text-blue-200"
              >
                {dict.goToPodcast} →
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Öneri listesi */}
        <div className="mt-space-4 space-y-space-3">
          {loading ? (
            // İskelet kartlar
            [0, 1, 2].map((index) => (
              <div
                key={index}
                className="animate-pulse-soft rounded-2xl border border-border/70 bg-[#080808] p-space-4"
              >
                <div className="flex gap-space-3">
                  <div className="h-4 w-4 shrink-0 rounded bg-[#16181c]" />
                  <div className="flex-1 space-y-space-2 py-space-1">
                    <div className="h-3 w-1/3 rounded-full bg-[#16181c]" />
                    <div className="h-3 w-3/4 rounded-full bg-[#16181c]" />
                    <div className="h-2.5 w-1/2 rounded-full bg-[#16181c]" />
                  </div>
                </div>
              </div>
            ))
          ) : loadError ? (
            <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-space-4 text-center">
              <p className="text-sm text-rose-300">{dict.error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="btn-secondary mt-space-3"
              >
                {dict.refresh}
              </button>
            </div>
          ) : suggestions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-space-4 py-space-7 text-center">
              <TrophyIcon className="mx-auto mb-space-2 h-6 w-6 text-zinc-600" />
              <p className="text-sm font-medium text-zinc-300">
                {dict.emptySuggestions}
              </p>
              <p className="mt-space-1 text-xs text-muted">
                {dict.emptySuggestionsHint}
              </p>
            </div>
          ) : (
            suggestions.map((item) => (
              <SuggestionRow
                key={item.id}
                item={item}
                locale={locale}
                dict={dict}
                categoryLabel={
                  (categoryLabels as Record<string, string>)[
                    item.category
                  ] ?? item.category
                }
                checked={selectedIds.has(item.id)}
                onToggle={() => toggleSelected(item.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── B) Kaldırılan Haberler ── */}
      <div className="mt-space-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted">
          {dict.removedNews}
        </h3>

        <div className="mt-space-3 space-y-space-3">
          {loading ? (
            [0, 1].map((index) => (
              <div
                key={index}
                className="animate-pulse-soft rounded-2xl border border-border/70 bg-[#080808] p-space-4"
              >
                <div className="space-y-space-2 py-space-1">
                  <div className="h-3 w-2/3 rounded-full bg-[#16181c]" />
                  <div className="h-2.5 w-1/2 rounded-full bg-[#16181c]" />
                </div>
              </div>
            ))
          ) : removedItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-space-4 py-space-7 text-center">
              <ShieldIcon className="mx-auto mb-space-2 h-6 w-6 text-zinc-600" />
              <p className="text-sm font-medium text-zinc-300">
                {dict.emptyRemoved}
              </p>
            </div>
          ) : (
            removedItems.map((item) => (
              <RemovedRow
                key={item.id}
                item={item}
                locale={locale}
                dict={dict}
                pending={pendingId === item.id}
                onRestore={() => void handleRestore(item)}
              />
            ))
          )}
        </div>
      </div>

      {/* Bildirim (toast) */}
      {toast ? (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[#22252a] bg-[#16181c] px-space-4 py-space-3 text-sm text-zinc-100 shadow-xl"
        >
          <span className="inline-flex items-center gap-space-2">
            <CheckIcon className="h-4 w-4 text-emerald-400" />
            {toast}
          </span>
        </div>
      ) : null}
    </section>
  );
}

// ─── Öneri satırı ─────────────────────────────────────────────────────────────

type SuggestionRowProps = {
  item: SuggestionDto;
  locale: string;
  dict: ModerationDict;
  categoryLabel: string;
  checked: boolean;
  onToggle: () => void;
};

function SuggestionRow({
  item,
  locale,
  dict,
  categoryLabel,
  checked,
  onToggle,
}: SuggestionRowProps) {
  return (
    <article
      className={`flex items-start gap-space-3 rounded-2xl border border-border/70 bg-[#080808] p-space-4 transition ${
        checked ? "border-emerald-500/30" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        aria-label={item.title}
        className="mt-space-1 h-4 w-4 shrink-0 cursor-pointer accent-emerald-500"
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-space-2">
          {/* Kalite puanı rozeti */}
          <span
            title={dict.qualityScore}
            className="inline-flex items-center rounded-full border border-emerald-500/25 bg-emerald-500/10 px-space-2 py-space-1 text-[11px] font-bold text-emerald-400"
          >
            {item.qualityScore}
            {dict.points}
          </span>

          <span className={`chip ${badgeClassesFor(item.category)}`}>
            {categoryLabel}
          </span>
        </div>

        <p className="mt-space-2 text-sm font-semibold leading-snug text-zinc-100">
          {item.title}
        </p>

        {item.summary ? (
          <p className="mt-space-1 line-clamp-2 text-sm leading-relaxed text-zinc-300">
            {item.summary}
          </p>
        ) : null}

        <p className="mt-space-1 text-[11px] text-muted">
          {new Date(item.createdAt).toLocaleDateString(locale)}
        </p>
      </div>
    </article>
  );
}

// ─── Kaldırılan haber satırı ───────────────────────────────────────────────────

type RemovedRowProps = {
  item: RemovedNewsDto;
  locale: string;
  dict: ModerationDict;
  pending: boolean;
  onRestore: () => void;
};

function removedByChipClasses(removedBy: RemovedNewsDto["removedBy"]): string {
  return removedBy === "owner"
    ? "border-blue-500/25 bg-blue-500/10 text-blue-300"
    : "border-violet-500/25 bg-violet-500/10 text-violet-300";
}

function RemovedRow({ item, locale, dict, pending, onRestore }: RemovedRowProps) {
  const isOwner = item.removedBy === "owner";

  return (
    <article className="flex items-start gap-space-3 rounded-2xl border border-border/70 bg-[#080808] p-space-4">
      <span
        aria-hidden="true"
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-[#0e0f12] ${
          isOwner ? "text-blue-300" : "text-violet-300"
        }`}
      >
        {isOwner ? (
          <ShieldIcon className="h-5 w-5" />
        ) : (
          <AlertTriangleIcon className="h-5 w-5" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-space-2">
          {/* Kim kaldırdı çipi */}
          <span
            className={`inline-flex items-center gap-space-1 rounded-full border px-space-2 py-space-1 text-[11px] font-semibold ${removedByChipClasses(item.removedBy)}`}
          >
            {isOwner ? dict.removedByOwner : dict.removedByGemma}
          </span>
          <span className="text-[11px] text-muted">
            {new Date(item.removedAt).toLocaleDateString(locale)}
          </span>
        </div>

        <p className="mt-space-2 text-sm font-semibold leading-snug text-zinc-100">
          {item.title}
        </p>

        {item.removalReason ? (
          <p className="mt-space-1 break-words text-xs leading-relaxed text-zinc-400">
            {item.removalReason}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onRestore}
        disabled={pending}
        className="btn-secondary shrink-0 px-space-3 py-space-2 text-xs"
      >
        {pending ? (
          <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
        ) : null}
        {dict.restore}
      </button>
    </article>
  );
}
