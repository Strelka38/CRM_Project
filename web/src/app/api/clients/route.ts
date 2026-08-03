import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireDatabaseAccess } from "@/lib/session";

const clientSelect = {
  id: true,
  companyName: true,
  contactName: true,
  phone: true,
  email: true,
  comment: true,
  inn: true,
  legalAddress: true,
  legalDetails: true,
  active: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { quotes: true } },
} as const;

export async function GET(req: NextRequest) {
  try {
    await requireDatabaseAccess();
    const q = req.nextUrl.searchParams.get("q")?.trim();
    const activeOnly = req.nextUrl.searchParams.get("active") !== "0";

    const clients = await prisma.client.findMany({
      where: {
        ...(activeOnly ? { active: true } : {}),
        ...(q
          ? {
              OR: [
                { companyName: { contains: q, mode: "insensitive" } },
                { contactName: { contains: q, mode: "insensitive" } },
                { phone: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { inn: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { companyName: "asc" },
      select: clientSelect,
      take: q ? 20 : 500,
    });
    return NextResponse.json(clients);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("GET /api/clients", e);
    return NextResponse.json(
      { error: "Не удалось загрузить клиентов" },
      { status: 500 },
    );
  }
}

const createSchema = z.object({
  companyName: z.string().min(1),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  comment: z.string().optional(),
  inn: z.string().optional(),
  legalAddress: z.string().optional(),
  legalDetails: z.string().optional(),
  active: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireDatabaseAccess();
    const body = createSchema.parse(await req.json());
    const client = await prisma.client.create({
      data: {
        companyName: body.companyName.trim(),
        contactName: body.contactName?.trim() || "",
        phone: body.phone?.trim() || "",
        email: body.email?.trim() || "",
        comment: body.comment?.trim() || "",
        inn: body.inn?.trim() || "",
        legalAddress: body.legalAddress?.trim() || "",
        legalDetails: body.legalDetails?.trim() || "",
        active: body.active ?? true,
      },
      select: clientSelect,
    });
    return NextResponse.json(client, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error("POST /api/clients", e);
    return NextResponse.json(
      { error: "Не удалось создать клиента" },
      { status: 500 },
    );
  }
}
