"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { NewsCard } from "@/components/NewsCard";
import { useDevicePrefs } from "@/components/DevicePrefsProvider";
import { matchesInterests } from "@/components/feed/InterestFilter";
import { NewsCardSkeleton } from "@/components/NewsCardSkeleton";
import { PortraitFeedCard } from "@/components/feed/PortraitFeedCard";
import { AlertTriangleIcon, InboxIcon } from "@/components/icons";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n-config";
import type { FeedNewsItem, FeedPage } from "@/lib/news-types";
import type { PortraitCardDto } from "@/lib/portrait-types";

/** DOM'da tutulan en fazla kart. */
export const MAX_DOM_CARDS = 120;
/** Grup boyu (API limit). */
export const FEED_GROUP_SIZE = 20;
/** Sunucunun derin bağlantıda çözebileceği en yüksek sayfa. */
export const MAX_SERVER_PAGE = 6;
/** Kart yüksekliği bilinmiyorsa kullanılan tahmin (px). */
const ESTIMATED_HEIGHT = 380;
/** Geri kaydırınca yeniden basılan tampon. */
const WINDOW_BUFFER = 6;

const SCROLL_KEY = "eth.v1.feed-scroll";

type SavedScroll = {
  href: string;
  sayfa: number;
  sonKartId: string | null;
  /** Görünümün üstündeki kartın anahtarı (news: / portrait:). */
  sonKartKey?: string | null;
  /** O kartın görünüm üstüne göre kayması (px, negatif olabilir). */
  kartUst?: number;
  y: number;
  at: number;
};

type Entry =
  | { key: string; kind: "news"; item: FeedNewsItem }
  | { key: string; kind: "portrait"; item: PortraitCardDto };

type Props = {
  lang: Locale;
  initialItems: FeedNewsItem[];
  initialHasMore: boolean;
  initialPage: number;
  /** API sorgusu (sayfa hariç): "kategori=spor&sirala=okunan&limit=20" */
  apiQuery: string;
  /** Tarayıcı adresi sorgusu (sayfa hariç): "kategori=spor" */
  pageQuery: string;
  basePath: string;
  portraits: PortraitCardDto[];
  labels: Pick<Dictionary, "feed" | "card" | "categories" | "common" | "shell">;
};

function positionIn(node: HTMLElement | null): number {
  if (!node) return 0;
  return node.getBoundingClientRect().top + window.scrollY;
}

