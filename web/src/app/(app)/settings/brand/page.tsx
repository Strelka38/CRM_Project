import { redirect } from "next/navigation";
import { BrandSettingsForm } from "@/components/BrandSettingsForm";
import { isAdmin } from "@/lib/roles";
import { requireSession } from "@/lib/session";

export default async function BrandSettingsPage() {
  const session = await requireSession();
  if (!isAdmin(session.user.role)) redirect("/calendar");
  return <BrandSettingsForm />;
}
