# AUDIT.md — example.com Platform Denetimi (Faz 1)

> Tarih: 22 Ekim 2026 · Kapsam: Faz 1 (Keşif & Sözleşme)
> Ayrıntılı raporlar: [backend-audit.md](phase1/backend-audit.md) · [frontend-audit.md](phase1/frontend-audit.md) · [API_CONTRACT.md](API_CONTRACT.md)

## 1. Yönetici Özeti

example.com; 29 RSS kaynağını (yerli + yabancı) izleyen, aynı olayları kümeleyip
birleştiren, LLM ile özgün Türkçe haber üreten, yayın öncesi (qwen3-vl-30b) ve saatlik
sonrası (gemma-4-31b) YZ kalite denetiminden geçiren bir haber sentez platformudur.
Kimlik (Google + e-posta), roller (owner/user), TTS sesli özet, X Stüdyo, YouTube
video-haber, tek konuşmacılı podcast (Edge TTS sabit ses) ve owner-only moderasyon
paneli canlıdır. AdSense (ads.txt) ve Search Console doğrulaması yapılmıştır.

**Faz 1 sonucu:** Temel sağlam; gelir katmanı (reklam/sponsor/premium), PWA, blog,
RAG destekli asistan, bülten ve gamification sıfırdan inşa edilecek.

## 2. Stack

| Katman | Teknoloji |
|---|---|
| Framework | Next.js 16 (App Router, force-dynamic SSR) + TypeScript |
| Stil | Tailwind CSS (koyu tema: #0e0f12 / #16181c / #22252a) |
| Veritabanı | Prisma + SQLite (Docker volume) — 15 model, 11 migration |
| Kimlik | Auth.js v5 (Google OAuth + Credentials), JWT stratejisi, roller |
| AI | Evren LLM API (sentez: qwen3.8-flash-next · denetçi: qwen3-vl-30b · saatlik denetim: gemma-4-31b) |
| TTS | Evren voxcpm2 (haber özetleri + "Potkes" podcast seslendirmesi; tek istekte tam bülten) |
| Altyapı | Docker (tcfh-news) · Caddy (example.com apex, news.* 301) · Cloudflare |

## 3. Sayısal Envanter

| Metrik | Değer |
|---|---|
| DB modelleri | 15 (4 Auth + 11 domain) |
| API rotaları | 40 dosya / ~46 HTTP ucu |
| Sayfalar | 13 rota (+ error/loading/not-found, sitemap, robots) |
| Bileşenler | 35 (%74 istemci bileşeni) |
| Env anahtarı | 22 (bkz. .env.example) |
| RSS kaynakları | 29 aktif (yalnızca üretim DB'sinde — seed yok) |
| i18n | tr/en, 379 yaprak anahtar, simetrik ✅ |

## 4. Kritik Bulgular (öncelik sırasıyla)

1. **AUTH_SECRET güvensiz fallback** — compose boş değer geçebilir; kod
   `"micro-news-insecure-dev-secret-change-me"` sabitine düşer → JWT taklit riski.
   Faz 2 öncesi düzeltilmeli (fallback kaldır + üretimde zorunlu kıl).
2. **TTFB ~1.7 sn** — tüm sayfalar force-dynamic; cache/ISR yok. Lighthouse > 90
   hedefinin en büyük engeli. Feed + haber detayı ISR adayı (Faz 10'da, Faz 2'de değil).
3. **next/image hiç kullanılmıyor** — 6 ham `<img>`; LCP görseli eager yükleniyor.
4. **Bellek içi iş takibi** — X Stüdyo/podcast/video/process işleri `globalThis`;
   restart'ta kaybolur (tek örnekli deployment'ta kabul edilebilir, not edildi).
5. **Erişilebilirlik** — ikon düğmeleri ~26px (44px hedef altında);
   `text-zinc-600` kontrast ~2.9:1 (WCAG AA dışı); 27× 11px metin.
6. **4 sayfa boş stub** — blog, explore, assistant, achievements (Faz 3-5-7'de dolacak).
7. **TTS_VOICE env'i ölü** — compose'da tanımlı, kod hardcoded "default" gönderiyor.
8. **RSS seed yok** — yeni ortam kurulumu kaynakları elle ister.

## 5. Güvenlik Durumu

- Owner koruması: `isAdminAuthorized` (owner oturumu + Basic Auth fallback) tüm
  yönetim uçlarında ✅
- Kimlik karışması düzeltildi: sessiz hesap birleştirme engelli (signIn guard) ✅
- Podcast/video yayın kilitleri: playedAt olmadan publish 403 ✅
- Riskler: AUTH_SECRET fallback (bkz. bulgu 1); rate-limit yalnızca X Stüdyo'da;
  cron uçları Basic Auth ile açık (sızıntı halinde içerik bombalanabilir —
  CRON_SECRET_KEY desteği değerlendirilebilir)

## 6. Faz Bazlı Eksik Analizi

| Faz | Konu | Mevcut Durum | Gereken |
|---|---|---|---|
| 2 | PWA | Yok | manifest, SW (cache-first/network-first), VAPID push, kategori aboneliği |
| 3 | Blog | Boş stub sayfa | Post modeli, liste+detay+editör, RSS feed, okuma süresi, sayaç |
| 4 | UX | Tema/yazı boyutu/sessiz saatler yok; onboarding yok | Tercihler API + UI |
| 5 | AI Asistan 2.0 | Mevcut asistan stub; RAG yok | Embedding + vektör arama + kaynaklı cevap + kota |
| 6 | Bülten + Podcast | Podcast ✅ (tek konuşmacı); bülten yok | Sabah 08.00 cron, e-posta, TTS sürümü |
| 7 | Başarılar | Sayfa stub; veri modeli yok | Puan/rozet/seviye/streak |
| 8 | Gelir | ads.txt ✅; reklam/sponsor/premium kodu yok | AdSlot, Sponsor modeli, ödeme webhook, feature flags |
| 9 | Yasal | KVKK/şartlar/telif/about ✅ | Künye (BIK), UETS alanı, global AI etiketi, veri silme formu |
| 10 | Performans | TTFB 1.7s, img optimizasyonsuz, Lighthouse ölçülemedi (Chrome yok) | ISR, next/image, WebP, schema.org, analytics |

## 7. Performans Baseline

- Lighthouse çalıştırılamadı (ortamda Chrome/Chromium yok) — Faz 10'da CI veya
  yerel makinede ölçülecek. Manuel: **TTFB 1.07–2.54 sn (ort. ~1.7 sn)**, HTML ~102 KB,
  15 script etiketi. Hedef: LCP < 2.5 sn, CLS < 0.1, mobil > 90.

## 8. Karar Günlüğü

- SQLite korunur (tek örnek, Docker volume) — Postgres geçişi yalnızca çoklu örnek
  ihtiyacında (docs/kantan-architecture.md planı geçerli).
- Ödeme sağlayıcısı Faz 8'de kararlaştırılacak (iyzico/PayTR) — API sözleşmesi
  o fazda teslim edilecek.
- Faz sırası değişmez; her faz = plan → kod → test → commit.
