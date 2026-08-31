DO $$ BEGIN
  CREATE TYPE "PayoutKind" AS ENUM ('STAFF_MONTH', 'FREELANCER_EVENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "canAccessPayments" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "Payout" (
  "id" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "kind" "PayoutKind" NOT NULL,
  "periodYm" TEXT NOT NULL,
  "userId" TEXT,
  "assignmentId" TEXT,
  "quoteId" TEXT,
  "payeeName" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "breakdown" JSONB,
  "paid" BOOLEAN NOT NULL DEFAULT false,
  "paidAt" TIMESTAMP(3),
  "paidById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Payout_sourceKey_key" ON "Payout"("sourceKey");
CREATE INDEX IF NOT EXISTS "Payout_userId_paid_idx" ON "Payout"("userId", "paid");
CREATE INDEX IF NOT EXISTS "Payout_kind_paid_idx" ON "Payout"("kind", "paid");
CREATE INDEX IF NOT EXISTS "Payout_periodYm_idx" ON "Payout"("periodYm");
CREATE INDEX IF NOT EXISTS "Payout_paidAt_idx" ON "Payout"("paidAt");

DO $$ BEGIN
  ALTER TABLE "Payout" ADD CONSTRAINT "Payout_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Payout" ADD CONSTRAINT "Payout_paidById_fkey"
    FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
