import type { CatalogOwnerValue } from "@/lib/catalog-owner";
import { parseEventDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { ensureQuoteSchemaColumns } from "@/lib/ensure-schema";
import { STATS_LIFECYCLES } from "@/lib/lifecycle";
import {
  completedMonthsBack,
  dateToYmParam,
  emptyStaffBreakdown,
  freelancerAssignmentSourceKey,
  mergePayouts,
  parseFreelancerSourceKey,
  parseStaffBreakdown,
  parseStaffMonthSourceKey,
  staffDisplayName,
  staffMonthAmount,
  staffMonthSourceKey,
  userExistedInMonth,
  type LivePayable,
  type PayoutKindValue,
  type PayoutMark,
  type StaffMonthBreakdown,
} from "@/lib/payouts";
import {
  getYearMonthRange,
  toYearMonthParam,
} from "@/lib/period";
import {
  isFreelancerAssignment,
  isVacantAssignment,
  serializeAssignmentPay,
} from "@/lib/quote-assignments";
import { computeQuoteSettlement } from "@/lib/quote-settlement";

const SETTLEMENT_INCLUDE = {
  owner: {
    select: {
      id: true,
      name: true,
      owners: true,
      agencyPercent: true,
    },
  },
  blocks: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      catalogItem: { select: { itemKind: true, owners: true } },
      kit: {
        select: {
          components: {
            select: {
              catalogItem: { select: { owners: true } },
            },
          },
        },
      },
    },
  },
  calcShares: true,
  extraExpenses: { orderBy: { sortOrder: "asc" as const } },
  calcLineOverrides: true,
  assignments: {
    include: {
      user: {
        select: {
          owners: true,
          specialties: {
            select: {
              specialtyId: true,
              hourlyRate: true,
              shiftRate: true,
            },
          },
        },
      },
    },
  },
} as const;

let schemaReady: Promise<void> | null = null;

