import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppChrome } from "@/components/AppChrome";
import { PermissionProvider } from "@/components/PermissionProvider";
import { auth, signOut } from "@/lib/auth";
import {
  allowedNavHrefs,
  navPathBlocked,
} from "@/lib/permission-tree";
import { getRolePermissionOverrides } from "@/lib/role-permissions";
import { canBackupDatabase, isManager, roleLabelRu } from "@/lib/roles";
import { prisma } from "@/lib/db";

async function logout() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  let role = session?.user?.role;
  let payoutsAccess = false;
  if (session?.user?.id) {
    try {
      const dbUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true, canAccessPayments: true },
      });
      if (dbUser) {
        role = dbUser.role;
        payoutsAccess = dbUser.canAccessPayments;
      }
    } catch {
      const dbUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true },
      });
      if (dbUser) role = dbUser.role;
    }
  }

  const overrides = await getRolePermissionOverrides();
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (
    pathname &&
    !pathname.startsWith("/calendar") &&
    navPathBlocked(pathname, role, overrides, { payoutsAccess })
  ) {
    redirect("/calendar");
  }

  const manager = isManager(role);
  const showBackup = canBackupDatabase(role, overrides);
  const allowedHrefs = allowedNavHrefs(role, overrides, { payoutsAccess });

  return (
    <PermissionProvider role={role} overrides={overrides}>
      <AppChrome
        userName={session?.user?.name ?? null}
        roleLabel={roleLabelRu(role)}
        manager={manager}
        showBackup={showBackup}
        payoutsAccess={payoutsAccess}
        allowedHrefs={allowedHrefs}
        logoutAction={logout}
      >
        {children}
      </AppChrome>
    </PermissionProvider>
  );
}
