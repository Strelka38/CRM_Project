import {
  allocateByRevenueShare,
  allocateLaborByEmployeeOwners,
  CATALOG_OWNERS,
  emptyOwnerAmounts,
  splitAmongOwners,
  type CatalogOwnerValue,
} from "@/lib/catalog-owner";
import {
  calcAssignmentBasePay,
  calcAssignmentPay,
} from "@/lib/payroll";
import type { CalcExpenseInput } from "@/lib/quote-calculation";
import {
  assignmentDisplayName,
  assignmentKind,
  assignmentOwners,
  assignmentRates,
  isFreelancerAssignment,
  type AssignmentLike,
} from "@/lib/quote-assignments";

export function buildAssignmentLaborRows(assignments: AssignmentLike[]) {
  return assignments.map((a) => {
    const rates = assignmentRates(a);
    const basePay = calcAssignmentBasePay({
      payMode: a.payMode,
      hours: a.hours,
      rateOverride: a.rateOverride,
      hourlyRate: rates.hourlyRate,
      shiftRate: rates.shiftRate,
    });
    const bonus = Math.max(0, Number(a.bonus) || 0);
    const montageAmount = Math.max(0, Number(a.montageAmount) || 0);
    const pay = calcAssignmentPay({
      payMode: a.payMode,
      hours: a.hours,
      rateOverride: a.rateOverride,
      hourlyRate: rates.hourlyRate,
      shiftRate: rates.shiftRate,
      bonus,
    });
    const owners = assignmentOwners(a);
    return {
      id: a.id,
      userId: a.userId ?? a.user?.id ?? "",
      userName: assignmentDisplayName(a) || "не назначен",
      specialtyId: a.specialtyId,
      specialtyName: a.specialty?.name ?? "",
      kind: assignmentKind(a),
      payMode: a.payMode,
      hours: a.hours,
      owners,
      isFreelancer: isFreelancerAssignment(a),
      vacant: !a.userId && !isFreelancerAssignment(a),
      basePay: Math.round(basePay),
      bonus: Math.round(bonus),
      montageAmount: Math.round(montageAmount),
      pay: Math.round(pay),
      hourlyRate: rates.hourlyRate,
      shiftRate: rates.shiftRate,
    };
  });
}

/** Allocate amounts to companies by employee firm tags. */
export function allocateByEmployeeOwners(
  items: Array<{ amount: number; owners: CatalogOwnerValue[] | null | undefined }>,
): {
  byCompany: Record<CatalogOwnerValue, number>;
  untagged: number;
  total: number;
} {
  const byCompany = emptyOwnerAmounts();
  let untagged = 0;
  let total = 0;
  for (const item of items) {
    const amount = Math.max(0, Number(item.amount) || 0);
    if (amount <= 0) continue;
    total += amount;
    const split = splitAmongOwners(amount, item.owners);
    const keys = Object.keys(split) as CatalogOwnerValue[];
    if (keys.length === 0) {
      untagged += amount;
      continue;
    }
    for (const k of keys) {
      byCompany[k] += split[k] ?? 0;
    }
  }
  return { byCompany, untagged, total };
}

export function montageActualFromAssignments(assignments: AssignmentLike[]): number {
  const rows = buildAssignmentLaborRows(assignments);
  let actual = 0;
  for (const r of rows) {
    if (r.kind === "MOUNT") {
      actual += r.pay + r.montageAmount;
    } else if (!r.isFreelancer) {
      actual += r.montageAmount;
    }
  }
  return Math.round(actual);
}

export function montageOverage(budget: number, actual: number): number {
  return Math.max(0, Math.round(actual) - Math.round(budget));
}

