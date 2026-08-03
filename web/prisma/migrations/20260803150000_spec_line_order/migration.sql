-- AlterTable
ALTER TABLE "Quote" ADD COLUMN "specLineOrder" TEXT[] DEFAULT ARRAY[]::TEXT[];
