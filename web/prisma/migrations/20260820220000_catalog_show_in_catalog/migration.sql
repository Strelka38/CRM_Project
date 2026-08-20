-- AlterTable
ALTER TABLE "CatalogItem" ADD COLUMN IF NOT EXISTS "showInCatalog" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CatalogItem_showInCatalog_idx" ON "CatalogItem"("showInCatalog");
