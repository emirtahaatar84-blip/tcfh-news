import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

function siteUrl(): string {
  return (process.env.SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/tr/admin",
          "/en/admin",
          "/api/",
          "/tr/bookmarks",
          "/en/bookmarks",
          "/tr/assistant",
          "/en/assistant",
          "/tr/profile",
          "/en/profile",
        ],
      },
    ],
    sitemap: [`${base}/sitemap.xml`, `${base}/news-sitemap.xml`],
    host: base,
  };
}
