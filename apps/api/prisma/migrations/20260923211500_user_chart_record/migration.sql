-- CreateEnum
CREATE TYPE "ClearType" AS ENUM ('NO_PLAY', 'FAILED', 'ASSIST', 'EASY', 'CLEAR', 'HARD', 'EX_HARD', 'FC');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChartRecord" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "chartId" INTEGER NOT NULL,
    "clearType" "ClearType" NOT NULL DEFAULT 'NO_PLAY',
    "exScore" INTEGER,
    "missCount" INTEGER,
    "playedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChartRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChartRecord_userId_idx" ON "ChartRecord"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChartRecord_userId_chartId_key" ON "ChartRecord"("userId", "chartId");

-- AddForeignKey
ALTER TABLE "ChartRecord" ADD CONSTRAINT "ChartRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartRecord" ADD CONSTRAINT "ChartRecord_chartId_fkey" FOREIGN KEY ("chartId") REFERENCES "Chart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

