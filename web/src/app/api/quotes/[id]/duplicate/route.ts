import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  createQuoteFromStructure,
  extractStructure,
} from "@/lib/quote-clone";
import { getAccessibleQuote } from "@/lib/quote-access";
import { notifyManagersOfNewEvent } from "@/lib/notifications";
import { requireManager } from "@/lib/session";

const schema = z.object({
  date: z.string(),
  durationDays: z.number().int().positive().default(1),
  ownerId: z.string().min(1).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireManager();
    const { id } = await params;
    const body = schema.parse(await req.json());

    const source = await getAccessibleQuote(
      id,
      session.user.id,
      session.user.role,
    );
    if (!source) {
      return NextResponse.json({ error: "Смета не найдена" }, { status: 404 });
    }

    const ownerId = body.ownerId || source.ownerId;
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

    const structure = extractStructure(source);
    const quote = await createQuoteFromStructure({
      ownerId: owner.id,
      managerName: owner.name,
      date: body.date,
      durationDays: body.durationDays,
      eventName: source.eventName,
      time: source.time,
      place: source.place,
      venueId: source.venueId,
      client: source.client,
      clientId: source.clientId,
      cashless: source.cashless,
      discountPercent: source.discountPercent,
      notes: source.notes,
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
    console.error("POST /api/quotes/[id]/duplicate", e);
    return NextResponse.json(
      { error: "Не удалось скопировать смету" },
      { status: 500 },
    );
  }
}
