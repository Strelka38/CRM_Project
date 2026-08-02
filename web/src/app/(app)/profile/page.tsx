import { EmployeeEditor } from "@/components/EmployeeEditor";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return (
    <EmployeeEditor
      userId={session.user.id}
      selfView
      isManager={session.user.role === "MANAGER"}
    />
  );
}
