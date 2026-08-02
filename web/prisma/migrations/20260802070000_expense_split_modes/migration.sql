-- AlterTable
ALTER TABLE "QuoteExtraExpense" ADD COLUMN "mode" "CalcLineMode" NOT NULL DEFAULT 'SHARE';
ALTER TABLE "QuoteExtraExpense" ADD COLUMN "owners" "CatalogOwner"[] DEFAULT ARRAY[]::"CatalogOwner"[];
ALTER TABLE "QuoteExtraExpense" ADD COLUMN "amountShowMaster" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "QuoteExtraExpense" ADD COLUMN "amountDiakom" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "QuoteExtraExpense" ADD COLUMN "amountNeEvent" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Migrate legacy single-company expenses into owners[]
UPDATE "QuoteExtraExpense"
SET "owners" = ARRAY["company"]::"CatalogOwner"[]
WHERE "company" IS NOT NULL;
