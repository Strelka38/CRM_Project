ALTER TABLE "QuoteAssignment" ADD COLUMN IF NOT EXISTS "zoneId" TEXT;
CREATE INDEX IF NOT EXISTS "QuoteAssignment_zoneId_idx" ON "QuoteAssignment"("zoneId");
DO $$ BEGIN
  ALTER TABLE "QuoteAssignment"
    ADD CONSTRAINT "QuoteAssignment_zoneId_fkey"
    FOREIGN KEY ("zoneId") REFERENCES "QuoteZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
