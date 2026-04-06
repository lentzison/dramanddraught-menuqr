-- AlterTable
ALTER TABLE "VisitorSession" ADD COLUMN "source" TEXT;

-- CreateIndex
CREATE INDEX "VisitorSession_source_idx" ON "VisitorSession"("source");
