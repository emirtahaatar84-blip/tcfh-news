-- X Stüdyo: post stilleri, taslak havuzu ve hashtag havuzu.

-- CreateTable
CREATE TABLE "XStyle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "emojiLevel" INTEGER NOT NULL DEFAULT 2,
    "maxEmoji" INTEGER NOT NULL DEFAULT 2,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "XDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "articleId" TEXT NOT NULL,
    "styleId" TEXT NOT NULL,
    "variants" TEXT NOT NULL DEFAULT '[]',
    "hashtags" TEXT NOT NULL DEFAULT '[]',
    "charCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "copiedAt" DATETIME,
    "publishedAt" DATETIME,
    "externalUrl" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "XDraft_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "NewsItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "XDraft_styleId_fkey" FOREIGN KEY ("styleId") REFERENCES "XStyle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HashTagPool" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tag" TEXT NOT NULL,
    "categoryId" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "lastUsedAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "XStyle_slug_key" ON "XStyle"("slug");
CREATE INDEX "XDraft_articleId_idx" ON "XDraft"("articleId");
CREATE INDEX "XDraft_status_createdAt_idx" ON "XDraft"("status", "createdAt");
CREATE UNIQUE INDEX "HashTagPool_tag_key" ON "HashTagPool"("tag");
CREATE INDEX "HashTagPool_categoryId_weight_idx" ON "HashTagPool"("categoryId", "weight");

-- ── Seed: 4 post stili ───────────────────────────────────────────────────────

INSERT INTO "XStyle" ("id", "name", "slug", "systemPrompt", "emojiLevel", "maxEmoji") VALUES
('xstyle_flas', 'Flaş Haber', 'flas',
'FLAŞ HABER stili. Yapı: 1 adet "🚨" emoji ile başla + kısa ve vurucu başlık (maksimum 8 kelime) + tek paragraf özet (2-3 cümle) + kısa kapanış cümlesi (durumu özetler, spekülasyon içermez). Dil: sade, soğuk, bildirimsel.',
1, 1),
('xstyle_spor', 'Spor İç Saha', 'spor-ic',
'SPOR İÇ SAHA stili. Yapı: "🚨 SON DAKİKA | {konu}" ile aç + ilgili kişi/ekip adını BÜYÜK HARFLE yaz + durum cümlesi (şu an ne biliniyor) + "bekleniyor" içeren bekleme cümlesi + okuyucuya merak sorusu (cevabı bilinmiyorsa). Ton: taraftar heyecanı ama bilgi soğuk.',
2, 2),
('xstyle_analiz', 'Analiz', 'analiz',
'ANALİZ stili. Yapı: net bir tespit cümlesi ile aç + destekleyici veri/ sayı (yalnız haberde varsa) + "Yani..." ile başlayan tek cümlelik yorum (haberin içeriğinden türetilmiş, yeni iddia içermeyen) + kapanış hashtag''i. Ton: uzman, ölçülü.',
1, 1),
('xstyle_konusma', 'Sohbet', 'konusma',
'SOHBET stili. Yapı: okuyucuya yöneltilmiş kısa bir soru ile aç + haberin çekirdek bilgisini 2-3 cümleyle ver + etkileşim sorusu ile kapat ("Sizce...?" gibi, cevabı haberde örtüşmeli). Ton: samimi, doğal konuşma dili.',
3, 3);

-- ── Seed: hashtag havuzu (kategori çapaları + konu etiketleri) ───────────────

INSERT INTO "HashTagPool" ("id", "tag", "categoryId", "weight") VALUES
('htag_1',  'gündem',      'Gündem',    5),
('htag_2',  'sondakika',   'Gündem',    5),
('htag_3',  'türkiye',     'Gündem',    4),
('htag_4',  'teknoloji',   'Teknoloji', 5),
('htag_5',  'yapayzeka',   'Teknoloji', 4),
('htag_6',  'ekonomi',     'Ekonomi',   5),
('htag_7',  'dolar',       'Ekonomi',   3),
('htag_8',  'borsa',       'Ekonomi',   3),
('htag_9',  'siyaset',     'Siyaset',   4),
('htag_10', 'spor',        'Spor',      5),
('htag_11', 'millitakım',  'Spor',      3),
('htag_12', 'süperlig',    'Spor',      3),
('htag_13', 'bilim',       'Bilim',     5),
('htag_14', 'uzay',        'Bilim',     3),
('htag_15', 'sağlık',      'Sağlık',    4),
('htag_16', 'dünya',       'Dünya',     4),
('htag_17', 'kültür',      'Kültür',    3);
