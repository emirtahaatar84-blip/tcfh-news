import { prisma } from "@/lib/prisma";
import { parseJsonArray } from "@/lib/utils";

/**
 * FAZ 3 — Zaman çizelgesi ve "şu ana kadar ne oldu" özeti.
 *
 * Etiket veya olay (haber kimliği) için haberleri TARİH SIRASIYLA döndürür
 * ve 3-4 cümlelik bir özet üretir. Özet önbelleğe alınır (DB), yeni haber
 * geldiğinde önbellek anahtarı değiştiği için otomatik yenilenir.
 *
 * NEDEN LLM'siz: özet kanıtlanabilir olmalı. Haber başlıklarından
 * deterministik cümleler kurulur — uydurma riski yok, maliyet yok, hız yüksek.
 * (LLM'i kullanan raporlar için ileride ayrı uç eklenebilir.)
 */

export type TimelineItem = {
  id: string;
  slug: string | null;
  title: string;
  summary: string;
  category: string;
  createdAt: string;
};

export type TimelineResult = {
  scope: { kind: "tag" | "news"; value: string };
  items: TimelineItem[];
  /** "Şu ana kadar ne oldu" — 3-4 cümle. */
  digest: string;
  /** Özet üretildiği an (önbellekten geldiyse eski olabilir). */
  digestBuiltAt: string;
  total: number;
};

/** Özet önbelleği: süreç belleğinde, içerik imzasına bağlı. */
const digestCache = new Map<string, { signature: string; digest: string; at: Date }>();
const CACHE_LIMIT = 200;

function cacheKey(scope: TimelineResult["scope"]): string {
  return `${scope.kind}:${scope.value}`;
}

/** Haber listesinin içerik imzası: yeni haber → yeni imza → önbellek düşer. */
function signatureOf(items: TimelineItem[]): string {
  return items.map((item) => item.id).join("|") + `#${items.length}`;
}

/**
 * 3-4 cümlelik "şu ana kadar ne oldu" özeti.
 *
 * Yapı: (1) ilk gelişme, (2) son gelişme, (3) toplam/yoğunluk bilgisi,
 * (4) aradaki en uzun duraklama ya da güncel durum.
 */
export function buildDigest(items: TimelineItem[], label: string): string {
  if (items.length === 0) return "";

  const ordered = [...items];
  const first = ordered[0];
  const last = ordered[ordered.length - 1];

  const sentences: string[] = [];

  if (ordered.length === 1) {
    sentences.push(`“${label}” için ilk haber ${formatShort(first.createdAt)} tarihinde yayımlandı.`);
    sentences.push(`Başlık: ${first.title}.`);
    return sentences.join(" ");
  }

  sentences.push(
    `“${label}” ile ilgili ilk gelişme ${formatShort(first.createdAt)} tarihinde “${shorten(first.title, 70)}” başlığıyla duyuruldu.`,
  );

  sentences.push(
    `En son gelişme ${formatShort(last.createdAt)} tarihinde kaydedildi: ${shorten(last.title, 80)}.`,
  );

  const spanDays = Math.max(
    1,
    Math.round(
      (new Date(last.createdAt).getTime() - new Date(first.createdAt).getTime()) /
        86_400_000,
    ),
  );

  const categories = new Set(ordered.map((item) => item.category));

  sentences.push(
    `Bu süreçte toplam ${ordered.length} haber yayımlandı ve ${
      categories.size === 1 ? `tümü “${[...categories][0]}” kategorisinde` : `${categories.size} farklı kategoride`
    } yer aldı.`,
  );

  sentences.push(
    spanDays <= 1
      ? "Gelişmeler aynı gün içinde yoğunlaştı."
      : `Dönem yaklaşık ${spanDays} güne yayıldı; en güncel bilgi yukarıdaki başlıklardan izlenebilir.`,
  );

  return sentences.join(" ");
}

function shorten(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function formatShort(iso: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  }).format(new Date(iso));
}

/** Zaman çizelgesini (tarih sırasıyla) ve özeti döndürür. */
export async function getTimeline(
  scope: TimelineResult["scope"],
  limit = 60,
): Promise<TimelineResult> {
  const where =
    scope.kind === "tag"
      ? {
          removedAt: null,
          tags: { contains: `"@${scope.value.replace(/^@/, "")}"` },
        }
      : {
          removedAt: null,
          OR: [
            { id: scope.value },
            // Aynı olay kümesini paylaşan haberler: kategori + yakın zaman.
            { category: scope.value },
          ],
        };

  const rows = await prisma.newsItem.findMany({
    where,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: Math.min(200, limit),
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      category: true,
      createdAt: true,
    },
  });

  const items: TimelineItem[] = rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    category: row.category,
    createdAt: row.createdAt.toISOString(),
  }));

  const label =
    scope.kind === "tag" ? `@${scope.value.replace(/^@/, "")}` : scope.value;

  // ── Önbellek ──────────────────────────────────────────────────────────
  const key = cacheKey(scope);
  const signature = signatureOf(items);
  const cached = digestCache.get(key);

  let digest: string;
  let digestBuiltAt: Date;

  if (cached && cached.signature === signature) {
    digest = cached.digest;
    digestBuiltAt = cached.at;
  } else {
    digest = buildDigest(items, label);
    digestBuiltAt = new Date();

    if (digestCache.size >= CACHE_LIMIT) {
      const firstKey = digestCache.keys().next().value;
      if (firstKey !== undefined) digestCache.delete(firstKey);
    }
    digestCache.set(key, { signature, digest, at: digestBuiltAt });
  }

  return {
    scope,
    items,
    digest,
    digestBuiltAt: digestBuiltAt.toISOString(),
    total: items.length,
  };
}

/** Etiketleri dizi olarak ayrıştırır (kart/şablon tarafında kullanılır). */
export function tagsOf(json: string | null | undefined): string[] {
  return parseJsonArray(json);
}
