"use client";

export type CategoryOption = {
  id: string;
  path: string;
  name: string;
};

type Props = {
  categories: CategoryOption[];
  value: string;
  onChange: (categoryId: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  label?: string;
  className?: string;
};

export function CategorySelect({
  categories,
  value,
  onChange,
  allowEmpty = false,
  emptyLabel = "Без раздела",
  label = "Раздел",
  className = "",
}: Props) {
  const sorted = [...categories].sort((a, b) =>
    a.path.localeCompare(b.path, "ru"),
  );

  return (
    <label className={`block ${className}`}>
      {label && (
        <span className="mb-1 block text-[10px] uppercase text-[var(--muted)]">
          {label}
        </span>
      )}
      <select
        className="field w-full text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {allowEmpty && <option value="">{emptyLabel}</option>}
        {sorted.map((c) => (
          <option key={c.id} value={c.id}>
            {c.path}
          </option>
        ))}
      </select>
    </label>
  );
}