function readSaved(): SavedScroll | null {
  try {
    const raw = window.sessionStorage.getItem(SCROLL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedScroll;
    if (typeof parsed?.y !== "number" || typeof parsed?.href !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeSaved(value: SavedScroll): void {
  try {
    window.sessionStorage.setItem(SCROLL_KEY, JSON.stringify(value));
  } catch {
    // Depolama kapalı: kaydırma geri yükleme devre dışı; çökme yok.
  }
}

export function Feed({
  lang,
  initialItems,
  initialHasMore,
  initialPage,
  apiQuery,
  pageQuery,
  basePath,
  portraits,
  labels,
}: Props) {
  // FAZ 3.3 — cihazdaki ilgi alanları (localStorage). Sunucuya gitmez.
  const { prefs } = useDevicePrefs();
  const interests = prefs.interests ?? [];

  const [items, setItems] = useState<FeedNewsItem[]>(initialItems);
  const [page, setPage] = useState(initialPage);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [closedIds, setClosedIds] = useState<Set<string>>(new Set());
  const [windowStart, setWindowStart] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const pageRef = useRef(initialPage);
  const windowStartRef = useRef(0);
  const heightsRef = useRef<Map<string, number>>(new Map());
  const estimateRef = useRef(ESTIMATED_HEIGHT);
  const restoredRef = useRef(false);
  const restoreLockRef = useRef(false);
  const entriesRef = useRef<Entry[]>([]);
  const savedScrollRef = useRef<SavedScroll | null>(null);
  const lastSaveRef = useRef(0);
  const lastStateRef = useRef("");

  pageRef.current = page;

  const handleClose = useCallback((id: string) => {
    setClosedIds((previous) => {
      const next = new Set(previous);
      next.add(id);
      return next;
    });
  }, []);

  // ── Tekilleştirme + portre serpiştirme ───────────────────────────────────
  const entries = useMemo<Entry[]>(() => {
    const seen = new Set<string>();
    const output: Entry[] = [];
    let portraitIndex = 0;

    const visible = items.filter((item) => {
      if (seen.has(item.id) || closedIds.has(item.id)) return false;
      // FAZ 3.3 — kişisel ilgi alanı filtresi (yalnızca cihazdaki tercih).
      if (!matchesInterests(item.category, interests)) return false;
      seen.add(item.id);
      return true;
    });

    visible.forEach((item, index) => {
      output.push({ key: `news:${item.id}`, kind: "news", item });

      // Her 9. haberden sonra bir portre (aynı portre tekrar etmez).
      if ((index + 1) % 9 === 0 && portraitIndex < portraits.length) {
        const portrait = portraits[portraitIndex];
        portraitIndex += 1;
        output.push({
          key: `portrait:${portrait.slug}`,
          kind: "portrait",
          item: portrait,
        });
      }
    });

    return output;
  }, [// eslint-disable-next-line react-hooks/exhaustive-deps
    interests,closedIds, items, portraits]);

  entriesRef.current = entries;
  const total = entries.length;

  // ── Yükseklik tabanlı pencere hesabı ─────────────────────────────────────
  const heightOf = useCallback((entry: Entry): number => {
    return heightsRef.current.get(entry.key) ?? estimateRef.current;
  }, []);

  const offsetAt = useCallback(
    (index: number): number => {
      let sum = 0;
      const limit = Math.min(index, entries.length);
      for (let i = 0; i < limit; i += 1) sum += heightOf(entries[i]);
      return sum;
    },
    [entries, heightOf],
  );

  const indexAtOffset = useCallback(
    (offset: number): number => {
      let sum = 0;
      for (let i = 0; i < entries.length; i += 1) {
        const next = sum + heightOf(entries[i]);
        if (next > offset) return i;
        sum = next;
      }
      return Math.max(0, entries.length - MAX_DOM_CARDS);
    },
    [entries, heightOf],
  );

  const maxStart = Math.max(0, total - MAX_DOM_CARDS);
  const start = Math.min(windowStart, maxStart);
  const end = Math.min(total, start + MAX_DOM_CARDS);

  const topSpacer = useMemo(() => offsetAt(start), [offsetAt, start]);
  const bottomSpacer = useMemo(
    () => Math.max(0, offsetAt(total) - offsetAt(end)),
    [offsetAt, total, end],
  );

  // ── Kaydırma: pencereyi kaydır, konumu kaydet ────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;

    let frame = 0;

    const update = () => {
      frame = 0;
      if (!containerRef.current) return;
      if (restoreLockRef.current) return;

      const top = positionIn(containerRef.current);
      const relative = window.scrollY - top;

      let nextStart = indexAtOffset(relative - WINDOW_BUFFER * ESTIMATED_HEIGHT);
      nextStart = Math.max(0, Math.min(nextStart, Math.max(0, total - MAX_DOM_CARDS)));

      if (Math.abs(nextStart - windowStartRef.current) >= 4) {
        windowStartRef.current = nextStart;
        setWindowStart(nextStart);
      }

      const now = Date.now();

      if (now - lastSaveRef.current > 250) {
        lastSaveRef.current = now;

        // Görünümün üstündeki kartı DOM'dan çapa al. Offset tahmini yerine
        // gerçek ölçüm kullanılır; geri dönüşte konum birebir korunur.
        const nodes = containerRef.current?.querySelectorAll<HTMLElement>(
          "[data-entry-key]",
        );

        let anchorKey: string | null = null;
        let anchorTop = 0;

        if (nodes) {
          for (const node of nodes) {
            const rect = node.getBoundingClientRect();
            if (rect.bottom > 8) {
              anchorKey = node.dataset.entryKey ?? null;
              anchorTop = Math.round(rect.top);
              break;
            }
          }
        }

        const anchorNewsId = anchorKey?.startsWith("news:")
          ? anchorKey.slice(5)
          : null;

        writeSaved({
          href: window.location.href,
          sayfa: pageRef.current,
          sonKartId: anchorNewsId,
          sonKartKey: anchorKey,
          kartUst: anchorTop,
          y: window.scrollY,
          at: now,
        });

        const signature = `${pageRef.current}:${anchorKey ?? ""}`;
        if (signature !== lastStateRef.current) {
          lastStateRef.current = signature;
          window.history.replaceState(
            {
              ...(window.history.state ?? {}),
              sayfa: pageRef.current,
              sonKartId: anchorNewsId,
              sonKartKey: anchorKey,
              kartUst: anchorTop,
            },
            "",
            window.location.href,
          );
        }
      }
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    // Sayfa kapanırken/sekme gizlenirken son konumu hemen yaz (gecikmesiz).
    const flush = () => {
      if (restoreLockRef.current) return;
      lastSaveRef.current = 0;
      update();
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [end, entries, indexAtOffset, total]);

  // ── Ölçüm: gerçek kart yükseklikleri (spacer doğruluğu için) ─────────────
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const nodes = containerRef.current.querySelectorAll<HTMLElement>(
      "[data-entry-key]",
    );
    nodes.forEach((node) => {
      const key = node.dataset.entryKey;
      if (!key) return;
      const height = node.offsetHeight;
      if (height > 0) heightsRef.current.set(key, height);
    });

    // Ölçülen kartların ortalaması, henüz görülmemiş kartlar için tahmin
    // olarak kullanılır (spacer doğruluğu → konum koruma).
    if (heightsRef.current.size > 0) {
      let totalHeight = 0;
      for (const value of heightsRef.current.values()) totalHeight += value;
      estimateRef.current = Math.round(totalHeight / heightsRef.current.size);
    }
  }, [start, end, entries]);

  // ── Sayfa isteği ─────────────────────────────────────────────────────────
  const requestPage = useCallback(
    async (nextPage: number): Promise<{ added: number; hasMore: boolean }> => {
      const response = await fetch(
        `/api/news?${apiQuery}${apiQuery ? "&" : ""}page=${nextPage}`,
        { cache: "no-store" },
      );

      if (!response.ok) throw new Error("Feed request failed");

      const data = (await response.json()) as FeedPage;
      let added = 0;

      setItems((previous) => {
        const seen = new Set(previous.map((item) => item.id));
        const fresh = data.items.filter((item) => !seen.has(item.id));
        added = fresh.length;
        return [...previous, ...fresh];
      });

      pageRef.current = nextPage;
      setHasMore(data.hasMore);
      return { added, hasMore: data.hasMore };
    },
    [apiQuery],
  );

  const writeUrl = useCallback(
    (nextPage: number) => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(pageQuery);
      if (nextPage <= 1) params.delete("sayfa");
      else params.set("sayfa", String(nextPage));
      const query = params.toString();
      const url = `${basePath}${query ? `?${query}` : ""}`;
      window.history.replaceState(window.history.state, "", url);
    },
    [basePath, pageQuery],
  );

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;

    loadingRef.current = true;
    setLoading(true);
    setError(false);

    try {
      const nextPage = pageRef.current + 1;
      const result = await requestPage(nextPage);
      setPage(nextPage);
      writeUrl(nextPage);

      if (result.added > 0) {
        setAnnouncement(
          labels.shell.loaded.replace("{count}", String(result.added)),
        );
      }
    } catch {
      setError(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [hasMore, labels.shell.loaded, requestPage, writeUrl]);

  // ── Sonsuz akış: gözlemci + güvenli yedek tetikleyici ────────────────────
  useEffect(() => {
    const element = sentinelRef.current;
    if (!element || !hasMore) return;

    const observer = new IntersectionObserver(
      (observed) => {
        if (observed[0]?.isIntersecting) void loadMore();
      },
      // Son karttan ~1 ekran önce tetikle.
      { rootMargin: "100% 0px" },
    );

    observer.observe(element);

    // Kullanıcı tam dipte beklerken gözlemci yeniden tetiklenmezse
    // kaydırma ve kısa aralıklı kontrol yüklemeyi sürdürür.
    const maybeLoad = () => {
      if (loadingRef.current) return;
      const remaining =
        document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      if (remaining < window.innerHeight) void loadMore();
    };

    window.addEventListener("scroll", maybeLoad, { passive: true });
    const interval = window.setInterval(maybeLoad, 900);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", maybeLoad);
      window.clearInterval(interval);
    };
  }, [hasMore, loadMore]);

  // ── Kaydırma restorasyonu (geri tuşu / yenileme / derin bağlantı) ────────
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    restoreLockRef.current = true;

    const savedRaw = readSaved();
    const samePath =
      !savedRaw ||
      (() => {
        try {
          return new URL(savedRaw.href, window.location.origin).pathname ===
            window.location.pathname;
        } catch {
          return false;
        }
      })();
    const saved = samePath ? savedRaw : null;
    savedScrollRef.current = saved;

    // Güvenlik: her durumda kilit en geç 2,5 sn sonra açılır.
    const safety = window.setTimeout(() => {
      restoreLockRef.current = false;
    }, 2500);

    const state = (window.history.state ?? {}) as {
      sonKartId?: string | null;
      sonKartKey?: string | null;
      kartUst?: number;
      sayfa?: number;
    };

    // sessionStorage en son yazılan konumu tutar; history.state yedeğidir.
    const targetId = saved?.sonKartId ?? state.sonKartId ?? null;
    const targetKey = saved?.sonKartKey ?? state.sonKartKey ?? null;
    const targetTop = saved?.kartUst ?? state.kartUst ?? 0;
    const targetPage = Math.max(
      initialPage,
      state.sayfa ?? saved?.sayfa ?? initialPage,
    );

    const scrollToTarget = () => {
      const list = entriesRef.current;
      const targetIndex = targetKey
        ? list.findIndex((entry) => entry.key === targetKey)
        : -1;

      // Hedef kart pencerede değilse pencereyi önce o karta kaydır
      // (sanallaştırma: 120 kart sınırı).
      if (targetIndex >= 0 && targetIndex > 2) {
        const nextStart = Math.max(0, targetIndex - 4);
        windowStartRef.current = nextStart;
        setWindowStart(nextStart);
      }

      const selectorKey =
        targetKey ?? (targetId ? `news:${targetId}` : null);

      let attempts = 0;

      const tryScroll = () => {
        const node = selectorKey
          ? document.querySelector<HTMLElement>(
              `[data-entry-key="${selectorKey.replace(/"/g, "")}"]`,
            )
          : null;

        if (node) {
          const top = positionIn(node) - targetTop;
          window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
          // Konum oturana kadar pencere yeniden hesaplanmaz (spacer kayması).
          window.setTimeout(() => {
            restoreLockRef.current = false;
          }, 1200);
          return;
        }

        attempts += 1;

        // React penceresi henüz basmadıysa birkaç kare bekle.
        if (attempts < 24) {
          window.requestAnimationFrame(tryScroll);
          return;
        }

        // Kart hiç bulunamadıysa yaklaşık offset'e dön.
        if (targetIndex >= 0) {
          let offset = 0;
          for (let i = 0; i < targetIndex; i += 1) {
            offset += heightsRef.current.get(list[i].key) ?? estimateRef.current;
          }
          window.scrollTo({
            top: Math.max(0, offset - targetTop),
            behavior: "auto",
          });
          return;
        }

        if (saved && saved.y > 0) {
          window.scrollTo({ top: saved.y, behavior: "auto" });
        }

        restoreLockRef.current = false;
      };

      window.requestAnimationFrame(tryScroll);
    };

    if (targetPage <= initialPage) {
      scrollToTarget();
      return;
    }

    // Next.js önbelleği daha eski bir sayfa sayısı döndürdüyse eksik
    // grupları sırayla tamamla, sonra konumu geri yükle.
    let cancelled = false;
    loadingRef.current = true;
    setLoading(true);

    void (async () => {
      let current = initialPage;
      try {
        const limit = Math.min(targetPage, MAX_SERVER_PAGE * 2);
        while (current < limit) {
          const result = await requestPage(current + 1);
          current += 1;
          if (!result.hasMore) break;
        }
        if (!cancelled) {
          setPage(current);
          writeUrl(current);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) {
          loadingRef.current = false;
          setLoading(false);
          scrollToTarget();
        }
      }
    })();

    return () => {
      cancelled = true;
      loadingRef.current = false;
      window.clearTimeout(safety);
    };
  }, [initialPage, requestPage, writeUrl]);

  const nextHref = useMemo(() => {
    const params = new URLSearchParams(pageQuery);
    params.set("sayfa", String(page + 1));
    return `${basePath}?${params.toString()}`;
  }, [basePath, page, pageQuery]);

  const isEmpty = entries.length === 0;

  if (isEmpty) {
    return (
      <div className="surface-card flex flex-col items-center justify-center px-space-6 py-space-9 text-center">
        <InboxIcon className="mb-space-4 h-6 w-6 text-zinc-600" aria-hidden="true" />
        <h2 className="text-base font-medium text-zinc-300">
          {labels.feed.emptyTitle}
        </h2>
        <p className="mt-title-spot max-w-sm t-lead leading-relaxed text-zinc-500">
          {labels.feed.emptyDescription}
        </p>
        <Link href={`/${lang}`} className="btn-secondary mt-space-5">
          {labels.shell.all}
        </Link>
      </div>
    );
  }

  const rendered = entries.slice(start, end);

  return (
    <div ref={containerRef} className="flex flex-col">
      <h2 className="sr-only">{labels.feed.latest}</h2>
      <div aria-live="polite" className="sr-only">
        {loading ? labels.shell.loadingNext : announcement}
      </div>

      {/* Sanallaştırma: üstte kalan kartların yerini spacer tutar. */}
      {topSpacer > 0 ? (
        <div aria-hidden="true" style={{ height: `${topSpacer}px` }} />
      ) : null}

      <div className="feed-stack">
        {/* feed-item: FAZ 5 — ekran dışı kartların layout hesabı atlanır. */}
        {rendered.map((entry, index) => (
          <div
            key={entry.key}
            data-entry-key={entry.key}
            className="feed-item animate-fade-in"
            style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
            onClickCapture={(event) => {
              // Akış kartlarından tam sayfa gezinme: geri tuşu aynı sayfa
              // sayısını sunucudan getirir, kaydırma konumu korunur.
              if (
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              ) {
                return;
              }

              const target = event.target as Element | null;
              const anchor = target?.closest("a");
              const href = anchor?.getAttribute("href") ?? null;

              if (href && /\/(haber|portre)\//.test(href)) {
                event.preventDefault();
                event.stopPropagation();
                window.location.assign(href);
                return;
              }

              if (anchor || target?.closest("button") || target?.closest("details")) return;

              const titleLink =
                event.currentTarget.querySelector<HTMLAnchorElement>("h3 a");
              const fallback = titleLink?.getAttribute("href");
              if (fallback) {
                event.preventDefault();
                window.location.assign(fallback);
              }
            }}
          >
            {entry.kind === "news" ? (
              <NewsCard
                item={entry.item}
                locale={lang}
                cardLabels={labels.card}
                categoryLabels={labels.categories}
                bookmarksMode={false}
                onClose={handleClose}
                priority={index < 2}
              />
            ) : (
              <PortraitFeedCard
                portrait={entry.item}
                locale={lang}
                labels={{
                  badge: lang === "tr" ? "Portre" : "Portrait",
                  verified: labels.card.verified,
                  readingTime: labels.shell.debateReading,
                  listeningTime: labels.shell.debateListening,
                  save: labels.card.save,
                  saved: labels.card.saved,
                  readLabel: labels.card.readLabel,
                  actions: labels.card.actions,
                }}
                categoryLabels={labels.categories}
                onClose={handleClose}
                priority={index < 2}
              />
            )}
          </div>
        ))}
      </div>

      {bottomSpacer > 0 ? (
        <div aria-hidden="true" style={{ height: `${bottomSpacer}px` }} />
      ) : null}

      {error ? (
        <div className="mt-space-3 flex flex-col items-center gap-space-3 rounded-2xl border border-[#22252a] bg-[#16181c] px-space-5 py-space-6 text-center">
          <div className="flex items-center gap-inline t-lead text-rose-400">
            <AlertTriangleIcon className="h-4 w-4" aria-hidden="true" />
            {labels.feed.error}
          </div>
          <button type="button" onClick={loadMore} className="btn-secondary">
            {labels.feed.retry}
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="mt-space-3 feed-stack">
          <NewsCardSkeleton />
          <NewsCardSkeleton />
        </div>
      ) : null}

      {/* Gözlemci hedefi: son karttan bir ekran önce. */}
      <div ref={sentinelRef} className="h-px w-full" aria-hidden="true" />

      {!hasMore && !loading ? (
        <p className="px-space-5 py-space-6 text-center t-meta text-zinc-600">
          {labels.shell.feedEnd}
        </p>
      ) : null}

      {/*
        Progressive enhancement: JS kapalıysa gerçek bir bağlantı kalır.
        Buton değil, sunucuda render edilen "Sonraki sayfa" bağlantısı.
      */}
      <noscript>
        <div className="mt-space-4 rounded-xl border border-[#22252a] bg-[#16181c] px-space-4 py-space-3 text-center">
          <p className="text-[11px] text-zinc-500">{labels.shell.noJsHint}</p>
          {hasMore ? (
            <a
              href={nextHref}
              className="mt-space-2 inline-flex min-h-[44px] items-center justify-center rounded-full border border-[#22252a] bg-white/5 px-space-4 t-lead font-semibold text-zinc-200"
            >
              {labels.shell.nextPage}
            </a>
          ) : null}
        </div>
      </noscript>
    </div>
  );
}
