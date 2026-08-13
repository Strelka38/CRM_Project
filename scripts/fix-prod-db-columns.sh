#!/usr/bin/env bash
# Fix missing columns on a running docker compose stack.
# Usage (on the VPS, from /opt/CRM_Project):
#   bash scripts/fix-prod-db-columns.sh

set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

DB_USER="${POSTGRES_USER:-crm}"
DB_NAME="${POSTGRES_DB:-crm_event}"

echo "==> Applying columns via postgres (user=$DB_USER db=$DB_NAME)..."
docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
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

SELECT 'Quote' AS tbl, column_name FROM information_schema.columns
WHERE table_name = 'Quote' AND column_name ILIKE '%mount%'
UNION ALL
SELECT 'QuoteAssignment', column_name FROM information_schema.columns
WHERE table_name = 'QuoteAssignment' AND column_name IN ('isFreelancer','freelancerName','owners','userId')
UNION ALL
SELECT 'CalendarEntry', table_name FROM information_schema.tables
WHERE table_name IN ('CalendarEntry','CalendarEntryLine','CalendarEntryAssignee')
ORDER BY 1, 2;
SQL

echo "==> Restarting app..."
docker compose restart app

echo "Done. Hard-refresh the site and open an event."
