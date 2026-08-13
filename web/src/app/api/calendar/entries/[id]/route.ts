import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { formatDateKey, parseEventDate } from "@/lib/dates";
import {
  CALENDAR_ENTRY_INCLUDE,
  canMutateEntry,
} from "@/lib/calendar-entries";
import { requireSession } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

const lineSchema = z.object({
  catalogItemId: z.string().min(1),
  qty: z.number().positive(),
});

const patchSchema = z.object({
  date: z.string().optional(),
  title: z.string().optional(),
  note: z.string().optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  responsibleUserId: z.string().nullable().optional(),
  assigneeIds: z.array(z.string().min(1)).optional(),
  lines: z.array(lineSchema).optional(),
});

function dateOnly(d: Date): Date {
  return new Date(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()),
  );
}

function serialize(entry: {
  date: Date;
  [key: string]: unknown;
}) {
  return {
    ...entry,
    date: formatDateKey(
      new Date(
        entry.date.getUTCFullYear(),
        entry.date.getUTCMonth(),
        entry.date.getUTCDate(),
      ),
    ),
  };
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await requireSession();
    const { id } = await ctx.params;
    const entry = await prisma.calendarEntry.findUnique({
      where: { id },
      include: CALENDAR_ENTRY_INCLUDE,
    });
    if (!entry) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }
    return NextResponse.json(serialize(entry));
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("GET /api/calendar/entries/[id]", e);
    return NextResponse.json(
      { error: "Не удалось загрузить запись" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const existing = await prisma.calendarEntry.findUnique({
      where: { id },
      select: { id: true, kind: true, createdById: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }
    if (
      !canMutateEntry(
        session.user.role,
        existing.createdById,
        session.user.id,
        existing.kind,
      )
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = patchSchema.parse(await req.json());
    let nextDate: Date | undefined;
    if (body.date !== undefined) {
      const parsed = parseEventDate(body.date);
      if (!parsed) {
        return NextResponse.json(
          { error: "Некорректная дата" },
          { status: 400 },
        );
      }
      nextDate = dateOnly(parsed);
    }

    if (existing.kind === "RENTAL") {
      if (body.responsibleUserId === null) {
        return NextResponse.json(
          { error: "Укажите ответственного за выдачу" },
          { status: 400 },
        );
      }
      if (body.lines && body.lines.length === 0) {
        return NextResponse.json(
          { error: "Добавьте позиции оборудования" },
          { status: 400 },
        );
      }
    }

    if (existing.kind === "TASK") {
      if (body.title !== undefined && !body.title.trim()) {
        return NextResponse.json(
          { error: "Укажите задачу" },
          { status: 400 },
        );
      }
      if (body.assigneeIds && body.assigneeIds.length === 0) {
        return NextResponse.json(
          { error: "Назначьте хотя бы одного сотрудника" },
          { status: 400 },
        );
      }
    }

    if (existing.kind === "DAY_OFF") {
      if (body.assigneeIds && body.assigneeIds.length === 0) {
        return NextResponse.json(
          { error: "Укажите сотрудника" },
          { status: 400 },
        );
      }
      if (
        (body.startTime !== undefined && !body.startTime?.trim()) ||
        (body.endTime !== undefined && !body.endTime?.trim())
      ) {
        return NextResponse.json(
          { error: "Укажите время с и до" },
          { status: 400 },
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      if (body.assigneeIds && (existing.kind === "TASK" || existing.kind === "DAY_OFF")) {
        await tx.calendarEntryAssignee.deleteMany({ where: { entryId: id } });
        await tx.calendarEntryAssignee.createMany({
          data: [...new Set(body.assigneeIds)].map((userId) => ({
            entryId: id,
            userId,
          })),
        });
      }
      if (body.lines && existing.kind === "RENTAL") {
        await tx.calendarEntryLine.deleteMany({ where: { entryId: id } });
        await tx.calendarEntryLine.createMany({
          data: body.lines.map((l) => ({
            entryId: id,
            catalogItemId: l.catalogItemId,
            qty: l.qty,
          })),
        });
      }

      await tx.calendarEntry.update({
        where: { id },
        data: {
          ...(nextDate ? { date: nextDate } : {}),
          ...(body.title !== undefined ? { title: body.title.trim() } : {}),
          ...(body.note !== undefined ? { note: body.note.trim() } : {}),
          ...(existing.kind === "DAY_OFF" && body.startTime !== undefined
            ? { startTime: body.startTime?.trim() || null }
            : {}),
          ...(existing.kind === "DAY_OFF" && body.endTime !== undefined
            ? { endTime: body.endTime?.trim() || null }
            : {}),
          ...(existing.kind === "RENTAL" && body.responsibleUserId !== undefined
            ? { responsibleUserId: body.responsibleUserId }
            : {}),
        },
      });
    });

    const entry = await prisma.calendarEntry.findUnique({
      where: { id },
      include: CALENDAR_ENTRY_INCLUDE,
    });
    return NextResponse.json(serialize(entry!));
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error("PATCH /api/calendar/entries/[id]", e);
    return NextResponse.json(
      { error: "Не удалось обновить запись" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const existing = await prisma.calendarEntry.findUnique({
      where: { id },
      select: { id: true, kind: true, createdById: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }
    if (
      !canMutateEntry(
        session.user.role,
        existing.createdById,
        session.user.id,
        existing.kind,
      )
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await prisma.calendarEntry.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("DELETE /api/calendar/entries/[id]", e);
    return NextResponse.json(
      { error: "Не удалось удалить запись" },
      { status: 500 },
    );
  }
}
