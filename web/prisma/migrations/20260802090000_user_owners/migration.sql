-- AlterTable
ALTER TABLE "User" ADD COLUMN "owners" "CatalogOwner"[] DEFAULT ARRAY[]::"CatalogOwner"[];
