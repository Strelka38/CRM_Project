-- CreateEnum
CREATE TYPE "CalcLineMode" AS ENUM ('SHARE', 'AMOUNT');

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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteCalcLineOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuoteCalcLineOverride_quoteId_idx" ON "QuoteCalcLineOverride"("quoteId");

-- CreateIndex
CREATE INDEX "QuoteCalcLineOverride_blockId_idx" ON "QuoteCalcLineOverride"("blockId");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteCalcLineOverride_quoteId_blockId_key" ON "QuoteCalcLineOverride"("quoteId", "blockId");

-- AddForeignKey
ALTER TABLE "QuoteCalcLineOverride" ADD CONSTRAINT "QuoteCalcLineOverride_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
