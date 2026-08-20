-- AlterTable
ALTER TABLE "QuoteZone" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "QuoteSnapshot" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteAuditEvent" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "diff" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecRevision" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpecRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuoteSnapshot_quoteId_createdAt_idx" ON "QuoteSnapshot"("quoteId", "createdAt");

-- CreateIndex
CREATE INDEX "QuoteSnapshot_createdById_idx" ON "QuoteSnapshot"("createdById");

-- CreateIndex
CREATE INDEX "QuoteAuditEvent_quoteId_createdAt_idx" ON "QuoteAuditEvent"("quoteId", "createdAt");

-- CreateIndex
CREATE INDEX "QuoteAuditEvent_actorId_idx" ON "QuoteAuditEvent"("actorId");

-- CreateIndex
CREATE INDEX "SpecRevision_quoteId_createdAt_idx" ON "SpecRevision"("quoteId", "createdAt");

-- CreateIndex
CREATE INDEX "SpecRevision_createdById_idx" ON "SpecRevision"("createdById");

-- AddForeignKey
ALTER TABLE "QuoteSnapshot" ADD CONSTRAINT "QuoteSnapshot_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteSnapshot" ADD CONSTRAINT "QuoteSnapshot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteAuditEvent" ADD CONSTRAINT "QuoteAuditEvent_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteAuditEvent" ADD CONSTRAINT "QuoteAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecRevision" ADD CONSTRAINT "SpecRevision_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecRevision" ADD CONSTRAINT "SpecRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
