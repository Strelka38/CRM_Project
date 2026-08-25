import type { CatalogOwnerValue } from "@/lib/catalog-owner";
import { calcAssignmentPay } from "@/lib/payroll";

export type AssignmentUserLike = {
  id?: string;
  name?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  owners?: CatalogOwnerValue[] | string[];
  specialties?: Array<{
    specialtyId: string;
    hourlyRate: number;
    shiftRate: number;
  }>;
} | null;

export type AssignmentKindValue = "EVENT" | "MOUNT";

export type AssignmentLike = {
  id: string;
  quoteId?: string;
  userId?: string | null;
  specialtyId: string;
  kind?: AssignmentKindValue | string | null;
  payMode: "SHIFT" | "HOURLY";
  hours: number | null;
  rateOverride: number | null;
  bonus?: number | null;
  montageAmount?: number | null;
  isFreelancer?: boolean;
  freelancerName?: string | null;
  owners?: CatalogOwnerValue[] | string[] | null;
  specialty?: { id: string; name: string } | null;
  zoneId?: string | null;
  zone?: { id: string; name: string } | null;
  dayIndex?: number | null;
  onMount?: boolean | null;
  onDemount?: boolean | null;
  user?: AssignmentUserLike;
};

/** Монтажник по умолчанию и на монтаже, и на демонтаже. */
export function mountDutyFlags(a: {
  onMount?: boolean | null;
  onDemount?: boolean | null;
}): { onMount: boolean; onDemount: boolean } {
  const onMount = a.onMount !== false;
  const onDemount = a.onDemount !== false;
  if (!onMount && !onDemount) return { onMount: true, onDemount: true };
  return { onMount, onDemount };
}

export function assignmentKind(
  a: { kind?: AssignmentKindValue | string | null },
): AssignmentKindValue {
  return String(a.kind || "").toUpperCase() === "MOUNT" ? "MOUNT" : "EVENT";
}

export function isFreelancerAssignment(a: {
  isFreelancer?: boolean | null;
  userId?: string | null;
}): boolean {
  return Boolean(a.isFreelancer);
}

/** Слот из сметы без ФИО (не фрилансер). */
export function isVacantAssignment(a: {
  isFreelancer?: boolean | null;
  userId?: string | null;
}): boolean {
  return !a.userId && !a.isFreelancer;
}

export function assignmentDisplayName(a: AssignmentLike): string {
  if (isVacantAssignment(a)) return "";
  if (isFreelancerAssignment(a) || !a.userId) {
    const name = (a.freelancerName || "").trim();
    return name || "Фрилансер";
  }
  const u = a.user;
  if (!u) return "Сотрудник";
  const full = [u.lastName, u.firstName].filter(Boolean).join(" ").trim();
  return full || u.name || "Сотрудник";
}

/** Firm tags for labor allocation. */
export function assignmentOwners(a: AssignmentLike): CatalogOwnerValue[] {
  if (isFreelancerAssignment(a)) {
    return (a.owners || []) as CatalogOwnerValue[];
  }
  return (a.user?.owners || []) as CatalogOwnerValue[];
}

export function assignmentRates(
  a: AssignmentLike,
): { hourlyRate: number; shiftRate: number } {
  if (isFreelancerAssignment(a)) {
    return { hourlyRate: 0, shiftRate: 0 };
  }
  const rates = a.user?.specialties?.find(
    (s) => s.specialtyId === a.specialtyId,
  );
  return {
    hourlyRate: rates?.hourlyRate ?? 0,
    shiftRate: rates?.shiftRate ?? 0,
  };
}

export function serializeAssignmentPay(a: AssignmentLike) {
  const rates = assignmentRates(a);
  const bonus = Math.max(0, Number(a.bonus) || 0);
  const pay = calcAssignmentPay({
    payMode: a.payMode,
    hours: a.hours,
    rateOverride: a.rateOverride,
    hourlyRate: rates.hourlyRate,
    shiftRate: rates.shiftRate,
    bonus,
  });
  const owners = assignmentOwners(a);
  const name = assignmentDisplayName(a);
  return {
    id: a.id,
    quoteId: a.quoteId,
    userId: a.userId ?? null,
    specialtyId: a.specialtyId,
    kind: assignmentKind(a),
    payMode: a.payMode,
    hours: a.hours,
    rateOverride: a.rateOverride,
    bonus,
    montageAmount: Math.max(0, Number(a.montageAmount) || 0),
    isFreelancer: Boolean(a.isFreelancer),
    freelancerName: a.freelancerName || "",
    owners,
    hourlyRate: rates.hourlyRate,
    shiftRate: rates.shiftRate,
    pay,
    user: isFreelancerAssignment(a) || isVacantAssignment(a)
      ? {
          id: "",
          name: name || (isVacantAssignment(a) ? "" : "Фрилансер"),
          email: "",
          firstName: "",
          lastName: "",
          owners,
        }
      : a.user
        ? {
            id: a.user.id || "",
            name: a.user.name || name,
            email: a.user.email || "",
            firstName: a.user.firstName || "",
            lastName: a.user.lastName || "",
            owners: (a.user.owners || []) as CatalogOwnerValue[],
          }
        : {
            id: "",
            name,
            email: "",
            firstName: "",
            lastName: "",
            owners,
          },
    specialty: a.specialty || { id: a.specialtyId, name: "" },
    zoneId: a.zoneId ?? a.zone?.id ?? null,
    zone: a.zone ?? null,
    dayIndex: a.dayIndex ?? null,
    ...mountDutyFlags(a),
  };
}
