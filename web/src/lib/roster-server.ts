import type { CatalogOwner, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dayOffsOverlappingQuote } from "@/lib/day-off-conflicts";
import { notifyEmployeeOfAssignment } from "@/lib/notifications";
import { addDays, formatDateKey, parseEventDate, startOfDay } from "@/lib/dates";
import { eventDayIndexForDate, eventStartDate, planAssignmentMove, planAssignmentSpan } from "@/lib/roster";
import { workingDayCount } from "@/lib/quote-assignment-days";
import { ensureMountSpecialtyId } from "@/lib/quote-assignment-slots";
import { mountDutyFlags } from "@/lib/quote-assignments";
import {
  planMountDutyAssign,
  planMountDutyUnassign,
  rowHasMountDuty,
  type MountDuty,
  type MountDutyOp,
} from "@/lib/quote-mount-duty";

export type RosterSlotRef = {
  source: "quote" | "entry";
  quoteId?: string | null;
  entryId?: string | null;
  assignmentIds: string[];
  userId?: string | null;
  entryRole?: "assignee" | "responsible" | "vacant";
  dayIndexStart?: number | null;
  dayIndexEnd?: number | null;
  eventDays?: number | null;
  mountDuty?: "mount" | "demount" | null;
};

type PersonFields = {
  userId: string | null;
  isFreelancer: boolean;
  freelancerName: string;
  owners: CatalogOwner[];
};

type Db = Prisma.TransactionClient | typeof prisma;

/** Пустой запрос той же должности: сначала точная зона, потом любой, потом all-days. */
async function findVacantQuoteAssignment(
  db: Db,
  opts: {
    quoteId: string;
    specialtyId: string | null;
    kind: "EVENT" | "MOUNT";
    zoneId?: string | null;
    dayIndex: number | null;
    excludeIds?: string[];
  },
) {
  if (!opts.specialtyId) return null;
  const base: Prisma.QuoteAssignmentWhereInput = {
    quoteId: opts.quoteId,
    specialtyId: opts.specialtyId,
    kind: opts.kind,
    userId: null,
    isFreelancer: false,
    ...(opts.excludeIds?.length ? { id: { notIn: opts.excludeIds } } : {}),
  };

  if (opts.zoneId != null) {
    const exact = await db.quoteAssignment.findFirst({
      where: { ...base, zoneId: opts.zoneId, dayIndex: opts.dayIndex },
    });
    if (exact) return exact;
  }

  const sameDay = await db.quoteAssignment.findFirst({
    where: { ...base, dayIndex: opts.dayIndex },
  });
  if (sameDay) return sameDay;

  if (opts.dayIndex != null) {
    if (opts.zoneId != null) {
      const allDaysZone = await db.quoteAssignment.findFirst({
        where: { ...base, zoneId: opts.zoneId, dayIndex: null },
      });
      if (allDaysZone) return allDaysZone;
    }
    const allDays = await db.quoteAssignment.findFirst({
      where: { ...base, dayIndex: null },
    });
    if (allDays) return allDays;
  }

  return null;
}

async function ensureVacantQuoteAssignment(
  db: Db,
  opts: {
    quoteId: string;
    specialtyId: string | null;
    kind: "EVENT" | "MOUNT";
    zoneId?: string | null;
    dayIndex: number | null;
  },
) {
  const existing = await findVacantQuoteAssignment(db, opts);
  if (existing) return existing;
  if (!opts.specialtyId) {
    throw new Error("Нельзя создать пустой слот без специальности");
  }
  return db.quoteAssignment.create({
    data: {
      quoteId: opts.quoteId,
      userId: null,
      isFreelancer: false,
      freelancerName: "",
      owners: [],
      specialtyId: opts.specialtyId,
      kind: opts.kind,
      zoneId: opts.zoneId ?? null,
      dayIndex: opts.dayIndex,
      payMode: "SHIFT",
      hours: null,
      rateOverride: null,
      bonus: 0,
      montageAmount: 0,
    },
  });
}

function dateOnlyUtc(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

async function quoteDayOffs(userId: string, quoteId: string) {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: {
      date: true,
      eventDate: true,
      durationDays: true,
      mountDate: true,
      mountDurationDays: true,
      demountDate: true,
      demountDurationDays: true,
    },
  });
  if (!quote) return [];
  return dayOffsOverlappingQuote(userId, quote);
}

function personFromAssignment(a: {
  userId: string | null;
  isFreelancer: boolean;
  freelancerName: string;
  owners: PersonFields["owners"];
}): PersonFields {
  return {
    userId: a.userId,
    isFreelancer: a.isFreelancer,
    freelancerName: a.freelancerName,
    owners: a.owners,
  };
}

const emptyPerson = (): PersonFields => ({
  userId: null,
  isFreelancer: false,
  freelancerName: "",
  owners: [],
});

