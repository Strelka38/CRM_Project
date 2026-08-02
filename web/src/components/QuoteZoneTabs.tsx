"use client";

export type ZoneTab = {
  id: string;
  name: string;
  sortOrder: number;
};

type Props = {
  zones: ZoneTab[];
  activeId: string; // zone id or "summary"
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  canEdit?: boolean;
};

export function QuoteZoneTabs({
  zones,
  activeId,
  onSelect,
  onAdd,
  onRename,
  onDelete,
  canEdit = true,
}: Props) {
  return (
    <div className="flex flex-wrap items-end gap-1 border-b border-[var(--line)]">
      {zones.map((z) => {
        const active = activeId === z.id;
        return (
          <div
            key={z.id}
            className={`group relative flex items-center gap-1 rounded-t-md border border-b-0 px-2 py-1.5 text-sm ${
              active
                ? "border-[var(--line)] bg-[var(--panel)] font-medium text-[var(--ink)]"
                : "border-transparent bg-transparent text-[var(--muted)] hover:bg-[var(--panel-muted)]"
            }`}
          >
            <button
              type="button"
              className="max-w-[10rem] truncate"
              onClick={() => onSelect(z.id)}
              title={z.name}
            >
              {z.name}
            </button>
            {canEdit && (
              <details className="relative">
                <summary className="list-none cursor-pointer px-1 text-[var(--muted)] marker:content-none [&::-webkit-details-marker]:hidden">
                  ⋯
                </summary>
                <div className="absolute left-0 top-full z-20 mt-1 w-40 rounded-md border border-[var(--line)] bg-[var(--panel)] py-1 shadow-lg">
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--selected)]/50"
                    onClick={() => {
                      const name = prompt("Название зоны", z.name);
                      if (name && name.trim()) onRename(z.id, name.trim());
                    }}
                  >
                    Переименовать
                  </button>
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-xs text-[var(--danger)] hover:bg-red-500/15 disabled:opacity-40"
                    disabled={zones.length <= 1}
                    onClick={() => onDelete(z.id)}
                  >
                    Удалить
                  </button>
                </div>
              </details>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => onSelect("summary")}
        className={`rounded-t-md border border-b-0 px-3 py-1.5 text-sm ${
          activeId === "summary"
            ? "border-[var(--line)] bg-[var(--panel)] font-medium"
            : "border-transparent text-[var(--muted)] hover:bg-[var(--panel-muted)]"
        }`}
      >
        Сводная
      </button>

      {canEdit && (
        <button
          type="button"
          onClick={onAdd}
          className="mb-0.5 ml-1 flex size-7 items-center justify-center rounded-md border border-[var(--line)] text-sm text-[var(--accent)] hover:bg-white/10"
          title="Добавить зону"
        >
          +
        </button>
      )}
    </div>
  );
}
