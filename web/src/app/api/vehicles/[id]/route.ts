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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireManager();
    const { id } = await params;
    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      select: vehicleSelect,
    });
    if (!vehicle) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(vehicle);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

const patchSchema = z.object({
  plateNumber: z.string().min(1).optional(),
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireManager();
    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    const existing = await prisma.vehicle.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (body.plateNumber !== undefined) {
      data.plateNumber = body.plateNumber.trim().toUpperCase();
    }
    if (body.make !== undefined) data.make = body.make.trim();
    if (body.model !== undefined) data.model = body.model.trim();
    if (body.series !== undefined) data.series = body.series.trim();
    if (body.certificateNumber !== undefined) {
      data.certificateNumber = body.certificateNumber.trim();
    }
    if (body.fuelConsumption !== undefined) {
      data.fuelConsumption = Math.max(0, Number(body.fuelConsumption) || 0);
    }
    if (body.mileage !== undefined) {
      data.mileage = Math.max(0, Number(body.mileage) || 0);
    }
    if (body.operatingRules !== undefined) {
      data.operatingRules = body.operatingRules.trim();
    }
    if (body.comment !== undefined) data.comment = body.comment.trim();
    if (body.active !== undefined) data.active = body.active;

    const vehicle = await prisma.vehicle.update({
      where: { id },
      data,
      select: vehicleSelect,
    });
    return NextResponse.json(vehicle);
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error("PATCH /api/vehicles/[id]", e);
    return NextResponse.json(
      { error: "Не удалось сохранить (возможно, такой номер уже есть)" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireManager();
    const { id } = await params;
    const existing = await prisma.vehicle.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await prisma.vehicle.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
