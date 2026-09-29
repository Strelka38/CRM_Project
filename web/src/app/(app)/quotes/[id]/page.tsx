import { redirect } from "next/navigation";
import { QuoteEditor } from "@/components/QuoteEditor";
import { auth } from "@/lib/auth";
import { getRolePermissionOverrides } from "@/lib/role-permissions";
import {
  canEditBrief,
  canEditQuoteSchedule,
  canEditSpec,
  canManageEventAttachments,
  canViewQuote,
  isManager,
} from "@/lib/roles";

export default async function QuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ zone?: string; tab?: string; imported?: string }>;
}) {
  const { id } = await params;
  const { zone, tab, imported } = await searchParams;
  const session = await auth();
  const role = session?.user?.role;
  const overrides = await getRolePermissionOverrides();
  const manager = isManager(role);
  if (
    !canEditSpec(role, overrides) &&
    !canEditBrief(role, overrides) &&
    !canEditQuoteSchedule(role, overrides)
  ) {
    redirect(`/quotes/${id}/spec`);
  }
  const importedUnmatched = Number(imported);
  return (
    <QuoteEditor
      quoteId={id}
      isManager={manager}
      canEditSpec={canEditSpec(role, overrides)}
      canEditBrief={canEditBrief(role, overrides)}
      canEditSchedule={canEditQuoteSchedule(role, overrides)}
      canViewQuote={canViewQuote(role, overrides)}
      canManageAttachments={canManageEventAttachments(role, overrides)}
      initialZone={zone || null}
      initialPane={tab || null}
      importUnmatched={
        Number.isFinite(importedUnmatched) && importedUnmatched > 0
          ? importedUnmatched
          : null
      }
    />
  );
}
