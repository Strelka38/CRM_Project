import { DatabaseBackupAdmin } from "@/components/DatabaseBackupAdmin";
import { auth } from "@/lib/auth";
import { isCrmOwner } from "@/lib/roles";
import { getFirstCrmUserId } from "@/lib/session";

export default async function BackupPage() {
  const session = await auth();
  const firstId = await getFirstCrmUserId();
  if (!isCrmOwner(session?.user?.id, firstId)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
            CRM
          </p>
          <h1 className="mt-1 text-3xl font-light tracking-tight">Нет доступа</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Экспорт и импорт базы доступны только первому пользователю CRM.
          </p>
        </header>
      </div>
    );
  }

  return <DatabaseBackupAdmin />;
}
