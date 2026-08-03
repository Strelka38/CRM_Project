-- Freelancer assignments (were added via db push locally, never migrated)
ALTER TABLE "QuoteAssignment" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "QuoteAssignment" ADD COLUMN IF NOT EXISTS "isFreelancer" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "QuoteAssignment" ADD COLUMN IF NOT EXISTS "freelancerName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "QuoteAssignment" ADD COLUMN IF NOT EXISTS "owners" "CatalogOwner"[] DEFAULT ARRAY[]::"CatalogOwner"[];
