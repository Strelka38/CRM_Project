ALTER TABLE "CalendarEntry" ADD COLUMN IF NOT EXISTS "clientId" TEXT;
CREATE INDEX IF NOT EXISTS "CalendarEntry_clientId_idx" ON "CalendarEntry"("clientId");
DO $$ BEGIN
  ALTER TABLE "CalendarEntry" ADD CONSTRAINT "CalendarEntry_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
