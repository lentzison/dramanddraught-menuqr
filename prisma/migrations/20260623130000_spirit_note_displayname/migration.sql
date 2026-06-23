-- Short, recognizable printed-menu name for a spirit (overrides the long
-- Bartender catalog name on the printable list only).
ALTER TABLE "SpiritNote" ADD COLUMN "displayName" TEXT;
