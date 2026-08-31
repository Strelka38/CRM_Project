import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ensureQuoteSchemaColumns } from "@/lib/ensure-schema";
import {
  canAccessDatabase,
  requireDatabaseAccess,
  requireSession,
} from "@/lib/session";
import {
  isUniqueCatalogLinkError,
  parseCatalogItemIds,
  replaceSpecialtyCatalogItems,
  resolveCatalogServiceIds,
  serializeSpecialty,
  specialtyCatalogInclude,
} from "@/lib/specialty-link";

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
    const session = await requireSession();
    await ensureSchemaOnce();
    const includeInactive = req.nextUrl.searchParams.get("active") === "0";
    const withServices = req.nextUrl.searchParams.get("services") === "1";
    if (
      (includeInactive || withServices) &&
      !canAccessDatabase(session.user.role)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const specialties = await prisma.specialty.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: specialtyCatalogInclude,
    });
    const serialized = specialties.map(serializeSpecialty);
    if (!withServices) return NextResponse.json(serialized);

    const services = await prisma.catalogItem.findMany({
      where: {
        active: true,
        itemKind: { in: ["SERVICE", "PERSONNEL"] },
      },
      select: { id: true, name: true, itemKind: true },
      orderBy: [{ name: "asc" }],
    });
    return NextResponse.json({ specialties: serialized, services });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

const createSchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().optional(),
  hourlyRate: z.number().nonnegative().optional(),
  shiftRate: z.number().nonnegative().optional(),
  description: z.string().optional(),
  catalogItemIds: z.array(z.string()).optional(),
  catalogItemId: z.union([z.string(), z.null()]).optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireDatabaseAccess();
    await ensureSchemaOnce();
    const body = createSchema.parse(await req.json());
    const parsedIds = parseCatalogItemIds(body) ?? [];
    const resolved = await resolveCatalogServiceIds(parsedIds, null);
    if ("error" in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }
    const specialty = await prisma.specialty.create({
      data: {
        name: body.name.trim(),
        sortOrder: body.sortOrder ?? 0,
        hourlyRate: body.hourlyRate ?? 0,
        shiftRate: body.shiftRate ?? 0,
        description: body.description?.trim() ?? "",
      },
    });
    await replaceSpecialtyCatalogItems(specialty.id, resolved.ids);
    const full = await prisma.specialty.findUniqueOrThrow({
      where: { id: specialty.id },
      include: specialtyCatalogInclude,
    });
    return NextResponse.json(serializeSpecialty(full), { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    if (isUniqueCatalogLinkError(e)) {
      return NextResponse.json(
        { error: "Эта услуга уже связана с другой специальностью" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Не удалось создать специальность" },
      { status: 400 },
    );
  }
}
