ALTER TABLE "QuoteAssignment" ADD COLUMN IF NOT EXISTS "dayIndex" INTEGER;

CREATE INDEX IF NOT EXISTS "QuoteAssignment_quoteId_kind_dayIndex_idx"
  ON "QuoteAssignment"("quoteId", "kind", "dayIndex");

-- Один сотрудник может быть на одной должности в разные дни.
DROP INDEX IF EXISTS "QuoteAssignment_filled_quote_user_spec_kind_key";

CREATE UNIQUE INDEX IF NOT EXISTS "QuoteAssignment_filled_quote_user_spec_kind_day_key"
  ON "QuoteAssignment" ("quoteId", "userId", "specialtyId", "kind", "dayIndex")
  WHERE "userId" IS NOT NULL AND "dayIndex" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "QuoteAssignment_filled_quote_user_spec_kind_alldays_key"
  ON "QuoteAssignment" ("quoteId", "userId", "specialtyId", "kind")
  WHERE "userId" IS NOT NULL AND "dayIndex" IS NULL;
