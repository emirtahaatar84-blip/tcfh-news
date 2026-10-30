# Portre Modülü (Ek Bölüm 9)

Dış hikâye akışını izleyen, "ilgi çekici" olanı puanlayan, kaynaklı araştırma
yapan ve sitede yayınlanan bir **Portre** üreten modül.

## 1. Akış diyagramı

```
                    ┌──────────────────────────────────────────────┐
                    │  kantan.news/feed  (SPA → /api/news JSON)    │
                    └───────────────────┬──────────────────────────┘
                                        │ 1) fetchFeedStories()
                        ┌───────────────▼───────────────┐
                        │ RSS/Atom → JSON → HTML <article> → SPA keşfi │
                        └───────────────┬───────────────┘
                                        │ ok:false → RUN DURUR (uydurma yok)
                        ┌───────────────▼───────────────┐
                        │ 2) 48 saat penceresi + tekilleştirme        │
                        └───────────────┬───────────────┘
                        ┌───────────────▼───────────────┐
                        │ 3) scoreStories()  5 boyut × ağırlık        │
                        └───────────────┬───────────────┘
                        ┌───────────────▼───────────────┐
                        │ 4) eşik ≥ 7.0 → kuyruk (günlük kota 2)      │
                        └───────────────┬───────────────┘
                        ┌───────────────▼───────────────┐
                        │ 5) researchStory()  21 RSS + GDELT + Wiki   │
                        │    ≥3 bağımsız alan adı zorunlu             │
                        └───────────────┬───────────────┘
                        ┌───────────────▼───────────────┐
                        │ 6) generatePortraitDraft()  (LLM, JSON)     │
                        │    her iddia → sourceIndex                  │
                        └───────────────┬───────────────┘
                        ┌───────────────▼───────────────┐
                        │ 7) runAutoChecks()                          │
                        └───────┬───────────────┬───────┘
                             geçti             geçmedi
                                │                 │
                        published          review + neden
                                │
                        ┌───────▼───────────────┐
                        │ 9) 7 gün kuralı: aynı konu → üretme,       │
                        │    mevcut portreye güncelleme notu düş     │
                        └────────────────────────────┘
```

## 2. Feed alan eşlemesi

Kaynak `https://kantan.news/feed` bir SPA'dır (HTML kabuğu). Okuyucu sırayla
RSS/Atom → JSON → HTML `<article>` → SPA keşfi (`/api/news?limit=50`) dener.
Gerçek eşleme (JSON stratejisi, 50/50 kayıt):

| Feed alanı | İç alan | Örnek |
|---|---|---|
| `title` | `title` | "SİPER Ürün-2 Uçuş Esnasında…" |
| `slug`/`link` | `url` | `https://kantan.news/siper-urun-2-…` |
| `published_at` | `publishedAt` | `2026-10-25T15:17:09.000Z` |
| `social_summary` → `excerpt` → `summary` | `summary` | 1-2 cümle |
| `category` | `category` | `Savunma` (→ site kategorisi) |
| `tags` (virgüllü) | `tags[]` | `SİPER, Haluk Görgün, …` |
| `image_url` | `imageUrl` | `/uploads/…jpg` (mutlaklaştırılır) |
| `image_credit` | `imageCredit` | `DHA` |
| `id` | `externalId` → `sourceKey` | `kantan.news:22291` |
| `original_link` | `originalUrl` | dış kaynak |

## 3. Puanlama tablosu (gerçek çalıştırma)

Ağırlıklar: kamu yararı %30 · Türkiye yakınlığı %25 · gelişme %20 ·
özgünlük %15 · portre uyumu %10 · eşik **7.0**.

| # | Hikâye | Kamu | TR | Gelişme | Özgün | Portre | **Toplam** | Karar |
|---|---|---|---|---|---|---|---|---|
| 1 | SİPER Ürün-2 hedef değiştirdi | 10.0 | 9.9 | 6.0 | 10.0 | 9.0 | **8.8** | kuyruk → portre |
| 2 | MKE TOLGA savaş gemisinde | 10.0 | 8.4 | 6.0 | 9.9 | 6.0 | **8.4** | kuyruk (kota doldu) |
| 3 | Elektrik kurulu gücü 127 bin MW | 10.0 | 10.0 | 4.0 | 9.7 | 8.5 | **8.0** | kuyruk |
| 4 | Uçangöz yarışması şampiyonluğu | 8.0 | 8.9 | 6.0 | 9.4 | 6.0 | **8.0** | kuyruk |
| 5 | AKSUNGUR SİHA sualtı dinleme | 10.0 | 9.3 | 4.0 | 9.3 | 6.0 | **8.0** | kuyruk |
| 6 | Zayıflama ilaçları | 9.6 | 5.0 | 6.0 | 9.0 | 6.0 | **6.9** | eşik altı → atlandı |

