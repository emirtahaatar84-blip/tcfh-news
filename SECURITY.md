# Güvenlik Politikası

## Bildirim

Güvenlik açığı bulduysanız **herkese açık issue açmayın**.
`security@example.com` adresine iletin (kurulumunuzda kendi adresinizi yazın).

Bildirimde bulunun:
- Etkilenen dosya/uç nokta
- Tekrar üretme adımları
- Etki değerlendirmesi

Yanıt süresi hedefi: 72 saat içinde ilk dönüş.

## Desteklenen sürümler

Yalnızca en son sürüm güvenlik düzeltmesi alır.

## Bilinen tasarım kararları

| Konu | Karar | Gerekçe |
|---|---|---|
| Çerez | Yok | KVKK: yalnızca `localStorage` tercihler |
| Anahtar saklama | Sunucu (env veya DB) | İstemciye asla gönderilmez (`hasApiKey` boolean döner) |
| Admin oturumu | HttpOnly + HttpOnly çerez / Basic Auth yedeği | Sahip oturumu birincil |
| Rate limit | Bellek içi, IP saklamaz | Kişisel veri tutmadan kötüye kullanımı engeller |
| SSRF | RSS URL'leri `isValidHttpUrl` ile doğrulanır | İç ağ adreslerine erişim engellenir |
| JSON-LD | `JSON.stringify` (escape `</script>`) | XSS'e karşı ek katman |

## Üretim kontrol listesi

- [ ] `AUTH_SECRET` rastgele 32+ bayt
- [ ] `ADMIN_PASSWORD` güçlü, örnek değer değil
- [ ] `OWNER_EMAIL` açıkça tanımlı (boşsa yönetim paneli kimseye açık değildir)
- [ ] `.env` git'e eklenmemiş
- [ ] HTTPS + güvenlik başlıkları aktif
- [ ] Yedekleme: `prisma/data/news.db` düzenli kopyalanıyor
