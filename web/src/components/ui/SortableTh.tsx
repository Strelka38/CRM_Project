"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  nextSortState,
  sortRows,
  type SortDir,
  type SortState,
} from "@/lib/table-sort";

export function useTableSort<T>(
  rows: T[],
  getValue: (row: T, key: string) => unknown,
) {
  const [sort, setSort] = useState<SortState | null>(null);
  const sorted = useMemo(
    () => sortRows(rows, sort, getValue),
    [rows, sort, getValue],
  );
  function onSort(key: string) {
    setSort((prev) => nextSortState(prev, key));
  }
  return { sorted, sort, onSort };
}

function SortCaret({ active, dir }: { active: boolean; dir: SortDir | null }) {
  const up = active && dir === "asc";
  const down = active && dir === "desc";
  return (
    <span
      className={cn("data-table-sort-caret", active && "is-active")}
      aria-hidden
    >
      <svg viewBox="0 0 8 10" className="size-2.5" fill="currentColor">
        <path
          d="M4 1.2 7.2 4.6H.8Z"
          className={up ? "opacity-100" : "opacity-40"}
        />
        <path
          d="M4 8.8 0.8 5.4h6.4Z"
          className={down ? "opacity-100" : "opacity-40"}
        />
      </svg>
    </span>
  );
}

export function SortableTh({
  label,
  sortKey,
  state,
  onSort,
  className,
  align = "left",
}: {
  label: string;
  sortKey: string;
  state: SortState | null;
  onSort: (key: string) => void;
  className?: string;
  align?: "left" | "right" | "center";
}) {
  const active = state?.key === sortKey;
  const dir = active ? state?.dir ?? null : null;
  const ariaSort = !active ? "none" : dir === "asc" ? "ascending" : "descending";
  return (
    <th
      className={cn(
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className,
      )}
      aria-sort={ariaSort}
    >
      <button
        type="button"
        className="data-table-sort"
        onClick={() => onSort(sortKey)}
        title={
          !active
            ? `Сортировать по полю «${label}»`
            : dir === "asc"
              ? "По убыванию"
              : "Сбросить сортировку"
        }
      >
        {label}
        <SortCaret active={active} dir={dir} />
      </button>
    </th>
  );
}
