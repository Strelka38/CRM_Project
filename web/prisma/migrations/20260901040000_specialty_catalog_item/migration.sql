-- AlterTable
ALTER TABLE "Specialty" ADD COLUMN IF NOT EXISTS "catalogItemId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Specialty_catalogItemId_key" ON "Specialty"("catalogItemId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Specialty" ADD CONSTRAINT "Specialty_catalogItemId_fkey"
    FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
