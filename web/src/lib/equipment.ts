import { prisma } from "@/lib/db";
import { newQrToken } from "@/lib/uploads";

export { formatUnitId } from "@/lib/equipment-id";

/** Гарантирует публичный equipmentCode у позиции каталога. */
export async function ensureEquipmentCode(catalogItemId: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const item = await prisma.catalogItem.findUnique({
      where: { id: catalogItemId },
      select: { id: true, equipmentCode: true },
    });
    if (!item) return null;
    if (item.equipmentCode != null) return item.equipmentCode;

    const max = await prisma.catalogItem.aggregate({
      _max: { equipmentCode: true },
    });
    const next = (max._max.equipmentCode ?? 1000) + 1 + attempt;
    try {
      const updated = await prisma.catalogItem.update({
        where: { id: catalogItemId },
        data: { equipmentCode: next },
        select: { equipmentCode: true },
      });
      return updated.equipmentCode;
    } catch {
      // unique race — retry
    }
  }
  const fallback = await prisma.catalogItem.findUnique({
    where: { id: catalogItemId },
    select: { equipmentCode: true },
  });
  return fallback?.equipmentCode ?? null;
}

/** Создаёт недостающие доступные (не в ремонте) единицы до targetCount. */
export async function syncEquipmentUnits(
  catalogItemId: string,
  targetCount: number,
) {
  const target = Math.max(0, Math.floor(targetCount));
  const existing = await prisma.equipmentUnit.findMany({
    where: { catalogItemId, active: true, inRepair: false },
    orderBy: { unitNumber: "asc" },
    select: { id: true, unitNumber: true },
  });

  if (existing.length >= target) {
    return existing;
  }

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

  return prisma.equipmentUnit.findMany({
    where: { catalogItemId, active: true, inRepair: false },
    orderBy: { unitNumber: "asc" },
  });
}

export async function addEquipmentUnit(catalogItemId: string) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.catalogItem.findUnique({
      where: { id: catalogItemId },
      select: { id: true, active: true, stockQty: true },
    });
    if (!item || !item.active) throw new Error("NOT_FOUND");

    const maxAgg = await tx.equipmentUnit.aggregate({
      where: { catalogItemId },
      _max: { unitNumber: true },
    });

    const unit = await tx.equipmentUnit.create({
      data: {
        catalogItemId,
        unitNumber: (maxAgg._max.unitNumber ?? 0) + 1,
        qrToken: newQrToken(),
      },
    });

    await tx.catalogItem.update({
      where: { id: catalogItemId },
      data: { stockQty: item.stockQty + 1 },
    });

    return unit;
  });
}

export async function writeOffEquipmentUnit(opts: {
  unitId: string;
  reason: "DAMAGED" | "LOST";
  comment: string;
}) {
  return prisma.$transaction(async (tx) => {
    const unit = await tx.equipmentUnit.findUnique({
      where: { id: opts.unitId },
      include: { catalogItem: { select: { stockQty: true } } },
    });
    if (!unit || !unit.active) throw new Error("NOT_FOUND");

    const openRepair = await tx.equipmentRepair.findFirst({
      where: { unitId: unit.id, status: "OPEN" },
    });
    if (openRepair) {
      const reasonLabel = opts.reason === "LOST" ? "утеряно" : "повреждено";
      await tx.equipmentRepair.update({
        where: { id: openRepair.id },
        data: {
          status: "CLOSED",
          resolutionComment:
            openRepair.resolutionComment || `Списано со склада (${reasonLabel})`,
          resolvedAt: new Date(),
        },
      });
    }

    await tx.equipmentUnit.update({
      where: { id: unit.id },
      data: {
        active: false,
        inRepair: false,
        writeOffReason: opts.reason,
        writeOffComment: opts.comment,
        writeOffAt: new Date(),
      },
    });

    if (!unit.inRepair) {
      await tx.catalogItem.update({
        where: { id: unit.catalogItemId },
        data: { stockQty: Math.max(0, unit.catalogItem.stockQty - 1) },
      });
    }
  });
}

export const equipmentItemInclude = {
  category: true,
  equipmentUnits: {
    orderBy: [{ active: "desc" as const }, { unitNumber: "asc" as const }],
  },
  equipmentDocuments: {
    orderBy: { createdAt: "desc" as const },
    include: {
      uploader: { select: { id: true, name: true } },
    },
  },
};

/**
 * Назначить equipmentCode всем позициям без кода и создать единицы
 * по stockQty (недостающие).
 */
export async function syncAllCatalogEquipment() {
  const items = await prisma.catalogItem.findMany({
    where: { active: true, itemKind: "EQUIPMENT" },
    select: { id: true, stockQty: true, equipmentCode: true },
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

    if (item.stockQty <= 0) continue;

    const before = await prisma.equipmentUnit.count({
      where: { catalogItemId: item.id, active: true, inRepair: false },
    });
    await syncEquipmentUnits(item.id, item.stockQty);
    const after = await prisma.equipmentUnit.count({
      where: { catalogItemId: item.id, active: true, inRepair: false },
    });
    unitsCreated += Math.max(0, after - before);
  }

  return {
    items: items.length,
    codesAssigned,
    unitsCreated,
  };
}
