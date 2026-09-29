import { redirect } from "next/navigation";
import { RoleAccessTree } from "@/components/RoleAccessTree";
import { isAdmin } from "@/lib/roles";
import { requireSession } from "@/lib/session";

export default async function RoleAccessPage() {
  const session = await requireSession();
  if (!isAdmin(session.user.role)) redirect("/calendar");
  return <RoleAccessTree initialOverrides={session.permissions} />;
}
