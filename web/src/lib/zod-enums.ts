import { z } from "zod";
import {
  CATALOG_OWNER_VALUES,
  type CatalogOwnerValue,
} from "@/lib/catalog-owner";
import { APP_ROLES } from "@/lib/roles";
import { LIFECYCLE_STATUSES } from "@/lib/lifecycle";

export const catalogOwnerZod = z.enum(CATALOG_OWNER_VALUES);
export const appRoleZod = z.enum(APP_ROLES);
export const quoteLifecycleZod = z.enum(LIFECYCLE_STATUSES);

export function catalogOwnerAmountsZod() {
  return z.object(
    Object.fromEntries(
      CATALOG_OWNER_VALUES.map((v) => [v, z.number().min(0)]),
    ) as Record<CatalogOwnerValue, z.ZodNumber>,
  );
}
