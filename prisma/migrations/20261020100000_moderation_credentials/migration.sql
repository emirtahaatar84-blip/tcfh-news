-- Owner moderation: silent story removal log + e-mail/password auth.

-- AlterTable: credentials (e-mail + password) sign-up support.
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;

-- CreateTable: silent removal log for moderated stories.
CREATE TABLE "RemovedStory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "newsId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "removedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
