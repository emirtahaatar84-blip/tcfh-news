"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BookmarkIcon,
  CheckIcon,
  ExternalLinkIcon,
  LoaderIcon,
  ShareIcon,
  SparklesIcon,
} from "@/components/icons";
import { CATEGORIES } from "@/lib/categories";
import type { Locale } from "@/lib/i18n-config";
import type { Dictionary } from "@/lib/i18n";

/**
 * X Stüdyo — yayınlanmış haberlerden X (Twitter) postu üretir.
 * Kullanıcı postu KOPYALAYIP manuel paylaşır; otomatik API gönderimi YOKTUR.
 *
 * Bileşen ağacı:
 *   XStudio
 *   ├─ ArticleList        (sol sütun: filtre + haber listesi, J/K gezinme)
 *   ├─ SettingsPanel      (orta sütun: stil/ton/uzunluk/emoji/link/rozet)
 *   ├─ VariantsPanel      (sağ sütun: 3 varyant kartı, 1/2/3 seçim)
 *   │   └─ VariantCard    (metin + karakter sayacı + hashtag çipleri)
 *   └─ DraftPool          (havuz: kayıtlı taslaklar + durumları)
 */

type StyleDto = {
  id: string;
  slug: string;
  name: string;
  emojiLevel: number;
  maxEmoji: number;
};

type ArticleDto = {
  id: string;
  title: string;
  summary: string;
  category: string;
  sourcesCount: number;
  createdAt: string;
  hasDraft: boolean;
};

type Variant = {
  text: string;
  charCount: number;
  hashtags: string[];
};

type GenerateJob = {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  results: Array<{ articleId: string; title: string; variants: Variant[] }>;
  error: string | null;
};

type DraftDto = {
  id: string;
  articleId: string;
  articleTitle: string;
  styleName: string;
  text: string;
  hashtags: string[];
  charCount: number;
  status: string;
  externalUrl: string | null;
  createdAt: string;
};

type Props = {
  lang: Locale;
  styles: StyleDto[];
  dict: Dictionary["xstudio"];
};

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 120_000;

