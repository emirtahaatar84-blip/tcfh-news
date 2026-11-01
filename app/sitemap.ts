import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function siteUrl(): string {
  return (process.env.SITE_URL || "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const lastModified = new Date();

  const staticPaths: { path: string; priority: number }[] = [
    { path: "", priority: 1 },
    { path: "/haberler", priority: 0.9 },
    { path: "/portreler", priority: 0.9 },
    { path: "/kategoriler", priority: 0.6 },
    { path: "/podcast", priority: 0.7 },
    { path: "/blog", priority: 0.6 },
    { path: "/munazara", priority: 0.8 },
    { path: "/munazara/arsiv", priority: 0.4 },
    { path: "/about", priority: 0.4 },
    { path: "/legal/kvkk", priority: 0.3 },
    { path: "/legal/cookies", priority: 0.3 },
    { path: "/legal/terms", priority: 0.3 },
    { path: "/legal/copyright", priority: 0.3 },
  ];

  const entries: MetadataRoute.Sitemap = [];

  for (const locale of ["tr", "en"] as const) {
    for (const entry of staticPaths) {
      entries.push({
        url: `${base}/${locale}${entry.path}`,
        lastModified,
        changeFrequency: entry.path === "" ? "hourly" : "weekly",
        priority: entry.priority,
        alternates: {
          languages: {
            "tr-TR": `${base}/tr${entry.path}`,
            en: `${base}/en${entry.path}`,
          },
        },
      });
    }
  }

  // Yayınlanmış portreler (her iki dil).
  try {
    const portraits = await prisma.portrait.findMany({
      where: { status: "published", removedAt: null },
      orderBy: { publishedAt: "desc" },
      take: 500,
      select: { slug: true, updatedAt: true },
    });

    for (const portrait of portraits) {
      for (const locale of ["tr", "en"] as const) {
        entries.push({
          url: `${base}/${locale}/portre/${portrait.slug}`,
          lastModified: portrait.updatedAt,
          changeFrequency: "weekly",
          priority: 0.8,
          alternates: {
            languages: {
              "tr-TR": `${base}/tr/portre/${portrait.slug}`,
              en: `${base}/en/portre/${portrait.slug}`,
            },
          },
        });
      }
    }
  } catch {
    // Veritabanı yoksa statik girdilerle devam et.
  }

  // Yayımlanmış münazaralar (her iki dil).
  try {
    const debates = await prisma.debateTopic.findMany({
      where: { status: "published" },
      orderBy: { publishedAt: "desc" },
      take: 300,
      select: { slug: true, updatedAt: true },
    });

    for (const debate of debates) {
      for (const locale of ["tr", "en"] as const) {
        entries.push({
          url: `${base}/${locale}/munazara/${debate.slug}`,
          lastModified: debate.updatedAt,
          changeFrequency: "weekly",
          priority: 0.7,
          alternates: {
            languages: {
              "tr-TR": `${base}/tr/munazara/${debate.slug}`,
              en: `${base}/en/munazara/${debate.slug}`,
            },
          },
        });
      }
    }
  } catch {
    // Tablo henüz yoksa statik girdilerle devam et.
  }

  // FAZ 5.2 — etiket sayfaları (en çok kullanılan 100 etiket).
  try {
    const rows = await prisma.newsItem.findMany({
      where: { removedAt: null, tags: { not: "[]" } },
      select: { tags: true },
      take: 2000,
    });

    const counts = new Map<string, number>();
    for (const row of rows) {
      for (const tag of JSON.parse(row.tags || "[]") as string[]) {
        if (!tag.startsWith("@")) continue;
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }

    const popular = [...counts.entries()]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 100);

    for (const [tag] of popular) {
      const slug = encodeURIComponent(tag.replace(/^@/, ""));
      for (const locale of ["tr", "en"] as const) {
        entries.push({
          url: `${base}/${locale}/etiket/${slug}`,
          lastModified,
          changeFrequency: "daily",
          priority: 0.5,
          alternates: {
            languages: {
              "tr-TR": `${base}/tr/etiket/${slug}`,
              en: `${base}/en/etiket/${slug}`,
            },
          },
        });
      }
    }
  } catch {
    // Etiket verisi okunamazsa devam et.
  }

  // Latest synthesized stories (both locales).
  try {
    const items = await prisma.newsItem.findMany({
      where: { removedAt: null },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, slug: true, createdAt: true },
    });

    for (const item of items) {
      entries.push({
        url: `${base}/tr/haber/${item.slug ?? item.id}`,
        lastModified: item.createdAt,
        changeFrequency: "daily",
        priority: 0.7,
        alternates: {
          languages: {
            "tr-TR": `${base}/tr/haber/${item.slug ?? item.id}`,
            en: `${base}/en/haber/${item.slug ?? item.id}`,
          },
        },
      });
      entries.push({
        url: `${base}/en/haber/${item.slug ?? item.id}`,
        lastModified: item.createdAt,
        changeFrequency: "daily",
        priority: 0.6,
        alternates: {
          languages: {
            "tr-TR": `${base}/tr/haber/${item.slug ?? item.id}`,
            en: `${base}/en/haber/${item.slug ?? item.id}`,
          },
        },
      });
    }
  } catch {
    // Database unavailable during build — return the static entries.
  }

  return entries;
}
