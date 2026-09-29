import { cache } from "react";
import { prisma } from "./db";
import {
  compactPermissionOverrides,
  parsePermissionOverrides,
  type RolePermissionOverrides,
} from "./permission-tree";

export const ROLE_PERMISSIONS_KEY = "rolePermissions";

export const getRolePermissionOverrides = cache(
  async (): Promise<RolePermissionOverrides> => {
    try {
      const row = await prisma.appSetting.findUnique({
        where: { key: ROLE_PERMISSIONS_KEY },
      });
      if (!row?.value) return {};
      return parsePermissionOverrides(JSON.parse(row.value) as unknown);
    } catch {
      return {};
    }
  },
);

export async function saveRolePermissionOverrides(
  input: RolePermissionOverrides,
): Promise<RolePermissionOverrides> {
  const compact = compactPermissionOverrides(input);
  await prisma.appSetting.upsert({
    where: { key: ROLE_PERMISSIONS_KEY },
    create: { key: ROLE_PERMISSIONS_KEY, value: JSON.stringify(compact) },
    update: { value: JSON.stringify(compact) },
  });
  return compact;
}
