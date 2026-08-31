import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { calcAssignmentPay } from "@/lib/payroll";

const STATS_LIFECYCLES = new Set(["CONFIRMED", "COMPLETED"]);

export function normalizeFreelancerName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function freelancerNameKey(raw: string): string {
  return normalizeFreelancerName(raw).toLowerCase();
}

export function freelancerNamesMatch(a: string, b: string): boolean {
  const ka = freelancerNameKey(a);
  return Boolean(ka) && ka === freelancerNameKey(b);
}

/** Ставка фрилансера — override / 0; плюс монтажные по факту. */
export function freelancerAssignmentPay(a: {
  payMode: "SHIFT" | "HOURLY" | string;
  hours?: number | null;
  rateOverride?: number | null;
  bonus?: number | null;
  montageAmount?: number | null;
}): number {
  const pay = calcAssignmentPay({
    payMode: a.payMode === "HOURLY" ? "HOURLY" : "SHIFT",
    hours: a.hours,
    rateOverride: a.rateOverride,
    hourlyRate: 0,
    shiftRate: 0,
    bonus: a.bonus,
  });
  return Math.round(pay + Math.max(0, Number(a.montageAmount) || 0));
}

export function quoteCountsForFreelancerStats(lifecycle: string): boolean {
  return STATS_LIFECYCLES.has(lifecycle);
}

type FreelancerDb = Pick<PrismaClient, "freelancer">;

export async function findFreelancerByName(
  db: FreelancerDb,
  raw: string,
) {
  const name = normalizeFreelancerName(raw);
  if (!name) return null;
  return db.freelancer.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
}

/** Создаёт карточку, если ФИО ещё нет в справочнике. Пустое имя — no-op. */
export async function ensureFreelancerByName(
  raw: string,
  db: FreelancerDb = prisma,
) {
  const name = normalizeFreelancerName(raw);
  if (!name) return null;
  const existing = await findFreelancerByName(db, name);
  if (existing) return existing;
  try {
    return await db.freelancer.create({ data: { name } });
  } catch {
    return findFreelancerByName(db, name);
  }
}

export type FreelancerPayAgg = {
  assignmentCount: number;
  eventCount: number;
  totalPay: number;
  paidPay: number;
};

export function emptyFreelancerPayAgg(): FreelancerPayAgg {
  return { assignmentCount: 0, eventCount: 0, totalPay: 0, paidPay: 0 };
}

export function accumulateFreelancerPay(
  map: Map<string, FreelancerPayAgg & { quoteIds: Set<string> }>,
  name: string,
  input: {
    quoteId: string;
    lifecycle: string;
    paid: boolean;
    pay: number;
  },
) {
  const key = freelancerNameKey(name);
  if (!key) return;
  let row = map.get(key);
  if (!row) {
    row = { ...emptyFreelancerPayAgg(), quoteIds: new Set() };
    map.set(key, row);
  }
  row.assignmentCount += 1;
  row.quoteIds.add(input.quoteId);
  row.eventCount = row.quoteIds.size;
  if (!quoteCountsForFreelancerStats(input.lifecycle)) return;
  row.totalPay += input.pay;
  if (input.paid) row.paidPay += input.pay;
}
