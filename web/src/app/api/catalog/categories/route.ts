import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { repairHiddenCatalogTree } from "@/lib/catalog-path";
import { requireDatabaseAccess, requireSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const tree = req.nextUrl.searchParams.get("tree") === "1";
    const includeInactive = req.nextUrl.searchParams.get("all") === "1";
    const forQuote = req.nextUrl.searchParams.get("forQuote") === "1";
    const parentId = req.nextUrl.searchParams.get("parentId");

    if (tree) {
      if (!includeInactive) {
        try {
          await repairHiddenCatalogTree();
        } catch (err) {
          console.error("[GET /api/catalog/categories] tree repair", err);
        }
      }
      let categories = await prisma.catalogCategory.findMany({
        where: includeInactive ? {} : { active: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: {
          _count: { select: { items: true, children: true, kits: true } },
        },
      });

      if (forQuote) {
        const [visibleItems, visibleKits] = await Promise.all([
          prisma.catalogItem.findMany({
            where: {
              active: true,
              showInCatalog: true,
              itemKind: { not: "COMPONENT" },
            },
            select: { category: { select: { path: true } } },
          }),
          prisma.kit.findMany({
            where: {
              active: true,
              showInCatalog: true,
              categoryId: { not: null },
            },
            select: { category: { select: { path: true } } },
          }),
        ]);
        const visiblePaths = new Set(
          [
            ...visibleItems.map((v) => v.category.path),
            ...visibleKits.map((v) => v.category?.path),
          ].filter((path): path is string => Boolean(path)),
        );
        const keep = new Set<string>();
        for (const path of visiblePaths) {
          const parts = path.split("/");
          for (let i = 1; i <= parts.length; i++) {
            keep.add(parts.slice(0, i).join("/"));
          }
        }
        categories = categories.filter((c) => keep.has(c.path));
      }

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
    await requireDatabaseAccess();
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
    if (
      typeof e === "object" &&
      e &&
      "code" in e &&
      (e as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Раздел с таким именем уже есть" },
        { status: 409 },
      );
    }
    throw e;
  }
}
