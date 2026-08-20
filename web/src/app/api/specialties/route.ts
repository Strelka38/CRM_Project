import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ensureQuoteSchemaColumns } from "@/lib/ensure-schema";
import {
  canAccessDatabase,
  requireDatabaseAccess,
  requireSession,
} from "@/lib/session";

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
    if (includeInactive && !canAccessDatabase(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const specialties = await prisma.specialty.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return NextResponse.json(specialties);
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
});

export async function POST(req: NextRequest) {
  try {
    await requireDatabaseAccess();
    await ensureSchemaOnce();
    const body = createSchema.parse(await req.json());
    const specialty = await prisma.specialty.create({
      data: {
        name: body.name.trim(),
        sortOrder: body.sortOrder ?? 0,
        hourlyRate: body.hourlyRate ?? 0,
        shiftRate: body.shiftRate ?? 0,
        description: body.description?.trim() ?? "",
      },
    });
    return NextResponse.json(specialty, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Не удалось создать специальность" },
      { status: 400 },
    );
  }
}
