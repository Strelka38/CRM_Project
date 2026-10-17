import { redirect } from "next/navigation";
import { SpecWarehouseSettingsForm } from "@/components/SpecWarehouseSettingsForm";
import { isAdmin } from "@/lib/roles";
import { requireSession } from "@/lib/session";

export default async function WarehouseSettingsPage() {
  const session = await requireSession();
  if (!isAdmin(session.user.role)) redirect("/calendar");
  return <SpecWarehouseSettingsForm />;
}
