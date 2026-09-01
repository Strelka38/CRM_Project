import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseEventDate } from "@/lib/dates";
import { csvFileResponse, readUploadedCsv } from "@/lib/csv";
import {
  QUOTE_CSV_HEADERS,
  parseQuoteCsv,
  quoteToCsvCells,
} from "@/lib/directory-csv";
import { DEFAULT_CASHLESS_PERCENT } from "@/lib/pricing";
import { defaultQuoteZones } from "@/lib/quote-defaults";
import {
  defaultDemountDate,
  defaultMountDate,
} from "@/lib/quote-schedule";
import { nextProposalNumber } from "@/lib/proposal-number";
import {
  canSeeAllEvents,
  requireManager,
  requireSession,
} from "@/lib/session";
import { notifyManagersOfNewEvent } from "@/lib/notifications";

const quoteSelect = {
  id: true,
  proposalNumber: true,
  eventName: true,
  date: true,
  durationDays: true,
  client: true,
  place: true,
  lifecycle: true,
  managerName: true,
  invoiceSent: true,
  paid: true,
  paymentComment: true,
  owner: { select: { name: true } },
} as const;

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const unpaid = req.nextUrl.searchParams.get("unpaid") === "1";
    if (unpaid) await requireManager();
    const employeeScope =
      !canSeeAllEvents(session.user.role)
        ? { assignments: { some: { userId: session.user.id } } }
        : {};
    const quotes = await prisma.quote.findMany({
      where: {
        ...employeeScope,
        ...(unpaid
          ? { invoiceRequired: true, lifecycle: { not: "CANCELLED" } }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
      select: quoteSelect,
    });
    const stamp = new Date().toISOString().slice(0, 10);
    const name = unpaid ? `unpaid-${stamp}.csv` : `quotes-${stamp}.csv`;
    return csvFileResponse(name, [
      [...QUOTE_CSV_HEADERS],
      ...quotes.map((q) => quoteToCsvCells(q)),
    ]);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/quotes/csv]", e);
    return NextResponse.json({ error: "Не удалось экспортировать" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireManager();
    const uploaded = await readUploadedCsv(req);
    if ("error" in uploaded) return uploaded.error;
    const { rows, errors } = parseQuoteCsv(uploaded.text);
    if (rows.length === 0) {
      return NextResponse.json(
        { error: errors[0] || "Нет строк для импорта", errors, created: 0, updated: 0 },
        { status: 400 },
      );
    }
    let created = 0;
    let updated = 0;
    const rowErrors = [...errors];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const lineNo = i + 2;
      try {
        const byId = r.id
          ? await prisma.quote.findUnique({ where: { id: r.id }, select: { id: true } })
          : null;
        const byNumber = r.proposalNumber
          ? await prisma.quote.findFirst({
              where: { proposalNumber: r.proposalNumber },
              select: { id: true },
            })
          : null;
        const existingId = byId?.id || byNumber?.id;
        const data = {
          eventName: r.eventName,
          date: r.date,
          eventDate: parseEventDate(r.date),
          durationDays: r.durationDays,
          client: r.client,
          place: r.place,
          managerName: r.managerName || session.user.name || "",
          invoiceSent: r.invoiceSent,
          paid: r.paid,
          paymentComment: r.paymentComment,
          ...(r.date
            ? {
                mountDate: defaultMountDate(r.date),
                demountDate: defaultDemountDate(r.date, r.durationDays),
              }
            : {}),
        };
        if (existingId) {
          await prisma.quote.update({
            where: { id: existingId },
            data,
          });
          updated += 1;
          continue;
        }
        const proposalNumber = r.proposalNumber || (await nextProposalNumber());
        const quote = await prisma.quote.create({
          data: {
            ...data,
            ownerId: session.user.id,
            proposalNumber,
            lifecycle: "CALCULATED",
            discountPercent: 0,
            cashlessPercent: DEFAULT_CASHLESS_PERCENT,
            zones: {
              create: defaultQuoteZones().map((z) => ({
                name: z.name,
                sortOrder: z.sortOrder,
              })),
            },
          },
        });
        await notifyManagersOfNewEvent({
          id: quote.id,
          eventName: quote.eventName,
          proposalNumber: quote.proposalNumber,
          ownerId: quote.ownerId,
          date: quote.date,
          managerName: quote.managerName,
        });
        created += 1;
      } catch (err) {
        rowErrors.push(`Строка ${lineNo}: ${err instanceof Error ? err.message : "ошибка"}`);
      }
    }
    return NextResponse.json({
      created,
      updated,
      total: rows.length,
      errors: rowErrors.slice(0, 50),
      errorCount: rowErrors.length,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[POST /api/quotes/csv]", e);
    return NextResponse.json({ error: "Не удалось импортировать" }, { status: 500 });
  }
}