Gerekçe örneği (1. satır):
> Kamu yararı 10/10 · Türkiye bağı 9.9/10 · Gelişme 6/10 · Özgünlük 10/10 ·
> Portre uyumu 9/10. Kişi odaklı, unvanlı anlatım (Haluk Görgün).

## 4. Bileşen listesi

| Katman | Dosya |
|---|---|
| Feed okuyucu | `lib/kantan-feed.ts` |
| Puanlama | `lib/portrait-score.ts` |
| Araştırma | `lib/research.ts` |
| Taslak + kontroller | `lib/portrait-generate.ts` |
| Orkestrasyon | `lib/portrait-pipeline.ts` |
| DTO / filtre | `lib/portrait-types.ts`, `lib/portrait-query.ts` |
| API | `app/api/cron/portrait/route.ts`, `app/api/portraits/route.ts`, `app/api/portraits/[id]/view/route.ts`, `app/api/admin/portraits/route.ts`, `app/api/admin/portraits/[id]/route.ts` |
| Sayfalar | `app/[lang]/portreler/page.tsx`, `app/[lang]/portreler/[slug]/page.tsx` |
| Arayüz | `components/PortraitCard.tsx`, `PortraitFilters.tsx`, `PortraitStrip.tsx`, `PortraitViewTracker.tsx`, `components/admin/PortraitManager.tsx` |
| Veri | `Portrait`, `PortraitSource`, `PortraitCandidate`, `PortraitRun` |

## 5. Otomatik kontrol listesi

```ts
// lib/portrait-generate.ts → runAutoChecks()
push("En az 3 bağımsız kaynak", domainCount >= 3, `bulunan: ${domainCount}`);

push("Tüm maddeler kaynak numarasına bağlı",
     outOfRange === 0 && allClaims.length > 0);

push("Yapı tamam (3 / 4-10 / 5 / 3-5)",
     whyNow === 3 && timeline >= 4 && keyFacts === 5 && faqs >= 3);

push("Tek cümlede özet en fazla 25 kelime", 0 < words <= 25);

push("Başlık 90 karakteri aşmıyor", 0 < title.length <= 90);

// Alıntı yalnızca kaynak metinde BİREBİR geçiyorsa kalır; aksi hâlde kaldırılır.
push("Alıntı kaynakta birebir doğrulandı", verbatim);

// KVKK md. 6 — özel nitelikli kişisel veri taraması (8 kalıp)
push("Özel nitelikli kişisel veri yok (KVKK md. 6)", violation === null);

// Reşit olmayan özne
push("Reşit olmayan özne yok", !(age && child));

push("Metin yeterli uzunlukta", fullText.length >= 400);
```

Herhangi bir madde düşerse portre **yayınlanmaz**: `status = "review"`,
`reviewNotes` alanına neden yazılır ve admin panelinde görünür.

## 6. Örnek portre taslağı (tam metin)

> **Canlıda ayrıca gerçek pipeline çıktısı var:** `BIMDTC-2026 Yarışmasında
> Şampiyonluk ve Yeni Savunma Hedefleri` — LLM tarafından, 3 bağımsız kaynaktan
> (sabah.com.tr, savunmasanayist.com, ntv.com.tr) üretildi ve otomatik
> kontrolleri geçerek yayınlandı: `/tr/portreler/bimdtc-2026-yarismasinda-sampiyonluk-ve-yeni-savunma-hedefleri`

> Bu dosya `scripts/portrait-sample.mjs` ile tohumlanır. Tüm olgular
> aşağıdaki kaynaklardan doğrulanmıştır; hiçbir bilgi tahmin edilmemiştir.

**Başlık:** SİPER Ürün-2: Havada Hedef Değiştiren Uzun Menzilli Savunma Katmanı
**Kategori:** Gündem · **Tür:** Kişi (Haluk Görgün) · **Okuma:** 3 dk ·
**Doğrulama:** 3 bağımsız kaynak

**Tek cümlede:** Türkiye'nin uzun menzilli hava savunma sistemi SİPER Ürün-2,
atış sonrası havada güncellenen yeni hedefini imha etti.

