import { prisma } from "@/lib/db";

export async function sendUnitToRepair(opts: {
  unitId: string;
  userId: string;
  faultType: string;
  comment: string;
}) {
  return prisma.$transaction(async (tx) => {
    const unit = await tx.equipmentUnit.findUnique({
      where: { id: opts.unitId },
      select: {
        id: true,
        active: true,
        inRepair: true,
        catalogItemId: true,
        catalogItem: { select: { stockQty: true, active: true } },
      },
    });
    if (!unit || !unit.active || !unit.catalogItem.active) {
      throw new Error("NOT_FOUND");
    }
    if (unit.inRepair) {
      throw new Error("ALREADY_IN_REPAIR");
    }

    const repair = await tx.equipmentRepair.create({
      data: {
        unitId: unit.id,
        faultType: opts.faultType,
        comment: opts.comment,
        reportedById: opts.userId,
      },
    });

    await tx.equipmentUnit.update({
      where: { id: unit.id },
      data: { inRepair: true },
    });

    await tx.catalogItem.update({
      where: { id: unit.catalogItemId },
      data: { stockQty: Math.max(0, unit.catalogItem.stockQty - 1) },
    });

    return repair;
  });
}

export async function returnUnitFromRepair(opts: {
  repairId: string;
  userId: string;
  resolutionComment: string;
}) {
  return prisma.$transaction(async (tx) => {
    const repair = await tx.equipmentRepair.findUnique({
      where: { id: opts.repairId },
      include: {
        unit: {
          select: {
            id: true,
            inRepair: true,
            catalogItemId: true,
            catalogItem: { select: { stockQty: true } },
          },
        },
      },
    });
    if (!repair || repair.status !== "OPEN") {
      throw new Error("NOT_FOUND");
    }

    const updated = await tx.equipmentRepair.update({
      where: { id: repair.id },
      data: {
        status: "CLOSED",
        resolutionComment: opts.resolutionComment,
        resolvedAt: new Date(),
        resolvedById: opts.userId,
      },
    });

    if (repair.unit.inRepair) {
      await tx.equipmentUnit.update({
        where: { id: repair.unit.id },
        data: { inRepair: false },
      });
      await tx.catalogItem.update({
        where: { id: repair.unit.catalogItemId },
        data: { stockQty: repair.unit.catalogItem.stockQty + 1 },
      });
    }

    return updated;
  });
}
