import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { addEquipmentUnit, writeOffEquipmentUnit } from "@/lib/equipment";
import { requireDatabaseAccess } from "@/lib/session";
import { newQrToken } from "@/lib/uploads";

const bodySchema = z.object({
  action: z.enum(["delete", "copy"]),
  itemIds: z.array(z.string()).default([]),
  kitIds: z.array(z.string()).default([]),
  categoryIds: z.array(z.string()).default([]),
  unitIds: z.array(z.string()).default([]),
  writeOffReason: z.enum(["DAMAGED", "LOST"]).optional(),
  writeOffComment: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireDatabaseAccess();
    const body = bodySchema.parse(await req.json());
    const itemIds = [...new Set(body.itemIds)];
    const kitIds = [...new Set(body.kitIds)];
    const categoryIds = [...new Set(body.categoryIds)];
    const unitIds = [...new Set(body.unitIds)];

    if (
      itemIds.length === 0 &&
      kitIds.length === 0 &&
      categoryIds.length === 0 &&
      unitIds.length === 0
    ) {
      return NextResponse.json(
        { error: "Ничего не выбрано" },
        { status: 400 },
      );
    }

    if (body.action === "delete") {
      let writtenOff = 0;
      if (unitIds.length) {
        const reason = body.writeOffReason ?? "DAMAGED";
        const comment = (body.writeOffComment ?? "").trim();
        for (const unitId of unitIds) {
          try {
            await writeOffEquipmentUnit({ unitId, reason, comment });
            writtenOff += 1;
          } catch (e) {
            if (e instanceof Error && e.message === "NOT_FOUND") continue;
            throw e;
          }
        }
      }
      if (itemIds.length) {
        await prisma.catalogItem.updateMany({
          where: { id: { in: itemIds } },
          data: { active: false },
        });
      }
      if (kitIds.length) {
        await prisma.kit.updateMany({
          where: { id: { in: kitIds } },
          data: { active: false },
        });
      }
      if (categoryIds.length) {
        const selected = await prisma.catalogCategory.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, path: true },
        });
        const pathFilters = selected.flatMap((c) => [
          { id: c.id },
          { path: { startsWith: `${c.path}/` } },
        ]);
        if (pathFilters.length) {
          await prisma.$transaction([
            prisma.catalogCategory.updateMany({
              where: { OR: pathFilters },
              data: { active: false },
            }),
            prisma.catalogItem.updateMany({
              where: {
                category: { OR: pathFilters },
              },
              data: { active: false },
            }),
          ]);
        }
      }
      return NextResponse.json({
        ok: true,
        deleted: {
          items: itemIds.length,
          kits: kitIds.length,
          categories: categoryIds.length,
          units: writtenOff,
        },
      });
    }

    // copy items (+ optional kits as shallow name copies)
    let copiedItems = 0;
    let copiedKits = 0;
    let copiedUnits = 0;

    if (unitIds.length) {
      const units = await prisma.equipmentUnit.findMany({
        where: { id: { in: unitIds }, active: true },
        select: { catalogItemId: true },
      });
      for (const unit of units) {
        await addEquipmentUnit(unit.catalogItemId);
        copiedUnits += 1;
      }
    }

    for (const id of itemIds) {
      const src = await prisma.catalogItem.findUnique({ where: { id } });
      if (!src || !src.active) continue;
      const max = await prisma.catalogItem.aggregate({
        where: { categoryId: src.categoryId },
        _max: { sortOrder: true },
      });
      const created = await prisma.catalogItem.create({
        data: {
          categoryId: src.categoryId,
          name: `${src.name} (копия)`,
          model: src.model,
          manufacturer: src.manufacturer,
          basePrice: src.basePrice,
          cashlessOverride: src.cashlessOverride,
          estimatedValue: src.estimatedValue,
          costPrice: src.costPrice,
          stockQty: 0,
          width: src.width,
          height: src.height,
          depth: src.depth,
          power: src.power,
          weight: src.weight,
          comment: src.comment,
          owners: src.owners,
          dayMode: src.dayMode,
          itemKind: src.itemKind,
          showInCatalog: src.showInCatalog,
          sortOrder: (max._max.sortOrder ?? 0) + 1,
          active: true,
        },
      });
      // Одна единица-заготовка для QR при копировании оборудования
      if (src.itemKind === "EQUIPMENT" && src.stockQty > 0) {
        await prisma.equipmentUnit.create({
          data: {
            catalogItemId: created.id,
            unitNumber: 1,
            qrToken: newQrToken(),
          },
        });
      }
      copiedItems += 1;
    }

    for (const id of kitIds) {
      const src = await prisma.kit.findUnique({
        where: { id },
        include: { components: true },
      });
      if (!src || !src.active) continue;
      const max = await prisma.kit.aggregate({
        where: { categoryId: src.categoryId },
        _max: { sortOrder: true },
      });
      await prisma.kit.create({
        data: {
          name: `${src.name} (копия)`,
          description: src.description,
          categoryId: src.categoryId,
          basePrice: src.basePrice,
          sortOrder: (max._max.sortOrder ?? 0) + 1,
          active: true,
          components: {
            create: src.components.map((c) => ({
              catalogItemId: c.catalogItemId,
              qty: c.qty,
            })),
          },
        },
      });
      copiedKits += 1;
    }

    return NextResponse.json({
      ok: true,
      copied: { items: copiedItems, kits: copiedKits, units: copiedUnits },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error("[POST /api/catalog/bulk]", e);
    return NextResponse.json(
      { error: "Не удалось выполнить действие" },
      { status: 500 },
    );
  }
}
