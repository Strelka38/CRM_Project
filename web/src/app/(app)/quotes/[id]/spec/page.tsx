import { SpecEditor } from "@/components/SpecEditor";
import { auth } from "@/lib/auth";

export default async function SpecPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const isManager = session?.user?.role === "MANAGER";
  return <SpecEditor quoteId={id} isManager={isManager} />;
}
