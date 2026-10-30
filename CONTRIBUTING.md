# Katkı Rehberi

## Kurulum

```bash
git clone <repo> && cd tcfh-news
cp .env.example .env
npm install
npx prisma migrate deploy
npm run dev
```

## Göndermeden önce

```bash
npm run typecheck     # TypeScript — 0 hata
npm test              # Vitest — hepsi geçmeli
npm run build         # üretim derlemesi
npm run tokens:check  # tasarım token'ları güncel mi
npm run spacing:audit # 8 pt ölçeği ihlali yok mu
```

## Kurallar

- **Gizli anahtar commit etmeyin.** `.env`, `*.db`, `prisma/data/` gitignore'dadır.
- **Kişisel veri eklemeyin.** E-posta/adres varsayılanı boş bırakılır (`OWNER_EMAIL`, `NEXT_PUBLIC_CONTACT_EMAIL`).
- **Sayılar tek yerde.** Eşik/ağırlık/saat değerleri `lib/hq/config.ts` içinde olmalı; koda gömülü sayı eklemeyin.
- **Boşluk sistemi.** Yalnızca `--space-*` token'ları; ham `px` ve `p-3.5` gibi ölçek dışı sınıflar derlenmez.
- **Stil.** Türkçe açıklama, İngilizce değişken adı.
- **Test.** Yeni davranış → yeni test. Kural değişikliği → testi de güncelle.

## Yeni AI sağlayıcısı ekleme

1. `lib/llm-providers.ts` → `LLM_PROVIDERS` tablosuna giriş ekle.
2. Şema OpenAI uyumlu değilse `callLlm` içine uyarlayıcı ekle (`callAnthropic` / `callGemini` örnekleri).
3. Panel otomatik listeler; ek arayüz gerekmez.

## Commit mesajı

```
feat(portrait): PUS eşiğini 70'e çıkar
fix(citation): boş ifade sonsuz döngüsü
docs(readme): çoklu sağlayıcı tablosu
```

## Güvenlik açığı bildirimi

Herkese açık issue açmayın; `SECURITY.md` dosyasındaki adımı izleyin.
