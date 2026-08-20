-- CreateEnum
DO $$ BEGIN CREATE TYPE "WeatherPlace" AS ENUM ('IRKUTSK', 'IRKUTSK_OBLAST'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TASK_OPEN';

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'Asia/Irkutsk';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "weatherPlace" "WeatherPlace" NOT NULL DEFAULT 'IRKUTSK';

-- AlterTable
ALTER TABLE "CalendarEntry" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "CalendarEntry" ADD COLUMN IF NOT EXISTS "completedById" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "calendarEntryId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

INSERT INTO "AppSetting" ("key", "value")
VALUES ('masterTimezone', 'Asia/Irkutsk')
ON CONFLICT ("key") DO NOTHING;

CREATE INDEX IF NOT EXISTS "CalendarEntry_completedById_idx" ON "CalendarEntry"("completedById");
CREATE INDEX IF NOT EXISTS "Notification_calendarEntryId_idx" ON "Notification"("calendarEntryId");

DO $$ BEGIN
  ALTER TABLE "CalendarEntry" ADD CONSTRAINT "CalendarEntry_completedById_fkey"
    FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Notification" ADD CONSTRAINT "Notification_calendarEntryId_fkey"
    FOREIGN KEY ("calendarEntryId") REFERENCES "CalendarEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
