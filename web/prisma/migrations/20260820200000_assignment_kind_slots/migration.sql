-- AssignmentKind: EVENT (шоу) vs MOUNT (монтажники)
DO $$ BEGIN
  CREATE TYPE "AssignmentKind" AS ENUM ('EVENT', 'MOUNT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "QuoteAssignment" ADD COLUMN IF NOT EXISTS "kind" "AssignmentKind" NOT NULL DEFAULT 'EVENT';

-- Пустые слоты (userId NULL) и один человек EVENT+MOUNT не должны упираться в unique
DROP INDEX IF EXISTS "QuoteAssignment_quoteId_userId_specialtyId_key";

CREATE INDEX IF NOT EXISTS "QuoteAssignment_quoteId_kind_idx" ON "QuoteAssignment"("quoteId", "kind");

-- Заполненные слоты: один user на пару должность+тип. Пустые (NULL) не входят.
CREATE UNIQUE INDEX IF NOT EXISTS "QuoteAssignment_filled_quote_user_spec_kind_key"
  ON "QuoteAssignment" ("quoteId", "userId", "specialtyId", "kind")
  WHERE "userId" IS NOT NULL;

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MOUNT_CONFIRMED';
