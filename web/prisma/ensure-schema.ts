/**
 * Self-contained (no imports from src/) so it runs in the Docker runner image.
 */
import { PrismaClient } from "@prisma/client";

const statements = [
  `ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "mountDate" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "mountDurationDays" INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "demountDate" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "demountDurationDays" INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "requestContact" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "QuoteComment" ALTER COLUMN "body" SET DEFAULT ''`,
  `ALTER TABLE "QuoteComment" ADD COLUMN IF NOT EXISTS "imagePath" TEXT`,
  `ALTER TABLE "QuoteComment" ADD COLUMN IF NOT EXISTS "imageMime" TEXT`,
  `ALTER TABLE "QuoteComment" ADD COLUMN IF NOT EXISTS "imageName" TEXT`,
  `ALTER TABLE "QuoteAssignment" ALTER COLUMN "userId" DROP NOT NULL`,
  `ALTER TABLE "QuoteAssignment" ADD COLUMN IF NOT EXISTS "isFreelancer" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "QuoteAssignment" ADD COLUMN IF NOT EXISTS "freelancerName" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "QuoteAssignment" ADD COLUMN IF NOT EXISTS "owners" "CatalogOwner"[] DEFAULT ARRAY[]::"CatalogOwner"[]`,
  `DO $$ BEGIN CREATE TYPE "CalendarEntryKind" AS ENUM ('RENTAL', 'TASK', 'DAY_OFF'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS "CalendarEntry" (
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
  )`,
  `CREATE TABLE IF NOT EXISTS "CalendarEntryLine" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL DEFAULT 1,
    CONSTRAINT "CalendarEntryLine_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "CalendarEntryAssignee" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "CalendarEntryAssignee_pkey" PRIMARY KEY ("id")
  )`,
  `ALTER TABLE "CatalogItem" ADD COLUMN IF NOT EXISTS "equipmentCode" INTEGER`,
  `CREATE TABLE IF NOT EXISTS "EquipmentUnit" (
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
  )`,
  `ALTER TABLE "EquipmentUnit" ADD COLUMN IF NOT EXISTS "inRepair" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "EquipmentUnit" ADD COLUMN IF NOT EXISTS "writeOffReason" TEXT`,
  `ALTER TABLE "EquipmentUnit" ADD COLUMN IF NOT EXISTS "writeOffComment" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "EquipmentUnit" ADD COLUMN IF NOT EXISTS "writeOffAt" TIMESTAMP(3)`,
  `CREATE TABLE IF NOT EXISTS "EquipmentDocument" (
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
  )`,
  `DO $$ BEGIN CREATE TYPE "EquipmentRepairStatus" AS ENUM ('OPEN', 'CLOSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS "EquipmentRepair" (
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
  )`,
  `ALTER TABLE "EquipmentRepair" ADD COLUMN IF NOT EXISTS "resolutionComment" TEXT NOT NULL DEFAULT ''`,
  `CREATE TABLE IF NOT EXISTS "EquipmentRepairPhoto" (
    "id" TEXT NOT NULL,
    "repairId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EquipmentRepairPhoto_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "EquipmentUnit_qrToken_key" ON "EquipmentUnit"("qrToken")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "EquipmentUnit_catalogItemId_unitNumber_key" ON "EquipmentUnit"("catalogItemId", "unitNumber")`,
  `CREATE INDEX IF NOT EXISTS "EquipmentUnit_inRepair_idx" ON "EquipmentUnit"("inRepair")`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "agencyPercent" DOUBLE PRECISION NOT NULL DEFAULT 5`,
  `ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "cashlessPercent" DOUBLE PRECISION NOT NULL DEFAULT 10`,
  `ALTER TABLE "QuoteTemplate" ADD COLUMN IF NOT EXISTS "cashlessPercent" DOUBLE PRECISION NOT NULL DEFAULT 10`,
  `ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ADMIN'`,
  `UPDATE "User" SET "role" = 'ADMIN' WHERE id = (SELECT id FROM "User" ORDER BY "createdAt" ASC, id ASC LIMIT 1) AND NOT EXISTS (SELECT 1 FROM "User" WHERE "role" = 'ADMIN')`,
  `ALTER TABLE "QuoteZone" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true`,
  `CREATE TABLE IF NOT EXISTS "QuoteSnapshot" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "payload" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuoteSnapshot_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "QuoteAuditEvent" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "diff" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuoteAuditEvent_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "SpecRevision" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "lines" JSONB NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SpecRevision_pkey" PRIMARY KEY ("id")
  )`,
  `ALTER TABLE "QuoteSnapshot" ADD COLUMN IF NOT EXISTS "title" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "SpecRevision" ADD COLUMN IF NOT EXISTS "title" TEXT NOT NULL DEFAULT ''`,
  `CREATE INDEX IF NOT EXISTS "QuoteSnapshot_quoteId_createdAt_idx" ON "QuoteSnapshot"("quoteId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "QuoteSnapshot_createdById_idx" ON "QuoteSnapshot"("createdById")`,
  `CREATE INDEX IF NOT EXISTS "QuoteAuditEvent_quoteId_createdAt_idx" ON "QuoteAuditEvent"("quoteId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "QuoteAuditEvent_actorId_idx" ON "QuoteAuditEvent"("actorId")`,
  `CREATE INDEX IF NOT EXISTS "SpecRevision_quoteId_createdAt_idx" ON "SpecRevision"("quoteId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "SpecRevision_createdById_idx" ON "SpecRevision"("createdById")`,
  `ALTER TABLE "CatalogItem" ADD COLUMN IF NOT EXISTS "costPrice" DOUBLE PRECISION`,
  `ALTER TABLE "CatalogItem" ADD COLUMN IF NOT EXISTS "showInCatalog" BOOLEAN NOT NULL DEFAULT true`,
  `CREATE INDEX IF NOT EXISTS "CatalogItem_showInCatalog_idx" ON "CatalogItem"("showInCatalog")`,
  `ALTER TABLE "QuoteCalcLineOverride" ADD COLUMN IF NOT EXISTS "costOverride" DOUBLE PRECISION`,
  `DO $$ BEGIN CREATE TYPE "AssignmentKind" AS ENUM ('EVENT', 'MOUNT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `ALTER TABLE "QuoteAssignment" ADD COLUMN IF NOT EXISTS "kind" "AssignmentKind" NOT NULL DEFAULT 'EVENT'`,
  `DROP INDEX IF EXISTS "QuoteAssignment_quoteId_userId_specialtyId_key"`,
  `CREATE INDEX IF NOT EXISTS "QuoteAssignment_quoteId_kind_idx" ON "QuoteAssignment"("quoteId", "kind")`,
  `ALTER TABLE "QuoteAssignment" ADD COLUMN IF NOT EXISTS "dayIndex" INTEGER`,
  `CREATE INDEX IF NOT EXISTS "QuoteAssignment_quoteId_kind_dayIndex_idx" ON "QuoteAssignment"("quoteId", "kind", "dayIndex")`,
  `DROP INDEX IF EXISTS "QuoteAssignment_filled_quote_user_spec_kind_key"`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "QuoteAssignment_filled_quote_user_spec_kind_day_key" ON "QuoteAssignment" ("quoteId", "userId", "specialtyId", "kind", "dayIndex") WHERE "userId" IS NOT NULL AND "dayIndex" IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "QuoteAssignment_filled_quote_user_spec_kind_alldays_key" ON "QuoteAssignment" ("quoteId", "userId", "specialtyId", "kind") WHERE "userId" IS NOT NULL AND "dayIndex" IS NULL`,
  `ALTER TABLE "QuoteAssignment" ADD COLUMN IF NOT EXISTS "onMount" BOOLEAN NOT NULL DEFAULT true`,
  `ALTER TABLE "QuoteAssignment" ADD COLUMN IF NOT EXISTS "onDemount" BOOLEAN NOT NULL DEFAULT true`,
  `ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "assignmentImportWatermark" JSONB NOT NULL DEFAULT '{}'::jsonb`,
  `ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MOUNT_CONFIRMED'`,
  `CREATE TABLE IF NOT EXISTS "LegalEntity" (
    "id" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "fullName" TEXT NOT NULL DEFAULT '',
    "inn" TEXT NOT NULL,
    "ogrnip" TEXT NOT NULL DEFAULT '',
    "legalAddress" TEXT NOT NULL DEFAULT '',
    "actualAddress" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "catalogOwner" "CatalogOwner",
    "signatoryName" TEXT NOT NULL DEFAULT '',
    "sealPath" TEXT,
    "signaturePath" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LegalEntity_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "LegalEntity_inn_key" ON "LegalEntity"("inn")`,
  `CREATE INDEX IF NOT EXISTS "LegalEntity_catalogOwner_idx" ON "LegalEntity"("catalogOwner")`,
  `CREATE INDEX IF NOT EXISTS "LegalEntity_active_idx" ON "LegalEntity"("active")`,
  `CREATE TABLE IF NOT EXISTS "LegalEntityBankAccount" (
    "id" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "bankName" TEXT NOT NULL DEFAULT '',
    "account" TEXT NOT NULL,
    "corrAccount" TEXT NOT NULL DEFAULT '',
    "bik" TEXT NOT NULL DEFAULT '',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LegalEntityBankAccount_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "LegalEntityBankAccount_legalEntityId_account_key" ON "LegalEntityBankAccount"("legalEntityId", "account")`,
  `CREATE INDEX IF NOT EXISTS "LegalEntityBankAccount_legalEntityId_idx" ON "LegalEntityBankAccount"("legalEntityId")`,
  `DO $$ BEGIN ALTER TABLE "LegalEntityBankAccount" ADD CONSTRAINT "LegalEntityBankAccount_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "WeatherPlace" AS ENUM ('IRKUTSK', 'IRKUTSK_OBLAST'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TASK_OPEN'`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'Asia/Irkutsk'`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "weatherPlace" "WeatherPlace" NOT NULL DEFAULT 'IRKUTSK'`,
  `ALTER TABLE "CalendarEntry" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3)`,
  `ALTER TABLE "CalendarEntry" ADD COLUMN IF NOT EXISTS "completedById" TEXT`,
  `ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "calendarEntryId" TEXT`,
  `CREATE TABLE IF NOT EXISTS "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
  )`,
  `INSERT INTO "AppSetting" ("key", "value") VALUES ('masterTimezone', 'Asia/Irkutsk') ON CONFLICT ("key") DO NOTHING`,
  `CREATE INDEX IF NOT EXISTS "CalendarEntry_completedById_idx" ON "CalendarEntry"("completedById")`,
  `CREATE INDEX IF NOT EXISTS "Notification_calendarEntryId_idx" ON "Notification"("calendarEntryId")`,
  `DO $$ BEGIN ALTER TABLE "CalendarEntry" ADD CONSTRAINT "CalendarEntry_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN ALTER TABLE "Notification" ADD CONSTRAINT "Notification_calendarEntryId_fkey" FOREIGN KEY ("calendarEntryId") REFERENCES "CalendarEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `ALTER TABLE "Specialty" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "QuoteAttachment" ADD COLUMN IF NOT EXISTS "invoiceSent" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "CalendarEntry" ADD COLUMN IF NOT EXISTS "clientId" TEXT`,
  `CREATE INDEX IF NOT EXISTS "CalendarEntry_clientId_idx" ON "CalendarEntry"("clientId")`,
  `DO $$ BEGIN ALTER TABLE "CalendarEntry" ADD CONSTRAINT "CalendarEntry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
];

async function main() {
  const prisma = new PrismaClient();
  try {
    for (const sql of statements) {
      await prisma.$executeRawUnsafe(sql);
    }
    console.log("ensure-schema: ok");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("ensure-schema: failed", e);
  process.exit(1);
});
