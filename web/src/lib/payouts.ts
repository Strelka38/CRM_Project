import {
  shiftYearMonth,
  toYearMonthParam,
  type YearMonth,
} from "@/lib/period";

export type PayoutKindValue = "STAFF_MONTH" | "FREELANCER_EVENT";

export const STAFF_MONTH_LOOKBACK = 24;

export function staffMonthSourceKey(userId: string, periodYm: string) {
  return `staff:${userId}:${periodYm}`;
}

export function freelancerAssignmentSourceKey(assignmentId: string) {
  return `freelancer:${assignmentId}`;
}

export function parseStaffMonthSourceKey(
  key: string,
): { userId: string; periodYm: string } | null {
  const m = /^staff:([^:]+):(\d{4}-\d{2})$/.exec(key);
  if (!m) return null;
  return { userId: m[1], periodYm: m[2] };
}

export function parseFreelancerSourceKey(
  key: string,
): { assignmentId: string } | null {
  const m = /^freelancer:(.+)$/.exec(key);
  if (!m) return null;
  return { assignmentId: m[1] };
}

export function previousYearMonth(now = new Date()): YearMonth {
  return shiftYearMonth(
    { year: now.getFullYear(), month: now.getMonth() },
    -1,
  );
}

/** Completed months newest-first, excluding the current month. */
export function completedMonthsBack(
  count = STAFF_MONTH_LOOKBACK,
  now = new Date(),
): YearMonth[] {
  const prev = previousYearMonth(now);
  const months: YearMonth[] = [];
  for (let i = 0; i < count; i++) {
    months.push(shiftYearMonth(prev, -i));
  }
  return months;
}

export function dateToYearMonth(d: Date): YearMonth {
  return { year: d.getFullYear(), month: d.getMonth() };
}

export function dateToYmParam(d: Date): string {
  return toYearMonthParam(dateToYearMonth(d));
}

/** True if the user already existed before the month ended. */
export function userExistedInMonth(createdAt: Date, ym: YearMonth): boolean {
  const monthEnd = new Date(ym.year, ym.month + 1, 1);
  return createdAt.getTime() < monthEnd.getTime();
}

export type StaffMonthBreakdown = {
  monthlySalary: number;
  assignmentPay: number;
  montage: number;
  agency: number;
};

export function emptyStaffBreakdown(): StaffMonthBreakdown {
  return {
    monthlySalary: 0,
    assignmentPay: 0,
    montage: 0,
    agency: 0,
  };
}

export function staffMonthAmount(b: StaffMonthBreakdown): number {
  return (
    Math.max(0, Number(b.monthlySalary) || 0) +
    Math.max(0, Number(b.assignmentPay) || 0) +
    Math.max(0, Number(b.montage) || 0) +
    Math.max(0, Number(b.agency) || 0)
  );
}

export function parseStaffBreakdown(value: unknown): StaffMonthBreakdown | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  return {
    monthlySalary: Math.max(0, Number(rec.monthlySalary) || 0),
    assignmentPay: Math.max(0, Number(rec.assignmentPay) || 0),
    montage: Math.max(0, Number(rec.montage) || 0),
    agency: Math.max(0, Number(rec.agency) || 0),
  };
}

export type LivePayable = {
  sourceKey: string;
  kind: PayoutKindValue;
  periodYm: string;
  payeeName: string;
  userId: string | null;
  assignmentId: string | null;
  quoteId: string | null;
  quoteName: string;
  quoteDate: string;
  specialtyName: string;
  amount: number;
  breakdown: StaffMonthBreakdown | null;
};

export type PayoutMark = {
  id: string;
  sourceKey: string;
  kind: PayoutKindValue;
  periodYm: string;
  payeeName: string;
  userId: string | null;
  assignmentId: string | null;
  quoteId: string | null;
  amount: number;
  breakdown: StaffMonthBreakdown | null;
  paid: boolean;
  paidAt: string | null;
  paidByName: string | null;
};

export function mergePayouts(live: LivePayable[], marks: PayoutMark[]) {
  const markByKey = new Map(marks.map((m) => [m.sourceKey, m]));
  const liveByKey = new Map(live.map((row) => [row.sourceKey, row]));

  const history: Array<
    PayoutMark & {
      liveAmount: number | null;
      quoteName: string;
      quoteDate: string;
      specialtyName: string;
    }
  > = [];
  for (const mark of marks) {
    if (!mark.paid) continue;
    const row = liveByKey.get(mark.sourceKey);
    history.push({
      ...mark,
      liveAmount: row?.amount ?? null,
      quoteName: row?.quoteName ?? "",
      quoteDate: row?.quoteDate ?? "",
      specialtyName: row?.specialtyName ?? "",
    });
  }

  const queue: Array<LivePayable & { paid: false; payoutId: string | null }> =
    [];
  for (const row of live) {
    const mark = markByKey.get(row.sourceKey);
    if (mark?.paid) continue;
    if (row.amount <= 0) continue;
    queue.push({ ...row, paid: false, payoutId: mark?.id ?? null });
  }

  queue.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "STAFF_MONTH" ? -1 : 1;
    if (a.periodYm !== b.periodYm) return a.periodYm > b.periodYm ? -1 : 1;
    return a.payeeName.localeCompare(b.payeeName, "ru");
  });

  history.sort((a, b) => {
    const at = a.paidAt || "";
    const bt = b.paidAt || "";
    if (at !== bt) return bt.localeCompare(at);
    return a.payeeName.localeCompare(b.payeeName, "ru");
  });

  return { queue, history };
}

export function staffDisplayName(u: {
  lastName?: string | null;
  firstName?: string | null;
  patronymic?: string | null;
  name?: string | null;
}): string {
  const fio = [u.lastName, u.firstName, u.patronymic]
    .map((x) => (x || "").trim())
    .filter(Boolean)
    .join(" ");
  return fio || (u.name || "").trim() || "Сотрудник";
}
