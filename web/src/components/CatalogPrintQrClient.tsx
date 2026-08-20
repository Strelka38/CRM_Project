"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type UnitRow = {
  id: string;
  unitNumber: number;
  qrToken: string;
  label: string | null;
  catalogItem: { id: string; name: string; equipmentCode: number | null };
};

export function CatalogPrintQrClient() {
  const params = useSearchParams();
  const ids = useMemo(
    () =>
      (params.get("ids") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [params],
  );
  const unitIds = useMemo(
    () =>
      new Set(
        (params.get("unitIds") || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    [params],
  );
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ids.length === 0) {
      setError("Не выбраны позиции");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const all: UnitRow[] = [];
        for (const id of ids) {
          const res = await fetch(`/api/equipment/items/${id}`, {
            credentials: "same-origin",
          });
          if (!res.ok) continue;
          const data = await res.json();
          const item = {
            id: data.id as string,
            name: data.name as string,
            equipmentCode: (data.equipmentCode as number | null) ?? null,
          };
          for (const u of data.equipmentUnits || []) {
            if (u.active === false) continue;
            if (unitIds.size > 0 && !unitIds.has(u.id)) continue;
            all.push({
              id: u.id,
              unitNumber: u.unitNumber,
              qrToken: u.qrToken,
              label: u.label ?? null,
              catalogItem: item,
            });
          }
        }
        if (!cancelled) {
          setUnits(all);
          if (all.length === 0) {
            setError(
              "У выбранных позиций нет единиц. Создайте единицы на карточке оборудования.",
            );
          }
        }
      } catch {
        if (!cancelled) setError("Не удалось загрузить QR");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ids, unitIds]);

  if (loading) {
    return <p className="p-6 text-sm text-[var(--muted)]">Загрузка…</p>;
  }

  if (error && units.length === 0) {
    return <p className="p-6 text-sm text-[var(--danger)]">{error}</p>;
  }

  const origin =
    typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="p-6 print:p-2">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <h1 className="text-lg font-semibold">Печать QR-кодов</h1>
        <button
          type="button"
          className="rounded-md bg-[var(--solid)] px-3 py-1.5 text-sm text-[var(--on-solid)]"
          onClick={() => window.print()}
        >
          Печать
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 print:grid-cols-3">
        {units.map((u) => {
          const url = `${origin}/q/${u.qrToken}`;
          const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(url)}`;
          return (
            <div
              key={u.id}
              className="break-inside-avoid rounded-lg border border-[var(--line)] p-3 text-center"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrSrc}
                alt={`QR ${u.unitNumber}`}
                className="mx-auto size-36 bg-white p-1"
              />
              <p className="mt-2 text-xs font-semibold leading-snug text-[var(--ink)]">
                {u.catalogItem.name}
              </p>
              <p className="text-[10px] text-[var(--muted)]">
                {u.catalogItem.equipmentCode != null
                  ? `ID ${u.catalogItem.equipmentCode}-`
                  : "#"}
                {u.unitNumber}
                {u.label ? ` · ${u.label}` : ""}
              </p>
              <p className="mt-1 break-all text-[9px] text-[var(--muted)]">
                {url}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