async function staffPerson(userId: string): Promise<PersonFields> {
  const user = await prisma.user.findFirst({
    where: { id: userId, active: true },
    select: { id: true },
  });
  if (!user) throw new Error("Сотрудник не найден");
  return {
    userId,
    isFreelancer: false,
    freelancerName: "",
    owners: [],
  };
}

async function applyPersonToQuotes(
  ids: string[],
  person: PersonFields,
) {
  if (ids.length === 0) return;
  await prisma.quoteAssignment.updateMany({
    where: { id: { in: ids } },
    data: {
      userId: person.userId,
      isFreelancer: person.isFreelancer,
      freelancerName: person.freelancerName,
      owners: person.owners,
    },
  });
}

function slotMountDuty(slot: RosterSlotRef): MountDuty | null {
  return slot.mountDuty === "mount" || slot.mountDuty === "demount"
    ? slot.mountDuty
    : null;
}

async function executeMountDutyOps(
  ops: MountDutyOp[],
  incoming: PersonFields,
) {
  if (ops.length === 0) return;
  const fromIds = [
    ...new Set(
      ops.flatMap((op) =>
        op.op === "createFilled" ||
        op.op === "createVacant" ||
        op.op === "createFromPerson"
          ? [op.fromId]
          : [],
      ),
    ),
  ];
  const templates = fromIds.length
    ? await prisma.quoteAssignment.findMany({ where: { id: { in: fromIds } } })
    : [];
  const byId = new Map(templates.map((row) => [row.id, row]));

  const templateData = (
    fromId: string,
    person: PersonFields,
    flags: { onMount: boolean; onDemount: boolean },
  ) => {
    const from = byId.get(fromId);
    if (!from) throw new Error("Слот монтажа не найден");
    return {
      quoteId: from.quoteId,
      userId: person.userId,
      isFreelancer: person.isFreelancer,
      freelancerName: person.freelancerName,
      owners: person.owners,
      specialtyId: from.specialtyId,
      kind: "MOUNT" as const,
      zoneId: from.zoneId,
      dayIndex: null,
      payMode: from.payMode,
      hours: from.hours,
      rateOverride: from.rateOverride,
      onMount: flags.onMount,
      onDemount: flags.onDemount,
    };
  };

  await prisma.$transaction(async (tx) => {
    for (const op of ops) {
      if (op.op === "keepPerson") {
        await tx.quoteAssignment.update({
          where: { id: op.id },
          data: {
            onMount: op.flags.onMount,
            onDemount: op.flags.onDemount,
          },
        });
      } else if (op.op === "vacate") {
        await tx.quoteAssignment.update({
          where: { id: op.id },
          data: {
            userId: null,
            isFreelancer: false,
            freelancerName: "",
            owners: [],
            onMount: op.flags.onMount,
            onDemount: op.flags.onDemount,
          },
        });
      }
    }
    for (const op of ops) {
      if (op.op === "createVacant") {
        await tx.quoteAssignment.create({
          data: templateData(op.fromId, emptyPerson(), op.flags),
        });
      } else if (op.op === "createFilled") {
        await tx.quoteAssignment.create({
          data: templateData(op.fromId, incoming, op.flags),
        });
      } else if (op.op === "createFromPerson") {
        const from = byId.get(op.fromId);
        if (!from) throw new Error("Слот монтажа не найден");
        await tx.quoteAssignment.create({
          data: templateData(
            op.fromId,
            personFromAssignment(from),
            op.flags,
          ),
        });
      }
    }
    for (const op of ops) {
      if (op.op !== "fill") continue;
      await tx.quoteAssignment.update({
        where: { id: op.id },
        data: {
          userId: incoming.userId,
          isFreelancer: incoming.isFreelancer,
          freelancerName: incoming.freelancerName,
          owners: incoming.owners,
          onMount: op.flags.onMount,
          onDemount: op.flags.onDemount,
        },
      });
    }
    const deleteIds = ops.filter((op) => op.op === "delete").map((op) => op.id);
    if (deleteIds.length) {
      await tx.quoteAssignment.deleteMany({ where: { id: { in: deleteIds } } });
    }
  });
}

function alreadyOnDutyMessage(duty: MountDuty): string {
  return duty === "mount"
    ? "Этот сотрудник уже на монтаже в этот день"
    : "Этот сотрудник уже на демонтаже в этот день";
}

