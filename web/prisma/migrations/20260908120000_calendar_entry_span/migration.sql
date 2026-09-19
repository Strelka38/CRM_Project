ALTER TABLE "CalendarEntry" ADD COLUMN IF NOT EXISTS "durationDays" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CalendarEntry" ADD COLUMN IF NOT EXISTS "endDate" DATE;
UPDATE "CalendarEntry" SET "endDate" = "date" WHERE "endDate" IS NULL;
ALTER TABLE "CalendarEntry" ALTER COLUMN "endDate" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "CalendarEntry_endDate_idx" ON "CalendarEntry"("endDate");
