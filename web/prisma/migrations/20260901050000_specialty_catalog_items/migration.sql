CREATE TABLE IF NOT EXISTS "SpecialtyCatalogItem" (
  "id" TEXT NOT NULL,
  "specialtyId" TEXT NOT NULL,
  "catalogItemId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SpecialtyCatalogItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SpecialtyCatalogItem_catalogItemId_key" ON "SpecialtyCatalogItem"("catalogItemId");
CREATE INDEX IF NOT EXISTS "SpecialtyCatalogItem_specialtyId_idx" ON "SpecialtyCatalogItem"("specialtyId");

DO $$ BEGIN
  ALTER TABLE "SpecialtyCatalogItem" ADD CONSTRAINT "SpecialtyCatalogItem_specialtyId_fkey"
    FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SpecialtyCatalogItem" ADD CONSTRAINT "SpecialtyCatalogItem_catalogItemId_fkey"
    FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Specialty' AND column_name = 'catalogItemId'
  ) THEN
    INSERT INTO "SpecialtyCatalogItem" ("id", "specialtyId", "catalogItemId", "createdAt")
    SELECT 'sci_' || s."id", s."id", s."catalogItemId", CURRENT_TIMESTAMP
    FROM "Specialty" s
    WHERE s."catalogItemId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "SpecialtyCatalogItem" x WHERE x."catalogItemId" = s."catalogItemId"
      );
    ALTER TABLE "Specialty" DROP CONSTRAINT IF EXISTS "Specialty_catalogItemId_fkey";
    DROP INDEX IF EXISTS "Specialty_catalogItemId_key";
    ALTER TABLE "Specialty" DROP COLUMN IF EXISTS "catalogItemId";
  END IF;
END $$;
