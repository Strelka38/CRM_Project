import { redirect } from "next/navigation";
import { QuoteEditor } from "@/components/QuoteEditor";
import { auth } from "@/lib/auth";
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
  searchParams: Promise<{ zone?: string; tab?: string }>;
}) {
  const { id } = await params;
  const { zone, tab } = await searchParams;
  const session = await auth();
  const role = session?.user?.role;
  const manager = isManager(role);
  if (!canEditSpec(role) && !canEditBrief(role) && !canEditQuoteSchedule(role)) {
    redirect(`/quotes/${id}/spec`);
  }
  return (
    <QuoteEditor
      quoteId={id}
      isManager={manager}
      canEditSpec={canEditSpec(role)}
      canEditBrief={canEditBrief(role)}
      canEditSchedule={canEditQuoteSchedule(role)}
      canViewQuote={canViewQuote(role)}
      canManageAttachments={canManageEventAttachments(role)}
      initialZone={zone || null}
      initialPane={tab || null}
    />
  );
}
