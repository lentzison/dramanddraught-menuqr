-- Limited-time offers that layer over normal day specials.

CREATE TABLE "LimitedTimeOffer" (
  "id" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "image" TEXT,
  "drinks" JSONB,
  "daysOfWeek" "DayOfWeek"[] DEFAULT ARRAY[]::"DayOfWeek"[],
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LimitedTimeOffer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LimitedTimeOffer_locationId_fkey" FOREIGN KEY ("locationId")
    REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "LimitedTimeOffer_locationId_isActive_idx"
  ON "LimitedTimeOffer"("locationId", "isActive");