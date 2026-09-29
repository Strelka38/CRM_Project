"use client";

import { createContext, useContext, useMemo } from "react";
import {
  roleHasPermission,
  type PermissionId,
  type RolePermissionOverrides,
} from "@/lib/permission-tree";

type PermissionContextValue = {
  role: string | null;
  overrides: RolePermissionOverrides;
  can: (id: PermissionId) => boolean;
};

const PermissionContext = createContext<PermissionContextValue>({
  role: null,
  overrides: {},
  can: () => false,
});

export function PermissionProvider({
  role,
  overrides,
  children,
}: {
  role: string | null | undefined;
  overrides: RolePermissionOverrides;
  children: React.ReactNode;
}) {
  const value = useMemo<PermissionContextValue>(() => {
    const resolvedRole = role ?? null;
    return {
      role: resolvedRole,
      overrides,
      can: (id) => roleHasPermission(resolvedRole, id, overrides),
    };
  }, [role, overrides]);

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionContext);
}

export function usePermission(id: PermissionId) {
  return useContext(PermissionContext).can(id);
}
