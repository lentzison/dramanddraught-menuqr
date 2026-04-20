-- Optional visual theme override for the public event page.
-- null = default dark vintage theme. Known values today: "spring-market", "art-gallery".
ALTER TABLE "Event" ADD COLUMN "themeKey" TEXT;
