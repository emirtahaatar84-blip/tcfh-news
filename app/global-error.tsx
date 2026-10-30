"use client";

/**
 * Kök düzey hata sayfası (500). Layout çökse bile gösterilir.
 * KVKK: hata ayrıntısı kullanıcıya gösterilmez; sunucuda kişisel veri yok.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="tr" data-theme="dark">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0e0f12",
          color: "#fafafa",
          fontFamily:
            "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <p
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.2em",
              color: "#3b82f6",
              margin: 0,
            }}
          >
            500
          </p>
          <h1
            style={{
              margin: "12px 0 0",
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: "-0.02em",
            }}
          >
            Beklenmeyen bir hata oluştu
          </h1>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 14,
              lineHeight: 1.6,
              color: "#a1a1aa",
            }}
          >
            Sayfa yüklenemedi. Lütfen tekrar deneyin. Sorun sürerse sayfayı
            yenileyin.
          </p>
          <div
            style={{
              marginTop: 24,
              display: "flex",
              gap: 8,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                minHeight: 44,
                borderRadius: 9999,
                border: "none",
                background: "#2563eb",
                color: "#fff",
                padding: "10px 20px",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Tekrar dene
            </button>
            <a
              href="/tr"
              style={{
                minHeight: 44,
                display: "inline-flex",
                alignItems: "center",
                borderRadius: 9999,
                border: "1px solid #22252a",
                color: "#e4e4e7",
                padding: "10px 20px",
                fontSize: 14,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Ana sayfaya dön
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
