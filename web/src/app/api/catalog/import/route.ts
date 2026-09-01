import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseCatalogCsv } from "@/lib/catalog-csv";
import {
  ensureCategoryPath,
  loadCategoryPathCache,
  mapCategoryKind,
  reactivateCategoryPaths,
} from "@/lib/catalog-path";
import { requireDatabaseAccess } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    await requireDatabaseAccess();

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Файл обязателен" }, { status: 400 });
    }
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Файл больше 20 МБ" },
        { status: 400 },
      );
    }

    const text = await file.text();
    const { rows, errors } = parseCatalogCsv(text);
    if (rows.length === 0) {
      return NextResponse.json(
        {
          error: errors[0] || "Нет строк для импорта",
          errors,
          created: 0,
          updated: 0,
        },
        { status: 400 },
      );
    }

    const cache = await loadCategoryPathCache();
    let created = 0;
    let updated = 0;
    const rowErrors = [...errors];
    const touchedPaths = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        const top = r.categoryPath.split("/")[0]?.trim() || "Разное";
        const kind = mapCategoryKind(top, r.itemKind);
        const categoryId = await ensureCategoryPath(
          r.categoryPath,
          cache,
          kind,
        );
        touchedPaths.add(r.categoryPath);

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
          itemKind: r.itemKind,
          owners: r.owners,
          active: r.active,
          showInCatalog: r.showInCatalog,
          sortOrder: r.sortOrder,
          ...(r.equipmentCode != null
            ? { equipmentCode: r.equipmentCode }
            : {}),
        };

        if (r.id) {
          const existing = await prisma.catalogItem.findUnique({
            where: { id: r.id },
            select: { id: true },
          });
          if (existing) {
            // Avoid unique conflict on equipmentCode when another item has it
            if (r.equipmentCode != null) {
              const clash = await prisma.catalogItem.findFirst({
                where: {
                  equipmentCode: r.equipmentCode,
                  NOT: { id: r.id },
                },
                select: { id: true },
              });
              if (clash) {
                delete (data as { equipmentCode?: number }).equipmentCode;
              }
            }
            await prisma.catalogItem.update({
              where: { id: r.id },
              data,
            });
            updated += 1;
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

        await prisma.catalogItem.create({ data });
        created += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "ошибка";
        rowErrors.push(`Строка ${i + 2}: ${msg}`);
      }
    }

    await reactivateCategoryPaths(touchedPaths);

    return NextResponse.json({
      created,
      updated,
      total: rows.length,
      errors: rowErrors.slice(0, 50),
      errorCount: rowErrors.length,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[POST /api/catalog/import]", e);
    return NextResponse.json(
      { error: "Не удалось импортировать каталог" },
      { status: 500 },
    );
  }
}
