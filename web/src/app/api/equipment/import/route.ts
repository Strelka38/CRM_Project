import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseCatalogCsv } from "@/lib/catalog-csv";
import {
  ensureCategoryPath,
  loadCategoryPathCache,
} from "@/lib/catalog-path";
import { ensureEquipmentCode, syncEquipmentUnits } from "@/lib/equipment";
import { requireDatabaseAccess } from "@/lib/session";
import {
  detectWarehouseCsvKind,
  nextQrToken,
  parseWarehouseUnitsCsv,
} from "@/lib/warehouse-csv";

export async function POST(req: NextRequest) {
  try {
    await requireDatabaseAccess();

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Файл обязателен" }, { status: 400 });
    }
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "Файл больше 20 МБ" }, { status: 400 });
    }

    const text = await file.text();
    const kind = detectWarehouseCsvKind(text);
    if (kind === "unknown") {
      return NextResponse.json(
        {
          error:
            "Непонятный формат CSV. Нужны колонки склада (Название + Путь) или единиц (QR-токен / №).",
        },
        { status: 400 },
      );
    }

    const result =
      kind === "units" ? await importUnits(text) : await importItems(text);
    if (result.created + result.updated === 0 && result.error) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[POST /api/equipment/import]", e);
    return NextResponse.json(
      { error: "Не удалось импортировать склад" },
      { status: 500 },
    );
  }
}

async function importItems(text: string) {
  const { rows, errors } = parseCatalogCsv(text);
  if (rows.length === 0) {
    return {
      kind: "items" as const,
      error: errors[0] || "Нет строк для импорта",
      errors,
      created: 0,
      updated: 0,
    };
  }

  const cache = await loadCategoryPathCache();
  let created = 0;
  let updated = 0;
  const rowErrors = [...errors];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.itemKind !== "EQUIPMENT") {
      rowErrors.push(`Строка ${i + 2}: пропущено (не оборудование)`);
      continue;
    }
    try {
      const categoryId = await ensureCategoryPath(
        r.categoryPath,
        cache,
        "EQUIPMENT",
      );
      const data = {
        categoryId,
        name: r.name,
        model: r.model,
        manufacturer: r.manufacturer,
        basePrice: r.basePrice,
        cashlessOverride: r.cashlessOverride,
        estimatedValue: r.estimatedValue,
        stockQty: r.stockQty,
        width: r.width,
        height: r.height,
        depth: r.depth,
        power: r.power,
        weight: r.weight,
        comment: r.comment,
        dayMode: r.dayMode,
        itemKind: "EQUIPMENT" as const,
        owners: r.owners,
        active: r.active,
        sortOrder: r.sortOrder,
        ...(r.equipmentCode != null ? { equipmentCode: r.equipmentCode } : {}),
      };

      let itemId = r.id;
      if (itemId) {
        const existing = await prisma.catalogItem.findUnique({
          where: { id: itemId },
          select: { id: true },
        });
        if (existing) {
          if (r.equipmentCode != null) {
            const clash = await prisma.catalogItem.findFirst({
              where: { equipmentCode: r.equipmentCode, NOT: { id: itemId } },
              select: { id: true },
            });
            if (clash) {
              delete (data as { equipmentCode?: number }).equipmentCode;
            }
          }
          await prisma.catalogItem.update({ where: { id: itemId }, data });
          updated += 1;
          await ensureEquipmentCode(itemId);
          await syncEquipmentUnits(itemId, r.stockQty);
          continue;
        }
      }

      if (r.equipmentCode != null) {
        const clash = await prisma.catalogItem.findFirst({
          where: { equipmentCode: r.equipmentCode },
          select: { id: true },
        });
        if (clash) {
          delete (data as { equipmentCode?: number }).equipmentCode;
        }
      }

      const createdItem = await prisma.catalogItem.create({ data });
      itemId = createdItem.id;
      created += 1;
      await ensureEquipmentCode(itemId);
      await syncEquipmentUnits(itemId, r.stockQty);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "ошибка";
      rowErrors.push(`Строка ${i + 2}: ${msg}`);
    }
  }

  return {
    kind: "items" as const,
    created,
    updated,
    total: rows.length,
    errors: rowErrors.slice(0, 50),
    errorCount: rowErrors.length,
  };
}

