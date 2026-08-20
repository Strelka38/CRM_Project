"use client";

export type CalcTabId = "estimate" | "staff" | "stats";

const TABS: Array<{ id: CalcTabId; label: string }> = [
  { id: "estimate", label: "Смета" },
  { id: "staff", label: "Сотрудники" },
  { id: "stats", label: "Доходы" },
];

export function CalcTabs({
  active,
  onSelect,
}: {
  active: CalcTabId;
  onSelect: (id: CalcTabId) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-1 overflow-visible border-b border-[var(--line)]">
      {TABS.map((tab) => {
        const selected = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className={`rounded-t-md border border-b-0 px-3 py-1.5 text-sm ${
              selected
                ? "border-[var(--line)] bg-[var(--panel)] font-medium text-[var(--ink)]"
                : "border-transparent bg-transparent text-[var(--muted)] hover:bg-[var(--panel-muted)]"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
