import { redirect } from "next/navigation";
import { QuoteEditor } from "@/components/QuoteEditor";
import { auth } from "@/lib/auth";

export default async function QuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const isManager = session?.user?.role === "MANAGER";
  if (!isManager) {
    redirect(`/quotes/${id}/spec`);
  }
  return <QuoteEditor quoteId={id} isManager={isManager} />;
}
