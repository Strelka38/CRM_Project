import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseEventDate } from "@/lib/dates";
import { DEFAULT_QUOTE_NOTES } from "@/lib/commercial-terms";
import { DEFAULT_CASHLESS_PERCENT } from "@/lib/pricing";
import { defaultQuoteZones } from "@/lib/quote-defaults";
import {
  defaultDemountDate,
  defaultMountDate,
} from "@/lib/quote-schedule";
import {
  notifyManagersOfNewEvent,
  syncInvoiceNotifications,
} from "@/lib/notifications";
import { nextProposalNumber } from "@/lib/proposal-number";
import {
  formatVacantRoles,
  vacantStaffLabels,
} from "@/lib/staff-slots";
import {
  canSeeAllEvents,
  requireManager,
  requireSection,
  requireSession,
} from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    await syncInvoiceNotifications();

    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");
    const unpaid = req.nextUrl.searchParams.get("unpaid") === "1";
    const calendar = req.nextUrl.searchParams.get("calendar") === "1";

    // Неоплаченные — только менеджеры
    if (unpaid) {
      await requireSection("section.unpaid");
    }

    // Календарь / менеджер / бригадир: все мероприятия.
    // Список «Мероприятия» у сотрудника: только свои назначения.
    const employeeScope =
      !canSeeAllEvents(session.user.role, session.permissions) && !calendar
        ? { assignments: { some: { userId: session.user.id } } }
        : {};

    const quotes = await prisma.quote.findMany({
      where: {
        ...employeeScope,
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
        ...(calendar
          ? {
              assignments: {
                select: {
                  userId: true,
                  isFreelancer: true,
                  kind: true,
                  specialty: { select: { name: true } },
                },
              },
            }
          : {}),
      },
    });
    if (calendar) {
      return NextResponse.json(
        quotes.map((q) => {
          const assignments =
            "assignments" in q && Array.isArray(q.assignments)
              ? q.assignments
              : [];
          const vacant = vacantStaffLabels(assignments);
          const { assignments: _drop, ...rest } = q as typeof q & {
            assignments?: unknown;
          };
          return {
            ...rest,
            staffVacantCount: vacant.length,
            staffVacant: formatVacantRoles(vacant),
          };
        }),
      );
    }
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
    const session = await requireManager();
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
        mountDate: date ? defaultMountDate(date) : "",
        demountDate: date ? defaultDemountDate(date, 1) : "",
        lifecycle: "CALCULATED",
        discountPercent: 0,
        cashlessPercent: DEFAULT_CASHLESS_PERCENT,
        notes: [...DEFAULT_QUOTE_NOTES],
        zones: {
          create: defaultQuoteZones().map((z) => ({
            name: z.name,
            sortOrder: z.sortOrder,
          })),
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
