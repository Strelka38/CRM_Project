-- AlterEnum
ALTER TYPE "SpecOverrideAction" ADD VALUE 'SET_COMMENT';
ALTER TYPE "SpecOverrideAction" ADD VALUE 'REPLACE';

-- AlterTable
ALTER TABLE "SpecOverride" ADD COLUMN "catalogItemId" TEXT;

-- AlterTable
ALTER TABLE "SpecExtraBlock" ADD COLUMN "comment" TEXT NOT NULL DEFAULT '';
