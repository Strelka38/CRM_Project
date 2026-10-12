import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { syncClientLegalMirror } from "@/lib/client-legal";
import { prisma } from "@/lib/db";
import { ensureQuoteSchemaColumns } from "@/lib/ensure-schema";
import { requireDatabaseAccess } from "@/lib/session";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  inn: z.string().optional(),
  legalAddress: z.string().optional(),
  legalDetails: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; entityId: string }> },
) {
  try {
    await requireDatabaseAccess();
    await ensureQuoteSchemaColumns();
    const { id, entityId } = await params;
    const existing = await prisma.clientLegalEntity.findFirst({
      where: { id: entityId, clientId: id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Юрлицо не найдено" }, { status: 404 });
    }
    const body = patchSchema.parse(await req.json());
    const data: Record<string, string> = {};
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) {
        return NextResponse.json({ error: "Укажите название юрлица" }, { status: 400 });
      }
      data.name = name;
    }
    if (body.inn !== undefined) data.inn = body.inn.trim();
    if (body.legalAddress !== undefined) data.legalAddress = body.legalAddress.trim();
    if (body.legalDetails !== undefined) data.legalDetails = body.legalDetails.trim();
    const entity = await prisma.clientLegalEntity.update({
      where: { id: entityId },
      data,
    });
    await syncClientLegalMirror(id);
    return NextResponse.json(entity);
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Проверьте поля юрлица" }, { status: 400 });
    }
    throw e;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; entityId: string }> },
) {
  try {
    await requireDatabaseAccess();
    await ensureQuoteSchemaColumns();
    const { id, entityId } = await params;
    const existing = await prisma.clientLegalEntity.findFirst({
      where: { id: entityId, clientId: id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Юрлицо не найдено" }, { status: 404 });
    }
    await prisma.clientLegalEntity.delete({ where: { id: entityId } });
    await syncClientLegalMirror(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
