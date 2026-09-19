-- AlterTable
ALTER TABLE "Kit" ADD COLUMN IF NOT EXISTS "showInCatalog" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Kit_showInCatalog_idx" ON "Kit"("showInCatalog");
