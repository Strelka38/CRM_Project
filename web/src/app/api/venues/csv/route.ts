import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { csvFileResponse, readUploadedCsv } from "@/lib/csv";
import {
  VENUE_CSV_HEADERS,
  parseVenueCsv,
  venueToCsvCells,
} from "@/lib/directory-csv";
import { requireDatabaseAccess } from "@/lib/session";

const venueSelect = {
  id: true,
  name: true,
  address: true,
  mapUrl: true,
  comment: true,
  active: true,
} as const;

export async function GET() {
  try {
    await requireDatabaseAccess();
    const venues = await prisma.venue.findMany({
      orderBy: { name: "asc" },
      select: venueSelect,
    });
    const stamp = new Date().toISOString().slice(0, 10);
    return csvFileResponse(`venues-${stamp}.csv`, [
      [...VENUE_CSV_HEADERS],
      ...venues.map((v) => venueToCsvCells(v)),
    ]);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/venues/csv]", e);
    return NextResponse.json({ error: "Не удалось экспортировать" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireDatabaseAccess();
    const uploaded = await readUploadedCsv(req);
    if ("error" in uploaded) return uploaded.error;
    const { rows, errors } = parseVenueCsv(uploaded.text);
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
        address: r.address,
        mapUrl: r.mapUrl,
        comment: r.comment,
        active: r.active,
      };
      try {
        if (r.id) {
          const existing = await prisma.venue.findUnique({
            where: { id: r.id },
            select: { id: true },
          });
          if (existing) {
            await prisma.venue.update({ where: { id: r.id }, data });
            updated += 1;
            continue;
          }
        }
        await prisma.venue.create({ data });
        created += 1;
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
    console.error("[POST /api/venues/csv]", e);
    return NextResponse.json({ error: "Не удалось импортировать" }, { status: 500 });
  }
}
