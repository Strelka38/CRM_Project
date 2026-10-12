"use client";

import {
  CATALOG_OWNERS,
  normalizeOwners,
  type CatalogOwnerValue,
} from "@/lib/catalog-owner";

const CALENDAR_TAG_COLOR: Record<CatalogOwnerValue, string> = {
  SHOW_MASTER: "var(--cal-shm)",
  DIAKOM: "var(--cal-dk)",
  NE_EVENT: "var(--cal-ne)",
};

type Props = {
  value: CatalogOwnerValue[];
  onChange: (owners: CatalogOwnerValue[]) => void;
  compact?: boolean;
  label?: string;
  disabled?: boolean;
  /** Цвета как у фильтров календаря. */
  colored?: boolean;
};

export function OwnerTagsPicker({
  value,
  onChange,
  compact = false,
  label = "Чья?",
  disabled = false,
  colored = false,
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
    <div className={compact && !label ? "inline-flex" : undefined}>
      {label ? (
        <span className="mb-1 block text-caption uppercase text-[var(--muted)]">
          {label}
        </span>
      ) : null}
      <div
        className={`flex gap-1 ${compact ? "flex-nowrap" : "flex-wrap gap-1.5"}`}
      >
        {CATALOG_OWNERS.map((o) => {
          const active = selected.includes(o.value);
          const tinted = active && colored;
          return (
            <button
              key={o.value}
              type="button"
              title={o.label}
              aria-pressed={active}
              disabled={disabled}
              onClick={() => toggle(o.value)}
              className={`rounded border px-1.5 py-0.5 text-caption font-medium uppercase tracking-wide transition-colors disabled:cursor-default disabled:opacity-60 ${
                tinted
                  ? "text-white"
                  : active
                    ? "border-[var(--solid)] bg-[var(--solid)] text-[var(--on-solid)]"
                    : "border-[var(--line)] bg-[var(--panel)] text-[var(--ink)] hover:bg-white/10"
              }`}
              style={
                tinted
                  ? {
                      background: CALENDAR_TAG_COLOR[o.value],
                      borderColor: CALENDAR_TAG_COLOR[o.value],
                    }
                  : undefined
              }
            >
              {o.short}
            </button>
          );
        })}
      </div>
    </div>
  );
}
