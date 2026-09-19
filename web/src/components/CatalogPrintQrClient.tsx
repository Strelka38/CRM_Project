"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatUnitId } from "@/lib/equipment-id";

type UnitRow = {
  id: string;
  unitNumber: number;
  qrToken: string;
  catalogItem: { id: string; equipmentCode: number | null };
};

function UnitQrImage({ url, alt }: { url: string; alt: string }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const QRCode = await import("qrcode");
      const toDataURL =
        QRCode.toDataURL ??
        (QRCode.default && "toDataURL" in QRCode.default
          ? QRCode.default.toDataURL
          : null);
      if (!toDataURL) return;
      const dataUrl = await toDataURL(url, {
        width: 360,
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#000000", light: "#ffffff" },
      });
      if (!cancelled) setSrc(dataUrl);
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!src) {
    return <div className="mx-auto size-40 bg-white" aria-hidden />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className="mx-auto size-40 bg-white" />
  );
}

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
    const prev = document.title;
    document.title = " ";
    return () => {
      document.title = prev;
    };
  }, []);

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
            equipmentCode: (data.equipmentCode as number | null) ?? null,
          };
          for (const u of data.equipmentUnits || []) {
            if (u.active === false) continue;
            if (unitIds.size > 0 && !unitIds.has(u.id)) continue;
            all.push({
              id: u.id,
              unitNumber: u.unitNumber,
              qrToken: u.qrToken,
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
    return <p className="p-6 text-sm text-neutral-600">Загрузка…</p>;
  }

  if (error && units.length === 0) {
    return <p className="p-6 text-sm text-red-700">{error}</p>;
  }

  const origin =
    typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="qr-print-sheet bg-white p-6 text-black print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <h1 className="text-lg font-semibold">Печать QR-кодов</h1>
        <button
          type="button"
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white"
          onClick={() => window.print()}
        >
          Печать
        </button>
      </div>
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 print:grid-cols-3 print:gap-8">
        {units.map((u) => {
          const url = `${origin}/q/${u.qrToken}`;
          const unitId = formatUnitId(u.catalogItem.equipmentCode, u.unitNumber);
          return (
            <div
              key={u.id}
              className="qr-print-card break-inside-avoid text-center"
            >
              <p className="mb-2 text-base font-bold tabular-nums tracking-wide">
                ID {unitId}
              </p>
              <UnitQrImage url={url} alt={`QR ${unitId}`} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
