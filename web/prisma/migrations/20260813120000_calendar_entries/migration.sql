-- CreateEnum
CREATE TYPE "CalendarEntryKind" AS ENUM ('RENTAL', 'TASK', 'DAY_OFF');

-- CreateTable
CREATE TABLE "CalendarEntry" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEntryLine" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "CalendarEntryLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEntryAssignee" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CalendarEntryAssignee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarEntry_date_idx" ON "CalendarEntry"("date");

-- CreateIndex
CREATE INDEX "CalendarEntry_kind_date_idx" ON "CalendarEntry"("kind", "date");

-- CreateIndex
CREATE INDEX "CalendarEntry_createdById_idx" ON "CalendarEntry"("createdById");

-- CreateIndex
CREATE INDEX "CalendarEntry_responsibleUserId_idx" ON "CalendarEntry"("responsibleUserId");

-- CreateIndex
CREATE INDEX "CalendarEntryLine_entryId_idx" ON "CalendarEntryLine"("entryId");

-- CreateIndex
CREATE INDEX "CalendarEntryLine_catalogItemId_idx" ON "CalendarEntryLine"("catalogItemId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEntryLine_entryId_catalogItemId_key" ON "CalendarEntryLine"("entryId", "catalogItemId");

-- CreateIndex
CREATE INDEX "CalendarEntryAssignee_userId_idx" ON "CalendarEntryAssignee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEntryAssignee_entryId_userId_key" ON "CalendarEntryAssignee"("entryId", "userId");

-- AddForeignKey
ALTER TABLE "CalendarEntry" ADD CONSTRAINT "CalendarEntry_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEntry" ADD CONSTRAINT "CalendarEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEntryLine" ADD CONSTRAINT "CalendarEntryLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CalendarEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEntryLine" ADD CONSTRAINT "CalendarEntryLine_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEntryAssignee" ADD CONSTRAINT "CalendarEntryAssignee_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CalendarEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEntryAssignee" ADD CONSTRAINT "CalendarEntryAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
