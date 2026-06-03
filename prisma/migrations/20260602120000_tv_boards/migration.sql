-- CreateTable
CREATE TABLE "TvBoard" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rotateSeconds" INTEGER NOT NULL DEFAULT 15,
    "modules" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TvBoard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TvBoard_locationId_idx" ON "TvBoard"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "TvBoard_locationId_slug_key" ON "TvBoard"("locationId", "slug");

-- AddForeignKey
ALTER TABLE "TvBoard" ADD CONSTRAINT "TvBoard_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
