import { EmployeeEditor } from "@/components/EmployeeEditor";
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
      canEditAgency={session.user.role === "MANAGER"}
    />
  );
}
