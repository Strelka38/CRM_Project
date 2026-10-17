import { redirect } from "next/navigation";
import { SystemSettingsForm } from "@/components/SystemSettingsForm";
import { isAdmin } from "@/lib/roles";
import { requireSession } from "@/lib/session";

export default async function SystemSettingsPage() {
  const session = await requireSession();
  if (!isAdmin(session.user.role)) redirect("/calendar");
  return <SystemSettingsForm />;
}
