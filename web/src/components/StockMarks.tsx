"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

export type StockInfo = {
  catalogItemId: string;
  name: string;
  stockQty: number;
  reserved: number;
  available: number;
  unlimited: boolean;
  reservations: Array<{
    quoteId: string;
    proposalNumber: string;
    eventName: string;
    client: string;
    date: string;
    lifecycle: string;
    qty: number;
  }>;
};

const LIFE: Record<string, string> = {
  CONFIRMED: "Подтверждено",
  COMPLETED: "Завершено",
};

export function StockMarks({
  needed,
  info,
}: {
  needed: number;
  info: StockInfo | null | undefined;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLTableCellElement>(null);
  const tipId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!info) {
    return (
      <>
        <td className="stock-cell">—</td>
        <td className="stock-cell">—</td>
        <td className="stock-cell">—</td>
      </>
    );
  }

  if (info.unlimited) {
    return (
      <>
        <td className="stock-cell tabular-nums" title="Нужно в этом КП">
          {needed}
        </td>
        <td className="stock-cell text-[var(--muted)]" title="Свободно">
          ∞
        </td>
        <td className="stock-cell text-[var(--muted)]" title="Всего на складе">
          ∞
        </td>
      </>
    );
  }

  const tight = needed > info.available;
  const hasReservations = info.reservations.length > 0;

  return (
    <>
      <td
        className={`stock-cell tabular-nums ${tight ? "text-[var(--danger)] font-medium" : ""}`}
        title="R — нужно в этом КП на дату"
      >
        {needed}
      </td>
      <td className="stock-cell relative p-0" ref={rootRef}>
        <button
          type="button"
          id={tipId}
          className={`stock-cell-btn tabular-nums w-full ${
            tight ? "text-[var(--danger)] font-medium" : ""
          } ${hasReservations ? "underline decoration-dotted underline-offset-2" : ""}`}
          title="RT — свободно на дату (не занято другими КП). Нажмите, чтобы увидеть где занято."
          onClick={() => setOpen((v) => !v)}
        >
          {info.available}
        </button>
        {open && (
          <div className="absolute left-1/2 top-full z-30 mt-1 w-72 -translate-x-1/2 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-2 text-left shadow-lg">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">
              {info.name}
            </p>
            <p className="mb-2 text-xs text-[var(--muted)]">
              Всего {info.stockQty} · занято {info.reserved} · свободно{" "}
              {info.available}
            </p>
            {info.reservations.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">
                На эту дату другими КП не занято
              </p>
            ) : (
              <ul className="max-h-48 space-y-1.5 overflow-y-auto">
                {info.reservations.map((r) => (
                  <li
                    key={r.quoteId}
                    className="rounded border border-[var(--line)] px-2 py-1.5 text-xs"
                  >
                    <Link
                      href={`/quotes/${r.quoteId}`}
                      className="font-medium text-[var(--accent)] hover:underline"
                      onClick={() => setOpen(false)}
                    >
                      №{r.proposalNumber}{" "}
                      {r.eventName || r.client || "КП"}
                    </Link>
                    <p className="text-[var(--muted)]">
                      {r.date || "—"} · {LIFE[r.lifecycle] || r.lifecycle} ·{" "}
                      занято {r.qty}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </td>
      <td
        className="stock-cell tabular-nums"
        title="T — всего таких приборов на складе"
      >
        {info.stockQty}
      </td>
    </>
  );
}

export function StockHeaderCells() {
  return (
    <>
      <th className="stock-head" title="Нужно в этом КП на дату">
        R
      </th>
      <th className="stock-head" title="Свободно на складе на эту дату">
        RT
      </th>
      <th className="stock-head" title="Всего на складе">
        T
      </th>
    </>
  );
}
