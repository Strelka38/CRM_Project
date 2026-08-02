import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/session";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  kind: z.enum(["EQUIPMENT", "PERSONNEL", "OTHER"]).optional(),
  subtotalLabel: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
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

    if (body.name === undefined) {
      const category = await prisma.catalogCategory.update({
        where: { id },
        data: body,
      });
      return NextResponse.json(category);
    }

    const current = await prisma.catalogCategory.findUnique({
      where: { id },
      include: { parent: true },
    });
    if (!current) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const newPath = current.parent
      ? `${current.parent.path}/${body.name}`
      : body.name;
    const oldPath = current.path;

    if (newPath === oldPath && body.name === current.name) {
      const { name: _name, ...rest } = body;
      const category = await prisma.catalogCategory.update({
        where: { id },
        data: rest,
      });
      return NextResponse.json(category);
    }

    const conflict = await prisma.catalogCategory.findFirst({
      where: { path: newPath, NOT: { id } },
    });
    if (conflict) {
      return NextResponse.json(
        { error: "Category with this path already exists" },
        { status: 409 },
      );
    }

    const descendants = await prisma.catalogCategory.findMany({
      where: { path: { startsWith: `${oldPath}/` } },
      select: { id: true, path: true },
    });

    const { name, ...rest } = body;
    const category = await prisma.$transaction(async (tx) => {
      const updated = await tx.catalogCategory.update({
        where: { id },
        data: { name, path: newPath, ...rest },
      });
      for (const desc of descendants) {
        await tx.catalogCategory.update({
          where: { id: desc.id },
          data: {
            path: newPath + desc.path.slice(oldPath.length),
          },
        });
      }
      return updated;
    });

    return NextResponse.json(category);
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
    const current = await prisma.catalogCategory.findUnique({
      where: { id },
      select: { path: true },
    });
    if (!current) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.catalogCategory.updateMany({
        where: {
          OR: [{ id }, { path: { startsWith: `${current.path}/` } }],
        },
        data: { active: false },
      }),
      prisma.catalogItem.updateMany({
        where: {
          category: {
            OR: [{ id }, { path: { startsWith: `${current.path}/` } }],
          },
        },
        data: { active: false },
      }),
    ]);

    const category = await prisma.catalogCategory.findUnique({ where: { id } });
    return NextResponse.json(category);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
