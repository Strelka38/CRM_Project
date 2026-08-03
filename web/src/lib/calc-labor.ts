import {
  allocateByRevenueShare,
  allocateLaborByEmployeeOwners,
  CATALOG_OWNERS,
  splitAmongOwners,
  type CatalogOwnerValue,
} from "@/lib/catalog-owner";
import {
  calcAssignmentBasePay,
  calcAssignmentPay,
} from "@/lib/payroll";
import {
  assignmentDisplayName,
  assignmentOwners,
  assignmentRates,
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
      userName: assignmentDisplayName(a),
      specialtyId: a.specialtyId,
      specialtyName: a.specialty?.name ?? "",
      payMode: a.payMode,
      hours: a.hours,
      owners,
      isFreelancer: Boolean(a.isFreelancer) || !a.userId,
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
  const byCompany: Record<CatalogOwnerValue, number> = {
    SHOW_MASTER: 0,
    DIAKOM: 0,
    NE_EVENT: 0,
  };
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

export function buildLaborAndMontageBreakdown(input: {
  assignments: AssignmentLike[];
  revenueByCompany: Partial<Record<CatalogOwnerValue, number>>;
  expensesByCompany: Partial<Record<CatalogOwnerValue, number>>;
}) {
  const assignmentRows = buildAssignmentLaborRows(input.assignments);
  const laborAlloc = allocateLaborByEmployeeOwners(
    assignmentRows.map((a) => ({ pay: a.pay, owners: a.owners })),
  );
  const untaggedLabor = allocateByRevenueShare(
    laborAlloc.untagged,
    input.revenueByCompany,
  );

  const montageAlloc = allocateByEmployeeOwners(
    assignmentRows.map((a) => ({
      amount: a.montageAmount,
      owners: a.owners,
    })),
  );
  const untaggedMontage = allocateByRevenueShare(
    montageAlloc.untagged,
    input.revenueByCompany,
  );

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
    if (revenue <= 0 && expenses <= 0 && laborCost <= 0 && montageCost <= 0) {
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
    net: number;
  }>;

  return {
    assignmentRows,
    laborTotal: Math.round(laborAlloc.total),
    montageTotal: Math.round(montageAlloc.total),
    breakdown,
    netTotal: breakdown.reduce((s, b) => s + b.net, 0),
  };
}