async function applyOpenMountAssign(
  slot: RosterSlotRef,
  person: PersonFields,
  ifAlready: "error" | "skip" = "error",
) {
  const duty = slotMountDuty(slot);
  const quoteId = slot.quoteId;
  if (!duty || !quoteId) throw new Error("Некорректный слот монтажа");
  if (!person.userId && !person.isFreelancer) return;

  const existing = person.userId
    ? await prisma.quoteAssignment.findFirst({
        where: { quoteId, kind: "MOUNT", userId: person.userId },
      })
    : await prisma.quoteAssignment.findFirst({
        where: {
          quoteId,
          kind: "MOUNT",
          isFreelancer: true,
          freelancerName: person.freelancerName,
        },
      });
  if (existing) {
    if (rowHasMountDuty(existing, duty)) {
      if (ifAlready === "skip") return;
      throw new Error(alreadyOnDutyMessage(duty));
    }
    const flags = mountDutyFlags(existing);
    await prisma.quoteAssignment.update({
      where: { id: existing.id },
      data: {
        onMount: flags.onMount || duty === "mount",
        onDemount: flags.onDemount || duty === "demount",
      },
    });
    return;
  }

  const vacant = await prisma.quoteAssignment.findFirst({
    where: {
      quoteId,
      kind: "MOUNT",
      userId: null,
      isFreelancer: false,
    },
    orderBy: { createdAt: "asc" },
  });
  if (vacant) {
    await applyMountDutyPerson(
      { ...slot, assignmentIds: [vacant.id], quoteId },
      person,
    );
    return;
  }

  const specialtyId = await ensureMountSpecialtyId(prisma);
  await prisma.quoteAssignment.create({
    data: {
      quoteId,
      userId: person.userId,
      isFreelancer: person.isFreelancer,
      freelancerName: person.freelancerName,
      owners: person.owners,
      specialtyId,
      kind: "MOUNT",
      dayIndex: null,
      payMode: "SHIFT",
      onMount: duty === "mount",
      onDemount: duty === "demount",
    },
  });
}

async function applyMountDutyPerson(slot: RosterSlotRef, person: PersonFields) {
  const duty = slotMountDuty(slot);
  const targetId = slot.assignmentIds[0];
  if (duty && slot.quoteId && !targetId) {
    await applyOpenMountAssign(slot, person);
    return;
  }
  if (!duty || !targetId || !slot.quoteId) {
    await applyPersonToQuotes(slot.assignmentIds, person);
    return;
  }
  const target = await prisma.quoteAssignment.findFirst({
    where: { id: targetId, quoteId: slot.quoteId },
  });
  if (!target || target.kind !== "MOUNT") {
    await applyPersonToQuotes(slot.assignmentIds, person);
    return;
  }
  if (!person.userId) {
    await executeMountDutyOps(
      planMountDutyUnassign({
        duty,
        target: {
          id: target.id,
          userId: target.userId,
          onMount: target.onMount,
          onDemount: target.onDemount,
        },
      }),
      emptyPerson(),
    );
    return;
  }
  const existing = await prisma.quoteAssignment.findFirst({
    where: {
      quoteId: slot.quoteId,
      kind: "MOUNT",
      userId: person.userId,
      NOT: { id: target.id },
    },
  });
  if (
    rowHasMountDuty(existing, duty) ||
    (target.userId === person.userId && rowHasMountDuty(target, duty))
  ) {
    throw new Error(alreadyOnDutyMessage(duty));
  }
  await executeMountDutyOps(
    planMountDutyAssign({
      duty,
      target: {
        id: target.id,
        userId: target.userId,
        onMount: target.onMount,
        onDemount: target.onDemount,
      },
      incomingUserId: person.userId,
      existingSameUser: existing
        ? {
            id: existing.id,
            userId: existing.userId,
            onMount: existing.onMount,
            onDemount: existing.onDemount,
          }
        : null,
    }),
    person,
  );
}