export function XStudio({ lang, styles, dict }: Props) {
  // ── Haber listesi durumu ──
  const [articles, setArticles] = useState<ArticleDto[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [articlesError, setArticlesError] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState("");
  const [cursor, setCursor] = useState(0); // J/K ile gezinme imleci

  // ── Ayarlar ──
  const [styleSlug, setStyleSlug] = useState(styles[0]?.slug ?? "flas");
  const [tone, setTone] = useState<"tarafsiz" | "sicak" | "ciddi">("tarafsiz");
  const [length, setLength] = useState<"kisa" | "orta" | "uzun">("orta");
  const [emojiLevel, setEmojiLevel] = useState(2);
  const [withSource, setWithSource] = useState(true);
  const [withBadge, setWithBadge] = useState(true);

  // ── Üretim durumu ──
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selected, setSelected] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // ── Havuz ──
  const [drafts, setDrafts] = useState<DraftDto[]>([]);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const toastTimer = useRef<number | null>(null);

  const selectedArticle = useMemo(
    () => articles[cursor] ?? null,
    [articles, cursor],
  );

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2500);
  }

  const loadArticles = useCallback(async () => {
    setLoadingArticles(true);
    setArticlesError(false);

    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (category) params.set("category", category);
      if (date) params.set("date", date);

      const response = await fetch(`/api/x-studio/articles?${params}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("failed");

      const data = (await response.json()) as { articles: ArticleDto[] };
      setArticles(data.articles);
      setCursor(0);
    } catch {
      setArticlesError(true);
    } finally {
      setLoadingArticles(false);
    }
  }, [category, date, query]);

  const loadDrafts = useCallback(async () => {
    try {
      const response = await fetch("/api/x-studio/drafts", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { drafts: DraftDto[] };
      setDrafts(data.drafts);
    } catch {
      // havuz yüklemesi best-effort
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void loadArticles(), 250);
    return () => clearTimeout(timer);
  }, [loadArticles]);

  useEffect(() => {
    void loadDrafts();
  }, [loadDrafts]);

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // ── Üretim + polling ──
  const generate = useCallback(async () => {
    if (!selectedArticle || generating) return;

    setGenerating(true);
    setGenerateError(null);
    setVariants([]);
    setSelected(0);

    try {
      const response = await fetch("/api/x-studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleIds: [selectedArticle.id],
          styleSlug,
          tone,
          length,
          emojiLevel,
          withSource,
          withBadge,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(data.message ?? dict.error);
      }

      const { jobId } = (await response.json()) as { jobId: string };
      const startedAt = Date.now();

      await new Promise<void>((resolve, reject) => {
        pollTimer.current = setInterval(async () => {
          try {
            const poll = await fetch(`/api/x-studio/generate/${jobId}`, {
              cache: "no-store",
            });
            if (!poll.ok) throw new Error("poll failed");

            const data = (await poll.json()) as GenerateJob;

            if (data.status === "done") {
              if (pollTimer.current) clearInterval(pollTimer.current);
              setVariants(data.results[0]?.variants ?? []);
              resolve();
            } else if (data.status === "failed") {
              if (pollTimer.current) clearInterval(pollTimer.current);
              throw new Error(data.error ?? dict.error);
            } else if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
              if (pollTimer.current) clearInterval(pollTimer.current);
              throw new Error(dict.error);
            }
          } catch (error) {
            if (pollTimer.current) clearInterval(pollTimer.current);
            reject(error);
          }
        }, POLL_INTERVAL_MS);
      });
    } catch (error) {
      setGenerateError(
        error instanceof Error ? error.message : dict.error,
      );
    } finally {
      setGenerating(false);
    }
  }, [
    dict.error,
    emojiLevel,
    generating,
    length,
    selectedArticle,
    styleSlug,
    tone,
    withBadge,
    withSource,
  ]);

  // ── Kopyala: panoya düz metin ──
  const copyVariant = useCallback(
    async (variant: Variant) => {
      try {
        await navigator.clipboard.writeText(variant.text);
        showToast(dict.copied);
      } catch {
        showToast(dict.error);
      }
    },
    [dict.copied, dict.error],
  );

  // ── Havuza at (mükerrer uyarısı ile) ──
  const poolVariant = useCallback(
    async (variant: Variant) => {
      if (!selectedArticle) return;

      const style = styles.find((item) => item.slug === styleSlug);
      if (!style) return;

      try {
        const response = await fetch("/api/x-studio/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            articleId: selectedArticle.id,
            styleId: style.id,
            text: variant.text,
            hashtags: variant.hashtags,
          }),
        });

        if (!response.ok) throw new Error("failed");

        const data = (await response.json()) as { duplicateWarning: boolean };
        setDuplicateWarning(data.duplicateWarning);
        showToast(dict.pooled);
        void loadDrafts();
        setArticles((previous) =>
          previous.map((item) =>
            item.id === selectedArticle.id ? { ...item, hasDraft: true } : item,
          ),
        );
      } catch {
        showToast(dict.error);
      }
    },
    [dict.error, dict.pooled, loadDrafts, selectedArticle, styleSlug, styles],
  );

  // ── Hashtag ekle/çıkar (metinden ekler/çıkarır) ──
  function toggleHashtag(index: number, tag: string) {
    setVariants((previous) =>
      previous.map((variant, i) => {
        if (i !== index) return variant;

        if (variant.hashtags.includes(tag)) {
          // Çıkar: metinden etiketi ve olası başındaki boşluğu temizle.
          const text = variant.text
            .replace(new RegExp(`\\s*${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`, "g"), "")
            .trimEnd();
          return {
            ...variant,
            text,
            charCount: text.length,
            hashtags: variant.hashtags.filter((item) => item !== tag),
          };
        }

        if (variant.hashtags.length >= 3) return variant;

        const text = `${variant.text} ${tag}`;
        return {
          ...variant,
          text,
          charCount: text.length,
          hashtags: [...variant.hashtags, tag],
        };
      }),
    );
  }

  // ── Havuzdaki taslağı kopyala (status=copied) ──
  async function copyDraft(draft: DraftDto) {
    try {
      await navigator.clipboard.writeText(draft.text);
      showToast(dict.copied);

      await fetch(`/api/x-studio/drafts/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "copied" }),
      });
      void loadDrafts();
    } catch {
      showToast(dict.error);
    }
  }

  // ── Klavye kısayolları ──
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const key = event.key.toLowerCase();

      if (key === "g") {
        event.preventDefault();
        void generate();
      } else if (key === "j") {
        event.preventDefault();
        setCursor((value) => Math.min(value + 1, articles.length - 1));
      } else if (key === "k") {
        event.preventDefault();
        setCursor((value) => Math.max(value - 1, 0));
      } else if (["1", "2", "3"].includes(key)) {
        const index = Number(key) - 1;
        if (variants[index]) {
          event.preventDefault();
          setSelected(index);
        }
      } else if (key === "c") {
        if (variants[selected]) {
          event.preventDefault();
          void copyVariant(variants[selected]);
        }
      } else if (key === "p") {
        if (variants[selected]) {
          event.preventDefault();
          void poolVariant(variants[selected]);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [articles.length, copyVariant, generate, poolVariant, selected, variants]);

  const activeStyle = styles.find((item) => item.slug === styleSlug);

  return (
    <div className="w-full px-space-4 py-space-6 sm:px-space-6">
      {/* Başlık */}
      <Link
        href={`/${lang}/admin`}
        className="inline-flex items-center gap-space-2 text-xs font-semibold text-muted transition hover:text-zinc-200"
      >
        ← {dict.backToAdmin}
      </Link>

      <div className="mt-space-3 flex flex-wrap items-start justify-between gap-space-3">
        <div>
          <h1 className="t-h1 flex items-center gap-space-2 text-zinc-50">
            <ShareIcon className="h-6 w-6 text-blue-400" />
            {dict.title}
          </h1>
          <p className="mt-space-1 max-w-xl text-sm leading-relaxed text-muted">
            {dict.subtitle}
          </p>
        </div>

        {/* Kısayol ipuçları */}
        <div className="hidden gap-space-2 text-[11px] text-muted sm:flex">
          {[
            dict.shortcutGenerate,
            dict.shortcutSelect,
            dict.shortcutCopy,
            dict.shortcutPool,
          ].map((hint) => (
            <span
              key={hint}
              className="rounded-full border border-border/70 bg-[#080808] px-space-3 py-space-1"
            >
              {hint}
            </span>
          ))}
        </div>
      </div>

      {/* Mükerrer uyarısı */}
      {duplicateWarning && selectedArticle ? (
        <div className="mt-space-4 flex items-start gap-space-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-space-4 py-space-3 text-sm text-amber-300">
          ⚠️ {dict.duplicateWarning}
        </div>
      ) : null}

      {/* ── Haber seçimi ── */}
      <section className="mt-space-5">
          <h2 className="mb-space-3 text-sm font-bold text-zinc-100">
            {dict.articles}
          </h2>

          <div className="flex flex-wrap items-center gap-space-2">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={dict.searchPlaceholder}
              className="field min-w-[220px] flex-1 py-space-2 text-sm"
            />

            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="field w-40 cursor-pointer py-space-2 text-sm [&>option]:bg-[#0e0f12]"
            >
              <option value="">{dict.allCategories}</option>
              {CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="field w-40 py-space-2 text-sm"
            />
          </div>

          <div className="mt-space-3 grid gap-space-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {loadingArticles ? (
              // İskelet kartlar
              [0, 1, 2, 3].map((index) => (
                <div
                  key={index}
                  className="animate-pulse-soft rounded-xl border border-border/70 bg-[#080808] p-space-3"
                >
                  <div className="h-3 w-3/4 rounded-full bg-[#16181c]" />
                  <div className="mt-space-2 h-2.5 w-1/2 rounded-full bg-[#16181c]" />
                </div>
              ))
            ) : articlesError ? (
              <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-space-4 text-center">
                <p className="text-sm text-rose-300">{dict.error}</p>
                <button
                  type="button"
                  onClick={() => void loadArticles()}
                  className="btn-secondary mt-space-3"
                >
                  {dict.retry}
                </button>
              </div>
            ) : articles.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-space-4 py-space-7 text-center">
                <p className="text-sm font-medium text-zinc-300">
                  {dict.empty}
                </p>
                <p className="mt-space-1 text-xs text-muted">{dict.emptyHint}</p>
              </div>
            ) : (
              articles.map((article, index) => {
                const isSelected = index === cursor;

                return (
                  <button
                    key={article.id}
                    type="button"
                    onClick={() => setCursor(index)}
                    className={`w-full rounded-xl border p-space-3 text-left transition ${
                      isSelected
                        ? "border-blue-500/50 bg-blue-500/10"
                        : "border-border/70 bg-[#080808] hover:border-[#31363e]"
                    }`}
                  >
                    <p className="line-clamp-2 text-sm font-semibold text-zinc-100">
                      {article.title}
                    </p>
                    <p className="mt-space-2 flex flex-wrap items-center gap-x-space-2 gap-y-space-1 text-[11px] text-muted">
                      <span>{article.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>✓ {article.sourcesCount}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {new Date(article.createdAt).toLocaleDateString("tr-TR")}
                      </span>
                      {article.hasDraft ? (
                        <span className="rounded-full bg-amber-500/15 px-space-2 py-space-1 font-semibold text-amber-400">
                          {dict.pool}
                        </span>
                      ) : null}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </section>

      {/* ── Üretim ayarları ── */}
      <section className="mt-space-6">
          <h2 className="mb-space-3 text-sm font-bold text-zinc-100">
            {dict.settings}
          </h2>

          <div className="flex flex-wrap items-end gap-x-space-5 gap-y-space-4 rounded-2xl border border-border/70 bg-[#080808] p-space-5">
            <div className="w-full sm:w-56">
              <label className="field-label" htmlFor="x-style">
                {dict.style}
              </label>
              <select
                id="x-style"
                value={styleSlug}
                onChange={(event) => setStyleSlug(event.target.value)}
                className="field cursor-pointer text-sm [&>option]:bg-[#0e0f12]"
              >
                {styles.map((style) => (
                  <option key={style.slug} value={style.slug}>
                    {style.name}
                  </option>
                ))}
              </select>
              {activeStyle ? (
                <p className="mt-space-2 text-xs text-muted">
                  {dict.emojiMax.replace(
                    "{count}",
                    String(activeStyle.maxEmoji),
                  )}
                </p>
              ) : null}
            </div>

            <div className="shrink-0">
              <span className="field-label">{dict.tone}</span>
              <div className="grid grid-cols-3 gap-space-2">
                {(
                  ["tarafsiz", "sicak", "ciddi"] as const
                ).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setTone(item)}
                    aria-pressed={tone === item}
                    className={`rounded-lg px-space-2 py-space-2 text-xs font-semibold transition ${
                      tone === item
                        ? "bg-blue-600 text-white"
                        : "border border-border bg-[#0e0f12] text-muted hover:text-zinc-200"
                    }`}
                  >
                    {dict.tones[item]}
                  </button>
                ))}
              </div>
            </div>

            <div className="shrink-0">
              <span className="field-label">{dict.length}</span>
              <div className="grid grid-cols-3 gap-space-2">
                {(["kisa", "orta", "uzun"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setLength(item)}
                    aria-pressed={length === item}
                    className={`rounded-lg px-space-2 py-space-2 text-xs font-semibold transition ${
                      length === item
                        ? "bg-blue-600 text-white"
                        : "border border-border bg-[#0e0f12] text-muted hover:text-zinc-200"
                    }`}
                  >
                    {dict.lengths[item]}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-full sm:w-44">
              <label className="field-label" htmlFor="x-emoji">
                {dict.emojiLevel}: <strong>{emojiLevel}</strong>/5
              </label>
              <input
                id="x-emoji"
                type="range"
                min={0}
                max={5}
                value={emojiLevel}
                onChange={(event) => setEmojiLevel(Number(event.target.value))}
                className="w-full accent-blue-500"
              />
            </div>

            <label className="flex cursor-pointer items-center justify-between gap-space-3 text-sm text-zinc-300">
              {dict.withSource}
              <input
                type="checkbox"
                checked={withSource}
                onChange={(event) => setWithSource(event.target.checked)}
                className="h-4 w-4 accent-blue-500"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between gap-space-3 text-sm text-zinc-300">
              {dict.withBadge}
              <input
                type="checkbox"
                checked={withBadge}
                onChange={(event) => setWithBadge(event.target.checked)}
                className="h-4 w-4 accent-blue-500"
              />
            </label>

            <button
              type="button"
              onClick={() => void generate()}
              disabled={!selectedArticle || generating}
              className="btn-primary ml-auto min-w-[180px]"
            >
              {generating ? (
                <LoaderIcon className="h-4 w-4 animate-spin" />
              ) : (
                <SparklesIcon className="h-4 w-4" />
              )}
              {generating ? dict.generating : dict.generate}
            </button>
          </div>
        </section>

        {/* ── Varyantlar ── */}
      <section className="mt-space-6">
        <h2 className="mb-space-3 text-sm font-bold text-zinc-100">
          {dict.variants}
        </h2>

        <div className="grid gap-space-4 lg:grid-cols-3">
          {generating ? (
              // Üretim iskeleti
              [0, 1, 2].map((index) => (
                <div
                  key={index}
                  className="animate-pulse-soft rounded-xl border border-border/70 bg-[#080808] p-space-4"
                >
                  <div className="h-3 w-full rounded-full bg-[#16181c]" />
                  <div className="mt-space-2 h-3 w-5/6 rounded-full bg-[#16181c]" />
                  <div className="mt-space-2 h-3 w-2/3 rounded-full bg-[#16181c]" />
                </div>
              ))
            ) : generateError ? (
              <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-space-4 text-center">
                <p className="break-words text-sm text-rose-300">
                  {generateError}
                </p>
                <button
                  type="button"
                  onClick={() => void generate()}
                  className="btn-secondary mt-space-3"
                >
                  {dict.retry}
                </button>
              </div>
            ) : variants.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-space-4 py-space-7 text-center">
                <p className="text-sm text-zinc-300">
                  {selectedArticle
                    ? dict.variantsEmpty
                    : dict.selectArticleFirst}
                </p>
              </div>
            ) : (
              variants.map((variant, index) => {
                const isSelected = index === selected;
                const overLimit = variant.charCount > 280;

                return (
                  <article
                    key={index}
                    onClick={() => setSelected(index)}
                    className={`cursor-pointer rounded-xl border p-space-4 transition ${
                      isSelected
                        ? "border-blue-500/50 bg-blue-500/[0.06]"
                        : "border-border/70 bg-[#080808] hover:border-[#31363e]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-space-2">
                      <span
                        className={`rounded-full px-space-2 py-space-1 text-[11px] font-bold ${
                          overLimit
                            ? "bg-rose-500/15 text-rose-400"
                            : "bg-white/[0.06] text-muted"
                        }`}
                      >
                        {index + 1} · {dict.charCount.replace(
                          "{count}",
                          String(variant.charCount),
                        )}
                        {overLimit ? ` — ${dict.overLimit}` : ""}
                      </span>
                    </div>

                    <p className="mt-space-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-200">
                      {variant.text}
                    </p>

                    {/* Hashtag çipleri: tıkla → ekle/çıkar */}
                    {variant.hashtags.length > 0 ? (
                      <div className="mt-space-3 flex flex-wrap gap-space-2">
                        {variant.hashtags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleHashtag(index, tag);
                            }}
                            className="rounded-full border border-blue-500/30 bg-blue-500/10 px-space-2 py-space-1 text-[11px] font-semibold text-blue-300 transition hover:bg-blue-500/20"
                          >
                            {tag} ✕
                          </button>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-space-3 flex flex-wrap items-center gap-space-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void copyVariant(variant);
                        }}
                        className="btn-secondary px-space-3 py-space-2 text-xs"
                      >
                        <ShareIcon className="h-3.5 w-3.5" />
                        {dict.copy}
                      </button>

                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void poolVariant(variant);
                        }}
                        className="btn-secondary px-space-3 py-space-2 text-xs"
                      >
                        <BookmarkIcon className="h-3.5 w-3.5" />
                        {dict.poolAdd}
                      </button>

                      {selectedArticle ? (
                        <Link
                          href={`/${lang}/news/${selectedArticle.id}`}
                          target="_blank"
                          onClick={(event) => event.stopPropagation()}
                          className="inline-flex items-center gap-space-2 px-space-1 py-space-2 text-xs text-muted transition hover:text-zinc-200"
                        >
                          <ExternalLinkIcon className="h-3.5 w-3.5" />
                          {dict.goSource}
                        </Link>
                      ) : null}
                    </div>
                  </article>
                );
              })
            )}
        </div>
      </section>

        {/* ── Havuz ── */}
      <section className="mt-space-6">
        <h2 className="mb-space-3 text-sm font-bold text-zinc-100">
          {dict.pool} ({drafts.length})
        </h2>

            {drafts.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-space-4 py-space-5 text-center text-sm text-muted">
                {dict.noPool}
              </p>
            ) : (
              <div className="grid gap-space-3 sm:grid-cols-2 lg:grid-cols-3">
                {drafts.slice(0, 15).map((draft) => (
                  <div
                    key={draft.id}
                    className="rounded-xl border border-border/70 bg-[#080808] p-space-3"
                  >
                    <p className="line-clamp-2 text-xs leading-relaxed text-zinc-300">
                      {draft.text}
                    </p>
                    <div className="mt-space-2 flex flex-wrap items-center gap-space-2 text-[11px]">
                      <span
                        className={`rounded-full px-space-2 py-space-1 font-semibold ${
                          draft.status === "published"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : draft.status === "copied"
                              ? "bg-blue-500/15 text-blue-300"
                              : draft.status === "rejected"
                                ? "bg-rose-500/15 text-rose-400"
                                : "bg-white/[0.06] text-muted"
                        }`}
                      >
                        {dict.status[
                          draft.status as keyof typeof dict.status
                        ] ?? draft.status}
                      </span>
                      <span className="text-muted">{draft.styleName}</span>
                      <button
                        type="button"
                        onClick={() => void copyDraft(draft)}
                        className="ml-auto text-blue-300 transition hover:text-blue-200"
                      >
                        {dict.copy}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </section>

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
    </div>
  );
}