**Neden gündemde**
1. SİPER Ürün-2, yeni kabiliyetini başarılı bir atış testiyle sahada ispatladı.[1]
2. Testte füze, belirli bir hedefe ateşlendikten sonra havadayken güncellenen
   yeni hedefini imha etti.[2]
3. Cumhurbaşkanlığı Savunma Sanayii Başkanı Haluk Görgün, gelişmeyi sosyal
   medya hesabından duyurdu.[1]

**Kronoloji**
- 25 Ekim 2026 — SİPER Ürün-2, belirli bir hedefe doğru ateşlendi.[1]
- 25 Ekim 2026 — Uçuş sırasında hedef bilgisi güncellendi ve füze yeni hedefe
  yönlendirildi.[3]
- 25 Ekim 2026 — Füze, havada güncellenen yeni hedefini imha etti.[2]
- 25 Ekim 2026 — Haluk Görgün, testin sonucunu sosyal medya hesabından açıkladı.[1]
- 25 Ekim 2026 — Görgün, Çelik Kubbe'nin uzun menzilli katmanının
  güçlendirildiğini belirtti.[1]

**Bilinmesi gerekenler**
1. SİPER Ürün-2, Türkiye'nin uzun menzilli bölge hava ve füze savunma sistemidir.[1]
2. SİPER projesinde yaklaşık 1000 alt yüklenici firma görev alıyor.[1]
3. Testte hedef bilgisi uçuş sırasında güncellendi; füze yeni hedefine yönlendirildi.[3]
4. Görgün, ASELSAN, ROKETSAN ve TÜBİTAK SAGE ekiplerine teşekkür etti.[1]
5. Görgün'e göre sistem, Çelik Kubbe'nin uzun menzilli katmanını güçlendiriyor.[2]

**Alıntı**
> "Gök Vatan'ın savunmasında Çelik Kubbe'nin uzun menzilli katmanını
> güçlendiriyor, değişken tehditlere karşı reaksiyon kapasitemizi artırıyoruz."
> — Haluk Görgün, Cumhurbaşkanlığı Savunma Sanayii Başkanı · 25.10.2026[1]

**Kaynaklar çelişiyor:** ShiftDelete, SİPER Blok-2'nin uçuş sırasında hedef
değiştirme kabiliyetini "ilk kez" sergilediğini yazıyor. Anadolu Ajansı ve NTV
ise Görgün'ün aynı yeteneğin "bir kez daha" sergilendiği açıklamasına yer
veriyor. İki ifadeden hangisinin doğru olduğu kaynaklardan doğrulanamadı.

**Sık sorulanlar**
- *Testte tam olarak ne yapıldı?* — Füze belirli bir hedefe doğru ateşlendi;
  uçuş sırasında hedef bilgisi güncellendi ve füze yeni hedefini imha etti.[1]
- *Açıklamayı kim yaptı?* — Cumhurbaşkanlığı Savunma Sanayii Başkanı Haluk
  Görgün, sosyal medya hesabından.[1]
- *Projede hangi kurumlar görev alıyor?* — ASELSAN, ROKETSAN ve TÜBİTAK SAGE
  ekipleri ile yaklaşık 1000 alt yüklenici firma.[1]
- *Gelişme hangi savunma katmanıyla ilişkili?* — Çelik Kubbe'nin uzun menzilli
  katmanı.[2]

**Kaynaklar**

| # | Ad | Başlık | Tarih | URL | Tür |
|---|---|---|---|---|---|
| 1 | Anadolu Ajansı | SİPER Ürün-2 yeni kabiliyetini başarıyla test etti | 25.10.2026 | https://www.aa.com.tr/tr/bilim-teknoloji/siper-urun-2-yeni-kabiliyetini-basariyla-test-etti/4100275 | Haber |
| 2 | NTV | SİPER Ürün-2 yeni testi geçti. Havada hedef değiştirdi | 25.10.2026 17:32 | https://www.ntv.com.tr/turkiye/siper-urun-2-yeni-testi-gecti-havada-hedef-degistirdi-1747929 | Haber |
| 3 | ShiftDelete | SİPER Blok-2 Havada Hedef Değiştirerek Yeni Hedefini İmha Etti | 25.10.2026 | https://shiftdelete.net/siper-blok-2-havada-hedef-degistirerek-yeni-hedefini-imha-etti | Haber |
| 4 | Wikipedia (TR) | Haluk Görgün | — | https://tr.wikipedia.org/wiki/Haluk_G%C3%B6rg%C3%BCn | Başvuru |

