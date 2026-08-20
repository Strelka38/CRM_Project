-- AlterTable
ALTER TABLE "CatalogItem" ADD COLUMN IF NOT EXISTS "costPrice" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "QuoteCalcLineOverride" ADD COLUMN IF NOT EXISTS "costOverride" DOUBLE PRECISION;