export function ensurePayoutsSchemaOnce() {
  if (!schemaReady) {
    schemaReady = ensureQuoteSchemaColumns().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

function quoteEventDate(q: {
  eventDate?: Date | null;
  date?: string | null;
}): Date | null {
  if (q.eventDate instanceof Date && !Number.isNaN(q.eventDate.getTime())) {
    return q.eventDate;
  }
  return parseEventDate(q.date);
}

type StaffAccrual = {
  userId: string;
  payeeName: string;
  periodYm: string;
  breakdown: StaffMonthBreakdown;
};

function staffAccrualKey(userId: string, periodYm: string) {
  return `${userId}:${periodYm}`;
}

export async function buildPayoutBoard(opts?: {
  userId?: string;
  now?: Date;
}) {
  const now = opts?.now ?? new Date();
  const months = completedMonthsBack(undefined, now);
  const previousYm = toYearMonthParam(months[0]);
  const oldest = months[months.length - 1];
  const lookbackFrom = getYearMonthRange(oldest).from;
  const lookbackTo = getYearMonthRange(months[0]).to;

  const [users, assignments, ownedQuotes, marksRaw] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        patronymic: true,
        monthlySalary: true,
        createdAt: true,
      },
    }),
    prisma.quoteAssignment.findMany({
      where: {
        quote: {
          lifecycle: { in: [...STATS_LIFECYCLES] },
        },
      },
      include: {
        specialty: { select: { id: true, name: true } },
        user: {
          select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
            owners: true,
            specialties: {
              select: {
                specialtyId: true,
                hourlyRate: true,
                shiftRate: true,
              },
            },
          },
        },
        quote: {
          select: {
            id: true,
            eventName: true,
            date: true,
            eventDate: true,
            proposalNumber: true,
            lifecycle: true,
          },
        },
      },
    }),
    prisma.quote.findMany({
      where: {
        ownerId: { not: "" },
        lifecycle: { in: [...STATS_LIFECYCLES] },
        eventDate: { gte: lookbackFrom, lt: lookbackTo },
      },
      include: SETTLEMENT_INCLUDE,
    }),
    prisma.payout.findMany({
      include: { paidBy: { select: { name: true } } },
      orderBy: { paidAt: "desc" },
    }),
  ]);

  const monthSet = new Set(months.map((m) => toYearMonthParam(m)));
  const staffMap = new Map<string, StaffAccrual>();

  function touchStaff(
    userId: string,
    payeeName: string,
    periodYm: string,
  ): StaffAccrual {
    const key = staffAccrualKey(userId, periodYm);
    let row = staffMap.get(key);
    if (!row) {
      row = {
        userId,
        payeeName,
        periodYm,
        breakdown: emptyStaffBreakdown(),
      };
      staffMap.set(key, row);
    }
    return row;
  }

  for (const user of users) {
    const name = staffDisplayName(user);
    const salary = Math.max(0, Number(user.monthlySalary) || 0);
    if (salary <= 0) continue;
    for (const ym of months) {
      if (!userExistedInMonth(user.createdAt, ym)) continue;
      const periodYm = toYearMonthParam(ym);
      touchStaff(user.id, name, periodYm).breakdown.monthlySalary = salary;
    }
  }

  const live: LivePayable[] = [];

  for (const assignment of assignments) {
    const eventDate = quoteEventDate(assignment.quote);
    if (!eventDate) continue;
    const periodYm = dateToYmParam(eventDate);

    const pay = serializeAssignmentPay(assignment);
    if (isVacantAssignment(assignment)) continue;

    if (isFreelancerAssignment(assignment)) {
      const amount = pay.pay + pay.montageAmount;
      if (amount <= 0) continue;
      live.push({
        sourceKey: freelancerAssignmentSourceKey(assignment.id),
        kind: "FREELANCER_EVENT",
        periodYm,
        payeeName: pay.user.name || assignment.freelancerName || "Фрилансер",
        userId: null,
        assignmentId: assignment.id,
        quoteId: assignment.quoteId,
        quoteName: assignment.quote.eventName || "",
        quoteDate: assignment.quote.date || "",
        specialtyName: assignment.specialty.name,
        amount,
        breakdown: null,
      });
      continue;
    }

    if (!monthSet.has(periodYm)) continue;
    if (!assignment.userId || !assignment.user) continue;
    const row = touchStaff(
      assignment.userId,
      staffDisplayName(assignment.user),
      periodYm,
    );
    row.breakdown.assignmentPay += pay.pay;
    row.breakdown.montage += pay.montageAmount;
  }

  for (const quote of ownedQuotes) {
    const eventDate = quoteEventDate(quote);
    if (!eventDate || !quote.ownerId) continue;
    const periodYm = dateToYmParam(eventDate);
    if (!monthSet.has(periodYm)) continue;
    const owner = users.find((u) => u.id === quote.ownerId);
    if (!owner || !quote.owner) continue;
    try {
      const settlement = computeQuoteSettlement({
        ...quote,
        owner: {
          owners: quote.owner.owners as CatalogOwnerValue[],
          agencyPercent: quote.owner.agencyPercent,
        },
        extraExpenses: quote.extraExpenses.map((e) => ({
          ...e,
          owners: e.owners as CatalogOwnerValue[],
        })),
      });
      const agency = Math.max(0, settlement.agency.total);
      if (agency <= 0) continue;
      touchStaff(owner.id, staffDisplayName(owner), periodYm).breakdown.agency +=
        agency;
    } catch (e) {
      console.error("payouts agency", quote.id, e);
    }
  }

  for (const row of staffMap.values()) {
    const amount = staffMonthAmount(row.breakdown);
    if (amount <= 0) continue;
    live.push({
      sourceKey: staffMonthSourceKey(row.userId, row.periodYm),
      kind: "STAFF_MONTH",
      periodYm: row.periodYm,
      payeeName: row.payeeName,
      userId: row.userId,
      assignmentId: null,
      quoteId: null,
      quoteName: "",
      quoteDate: "",
      specialtyName: "",
      amount,
      breakdown: row.breakdown,
    });
  }

  const marks: PayoutMark[] = marksRaw.map((p) => ({
    id: p.id,
    sourceKey: p.sourceKey,
    kind: p.kind as PayoutKindValue,
    periodYm: p.periodYm,
    payeeName: p.payeeName,
    userId: p.userId,
    assignmentId: p.assignmentId,
    quoteId: p.quoteId,
    amount: p.amount,
    breakdown: parseStaffBreakdown(p.breakdown),
    paid: p.paid,
    paidAt: p.paidAt ? p.paidAt.toISOString() : null,
    paidByName: p.paidBy?.name ?? null,
  }));

  let filteredLive = live;
  let filteredMarks = marks;
  if (opts?.userId) {
    filteredLive = live.filter((row) => row.userId === opts.userId);
    filteredMarks = marks.filter((row) => row.userId === opts.userId);
  }

  const { queue, history } = mergePayouts(filteredLive, filteredMarks);
  const staffQueue = queue.filter((row) => row.kind === "STAFF_MONTH");
  const freelancerQueue = queue.filter(
    (row) => row.kind === "FREELANCER_EVENT",
  );

  return {
    previousYm,
    queue,
    staffQueue,
    freelancerQueue,
    history,
    staffTotal: staffQueue.reduce((s, r) => s + r.amount, 0),
    freelancerTotal: freelancerQueue.reduce((s, r) => s + r.amount, 0),
    total: queue.reduce((s, r) => s + r.amount, 0),
    historyTotal: history.reduce((s, r) => s + r.amount, 0),
  };
}

