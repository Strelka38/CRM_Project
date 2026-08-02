import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireManager, requireSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const categoryId = req.nextUrl.searchParams.get("categoryId");
    const pathPrefix = req.nextUrl.searchParams.get("path");
    const q = req.nextUrl.searchParams.get("q")?.trim();

    const kits = await prisma.kit.findMany({
      where: {
        active: true,
        ...(categoryId ? { categoryId } : {}),
        ...(pathPrefix
          ? {
              category: {
                OR: [
                  { path: pathPrefix },
                  { path: { startsWith: `${pathPrefix}/` } },
                ],
              },
            }
          : {}),
        ...(q
          ? { name: { contains: q, mode: "insensitive" as const } }
          : {}),
      },
      orderBy: { sortOrder: "asc" },
      include: {
        category: true,
        components: {
          include: { catalogItem: { include: { category: true } } },
        },
      },
    });
    return NextResponse.json(
      kits.map((k) => ({
        ...k,
        computedPrice: k.components.reduce(
          (s, c) => s + c.qty * c.catalogItem.basePrice,
          0,
        ),
      })),
    );
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  components: z
    .array(
      z.object({
        catalogItemId: z.string(),
        qty: z.number().positive(),
      }),
    )
    .min(1),
});

export async function POST(req: NextRequest) {
  try {
    await requireManager();
    const body = createSchema.parse(await req.json());
    const max = await prisma.kit.aggregate({ _max: { sortOrder: true } });
    const kit = await prisma.kit.create({
      data: {
        name: body.name,
        description: body.description ?? null,
        categoryId: body.categoryId ?? null,
        sortOrder: (max._max.sortOrder ?? 0) + 1,
        components: {
          create: body.components.map((c) => ({
            catalogItemId: c.catalogItemId,
            qty: c.qty,
          })),
        },
      },
      include: {
        components: { include: { catalogItem: true } },
        category: true,
      },
    });
    return NextResponse.json(kit, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    throw e;
  }
}
