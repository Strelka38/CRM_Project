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
