import { redirect } from "next/navigation";
import { QuoteEditor } from "@/components/QuoteEditor";
import { auth } from "@/lib/auth";
import { canEditSpec, isManager } from "@/lib/roles";

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
  if (!canEditSpec(role)) {
    redirect(`/quotes/${id}/spec`);
  }
  return (
    <QuoteEditor
      quoteId={id}
      isManager={manager}
      canEditSpec
      initialZone={zone || null}
      initialPane={tab || null}
    />
  );
}
