-- Per-spirit printed-menu descriptions (menuqr-side overlay on the read-only
-- Bartender spirit catalog, keyed by SpiritProduct.productId).
CREATE TABLE "SpiritNote" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "spiritName" TEXT NOT NULL,
    "description" TEXT,
    "aiFlags" JSONB,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SpiritNote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SpiritNote_productId_key" ON "SpiritNote"("productId");
