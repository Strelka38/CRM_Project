import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseEventDate } from "@/lib/dates";
import {
  notifyManagersOfNewEvent,
  syncInvoiceNotifications,
} from "@/lib/notifications";
import { nextProposalNumber } from "@/lib/proposal-number";
import { requireSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    await syncInvoiceNotifications();

    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");
    const unpaid = req.nextUrl.searchParams.get("unpaid") === "1";
    const calendar = req.nextUrl.searchParams.get("calendar") === "1";

    const quotes = await prisma.quote.findMany({
      where: {
        ...(session.user.role === "MANAGER"
          ? {}
          : {
              OR: [
                { ownerId: session.user.id },
                { assignments: { some: { userId: session.user.id } } },
              ],
            }),
        ...(unpaid
          ? {
              invoiceRequired: true,
              lifecycle: { not: "CANCELLED" },
            }
          : {}),
        ...(from || to
          ? {
              eventDate: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      orderBy: unpaid
        ? [{ paid: "asc" }, { eventDate: "desc" }, { updatedAt: "desc" }]
        : calendar
          ? { eventDate: "asc" }
          : { updatedAt: "desc" },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        _count: { select: { blocks: true } },
      },
    });
    return NextResponse.json(quotes);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("GET /api/quotes", e);
    return NextResponse.json(
      { error: "Не удалось загрузить сметы" },
      { status: 500 },
    );
  }
}

const createSchema = z.object({
  eventName: z.string().optional(),
  managerName: z.string().optional(),
  date: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = createSchema.parse(await req.json().catch(() => ({})));
    const date = body.date || "";
    const proposalNumber = await nextProposalNumber();
    const quote = await prisma.quote.create({
      data: {
        ownerId: session.user.id,
        proposalNumber,
        eventName: body.eventName || "",
        managerName: body.managerName || session.user.name || "",
        date,
        eventDate: parseEventDate(date),
        lifecycle: "CALCULATED",
        discountPercent: 0,
        notes: [
          "Внимание: данное предложение не является офертой. Бронирование оборудования на вашу дату производится только после заключения договора или внесения предоплаты",
          "* Первый день - 100% стоимости оборудования, 2-й и последующий, а также отдельный день для репетиций тарифицируются по 50% от стоимости оборудования",
        ],
        zones: {
          create: { name: "Основное", sortOrder: 0 },
        },
      },
      include: { zones: true },
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
    console.error("POST /api/quotes", e);
    return NextResponse.json(
      { error: "Не удалось создать смету" },
      { status: 500 },
    );
  }
}
