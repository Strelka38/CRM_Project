import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  CATALOG_CSV_HEADERS,
  catalogItemToCsvCells,
  toCsv,
} from "@/lib/catalog-csv";
import {
  WAREHOUSE_UNIT_HEADERS,
  warehouseUnitToCsvCells,
} from "@/lib/warehouse-csv";
import { requireDatabaseAccess } from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
    await requireDatabaseAccess();
    const kind = req.nextUrl.searchParams.get("kind") || "items";
    const stamp = new Date().toISOString().slice(0, 10);

    if (kind === "units") {
      const units = await prisma.equipmentUnit.findMany({
        orderBy: [
          { catalogItem: { equipmentCode: "asc" } },
          { unitNumber: "asc" },
        ],
        include: {
          catalogItem: { select: { name: true, equipmentCode: true } },
        },
      });
      const rows = [
        [...WAREHOUSE_UNIT_HEADERS],
        ...units.map((u) => warehouseUnitToCsvCells(u)),
      ];
      const csv = `\uFEFF${toCsv(rows)}`;
      const filename = `warehouse-units-${stamp}.csv`;
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
          "Cache-Control": "no-store",
        },
      });
    }

    const items = await prisma.catalogItem.findMany({
      where: { itemKind: "EQUIPMENT" },
      orderBy: [
        { category: { path: "asc" } },
        { sortOrder: "asc" },
        { name: "asc" },
      ],
      include: { category: { select: { path: true } } },
    });
    const rows = [
      [...CATALOG_CSV_HEADERS],
      ...items.map((item) => catalogItemToCsvCells(item)),
    ];
    const csv = `\uFEFF${toCsv(rows)}`;
    const filename = `warehouse-${stamp}.csv`;
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/equipment/export]", e);
    return NextResponse.json(
      { error: "Не удалось экспортировать склад" },
      { status: 500 },
    );
  }
}
