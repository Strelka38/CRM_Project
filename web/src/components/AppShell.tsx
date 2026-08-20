import { AppChrome } from "@/components/AppChrome";
import { auth, signOut } from "@/lib/auth";
import {
  canAccessDatabase,
  canAccessWorkloadStats,
  canBackupDatabase,
  isManager,
  roleLabelRu,
} from "@/lib/roles";
import { prisma } from "@/lib/db";

async function logout() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  let role = session?.user?.role;
  if (session?.user?.id) {
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });
    if (dbUser) role = dbUser.role;
  }
  const manager = isManager(role);
  const database = canAccessDatabase(role);
  const workloadStats = canAccessWorkloadStats(role);
  const showBackup = canBackupDatabase(role);

  return (
    <AppChrome
      userName={session?.user?.name ?? null}
      roleLabel={roleLabelRu(role)}
      manager={manager}
      database={database}
      workloadStats={workloadStats}
      showBackup={showBackup}
      logoutAction={logout}
    >
      {children}
    </AppChrome>
  );
}
