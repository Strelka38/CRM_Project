ALTER TABLE "EquipmentUnit" ADD COLUMN IF NOT EXISTS "owner" "CatalogOwner";

CREATE INDEX IF NOT EXISTS "EquipmentUnit_owner_idx" ON "EquipmentUnit"("owner");

-- Если у позиции ровно один тег фирмы, все её единицы без склада получают этот склад.
UPDATE "EquipmentUnit" u
SET "owner" = sub.only_owner
FROM (
  SELECT id, ("owners")[1] AS only_owner
  FROM "CatalogItem"
  WHERE cardinality("owners") = 1
) sub
WHERE u."catalogItemId" = sub.id
  AND u."owner" IS NULL;
