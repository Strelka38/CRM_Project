import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { csvFileResponse, readUploadedCsv } from "@/lib/csv";
import {
  VEHICLE_CSV_HEADERS,
  parseVehicleCsv,
  vehicleToCsvCells,
} from "@/lib/directory-csv";
import { requireDatabaseAccess } from "@/lib/session";

const select = {
  id: true,
  plateNumber: true,
  make: true,
  model: true,
  series: true,
  certificateNumber: true,
  fuelConsumption: true,
  mileage: true,
  operatingRules: true,
  comment: true,
  active: true,
} as const;

export async function GET() {
  try {
    await requireDatabaseAccess();
    const rows = await prisma.vehicle.findMany({
      orderBy: { plateNumber: "asc" },
      select,
    });
    const stamp = new Date().toISOString().slice(0, 10);
    return csvFileResponse(`vehicles-${stamp}.csv`, [
      [...VEHICLE_CSV_HEADERS],
      ...rows.map((v) => vehicleToCsvCells(v)),
    ]);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/vehicles/csv]", e);
    return NextResponse.json({ error: "Не удалось экспортировать" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireDatabaseAccess();
    const uploaded = await readUploadedCsv(req);
    if ("error" in uploaded) return uploaded.error;
    const { rows, errors } = parseVehicleCsv(uploaded.text);
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
        plateNumber: r.plateNumber,
        make: r.make,
        model: r.model,
        series: r.series,
        certificateNumber: r.certificateNumber,
        fuelConsumption: r.fuelConsumption,
        mileage: r.mileage,
        operatingRules: r.operatingRules,
        comment: r.comment,
        active: r.active,
      };
      try {
        const byId = r.id
          ? await prisma.vehicle.findUnique({ where: { id: r.id }, select: { id: true } })
          : null;
        const byPlate = await prisma.vehicle.findUnique({
          where: { plateNumber: r.plateNumber },
          select: { id: true },
        });
        const existingId = byId?.id || byPlate?.id;
        if (existingId) {
          await prisma.vehicle.update({ where: { id: existingId }, data });
          updated += 1;
          continue;
        }
        await prisma.vehicle.create({ data });
        created += 1;
      } catch (err) {
        rowErrors.push(`Строка ${i + 2}: ${err instanceof Error ? err.message : "ошибка"}`);
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
    console.error("[POST /api/vehicles/csv]", e);
    return NextResponse.json({ error: "Не удалось импортировать" }, { status: 500 });
  }
}