async function entryAssigneeIds(entryId: string): Promise<string[]> {
  const rows = await prisma.calendarEntryAssignee.findMany({
    where: { entryId },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

async function setEntryAssignees(entryId: string, userIds: string[]) {
  const unique = [...new Set(userIds.filter(Boolean))];
  await prisma.calendarEntryAssignee.deleteMany({ where: { entryId } });
  if (unique.length === 0) return;
  await prisma.calendarEntryAssignee.createMany({
    data: unique.map((userId) => ({ entryId, userId })),
  });
}

async function quoteSlotPerson(ids: string[]): Promise<PersonFields> {
  const first = await prisma.quoteAssignment.findFirst({
    where: { id: { in: ids } },
    select: {
      userId: true,
      isFreelancer: true,
      freelancerName: true,
      owners: true,
    },
  });
  return first ? personFromAssignment(first) : emptyPerson();
}

async function assertQuoteNotPast(quoteId: string, forcePast = false) {
  if (forcePast) return;
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: { eventDate: true, date: true, durationDays: true },
  });
  if (!quote) throw new Error("Мероприятие не найдено");
  const start = eventStartDate(quote);
  if (!start) return;
  const end = addDays(startOfDay(start), workingDayCount(quote.durationDays) - 1);
  if (formatDateKey(end) < formatDateKey(new Date())) {
    throw new Error("Нельзя менять сотрудников на прошедшем мероприятии");
  }
}

async function assertEntryNotPast(entryId: string, forcePast = false) {
  if (forcePast) return;
  const entry = await prisma.calendarEntry.findUnique({
    where: { id: entryId },
    select: { date: true },
  });
  if (!entry) throw new Error("Запись не найдена");
  const day = new Date(
    entry.date.getUTCFullYear(),
    entry.date.getUTCMonth(),
    entry.date.getUTCDate(),
  );
  if (formatDateKey(startOfDay(day)) < formatDateKey(new Date())) {
    throw new Error("Нельзя менять сотрудников на прошедшей записи");
  }
}

async function assertSlotNotPast(slot: RosterSlotRef, forcePast = false) {
  if (forcePast) return;
  if (slot.source === "quote" && slot.quoteId) {
    await assertQuoteNotPast(slot.quoteId);
    return;
  }
  if (slot.entryId) await assertEntryNotPast(slot.entryId);
}

async function assertUserSpecialty(
  userId: string,
  assignmentIds: string[],
) {
  if (assignmentIds.length === 0) return;
  const row = await prisma.quoteAssignment.findFirst({
    where: { id: { in: assignmentIds } },
    select: { kind: true, specialtyId: true, specialty: { select: { name: true } } },
  });
  if (!row || row.kind === "MOUNT") return;
  const has = await prisma.userSpecialty.findUnique({
    where: {
      userId_specialtyId: { userId, specialtyId: row.specialtyId },
    },
    select: { userId: true },
  });
  if (!has) {
    const role = row.specialty?.name || "этой должности";
    throw new Error(`У сотрудника нет специальности «${role}»`);
  }
}

async function assertFreelancerSpecialty(
  freelancerId: string,
  assignmentIds: string[],
) {
  if (assignmentIds.length === 0) return;
  const row = await prisma.quoteAssignment.findFirst({
    where: { id: { in: assignmentIds } },
    select: { kind: true, specialtyId: true, specialty: { select: { name: true } } },
  });
  if (!row || row.kind === "MOUNT") return;
  const has = await prisma.freelancerSpecialty.findUnique({
    where: {
      freelancerId_specialtyId: { freelancerId, specialtyId: row.specialtyId },
    },
    select: { freelancerId: true },
  });
  if (!has) {
    const role = row.specialty?.name || "этой должности";
    throw new Error(`У фрилансера нет специальности «${role}»`);
  }
}

async function freelancerPerson(freelancerId: string): Promise<PersonFields> {
  const freelancer = await prisma.freelancer.findFirst({
    where: { id: freelancerId, active: true },
    select: { name: true },
  });
  if (!freelancer) throw new Error("Фрилансер не найден");
  return {
    userId: null,
    isFreelancer: true,
    freelancerName: freelancer.name,
    owners: [],
  };
}

async function applyFreelancerRates(assignmentIds: string[], freelancerId: string) {
  if (assignmentIds.length === 0) return;
  const rows = await prisma.quoteAssignment.findMany({
    where: { id: { in: assignmentIds } },
    select: {
      id: true,
      specialtyId: true,
      payMode: true,
      rateOverride: true,
    },
  });
  const specs = await prisma.freelancerSpecialty.findMany({
    where: { freelancerId },
    select: { specialtyId: true, hourlyRate: true, shiftRate: true },
  });
  const bySpec = new Map(specs.map((s) => [s.specialtyId, s]));
  for (const row of rows) {
    if (row.rateOverride != null && row.rateOverride > 0) continue;
    const spec = bySpec.get(row.specialtyId);
    if (!spec) continue;
    const rate = row.payMode === "HOURLY" ? spec.hourlyRate : spec.shiftRate;
    if (!(rate > 0)) continue;
    await prisma.quoteAssignment.update({
      where: { id: row.id },
      data: { rateOverride: rate },
    });
  }
}

async function notifyIfNeeded(quoteId: string, userId: string | null) {
  if (!userId) return;
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: {
      id: true,
      eventName: true,
      proposalNumber: true,
      date: true,
    },
  });
  if (!quote) return;
  await notifyEmployeeOfAssignment(quote, userId);
}

function uniqueErrorMessage(e: unknown): string | null {
  if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
    return "Этот сотрудник уже занят на этой должности в эти дни";
  }
  return null;
}

