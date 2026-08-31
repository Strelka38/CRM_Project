import { redirect } from "next/navigation";
import { PayoutsView } from "@/components/PayoutsView";
import { prisma } from "@/lib/db";
import { canAccessDatabase } from "@/lib/roles";
import { requireSession } from "@/lib/session";

export default async function PayoutsPage() {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { canAccessPayments: true, role: true },
  });
  if (!user?.canAccessPayments) redirect("/calendar");
  return <PayoutsView canOpenUsers={canAccessDatabase(user.role)} />;
}
