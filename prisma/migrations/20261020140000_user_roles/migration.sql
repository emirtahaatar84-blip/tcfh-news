-- Kullanıcı rolleri: yeni kayıtlar varsayılan olarak 'user',
-- sahip hesaplar 'owner' olarak işaretlenir.

ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'user';

UPDATE "User" SET "role" = 'owner'
WHERE "email" IN ('emirtahaatar@gmail.com', 'emirtahaatar84@gmail.com');
