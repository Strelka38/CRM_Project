import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { csvFileResponse, readUploadedCsv } from "@/lib/csv";
import {
  RATE_CSV_HEADERS,
  parseRateCsv,
  rateToCsvCells,
} from "@/lib/directory-csv";
import { requireDatabaseAccess } from "@/lib/session";
import { replaceSpecialtyCatalogItems } from "@/lib/specialty-link";

function splitServiceNames(raw: string): string[] {
  return raw
    .split(/[;|]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

export async function GET() {
  try {
    await requireDatabaseAccess();
    const rows = await prisma.specialty.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        catalogItems: { include: { catalogItem: { select: { name: true } } } },
      },
    });
    const stamp = new Date().toISOString().slice(0, 10);
    return csvFileResponse(`rates-${stamp}.csv`, [
      [...RATE_CSV_HEADERS],
      ...rows.map((s) =>
        rateToCsvCells({
          ...s,
          serviceName: s.catalogItems
            .map((row) => row.catalogItem.name)
            .filter(Boolean)
            .join("; "),
        }),
      ),
    ]);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/specialties/csv]", e);
    return NextResponse.json({ error: "Не удалось экспортировать" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireDatabaseAccess();
    const uploaded = await readUploadedCsv(req);
    if ("error" in uploaded) return uploaded.error;
    const { rows, errors } = parseRateCsv(uploaded.text);
    if (rows.length === 0) {
      return NextResponse.json(
        { error: errors[0] || "Нет строк для импорта", errors, created: 0, updated: 0 },
        { status: 400 },
      );
    }
    let created = 0;
    let updated = 0;
    const rowErrors = [...errors];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const data = {
        name: r.name,
        sortOrder: r.sortOrder,
        hourlyRate: r.hourlyRate,
        shiftRate: r.shiftRate,
        description: r.description,
        active: r.active,
      };
      let catalogItemIds: string[] | undefined;
      if (r.serviceName !== undefined) {
        catalogItemIds = [];
        for (const serviceName of splitServiceNames(r.serviceName)) {
          const item = await prisma.catalogItem.findFirst({
            where: {
              name: { equals: serviceName, mode: "insensitive" },
              itemKind: { in: ["SERVICE", "PERSONNEL"] },
            },
            select: { id: true },
          });
          if (!item) {
            rowErrors.push(
              `Строка ${i + 2}: услуга «${serviceName}» не найдена в каталоге`,
            );
            continue;
          }
          catalogItemIds.push(item.id);
        }
      }
      try {
        const byId = r.id
          ? await prisma.specialty.findUnique({
              where: { id: r.id },
              select: { id: true },
            })
          : null;
        const byName = await prisma.specialty.findUnique({
          where: { name: r.name },
          select: { id: true },
        });
        const existingId = byId?.id || byName?.id;
        const specialtyId = existingId
          ? (
              await prisma.specialty.update({
                where: { id: existingId },
                data,
              })
            ).id
          : (await prisma.specialty.create({ data })).id;
        if (existingId) updated += 1;
        else created += 1;
        if (catalogItemIds) {
          await replaceSpecialtyCatalogItems(specialtyId, [
            ...new Set(catalogItemIds),
          ]);
        }
      } catch (err) {
        rowErrors.push(
          `Строка ${i + 2}: ${err instanceof Error ? err.message : "ошибка"}`,
        );
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
    console.error("[POST /api/specialties/csv]", e);
    return NextResponse.json({ error: "Не удалось импортировать" }, { status: 500 });
  }
}
