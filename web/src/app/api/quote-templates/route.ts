import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { extractStructure } from "@/lib/quote-clone";
import { getAccessibleQuote } from "@/lib/quote-access";
import { requireManager } from "@/lib/session";

export async function GET() {
  try {
    await requireManager();
    const templates = await prisma.quoteTemplate.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        owner: { select: { id: true, name: true, email: true } },
      },
    });
    return NextResponse.json(templates);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("GET /api/quote-templates", e);
    return NextResponse.json(
      { error: "Не удалось загрузить шаблоны" },
      { status: 500 },
    );
  }
}

const createSchema = z.object({
  quoteId: z.string().min(1),
  name: z.string().min(1),
  ownerId: z.string().min(1).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireManager();
    const body = createSchema.parse(await req.json());
    const quote = await getAccessibleQuote(
      body.quoteId,
      session.user.id,
      session.user.role,
    );
    if (!quote) {
      return NextResponse.json({ error: "Смета не найдена" }, { status: 404 });
    }

    const ownerId = body.ownerId || session.user.id;
    const owner = await prisma.user.findFirst({
      where: { id: ownerId, role: "MANAGER", active: true },
      select: { id: true },
    });
    if (!owner) {
      return NextResponse.json(
        { error: "Менеджер не найден" },
        { status: 400 },
      );
    }

    const payload = extractStructure(quote);
    const template = await prisma.quoteTemplate.create({
      data: {
        name: body.name.trim(),
        ownerId: owner.id,
        discountPercent: quote.discountPercent,
        cashless: quote.cashless,
        notes: quote.notes,
        payload,
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
      },
    });
    return NextResponse.json(template, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error("POST /api/quote-templates", e);
    return NextResponse.json(
      { error: "Не удалось сохранить шаблон" },
      { status: 500 },
    );
  }
}
