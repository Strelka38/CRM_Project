import { EmployeeEditor } from "@/components/EmployeeEditor";
import { isAdmin, isManager } from "@/lib/roles";
import { requireSession } from "@/lib/session";

export default async function UserEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  return (
    <EmployeeEditor
      userId={id}
      isManager
      isAdmin={isAdmin(session.user.role)}
      canEditAgency={isManager(session.user.role)}
    />
  );
}
