-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateTable
CREATE TABLE "public"."Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'NC',
    "zipCode" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "hours" JSONB,
    "links" JSONB,
    "description" TEXT,
    "image" TEXT,
    "qrCode" TEXT,
    "menuUrl" TEXT,
    "specialText" TEXT,
    "features" TEXT[],
    "facebook" TEXT,
    "instagram" TEXT,
    "twitter" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DayTheme" (
    "id" TEXT NOT NULL,
    "dayOfWeek" "public"."DayOfWeek" NOT NULL,
    "locationId" TEXT,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "halfPriceConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DayTheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DailySpecial" (
    "id" TEXT NOT NULL,
    "dayThemeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" TEXT,
    "imageUrl" TEXT,
    "category" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "section" TEXT,
    "detailText" TEXT,
    "badges" TEXT,
    "timeWindow" TEXT,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailySpecial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Flight" (
    "id" TEXT NOT NULL,
    "locationId" TEXT,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "theme" TEXT NOT NULL,
    "description" TEXT,
    "price" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Flight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FlightPour" (
    "id" TEXT NOT NULL,
    "flightId" TEXT NOT NULL,
    "spiritName" TEXT NOT NULL,
    "pourSize" TEXT,
    "description" TEXT,
    "tastingNotes" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FlightPour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FeaturedBottle" (
    "id" TEXT NOT NULL,
    "locationId" TEXT,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "regularPrice" TEXT,
    "costPrice" TEXT NOT NULL,
    "category" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeaturedBottle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MenuCategory" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MenuItem" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2),
    "image" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Event" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "image" TEXT,
    "promoteFrom" TIMESTAMP(3),
    "promoteUntil" TIMESTAMP(3),
    "capacity" INTEGER,
    "collectEmail" BOOLEAN NOT NULL DEFAULT true,
    "collectPhone" BOOLEAN NOT NULL DEFAULT true,
    "collectPartySize" BOOLEAN NOT NULL DEFAULT false,
    "collectNotes" BOOLEAN NOT NULL DEFAULT false,
    "customQuestions" JSONB,
    "confirmationMessage" TEXT,
    "notifyEmail" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EventSignup" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "partySize" INTEGER,
    "notes" TEXT,
    "customAnswers" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventSignup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BottleNotesCache" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "notesJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BottleNotesCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GuestFeedback" (
    "id" TEXT NOT NULL,
    "locationId" TEXT,
    "locationName" TEXT NOT NULL,
    "locationSlug" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "guestName" TEXT,
    "guestEmail" TEXT,
    "feedbackText" TEXT NOT NULL,
    "newsletterOptIn" BOOLEAN NOT NULL DEFAULT false,
    "giftCardOptIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VisitorSession" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "locationId" TEXT,
    "locationSlug" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "deviceType" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "screenWidth" INTEGER,
    "screenHeight" INTEGER,
    "language" TEXT,
    "referrer" TEXT,
    "isQrScan" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT,
    "entryPage" TEXT NOT NULL,
    "pageCount" INTEGER NOT NULL DEFAULT 1,
    "durationSecs" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitorSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PageView" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "locationSlug" TEXT NOT NULL,
    "pagePath" TEXT NOT NULL,
    "pageType" TEXT NOT NULL,
    "queryString" TEXT,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GiftCardDrawing" (
    "id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "winnerId" TEXT,
    "winnerName" TEXT,
    "winnerEmail" TEXT NOT NULL,
    "locationName" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftCardDrawing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Location_slug_key" ON "public"."Location"("slug");

-- CreateIndex
CREATE INDEX "Location_slug_idx" ON "public"."Location"("slug");