export async function applyRosterAssignUser(
  slot: RosterSlotRef,
  userId: string,
  forcePast = false,
) {
  await assertSlotNotPast(slot, forcePast);
  const person = await staffPerson(userId);
  if (slot.source === "quote") {
    const quoteId = slot.quoteId;
    if (!quoteId) throw new Error("Некорректный слот");
    if (slot.assignmentIds.length === 0) {
      if (!slotMountDuty(slot)) throw new Error("Некорректный слот");
      const dayOffs = await quoteDayOffs(userId, quoteId);
      if (dayOffs.length > 0) {
        throw new Error(
          `У сотрудника выходной: ${dayOffs.map((d) => d.date).join(", ")}`,
        );
      }
      try {
        await applyOpenMountAssign(slot, person);
      } catch (e) {
        const msg = uniqueErrorMessage(e);
        if (msg) throw new Error(msg);
        throw e;
      }
      await notifyIfNeeded(quoteId, userId);
      return;
    }
    await assertUserSpecialty(userId, slot.assignmentIds);
    const dayOffs = await quoteDayOffs(userId, quoteId);
    if (dayOffs.length > 0) {
      throw new Error(
        `У сотрудника выходной: ${dayOffs.map((d) => d.date).join(", ")}`,
      );
    }
    try {
      await applyMountDutyPerson(slot, person);
    } catch (e) {
      const msg = uniqueErrorMessage(e);
      if (msg) throw new Error(msg);
      throw e;
    }
    await notifyIfNeeded(quoteId, userId);
    return;
  }

  const entryId = slot.entryId;
  if (!entryId) throw new Error("Некорректный слот");
  const entry = await prisma.calendarEntry.findUnique({
    where: { id: entryId },
    select: { id: true, kind: true, responsibleUserId: true },
  });
  if (!entry) throw new Error("Запись не найдена");

  if (entry.kind === "RENTAL" && slot.entryRole === "responsible") {
    await prisma.calendarEntry.update({
      where: { id: entryId },
      data: { responsibleUserId: userId },
    });
    return;
  }

  const current = await entryAssigneeIds(entryId);
  if (slot.userId) {
    await setEntryAssignees(
      entryId,
      current.map((id) => (id === slot.userId ? userId : id)),
    );
    return;
  }
  if (!current.includes(userId)) {
    await setEntryAssignees(entryId, [...current, userId]);
  }
}

export async function applyRosterAssignFreelancer(
  slot: RosterSlotRef,
  freelancerId: string,
  forcePast = false,
) {
  await assertSlotNotPast(slot, forcePast);
  if (slot.source !== "quote") {
    throw new Error("Фрилансера можно назначить только на слот сметы");
  }
  const quoteId = slot.quoteId;
  if (!quoteId) throw new Error("Некорректный слот");
  const person = await freelancerPerson(freelancerId);
  if (slot.assignmentIds.length === 0) {
    if (!slotMountDuty(slot)) throw new Error("Некорректный слот");
    try {
      await applyOpenMountAssign(slot, person);
    } catch (e) {
      const msg = uniqueErrorMessage(e);
      if (msg) throw new Error(msg);
      throw e;
    }
    return;
  }
  await assertFreelancerSpecialty(freelancerId, slot.assignmentIds);
  try {
    await applyMountDutyPerson(slot, person);
  } catch (e) {
    const msg = uniqueErrorMessage(e);
    if (msg) throw new Error(msg);
    throw e;
  }
  await applyFreelancerRates(slot.assignmentIds, freelancerId);
}

export async function applyRosterUnassign(slot: RosterSlotRef, forcePast = false) {
  await assertSlotNotPast(slot, forcePast);
  if (slot.source === "quote") {
    if (slot.assignmentIds.length === 0) throw new Error("Некорректный слот");
    await applyMountDutyPerson(slot, emptyPerson());
    return;
  }
  const entryId = slot.entryId;
  if (!entryId) throw new Error("Некорректный слот");
  if (slot.entryRole === "responsible") {
    await prisma.calendarEntry.update({
      where: { id: entryId },
      data: { responsibleUserId: null },
    });
    return;
  }
  if (slot.userId) {
    const current = await entryAssigneeIds(entryId);
    await setEntryAssignees(
      entryId,
      current.filter((id) => id !== slot.userId),
    );
  }
}

