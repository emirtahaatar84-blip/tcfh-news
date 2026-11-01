-- FTS5 tam metin arama indeksi.
--
-- NOT: FTS5 sanal tablosu Prisma şemasında TANIMLANMAZ (Prisma sanal
-- tabloları desteklemez). Bu yüzden indeks yalnızca bu SQL migration'ı ile
-- kurulur; Prisma istemcisi aramayı `$queryRaw` üzerinden yapar.
--
-- `contentless_delete=1` seçildi: indekste metin kopyası TUTULMAZ, yalnızca
-- ters indeks saklanır (disk tasarrufu). Böylece içerik tablosuyla senkron
-- için "delete" komutuna eski değerleri geçirmek gerekmez; trigger'lar düz
-- DELETE/INSERT kullanır. Gereken en düşük SQLite sürümü 3.43'tür
-- (Prisma 5.22 motoru SQLite 3.45+ ile gelir).
--
-- `remove_diacritics 2` Türkçe harfleri (ç, ğ, ö, ş, ü, â) indeksleme
-- sırasında ASCII karşılığına indirger; noktasız "ı" harfi diakritik
-- olmadığı için korunur ve sorgu tarafında i/ı varyantları denenir.

CREATE VIRTUAL TABLE "NewsItemFts" USING fts5(
  title,
  summary,
  body,
  tags,
  content = '',
  contentless_delete = 1,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- Mevcut kayıtları indeksle (yalnızca yayında olanlar).
INSERT INTO "NewsItemFts" (rowid, title, summary, body, tags)
SELECT rowid, title, summary, coalesce(detailedContent, ''), tags
FROM "NewsItem"
WHERE removedAt IS NULL;

-- ─── Senkron trigger'ları ────────────────────────────────────────────────────

-- Yeni haber eklendiğinde indeksle.
CREATE TRIGGER "NewsItemFts_ai"
AFTER INSERT ON "NewsItem"
BEGIN
  INSERT INTO "NewsItemFts" (rowid, title, summary, body, tags)
  VALUES (new.rowid, new.title, new.summary, coalesce(new.detailedContent, ''), new.tags);
END;

-- Haber silindiğinde indeksten düşür.
CREATE TRIGGER "NewsItemFts_ad"
AFTER DELETE ON "NewsItem"
BEGIN
  DELETE FROM "NewsItemFts" WHERE rowid = old.rowid;
END;

-- İndekslenen alanlardan biri değiştiğinde kaydı yeniden yaz.
CREATE TRIGGER "NewsItemFts_au"
AFTER UPDATE OF title, summary, detailedContent, tags ON "NewsItem"
BEGIN
  DELETE FROM "NewsItemFts" WHERE rowid = old.rowid;
  INSERT INTO "NewsItemFts" (rowid, title, summary, body, tags)
  VALUES (new.rowid, new.title, new.summary, coalesce(new.detailedContent, ''), new.tags);
END;
