import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { nextLegalSort, syncClientLegalMirror } from "@/lib/client-legal";
import { prisma } from "@/lib/db";
import { ensureQuoteSchemaColumns } from "@/lib/ensure-schema";
import { requireDatabaseAccess } from "@/lib/session";

const createSchema = z.object({
  name: z.string().min(1),
  inn: z.string().optional(),
  legalAddress: z.string().optional(),
  legalDetails: z.string().optional(),
});

const entitySelect = {
  id: true,
  name: true,
  inn: true,
  legalAddress: true,
  legalDetails: true,
  sortOrder: true,
} as const;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireDatabaseAccess();
    await ensureQuoteSchemaColumns();
    const { id } = await params;
    const client = await prisma.client.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!client) {
      return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });
    }
    const body = createSchema.parse(await req.json());
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ error: "Укажите название юрлица" }, { status: 400 });
    }
    const entity = await prisma.clientLegalEntity.create({
      data: {
        clientId: id,
        name,
        inn: body.inn?.trim() || "",
        legalAddress: body.legalAddress?.trim() || "",
        legalDetails: body.legalDetails?.trim() || "",
        sortOrder: await nextLegalSort(id),
      },
      select: entitySelect,
    });
    await syncClientLegalMirror(id);
    return NextResponse.json(entity, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Укажите название юрлица" }, { status: 400 });
    }
    throw e;
  }
}