export async function applyRosterSwap(
  a: RosterSlotRef,
  b: RosterSlotRef,
  forcePast = false,
) {
  await assertSlotNotPast(a, forcePast);
  await assertSlotNotPast(b, forcePast);
  if (a.source === "quote" && b.source === "quote") {
    const personA = await quoteSlotPerson(a.assignmentIds);
    const personB = await quoteSlotPerson(b.assignmentIds);
    if (personA.userId) await assertUserSpecialty(personA.userId, b.assignmentIds);
    if (personB.userId) await assertUserSpecialty(personB.userId, a.assignmentIds);
    if (personA.userId && b.quoteId) {
      const offs = await quoteDayOffs(personA.userId, b.quoteId);
      if (offs.length) {
        throw new Error(`У сотрудника выходной: ${offs.map((d) => d.date).join(", ")}`);
      }
    }
    if (personB.userId && a.quoteId) {
      const offs = await quoteDayOffs(personB.userId, a.quoteId);
      if (offs.length) {
        throw new Error(`У сотрудника выходной: ${offs.map((d) => d.date).join(", ")}`);
      }
    }
    const sameRow =
      a.assignmentIds[0] &&
      a.assignmentIds[0] === b.assignmentIds[0] &&
      slotMountDuty(a) &&
      slotMountDuty(b);
    if (sameRow) return;
    if (
      !slotMountDuty(a) &&
      slotMountDuty(b) &&
      (personA.userId || personA.isFreelancer)
    ) {
      try {
        await applyOpenMountAssign(b, personA);
      } catch (e) {
        const msg = uniqueErrorMessage(e);
        if (msg) throw new Error(msg);
        throw e;
      }
      if (b.quoteId) await notifyIfNeeded(b.quoteId, personA.userId);
      return;
    }
    if (slotMountDuty(a) || slotMountDuty(b)) {
      try {
        await applyMountDutyPerson(a, emptyPerson());
        await applyMountDutyPerson(b, emptyPerson());
        if (personB.userId) await applyMountDutyPerson(a, personB);
        if (personA.userId) await applyMountDutyPerson(b, personA);
      } catch (e) {
        const msg = uniqueErrorMessage(e);
        if (msg) throw new Error(msg);
        throw e;
      }
      if (b.quoteId) await notifyIfNeeded(b.quoteId, personA.userId);
      if (a.quoteId) await notifyIfNeeded(a.quoteId, personB.userId);
      return;
    }
    const allIds = [...a.assignmentIds, ...b.assignmentIds];
    try {
      await prisma.$transaction(async (tx) => {
        if (allIds.length) {
          await tx.quoteAssignment.updateMany({
            where: { id: { in: allIds } },
            data: {
              userId: null,
              isFreelancer: false,
              freelancerName: "",
              owners: [],
            },
          });
        }
        if (a.assignmentIds.length) {
          await tx.quoteAssignment.updateMany({
            where: { id: { in: a.assignmentIds } },
            data: {
              userId: personB.userId,
              isFreelancer: personB.isFreelancer,
              freelancerName: personB.freelancerName,
              owners: personB.owners,
            },
          });
        }
        if (b.assignmentIds.length) {
          await tx.quoteAssignment.updateMany({
            where: { id: { in: b.assignmentIds } },
            data: {
              userId: personA.userId,
              isFreelancer: personA.isFreelancer,
              freelancerName: personA.freelancerName,
              owners: personA.owners,
            },
          });
        }
      });
    } catch (e) {
      const msg = uniqueErrorMessage(e);
      if (msg) throw new Error(msg);
      throw e;
    }
    if (b.quoteId) await notifyIfNeeded(b.quoteId, personA.userId);
    if (a.quoteId) await notifyIfNeeded(a.quoteId, personB.userId);
    return;
  }

  const personOf = async (slot: RosterSlotRef): Promise<PersonFields> => {
    if (slot.source === "quote") return quoteSlotPerson(slot.assignmentIds);
    if (slot.userId) return staffPerson(slot.userId);
    return emptyPerson();
  };

  const applyTo = async (slot: RosterSlotRef, person: PersonFields) => {
    if (slot.source === "quote") {
      if (person.userId && slot.quoteId) {
        await assertUserSpecialty(person.userId, slot.assignmentIds);
        const offs = await quoteDayOffs(person.userId, slot.quoteId);
        if (offs.length) {
          throw new Error(`У сотрудника выходной: ${offs.map((d) => d.date).join(", ")}`);
        }
      }
      await applyMountDutyPerson(slot, person);
      if (slot.quoteId) await notifyIfNeeded(slot.quoteId, person.userId);
      return;
    }
    const entryId = slot.entryId;
    if (!entryId) throw new Error("Некорректный слот");
    if (slot.entryRole === "responsible") {
      await prisma.calendarEntry.update({
        where: { id: entryId },
        data: { responsibleUserId: person.userId },
      });
      return;
    }
    const current = await entryAssigneeIds(entryId);
    if (slot.userId) {
      const next = current.filter((id) => id !== slot.userId);
      if (person.userId) next.push(person.userId);
      await setEntryAssignees(entryId, next);
      return;
    }
    if (person.userId) {
      await setEntryAssignees(entryId, [...current, person.userId]);
    }
  };

  const personA = await personOf(a);
  const personB = await personOf(b);
  await applyTo(a, emptyPerson());
  await applyTo(b, emptyPerson());
  await applyTo(a, personB);
  await applyTo(b, personA);
}

