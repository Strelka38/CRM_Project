import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  createQuoteFromStructure,
  parseTemplatePayload,
} from "@/lib/quote-clone";
import { notifyManagersOfNewEvent } from "@/lib/notifications";
import { requireManager } from "@/lib/session";

const schema = z.object({
  date: z.string(),
  durationDays: z.number().int().positive().default(1),
  ownerId: z.string().min(1).optional(),
  eventName: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireManager();
    const { id } = await params;
    const body = schema.parse(await req.json());

    const template = await prisma.quoteTemplate.findUnique({
      where: { id },
    });
    if (!template) {
      return NextResponse.json({ error: "Шаблон не найден" }, { status: 404 });
    }

    const ownerId = body.ownerId || template.ownerId || session.user.id;
    const owner = await prisma.user.findFirst({
      where: { id: ownerId, role: "MANAGER", active: true },
      select: { id: true, name: true },
    });
    if (!owner) {
      return NextResponse.json(
        { error: "Менеджер не найден" },
        { status: 400 },
      );
    }

    const structure = parseTemplatePayload(template.payload);
    const quote = await createQuoteFromStructure({
      ownerId: owner.id,
      managerName: owner.name,
      date: body.date,
      durationDays: body.durationDays,
      eventName: body.eventName || "",
      cashless: template.cashless,
      discountPercent: template.discountPercent,
      notes: template.notes,
      structure,
    });

    await notifyManagersOfNewEvent({
      id: quote.id,
      eventName: quote.eventName,
      proposalNumber: quote.proposalNumber,
      ownerId: quote.ownerId,
      date: quote.date,
      managerName: quote.managerName,
    });

    return NextResponse.json(quote, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error("POST /api/quote-templates/[id]/create", e);
    return NextResponse.json(
      { error: "Не удалось создать смету из шаблона" },
      { status: 500 },
    );
  }
}
