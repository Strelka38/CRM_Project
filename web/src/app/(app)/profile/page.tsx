import { EmployeeEditor } from "@/components/EmployeeEditor";
import { auth } from "@/lib/auth";
import { isAdmin, isManager } from "@/lib/roles";
import { redirect } from "next/navigation";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return (
    <EmployeeEditor
      userId={session.user.id}
      selfView
      isManager={isManager(session.user.role)}
      isAdmin={isAdmin(session.user.role)}
      canEditAgency={isManager(session.user.role)}
    />
  );
}
