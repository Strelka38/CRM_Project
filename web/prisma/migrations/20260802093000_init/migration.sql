-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('MANAGER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('EQUIPMENT', 'PERSONNEL', 'OTHER');

-- CreateEnum
CREATE TYPE "ItemKind" AS ENUM ('EQUIPMENT', 'PERSONNEL', 'SERVICE', 'CONSUMABLE', 'COMPONENT', 'OTHER');

-- CreateEnum
CREATE TYPE "DayMode" AS ENUM ('HALF_EXTRA', 'FULL_DAYS', 'FIXED1', 'FIXED2');

-- CreateEnum
CREATE TYPE "CatalogOwner" AS ENUM ('SHOW_MASTER', 'DIAKOM', 'NE_EVENT');

-- CreateEnum
CREATE TYPE "QuoteLifecycle" AS ENUM ('CALCULATED', 'CONFIRMED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "BlockType" AS ENUM ('SECTION', 'ITEM', 'NOTE', 'KIT_HEADER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INVOICE_DUE', 'SYSTEM', 'EVENT_CREATED', 'EVENT_ASSIGNED', 'CHAT_MESSAGE');

-- CreateEnum
CREATE TYPE "PayMode" AS ENUM ('SHIFT', 'HOURLY');

-- CreateEnum
CREATE TYPE "CalcLineMode" AS ENUM ('SHARE', 'AMOUNT');

-- CreateEnum
CREATE TYPE "SpecOverrideAction" AS ENUM ('HIDE', 'SET_QTY', 'RENAME');

-- CreateEnum
CREATE TYPE "SpecExtraType" AS ENUM ('SECTION', 'ITEM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "patronymic" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "comment" TEXT NOT NULL DEFAULT '',
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "monthlySalary" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "owners" "CatalogOwner"[] DEFAULT ARRAY[]::"CatalogOwner"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Specialty" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "hourlyRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shiftRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Specialty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSpecialty" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "specialtyId" TEXT NOT NULL,
    "hourlyRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shiftRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSpecialty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteAssignment" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "specialtyId" TEXT NOT NULL,
    "payMode" "PayMode" NOT NULL DEFAULT 'SHIFT',
    "hours" DOUBLE PRECISION,
    "rateOverride" DOUBLE PRECISION,
    "bonus" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "montageAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "parentId" TEXT,
    "kind" "CategoryKind" NOT NULL DEFAULT 'EQUIPMENT',
    "subtotalLabel" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT,
    "manufacturer" TEXT,
    "basePrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cashlessOverride" DOUBLE PRECISION,
    "estimatedValue" DOUBLE PRECISION,
    "stockQty" INTEGER NOT NULL DEFAULT 0,
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "depth" DOUBLE PRECISION,
    "power" DOUBLE PRECISION,
    "weight" DOUBLE PRECISION,
    "comment" TEXT,
    "photoPath" TEXT,
    "owners" "CatalogOwner"[] DEFAULT ARRAY[]::"CatalogOwner"[],
    "dayMode" "DayMode" NOT NULL DEFAULT 'HALF_EXTRA',
    "itemKind" "ItemKind" NOT NULL DEFAULT 'EQUIPMENT',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kit" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT,
    "basePrice" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitComponent" (
    "id" TEXT NOT NULL,
    "kitId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "KitComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "comment" TEXT NOT NULL DEFAULT '',
    "inn" TEXT NOT NULL DEFAULT '',
    "legalAddress" TEXT NOT NULL DEFAULT '',
    "legalDetails" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "mapUrl" TEXT NOT NULL DEFAULT '',
    "comment" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenuePhoto" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VenuePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "proposalNumber" TEXT NOT NULL DEFAULT '90',
    "eventName" TEXT NOT NULL DEFAULT '',
    "date" TEXT NOT NULL DEFAULT '',
    "eventDate" TIMESTAMP(3),
    "time" TEXT NOT NULL DEFAULT '',
    "place" TEXT NOT NULL DEFAULT '',
    "venueId" TEXT,
    "client" TEXT NOT NULL DEFAULT '',
    "clientId" TEXT,
    "managerName" TEXT NOT NULL DEFAULT '',
    "cashless" BOOLEAN NOT NULL DEFAULT true,
    "durationDays" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "brief" TEXT NOT NULL DEFAULT '',
    "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lifecycle" "QuoteLifecycle" NOT NULL DEFAULT 'CALCULATED',
    "invoiceRequired" BOOLEAN NOT NULL DEFAULT false,
    "invoiceSent" BOOLEAN NOT NULL DEFAULT false,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paymentComment" TEXT NOT NULL DEFAULT '',
    "sharesCustom" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteCalcShare" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "company" "CatalogOwner" NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteCalcShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteCalcLineOverride" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "mode" "CalcLineMode" NOT NULL DEFAULT 'SHARE',
    "ownersCustom" BOOLEAN NOT NULL DEFAULT false,
    "owners" "CatalogOwner"[] DEFAULT ARRAY[]::"CatalogOwner"[],
    "amountShowMaster" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amountDiakom" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amountNeEvent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "montageAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteCalcLineOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteExtraExpense" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mode" "CalcLineMode" NOT NULL DEFAULT 'SHARE',
    "company" "CatalogOwner",
    "owners" "CatalogOwner"[] DEFAULT ARRAY[]::"CatalogOwner"[],
    "amountShowMaster" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amountDiakom" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amountNeEvent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteExtraExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteZone" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cashless" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecOverride" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "deriveKey" TEXT NOT NULL,
    "action" "SpecOverrideAction" NOT NULL,
    "qty" DOUBLE PRECISION,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecExtraBlock" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "type" "SpecExtraType" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT,
    "name" TEXT,
    "qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "catalogItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecExtraBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteComment" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteAttachment" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteBlock" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "zoneId" TEXT,
    "type" "BlockType" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT,
    "name" TEXT,
    "qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cashlessOverride" DOUBLE PRECISION,
    "dayMode" "DayMode" NOT NULL DEFAULT 'HALF_EXTRA',
    "dayCoefOverride" DOUBLE PRECISION,
    "catalogItemId" TEXT,
    "kitId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quoteId" TEXT,
    "type" "NotificationType" NOT NULL DEFAULT 'SYSTEM',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Specialty_name_key" ON "Specialty"("name");

-- CreateIndex
CREATE INDEX "UserSpecialty_specialtyId_idx" ON "UserSpecialty"("specialtyId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSpecialty_userId_specialtyId_key" ON "UserSpecialty"("userId", "specialtyId");

-- CreateIndex
CREATE INDEX "QuoteAssignment_userId_idx" ON "QuoteAssignment"("userId");

-- CreateIndex
CREATE INDEX "QuoteAssignment_specialtyId_idx" ON "QuoteAssignment"("specialtyId");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteAssignment_quoteId_userId_specialtyId_key" ON "QuoteAssignment"("quoteId", "userId", "specialtyId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogCategory_path_key" ON "CatalogCategory"("path");

-- CreateIndex
CREATE INDEX "CatalogCategory_parentId_idx" ON "CatalogCategory"("parentId");

-- CreateIndex
CREATE INDEX "CatalogItem_categoryId_idx" ON "CatalogItem"("categoryId");

-- CreateIndex
CREATE INDEX "CatalogItem_itemKind_idx" ON "CatalogItem"("itemKind");

-- CreateIndex
CREATE INDEX "CatalogItem_name_idx" ON "CatalogItem"("name");

-- CreateIndex
CREATE INDEX "KitComponent_catalogItemId_idx" ON "KitComponent"("catalogItemId");

-- CreateIndex
CREATE UNIQUE INDEX "KitComponent_kitId_catalogItemId_key" ON "KitComponent"("kitId", "catalogItemId");

-- CreateIndex
CREATE INDEX "Client_companyName_idx" ON "Client"("companyName");

-- CreateIndex
CREATE INDEX "Client_inn_idx" ON "Client"("inn");

-- CreateIndex
CREATE INDEX "Venue_name_idx" ON "Venue"("name");

-- CreateIndex
CREATE INDEX "Venue_address_idx" ON "Venue"("address");

-- CreateIndex
CREATE INDEX "VenuePhoto_venueId_idx" ON "VenuePhoto"("venueId");

-- CreateIndex
CREATE INDEX "Quote_ownerId_idx" ON "Quote"("ownerId");

-- CreateIndex
CREATE INDEX "Quote_eventDate_idx" ON "Quote"("eventDate");

-- CreateIndex
CREATE INDEX "Quote_lifecycle_idx" ON "Quote"("lifecycle");

-- CreateIndex
CREATE INDEX "Quote_clientId_idx" ON "Quote"("clientId");

-- CreateIndex
CREATE INDEX "Quote_venueId_idx" ON "Quote"("venueId");

-- CreateIndex
CREATE INDEX "QuoteCalcShare_quoteId_idx" ON "QuoteCalcShare"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteCalcShare_quoteId_company_key" ON "QuoteCalcShare"("quoteId", "company");

-- CreateIndex
CREATE INDEX "QuoteCalcLineOverride_quoteId_idx" ON "QuoteCalcLineOverride"("quoteId");

-- CreateIndex
CREATE INDEX "QuoteCalcLineOverride_blockId_idx" ON "QuoteCalcLineOverride"("blockId");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteCalcLineOverride_quoteId_blockId_key" ON "QuoteCalcLineOverride"("quoteId", "blockId");

-- CreateIndex
CREATE INDEX "QuoteExtraExpense_quoteId_idx" ON "QuoteExtraExpense"("quoteId");

-- CreateIndex
CREATE INDEX "QuoteZone_quoteId_idx" ON "QuoteZone"("quoteId");

-- CreateIndex
CREATE INDEX "QuoteTemplate_ownerId_idx" ON "QuoteTemplate"("ownerId");

-- CreateIndex
CREATE INDEX "QuoteTemplate_name_idx" ON "QuoteTemplate"("name");

-- CreateIndex
CREATE INDEX "SpecOverride_quoteId_idx" ON "SpecOverride"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "SpecOverride_quoteId_deriveKey_action_key" ON "SpecOverride"("quoteId", "deriveKey", "action");

-- CreateIndex
CREATE INDEX "SpecExtraBlock_quoteId_idx" ON "SpecExtraBlock"("quoteId");

-- CreateIndex
CREATE INDEX "QuoteComment_quoteId_createdAt_idx" ON "QuoteComment"("quoteId", "createdAt");

-- CreateIndex
CREATE INDEX "QuoteComment_authorId_idx" ON "QuoteComment"("authorId");

-- CreateIndex
CREATE INDEX "QuoteAttachment_quoteId_idx" ON "QuoteAttachment"("quoteId");

-- CreateIndex
CREATE INDEX "QuoteAttachment_uploaderId_idx" ON "QuoteAttachment"("uploaderId");

-- CreateIndex
CREATE INDEX "QuoteBlock_quoteId_idx" ON "QuoteBlock"("quoteId");

-- CreateIndex
CREATE INDEX "QuoteBlock_zoneId_idx" ON "QuoteBlock"("zoneId");

-- CreateIndex
CREATE INDEX "QuoteBlock_catalogItemId_idx" ON "QuoteBlock"("catalogItemId");

-- CreateIndex
CREATE INDEX "QuoteBlock_kitId_idx" ON "QuoteBlock"("kitId");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "Notification_quoteId_idx" ON "Notification"("quoteId");

-- AddForeignKey
ALTER TABLE "UserSpecialty" ADD CONSTRAINT "UserSpecialty_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSpecialty" ADD CONSTRAINT "UserSpecialty_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteAssignment" ADD CONSTRAINT "QuoteAssignment_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteAssignment" ADD CONSTRAINT "QuoteAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteAssignment" ADD CONSTRAINT "QuoteAssignment_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogCategory" ADD CONSTRAINT "CatalogCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CatalogCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CatalogCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kit" ADD CONSTRAINT "Kit_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CatalogCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitComponent" ADD CONSTRAINT "KitComponent_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "Kit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitComponent" ADD CONSTRAINT "KitComponent_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenuePhoto" ADD CONSTRAINT "VenuePhoto_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteCalcShare" ADD CONSTRAINT "QuoteCalcShare_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteCalcLineOverride" ADD CONSTRAINT "QuoteCalcLineOverride_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteExtraExpense" ADD CONSTRAINT "QuoteExtraExpense_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteZone" ADD CONSTRAINT "QuoteZone_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteTemplate" ADD CONSTRAINT "QuoteTemplate_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecOverride" ADD CONSTRAINT "SpecOverride_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecExtraBlock" ADD CONSTRAINT "SpecExtraBlock_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteComment" ADD CONSTRAINT "QuoteComment_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteComment" ADD CONSTRAINT "QuoteComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteAttachment" ADD CONSTRAINT "QuoteAttachment_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteAttachment" ADD CONSTRAINT "QuoteAttachment_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteBlock" ADD CONSTRAINT "QuoteBlock_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteBlock" ADD CONSTRAINT "QuoteBlock_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "QuoteZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteBlock" ADD CONSTRAINT "QuoteBlock_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteBlock" ADD CONSTRAINT "QuoteBlock_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "Kit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

