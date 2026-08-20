import type { CatalogOwner } from "@prisma/client";

export const legalEntityInclude = {
  bankAccounts: { orderBy: { sortOrder: "asc" as const } },
};

export type LegalEntityAccountBody = {
  id?: string;
  label?: string;
  bankName?: string;
  account: string;
  corrAccount?: string;
  bik?: string;
  isDefault?: boolean;
  sortOrder?: number;
};

export function digitsAccount(value: string): string {
  return value.replace(/\D/g, "");
}

export function catalogOwnerOrNull(
  v: unknown,
): CatalogOwner | null {
  if (v === null || v === "" || v === undefined) return null;
  if (v === "SHOW_MASTER" || v === "DIAKOM" || v === "NE_EVENT") return v;
  return null;
}
