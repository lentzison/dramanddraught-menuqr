-- AlterTable: add signupsEnabled toggle so events can opt out of the signup form entirely.
ALTER TABLE "Event" ADD COLUMN "signupsEnabled" BOOLEAN NOT NULL DEFAULT true;