export async function setPayoutsPaid(opts: {
  sourceKeys: string[];
  paid: boolean;
  actorId: string;
  now?: Date;
}) {
  const now = opts.now ?? new Date();
  const board = await buildPayoutBoard({ now });
  const liveByKey = new Map(board.queue.map((row) => [row.sourceKey, row]));
  const historyByKey = new Map(
    board.history.map((row) => [row.sourceKey, row]),
  );
  const existingRows = await prisma.payout.findMany({
    where: { sourceKey: { in: opts.sourceKeys } },
  });
  const existingByKey = new Map(
    existingRows.map((row) => [row.sourceKey, row]),
  );

  const results: Array<{
    sourceKey: string;
    ok: boolean;
    id?: string;
    paid?: boolean;
    error?: string;
  }> = [];

  for (const sourceKey of opts.sourceKeys) {
    const live = liveByKey.get(sourceKey);
    const existing = existingByKey.get(sourceKey);
    const historyRow = historyByKey.get(sourceKey);
    const template = live
      ? {
          kind: live.kind,
          periodYm: live.periodYm,
          userId: live.userId,
          assignmentId: live.assignmentId,
          quoteId: live.quoteId,
          payeeName: live.payeeName,
          amount: live.amount,
          breakdown: live.breakdown,
        }
      : historyRow
        ? {
            kind: historyRow.kind,
            periodYm: historyRow.periodYm,
            userId: historyRow.userId,
            assignmentId: historyRow.assignmentId,
            quoteId: historyRow.quoteId,
            payeeName: historyRow.payeeName,
            amount: historyRow.amount,
            breakdown: historyRow.breakdown,
          }
        : existing
          ? {
              kind: existing.kind as PayoutKindValue,
              periodYm: existing.periodYm,
              userId: existing.userId,
              assignmentId: existing.assignmentId,
              quoteId: existing.quoteId,
              payeeName: existing.payeeName,
              amount: existing.amount,
              breakdown: parseStaffBreakdown(existing.breakdown),
            }
          : null;

    if (!template) {
      const known =
        parseStaffMonthSourceKey(sourceKey) ||
        parseFreelancerSourceKey(sourceKey);
      results.push({
        sourceKey,
        ok: false,
        error: known ? "Начисление не найдено" : "Некорректный ключ выплаты",
      });
      continue;
    }

    const paidAt = opts.paid ? now : null;
    const paidById = opts.paid ? opts.actorId : null;
    const breakdown = template.breakdown ?? undefined;
    const row = await prisma.payout.upsert({
      where: { sourceKey },
      create: {
        sourceKey,
        kind: template.kind,
        periodYm: template.periodYm,
        userId: template.userId,
        assignmentId: template.assignmentId,
        quoteId: template.quoteId,
        payeeName: template.payeeName,
        amount: template.amount,
        breakdown: breakdown ?? undefined,
        paid: opts.paid,
        paidAt,
        paidById,
      },
      update: {
        kind: template.kind,
        periodYm: template.periodYm,
        userId: template.userId,
        assignmentId: template.assignmentId,
        quoteId: template.quoteId,
        payeeName: template.payeeName,
        amount: opts.paid ? template.amount : existing?.amount ?? template.amount,
        breakdown: breakdown ?? undefined,
        paid: opts.paid,
        paidAt,
        paidById,
      },
    });
    results.push({
      sourceKey,
      ok: true,
      id: row.id,
      paid: row.paid,
    });
  }

  return results;
}
