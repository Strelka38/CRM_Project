import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { csvFileResponse, readUploadedCsv } from "@/lib/csv";
import {
  KIT_CSV_HEADERS,
  kitToCsvCells,
  parseKitCsv,
} from "@/lib/directory-csv";
import { loadCategoryPathCache } from "@/lib/catalog-path";
import { requireDatabaseAccess } from "@/lib/session";

export async function GET() {
  try {
    await requireDatabaseAccess();
    const kits = await prisma.kit.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        category: { select: { path: true } },
        components: { include: { catalogItem: { select: { name: true } } } },
      },
    });
    const stamp = new Date().toISOString().slice(0, 10);
    return csvFileResponse(`kits-${stamp}.csv`, [
      [...KIT_CSV_HEADERS],
      ...kits.map((k) => kitToCsvCells(k)),
    ]);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/kits/csv]", e);
    return NextResponse.json({ error: "Не удалось экспортировать" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireDatabaseAccess();
    const uploaded = await readUploadedCsv(req);
    if ("error" in uploaded) return uploaded.error;
    const { rows, errors } = parseKitCsv(uploaded.text);
    if (rows.length === 0) {
      return NextResponse.json(
        { error: errors[0] || "Нет строк для импорта", errors, created: 0, updated: 0 },
        { status: 400 },
      );
    }
    const cache = await loadCategoryPathCache();
    let created = 0;
    let updated = 0;
    const rowErrors = [...errors];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const lineNo = i + 2;
      try {
        const itemIds = [...new Set(r.components.map((c) => c.catalogItemId))];
        const items = await prisma.catalogItem.findMany({
          where: { id: { in: itemIds } },
          select: { id: true },
        });
        const known = new Set(items.map((x) => x.id));
        const components = r.components.filter((c) => known.has(c.catalogItemId));
        if (components.length === 0) {
          rowErrors.push(`Строка ${lineNo}: ни одной позиции каталога не найдено`);
          continue;
        }
        const categoryId = r.categoryPath ? cache.get(r.categoryPath) ?? null : null;
        const data = {
          name: r.name,
          description: r.description || null,
          categoryId,
          sortOrder: r.sortOrder,
          active: r.active,
          showInCatalog: r.showInCatalog,
        };
        const existing = r.id
          ? await prisma.kit.findUnique({ where: { id: r.id }, select: { id: true } })
          : null;
        if (existing) {
          await prisma.$transaction(async (tx) => {
            await tx.kit.update({ where: { id: existing.id }, data });
            await tx.kitComponent.deleteMany({ where: { kitId: existing.id } });
            await tx.kitComponent.createMany({
              data: components.map((c) => ({
                kitId: existing.id,
                catalogItemId: c.catalogItemId,
                qty: c.qty,
              })),
            });
          });
          updated += 1;
          continue;
        }
        await prisma.kit.create({
          data: {
            ...data,
            components: {
              create: components.map((c) => ({
                catalogItemId: c.catalogItemId,
                qty: c.qty,
              })),
            },
          },
        });
        created += 1;
      } catch (err) {
        rowErrors.push(`Строка ${lineNo}: ${err instanceof Error ? err.message : "ошибка"}`);
      }
    }
    return NextResponse.json({
      created,
      updated,
      total: rows.length,
      errors: rowErrors.slice(0, 50),
      errorCount: rowErrors.length,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[POST /api/kits/csv]", e);
    return NextResponse.json({ error: "Не удалось импортировать" }, { status: 500 });
  }
}
