import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseEventDate } from "@/lib/dates";
import {
  CALENDAR_ENTRY_INCLUDE,
  canCreateEntryKind,
  entrySpanUtc,
  overlappingEntryWhere,
  serializeCalendarEntry,
} from "@/lib/calendar-entries";
import { ensureQuoteSchemaColumns } from "@/lib/ensure-schema";
import { requireSession } from "@/lib/session";

let ensureOnce: Promise<void> | null = null;

function ensureSchemaOnce() {
  if (!ensureOnce) {
    ensureOnce = ensureQuoteSchemaColumns().catch((e) => {
      ensureOnce = null;
      throw e;
    });
  }
  return ensureOnce;
}

const lineSchema = z.object({
  catalogItemId: z.string().min(1),
  qty: z.number().positive(),
});

const createSchema = z.object({
  kind: z.enum(["RENTAL", "TASK", "DAY_OFF"]),
  date: z.string().min(1),
  durationDays: z.number().int().positive().optional(),
  title: z.string().optional(),
  note: z.string().optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  responsibleUserId: z.string().nullable().optional(),
  clientId: z.string().nullable().optional(),
  assigneeIds: z.array(z.string().min(1)).optional(),
  lines: z.array(lineSchema).optional(),
});

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    await ensureSchemaOnce();
    const fromRaw = req.nextUrl.searchParams.get("from");
    const toRaw = req.nextUrl.searchParams.get("to");
    const from = parseEventDate(fromRaw || undefined);
    const to = parseEventDate(toRaw || undefined);

    const where = from && to ? overlappingEntryWhere(from, to) : {};

    const entries = await prisma.calendarEntry.findMany({
      where,
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      include: CALENDAR_ENTRY_INCLUDE,
    });

    return NextResponse.json(entries.map(serializeCalendarEntry));
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("GET /api/calendar/entries", e);
    return NextResponse.json(
      { error: "Не удалось загрузить записи календаря" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    await ensureSchemaOnce();
    await ensureSchemaOnce();
    const body = createSchema.parse(await req.json());

    if (!canCreateEntryKind(session.user.role, body.kind, session.permissions)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const day = parseEventDate(body.date);
    if (!day) {
      return NextResponse.json({ error: "Некорректная дата" }, { status: 400 });
    }

    const title = (body.title || "").trim();
    const note = (body.note || "").trim();
    const assigneeIds = [...new Set(body.assigneeIds || [])];
    const lines = body.lines || [];
    let clientId: string | null = null;
    const span = entrySpanUtc(
      day,
      body.kind === "DAY_OFF" ? body.durationDays : 1,
    );

    if (body.kind === "RENTAL" && body.clientId) {
      const client = await prisma.client.findUnique({
        where: { id: body.clientId },
        select: { id: true },
      });
      if (!client) {
        return NextResponse.json(
          { error: "Клиент не найден" },
          { status: 400 },
        );
      }
      clientId = client.id;
    }

    if (body.kind === "RENTAL") {
      if (!body.responsibleUserId) {
        return NextResponse.json(
          { error: "Укажите ответственного за выдачу" },
          { status: 400 },
        );
      }
      if (lines.length === 0) {
        return NextResponse.json(
          { error: "Добавьте позиции оборудования" },
          { status: 400 },
        );
      }
    }

    if (body.kind === "TASK") {
      if (!title) {
        return NextResponse.json(
          { error: "Укажите задачу" },
          { status: 400 },
        );
      }
      if (assigneeIds.length === 0) {
        return NextResponse.json(
          { error: "Назначьте хотя бы одного сотрудника" },
          { status: 400 },
        );
      }
    }

    if (body.kind === "DAY_OFF") {
      if (assigneeIds.length === 0) {
        return NextResponse.json(
          { error: "Укажите сотрудника" },
          { status: 400 },
        );
      }
    }

    const entry = await prisma.calendarEntry.create({
      data: {
        kind: body.kind,
        date: span.date,
        endDate: span.endDate,
        durationDays: span.durationDays,
        title:
          body.kind === "DAY_OFF"
            ? title || "Выходной"
            : body.kind === "RENTAL"
              ? title || "Аренда оборудования"
              : title,
        note,
        startTime: null,
        endTime: null,
        responsibleUserId:
          body.kind === "RENTAL" ? body.responsibleUserId : null,
        clientId: body.kind === "RENTAL" ? clientId : null,
        createdById: session.user.id,
        assignees:
          body.kind === "TASK" || body.kind === "DAY_OFF"
            ? {
                create: assigneeIds.map((userId) => ({ userId })),
              }
            : undefined,
        lines:
          body.kind === "RENTAL"
            ? {
                create: lines.map((l) => ({
                  catalogItemId: l.catalogItemId,
                  qty: l.qty,
                })),
              }
            : undefined,
      },
      include: CALENDAR_ENTRY_INCLUDE,
    });

    return NextResponse.json(serializeCalendarEntry(entry), { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error("POST /api/calendar/entries", e);
    return NextResponse.json(
      { error: "Не удалось создать запись" },
      { status: 500 },
    );
  }
}
