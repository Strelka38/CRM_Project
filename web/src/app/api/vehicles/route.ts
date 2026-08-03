import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/session";

const vehicleSelect = {
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
  createdAt: true,
  updatedAt: true,
} as const;

export async function GET(req: NextRequest) {
  try {
    await requireManager();
    const q = req.nextUrl.searchParams.get("q")?.trim();
    const activeOnly = req.nextUrl.searchParams.get("active") !== "0";

    const vehicles = await prisma.vehicle.findMany({
      where: {
        ...(activeOnly ? { active: true } : {}),
        ...(q
          ? {
              OR: [
                { plateNumber: { contains: q, mode: "insensitive" } },
                { make: { contains: q, mode: "insensitive" } },
                { model: { contains: q, mode: "insensitive" } },
                { series: { contains: q, mode: "insensitive" } },
                { certificateNumber: { contains: q, mode: "insensitive" } },
                { comment: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { plateNumber: "asc" },
      select: vehicleSelect,
      take: q ? 50 : 500,
    });
    return NextResponse.json(vehicles);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("GET /api/vehicles", e);
    return NextResponse.json(
      { error: "Не удалось загрузить транспорт" },
      { status: 500 },
    );
  }
}

const createSchema = z.object({
  plateNumber: z.string().min(1),
  make: z.string().optional(),
  model: z.string().optional(),
  series: z.string().optional(),
  certificateNumber: z.string().optional(),
  fuelConsumption: z.number().optional(),
  mileage: z.number().optional(),
  operatingRules: z.string().optional(),
  comment: z.string().optional(),
  active: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireManager();
    const body = createSchema.parse(await req.json());
    const plateNumber = body.plateNumber.trim().toUpperCase();
    if (!plateNumber) {
      return NextResponse.json(
        { error: "Укажите госномер" },
        { status: 400 },
      );
    }

    const vehicle = await prisma.vehicle.create({
      data: {
        plateNumber,
        make: body.make?.trim() || "",
        model: body.model?.trim() || "",
        series: body.series?.trim() || "",
        certificateNumber: body.certificateNumber?.trim() || "",
        fuelConsumption: Math.max(0, Number(body.fuelConsumption) || 0),
        mileage: Math.max(0, Number(body.mileage) || 0),
        operatingRules: body.operatingRules?.trim() || "",
        comment: body.comment?.trim() || "",
        active: body.active ?? true,
      },
      select: vehicleSelect,
    });
    return NextResponse.json(vehicle, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error("POST /api/vehicles", e);
    return NextResponse.json(
      { error: "Не удалось создать запись (возможно, такой номер уже есть)" },
      { status: 400 },
    );
  }
}
