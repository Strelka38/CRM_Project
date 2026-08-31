ALTER TABLE "QuoteZone" ADD COLUMN IF NOT EXISTS "workingDayIndexes" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

DROP INDEX IF EXISTS "QuoteAssignment_filled_quote_user_spec_kind_day_key";
DROP INDEX IF EXISTS "QuoteAssignment_filled_quote_user_spec_kind_alldays_key";
CREATE UNIQUE INDEX IF NOT EXISTS "QuoteAssignment_filled_quote_user_spec_kind_zone_day_key"
  ON "QuoteAssignment" ("quoteId", "userId", "specialtyId", "kind", "dayIndex", (COALESCE("zoneId", '')))
  WHERE "userId" IS NOT NULL AND "dayIndex" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "QuoteAssignment_filled_quote_user_spec_kind_zone_alldays_key"
  ON "QuoteAssignment" ("quoteId", "userId", "specialtyId", "kind", (COALESCE("zoneId", '')))
  WHERE "userId" IS NOT NULL AND "dayIndex" IS NULL;