export function buildLaborAndMontageBreakdown(input: {
  assignments: AssignmentLike[];
  revenueByCompany: Partial<Record<CatalogOwnerValue, number>>;
  expensesByCompany: Partial<Record<CatalogOwnerValue, number>>;
  montageBudget?: number;
}) {
  const assignmentRows = buildAssignmentLaborRows(input.assignments);
  const eventStaff = assignmentRows.filter(
    (a) => !a.isFreelancer && a.kind !== "MOUNT",
  );
  const mountStaff = assignmentRows.filter(
    (a) => !a.isFreelancer && a.kind === "MOUNT",
  );
  const laborAlloc = allocateLaborByEmployeeOwners(
    eventStaff.map((a) => ({ pay: a.pay, owners: a.owners })),
  );
  const untaggedLabor = allocateByRevenueShare(
    laborAlloc.untagged,
    input.revenueByCompany,
  );

  const montageItems = [
    ...eventStaff.map((a) => ({
      amount: a.montageAmount,
      owners: a.owners,
    })),
    ...mountStaff.map((a) => ({
      amount: a.pay + a.montageAmount,
      owners: a.owners,
    })),
    ...assignmentRows
      .filter((a) => a.isFreelancer && a.kind === "MOUNT")
      .map((a) => ({
        amount: a.pay + a.montageAmount,
        owners: a.owners,
      })),
  ];
  const montageAlloc = allocateByEmployeeOwners(montageItems);
  const untaggedMontage = allocateByRevenueShare(
    montageAlloc.untagged,
    input.revenueByCompany,
  );

  const montageBudget = Math.max(0, Math.round(Number(input.montageBudget) || 0));
  const montageActual = montageActualFromAssignments(input.assignments);
  const overage = montageOverage(montageBudget, montageActual);
  const overageByCompany = allocateByRevenueShare(overage, input.revenueByCompany);

  const breakdown = CATALOG_OWNERS.map((c) => {
    const revenue = input.revenueByCompany[c.value] ?? 0;
    const expenses = input.expensesByCompany[c.value] ?? 0;
    const laborCost = Math.round(
      (laborAlloc.byCompany[c.value] ?? 0) + (untaggedLabor[c.value] ?? 0),
    );
    const montageCost = Math.round(
      (montageAlloc.byCompany[c.value] ?? 0) +
        (untaggedMontage[c.value] ?? 0),
    );
    if (
      revenue <= 0 &&
      expenses <= 0 &&
      laborCost <= 0 &&
      montageCost <= 0
    ) {
      return null;
    }
    return {
      company: c.value,
      label: c.label,
      short: c.short,
      revenue,
      expenses,
      laborCost,
      montageCost,
      montageOverage: Math.round(overageByCompany[c.value] ?? 0),
      net: Math.round(revenue - expenses - laborCost - montageCost),
    };
  }).filter(Boolean) as Array<{
    company: CatalogOwnerValue;
    label: string;
    short: string;
    revenue: number;
    expenses: number;
    laborCost: number;
    montageCost: number;
    montageOverage: number;
    net: number;
  }>;

  return {
    assignmentRows,
    laborTotal: Math.round(laborAlloc.total),
    montageTotal: Math.round(montageAlloc.total),
    montageBudget,
    montageActual,
    montageOverage: overage,
    breakdown,
    netTotal: breakdown.reduce((s, b) => s + b.net, 0),
  };
}

/** Фрилансеры EVENT — в расход. MOUNT-фриланс входит в факт монтажа, не дублируем. */
export function buildFreelancerExpenseInputs(
  assignments: AssignmentLike[],
): CalcExpenseInput[] {
  const rows = buildAssignmentLaborRows(assignments).filter(
    (a) => a.isFreelancer && a.kind !== "MOUNT",
  );
  const out: CalcExpenseInput[] = [];
  let sort = 10_000;
  for (const r of rows) {
    if (r.pay > 0) {
      out.push({
        name: `Фриланс: ${r.userName}${
          r.specialtyName ? ` · ${r.specialtyName}` : ""
        }`,
        amount: r.pay,
        owners: r.owners,
        mode: "SHARE",
        sortOrder: sort++,
      });
    }
    if (r.montageAmount > 0) {
      out.push({
        name: `Монтаж (фриланс): ${r.userName}`,
        amount: r.montageAmount,
        owners: r.owners,
        mode: "SHARE",
        sortOrder: sort++,
      });
    }
  }
  return out;
}
