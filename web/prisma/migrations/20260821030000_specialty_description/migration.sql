-- AlterTable
ALTER TABLE "Specialty" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '';
