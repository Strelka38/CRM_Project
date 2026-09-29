import { redirect } from "next/navigation";
import { SpecEditor } from "@/components/SpecEditor";
import { auth } from "@/lib/auth";
import { getRolePermissionOverrides } from "@/lib/role-permissions";
import { canEditSpec, isManager } from "@/lib/roles";

export default async function SpecPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ zone?: string }>;
}) {
  const { id } = await params;
  const { zone } = await searchParams;
  const session = await auth();
  const role = session?.user?.role;
  const overrides = await getRolePermissionOverrides();
  if (canEditSpec(role, overrides)) {
    const q = new URLSearchParams();
    q.set("tab", "spec");
    if (zone) q.set("zone", zone);
    redirect(`/quotes/${id}?${q.toString()}`);
  }
  return (
    <SpecEditor
      quoteId={id}
      isManager={isManager(role)}
      returnZone={zone || null}
    />
  );
}