-- CreateIndex
CREATE INDEX "DayTheme_dayOfWeek_idx" ON "public"."DayTheme"("dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "DayTheme_dayOfWeek_locationId_key" ON "public"."DayTheme"("dayOfWeek", "locationId");

-- CreateIndex
CREATE INDEX "DailySpecial_dayThemeId_idx" ON "public"."DailySpecial"("dayThemeId");

-- CreateIndex
CREATE INDEX "Flight_month_year_idx" ON "public"."Flight"("month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "Flight_month_year_locationId_key" ON "public"."Flight"("month", "year", "locationId");

-- CreateIndex
CREATE INDEX "FlightPour_flightId_idx" ON "public"."FlightPour"("flightId");

-- CreateIndex
CREATE INDEX "FeaturedBottle_month_year_idx" ON "public"."FeaturedBottle"("month", "year");

-- CreateIndex
CREATE INDEX "MenuCategory_locationId_idx" ON "public"."MenuCategory"("locationId");

-- CreateIndex
CREATE INDEX "MenuItem_categoryId_idx" ON "public"."MenuItem"("categoryId");

-- CreateIndex
CREATE INDEX "Event_locationId_startDate_idx" ON "public"."Event"("locationId", "startDate");

-- CreateIndex
CREATE INDEX "Event_slug_idx" ON "public"."Event"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Event_locationId_slug_key" ON "public"."Event"("locationId", "slug");

-- CreateIndex
CREATE INDEX "EventSignup_eventId_createdAt_idx" ON "public"."EventSignup"("eventId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BottleNotesCache_cacheKey_key" ON "public"."BottleNotesCache"("cacheKey");

-- CreateIndex
CREATE INDEX "BottleNotesCache_cacheKey_idx" ON "public"."BottleNotesCache"("cacheKey");

-- CreateIndex
CREATE INDEX "GuestFeedback_locationId_idx" ON "public"."GuestFeedback"("locationId");

-- CreateIndex
CREATE INDEX "GuestFeedback_createdAt_idx" ON "public"."GuestFeedback"("createdAt");

-- CreateIndex
CREATE INDEX "VisitorSession_visitorId_idx" ON "public"."VisitorSession"("visitorId");

-- CreateIndex
CREATE INDEX "VisitorSession_locationSlug_idx" ON "public"."VisitorSession"("locationSlug");

-- CreateIndex
CREATE INDEX "VisitorSession_startedAt_idx" ON "public"."VisitorSession"("startedAt");

-- CreateIndex
CREATE INDEX "VisitorSession_locationSlug_startedAt_idx" ON "public"."VisitorSession"("locationSlug", "startedAt");

-- CreateIndex
CREATE INDEX "VisitorSession_source_idx" ON "public"."VisitorSession"("source");

-- CreateIndex
CREATE INDEX "PageView_sessionId_idx" ON "public"."PageView"("sessionId");

-- CreateIndex
CREATE INDEX "PageView_locationSlug_viewedAt_idx" ON "public"."PageView"("locationSlug", "viewedAt");

-- CreateIndex
CREATE INDEX "PageView_pageType_idx" ON "public"."PageView"("pageType");

-- CreateIndex
CREATE INDEX "PageView_viewedAt_idx" ON "public"."PageView"("viewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCardDrawing_month_year_key" ON "public"."GiftCardDrawing"("month", "year");

-- AddForeignKey
ALTER TABLE "public"."DayTheme" ADD CONSTRAINT "DayTheme_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailySpecial" ADD CONSTRAINT "DailySpecial_dayThemeId_fkey" FOREIGN KEY ("dayThemeId") REFERENCES "public"."DayTheme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Flight" ADD CONSTRAINT "Flight_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FlightPour" ADD CONSTRAINT "FlightPour_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "public"."Flight"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeaturedBottle" ADD CONSTRAINT "FeaturedBottle_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MenuCategory" ADD CONSTRAINT "MenuCategory_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MenuItem" ADD CONSTRAINT "MenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."MenuCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Event" ADD CONSTRAINT "Event_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EventSignup" ADD CONSTRAINT "EventSignup_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GuestFeedback" ADD CONSTRAINT "GuestFeedback_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VisitorSession" ADD CONSTRAINT "VisitorSession_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PageView" ADD CONSTRAINT "PageView_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."VisitorSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

