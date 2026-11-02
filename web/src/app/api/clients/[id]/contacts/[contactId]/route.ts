import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { contactSelect, syncClientContactMirror } from "@/lib/client-contacts";
import { prisma } from "@/lib/db";
import { ensureQuoteSchemaColumns } from "@/lib/ensure-schema";
import { requireDatabaseAccess } from "@/lib/session";

const patchSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> },
) {
  try {
    await requireDatabaseAccess();
    await ensureQuoteSchemaColumns();
    const { id, contactId } = await params;
    const existing = await prisma.clientContact.findFirst({
      where: { id: contactId, clientId: id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Контактное лицо не найдено" }, { status: 404 });
    }
    const body = patchSchema.parse(await req.json());
    const name = body.name !== undefined ? body.name.trim() : existing.name;
    const phone = body.phone !== undefined ? body.phone.trim() : existing.phone;
    const email = body.email !== undefined ? body.email.trim() : existing.email;
    if (!name && !phone) {
      return NextResponse.json(
        { error: "Укажите имя или телефон" },
        { status: 400 },
      );
    }
    const contact = await prisma.clientContact.update({
      where: { id: contactId },
      data: { name, phone, email },
      select: contactSelect,
    });
    await syncClientContactMirror(id);
    return NextResponse.json(contact);
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Проверьте поля контакта" }, { status: 400 });
    }
    throw e;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> },
) {
  try {
    await requireDatabaseAccess();
    await ensureQuoteSchemaColumns();
    const { id, contactId } = await params;
    const existing = await prisma.clientContact.findFirst({
      where: { id: contactId, clientId: id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Контактное лицо не найдено" }, { status: 404 });
    }
    await prisma.clientContact.delete({ where: { id: contactId } });
    await syncClientContactMirror(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
