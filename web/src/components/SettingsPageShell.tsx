export function SettingsPageShell({
  title,
  lede,
  children,
}: {
  title: string;
  lede: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
      <header className="mb-6 border-b border-[var(--line)] pb-4">
        <h1 className="font-display text-2xl">{title}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{lede}</p>
      </header>
      {children}
    </div>
  );
}
