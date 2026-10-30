import { prisma } from "@/lib/prisma";
import { slugify, withSuffix } from "@/lib/slug";

/**
 * Veritabanında benzersiz bir haber slug'ı üretir.
 * Aynı başlıktan üretilen slug varsa "-2", "-3" … eklenir.
 */
export async function uniqueNewsSlug(title: string): Promise<string> {
  const base = slugify(title) || `haber-${Date.now().toString(36)}`;

  for (let index = 1; index <= 200; index += 1) {
    const candidate = withSuffix(base, index);

    const existing = await prisma.newsItem.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    if (!existing) return candidate;
  }

  return `${base}-${Date.now().toString(36).slice(-5)}`.slice(0, 80);
}

/** Portreler için benzersiz slug (yayın öncesi). */
export async function uniquePortraitSlug(title: string): Promise<string> {
  const base = slugify(title) || `portre-${Date.now().toString(36)}`;

  for (let index = 1; index <= 200; index += 1) {
    const candidate = withSuffix(base, index);

    const existing = await prisma.portrait.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    if (!existing) return candidate;
  }

  return `${base}-${Date.now().toString(36).slice(-5)}`.slice(0, 80);
}
