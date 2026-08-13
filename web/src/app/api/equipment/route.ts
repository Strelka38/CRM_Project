import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  ensureEquipmentCode,
  syncAllCatalogEquipment,
  syncEquipmentUnits,
} from "@/lib/equipment";
import { requireDatabaseAccess } from "@/lib/session";

/** Список позиций каталога с единицами оборудования. */
export async function GET(req: NextRequest) {
  try {
    await requireDatabaseAccess();
    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    const pathPrefix = (req.nextUrl.searchParams.get("path") || "").trim();
    const items = await prisma.catalogItem.findMany({
      where: {
        active: true,
        itemKind: "EQUIPMENT",
        ...(pathPrefix
          ? { category: { path: { startsWith: pathPrefix } } }
          : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { model: { contains: q, mode: "insensitive" } },
                { manufacturer: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        model: true,
        stockQty: true,
        equipmentCode: true,
        photoPath: true,
        category: { select: { id: true, path: true, name: true } },
        _count: {
          select: {
            equipmentUnits: { where: { active: true, inRepair: false } },
          },
        },
      },
    });
    return NextResponse.json(items);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/equipment]", e);
    return NextResponse.json(
      { error: "Не удалось загрузить список оборудования" },
      { status: 500 },
    );
  }
}

/**
 * Создать единицы:
 * - { syncAll: true } — коды + единицы по stockQty для всего каталога
 * - { catalogItemId, sync: true } — догнать единицы одной позиции до stockQty
 * - { catalogItemId, count? } — создать до count (или +1)
 */
export async function POST(req: NextRequest) {
  try {
    await requireDatabaseAccess();
    const body = (await req.json()) as {
      catalogItemId?: string;
      count?: number;
      sync?: boolean;
      syncAll?: boolean;
    };

    if (body.syncAll) {
      const result = await syncAllCatalogEquipment();
      return NextResponse.json(result);
    }

    const catalogItemId = body.catalogItemId?.trim();
    if (!catalogItemId) {
      return NextResponse.json(
        { error: "catalogItemId обязателен" },
        { status: 400 },
      );
    }

    const item = await prisma.catalogItem.findUnique({
      where: { id: catalogItemId },
      select: { id: true, stockQty: true, active: true },
    });
    if (!item || !item.active) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await ensureEquipmentCode(catalogItemId);

    let target: number;
    if (body.sync) {
      target = item.stockQty;
    } else if (body.count != null) {
      target = Math.max(0, Math.floor(body.count));
    } else {
      const current = await prisma.equipmentUnit.count({
        where: { catalogItemId, active: true },
      });
      target = current + 1;
    }

    const units = await syncEquipmentUnits(catalogItemId, target);
    return NextResponse.json({ units });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[POST /api/equipment]", e);
    return NextResponse.json(
      { error: "Не удалось создать единицы" },
      { status: 500 },
    );
  }
}
