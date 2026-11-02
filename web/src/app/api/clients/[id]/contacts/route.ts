import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  contactSelect,
  nextContactSort,
  syncClientContactMirror,
} from "@/lib/client-contacts";
import { prisma } from "@/lib/db";
import { ensureQuoteSchemaColumns } from "@/lib/ensure-schema";
import { requireDatabaseAccess } from "@/lib/session";

const createSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
});

export async function GET(
  _req: NextRequest,
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
    const contacts = await prisma.clientContact.findMany({
      where: { clientId: id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: contactSelect,
    });
    return NextResponse.json(contacts);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

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
    const name = body.name?.trim() || "";
    const phone = body.phone?.trim() || "";
    const email = body.email?.trim() || "";
    if (!name && !phone) {
      return NextResponse.json(
        { error: "Укажите имя или телефон" },
        { status: 400 },
      );
    }
    const contact = await prisma.clientContact.create({
      data: {
        clientId: id,
        name,
        phone,
        email,
        sortOrder: await nextContactSort(id),
      },
      select: contactSelect,
    });
    await syncClientContactMirror(id);
    return NextResponse.json(contact, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Проверьте поля контакта" }, { status: 400 });
    }
    throw e;
  }
}
