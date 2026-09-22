-- CreateEnum
CREATE TYPE "PlayStyle" AS ENUM ('SP', 'DP');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('BEGINNER', 'NORMAL', 'HYPER', 'ANOTHER', 'LEGGENDARIA');

-- CreateEnum
CREATE TYPE "TierKind" AS ENUM ('JIRIKI', 'KOJINSA', 'UNRATED');

-- CreateTable
CREATE TABLE "Song" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT,
    "genre" TEXT,
    "version" INTEGER,
    "bpm" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Song_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chart" (
    "id" SERIAL NOT NULL,
    "songId" INTEGER NOT NULL,
    "playStyle" "PlayStyle" NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "level" INTEGER NOT NULL,
    "notes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sheet" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "playStyle" "PlayStyle" NOT NULL,
    "level" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tier" (
    "id" SERIAL NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "kind" "TierKind" NOT NULL DEFAULT 'JIRIKI',

    CONSTRAINT "Tier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SheetEntry" (
    "id" SERIAL NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "tierId" INTEGER NOT NULL,
    "chartId" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SheetEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Song_title_idx" ON "Song"("title");

-- CreateIndex
CREATE INDEX "Chart_playStyle_level_idx" ON "Chart"("playStyle", "level");

-- CreateIndex
CREATE UNIQUE INDEX "Chart_songId_playStyle_difficulty_key" ON "Chart"("songId", "playStyle", "difficulty");

-- CreateIndex
CREATE UNIQUE INDEX "Sheet_slug_key" ON "Sheet"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tier_sheetId_order_key" ON "Tier"("sheetId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Tier_sheetId_name_key" ON "Tier"("sheetId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "SheetEntry_sheetId_chartId_key" ON "SheetEntry"("sheetId", "chartId");

-- AddForeignKey
ALTER TABLE "Chart" ADD CONSTRAINT "Chart_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tier" ADD CONSTRAINT "Tier_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SheetEntry" ADD CONSTRAINT "SheetEntry_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SheetEntry" ADD CONSTRAINT "SheetEntry_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "Tier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SheetEntry" ADD CONSTRAINT "SheetEntry_chartId_fkey" FOREIGN KEY ("chartId") REFERENCES "Chart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
