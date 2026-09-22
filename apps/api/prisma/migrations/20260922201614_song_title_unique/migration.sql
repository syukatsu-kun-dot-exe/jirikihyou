-- DropIndex
DROP INDEX "Song_title_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Song_title_key" ON "Song"("title");

