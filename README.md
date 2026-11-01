# TCFH News — Yapay Zekâ Destekli Haber Sentez Platformu

RSS kaynaklarını tarayıp aynı olayı haberleştiren içerikleri kümeleyen, LLM ile **özgün Türkçe haber** üreten ve yayın öncesi/sonrası otomatik kalite kapılarından geçiren açık kaynak bir haber platformu.

> **Lisans:** AGPL-3.0-or-later. Ağ üzerinden hizmet olarak çalıştırıyorsanız, kaynak kodunuzu kullanıcılarınıza açmanız gerekir.

---

## Özellikler

| Modül | Açıklama |
|---|---|
| **Haber sentezi** | RSS → olay kümeleme → LLM sentez → yayın öncesi denetim → saatlik kalite denetimi |
| **Çoklu AI sağlayıcı** | OpenAI, Anthropic (Claude), Google Gemini, DeepSeek, OpenRouter, Groq, Mistral, yerel Ollama |
| **Portreler** | Kamuya mal olmuş kişi/kurum/olay dosyaları; PUS skoru (0-100), 8 kalite kapısı, en az 3 bağımsız kaynak |
| **Geçmiş araştırması** | Dava/soruşturma/vefa gibi olaylarda Google Haberler arşivinden geçmiş bağlam toplama |
| **Atıf motoru** | 4 zorunlu ön koşul + ağırlıklı skor; kesinlik > kapsama (yanlış atıf yok) |
| **Otomatik kategori** | Çok etiketli sınıflandırıcı (4 sinyal), Türkçe ek soyma, belirsizlik tespiti |
| **Münazara** | Lise/üniversite formatlarında kaynaklı münazara dosyaları |
| **Podcast** | YZ ile üretilen bültenler + TTS seslendirme |
| **X Stüdyo** | Sosyal medya post taslakları |
| **Video Haber** | YouTube → haber dönüşümü |
| **Çift dil** | Türkçe / İngilizce |

**KVKK uyumlu:** çerez yok, analitik yok, kullanıcı profilleme yok. Tercihler yalnızca `localStorage` (sürümlü).

---

## Hızlı başlangıç

```bash
git clone https://github.com/<kullanıcı>/tcfh-news.git
cd tcfh-news
cp .env.example .env      # ADMIN_PASSWORD ve AUTH_SECRET doldurun
npm install
npx prisma migrate deploy # SQLite şeması
npm run dev               # http://localhost:3000
```

### Minimum `.env`

```bash
ADMIN_PASSWORD="güçlü-bir-şifre"
AUTH_SECRET="$(openssl rand -hex 32)"
SITE_URL="http://localhost:3000"

# AI sağlayıcı (panelden de değiştirilebilir)
LLM_PROVIDER="openai"
LLM_API_KEY="sk-..."
LLM_MODEL="gpt-4o-mini"
```

## AI sağlayıcı seçimi

Panelden **Yönetim → Ayarlar → AI** altından sağlayıcı seçilir; anahtar yalnızca sunucuda saklanır.

| Sağlayıcı | Base URL | Örnek model |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Anthropic | `https://api.anthropic.com/v1` | `claude-sonnet-4-20250514` |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta` | `gemini-2.0-flash` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| OpenRouter | `https://openrouter.ai/api/v1` | `anthropic/claude-3.5-sonnet` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| Mistral | `https://api.mistral.ai/v1` | `mistral-large-latest` |
| Ollama (yerel) | `http://localhost:11434/v1` | `llama3.1` |

Yeni sağlayıcı eklemek için `lib/llm-providers.ts` içine bir giriş ekleyin.

## Docker

```bash
cp .env.example .env
docker compose up -d --build
```

SQLite veritabanı `micro_news_data` adlı named volume'da kalıcıdır. Migration'lar açılışta otomatik uygulanır.

## Dağıtım

```bash
VPS_HOST=1.2.3.4 VPS_USER=root REMOTE_DIR=/opt/news ./deploy.sh
```

## Test

```bash
npm run typecheck
npm test
npm run build
npm run tokens:check
npm run spacing:audit
```

## Mimari

```
RSS kaynakları ──(10 dk)──► RawFeedItem (2 saat ömür)
      │
      ├─► olay kümeleme (başlık benzerliği)
      ├─► sınıflandırıcı (kategori + @etiket)
      ├─► geçmiş araştırması (dava/soruşturma → Google Haberler arşivi)
      ▼
   LLM sentez ─► yayın öncesi denetim ─► NewsItem ─┬─► atıf motoru
                                                   ├─► görsel üretimi
                                                   └─► saatlik kalite denetimi

Portre hattı: 08:30 / 19:00 / 00:15 (Europe/Istanbul)
   tarama → PUS skoru → araştırma (≥3 bağımsız kaynak) → 8 kapı → gölge mod → yayın
```

## Dizin yapısı

```
app/                Next.js App Router (tr/en) + REST API
components/         Arayüz bileşenleri
lib/                İş mantığı
  hq/               config, PUS, sınıflandırıcı, atıf, kapılar, zamanlayıcı
  llm-providers.ts  Çoklu AI sağlayıcı katmanı
  processor.ts      Haber sentezi
  portrait-*.ts     Portre hattı
  citations.ts      Atıf çözümleme
prisma/             Şema + migration'lar
tests/              Vitest (155+ test)
docs/               Mimari ve modül belgeleri
```

## Felsefe

1. **Doğrulanmamış iddia yayına girmez.** Her olgu bir kaynağa bağlanır.
2. **Kaynak sayısı şeffaf.** Tek kaynaklı haberler "Tek kaynak" rozetiyle işaretlenir.
3. **Kesinlik > kapsama.** Atıf kurulamıyorsa hiç kurulmaz.
4. **İnsan onayı opsiyonel, ama görünür.** Gölge mod ve moderasyon paneli.

## Katkı

`CONTRIBUTING.md` dosyasına bakın.

## Yol haritası

**Mevcut sürüm: `0.2.5` (alfa)** · Beta: `0.5.0`

| Faz | Sürüm | Konu |
|---|---|---|
| 6 | 0.3.0 | Arama ve keşif (FTS5) |
| 7 | 0.3.5 | PWA ve çevrimdışı |
| 8 | 0.4.0 | SEO ve structured data |
| 9 | 0.4.5 | Performans |
| **10** | **0.5.0** | **BETA** — editör ve moderasyon |
| 11–15 | 0.5.5 → 0.7.5 | Analitik, bülten, içerik, CI, kararlılık |

Ayrıntı: [ROADMAP.md](ROADMAP.md) · Değişiklikler: [CHANGELOG.md](CHANGELOG.md)

## Lisans

GNU Affero General Public License v3.0 or later — [LICENSE](LICENSE).
