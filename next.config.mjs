/** @type {import('next').NextConfig} */

/**
 * İçerik Güvenlik Politikası (CSP).
 *
 * Not: Next.js hidrasyonu ve FOUC önleyici tema script'i satır içi
 * çalıştığı için `script-src` içinde 'unsafe-inline' gerekir. Üçüncü taraf
 * script, analitik, pixel veya reklam ağı YOKTUR — bu yüzden liste dardır.
 * YouTube yalnızca "tıkla-yükle" (facade) ile, kullanıcı tıkladıktan
 * sonra frame-src üzerinden yüklenir.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  /**
   * Meta etiketleri (description, OG, Twitter) HER istemciye engelleyici
   * (blocking) biçimde gönderilir; akış sonunda <body> içine düşmez.
   * Böylece arama motorları ve Lighthouse ilk HTML'de görür.
   */
  htmlLimitedBots: /.*/,
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["rss-parser", "@prisma/client"],
  outputFileTracingIncludes: {
    "/**": ["./node_modules/.prisma/client/**/*", "./instrumentation.ts"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
          },
          {
            key: "Content-Security-Policy",
            value: CONTENT_SECURITY_POLICY,
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
      {
        // Next.js üretim varlıkları içerik karmalıdır: uzun süreli cache.
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/icons/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800, immutable" },
        ],
      },
      {
        // Ham API yanıtları cache'lenmez — ANCAK görsel uçları hariç:
        // onların cache politikası kendi route'unda belirlenir (JPEG →
        // immutable, henüz üretilmemişse SVG → kısa TTL).
        source: "/api/((?!news/[^/]+/image|portraits/[^/]+/image).*)",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