export async function applyRosterShiftToDay(
  slot: RosterSlotRef,
  dateKey: string,
  forcePast = false,
) {
  await assertSlotNotPast(slot, forcePast);
  const day = parseEventDate(dateKey);
  if (!day) throw new Error("Некорректная дата");

  if (slot.source === "entry" && slot.entryId) {
    await prisma.calendarEntry.update({
      where: { id: slot.entryId },
      data: { date: dateOnlyUtc(day) },
    });
    return;
  }

  if (slot.source !== "quote" || !slot.quoteId || slot.assignmentIds.length === 0) {
    throw new Error("Некорректный слот");
  }

  const quote = await prisma.quote.findUnique({
    where: { id: slot.quoteId },
    select: {
      id: true,
      date: true,
      eventDate: true,
      durationDays: true,
    },
  });
  if (!quote) throw new Error("Мероприятие не найдено");
  const start = eventStartDate(quote);
  if (!start) throw new Error("У мероприятия нет даты");
  const eventDays = workingDayCount(quote.durationDays);
  const newStart = eventDayIndexForDate(start, eventDays, day);
  if (newStart == null) {
    throw new Error("Дата вне дней мероприятия");
  }

  const assignments = await prisma.quoteAssignment.findMany({
    where: { id: { in: slot.assignmentIds }, quoteId: quote.id },
  });
  if (assignments.length === 0) throw new Error("Слот не найден");
  if (assignments.every((a) => !a.userId && !a.isFreelancer)) {
    throw new Error("Пустую должность из сметы нельзя сдвигать");
  }
  if (assignments.some((a) => a.kind === "MOUNT")) {
    throw new Error("Монтаж нельзя сдвинуть по дням мероприятия");
  }

  const from = slot.dayIndexStart ?? assignments[0]!.dayIndex ?? newStart;
  const to = slot.dayIndexEnd ?? from;
  const span = Math.max(0, to - from);
  const nextFrom = newStart;
  const nextTo = Math.min(eventDays, nextFrom + span);
  const move = planAssignmentMove({
    dayIndexes: assignments.map((a) => a.dayIndex),
    eventDays,
    destFrom: nextFrom,
    destTo: nextTo,
  });
  if (!move) throw new Error("Дата вне дней мероприятия");

  const template =
    assignments.find((a) => a.userId || a.isFreelancer) || assignments[0]!;
  const person = personFromAssignment(template);
  const emptyPersonData = {
    userId: null as string | null,
    isFreelancer: false,
    freelancerName: "",
    owners: [] as CatalogOwner[],
  };

  try {
    await prisma.$transaction(async (tx) => {
      for (const row of assignments) {
        const day = row.dayIndex;
        if (day != null && move.vacateDays.includes(day)) {
          await tx.quoteAssignment.update({
            where: { id: row.id },
            data: emptyPersonData,
          });
        }
      }

      if (move.allDays) {
        const keep = assignments[0]!;
        await tx.quoteAssignment.update({
          where: { id: keep.id },
          data: {
            ...person,
            dayIndex: move.destDays[0] ?? nextFrom,
          },
        });
        for (const dayIndex of move.vacateDays) {
          await ensureVacantQuoteAssignment(tx, {
            quoteId: quote.id,
            specialtyId: template.specialtyId,
            kind: template.kind,
            zoneId: template.zoneId,
            dayIndex,
          });
        }
      }

      for (const dayIndex of move.destDays) {
        const already = person.userId
          ? await tx.quoteAssignment.findFirst({
              where: {
                quoteId: quote.id,
                specialtyId: template.specialtyId,
                kind: template.kind,
                dayIndex,
                userId: person.userId,
              },
              select: { id: true },
            })
          : person.isFreelancer
            ? await tx.quoteAssignment.findFirst({
                where: {
                  quoteId: quote.id,
                  specialtyId: template.specialtyId,
                  kind: template.kind,
                  dayIndex,
                  isFreelancer: true,
                  freelancerName: person.freelancerName,
                },
                select: { id: true },
              })
            : null;
        if (already) continue;

        const vacant = await findVacantQuoteAssignment(tx, {
          quoteId: quote.id,
          specialtyId: template.specialtyId,
          kind: template.kind,
          zoneId: template.zoneId,
          dayIndex,
          excludeIds: assignments.map((a) => a.id),
        });
        if (vacant) {
          await tx.quoteAssignment.update({
            where: { id: vacant.id },
            data: {
              ...person,
              dayIndex,
              zoneId: vacant.zoneId ?? template.zoneId,
            },
          });
          continue;
        }
        await tx.quoteAssignment.create({
          data: {
            quoteId: quote.id,
            userId: template.userId,
            specialtyId: template.specialtyId,
            kind: template.kind,
            zoneId: template.zoneId,
            dayIndex,
            payMode: template.payMode,
            hours: template.hours,
            rateOverride: template.rateOverride,
            bonus: template.bonus,
            montageAmount: template.montageAmount,
            isFreelancer: template.isFreelancer,
            freelancerName: template.freelancerName,
            owners: template.owners,
          },
        });
      }
    });
  } catch (e) {
    const msg = uniqueErrorMessage(e);
    if (msg) throw new Error(msg);
    throw e;
  }
}

