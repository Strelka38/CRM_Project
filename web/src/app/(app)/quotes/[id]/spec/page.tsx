import { SpecEditor } from "@/components/SpecEditor";
import { auth } from "@/lib/auth";
import { isManager } from "@/lib/roles";

export default async function SpecPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const manager = isManager(session?.user?.role);
  return <SpecEditor quoteId={id} isManager={manager} />;
}
