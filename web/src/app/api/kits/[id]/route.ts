import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireDatabaseAccess, requireSession } from "@/lib/session";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await params;
    const kit = await prisma.kit.findUnique({
      where: { id },
      include: {
        category: true,
        components: {
          include: { catalogItem: { include: { category: true } } },
        },
      },
    });
    if (!kit) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(kit);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  active: z.boolean().optional(),
  components: z
    .array(
      z.object({
        catalogItemId: z.string(),
        qty: z.number().positive(),
      }),
    )
    .optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireDatabaseAccess();
    const { id } = await params;
    const body = patchSchema.parse(await req.json());
    const { components, ...meta } = body;

    await prisma.$transaction(async (tx) => {
      await tx.kit.update({ where: { id }, data: meta });
      if (components) {
        await tx.kitComponent.deleteMany({ where: { kitId: id } });
        await tx.kitComponent.createMany({
          data: components.map((c) => ({
            kitId: id,
            catalogItemId: c.catalogItemId,
            qty: c.qty,
          })),
        });
      }
    });

    const kit = await prisma.kit.findUnique({
      where: { id },
      include: {
        components: { include: { catalogItem: true } },
        category: true,
      },
    });
    return NextResponse.json(kit);
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
    await requireDatabaseAccess();
    const { id } = await params;
    await prisma.kit.update({ where: { id }, data: { active: false } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
