-- Idempotent safety net for production drift
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "mountDate" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "mountDurationDays" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "demountDate" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "demountDurationDays" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "QuoteComment" ALTER COLUMN "body" SET DEFAULT '';
ALTER TABLE "QuoteComment" ADD COLUMN IF NOT EXISTS "imagePath" TEXT;
ALTER TABLE "QuoteComment" ADD COLUMN IF NOT EXISTS "imageMime" TEXT;
ALTER TABLE "QuoteComment" ADD COLUMN IF NOT EXISTS "imageName" TEXT;

ALTER TABLE "QuoteAssignment" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "QuoteAssignment" ADD COLUMN IF NOT EXISTS "isFreelancer" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "QuoteAssignment" ADD COLUMN IF NOT EXISTS "freelancerName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "QuoteAssignment" ADD COLUMN IF NOT EXISTS "owners" "CatalogOwner"[] DEFAULT ARRAY[]::"CatalogOwner"[];

DO $$ BEGIN
  CREATE TYPE "CalendarEntryKind" AS ENUM ('RENTAL', 'TASK', 'DAY_OFF');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CalendarEntry" (
  "id" TEXT NOT NULL,
  "kind" "CalendarEntryKind" NOT NULL,
  "date" DATE NOT NULL,
  "title" TEXT NOT NULL DEFAULT '',
  "note" TEXT NOT NULL DEFAULT '',
  "startTime" TEXT,
  "endTime" TEXT,
  "responsibleUserId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CalendarEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CalendarEntryLine" (
  "id" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "catalogItemId" TEXT NOT NULL,
  "qty" DOUBLE PRECISION NOT NULL DEFAULT 1,
  CONSTRAINT "CalendarEntryLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CalendarEntryAssignee" (
  "id" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  CONSTRAINT "CalendarEntryAssignee_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CatalogItem" ADD COLUMN IF NOT EXISTS "equipmentCode" INTEGER;

CREATE TABLE IF NOT EXISTS "EquipmentUnit" (
  "id" TEXT NOT NULL,
  "catalogItemId" TEXT NOT NULL,
  "unitNumber" INTEGER NOT NULL,
  "qrToken" TEXT NOT NULL,
  "label" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "inRepair" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EquipmentUnit_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "EquipmentUnit" ADD COLUMN IF NOT EXISTS "inRepair" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EquipmentUnit" ADD COLUMN IF NOT EXISTS "writeOffReason" TEXT;
ALTER TABLE "EquipmentUnit" ADD COLUMN IF NOT EXISTS "writeOffComment" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EquipmentUnit" ADD COLUMN IF NOT EXISTS "writeOffAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "EquipmentDocument" (
  "id" TEXT NOT NULL,
  "catalogItemId" TEXT NOT NULL,
  "uploaderId" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "storagePath" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EquipmentDocument_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  CREATE TYPE "EquipmentRepairStatus" AS ENUM ('OPEN', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "EquipmentRepair" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "status" "EquipmentRepairStatus" NOT NULL DEFAULT 'OPEN',
  "faultType" TEXT NOT NULL,
  "comment" TEXT NOT NULL DEFAULT '',
  "reportedById" TEXT NOT NULL,
  "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolutionComment" TEXT NOT NULL DEFAULT '',
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" TEXT,
  CONSTRAINT "EquipmentRepair_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "EquipmentRepair" ADD COLUMN IF NOT EXISTS "resolutionComment" TEXT NOT NULL DEFAULT '';

ALTER TABLE "Specialty" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS "SpecialtyCatalogItem" (
  "id" TEXT NOT NULL,
  "specialtyId" TEXT NOT NULL,
  "catalogItemId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SpecialtyCatalogItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SpecialtyCatalogItem_catalogItemId_key" ON "SpecialtyCatalogItem"("catalogItemId");
CREATE INDEX IF NOT EXISTS "SpecialtyCatalogItem_specialtyId_idx" ON "SpecialtyCatalogItem"("specialtyId");
DO $$ BEGIN
  ALTER TABLE "SpecialtyCatalogItem" ADD CONSTRAINT "SpecialtyCatalogItem_specialtyId_fkey"
    FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "SpecialtyCatalogItem" ADD CONSTRAINT "SpecialtyCatalogItem_catalogItemId_fkey"
    FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Specialty' AND column_name = 'catalogItemId'
  ) THEN
    INSERT INTO "SpecialtyCatalogItem" ("id", "specialtyId", "catalogItemId", "createdAt")
    SELECT 'sci_' || s."id", s."id", s."catalogItemId", CURRENT_TIMESTAMP
    FROM "Specialty" s
    WHERE s."catalogItemId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "SpecialtyCatalogItem" x WHERE x."catalogItemId" = s."catalogItemId"
      );
    ALTER TABLE "Specialty" DROP CONSTRAINT IF EXISTS "Specialty_catalogItemId_fkey";
    DROP INDEX IF EXISTS "Specialty_catalogItemId_key";
    ALTER TABLE "Specialty" DROP COLUMN IF EXISTS "catalogItemId";
  END IF;
END $$;

ALTER TABLE "CalendarEntry" ADD COLUMN IF NOT EXISTS "clientId" TEXT;
CREATE INDEX IF NOT EXISTS "CalendarEntry_clientId_idx" ON "CalendarEntry"("clientId");
DO $$ BEGIN
  ALTER TABLE "CalendarEntry" ADD CONSTRAINT "CalendarEntry_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "EquipmentRepairPhoto" (
  "id" TEXT NOT NULL,
  "repairId" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "storagePath" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EquipmentRepairPhoto_pkey" PRIMARY KEY ("id")
);

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

CREATE TABLE IF NOT EXISTS "Freelancer" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "comment" TEXT NOT NULL DEFAULT '',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Freelancer_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Freelancer_name_idx" ON "Freelancer"("name");
CREATE INDEX IF NOT EXISTS "Freelancer_active_idx" ON "Freelancer"("active");
CREATE UNIQUE INDEX IF NOT EXISTS "Freelancer_name_lower_key" ON "Freelancer"(lower(btrim("name")));

CREATE TABLE IF NOT EXISTS "FreelancerSpecialty" (
  "id" TEXT NOT NULL,
  "freelancerId" TEXT NOT NULL,
  "specialtyId" TEXT NOT NULL,
  "hourlyRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "shiftRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FreelancerSpecialty_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FreelancerSpecialty_specialtyId_idx" ON "FreelancerSpecialty"("specialtyId");
CREATE UNIQUE INDEX IF NOT EXISTS "FreelancerSpecialty_freelancerId_specialtyId_key" ON "FreelancerSpecialty"("freelancerId", "specialtyId");
DO $$ BEGIN
  ALTER TABLE "FreelancerSpecialty" ADD CONSTRAINT "FreelancerSpecialty_freelancerId_fkey"
    FOREIGN KEY ("freelancerId") REFERENCES "Freelancer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "FreelancerSpecialty" ADD CONSTRAINT "FreelancerSpecialty_specialtyId_fkey"
    FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "QuoteZone" ADD COLUMN IF NOT EXISTS "workingDayIndexes" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
DROP INDEX IF EXISTS "QuoteAssignment_filled_quote_user_spec_kind_day_key";
DROP INDEX IF EXISTS "QuoteAssignment_filled_quote_user_spec_kind_alldays_key";
CREATE UNIQUE INDEX IF NOT EXISTS "QuoteAssignment_filled_quote_user_spec_kind_zone_day_key"
  ON "QuoteAssignment" ("quoteId", "userId", "specialtyId", "kind", "dayIndex", (COALESCE("zoneId", '')))
  WHERE "userId" IS NOT NULL AND "dayIndex" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "QuoteAssignment_filled_quote_user_spec_kind_zone_alldays_key"
  ON "QuoteAssignment" ("quoteId", "userId", "specialtyId", "kind", (COALESCE("zoneId", '')))
  WHERE "userId" IS NOT NULL AND "dayIndex" IS NULL;
