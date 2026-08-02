-- AlterTable
ALTER TABLE "Quote" ADD COLUMN "sharesCustom" BOOLEAN NOT NULL DEFAULT false;

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
CREATE TABLE "QuoteExtraExpense" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "company" "CatalogOwner",
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteExtraExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuoteCalcShare_quoteId_idx" ON "QuoteCalcShare"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteCalcShare_quoteId_company_key" ON "QuoteCalcShare"("quoteId", "company");

-- CreateIndex
CREATE INDEX "QuoteExtraExpense_quoteId_idx" ON "QuoteExtraExpense"("quoteId");

-- AddForeignKey
ALTER TABLE "QuoteCalcShare" ADD CONSTRAINT "QuoteCalcShare_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteExtraExpense" ADD CONSTRAINT "QuoteExtraExpense_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
