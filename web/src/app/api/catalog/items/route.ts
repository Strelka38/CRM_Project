import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseEventDate } from "@/lib/dates";
import { ensureQuoteSchemaColumns } from "@/lib/ensure-schema";
import { requireDatabaseAccess, requireSession } from "@/lib/session";
import { catalogOwnerZod } from "@/lib/zod-enums";
import { getAvailability } from "@/lib/stock";

let ensureOnce: Promise<void> | null = null;

function ensureSchemaOnce() {
  if (!ensureOnce) {
    ensureOnce = ensureQuoteSchemaColumns().catch((e) => {
      ensureOnce = null;
      throw e;
    });
  }
  return ensureOnce;
}

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    await ensureSchemaOnce();
    const q = req.nextUrl.searchParams.get("q")?.trim();
    const kind = req.nextUrl.searchParams.get("kind");
    const categoryId = req.nextUrl.searchParams.get("categoryId");
    const pathPrefix = req.nextUrl.searchParams.get("path");
    const eventDate = parseEventDate(
      req.nextUrl.searchParams.get("eventDate") || undefined,
    );
    const durationDays = Number(req.nextUrl.searchParams.get("days") || 1);

    const includeHidden = req.nextUrl.searchParams.get("includeHidden") === "1";

    const items = await prisma.catalogItem.findMany({
      where: {
        active: true,
        ...(includeHidden ? {} : { showInCatalog: true }),
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
          : includeHidden
            ? {}
            : { itemKind: { not: "COMPONENT" as const } }),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { model: { contains: q, mode: "insensitive" as const } },
                { manufacturer: { contains: q, mode: "insensitive" as const } },
                { comment: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: [{ category: { path: "asc" } }, { sortOrder: "asc" }],
      include: { category: true },
      take: 300,
    });

    const withStock = await Promise.all(
      items.map(async (item) => {
        const av = await getAvailability(item.id, {
          date: req.nextUrl.searchParams.get("eventDate") || "",
          eventDate,
          durationDays,
        });
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
  costPrice: z.number().nullable().optional(),
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
    .array(catalogOwnerZod)
    .max(3)
    .optional(),
  showInCatalog: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireDatabaseAccess();
    const body = createSchema.parse(await req.json());
    const max = await prisma.catalogItem.aggregate({
      where: { categoryId: body.categoryId },
      _max: { sortOrder: true },
    });
    const showInCatalog =
      body.showInCatalog ?? body.itemKind !== "COMPONENT";
    const item = await prisma.catalogItem.create({
      data: {
        ...body,
        showInCatalog,
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