export async function applyRosterSpan(opts: {
  quoteId: string;
  assignmentIds: string[];
  fromDay: number;
  toDay: number;
  forcePast?: boolean;
}) {
  await assertQuoteNotPast(opts.quoteId, opts.forcePast);
  const quote = await prisma.quote.findUnique({
    where: { id: opts.quoteId },
    select: { id: true, durationDays: true },
  });
  if (!quote) throw new Error("Мероприятие не найдено");

  const assignments = await prisma.quoteAssignment.findMany({
    where: { id: { in: opts.assignmentIds }, quoteId: quote.id },
  });
  if (assignments.length === 0) throw new Error("Слот не найден");
  if (assignments.every((a) => !a.userId && !a.isFreelancer)) {
    throw new Error("Пустую должность из сметы нельзя растягивать");
  }
  if (assignments.some((a) => a.kind === "MOUNT")) {
    throw new Error("Слот монтажа нельзя растянуть по дням шоу");
  }

  const plan = planAssignmentSpan({
    quoteId: quote.id,
    assignmentIds: assignments.map((a) => a.id),
    dayIndexes: assignments.map((a) => a.dayIndex),
    eventDays: quote.durationDays,
    fromDay: opts.fromDay,
    toDay: opts.toDay,
  });
  if (!plan) {
    throw new Error("Нельзя растянуть слот за пределы мероприятия");
  }

  const template = assignments.find((a) => a.id === plan?.createFromId) || assignments[0]!;
  const emptyPersonData = {
    userId: null as string | null,
    isFreelancer: false,
    freelancerName: "",
    owners: [] as CatalogOwner[],
  };

  try {
    if (plan) await prisma.$transaction(async (tx) => {
      if (plan.vacateIds.length) {
        await tx.quoteAssignment.updateMany({
          where: { id: { in: plan.vacateIds } },
          data: emptyPersonData,
        });
      }
      if (plan.deleteIds.length) {
        await tx.quoteAssignment.deleteMany({
          where: { id: { in: plan.deleteIds } },
        });
      }
      if (plan.firstDayIndex !== undefined) {
        await tx.quoteAssignment.update({
          where: { id: template.id },
          data: { dayIndex: plan.firstDayIndex },
        });
      }
      if (plan.convertToAllDays) {
        const extras = plan.keepIds.filter((id) => id !== template.id);
        if (extras.length) {
          await tx.quoteAssignment.deleteMany({ where: { id: { in: extras } } });
        }
        await tx.quoteAssignment.update({
          where: { id: template.id },
          data: { dayIndex: null },
        });
        const leftover = await tx.quoteAssignment.findMany({
          where: {
            quoteId: quote.id,
            specialtyId: template.specialtyId,
            kind: template.kind,
            zoneId: template.zoneId,
            userId: null,
            isFreelancer: false,
            dayIndex: { not: null },
            id: { not: template.id },
          },
          select: { id: true, dayIndex: true },
        });
        const absorb: string[] = [];
        const seenDay = new Set<number>();
        for (const row of leftover) {
          const day = row.dayIndex;
          if (day == null || seenDay.has(day)) continue;
          seenDay.add(day);
          absorb.push(row.id);
        }
        if (absorb.length) {
          await tx.quoteAssignment.deleteMany({ where: { id: { in: absorb } } });
        }
      }
      for (const dayIndex of plan.createDayIndexes) {
        const vacant = await findVacantQuoteAssignment(tx, {
          quoteId: quote.id,
          specialtyId: template.specialtyId,
          kind: template.kind,
          zoneId: template.zoneId,
          dayIndex,
          excludeIds: [template.id, ...plan.keepIds, ...plan.vacateIds],
        });
        if (vacant) {
          await tx.quoteAssignment.update({
            where: { id: vacant.id },
            data: {
              userId: template.userId,
              isFreelancer: template.isFreelancer,
              freelancerName: template.freelancerName,
              owners: template.owners,
              payMode: template.payMode,
              hours: template.hours,
              rateOverride: template.rateOverride,
              dayIndex,
              zoneId: vacant.zoneId ?? template.zoneId,
            },
          });
          continue;
        }
        await tx.quoteAssignment.create({
          data: {
            quoteId: quote.id,
            userId: template.userId,
            specialtyId: template.specialtyId,
            kind: template.kind,
            zoneId: template.zoneId,
            dayIndex,
            payMode: template.payMode,
            hours: template.hours,
            rateOverride: template.rateOverride,
            bonus: template.bonus,
            montageAmount: template.montageAmount,
            isFreelancer: template.isFreelancer,
            freelancerName: template.freelancerName,
            owners: template.owners,
          },
        });
      }
      for (const dayIndex of plan.createVacantDayIndexes) {
        await ensureVacantQuoteAssignment(tx, {
          quoteId: quote.id,
          specialtyId: template.specialtyId,
          kind: template.kind,
          zoneId: template.zoneId,
          dayIndex,
        });
      }
    });
  } catch (e) {
    const msg = uniqueErrorMessage(e);
    if (msg) throw new Error(msg);
    throw e;
  }
}

export function rosterErrorStatus(e: unknown): { status: number; error: string } {
  const message = e instanceof Error ? e.message : "Не удалось обновить слот";
  const conflict =
    message.includes("выходной") ||
    message.includes("уже занят") ||
    message.includes("уже на монтаж") ||
    message.includes("уже на демонтаж") ||
    message.includes("вне дней") ||
    message.includes("прошедш") ||
    message.includes("специальности") ||
    message.includes("нельзя");
  return { status: conflict ? 409 : 400, error: message };
}