async function importUnits(text: string) {
  const { rows, errors } = parseWarehouseUnitsCsv(text);
  if (rows.length === 0) {
    return {
      kind: "units" as const,
      error: errors[0] || "Нет строк для импорта",
      errors,
      created: 0,
      updated: 0,
    };
  }

  let created = 0;
  let updated = 0;
  const rowErrors = [...errors];
  const touchedItems = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      let catalogItemId = r.catalogItemId;
      if (catalogItemId) {
        const exists = await prisma.catalogItem.findUnique({
          where: { id: catalogItemId },
          select: { id: true },
        });
        if (!exists) catalogItemId = null;
      }
      if (!catalogItemId && r.equipmentCode != null) {
        const byCode = await prisma.catalogItem.findFirst({
          where: { equipmentCode: r.equipmentCode, itemKind: "EQUIPMENT" },
          select: { id: true },
        });
        catalogItemId = byCode?.id ?? null;
      }
      if (!catalogItemId && r.itemName) {
        const byName = await prisma.catalogItem.findFirst({
          where: { name: r.itemName, itemKind: "EQUIPMENT", active: true },
          select: { id: true },
        });
        catalogItemId = byName?.id ?? null;
      }
      if (!catalogItemId) {
        rowErrors.push(`Строка ${i + 2}: не найдена позиция склада`);
        continue;
      }

      let qrToken = r.qrToken?.trim() || "";
      if (qrToken) {
        const taken = await prisma.equipmentUnit.findFirst({
          where: {
            qrToken,
            ...(r.id ? { NOT: { id: r.id } } : {}),
          },
          select: { id: true },
        });
        if (taken) qrToken = "";
      }
      if (!qrToken) qrToken = nextQrToken();

      const writeOffAt = r.writeOffAt ? new Date(r.writeOffAt) : null;
      const data = {
        catalogItemId,
        unitNumber: r.unitNumber,
        label: r.label,
        owner: r.owner,
        qrToken,
        active: r.writeOffReason ? false : r.active,
        inRepair: r.writeOffReason ? false : r.inRepair,
        writeOffReason: r.writeOffReason,
        writeOffComment: r.writeOffComment,
        writeOffAt:
          r.writeOffReason && writeOffAt && !Number.isNaN(writeOffAt.getTime())
            ? writeOffAt
            : r.writeOffReason
              ? new Date()
              : null,
      };

      if (r.id) {
        const existing = await prisma.equipmentUnit.findUnique({
          where: { id: r.id },
          select: { id: true },
        });
        if (existing) {
          await prisma.equipmentUnit.update({
            where: { id: r.id },
            data,
          });
          updated += 1;
          touchedItems.add(catalogItemId);
          continue;
        }
      }

      const byNumber = await prisma.equipmentUnit.findUnique({
        where: {
          catalogItemId_unitNumber: { catalogItemId, unitNumber: r.unitNumber },
        },
        select: { id: true },
      });
      if (byNumber) {
        await prisma.equipmentUnit.update({
          where: { id: byNumber.id },
          data,
        });
        updated += 1;
      } else {
        await prisma.equipmentUnit.create({ data });
        created += 1;
      }
      touchedItems.add(catalogItemId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "ошибка";
      rowErrors.push(`Строка ${i + 2}: ${msg}`);
    }
  }

  for (const itemId of touchedItems) {
    const available = await prisma.equipmentUnit.count({
      where: { catalogItemId: itemId, active: true, inRepair: false },
    });
    await prisma.catalogItem.update({
      where: { id: itemId },
      data: { stockQty: available },
    });
  }

  return {
    kind: "units" as const,
    created,
    updated,
    total: rows.length,
    errors: rowErrors.slice(0, 50),
    errorCount: rowErrors.length,
  };
}
