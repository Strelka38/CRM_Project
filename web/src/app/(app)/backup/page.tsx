import { DatabaseBackupAdmin } from "@/components/DatabaseBackupAdmin";
import { canBackupDatabase } from "@/lib/roles";
import { requireSession } from "@/lib/session";

export default async function BackupPage() {
  const session = await requireSession();
  if (!canBackupDatabase(session.user.role)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
            CRM
          </p>
          <h1 className="mt-1 text-3xl font-light tracking-tight">Нет доступа</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Экспорт и импорт базы доступны только администратору.
          </p>
        </header>
      </div>
    );
  }

  return <DatabaseBackupAdmin />;
}
