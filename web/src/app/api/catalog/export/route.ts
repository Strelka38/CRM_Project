import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  CATALOG_CSV_HEADERS,
  catalogItemToCsvCells,
  toCsv,
} from "@/lib/catalog-csv";
import { requireDatabaseAccess } from "@/lib/session";

export async function GET() {
  try {
    await requireDatabaseAccess();

    const items = await prisma.catalogItem.findMany({
      orderBy: [{ category: { path: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
      include: { category: { select: { path: true } } },
    });

    const rows = [
      [...CATALOG_CSV_HEADERS],
      ...items.map((item) => catalogItemToCsvCells(item)),
    ];
    // BOM — чтобы Excel корректно открывал кириллицу
    const csv = `\uFEFF${toCsv(rows)}`;
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `catalog-${stamp}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/catalog/export]", e);
    return NextResponse.json(
      { error: "Не удалось экспортировать каталог" },
      { status: 500 },
    );
  }
}
