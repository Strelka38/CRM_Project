import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireManager, requireSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const tree = req.nextUrl.searchParams.get("tree") === "1";
    const includeInactive = req.nextUrl.searchParams.get("all") === "1";
    const parentId = req.nextUrl.searchParams.get("parentId");

    if (tree) {
      const categories = await prisma.catalogCategory.findMany({
        where: includeInactive ? {} : { active: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: {
          _count: { select: { items: true, children: true } },
        },
      });
      return NextResponse.json(categories);
    }

    const categories = await prisma.catalogCategory.findMany({
      where: {
        ...(includeInactive ? {} : { active: true }),
        ...(parentId === "root"
          ? { parentId: null }
          : parentId
            ? { parentId }
            : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        items: {
          where: includeInactive ? {} : { active: true },
          orderBy: { sortOrder: "asc" },
        },
        _count: { select: { children: true, items: true } },
      },
    });
    return NextResponse.json(categories);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

const createSchema = z.object({
  name: z.string().min(1),
  parentId: z.string().nullable().optional(),
  kind: z.enum(["EQUIPMENT", "PERSONNEL", "OTHER"]).default("EQUIPMENT"),
  subtotalLabel: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireManager();
    const body = createSchema.parse(await req.json());
    let path = body.name;
    if (body.parentId) {
      const parent = await prisma.catalogCategory.findUnique({
        where: { id: body.parentId },
      });
      if (!parent) {
        return NextResponse.json({ error: "Parent not found" }, { status: 404 });
      }
      path = `${parent.path}/${body.name}`;
    }
    const max = await prisma.catalogCategory.aggregate({ _max: { sortOrder: true } });
    const category = await prisma.catalogCategory.create({
      data: {
        name: body.name,
        path,
        parentId: body.parentId ?? null,
        kind: body.kind,
        subtotalLabel: body.subtotalLabel || `Итого ${body.name}:`,
        sortOrder: (max._max.sortOrder ?? 0) + 1,
      },
    });
    return NextResponse.json(category, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    throw e;
  }
}
