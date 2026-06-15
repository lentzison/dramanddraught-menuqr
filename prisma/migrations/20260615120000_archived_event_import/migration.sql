-- Team-wide "removed from import list" records (restorable).
CREATE TABLE "ArchivedEventImport" (
    "id" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "label" TEXT,
    "archivedBy" TEXT,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArchivedEventImport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ArchivedEventImport_identityKey_key" ON "ArchivedEventImport"("identityKey");
