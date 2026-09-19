-- AlterEnum
ALTER TYPE "SpecOverrideAction" ADD VALUE 'DELETE';

-- AlterTable
ALTER TABLE "SpecExtraBlock" ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;
