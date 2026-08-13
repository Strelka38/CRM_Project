-- Equipment units (idempotent for environments that already db-pushed them)
ALTER TABLE "CatalogItem" ADD COLUMN IF NOT EXISTS "equipmentCode" INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS "CatalogItem_equipmentCode_key" ON "CatalogItem"("equipmentCode");

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

CREATE UNIQUE INDEX IF NOT EXISTS "EquipmentUnit_qrToken_key" ON "EquipmentUnit"("qrToken");
CREATE UNIQUE INDEX IF NOT EXISTS "EquipmentUnit_catalogItemId_unitNumber_key" ON "EquipmentUnit"("catalogItemId", "unitNumber");
CREATE INDEX IF NOT EXISTS "EquipmentUnit_catalogItemId_idx" ON "EquipmentUnit"("catalogItemId");
CREATE INDEX IF NOT EXISTS "EquipmentUnit_inRepair_idx" ON "EquipmentUnit"("inRepair");

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

CREATE INDEX IF NOT EXISTS "EquipmentDocument_catalogItemId_idx" ON "EquipmentDocument"("catalogItemId");
CREATE INDEX IF NOT EXISTS "EquipmentDocument_uploaderId_idx" ON "EquipmentDocument"("uploaderId");

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

CREATE INDEX IF NOT EXISTS "EquipmentRepair_unitId_idx" ON "EquipmentRepair"("unitId");
CREATE INDEX IF NOT EXISTS "EquipmentRepair_status_idx" ON "EquipmentRepair"("status");
CREATE INDEX IF NOT EXISTS "EquipmentRepair_reportedAt_idx" ON "EquipmentRepair"("reportedAt");

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

CREATE INDEX IF NOT EXISTS "EquipmentRepairPhoto_repairId_idx" ON "EquipmentRepairPhoto"("repairId");

DO $$ BEGIN
  ALTER TABLE "EquipmentUnit" ADD CONSTRAINT "EquipmentUnit_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EquipmentDocument" ADD CONSTRAINT "EquipmentDocument_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EquipmentDocument" ADD CONSTRAINT "EquipmentDocument_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EquipmentRepair" ADD CONSTRAINT "EquipmentRepair_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "EquipmentUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EquipmentRepair" ADD CONSTRAINT "EquipmentRepair_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EquipmentRepair" ADD CONSTRAINT "EquipmentRepair_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EquipmentRepairPhoto" ADD CONSTRAINT "EquipmentRepairPhoto_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "EquipmentRepair"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
