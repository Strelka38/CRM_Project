import { UsersAdmin } from "@/components/UsersAdmin";
import { requireSession } from "@/lib/session";

export default async function UsersPage() {
  const session = await requireSession();
  return <UsersAdmin actorRole={session.user.role} />;
}
