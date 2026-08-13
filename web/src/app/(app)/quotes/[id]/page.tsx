import { redirect } from "next/navigation";
import { QuoteEditor } from "@/components/QuoteEditor";
import { auth } from "@/lib/auth";
import { isManager } from "@/lib/roles";

export default async function QuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const manager = isManager(session?.user?.role);
  if (!manager) {
    redirect(`/quotes/${id}/spec`);
  }
  return <QuoteEditor quoteId={id} isManager />;
}
