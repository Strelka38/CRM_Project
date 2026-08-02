import type { PayMode } from "@prisma/client";

export type AssignmentPayInput = {
  payMode: PayMode | "SHIFT" | "HOURLY";
  hours?: number | null;
  rateOverride?: number | null;
  hourlyRate: number;
  shiftRate: number;
  /** Премиальные за мероприятие */
  bonus?: number | null;
};

/** Base pay for one specialty assignment (ставка смены / часовка / override). */
export function calcAssignmentBasePay(a: AssignmentPayInput): number {
  if (a.rateOverride != null && !Number.isNaN(Number(a.rateOverride))) {
    return Math.max(0, Number(a.rateOverride));
  }
  if (a.payMode === "HOURLY") {
    const hours = Math.max(0, Number(a.hours) || 0);
    return hours * Math.max(0, Number(a.hourlyRate) || 0);
  }
  return Math.max(0, Number(a.shiftRate) || 0);
}

/** Pay including премиальные. */
export function calcAssignmentPay(a: AssignmentPayInput): number {
  return (
    calcAssignmentBasePay(a) + Math.max(0, Number(a.bonus) || 0)
  );
}
