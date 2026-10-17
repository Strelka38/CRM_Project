import { redirect } from "next/navigation";
import { KpTemplatesSettings } from "@/components/KpTemplatesSettings";
import { isAdmin } from "@/lib/roles";
import { requireSession } from "@/lib/session";

export default async function ProposalSettingsPage() {
  const session = await requireSession();
  if (!isAdmin(session.user.role)) redirect("/calendar");
  return <KpTemplatesSettings />;
}
