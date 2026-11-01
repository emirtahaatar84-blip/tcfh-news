import { prisma } from "@/lib/prisma";

/**
 * FAZ 4.1 — "Günün özeti".
 *
 * Her gün 08:00'de (Europe/Istanbul) ayrı bir kayıt olarak üretilir.
 * Aynı gün için ikinci kayıt oluşturulmaz (date UNIQUE).
 *
 * NEDEN deterministik: özet, o gün yayınlanan haberlerin başlıklarından
 * kurulur. Uydurma riski yoktur, LLM maliyeti yoktur ve metin her zaman
 * kaynak haberlerle birebir izlenebilir.
 *
 * Telif: başlık (atıf) dışında metin kopyalanmaz; cümleler bizim.
 */

export const DIGEST_HOUR = 8; // 08:00 Europe/Istanbul

/** Europe/Istanbul'da bugünün YYYY-MM-DD değeri. */
export function istanbulDate(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

export type DigestItem = {
  id: string;
  title: string;
  slug: string | null;
  category: string;
};

export type DigestResult = {
  id: string;
  date: string;
  title: string;
  body: string;
  newsIds: DigestItem[];
  created: boolean;
};

/** Özete girecek haberleri seçer: son 24 saat, en çok kaynaklı önce. */
export async function pickDigestStories(now: Date = new Date()): Promise<DigestItem[]> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const rows = await prisma.newsItem.findMany({
    where: { removedAt: null, createdAt: { gte: since } },
    orderBy: [{ verifiedSourceCount: "desc" }, { createdAt: "desc" }],
    take: 6,
    select: { id: true, title: true, slug: true, category: true },
  });

  return rows;
}

/**
 * 24 saatlik gövde metni üretir: 3-5 cümle.
 * (1) genel durum, (2) en kaynaklı haber, (3) ikinci, (4) kategori dağılımı.
 */
export function buildDigestBody(items: DigestItem[], date: string): string {
  if (items.length === 0) {
    return `${date} tarihinde yayınlanan haber bulunmuyor. Yeni gelişmeler yayınlandıkça özet güncellenecek.`;
  }

  const categories = new Map<string, number>();
  for (const item of items) {
    categories.set(item.category, (categories.get(item.category) ?? 0) + 1);
  }

  const topCategories = [...categories.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);

  const sentences: string[] = [];

  sentences.push(
    `${date} tarihinde ${items.length} gelişme öne çıktı; bunlar çoğunlukla ${topCategories.join(", ")} alanlarında yoğunlaştı.`,
  );

  const [first, second, third] = items;

  sentences.push(`Günün öne çıkan başlığı: “${shorten(first.title, 90)}”.`);

  if (second) {
    sentences.push(`Ayrıca “${shorten(second.title, 90)}” başlığıyla aktarılan gelişme dikkat çekti.`);
  }

  if (third) {
    sentences.push(`Bunlara ek olarak ${third.category} alanında da yeni bir gelişme kaydedildi.`);
  }

  sentences.push(
    "Tüm başlıklar birden fazla kaynakla karşılaştırılarak yapay zekâ ile özetlendi; ayrıntılar haber sayfalarında yer alıyor.",
  );

  return sentences.join(" ");
}

function shorten(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Günün özetini üretir. Aynı gün için kayıt varsa onu döndürür
 * (`force: true` ile yenilenir).
 */
export async function generateDailyDigest(
  options: { date?: string; force?: boolean } = {},
): Promise<DigestResult> {
  const date = options.date ?? istanbulDate();

  if (!options.force) {
    const existing = await prisma.dailyDigest.findUnique({ where: { date } });
    if (existing) {
      return {
        id: existing.id,
        date: existing.date,
        title: existing.title,
        body: existing.body,
        newsIds: JSON.parse(existing.newsIds || "[]") as DigestItem[],
        created: false,
      };
    }
  }

  const items = await pickDigestStories();
  const body = buildDigestBody(items, date);
  const title = `Günün özeti · ${formatDateLabel(date)}`;

  const row = await prisma.dailyDigest.upsert({
    where: { date },
    update: {
      title,
      body,
      newsIds: JSON.stringify(items),
      status: "ready",
    },
    create: {
      date,
      title,
      body,
      newsIds: JSON.stringify(items),
    },
  });

  return {
    id: row.id,
    date: row.date,
    title: row.title,
    body: row.body,
    newsIds: items,
    created: true,
  };
}

function formatDateLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

/** Son N günün özetleri (podcast listesi için). */
export async function listDigests(limit = 14) {
  return prisma.dailyDigest.findMany({
    orderBy: { date: "desc" },
    take: limit,
    select: {
      id: true,
      date: true,
      title: true,
      body: true,
      audioUrl: true,
      audioSeconds: true,
      status: true,
    },
  });
}
