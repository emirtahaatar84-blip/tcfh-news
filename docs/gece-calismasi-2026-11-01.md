# 5 Saatlik Otonom Çalışma — 1 Kasım 2026 gece

## Tespit (canlı veriyle)

| Ölçüm | Değer | Yorum |
|---|---|---|
| Toplam haber | 4608 | — |
| **Tek kaynaklı** | **4093 (%89)** | Doğrulanmamış içerik baskın |
| 3+ kaynaklı | 84 (%1.8) | Gerçekten doğrulanmış çok az |
| Günlük üretim | 86 – 738 | **Aşırı**. 738/gün = 30/dk |
| Ortalama okunma | **1.15** | Kimse okumuyor |
| Teknoloji | 1212 | Kategori dengesizliği |

**Teşhis:** Sistem "her şeyi yayınla" modunda. Kullanıcının istediği
"gerekli haberler" için üç şey eksik:
1. **Önem skoru** — hangi haber gerçekten önemli, hangisi gürültü
2. **Tekrar bastırma** — aynı konudan 20 haber yayınlanıyor
3. **Akış sıralaması** — en yeni önce, önem yok sayılıyor

## Plan (5 saat)

| Saat | İş | Sorumlu |
|---|---|---|
| 0:00–1:15 | **Haber Önem Skoru** (`lib/importance.ts`) — 5 boyut, 0-100 | ben |
| 1:15–2:00 | **Akış sıralaması + "Öne çıkanlar"** — önem × tazelik | ben |
| 2:00–2:45 | **Tekrar bastırma** — aynı konudan 24 saatte 1 haber | ben |
| 2:45–4:15 | **FTS5 arama** — yazım toleransı, alaka sıralaması | subagent (backend) |
| 4:15–4:45 | **Testler** — önem skoru, tekrar, arama | subagent (testci) |
| 4:45–5:00 | Deploy + doğrulama + rapor | ben |

## Dokunulmayacaklar

- Portre hattı (stabil)
- Atıf motoru (stabil)
- Mevcut API sözleşmeleri (geriye uyumlu)
- KVKK: çerez yok, localStorage, IP hash

## Risk yönetimi

- Her adımda `tsc --noEmit` + `vitest run`
- Deploy öncesi DB yedeği
- Deploy sonrası health + örnek sayfa doğrulaması
- Sorun çıkarsa geri dönüş komutu raporun sonunda
