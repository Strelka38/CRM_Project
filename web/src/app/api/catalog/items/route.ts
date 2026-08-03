import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseEventDate } from "@/lib/dates";
import { requireDatabaseAccess, requireSession } from "@/lib/session";
import { getAvailability } from "@/lib/stock";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const q = req.nextUrl.searchParams.get("q")?.trim();
    const kind = req.nextUrl.searchParams.get("kind");
    const categoryId = req.nextUrl.searchParams.get("categoryId");
    const pathPrefix = req.nextUrl.searchParams.get("path");
    const eventDate = parseEventDate(
      req.nextUrl.searchParams.get("eventDate") || undefined,
    );
    const durationDays = Number(req.nextUrl.searchParams.get("days") || 1);

    const items = await prisma.catalogItem.findMany({
      where: {
        active: true,
        ...(categoryId ? { categoryId } : {}),
        ...(pathPrefix
          ? { category: { path: { startsWith: pathPrefix } } }
          : {}),
        ...(kind === "EQUIPMENT" ||
        kind === "PERSONNEL" ||
        kind === "SERVICE" ||
        kind === "CONSUMABLE" ||
        kind === "COMPONENT" ||
        kind === "OTHER"
          ? { itemKind: kind }
          : {}),
        ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
      },
      orderBy: [{ category: { path: "asc" } }, { sortOrder: "asc" }],
      include: { category: true },
      take: 300,
    });

    const withStock = await Promise.all(
      items.map(async (item) => {
        const av = await getAvailability(item.id, eventDate, durationDays);
        return {
          ...item,
          reserved: av?.reserved ?? 0,
          available: av?.available ?? item.stockQty,
        };
      }),
    );

    return NextResponse.json(withStock);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

const createSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(1),
  basePrice: z.number().nonnegative().default(0),
  stockQty: z.number().int().nonnegative().default(0),
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
  dayMode: z
    .enum(["HALF_EXTRA", "FULL_DAYS", "FIXED1", "FIXED2"])
    .default("HALF_EXTRA"),
  itemKind: z
    .enum([
      "EQUIPMENT",
      "PERSONNEL",
      "SERVICE",
      "CONSUMABLE",
      "COMPONENT",
      "OTHER",
    ])
    .default("EQUIPMENT"),
  owners: z
    .array(z.enum(["SHOW_MASTER", "DIAKOM", "NE_EVENT"]))
    .max(3)
    .optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireDatabaseAccess();
    const body = createSchema.parse(await req.json());
    const max = await prisma.catalogItem.aggregate({
      where: { categoryId: body.categoryId },
      _max: { sortOrder: true },
    });
    const item = await prisma.catalogItem.create({
      data: {
        ...body,
        sortOrder: (max._max.sortOrder ?? 0) + 1,
      },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    throw e;
  }
}
