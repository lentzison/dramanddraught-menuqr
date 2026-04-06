-- AlterTable: add page content sections to Event for the rich event-page builder.
-- Sections is a JSON array of {id, type, ...content} objects rendered in order.
-- Types: text, image, details, button, video, divider.
ALTER TABLE "Event" ADD COLUMN "sections" JSONB;
