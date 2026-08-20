import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { directoryBulkSchema } from "@/lib/csv";
import { requireDatabaseAccess } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    await requireDatabaseAccess();
    const body = directoryBulkSchema.parse(await req.json());
    const ids = [...new Set(body.ids)];

    if (body.action === "delete") {
      const result = await prisma.vehicle.updateMany({
        where: { id: { in: ids } },
        data: { active: false },
      });
      return NextResponse.json({ ok: true, count: result.count });
    }

    const sources = await prisma.vehicle.findMany({ where: { id: { in: ids } } });
    const taken = new Set(
      (await prisma.vehicle.findMany({ select: { plateNumber: true } })).map(
        (v) => v.plateNumber,
      ),
    );
    let count = 0;
    for (const src of sources) {
      let n = 0;
      let plateNumber = `${src.plateNumber}-K`;
      while (taken.has(plateNumber) && n < 200) {
        n += 1;
        plateNumber = `${src.plateNumber}-K${n + 1}`;
      }
      taken.add(plateNumber);
      await prisma.vehicle.create({
        data: {
          plateNumber,
          make: src.make,
          model: src.model,
          series: src.series,
          certificateNumber: src.certificateNumber,
          fuelConsumption: src.fuelConsumption,
          mileage: src.mileage,
          operatingRules: src.operatingRules,
          comment: src.comment,
          active: true,
        },
      });
      count += 1;
    }
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error("[POST /api/vehicles/bulk]", e);
    return NextResponse.json({ error: "Не удалось выполнить действие" }, { status: 500 });
  }
}
