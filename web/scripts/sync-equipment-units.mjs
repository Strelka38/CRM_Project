/**
 * Назначить equipmentCode позициям каталога и создать единицы по stockQty.
 * Usage: node scripts/sync-equipment-units.mjs
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

function newQrToken() {
  return randomBytes(12).toString("base64url");
}

async function syncUnits(catalogItemId, targetCount) {
  const target = Math.max(0, Math.floor(targetCount));
  const existing = await prisma.equipmentUnit.findMany({
    where: { catalogItemId, active: true, inRepair: false },
    orderBy: { unitNumber: "asc" },
    select: { unitNumber: true },
  });
  if (existing.length >= target) return 0;

  const maxAgg = await prisma.equipmentUnit.aggregate({
    where: { catalogItemId },
    _max: { unitNumber: true },
  });
  const maxNum = maxAgg._max.unitNumber ?? 0;
  const toCreate = target - existing.length;
  const data = Array.from({ length: toCreate }, (_, i) => ({
    catalogItemId,
    unitNumber: maxNum + i + 1,
    qrToken: newQrToken(),
  }));
  await prisma.equipmentUnit.createMany({ data });
  return toCreate;
}

async function main() {
  const items = await prisma.catalogItem.findMany({
    where: { active: true, itemKind: "EQUIPMENT" },
    select: { id: true, name: true, stockQty: true, equipmentCode: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  const maxAgg = await prisma.catalogItem.aggregate({
    _max: { equipmentCode: true },
  });
  let nextCode = (maxAgg._max.equipmentCode ?? 1000) + 1;

  let codesAssigned = 0;
  let unitsCreated = 0;

  for (const item of items) {
    if (item.equipmentCode == null) {
      await prisma.catalogItem.update({
        where: { id: item.id },
        data: { equipmentCode: nextCode },
      });
      nextCode += 1;
      codesAssigned += 1;
    }
    if (item.stockQty > 0) {
      unitsCreated += await syncUnits(item.id, item.stockQty);
    }
  }

  const totalUnits = await prisma.equipmentUnit.count({
    where: { active: true },
  });
  const withCode = await prisma.catalogItem.count({
    where: { active: true, itemKind: "EQUIPMENT", equipmentCode: { not: null } },
  });

  console.log(
    JSON.stringify(
      {
        items: items.length,
        codesAssigned,
        unitsCreated,
        totalUnits,
        withCode,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