**Bu portre nasıl hazırlandı:** Bu dosya 3 bağımsız haber kaynağından
derlendi; kaynakların erişim ve doğrulama tarihi 25 Ekim 2026. Her madde
kaynak numarasıyla işaretlenmiştir. Kaynak metni kopyalanmaz, kendi
cümlelerimizle yeniden yazılır.

**Uyarı:** Bu içerik yapay zeka desteğiyle, listelenen kamuya açık
kaynaklardan derlenmiştir. Hata içerebilir; bağlayıcı değildir.

## 6b. Akış ve telif kararları (son güncelleme)

**Akış artık portre tabanlı.** `/{lang}` = portre akışı (manşet + sonsuz kaydırma
+ kategori/arama filtreleri). Klasik sentezlenmiş haber akışı `/{lang}/haberler`
adresine taşındı. `/{lang}/portreler` listesi 308 ile ana akışa yönlenir; portre
**detay** sayfaları `/{lang}/portreler/{slug}` olarak korunur.

**Telif: kapak görselleri tamamen özgündür.**
- Dış kaynak (kantan.news, haber ajansı, fotoğrafçı) görselleri **hiç kullanılmaz**.
  Pipeline `story.imageUrl` / `story.imageCredit` alanlarını kopyalamaz.
- Her portre için `lib/portrait-image.ts` ile sıfırdan illüstrasyon üretilir:
  Cloudflare Workers AI (flux-1-schnell) → Pollinations yedeği → deterministik
  SVG fallback. İstemde "no real faces, no logos, no text" kuralı vardır;
  böylece hem telif hem kişilik hakkı riski doğmaz.
- Servis: `GET /api/portraits/:id/image` — JPEG `immutable` cache'li, üretim
  bitmeden SVG fallback. 1024×576.
- `coverImageCredit` = "Yapay zekâ ile üretilmiş özgün illüstrasyon".
- Mevcut kayıtları dönüştürmek için: `npm run portrait:fix-covers` (idempotent).

**Telif kontrol komutu:**
```bash
# Hiçbir portre dış görsel URL'i kullanmıyor olmalı (çıktı boş)
docker compose exec -T news node -e '
const {PrismaClient}=require("@prisma/client");const p=new PrismaClient();
p.portrait.findMany({select:{slug:true,coverImageUrl:true}}).then(rows=>{
  console.log(rows.filter(r=>/^https?:\/\//.test(r.coverImageUrl||"")).map(r=>r.slug));
  return p.$disconnect();
});'
```

## 7. KVKK ve editöryal sınırlar

- Portre yalnızca **kamuya mal olmuş** kişi/kurum/olaylar hakkındadır.
- Özel nitelikli veri (sağlık, cinsel hayat, din, etnik köken, siyasi görüş,
  sendika üyeliği, adli sicil) 8 regex kalıbıyla taranır; tespit edilirse
  yayın engellenir.
- Reşit olmayan özne tespitinde portre üretilmez.
- Kaynak gösterimi zorunlu; alıntı yalnızca kaynakta birebir geçiyorsa kalır.
- Kullanıcıdan veri toplanmaz; okunma sayacı **toplu** (kişi bazlı değil),
  tekilleştirme cihazda `sessionStorage` ile yapılır.
- Uyar-Kaldır: içerik `status = "removed"` + `removedAt` ile yumuşak kaldırılır;
  talep e-posta ile alınır (form yok).

## 8. Ortam değişkenleri ve komutlar

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `PORTRAIT_FEED_URL` | `https://kantan.news/feed` | Dış akış adresi |
| `PORTRAIT_WINDOW_HOURS` | `48` | Yalnızca son N saat |
| `PORTRAIT_PER_DAY` | `2` | Günlük portre kotası |
| `PORTRAIT_MAX_PER_RUN` | `2` | Çalıştırma başına üst sınır |
| `PORTRAIT_AUTO_PUBLISH` | `true` | `false` → her şey incelemeye düşer |
| `PORTRAIT_USE_GDELT` | `true` | GDELT açık veri kaynağı |
| `ENABLE_PORTRAIT_CRON` | `true` | 6 saatlik dahili zamanlayıcı |

```bash
# Yalnızca puanla (yayın yapmaz)
curl "https://…/api/cron/portrait?dry=1&key=$CRON_SECRET_KEY"

# Hattı çalıştır (arka plan, 202)
curl "https://…/api/cron/portrait?key=$CRON_SECRET_KEY"

# Senkron çalıştır ve özeti gör
curl "https://…/api/cron/portrait?wait=1&key=$CRON_SECRET_KEY"

# Örnek portreyi tohumla (idempotent)
npm run portrait:sample
```
