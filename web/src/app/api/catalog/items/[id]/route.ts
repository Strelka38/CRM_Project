import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseEventDate } from "@/lib/dates";
import { requireManager, requireSession } from "@/lib/session";
import { getAvailability } from "@/lib/stock";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await params;
    const item = await prisma.catalogItem.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const eventDate = parseEventDate(
      req.nextUrl.searchParams.get("eventDate") || undefined,
    );
    const days = Number(req.nextUrl.searchParams.get("days") || 1);
    const av = await getAvailability(item.id, eventDate, days);
    return NextResponse.json({ ...item, ...av });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

const patchSchema = z.object({
  categoryId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  basePrice: z.number().nonnegative().optional(),
  stockQty: z.number().int().nonnegative().optional(),
  cashlessOverride: z.number().nullable().optional(),
  model: z.string().nullable().optional(),
  manufacturer: z.string().nullable().optional(),
  comment: z.string().nullable().optional(),
  estimatedValue: z.number().nullable().optional(),
  width: z.number().nullable().optional(),
  height: z.number().nullable().optional(),
  depth: z.number().nullable().optional(),
  power: z.number().nullable().optional(),
  weight: z.number().nullable().optional(),
  dayMode: z.enum(["HALF_EXTRA", "FULL_DAYS", "FIXED1", "FIXED2"]).optional(),
  itemKind: z
    .enum([
      "EQUIPMENT",
      "PERSONNEL",
      "SERVICE",
      "CONSUMABLE",
      "COMPONENT",
      "OTHER",
    ])
    .optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
  owners: z
    .array(z.enum(["SHOW_MASTER", "DIAKOM", "NE_EVENT"]))
    .max(3)
    .optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireManager();
    const { id } = await params;
    const body = patchSchema.parse(await req.json());
    const item = await prisma.catalogItem.update({
      where: { id },
      data: body,
      include: { category: true },
    });
    return NextResponse.json(item);
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    throw e;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireManager();
    const { id } = await params;
    const item = await prisma.catalogItem.update({
      where: { id },
      data: { active: false },
    });
    return NextResponse.json(item);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
