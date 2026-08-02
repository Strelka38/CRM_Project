"use client";

import {
  CATALOG_OWNERS,
  normalizeOwners,
  type CatalogOwnerValue,
} from "@/lib/catalog-owner";

type Props = {
  value: CatalogOwnerValue[];
  onChange: (owners: CatalogOwnerValue[]) => void;
  compact?: boolean;
  label?: string;
};

export function OwnerTagsPicker({
  value,
  onChange,
  compact = false,
  label = "Чья?",
}: Props) {
  const selected = normalizeOwners(value);

  function toggle(owner: CatalogOwnerValue) {
    if (selected.includes(owner)) {
      onChange(selected.filter((v) => v !== owner));
      return;
    }
    if (selected.length >= 3) return;
    onChange([...selected, owner]);
  }

  return (
    <div>
      {label ? (
        <span
          className={`mb-1 block uppercase text-[var(--muted)] ${
            compact ? "text-[10px]" : "text-[10px]"
          }`}
        >
          {label}
        </span>
      ) : null}
      <div className={`flex flex-wrap gap-1 ${compact ? "" : "gap-1.5"}`}>
        {CATALOG_OWNERS.map((o) => {
          const active = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              title={o.label}
              onClick={() => toggle(o.value)}
              className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide transition-colors ${
                active
                  ? "border-[var(--solid)] bg-[var(--solid)] text-[var(--on-solid)]"
                  : "border-[var(--line)] bg-[var(--panel)] text-[var(--ink)] hover:bg-white/10"
              }`}
            >
              {o.short}
            </button>
          );
        })}
      </div>
    </div>
  );
}
